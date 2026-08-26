/* ==========================================================================
   TURF F. — APP ENGINE
   A living map of people on Earth.
   100×100 grid = 10×10 macro regions × 10×10 person slots (10,000 spots)
   Deterministic seed 0x5EED01 — the same world on every load.
   Zoom: WORLD → REGION → COUNTRY → CITY GRID → PEOPLE
   ========================================================================== */

/* ---------------- PRNG ---------------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd = mulberry32(0x5EED01);

/* ---------------- geography (stylized 10×10 world) ---------------- */
const WORLD = [
  ['O','O','O','O','O','O','O','O','O','O'],
  ['GL','CAN','USA','O','UK','O','RUS','RUS','KZH','O'],
  ['O','CAN','USA','O','DE','O','RUS','KZH','CHN','JPN'],
  ['MX','USA','CUBA','O','ES','TR','IRN','CHN','CHN','O'],
  ['O','GTM','PNM','O','O','SAU','IND','IND','KOR','O'],
  ['O','COL','VEN','O','NGA','CMR','ETH','BGD','THA','O'],
  ['O','ECU','PER','BRA','SEN','KEN','SOM','MMR','VNM','O'],
  ['CHL','CHL','BRA','BRA','COD','TZA','O','O','O','O'],
  ['CHL','ARG','BRA','BRA','ZAF','MOZ','O','AUS','O','O'],
  ['O','ARG','O','O','O','O','O','AUS','NZL','O'],
];
const GEO = {
  GL:{name:'Greenland',flag:'🇬',cities:['Nuuk']},
  CAN:{name:'Canada',flag:'🇨🇦',cities:['Toronto','Vancouver']},
  USA:{name:'United States',flag:'🇺🇸',cities:['New York','Austin','Chicago']},
  MX:{name:'Mexico',flag:'🇲',cities:['Mexico City','Guadalajara']},
  GTM:{name:'Guatemala',flag:'🇬🇹',cities:['Guatemala City']},
  PNM:{name:'Panama',flag:'🇵🇦',cities:['Panama City']},
  CUBA:{name:'Cuba',flag:'🇨',cities:['Havana']},
  COL:{name:'Colombia',flag:'🇨🇴',cities:['Bogotá','Medellín']},
  VEN:{name:'Venezuela',flag:'🇻🇪',cities:['Caracas']},
  ECU:{name:'Ecuador',flag:'🇪🇨',cities:['Quito']},
  PER:{name:'Peru',flag:'🇵🇪',cities:['Lima']},
  BRA:{name:'Brazil',flag:'🇧',cities:['São Paulo','Rio de Janeiro']},
  CHL:{name:'Chile',flag:'🇨',cities:['Santiago']},
  ARG:{name:'Argentina',flag:'🇦🇷',cities:['Buenos Aires']},
  UK:{name:'United Kingdom',flag:'🇬🇧',cities:['London','Manchester']},
  DE:{name:'Germany',flag:'🇩',cities:['Berlin','Hamburg']},
  ES:{name:'Spain',flag:'🇪🇸',cities:['Madrid','Barcelona']},
  TR:{name:'Türkiye',flag:'🇹🇷',cities:['Istanbul','Izmir']},
  SAU:{name:'Saudi Arabia',flag:'🇸',cities:['Riyadh','Jeddah']},
  RUS:{name:'Russia',flag:'🇷🇺',cities:['Moscow','St. Petersburg']},
  KZH:{name:'Kazakhstan',flag:'🇰🇿',cities:['Almaty','Astana']},
  IRN:{name:'Iran',flag:'🇮🇷',cities:['Tehran','Isfahan']},
  CHN:{name:'China',flag:'🇨🇳',cities:['Shanghai','Shenzhen','Beijing']},
  JPN:{name:'Japan',flag:'🇯',cities:['Tokyo','Osaka']},
  KOR:{name:'South Korea',flag:'🇰🇷',cities:['Seoul','Busan']},
  NGA:{name:'Nigeria',flag:'🇳🇬',cities:['Lagos','Abuja','Ibadan']},
  CMR:{name:'Cameroon',flag:'🇨🇲',cities:['Douala','Yaoundé']},
  ETH:{name:'Ethiopia',flag:'🇪',cities:['Addis Ababa']},
  BGD:{name:'Bangladesh',flag:'🇧🇩',cities:['Dhaka','Chattogram']},
  THA:{name:'Thailand',flag:'🇹🇭',cities:['Bangkok','Chiang Mai']},
  IND:{name:'India',flag:'🇮',cities:['Bengaluru','Mumbai','Delhi']},
  SEN:{name:'Senegal',flag:'🇸',cities:['Dakar']},
  KEN:{name:'Kenya',flag:'🇰🇪',cities:['Nairobi','Mombasa']},
  SOM:{name:'Somalia',flag:'🇸🇴',cities:['Mogadishu']},
  MMR:{name:'Myanmar',flag:'🇲',cities:['Yangon']},
  VNM:{name:'Vietnam',flag:'🇻🇳',cities:['Ho Chi Minh City','Hanoi']},
  COD:{name:'DR Congo',flag:'🇨🇩',cities:['Kinshasa']},
  TZA:{name:'Tanzania',flag:'🇹🇿',cities:['Dar es Salaam']},
  ZAF:{name:'South Africa',flag:'🇿',cities:['Johannesburg','Cape Town']},
  MOZ:{name:'Mozambique',flag:'🇲🇿',cities:['Maputo']},
  AUS:{name:'Australia',flag:'🇦🇺',cities:['Sydney','Melbourne']},
  NZL:{name:'New Zealand',flag:'🇳',cities:['Auckland','Wellington']},
};

/* ---------------- people data ---------------- */
const NAMES = ['Raji','Tunde','Amina','Chidi','Zainab','Yuki','Haruto','Mei','Sora','Priya','Arjun','Ananya','Diego','Mateo','Lucía','Sofía','Elena','Marco','Ava','Liam','Noah','Emma','Oliver','Fatima','Omar','Layla','Kofi','Amara','Naledi','Thabo','Anika','Lukas','Hanna','Petra','Ingrid','Björn','Sana','Ravi','Kenji','Aisha','Bola','Sefu','Yusuf','Grace','Chen','Lina','Olu','Tayo','Femi','Ada','Kwame','Nia','Sam','Zoe','Ivy','Ezra','Dara','Kai','Mila','Theo'];
const FIELDS = [
  {name:'Software & AI',color:'#70a1ff',bios:['Building AI agents and useful software.','Ships small tools that remove daily friction.'],projects:['AI agents for logistics','Open-source map toolkit']},
  {name:'Product Design',color:'#ffd32a',bios:['Designing calm interfaces for loud products.','Fintech UI, one screen at a time.'],projects:['Brand identity for a Lagos fintech','Payment app v2, end to end']},
  {name:'Illustration',color:'#ffa502',bios:['Ink-first illustrator. Streets and peeps.','Vector art with a paper soul.'],projects:['Sticker sheet: Market Day','Zine: Rainy Season']},
  {name:'Music',color:'#ff4757',bios:['Records made in a bedroom studio.','Afrobeats, lo-fi, and loud vocals.'],projects:['EP: Tuesday Nights','Single: Third Mainland']},
  {name:'Film & Photography',color:'#a55eea',bios:['Tells stories on 35mm and 4K.','Documenting street life, one frame at a time.'],projects:['Doc short: Chop Bar Nights','Photo essay: Traffic 8PM']},
  {name:'Writing',color:'#2ed573',bios:['Essays about the internet we keep.','Words first, noise never.'],projects:['Essay series: Slow Internet','Novel draft: Lagos 2077']},
  {name:'Food',color:'#ff6b81',bios:['Cooking as a design problem.','Street food, elevated.'],projects:['Recipe zine: Jollof Vol. 1','Pop-up menu: Adire Spice']},
  {name:'Fashion',color:'#f368e0',bios:['Stitching identity into cloth.','Capsules, not collections.'],projects:['Capsule: Adire Loop','Capsule: Market Days']},
  {name:'Game Dev',color:'#44bd32',bios:['Building tiny worlds with big hearts.','Ships small games, learns big lessons.'],projects:['Indie game: Kano Run','Puzzle game: Grid Ghost']},
  {name:'3D & Motion',color:'#1e90ff',bios:['Motion is a language. Speaks fluently.','Clay, loops, and soft light.'],projects:['Motion reel: Loop 04','3D toy: Clay Peeps']},
  {name:'Meme',color:'#ff9f43',bios:['Documenting the culture in real time.','Honest slop, proudly displayed.'],projects:['Meme study: Based & Human','Series: Peak Slop']},
  {name:'Science',color:'#00d2d3',bios:['Field notes from the lab bench.','Making data feel human.'],projects:['Field notes: Mangroves','Interactive: Climate Atlas']},
];
const INK = '#1e272e';
const OCEAN = '#dfeaf8';
const LAND_EMPTY = '#fff8ee';

/* ---------------- build the world ---------------- */
const N = 100;
const cells = new Array(N*N);       // {ocean, mr, mc, person}
const macros = {};                   // code → {code, capacity, claimed, people:[], instances:[{mr,mc}]}
const allPeople = [];
let seq = 480000;

function makePerson(code, name, field, bio, project, city){
  const f = field || FIELDS[Math.floor(rnd()*FIELDS.length)];
  const g = GEO[code];
  const p = {
    name: name || NAMES[Math.floor(rnd()*NAMES.length)],
    field: f.name, color: f.color,
    bio: bio || f.bios[Math.floor(rnd()*f.bios.length)],
    project: project || f.projects[Math.floor(rnd()*f.projects.length)],
    city: city || g.cities[Math.floor(rnd()*g.cities.length)],
    country: code,
    sh: FIELDS[(FIELDS.indexOf(f)+5)%FIELDS.length].color,
    id: seq++,
  };
  return p;
}

for(let mr=0;mr<10;mr++)for(let mc=0;mc<10;mc++){
  const code = WORLD[mr][mc];
  const land = code !== 'O';
  if(land){
    if(!macros[code]) macros[code] = {code, capacity:0, claimed:0, people:[], instances:[]};
    macros[code].capacity += 100;
    macros[code].instances.push({mr,mc});
  }
  const rate = land ? 0.45 + rnd()*0.5 : 0;
  for(let y=0;y<10;y++)for(let x=0;x<10;x++){
    const i = (mr*10+y)*N + (mc*10+x);
    let person = null;
    if(land && rnd() < rate){
      person = makePerson(code);
      macros[code].claimed++;
      macros[code].people.push(person);
      allPeople.push(person);
    }
    cells[i] = {ocean:!land, mr, mc, person};
  }
}
const totalMapped0 = allPeople.length;
let totalMapped = totalMapped0;
window.__PM = { cells, macros, allPeople, get totalMapped(){ return allPeople.length; }, N };

/* ---------------- peep artwork (existing site generator) ---------------- */
function createPeepArtwork(label, color1, color2){
  label = String(label).toUpperCase().slice(0, 14);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <rect width="600" height="400" fill="#fff8ee"/>
      <rect x="170" y="50" width="260" height="290" rx="16" fill="${color1}" stroke="#1e272e" stroke-width="3.5"/>
      <circle cx="300" cy="150" r="55" fill="#ffffff" stroke="#1e272e" stroke-width="3.5"/>
      <path d="M 245 135 Q 300 85 355 135 C 340 105 260 105 245 135 Z" fill="#1e272e"/>
      <circle cx="280" cy="148" r="14" fill="#ffffff" stroke="#1e272e" stroke-width="3"/>
      <circle cx="320" cy="148" r="14" fill="#ffffff" stroke="#1e272e" stroke-width="3"/>
      <circle cx="280" cy="148" r="4" fill="#1e272e"/>
      <circle cx="320" cy="148" r="4" fill="#1e272e"/>
      <line x1="294" y1="148" x2="306" y2="148" stroke="#1e272e" stroke-width="3"/>
      <path d="M 285 178 Q 300 195 315 178" stroke="#1e272e" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M 230 270 Q 300 205 370 270 L 370 335 L 230 335 Z" fill="${color2}" stroke="#1e272e" stroke-width="3.5"/>
      <rect x="200" y="305" width="200" height="32" rx="16" fill="#ffffff" stroke="#1e272e" stroke-width="2.5"/>
      <text x="300" y="326" fill="#1e272e" font-family="monospace" font-size="13" font-weight="bold" text-anchor="middle" letter-spacing="1.5">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ---------------- toasts (existing pattern) ---------------- */
function showToast(message){
  const container = document.getElementById('toastContainer');
  if(!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fa-solid fa-sparkles"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

/* ==========================================================================
   MAP ENGINE — canvas, pan / pinch / wheel / double-tap, LOD rendering
   ========================================================================== */
const wrap = document.getElementById('mapWrap');
const cv = document.getElementById('mapCanvas');
const ctx = cv.getContext('2d');
const chip = document.getElementById('hoverChip');
const hudView = document.getElementById('hudView');
const hudCount = document.getElementById('hudCount');
const hudZoom = document.getElementById('hudZoom');

let DPR = 1, W = 0, H = 0, base = 8;
const cam = { x: N/2, y: N/2, z: 1 };
let hover = null;
const FONT = (window.getComputedStyle && getComputedStyle(document.body).fontFamily) || 'sans-serif';
const macroAt = (wx, wy) => WORLD[Math.min(9, Math.max(0, (wy/10)|0))][Math.min(9, Math.max(0, (wx/10)|0))];

function resize(){
  const r = wrap.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = r.width; H = r.height;
  cv.width = W * DPR; cv.height = H * DPR;
  base = Math.min(W, H) * 0.92 / N;
  draw();
}
window.addEventListener('resize', resize);
if(window.ResizeObserver) new ResizeObserver(resize).observe(wrap);

/* low-res layer: one canvas pixel per spot */
const low = document.createElement('canvas'); low.width = N; low.height = N;
function rebuildLow(){
  const lc = low.getContext('2d');
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const c = cells[y*N+x];
    lc.fillStyle = c.ocean ? OCEAN : (c.person ? c.person.color : LAND_EMPTY);
    lc.fillRect(x, y, 1, 1);
  }
}
rebuildLow();

function clampCam(){
  cam.z = Math.min(90, Math.max(1, cam.z));
  cam.x = Math.min(N, Math.max(0, cam.x));
  cam.y = Math.min(N, Math.max(0, cam.y));
}

let rafPend = false;
function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle = OCEAN; ctx.fillRect(0,0,W,H);
  const s = base*cam.z, ox = W/2-cam.x*s, oy = H/2-cam.y*s;

  if(s < 20){
    /* macro level: whole-wall bitmap + 10×10 macro grid + region labels */
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, ox, oy, N*s, N*s);
    ctx.strokeStyle = 'rgba(30,39,46,0.5)';
    ctx.lineWidth = 2;
    for(let k=0;k<=10;k++){
      const px = ox + k*10*s, py = oy + k*10*s;
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy+N*s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox+N*s, py); ctx.stroke();
    }
    const mp = 10*s;
    if(mp >= 46){
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      for(let mr=0;mr<10;mr++)for(let mc=0;mc<10;mc++){
        const code = WORLD[mr][mc];
        if(code === 'O') continue;
        ctx.font = `700 ${Math.min(mp*0.2, 20)}px ${FONT}`;
        ctx.fillText(code, ox + (mc*10+5)*s, oy + (mr*10+5)*s + mp*0.06);
      }
    }
  } else {
    /* cell level: per-spot rendering with detail LOD */
    const x0 = Math.max(0, Math.floor(-ox/s)), x1 = Math.min(N-1, Math.ceil((W-ox)/s));
    const y0 = Math.max(0, Math.floor(-oy/s)), y1 = Math.min(N-1, Math.ceil((H-oy)/s));
    ctx.textAlign = 'center';
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const c = cells[y*N+x], px = ox+x*s, py = oy+y*s;
      if(c.ocean){ ctx.fillStyle = OCEAN; ctx.fillRect(px,py,s,s); continue; }
      if(!c.person){ ctx.fillStyle = LAND_EMPTY; ctx.fillRect(px,py,s,s); continue; }
      const p = c.person;
      ctx.fillStyle = p.color;
      ctx.fillRect(px+1, py+1, s-2, s-2);
      if(s >= 24){
        ctx.strokeStyle = INK; ctx.lineWidth = Math.min(2.5, s*0.06);
        ctx.strokeRect(px+1, py+1, s-2, s-2);
        ctx.fillStyle = INK;
        ctx.font = `700 ${Math.max(9, s*0.4)}px ${FONT}`;
        ctx.fillText(p.name.slice(0,2), px+s/2, py+s*0.62);
        if(s >= 64){
          ctx.font = `700 ${Math.min(13, s*0.14)}px ${FONT}`;
          const nm = p.name.length > 12 ? p.name.slice(0,11)+'…' : p.name;
          ctx.fillText(nm, px+s/2, py+s+Math.min(13, s*0.16));
        }
      }
    }
    /* macro gridlines stay visible at cell zoom */
    ctx.strokeStyle = 'rgba(30,39,46,0.35)';
    ctx.lineWidth = 2;
    for(let k=0;k<=10;k++){
      const px = ox + k*10*s, py = oy + k*10*s;
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy+N*s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox+N*s, py); ctx.stroke();
    }
  }

  if(hover){
    const c = cells[hover.y*N+hover.x];
    if(c && !c.ocean){
      ctx.strokeStyle = 'rgba(30,39,46,0.9)'; ctx.lineWidth = 2;
      ctx.strokeRect(ox+hover.x*s+1, oy+hover.y*s+1, s-2, s-2);
    }
  }
  updateHud(s);
}
function queueDraw(){ if(!rafPend){ rafPend = true; requestAnimationFrame(() => { rafPend = false; draw(); }); } }

function updateHud(s){
  const code = macroAt(cam.x, cam.y);
  hudView.textContent = (cam.z < 2.2 || code === 'O') ? 'WORLD' : GEO[code].name.toUpperCase();
  hudCount.textContent = allPeople.length.toLocaleString('en-US');
  hudZoom.textContent = cam.z.toFixed(1) + '×';
}

function zoomAt(px, py, nz){
  nz = Math.min(90, Math.max(1, nz));
  const r = cv.getBoundingClientRect();
  const s0 = base*cam.z, s1 = base*nz;
  const wx = cam.x + (px-(r.left+W/2))/s0, wy = cam.y + (py-(r.top+H/2))/s0;
  cam.z = nz;
  cam.x = wx - (px-(r.left+W/2))/s1;
  cam.y = wy - (py-(r.top+H/2))/s1;
  clampCam(); queueDraw();
}

/* ---- pointer: pan / pinch / tap / hover ---- */
const pts = new Map();
let down = null, pinch0 = 0, z0 = 1;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if(pts.size === 1){ down = {x: e.clientX, y: e.clientY, t: performance.now(), moved: 0}; cv.classList.add('drag'); hideChip(); }
  else { down = null; const p = [...pts.values()]; pinch0 = Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y); z0 = cam.z; }
});
cv.addEventListener('pointermove', e => {
  const p = pts.get(e.pointerId);
  if(!p){
    if(e.pointerType === 'mouse') trackHover(e);
    return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if(pts.size === 1 && down){
    down.moved += Math.abs(dx) + Math.abs(dy);
    const s = base*cam.z;
    cam.x -= dx/s; cam.y -= dy/s;
    clampCam(); queueDraw();
  } else if(pts.size === 2){
    const q = [...pts.values()];
    const d = Math.hypot(q[0].x-q[1].x, q[0].y-q[1].y);
    if(pinch0 > 0 && d > 0) zoomAt((q[0].x+q[1].x)/2, (q[0].y+q[1].y)/2, z0*(d/pinch0));
  }
});
function endPtr(e){
  const had = pts.has(e.pointerId);
  pts.delete(e.pointerId);
  if(pts.size === 0){
    cv.classList.remove('drag');
    if(down && had && down.moved < 8 && performance.now()-down.t < 500) tapAt(e.clientX, e.clientY);
    down = null;
  }
  pinch0 = 0;
}
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, cam.z*Math.exp(-e.deltaY*0.0016)); }, {passive:false});
cv.addEventListener('dblclick', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, cam.z*2); });
cv.addEventListener('mouseleave', hideChip);

function cellFromScreen(px, py){
  const r = cv.getBoundingClientRect();
  const s = base*cam.z;
  const wx = cam.x + (px-(r.left+W/2))/s;
  const wy = cam.y + (py-(r.top+H/2))/s;
  const x = Math.floor(wx), y = Math.floor(wy);
  return (x>=0 && y>=0 && x<N && y<N) ? {x, y} : null;
}
function trackHover(e){
  const c = cellFromScreen(e.clientX, e.clientY);
  if(!c){ hover = null; hideChip(); queueDraw(); return; }
  const same = hover && hover.x === c.x && hover.y === c.y;
  hover = c;
  if(same) return;
  const d = cells[c.y*N+c.x];
  const r = wrap.getBoundingClientRect();
  chip.style.display = 'block';
  chip.style.left = (e.clientX - r.left + 14) + 'px';
  chip.style.top = (e.clientY - r.top + 14) + 'px';
  if(d.ocean) chip.textContent = 'Open ocean';
  else if(d.person) chip.textContent = `${d.person.name} · ${d.person.city}, ${GEO[d.person.country].name}`;
  else chip.textContent = `Empty spot · ${GEO[WORLD[c.y][c.x]].name}`;
  queueDraw();
}
function hideChip(){ chip.style.display = 'none'; }

function tapAt(px, py){
  const c = cellFromScreen(px, py);
  if(!c) return;
  const d = cells[c.y*N+c.x];
  if(d.ocean){ showToast('Open ocean — nobody here yet. 🌊'); return; }
  if(d.person){ openPerson(d.person, c.x, c.y); return; }
  openClaim(GEO[WORLD[c.y][c.x]].name, c.y, c.x);
}

/* ---- fly animation ---- */
function fly(tx, ty, tz, after){
  const f = {x: cam.x, y: cam.y, z: cam.z}, t0 = performance.now(), D = 800;
  function step(t){
    const k = Math.min(1, (t-t0)/D), e = 1-Math.pow(1-k,3);
    cam.x = f.x + (tx-f.x)*e;
    cam.y = f.y + (ty-f.y)*e;
    cam.z = f.z + (tz-f.z)*e;
    clampCam(); draw();
    if(k < 1) requestAnimationFrame(step);
    else if(after) after();
  }
  requestAnimationFrame(step);
}
function flyToCountry(code){
  const inst = macros[code].instances[0];
  fly(inst.mc*10+5, inst.mr*10+5, 6);
}
function explore(){
  if(!allPeople.length) return;
  const p = allPeople[Math.floor(Math.random()*allPeople.length)];
  const i = p._i;
  const x = i % N, y = (i / N) | 0;
  fly(x+0.5, y+0.5, 8, () => {
    openPerson(p, x, y);
    showToast(`${GEO[p.country].flag} ${p.city}, ${GEO[p.country].name}`);
  });
}
/* index cache for people (cell position) */
for(let i=0;i<N*N;i++) if(cells[i].person) cells[i].person._i = i;

/* ---- controls ---- */
document.getElementById('pmIn').onclick = () => zoomAt(W/2, H/2, cam.z*1.8);
document.getElementById('pmOut').onclick = () => zoomAt(W/2, H/2, cam.z/1.8);
document.getElementById('pmHome').onclick = () => fly(N/2, N/2, 1);
document.getElementById('pmDice').onclick = explore;
document.getElementById('pmExplore').onclick = explore;
document.getElementById('pmCountries').onclick = () => openDock('countries');
document.getElementById('pmClaim').onclick = () => openClaim();
document.getElementById('introExplore').onclick = explore;
document.getElementById('introClaim').onclick = () => openClaim();
document.getElementById('introClose').onclick = () => document.getElementById('intro').style.display = 'none';
document.getElementById('dockClose').onclick = closeDock;

/* ==========================================================================
   DOCK — person card / claim form / countries
   ========================================================================== */
const dock = document.getElementById('dock');
const views = { person: document.getElementById('viewPerson'), claim: document.getElementById('viewClaim'), countries: document.getElementById('viewCountries') };
function openDock(name){
  Object.keys(views).forEach(k => views[k].hidden = (k !== name));
  dock.classList.add('open');
}
function closeDock(){ dock.classList.remove('open'); }
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeDock(); });

function openPerson(p, x, y){
  const g = GEO[p.country];
  document.getElementById('pmAvatar').src = createPeepArtwork(p.name, p.color, p.sh);
  const badge = document.getElementById('pmBadge');
  badge.textContent = p.field.toUpperCase();
  badge.style.background = p.color;
  document.getElementById('pmName').textContent = p.name;
  document.getElementById('pmField').textContent = p.field;
  document.getElementById('pmLoc').textContent = `${g.flag} ${p.city}, ${g.name}`;
  document.getElementById('pmBio').textContent = p.bio;
  document.getElementById('pmProjectArt').src = createPeepArtwork(p.project, p.sh, p.color);
  document.getElementById('pmProject').textContent = p.project;
  document.getElementById('pmMeta').textContent = p.spots > 1
    ? `TURF F. #${p.id.toLocaleString('en-US')} · ${p.spots} SPOTS`
    : `TURF F. #${p.id.toLocaleString('en-US')}`;
  document.getElementById('pmVisit').onclick = () => showToast('Mock link — opens ' + p.name + '’s profile');
  document.getElementById('pmView').onclick = () => showToast('Mock link — opens “' + p.project + '”');
  openDock('person');
}

/* ---- claim form ---- */
function openClaim(prefillCountry, mr, mc){
  const sel = document.getElementById('cfCountry');
  if(prefillCountry){
    const code = Object.keys(GEO).find(k => GEO[k].name === prefillCountry);
    if(code) sel.value = code;
  }
  syncCityPlaceholder();
  openDock('claim');
}
function syncCityPlaceholder(){
  const code = document.getElementById('cfCountry').value;
  document.getElementById('cfCity').placeholder = GEO[code] ? GEO[code].cities[0] : 'Your city';
}
function buildClaimForm(){
  const fieldSel = document.getElementById('cfField');
  fieldSel.innerHTML = FIELDS.map(f => `<option value="${f.name}">${f.name}</option>`).join('');
  const countrySel = document.getElementById('cfCountry');
  const codes = Object.keys(macros).sort((a,b) => GEO[a].name.localeCompare(GEO[b].name));
  countrySel.innerHTML = codes.map(c => `<option value="${c}">${GEO[c].flag} ${GEO[c].name}</option>`).join('');
  countrySel.value = 'NGA';

  const preview = document.getElementById('claimPreview');
  function refreshPreview(){
    const name = document.getElementById('cfName').value.trim() || 'YOU';
    const field = FIELDS.find(f => f.name === fieldSel.value);
    preview.src = createPeepArtwork(name, field.color, FIELDS[(FIELDS.indexOf(field)+5)%FIELDS.length].color);
    document.getElementById('claimPreviewTag').textContent = name.toUpperCase().slice(0,14) + ' · PREVIEW';
  }
  document.getElementById('cfName').addEventListener('input', refreshPreview);
  fieldSel.addEventListener('change', refreshPreview);
  countrySel.addEventListener('change', syncCityPlaceholder);
  refreshPreview();

  document.querySelectorAll('.spot-chip').forEach(l => l.addEventListener('click', () => {
    document.querySelectorAll('.spot-chip').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('input[name="spots"]').forEach(r => r.checked = false);
    l.classList.add('active');
    l.querySelector('input').checked = true;
  }));

  document.getElementById('cfSubmit').onclick = claim;
}

function findRun(code, n){
  /* first free horizontal run of n cells in the emptiest instance of the country */
  const insts = [...macros[code].instances].sort((a,b) => {
    const ca = a.mr*100+a.mc, cb = b.mr*100+b.mc;
    return ca-cb;
  });
  for(const inst of insts){
    for(let y=0;y<10;y++)for(let x=0;x<=10-n;x++){
      let ok = true;
      for(let k=0;k<n;k++){
        const d = cells[(inst.mr*10+y)*N + (inst.mc*10+x+k)];
        if(d.ocean || d.person){ ok = false; break; }
      }
      if(ok) return Array.from({length:n}, (_,k) => ({x: inst.mc*10+x+k, y: inst.mr*10+y}));
    }
  }
  return null;
}

function claim(){
  const name = document.getElementById('cfName').value.trim();
  if(!name){ showToast('Add your name first ✍️'); return; }
  const bio = document.getElementById('cfBio').value.trim();
  const field = FIELDS.find(f => f.name === document.getElementById('cfField').value);
  const code = document.getElementById('cfCountry').value;
  const city = document.getElementById('cfCity').value.trim() || GEO[code].cities[0];
  const project = document.getElementById('cfProject').value.trim();
  const spots = +document.querySelector('input[name="spots"]:checked').value;

  const person = makePerson(code, name, field, bio || FIELDS.find(f=>f.name===field.name).bios[0], project, city);
  person.spots = spots;

  let positions = spots > 1 ? findRun(code, spots) : null;
  if(!positions){
    positions = [];
    const empties = [];
    for(const inst of macros[code].instances)
      for(let y=0;y<10;y++)for(let x=0;x<10;x++){
        const d = cells[(inst.mr*10+y)*N + (inst.mc*10+x)];
        if(!d.ocean && !d.person) empties.push({x: inst.mc*10+x, y: inst.mr*10+y});
      }
    for(let k=0;k<spots && empties.length;k++) positions.push(empties.splice(Math.floor(Math.random()*empties.length),1)[0]);
  }
  if(!positions.length){ showToast(GEO[code].name + ' is full — try another country.'); return; }

  positions.forEach(pos => {
    cells[pos.y*N+pos.x].person = person;
    macros[code].claimed++;
    macros[code].people.push(person);
  });
  person._i = positions[0].y*N + positions[0].x;
  allPeople.push(person);
  rebuildLow();
  closeDock();
  fly(person._i % N + 0.5, ((person._i / N)|0) + 0.5, spots > 1 ? 5 : 8, () => openPerson(person));
  showToast(`You’re on the turf, F. 🌍 #${person.id.toLocaleString('en-US')}`);
  refreshIntroCount();
}

/* ---- countries view ---- */
function buildCountries(){
  const list = document.getElementById('countryList');
  const rows = Object.values(macros).sort((a,b) => b.claimed - a.claimed);
  list.innerHTML = rows.map(m => {
    const pct = (m.claimed / m.capacity) * 100;
    const toNext = m.capacity - m.claimed;
    return `
      <div class="country-row" data-code="${m.code}">
        <span class="country-flag">${GEO[m.code].flag}</span>
        <span class="country-name">${GEO[m.code].name}</span>
        <span class="country-count">${m.claimed.toLocaleString('en-US')}</span>
        <span class="country-bar"><span class="fill" style="transform:scaleX(${pct/100})"></span></span>
        <span class="country-mile">${toNext > 0 ? (toNext + ' SPOTS TO ' + m.capacity) : 'FULLY MAPPED'}</span>
      </div>`;
  }).join('');
  list.querySelectorAll('.country-row').forEach(r => r.addEventListener('click', () => {
    closeDock();
    flyToCountry(r.dataset.code);
    showToast(GEO[r.dataset.code].flag + ' ' + GEO[r.dataset.code].name + ' — ' + macros[r.dataset.code].claimed.toLocaleString('en-US') + ' on the turf');
  }));
}

function refreshIntroCount(){
  totalMapped = allPeople.length;
  document.getElementById('introCount').textContent = totalMapped.toLocaleString('en-US') + ' ON THE TURF — AND COUNTING';
  buildCountries();
}

/* ---- init ---- */
buildClaimForm();
buildCountries();
refreshIntroCount();
resize();
