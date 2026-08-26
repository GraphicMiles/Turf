/* ==========================================================================
   POST /api/webhooks/bachs
   Bachs webhook receiver. Verifies the HMAC-SHA256 signature, dedupes by
   event id, and fulfils claims (this is the source of truth for payment).
   Subscribe to: collection.succeeded, collection.failed, checkout.expired
   ========================================================================== */
const crypto = require('crypto');
const getSupabase = require('../../lib/supabase.js');

function verifySignature(rawBody, secret, tsHeader, sigHeader, toleranceSec = 300) {
  if (!tsHeader || !sigHeader) return false;
  const ts = parseInt(tsHeader, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(ts + '.' + rawBody, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader));
  } catch (e) {
    return false;
  }
}

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  /* raw body is required for signature verification */
  const raw = req.rawBody ? req.rawBody.toString('utf8') : null;
  if (!raw) return res.status(400).json({ error: 'raw body required' });

  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: 'BACHS_WEBHOOK_SECRET not configured' });

  if (!verifySignature(raw, secret, req.headers['x-bachs-timestamp'], req.headers['x-bachs-signature'])) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  let event;
  try { event = JSON.parse(raw); } catch (e) { return res.status(400).json({ error: 'invalid json' }); }

  try {
    const supa = getSupabase();

    /* dedupe: at-least-once delivery */
    if (event.id) {
      const { error: dupErr } = await supa
        .from('webhook_events')
        .insert({ id: event.id, type: event.type });
      if (dupErr && /duplicate/i.test(dupErr.message)) {
        return res.status(200).json({ received: true, duplicate: true });
      }
    }

    const cid = event.data && event.data.checkout_id;
    if (cid) {
      if (event.type === 'collection.succeeded') {
        /* rank by oldest member: position = settled claims so far + 1 */
        const { count } = await supa
          .from('claims')
          .select('id', { count: 'exact', head: true })
          .in('status', ['paid', 'free']);
        await supa.from('claims')
          .update({ status: 'paid', charge_id: event.data.charge_id || null, position: (count || 0) + 1 })
          .eq('checkout_id', cid);
      } else if (event.type === 'collection.failed') {
        await supa.from('claims')
          .update({ status: 'failed' })
          .eq('checkout_id', cid).eq('status', 'pending');
      } else if (event.type === 'checkout.expired') {
        await supa.from('claims')
          .update({ status: 'expired' })
          .eq('checkout_id', cid).eq('status', 'pending');
      }
    }
  } catch (e) {
    return res.status(500).json({ error: 'fulfilment failed: ' + e.message });
  }

  return res.status(200).json({ received: true });
};
