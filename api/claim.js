/* GET /api/claim?checkout_id=… — single claim by checkout id (used after payment). */
const getSupabase = require('../lib/supabase.js');

exports.default = async (req, res) => {
  const checkoutId = req.query && req.query.checkout_id;
  if (!checkoutId) return res.status(400).json({ error: 'checkout_id required' });
  try {
    const supa = getSupabase();
    const { data, error } = await supa
      .from('claims')
      .select('name,bio,field,country,city,project,web,social,spots,cells,checkout_id,charge_id,status')
      .eq('checkout_id', checkoutId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'claim not found' });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
