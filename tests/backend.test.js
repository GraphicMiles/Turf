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
    if (table === 'auth_attempts') {
      if (c._opts && c._opts.count && c._ipCheck) return { error: null, count: state.authAttempts || 0 };
      return { error: null, data: null };
    }
    if (table === 'ladder_entries') {
      if (c._opts && c._opts.count && c._head) return { error: null, count: state.ladderCount || 0 };
      if (c._insert) { state.lastEntry = c._insert; return { error: null, data: Object.assign({ id: 'e1' }, c._insert) }; }
      if (c._ms) return { error: null, data: state.ladderTarget || null };
      return { error: null, data: state.ladderRows || [] };
    }
    if (table === 'ladder_ledger') {
      if (c._insert) { state.lastLedger = c._insert; return { error: null, data: null }; }
      if (c._update) return { error: null, data: null };
      if (c._ms) return { error: null, data: state.lockedLedger || null };
      return { error: null, data: state.recentLedger || [] };
    }
    if (table === 'spot_posts') {
      if (c._opts && c._opts.count && c._head) return { error: null, count: state.postCount || 0 };
      if (c._insert) { state.lastPost = c._insert; return { error: null, data: Object.assign({ id: 'post_x' }, c._insert) }; }
      return { error: null, data: state.posts || [] };
    }
    if (table === 'claims') {
      if (c._codeCheck && c._ms) return { error: null, data: state.codeClaim || null };
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
    c.select = (cols, opts) => { c._opts = opts; if (opts && opts.head) c._head = true; if (cols === 'country') c._countryOnly = true; return c; };
    c.in = () => c;
    c.eq = (col) => { if (col === 'ip') c._ipCheck = true; if (col === 'edit_code_hash') c._codeCheck = true; return c; };
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
    settledCount: 0, ipCount: 0, rows: [], top20: [], countryRows: [], myClaims: [], codeClaim: null,
    statValue: null, sessions: [], dupEvents: new Set(), updates: [], authAttempts: 0,
    ladderCount: 0, ladderTarget: null, ladderRows: [], lockedLedger: null, recentLedger: [], lastLedger: null,
    postCount: 0, posts: [], lastPost: null,
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
  const webhook = req_('functions/bachs.js');
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
  const claimMode = req_('functions/claim-mode.js');
  currentSupa = makeSupa(freshState({ settledCount: 199 }));
  r = await claimMode({ method: 'GET' }, fakeRes());
  T('claim-mode: 199 → free, 1 left', r.code === 200 && r.body.mode === 'free' && r.body.freeRemaining === 1);
  currentSupa = makeSupa(freshState({ settledCount: 200 }));
  r = await claimMode({ method: 'GET' }, fakeRes());
  T('claim-mode: 200 → paid, 0 left', r.code === 200 && r.body.mode === 'paid' && r.body.freeRemaining === 0);

  /* ---------- free-claim ---------- */
  const freeClaim = req_('functions/free-claim.js');
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
  currentSupa = makeSupa(freshState({ settledCount: 199 }));
  r = await freeClaim({ method: 'POST', body, headers: { 'x-forwarded-for': '9.9.9.9' } }, fakeRes());
  T('free-claim: edit code issued once, hash stored (C1 fix)', r.code === 200 && /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(r.body.edit_code) && /^[0-9a-f]{64}$/.test(currentSupa.state.lastInsert.edit_code_hash));

  /* ---------- create-checkout ---------- */
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ checkout_id: 'chk_test', checkout_url: 'https://checkout.bachs.io/c/test', status: 'open' }) });
  const createCheckout = req_('functions/create-checkout.js');
  currentSupa = makeSupa(freshState({ settledCount: 250 }));
  r = await createCheckout({ method: 'POST', body: { ...body, spots: 5 }, headers: {} }, fakeRes());
  T('create-checkout: returns checkout_url', r.code === 200 && r.body.checkout_url.includes('checkout.bachs.io') && r.body.checkout_id === 'chk_test');
  T('create-checkout: pending claim stored with 5 cells', currentSupa.state.lastInsert && currentSupa.state.lastInsert.status === 'pending' && currentSupa.state.lastInsert.cells.length === 5);
  T('create-checkout: edit code issued once, hash stored', /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(r.body.edit_code) && /^[0-9a-f]{64}$/.test(currentSupa.state.lastInsert.edit_code_hash));
  r = await createCheckout({ method: 'POST', body: { spots: 1 }, headers: {} }, fakeRes());
  T('create-checkout: missing name → 400', r.code === 400);
  currentSupa = makeSupa(freshState({ settledCount: 250, existing: true }));
  r = await createCheckout({ method: 'POST', body: { ...body, spots: 1 }, headers: {} }, fakeRes());
  T('create-checkout: same name+email → 409 before payment', r.code === 409);
  currentSupa = makeSupa(freshState({ settledCount: 250, ipCount: 3 }));
  r = await createCheckout({ method: 'POST', body: { ...body, spots: 1 }, headers: { 'x-forwarded-for': '1.2.3.4' } }, fakeRes());
  T('create-checkout: 3 claims today → 429', r.code === 429);
  global.fetch = realFetch;

  /* ---------- my-claim (email is the key + prove_name) ---------- */
  const myClaim = req_('functions/my-claim.js');
  const claimRow = { id: 'cl_1', name: 'Raji', email: 'raji@x.com', bio: 'old', status: 'free', position: 1, cells: [1555], country: 'NGA', ip: '5.6.7.8', charge_id: 'ch_x', checkout_id: 'chk_x' };
  currentSupa = makeSupa(freshState({ myClaims: [claimRow] }));
  r = await myClaim({ method: 'GET', query: { email: 'RAJI@X.com' } }, fakeRes());
  T('my-claim GET: found by email (case-insensitive)', r.code === 200 && r.body.claims.length === 1 && r.body.claims[0].name === 'Raji');
  T('my-claim GET: no ip/email/charge/checkout leak (C1)', r.body.claims[0].ip === undefined && r.body.claims[0].email === undefined && r.body.claims[0].charge_id === undefined && r.body.claims[0].checkout_id === undefined);
  currentSupa = makeSupa(freshState({ myClaims: [] }));
  r = await myClaim({ method: 'GET', query: { email: 'nobody@x.com' } }, fakeRes());
  T('my-claim GET: 404 when unknown', r.code === 404);
  r = await myClaim({ method: 'GET', query: { email: 'nope' } }, fakeRes());
  T('my-claim GET: 400 bad email', r.code === 400);
  currentSupa = makeSupa(freshState({ myClaims: [claimRow] }));
  r = await myClaim({ method: 'POST', body: { email: 'raji@x.com', bio: 'new bio', project: 'New EP' } }, fakeRes());
  T('my-claim POST: no prove_name → 401 (C1 fix)', r.code === 401);
  r = await myClaim({ method: 'POST', body: { email: 'raji@x.com', prove_name: 'Wrong', bio: 'x' } }, fakeRes());
  T('my-claim POST: wrong prove_name → 401', r.code === 401);
  r = await myClaim({ method: 'POST', body: { email: 'raji@x.com', prove_name: 'raji', bio: 'new bio', project: 'New EP' } }, fakeRes());
  T('my-claim POST: edit saved with proof', r.code === 200 && r.body.claim && r.body.claim.id === 'cl_1');
  currentSupa = makeSupa(freshState({ myClaims: [claimRow], existing: true }));
  r = await myClaim({ method: 'POST', body: { email: 'raji@x.com', prove_name: 'Raji', name: 'SomeoneElse' } }, fakeRes());
  T('my-claim POST: name clash → 409', r.code === 409);

  /* ---------- my-claim via EDIT CODE (primary key) ---------- */
  const V = require(path.join(ROOT, 'lib/editcode.js'));
  T('editcode: normalize+hash deterministic, hex', V.hashEditCode('k7pm x2qf') === V.hashEditCode('K7PM-X2QF') && /^[0-9a-f]{64}$/.test(V.hashEditCode('AAAA-2222')));
  T('editcode: generated shape XXXX-XXXX, unambiguous chars', /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(V.generateEditCode()));
  const goodCode = 'ABCD-2345';
  const codeRow = Object.assign({}, claimRow, { id: 'cl_code', edit_code_hash: V.hashEditCode(goodCode) });
  currentSupa = makeSupa(freshState({ codeClaim: codeRow, myClaims: [codeRow] }));
  r = await myClaim({ method: 'POST', body: { code: goodCode } }, fakeRes());
  T('my-claim code: valid code unlocks (no patch → claim)', r.code === 200 && r.body.claim && r.body.claim.id === 'cl_code');
  T('my-claim code: no email/ip/hash leak', r.body.claim.email === undefined && r.body.claim.ip === undefined && r.body.claim.edit_code_hash === undefined);
  currentSupa = makeSupa(freshState({ codeClaim: codeRow, myClaims: [codeRow] }));
  r = await myClaim({ method: 'POST', body: { code: 'abcd 2345', bio: 'edited by code' } }, fakeRes());
  T('my-claim code: sloppy input + edit applies (200, claim returned)', r.code === 200 && r.body.claim && r.body.claim.id === 'cl_code');  currentSupa = makeSupa(freshState({}));
  r = await myClaim({ method: 'POST', body: { code: 'WRNG-CODE' } }, fakeRes());
  T('my-claim code: wrong code → 401', r.code === 401);
  currentSupa = makeSupa(freshState({ authAttempts: 5 }));
  r = await myClaim({ method: 'POST', body: { code: goodCode } }, fakeRes());
  T('my-claim code: 5 attempts today → 429', r.code === 429);
  r = await myClaim({ method: 'POST', body: { code: 'nope' } }, fakeRes());
  T('my-claim code: bad shape → 400', r.code === 400);

  /* ---------- security regressions (SECURITY_AUDIT.md) ---------- */
  const { cleanText, escapeIlike, isEmail } = require(path.join(ROOT, 'lib/validate.js'));
  T('validate: cleanText strips tags + control chars', cleanText('<img src=x onerror=alert(1)>Raji', 40) === 'img src=x onerror=alert(1)Raji' && cleanText('a\u0000b', 10) === 'ab');
  T('validate: cleanText caps length', cleanText('a'.repeat(500), 24).length === 24);
  T('validate: escapeIlike escapes wildcards (H3)', escapeIlike('a%b_c\\d') === 'a\\%b\\_c\\\\d');
  T('validate: isEmail accepts/limits', isEmail('raji@x.com') === true && isEmail('raji+tag@x.co') === true && isEmail('nope') === false && isEmail('a@b.c') === false && isEmail('x@' + 'y'.repeat(200) + '.com') === false);

  currentSupa = makeSupa(freshState({ settledCount: 5 }));
  r = await freeClaim({ method: 'POST', body: { name: 'Evil', field: 'Music', country: 'NGA', city: 'Lagos<img src=x onerror=alert(1)>', project: 'p'.repeat(999), spots: 1 }, headers: {} }, fakeRes());
  T('free-claim: XSS payload sanitized before storage (C2)', r.code === 200 && !/[<>]/.test(currentSupa.state.lastInsert.city) && currentSupa.state.lastInsert.project.length <= 48);
  currentSupa = makeSupa(freshState({ settledCount: 5 }));
  r = await freeClaim({ method: 'POST', body: { name: 'Evil2', field: 'Hacking', country: 'NGA', spots: 1 }, headers: {} }, fakeRes());
  T('free-claim: unknown field → 400', r.code === 400);
  currentSupa = makeSupa(freshState({ settledCount: 5 }));
  r = await freeClaim({ method: 'POST', body: { name: 'Evil3', field: 'Music', country: 'NGA', email: 'not-an-email', spots: 1 }, headers: {} }, fakeRes());
  T('free-claim: invalid email → 400', r.code === 400);

  /* ---------- upload-url ---------- */
  const uploadUrl = req_('functions/upload-url.js');
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
  T('upload-url: verified owner (email matches a claim) → 200', r.code === 200);
  currentSupa = makeSupa(freshState({ existing: true, codeClaim: { id: 'cl_code' } }));
  r = await uploadUrl({ method: 'POST', body: { name: 'Raji', code: 'ABCD-2345', type: 'image/webp', size: 1000 }, headers: {} }, fakeRes());
  T('upload-url: valid edit code verifies owner → 200', r.code === 200);

  /* ---------- ladder: rules + checkout + view ---------- */
  const L = require(path.join(ROOT, 'lib/ladder.js'));
  T('ladder: base 100, overtake 2×, validAmount bounds', L.basePrice() === 100 && L.overtakePrice(500) === 1000 && L.validAmount(100) === true && L.validAmount(99) === false && L.validAmount(10000001) === false);
  T('ladder: previewRank sorts by amount paid', L.previewRank([{ amount: 5000 }, { amount: 1000 }, { amount: 100 }], 2000, Date.now()) === 2 && L.previewRank([{ amount: 5000 }, { amount: 1000 }, { amount: 100 }], 9999, Date.now()) === 1);

  const ladderCheckout = req_('functions/ladder-checkout.js');
  global.fetch = async () => ({ ok: true, json: async () => ({ checkout_id: 'chk_l1', checkout_url: 'https://checkout.bachs.io/c/l1' }) });
  currentSupa = makeSupa(freshState());
  r = await ladderCheckout({ method: 'POST', body: { name: 'Big Spender', field: 'Music', country: 'NGA', amount: 2000 }, headers: {} }, fakeRes());
  T('ladder-checkout: join ₦2000 → 200, ledger locked', r.code === 200 && r.body.amount === 2000 && r.body.action === 'join' && currentSupa.state.lastLedger.amount === 2000 && currentSupa.state.lastLedger.status === 'locked' && !!r.body.edit_code);
  T('ladder-checkout: edit code hash stored on claim', /^[0-9a-f]{64}$/.test(currentSupa.state.lastInsert.edit_code_hash) && currentSupa.state.lastInsert.status === 'pending');
  r = await ladderCheckout({ method: 'POST', body: { name: 'Small', country: 'NGA', amount: 50 }, headers: {} }, fakeRes());
  T('ladder-checkout: below ₦100 → 400', r.code === 400);
  currentSupa = makeSupa(freshState({ ladderTarget: { claim_id: '11111111-2222-3333-4444-555555555555', amount: 500 } }));
  r = await ladderCheckout({ method: 'POST', body: { name: 'Challenger', country: 'NGA', target_claim_id: '11111111-2222-3333-4444-555555555555' }, headers: {} }, fakeRes());
  T('ladder-checkout: overtake → 2× target (₦1000)', r.code === 200 && r.body.amount === 1000 && r.body.action === 'overtake' && currentSupa.state.lastLedger.target_claim_id === '11111111-2222-3333-4444-555555555555');
  currentSupa = makeSupa(freshState({ ladderTarget: { claim_id: '11111111-2222-3333-4444-555555555555', amount: 500 }, lockedLedger: { id: 'lx' } }));
  r = await ladderCheckout({ method: 'POST', body: { name: 'Second', country: 'NGA', target_claim_id: '11111111-2222-3333-4444-555555555555' }, headers: {} }, fakeRes());
  T('ladder-checkout: target locked → 423', r.code === 423);
  currentSupa = makeSupa(freshState({ existing: true }));
  r = await ladderCheckout({ method: 'POST', body: { name: 'Dup', country: 'NGA', amount: 100 }, headers: {} }, fakeRes());
  T('ladder-checkout: duplicate identity → 409', r.code === 409);
  global.fetch = realFetch;

  const ladderView = req_('functions/ladder.js');
  currentSupa = makeSupa(freshState({ ladderRows: [{ claim_id: 'cl_a', amount: 5000, paid_at: '2026-08-26T00:00:00Z', claims: { name: 'Raji', country: 'NGA' } }] }));
  r = await ladderView({ method: 'GET', query: {} }, fakeRes());
  T('ladder view: rows via REST fallback, rank 1 = biggest payer', r.code === 200 && r.body.rows.length === 1 && r.body.rows[0].rank === 1 && r.body.rows[0].holder.name === 'Raji' && r.body.rows[0].amount === 5000);
  currentSupa = makeSupa(freshState({ ladderCount: 7 }));
  r = await ladderView({ method: 'GET', query: { meta: '1' } }, fakeRes());
  T('ladder view: meta (taken, basePrice)', r.code === 200 && r.body.taken === 7 && r.body.basePrice === 100 && r.body.firstSpotFree === false);
  T('ladder view: meta founder mode free + 193 left', r.body.mode === 'free' && r.body.freeRemaining === 193 && r.body.founderLimit === 200);
  currentSupa = makeSupa(freshState({ ladderCount: 200 }));
  r = await ladderView({ method: 'GET', query: { meta: '1' } }, fakeRes());
  T('ladder view: meta flips to paid at 200', r.body.mode === 'paid' && r.body.freeRemaining === 0);

  /* ---------- founder free claim (first 200 free, no Bachs) ---------- */
  const ladderFree = req_('functions/ladder-free-claim.js');
  currentSupa = makeSupa(freshState({ ladderCount: 5 }));
  r = await ladderFree({ method: 'POST', body: { name: 'Founder One', field: 'Music', country: 'NGA' }, headers: {} }, fakeRes());
  T('ladder-free-claim: 200, claim free, entry ₦100, edit code once', r.code === 200 && r.body.claim && currentSupa.state.lastInsert.status === 'free' && currentSupa.state.lastEntry.amount === 100 && currentSupa.state.lastEntry.claim_id === 'claim_x' && /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(r.body.edit_code));
  currentSupa = makeSupa(freshState({ ladderCount: 200 }));
  r = await ladderFree({ method: 'POST', body: { name: 'Late One', country: 'NGA' }, headers: {} }, fakeRes());
  T('ladder-free-claim: tier full → 402 paid mode', r.code === 402 && r.body.mode === 'paid');
  currentSupa = makeSupa(freshState({ existing: true }));
  r = await ladderFree({ method: 'POST', body: { name: 'Dup', country: 'NGA' }, headers: {} }, fakeRes());
  T('ladder-free-claim: duplicate identity → 409', r.code === 409);
  currentSupa = makeSupa(freshState({ ipCount: 5 }));
  r = await ladderFree({ method: 'POST', body: { name: 'Spam', country: 'NGA' }, headers: { 'x-forwarded-for': '1.2.3.4' } }, fakeRes());
  T('ladder-free-claim: daily limit → 429', r.code === 429);

  /* ---------- spot posts (media feed) ---------- */
  const spotPost = req_('functions/spot-post.js');
  currentSupa = makeSupa(freshState({ codeClaim: { id: '11111111-2222-3333-4444-555555555555', name: 'Raji', status: 'free' }, statObj: { id: 'obj' } }));
  r = await spotPost({ method: 'POST', body: { code: 'ABCD-2345', kind: 'video', path: '11111111-2222-3333-4444-555555555555.mp4', caption: '<b>hi</b>' } }, fakeRes());
  T('spot-post: code auth + video stored, caption cleaned', r.code === 200 && currentSupa.state.lastPost.kind === 'video' && !/[<>]/.test(currentSupa.state.lastPost.caption || '') && currentSupa.state.lastPost.claim_id === '11111111-2222-3333-4444-555555555555');
  r = await spotPost({ method: 'POST', body: { code: 'ABCD-2345', kind: 'image', path: '11111111-2222-3333-4444-555555555555.mp4' } }, fakeRes());
  T('spot-post: kind/path mismatch → 400', r.code === 400);
  r = await spotPost({ method: 'GET', query: { claim_id: '11111111-2222-3333-4444-555555555555' } }, fakeRes());
  T('spot-post: public feed list', r.code === 200 && Array.isArray(r.body.posts));

  /* ---------- media upload routing ---------- */
  currentSupa = makeSupa(freshState());
  r = await uploadUrl({ method: 'POST', body: { name: 'Raji', kind: 'video', type: 'video/mp4', size: 20 * 1024 * 1024 }, headers: {} }, fakeRes());
  T('upload-url: 20MB mp4 → 200 + .mp4 path', r.code === 200 && /\.mp4$/.test(r.body.path));
  currentSupa = makeSupa(freshState());
  r = await uploadUrl({ method: 'POST', body: { name: 'Raji', kind: 'video', type: 'video/mp4', size: 30 * 1024 * 1024 }, headers: {} }, fakeRes());
  T('upload-url: 30MB video → 413', r.code === 413);
  currentSupa = makeSupa(freshState());
  r = await uploadUrl({ method: 'POST', body: { name: 'Raji', kind: 'gif', type: 'image/gif', size: 7 * 1024 * 1024 }, headers: {} }, fakeRes());
  T('upload-url: gif → 200 + .gif path', r.code === 200 && /\.gif$/.test(r.body.path));
  currentSupa = makeSupa(freshState());
  r = await uploadUrl({ method: 'POST', body: { name: 'Raji', kind: 'video', type: 'text/html', size: 1000 }, headers: {} }, fakeRes());
  T('upload-url: html disguised as video → 415', r.code === 415);


  /* ---------- live stats: visit + heartbeat + summary ---------- */
  const visit = req_('functions/visit.js');
  const heartbeat = req_('functions/heartbeat.js');
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

  const summary = req_('functions/summary.js');
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
  const worldmap = req_('functions/worldmap.js');
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
  const claims = req_('functions/claims.js');
  currentSupa = makeSupa(freshState({ settledCount: 1, rows: [{ name: 'Raji', cells: [1555], macro: '4-7' }] }));
  r = await claims({ method: 'GET', query: { macro: '4-7' } }, fakeRes());
  T('claims?macro: 200 + array', r.code === 200 && Array.isArray(r.body));

  console.log(fail === 0 ? `\nALL ${pass} BACKEND CHECKS PASSED` : `\n${fail} BACKEND CHECKS FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
