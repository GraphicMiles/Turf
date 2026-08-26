/* ==========================================================================
   Shared server-side validation helpers (security).
   Every claim/edit field passes through cleanText() — length caps + control
   char / tag stripping — BEFORE it is stored, because client-side maxlength
   is trivially bypassed with curl (stored XSS, see SECURITY_AUDIT.md C2).
   ========================================================================== */

/* Field length caps (match the HTML maxlength intent) */
const CAPS = {
  name: 24, bio: 80, city: 24, project: 48, web: 60, social: 60, email: 120,
};

/* Strip tags + control chars, collapse newlines, hard cap length.
   Defense in depth: the frontend escapes on render, but the DB should never
   hold angle brackets / zero-width floods in the first place. */
function cleanText(v, cap) {
  if (v === undefined || v === null) return '';
  let s = String(v);
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, '');
  s = s.replace(/[<>]/g, '');          /* no tags, ever */
  s = s.slice(0, cap);
  return s.trim();
}

/* Claim-shaped payload → sanitized payload (returns {} for garbage).
   Keeps only known keys; unknown keys are dropped server-side. */
function cleanClaimBody(body) {
  body = body || {};
  return {
    name: cleanText(body.name, CAPS.name),
    bio: cleanText(body.bio, CAPS.bio),
    field: cleanText(body.field, 40),
    city: cleanText(body.city, CAPS.city),
    project: cleanText(body.project, CAPS.project),
    web: cleanText(body.web, CAPS.web),
    social: cleanText(body.social, CAPS.social),
    email: cleanText(body.email, CAPS.email).toLowerCase(),
  };
}

/* Escape LIKE wildcards so user text can't match "everyone" (H3). */
function escapeIlike(s) {
  return String(s || '').replace(/[\\%_]/g, m => '\\' + m);
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
function isEmail(s) { return EMAIL_RE.test(String(s || '')); }

/* Best-effort client IP. x-forwarded-for is only trustworthy when set by the
   platform edge (Vercel overwrites it); we still validate the shape and drop
   junk. Rate limiting that relies on this needs edge/WAF enforcement (D1). */
function clientIp(req) {
  const h = (req && req.headers) || {};
  const raw = h['x-forwarded-for'] || h['x-real-ip'] || '';
  const first = String(raw).split(',')[0].trim();
  const ip = first.replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45);
  return ip || 'unknown';
}

/* Origin allowlist for mutation endpoints + checkout redirect URLs (H2/H4).
   ALLOWED_ORIGINS=https://a.com,https://b.com — unset = trust request host. */
function allowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

/* Resolve the origin we may redirect back to: allowlist first, then the
   request's own scheme+host, never a bare client-supplied Origin. */
function safeRedirectBase(req) {
  const h = (req && req.headers) || {};
  const allow = allowedOrigins();
  if (allow.length) return allow[0];
  if (h.host) {
    const host = String(h.host).replace(/[^a-zA-Z0-9.\-:]/g, '');
    const proto = String(h['x-forwarded-proto'] || 'https').split(',')[0].trim();
    return (/^https?$/.test(proto) ? proto : 'https') + '://' + host;
  }
  return null;
}

/* For POST/PUT endpoints: if the browser sent an Origin header, it must be
   same-host or allowlisted (blocks cross-site form CSRF while keeping curl
   and server-to-server calls working). */
function originAllowed(req) {
  const h = (req && req.headers) || {};
  const origin = h.origin;
  if (!origin) return true; /* non-browser client — auth is handled elsewhere */
  const allow = allowedOrigins();
  if (allow.length) return allow.includes(String(origin));
  try {
    const u = new URL(String(origin));
    return h.host ? u.host === String(h.host) : false;
  } catch (e) { return false; }
}

module.exports = {
  CAPS, cleanText, cleanClaimBody, escapeIlike, isEmail,
  clientIp, allowedOrigins, safeRedirectBase, originAllowed,
};
