# Bachs Integration — Research & Plan for Turf

> Researched from [docs.bachs.io](https://docs.bachs.io) on 2026-08-26.
> Goal: wire the ₦100 / ₦500 / ₦1,000 "Claim your turf" flow to real payments, with fulfillment that actually persists.

---

## TL;DR — is Bachs a good fit?

**Yes.** It's built exactly for this: small African digital products, one-time NGN sales,
a hosted/overlay checkout (you never touch card data), local payment methods (NGN bank
transfer + local cards), a real sandbox, and webhook-driven fulfillment. For Turf the
**overlay checkout** is the right shape because it keeps the buyer on the map — no
redirect away from the product.

The one structural consequence: **Turf is currently a static site.** Bachs requires a
small server-side component (to hold the secret key, create the checkout session, and
receive webhooks). You also need **persistent storage** for claims — today claims are
in-memory and vanish on refresh. Both are prerequisites, detailed in [§9](#9-what-turf-must-change).

---

## 1. Key facts

| Thing | Value |
|---|---|
| Sandbox base URL | `https://sandbox-api.bachs.io` |
| Production base URL | `https://api.bachs.io` |
| Checkout host (where customers pay) | `https://checkout.bachs.io` |
| Overlay SDK | `<script src="https://checkout.bachs.io/bachs.js">` (or `npm i @bachs/js`) |
| Auth | `Authorization: Bearer <key>` |
| Sandbox key prefix | `sk_sandbox_…` (available at signup, no real money) |
| Live key prefix | `sk_live_…` (requires verification) |
| Money format | **Decimal string** at currency precision, e.g. `"100.00"` + `"NGN"`. Never minor units. |
| Primary currencies | `USD` and `NGN` (Turf → use `NGN`) |
| ID prefixes | `cust_`, `prod_`, `chk_`, `inv_`, `ch_`, `evt_`… |

**Key rules from the docs (agent instructions):**
- Build against the sandbox first; going live is a **key + base-URL swap**.
- Treat the **webhook** (e.g. `collection.succeeded`) as the source of truth for
  fulfillment — **never** the client redirect or the browser event.
- Amounts are always decimal strings paired with an ISO-4217 currency.

---

## 2. API keys & scopes

- Created in the dashboard → **Developer section → API Keys → "Create secret key."**
- Keys are **scoped** (`<resource>:<action>`, e.g. `payments:write`, `webhooks:write`,
  `products:write`). Grant the minimum your integration needs.
- **One active key per environment.** Sandbox and production are fully isolated
  (balances, customers, webhook endpoints, keys — none shared).
- Keep keys **server-side only**, in env vars. Never in the browser, git, or logs.

Scopes Turf's backend needs:
- `products:write` / `products:read` — create & read the three turf products
- `payments:write` — create checkout sessions
- `webhooks:write` / `webhooks:read` — manage the webhook endpoint (or do it once in the dashboard)

---

## 3. Products (define the catalog once)

A **product** = name + `price_type` + `amount` + `currency`. For Turf, three one-time
products (no `billing_cycle` = one-time purchase):

| Product | Price |
|---|---|
| 1 turf spot | `"100.00"` NGN |
| 5 turf spots | `"500.00"` NGN |
| 10 turf spots | `"1000.00"` NGN |

`POST /v1/products` (requires `products:write`):

```bash
curl https://sandbox-api.bachs.io/v1/products \
  -H "Authorization: Bearer $BACHS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "1 Turf Spot",
    "description": "Claim one square on the map, forever.",
    "price": { "price_type": "fixed", "amount": "100.00", "currency": "NGN" }
  }'
```

> Alternative: skip products entirely and charge a **raw amount** at checkout time with
> `"pricing": { "currency": "NGN", "amount": "100.00" }`. Products are cleaner for
> reporting/reconciliation, so they're recommended — but raw pricing is valid if you want
> zero catalog setup. Exactly **one** of `product_cart` or `pricing` per session.

---

## 4. The checkout flow (recommended: overlay)

Two ways to run the same session. **Overlay** keeps the customer on the page (best for Turf).

### Step 1 — Create the session (server-side, secret key)

```bash
POST https://sandbox-api.bachs.io/v1/checkout-sessions
Authorization: Bearer $BACHS_API_KEY
Content-Type: application/json

{
  "product_cart": [ { "product_id": "prod_1spot", "quantity": 1 } ],
  "customer": { "email": "customer@example.com", "name": "Raji" },
  "success_url": "https://turf.example.com/?checkout=success",
  "cancel_url":  "https://turf.example.com/?checkout=cancel"
}
```

Response:

```json
{
  "checkout_id": "chk_2N3o4P5q6R7s8T9u",
  "checkout_url": "https://checkout.bachs.io/c/V8xQ2mZpLj9RfTa",
  "status": "open",
  "expires_at": "2026-08-27T13:00:00Z",
  "created_at": "2026-08-26T12:00:00Z"
}
```

> The amount/currency are **fixed on your server** here. The browser cannot change what
> the customer pays. Add an `Idempotency-Key` header on this POST so retries are safe.

### Step 2 — Open the overlay (browser)

```html
<script src="https://checkout.bachs.io/bachs.js"></script>
<script>
  Bachs.Initialize({
    onEvent: (event) => {
      switch (event.type) {
        case "checkout.ready":     hideLoading();      break;
        case "checkout.completed": showSuccess(event.data.reference); // UI only — fulfil on webhook
        case "checkout.failed":    showRetry();        break;
        case "checkout.expired":   promptRestart();    break;
        case "checkout.closed":    resetButton();      break;
        case "checkout.error":     console.error(event.data.message);
      }
    },
  });

  // On "Place me on the turf" click:
  async function pay() {
    const { checkout_url } = await fetch("/api/create-checkout", {
      method: "POST",
      body: JSON.stringify({ tier: "1", email: "customer@example.com", name: "Raji" })
    }).then(r => r.json());

    Bachs.Checkout.open({ checkoutUrl: checkout_url });
  }
</script>
```

`Bachs.Checkout.open()` options:
- `checkoutUrl` (or just its `token` segment) — required
- `options.showCloseButton` (default `true`)
- `options.autoCloseOnComplete` (default `true`, closes ~1.2s after success)

Overlay UI events (drive **UI only**, not fulfillment):
`checkout.opened / loaded / ready / completed / failed / expired / closed / error`.

**Hosted-page alternative** (zero JS): after Step 1, just `302` the customer to
`checkout_url`; Bachs redirects back to `success_url?checkout_id=…`. Simpler, but the
buyer leaves the map.

### Step 3 — Fulfil on the webhook (the real "claim")

Bachs posts `collection.succeeded` to your endpoint. **That** is where you mark the
turf spot as claimed. See §6.

---

## 5. Payment methods & fees (NGN-focused)

### Methods available for one-time NGN
| Method | Currencies | Fee |
|---|---|---|
| **Bank transfer** | NGN | **1.5%, capped at ₦2,000** ← cheapest for small amounts |
| **Local card** (NGN Visa/MC) — *beta* | NGN | 2% |
| Card (international) | USD, NGN | 5% + $0.40 (+1.5% if non-US-issued) |
| Mobile money (other African markets) | GHS/KES/etc. | 3.5% |
| Crypto (USDT/USDC) | stablecoins | 1.5% |

> A method can be enabled on your account and still not appear on a checkout if the
> amount is below that currency's minimum. For a ₦100 charge, **bank transfer is the
> lowest-fee path** (1.5% = ₦1.50).

### Turf unit economics (net you receive per sale)
| Tier | Pay via bank transfer (1.5%) | Net |
|---|---|---|
| ₦100 | −₦1.50 | **₦98.50** |
| ₦500 | −₦7.50 | **₦492.50** |
| ₦1,000 | −₦15.00 | **₦985.00** |

Other fees that matter:
- **Withdrawal (NGN → bank): ₦100 flat** per withdrawal. Fine at volume, but on a tiny
  early balance it's a large fraction — batch withdrawals.
- **NGN settles immediately** (no 1–2 day window). USD cards settle in 2 days.
- No setup fee, no monthly fee. Refunds: no Bachs fee. Chargebacks: $15 each.

---

## 6. Webhooks — fulfillment + security

**Why:** the buyer can close the tab after paying but before your JS runs, so the
redirect / `checkout.completed` event is not reliable. The webhook is the contract.

### Set up
1. Dashboard → **Developer Portal → Webhooks → Add destination** (or
   `POST /v1/webhook-endpoints` with `webhooks:write`). You get a **signing secret**.
2. Subscribe to (minimum for Turf):
   - `collection.succeeded` ← fulfil the claim here
   - `collection.failed`, `collection.underpaid` ← surface a retry / "underpaid" state
   - `checkout.expired` ← nudge the customer to restart

### Signature verification (do this before trusting any payload)
Each delivery includes two headers:
- `X-Bachs-Timestamp` — Unix seconds
- `X-Bachs-Signature` — `HMAC-SHA256("{timestamp}.{raw_body}")` in hex

**Read the raw body before JSON-parsing** (re-serializing breaks the hash). Reject
deliveries older than ~300s. Use constant-time compare. Node:

```js
const crypto = require("crypto");

function verifyBachsSignature(rawBody, secret, tsHeader, sigHeader, tol = 300) {
  const ts = parseInt(tsHeader, 10);
  if (Math.abs(Date.now() / 1000 - ts) > tol) return false;
  const expected = crypto.createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`, "utf8").digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader));
}
```

### `collection.succeeded` payload
```json
{
  "id": "evt_3ab4e0d5d2",
  "type": "collection.succeeded",
  "created_at": "2026-08-26T12:04:00Z",
  "organization_id": "acct_7KpQ2mNv4XbR9dLc",
  "data": {
    "charge_id": "ch_1a2b3c4d5e6f",
    "checkout_id": "chk_2N3o4P5q6R7s8T9u",
    "status": "succeeded",
    "amount": "100.00",
    "currency": "NGN"
  }
}
```

**Delivery is at-least-once** → dedupe on `id` (persist seen event ids) and make your
fulfillment idempotent (e.g. "claim spot for `checkout_id` X" is safe to run twice).

Fulfillment logic for Turf:
1. Verify signature.
2. If `type === "collection.succeeded"`, look up the pending claim by `checkout_id`.
3. Atomically mark the spot(s) claimed (write to DB). If already fulfilled, return 200 and stop.
4. Respond `200` fast (do the work synchronously or push to a queue).

---

## 7. Sandbox testing

- Sandbox is a **separate deployment**: own balance, customers, webhook endpoints, keys.
  Nothing leaks to production and vice-versa.
- Use `https://sandbox-api.bachs.io` + an `sk_sandbox_…` key. Test cards / a test-card
  panel are available in the sandbox dashboard and in the live demo.
- **Try it before building:** [snapkit.bachs.io](https://snapkit.bachs.io) is a storefront
  running entirely on the sandbox (one-time, subscriptions, trials, pay-what-you-want,
  overlay + hosted, test card, no real money).
- Local webhook testing exists (Developer Portal → **Local Testing**) so you can receive
  events on your machine without ngrok/tunnels.
- End-to-end sandbox test for Turf: create 1 product → create session → open overlay →
  pay with a test card / bank-transfer simulation → confirm your webhook receives
  `collection.succeeded` → confirm the spot flips to claimed.

---

## 8. Go live (KYC) — one-time verification

Building in sandbox doesn't require it; **accepting real money does.** Three things:
1. **Product** — website/social link, what it is, category, support email.
2. **Identity** — hosted check via **Smile ID** (government ID + selfie). Bachs doesn't
   store your documents.
3. **Withdrawal account** — bank account whose name matches your identity (or your
   registered company name). Registered businesses also submit registration + directors.

Most reviews finish within ~48 hours. Going live afterwards is literally **swapping the
base URL + key** (`sk_live_…` / `api.bachs.io`); client code is unchanged because the
session's `checkout_url` already carries the environment.

---

## 9. What Turf must change

Turf is a static `index.html / app.js / style.css` site. To integrate Bachs you need:

**A. A small backend** (Node/Express, or serverless functions) exposing:
- `POST /api/create-checkout { tier, email, name }`
  → validates tier, calls `POST /v1/checkout-sessions` with the secret key,
  stores a *pending claim* (`{ checkout_id, customer, tier, status: "pending" }`),
  returns `{ checkout_url }`.
- `POST /api/webhooks/bachs`
  → reads raw body, verifies `X-Bachs-Signature`, on `collection.succeeded` finds the
  pending claim by `checkout_id`, **marks it claimed**, returns 200.
- (optional) `GET /api/claim/:checkoutId` for the browser to poll status after the
  overlay completes, as a UX fallback while the webhook confirms.

**B. Persistent storage** for claims. Today `claim()` mutates an in-memory array; a
refresh wipes it. You need a DB (SQLite is fine to start) storing each claim:
`{ id, name, field, country, city, project, links, spots, cells[], bachs_charge_id,
status, created_at }`. The map then renders from the DB.

**C. Frontend swap** in `app.js` `claim()`:
- Replace the "mock payment" path with `fetch("/api/create-checkout")` →
  `Bachs.Checkout.open({ checkoutUrl })`.
- On `checkout.completed`, show success **optimimistically**, then confirm via webhook /
  status poll. Only place the cells once confirmed.

**D. Env config** (server): `BACHS_API_KEY`, `BACHS_BASE_URL`
(`sandbox-api.bachs.io` in dev, `api.bachs.io` in prod), `BACHS_WEBHOOK_SECRET`,
and the three `prod_` ids.

Suggested minimal data model:
```
claims(id PK, name, field, country, city, project, web, social,
       spots INT, cells JSON, tier,
       checkout_id UNIQUE, charge_id,
       status ENUM('pending','paid','failed','expired'),
       created_at)
```

---

## 10. Security notes

- Secret key **only** on the server. The overlay iframe owns all card data (PCI stays
  with Bachs) — your page never sees card number/CVV/PIN.
- Verify every webhook signature; reject stale timestamps; dedupe by event `id`.
- Amount is set server-side at session creation → tamper-proof.
- Rotate keys if a leak is suspected (one active key per env).
- Use `Idempotency-Key` on the session-creation POST.

---

## 11. Open questions to confirm in the sandbox

- Exact **test card numbers** / bank-transfer test flow for NGN in the sandbox dashboard.
- Whether **NGN local cards** and **bank transfer** are both enabled on a fresh account
  by default, or if a method must be enabled in account settings
  (check `GET /v1/accounts/checkout/settings` → `enabled_payment_methods`).
- Minimum charge amount per method (a ₦100 checkout should be above it, but confirm).
- The exact `data.reference` field surfaced on `checkout.completed` for the success UI.
- Confirmation email / receipt behaviour if you want to send buyers a receipt.

---

## 12. Suggested build order

1. Stand up the tiny backend + SQLite; store claims.
2. Create the 3 products in the sandbox; capture `prod_` ids.
3. Add `/api/create-checkout` + the overlay (`bachs.js`) to Turf's claim dock.
4. Add `/api/webhooks/bachs` with signature verification; fulfil claims.
5. Run the sandbox end-to-end (test card + bank transfer).
6. Register a webhook endpoint; subscribe to the `collection.*` + `checkout.expired` events.
7. Do KYC; swap to `sk_live_…` / `api.bachs.io`; go live.

---

## 13. Founder tier, ranking & Top 20 (implemented)

### Founder tier (free → paid)
- The first **200 real claims** (free + paid, settled) are **free** — founder spots.
- `GET /api/claim-mode` → `{ mode: 'free'|'paid', count, limit: 200, freeRemaining }`.
- While free: `POST /api/free-claim` (no Bachs session; stored with `status='free'`).
- Once the count reaches 200, payment activates: claims go through `POST /api/create-checkout` + the Bachs overlay (₦100 / ₦500 / ₦1,000).
- The claim dock shows a **visual countdown 200 → 0** (big number + depleting bar). At 0 the dock flips to paid mode automatically.

### Position — ranked by oldest member
- Every settled claim gets a global `position` (unique): **oldest member = #1**.
  - free claims: assigned at insert (`position = settled count + 1`)
  - paid claims: assigned by the `collection.succeeded` webhook (same formula)
- Shown on the person card: `POSITION #47`.

### Top 20 — highest visibility
- Positions 1–20 get: a **gold ring on the map** (at cell zoom), a **⭐ TOP 20 badge** on the person card, and the **Top 20 leaderboard** (🏆 top-bar button — medals for 1–3, tap a row to fly to that person).

### Claim rules
- **Immutable:** once claimed, a user **cannot edit their spot information** (name, bio, city, project, links, field). There is no update endpoint by design — the claim is a permanent record. The only post-claim action is a **position upgrade** (phase 2, §14).
- **Rate limit:** each **IP address can pick at most 3 spots per day** (UTC), enforced at claim creation on both `free-claim` and `create-checkout` (4th attempt → `429`). The client IP is stored on each claim (`claims.ip` from `x-forwarded-for`).

### No accounts — the data IS the identity (dedupe)
- There is no login/registration. A claim's **name + email** is the identity, enforced by a unique index `claims_identity_uq (lower(name), lower(email))`.
- Same data already claimed → **409** "That name + email is already on the map" — checked *before* any Bachs session is created; the UI toasts and does **not** place the person.
- Email is optional in the form; when omitted it's derived from the name (`raj.a@turf.local`), so the same name is also blocked.

---

## 14. Phase 2 — paid position upgrade (spec, not yet built)

Pay to claim a higher spot — **no account needed, because the data is the identity**:

- **Price: ₦100 per position moved up.** `cost = (current position − target position) × ₦100`.
- **Ceiling:** the grid is 100×100 = 10,000 spots, so the most expensive possible move (bottom → top) is `10,000 × ₦100`.
- **Identity:** the user re-enters the **same name + email** as their existing claim — that's how the claim is found. No account, no login.
- **Renumbering:** moving from R to T shifts everyone in T…R−1 down by one (single transaction; `position` stays unique).
- **Payment:** variable-amount Bachs checkout — `POST /v1/checkout-sessions` with `pricing: { currency: 'NGN', amount: <cost> }`; the `collection.succeeded` webhook (carrying `checkout_id` + target) applies the shift.
- **Sketch endpoints:**
  - `POST /api/upgrade-position` — validates identity (existing settled claim), validates target (1 < target < current position, target not taken), computes cost, stores a pending upgrade row, creates the Bachs session, returns `checkout_url`.
  - Webhook: on success, apply the shift (update `position` for the mover + the shifted band), mark the upgrade paid.
- **Top 20 boundary:** an upgrade that lands someone inside the top 20 flips on the gold ring + leaderboard immediately.

---

## 15. Scaling & storage architecture

### Where each thing lives
| Data | Store | Notes |
|---|---|---|
| Claims (name, bio, position, cells, ip…) | Supabase **Postgres** `claims` | 1M rows ≈ 1–2 GB — trivial for Postgres. Every hot path is index-driven: `position` (unique), `macro`, `(ip, created_at)`, `(lower(name), lower(email))`, `checkout_id`. |
| **Images** (claim photos) | Supabase **Storage** — public bucket `people` | Object storage, never Postgres. Browser uploads via **service-role signed URLs** minted by `/api/upload-url` (the service key never reaches the browser). Public read CDN URL stored on the claim row (`image_url`). |
| World view (colors at zoom-out) | **`/api/worldmap.png`** — server-rendered 100×100 PNG (few KB), 30 s in-memory cache + CDN headers | Replaces "send the whole population to every browser". |
| Per-person detail | **`/api/claims?macro=mr-mc`** — one 10×10 sector | A sector holds ≤ ~100 claims. The map lazy-loads only visible sectors when zoom ≥ detail threshold, then caches them. |
| Aggregates (total, per-country, top 20) | **`/api/summary`** | Top 20 is a 20-row query on the unique `position` index. Per-country counts: direct query at ≤100k rows; materialized views `mv_country_counts` / `mv_top20` are in the schema, ready for a scheduled refresh beyond that. |

### Why this scales
- **No endpoint ever returns the whole population.** Page load = 1 tiny PNG + 1 small summary JSON. Detail arrives per sector, on demand, cached in the tab.
- **Cell allocation is O(macro), not O(world):** claim endpoints only query occupancy of the country's macros (≤ ~100 rows each), so a 10k-claim map and a 10M-claim map allocate the same cost.
- **Postgres comfortably holds the full vision:** 1,000,000 claims ≈ 1–2 GB; Supabase Pro (8 GB+) has 5× headroom, and PITR backups are automatic. No sharding needed.
- **Concurrency:** `position` unique index + retry-on-conflict keeps ranking consistent under parallel webhooks; the identity unique index makes dedupe race-proof; webhook dedupe via `webhook_events`.

### The grid itself
- Today: 100×100 = **10,000 spots** (the 100:1 preview). That ceiling is a product setting, not a DB limit.
- The full 1M map = 1000×1000 grid: same tables, same endpoints, `N = 1000`. Sectors stay 10×10 (10,000 sectors, each still ≤ ~100 claims); the world bitmap becomes 10×10 tiles (still a few KB each, fetched per visible tile).

### Images — pipeline & scale
1. Browser: resize to ≤512 px on the long edge, compress to **WebP q0.8** (~100–300 KB), preview shown in the claim dock.
2. `POST /api/upload-url` — validates (image/*, ≤1 MB, identity not taken) → mints a short-lived signed upload URL.
3. Browser `PUT`s the file **directly to Supabase Storage** — zero traffic through Vercel.
4. Claim endpoint verifies the object exists (`stat`) and stores the **public CDN URL** on the claim row.
5. Person card renders the photo (peep artwork remains the fallback for text-only claims).
- Claims are **immutable**, so image URLs never change — CDN caching is trivially safe.
- Cost at scale: 1M photos × ~200 KB ≈ 200 GB object storage; egress is the line item to watch. If it matters, the bucket can be swapped to **Cloudflare R2 (zero egress fees)** without touching the app (same S3-style URL model).

### Other "etc."
- **Abuse:** 3 claims/IP/day (429), identity dedupe (409), signed-only storage writes, webhook HMAC verification, Vercel/WAF in front of production.
- **Search** ("find my friend"): not built; the cheap path is a `pg_trgm` index on `name` + `GET /api/people?q=`.
- **Ops:** Supabase logs + Vercel function logs; Bachs portal shows webhook delivery health + replay.
- **Backups:** Supabase PITR (paid plans); `webhook_events` can be pruned nightly (30-day retention) — it's dedupe history only.

---

## 16. My Turf — email is the key to your spot

No accounts, no passwords: **the claim email is the key**.

- `GET /api/my-claim?email=…` — finds your settled claim(s) (case-insensitive). UI: **My Turf** (🔑 top bar) → enter email → "Find my spot".
- `POST /api/my-claim { email, …fields }` — owner edits their spot.
  - **Editable:** name (re-checked against the map for clashes), bio, field, city, project, web, socials, photo.
  - **Immutable:** the spot itself — cells, position, country, spot count. (Position changes happen via the phase-2 upgrade.)
- Photo changes go through the same signed-upload pipeline; `upload-url` accepts an `owner` email, which skips the identity-taken check (an owner re-uploading their own data is not a duplicate).
- Multiple claims on one email (allowed: 3/IP/day with different names): the UI edits the **newest** and notes the rest.
- Security note: anyone who knows/guesses the email can edit that profile. Deliberately simple per product decision — the upgrade path is a one-time OTP/magic-link sent to that email (schema-ready: add a `verify_code` column).

## 17. Country flags

- Source: [flagdownload.com](https://flagdownload.com/) — round flat PNGs, 128×128, one per country in `flags/` (42 files, ~300 KB, committed).
- **Map rendering:**
  - Every **empty land tile wears its country's flag** — at macro zoom each country box reads as its flag; zoom into a country and all 100 boxes show the flag; a claimed spot replaces its flag with the person (field color → initials → name).
  - World-zoom bitmap (`/api/worldmap.png`) uses each flag's average color (muted 62/38 toward cream, from `flags/palette.json`) so the low-res world still reads as a flag mosaic.
- **Lists:** country list, Top 20, person cards, and My Turf summaries show the round flag image (emoji fallback data still in `GEO` for toasts).
- Adding a country: drop `flags/CODE.png` + one entry in `flags/palette.json` (regenerate: average the opaque pixels).
