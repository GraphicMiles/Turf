/* POST /api/visit — one fire-and-forget call per page load. */
const getSupabase = require('../lib/supabase.js');

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const supa = getSupabase();
    const { error } = await supa
      .from('stats')
      .update({ value: { inc: 1 }, updated_at: new Date().toISOString() })
      .eq('key', 'total_visits');
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
