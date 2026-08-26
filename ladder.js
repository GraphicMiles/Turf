/* ==========================================================================
   TURF F. — THE LADDER (frontend)
   Rank = amount paid (desc). Overtake = 2× the holder's payment.
   Every spot is a self-contained feed: image / gif / video / audio + caption.
   ========================================================================== */
(function () {
  'use strict';
  const { GEO, FIELDS } = window.WORLD_CORE || { GEO: {}, FIELDS: [] };
  const BASE_PRICE = 100, ROW_SIZE = 20, OVERTAKE_MULTIPLE = 2, PAGE = 60;

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function safeSrc(u) { return (typeof u === 'string' && /^https:\/\//.test(u)) ? u : ''; }
  function naira(n) { return '₦' + Number(n || 0).toLocaleString('en-NG'); }
  function showToast(message) {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<i class="fa-solid fa-sparkles"></i> <span>' + esc(message) + '</span>';
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
  }
  const $ = id => document.getElementById(id);

  /* ---------------- state ---------------- */
  let rows = [];            /* [{rank, amount, holder, posts}] */
  let meta = { taken: 0, basePrice: BASE_PRICE, mode: 'free', freeRemaining: 200, recent: [], lockedTargets: [] };
  let loadedTo = 0;
  let myAuth = null;        /* {code} or {email, name} */
  let myClaim = null;
  let selected = null;
  let backendError = null;

  /* ---------------- data ---------------- */
  async function loadMeta() {
    try {
      const r = await fetch('api/ladder?meta=1', { cache: 'no-store' });
      const m = await r.json();
      if (m && typeof m.taken === 'number') meta = m;
    } catch (e) { /* offline */ }
    $('statTaken').textContent = (meta.taken || 0) + ' SPOTS';
    $('statTop').textContent = 'TOP ' + naira(rows.length ? rows[0].amount : 0);
    const free = meta.mode === 'free';
    const left = meta.freeRemaining || 0;
    if (backendError) {
      $('heroSub').innerHTML = '⚠️ <b>BACKEND NOT CONFIGURED</b> — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in your hosting env and run supabase/schema.sql.';
    } else if (free && !meta.taken) {
      $('heroSub').innerHTML = 'The <b>first 200 spots are FREE</b> — the first person ever takes <b>#1</b> right now. When the free tier fills, spots are paid: #1 = whoever paid the most, overtaking costs 2×.';
      $('btnClaimTop').querySelector('p').textContent = 'Claim FREE — 200 spots left →';
    } else if (free) {
      $('heroSub').innerHTML = 'Founder tier: <b>' + left + ' FREE spots left</b> (of ' + (meta.founderLimit || 200) + '). Yours enters at the ₦100 rank — climb anytime by overtaking at 2×.';
      $('btnClaimTop').querySelector('p').textContent = 'Claim FREE — ' + left + ' left →';
    } else {
      $('heroSub').innerHTML = '#1 belongs to whoever paid the most — anyone can take it. Every spot starts at <b>₦100</b>; overtaking costs <b>2×</b> what the holder paid.';
      $('btnClaimTop').querySelector('p').textContent = 'Claim your spot →';
    }
    $('recentTicker').innerHTML = (meta.recent || []).slice(0, 4).map(x =>
      esc(x.name) + ' ' + (x.action === 'overtake' ? 'OVERTOOK' : 'CLAIMED') + ' A SPOT FOR ' + esc(naira(x.amount))).join(' · ');
    render(); /* re-render once lock/meta state is known */
  }

  async function loadLadder(append) {
    try {
      const from = append ? loadedTo + 1 : 1;
      const r = await fetch('api/ladder?from=' + from + '&count=' + PAGE, { cache: 'no-store' });
      const data = await r.json();
      rows = append ? rows.concat(data.rows || []) : (data.rows || []);
      loadedTo = from - 1 + (data.rows || []).length;
      if (data && data.error) backendError = data.error;
      render();
    } catch (e) {
      if (!append) { rows = []; render(); }
    }
    loadMeta();
  }

  function previewRank(amount) {
    let rank = 1;
    /* ties go to the earlier payer — an existing holder at the same price stays above you */
    for (const r of rows) if (Number(r.amount) >= amount) rank++;
    return rank;
  }

  /* ---------------- render ---------------- */
  function render() {
    const host = $('ladder');
    if (!host) return;
    const taken = rows.length;
    const tailCount = taken ? Math.max(ROW_SIZE, (ROW_SIZE - (taken % ROW_SIZE)) % ROW_SIZE + ROW_SIZE) : ROW_SIZE * 2;
    let html = '';
    rows.forEach(r => { html += boxHtml(r); });
    for (let k = 1; k <= tailCount; k++) {
      html += boxHtml({ rank: taken + k, amount: BASE_PRICE, holder: null, empty: true });
    }
    host.innerHTML = html;
    host.querySelectorAll('.spot-box').forEach(b => {
      b.addEventListener('click', () => {
        const rank = Number(b.dataset.rank);
        const row = rows.find(x => x.rank === rank);
        if (row) openSpot(row); else openClaim(null);
      });
    });
    $('statTop').textContent = 'TOP ' + naira(rows.length ? rows[0].amount : 0);
  }

  function boxHtml(r) {
    if (r.empty || !r.holder) {
      return '<div class="spot-box empty" data-rank="' + r.rank + '">' +
        '<span class="box-rank mono">#' + r.rank + '</span>' +
        '<span class="box-name">CLAIM</span>' +
        '<span class="box-paid mono">' + naira(BASE_PRICE) + '</span></div>';
    }
    const g = GEO[r.holder.country] || { flag: '🌍', name: '' };
    const locked = (meta.lockedTargets || []).indexOf(r.holder.claim_id) >= 0;
    return '<div class="spot-box' + (r.rank <= 3 ? ' top' + r.rank : '') + '" data-rank="' + r.rank + '">' +
      '<span class="box-rank mono">#' + r.rank + '</span>' +
      '<span class="box-name">' + (r.holder.image_url
        ? '<img class="box-img" src="' + esc(safeSrc(r.holder.image_url)) + '" alt="" loading="lazy" onerror="this.remove()" />'
        : '') + esc(r.holder.name || '?') + ' ' + g.flag + '</span>' +
      '<span class="box-paid mono">' + naira(r.amount) + (locked
        ? ' <i class="fa-solid fa-lock" title="Payment in progress — locked up to 15 min"></i>'
        : ' <span class="box-take">⇧2×</span>') + '</span></div>';
  }

  /* ---------------- spot card + feed ---------------- */
  async function openSpot(row) {
    selected = row;
    const h = row.holder || {};
    const av = $('spAvatar');
    const src = safeSrc(h.image_url);
    av.src = src; av.hidden = !src;
    $('spTitle').textContent = h.name ? h.name + '’s spot' : 'Spot';
    $('spRank').textContent = '#' + row.rank + (row.rank === 1 ? ' — THE TOP' : '');
    $('spName').textContent = h.name || '—';
    const g = GEO[h.country] || { name: '' };
    $('spMeta').textContent = [h.field, h.city, g.name].filter(Boolean).join(' · ') +
      ' · PAID ' + naira(row.amount) + (row.posts ? ' · ' + row.posts + ' POSTS' : '');
    $('spBio').textContent = h.bio || '';
    $('spTake').querySelector('p').textContent = 'Take #' + row.rank + ' for ' + naira(row.amount * OVERTAKE_MULTIPLE);
    $('spFeed').innerHTML = '<p class="feed-empty">Loading feed…</p>';
    $('dock').classList.add('open');
    loadFeed(row.holder.claim_id, $('spFeed'));
    if (h.web) $('spMeta').textContent += ' · ' + h.web;
  }

  async function loadFeed(claimId, host) {
    if (!claimId) { host.innerHTML = '<p class="feed-empty">No media on this spot yet.</p>'; return; }
    try {
      const r = await fetch('api/spot-post?claim_id=' + encodeURIComponent(claimId) + '&limit=30', { cache: 'no-store' });
      const data = await r.json();
      const posts = (data && data.posts) || [];
      if (!posts.length) { host.innerHTML = '<p class="feed-empty">No media on this spot yet.</p>'; return; }
      host.innerHTML = posts.map(postHtml).join('');
      wireDeletes(host);
    } catch (e) { host.innerHTML = '<p class="feed-empty">Feed unavailable right now.</p>'; }
  }

  function postHtml(p) {
    const cap = p.caption ? '<div class="post-caption">' + esc(p.caption) + '</div>' : '';
    let media = '';
    if (p.kind === 'video') media = '<video controls preload="metadata" playsinline src="' + esc(safeSrc(p.url)) + '"></video>';
    else if (p.kind === 'audio') media = '<audio controls preload="metadata" src="' + esc(safeSrc(p.url)) + '"></audio>';
    else media = '<img src="' + esc(safeSrc(p.url)) + '" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode(\'[media]\'))" />';
    return '<div class="post" data-id="' + esc(p.id) + '">' + media + cap +
      '<span class="post-kind mono">' + p.kind.toUpperCase() + '</span></div>';
  }
  function wireDeletes(host) { /* delete buttons only in My Spot feed */
    host.querySelectorAll('.post-del').forEach(b => b.addEventListener('click', async () => {
      const id = b.closest('.post').dataset.id;
      try {
        const r = await fetch('api/spot-post', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ id }, authBody())) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'failed');
        b.closest('.post').remove(); showToast('Post removed');
      } catch (e) { showToast(e.message); }
    }));
  }

  function authBody() {
    if (myAuth && myAuth.code) return { code: myAuth.code };
    if (myAuth && myAuth.email) return { email: myAuth.email, prove_name: myAuth.name };
    return {};
  }

  /* ---------------- claim flow ---------------- */
  const CHIPS = [100, 500, 1000, 2000, 5000, 20000];
  let overtakeTarget = null;

  function buildClaimForm() {
    $('cfField').innerHTML = (FIELDS.length ? FIELDS : [{ name: 'Builder' }]).map(f => '<option value="' + esc(f.name) + '">' + esc(f.name) + '</option>').join('');
    const codes = Object.keys(GEO).sort((a, b) => (GEO[a].name || a).localeCompare(GEO[b].name || b));
    $('cfCountry').innerHTML = codes.map(c => '<option value="' + c + '">' + (GEO[c].flag || '') + ' ' + esc(GEO[c].name || c) + '</option>').join('');
    $('cfCountry').value = 'NGA';
    $('amountChips').innerHTML = CHIPS.map(a => '<button type="button" class="amount-chip mono" data-a="' + a + '">' + naira(a) + '</button>').join('');
    $('amountChips').querySelectorAll('.amount-chip').forEach(b => b.addEventListener('click', () => {
      $('cfAmount').value = b.dataset.a;
      markChip(b.dataset.a);
      refreshPreview();
    }));
    function markChip(val) {
      $('amountChips').querySelectorAll('.amount-chip').forEach(c =>
        c.classList.toggle('sel', c.dataset.a === String(val)));
    }
    $('cfAmount').addEventListener('input', () => { markChip(null); refreshPreview(); });
  }

  function refreshPreview() {
    if (overtakeTarget) return;
    const a = Math.max(BASE_PRICE, Math.round(Number($('cfAmount').value) || BASE_PRICE));
    $('rankPreview').textContent = 'PAYING ' + naira(a) + ' → RANK #' + previewRank(a);
  }

  function openClaim(target) {
    overtakeTarget = target;
    buildClaimForm();
    const freeMode = !target && meta.mode === 'free' && !backendError;
    if (target) {
      $('claimTitle').textContent = 'Take #' + target.rank + ' — pay 2×';
      $('claimSub').textContent = 'You pay double what ' + (target.holder && target.holder.name || 'the holder') + ' paid (' + naira(target.amount) + ') → ' + naira(target.amount * OVERTAKE_MULTIPLE) + '. You land directly above them.';
    } else if (freeMode) {
      $('claimTitle').textContent = 'Claim your FREE founder spot';
      $('claimSub').textContent = 'Founder tier — ' + (meta.freeRemaining || 0) + ' free spots left. Yours enters at the ₦100 rank; no payment needed. Climb later by overtaking at 2×.';
    } else {
      $('claimTitle').textContent = 'Claim your spot';
      $('claimSub').textContent = 'Pick your price — your rank follows your payment. Anyone can overtake you later by paying 2× yours.';
    }
    $('amountRow').style.display = (target || freeMode) ? 'none' : '';
    $('cfSubmitLabel').textContent = target
      ? 'Pay ' + naira(target.amount * OVERTAKE_MULTIPLE) + ' & take it →'
      : (freeMode ? 'Claim FREE →' : 'Pay & claim →');
    refreshPreview();
    $('claimModal').classList.add('open');
  }

  async function submitClaim() {
    const name = $('cfName').value.trim();
    if (!name) { showToast('Enter your name first ✍️'); return; }
    const profile = {
      name,
      field: $('cfField').value,
      country: $('cfCountry').value,
      city: $('cfCity').value.trim(),
      bio: $('cfBio').value.trim(),
      project: $('cfProject').value.trim(),
      web: $('cfWeb').value.trim(),
      social: $('cfSocial').value.trim(),
      email: $('cfEmail').value.trim(),
    };
    const freeMode = !overtakeTarget && meta.mode === 'free' && !backendError;

    /* ---- FREE founder claim: instant, no Bachs ---- */
    if (freeMode) {
      try {
        const r = await fetch('api/ladder-free-claim', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (r.status === 402) { meta.mode = 'paid'; openClaim(null); return; }
          throw new Error(data.error || 'HTTP ' + r.status);
        }
        stashEditCode(data.edit_code, name);
        $('claimModal').classList.remove('open');
        showToast('You are ON THE LADDER 🪜 Founder spot secured — save your edit code!');
        loadLadder(false);
      } catch (e) { showToast(e.message + ' — could not claim.'); }
      return;
    }

    /* ---- paid join / overtake: Bachs checkout ---- */
    const body = Object.assign({}, profile);
    if (overtakeTarget) body.target_claim_id = overtakeTarget.holder.claim_id;
    else body.amount = Math.max(BASE_PRICE, Math.round(Number($('cfAmount').value) || BASE_PRICE));

    let data;
    try {
      const r = await fetch('api/ladder-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      data = await r.json().catch(() => ({}));
      if (!r.ok || !data.checkout_url) throw new Error(data.error || 'HTTP ' + r.status);
    } catch (e) { showToast(e.message + ' — could not start payment.'); return; }

    try { localStorage.setItem('turf_pending_checkout', data.checkout_id); } catch (e) {}
    stashEditCode(data.edit_code, name);
    $('claimModal').classList.remove('open');
    showToast('Pay ' + naira(data.amount) + ' to secure your spot…');
    if (window.Bachs && Bachs.Checkout && Bachs.Checkout.open) Bachs.Checkout.open({ checkoutUrl: data.checkout_url });
    pollCheckout(data.checkout_id);
  }

  function stashEditCode(code, name) {
    if (!code) return;
    try {
      const saved = JSON.parse(localStorage.getItem('turf_edit_codes') || '[]');
      saved.unshift({ code: String(code).toUpperCase(), name: name || '', at: Date.now() });
      localStorage.setItem('turf_edit_codes', JSON.stringify(saved.slice(0, 10)));
    } catch (e) {}
  }
  function savedCode() {
    try { const s = JSON.parse(localStorage.getItem('turf_edit_codes') || '[]'); return s.length ? s[0].code : null; }
    catch (e) { return null; }
  }

  async function pollCheckout(checkoutId, tries) {
    tries = tries || 12;
    for (let k = 0; k < tries; k++) {
      try {
        const r = await fetch('api/claim-status?checkout_id=' + encodeURIComponent(checkoutId));
        const s = await r.json();
        if (s.status === 'paid') {
          showToast('You are ON THE LADDER 🪜 Save your edit code!');
          loadLadder(false);
          return;
        }
        if (s.status === 'failed' || s.status === 'expired') { showToast('Payment didn’t complete — your spot is still open.'); return; }
      } catch (e) { /* keep polling */ }
      await new Promise(res => setTimeout(res, 2500));
    }
  }

  /* ---------------- my spot ---------------- */
  function openMy() {
    const code = savedCode();
    $('myCodeHint').textContent = code ? 'SAVED ON THIS DEVICE: ' + code : 'NO EDIT CODE ON THIS DEVICE — SHOWN ONCE WHEN YOU CLAIM';
    $('myEdit').hidden = true; $('myFind').hidden = false;
    $('myModal').classList.add('open');
  }

  async function myFind() {
    const raw = $('myKey').value.trim();
    if (!raw) { showToast('Enter your edit code or email'); return; }
    const isCode = /^[A-Za-z0-9]{4}[-\s]?[A-Za-z0-9]{4}$/.test(raw);
    if (isCode) {
      myAuth = { code: raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase() };
    } else {
      const prove = $('myProve').value.trim();
      if (!prove) { $('myProveRow').hidden = false; showToast('Enter the name on the claim too'); return; }
      myAuth = { email: raw.toLowerCase(), name: prove };
    }
    try {
      const r = await fetch('api/my-claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isCode ? { code: myAuth.code } : { email: myAuth.email, prove_name: myAuth.name }),
      });
      const data = await r.json();
      if (!r.ok || !data.claim) throw new Error(data.error || 'not found');
      myClaim = data.claim;
      fillMy();
    } catch (e) { myAuth = null; showToast(e.message); }
  }

  async function fillMy() {
    const c = myClaim;
    $('myFind').hidden = true; $('myEdit').hidden = false;
    const entry = rows.find(x => x.holder && x.holder.claim_id === c.id);
    $('myRank').textContent = entry ? '#' + entry.rank : 'ON THE LADDER';
    $('myName').textContent = c.name || '';
    const g = GEO[c.country] || { name: '' };
    $('myMeta').textContent = [c.field, c.city, g.name].filter(Boolean).join(' · ');
    $('myCity').value = c.city || '';
    $('myBio').value = c.bio || '';
    $('myWeb').value = c.web || '';
    $('mySocial').value = c.social || '';
    $('myField').innerHTML = (FIELDS.length ? FIELDS : [{ name: 'Builder' }]).map(f =>
      '<option' + (f.name === c.field ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('');
    loadMyFeed();
  }

  async function loadMyFeed() {
    const host = $('myFeed');
    host.innerHTML = '<p class="feed-empty">Loading…</p>';
    try {
      const r = await fetch('api/spot-post?claim_id=' + encodeURIComponent(myClaim.id) + '&limit=30', { cache: 'no-store' });
      const data = await r.json();
      const posts = (data && data.posts) || [];
      host.innerHTML = posts.length ? posts.map(p => postHtml(p) + '').join('') : '<p class="feed-empty">No posts yet — add media above.</p>';
      if (posts.length) {
        posts.forEach(p => {
          const el = host.querySelector('.post[data-id="' + p.id + '"]');
          if (el && !el.querySelector('.post-del')) {
            const del = document.createElement('button');
            del.className = 'post-del'; del.innerHTML = '<i class="fa-solid fa-trash"></i>';
            del.addEventListener('click', async () => {
              try {
                const rr = await fetch('api/spot-post', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ id: p.id }, authBody())) });
                const dd = await rr.json();
                if (!rr.ok) throw new Error(dd.error || 'failed');
                el.remove(); showToast('Post removed');
              } catch (e) { showToast(e.message); }
            });
            el.appendChild(del);
          }
        });
      }
    } catch (e) { host.innerHTML = '<p class="feed-empty">Feed unavailable.</p>'; }
  }

  async function mySave() {
    const body = Object.assign({
      name: myClaim.name, city: $('myCity').value, bio: $('myBio').value,
      field: $('myField').value, web: $('myWeb').value, social: $('mySocial').value,
    }, authBody());
    try {
      const r = await fetch('api/my-claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'failed');
      myClaim = data.claim;
      showToast('Saved ✓'); loadLadder(false);
    } catch (e) { showToast(e.message + ' — not saved.'); }
  }

  /* ---------------- posting media ---------------- */
  const KIND_RULES = {
    image: { exts: ['webp', 'jpeg', 'jpg', 'png'], max: 5 * 1024 * 1024, mime: f => 'image/' + (f.type.split('/')[1] || 'webp') },
    gif:   { exts: ['gif'], max: 8 * 1024 * 1024, mime: () => 'image/gif' },
    video: { exts: ['mp4', 'webm', 'mov'], max: 25 * 1024 * 1024, mime: f => f.type || 'video/mp4', maxSecs: 90 },
    audio: { exts: ['mp3', 'm4a', 'wav', 'ogg', 'aac'], max: 10 * 1024 * 1024, mime: f => f.type || 'audio/mpeg', maxSecs: 180 },
  };
  function kindOf(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    for (const k of Object.keys(KIND_RULES)) if (KIND_RULES[k].exts.indexOf(ext) >= 0 || (file.type && file.type.indexOf(k === 'gif' ? 'image/gif' : k + '/') === 0)) return k;
    return null;
  }
  function readDuration(file, kind) {
    return new Promise(resolve => {
      if (!KIND_RULES[kind].maxSecs) return resolve(true);
      try {
        const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
        el.preload = 'metadata';
        el.onloadedmetadata = () => resolve(el.duration <= KIND_RULES[kind].maxSecs);
        el.onerror = () => resolve(true); /* can't read — let the server caps decide */
        el.src = URL.createObjectURL(file);
      } catch (e) { resolve(true); }
    });
  }

  async function postMedia() {
    if (!myClaim) { showToast('Find your spot first'); return; }
    const file = $('myFile').files[0];
    if (!file) { showToast('Pick an image, gif, video or audio file'); return; }
    const kind = kindOf(file);
    if (!kind) { showToast('Only image / gif / video / audio'); return; }
    const rule = KIND_RULES[kind];
    if (file.size > rule.max) { showToast('Too large — max ' + Math.round(rule.max / (1024 * 1024)) + 'MB for ' + kind); return; }
    if (!(await readDuration(file, kind))) { showToast('Too long — max ' + rule.maxSecs + 's'); return; }

    try {
      const up = await fetch('api/upload-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ name: myClaim.name, kind, type: rule.mime(file), size: file.size }, authBody())),
      });
      const u = await up.json();
      if (!up.ok || !u.uploadUrl) throw new Error(u.error || 'upload unavailable');
      const put = await fetch(u.uploadUrl, { method: 'PUT', headers: { 'Content-Type': rule.mime(file) }, body: file });
      if (!put.ok) throw new Error('upload failed');

      const pr = await fetch('api/spot-post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ kind, path: u.path, caption: $('myCaption').value.trim() }, authBody())),
      });
      const pd = await pr.json();
      if (!pr.ok || !pd.post) throw new Error(pd.error || 'post failed');
      $('myCaption').value = ''; $('myFile').value = '';
      showToast('Posted to your spot 🎬'); loadMyFeed(); loadLadder(false);
    } catch (e) { showToast(e.message); }
  }

  /* ---------------- bachs events ---------------- */
  function initBachs() {
    if (typeof Bachs === 'undefined' || !Bachs || !Bachs.Initialize) return;
    Bachs.Initialize({
      onEvent: event => {
        if (event.type === 'checkout.completed') {
          let id = null;
          try { id = localStorage.getItem('turf_pending_checkout'); } catch (e) {}
          if (id) pollCheckout(id, 3);
          loadLadder(false);
        } else if (event.type === 'checkout.failed') {
          showToast('Payment failed — your spot is still open.');
        }
      },
    });
  }

  /* ---------------- wire up ---------------- */
  function init() {
    buildClaimForm();
    $('btnClaimTop').onclick = () => openClaim(null);
    $('spTake').onclick = () => { if (selected) openClaim(selected); };
    $('dockClose').onclick = () => $('dock').classList.remove('open');
    $('claimClose').onclick = () => $('claimModal').classList.remove('open');
    $('myClose').onclick = () => $('myModal').classList.remove('open');
    $('cfSubmit').onclick = submitClaim;
    $('btnMySpot').onclick = openMy;
    $('myFindBtn').onclick = myFind;
    $('mySave').onclick = mySave;
    $('myPost').onclick = postMedia;
    $('myKey').addEventListener('input', () => {
      const raw = $('myKey').value.trim();
      $('myProveRow').hidden = /^[A-Za-z0-9]{4}[-\s]?[A-Za-z0-9]{4}$/.test(raw) || !raw.includes('@');
    });
    $('btnMore').onclick = () => loadLadder(true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('dock').classList.remove('open'); $('claimModal').classList.remove('open'); $('myModal').classList.remove('open'); } });

    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get('checkout') === 'success') showToast('Payment received — placing your spot…');
      const pc = localStorage.getItem('turf_pending_checkout');
      if (pc) pollCheckout(pc, 2);
    } catch (e) {}

    loadLadder(false);
    initBachs();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
