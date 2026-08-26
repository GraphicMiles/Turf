/* GET /api/ladder?from=1&count=40 — the ranked ladder.
   RANK = amount paid (desc), ties by payment time. Uses the ladder_view()
   RPC when the schema migration is applied; falls back to REST + JS sort.
   Query ?meta=1 → stats + recent activity instead of rows. */
const getSupabase = require('../lib/supabase.js');
const { basePrice, ROW_SIZE, FOUNDER_LIMIT } = require('../lib/ladder.js');

const HOLDER_SAFE = ['claim_id','name','field','country','city','project','web','social','image_url','bio'];

async function rankedRows(supa, from, count) {
  /* RPC path (migration applied) */
  if (typeof supa.rpc === 'function') {
    try {
      const { data, error } = await supa.rpc('ladder_view', { p_from: from, p_count: count });
      if (!error && Array.isArray(data)) {
        return data.map(r => ({
          rank: r.rank, amount: r.amount, paid_at: r.paid_at, posts: Number(r.posts) || 0,
          holder: pick(r),
        }));
      }
    } catch (e) { /* fall back */ }
  }
  /* REST fallback: fetch entries, sort the same way, slice in JS */
  const { data: entries, error } = await supa
    .from('ladder_entries')
    .select('claim_id,amount,paid_at,claims(name,field,country,city,project,web,social,image_url,bio)')
    .order('amount', { ascending: false })
    .order('paid_at', { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (entries || []).slice(from - 1, from - 1 + count).map((e, i) => ({
    rank: from + i, amount: e.amount, paid_at: e.paid_at, posts: 0,
    holder: pick(e.claims || {}),
  }));
}

function pick(r) {
  const o = {};
  HOLDER_SAFE.forEach(k => { if (r && r[k] !== undefined && r[k] !== null) o[k] = r[k]; });
  return Object.keys(o).length ? o : null;
}

exports.default = async (req, res) => {
  try {
    const supa = getSupabase();
    const q = (req.query || {});

    if (String(q.meta || '') === '1') {
      const { count: taken } = await supa
        .from('ladder_entries').select('id', { count: 'exact', head: true });
      const { data: recent, error: recErr } = await supa
        .from('ladder_ledger')
        .select('action,amount,created_at,claims(name),target_claim_id')
        .eq('status', 'settled')
        .order('created_at', { ascending: false })
        .limit(8);
      if (recErr) throw recErr;
      const { data: locks } = await supa
        .from('ladder_ledger')
        .select('target_claim_id,locked_until')
        .eq('status', 'locked')
        .gt('locked_until', new Date().toISOString())
        .limit(50);
      const t = taken || 0;
      return res.status(200).json({
        taken: t,
        basePrice: basePrice(),
        rowSize: ROW_SIZE,
        firstSpotFree: t === 0,
        mode: t < FOUNDER_LIMIT ? 'free' : 'paid',
        freeRemaining: Math.max(0, FOUNDER_LIMIT - t),
        founderLimit: FOUNDER_LIMIT,
        recent: (recent || []).map(r => ({ action: r.action, amount: r.amount, name: (r.claims && r.claims.name) || 'Someone', at: r.created_at })),
        lockedTargets: (locks || []).map(l => l.target_claim_id),
      });
    }

    const from = Math.max(1, Math.min(9999, Math.round(Number(q.from) || 1)));
    const count = Math.max(1, Math.min(100, Math.round(Number(q.count) || 40)));
    const rows = await rankedRows(supa, from, count);
    return res.status(200).json({ rows, basePrice: basePrice(), rowSize: ROW_SIZE });
  } catch (e) {
    /* not configured / offline → empty ladder; UI shows demo state */
    return res.status(200).json({ rows: [], basePrice: basePrice(), rowSize: ROW_SIZE, error: e.message });
  }
};
