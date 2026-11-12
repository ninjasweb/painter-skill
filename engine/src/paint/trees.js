// Trees. Order of work taken from the demonstrations:
//   skeleton first (trunk wide at the base, thin at the top; branches that rise then droop) →
//   darkest foliage masses, leaving sky holes → a few branches restated on top →
//   lit side of the trunk in thick warm paint, shadow side in cool dark →
//   middle greens → last, the lightest, thickest tufts where the sun lands.
// Greens are mixed and "earthed", never straight from the tube; lights are thick, shadows thin.

import { rng, clamp, lerp, smoothstep, noise2 } from '../core/math.js';
import { col, mixOk, vary, shift } from '../core/color.js';
import { clumpShape } from './forms.js';

const bez = (a, b, c, t) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]];

/** A pine (Scots/ponderosa character: tall bare trunk, layered drooping boughs, needle clusters).
 *  x, base: foot of the trunk · height · trunkW: width at the foot · lean: sideways drift of the top (fraction of height) ·
 *  lightX: −1 light from the left … +1 from the right ·
 *  colors: { barkDark, barkLight, barkShadow, needleDark, needleMid, needleLight } · boughs: number of branches ·
 *  detail: 0.5 (distant) … 1.5 (hero tree). Returns { top, clusters } for composing around it. */
export function paintPine(layer, { x, base, height, trunkW = 0.035, lean = 0.03, lightX = -1, colors, boughs = 11, seed = 1, sway = 0.004, detail = 1, bare = 0.3 }) {
  const r = rng(seed * 7919 + 13), C = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, col(v)]));
  const tp = (t) => [x + lean * height * t * t + (noise2(t * 3, 0, seed) - 0.5) * trunkW * 1.2 * t, base - height * t];
  const tw = (t) => trunkW * (1 - 0.72 * t) + trunkW * 0.3 * Math.pow(1 - t, 6);    // flare at the root
  const trunkPts = Array.from({ length: 15 }, (_, i) => tp(i / 14));

  // 1. trunk: dry dark scrub, value and basic form only
  layer.path(trunkPts, { brush: 'flat', width: tw, color: (t, px, py, rr) => vary(C.barkDark, rr, 0.02), dry: 0.3, thick: 0.3, step: height / 16, wobble: 0.2 });

  // 2. boughs: lower ones long and drooping, upper ones short and reaching up; never two alike
  const B = [], clusters = [];
  for (let i = 0; i < boughs; i++) {
    const t = lerp(bare, 0.96, Math.pow((i + r.range(0.1, 0.9)) / boughs, 0.9)), side = (i % 2 ? 1 : -1) * (r() < 0.8 ? 1 : -1);
    const k = (t - bare) / (1 - bare);                                  // 0 lowest bough … 1 top
    const len = height * (0.3 * (1 - 0.7 * k) + 0.03) * r.range(0.55, 1.2);
    const a = tp(t), rise = len * lerp(0.05, 0.55, k) * r.range(0.6, 1.3), droop = len * lerp(0.3, 0.0, k) * r.range(0.3, 1);
    const b = [a[0] + side * len * 0.45, a[1] - rise - len * 0.08], c = [a[0] + side * len, a[1] - rise + droop];
    B.push({ a, b, c, len, t, side });
    const pts = Array.from({ length: 7 }, (_, q) => bez(a, b, c, q / 6));
    layer.path(pts, { brush: 'round', width: (u) => tw(t) * 0.4 * (1 - 0.8 * u) + 0.0015, color: (u, px, py, rr) => vary(C.barkDark, rr, 0.025), thick: 0.3, step: len / 5, wobble: 0.8 });
    for (let q = 0; q < 3; q++) { const u = r.range(0.3, 0.85), o = bez(a, b, c, u), tl = len * r.range(0.12, 0.28), ang = (side > 0 ? 0 : Math.PI) + (r() - 0.5) * 2.0 - 0.3 * side;
      layer.stroke({ brush: 'liner', p0: o, p2: [o[0] + Math.cos(ang) * tl, o[1] + Math.sin(ang) * tl - tl * 0.15], width: 0.0025 + tw(t) * 0.1, color: C.barkDark, bend: 0.25 }); }
    // rounded needle clumps gather near the outer half of the bough, sitting on top of it
    const n = Math.max(3, Math.round((2.5 + 4.5 * (len / (height * 0.3))) * Math.sqrt(detail)));
    for (let q = 0; q < n; q++) { const u = lerp(0.4, 1.05, (q + r()) / n), o = bez(a, b, c, Math.min(u, 1)), rc = (len * r.range(0.17, 0.3) + height * 0.012) * lerp(1, 0.8, u - 0.4);
      clusters.push({ x: o[0] + (r() - 0.5) * rc * 0.6 + (u > 1 ? side * rc * 0.4 : 0), y: o[1] - rc * r.range(0.25, 0.7), rc, side, t }); }
  }
  const top = tp(1);
  for (let q = 0; q < 5; q++) clusters.push({ x: top[0] + (r() - 0.5) * height * 0.06, y: top[1] + r() * height * 0.05 - height * 0.01, rc: height * r.range(0.035, 0.055), side: 0, t: 1 });
  clusters.sort((m, n2) => m.y - n2.y);

  // needles: a burst of short fan strokes around the clump centre, a few hanging lower, most reaching up and out
  const needles = (cl, n, color, lenK, off, opt) => {
    for (let i = 0; i < n; i++) {
      let ang = r() * Math.PI * 2; if (Math.sin(ang) > 0.5 && r() < 0.6) ang = -ang;         // fewer pointing straight down
      const d0 = cl.rc * r() * 0.35, L = cl.rc * lenK * r.range(0.55, 1.15);
      const sx = cl.x + off[0] * cl.rc + Math.cos(ang) * d0, sy = cl.y + off[1] * cl.rc + Math.sin(ang) * d0 * 0.8;
      layer.stroke({ brush: 'fan', p0: [sx, sy], p2: [sx + Math.cos(ang) * L, sy + Math.sin(ang) * L * 0.8], bend: (r() - 0.5) * 0.35, width: L * r.range(0.4, 0.7), taper: [0.45, 1],
        color: vary(color, r, 0.025, 0.008, 5), sway: sway * (0.5 + cl.t), swayRoot: 0.3, ...opt });
    }
  };
  const nn = (cl, kk) => Math.max(3, Math.round(34 * detail * kk * Math.sqrt(cl.rc / (height * 0.04))));
  // 3. darkest masses first — thin, scratchy paint that lets the sky show through
  for (const cl of clusters) needles(cl, nn(cl, 1), C.needleDark, 1.0, [0, 0.12], { dry: 0.4, thick: 0.22 });
  // 4. restate some boughs over the needles, warmer where the light catches them
  for (const b of B) if (r() < 0.7) {
    const pts = Array.from({ length: 5 }, (_, q) => bez(b.a, b.b, b.c, 0.05 + 0.55 * q / 4));
    const lit = b.side * lightX > 0;
    layer.path(pts, { brush: 'liner', width: (u) => tw(b.t) * 0.2 * (1 - 0.6 * u) + 0.0012, color: lit ? mixOk(C.barkLight, C.barkDark, 0.45) : shift(C.barkDark, -0.03), thick: lit ? 0.6 : 0.25, step: b.len / 6, wobble: 0.6 });
  }
  // 5. trunk: shadow side cool and thin, lit side warm and thick, many narrow broken bark strokes
  for (let i = 0; i < Math.round(170 * detail); i++) {
    const t = Math.pow(r(), 0.85) * 0.97, c = tp(t), w = tw(t), u = r() * 2 - 1;        // u: −1 … +1 across the trunk
    const litness = clamp(0.5 + 0.5 * u * lightX * 1.3 + (r() - 0.5) * 0.25), L = w * r.range(0.6, 1.8);
    const base2 = { x: c[0] + u * w * 0.38, y: c[1], angle: Math.PI / 2 + (r() - 0.5) * 0.35, length: L, bend: (r() - 0.5) * 0.3 };
    if (litness > 0.6) layer.stroke({ ...base2, brush: 'flat', width: w * r.range(0.08, 0.18), color: vary(mixOk(C.barkDark, C.barkLight, smoothstep(0.55, 1, litness)), r, 0.035, 0.012, 6), thick: 0.85, dry: 0.4 });
    else if (litness < 0.32) layer.stroke({ ...base2, brush: 'flat', width: w * r.range(0.1, 0.2), color: vary(mixOk(C.barkDark, C.barkShadow, 0.6), r, 0.02), thick: 0.2, dry: 0.3 });
    else layer.stroke({ ...base2, brush: 'liner', width: w * 0.05 + 0.001, length: L * 0.7, color: vary(shift(C.barkDark, r() < 0.5 ? -0.04 : 0.05), r, 0.02), thick: 0.25 });
  }
  // 6. middle greens, then 7. the lightest, thickest tufts — on top of each clump and on the side facing the light
  for (const cl of clusters) {
    const facing = clamp(0.6 + 0.4 * cl.side * lightX);
    needles(cl, nn(cl, 0.55), C.needleMid, 0.8, [lightX * 0.12, -0.12], { dry: 0.32, thick: 0.5 });
    needles(cl, nn(cl, 0.3 * facing), C.needleLight, 0.55, [lightX * 0.28, -0.3], { dry: 0.28, thick: 0.95 });
  }
  return { top, clusters, trunk: trunkPts };
}

/** Foliage mass from a Lobes shape: dark first (with sky holes), middle value, then loaded lights.
 *  dark / mid / light: mixes · size: leaf-dab size · holes: 0..1 amount of sky showing through. */
export function paintFoliage(layer, shape, { dark, mid, light, size = 0.018, holes = 0.3, sway = 0.004, seed = 1, detail = 1 }) {
  dark = col(dark); mid = col(mid); light = col(light);
  const [x0, y0, x1, y1] = shape.bounds, B = [x0 - size, y0 - size, x1 + size, y1 + size];
  const edge = (x, y) => shape.density(x, y) + (noise2(x * 45, y * 45, seed) - 0.5) * 0.5;
  const hole = (x, y) => (noise2(x * 16, y * 16, seed + 9) < holes * 0.62 && shape.density(x, y) < 0.55 ? 0 : 1);
  const leaf = { angle: (x, y, r) => r() * Math.PI * 2, sway, swayRoot: 1 };
  layer.scatter({ ...leaf, bounds: B, spacing: size * 0.4, brush: 'dab', mask: (x, y) => (edge(x, y) > 0 ? hole(x, y) : 0),
    width: (x, y, r) => size * r.range(0.7, 1.3), length: (x, y, r) => size * r.range(1, 1.9), color: (x, y, r) => vary(dark, r, 0.025, 0.008, 5), thick: 0.25, dry: 0.2 });
  layer.scatter({ ...leaf, bounds: B, spacing: size * 0.5 / detail, brush: 'dab', mask: (x, y) => (edge(x, y) > 0.05 ? hole(x, y) * smoothstep(0.35, 0.65, shape.lit(x, y)) * 0.8 : 0),
    width: (x, y, r) => size * r.range(0.5, 1), length: (x, y, r) => size * r.range(0.8, 1.6), color: (x, y, r) => vary(mixOk(dark, mid, smoothstep(0.35, 0.75, shape.lit(x, y))), r, 0.03, 0.01, 6), thick: 0.5 });
  layer.scatter({ ...leaf, bounds: B, spacing: size * 0.55 / detail, brush: 'dab', mask: (x, y) => (edge(x, y) > 0.08 ? hole(x, y) * smoothstep(0.62, 0.88, shape.lit(x, y)) * 0.6 : 0),
    width: (x, y, r) => size * r.range(0.4, 0.8), length: (x, y, r) => size * r.range(0.6, 1.3), color: (x, y, r) => vary(mixOk(mid, light, smoothstep(0.6, 0.95, shape.lit(x, y))), r, 0.03, 0.012, 6), thick: 0.95 });
  return layer;
}

/** A broadleaf tree: trunk, a few limbs, crown of foliage lumps. colors: { barkDark, barkLight, dark, mid, light }.
 *  Returns the crown shape. */
export function paintTree(layer, { x, base, height, crownW = null, trunkW = 0.03, lightX = -1, colors, seed = 1, sway = 0.004, detail = 1, holes = 0.3 }) {
  const r = rng(seed * 104729 + 7), C = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, col(v)]));
  crownW ??= height * 0.7;
  const fork = base - height * r.range(0.32, 0.45), crownY = base - height * 0.68, crownH = height * 0.62;
  const trunk = [[x, base], [x + (r() - 0.5) * trunkW, lerp(base, fork, 0.5)], [x + (r() - 0.5) * trunkW * 1.5, fork]];
  layer.path(trunk, { brush: 'flat', width: (t) => trunkW * (1 - 0.35 * t) + trunkW * 0.3 * Math.pow(1 - t, 5), color: (t, px, py, rr) => vary(C.barkDark, rr, 0.02), thick: 0.35, dry: 0.25, step: height / 10, wobble: 0.3 });
  // limbs reach INTO the crown (they must end inside the foliage), curving up from the fork
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i / 4 - 0.5) * 2.2 + (r() - 0.5) * 0.3, f = trunk[2];
    const e = [x + Math.cos(a) * crownW * r.range(0.2, 0.34), crownY + Math.sin(a) * crownH * r.range(0.12, 0.3)];
    const m = [lerp(f[0], e[0], 0.55) + (r() - 0.5) * crownW * 0.08, lerp(f[1], e[1], 0.35)];
    layer.path([f, m, e], { brush: 'round', width: (t) => trunkW * 0.42 * (1 - 0.8 * t) + 0.0015, color: (t, px, py, rr) => vary(C.barkDark, rr, 0.02), thick: 0.3, step: Math.hypot(e[0] - f[0], e[1] - f[1]) / 4, wobble: 0.8 }); }
  const shape = clumpShape({ x, y: crownY, w: crownW, h: crownH, lobes: Math.round(13 * detail), seed: seed + 5, light: [lightX * 0.6, -0.8] });
  paintFoliage(layer, shape, { dark: C.dark, mid: C.mid, light: C.light, size: height * 0.035 / Math.sqrt(detail), holes, sway, seed, detail });
  // bark: many narrow broken strokes — thick warm-light ones on the lit side, thin dark ones on the other
  const nb = Math.round(clamp(trunkW / 0.03, 0.5, 4) * 26 * detail);
  for (let i = 0; i < nb; i++) { const t = r(), u = r() * 2 - 1, y = lerp(base, fork, t), w = trunkW * (1 - 0.35 * t), lit = u * lightX + (r() - 0.5) * 0.5 > 0.25;
    layer.stroke({ brush: lit ? 'flat' : 'liner', x: x + u * w * 0.36, y, angle: Math.PI / 2 + (r() - 0.5) * 0.35, bend: (r() - 0.5) * 0.3, length: Math.min(w * r.range(0.8, 2), height * 0.12), width: w * (lit ? r.range(0.07, 0.14) : 0.05) + 0.001,
      color: vary(lit ? mixOk(C.barkDark, C.barkLight, r.range(0.4, 1)) : shift(C.barkDark, -0.04), r, 0.03), thick: lit ? 0.8 : 0.2, dry: 0.4 }); }
  return shape;
}

/** A fir / spruce: a narrow cone of drooping tiers, widest at the bottom, with a pointed leader on top.
 *  x, base: foot · height · width: spread of the lowest tier (default height × 0.38) · lightX: −1 light from the left ·
 *  colors: { trunk, dark, mid, light, snow? } — give `snow` to load the upper side of each tier with snow ·
 *  tiers: number of bough layers · detail: 0.5 (distant) … 1.5 (hero). Order: trunk → dark tiers → mid → lights/snow. */
export function paintFir(layer, { x, base, height, width = null, lightX = -1, colors, tiers = null, seed = 1, sway = 0.003, detail = 1, lean = 0 }) {
  const r = rng(seed * 2971 + 5), C = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, col(v)]));
  width ??= height * 0.44; tiers ??= Math.round(clamp(height * 48, 9, 20) * Math.sqrt(detail));
  const ax = (t) => x + lean * height * t;                                   // trunk axis, t = 0 foot … 1 tip
  layer.path([[x, base], [ax(0.5), base - height * 0.5], [ax(1), base - height]], { brush: 'round', width: (t) => height * 0.035 * (1 - 0.85 * t) + 0.0015, color: (t, px, py, rr) => vary(C.trunk, rr, 0.02), thick: 0.3, step: height / 8, wobble: 0.3 });
  const T = [];
  for (let i = 0; i < tiers; i++) { const t = lerp(0.1, 0.96, i / (tiers - 1)), half = (width / 2) * Math.pow(1 - t, 0.85) * r.range(0.8, 1.15) + height * 0.012; T.push({ t, y: base - height * t, half }); }
  const tier = (tt, color, k, opt, dy = 0, onlySide = 0) => {
    const n = Math.max(9, Math.round(tt.half / height * 170 * detail * k));
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1; if (onlySide && u * onlySide < -0.15) continue;      // lights favour the lit side
      const px = ax(tt.t) + u * tt.half * 0.9, droop = Math.abs(u) * tt.half * 0.55, L = (tt.half * 0.55 + height * 0.02) * r.range(0.6, 1.2);
      const ang = Math.PI / 2 - u * 0.95 + (r() - 0.5) * 0.4;                      // strokes fan down and outward from the trunk
      const sy = tt.y + droop * 0.5 + dy * L;
      layer.stroke({ brush: 'fan', p0: [px - Math.cos(ang) * L * 0.3, sy - Math.sin(ang) * L * 0.3], p2: [px + Math.cos(ang) * L * 0.7, sy + Math.sin(ang) * L * 0.7], bend: -u * 0.25, width: L * r.range(0.45, 0.75), taper: [0.5, 1],
        color: vary(color, r, 0.025, 0.008, 5), sway: sway * (0.4 + tt.t), swayRoot: 0.3, ...opt });
    }
  };
  for (const tt of T) tier(tt, C.dark, 1, { dry: 0.35, thick: 0.22 });
  for (const tt of T) tier(tt, C.mid, 0.45, { dry: 0.35, thick: 0.45 }, -0.25, lightX);
  for (const tt of T) tier(tt, C.snow ?? C.light, C.snow ? 0.3 : 0.28, { dry: 0.3, thick: 0.9, ...(C.snow ? { brush: 'dab', soft: 0.3 } : {}) }, -0.5, C.snow ? 0 : lightX);
  layer.stroke({ brush: 'liner', p0: [ax(0.94), base - height * 0.94], p2: [ax(1), base - height * 1.03], width: height * 0.012, color: C.dark, thick: 0.3 });   // the leader
  return { top: [ax(1), base - height * 1.03] };
}

/** Distant birds: a dynamic layer of small "V" marks that flap and cross the sky.
 *  flock: [{ x, y, size, vx, vy, phase }] in scene units at t = 0 (or count to scatter them near `around`). */
export function birds(painting, { count = 5, around = [0.5, 0.3], spread = 0.12, size = 0.012, color = '#2a2430', velocity = [0.02, -0.004], depth = 0.3, seed = 1, from = 0, name = 'birds' }) {
  const r = rng(seed * 31 + 5);
  const flock = Array.from({ length: count }, () => ({ x: around[0] + (r() - 0.5) * spread * 2, y: around[1] + (r() - 0.5) * spread, s: size * r.range(0.6, 1.2), ph: r() * 6.28, f: r.range(5, 7.5) }));
  return painting.dynamic(name, { depth }, (t, L) => {
    if (t < from) return;
    const fade = clamp((t - from) / 0.6);
    for (const b of flock) {
      const x = b.x + velocity[0] * (t - from), y = b.y + velocity[1] * (t - from) + Math.sin(t * 0.9 + b.ph) * 0.004;
      const flap = Math.sin(t * b.f + b.ph), lift = b.s * (0.15 + 0.55 * flap);
      for (const sd of [-1, 1]) L.stroke({ brush: 'liner', p0: [x, y], p1: [x + sd * b.s * 0.5, y - lift * 0.9], p2: [x + sd * b.s, y - lift * 0.35 + b.s * 0.1], width: b.s * 0.22, color, opacity: fade, thick: 0.4, seed: b.ph * 10 + sd });
    }
  });
}
