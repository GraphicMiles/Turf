/* ==========================================================================
   TURF F. — WORLD CORE (shared, deterministic)
   Loaded in the browser (<script src="world-core.js"> → window.WORLD_CORE)
   and required by the Vercel functions (module.exports) so the backend
   assigns the exact same cells the frontend renders.
   100×100 grid = 10×10 macro regions × 10×10 person slots (10,000 spots)
   Deterministic seed 0x5EED01 — the same world on every load, everywhere.
   ========================================================================== */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.WORLD_CORE = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const N = 100;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  /* ---------- stylized 10×10 world ---------- */
  const WORLD = [
    ['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O', 'O', 'O'],
    ['GL', 'CAN', 'USA', 'O', 'UK', 'O', 'RUS', 'RUS', 'KZH', 'O'],
    ['O', 'CAN', 'USA', 'O', 'DE', 'O', 'RUS', 'KZH', 'CHN', 'JPN'],
    ['MX', 'USA', 'CUBA', 'O', 'ES', 'TR', 'IRN', 'CHN', 'CHN', 'O'],
    ['O', 'GTM', 'PNM', 'O', 'O', 'SAU', 'IND', 'IND', 'KOR', 'O'],
    ['O', 'COL', 'VEN', 'O', 'NGA', 'CMR', 'ETH', 'BGD', 'THA', 'O'],
    ['O', 'ECU', 'PER', 'BRA', 'SEN', 'KEN', 'SOM', 'MMR', 'VNM', 'O'],
    ['CHL', 'CHL', 'BRA', 'BRA', 'COD', 'TZA', 'O', 'O', 'O', 'O'],
    ['CHL', 'ARG', 'BRA', 'BRA', 'ZAF', 'MOZ', 'O', 'AUS', 'O', 'O'],
    ['O', 'ARG', 'O', 'O', 'O', 'O', 'O', 'AUS', 'NZL', 'O'],
  ];

  const GEO = {
    GL: { name: 'Greenland', flag: '🇬', cities: ['Nuuk'] },
    CAN: { name: 'Canada', flag: '🇨🇦', cities: ['Toronto', 'Vancouver'] },
    USA: { name: 'United States', flag: '🇺', cities: ['New York', 'Austin', 'Chicago'] },
    MX: { name: 'Mexico', flag: '🇲', cities: ['Mexico City', 'Guadalajara'] },
    GTM: { name: 'Guatemala', flag: '🇬', cities: ['Guatemala City'] },
    PNM: { name: 'Panama', flag: '🇵🇦', cities: ['Panama City'] },
    CUBA: { name: 'Cuba', flag: '🇨', cities: ['Havana'] },
    COL: { name: 'Colombia', flag: '🇨🇴', cities: ['Bogotá', 'Medellín'] },
    VEN: { name: 'Venezuela', flag: '🇻🇪', cities: ['Caracas'] },
    ECU: { name: 'Ecuador', flag: '🇪🇨', cities: ['Quito'] },
    PER: { name: 'Peru', flag: '🇵🇪', cities: ['Lima'] },
    BRA: { name: 'Brazil', flag: '🇧', cities: ['São Paulo', 'Rio de Janeiro'] },
    CHL: { name: 'Chile', flag: '🇨', cities: ['Santiago'] },
    ARG: { name: 'Argentina', flag: '🇦🇷', cities: ['Buenos Aires'] },
    UK: { name: 'United Kingdom', flag: '🇬🇧', cities: ['London', 'Manchester'] },
    DE: { name: 'Germany', flag: '🇩', cities: ['Berlin', 'Hamburg'] },
    ES: { name: 'Spain', flag: '🇪🇸', cities: ['Madrid', 'Barcelona'] },
    TR: { name: 'Türkiye', flag: '🇹🇷', cities: ['Istanbul', 'Izmir'] },
    SAU: { name: 'Saudi Arabia', flag: '🇸', cities: ['Riyadh', 'Jeddah'] },
    RUS: { name: 'Russia', flag: '🇷', cities: ['Moscow', 'St. Petersburg'] },
    KZH: { name: 'Kazakhstan', flag: '🇰🇿', cities: ['Almaty', 'Astana'] },
    IRN: { name: 'Iran', flag: '🇮', cities: ['Tehran', 'Isfahan'] },
    CHN: { name: 'China', flag: '🇨🇳', cities: ['Shanghai', 'Shenzhen', 'Beijing'] },
    JPN: { name: 'Japan', flag: '🇯', cities: ['Tokyo', 'Osaka'] },
    KOR: { name: 'South Korea', flag: '🇰🇷', cities: ['Seoul', 'Busan'] },
    NGA: { name: 'Nigeria', flag: '🇳', cities: ['Lagos', 'Abuja', 'Ibadan'] },
    CMR: { name: 'Cameroon', flag: '🇨🇲', cities: ['Douala', 'Yaoundé'] },
    ETH: { name: 'Ethiopia', flag: '🇪', cities: ['Addis Ababa'] },
    BGD: { name: 'Bangladesh', flag: '🇧🇩', cities: ['Dhaka', 'Chattogram'] },
    THA: { name: 'Thailand', flag: '🇹', cities: ['Bangkok', 'Chiang Mai'] },
    IND: { name: 'India', flag: '🇮', cities: ['Bengaluru', 'Mumbai', 'Delhi'] },
    SEN: { name: 'Senegal', flag: '🇸', cities: ['Dakar'] },
    KEN: { name: 'Kenya', flag: '🇰🇪', cities: ['Nairobi', 'Mombasa'] },
    SOM: { name: 'Somalia', flag: '🇸🇴', cities: ['Mogadishu'] },
    MMR: { name: 'Myanmar', flag: '🇲', cities: ['Yangon'] },
    VNM: { name: 'Vietnam', flag: '🇻🇳', cities: ['Ho Chi Minh City', 'Hanoi'] },
    COD: { name: 'DR Congo', flag: '🇨🇩', cities: ['Kinshasa'] },
    TZA: { name: 'Tanzania', flag: '🇹🇿', cities: ['Dar es Salaam'] },
    ZAF: { name: 'South Africa', flag: '🇿', cities: ['Johannesburg', 'Cape Town'] },
    MOZ: { name: 'Mozambique', flag: '🇲🇿', cities: ['Maputo'] },
    AUS: { name: 'Australia', flag: '🇦🇺', cities: ['Sydney', 'Melbourne'] },
    NZL: { name: 'New Zealand', flag: '🇳', cities: ['Auckland', 'Wellington'] },
  };

  /* ---------- people data ---------- */
  const NAMES = ['Raji', 'Tunde', 'Amina', 'Chidi', 'Zainab', 'Yuki', 'Haruto', 'Mei', 'Sora', 'Priya', 'Arjun', 'Ananya', 'Diego', 'Mateo', 'Lucía', 'Sofía', 'Elena', 'Marco', 'Ava', 'Liam', 'Noah', 'Emma', 'Oliver', 'Fatima', 'Omar', 'Layla', 'Kofi', 'Amara', 'Naledi', 'Thabo', 'Anika', 'Lukas', 'Hanna', 'Petra', 'Ingrid', 'Björn', 'Sana', 'Ravi', 'Kenji', 'Aisha', 'Bola', 'Sefu', 'Yusuf', 'Grace', 'Chen', 'Lina', 'Olu', 'Tayo', 'Femi', 'Ada', 'Kwame', 'Nia', 'Sam', 'Zoe', 'Ivy', 'Ezra', 'Dara', 'Kai', 'Mila', 'Theo'];

  const FIELDS = [
    { name: 'Software & AI', color: '#70a1ff', bios: ['Building AI agents and useful software.', 'Ships small tools that remove daily friction.'], projects: ['AI agents for logistics', 'Open-source map toolkit'] },
    { name: 'Product Design', color: '#ffd32a', bios: ['Designing calm interfaces for loud products.', 'Fintech UI, one screen at a time.'], projects: ['Brand identity for a Lagos fintech', 'Payment app v2, end to end'] },
    { name: 'Illustration', color: '#ffa502', bios: ['Ink-first illustrator. Streets and peeps.', 'Vector art with a paper soul.'], projects: ['Sticker sheet: Market Day', 'Zine: Rainy Season'] },
    { name: 'Music', color: '#ff4757', bios: ['Records made in a bedroom studio.', 'Afrobeats, lo-fi, and loud vocals.'], projects: ['EP: Tuesday Nights', 'Single: Third Mainland'] },
    { name: 'Film & Photography', color: '#a55eea', bios: ['Tells stories on 35mm and 4K.', 'Documenting street life, one frame at a time.'], projects: ['Doc short: Chop Bar Nights', 'Photo essay: Traffic 8PM'] },
    { name: 'Writing', color: '#2ed573', bios: ['Essays about the internet we keep.', 'Words first, noise never.'], projects: ['Essay series: Slow Internet', 'Novel draft: Lagos 2077'] },
    { name: 'Food', color: '#ff6b81', bios: ['Cooking as a design problem.', 'Street food, elevated.'], projects: ['Recipe zine: Jollof Vol. 1', 'Pop-up menu: Adire Spice'] },
    { name: 'Fashion', color: '#f368e0', bios: ['Stitching identity into cloth.', 'Capsules, not collections.'], projects: ['Capsule: Adire Loop', 'Capsule: Market Days'] },
    { name: 'Game Dev', color: '#44bd32', bios: ['Building tiny worlds with big hearts.', 'Ships small games, learns big lessons.'], projects: ['Indie game: Kano Run', 'Puzzle game: Grid Ghost'] },
    { name: '3D & Motion', color: '#1e90ff', bios: ['Motion is a language. Speaks fluently.', 'Clay, loops, and soft light.'], projects: ['Motion reel: Loop 04', '3D toy: Clay Peeps'] },
    { name: 'Meme', color: '#ff9f43', bios: ['Documenting the culture in real time.', 'Honest slop, proudly displayed.'], projects: ['Meme study: Based & Human', 'Series: Peak Slop'] },
    { name: 'Science', color: '#00d2d3', bios: ['Field notes from the lab bench.', 'Making data feel human.'], projects: ['Field notes: Mangroves', 'Interactive: Climate Atlas'] },
  ];

  function makePerson(code, id, rnd) {
    const f = FIELDS[Math.floor(rnd() * FIELDS.length)];
    const g = GEO[code];
    return {
      name: NAMES[Math.floor(rnd() * NAMES.length)],
      field: f.name,
      color: f.color,
      bio: f.bios[Math.floor(rnd() * f.bios.length)],
      project: f.projects[Math.floor(rnd() * f.projects.length)],
      city: g.cities[Math.floor(rnd() * g.cities.length)],
      country: code,
      sh: FIELDS[(FIELDS.indexOf(f) + 5) % FIELDS.length].color,
      id: id,
    };
  }

  /* ---------- deterministic world build ----------
     Re-seeds on every call so ANY caller (browser, any function
     invocation, any request on a warm container) gets the SAME world. */
  function build() {
    const rnd = mulberry32(0x5EED01);
    const cells = new Array(N * N);
    const macros = {};
    const allPeople = [];
    let seq = 480000;
    for (let mr = 0; mr < 10; mr++) for (let mc = 0; mc < 10; mc++) {
      const code = WORLD[mr][mc];
      const land = code !== 'O';
      if (land) {
        if (!macros[code]) macros[code] = { code, capacity: 0, claimed: 0, people: [], instances: [] };
        macros[code].capacity += 100;
        macros[code].instances.push({ mr, mc });
      }
      const rate = land ? 0.45 + rnd() * 0.5 : 0;
      for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
        const i = (mr * 10 + y) * N + (mc * 10 + x);
        let person = null;
        if (land && rnd() < rate) {
          person = makePerson(code, seq++, rnd);
          person._i = i;
          macros[code].claimed++;
          macros[code].people.push(person);
          allPeople.push(person);
        }
        cells[i] = { ocean: !land, mr, mc, person };
      }
    }
    return { cells, macros, allPeople };
  }

  /* ---------- cell placement (server-side claim allocation) ----------
     used: iterable of already-taken cell indexes (mock persons + live claims).
     Prefers a contiguous horizontal run of `spots`; falls back to scattered. */
  function assignCells(country, spots, used) {
    const insts = [];
    for (let mr = 0; mr < 10; mr++) for (let mc = 0; mc < 10; mc++) if (WORLD[mr][mc] === country) insts.push({ mr, mc });
    if (!insts.length) return null;
    const isUsed = (i) => (used && used.has ? used.has(i) : used && used.indexOf(i) > -1);

    for (const inst of insts) {
      for (let y = 0; y < 10; y++) for (let x = 0; x <= 10 - spots; x++) {
        let ok = true;
        const run = [];
        for (let k = 0; k < spots; k++) {
          const i = (inst.mr * 10 + y) * N + (inst.mc * 10 + x + k);
          if (isUsed(i)) { ok = false; break; }
          run.push(i);
        }
        if (ok) return run;
      }
    }
    const empties = [];
    for (const inst of insts) for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const i = (inst.mr * 10 + y) * N + (inst.mc * 10 + x);
      if (!isUsed(i)) empties.push(i);
    }
    const out = [];
    for (let k = 0; k < spots && empties.length; k++) out.push(empties.splice(Math.floor(Math.random() * empties.length), 1)[0]);
    return out.length === spots ? out : null;
  }

  return { N, WORLD, GEO, NAMES, FIELDS, build, assignCells, mulberry32 };
});
