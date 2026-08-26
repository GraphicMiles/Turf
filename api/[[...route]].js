/* ==========================================================================
   api/[[...route]].js — THE single Vercel serverless function.
   Vercel's Hobby plan caps a project at 12 functions; this repo has 16
   endpoints. This optional catch-all routes /api/<path> to the handler
   module in /functions/ (see lib/routes.js) — one deployed function,
   identical URL space, zero frontend changes.
   ========================================================================== */
const ROUTES = require('../lib/routes.js');

exports.default = async (req, res) => {
  const rel = String(req.url || '')
    .split('?')[0]
    .replace(/^\/api\/?/, '')
    .replace(/\/+$/, '')
    .toLowerCase();

  if (!rel) {
    return res.status(200).json({ ok: true, service: 'turf-f', endpoints: Object.keys(ROUTES).sort() });
  }

  const name = ROUTES[rel];
  if (!name) {
    return res.status(404).json({ error: 'no such endpoint', available: Object.keys(ROUTES).sort() });
  }

  const handler = require('../functions/' + name + '.js').default; /* eslint-disable-line global-require */
  return handler(req, res);
};
