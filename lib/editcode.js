/* ==========================================================================
   EDIT CODES — the key to your spot (SECURITY_AUDIT.md C1 follow-up).
   A random 8-char code is issued ONCE at claim time (shown in the UI, saved
   on the user's device). Only a SHA-256 hash is stored server-side, so a DB
   dump leaks nothing. Codes are looked up by hash (deterministic — the code
   has 32^8 ≈ 1.1e12 combinations, so an unsalted hash is safe here).
   32-char unambiguous alphabet (no 0/O, 1/I/l) so codes can be retyped.
   ========================================================================== */
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; /* 32 chars — 256 % 32 === 0, no modulo bias */

function generateEditCode() {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s.slice(0, 4) + '-' + s.slice(4);           /* display form: XXXX-XXXX */
}

/* Accept sloppy input: "k7pm x2qf", "K7PMX2QF", "k7pm-x2qf" */
function normalizeEditCode(input) {
  return String(input || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
}

function hashEditCode(input) {
  return crypto.createHash('sha256')
    .update('turf-edit-v1:' + normalizeEditCode(input))
    .digest('hex');
}

/* loose shape check — enough to route input, never used for auth */
function looksLikeEditCode(input) {
  return /^[A-Za-z0-9]{4}[-\s]?[A-Za-z0-9]{4}$/.test(String(input || '').trim());
}

module.exports = { generateEditCode, normalizeEditCode, hashEditCode, looksLikeEditCode };
