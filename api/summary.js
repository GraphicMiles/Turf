/* GET /api/summary — small aggregates for the UI:
   total people, per-country counts, top 20 (by position).
   At ≤100k claims the direct queries are fine; beyond that, read the
   materialized views mv_country_counts / mv_top20 (see schema.sql). */
const getSupabase = require('../lib/supabase.js');

exports.default = async (req, res) => {
  try {
    const supa = getSupabase();

    const { count: total, error: totalErr } = await supa
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .in('status', ['paid', 'free']);
    if (totalErr) throw totalErr;

    const { data: top20, error: topErr } = await supa
      .from('claims')
      .select('position,name,country,city,field,cells,status')
      .in('status', ['paid', 'free'])
      .lte('position', 20)
      .order('position', { ascending: true });
    if (topErr) throw topErr;

    const { data: countryRows, error: cErr } = await supa
      .from('claims')
      .select('country')
      .in('status', ['paid', 'free']);
    if (cErr) throw cErr;

    const byCountry = {};
    (countryRows || []).forEach(r => { byCountry[r.country] = (byCountry[r.country] || 0) + 1; });

    /* stats: total visits + online now (sessions seen in the last 90s) */
    const { data: statRow } = await supa
      .from('stats').select('value').eq('key', 'total_visits').maybeSingle();
    const { data: recent, error: pErr } = await supa
      .from('presence')
      .select('session')
      .gt('last_seen', new Date(Date.now() - 90000).toISOString());
    if (pErr) throw pErr;

    return res.status(200).json({
      total: total || 0,
      byCountry,
      top20: top20 || [],
      totalVisits: (statRow && statRow.value) || 0,
      onlineNow: recent ? recent.length : 0,
      launchIso: process.env.TURF_LAUNCH_ISO || '2026-08-26T00:00:00Z',
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
