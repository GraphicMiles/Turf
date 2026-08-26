/* POST /api/upload-url — mint a short-lived signed upload URL for spot media.
   Body: { kind: 'image'|'gif'|'video'|'audio', name*, email?, owner?|code?,
           type (mime), size (bytes) }
   Caps (SECURITY_AUDIT.md H1 + media pivot):
     image ≤ 5MB (webp/jpeg/png) · gif ≤ 8MB · video ≤ 25MB (mp4/webm)
     audio ≤ 10MB (mp3/m4a/wav/ogg)
   The browser PUTs directly to Supabase Storage — the service key never
   leaves the server. Extension is derived server-side from the kind/mime so
   a .webp path can never hold HTML/video, and content-type spoofing on the
   trusted bucket domain stays bounded. */
const crypto = require('crypto');
const getSupabase = require('../lib/supabase.js');
const { cleanText, escapeIlike, isEmail, clientIp, originAllowed } = require('../lib/validate.js');
const { hashEditCode, looksLikeEditCode } = require('../lib/editcode.js');

const MINTS_PER_IP_PER_DAY = 12;

const KINDS = {
  image: { max: 5 * 1024 * 1024,  mimes: /^image\/(webp|jpeg|jpg|png)$/,       exts: { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png' } },
  gif:   { max: 8 * 1024 * 1024,  mimes: /^image\/gif$/,                        exts: { 'image/gif': 'gif' } },
  video: { max: 25 * 1024 * 1024, mimes: /^video\/(mp4|webm|quicktime)$/,       exts: { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' } },
  audio: { max: 10 * 1024 * 1024, mimes: /^audio\/(mpeg|mp4|wav|ogg|x-m4a|aac)$/, exts: { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' } },
};

function todayUtcStart(){
  return new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
}

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'Cross-origin uploads are not allowed.' });

  const body = req.body || {};
  const name = cleanText(body.name, 24);
  const type = String(body.type || '').toLowerCase();
  const size = Number(body.size || 0);
  let kind = String(body.kind || (type === 'image/gif' ? 'gif' : (type.startsWith('video/') ? 'video' : (type.startsWith('audio/') ? 'audio' : 'image'))));

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!KINDS[kind]) return res.status(400).json({ error: 'kind must be image, gif, video or audio' });
  const spec = KINDS[kind];
  if (!spec.mimes.test(type)) return res.status(415).json({ error: 'That file type is not allowed for ' + kind + '.' });
  if (size <= 0 || size > spec.max) {
    return res.status(413).json({ error: 'File too large — max ' + Math.round(spec.max / (1024 * 1024)) + 'MB for ' + kind + '.' });
  }
  const ext = spec.exts[type];
  if (!ext) return res.status(415).json({ error: 'Unsupported ' + kind + ' format.' });

  let supa;
  try { supa = getSupabase(); } catch (e) {
    return res.status(500).json({ error: 'Supabase not configured: ' + e.message });
  }

  const email = cleanText(body.email, 120).toLowerCase() ||
    (name.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@turf.local');
  const owner = cleanText(body.owner, 120).toLowerCase();
  const code = String(body.code || '').trim();

  /* identity rule: don't mint uploads for data that's taken — UNLESS the
     requester proves ownership (valid edit code, or owner email matching an
     existing claim). Everything else is ignored. */
  const { data: existing } = await supa
    .from('claims')
    .select('id')
    .ilike('name', escapeIlike(name))
    .ilike('email', escapeIlike(email))
    .limit(1)
    .maybeSingle();
  if (existing) {
    let verified = false;
    if (code && looksLikeEditCode(code)) {
      const { data: codeClaim } = await supa
        .from('claims')
        .select('id')
        .eq('edit_code_hash', hashEditCode(code))
        .limit(1)
        .maybeSingle();
      verified = !!codeClaim;
    } else if (owner && isEmail(owner)) {
      const { data: ownerClaim } = await supa
        .from('claims')
        .select('id')
        .ilike('email', escapeIlike(owner))
        .limit(1)
        .maybeSingle();
      verified = !!ownerClaim;
    }
    if (!verified) {
      return res.status(409).json({ error: 'That name + email is already on the map — your data is your identity, and it’s taken.' });
    }
  }

  /* rate limit: N signed URLs per IP per day (storage-fill DoS) */
  const ip = clientIp(req);
  const { count: mintCount } = await supa
    .from('upload_mints')
    .select('ip', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', todayUtcStart());
  if ((mintCount || 0) >= MINTS_PER_IP_PER_DAY) {
    return res.status(429).json({ error: 'Too many uploads today — try again tomorrow.' });
  }
  try { await supa.from('upload_mints').insert({ ip }); } catch (e) { /* best-effort */ }

  const path = crypto.randomUUID() + '.' + ext;
  const { data, error } = await supa.storage.from('people').createSignedUploadUrl(path);
  if (error || !data) return res.status(500).json({ error: (error && error.message) || 'could not mint upload URL' });

  return res.status(200).json({ uploadUrl: data.signedUrl, path, kind, ext, method: 'PUT', contentType: type });
};
