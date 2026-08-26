/* POST /api/free-claim — founder-tier claim (FREE, no Bachs session).
   Only accepted while the count of real claims (paid + free) < FOUNDER_LIMIT.
   Body: same as create-checkout. Returns the stored claim row (with cells). */
const { N, WORLD, build, assignCells, macroKeyOf } = require('../world-core.js');
const getSupabase = require('../lib/supabase.js');

const FOUNDER_LIMIT = 200;
const CLAIMS_PER_IP_PER_DAY = 3;
const COUNTRY_CODES = new Set(Object.values(WORLD).flat().filter(c => c !== 'O'));

function clientIp(req){
  const fwd = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '';
  return fwd.split(',')[0].trim() || 'unknown';
}
function todayUtcStart(){
  return new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
}

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  const name = String(body.name || '').trim();
  const spots = Number(body.spots || 1);
  const country = String(body.country || '').toUpperCase();

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (![1, 5, 10].includes(spots)) return res.status(400).json({ error: 'spots must be 1, 5 or 10' });
  if (!COUNTRY_CODES.has(country)) return res.status(400).json({ error: 'unknown country' });

  let supa;
  try { supa = getSupabase(); } catch (e) {
    return res.status(500).json({ error: 'Supabase not configured: ' + e.message });
  }

  /* identity = data: same name + email can only claim once */
  const email = String(body.email || '').trim() ||
    (name.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@turf.local');
  const { data: existing } = await supa
    .from('claims')
    .select('id')
    .ilike('name', name)
    .ilike('email', email)
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
  const imagePath = String(body.image_path || '');
  if (/^[0-9a-f-]{36}\.webp$/.test(imagePath)) {
    try {
      const { data: obj, error: statErr } = await supa.storage.from('people').stat(imagePath);
      if (!statErr && obj) imageUrl = supa.storage.from('people').getPublicUrl(imagePath).data.publicUrl;
    } catch (e) { /* ignore unreadable path */ }
  }

  const { data: claim, error } = await supa.from('claims').insert({
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
    position: c + 1, /* oldest member first: rank = settled claims + 1 */
    status: 'free',
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(claim);
};
