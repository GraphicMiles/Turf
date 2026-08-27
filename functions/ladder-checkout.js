/* ==========================================================================
   POST /api/ladder-checkout — buy a spot on the ladder (Bachs checkout).
   Body: { name*, field, country, city, bio, project, web, social, email,
           image_path?, amount? (join: >= ₦100) | target_claim_id (overtake) }

   Rules (lib/ladder.js):
     • join: pay any amount ≥ ₦100 — rank = wherever that price sorts.
       First payer ever = #1 until outbid.
     • overtake: pay 2× the target's amount → land directly above them.
       The target is LOCKED for 15 minutes while payment is in flight.
     • amount is fixed SERVER-SIDE and stamped into the ledger; the webhook
       settles against the locked amount only (never trusts the client).
   ========================================================================== */
const crypto = require('crypto');
const getSupabase = require('../lib/supabase.js');

const { objectUrl } = require('../lib/storage.js');
const { FIELDS } = require('../world-core.js');
const { cleanClaimBody, escapeIlike, isEmail, clientIp, originAllowed, safeRedirectBase } = require('../lib/validate.js');
const { generateEditCode, hashEditCode } = require('../lib/editcode.js');
const { BASE_PRICE, overtakePrice, validAmount, LOCK_MINUTES } = require('../lib/ladder.js');

const COUNTRY_CODES = new Set(Object.values(require('../world-core.js').WORLD).flat().filter(c => c !== 'O'));
const FIELD_NAMES = new Set(FIELDS.map(f => f.name));
const CLAIMS_PER_IP_PER_DAY = 5;

function todayUtcStart(){
  return new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
}

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'Cross-origin checkouts are not allowed.' });

  const raw = req.body || {};
  const body = cleanClaimBody(raw);
  const name = body.name;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (raw.field && !FIELD_NAMES.has(String(raw.field))) return res.status(400).json({ error: 'unknown field' });
  const country = String(raw.country || 'NGA').toUpperCase();
  if (!COUNTRY_CODES.has(country)) return res.status(400).json({ error: 'unknown country' });
  if (raw.email && !isEmail(body.email)) return res.status(400).json({ error: 'invalid email' });

  const key = process.env.BACHS_API_KEY;
  const base = process.env.BACHS_BASE_URL || 'https://sandbox-api.bachs.io';
  if (!key) return res.status(500).json({ error: 'BACHS_API_KEY not configured on the server' });

  const email = body.email || (name.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@turf.local');
  const ip = clientIp(req);

  let supa;
  try { supa = getSupabase(); } catch (e) {
    return res.status(500).json({ error: 'Supabase not configured: ' + e.message });
  }

  /* ---- price + action ---- */
  let action, amount, targetClaimId = null, targetPrevAmount = null;

  /* release expired locks (best-effort) */
  try {
    if (typeof supa.rpc === 'function') await supa.rpc('expire_ladder_locks');
    else await supa.from('ladder_ledger').update({ status: 'expired' })
      .eq('status', 'locked').lt('locked_until', new Date().toISOString());
  } catch (e) { /* advisory */ }

  const targetId = String(raw.target_claim_id || '').trim();
  if (targetId && /^[0-9a-f-]{36}$/i.test(targetId)) {
    /* OVERTAKE: pay 2× the target's amount */
    action = 'overtake';
    const { data: target } = await supa
      .from('ladder_entries')
      .select('claim_id,amount')
      .eq('claim_id', targetId)
      .limit(1)
      .maybeSingle();
    if (!target) return res.status(404).json({ error: 'That spot is no longer on the ladder.' });
    amount = overtakePrice(target.amount);
    targetClaimId = target.claim_id;
    targetPrevAmount = target.amount;

    /* 15-minute lock: one overtaker at a time per target */
    const { data: lock } = await supa
      .from('ladder_ledger')
      .select('id')
      .eq('target_claim_id', targetClaimId)
      .eq('status', 'locked')
      .gt('locked_until', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (lock) {
      return res.status(423).json({ error: 'Someone is already paying for this spot — locked up to 15 minutes. Try again shortly or pick another spot.' });
    }
  } else {
    /* JOIN: pick your price (>= base). First payer ever = #1 automatically. */
    action = 'join';
    amount = Math.round(Number(raw.amount || BASE_PRICE));
    if (!validAmount(amount)) {
      return res.status(400).json({ error: 'Amount must be ₦' + BASE_PRICE + ' or more (whole naira).' });
    }
  }

  /* ---- identity + rate limit ---- */
  try {
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
    const { count: ipCount } = await supa
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', todayUtcStart());
    if ((ipCount || 0) >= CLAIMS_PER_IP_PER_DAY) {
      return res.status(429).json({ error: 'Daily limit reached — come back tomorrow, F.' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Could not verify identity: ' + e.message });
  }

  /* ---- optional photo (verified object) ---- */
  let imageUrl = null;
  const imagePath = String(raw.image_path || '');
  if (/^[0-9a-f-]{36}\.(webp|gif|mp4|m4a|mp3|wav|ogg)$/i.test(imagePath)) {
    /* avatar must be an image type */
    if (/^[0-9a-f-]{36}\.(webp|gif)$/i.test(imagePath)) {
      imageUrl = await objectUrl(supa, imagePath); /* may be null — claim proceeds without photo */
    }
  }

  /* ---- Bachs session FIRST (no orphan rows if it fails) ---- */
  const redirectBase = safeRedirectBase(req);
  const editCode = generateEditCode();
  const payload = {
    customer: { email, name },
    success_url: (redirectBase || 'https://turf.example.com') + '/?checkout=success',
    cancel_url: (redirectBase || 'https://turf.example.com') + '/?checkout=cancel',
    pricing: { currency: 'NGN', amount: amount.toFixed(2) },
  };
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

  /* ---- pending claim + locked ledger row ---- */
  try {
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
      status: 'pending',
      checkout_id: session.checkout_id,
      edit_code_hash: hashEditCode(editCode),
    }).select('id').single();
    if (insErr || !claimRow) return res.status(500).json({ error: 'Could not store the claim: ' + (insErr && insErr.message) });

    const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
    const { error: ledErr } = await supa.from('ladder_ledger').insert({
      checkout_id: session.checkout_id,
      action,
      amount,
      target_claim_id: targetClaimId,
      target_prev_amount: targetPrevAmount,
      claim_id: claimRow.id,
      status: 'locked',
      locked_until: lockedUntil,
    });
    if (ledErr) {
      await supa.from('claims').delete().eq('id', claimRow.id);
      return res.status(500).json({ error: 'Could not lock the spot: ' + ledErr.message });
    }

    return res.status(200).json({
      checkout_url: session.checkout_url,
      checkout_id: session.checkout_id,
      edit_code: editCode,
      action,
      amount,
      rank_hint: action === 'overtake' ? 'above your target' : 'by your price',
      lock_minutes: action === 'overtake' ? LOCK_MINUTES : 0,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Could not store the claim: ' + e.message });
  }
};
