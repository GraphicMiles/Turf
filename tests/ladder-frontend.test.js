#!/usr/bin/env node
/* Ladder frontend smoke test (jsdom) — run: npm test */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ladderjs = fs.readFileSync(path.join(ROOT, 'ladder.js'), 'utf8');
const wcjs = fs.readFileSync(path.join(ROOT, 'world-core.js'), 'utf8');
html = html.replace('<script src="world-core.js"></script>', '<script>\n' + wcjs + '\n</script>');
html = html.replace('<script src="ladder.js"></script>', '<script>\n' + ladderjs + '\n</script>');
html = html.replace('<script src="https://checkout.bachs.io/bachs.js"></script>', '');

const LADDER_ROWS = {
  rows: [
    { rank: 1, amount: 20000, posts: 1, holder: { claim_id: 'c1', name: 'Ada', country: 'NGA', field: 'Music' } },
    { rank: 2, amount: 5000, posts: 0, holder: { claim_id: 'c2', name: 'Raji', country: 'NGA', field: 'Builder' } },
  ],
  basePrice: 100, rowSize: 20,
};
const META = { taken: 2, basePrice: 100, rowSize: 20, firstSpotFree: false, recent: [{ action: 'overtake', amount: 20000, name: 'Ada' }], lockedTargets: ['c2'] };
const POSTS = { posts: [{ id: 'p1', kind: 'video', url: 'https://dummy.supabase.co/people/x.mp4', caption: 'my launch', created_at: '2026-08-26T00:00:00Z' }] };
const CLAIM_BY_CODE = { claim: { id: 'c1', name: 'Ada', field: 'Music', country: 'NGA', city: 'Lagos', status: 'paid', cells: [] } };

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => { if (!/not implemented/i.test(String(e.message))) errors.push(String(e.message).slice(0, 200)); });

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/',
  beforeParse(window) {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => {
        if (String(url).indexOf('meta=1') >= 0) return META;
        if (String(url).indexOf('api/spot-post') >= 0) return POSTS;
        if (String(url).indexOf('api/my-claim') >= 0) return CLAIM_BY_CODE;
        if (String(url).indexOf('api/ladder-checkout') >= 0) return { checkout_url: 'https://checkout.bachs.io/c/x', checkout_id: 'chk_x', edit_code: 'ABCD-2345', amount: 100, action: 'join' };
        if (String(url).indexOf('api/ladder') === 0) return LADDER_ROWS;
        return {};
      },
    });
  },
});

setTimeout(async () => {
  const w = dom.window, d = w.document;
  let fail = 0;
  const T = (n, ok) => { if (ok) { console.log('PASS  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

  console.log('== TURF F. — ladder frontend (jsdom)');
  T('no script errors', errors.length === 0);
  T('grid renders 2 holders + empty tail (≥22 boxes)', d.querySelectorAll('.spot-box').length >= 22);
  T('rank 1 = biggest payer (Ada, ₦20,000, gold box)', d.querySelector('.spot-box[data-rank="1"].top1') && d.querySelector('.spot-box[data-rank="1"]').textContent.indexOf('Ada') >= 0 && d.querySelector('.spot-box[data-rank="1"]').textContent.indexOf('20,000') >= 0);
  T('locked target shows a lock icon', d.querySelector('.spot-box[data-rank="2"]').innerHTML.indexOf('fa-lock') >= 0);
  T('stats header shows 2 spots', d.getElementById('statTaken').textContent.indexOf('2 SPOTS') >= 0);
  T('recent ticker names the last overtaker', d.getElementById('recentTicker').textContent.indexOf('Ada') >= 0);

  d.querySelector('.spot-box[data-rank="1"]').click();
  await new Promise(r => setTimeout(r, 150));
  T('spot card opens with rank + take price 2×', d.getElementById('dock').classList.contains('open') && d.getElementById('spRank').textContent.indexOf('#1') >= 0 && d.getElementById('spTake').textContent.indexOf('40,000') >= 0);
  T('feed renders video post', d.getElementById('spFeed').querySelector('video[src*="dummy.supabase.co"]') !== null);

  d.getElementById('dockClose').click();
  d.getElementById('btnClaimTop').click();
  T('claim modal opens with amount chips', d.getElementById('claimModal').classList.contains('open') && d.querySelectorAll('.amount-chip').length === 6);
  const amt = d.getElementById('cfAmount');
  amt.value = '20000';
  amt.dispatchEvent(new w.Event('input'));
  T('rank preview: ₦20,000 ties → #2 (holder is earlier)', d.getElementById('rankPreview').textContent.indexOf('#2') >= 0);

  d.getElementById('myKey').value = 'ABCD-2345';
  d.getElementById('btnMySpot').click();
  d.getElementById('myFindBtn').click();
  await new Promise(r => setTimeout(r, 150));
  T('my spot unlocks with edit code (no email needed)', d.getElementById('myEdit').hidden === false && d.getElementById('myName').textContent.indexOf('Ada') >= 0);

  console.log(fail === 0 ? '\nALL LADDER FRONTEND CHECKS PASSED' : '\n' + fail + ' LADDER FRONTEND CHECKS FAILED');
  process.exit(fail === 0 ? 0 : 1);
}, 400);
