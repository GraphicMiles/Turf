/* POST /api/free-claim — founder-tier claim (FREE, no Bachs session).
   Only accepted while the count of real claims (paid + free) < FOUNDER_LIMIT.
   Body: same as create-checkout. Returns the stored claim row (with cells).
   Security notes (SECURITY_AUDIT.md C2/C4/H3/H4): all text is sanitized
   server-side, ILIKE wildcards escaped, cross-site posts rejected, and the
   founder gate + position assignment go through an atomic SQL function
   (insert_claim_sequential) when the schema migration has been applied. */
const { N, WORLD, build, assignCells, macroKeyOf, FIELDS } = require('../world-core.js');
const getSupabase = require('../lib/supabase.js');

const { objectUrl } = require('../lib/storage.js');
const { cleanClaimBody, escapeIlike, isEmail, clientIp, originAllowed } = require('../lib/validate.js');
const { generateEditCode, hashEditCode } = require('../lib/editcode.js');

const FOUNDER_LIMIT = 200;
const CLAIMS_PER_IP_PER_DAY = 3;
const COUNTRY_CODES = new Set(Object.values(WORLD).flat().filter(c => c !== 'O'));
const FIELD_NAMES = new Set(FIELDS.map(f => f.name));

function todayUtcStart(){
  return new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
}

/* Insert a claim atomically (advisory-lock serialized, founder gate, unique
   position) when the SQL function exists; fall back to the legacy path. */
async function insertClaim(supa, row, founderGate) {
  if (typeof supa.rpc === 'function') {
    try {
      const { data, error } = await supa.rpc('insert_claim_sequential', {
        p_row: row, p_founder_gate: founderGate,
      });
      if (error && /function .* does not exist/i.test(error.message)) { /* not migrated */ }
      else if (error) return { error: error.message };
      else if (data && data.error) return { error: data.error, gate: data.error === 'founder_full' };
      else if (data) return { claim: data };
    } catch (e) { /* fall through to legacy path */ }
  }
  /* legacy: check-then-insert (documented race — see audit C4) with a
     position-collision retry */
  for (let attempt = 0; attempt < 3; attempt++) {
    const { count } = await supa
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .in('status', ['paid', 'free']);
    const { data: claim, error } = await supa.from('claims').insert(
      Object.assign({}, row, { position: (count || 0) + 1 })
    ).select().single();
    if (!error) return { claim };
    if (/duplicate/i.test(error.message || '')) {
      if (/identity/i.test(error.message)) return { error: 'That name + email is already on the map — your data is your identity, and it’s taken.' };
      continue; /* position collision — retry with a fresh count */
    }
    return { error: error.message };
  }
  return { error: 'Could not place the claim — please retry.' };
}

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'Cross-origin claims are not allowed.' });

  const raw = req.body || {};
  const body = cleanClaimBody(raw);
  const name = body.name;
  const spots = Number(raw.spots || 1);
  const country = String(raw.country || '').toUpperCase();

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (![1, 5, 10].includes(spots)) return res.status(400).json({ error: 'spots must be 1, 5 or 10' });
  if (!COUNTRY_CODES.has(country)) return res.status(400).json({ error: 'unknown country' });
  if (raw.field && !FIELD_NAMES.has(String(raw.field))) return res.status(400).json({ error: 'unknown field' });
  if (raw.email && !isEmail(body.email)) return res.status(400).json({ error: 'invalid email' });

  let supa;
  try { supa = getSupabase(); } catch (e) {
    return res.status(500).json({ error: 'Supabase not configured: ' + e.message });
  }

  /* identity = data: same name + email can only claim once */
  const email = body.email ||
    (name.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@turf.local');
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

  /* rate limit: 3 spot picks per IP per day (UTC) */
  const ip = clientIp(req);
  const { count: ipCount } = await supa
    .from('claims')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', todayUtcStart());
  if ((ipCount || 0) >= CLAIMS_PER_IP_PER_DAY) {
    return res.status(429).json({ error: 'Come back tomorrow, F. — 3 spots per IP per day.' });
  }

  /* gate: founder tier only while under the limit */
  const { count } = await supa
    .from('claims')
    .select('id', { count: 'exact', head: true })
    .in('status', ['paid', 'free']);
  const c = count || 0;
  if (c >= FOUNDER_LIMIT) {
    return res.status(402).json({ error: 'Founder tier is full — payment is now active.' });
  }

  /* assign cells: deterministic seed world + live claims already using cells.
     Live occupancy is fetched PER COUNTRY MACRO (a 10×10 macro holds at most
     ~100 claims), so allocation stays O(macro) at any population size. */
  const world = build();
  const used = new Set();
  world.allPeople.forEach(p => used.add(p._i));
  for (const inst of world.macros[country].instances) {
    const keys = [inst.mr + '-' + inst.mc];
    if (inst.mc > 0) keys.push(inst.mr + '-' + (inst.mc - 1)); /* runs enter a macro from its left neighbour */
    const { data: local } = await supa
      .from('claims').select('cells').in('status', ['pending', 'paid', 'free'])
      .in('macro', keys);
    (local || []).forEach(cl => (cl.cells || []).forEach(i => used.add(i)));
  }

  const cellsArr = assignCells(country, spots, used);
  if (!cellsArr) return res.status(409).json({ error: country + ' is fully mapped — pick another country' });
  const macroKey = macroKeyOf(cellsArr[0] % N, Math.floor(cellsArr[0] / N));

  /* optional photo: verify the uploaded object exists, store its public URL */
  let imageUrl = null;
  const imagePath = String(raw.image_path || '');
  if (/^[0-9a-f-]{36}\.webp$/.test(imagePath)) {
    imageUrl = await objectUrl(supa, imagePath); /* may be null — claim proceeds without photo */
  }

  /* edit code: generated here, returned ONCE, only the hash is stored */
  const editCode = generateEditCode();
  const row = {
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
    spots,
    cells: cellsArr,
    macro: macroKey,
    image_url: imageUrl,
    status: 'free',
    edit_code_hash: hashEditCode(editCode),
  };

  const result = await insertClaim(supa, row, true);
  if (result.gate) return res.status(402).json({ error: 'Founder tier is full — payment is now active.' });
  if (result.error) {
    const taken = /already on the map/.test(result.error);
    return res.status(taken ? 409 : 500).json({ error: result.error });
  }
  /* legacy path stores position inside insertClaim; rpc path returns it.
     edit_code (plaintext) appears exactly once — right here. */
  return res.status(200).json(Object.assign({}, result.claim, { edit_code: editCode }));
};
