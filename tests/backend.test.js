#!/usr/bin/env node
/* Backend unit tests — run: npm test  (or node tests/backend.test.js)
   Stubs Supabase (require-cache injection) and Bachs (global fetch). */
const crypto = require('crypto');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* ---------- supabase stub ---------- */
let currentSupa = null;
const supaPath = require.resolve(path.join(ROOT, 'lib/supabase.js'));
require.cache[supaPath] = {
  id: supaPath, filename: supaPath, loaded: true,
  exports: () => { if (!currentSupa) throw new Error('SUPABASE not configured'); return currentSupa; },
};
function makeSupa(state) {
  function resolve(c, table) {
    if (table === 'stats') {
      if (c._update) return { error: null, data: null };
      if (c._ms) return { error: null, data: state.statValue != null ? { value: state.statValue } : null };
      return { error: null, data: null };
    }
    if (table === 'presence') {
      if (c._delete) return { error: null, data: null };
      if (c._gt) return { error: null, data: state.sessions.map(x => ({ session: x })) };
      if (c._upsert) return { error: null, data: null };
      return { error: null, data: null };
    }
    if (table === 'webhook_events') {
      if (c._insert) {
        const dup = state.dupEvents.has(c._insert.id);
        if (!dup) state.dupEvents.add(c._insert.id);
        return { error: dup ? { message: 'duplicate key value violates unique constraint' } : null, data: null };
      }
      return { error: null, data: null };
    }
    if (table === 'claims') {
      if (c._lte) return { error: null, data: state.top20 || [] };
      if (c._opts && c._opts.count && c._ipCheck) return { error: null, count: state.ipCount || 0 };
      if (c._opts && c._opts.count) return { error: null, count: state.settledCount };
      if (c._ilike && c._order) return { error: null, data: state.myClaims || [] };
      if (c._update && c._single) return { error: null, data: (state.myClaims && state.myClaims[0]) || null };
      if (c._update) { state.updates.push(c._update); return { error: null, data: null }; }
      if (c._ilike) return { error: null, data: state.existing ? { id: 'claim_x' } : null };
      if (c._insert) { state.lastInsert = c._insert; return { error: null, data: Object.assign({ id: 'claim_x' }, c._insert) }; }
      if (c._ms) return { error: null, data: state.single || null };
      if (c._countryOnly) return { error: null, data: state.countryRows || [] };
      return { error: null, data: state.rows };
    }
    return { error: null, data: null };
  }
  function chain(table) {
    const c = {};
    c.select = (cols, opts) => { c._opts = opts; if (cols === 'country') c._countryOnly = true; return c; };
    c.in = () => c;
    c.eq = (col) => { if (col === 'ip') c._ipCheck = true; return c; };
    c.gte = () => c;
    c.lte = () => { c._lte = true; return c; };
    c.gt = () => { c._gt = true; return c; };
    c.lt = () => c;
    c.order = () => { c._order = true; return c; };
    c.ilike = () => { c._ilike = true; return c; };
    c.limit = () => c;
    c.neq = () => c;
    c.update = r => { c._update = r; return c; };
    c.insert = r => { c._insert = r; return c; };
    c.upsert = () => { c._upsert = true; return c; };
    c.delete = () => { c._delete = true; return c; };
    c.single = () => { c._single = true; return c; };
    c.maybeSingle = () => { c._ms = true; return c; };
    c.then = res => Promise.resolve(resolve(c, table)).then(res);
    return c;
  }
  const storage = {
    from: () => ({
      stat: async () => ({ data: state.statObj || null, error: null }),
      getPublicUrl: p => ({ data: { publicUrl: 'https://cdn.example/people/' + p } }),
      createSignedUploadUrl: async p => ({ data: { signedUrl: 'https://cdn.example/upload?path=' + p, token: 't', path: p }, error: null }),
    }),
  };
  return { from: chain, storage, state };
}
function freshState(extra) {
  return Object.assign({
    settledCount: 0, ipCount: 0, rows: [], top20: [], countryRows: [], myClaims: [],
    statValue: null, sessions: [], dupEvents: new Set(), updates: [],
  }, extra || {});
}
const fakeRes = () => {
  const r = { code: 0, body: null };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.end = b => { r.body = b; return r; };
  r.setHeader = () => r;
  return r;
};

let pass = 0, fail = 0;
const T = (n, ok) => { if (ok) { pass++; console.log('PASS  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

(async () => {
  process.env.BACHS_API_KEY = 'sk_sandbox_test';
  process.env.BACHS_BASE_URL = 'https://sandbox-api.bachs.io';
  process.env.BACHS_WEBHOOK_SECRET = 'test_secret';
  const req_ = f => require(path.join(ROOT, f)).default;

  /* ---------- world-core ---------- */
  const wc = require(path.join(ROOT, 'world-core.js'));
  const b1 = wc.build(), b2 = wc.build();
  T('world: deterministic builds', b1.allPeople.length === b2.allPeople.length && b1.allPeople[0].name === b2.allPeople[0].name && b1.allPeople[0].id === b2.allPeople[0].id);
  T('world: every person has _i', b1.allPeople.every(p => typeof p._i === 'number'));
  const used = new Set(b1.allPeople.map(p => p._i));
  const c1 = wc.assignCells('NGA', 1, used);
  T('assignCells: 1 cell in NGA, unused', c1.length === 1 && !used.has(c1[0]));
  const c5fresh = wc.assignCells('NGA', 5, new Set());
  T('assignCells: 5 contiguous run (fresh macro)', c5fresh.length === 5 && c5fresh.every((v, k) => k === 0 || v - c5fresh[k-1] === 1));
  const c5u = wc.assignCells('NGA', 5, used);
  T('assignCells: 5 unique unused cells (run or scatter)', c5u.length === 5 && new Set(c5u).size === 5 && c5u.every(v => !used.has(v)));

  /* ---------- webhook: signature + position ---------- */
  const webhook = req_('api/webhooks/bachs.js');
  const sign = (raw, ts) => crypto.createHmac('sha256', 'test_secret').update(ts + '.' + raw).digest('hex');
  currentSupa = makeSupa(freshState({ settledCount: 5 }));
  const ts = String(Math.floor(Date.now() / 1000));
  const rawOk = JSON.stringify({ id: 'evt_1', type: 'collection.succeeded', created_at: '2026-08-26T00:00:00Z', data: { charge_id: 'ch_1', checkout_id: 'chk_1', status: 'succeeded' } });
  const whReq = (raw, t, sig) => ({ method: 'POST', rawBody: Buffer.from(raw), headers: { 'x-bachs-timestamp': t, 'x-bachs-signature': sig } });
  let r = await webhook(whReq(rawOk, ts, sign(rawOk, ts)), fakeRes());
  T('webhook: valid signature → 200', r.code === 200 && r.body.received === true);
  T('webhook: succeeded sets status paid + position 6', currentSupa.state.updates.length === 1 && currentSupa.state.updates[0].status === 'paid' && currentSupa.state.updates[0].position === 6);
  r = await webhook(whReq(rawOk, ts, sign(rawOk, ts)), fakeRes());
  T('webhook: duplicate event → duplicate:true', r.code === 200 && r.body.duplicate === true);
  currentSupa = makeSupa(freshState());
  r = await webhook(whReq(rawOk, ts, 'deadbeef'.repeat(8)), fakeRes());
  T('webhook: bad signature → 401', r.code === 401);
  const staleTs = String(Math.floor(Date.now() / 1000) - 3600);
  r = await webhook(whReq(rawOk, staleTs, sign(rawOk, staleTs)), fakeRes());
  T('webhook: stale timestamp → 401', r.code === 401);
  const rawFail = JSON.stringify({ id: 'evt_2', type: 'collection.failed', data: { checkout_id: 'chk_2' } });
  r = await webhook(whReq(rawFail, ts, sign(rawFail, ts)), fakeRes());
  T('webhook: collection.failed → 200', r.code === 200);

  /* ---------- claim-mode (founder tier) ---------- */
  const claimMode = req_('api/claim-mode.js');
  currentSupa = makeSupa(freshState({ settledCount: 199 }));
  r = await claimMode({ method: 'GET' }, fakeRes());
  T('claim-mode: 199 → free, 1 left', r.code === 200 && r.body.mode === 'free' && r.body.freeRemaining === 1);
  currentSupa = makeSupa(freshState({ settledCount: 200 }));
  r = await claimMode({ method: 'GET' }, fakeRes());
  T('claim-mode: 200 → paid, 0 left', r.code === 200 && r.body.mode === 'paid' && r.body.freeRemaining === 0);

  /* ---------- free-claim ---------- */
  const freeClaim = req_('api/free-claim.js');
  const body = { name: 'Raji', field: 'Music', country: 'NGA', city: 'Lagos', project: 'EP', spots: 1 };
  currentSupa = makeSupa(freshState({ settledCount: 199 }));
  r = await freeClaim({ method: 'POST', body, headers: { 'x-forwarded-for': '9.9.9.9' } }, fakeRes());
  T('free-claim: 199 → 200, free, position 200, 1 cell, macro set, ip set',
    r.code === 200 && r.body.status === 'free' && r.body.position === 200 && r.body.cells.length === 1 && /^\d-\d$/.test(r.body.macro) && r.body.ip === '9.9.9.9');
  currentSupa = makeSupa(freshState({ settledCount: 200 }));
  r = await freeClaim({ method: 'POST', body, headers: {} }, fakeRes());
  T('free-claim: 200 → 402 (tier full)', r.code === 402);
  r = await freeClaim({ method: 'POST', body: { ...body, spots: 99 }, headers: {} }, fakeRes());
  T('free-claim: bad spots → 400', r.code === 400);
  r = await freeClaim({ method: 'POST', body: { country: 'NGA' }, headers: {} }, fakeRes());
  T('free-claim: missing name → 400', r.code === 400);
  currentSupa = makeSupa(freshState({ settledCount: 5, existing: true }));
  r = await freeClaim({ method: 'POST', body, headers: {} }, fakeRes());
  T('free-claim: same name+email → 409', r.code === 409);
  currentSupa = makeSupa(freshState({ settledCount: 10, ipCount: 3 }));
  r = await freeClaim({ method: 'POST', body, headers: { 'x-forwarded-for': '1.2.3.4' } }, fakeRes());
  T('free-claim: 3 claims today → 429', r.code === 429 && /3 spots per IP per day/.test(r.body.error));

  /* ---------- create-checkout ---------- */
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ checkout_id: 'chk_test', checkout_url: 'https://checkout.bachs.io/c/test', status: 'open' }) });
  const createCheckout = req_('api/create-checkout.js');
  currentSupa = makeSupa(freshState({ settledCount: 250 }));
  r = await createCheckout({ method: 'POST', body: { ...body, spots: 5 }, headers: {} }, fakeRes());
  T('create-checkout: returns checkout_url', r.code === 200 && r.body.checkout_url.includes('checkout.bachs.io') && r.body.checkout_id === 'chk_test');
  T('create-checkout: pending claim stored with 5 cells', currentSupa.state.lastInsert && currentSupa.state.lastInsert.status === 'pending' && currentSupa.state.lastInsert.cells.length === 5);
  r = await createCheckout({ method: 'POST', body: { spots: 1 }, headers: {} }, fakeRes());
  T('create-checkout: missing name → 400', r.code === 400);
  currentSupa = makeSupa(freshState({ settledCount: 250, existing: true }));
  r = await createCheckout({ method: 'POST', body: { ...body, spots: 1 }, headers: {} }, fakeRes());
  T('create-checkout: same name+email → 409 before payment', r.code === 409);
  currentSupa = makeSupa(freshState({ settledCount: 250, ipCount: 3 }));
  r = await createCheckout({ method: 'POST', body: { ...body, spots: 1 }, headers: { 'x-forwarded-for': '1.2.3.4' } }, fakeRes());
  T('create-checkout: 3 claims today → 429', r.code === 429);
  global.fetch = realFetch;

  /* ---------- my-claim (email is the key) ---------- */
  const myClaim = req_('api/my-claim.js');
  const claimRow = { id: 'cl_1', name: 'Raji', email: 'raji@x.com', bio: 'old', status: 'free', position: 1, cells: [1555], country: 'NGA' };
  currentSupa = makeSupa(freshState({ myClaims: [claimRow] }));
  r = await myClaim({ method: 'GET', query: { email: 'RAJI@X.com' } }, fakeRes());
  T('my-claim GET: found by email (case-insensitive)', r.code === 200 && r.body.claims.length === 1 && r.body.claims[0].name === 'Raji');
  currentSupa = makeSupa(freshState({ myClaims: [] }));
  r = await myClaim({ method: 'GET', query: { email: 'nobody@x.com' } }, fakeRes());
  T('my-claim GET: 404 when unknown', r.code === 404);
  r = await myClaim({ method: 'GET', query: { email: 'nope' } }, fakeRes());
  T('my-claim GET: 400 bad email', r.code === 400);
  currentSupa = makeSupa(freshState({ myClaims: [claimRow] }));
  r = await myClaim({ method: 'POST', body: { email: 'raji@x.com', bio: 'new bio', project: 'New EP' } }, fakeRes());
  T('my-claim POST: edit saved', r.code === 200 && r.body.claim && r.body.claim.id === 'cl_1');
  currentSupa = makeSupa(freshState({ myClaims: [claimRow], existing: true }));
  r = await myClaim({ method: 'POST', body: { email: 'raji@x.com', name: 'SomeoneElse' } }, fakeRes());
  T('my-claim POST: name clash → 409', r.code === 409);

  /* ---------- upload-url ---------- */
  const uploadUrl = req_('api/upload-url.js');
  currentSupa = makeSupa(freshState({ settledCount: 5 }));
  r = await uploadUrl({ method: 'POST', body: { name: 'Raji', type: 'image/webp', size: 200000 }, headers: {} }, fakeRes());
  T('upload-url: 200 + signed url + uuid path', r.code === 200 && typeof r.body.uploadUrl === 'string' && /^[0-9a-f-]{36}\.webp$/.test(r.body.path));
  currentSupa = makeSupa(freshState({ settledCount: 5 }));
  r = await uploadUrl({ method: 'POST', body: { name: 'Raji', type: 'text/plain', size: 100 }, headers: {} }, fakeRes());
  T('upload-url: non-image → 415', r.code === 415);
  currentSupa = makeSupa(freshState({ settledCount: 5 }));
  r = await uploadUrl({ method: 'POST', body: { name: 'Raji', type: 'image/webp', size: 99999999 }, headers: {} }, fakeRes());
  T('upload-url: >1MB → 413', r.code === 413);
  currentSupa = makeSupa(freshState({ settledCount: 5, existing: true }));
  r = await uploadUrl({ method: 'POST', body: { name: 'Raji', type: 'image/webp', size: 1000 }, headers: {} }, fakeRes());
  T('upload-url: duplicate identity → 409', r.code === 409);
  r = await uploadUrl({ method: 'POST', body: { name: 'Raji', owner: 'raji@x.com', type: 'image/webp', size: 1000 }, headers: {} }, fakeRes());
  T('upload-url: owner skips identity check', r.code === 200);

  /* ---------- live stats: visit + heartbeat + summary ---------- */
  const visit = req_('api/visit.js');
  const heartbeat = req_('api/heartbeat.js');
  currentSupa = makeSupa(freshState());
  r = await visit({ method: 'POST', body: {} }, fakeRes());
  T('visit: 200 + increments counter', r.code === 200 && r.body.ok === true);
  r = await heartbeat({ method: 'POST', body: { session: 'session_abc123' } }, fakeRes());
  T('heartbeat: 200 + online count', r.code === 200 && typeof r.body.online === 'number');
  currentSupa = makeSupa(freshState({ sessions: ['a', 'b', 'c'] }));
  r = await heartbeat({ method: 'POST', body: { session: 'session_abc123' } }, fakeRes());
  T('heartbeat: online = recent sessions', r.code === 200 && r.body.online === 3);
  r = await heartbeat({ method: 'POST', body: { session: 'bad' } }, fakeRes());
  T('heartbeat: bad session → 400', r.code === 400);

  const summary = req_('api/summary.js');
  currentSupa = makeSupa(freshState({
    settledCount: 250,
    countryRows: [{ country: 'NGA' }, { country: 'NGA' }, { country: 'JPN' }],
    top20: [{ position: 1, name: 'Raji', country: 'NGA', city: 'Lagos', field: 'Music', cells: [1555], status: 'free' }],
    statValue: 1234, sessions: ['a', 'b'],
  }));
  r = await summary({ method: 'GET' }, fakeRes());
  T('summary: total + byCountry + top20', r.code === 200 && r.body.total === 250 && r.body.byCountry.NGA === 2 && r.body.top20.length === 1 && r.body.top20[0].name === 'Raji');
  T('summary: visits + online + launchIso', r.body.totalVisits === 1234 && r.body.onlineNow === 2 && typeof r.body.launchIso === 'string');

  /* ---------- worldmap (PNG) ---------- */
  const worldmap = req_('api/worldmap.js');
  currentSupa = makeSupa(freshState({ settledCount: 1, rows: [{ cells: [5450], field: 'Music' }] }));
  r = await worldmap({ method: 'GET' }, fakeRes());
  const b = Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body || []);
  T('worldmap: 200 + valid PNG 100x100', r.code === 200 && b.length > 8 && b[0] === 0x89 && b.readUInt32BE(16) === 100 && b.readUInt32BE(20) === 100);
  {
    const zlib = require('zlib');
    let off = 8, idat = [];
    while (off < b.length) {
      const len = b.readUInt32BE(off); const type = b.slice(off+4, off+8).toString('ascii');
      if (type === 'IDAT') idat.push(b.slice(off+8, off+8+len));
      off += 12 + len;
      if (type === 'IEND') break;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const px = (54*(1+400) + 1 + 50*4);   /* 5450 = NGA land, Music claim */
    T('worldmap: claimed pixel = field color', raw[px] === 255 && raw[px+1] === 71 && raw[px+2] === 87);
    const px2 = (54*(1+400) + 1 + 45*4);  /* empty NGA cell = plain cream */
    T('worldmap: empty land = plain cream', raw[px2] === 255 && raw[px2+1] === 248 && raw[px2+2] === 238);
  }

  /* ---------- claims?macro ---------- */
  const claims = req_('api/claims.js');
  currentSupa = makeSupa(freshState({ settledCount: 1, rows: [{ name: 'Raji', cells: [1555], macro: '4-7' }] }));
  r = await claims({ method: 'GET', query: { macro: '4-7' } }, fakeRes());
  T('claims?macro: 200 + array', r.code === 200 && Array.isArray(r.body));

  console.log(fail === 0 ? `\nALL ${pass} BACKEND CHECKS PASSED` : `\n${fail} BACKEND CHECKS FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
