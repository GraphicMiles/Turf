/* ==========================================================================
   POST /api/create-checkout
   Creates a Bachs checkout session (server-side, secret key) and stores a
   PENDING claim in Supabase with pre-assigned cells.
   Body: { name*, bio, field, country*, city, project, web, social, email, spots: 1|5|10 }
   Returns: { checkout_url, checkout_id }
   Security (SECURITY_AUDIT.md C2/C5/H2/H3/H4): sanitized inputs, escaped
   ILIKE lookups, origin allowlist for success/cancel URLs, cross-site POSTs
   rejected, and the pending claim row is inserted BEFORE the Bachs session
   (then stamped with checkout_id) so a paid webhook can never arrive for a
   claim that does not exist. If Bachs fails, the row is removed again.
   ========================================================================== */
const crypto = require('crypto');
const { N, WORLD, build, assignCells, macroKeyOf, FIELDS } = require('../world-core.js');
const getSupabase = require('../lib/supabase.js');
const { cleanClaimBody, escapeIlike, isEmail, clientIp, originAllowed, safeRedirectBase } = require('../lib/validate.js');
const { generateEditCode, hashEditCode } = require('../lib/editcode.js');

const PRICES = { 1: '100.00', 5: '500.00', 10: '1000.00' };
const CLAIMS_PER_IP_PER_DAY = 3;
const COUNTRY_CODES = new Set(Object.values(WORLD).flat().filter(c => c !== 'O'));
const FIELD_NAMES = new Set(FIELDS.map(f => f.name));

function todayUtcStart(){
  return new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
}

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'Cross-origin checkouts are not allowed.' });

  const raw = req.body || {};
  const body = cleanClaimBody(raw);
  const name = body.name;
  const spots = Number(raw.spots || 1);
  const country = String(raw.country || '').toUpperCase();

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!PRICES[spots]) return res.status(400).json({ error: 'spots must be 1, 5 or 10' });
  if (!COUNTRY_CODES.has(country)) return res.status(400).json({ error: 'unknown country' });
  if (raw.field && !FIELD_NAMES.has(String(raw.field))) return res.status(400).json({ error: 'unknown field' });
  if (raw.email && !isEmail(body.email)) return res.status(400).json({ error: 'invalid email' });

  const key = process.env.BACHS_API_KEY;
  const base = process.env.BACHS_BASE_URL || 'https://sandbox-api.bachs.io';
  if (!key) return res.status(500).json({ error: 'BACHS_API_KEY not configured on the server' });

  const email = body.email ||
    (name.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@turf.local');
  const ip = clientIp(req);

  /* identity = data: same name + email can only claim once (no accounts) */
  try {
    const supaPre = getSupabase();
    const { data: existing } = await supaPre
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
  const redirectBase = safeRedirectBase(req);
  const editCode = generateEditCode(); /* shown once with the checkout result */

  /* ---- 1. assign cells + store the pending claim FIRST (C5 race fix) ---- */
  let supa, claimId;
  try {
    supa = getSupabase();
    const world = build(); // deterministic — same world the frontend renders
    const used = new Set();
    world.allPeople.forEach(p => used.add(p._i));
    for (const inst of world.macros[country].instances) {
      const keys = [inst.mr + '-' + inst.mc];
      if (inst.mc > 0) keys.push(inst.mr + '-' + (inst.mc - 1));
      const { data: local } = await supa
        .from('claims').select('cells').in('status', ['pending', 'paid', 'free'])
        .in('macro', keys);
      (local || []).forEach(c => (c.cells || []).forEach(i => used.add(i)));
    }

    const cellsArr = assignCells(country, spots, used);
    if (!cellsArr) {
      return res.status(409).json({ error: country + ' is fully mapped — pick another country' });
    }
    const macroKey = macroKeyOf(cellsArr[0] % N, Math.floor(cellsArr[0] / N));

    /* optional photo: verify the uploaded object exists, store its public URL */
    let imageUrl = null;
    const imagePath = String(raw.image_path || '');
    if (/^[0-9a-f-]{36}\.webp$/.test(imagePath)) {
      try {
        const { data: obj, error: statErr } = await supa.storage.from('people').stat(imagePath);
        if (!statErr && obj) imageUrl = supa.storage.from('people').getPublicUrl(imagePath).data.publicUrl;
      } catch (e) { /* ignore unreadable path */ }
    }

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
      spots,
      cells: cellsArr,
      macro: macroKey,
      image_url: imageUrl,
      status: 'pending',
      /* edit code: issued now (hash only in DB), usable once the claim settles */
      edit_code_hash: hashEditCode(editCode),
    }).select('id').single();
    if (insErr || !claimRow) return res.status(500).json({ error: 'Could not store the claim: ' + (insErr && insErr.message) });
    claimId = claimRow.id;
  } catch (e) {
    return res.status(500).json({ error: 'Could not store the claim: ' + e.message });
  }

  /* ---- 2. create the Bachs session, then stamp the claim with its id ---- */
  const payload = {
    customer: { email, name },
    success_url: (redirectBase || 'https://turf.example.com') + '/?checkout=success',
    cancel_url: (redirectBase || 'https://turf.example.com') + '/?checkout=cancel',
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
      await supa.from('claims').delete().eq('id', claimId); /* don't block a retry */
      return res.status(502).json({ error: 'Bachs rejected the checkout', detail: session });
    }
  } catch (e) {
    await supa.from('claims').delete().eq('id', claimId).then(() => {}, () => {});
    return res.status(502).json({ error: 'Could not reach Bachs: ' + e.message });
  }

  const { error: stampErr } = await supa.from('claims')
    .update({ checkout_id: session.checkout_id })
    .eq('id', claimId);
  if (stampErr) {
    /* session exists but we can't link it — surface clearly, keep the row:
     a human can match it by email; better than silently orphaning it. */
    return res.status(500).json({ error: 'Checkout created but could not be linked — contact support with your email.', detail: stampErr.message });
  }

  return res.status(200).json({
    checkout_url: session.checkout_url,
    checkout_id: session.checkout_id,
    edit_code: editCode,
  });
};
