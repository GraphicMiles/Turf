/* GET /api/claims — settled claims for the map.
   Without a query: all settled claims (demo/preview use).
   With ?macro=mr-mc: just the people whose cells fall in that 10×10 sector
   (plus runs entering from its left neighbour) — ≤ ~100 rows, which is what
   makes the map scale: the browser lazy-loads only the sectors it shows. */
const getSupabase = require('../lib/supabase.js');

exports.default = async (req, res) => {
  try {
    const supa = getSupabase();
    let q = supa
      .from('claims')
      .select('name,bio,field,country,city,project,web,social,spots,cells,checkout_id,position,image_url,status,created_at')
      .in('status', ['paid', 'free']);

    const macro = req.query && req.query.macro;
    if (macro) {
      const parts = String(macro).split('-');
      if (parts.length === 2) {
        const mr = Number(parts[0]), mc = Number(parts[1]);
        if (mr >= 0 && mr < 10 && mc >= 0 && mc < 10) {
          const keys = [mr + '-' + mc];
          if (mc > 0) keys.push(mr + '-' + (mc - 1)); /* horizontal runs enter a sector from the left */
          q = q.in('macro', keys);
        }
      }
    }

    const { data, error } = await q;
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (e) {
    /* not configured / offline → empty list; the map falls back to the demo world */
    return res.status(200).json([]);
  }
};
