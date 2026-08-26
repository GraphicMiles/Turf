/* GET /api/claims — settled claims for the map.
   With ?macro=mr-mc: just the people whose cells fall in that 10×10 sector
   (plus runs entering from its left neighbour) — ≤ ~100 rows, which is what
   makes the map scale: the browser lazy-loads only the sectors it shows.
   Without a query: the whole settled map (demo/preview use) — SECURITY_AUDIT
   H1: now capped at 2000 rows and cached 60s in-memory per function instance
   so it can't be used as an O(n)-per-request amplification hammer. */
const getSupabase = require('../lib/supabase.js');

const DUMP_LIMIT = 2000;
let dumpCache = { at: 0, data: null };
const DUMP_TTL_MS = 60000;

exports.default = async (req, res) => {
  try {
    const supa = getSupabase();

    const macro = req.query && req.query.macro;
    if (macro) {
      const parts = String(macro).split('-');
      if (parts.length === 2) {
        const mr = Number(parts[0]), mc = Number(parts[1]);
        if (mr >= 0 && mr < 10 && mc >= 0 && mc < 10) {
          const keys = [mr + '-' + mc];
          if (mc > 0) keys.push(mr + '-' + (mc - 1)); /* horizontal runs enter a sector from the left */
          const { data, error } = await supa
            .from('claims')
            .select('name,bio,field,country,city,project,web,social,spots,cells,checkout_id,position,image_url,status,created_at')
            .in('status', ['paid', 'free'])
            .in('macro', keys)
            .limit(DUMP_LIMIT);
          if (error) throw error;
          return res.status(200).json(data || []);
        }
      }
    }

    /* macro-less dump: cached + capped */
    const now = Date.now();
    if (!dumpCache.data || now - dumpCache.at > DUMP_TTL_MS) {
      const { data, error } = await supa
        .from('claims')
        .select('name,bio,field,country,city,project,web,social,spots,cells,checkout_id,position,image_url,status,created_at')
        .in('status', ['paid', 'free'])
        .limit(DUMP_LIMIT);
      if (error) throw error;
      dumpCache = { at: now, data: data || [] };
    }
    return res.status(200).json(dumpCache.data);
  } catch (e) {
    /* not configured / offline → empty list; the map falls back to the demo world */
    return res.status(200).json([]);
  }
};
