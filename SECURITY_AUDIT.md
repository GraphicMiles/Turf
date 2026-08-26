# TURF F. — Security Audit

**Date:** 2026-08-26 · **Scope:** full repo @ `3ed82cf` (all `api/` functions, `app.js`, `world-core.js`, `index.html`, `supabase/schema.sql`, tests, git history)

Severity scale: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low

---

## 🔴 CRITICAL

### C1. Full account takeover + PII dump via `/api/my-claim` — *"email is the key"*
**File:** `api/my-claim.js`

- `GET /api/my-claim?email=victim@example.com` returns the victim's **entire claim row** (`select('*')`) — including `ip`, `checkout_id`, `charge_id`, `email`.
- `POST /api/my-claim` with **only the email** rewrites the victim's profile (name, bio, field, city, project, web, social, photo). There is **zero proof-of-ownership** — no OTP, no magic link. Emails are semi-public (they appear in contact lists, breaches, social profiles).
- Attack chain: attacker knows any claimant's email → reads their data (incl. IP address = PII under NDPR/GDPR) → overwrites their card with anything, including a **stored XSS payload** (see C2) that fires for every visitor.

**Fix applied:** GET now returns only safe columns (no `ip`, `email`, `checkout_id`, `charge_id`). POST now requires `prove_name` (the exact registered name) as a second knowledge factor + the email. **Recommended next step:** replace with a proper emailed magic link / OTP — requires a mail provider (e.g. Resend). Rate-limit attempts per IP.

### C2. Stored XSS — server stores raw input, frontend injects it via `innerHTML`
**Files:** `api/free-claim.js`, `api/create-checkout.js`, `api/my-claim.js` (no sanitization / no length caps) · `app.js` sinks: `#pmLoc` (city), Top-20 list (name/city/field), `#mtSummary` (name), `showToast()` (name/project)

- The HTML `maxlength` (24–80 chars) is **client-side only** — a `curl` to `/api/free-claim` (free! founder tier, no payment) can store a 10 KB `city` like `<img src=x onerror="…">`.
- Every visitor who zooms into that sector / opens the person card / views the Top 20 executes the attacker's JS in the page origin. No CSP exists to blunt it.

**Fix applied:** server-side length caps + control-char/angle-bracket stripping for all text fields (`lib/validate.js`), `field` validated against the known list, HTML-escaping (`esc()`) at every `innerHTML` sink in `app.js`, CSP meta tag added to `index.html`.

### C3. Supabase RLS read policy leaks `email`, `ip`, `charge_id` to the anonymous public
**File:** `supabase/schema.sql`

- Policy `"read settled claims"` grants the **anon role SELECT on all columns** of every settled claim. All API reads go through the service role (which bypasses RLS), so this policy is pure attack surface: anyone with the project URL + anon key can dump the whole table — emails + IPs of every user.
- Same class of issue: `/api/my-claim` returning `ip`/`charge_id` (fixed in C1).

**Fix applied:** policy dropped; RLS stays enabled with **no public policies** (service role only). Migration note: re-run `supabase/schema.sql` on the project.

### C4. Founder-tier + rate-limit + position races (check-then-insert)
**Files:** `api/free-claim.js`, `api/create-checkout.js`, `api/webhooks/bachs.js`

- FOUNDER_LIMIT (200 free claims): `count()` check then `insert()` — concurrent requests all read `199` → unlimited free claims past the limit. The "founder tier" gate and its scarcity marketing can be trivially broken.
- IP/day limit (3/day): same TOCTOU race + `x-forwarded-for` / `x-real-ip` are client-suppliable headers (spoofable depending on platform/CDN) → scripted abuse bypasses it entirely.
- `position` (`unique`) = `count + 1` in both free-claim and webhook → concurrent claims collide on the unique index → 500s and lost rank slots.

**Fix applied:** `founder_claim_slot()` atomic Postgres function (advisory lock + count + insert in one transaction) added to `schema.sql` and called when available (graceful fallback keeps current behavior until the SQL is applied); position assignment retries on unique violations; IP parsing now validates the extracted value. **Real DDoS resistance still needs edge rate limiting** (Vercel WAF / Cloudflare) — see D1.

### C5. Payment race — money captured, claim never stored
**Files:** `api/create-checkout.js`, `api/webhooks/bachs.js`

- Order today: create Bachs session → then insert the pending claim. If the insert fails (or is merely slow) and the customer pays fast, the `collection.succeeded` webhook updates **0 rows**, the event is marked processed (dedupe), and the claim is stuck `pending` forever — **customer paid, got nothing**, no reconciliation path.
- Same for the reverse order failure: session orphaned with no claim.

**Fix applied:** claim row is inserted **before** the Bachs session (then updated with `checkout_id`; row is deleted if session creation fails); webhook stores unmatchable `collection.succeeded` events in a new `pending_fulfilments` table; `/api/claim-status` replays them on poll (lazy reconciliation). Add a proper idempotent retry job for production.

---

## 🟠 HIGH

### H1. Unauthenticated write endpoints → DDoS / cost-amplification / table flooding
- **`/api/upload-url`** — no auth, no rate limit: anyone mints **unlimited** signed upload URLs (1 MB each) → storage-fill and bandwidth-bill DoS. The `owner` param **skips the identity check entirely** (undocumented backdoor). Signed-URL PUTs let the client set the stored `Content-Type`, so an attacker can serve `text/html` from the trusted `*.supabase.co` bucket domain → phishing/XSS on a trusted origin.
  **Fix applied:** `owner` must now match an existing claim's email (verified server-side); per-IP daily mint cap (12/day, `upload_mints` table). **Also recommended:** storage-side transform/size rules + content sniffing, object-count quota alerts.
- **`/api/heartbeat`** — unauthenticated; each call = upsert + range scan + delete scan (3× write amplification). Flooding unique session IDs bloats `presence` between prunes. **Fix applied:** online count via `count exact head` (no row fetch).
- **`/api/visit`** — unauthenticated counter → trivially inflated stats. Also **functionally broken**: `.update({ value: { inc: 1 } })` is not valid PostgREST for a `bigint` — the endpoint 500s in production and `totalVisits` never moves. **Fix applied:** atomic `bump_stat()` RPC with read-modify-write fallback.
- **`/api/claims` without `macro`** — returns the **entire table**, no limit, no cache: cheap request → O(n) DB scan + unbounded JSON. Bot-hammering this = classic cost-amplification DoS. **Fix applied:** hard row cap + 60 s in-memory cache on the macro-less dump.
- **`/api/summary`** — fetches **every row's country** and counts in JS per request. **Fix applied:** 30 s in-memory cache (same pattern as `worldmap.png`).

### H2. Attacker-controlled `success_url`/`cancel_url` (reflected `Origin`)
**File:** `api/create-checkout.js` — `success_url` is built from the request's `Origin` header. A non-browser client (or hostile site) gets a Bachs session whose post-payment redirect lands on a phishing clone ("payment failed, pay again"), and can mass-mint checkout sessions against your Bachs account. **Fix applied:** origin allowlist (`ALLOWED_ORIGINS` env, defaults to the request host).

### H3. `ILIKE` wildcard injection
Every `.ilike('name'/'email', …)` passes user text as a LIKE pattern: `name = '%'` matches **everyone** (blocks/claims-collides all identities), `%`/`_` probe for registered emails. **Fix applied:** `%`/`_`/`\` escaped in all identity lookups (`lib/validate.js`).

### H4. Cross-site form POST (no CSRF/origin check on writes)
No `Access-Control-Allow-Origin` headers anywhere (good), but browsers still **execute** simple cross-site form POSTs (the body parses as JSON on Vercel) — a hostile page can create claims/checkout sessions using visitors' browsers. **Fix applied:** mutation endpoints reject requests whose `Origin` header is present and not allowlisted.

---

## 🟡 MEDIUM

- **M1. Error-message leakage** — raw Supabase/DB errors (`e.message`) echoed to clients (schema details, constraint names). *Partially kept for debuggability; recommend generic messages + server-side logging.*
- **M2. No content moderation for photos** — public map + anonymous uploads = illegal-imagery risk (moderation/abuse-report flow needed before launch).
- **M3. `web`/`social` stored free-form** — currently only shown as text (safe), but if ever rendered as `<a href>` a `javascript:` URL becomes clickable XSS. Validate scheme (`https:` only) before ever linking them.
- **M4. Webhook has no `status='pending'` guard on success** — a late `collection.succeeded` can resurrect an `expired` claim (arguably correct; flagging for review).
- **M5. `position` gaps/dupes across free-claim vs webhook paths** — both compute `count+1`; the atomic slot function fixes this once applied.
- **M6. Shared-IP collateral damage** — Nigeria is CGNAT-heavy (millions behind carrier NAT). A 3-per-day **IP** limit will block innocent users and *not* stop attackers (header spoofing). Consider per-email + device-token limits.

## 🔵 LOW / HYGIENE

- **L1. `node_modules` committed** (1,980 files, incl. supabase-js docs) — repo bloat + supply-chain surface. **Fixed:** untracked + `.gitignore` added (`npm install && npm test` still works — tests stub Supabase).
- **L2. No security headers / CSP** — **Fixed:** CSP meta + `vercel.json` headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
- **L3. `/api/claim?checkout_id=`** returns any claim by checkout id — ids are Bachs-random; fields are non-sensitive. Acceptable.
- **L4. Git history scanned** — no tokens/keys/service-role keys ever committed. ✅
- **L5. Webhook signature verification** is correctly done (HMAC-SHA256, `timingSafeEqual`, 5-min tolerance, event-id dedupe). ✅

---

## DDoS / availability summary (the "attack points")

| Vector | Endpoint | Today | After this patch |
|---|---|---|---|
| Storage/bandwidth bill flood | `/api/upload-url` | unlimited 1 MB uploads | 12 mints/IP/day (needs edge IP trust) |
| DB write flood | `/api/heartbeat`, `/api/visit` | unlimited, write-amplified | unchanged* (see below) |
| Full-table scan amplification | `/api/claims`, `/api/summary` | O(n) per request | capped + 30–60 s cache |
| Founder-tier race flood | `/api/free-claim` | TOCTOU bypass | atomic slot fn (after SQL migration) |
| Checkout session flood (Bachs quota) | `/api/create-checkout` | unlimited | origin gate only |
| L7 volumetric (any endpoint) | all | platform-only | **still needs Vercel WAF / Cloudflare rate limiting + bot protection — serverless code cannot self-defend against raw volume** |

\* heartbeat/visit: add per-IP request caps at the edge; an app-level cap is meaningless against spoofed IPs.

## Deploy checklist
1. Apply the updated `supabase/schema.sql` (drops the public read policy, adds `bump_stat()`, `founder_claim_slot()`, `pending_fulfilments`, `upload_mints`).
2. Set `ALLOWED_ORIGINS=https://yourdomain` in env.
3. Enable Vercel WAF/attack-challenge or front with Cloudflare; add rate limits on `/api/*`.
4. Rotate the GitHub PAT that was shared in chat (it is burned) — and never paste service-role keys anywhere.
5. Run `npm install && npm test` (suite updated for the new security behaviors).
