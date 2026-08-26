/* POST /api/visit — one fire-and-forget call per page load.
   SECURITY_AUDIT.md H1: the previous `.update({ value: { inc: 1 } })` is not
   valid PostgREST for a bigint column — it 500'd in production and the visit
   counter never moved. Now: atomic `bump_stat()` RPC when the migration is
   applied, read-modify-write fallback otherwise (lost updates possible but
   harmless for a vanity counter). Unauthenticated by design; inflate-proofing
   needs edge/WAF rate limiting (D1). */
const getSupabase = require('../lib/supabase.js');

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const supa = getSupabase();

    if (typeof supa.rpc === 'function') {
      try {
        const { error } = await supa.rpc('bump_stat', { p_key: 'total_visits' });
        if (!error) return res.status(200).json({ ok: true });
        if (error && !/function .* does not exist/i.test(error.message)) throw error;
      } catch (e) { /* fall through to legacy path */ }
    }

    const { data: row } = await supa
      .from('stats').select('value').eq('key', 'total_visits').maybeSingle();
    const next = ((row && row.value) || 0) + 1;
    const { error } = await supa
      .from('stats')
      .update({ value: next, updated_at: new Date().toISOString() })
      .eq('key', 'total_visits');
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
