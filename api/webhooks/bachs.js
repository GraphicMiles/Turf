/* ==========================================================================
   POST /api/webhooks/bachs
   Bachs webhook receiver. Verifies the HMAC-SHA256 signature, dedupes by
   event id, and fulfils claims (this is the source of truth for payment).
   Subscribe to: collection.succeeded, collection.failed, checkout.expired

   Security (SECURITY_AUDIT.md C4/C5): settlement goes through the atomic
   `settle_claim()` SQL function (advisory-lock + unique-safe position) when
   the schema migration is applied, with the legacy path as fallback. A
   `collection.succeeded` that matches NO claim row is queued in
   pending_fulfilments (replayed by /api/claim-status) instead of being
   silently dropped — "customer paid, no claim" is now recoverable.
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
        let settled = false;

        if (typeof supa.rpc === 'function') {
          try {
            const { data, error } = await supa.rpc('settle_claim', {
              p_checkout_id: cid, p_charge_id: (event.data && event.data.charge_id) || null,
            });
            if (error && !/function .* does not exist/i.test(error.message)) throw error;
            if (!error) settled = !!(data && data.settled);
          } catch (e) { /* fall back to legacy path */ }
        }

        if (!settled) {
          const { count } = await supa
            .from('claims')
            .select('id', { count: 'exact', head: true })
            .in('status', ['paid', 'free']);
          const { data: matched } = await supa.from('claims')
            .update({ status: 'paid', charge_id: event.data.charge_id || null, position: (count || 0) + 1 })
            .eq('checkout_id', cid)
            .select('id');
          settled = !!(matched && matched.length);
        }

        /* ladder: settle the spot purchase (join/overtake) atomically */
        if (typeof supa.rpc === 'function') {
          try {
            const { data: lad, error: ladErr } = await supa.rpc('settle_ladder', { p_checkout_id: cid });
            if (ladErr && !/function .* does not exist/i.test(ladErr.message)) throw ladErr;
            if (lad && lad.error && lad.error !== 'no_ledger') {
              /* payment can't be honoured (e.g. overtaken target gone) — flag for refund */
              await supa.from('ladder_ledger').update({ status: 'needs_refund' }).eq('checkout_id', cid);
            }
          } catch (e) { /* ladder not migrated — map-era checkout */ }
        }

        if (!settled) {
          /* no claim row (yet): queue for replay instead of dropping it */
          await supa.from('pending_fulfilments').insert({
            event_id: event.id || null,
            checkout_id: cid,
            charge_id: (event.data && event.data.charge_id) || null,
            payload: event,
          });
        }
      } else if (event.type === 'collection.failed') {
        await supa.from('claims')
          .update({ status: 'failed' })
          .eq('checkout_id', cid).eq('status', 'pending');
        await supa.from('ladder_ledger')
          .update({ status: 'expired' })
          .eq('checkout_id', cid).eq('status', 'locked');
      } else if (event.type === 'checkout.expired') {
        await supa.from('claims')
          .update({ status: 'expired' })
          .eq('checkout_id', cid).eq('status', 'pending');
        await supa.from('ladder_ledger')
          .update({ status: 'expired' })
          .eq('checkout_id', cid).eq('status', 'locked');
      }
    }
  } catch (e) {
    return res.status(500).json({ error: 'fulfilment failed: ' + e.message });
  }

  return res.status(200).json({ received: true });
};
