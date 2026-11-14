// Modelled subjects: build a person or an object from soft 3D masses (signed distance fields), light them like a
// painter would (one key light, warm bounce, cool sky fill, rim, occlusion, cast shadow, skin that glows where light
// enters it), and give the picture to paintFrom — or to seaSource as `objects`, so it sits in the same world as the
// water. This is the blob method of figure drawing (head, ribcage, pelvis, limbs in two sections, overlapping at the
// joints) done in volume: smooth unions melt the masses together the way anatomy does. No photo is involved.
//
// World coordinates: metres, y up, the camera at (0, view.eye, 0) looking toward +z; x to the right.

import { clamp, fbm } from '../core/math.js';
import { col, mixOk } from '../core/color.js';

// ---------------------------------------------------------------- vectors and primitives
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]), nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const SD = {
  sphere: (c, r) => (p) => len(sub(p, c)) - r,
  ellipsoid: (c, r) => (p) => { const q = sub(p, c), k0 = len([q[0] / r[0], q[1] / r[1], q[2] / r[2]]), k1 = len([q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2])]); return k1 > 0 ? k0 * (k0 - 1) / k1 : -Math.min(...r); },
  capsule: (a, b, r) => (p) => { const pa = sub(p, a), ba = sub(b, a), h = clamp(dot(pa, ba) / dot(ba, ba)); return len([pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h]) - r; },
  /** a capsule whose radius changes from ra (at a) to rb (at b): limbs, fingers, a nose */
  cone: (a, b, ra, rb) => (p) => { const pa = sub(p, a), ba = sub(b, a), h = clamp(dot(pa, ba) / dot(ba, ba)); return len([pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h]) - (ra + (rb - ra) * h); },
  box: (c, h, r = 0) => (p) => { const q = [Math.abs(p[0] - c[0]) - h[0] + r, Math.abs(p[1] - c[1]) - h[1] + r, Math.abs(p[2] - c[2]) - h[2] + r];
    return len([Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)]) + Math.min(Math.max(q[0], q[1], q[2]), 0) - r; },
  /** vertical cylinder: centre c, radius r, half height h */
  cylinder: (c, r, h) => (p) => { const d = [Math.hypot(p[0] - c[0], p[2] - c[2]) - r, Math.abs(p[1] - c[1]) - h]; return Math.min(Math.max(d[0], d[1]), 0) + Math.hypot(Math.max(d[0], 0), Math.max(d[1], 0)); },
};
export const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = clamp(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
export const smax = (a, b, k) => -smin(-a, -b, k);

/** Rotate a point about the vertical axis through `o` by `a` radians (to place a model built facing +z). */
export const yaw = (o, a) => (p) => { const c = Math.cos(a), s = Math.sin(a), x = p[0] - o[0], z = p[2] - o[2]; return [c * x - s * z, p[1] - o[1], s * x + c * z]; };

// ---------------------------------------------------------------- scene
/** A scene = parts { d: (p) → distance, mat, k (smooth blend with earlier parts of the same material group), cut } in
 *  world space. materials: name → { color (or (p, n) → colour), sss (0…1 light that enters and glows warm), spec,
 *  rough, emit (glow colour), stripes } . Returns { map(p) → [d, mat], bound: { c, r }, materials }. */
export function sdfScene(parts, materials) {
  const groups = new Map();
  for (const pt of parts) { if (!groups.has(pt.mat)) groups.set(pt.mat, []); groups.get(pt.mat).push(pt); }
  const G = [...groups.entries()];
  const map = (p) => {
    let best = 1e9, bm = null;
    for (const [m, ps] of G) {
      let d = 1e9;
      for (const pt of ps) { const di = pt.d(p); d = pt.cut ? smax(d, -di, pt.k ?? 0.005) : smin(d, di, pt.k ?? 0); }
      if (d < best) { best = d; bm = m; }
    }
    return [best, bm];
  };
  return { map, materials, bound: null };
}

/** Light a hit point the way a painter lights a figure. ctx: { L (unit vector toward the light), sun (colour), sky(dir)
 *  → colour, bounce (colour of light bounced from below, e.g. the sea), V (toward the camera), shadow (0…1), ao }. */
function shadeHit(mat, p, n, ctx) {
  const M = mat, base = typeof M.color === 'function' ? M.color(p, n) : col(M.color);
  const ndl = dot(n, ctx.L), wrap = M.sss ?? 0;
  // a painter's light: PLANES, not a smooth gradient — light, halftone, shadow, with a firm terminator (Bridgman, Sinix)
  const raw = Math.max(0, (ndl + wrap) / (1 + wrap)) * ctx.shadow, k = ctx.planes ?? 0.7;
  const planed = raw < 0.12 ? raw * 0.6 : raw < 0.45 ? 0.07 + (raw - 0.12) * 0.2 + 0.4 * smooth((raw - 0.12) / 0.06) * 0.6 : 0.62 + (raw - 0.45) * 0.55;
  const diff = raw * (1 - k) + planed * k;
  const skyFill = mixOk(ctx.skyUp, ctx.skyLow, clamp(0.5 - n[1] * 0.5)), up = 0.55 + 0.45 * n[1];
  const bounce = Math.max(0, -n[1]) * 0.35;
  let c = [0, 0, 0];
  for (let q = 0; q < 3; q++) c[q] = base[q] * (ctx.sun[q] * diff * 1.05 + skyFill[q] * up * 0.42 * ctx.ao + ctx.bounce[q] * bounce * ctx.ao);
  // temperature: lights lean warm, shadows lean cool; broken colour inside each plane
  const lightK = clamp(diff * 1.4), br = (fbm(p[0] * 31, p[1] * 31 + p[2] * 17, 77, 2) - 0.5) * (ctx.broken ?? 0.18);
  c = c.map((v, q) => v * (1 + br * [1.0, 0.2, -0.8][q]) + (lightK * [0.05, 0.02, -0.03][q] + (1 - lightK) * [-0.02, 0.0, 0.035][q]) * 0.8);
  // light that enters skin and comes out warm at the terminator and in thin parts (ears, nose)
  if (wrap > 0) { const t = Math.exp(-(((ndl - 0.05) / 0.25) ** 2)) * ctx.shadow * wrap; c = c.map((v, k) => v + [0.55, 0.16, 0.06][k] * t * 0.35); }
  // rim: grazing light from behind
  const rim = Math.pow(clamp(1 - dot(n, ctx.V)), 3) * clamp(-dot(ctx.L, ctx.V) + 0.3) * (M.rim ?? 0.6);
  c = c.map((v, k) => v + ctx.sun[k] * rim * 0.55);
  // a small highlight on smooth, oily or wet surfaces
  if (M.spec) { const h = nrm([ctx.L[0] + ctx.V[0], ctx.L[1] + ctx.V[1], ctx.L[2] + ctx.V[2]]); const s = Math.pow(Math.max(0, dot(n, h)), M.rough ?? 30) * M.spec * ctx.shadow; c = c.map((v, k) => v + ctx.sun[k] * s); }
  if (M.emit) { const e = col(M.emit); c = c.map((v, k) => v + e[k]); }
  return c.map((v) => clamp(Math.pow(clamp(v), 1 / 1.15)));   // a touch of tone mapping
}

/** Trace a scene along the camera ray through canvas (x, y). Returns null (miss) or { t, p, n, mat }. view: p.view. */
export function traceScene(scene, view, x, y, { tmin = 0.3, tmax = 80, steps = 110 } = {}) {
  const dx = (x - view.cx) / view.f, dy = (y - view.horizon) / view.f, d = nrm([dx, -dy, 1]), o = [0, view.eye, 0];
  if (scene.bound) { const oc = sub(o, scene.bound.c), b = dot(oc, d), c = dot(oc, oc) - scene.bound.r ** 2, h = b * b - c; if (h < 0) return null;
    tmin = Math.max(tmin, -b - Math.sqrt(h)); tmax = Math.min(tmax, -b + Math.sqrt(h)); }
  let t = tmin;
  for (let i = 0; i < steps && t < tmax; i++) {
    const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], [dist, mat] = scene.map(p);
    if (dist < 0.0015 * t) {
      const e = 0.0015, f = (q) => scene.map(q)[0];
      const n = nrm([f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]]), f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]]), f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e])]);
      return { t, p, n, mat, d };
    }
    t += Math.max(dist * 0.9, 0.0008);
  }
  return null;
}

/** Colour of a traced hit: soft shadow toward the light, ambient occlusion, painterly light. light: { dir (toward the
 *  light), color }, sky: { up, low }, bounce: colour from below. */
export function shadeScene(scene, hit, { light, sky, bounce }) {
  const L = nrm(light.dir), p = hit.p, n = hit.n;
  let sh = 1, t = 0.02;                                                  // soft shadow
  for (let i = 0; i < 28 && t < 3; i++) { const h = scene.map([p[0] + L[0] * t, p[1] + L[1] * t, p[2] + L[2] * t])[0]; sh = Math.min(sh, 10 * h / t); if (sh < 0.02) break; t += clamp(h, 0.01, 0.2); }
  let ao = 0;                                                             // ambient occlusion
  for (let i = 1; i <= 5; i++) { const s = 0.02 * i; ao += (s - scene.map([p[0] + n[0] * s, p[1] + n[1] * s, p[2] + n[2] * s])[0]) / Math.pow(2, i); }
  ao = clamp(1 - ao * 6);
  return shadeHit(scene.materials[hit.mat], p, n, { L, sun: col(light.color), skyUp: col(sky.up), skyLow: col(sky.low), bounce: col(bounce), V: [-hit.d[0], -hit.d[1], -hit.d[2]], shadow: clamp(sh), ao });
}

// ---------------------------------------------------------------- models

/** An old sailor seated, built from masses: head with brow, sockets, bulbous nose, cheekbones, ears; a full beard and
 *  moustache; knit wool cap; pea coat with turned-up collar; one hand on the tiller, the pipe in his mouth held by the
 *  other; trousers and boots. at: [x, y, z] the point of the seat under his pelvis (world); facing: radians (0 = facing
 *  the camera, π/2 = facing left…); lean: stoop. colors override the materials. Returns { parts, materials, points }
 *  where points.pipe is the bowl (for smoke) and points.head the head centre. */
export function sailor({ at, facing = 0.9, lean = 0.08, colors = {}, seed = 3 } = {}) {
  const R = yaw(at, facing), Rinv = (q) => { const c = Math.cos(-facing), s = Math.sin(-facing); return [c * q[0] - s * q[2] + at[0], q[1] + at[1], s * q[0] + c * q[2] + at[2]]; };
  const P = (d) => (p) => d(R(p));                                       // a part built in local space (facing +z… see yaw)
  const parts = [], add = (mat, d, k = 0, cut = false) => parts.push({ mat, d: P(d), k, cut });
  // local frame: origin on the seat under the pelvis, y up, the man faces local +z
  const pelvis = [0, 0.13, 0], chest = [0, 0.45, 0.02 + lean * 0.5], neck = [0, 0.63, 0.06 + lean], head = [0, 0.78, 0.11 + lean * 1.3];
  const hp = (dx, dy, dz) => [head[0] + dx, head[1] + dy, head[2] + dz];
  // -- head (Loomis: a ball and a jaw), the planes that catch light
  add('skin', SD.ellipsoid(hp(0, 0.01, 0), [0.074, 0.098, 0.092]));
  add('skin', SD.ellipsoid(hp(0, -0.052, 0.022), [0.06, 0.055, 0.066]), 0.035);                  // jaw
  add('skin', SD.capsule(hp(-0.04, 0.03, 0.074), hp(0.04, 0.03, 0.074), 0.018), 0.025);           // brow ridge
  for (const s of [-1, 1]) {
    add('skin', SD.sphere(hp(s * 0.032, 0.006, 0.094), 0.016), 0.012, true);                     // eye sockets (shallow cut)
    add('eye', SD.ellipsoid(hp(s * 0.031, 0.006, 0.083), [0.013, 0.008, 0.01]));                  // a narrowed, squinting eye
    add('skin', SD.capsule(hp(s * 0.045, 0.016, 0.088), hp(s * 0.018, 0.016, 0.092), 0.007), 0.008);   // heavy upper lid
    add('skin', SD.ellipsoid(hp(s * 0.047, -0.02, 0.066), [0.026, 0.024, 0.024]), 0.03);           // cheekbones
    add('skin', SD.ellipsoid(hp(s * 0.077, 0.0, -0.005), [0.012, 0.03, 0.02]), 0.01);             // ears
  }
  add('skin', SD.cone(hp(0, 0.012, 0.094), hp(0, -0.03, 0.118), 0.011, 0.017), 0.012);            // nose, bulbous at the tip
  add('skin', SD.cone(neck, hp(0, -0.06, -0.01), 0.055, 0.05), 0.03);                             // neck
  // -- beard and moustache (a mass on the jaw, strands come from the material)
  add('beard', SD.ellipsoid(hp(0, -0.075, 0.06), [0.07, 0.085, 0.062]));
  add('beard', SD.ellipsoid(hp(0, -0.125, 0.07), [0.045, 0.05, 0.04]), 0.04);                     // the beard's fall
  add('beard', SD.capsule(hp(-0.034, -0.038, 0.108), hp(0.034, -0.038, 0.108), 0.013), 0.015);    // moustache
  for (const s of [-1, 1]) add('beard', SD.ellipsoid(hp(s * 0.06, -0.035, 0.035), [0.022, 0.04, 0.03]), 0.03);   // side whiskers
  // -- knit cap, rolled brim
  add('cap', SD.ellipsoid(hp(0, 0.07, -0.01), [0.083, 0.07, 0.096]));
  add('cap', SD.box(hp(0, -0.005, 0), [0.2, 0.04, 0.2]), 0.01, true);                              // cut at the brim line
  add('cap', SD.cylinder(hp(0, 0.046, -0.008), 0.087, 0.019), 0.012);                               // rolled brim, above the brows
  // -- torso in a pea coat: chest, belly, shoulders, turned-up collar
  add('coat', SD.ellipsoid(chest, [0.2, 0.21, 0.135]));
  add('coat', SD.ellipsoid([0, 0.24, 0.03], [0.185, 0.17, 0.14]), 0.07);
  add('coat', SD.capsule([-0.185, 0.565, 0.04 + lean * 0.6], [0.185, 0.565, 0.04 + lean * 0.6], 0.07), 0.06);
  add('coat', SD.cone([0, 0.6, 0.02 + lean], [0, 0.69, 0.05 + lean], 0.085, 0.07), 0.02);          // collar
  add('coat', SD.ellipsoid([0, 0.08, 0], [0.19, 0.12, 0.17]), 0.05);                               // coat skirt over the hips
  // -- arms: right hand holds the pipe at the mouth, left on the tiller (two sections each)
  const shR = [0.19, 0.55, 0.05 + lean * 0.6], elR = [0.25, 0.36, 0.24], wrR = [0.075, 0.66, 0.27];
  const shL = [-0.19, 0.55, 0.05 + lean * 0.6], elL = [-0.27, 0.3, 0.12], wrL = [-0.24, 0.17, 0.36];
  add('coat', SD.cone(shR, elR, 0.065, 0.052), 0.04); add('coat', SD.cone(elR, wrR, 0.052, 0.042), 0.03);
  add('coat', SD.cone(shL, elL, 0.065, 0.052), 0.04); add('coat', SD.cone(elL, wrL, 0.052, 0.042), 0.03);
  add('skin', SD.ellipsoid([wrR[0] - 0.012, wrR[1] + 0.012, wrR[2] + 0.035], [0.034, 0.042, 0.03]), 0.0);   // right hand (round fist)
  add('skin', SD.ellipsoid([wrL[0], wrL[1] - 0.01, wrL[2] + 0.045], [0.035, 0.028, 0.05]), 0.0);            // left hand on the tiller
  // -- legs (seated: thighs forward, shins down), boots
  for (const s of [-1, 1]) {
    const hip = [s * 0.1, 0.1, 0.04], knee = [s * 0.13, 0.16, 0.46], ank = [s * 0.14, -0.34, 0.52];
    add('trousers', SD.cone(hip, knee, 0.09, 0.066), 0.05); add('trousers', SD.cone(knee, ank, 0.064, 0.05), 0.03);
    add('boot', SD.cone([ank[0], ank[1] + 0.06, ank[2]], [ank[0], ank[1] - 0.04, ank[2] + 0.09], 0.055, 0.05), 0.02);
  }
  // -- the pipe: stem from the mouth, bowl in the hand, an ember on top
  const mouth = hp(0.012, -0.05, 0.1), bowl = [wrR[0] + 0.0, wrR[1] + 0.05, wrR[2] + 0.07];
  add('pipe', SD.capsule(mouth, [bowl[0], bowl[1] - 0.01, bowl[2] - 0.005], 0.0055));
  add('pipe', SD.cone([bowl[0], bowl[1] - 0.025, bowl[2]], [bowl[0], bowl[1] + 0.02, bowl[2]], 0.017, 0.02), 0.005);
  add('ember', SD.sphere([bowl[0], bowl[1] + 0.02, bowl[2]], 0.012));
  const C = { skin: '#b4745a', skinRed: '#a64f3e', beard: '#d3cdc2', beardDark: '#8c867c', cap: '#7c2c27', coat: '#2a3346', trousers: '#3b3933', boot: '#1d1b1a', pipe: '#4a2c1c', ...colors };
  const n3 = (p, s, k = 4) => fbm(p[0] * s + seed, p[1] * s * 0.5 + p[2] * s, seed * 3 + k, 3);
  const materials = {
    skin: { color: (p) => { const q = R(p), hd = sub(q, head);                      // weathered: redder nose, cheeks and ears; mottled
      const red = clamp(Math.exp(-((hd[1] + 0.01) ** 2 + (hd[2] - 0.1) ** 2) * 900) + Math.exp(-((Math.abs(hd[0]) - 0.05) ** 2) * 900 - ((hd[1] + 0.02) ** 2) * 900) * 0.7 + (Math.abs(hd[0]) > 0.07 ? 0.5 : 0));
      return mixOk(mixOk(col(C.skin), col(C.skinRed), red * 0.7), [0.35, 0.24, 0.2], (n3(p, 120) - 0.5) * 0.35 + 0.05); }, sss: 0.45, spec: 0.12, rough: 25, rim: 0.7 },
    eye: { color: '#2a2220', spec: 0.6, rough: 80 },
    beard: { color: (p) => { const q = R(p); const strand = fbm(q[0] * 260 + seed, q[1] * 18, seed + 11, 3);       // strands run down
      return mixOk(col(C.beardDark), col(C.beard), clamp(0.25 + strand * 1.1)); }, sss: 0.25, spec: 0.08, rough: 12, rim: 1.2 },
    cap: { color: (p) => { const q = R(p); const rib = 0.5 + 0.5 * Math.sin(Math.atan2(q[0] - head[0], q[2] - head[2]) * 46);   // knitted ribs
      return mixOk(col(C.cap), [0.25, 0.08, 0.07], rib * 0.35); }, rim: 0.7 },
    coat: { color: (p) => { const q = R(p), fold = Math.pow(Math.abs(Math.sin(q[0] * 38 + fbm(q[0] * 4, q[1] * 3, seed + 21, 3) * 7)), 8) * clamp(0.6 - q[1]);   // hanging folds, deeper toward the hem
      return mixOk(mixOk(col(C.coat), [0.36, 0.4, 0.5], 0.12 * n3(p, 6, 7)), [0.06, 0.06, 0.08], fold * 0.35); }, spec: 0.06, rough: 8, rim: 0.7 },
    trousers: { color: (p) => mixOk(col(C.trousers), [0.12, 0.11, 0.1], (n3(p, 12, 9) - 0.45) * 0.6), rim: 0.5 },
    boot: { color: C.boot, spec: 0.35, rough: 20 },
    pipe: { color: C.pipe, spec: 0.4, rough: 40 },
    ember: { color: '#ff7a2a', emit: '#c84a12' },
  };
  return { parts, materials, points: { pipe: Rinv([bowl[0], bowl[1] + 0.03, bowl[2]]), head: Rinv(head), mouth: Rinv(mouth) } };
}

/** A small wooden fishing boat (open hull, thwarts, stern bench, a short mast with a furled sail, a tiller).
 *  at: [x, y, z] the middle of the hull at the waterline; heading: radians (0 = bow away from the camera);
 *  length, beam (m). Returns { parts, materials, points: { stern seat (world), tiller } }. */
export function fishingBoat({ at, heading = 0.9, length = 5, beam = 1.8, colors = {}, seed = 5 } = {}) {
  const R = yaw(at, heading), Rinv = (q) => { const c = Math.cos(-heading), s = Math.sin(-heading); return [c * q[0] - s * q[2] + at[0], q[1] + at[1], s * q[0] + c * q[2] + at[2]]; };
  const parts = [], add = (mat, d, k = 0, cut = false) => parts.push({ mat, d: (p) => d(R(p)), k, cut });
  const L2 = length / 2, B2 = beam / 2;
  // hull: a long ellipsoid, hollowed, cut at the gunwale (0.55 m above the water)
  add('hull', SD.ellipsoid([0, 0.05, 0], [B2, 0.62, L2]));
  add('hull', SD.ellipsoid([0, 0.12, 0], [B2 - 0.07, 0.62, L2 - 0.08]), 0.0, true);
  add('hull', SD.box([0, 1.2, 0], [B2 + 0.3, 0.6, L2 + 0.3]), 0.0, true);
  add('trim', SD.box([0, 0.585, 0], [B2 * 0.98, 0.022, L2 * 0.96], 0.01));                         // painted strake along the gunwale (approx.)
  add('trim', SD.box([0, 0.0, 0], [B2 + 0.2, 0.75, L2 + 0.2]), 0.0, true);                        // keep it a thin band: cut the middle
  add('wood', SD.box([0, 0.38, -L2 + 0.55], [B2 - 0.12, 0.03, 0.22], 0.01));                     // stern bench
  add('wood', SD.box([0, 0.36, 0.3], [B2 - 0.1, 0.025, 0.12], 0.01));                            // thwart
  add('wood', SD.cylinder([0, 1.55, 0.9], 0.04, 1.2));                                           // mast
  add('sail', SD.cone([0, 0.75, 0.95], [0, 2.5, 0.95], 0.11, 0.05), 0.0);                        // furled sail, lashed to the mast
  add('wood', SD.capsule([0, 0.62, -L2 + 0.05], [0.12, 0.66, -L2 + 0.75], 0.025));                // tiller
  const C = { hull: '#6a4a33', hullDark: '#3c2a1f', trim: '#2c5964', wood: '#8a6a4a', sail: '#b9a98e', ...colors };
  const materials = {
    hull: { color: (p) => { const q = R(p); const plank = 0.5 + 0.5 * Math.sin(q[1] * 52); return mixOk(mixOk(col(C.hull), col(C.hullDark), plank * 0.35), [0.2, 0.15, 0.12], (fbm(q[2] * 3, q[1] * 9, seed, 3) - 0.5) * 0.5); }, spec: 0.15, rough: 15, rim: 0.5 },
    trim: { color: C.trim, spec: 0.2, rough: 20 },
    wood: { color: C.wood, spec: 0.1, rough: 10 },
    sail: { color: (p) => mixOk(col(C.sail), [0.45, 0.4, 0.33], (fbm(p[1] * 6, p[0] * 6, seed + 3, 3) - 0.4) * 0.6), sss: 0.3, rim: 0.8 },
  };
  return { parts, materials, points: { seat: Rinv([0, 0.41, -L2 + 0.55]), tiller: Rinv([0.12, 0.66, -L2 + 0.75]) } };
}

/** Merge models into one scene (shared map), with a bounding sphere for speed. */
export function mergeModels(models, bound) {
  const parts = models.flatMap((m) => m.parts), materials = Object.assign({}, ...models.map((m) => m.materials));
  const sc = sdfScene(parts, materials); sc.bound = bound; return sc;
}
