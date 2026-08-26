# TURF F. 🌍

> **Everyone has a piece on Earth. Claim yours for ₦100.**
> *(F. — as in fun. Also flex, fam, for real — you decide.)*

A living map of people on Earth — not roads, cities, or businesses. A map of humans and what they've created. Zoom from the whole world down to individuals:

**WORLD → REGION → COUNTRY → CITY GRID → PEOPLE**

- **Explore the map** — pan, pinch, zoom. Tap any person to see their turf card: name, field, city, bio, featured creation, and their TURF F. #.
- **🎲 Take me somewhere** — the camera flies to a random person on Earth. Discover the human internet.
- **People by Country** — a race, not a ranking: how many people are on the turf per country.
- **Claim your turf — ₦100** — name, bio, field, country, city, one project, links. Your spot is placed at city/region level with randomized position (no precise coordinates ever shown).
- **Multiple spots** — 1 · ₦100, 5 · ₦500, 10 · ₦1,000 (max 10 per person, adjacent where possible).

## Design system

Stark Mono structure + Comic Pop colors — high-contrast ink linework (`2.5px solid #1e272e`), monospaced data tags, vibrant accents (Comic Red `#ff4757`, Tuesday Orange `#ffa502`, Spring Mint `#2ed573`, Sunshine Yellow `#ffd32a`). Structurally responsive: full-map layout with side dock on desktop; compact top bar, bottom-sheet panels, and small controls on mobile.

## The world

A stylized 10×10 macro grid (10,000 spots). Each macro cell is a country/region; each country contains a 10×10 local grid of person spots. People are deterministic (seed `0x5EED01`) — the same world on every load. This static build is a 100:1 preview of the 1,000,000+ person map; claims persist in-memory for the session.

## Run

```bash
python3 -m http.server 8080
# or: npx serve .
```

## Repository structure

```
├── index.html   # Map app: topbar, canvas, intro, dock (person / claim / countries)
├── style.css    # Design system + map/panel styles + responsive rules
├── app.js       # World data, canvas map engine (pan/zoom/LOD), panels, claim logic
└── README.md
```
