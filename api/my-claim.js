/* ==========================================================================
   MY TURF — the email is the key to your spot (no accounts, no passwords).
   GET  /api/my-claim?email=…  → find your settled claim(s) by email
   POST /api/my-claim          → owner edits their spot
   Body: { email, name?, bio?, field?, city?, project?, web?, social?, image_path? }
   Immutable: spot cells, position, country, spots. Editable: profile fields + photo.
   ========================================================================== */
const getSupabase = require('../lib/supabase.js');

const EDITABLE = ['name', 'bio', 'field', 'city', 'project', 'web', 'social'];

async function findClaims(supa, email) {
  const { data, error } = await supa
    .from('claims')
    .select('*')
    .ilike('email', email)
    .in('status', ['paid', 'free'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

exports.default = async (req, res) => {
  try {
    const supa = getSupabase();
    const email = String((req.query && req.query.email) || (req.body && req.body.email) || '').trim().toLowerCase();
    if (!email || email.length > 120 || !email.includes('@')) {
      return res.status(400).json({ error: 'Enter the email you claimed with.' });
    }

    const claims = await findClaims(supa, email);
    if (!claims.length) return res.status(404).json({ error: 'No turf found for that email.' });

    if (req.method === 'GET') return res.status(200).json({ claims });
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });

    const body = req.body || {};
    const target = claims[0]; /* newest claim for this email */

    const patch = {};
    for (const k of EDITABLE) {
      if (typeof body[k] === 'string') {
        const v = body[k].trim();
        patch[k] = k === 'name' ? (v || target.name) : (v || null);
      }
    }

    /* identity re-check when the name changes: it can't collide with anyone else */
    if (patch.name && patch.name.toLowerCase() !== (target.name || '').toLowerCase()) {
      const { data: clash } = await supa
        .from('claims').select('id').ilike('name', patch.name).neq('id', target.id).limit(1).maybeSingle();
      if (clash) return res.status(409).json({ error: 'That name is already taken on the map.' });
    }

    /* photo change: verify the uploaded object, swap the public URL */
    const imagePath = String(body.image_path || '');
    if (/^[0-9a-f-]{36}\.webp$/.test(imagePath)) {
      try {
        const { data: obj, error: statErr } = await supa.storage.from('people').stat(imagePath);
        if (!statErr && obj) patch.image_url = supa.storage.from('people').getPublicUrl(imagePath).data.publicUrl;
      } catch (e) { /* ignore unreadable path */ }
    }

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });

    const { data: updated, error } = await supa
      .from('claims').update(patch).eq('id', target.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ claim: updated });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
