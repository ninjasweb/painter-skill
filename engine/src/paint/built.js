// Mountains, rocks, buildings, figures, smoke. A painter gives these very few values:
// a lit plane, a shadow plane, one dark accent, one small highlight. Planes, not detail.

import { rng, clamp, lerp, smoothstep, noise2 } from '../core/math.js';
import { col, mixOk, vary, shift } from '../core/color.js';
import { paintGlow } from './sky.js';

const fn = (v) => (typeof v === 'function' ? v : () => v);

/** A mountain range under the skyline top(x), built the way a painter constructs it: every summit sends straight
 *  arêtes down its flanks; the side of each arête turned to the light is the lit plane, the other the shadow plane;
 *  strokes run down the fall line from the summit; the base melts into haze.
 *  light / shadow: rock colours (or (x,y,k) → colour) · lightX: −1 light from the left, +1 from the right ·
 *  snow: { line (share of the height covered from the top), light, shadow } · facets: spacing of the secondary arêtes ·
 *  haze: colour the base fades to (default: between light and shadow) · hazeAmount 0…1. */
export function paintMountains(layer, { top, bottom = 1.1, light, shadow, lightX = -1, snow = null, size = 0.02, facets = 0.12, x0 = -0.1, x1 = null, thick = 0.22, seed = 1, soft = 0.12, haze = null, hazeAmount = 0.35 }) {
  const A = layer.p.aspect; x1 ??= A + 0.1; const bot = fn(bottom); light = fn(light); shadow = fn(shadow);
  let yMin = 1e9, yMax = -1e9; const xs = [];
  for (let x = x0; x <= x1; x += 0.005) { xs.push(x); yMin = Math.min(yMin, top(x)); yMax = Math.max(yMax, bot(x)); }
  // summits = local high points of the skyline
  const S = []; const win = 8;
  for (let i = win; i < xs.length - win; i++) { const y = top(xs[i]); let isTop = true; for (let j = -win; j <= win; j++) if (top(xs[i + j]) < y) { isTop = false; break; } if (isTop && (!S.length || xs[i] - S[S.length - 1].x > 0.04)) S.push({ x: xs[i], y, i: S.length }); }
  if (!S.length) S.push({ x: (x0 + x1) / 2, y: yMin, i: 0 });
  const owner = (x, y) => { let best = S[0], bv = 1e9; for (const s of S) { const v = Math.abs(x - s.x) - 0.6 * Math.max(0, y - s.y) + (s.y > y ? 1 : 0); if (v < bv) { bv = v; best = s; } } return best; };
  const k = (x, y) => clamp((y - top(x)) / Math.max(bot(x) - top(x), 1e-3));
  const tri = (v) => v - Math.floor(v);
  // 1 = lit plane, 0 = shadow plane; edges are straight lines (arêtes), never blobs
  const face = (x, y) => { const s = owner(x, y), d = Math.max(0, y - s.y), axis = s.x + (noise2(d * 5, s.i * 3.1, seed) - 0.5) * 0.5 * d;
    const side = (x - axis) * lightX < 0 ? 1 : 0, sgn = x > axis ? 1 : -1;
    const q = tri(Math.abs(x - axis) / facets - d / facets * 0.75 + noise2(s.i * 7.3, Math.floor(Math.abs(x - axis) / facets - d / facets * 0.75) * 1.7, seed + 5) * 0.4 + s.i * 0.37);
    if (side) return q < 0.24 ? 0 : 1;           // a secondary arête throws a narrow shadow across the lit flank
    return q > 0.84 ? 1 : 0; };                   // and a sliver of the shadow flank still catches the light
  const fall = (x, y) => { const s = owner(x, y); return Math.atan2(Math.max(y - s.y, 0.01), (x - s.x) * 0.8); };
  const snowAt = (x, y) => { if (!snow) return 0; const s = owner(x, y), d = y - top(x);
    const teeth = Math.abs(2 * tri((x - s.x) / (facets * 0.45) + s.i * 0.3) - 1) * 0.3 + (noise2(x * 6, d * 3, seed + 8) - 0.5) * 0.25;   // straight-sided tongues of snow
    return k(x, y) + teeth - 0.15 < snow.line ? 1 : 0; };
  const hz = haze ? col(haze) : null;
  const colorAt = (x, y) => { const f = face(x, y), sn = snowAt(x, y), kk = k(x, y);
    let c = sn ? (f ? col(snow.light) : col(snow.shadow)) : (f ? light(x, y, kk) : shadow(x, y, kk));
    return mixOk(c, hz ?? mixOk(light(x, y, kk), shadow(x, y, kk), 0.6), hazeAmount * kk * kk); };
  const inside = (x, y) => (y < bot(x) ? smoothstep(0, size * 0.06, y - top(x)) : 0);
  layer.scatter({ bounds: [x0, yMin - size, x1, yMax], spacing: size * 0.32, brush: 'flat', mask: inside, order: 'down', fray: 0.2, bristles: 16,
    width: (x, y, r) => size * r.range(0.55, 0.95) * (0.5 + 0.5 * smoothstep(0, size * 2.5, y - top(x))), length: (x, y, r) => size * r.range(1.6, 3.2) * (0.5 + 0.5 * smoothstep(0, size * 2.5, y - top(x))),
    angle: (x, y, r) => fall(x, y) + (r() - 0.5) * 0.22,                    // every stroke runs down the fall line from its summit
    color: (x, y, r) => vary(colorAt(x, y), r, 0.01, 0.003, 2), thick: (x, y) => thick * (0.3 + 0.5 * face(x, y)), soft: Math.max(soft, 0.14), dry: 0.08, load: 0.15 });
  // drawing: a few dark rock streaks down the flanks, and loaded light along the lit side of each crest
  layer.scatter({ bounds: [x0, yMin, x1, yMax], spacing: size * 1.6, brush: 'liner', mask: (x, y) => (inside(x, y) > 0.5 && k(x, y) > 0.08 ? 0.3 * (snowAt(x, y) ? 0.5 : 1) : 0),
    width: size * 0.12, length: (x, y, r) => size * r.range(1.5, 4), angle: (x, y, r) => fall(x, y) + (r() - 0.5) * 0.15, color: (x, y, r) => vary(shift(shadow(x, y, k(x, y)), -0.05), r, 0.02), opacity: 0.55, thick: 0.2, dry: 0.3 });
  for (let x = x0; x <= x1; x += size * 0.45) { if (layer.rand() > 0.6) continue; const y = top(x) + size * 0.3;
    if (face(x, y + size * 0.6)) layer.stroke({ brush: 'knife', x, y: y + size * 0.2, angle: fall(x, y + size) + (layer.rand() - 0.5) * 0.2, length: size * layer.rand.range(0.9, 1.9), width: size * 0.3,
      color: vary(shift(colorAt(x, y + size * 0.3), 0.04), layer.rand, 0.012), thick: 0.7, dry: 0.25 }); }
  return layer;
}

/** Rocks from a Lobes shape: top planes light, side planes dark, hard knife edges, a dark crevice line under each. */
export function paintRocks(layer, shape, { light, mid, dark, size = 0.02, seed = 1 }) {
  light = col(light); mid = col(mid); dark = col(dark);
  const [x0, y0, x1, y1] = shape.bounds;
  layer.scatter({ bounds: [x0, y0, x1, y1], spacing: size * 0.42, brush: 'knife', mask: (x, y) => (shape.density(x, y) + (noise2(x * 40, y * 40, seed) - 0.5) * 0.15 > 0 ? 1 : 0), order: 'down',
    width: (x, y, r) => size * r.range(0.7, 1.2), length: (x, y, r) => size * r.range(1.2, 2.2),
    angle: (x, y, r) => (shape.lit(x, y) > 0.55 ? 0.12 : 1.25) + Math.round((noise2(x * 14, y * 14, seed + 3) - 0.5) * 3) * 0.35 + (r() - 0.5) * 0.15,   // a few flat planes, not curves           // flat tops, steep sides
    color: (x, y, r) => { const l = shape.lit(x, y); return vary(l > 0.62 ? mixOk(mid, light, smoothstep(0.62, 0.9, l)) : mixOk(dark, mid, smoothstep(0.2, 0.62, l)), r, 0.025, 0.006, 4); },
    thick: (x, y) => 0.3 + 0.6 * shape.lit(x, y), soft: 0.06, dry: 0.25 });
  for (const l of shape.lobes) if (layer.rand() < 0.7) layer.stroke({ brush: 'liner', x: l.x, y: l.y + l.r * 0.75, angle: (layer.rand() - 0.5) * 0.4, length: l.r * 1.4, width: size * 0.12, color: shift(dark, -0.05), thick: 0.2 });
  return layer;
}

/** A simple building: gabled box seen from the front-side. x = left of the front wall, base = ground line,
 *  w,h = front wall size, depthW = visible side wall width (0 = flat front), roofH = gable height.
 *  colors: { wallLight, wallShadow, roofLight, roofShadow, trim, window } — window may glow (lit from inside).
 *  lightX: −1 → front wall lit, +1 → side wall lit. Returns { window: [x, y], chimney: [x, y] }. */
export function paintHouse(layer, { x, base, w, h, depthW = 0, roofH = null, colors, lightX = -1, size = null, windows = 1, door = true, chimney = true, seed = 1 }) {
  const C = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, col(v)])); const r = rng(seed * 331 + 3);
  roofH ??= h * 0.55; size ??= h * 0.16;
  const front = lightX < 0 ? C.wallLight : C.wallShadow, side = lightX < 0 ? C.wallShadow : C.wallLight;
  const fill = (bx0, by0, bx1, by1, mask, color, angle, brush = 'flat', thick = 0.45) => layer.scatter({ bounds: [bx0, by0, bx1, by1], spacing: size * 0.4, brush, mask, order: 'down',
    width: (px, py, rr) => size * rr.range(0.7, 1.1), length: (px, py, rr) => size * rr.range(1.3, 2.2), angle: (px, py, rr) => angle + (rr() - 0.5) * 0.2,
    color: (px, py, rr) => vary(color, rr, 0.025, 0.006, 3), thick, soft: 0.08, dry: 0.2 });
  const top = base - h, apex = [x + w / 2, top - roofH], ov = w * 0.08;
  if (depthW > 0) {            // side wall and the long roof plane going back
    fill(x + w, top, x + w + depthW, base, null, side, Math.PI / 2);
    fill(x + w / 2, top - roofH, x + w + depthW + ov, top + size * 0.2, (px, py) => { const t = clamp((py - (top - roofH)) / roofH); const left = lerp(apex[0], x + w, t), right = lerp(apex[0] + depthW, x + w + depthW + ov, t); return px > left && px < right ? 1 : 0; },
      lightX < 0 ? C.roofShadow : C.roofLight, 1.05);
  }
  fill(x, top, x + w, base, null, front, Math.PI / 2);                                                       // front wall
  fill(x - ov, top - roofH, x + w + ov, top, (px, py) => { const t = clamp((py - (top - roofH)) / roofH); return Math.abs(px - apex[0]) < (w / 2) * t ? 1 : 0; }, front, Math.PI / 2);   // gable
  // roof edges: two loaded strokes — the crispest lines of the building
  for (const sd of [-1, 1]) layer.stroke({ brush: 'knife', p0: apex, p2: [apex[0] + sd * (w / 2 + ov), top + size * 0.15], width: size * 0.55, color: sd * lightX > 0 ? C.roofLight : mixOk(C.roofLight, C.roofShadow, 0.6), thick: 0.9, dry: 0.15 });
  const out = { window: null, windows: [], chimney: null };
  for (let i = 0; i < windows; i++) { const wx = x + w * (windows === 1 ? (door ? 0.68 : 0.5) : lerp(0.25, 0.75, i / (windows - 1))), wy = base - h * 0.55, ws = h * 0.2;
    layer.stroke({ brush: 'knife', x: wx, y: wy, angle: Math.PI / 2, length: ws * 1.2, width: ws, color: C.window, thick: 0.9, shimmer: 0.12 });
    layer.stroke({ brush: 'liner', x: wx, y: wy, angle: Math.PI / 2, length: ws * 1.2, width: ws * 0.1, color: C.trim, thick: 0.5 });
    out.window ??= [wx, wy]; out.windows.push([wx, wy]); }
  if (door) layer.stroke({ brush: 'flat', x: x + w * 0.3, y: base - h * 0.27, angle: Math.PI / 2, length: h * 0.54, width: w * 0.16, color: C.trim, thick: 0.4 });
  if (chimney) { const cx = apex[0] + w * 0.22 + depthW * 0.3, cy = top - roofH * 0.62;
    layer.stroke({ brush: 'flat', x: cx, y: cy, angle: Math.PI / 2, length: roofH * 0.55, width: w * 0.1, color: C.wallShadow, color2: C.wallLight, mix2: 0.35, thick: 0.6 }); out.chimney = [cx, cy - roofH * 0.3]; }
  layer.stroke({ brush: 'round', p0: [x - ov, base + size * 0.1], p2: [x + w + depthW + ov, base + size * 0.12], width: size * 0.4, color: shift(C.wallShadow, -0.08), opacity: 0.7, soft: 0.6, thick: 0.1 }); // contact shadow
  return out;
}

/** Strokes for a small figure, 7–9 marks: head, torso, two legs, arm, a light on the lit shoulder. Call it from a static
 *  layer for a standing figure, or inside p.dynamic with `walk` = a phase in radians (e.g. t * 6) to make it walk.
 *  x, base: feet position · height · colors: { skin, top, topLight, legs } · facing: +1 right, −1 left. */
export function figureStrokes(layer, { x, base, height, colors, facing = 1, walk = 0, lightX = -1, opacity = 1, seed = 1 }) {
  const C = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, col(v)])); const H = height;
  const sw = Math.sin(walk), bob = Math.abs(Math.cos(walk)) * H * 0.015, hip = [x, base - H * 0.47 - bob], sh = [x + facing * H * 0.02, base - H * 0.82 - bob];
  const S = (o) => layer.stroke({ opacity, thick: 0.55, soft: 0.2, ...o });
  for (const [sd, i] of [[1, 0], [-1, 1]]) { const a = sd * sw * 0.42 * facing, foot = [hip[0] + Math.sin(a) * H * 0.47, base - Math.max(0, -sd * Math.cos(walk)) * H * 0.04];
    S({ brush: 'round', p0: hip, p1: [lerp(hip[0], foot[0], 0.5) + facing * H * 0.03, lerp(hip[1], foot[1], 0.5)], p2: foot, width: H * 0.085, taper: [1, 0.7], color: i ? shift(C.legs, -0.04) : C.legs, seed: seed + i }); }
  S({ brush: 'flat', p0: hip, p2: sh, width: H * 0.17, taper: [0.9, 1], color: C.top, seed: seed + 2 });
  S({ brush: 'round', p0: [sh[0] + lightX * H * 0.045, sh[1] + H * 0.02], p2: [hip[0] + lightX * H * 0.05, hip[1] - H * 0.1], width: H * 0.05, color: C.topLight, thick: 0.9, seed: seed + 3 });   // light down the lit side
  S({ brush: 'round', p0: [sh[0], sh[1] + H * 0.03], p2: [sh[0] - facing * sw * H * 0.12, sh[1] + H * 0.3], width: H * 0.06, taper: [1, 0.7], color: shift(C.top, -0.05), seed: seed + 4 });   // arm
  S({ brush: 'dab', x: sh[0] + facing * H * 0.012, y: sh[1] - H * 0.085, angle: 1.4, length: H * 0.15, width: H * 0.13, color: C.skin, thick: 0.8, soft: 0.25, fray: 0.1, seed: seed + 5 });               // head
  S({ brush: 'round', p0: [x - H * 0.1, base + H * 0.01], p2: [x - lightX * H * 0.45, base + H * 0.04], width: H * 0.07, color: [0.1, 0.1, 0.16], opacity: opacity * 0.35, soft: 0.8, thick: 0.02, seed: seed + 6 }); // cast shadow
  return layer;
}

/** A figure walking along from → to between t0 and t1 (dynamic layer). */
export function walker(painting, { from, to, t0 = 0, t1 = painting.duration, height = 0.08, colors, depth = 0.8, stride = 6.5, lightX = -1, seed = 1, fadeIn = 0.6 }) {
  return painting.dynamic('walker' + seed, { depth }, (t, L) => {
    if (t < t0) return; const k = clamp((t - t0) / (t1 - t0)), moving = k < 1;
    figureStrokes(L, { x: lerp(from[0], to[0], k), base: lerp(from[1], to[1], k), height: lerp(height, height * (to[2] ?? 1), k), colors, facing: Math.sign(to[0] - from[0]) || 1,
      walk: moving ? (t - t0) * stride : 0, lightX, opacity: clamp((t - t0) / fadeIn), seed });
  });
}

/** Smoke / mist rising from a point: soft thin wash strokes that climb, spread, lean with the wind and fade (dynamic layer). */
export function smoke(painting, { from, color = '#d9d6d2', rise = 0.05, lean = 0.02, width = 0.012, life = 4, count = 14, depth = 0.4, start = 0, seed = 1, opacity = 0.5 }) {
  const r = rng(seed * 77 + 1), puffs = Array.from({ length: count }, (_, i) => ({ off: (i / count) * life, wob: r() * 6.28, s: r.range(0.7, 1.3) }));
  return painting.dynamic('smoke' + seed, { depth }, (t, L) => {
    if (t < start) return; const fade = clamp((t - start) / 1.2);
    for (const [i, pf] of puffs.entries()) { const a = ((t + pf.off) % life) / life, y = from[1] - rise * life * a, x = from[0] + lean * life * a * a + Math.sin(a * 5 + pf.wob) * width * 0.8 * a;
      L.stroke({ brush: 'wash', x, y, angle: -1.2 + Math.sin(pf.wob + a * 3) * 0.5, length: width * (1.5 + 4 * a) * pf.s, width: width * (0.8 + 3 * a) * pf.s, color,
        opacity: opacity * fade * Math.sin(Math.PI * Math.min(1, a * 1.02)) * (1 - 0.5 * a), thick: 0.03, seed: i + 1 }); }
  });
}

/** Strokes for a small boat in 6 marks (hull, light gunwale, cabin or load, mast, optional lantern, dark reflection).
 *  x, y: waterline centre · len: hull length · a: roll angle (radians) · facing: +1 bow to the right, −1 to the left ·
 *  colors: { hullDark, hullLight, cabin, mast, lantern? } · t0: when it is painted on (omit = always visible). */
export function boatStrokes(layer, { x, y, len, a = 0, facing = 1, colors, t0, opacity = 1, mast = 0.55, seed = 1 }) {
  const C = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, col(v)])), c = Math.cos(a), s = Math.sin(a);
  const P = (u, v) => [x + (facing * u * c - v * s) * len, y + (facing * u * s + v * c) * len];          // boat-local (u towards the bow, v down) → scene
  const S = (o, i) => layer.stroke({ thick: 0.6, soft: 0.1, opacity, seed: seed * 10 + i, ...(t0 !== undefined ? { t0: t0 + i * 0.12, dur: 0.3 } : {}), ...o });
  S({ brush: 'round', p0: P(-0.45, 0.06), p2: P(0.45, 0.07), width: len * 0.06, color: [0.04, 0.05, 0.09], opacity: opacity * 0.5, soft: 0.7, thick: 0.05 }, 0);
  S({ brush: 'flat', p0: P(-0.5, -0.06), p1: P(-0.05, 0.11), p2: P(0.52, -0.11), width: len * 0.15, color: C.hullDark, taper: [0.8, 0.55] }, 1);   // bow rises and narrows
  S({ brush: 'round', p0: P(-0.5, -0.11), p1: P(-0.05, 0.01), p2: P(0.54, -0.17), width: len * 0.03, color: C.hullLight, thick: 0.9 }, 2);
  if (C.cabin) S({ brush: 'knife', p0: P(-0.22, -0.13), p2: P(0.0, -0.13), width: len * 0.12, color: C.cabin }, 3);
  if (mast > 0) S({ brush: 'liner', p0: P(0.12, -0.1), p2: P(0.12, -0.1 - mast), width: len * 0.018, color: C.mast ?? C.hullDark }, 4);
  if (C.lantern) S({ brush: 'dab', x: P(0.12, -0.12 - mast)[0], y: P(0.12, -0.12 - mast)[1], angle: 1.5, length: len * 0.05, width: len * 0.045, color: C.lantern, thick: 1, shimmer: 0.25 }, 5);
  return { lantern: P(0.12, -0.12 - mast), bow: P(0.54, -0.17) };
}

/** A boat that is painted on at `paintAt`, rocks at anchor, and (if `to` differs from `from`) sails between t0 and t1.
 *  from / to: [x, y] of the waterline centre. Dynamic layer. */
export function boat(painting, { from, to = from, t0 = 0, t1 = painting.duration, len = 0.12, colors, depth = 0.7, rock = 0.05, paintAt = undefined, seed = 1, mast = 0.55, name = 'boat' + seed, glow = 0.1 }) {
  return painting.dynamic(name, { depth }, (t, L) => {
    const k = clamp((t - t0) / Math.max(t1 - t0, 1e-3)), e = k * k * (3 - 2 * k);
    const b = boatStrokes(L, { x: lerp(from[0], to[0], e), y: lerp(from[1], to[1], e) + Math.sin(t * 1.1 + seed) * len * 0.012, len, a: Math.sin(t * 1.3 + seed * 2) * rock,
      facing: Math.sign(to[0] - from[0]) || 1, colors, t0: paintAt, mast, seed });
    if (colors.lantern && glow > 0 && (paintAt === undefined || t > paintAt + 0.7)) {      // lantern halo and its broken reflection, lit once the boat is painted
      const g = paintAt === undefined ? 1 : clamp((t - paintAt - 0.7) / 0.8);
      paintGlow(L, { x: b.lantern[0], y: b.lantern[1], radius: glow, color: colors.lantern, strength: 1.0 * g, core: len * 0.04, count: 96 });
      for (let i = 0; i < 5; i++) L.stroke({ brush: 'round', x: b.lantern[0] + Math.sin(t * 1.7 + i) * len * 0.02, y: lerp(from[1], to[1], e) + len * (0.1 + 0.07 * i), angle: 0, length: len * (0.16 - 0.02 * i), width: len * 0.022,
        color: colors.lantern, opacity: 0.55 * g * (1 - i * 0.15), thick: 0.6, taper: [0.4, 0.4], shimmer: 0.4, seed: 50 + i });
    }
  });
}
