/* ==========================================================================
   MY TURF — the email is the key to your spot (no accounts, no passwords).
   GET  /api/my-claim?email=…          → find your settled claim(s) by email
   POST /api/my-claim                  → owner edits their spot
   Body: { email, prove_name*, bio?, field?, city?, project?, web?, social?, image_path? }
   Immutable: spot cells, position, country, spots. Editable: profile fields + photo.

   Security (SECURITY_AUDIT.md C1): "email only" was a full account-takeover —
   anyone who knows a victim's email could read their IP/charge ids and rewrite
   their card. Now: GET returns only public-map columns, and POST additionally
   requires the exact registered name (prove_name) as proof of knowledge.
   Real fix for production: emailed OTP / magic link.
   ========================================================================== */
const getSupabase = require('../lib/supabase.js');
const { FIELDS } = require('../world-core.js');
const { cleanText, cleanClaimBody, escapeIlike, isEmail, originAllowed } = require('../lib/validate.js');

const SAFE_COLUMNS = 'id,name,bio,field,country,city,project,web,social,spots,cells,position,image_url,status,created_at';
const SAFE_KEYS = ['id','name','bio','field','country','city','project','web','social','spots','cells','position','image_url','status','created_at'];
const FIELD_NAMES = new Set(FIELDS.map(f => f.name));

/* Whitelist-project a claim row so sensitive columns (ip, email, checkout_id,
   charge_id) can never leak even if the table/SELECT changes. */
function safeClaim(row) {
  const out = {};
  SAFE_KEYS.forEach(k => { if (row && row[k] !== undefined) out[k] = row[k]; });
  return out;
}

async function findClaims(supa, email) {
  const { data, error } = await supa
    .from('claims')
    .select(SAFE_COLUMNS)
    .ilike('email', escapeIlike(email))
    .in('status', ['paid', 'free'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

exports.default = async (req, res) => {
  try {
    if (req.method === 'POST' && !originAllowed(req)) {
      return res.status(403).json({ error: 'Cross-origin edits are not allowed.' });
    }
    const supa = getSupabase();
    const rawEmail = String((req.query && req.query.email) || (req.body && req.body.email) || '').trim().toLowerCase();
    if (!rawEmail || rawEmail.length > 120 || !isEmail(rawEmail)) {
      return res.status(400).json({ error: 'Enter the email you claimed with.' });
    }

    const claims = await findClaims(supa, rawEmail);
    if (!claims.length) return res.status(404).json({ error: 'No turf found for that email.' });

    if (req.method === 'GET') return res.status(200).json({ claims: claims.map(safeClaim) });
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });

    const body = req.body || {};
    const target = claims[0]; /* newest claim for this email */

    /* proof of knowledge: the registered name must match (C1 fix) */
    const proveName = cleanText(body.prove_name, 64);
    if (!proveName || proveName.toLowerCase() !== String(target.name || '').toLowerCase()) {
      return res.status(401).json({ error: 'Enter the name on the claim to confirm it’s yours.' });
    }

    const clean = cleanClaimBody(body);
    const patch = {};
    for (const k of ['bio', 'field', 'city', 'project', 'web', 'social']) {
      if (typeof body[k] === 'string') {
        const v = clean[k];
        patch[k] = v || null;
      }
    }
    if (typeof body.field === 'string' && body.field && !FIELD_NAMES.has(String(body.field))) {
      return res.status(400).json({ error: 'unknown field' });
    }
    /* name change: allowed, but must not collide with anyone else */
    if (typeof body.name === 'string') {
      const v = cleanText(body.name, 24);
      if (v && v.toLowerCase() !== String(target.name || '').toLowerCase()) {
        const { data: clash } = await supa
          .from('claims').select('id').ilike('name', escapeIlike(v)).neq('id', target.id).limit(1).maybeSingle();
        if (clash) return res.status(409).json({ error: 'That name is already taken on the map.' });
        patch.name = v;
      }
    }

    /* photo change: verify the uploaded object, swap the public URL */
    const imagePath = String(body.image_path || '');
    if (/^[0-9a-f-]{36}\.webp$/.test(imagePath)) {
      try {
        const { data: obj, error: statErr } = await supa.storage.from('people').stat(imagePath);
        if (!statErr && obj) patch.image_url = supa.storage.from('people').getPublicUrl(imagePath).data.publicUrl;
      } catch (e) { /* ignore unreadable path */ }
    }

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });

    const { data: updated, error } = await supa
      .from('claims').update(patch).eq('id', target.id).select(SAFE_COLUMNS).single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ claim: safeClaim(updated) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
