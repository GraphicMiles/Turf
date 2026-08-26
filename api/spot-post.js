/* ==========================================================================
   SPOT POSTS — the media feed on each spot (image / gif / video / audio).
   GET    /api/spot-post?claim_id=…&limit=20   → the feed (public)
   POST   /api/spot-post                       → add a post (needs edit code
          or email + registered name — same keys as My Turf edits)
          Body: { code | email+prove_name, kind, path, caption? }
   DELETE /api/spot-post                       → remove a post (same auth)
          Body: { code | email+prove_name, id }
   ========================================================================== */
const getSupabase = require('../lib/supabase.js');
const { cleanText, isEmail, originAllowed } = require('../lib/validate.js');
const { hashEditCode, looksLikeEditCode } = require('../lib/editcode.js');

const KINDS = { image: /\.(webp|jpg|png)$/i, gif: /\.gif$/i, video: /\.(mp4|webm|mov)$/i, audio: /\.(mp3|m4a|wav|ogg|aac)$/i };
const MAX_POSTS_PER_CLAIM = 60;

exports.default = async (req, res) => {
  try {
    if (req.method !== 'GET' && !originAllowed(req)) {
      return res.status(403).json({ error: 'Cross-origin posts are not allowed.' });
    }
    const supa = getSupabase();

    /* ---------------- public feed ---------------- */
    if (req.method === 'GET') {
      const claimId = String((req.query && req.query.claim_id) || '');
      if (!/^[0-9a-f-]{36}$/i.test(claimId)) return res.status(400).json({ error: 'claim_id required' });
      const limit = Math.max(1, Math.min(60, Math.round(Number((req.query && req.query.limit) || 20))));
      const { data, error } = await supa
        .from('spot_posts')
        .select('id,kind,url,caption,created_at')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return res.status(200).json({ posts: data || [] });
    }

    if (req.method !== 'POST' && req.method !== 'DELETE') {
      return res.status(405).json({ error: 'GET, POST or DELETE' });
    }

    /* ---------------- auth: find the caller's claim ---------------- */
    const body = req.body || {};
    const code = String(body.code || '').trim();
    let target = null;

    if (code) {
      if (!looksLikeEditCode(code)) return res.status(400).json({ error: 'An edit code looks like K7PM-X2QF.' });
      const { data: byCode } = await supa
        .from('claims').select('id,name,status')
        .eq('edit_code_hash', hashEditCode(code))
        .in('status', ['paid', 'free'])
        .limit(1).maybeSingle();
      if (!byCode) return res.status(401).json({ error: 'That edit code doesn’t match any spot.' });
      target = byCode;
    } else {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email || !isEmail(email)) return res.status(400).json({ error: 'Edit code or claim email required.' });
      const { data: claims } = await supa
        .from('claims').select('id,name,status')
        .ilike('email', email)
        .in('status', ['paid', 'free'])
        .order('created_at', { ascending: false });
      if (!claims || !claims.length) return res.status(404).json({ error: 'No turf found for that email.' });
      const proveName = cleanText(body.prove_name, 64);
      const match = claims.find(c => proveName && proveName.toLowerCase() === String(c.name || '').toLowerCase());
      if (!match) return res.status(401).json({ error: 'Enter the name on the claim to confirm it’s yours.' });
      target = match;
    }

    /* ---------------- delete ---------------- */
    if (req.method === 'DELETE') {
      const postId = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(postId)) return res.status(400).json({ error: 'id required' });
      const { data: del, error: delErr } = await supa
        .from('spot_posts').delete().select('id')
        .eq('id', postId).eq('claim_id', target.id);
      if (delErr) throw delErr;
      if (!del || !del.length) return res.status(404).json({ error: 'Post not found.' });
      return res.status(200).json({ ok: true });
    }

    /* ---------------- create ---------------- */
    const kind = String(body.kind || '');
    const path = String(body.path || '');
    if (!KINDS[kind]) return res.status(400).json({ error: 'kind must be image, gif, video or audio' });
    if (!KINDS[kind].test(path)) return res.status(400).json({ error: 'That file path doesn’t match the ' + kind + ' kind.' });

    /* the object must exist and be ≤ the kind's cap before we publish it */
    const { count: postCount } = await supa
      .from('spot_posts').select('id', { count: 'exact', head: true })
      .eq('claim_id', target.id);
    if ((postCount || 0) >= MAX_POSTS_PER_CLAIM) {
      return res.status(429).json({ error: 'Feed is full — remove an older post first.' });
    }

    const { data: obj, error: statErr } = await supa.storage.from('people').stat(path);
    if (statErr || !obj) return res.status(400).json({ error: 'Upload not found — try again.' });

    const url = supa.storage.from('people').getPublicUrl(path).data.publicUrl;
    const { data: post, error } = await supa.from('spot_posts').insert({
      claim_id: target.id,
      kind,
      url,
      caption: cleanText(body.caption, 140) || null,
    }).select('id,kind,url,caption,created_at').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ post });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
