/* GET /api/claim-mode — founder tier vs paid.
   The first FOUNDER_LIMIT real claims (free + paid) are free; after that, payment. */
const getSupabase = require('../lib/supabase.js');
const FOUNDER_LIMIT = 200;

exports.default = async (req, res) => {
  try {
    const supa = getSupabase();
    const { count, error } = await supa
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .in('status', ['paid', 'free']);
    if (error) throw error;
    const c = count || 0;
    return res.status(200).json({
      mode: c < FOUNDER_LIMIT ? 'free' : 'paid',
      count: c,
      limit: FOUNDER_LIMIT,
      freeRemaining: Math.max(0, FOUNDER_LIMIT - c),
    });
  } catch (e) {
    /* Supabase not configured → client falls back to a local demo counter */
    return res.status(200).json({ mode: 'demo', count: 0, limit: FOUNDER_LIMIT, freeRemaining: FOUNDER_LIMIT });
  }
};
