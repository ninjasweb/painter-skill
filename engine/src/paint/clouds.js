// Billowing cumulus, painted the way an alla-prima cloud demonstration does it (brennerfineart, "How to paint
// really realistic clouds alla prima"): the cloud is a cauliflower of rounded lobes at several sizes; lobes lower
// down are nearer and overlap the ones above; every lobe is lit on the rim that faces the sun and turns grey-violet
// where it tucks behind the lobe in front of it, so each lit edge reads crisp against the shade above it.
// The sky is laid first and the outline is "cut in" with sky colour, so the silhouette is a clean scalloped edge
// on the lit side and a soft, lost edge on the shadow side and along the flat base.

import { rng, clamp, lerp, smoothstep, noise2 } from '../core/math.js';
import { col, mixOk, ramp, vary, shift, tone, mix, chroma } from '../core/color.js';

/** Cloud mixes, dark to light: { deep, shadow, mid, light, highlight }.
 *  time 'day' (default): the values measured on the demonstration's reference photo (sky ~0.44 · shadows 0.70–0.80
 *  grey-violet · mid 0.86 · lights 0.93–0.97 warm white); warm 0…1 warms the lights.
 *  time 'sunset': the whole cloud drops in value and takes the colour of the light — violet-grey shade (0.38–0.50),
 *  dusty rose middle (0.64), orange-peach light (0.78) and a gold highlight (0.90) only where the low sun reaches.
 *  Pull the colours of far clouds towards the low sky (mixOk) — they sit in more air. */
export function cloudPalette({ warm = 0, time = 'day' } = {}) {
  if (time === 'sunset') return {
    deep: chroma(tone(mix({ dioxazineViolet: 1, ultramarine: 0.6, quinMagenta: 0.2, titaniumWhite: 2 }), 0.42), 0.7),
    shadow: chroma(tone(mix({ dioxazineViolet: 1, quinMagenta: 0.4, ultramarine: 0.4, titaniumWhite: 3 }), 0.5), 0.65),
    mid: chroma(tone(mix({ quinMagenta: 0.6, cadmiumOrange: 0.5, dioxazineViolet: 0.3, titaniumWhite: 4 }), 0.64), 0.65),
    light: chroma(tone(mix({ cadmiumOrange: 1, quinMagenta: 0.25, titaniumWhite: 2 }), 0.78), 0.75),
    highlight: chroma(tone(mix({ cadmiumYellow: 1, cadmiumOrange: 0.5, titaniumWhite: 2 }), 0.9), 0.75),
  };
  return {
    deep: chroma(tone(mix({ ultramarine: 1, dioxazineViolet: 0.8, burntSienna: 0.45, titaniumWhite: 3 }), 0.7), 0.6),
    shadow: chroma(tone(mix({ ultramarine: 1, dioxazineViolet: 0.6, burntSienna: 0.3, titaniumWhite: 5 }), 0.775), 0.6),
    mid: tone(mix({ ultramarine: 0.35, rawSienna: 0.12, titaniumWhite: 8 }), 0.865),
    light: tone(mix({ titaniumWhite: 10, cadmiumLemon: 0.12 + warm * 0.4, rawSienna: 0.05 + warm * 0.3 }), 0.935),
    highlight: tone(mix({ titaniumWhite: 12, cadmiumLemon: 0.15 + warm * 0.5, cadmiumRed: warm * 0.08 }), 0.975),
  };
}

/** The stages paintBillowCloud works through, in order; with { phase: 'hero' } they become the timelapse phases
 *  'hero-block-in', 'hero-blend', … so a scene can pace the reveal (see examples/summer-cumulus.js). */
export const CLOUD_STAGES = ['block-in', 'blend', 'lights', 'folds', 'edges', 'base'];

/** A cumulus as a heap of lobes. x: centre of the base · base: y of the flat base · w: width · h: height of the
 *  tallest tower · towers: number of towers or [{x, w, h}] (x relative to the cloud centre, w/h as fractions of
 *  w and h) · lobes: number of big interior masses, each grown into a cauliflower · rim: size of the scallops on the
 *  silhouette (fraction of h; about 30 % of them become big heads standing proud of the outline) · flat: depth of
 *  the flat base (fraction of h) · light: direction TO the sun, screen space (y down), e.g. [-0.55, -0.83] = upper left.
 *  The seed decides the heads and knobs: try a few and keep the silhouette that reads best (thumbnails, like a painter). */
export function billowCloud({ x, base, w, h, towers = 3, lobes = 22, rim = 0.06, seed = 1, light = [-0.55, -0.83], flat = 0.1, lobeLight = null, front = 0.55 }) {
  const r = rng(seed * 7919 + 17);
  const T = Array.isArray(towers) ? towers.map((t) => ({ cx: x + t.x * w, hw: t.w * w, ht: t.h * h }))
    : Array.from({ length: towers }, (_, i) => ({ cx: x + (i === 0 ? (r() - 0.5) * 0.25 : (r() - 0.5) * 0.85) * w, hw: w * r.range(0.14, 0.26), ht: h * (i === 0 ? 1 : r.range(0.4, 0.8)) }));
  // envelope: height above the base at x — domes (one per tower) on a low shoulder that tapers to the cloud's ends
  const end = (px) => smoothstep(0, 0.12, 0.5 - Math.abs(px - x) / w);
  const top = (px) => {
    let e = 0;
    for (const t of T) { const d = (px - t.cx) / t.hw; e = Math.max(e, t.ht * Math.sqrt(Math.max(0, 1 - Math.min(1, d * d * 0.5))) * Math.exp(-d * d * 0.35)); }
    return Math.max(e, h * 0.22) * end(px) + h * 0.06 * end(px);
  };
  const L = [];
  const add = (lx, ly, lr, kind, lvl = 0) => { const l = { x: lx, y: ly, r: lr, sy: r.range(0.8, 0.95), kind, lvl, seed: r() * 100 }; L.push(l); return l; };
  const inEnv = (px, py, m = 0) => py <= base + m && py >= base - top(px) - m;
  // 1. masses: big rounded forms filling the envelope (the big pattern of light and shade), larger towards the base
  const masses = [];
  for (let tries = 0; tries < lobes * 60 && masses.length < lobes; tries++) {
    const px = x + (r() - 0.5) * w * 0.92, tt = top(px); if (tt < h * 0.1) continue;
    const py = base - r() * tt, rel = clamp((base - py) / h);
    const rr = Math.min(h * lerp(0.2, 0.09, rel) * r.range(0.65, 1.45), tt * 0.55);
    let fits = py + rr * 0.2 <= base + h * 0.05;                        // the whole form must sit inside the envelope
    for (let k = 0; k < 9 && fits; k++) { const a = Math.PI + (k / 8) * Math.PI; fits = inEnv(px + Math.cos(a) * rr * 0.9, py + Math.sin(a) * rr * 0.9); }
    if (!fits) continue;
    if (masses.some((l) => Math.hypot(l.x - px, l.y - py) < (l.r + rr) * 0.55)) continue;
    masses.push(add(px, py, rr, 'mass', 0));
  }
  // 2. every form grows smaller forms on its upper, outward side — two generations: the cauliflower
  const grow = (pa, lvl) => {
    if (lvl > 2 || pa.r < h * 0.012) return;
    const out = Math.atan2(-0.75, (pa.x - x) / (w * 0.5));            // up, leaning away from the cloud's centre
    const n = 2 + Math.floor(r() * (lvl === 1 ? 4 : 3));
    for (let k = 0; k < n; k++) {
      const a = out + (r() - 0.5) * 2.6, cr = pa.r * r.range(0.32, 0.58), dd = pa.r * r.range(0.5, 0.75);
      if (cr < h * 0.014) continue;                                     // too small to read: it would be a loose speck
      const cx = pa.x + Math.cos(a) * dd, cy = pa.y + Math.sin(a) * dd;
      if (cy + cr * 0.3 > base) continue;
      grow(add(cx, cy, cr, 'knob', lvl), lvl + 1);
    }
  };
  for (const m of masses) grow(m, 1);
  // 3. the silhouette: rim forms along the envelope by arc length, so the outline is scalloped all round
  const pts = []; for (let i = 0; i <= 400; i++) { const px = x - w / 2 + (w * i) / 400; pts.push([px, base - top(px)]); }
  let acc = 0, next = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc < next) continue;
    const [px, py] = pts[i], hh = base - py;
    if (hh < h * 0.05) continue;
    const rr = h * rim * (r() < 0.3 ? r.range(1.8, 3) : r.range(0.55, 1.4));   // mostly small scallops, now and then a big head
    const j = Math.min(i + 1, pts.length - 1), tx = pts[j][0] - pts[i - 1][0], ty = pts[j][1] - pts[i - 1][1];
    const tn = Math.hypot(tx, ty) || 1, nx = ty / tn, ny = -tx / tn;
    const head = rr > h * rim * 1.7, inset = head ? r.range(0.15, 0.4) : 0.55;     // big heads stand proud of the envelope
    grow(add(px - nx * rr * inset, py - ny * rr * inset, rr, 'rim', 1), head ? 1 : 2);
    next = acc + rr * r.range(0.8, 1.4);
  }
  // 4. a solid core, kept inside the envelope, so the heap never shows holes of sky
  for (let i = 0; i < 16; i++) { const px = x + (i / 15 - 0.5) * w * 0.86, tt = top(px); if (tt < h * 0.06) continue; const rr = tt * 0.42; add(px, base - rr * 1.05, rr, 'core'); }
  // nearer = lower: a lobe overlaps the lobes above it (core lobes stay behind everything)
  L.sort((a, b) => (a.kind === 'core') !== (b.kind === 'core') ? (a.kind === 'core' ? -1 : 1) : (a.y + a.r * 0.35) - (b.y + b.r * 0.35));
  L.forEach((l, i) => (l.i = i));
  const n = Math.hypot(light[0], light[1]) || 1;
  const L2 = [light[0] / n, light[1] / n];
  // a low sun (light nearly level or from below) models every lobe on its side and the heap turns into bubbles:
  // let the big form carry the light then, and keep only a hint of each lobe's roundness
  const lw = lobeLight ?? lerp(0.3, 0.12, smoothstep(-0.6, 0, L2[1]));
  return new BillowCloud(L, { x, base, w, h, top, flat, light: L2, lz: front, lobeLight: lw });
}

export class BillowCloud {
  constructor(lobes, o) {
    Object.assign(this, o); this.lobes = lobes;
    this.x0 = Math.min(...lobes.map((l) => l.x - l.r)); this.x1 = Math.max(...lobes.map((l) => l.x + l.r));
    this.y0 = Math.min(...lobes.map((l) => l.y - l.r)); this.y1 = this.base;
    // bucket lobes on a coarse grid so a lookup only tests nearby lobes
    this.cs = Math.max(this.h * 0.08, 0.01); this.grid = new Map();
    for (const l of lobes) {
      for (let gx = Math.floor((l.x - l.r) / this.cs); gx <= Math.floor((l.x + l.r) / this.cs); gx++)
        for (let gy = Math.floor((l.y - l.r) / this.cs); gy <= Math.floor((l.y + l.r) / this.cs); gy++) {
          const k = gx * 100003 + gy; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(l);
        }
    }
    this.cache = new Map(); this.q = Math.max(this.h * 0.004, 0.0015);
    this._exterior();
  }
  // which outside points really are sky: flood-fill from the border; pockets enclosed by lobes are folds of the cloud
  _exterior() {
    const g = this.eg = Math.max(this.h * 0.006, 0.002), pad = g * 3;
    this.ex0 = this.x0 - pad; this.ey0 = this.y0 - pad;
    const nx = this.enx = Math.ceil((this.x1 - this.x0 + 2 * pad) / g), ny = this.eny = Math.ceil((this.base - this.y0 + 2 * pad) / g);
    const solid = new Uint8Array(nx * ny), ext = this.ext = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) solid[j * nx + i] = this._raw(this.ex0 + (i + 0.5) * g, this.ey0 + (j + 0.5) * g).front ? 1 : 0;
    // close narrow channels first (dilate the cloud), flood the outside, then grow the sky back to the outline:
    // a pocket reached only through a gap narrower than ~2·R stays cloud (a fold), the open sky keeps its true edge
    const R0 = Math.max(1, Math.round((this.h * 0.03) / g));
    const dil = (src, val, R = R0) => { const out = new Uint8Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { if (src[j * nx + i] !== val) continue;
        for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { if (di * di + dj * dj > R * R) continue; const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < ny) out[jj * nx + ii] = 1; } }
      return out; };
    const closed = dil(solid, 1), flood = new Uint8Array(nx * ny), st = [];
    for (let i = 0; i < nx; i++) { st.push(i, (ny - 1) * nx + i); } for (let j = 0; j < ny; j++) { st.push(j * nx, j * nx + nx - 1); }
    while (st.length) { const k = st.pop(); if (flood[k] || closed[k]) continue; flood[k] = 1; const i = k % nx, j = (k / nx) | 0;
      if (i > 0) st.push(k - 1); if (i < nx - 1) st.push(k + 1); if (j > 0) st.push(k - nx); if (j < ny - 1) st.push(k + nx); }
    const back = dil(flood, 1);
    // islands: a knob joined to the heap only by a thread would end up a loose white speck once the outline is cut
    // in — erode the cloud (threads break), keep the main body and big pieces, grow them back
    const Re = Math.max(1, Math.round((this.h * 0.012) / g));
    const ero = dil(solid, 0, Re).map((v, k) => (solid[k] && !v ? 1 : 0));
    const comp = new Int32Array(nx * ny).fill(-1), sizes = [];
    for (let k0 = 0; k0 < nx * ny; k0++) { if (!ero[k0] || comp[k0] >= 0) continue; const id = sizes.length; let n = 0; const q = [k0]; comp[k0] = id;
      while (q.length) { const k = q.pop(); n++; const i = k % nx, j = (k / nx) | 0;
        for (const kk of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < ny - 1 ? k + nx : -1]) if (kk >= 0 && ero[kk] && comp[kk] < 0) { comp[kk] = id; q.push(kk); } }
      sizes.push(n); }
    const big = Math.max(0, ...sizes), main = new Uint8Array(nx * ny);
    for (let k = 0; k < nx * ny; k++) main[k] = comp[k] >= 0 && sizes[comp[k]] >= big * 0.04 ? 1 : 0;
    const kept = dil(main, 1, Re + 1);
    this.loose = new Uint8Array(nx * ny);
    for (let k = 0; k < nx * ny; k++) { const lost = solid[k] && !kept[k]; this.loose[k] = lost ? 1 : 0; ext[k] = (back[k] && !solid[k]) || lost ? 1 : 0; }
  }
  _loose(x, y) { const i = Math.floor((x - this.ex0) / this.eg), j = Math.floor((y - this.ey0) / this.eg);
    return i >= 0 && j >= 0 && i < this.enx && j < this.eny && this.loose[j * this.enx + i] === 1; }
  _pinhole(x, y) { const R = this.h * 0.045; let open = 0; for (let k = 0; k < 6; k++) open += this.isSky(x + Math.cos(k * 1.047) * R, y + Math.sin(k * 1.047) * R) ? 1 : 0; return open < 3; }
  isSky(x, y) { const i = Math.floor((x - this.ex0) / this.eg), j = Math.floor((y - this.ey0) / this.eg);
    if (i < 0 || j < 0 || i >= this.enx || j >= this.eny) return true; return this.ext[j * this.enx + i] === 1; }
  _raw(x, y) {
    const cand = this.grid.get(Math.floor(x / this.cs) * 100003 + Math.floor(y / this.cs)) ?? [];
    let front = null, fd = 0, outer = -1e9, near = null;
    for (const l of cand) { const d = this._d(l, x, y); if (d > outer) { outer = d; near = l; } if (d > 0 && (!front || l.i > front.i)) { front = l; fd = d; } }
    const baseCut = (this.baseAt(x) - y) / (this.h * this.flat);
    if (baseCut <= 0) front = null;
    return { cand, front, fd, outer: Math.min(outer, baseCut), near, gap: near ? Math.max(0, -outer * near.r) : 1e9 };
  }
  get bounds() { return [this.x0, this.y0, this.x1, this.y1]; }
  /** The base line at x: level overall, gently irregular (never ruled), rising a little at the cloud's ends. */
  baseAt(x) { const u = (x - this.x) / (this.w * 0.5);
    return this.base - this.h * (0.022 * (noise2(x / (this.h * 0.35), 7.7, 11) - 0.5) * 2 + 0.012 * (noise2(x / (this.h * 0.1), 3.1, 5) - 0.5) * 2 + 0.05 * Math.max(0, Math.abs(u) - 0.7) / 0.3); }
  _d(l, x, y) { // > 0 inside the lobe, in units of its radius; a little noise makes the outline lumpy, not geometric
    const d = 1 - Math.hypot(x - l.x, (y - l.y) / l.sy) / l.r + (noise2(x / l.r * 2.2 + l.seed, y / l.r * 2.2, 3) - 0.5) * 0.16;
    return l.kind === 'core' ? Math.min(d, (y - (this.base - this.top(x))) / (this.h * 0.04) - 0.5) : d;   // the core never shapes the outline
  }
  /** What a painter needs to know at (x, y): the front-most lobe there, how deep inside it, the light on it. */
  at(x, y) {
    const key = Math.round(x / this.q) * 1000003 + Math.round(y / this.q);
    const c = this.cache.get(key); if (c) return c;
    let { cand, front, fd, outer, near, gap } = this._raw(x, y), occl = 0, fold = 0;
    if (front && this._loose(x, y)) { front = null; outer = -0.05; }
    if (!front && near && y < this.baseAt(x) - this.h * this.flat * 0.3 && (!this.isSky(x, y) || (gap < this.h * 0.05 && this._pinhole(x, y)))) { front = near; fd = 0.01; outer = 0.03; fold = 1; }   // an enclosed pocket or pinhole: a deep fold, never a dot of sky
    const baseCut = (this.baseAt(x) - y) / (this.h * this.flat);
    let res;
    if (!front || baseCut <= 0) res = { inside: outer, lobe: null, gap, near };
    else {
      // crevice: am I just above the top edge of a nearer lobe? Then I am in the shade it casts / the fold behind it
      occl = fold * 0.8;
      for (const l of cand) if (l.i > front.i) { const d = this._d(l, x, y); if (d < 0 && d > -0.3 && y < l.y) occl = Math.max(occl, 0.75 * smoothstep(-0.3, 0, d) * smoothstep(-0.2, 0.6, (l.y - y) / l.r)); }
      const nx = (x - front.x) / front.r, ny = (y - front.y) / (front.r * front.sy), nn = Math.min(1, Math.hypot(nx, ny)), nz = Math.sqrt(Math.max(0, 1 - nn * nn));
      const [lx, ly] = this.light, lz = this.lz, ln = Math.hypot(lx, ly, lz);
      const diffuse = clamp((nx * lx + ny * ly + nz * lz) / ln);
      // the whole heap is a big rounded form too: lighter on the sun side and the tops, grey towards the base
      const gx = (x - this.x) / (this.w * 0.5), gy = (y - (this.base - this.h * 0.55)) / (this.h * 0.55);
      const global = clamp(0.52 + 0.75 * (gx * this.light[0] + gy * this.light[1]));
      const rel = clamp((this.base - y) / this.h);
      // the base is in shade under a high sun; a sun below the cloud lights it instead (sunset bellies)
      const baseShade = smoothstep(0.42, 0.05, rel) * smoothstep(0.3, -0.2, ly);
      let f = this.lobeLight * diffuse + (1 - this.lobeLight) * global - 0.45 * occl - 0.22 * baseShade;
      f = clamp((f - 0.05) * 1.2);
      res = { inside: outer, lobe: front, depth: fd, diffuse, global, occl, base: baseShade, f, rel };
    }
    this.cache.set(key, res);
    return res;
  }
  /** Tangent (radians) that wraps around the front lobe at (x, y). */
  tangent(x, y) { const a = this.at(x, y); const l = a.lobe; return l ? Math.atan2(y - l.y, x - l.x) + Math.PI / 2 : 0; }
  /** Outline points (for the sketch phase). */
  outline(n = 80) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const px = this.x0 + ((this.x1 - this.x0) * i) / n; let yy = this.base;
      for (let y = this.y0; y < this.base; y += this.h * 0.01) if (this.at(px, y).inside > 0) { yy = y; break; }
      pts.push([px, yy]); }
    return pts;
  }
}

/** Paint a BillowCloud over a sky that is ALREADY painted. sky(x, y) → colour: that same sky function (used to cut
 *  the outline in with sky paint and to lose the soft edges) · colors: { deep, shadow, mid, light, highlight } (default
 *  cloudPalette()) · size: largest brush (≈ 0.03 for a cloud filling half the frame, 0.01–0.02 for distant ones) ·
 *  detail: 0…1 rim lights and folds (lower it for far clouds) · soft: 0 crisp … 1 very soft · drift: [vx, vy] for the
 *  living phase (keep it horizontal: the cut-in ring carries the sky colour of where it was painted) ·
 *  phase: name prefix for the timelapse phases (CLOUD_STAGES).
 *  Order (each is one stage of the demonstration): block-in → blend → lights on each lobe's sunward rim → folds of
 *  shade above each nearer lobe → cut the silhouette with sky paint → soft base. */
export function paintBillowCloud(layer, cloud, { sky, colors = cloudPalette(), size = 0.03, detail = 1, soft = 0.5, drift = [0, 0], phase = null } = {}) {
  const P = layer.p, C = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, col(v)]));
  const tint = (f) => ramp(f, [[0, C.deep], [0.2, C.shadow], [0.46, C.mid], [0.76, C.light], [1, C.highlight]]);
  const skyAt = (x, y) => col(typeof sky === 'function' ? sky(x, y) : sky);
  const pad = cloud.h * 0.12, B = [cloud.x0 - pad, cloud.y0 - pad, cloud.x1 + pad, cloud.base + pad * 0.6];
  const ph = (name) => { if (phase) P.phase(`${phase}-${name}`); };
  const lr = (x, y) => { const a = cloud.at(x, y); return a.lobe ? a.lobe.r : cloud.h * 0.06; };
  const bw = (x, y, k = 1) => clamp(lr(x, y) * 0.55 * k, size * 0.25, size * 1.4);
  // the body colour: the light the front-most lobe receives there, placed on the five-mix ramp
  const bodyCol = (x, y, r, dv = 0.012) => { const a = cloud.at(x, y); return vary(tint(a.f ?? 0.3), r, dv, 0.004, 3); };

  // a cloud stroke must end inside the cloud: the cut-in only covers a thin ring, so a long stroke poking out
  // past it would be left in the sky as a loose white mark. Shorten it until both ends land, or drop it.
  const slack = size * 0.2;
  const fits = (st) => {
    for (let k = 0; k < 4; k++) {
      const hx = Math.cos(st.angle ?? 0) * st.length * 0.5, hy = Math.sin(st.angle ?? 0) * st.length * 0.5;
      const e0 = cloud.at(st.x - hx, st.y - hy), e1 = cloud.at(st.x + hx, st.y + hy);
      if ((e0.lobe || e0.gap < slack) && (e1.lobe || e1.gap < slack)) return true;
      st.length *= 0.6;
    }
    return false;
  };
  const each = (st) => fits(st);
  // 0. underpainting: the whole shape covered in broad, thin strokes of its local tone — no sky left inside
  ph('block-in');
  layer.scatter({ bounds: B, spacing: size * 0.5, order: 'sweep', brush: 'filbert',
    mask: (x, y) => (cloud.at(x, y).inside > 0 ? 1 : 0),
    width: (x, y, r) => size * r.range(0.9, 1.2), length: (x, y, r) => size * r.range(1.3, 2), angle: (x, y, r) => (r() - 0.5) * 0.8,
    color: (x, y, r) => bodyCol(x, y, r, 0.006), soft: 0.6, thick: 0.03, dry: 0, fray: 0.05, bristles: 6, each, drift });
  // 1. block-in: the masses of light and shade, strokes curving round each lobe
  layer.scatter({ bounds: B, spacing: size * 0.32, order: 'down', brush: 'filbert',
    mask: (x, y) => { const a = cloud.at(x, y); return a.inside > 0.02 ? 1 : 0; },
    width: (x, y, r) => bw(x, y) * r.range(0.8, 1.2), length: (x, y, r) => bw(x, y) * r.range(1.0, 1.5),
    // near a lobe's rim the brush follows its curve; inside, short strokes in any direction (no target rings)
    angle: (x, y, r) => { const a = cloud.at(x, y); const k = smoothstep(0.45, 0.15, a.depth ?? 0); return k > r() ? cloud.tangent(x, y) + (r() - 0.5) * 0.4 : r() * Math.PI; },
    bend: (x, y, r) => (smoothstep(0.45, 0.15, cloud.at(x, y).depth ?? 0) * 0.15),
    color: bodyCol, soft: 0.7, thick: 0.04, dry: 0, fray: 0.06, bristles: 6, pickup: 0.2, each, drift });
  // 2. blend: soft dry-brush passes that join the strokes into smooth vapour (the flat brush stroking lightly over the paint)
  ph('blend');
  layer.scatter({ bounds: B, spacing: size * 0.45, order: 'random', brush: 'wash',
    mask: (x, y) => (cloud.at(x, y).inside > 0.05 ? 0.9 : 0),
    width: (x, y, r) => bw(x, y, 1.3) * r.range(0.9, 1.3), length: (x, y, r) => bw(x, y, 1.3) * r.range(1.2, 2),
    angle: (x, y, r) => r() * Math.PI, bend: 0, color: (x, y, r) => bodyCol(x, y, r, 0.006), opacity: 0.6 * (0.6 + soft * 0.7), pickup: 0.4, thick: 0.02, each, drift });
  // 3. turn each lobe: a soft crescent of lighter paint along the rim that faces the sun, only where that lobe is
  //    in front — a value step over the body, never a thick white mark (the small round brush, touched along the rim)
  ph('lights');
  const [lx, ly] = cloud.light, la = Math.atan2(ly, lx);
  const rr = layer.rand;
  for (const l of cloud.lobes) {
    if (l.kind === 'core' || l.r < size * 0.15) continue;
    const span = 1.3 + rr() * 0.7, steps = Math.max(2, Math.round((l.r * span) / Math.max(size * 0.3, l.r * 0.4)));
    for (let k = 0; k < steps; k++) {
      const a = la + span * ((k + rr.range(0.2, 0.8)) / steps - 0.5), inset = l.r * rr.range(0.1, 0.22);
      const px = l.x + Math.cos(a) * (l.r - inset), py = l.y + Math.sin(a) * (l.r - inset) * l.sy;
      const s = cloud.at(px, py); if (s.lobe !== l || s.inside < 0.03) continue;
      const lit = clamp(s.diffuse * 0.5 + s.global * 0.8 - s.base * 0.9 - s.occl * 0.5 - 0.3) * detail;
      if (lit <= 0.04 || rr() > lit * 1.6) continue;
      const wd = clamp(l.r * rr.range(0.35, 0.5), size * 0.2, size * 1.2);
      const c = vary(mixOk(tint(s.f), lit > 0.5 ? C.highlight : C.light, 0.25 + 0.5 * lit), rr, 0.006, 0.003, 3);
      const st = { x: px, y: py, angle: a + Math.PI / 2, length: wd * rr.range(1.6, 2.4) }; if (!fits(st)) continue;
      layer.stroke({ brush: 'round', ...st, width: wd, bend: 0.25,
        color: c, soft: 0.85, thick: 0.03, fray: 0.05, dry: 0, bristles: 4, pickup: 0.2, opacity: 0.7, taper: [0.6, 0.6], drift });
      if (lit > 0.55 && rr() < 0.6) layer.stroke({ brush: 'round', x: px + Math.cos(a) * wd * 0.15, y: py + Math.sin(a) * wd * 0.15, angle: a + Math.PI / 2,
        length: wd * rr.range(0.8, 1.3), width: wd * 0.5, bend: 0.25, color: shift(c, 0.015), soft: 0.8, thick: 0.03, bristles: 4, fray: 0.05, opacity: 0.75, drift });
    }
  }
  // 3b. folds: just above the top edge of every nearer lobe, a broad, soft band of the grey-violet shade of the lobe
  //     behind it — dark against light, so each lobe's lit top reads as a scallop (the scale pattern of a cumulus).
  //     Broad and soft on purpose: a thin dark crescent here reads as an ink outline.
  ph('folds');
  // the fold lies just outside the nearer lobe's LIT rim (on the lobe behind): above it under a high sun, towards
  // the sun's side when the sun is low — never on the shadow side, where it would only draw a dark line
  const foldDir = Math.atan2(Math.min(ly, -0.35), lx * 0.6);
  for (const l of cloud.lobes) {
    if (l.kind === 'core' || l.r < size * 0.25) continue;
    const span = 1.5 + rr() * 0.5, steps = Math.max(2, Math.round((l.r * span) / Math.max(size * 0.35, l.r * 0.45)));
    for (let k = 0; k < steps; k++) {
      const a = foldDir + span * ((k + rr.range(0.25, 0.75)) / steps - 0.5);
      const ro = l.r * rr.range(1.1, 1.22), px = l.x + Math.cos(a) * ro, py = l.y + Math.sin(a) * ro * l.sy;
      const s = cloud.at(px, py); if (!s.lobe || s.lobe.i >= l.i || s.inside < 0.02) continue;      // only over a lobe behind this one
      const own = cloud.at(l.x + Math.cos(a) * l.r * 0.85, l.y + Math.sin(a) * l.r * 0.85 * l.sy); if (own.lobe !== l) continue;
      const wd = clamp(l.r * rr.range(0.3, 0.42), size * 0.15, size * 0.9);
      const st = { x: px, y: py, angle: a + Math.PI / 2, length: wd * rr.range(1.8, 2.6) }; if (!fits(st)) continue;
      layer.stroke({ brush: 'wash', ...st, width: wd, bend: 0.2,
        color: vary(tint(clamp(Math.min(s.f, own.f) - 0.14)), rr, 0.006, 0.003, 3), soft: 0.95, thick: 0.01, fray: 0.05, bristles: 4, opacity: 0.4 * detail * clamp(own.f * 1.4), pickup: 0.25, drift });   // a fold only shows against light
    }
  }
  // 4. cut the silhouette with sky colour: crisp scallops on the lit side, a soft lost edge on the shadow side
  ph('edges');
  //    The strokes sit just outside the outline and cover the soft halo the body strokes left, so the sky meets the
  //    cloud in one clean edge; no pickup (a white-tinted sky stroke reads as a stitch).
  const sunSide = (x, y) => clamp(0.5 + 0.5 * (((x - cloud.x) / cloud.w) * lx * 2 + ((y - cloud.base + cloud.h * 0.5) / cloud.h) * ly));
  const reach = size * 0.9;                                  // covers the half-width of the widest body strokes
  //    They are sky strokes — the sky's brush, direction and paint thickness — so the ring around the cloud has the
  //    same texture as the rest of the sky (tangent strokes or thin paint here read as a halo).
  layer.scatter({ bounds: B, spacing: size * 0.13, order: 'random', brush: 'flat',
    mask: (x, y) => { const a = cloud.at(x, y); return !a.lobe && a.inside < 0 && a.gap > size * 0.14 && a.gap < reach && y < cloud.baseAt(x) - cloud.h * cloud.flat * 0.5 && cloud.isSky(x, y) ? 1 : 0; },
    width: (x, y, r) => size * r.range(0.22, 0.34), length: (x, y, r) => size * r.range(0.7, 1.2),
    angle: (x, y, r) => (r() < 0.5 ? 0.22 : -0.22) + (r() - 0.5) * 0.5,
    color: (x, y, r) => vary(skyAt(x, y), r, 0.006, 0.003, 1),
    soft: (x, y) => lerp(0.6, 0.22, sunSide(x, y)), opacity: (x, y) => lerp(0.6, 1, sunSide(x, y)),
    thick: 0.12, fray: 0.2, dry: 0.04, bristles: 20, pickup: 0, drift });
  //    …then the outline itself: small round touches of sky laid along each lobe's curve, so the edge is a row of
  //    rounded scallops (the round brush working round the silhouette), with the sky's paint thickness
  layer.scatter({ bounds: B, spacing: size * 0.07, order: 'random', brush: 'round',
    mask: (x, y) => { const a = cloud.at(x, y); return !a.lobe && a.inside < 0 && a.gap < size * 0.16 && y < cloud.baseAt(x) - cloud.h * cloud.flat * 0.5 && cloud.isSky(x, y) ? 1 : 0; },
    width: (x, y, r) => size * r.range(0.13, 0.2), length: (x, y, r) => size * r.range(0.3, 0.5),
    angle: (x, y, r) => { const n = cloud.at(x, y).near; return n ? Math.atan2(y - n.y, x - n.x) + Math.PI / 2 + (r() - 0.5) * 0.2 : 0; },
    color: (x, y, r) => vary(skyAt(x, y), r, 0.005, 0.003, 1),
    soft: (x, y) => lerp(0.7, 0.3, sunSide(x, y)), opacity: (x, y) => lerp(0.55, 1, sunSide(x, y)),
    thick: 0.1, fray: 0.05, dry: 0, bristles: 12, pickup: 0, drift });
  // 5. the base: a few level, soft drags that dissolve the flat bottom into the haze (no slab below the cloud)
  ph('base');
  const bh = cloud.h * cloud.flat, by = (x) => cloud.baseAt(x);
  const above = (x) => cloud.at(x, by(x) - bh * 0.9);
  layer.scatter({ bounds: [cloud.x0, cloud.base - bh * 2, cloud.x1, cloud.base + bh * 0.6], spacing: size * 0.35, order: 'right', brush: 'wash',
    mask: (x, y) => (y > by(x) - bh * 0.8 && y < by(x) + bh * 0.5 && above(x).inside > 0.04 ? 0.9 : 0),
    width: (x, y, r) => size * r.range(0.6, 1), length: (x, y, r) => size * r.range(1.2, 2), angle: (x, y, r) => (r() - 0.5) * 0.3,
    color: (x, y, r) => vary(mixOk(tint(above(x).f ?? 0.2), skyAt(x, y), smoothstep(by(x) - bh * 0.8, by(x) + bh * 0.5, y)), r, 0.006, 0.003, 2),
    opacity: 0.6, soft: 0.95, pickup: 0.3, thick: 0.02, drift });
  return layer;
}
