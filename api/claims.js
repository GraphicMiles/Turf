/* GET /api/claims — paid + free claims for the map (public read). */
const getSupabase = require('../lib/supabase.js');

exports.default = async (req, res) => {
  try {
    const supa = getSupabase();
    const { data, error } = await supa
      .from('claims')
      .select('name,bio,field,country,city,project,web,social,spots,cells,checkout_id,position,status,created_at')
      .in('status', ['paid', 'free']);
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (e) {
    /* not configured / offline → empty list; the map falls back to the demo world */
    return res.status(200).json([]);
  }
};
