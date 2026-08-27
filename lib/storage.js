/* ==========================================================================
   STORAGE HELPERS — matched against the REAL @supabase/storage-js API.
   storage-js has NO .stat() method (verified against v2.109.0 types):
   calling it throws "not a function". Existence checks must use
   list('', { search }) instead. The old test stub faked .stat() and hid
   this for weeks — never again: the stub now mirrors the real surface.
   ========================================================================== */

/* Returns the public URL of people/<path> if the object exists, else null.
   Flat bucket layout (path = "uuid.ext"), so we list the root and prefix-
   search, then exact-match the name to dodge partial-prefix false hits. */
async function objectUrl(supa, path) {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i.test(String(path || ''))) return null;
  try {
    const { data, error } = await supa.storage.from('people').list('', { search: path, limit: 1 });
    if (error || !Array.isArray(data) || !data.some(o => o && o.name === path)) return null;
    const pub = supa.storage.from('people').getPublicUrl(path);
    return (pub && pub.data && pub.data.publicUrl) || null;
  } catch (e) {
    return null;
  }
}

module.exports = { objectUrl };
