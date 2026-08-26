/* GET /api/claim-status?checkout_id=… — poll helper while the webhook confirms.
   SECURITY_AUDIT.md C5: also replays queued pending_fulfilments (payments that
   arrived before their claim row existed) — lazy reconciliation on poll. */
const getSupabase = require('../lib/supabase.js');

exports.default = async (req, res) => {
  const checkoutId = req.query && req.query.checkout_id;
  if (!checkoutId) return res.status(400).json({ error: 'checkout_id required' });
  try {
    const supa = getSupabase();

    const { data, error } = await supa
      .from('claims').select('status').eq('checkout_id', checkoutId).maybeSingle();
    if (error) throw error;
    if (data) return res.status(200).json({ status: data.status });

    /* no claim by that checkout id — maybe a queued fulfilment can settle now */
    const { data: queued } = await supa
      .from('pending_fulfilments').select('id,charge_id').eq('checkout_id', String(checkoutId).slice(0, 120)).limit(1).maybeSingle();
    if (queued) {
      const { count } = await supa
        .from('claims')
        .select('id', { count: 'exact', head: true })
        .in('status', ['paid', 'free']);
      await supa.from('claims')
        .update({ status: 'paid', charge_id: queued.charge_id, position: (count || 0) + 1 })
        .eq('checkout_id', checkoutId);
      await supa.from('pending_fulfilments').delete().eq('id', queued.id);
      return res.status(200).json({ status: 'paid' });
    }

    return res.status(200).json({ status: 'not_found' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
