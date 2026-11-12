// Deterministic math helpers. Everything random in a painting comes from a seed,
// so the same scene always produces the same strokes (no boiling between frames).

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const remap = (x, a, b, c, d) => c + (d - c) * clamp((x - a) / (b - a));
export const TAU = Math.PI * 2;

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  const f = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += f(); return (u - 2) / 0.58; }; // ~N(0,1)
  f.int = (a, b) => Math.floor(f.range(a, b + 1));
  f.fork = () => rng(Math.floor(f() * 4294967296));
  return f;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function h2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1]. */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy, seed), b = h2(ix + 1, iy, seed), c = h2(ix, iy + 1, seed), d = h2(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise in [0,1]; `oct` octaves, each twice the frequency and `gain` the amplitude. */
export function fbm(x, y, seed = 0, oct = 4, gain = 0.5) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x, y, seed + i * 131); n += a; a *= gain; x *= 2.03; y *= 2.03; }
  return s / n;
}

/** Billowy noise (rounded lumps) — the cauliflower shape of cumulus and foliage clumps. */
export function billow(x, y, seed = 0, oct = 4) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * Math.abs(noise2(x, y, seed + i * 71) * 2 - 1); n += a; a *= 0.5; x *= 2.1; y *= 2.1; }
  return 1 - s / n;
}

/** Jittered-grid sampling: roughly even coverage without visible rows. Calls fn(x, y) for each point. */
export function scatterPoints(x0, y0, x1, y1, spacing, rand, fn) {
  const nx = Math.max(1, Math.ceil((x1 - x0) / spacing)), ny = Math.max(1, Math.ceil((y1 - y0) / spacing));
  const pts = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    pts.push([x0 + (i + rand()) * spacing, y0 + (j + rand()) * spacing]);
  }
  for (const p of pts) fn(p[0], p[1]);
  return pts.length;
}

export const ease = {
  linear: (t) => t,
  inOut: (t) => t * t * (3 - 2 * t),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

/** Keyframes: key(t, [[t0,v0],[t1,v1],...], easing). Values may be numbers or arrays. */
export function key(t, frames, easing = ease.inOut) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    if (t <= frames[i][0]) {
      const [ta, a] = frames[i - 1], [tb, b] = frames[i];
      const k = easing((t - ta) / (tb - ta));
      return Array.isArray(a) ? a.map((v, j) => lerp(v, b[j], k)) : lerp(a, b, k);
    }
  }
  return frames[frames.length - 1][1];
}
