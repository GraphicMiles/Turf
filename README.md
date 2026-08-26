# TURF F. 🌍

> **Everyone has a piece on Earth. Claim yours — free while the countdown lasts.**
> *(F. = fun. Also flex, fam, for real — you decide.)*

A living map of people on Earth — not roads, cities, or businesses. A map of humans and what they've created. Zoom from the whole world down to individuals:

**WORLD → REGION → COUNTRY → CITY GRID → PEOPLE**

## Features

- **The map is the product** — full-viewport, pannable, zoomable world (10×10 macro regions × 10×10 person slots = 10,000 spots). Deterministic world, same everywhere.
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
  - `GET /api/claim-mode` — free/paid state + remaining founder spots
  - `GET /api/claim?checkout_id=` · `GET /api/claim-status?checkout_id=` — post-payment confirmation
  - `GET /api/claims` — settled claims for the map
  - `POST /api/webhooks/bachs` — signature-verified fulfilment
- **Supabase** — `claims` (position, status, ip, identity unique index) + `webhook_events` (dedupe). Run `supabase/schema.sql`.
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
