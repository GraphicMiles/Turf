/* POST /api/upload-url — mint a short-lived signed upload URL for a claim photo.
   Body: { name*, type (image/*), size (bytes ≤ 1MB) }
   The browser then PUTs the (client-compressed WebP) directly to Supabase
   Storage — the service key never leaves the server.
   Returns: { uploadUrl, path, method: 'PUT' } — pass `path` back in the claim. */
const crypto = require('crypto');
const { WORLD } = require('../world-core.js');
const getSupabase = require('../lib/supabase.js');

const MAX_BYTES = 1024 * 1024; /* client compresses to ≤512px WebP (~100–300KB) */

exports.default = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const type = String(body.type || '');
  const size = Number(body.size || 0);

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!/^image\//.test(type)) return res.status(415).json({ error: 'Only image uploads are allowed.' });
  if (size <= 0 || size > MAX_BYTES) return res.status(413).json({ error: 'Photo too large — max 1MB after compression.' });

  let supa;
  try { supa = getSupabase(); } catch (e) {
    return res.status(500).json({ error: 'Supabase not configured: ' + e.message });
  }

  /* identity rule: don't mint uploads for data that's taken —
     unless the requester is the OWNER of that data (editing their own spot) */
  const email = String(body.email || '').trim() ||
    (name.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@turf.local');
  const owner = String(body.owner || '').trim().toLowerCase();
  if (!owner) {
    const { data: existing } = await supa
      .from('claims')
      .select('id')
      .ilike('name', name)
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'That name + email is already on the map — your data is your identity, and it’s taken.' });
    }
  }

  const path = crypto.randomUUID() + '.webp';
  const { data, error } = await supa.storage.from('people').createSignedUploadUrl(path);
  if (error || !data) return res.status(500).json({ error: (error && error.message) || 'could not mint upload URL' });

  return res.status(200).json({ uploadUrl: data.signedUrl, path, method: 'PUT', contentType: 'image/webp' });
};
