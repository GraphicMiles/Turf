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

/* ---------------- XSS defense (SECURITY_AUDIT.md C2) ----------------
   All claim data (name/city/field/…) is attacker-controllable text that
   reaches innerHTML sinks below — escape EVERY untrusted value. */
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
/* only https images may enter <img src> */
function safeImgSrc(u){ return (typeof u === 'string' && /^https:\/\//.test(u)) ? u : ''; }

/* ---------------- toasts (existing pattern) ---------------- */
function showToast(message){
  const container = document.getElementById('toastContainer');
  if(!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fa-solid fa-sparkles"></i> <span>${esc(message)}</span>`;
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
/* ---- country flags: every empty land tile wears its country's flag ---- */
const flagCache = {};        /* code -> HTMLImageElement (false while loading) */
let flagPalette = null;      /* flags/palette.json — muted national tint per country */
function flagTint(code){
  const f = flagPalette && flagPalette[code];
  if(!f) return LAND_EMPTY;
  return 'rgb(' + Math.round(f[0]*0.62 + 255*0.38) + ',' + Math.round(f[1]*0.62 + 248*0.38) + ',' + Math.round(f[2]*0.62 + 238*0.38) + ')';
}
function getFlag(code){
  if(flagCache[code]) return flagCache[code];
  flagCache[code] = false;
  const img = new Image();
  img.onload = () => { flagCache[code] = img; draw(); };
  img.src = 'flags/' + code + '.png';
  return false;
}
function preloadFlags(){ Object.keys(macros).forEach(getFlag); }
/* ---- user image reveal: faint -> clear as you zoom in ---- */
function revealAlpha(s){
  if(s < 30) return 0.35;
  if(s < 44) return 0.6;
  if(s < 60) return 0.85;
  return 1;
}
function drawCover(ctx2, img, dx, dy, dw, dh){
  const ia = img.naturalWidth / img.naturalHeight;
  const ba = dw / dh;
  let sw, sh, sx, sy;
  if(ia > ba){ sh = img.naturalHeight; sw = sh * ba; sx = (img.naturalWidth - sw) / 2; sy = 0; }
  else { sw = img.naturalWidth; sh = sw / ba; sx = 0; sy = (img.naturalHeight - sh) / 2; }
  ctx2.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
const personArtCache = {};
function personArtKey(p){
  return (p.image ? 'u:' + p.image : 'p:' + p.name + '|' + p.color + '|' + p.sh) + '@' + (p._i !== undefined ? p._i : p.id);
}
function personArt(p){
  const k = personArtKey(p);
  let img = personArtCache[k];
  if(!img){
    img = new Image();
    img.onload = () => { draw(); };
    img.src = p.image || createPeepArtwork(p.name, p.color, p.sh);
    personArtCache[k] = img;
  }
  return img;
}
/* longest contiguous horizontal run of a person's cells (full-block image) */
function computeRun(cellList){
  if(!cellList || cellList.length < 2) return null;
  const rows = {};
  cellList.forEach(i => { const y = (i / N) | 0, x = i % N; (rows[y] = rows[y] || new Set()).add(x); });
  let best = null;
  for(const yStr in rows){
    const y = +yStr;
    const xs = [...rows[yStr]].sort((a,b) => a-b);
    let start = xs[0], prev = xs[0];
    const flush = () => { const n = prev - start + 1; if(n >= 2 && (!best || n > best.n)) best = {x:start, y:y, n:n}; };
    for(let k=1;k<xs.length;k++){
      if(xs[k] === prev+1) prev = xs[k];
      else { flush(); start = xs[k]; prev = xs[k]; }
    }
    flush();
  }
  return best;
}
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
    ctx.drawImage(lowLayer || low, ox, oy, N*s, N*s);
    ctx.strokeStyle = 'rgba(30,39,46,0.5)';
    ctx.lineWidth = 2;
    for(let k=0;k<=10;k++){
      const px = ox + k*10*s, py = oy + k*10*s;
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy+N*s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox+N*s, py); ctx.stroke();
    }
    const mp = 10*s;
    if(mp >= 28){
      /* zoomed out: each country box shows its flag (no initials) */
      for(let mr=0;mr<10;mr++)for(let mc=0;mc<10;mc++){
        const code = WORLD[mr][mc];
        if(code === 'O') continue;
        const fl = flagCache[code];
        if(fl && fl.complete && fl.naturalWidth){
          const fs3 = mp * 0.92;
          ctx.drawImage(fl, ox + mc*10*s + (mp-fs3)/2, oy + mr*10*s + (mp-fs3)/2, fs3, fs3);
        }
        if(s >= 2.5){
          /* claimed spots stay visible over the flag */
          for(let yy=0;yy<10;yy++)for(let xx=0;xx<10;xx++){
            const c2 = cells[(mr*10+yy)*N + (mc*10+xx)];
            if(c2 && c2.person){
              ctx.fillStyle = c2.person.color;
              const d = Math.max(2, s);
              ctx.fillRect(ox + (mc*10+xx)*s, oy + (mr*10+yy)*s, d, d);
            }
          }
        }
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
      if(!c.person){
        ctx.fillStyle = LAND_EMPTY;
        ctx.fillRect(px,py,s,s);
        continue;
      }
      const p = c.person;
      ctx.fillStyle = p.color;
      ctx.fillRect(px+1, py+1, s-2, s-2);
      if(s >= 24){
        ctx.strokeStyle = INK; ctx.lineWidth = Math.min(2.5, s*0.06);
        ctx.strokeRect(px+1, py+1, s-2, s-2);
        /* user image reveal: faint at mid zoom -> clear at high zoom */
        const a = revealAlpha(s);
        const img = personArt(p);
        const loaded = img && img.complete && img.naturalWidth > 0;
        const n = p._run ? p._run.n : 1;
        const inRun = p._run && y === p._run.y && x >= p._run.x && x < p._run.x + p._run.n;
        const isAnchor = p._run && x === p._run.x && y === p._run.y;
        const ia = loaded ? (img.naturalWidth / img.naturalHeight) : 0;
        const blockFit = loaded && n > 1 && ia >= n*0.7 && ia <= n*1.35;
        if(inRun && isAnchor && blockFit){
          /* aspect fits the block: ONE image across all owned boxes */
          ctx.globalAlpha = a;
          drawCover(ctx, img, px+1, py+1, n*s-2, s-2);
          ctx.globalAlpha = 1;
        } else if(inRun && blockFit){
          /* covered by the anchor's full-block image */
        } else {
          /* aspect doesn't fit (or single box): repeat the image in each box */
          if(loaded){
            ctx.globalAlpha = a;
            drawCover(ctx, img, px+1, py+1, s-2, s-2);
            ctx.globalAlpha = 1;
          } else {
            ctx.globalAlpha = a;
            ctx.fillStyle = INK;
            ctx.font = `700 ${Math.max(9, s*0.4)}px ${FONT}`;
            ctx.fillText(p.name.slice(0,2), px+s/2, py+s*0.62);
            ctx.globalAlpha = 1;
          }
        }
        if(s >= 64){
          ctx.font = `700 ${Math.min(13, s*0.14)}px ${FONT}`;
          const nm = p.name.length > 12 ? p.name.slice(0,11)+'…' : p.name;
          ctx.fillText(nm, px+s/2, py+s+Math.min(13, s*0.16));
        }
        if(p.position && p.position <= 20){
          /* Top 20 — highest visibility: gold ring */
          ctx.strokeStyle = '#ffd32a';
          ctx.lineWidth = Math.max(2, s*0.09);
          ctx.strokeRect(px+s*0.13, py+s*0.13, s*0.74, s*0.74);
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
  maybeLoadSectors();
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
document.getElementById('pmTop20').onclick = () => { buildTop20(); openDock('top20'); };
document.getElementById('pmMyTurf').onclick = openMyTurf;
document.getElementById('pmClaim').onclick = () => openClaim();
document.getElementById('introExplore').onclick = explore;
document.getElementById('introClaim').onclick = () => openClaim();
document.getElementById('introClose').onclick = () => document.getElementById('intro').style.display = 'none';
document.getElementById('dockClose').onclick = closeDock;

/* ==========================================================================
   DOCK — person card / claim form / countries
   ========================================================================== */
const dock = document.getElementById('dock');
const views = { person: document.getElementById('viewPerson'), claim: document.getElementById('viewClaim'), top20: document.getElementById('viewTop20'), myturf: document.getElementById('viewMyTurf'), countries: document.getElementById('viewCountries') };
function openDock(name){
  Object.keys(views).forEach(k => views[k].hidden = (k !== name));
  dock.classList.add('open');
}
function closeDock(){ dock.classList.remove('open'); }
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeDock(); });

function openPerson(p, x, y){
  const g = GEO[p.country];
  document.getElementById('pmAvatar').src = safeImgSrc(p.image) || createPeepArtwork(p.name, p.color, p.sh);
  const badge = document.getElementById('pmBadge');
  const top20 = p.position && p.position <= 20;
  badge.textContent = (top20 ? '⭐ TOP 20 · ' : '') + p.field.toUpperCase();
  badge.style.background = top20 ? 'var(--accent-yellow)' : p.color;
  document.getElementById('pmName').textContent = p.name;
  document.getElementById('pmField').textContent = p.field;
  document.getElementById('pmLoc').innerHTML = '<img class="flag-img" src="flags/' + p.country + '.png" alt=""> ' + p.city + ', ' + g.name;
  document.getElementById('pmBio').textContent = p.bio;
  document.getElementById('pmProjectArt').src = createPeepArtwork(p.project, p.sh, p.color);
  document.getElementById('pmProject').textContent = p.project;
  const posTxt = p.position ? ' · POSITION #' + p.position.toLocaleString('en-US') + (p.position <= 20 ? ' — TOP 20 ⭐' : '') : '';
  document.getElementById('pmMeta').textContent = (p.real || p.demo)
    ? 'TURF F. · ' + (p.founder ? 'FOUNDER SPOT ⭐' : (p.demo ? 'DEMO' : 'PAID CLAIM')) + (p.spots > 1 ? ' · ' + p.spots + ' SPOTS' : '') + posTxt
    : 'TURF F. #' + p.id.toLocaleString('en-US') + (p.spots > 1 ? ' · ' + p.spots + ' SPOTS' : '');
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
  updateClaimUI();
  fetchClaimMode();
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

  const photoBtn = document.getElementById('photoBtn');
  const photoInput = document.getElementById('photoInput');
  if(photoBtn && photoInput){
    photoBtn.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files && photoInput.files[0];
      if(!file) return;
      try{
        const p = await compressImage(file);
        pendingPhoto = p;
        document.getElementById('claimPreview').src = p.dataUrl;
        document.getElementById('claimPreviewTag').textContent = 'YOUR PHOTO';
        document.getElementById('photoNote').textContent = 'PHOTO ADDED ✓';
      }catch(e){
        document.getElementById('photoNote').textContent = 'COULD NOT READ THAT IMAGE';
      }
      photoInput.value = '';
    });
  }
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

/* ==========================================================================
   CLAIM FLOW
   Founder tier: the first 200 real claims are FREE. Once the count passes
   200, payment (Bachs) activates. Works three ways:
     • live free  — backend stores a 'free' claim, no payment
     • live paid  — Bachs overlay, webhook confirms, poll for UX
     • demo       — no backend/SDK (static preview) → placed locally
   ========================================================================== */
const FOUNDER_LIMIT = 200;
let founderCount = 0;        // real claims so far (server-synced when live)
let claimMode = 'free';      // 'free' | 'paid' | 'demo'
let pendingCheckoutId = null;
let pendingEditCode = null;
let demoSeq = 490000;
let demoPosition = 0;
/* ---- live mode (Vercel + Supabase) vs demo mode (static preview) ---- */
let MODE = 'demo';            /* 'demo' | 'live' */
let lowLayer = null;          /* server world bitmap; falls back to the local mock canvas */
let liveLoaded = new Set();   /* sector (macro) keys already fetched */
let liveCountryCounts = null; /* from /api/summary */
let liveTop20 = [];           /* from /api/summary */
let liveTotal = 0;            /* from /api/summary */
let pendingPhoto = null;      /* { blob, dataUrl } for the claim form */      // local rank counter (demo mode); live rows carry `position`

function isFreeClaim(){ return claimMode !== 'paid' && founderCount < FOUNDER_LIMIT; }
function freeRemaining(){ return Math.max(0, FOUNDER_LIMIT - founderCount); }

function makeRealPerson(d){
  const f = FIELDS.find(x => x.name === d.field) || FIELDS[0];
  return {
    name: d.name, field: f.name, color: f.color,
    bio: d.bio || f.bios[0],
    project: d.project || 'Their first project',
    city: d.city || GEO[d.country].cities[0],
    country: d.country,
    sh: FIELDS[(FIELDS.indexOf(f) + 5) % FIELDS.length].color,
    web: d.web || null, social: d.social || null,
    real: true, demo: false, founder: false, spots: d.spots || 1,
  };
}

function updateClaimUI(){
  const sub = document.getElementById('claimSub');
  const label = document.getElementById('cfSubmitLabel');
  const chips = document.querySelectorAll('#spotChips .spot-chip span');
  const cd = document.getElementById('claimCountdown');
  const cdNum = document.getElementById('countdownNum');
  const cdFill = document.getElementById('countdownFill');
  const cdSub = document.getElementById('countdownSub');
  const remaining = freeRemaining();
  if(isFreeClaim()){
    if(sub) sub.innerHTML = 'A piece of Earth. Forever. <b>FREE</b> — founder tier.';
    if(label) label.textContent = 'Claim free → founder spot';
    if(chips.length === 3){
      chips[0].textContent = '1 spot · FREE';
      chips[1].textContent = '5 spots · FREE';
      chips[2].textContent = '10 spots · FREE';
    }
    if(cd) cd.classList.remove('paid');
    if(cdNum) cdNum.textContent = remaining.toLocaleString('en-US');
    if(cdFill) cdFill.style.transform = 'scaleX(' + (remaining / FOUNDER_LIMIT) + ')';
    if(cdSub) cdSub.textContent = 'FIRST 200 CLAIMS ARE FREE — WHEN IT HITS 0, PAYMENT ACTIVATES';
  } else {
    if(sub) sub.innerHTML = 'A piece of Earth. Forever. <b>₦100</b>.';
    if(label) label.textContent = 'Place me on the turf →';
    if(chips.length === 3){
      chips[0].textContent = '1 spot · ₦100';
      chips[1].textContent = '5 spots · ₦500';
      chips[2].textContent = '10 spots · ₦1,000';
    }
    if(cd) cd.classList.add('paid');
    if(cdNum) cdNum.textContent = '0';
    if(cdFill) cdFill.style.transform = 'scaleX(0)';
    if(cdSub) cdSub.textContent = 'FOUNDER TIER COMPLETE — ₦100 PER SPOT, PAID THROUGH BACHS';
  }
}

async function fetchClaimMode(){
  try{
    const r = await fetch('api/claim-mode', { cache: 'no-store' });
    if(!r.ok) return;
    const m = await r.json();
    if(m && typeof m.count === 'number'){
      claimMode = m.mode === 'paid' ? 'paid' : (m.mode === 'demo' ? 'demo' : 'free');
      founderCount = m.count;
      updateClaimUI();
    }
  }catch(e){ /* offline / static preview → local demo counter */ }
}

function readClaimForm(){
  return {
    name: document.getElementById('cfName').value.trim(),
    bio: document.getElementById('cfBio').value.trim(),
    field: document.getElementById('cfField').value,
    country: document.getElementById('cfCountry').value,
    city: document.getElementById('cfCity').value.trim(),
    project: document.getElementById('cfProject').value.trim(),
    web: document.getElementById('cfWeb').value.trim(),
    social: document.getElementById('cfSocial').value.trim(),
    spots: +document.querySelector('input[name="spots"]:checked').value,
  };
}

function claim(){
  const d = readClaimForm();
  if(!d.name){ showToast('Add your name first ✍️'); return; }
  const netReady = typeof fetch === 'function';
  const bachsReady = typeof Bachs !== 'undefined' && Bachs && Bachs.Checkout;

  if(isFreeClaim()){
    if(netReady){ startFreeClaim(d); return; }
    founderCount++; updateClaimUI();
    placeLocalPerson(d, 'You’re on the turf, F. ⭐ Founder spot #' + founderCount.toLocaleString('en-US'));
    return;
  }
  /* paid tier */
  if(netReady && bachsReady){ startLiveClaim(d); return; }
  founderCount++; updateClaimUI();
  placeLocalPerson(d, 'Demo mode — ' + (bachsReady ? 'backend unreachable' : 'payments go live on the deployed site') + '. Placed you locally.');
}

/* ---- live mode: probe, world bitmap, sector lazy-load, summary ---- */
async function probeLive(){
  if(typeof fetch !== 'function') return; /* static preview → demo world */
  try{
    const r = await fetch('api/claim-mode', { cache: 'no-store' });
    if(r.ok){
      const m = await r.json();
      if(m && typeof m.count === 'number'){
        MODE = 'live';
        claimMode = m.mode === 'paid' ? 'paid' : 'free';
        founderCount = m.count;
        allPeople.length = 0;               /* in live mode the world = real claims */
        cells.forEach(c => { c.person = null; });
        rebuildLow();
        updateClaimUI();
        fetchWorldBitmap();
        fetchSummary();
        draw();
        return;
      }
    }
  }catch(e){ /* offline → demo */ }
  loadRealClaims();
}

async function fetchWorldBitmap(){
  try{
    const r = await fetch('api/worldmap.png', { cache: 'no-store' });
    if(!r.ok) return;
    const blob = await r.blob();
    const img = new Image();
    img.onload = () => { lowLayer = img; draw(); };
    img.src = URL.createObjectURL(blob);
  }catch(e){ /* keep the local layer */ }
}

async function fetchSummary(){
  try{
    const r = await fetch('api/summary', { cache: 'no-store' });
    if(!r.ok) return;
    const sm = await r.json();
    liveTotal = sm.total || 0;
    liveCountryCounts = sm.byCountry || null;
    liveTop20 = sm.top20 || [];
    if(sm.totalVisits) liveVisits = sm.totalVisits;
    if(typeof sm.onlineNow === 'number') lastOnline = sm.onlineNow;
    if(sm.launchIso) launchIso = sm.launchIso;
    refreshLiveStats();
    refreshIntroCount();
    buildCountries();
    buildTop20();
  }catch(e){}
}

function loadSector(k){
  if(liveLoaded.has(k)) return Promise.resolve();
  liveLoaded.add(k);
  return fetch('api/claims?macro=' + k)
    .then(r => r.ok ? r.json() : [])
    .then(list => { (list || []).forEach(cl => placeLiveClaim(cl, false)); draw(); })
    .catch(() => {});
}

function maybeLoadSectors(){
  if(MODE !== 'live') return;
  const s2 = base * cam.z;
  if(s2 < 26) return; /* world zoom: the bitmap already carries all colors */
  const ox = W/2 - cam.x*s2, oy = H/2 - cam.y*s2;
  const x0 = Math.max(0, Math.floor(-ox/s2)), x1 = Math.min(N-1, Math.ceil((W-ox)/s2));
  const y0 = Math.max(0, Math.floor(-oy/s2)), y1 = Math.min(N-1, Math.ceil((H-oy)/s2));
  for(let mr = Math.floor(y0/10); mr <= Math.min(9, Math.floor(y1/10)); mr++)
    for(let mc = Math.floor(x0/10); mc <= Math.min(9, Math.ceil(x1/10)); mc++)
      if(mr >= 0 && mc >= 0) loadSector(mr + '-' + mc);
}

function placeLiveClaim(cl, animate){
  const p = makeRealPerson(cl);
  p.image = cl.image_url || null;
  p.founder = cl.status === 'free';
  p.position = cl.position || null;
  let first = null;
  (cl.cells || []).forEach(i => {
    const c = cells[i];
    if(c && !c.ocean && !c.person){ c.person = p; if(first === null) first = i; }
  });
  if(first === null) return;
  p._i = first;
  p._run = computeRun(cl.cells);
  allPeople.push(p);
  if(animate){
    fly(p._i % N + 0.5, ((p._i / N)|0) + 0.5, cl.spots > 1 ? 5 : 8, () => openPerson(p));
    showToast(cl.status === 'free'
      ? 'You\u2019re on the turf, F. \u2B50 Founder spot secured!'
      : 'You\u2019re on the turf, F. \uD83C\uDF0D' + (cl.spots > 1 ? ' \u00B7 ' + cl.spots + ' spots' : ''));
    refreshIntroCount();
    buildTop20();
  }
}

function compressImage(file){
  return new Promise((resolve, reject) => {
    try{
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        try{
          const S = 512;
          const scale = Math.min(1, S / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const cv2 = document.createElement('canvas');
          cv2.width = w; cv2.height = h;
          cv2.getContext('2d').drawImage(img, 0, 0, w, h);
          const dataUrl = cv2.toDataURL('image/webp', 0.8);
          cv2.toBlob(b => {
            URL.revokeObjectURL(url);
            if(b) resolve({ blob: b, dataUrl: dataUrl });
            else reject(new Error('could not compress image'));
          }, 'image/webp', 0.8);
        }catch(e2){ URL.revokeObjectURL(url); reject(e2); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
      img.src = url;
    }catch(e){ reject(e); }
  });
}

async function tryUploadPhoto(d){
  if(!pendingPhoto) return null;
  try{
    const up = await fetch('api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: d.name, type: 'image/webp', size: pendingPhoto.blob.size }),
    });
    const u = await up.json().catch(() => ({}));
    if(!up.ok || !u.uploadUrl) throw new Error(u.error || 'Photo upload unavailable');
    const put = await fetch(u.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: pendingPhoto.blob });
    if(!put.ok) throw new Error('Photo upload failed');
    const path = u.path;
    pendingPhoto = null;
    return path;
  }catch(e){
    showToast(e.message + ' \u2014 claiming without a photo.');
    pendingPhoto = null;
    return null;
  }
}

/* live free founder claim → stored in Supabase with status 'free' */
async function startFreeClaim(d){
  try{
    const imagePath = await tryUploadPhoto(d);
    const res = await fetch('api/free-claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, d, { image_path: imagePath })),
    });
    const row = await res.json().catch(() => ({}));
    if(!res.ok || !row.cells){
      const err = new Error(row.error || 'HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    founderCount++;
    updateClaimUI();
    applyRealClaim(row, 'free');
  }catch(e){
    if(e.status === 409 || e.status === 429){ showToast(e.message); return; } /* already claimed / daily limit — do NOT place */
    console.warn('Free claim unavailable → demo mode:', e.message || e);
    founderCount++; updateClaimUI();
    placeLocalPerson(d, 'Demo mode — ' + (e.message || 'backend unreachable') + '. Placed you locally.');
  }
}

/* live paid claim → Bachs session on the server, overlay in the browser,
   webhook confirms, we poll for UX */
async function startLiveClaim(d){
  try{
    const imagePath = await tryUploadPhoto(d);
    const res = await fetch('api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, d, { image_path: imagePath })),
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || !data.checkout_url){
      const err = new Error(data.error || 'HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    pendingCheckoutId = data.checkout_id;
    pendingEditCode = data.edit_code || null;
    closeDock();
    Bachs.Checkout.open({ checkoutUrl: data.checkout_url });
  }catch(e){
    if(e.status === 409 || e.status === 429){ showToast(e.message); return; } /* already claimed / daily limit — do NOT place */
    console.warn('Live claim unavailable → demo mode:', e.message || e);
    founderCount++; updateClaimUI();
    placeLocalPerson(d, 'Demo mode — ' + (e.message || 'payments unreachable') + '. Placed you locally.');
  }
}

/* local (demo) placement — same experience, in-memory only */
function placeLocalPerson(d, note){
  const person = makePerson(d.country, d.name, FIELDS.find(f => f.name === d.field), d.bio, d.project, d.city);
  person.demo = true;
  person.id = demoSeq++;
  person.founder = claimMode !== 'paid' && founderCount <= FOUNDER_LIMIT;
  person.position = ++demoPosition;   /* ranked by oldest member: first claim = #1 */
  if(pendingPhoto){ person.image = pendingPhoto.dataUrl; pendingPhoto = null; }
  let positions = d.spots > 1 ? findRun(d.country, d.spots) : null;
  if(!positions) positions = pickEmpty(d.country, d.spots);
  if(!positions.length){ showToast(GEO[d.country].name + ' is full — try another country.'); return; }
  positions.forEach(pos => {
    const c = cells[pos.y*N+pos.x];
    if(c && !c.ocean){ c.person = person; macros[d.country].claimed++; macros[d.country].people.push(person); }
  });
  person._i = positions[0].y*N + positions[0].x;
  person._run = d.spots > 1 ? computeRun(positions.map(q => q.y*N + q.x)) : null;
  allPeople.push(person);
  rebuildLow();
  closeDock();
  fly(person._i % N + 0.5, ((person._i / N)|0) + 0.5, d.spots > 1 ? 5 : 8, () => openPerson(person));
  showToast(note);
  refreshIntroCount();
  buildTop20();
}

function pickEmpty(code, spots){
  const positions = [];
  const empties = [];
  for(const inst of macros[code].instances)
    for(let y=0;y<10;y++)for(let x=0;x<10;x++){
      const d = cells[(inst.mr*10+y)*N + (inst.mc*10+x)];
      if(!d.ocean && !d.person) empties.push({x: inst.mc*10+x, y: inst.mr*10+y});
    }
  for(let k=0;k<spots && empties.length;k++) positions.push(empties.splice(Math.floor(Math.random()*empties.length),1)[0]);
  return positions;
}

/* ---- Bachs SDK events (UI only — the webhook is the source of truth) ---- */
function initBachs(){
  if(typeof Bachs === 'undefined' || !Bachs || !Bachs.Initialize) return;
  Bachs.Initialize({
    onEvent: (event) => {
      if(event.type === 'checkout.completed'){
        showToast('Payment confirmed 🎉 Placing you on the turf…');
        if(pendingCheckoutId) pollClaim(pendingCheckoutId);
      } else if(event.type === 'checkout.failed'){
        showToast('Payment failed — your turf is still here. Try again.');
      } else if(event.type === 'checkout.expired'){
        showToast('Checkout expired — start again when ready.');
      }
    },
  });
}

async function pollClaim(checkoutId, tries){
  tries = tries || 10;
  for(let k = 0; k < tries; k++){
    try{
      const r = await fetch('api/claim-status?checkout_id=' + encodeURIComponent(checkoutId));
      const s = await r.json();
      if(s.status === 'paid'){
        const r2 = await fetch('api/claim?checkout_id=' + encodeURIComponent(checkoutId));
        const cl = await r2.json();
        if(cl && cl.cells){ applyRealClaim(cl, 'paid'); return; }
      }
      if(s.status === 'failed' || s.status === 'expired'){
        showToast('Payment didn’t complete — your turf is still waiting. Try again.');
        return;
      }
    }catch(e){ /* keep polling */ }
    await new Promise(res => setTimeout(res, 1500));
  }
  showToast('Payment received — your spot is being confirmed, F.');
}

/* render a stored claim (free or paid) onto the map */
function applyRealClaim(cl, kind){ placeLiveClaim(cl, true); }

/* load paid + free claims from Supabase and render them on the world */
async function loadRealClaims(){
  try{
    const r = await fetch('api/claims', { cache: 'no-store' });
    if(!r.ok) return;
    const list = await r.json();
    let placed = 0;
    (list || []).forEach(cl => {
      const p = makeRealPerson(cl);
      p.founder = cl.status === 'free';
      p.position = cl.position || null;
      let first = null;
      (cl.cells || []).forEach(i => {
        const c = cells[i];
        if(c && !c.ocean && !c.person){ c.person = p; if(first === null) first = i; }
      });
      if(first !== null){
        p._i = first;
        p._run = computeRun(cl.cells);
        allPeople.push(p);
        macros[cl.country].claimed += cl.spots;
        macros[cl.country].people.push(p);
        placed++;
      }
    });
    if(placed){ rebuildLow(); refreshIntroCount(); buildTop20(); draw(); }
  }catch(e){ /* offline / static preview — demo world only */ }
}

(function handleCheckoutParam(){
  try{
    const p = new URLSearchParams(window.location.search);
    if(p.get('checkout') === 'success') showToast('If your payment went through, your turf is on its way 🌍');
    else if(p.get('checkout') === 'cancel') showToast('Checkout cancelled — your turf is still waiting, F.');
  }catch(e){}
})();

/* ---- countries view ---- */
function buildCountries(){
  const list = document.getElementById('countryList');
  const countFor = m => (MODE === 'live' && liveCountryCounts && typeof liveCountryCounts[m.code] === 'number') ? liveCountryCounts[m.code] : m.claimed;
  const rows = Object.values(macros).sort((a,b) => countFor(b) - countFor(a));
  list.innerHTML = rows.map(m => {
    const c = countFor(m);
    const pct = (c / m.capacity) * 100;
    const toNext = m.capacity - c;
    return `
      <div class="country-row" data-code="${m.code}">
        <span class="country-flag"><img class="flag-img" src="flags/${m.code}.png" alt=""></span>
        <span class="country-name">${GEO[m.code].name}</span>
        <span class="country-count">${c.toLocaleString('en-US')}</span>
        <span class="country-bar"><span class="fill" style="transform:scaleX(${pct/100})"></span></span>
        <span class="country-mile">${toNext > 0 ? (toNext + ' SPOTS TO ' + m.capacity) : 'FULLY MAPPED'}</span>
      </div>`;
  }).join('');
  list.querySelectorAll('.country-row').forEach(r => r.addEventListener('click', () => {
    closeDock();
    flyToCountry(r.dataset.code);
    showToast(GEO[r.dataset.code].flag + ' ' + GEO[r.dataset.code].name + ' — ' + countFor(macros[r.dataset.code]).toLocaleString('en-US') + ' on the turf');
  }));
}

/* ---- Top 20 — highest visibility, ranked by oldest member ---- */
const MEDALS = ['🥇', '', '🥉'];
function top20People(){
  if(MODE === 'live' && liveTop20.length){
    return liveTop20.map(r => {
      const p = { position: r.position, name: r.name, country: r.country, city: r.city, field: r.field, founder: r.status === 'free' };
      const cs = r.cells || [];
      p._i = cs.length ? cs[0] : -1;
      return p;
    }).filter(p => p._i >= 0).sort((a,b) => a.position - b.position);
  }
  return allPeople.filter(p => p.position && p.position <= 20).sort((a,b) => a.position - b.position);
}
function buildTop20(){
  const list = document.getElementById('top20List');
  if(!list) return;
  const ppl = top20People();
  list.innerHTML = ppl.length ? ppl.map(p => `
      <div class="top20-row${p.position <= 3 ? ' gold' : ''}" data-i="${p._i}">
        <span class="top20-rank">${MEDALS[p.position-1] || '#' + p.position}</span>
        <span class="top20-name">${esc(p.name)}</span>
        <span class="top20-loc"><img class="flag-img" src="flags/${esc(p.country)}.png" alt=""> ${esc(p.city)}</span>
        <span class="top20-field">${esc(p.field)}</span>
      </div>`).join('')
  : '<p class="top20-empty">The first 20 people claim the top of the map. Oldest members first.</p>';
  document.getElementById('top20Foot').textContent = ppl.length + ' OF 20 CLAIMED — RANKED BY OLDEST MEMBER';
  list.querySelectorAll('.top20-row').forEach(r => r.addEventListener('click', async () => {
    const i = +r.dataset.i;
    let p = cells[i] && cells[i].person;
    if(!p && MODE === 'live'){
      await loadSector(Math.floor(i / N / 10) + '-' + Math.floor((i % N) / 10));
      p = cells[i] && cells[i].person;
    }
    if(!p) return;
    closeDock();
    fly(i % N + 0.5, ((i / N)|0) + 0.5, 10, () => openPerson(p));
  }));
}

function refreshIntroCount(){
  const total = (MODE === 'live' && liveTotal) ? liveTotal : allPeople.length;
  document.getElementById('introCount').textContent = total.toLocaleString('en-US') + ' ON THE TURF — AND COUNTING';
  buildCountries();
}

/* ==========================================================================
   LIVE STATS — hours since launch · total visits · online now
   ========================================================================== */
const LAUNCH_ISO_FALLBACK = '2026-08-26T00:00:00Z';
let launchIso = LAUNCH_ISO_FALLBACK;
let liveVisits = 0;
let lastOnline = null;
let turfSession = null;
try{
  turfSession = localStorage.getItem('turf_session') || null;
  if(!turfSession){
    turfSession = 's' + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
    localStorage.setItem('turf_session', turfSession);
  }
}catch(e){ turfSession = 's' + Math.random().toString(36).slice(2,10); }

function fmtSinceLaunch(){
  const t = Date.now() - new Date(launchIso).getTime();
  if(!Number.isFinite(t) || t < 0) return null;
  const h = Math.floor(t / 3600000);
  const d = Math.floor(h / 24);
  return d > 0 ? d + 'D ' + (h % 24) + 'H' : h + 'H';
}

function refreshLiveStats(){
  const el = document.getElementById('introStats');
  const parts = [];
  if(lastOnline !== null && lastOnline !== undefined) parts.push(lastOnline + ' ONLINE NOW');
  if(liveVisits) parts.push(liveVisits.toLocaleString('en-US') + ' VISITS');
  const since = fmtSinceLaunch();
  if(since) parts.push('LAUNCHED ' + since + ' AGO');
  if(el) el.textContent = parts.join(' \u00B7 ');
  const ho = document.getElementById('hudOnline');
  if(ho) ho.textContent = (lastOnline !== null && lastOnline !== undefined) ? ' \u00B7 ' + lastOnline + ' ONLINE' : '';
}

function trackVisit(){
  if(typeof fetch !== 'function') return;
  try{ fetch('api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(()=>{}); }catch(e){}
}

function heartbeat(){
  if(typeof fetch !== 'function') return;
  try{
    fetch('api/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: turfSession }) })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if(d && typeof d.online === 'number'){ lastOnline = d.online; refreshLiveStats(); } })
      .catch(()=>{});
  }catch(e){}
}

/* ==========================================================================
   MY TURF — email is the key to your spot. Find it, edit it (spot, country,
   position and spots stay fixed — only your profile can change).
   ========================================================================== */
let mtClaim = null;
let mtNewPhoto = null;
let mtAuthCode = null; /* set when the user unlocked their spot with an edit code */

function openMyTurf(){
  mtClaim = null;
  mtNewPhoto = null;
  mtAuthCode = null;
  document.getElementById('mtFind').hidden = false;
  document.getElementById('mtEdit').hidden = true;
  document.getElementById('mtNote').textContent = '';
  document.getElementById('mtPhoto').hidden = true;
  /* remind the user of codes saved on this device */
  try{
    const saved = JSON.parse(localStorage.getItem('turf_edit_codes') || '[]');
    const hint = document.getElementById('mtCodeHint');
    if(hint) hint.textContent = saved.length
      ? 'SAVED ON THIS DEVICE: ' + saved.map(s => s.code).join(' · ')
      : 'NO EDIT CODE ON THIS DEVICE — CLAIM A SPOT TO GET ONE';
  }catch(e){}
  document.getElementById('mtPhotoNote').textContent = '';
  openDock('myturf');
}

async function mtFind(){
  const raw = document.getElementById('mtEmail').value.trim();
  if(!raw){ showToast('Enter your claim email or edit code ✍️'); return; }
  document.getElementById('mtNote').textContent = '';
  try{
    /* edit code path (primary): POST {code} → unlocks the spot directly */
    if(/^[A-Za-z0-9]{4}[-\s]?[A-Za-z0-9]{4}$/.test(raw)){
      const r = await fetch('api/my-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: raw }),
      });
      const data = await r.json().catch(() => ({}));
      if(!r.ok || !data.claim){
        document.getElementById('mtNote').textContent = (data.error || 'THAT CODE DIDN’T MATCH ANY SPOT').toUpperCase();
        return;
      }
      mtAuthCode = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      mtClaim = data.claim;
      mtFillEdit();
      return;
    }
    /* email path (fallback): GET by email */
    const email = raw;
    const r = await fetch('api/my-claim?email=' + encodeURIComponent(email), { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if(!r.ok){
      document.getElementById('mtNote').textContent = r.status === 404
        ? 'NO TURF FOUND FOR THAT EMAIL — CLAIM YOURS BELOW'
        : (data.error || 'LOOKUP FAILED');
      return;
    }
    const list = data.claims || [];
    if(!list.length){
      document.getElementById('mtNote').textContent = 'NO TURF FOUND FOR THAT EMAIL — CLAIM YOURS BELOW';
      return;
    }
    mtClaim = list[0];
    mtFillEdit();
    if(list.length > 1) document.getElementById('mtNote').textContent = 'NOTE: ' + list.length + ' CLAIMS ON THIS EMAIL — EDITING THE NEWEST';
  }catch(e){
    document.getElementById('mtNote').textContent = 'BACKEND UNREACHABLE (DEMO MODE) — MY TURF IS LIVE ON THE DEPLOYED SITE';
  }
}

function mtFillEdit(){
  const c = mtClaim;
  document.getElementById('mtFind').hidden = true;
  document.getElementById('mtEdit').hidden = false;
  document.getElementById('mtSummary').innerHTML =
    '<img class="flag-img" src="flags/' + esc(c.country) + '.png" alt=""> ' + esc(c.name) + ' · ' + esc(GEO[c.country].name) +
    '<span class="mono">POSITION #' + (c.position || '—') + ' · ' + (c.status === 'free' ? 'FOUNDER (FREE)' : 'PAID') +
    ' · ' + (c.spots || 1) + ' SPOT' + ((c.spots || 1) > 1 ? 'S' : '') + '</span>';
  document.getElementById('mtName').value = c.name || '';
  document.getElementById('mtBio').value = c.bio || '';
  const fieldSel = document.getElementById('mtField');
  fieldSel.innerHTML = FIELDS.map(f => '<option' + (f.name === c.field ? ' selected' : '') + '>' + f.name + '</option>').join('');
  document.getElementById('mtCity').value = c.city || '';
  document.getElementById('mtProject').value = c.project || '';
  document.getElementById('mtWeb').value = c.web || '';
  document.getElementById('mtSocial').value = c.social || '';
  const ph = document.getElementById('mtPhoto');
  if(c.image_url){ ph.src = c.image_url; ph.hidden = false; } else { ph.hidden = true; }
  if(ph.src && !/^https:/.test(ph.src)) ph.hidden = true;
}

async function mtSave(){
  if(!mtClaim) return;
  const body = {
    name: document.getElementById('mtName').value,
    bio: document.getElementById('mtBio').value,
    field: document.getElementById('mtField').value,
    city: document.getElementById('mtCity').value,
    project: document.getElementById('mtProject').value,
    web: document.getElementById('mtWeb').value,
    social: document.getElementById('mtSocial').value,
  };
  if(mtAuthCode){
    body.code = mtAuthCode;                 /* primary key: the edit code */
  }else{
    body.email = document.getElementById('mtEmail').value.trim();
    body.prove_name = mtClaim.name || '';   /* fallback key: email + registered name */
  }
  try{
    if(mtNewPhoto){
      const upBody = { name: body.name || mtClaim.name, type: 'image/webp', size: mtNewPhoto.blob.size };
      if(mtAuthCode) upBody.code = mtAuthCode; else upBody.owner = body.email;
      const up = await fetch('api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upBody),
      });
      const u = await up.json().catch(() => ({}));
      if(!up.ok || !u.uploadUrl) throw new Error(u.error || 'Photo upload unavailable');
      const put = await fetch(u.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: mtNewPhoto.blob });
      if(!put.ok) throw new Error('Photo upload failed');
      body.image_path = u.path;
    }
    const r = await fetch('api/my-claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
    mtClaim = data.claim;
    mtNewPhoto = null;
    mtRefreshMapPerson();
    mtFillEdit();
    showToast('Saved — your turf is updated ✓');
  }catch(e){
    showToast(e.message + (e.message && /taken/i.test(e.message) ? '' : ' — changes not saved.'));
  }
}

function mtRefreshMapPerson(){
  const c = mtClaim;
  if(!c || !c.cells) return;
  const person = cells[c.cells[0]] && cells[c.cells[0]].person;
  if(person){
    person.name = c.name;
    person.bio = c.bio || person.bio;
    person.field = c.field || person.field;
    person.city = c.city || person.city;
    person.project = c.project || person.project;
    person.web = c.web; person.social = c.social;
    person.image = c.image_url || null;
    draw();
  }
}

/* ---- init ---- */
buildClaimForm();
buildCountries();
buildTop20();
refreshIntroCount();
resize();
updateClaimUI();
preloadFlags();
trackVisit();
heartbeat();
setInterval(heartbeat, 30000);
refreshLiveStats();
probeLive();
initBachs();
document.getElementById('mtFindBtn').onclick = mtFind;
document.getElementById('mtSave').onclick = mtSave;
document.getElementById('mtPhotoBtn').addEventListener('click', () => document.getElementById('mtPhotoInput').click());
document.getElementById('mtPhotoInput').addEventListener('change', async () => {
  const file = document.getElementById('mtPhotoInput').files && document.getElementById('mtPhotoInput').files[0];
  if(!file) return;
  try{
    mtNewPhoto = await compressImage(file);
    const ph = document.getElementById('mtPhoto');
    ph.src = mtNewPhoto.dataUrl;
    ph.hidden = false;
    document.getElementById('mtPhotoNote').textContent = 'NEW PHOTO READY — SAVE TO APPLY';
  }catch(e){
    document.getElementById('mtPhotoNote').textContent = 'COULD NOT READ THAT IMAGE';
  }
  document.getElementById('mtPhotoInput').value = '';
});
