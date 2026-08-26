/* POST /api/heartbeat { session } — presence.
   Client sends its anon session id every 30s. "Online now" = sessions seen
   in the last 90s. Stale sessions (>1h) are pruned opportunistically. */
const getSupabase = require('../lib/supabase.js');

const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ONLINE_WINDOW_MS = 90000;
const STALE_MS = 3600000;

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const session = String((req.body && req.body.session) || '');
  if (!SESSION_RE.test(session)) return res.status(400).json({ error: 'bad session' });
  try {
    const supa = getSupabase();
    const now = new Date().toISOString();
    await supa.from('presence').upsert({ session, last_seen: now });
    const { data: recent, error: cErr } = await supa
      .from('presence')
      .select('session')
      .gt('last_seen', new Date(Date.now() - ONLINE_WINDOW_MS).toISOString());
    if (cErr) throw cErr;
    await supa
      .from('presence')
      .delete()
      .lt('last_seen', new Date(Date.now() - STALE_MS).toISOString());
    return res.status(200).json({ online: recent ? recent.length : 0 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
