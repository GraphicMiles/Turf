/* GET /api/worldmap.png — the world as a 100×100 bitmap (one pixel per spot).
   Colors: ocean, empty land, or the person's field color. A few-KB PNG that
   replaces "send the whole population to every browser" at world zoom.
   Cached in memory for 30s per function instance + CDN cache headers. */
const zlib = require('zlib');
const getSupabase = require('../lib/supabase.js');
const { N, WORLD, build, FIELDS } = require('../world-core.js');
const FLAG_PALETTE = require('../flags/palette.json');

const OCEAN = [0xdf, 0xea, 0xf8];
const LAND = [0xff, 0xf8, 0xee];
const FIELD_COLOR = {};
FIELDS.forEach(f => {
  FIELD_COLOR[f.name] = [parseInt(f.color.slice(1, 3), 16), parseInt(f.color.slice(3, 5), 16), parseInt(f.color.slice(5, 7), 16)];
});

/* empty land reads as the country's muted national tint (flag average, softened) */
function flagTint(code) {
  const f = FLAG_PALETTE[code];
  if (!f) return LAND;
  return [
    Math.round(f[0] * 0.62 + LAND[0] * 0.38),
    Math.round(f[1] * 0.62 + LAND[1] * 0.38),
    Math.round(f[2] * 0.62 + LAND[2] * 0.38),
  ];
}

/* ---- minimal PNG encoder (RGBA, 8-bit) ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; /* filter: none */
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- render ---- */
let cache = { at: 0, png: null };
const TTL_MS = 30000;

async function renderWorld() {
  const supa = getSupabase();
  const seed = build();
  const colors = new Array(N * N);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const land = WORLD[y][x] !== 'O';
    for (let yy = 0; yy < 10; yy++) for (let xx = 0; xx < 10; xx++) {
      colors[(y * 10 + yy) * N + (x * 10 + xx)] = land ? LAND : OCEAN;
    }
  }
  const { data: claims, error } = await supa
    .from('claims')
    .select('cells,field')
    .in('status', ['paid', 'free']);
  if (error) throw error;
  (claims || []).forEach(cl => {
    const c = FIELD_COLOR[cl.field] || [0xff, 0xd3, 0x2a];
    (cl.cells || []).forEach(i => { if (i >= 0 && i < N * N && !seed.cells[i].ocean) colors[i] = c; });
  });
  const rgba = Buffer.alloc(N * N * 4);
  colors.forEach((c, i) => {
    rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255;
  });
  return encodePNG(N, N, rgba);
}

exports.default = async (req, res) => {
  const now = Date.now();
  if (!cache.png || now - cache.at > TTL_MS) {
    try {
      cache = { at: now, png: await renderWorld() };
    } catch (e) {
      if (cache.png) return serve(res); /* serve stale on error */
      return res.status(500).json({ error: 'worldmap render failed: ' + e.message });
    }
  }
  return serve(res);
  function serve(r) {
    r.setHeader('Content-Type', 'image/png');
    r.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30');
    r.setHeader('Content-Length', cache.png.length);
    return r.status(200).end(cache.png);
  }
};
