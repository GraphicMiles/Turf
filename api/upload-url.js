/* POST /api/upload-url — mint a short-lived signed upload URL for a claim photo.
   Body: { name*, email?, owner?, type (image/*), size (bytes ≤ 1MB) }
   The browser then PUTs the (client-compressed WebP) directly to Supabase
   Storage — the service key never leaves the server.
   Returns: { uploadUrl, path, method: 'PUT' } — pass `path` back in the claim.

   Security (SECURITY_AUDIT.md H1/H3/H4):
   • `owner` (the claimant's email) no longer BLINDLY skips the identity check —
     it must match an existing claim, otherwise it is ignored.
   • Minting is rate-limited per IP per day (storage-fill / bill DoS).
   • Cross-site browser posts are rejected. */
const crypto = require('crypto');
const getSupabase = require('../lib/supabase.js');
const { cleanText, escapeIlike, isEmail, clientIp, originAllowed } = require('../lib/validate.js');
const { hashEditCode, looksLikeEditCode } = require('../lib/editcode.js');

const MAX_BYTES = 1024 * 1024; /* client compresses to ≤512px WebP (~100–300KB) */
const MINTS_PER_IP_PER_DAY = 12;

function todayUtcStart(){
  return new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
}

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'Cross-origin uploads are not allowed.' });

  const body = req.body || {};
  const name = cleanText(body.name, 24);
  const type = String(body.type || '');
  const size = Number(body.size || 0);

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!/^image\//.test(type)) return res.status(415).json({ error: 'Only image uploads are allowed.' });
  if (size <= 0 || size > MAX_BYTES) return res.status(413).json({ error: 'Photo too large — max 1MB after compression.' });

  let supa;
  try { supa = getSupabase(); } catch (e) {
    return res.status(500).json({ error: 'Supabase not configured: ' + e.message });
  }

  const email = cleanText(body.email, 120).toLowerCase() ||
    (name.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@turf.local');
  const owner = cleanText(body.owner, 120).toLowerCase();
  const code = String(body.code || '').trim();

  /* identity rule: don't mint uploads for data that's taken —
     UNLESS the requester proves ownership: a valid edit code, or an owner
     email that matches an existing claim. Anything else is ignored. */
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
    return res.status(429).json({ error: 'Too many photo uploads today — try again tomorrow.' });
  }
  try { await supa.from('upload_mints').insert({ ip }); } catch (e) { /* soft-fail: mint cap is best-effort */ }

  const path = crypto.randomUUID() + '.webp';
  const { data, error } = await supa.storage.from('people').createSignedUploadUrl(path);
  if (error || !data) return res.status(500).json({ error: (error && error.message) || 'could not mint upload URL' });

  return res.status(200).json({ uploadUrl: data.signedUrl, path, method: 'PUT', contentType: 'image/webp' });
};
