/* Shared route map: URL path under /api/ → module name in /functions/.
   Used by api/[[...route]].js (the single Vercel serverless function) and
   server.js (local dev). Keep the URL space stable — the frontend fetches
   these paths literally. */
module.exports = {
  'claim': 'claim',                 /* GET ?checkout_id= — claim after payment (map era) */
  'claims': 'claims',               /* GET ?macro= — settled claims (map era) */
  'claim-mode': 'claim-mode',       /* GET — founder tier status (map era) */
  'claim-status': 'claim-status',   /* GET ?checkout_id= — poll payment status */
  'create-checkout': 'create-checkout', /* POST — map-era Bachs checkout */
  'free-claim': 'free-claim',       /* POST — founder free claim (map era) */
  'heartbeat': 'heartbeat',         /* POST — presence (map era) */
  'my-claim': 'my-claim',           /* GET/POST — My Spot: edit code or email+name */
  'summary': 'summary',             /* GET — map-era aggregates */
  'upload-url': 'upload-url',       /* POST — signed media upload URLs (all kinds) */
  'visit': 'visit',                 /* POST — visit counter */
  'worldmap': 'worldmap',           /* GET .png — map bitmap (map era) */
  'ladder': 'ladder',               /* GET — ranked ladder rows + meta */
  'ladder-checkout': 'ladder-checkout', /* POST — join/overtake with server-fixed price */
  'spot-post': 'spot-post',         /* GET/POST/DELETE — media feed per spot */
  'webhooks/bachs': 'bachs',        /* POST — payment webhook (source of truth) */
};
