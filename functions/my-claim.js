/* ==========================================================================
   MY TURF — the key to your spot (no accounts, no passwords).
   Two ways in:
     1. EDIT CODE (primary): POST { code: 'K7PM-X2QF' } — random code issued
        once at claim time; only a SHA-256 hash is stored. Guesses are rate-
        limited (5/IP/day).
     2. Email + registered name (fallback for claims made before codes, or
        lost codes): GET /api/my-claim?email=…, POST { email, prove_name }.
   GET  /api/my-claim?email=…  → find your settled claim(s) by email
   POST /api/my-claim          → unlock + edit (either key above)
   Body: { code? | email? + prove_name?, name?, bio?, field?, city?, project?, web?, social?, image_path? }
   Immutable: spot cells, position, country, spots, email. Editable: profile fields + photo.
   SECURITY_AUDIT.md C1: responses are whitelisted to public-map columns —
   ip / email / checkout_id / charge_id / edit_code_hash never leave the server.
   ========================================================================== */
const getSupabase = require('../lib/supabase.js');

const { objectUrl } = require('../lib/storage.js');
const { FIELDS } = require('../world-core.js');
const { cleanText, cleanClaimBody, escapeIlike, isEmail, clientIp, originAllowed } = require('../lib/validate.js');
const { hashEditCode, looksLikeEditCode } = require('../lib/editcode.js');

const SAFE_COLUMNS = 'id,name,bio,field,country,city,project,web,social,spots,cells,position,image_url,status,created_at';
const SAFE_KEYS = ['id','name','bio','field','country','city','project','web','social','spots','cells','position','image_url','status','created_at'];
const FIELD_NAMES = new Set(FIELDS.map(f => f.name));
const CODE_ATTEMPTS_PER_IP_PER_DAY = 5;

/* Whitelist-project a claim row so sensitive columns can never leak even if
   the table/SELECT changes. */
function safeClaim(row) {
  const out = {};
  SAFE_KEYS.forEach(k => { if (row && row[k] !== undefined) out[k] = row[k]; });
  return out;
}

function todayUtcStart(){
  return new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
}

async function findClaims(supa, email) {
  const { data, error } = await supa
    .from('claims')
    .select(SAFE_COLUMNS)
    .ilike('email', escapeIlike(email))
    .in('status', ['paid', 'free'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/* Ladder placement for a claim: amount + computed rank (count of higher
   payers + 1). Returns null if the claim isn't on the ladder. */
async function ladderInfo(supa, claimId) {
  try {
    const { data: e } = await supa
      .from('ladder_entries').select('amount').eq('claim_id', claimId).limit(1).maybeSingle();
    if (!e) return null;
    const { count } = await supa
      .from('ladder_entries').select('id', { count: 'exact', head: true }).gt('amount', e.amount);
    return { amount: e.amount, rank: (count || 0) + 1 };
  } catch (err) { return null; }
}

/* Look up a SETTLED claim by edit-code hash. */
async function findByCode(supa, code) {
  const { data, error } = await supa
    .from('claims')
    .select(SAFE_COLUMNS)
    .eq('edit_code_hash', hashEditCode(code))
    .in('status', ['paid', 'free'])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

exports.default = async (req, res) => {
  try {
    if (req.method === 'POST' && !originAllowed(req)) {
      return res.status(403).json({ error: 'Cross-origin edits are not allowed.' });
    }
    const supa = getSupabase();

    /* ---------- path 1: EDIT CODE ---------- */
    const body = req.body || {};
    const codeRaw = String(body.code || '').trim();
    let target = null;
    let viaCode = false;

    if (codeRaw) {
      if (!looksLikeEditCode(codeRaw)) {
        return res.status(400).json({ error: 'An edit code looks like K7PM-X2QF.' });
      }
      /* rate-limit guessing before touching the claims table (best-effort:
         soft-fails if the auth_attempts table is absent) */
      const ip = clientIp(req);
      const { count: tries } = await supa
        .from('auth_attempts')
        .select('ip', { count: 'exact', head: true })
        .eq('ip', ip)
        .gte('created_at', todayUtcStart());
      if ((tries || 0) >= CODE_ATTEMPTS_PER_IP_PER_DAY) {
        return res.status(429).json({ error: 'Too many attempts today — use your claim email + name instead.' });
      }
      try { await supa.from('auth_attempts').insert({ ip }); } catch (e) { /* best-effort */ }

      target = await findByCode(supa, codeRaw);
      if (!target) {
        return res.status(401).json({ error: 'That edit code doesn’t match any spot. Check it — K vs H, 5 vs S.' });
      }
      viaCode = true;
    } else {
      /* ---------- path 2: email (+ prove_name for edits) ---------- */
      const rawEmail = String((req.query && req.query.email) || body.email || '').trim().toLowerCase();
      if (!rawEmail || rawEmail.length > 120 || !isEmail(rawEmail)) {
        return res.status(400).json({ error: 'Enter the email you claimed with — or your edit code.' });
      }
      const claims = await findClaims(supa, rawEmail);
      if (!claims.length) return res.status(404).json({ error: 'No turf found for that email.' });

      if (req.method === 'GET') return res.status(200).json({ claims: claims.map(safeClaim), ladder: await ladderInfo(supa, claims[0].id) });
      if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });

      target = claims[0]; /* newest claim for this email */
      const proveName = cleanText(body.prove_name, 64);
      if (!proveName || proveName.toLowerCase() !== String(target.name || '').toLowerCase()) {
        return res.status(401).json({ error: 'Enter the name on the claim to confirm it’s yours.' });
      }
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });

    /* ---------- apply the patch (shared by both paths) ---------- */
    const clean = cleanClaimBody(body);
    const patch = {};
    for (const k of ['bio', 'field', 'city', 'project', 'web', 'social']) {
      if (typeof body[k] === 'string') {
        const v = clean[k];
        patch[k] = v || null;
      }
    }
    if (typeof body.field === 'string' && body.field && !FIELD_NAMES.has(String(body.field))) {
      return res.status(400).json({ error: 'unknown field' });
    }
    /* name change: allowed, but must not collide with anyone else */
    if (typeof body.name === 'string') {
      const v = cleanText(body.name, 24);
      if (v && v.toLowerCase() !== String(target.name || '').toLowerCase()) {
        const { data: clash } = await supa
          .from('claims').select('id').ilike('name', escapeIlike(v)).neq('id', target.id).limit(1).maybeSingle();
        if (clash) return res.status(409).json({ error: 'That name is already taken on the map.' });
        patch.name = v;
      }
    }

    /* photo change: verify the uploaded object, swap the public URL */
    const imagePath = String(body.image_path || '');
    if (/^[0-9a-f-]{36}\.webp$/.test(imagePath)) {
      patch.image_url = await objectUrl(supa, imagePath); /* null → no photo change */
    }

    /* code-auth with nothing to update = "unlock/lookup" — return the claim */
    if (!Object.keys(patch).length) {
      if (viaCode) return res.status(200).json({ claim: safeClaim(target), ladder: await ladderInfo(supa, target.id) });
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    const { data: updated, error } = await supa
      .from('claims').update(patch).eq('id', target.id).select(SAFE_COLUMNS).single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ claim: safeClaim(updated), ladder: await ladderInfo(supa, target.id) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
