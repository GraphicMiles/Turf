/* ==========================================================================
   POST /api/ladder-free-claim — FOUNDER SPOT: free while the ladder has
   fewer than FOUNDER_LIMIT (200) spots taken. No Bachs session required —
   this is what makes the site usable before payments are configured.
   The free claim enters the ladder at the ₦100 rank; overtaking (climbing)
   always costs real money via /api/ladder-checkout.
   Body: { name*, field, country, city, bio, project, web, social, email?,
           image_path? }
   Returns: { claim, edit_code, entry_amount }  (edit code shown ONCE)
   ========================================================================== */
const getSupabase = require('../lib/supabase.js');
const { FIELDS, WORLD } = require('../world-core.js');
const { cleanClaimBody, escapeIlike, isEmail, clientIp, originAllowed } = require('../lib/validate.js');
const { generateEditCode, hashEditCode } = require('../lib/editcode.js');
const { basePrice, FOUNDER_LIMIT } = require('../lib/ladder.js');

const COUNTRY_CODES = new Set(Object.values(WORLD).flat().filter(c => c !== 'O'));
const FIELD_NAMES = new Set(FIELDS.map(f => f.name));
const CLAIMS_PER_IP_PER_DAY = 5;

function todayUtcStart(){
  return new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
}

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'Cross-origin claims are not allowed.' });

  const raw = req.body || {};
  const body = cleanClaimBody(raw);
  const name = body.name;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (raw.field && !FIELD_NAMES.has(String(raw.field))) return res.status(400).json({ error: 'unknown field' });
  const country = String(raw.country || 'NGA').toUpperCase();
  if (!COUNTRY_CODES.has(country)) return res.status(400).json({ error: 'unknown country' });
  if (raw.email && !isEmail(body.email)) return res.status(400).json({ error: 'invalid email' });

  let supa;
  try { supa = getSupabase(); } catch (e) {
    return res.status(500).json({ error: 'Supabase not configured: ' + e.message + ' — set SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
  }

  const email = body.email || (name.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@turf.local');
  const ip = clientIp(req);

  /* identity: same name + email can only claim once */
  const { data: existing } = await supa
    .from('claims')
    .select('id')
    .ilike('name', escapeIlike(name))
    .ilike('email', escapeIlike(email))
    .limit(1)
    .maybeSingle();
  if (existing) {
    return res.status(409).json({ error: 'That name + email is already on the map — your data is your identity, and it’s taken.' });
  }

  /* rate limit */
  const { count: ipCount } = await supa
    .from('claims')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', todayUtcStart());
  if ((ipCount || 0) >= CLAIMS_PER_IP_PER_DAY) {
    return res.status(429).json({ error: 'Daily limit reached — come back tomorrow, F.' });
  }

  /* founder gate — fast fail before any writes */
  const { count: taken } = await supa
    .from('ladder_entries')
    .select('id', { count: 'exact', head: true });
  if ((taken || 0) >= FOUNDER_LIMIT) {
    return res.status(402).json({ error: 'Founder tier is full — payment is now active.', mode: 'paid' });
  }

  /* optional photo (verified object) */
  let imageUrl = null;
  const imagePath = String(raw.image_path || '');
  if (/^[0-9a-f-]{36}\.(webp|gif)$/i.test(imagePath)) {
    try {
      const { data: obj, error: statErr } = await supa.storage.from('people').stat(imagePath);
      if (!statErr && obj) imageUrl = supa.storage.from('people').getPublicUrl(imagePath).data.publicUrl;
    } catch (e) { /* ignore */ }
  }

  const editCode = generateEditCode();
  const { data: claimRow, error: insErr } = await supa.from('claims').insert({
    name,
    bio: body.bio || null,
    field: body.field || null,
    country,
    city: body.city || null,
    project: body.project || null,
    web: body.web || null,
    social: body.social || null,
    email,
    ip,
    spots: 1,
    cells: [],
    macro: 'LADDER',
    image_url: imageUrl,
    status: 'free',
    edit_code_hash: hashEditCode(editCode),
  }).select('id,name,field,country,city,image_url,status').single();
  if (insErr || !claimRow) {
    return res.status(500).json({ error: 'Could not store the claim: ' + (insErr && insErr.message) });
  }

  /* place on the ladder at ₦100 — race-safe via RPC when migrated */
  const amount = basePrice();
  let placed = false;
  if (typeof supa.rpc === 'function') {
    try {
      const { data, error } = await supa.rpc('ladder_founder_join', {
        p_claim: claimRow.id, p_amount: amount, p_limit: FOUNDER_LIMIT,
      });
      if (error && !/function .* does not exist/i.test(error.message)) {
        await supa.from('claims').delete().eq('id', claimRow.id);
        return res.status(500).json({ error: 'Could not place the spot: ' + error.message });
      }
      if (!error) {
        if (data && data.error === 'founder_full') {
          await supa.from('claims').delete().eq('id', claimRow.id);
          return res.status(402).json({ error: 'Founder tier is full — payment is now active.', mode: 'paid' });
        }
        placed = true;
      }
    } catch (e) { /* fall back to direct insert */ }
  }
  if (!placed) {
    const { error: entryErr } = await supa.from('ladder_entries').insert({ claim_id: claimRow.id, amount });
    if (entryErr && /duplicate/i.test(entryErr.message || '')) {
      /* already on the ladder — idempotent replay */
    } else if (entryErr) {
      await supa.from('claims').delete().eq('id', claimRow.id);
      return res.status(500).json({ error: 'Could not place the spot: ' + entryErr.message });
    }
  }

  return res.status(200).json({ claim: claimRow, edit_code: editCode, entry_amount: amount });
};
