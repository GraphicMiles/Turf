#!/usr/bin/env node
/* Frontend integration tests (jsdom, demo mode) — run: npm test */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');

let html = fs.readFileSync(path.join(ROOT, 'map.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
html = html.replace('<script src="app.js"></script>', '<script>\n' + appjs + '\n</script>');

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => { if (!/not implemented/i.test(String(e.message))) errors.push(String(e.message).slice(0, 200)); });

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/',
  beforeParse(window) {
    const noop = () => {};
    const proxy = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
    window.HTMLCanvasElement.prototype.getContext = () => proxy;
  },
});

setTimeout(async () => {
  const w = dom.window, d = w.document;
  let fail = 0;
  const T = (n, ok) => { if (ok) { console.log('PASS  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

  console.log('== TURF — frontend (jsdom, demo mode)');
  T('no runtime errors', errors.length === 0);
  if (errors.length) console.log('     ' + errors.join(' | '));
  const P = w.__PM;
  T('world: 10,000 cells, people populated', P.cells.length === 10000 && P.totalMapped > 3000);
  T('topbar: Explore / My Turf / Top 20 / Countries', ['pmExplore','pmMyTurf','pmTop20','pmCountries'].every(id => d.getElementById(id)));
  T('top20 view exists', !!d.getElementById('viewTop20'));
  T('my turf view exists', !!d.getElementById('viewMyTurf'));
  T('intro stats line exists', !!d.getElementById('introStats'));
  T('hud online span exists', !!d.getElementById('hudOnline'));

  /* founder countdown UI */
  T('countdown shows 200', d.getElementById('countdownNum').textContent === '200');
  T('countdown bar full', d.getElementById('countdownFill').style.transform === 'scaleX(1)');
  T('free chip labels', d.querySelectorAll('#spotChips .spot-chip span')[0].textContent === '1 spot · FREE');
  T('submit label is free', d.getElementById('cfSubmitLabel').textContent.includes('Claim free'));

  /* mock person card (no position) */
  const person = P.allPeople[0], i = person._i;
  w.openPerson(person, i % 100, (i / 100) | 0);
  T('mock person card: no position line', !d.getElementById('pmMeta').textContent.includes('POSITION #'));
  T('mock person card: meta id', /TURF F\. #4\d\d,\d\d\d/.test(d.getElementById('pmMeta').textContent));
  d.getElementById('dockClose').click();

  /* first claim → free founder, position #1, countdown 199 */
  d.getElementById('pmClaim').click();
  T('claim form opens', !d.getElementById('viewClaim').hidden);
  d.getElementById('cfName').value = 'Test User';
  w.claim();
  T('countdown → 199 after claim', d.getElementById('countdownNum').textContent === '199');
  T('countdown bar depletes', d.getElementById('countdownFill').style.transform.includes('scaleX(0.995)'));
  const claimed = P.cells.find(c => c.person && c.person.name === 'Test User');
  T('claim placed with position #1 + founder', !!claimed && claimed.person.position === 1 && claimed.person.founder === true);
  T('top20 list has 1 row', d.querySelectorAll('#top20List .top20-row').length === 1);
  await new Promise(r => setTimeout(r, 1100));
  T('dock shows claimed person', d.getElementById('dock').classList.contains('open') && d.getElementById('pmName').textContent === 'Test User');
  T('card meta: POSITION #1 · TOP 20', d.getElementById('pmMeta').textContent.includes('POSITION #1') && d.getElementById('pmMeta').textContent.includes('TOP 20'));
  T('card badge: TOP 20 ⭐', d.getElementById('pmBadge').textContent.includes('TOP 20'));

  /* second claim (5 spots) → position #2, five cells */
  d.getElementById('dockClose').click();
  w.openClaim();
  d.getElementById('cfName').value = 'Block Builder';
  d.querySelectorAll('.spot-chip')[1].click();
  w.claim();
  const bb = P.cells.filter(c => c.person && c.person.name === 'Block Builder');
  T('5-spot claim: 5 cells, position #2', bb.length === 5 && P.allPeople.find(p => p.name === 'Block Builder').position === 2);
  /* computeRun unit: contiguous horizontal run detected, scatter → null */
  T('computeRun: contiguous run detected', JSON.stringify(w.computeRun([5040, 5041, 5042])) === JSON.stringify({ x: 40, y: 50, n: 3 }));
  T('computeRun: scattered cells → null', w.computeRun([5040, 5043, 5140, 5144, 5241]) === null);
  T('countdown → 198', d.getElementById('countdownNum').textContent === '198');
  T('top20 list has 2 rows', d.querySelectorAll('#top20List .top20-row').length === 2);

  /* views */
  w.openDock('top20');
  T('top20 view opens via dock', !d.getElementById('viewTop20').hidden);
  T('top20 footer count', d.getElementById('top20Foot').textContent === '2 OF 20 CLAIMED — RANKED BY OLDEST MEMBER');
  w.openDock('countries');
  T('countries view opens', !d.getElementById('viewCountries').hidden && d.querySelectorAll('.country-row').length >= 30);
  T('explore wired', typeof w.explore === 'function');

  console.log(fail === 0 ? `\nALL FRONTEND CHECKS PASSED` : `\n${fail} FRONTEND CHECKS FAILED`);
  process.exit(fail === 0 ? 0 : 1);
}, 600);
