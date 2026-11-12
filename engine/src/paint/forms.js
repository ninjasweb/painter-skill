// Form helpers: a painter thinks of clouds, foliage and rocks as clusters of rounded lumps lit from one side.
// A Lobes object answers three questions for any point: am I inside the form (density), how much light
// reaches me (lit), and which way should the brush travel to wrap around the form (tangent).

import { rng, clamp, lerp, smoothstep, noise2 } from '../core/math.js';

export class Lobes {
  constructor(lobes, light = [-0.6, -0.8]) {
    this.lobes = lobes;
    const n = Math.hypot(light[0], light[1]) || 1; this.L = [light[0] / n, light[1] / n];
    this.x0 = Math.min(...lobes.map((l) => l.x - l.r)); this.x1 = Math.max(...lobes.map((l) => l.x + l.r));
    this.y0 = Math.min(...lobes.map((l) => l.y - l.r)); this.y1 = Math.max(...lobes.map((l) => l.y + l.r));
  }
  get bounds() { return [this.x0, this.y0, this.x1, this.y1]; }
  _dom(x, y) {
    let best = null, bd = -1e9;
    for (const l of this.lobes) { const d = 1 - Math.hypot(x - l.x, (y - l.y) / (l.sy ?? 1)) / l.r; if (d > bd) { bd = d; best = l; } }
    if (this.base !== undefined) bd = Math.min(bd, (this.base - y) / this.baseSoft);
    return [best, bd];
  }
  /** > 0 inside. 1 at a lobe centre, 0 on the outline, negative outside. */
  density(x, y) { return this._dom(x, y)[1]; }
  /** 0 (turned away from the light) … 1 (facing it), with the whole mass also lighter on its lit side. */
  lit(x, y) {
    const [l] = this._dom(x, y);
    const nx = (x - l.x) / l.r, ny = (y - l.y) / (l.r * (l.sy ?? 1));
    const local = clamp((nx * this.L[0] + ny * this.L[1]) * 0.5 + 0.5);
    const cx = (this.x0 + this.x1) / 2, cy = (this.y0 + this.y1) / 2;
    const g = clamp((((x - cx) / (this.x1 - this.x0)) * this.L[0] + ((y - cy) / (this.y1 - this.y0)) * this.L[1]) + 0.5);
    return clamp(local * 0.65 + g * 0.35);
  }
  /** Brush direction (radians) that wraps around the dominant lobe. */
  tangent(x, y) { const [l] = this._dom(x, y); return Math.atan2(y - l.y, x - l.x) + Math.PI / 2; }
  /** Outline points (for the sketch phase). */
  outline(n = 60) {
    const cx = (this.x0 + this.x1) / 2, cy = (this.y0 + this.y1) / 2, R = Math.max(this.x1 - this.x0, this.y1 - this.y0);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2; let lo = 0, hi = R;
      for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (this.density(cx + Math.cos(a) * m, cy + Math.sin(a) * m) > 0) lo = m; else hi = m; }
      pts.push([cx + Math.cos(a) * lo, cy + Math.sin(a) * lo]);
    }
    return pts;
  }
}

/** A cumulus: a heap of many small lumps on a flat base, rising in one to three towers.
 *  x,y = centre of the base; w,h = overall size; lobes = number of lumps (more = finer cauliflower). */
export function cumulusShape({ x, y, w, h, lobes = 46, towers = 3, seed = 1, light }) {
  const r = rng(seed); const T = [];
  for (let i = 0; i < towers; i++) T.push({ cx: x + (r() - 0.5) * w * 0.55, hw: w * r.range(0.16, 0.3), ht: h * (i === 0 ? 1 : r.range(0.45, 0.85)) });
  const top = (px) => Math.max(...T.map((t) => t.ht * Math.exp(-(((px - t.cx) / t.hw) ** 2)))) * smoothstep(0, 0.16, 0.5 - Math.abs(px - x) / w) + h * 0.12 * smoothstep(0, 0.1, 0.5 - Math.abs(px - x) / w);
  const L = [];
  for (let i = 0; i < lobes; i++) {
    const px = x + (r() - 0.5) * w * 0.94, ht = top(px);
    const up = r() < 0.6 ? r.range(0.72, 1) : r();                // most lumps sit on the rim, where they show
    const py = y - ht * up, rel = (y - py) / h;
    L.push({ x: px, y: py, r: h * lerp(0.16, 0.075, clamp(rel)) * r.range(0.75, 1.3) });
  }
  for (let i = 0; i < 12; i++) { const px = x + (i / 11 - 0.5) * w * 0.86, ht = top(px); L.push({ x: px, y: y - ht * 0.42, r: Math.max(ht * 0.52, h * 0.1) }); }  // solid core, no holes
  const s = new Lobes(L, light); s.base = y; s.baseSoft = h * 0.07; s.y1 = y;
  return s;
}

/** A leafy crown / bush / clump: lumps scattered in an ellipse. */
export function clumpShape({ x, y, w, h, lobes = 12, seed = 1, light }) {
  const r = rng(seed); const L = [];
  for (let i = 0; i < lobes; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.5;
    L.push({ x: x + Math.cos(a) * d * w * 0.8, y: y + Math.sin(a) * d * h * 0.8, r: Math.min(w, h) * r.range(0.16, 0.3) });
  }
  return new Lobes(L, light);
}

/** A ragged silhouette line y = f(x): hills, tree lines, cloud-bank edges. Layered noise, deterministic. */
export function ridge({ y, amp = 0.05, freq = 3, seed = 1, rough = 0.5, slope = 0 }) {
  return (x) => y + slope * x - amp * ((noise2(x * freq, 0.5, seed) - 0.5) * 2 + rough * (noise2(x * freq * 3.1, 1.5, seed + 7) - 0.5) + rough * 0.4 * (noise2(x * freq * 9.7, 2.5, seed + 13) - 0.5));
}

export { smoothstep };

/** A summit skyline y = f(x): pointed peaks of different heights with broken, jagged flanks (ridge() gives rolling
 *  hills and plateaus; use peaks() for alpine ranges). y: base line of the range · height: tallest summit ·
 *  count: number of summits across [x0, x1] · sharp: 0.6 rounded … 1.4 needle-like. */
export function peaks({ y, height = 0.3, count = 5, seed = 1, x0 = -0.1, x1 = 1.9, sharp = 1, jag = 0.12, saddle = 0.3, main = null }) {
  const r = rng(seed * 613 + 11), S = [];
  for (let i = 0; i < count; i++) { const h = height * (i === Math.floor(count * 0.4) ? 1 : r.range(0.45, 0.9));
    S.push({ c: main !== null && i === Math.floor(count * 0.4) ? main : lerp(x0, x1, (i + r.range(0.2, 0.8)) / count), h, wl: h * r.range(0.7, 1.5) / sharp, wr: h * r.range(0.7, 1.5) / sharp }); }
  return (x) => { let e = 0;
    for (const p of S) { const d = x - p.c, w = d < 0 ? p.wl : p.wr; e = Math.max(e, p.h * Math.max(0, 1 - Math.abs(d) / w)); }
    e = Math.max(e, height * saddle * (0.55 + 0.9 * noise2(x * 2.3, 4.5, seed + 9)));
    e *= smoothstep(x0 - 0.02, x0 + 0.12, x) * smoothstep(x1 + 0.02, x1 - 0.12, x);                    // the range lives between x0 and x1 and tapers out at both ends   // the range stays connected: saddles between summits never drop to the base
    const j = (noise2(x * 14, 0.5, seed) - 0.5) * 2 + (noise2(x * 41, 1.5, seed + 3) - 0.5);
    return y - e * (1 + jag * j) - height * 0.04 * (noise2(x * 5, 2.5, seed + 5)); };
}
