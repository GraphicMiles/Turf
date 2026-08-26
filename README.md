# TURF F. 🌍

> **Everyone has a piece on Earth. Claim yours — free while the countdown lasts.**
> *(F. = fun. Also flex, fam, for real — you decide.)*

A living map of people on Earth — not roads, cities, or businesses. A map of humans and what they've created. Zoom from the whole world down to individuals:

**WORLD → REGION → COUNTRY → CITY GRID → PEOPLE**

## Features

- **The map is the product** — full-viewport, pannable, zoomable world (10×10 macro regions × 10×10 person slots = 10,000 spots). Deterministic world, same everywhere.
- **Photos** — claimants can attach a photo (compressed to ≤512px WebP client-side, stored in Supabase Storage via signed upload URLs; the card renders it).
- **Country flags** — zoomed out, every country box shows its flag (flagdownload.com round PNGs in `flags/`, no initials). Zoomed in, flags are gone: plain boxes for empty spots, and claimed spots show the person's image **faint → clear as you zoom in** (photo, or generated peep art). Multi-box claims with a fitting image render as **one continuous image across the block**; otherwise the image repeats per box.
- **My Turf** — no accounts: your claim email is the key. Enter it (🔑 My Turf) to find your spot and edit your profile (name, bio, field, city, project, links, photo). The spot itself (cells/position/country) is immutable; moving up the ranking is the phase-2 upgrade.
- **Live stats** — hours since launch, total page visits, and online-now count (30s heartbeats, 90s window) in the intro card + HUD.
- **Scales by design** — page load is one tiny world bitmap (PNG) + one summary JSON; person detail is lazy-loaded per visible 10×10 sector (≤ ~100 rows); cell allocation is O(macro). See `docs/bachs-integration.md` §15.
- **Founder tier** — the first **200 claims are FREE** with a **visual countdown 200 → 0** in the claim dock. At 0, payment (Bachs) activates.
- **Position ranking** — every claim gets a global `POSITION #`, **oldest member = #1**.
- **Top 20 = highest visibility** — gold ring on the map, ⭐ badge on the card, trophy leaderboard (🏆 top-bar button), tap to fly.
- **Tap a person** → profile card: peep artwork, field, city, bio, featured creation, position.
- **🎲 Explore** — fly to a random person anywhere on Earth.
- **People by Country** — a race, not a ranking.

## Claim rules

- **No accounts.** The claim's **name + email is the identity** — same data can only claim once (409).
- **Immutable.** You cannot edit your spot information after claiming. The only post-claim action is a **position upgrade** (phase 2).
- **3 spots per IP per day** (UTC) — 4th attempt → 429.

### Position upgrade (phase 2, specified)

₦100 per position moved up: `cost = (current − target) × ₦100`, ceiling `10,000 × ₦100` (100×100 grid). Identity = same name+email. See `docs/bachs-integration.md` §14.

## Payments (Bachs)

- **Sandbox first**, live after KYC — going live is a key swap.
- **Overlay checkout** (`bachs.js`) — the card form stays inside Bachs' iframe; you never touch card data.
- **Webhook is the source of truth** (`collection.succeeded`, HMAC-SHA256 verified) — it also assigns the position.
- NGN: bank transfer 1.5% (cap ₦2,000), local cards 2%. Full breakdown in `docs/bachs-integration.md`.
- Without a backend (static preview), the site runs in **demo mode** — claims are placed locally, no payment.

## Stack

- **Vercel** — static site + serverless functions:
  - `POST /api/create-checkout` — Bachs session (paid tier) + stores pending claim
  - `POST /api/free-claim` — founder-tier claim (free)
  - `GET /api/claim-mode` — free/paid state + remaining founder spots (the live probe)
  - `GET /api/claim?checkout_id=` · `GET /api/claim-status?checkout_id=` — post-payment confirmation
  - `GET /api/claims?macro=mr-mc` — settled people for one 10×10 sector (lazy-loaded by the map)
  - `GET /api/claims` — all settled claims (demo/preview)
  - `GET /api/summary` — total, per-country counts, top 20
  - `GET /api/worldmap.png` — server-rendered world bitmap (few KB, 30 s cache)
  - `POST /api/upload-url` — mint a signed photo-upload URL (Supabase Storage; `owner` = the claim's email when editing)
  - `GET/POST /api/my-claim` — find & edit your spot by claim email (My Turf)
  - `POST /api/visit` · `POST /api/heartbeat` — live stats (visits counter, online-now presence)
  - `GET /api/summary` — totals, per-country counts, top 20, visits, online, launch time
  - `POST /api/webhooks/bachs` — signature-verified fulfilment (also assigns position)
- **Supabase** — Postgres `claims` (position, status, ip, macro, image_url, identity unique index) + `webhook_events` (dedupe) + public Storage bucket `people` for photos. Run `supabase/schema.sql`.
- `world-core.js` is shared by the browser **and** the server so cell allocation is identical everywhere.

## Deploy

1. Supabase: create a project → SQL Editor → run `supabase/schema.sql`.
2. Bachs: sign up → sandbox key + (optionally) 3 products for ₦100/₦500/₦1,000 → webhook endpoint pointing at `https://<your-vercel-app>/api/webhooks/bachs` (subscribe: `collection.succeeded`, `collection.failed`, `checkout.expired`).
3. Vercel: import this repo, set env vars from `.env.example`.
4. That's it — `api/` functions deploy automatically.

## Run locally

```bash
npm install          # @supabase/supabase-js
python3 -m http.server 8080   # static demo mode (no backend → local claims)
# or with functions:  npx vercel dev  (with .env filled in)
```

## Repository structure

```
├── index.html        # map app: topbar, canvas, intro, dock (person / claim / top20 / countries)
├── style.css         # Stark Mono + Comic Pop design system, structurally responsive
├── app.js            # map engine (pan/zoom/LOD), claim flow, ranking, Bachs wiring
├── world-core.js     # shared deterministic world + cell allocation (browser + server)
├── api/              # Vercel serverless functions (Bachs + Supabase)
├── lib/supabase.js   # service-role client
├── supabase/schema.sql
└── docs/bachs-integration.md   # full payment integration research + specs
```
