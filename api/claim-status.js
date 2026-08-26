/* GET /api/claim-status?checkout_id=… — poll helper while the webhook confirms. */
const getSupabase = require('../lib/supabase.js');

exports.default = async (req, res) => {
  const checkoutId = req.query && req.query.checkout_id;
  if (!checkoutId) return res.status(400).json({ error: 'checkout_id required' });
  try {
    const supa = getSupabase();
    const { data, error } = await supa
      .from('claims').select('status').eq('checkout_id', checkoutId).maybeSingle();
    if (error) throw error;
    return res.status(200).json({ status: data ? data.status : 'not_found' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
