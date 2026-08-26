/* ==========================================================================
   POST /api/create-checkout
   Creates a Bachs checkout session (server-side, secret key) and stores a
   PENDING claim in Supabase with pre-assigned cells.
   Body: { name*, bio, field, country*, city, project, web, social, email, spots: 1|5|10 }
   Returns: { checkout_url, checkout_id }
   ========================================================================== */
const crypto = require('crypto');
const { WORLD, build, assignCells } = require('../world-core.js');
const getSupabase = require('../lib/supabase.js');

const PRICES = { 1: '100.00', 5: '500.00', 10: '1000.00' };
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
  if (!PRICES[spots]) return res.status(400).json({ error: 'spots must be 1, 5 or 10' });
  if (!COUNTRY_CODES.has(country)) return res.status(400).json({ error: 'unknown country' });

  const key = process.env.BACHS_API_KEY;
  const base = process.env.BACHS_BASE_URL || 'https://sandbox-api.bachs.io';
  if (!key) return res.status(500).json({ error: 'BACHS_API_KEY not configured on the server' });

  const email = String(body.email || '').trim() ||
    (name.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@turf.local');
  const ip = clientIp(req);

  /* identity = data: same name + email can only claim once (no accounts) */
  try {
    const supaPre = getSupabase();
    const { data: existing } = await supaPre
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
    const { count: ipCount } = await supaPre
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', todayUtcStart());
    if ((ipCount || 0) >= CLAIMS_PER_IP_PER_DAY) {
      return res.status(429).json({ error: 'Come back tomorrow, F. — 3 spots per IP per day.' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Could not verify identity: ' + e.message });
  }
  const origin = req.headers.origin ||
    (req.headers.host ? 'https://' + req.headers.host : 'https://turf.example.com');

  /* ---- 1. create the Bachs session (amount fixed server-side) ---- */
  const payload = {
    customer: { email, name },
    success_url: origin + '/?checkout=success',
    cancel_url: origin + '/?checkout=cancel',
  };
  const productId = process.env['BACHS_PRODUCT_' + spots];
  if (productId) payload.product_cart = [{ product_id: productId, quantity: 1 }];
  else payload.pricing = { currency: 'NGN', amount: PRICES[spots] };

  let session;
  try {
    const r = await fetch(base + '/v1/checkout-sessions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });
    session = await r.json().catch(() => ({}));
    if (!r.ok || !session.checkout_url) {
      return res.status(502).json({ error: 'Bachs rejected the checkout', detail: session });
    }
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach Bachs: ' + e.message });
  }

  /* ---- 2. assign cells + store pending claim (Supabase) ---- */
  try {
    const supa = getSupabase();

    const world = build(); // deterministic — same world the frontend renders
    const used = new Set();
    world.allPeople.forEach(p => used.add(p._i));
    const { data: liveClaims } = await supa
      .from('claims').select('cells').in('status', ['pending', 'paid', 'free']);
    (liveClaims || []).forEach(c => (c.cells || []).forEach(i => used.add(i)));

    const cellsArr = assignCells(country, spots, used);
    if (!cellsArr) {
      return res.status(409).json({ error: country + ' is fully mapped — pick another country' });
    }

    await supa.from('claims').insert({
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
      checkout_id: session.checkout_id,
      status: 'pending',
    });
  } catch (e) {
    /* session was created; claim not stored — tell the client to fall back to demo */
    return res.status(500).json({ error: 'Could not store the claim: ' + e.message });
  }

  return res.status(200).json({ checkout_url: session.checkout_url, checkout_id: session.checkout_id });
};
