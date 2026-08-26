#!/usr/bin/env node
/* ==========================================================================
   server.js — zero-dependency local dev server ("npm start").
   Serves the static site + mounts the api/ functions exactly like Vercel:
     GET  /            → index.html (the ladder)
     GET  /map.html    → the archived world map
     ANY  /api/claim   → api/claim.js  (exports.default(req, res))
     ANY  /api/webhooks/bachs → api/webhooks/bachs.js
   Reads .env from the repo root (simple KEY=value parser, no dotenv needed).
   Production deploys on Vercel — this file is for local development only.
   ========================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const ROUTES = require('./lib/routes.js');

/* ---- tiny .env loader (before requiring the api modules) ---- */
(function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    raw.split('\n').forEach(line => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) return;
      let v = m[2].replace(/^['"]|['"]$/g, '');
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    });
  } catch (e) { /* no .env — fine */ }
})();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found: ' + p, 'text/plain');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}

async function runApi(fn, req, res, query) {
  /* Vercel-style response helpers on raw Node res: res.status(code).json(...) */
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => {
    const body = JSON.stringify(obj);
    res.writeHead(res.statusCode || 200, {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  };
  const originalEnd = res.end.bind(res);
  res.end = (body, ...rest) => {
    if (!res.headersSent) res.writeHead(res.statusCode || 200);
    return originalEnd(body, ...rest);
  };

  /* accumulate raw body (webhook signature needs it byte-exact) */
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  req.rawBody = raw.length ? raw : undefined;
  if (/json|urlencoded/i.test(String(req.headers['content-type'] || ''))) {
    const text = raw.toString('utf8');
    if (text) {
      try {
        req.body = JSON.parse(text);
      } catch (e) {
        if (/urlencoded/.test(String(req.headers['content-type']))) {
          req.body = Object.fromEntries(new URLSearchParams(text));
        } else req.body = {};
      }
    } else req.body = {};
  } else req.body = {};
  req.query = query;
  try {
    await fn(req, res);
  } catch (e) {
    send(res, 500, JSON.stringify({ error: 'unhandled: ' + e.message }));
  }
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const query = Object.fromEntries(u.searchParams.entries());
  const p = u.pathname;

  if (p === '/api' || p.startsWith('/api/')) {
    /* same routing as the deployed catch-all (lib/routes.js) */
    const rel = p.replace(/^\/api\/?/, '').replace(/\/+$/, '').toLowerCase();
    const name = ROUTES[rel];
    if (!name) return send(res, 404, JSON.stringify({ error: 'no such endpoint' }));
    const file = path.join(ROOT, 'functions', name + '.js');
    if (!fs.existsSync(file)) return send(res, 404, JSON.stringify({ error: 'handler missing' }));
    delete require.cache[require.resolve(file)];                 /* hot-reload on save */
    const fn = require(file).default;
    if (typeof fn !== 'function') return send(res, 500, JSON.stringify({ error: 'handler missing default export' }));
    return runApi(fn, req, res, query);
  }

  serveStatic(req, res, p);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  TURF F. — local dev server');
  console.log('  Ladder:   http://localhost:' + PORT + '/');
  console.log('  Old map:  http://localhost:' + PORT + '/map.html');
  console.log('  Supabase: ' + (process.env.SUPABASE_URL ? 'configured' : '❌ NOT configured (.env)'));
  console.log('  Bachs:    ' + (process.env.BACHS_API_KEY ? 'configured' : '❌ NOT configured (.env) — claims will 500'));
  console.log('  Webhook (register in Bachs portal): http://localhost:' + PORT + '/api/webhooks/bachs');
  console.log('  (Bachs cannot reach localhost — test webhooks on a deployed URL or via a tunnel)');
  console.log('');
});
