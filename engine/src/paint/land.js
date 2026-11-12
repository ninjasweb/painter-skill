// Land, water, grass, distant tree lines. Rules baked in:
//  · work from the distance forward; far things are lighter, cooler, lower contrast, smaller marks
//  · brush marks follow the form (slope of the hill, flatness of water, growth of grass)
//  · break every mass with "light against dark, dark against light" — a small value step is enough
//  · darkest darks and thickest paint belong to the foreground

import { clamp, lerp, smoothstep, noise2, fbm } from '../core/math.js';
import { col, mixOk, vary, shift, chroma, toOklab } from '../core/color.js';

const fn = (v) => (typeof v === 'function' ? v : () => v);

/** Thin guideline drawing (step 1 of any painting): pts = polyline. Later paint covers most of it. */
export function sketch(layer, pts, { color = '#7a6aa8', width = 0.0035, opacity = 0.7 } = {}) {
  return layer.path(pts, { brush: 'liner', color, width, opacity, dry: 0.25, thick: 0.02, wobble: 1.5, step: 0.06, taper: [1, 0.8] });
}
/** Sample a function y = f(x) into a polyline. */
export const trace = (f, x0, x1, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const x = lerp(x0, x1, i / n); return [x, f(x)]; });

/** A land mass below top(x) down to bottom (number or fn).
 *  color: (x, y, k) → colour, k = 0 at the crest … 1 at the bottom. size: brush width.
 *  fragment: how strongly to break the mass with slightly lighter/darker patches (0..1). */
export function paintHills(layer, { top, bottom = 1.1, color, size = 0.03, brush = 'filbert', fragment = 0.5, x0 = -0.1, x1 = null, thick = 0.3, soft = 0.25, seed = 1, sway = 0, edge = 0.5 }) {
  const A = layer.p.aspect; x1 ??= A + 0.1; const bot = fn(bottom);
  let yMin = 1e9, yMax = -1e9;
  for (let x = x0; x <= x1; x += 0.02) { yMin = Math.min(yMin, top(x)); yMax = Math.max(yMax, bot(x)); }
  const slope = (x) => Math.atan((top(x + 0.01) - top(x - 0.01)) / 0.02);
  const k = (x, y) => clamp((y - top(x)) / Math.max(bot(x) - top(x), 1e-3));
  const inside = (x, y) => smoothstep(-size * 0.25 * edge, size * 0.35 * edge + 1e-4, y - top(x)) * (y < bot(x) ? 1 : 0);
  layer.scatter({ bounds: [x0, yMin - size, x1, yMax], spacing: size * 0.4, brush, mask: inside, order: 'down',
    width: (x, y, r) => size * r.range(0.8, 1.3), length: (x, y, r) => size * r.range(1.8, 3.2),
    angle: (x, y, r) => slope(x) * (1 - 0.6 * k(x, y)) + (r() - 0.5) * 0.5,
    color: (x, y, r) => vary(color(x, y, k(x, y)), r, 0.02, 0.006, 3), thick, soft, sway });
  if (fragment > 0) layer.scatter({ bounds: [x0, yMin, x1, yMax], spacing: size * 0.8, brush: 'dab',
    mask: (x, y) => (y > top(x) + size * 0.4 && y < bot(x) ? 0.25 + 0.5 * fbm(x * 9, y * 9, seed, 3) : 0),
    width: (x, y, r) => size * r.range(0.4, 0.8), length: (x, y, r) => size * r.range(0.8, 1.8), angle: (x, y, r) => slope(x) * 0.5 + (r() - 0.5) * 0.9,
    color: (x, y, r) => { const base = color(x, y, k(x, y)); const up = noise2(x * 14, y * 14, seed + 3) > 0.5; return vary(shift(base, (up ? 0.055 : -0.05) * fragment), r, 0.012, 0.006, 4); },
    thick: thick * 1.3, soft: 0.3, sway });
  return layer;
}

/** Still or gently moving water between `top` (the far shoreline, y) and `bottom`.
 *  It mirrors whatever has already been painted above the waterline (sky, clouds, trees) — slightly darker and
 *  greyer — with horizontal strokes that get bigger towards the viewer, then light glints.
 *  tint: water's own colour · sunPath: { x, color, width } glitter column under a low sun. */
export function paintWater(layer, { top, bottom = 1.05, x0 = -0.1, x1 = null, mask = null, tint = '#44506e', tintAmount = 0.22, darken = 0.05, size = 0.03, glints = '#f6e7c8', glintAmount = 0.5, sunPath = null, shimmer = 0.5, sway = 0.004, reflect = null, chop = 0, crest = '#e9eef0', mirror = 0.35 }) {
  const P = layer.p, A = P.aspect; x1 ??= A + 0.1; const topF = fn(top);
  const refl = reflect ?? ((x, y) => P.sample(x + (noise2(x * 40, y * 60, 9) - 0.5) * 0.012, 2 * topF(x) - y - 0.004));
  const depth = (x, y) => clamp((y - topF(x)) / Math.max(bottom - topF(x), 1e-3));
  const inside = (x, y) => (y > topF(x) ? (mask ? mask(x, y) : 1) : 0);
  let yMin = 1e9; for (let x = x0; x <= x1; x += 0.02) yMin = Math.min(yMin, topF(x));
  const body = (x, y) => { const d = depth(x, y); return chroma(shift(mixOk(refl(x, y), tint, tintAmount + 0.2 * d), -darken - 0.03 * d), 0.9); };
  // body: long, level drags right across the water (as in the demonstrations — one loaded brush pulled sideways), wet-blended
  layer.scatter({ bounds: [x0, yMin, x1, bottom], spacing: size * 0.42, brush: 'flat', mask: inside, order: 'down',
    width: (x, y, r) => size * (0.4 + 0.9 * depth(x, y)) * r.range(0.8, 1.25), length: (x, y, r) => size * (6 + 14 * depth(x, y)) * r.range(0.6, 1.5) * (1 - 0.8 * mirror * (1 - 0.6 * depth(x, y))),   // shorter drags far away keep the mirror image readable
    angle: (x, y, r) => (r() - 0.5) * 0.025, bend: (x, y, r) => (r() - 0.5) * 0.02, color: (x, y, r) => vary(body(x, y), r, 0.012, 0.004, 2),
    thick: 0.14, soft: 0.5, fray: 0.5, load: 0.6, pickup: 0.25 * (1 - mirror), sway, shimmer: 0.05 });
  // a soft level blending pass so reflections melt instead of stepping
  layer.scatter({ bounds: [x0, yMin, x1, bottom], spacing: size * 0.9, brush: 'wash', mask: inside, order: 'down',
    width: (x, y, r) => size * (0.7 + 1.2 * depth(x, y)), length: (x, y, r) => size * (8 + 14 * depth(x, y)) * r.range(0.7, 1.3), angle: (x, y, r) => (r() - 0.5) * 0.02,
    color: (x, y) => body(x, y), opacity: 0.4 * (1 - 0.7 * mirror), thick: 0.05, sway });
  // ripples: a few dark-against-light / light-against-dark level touches, sparse and uneven — more of them near the viewer
  layer.scatter({ bounds: [x0, yMin, x1, bottom], spacing: size * 1.1, brush: 'round', mask: (x, y) => inside(x, y) * (0.08 + 0.4 * depth(x, y)) * (0.3 + 1.2 * noise2(x * 4, y * 22, 5)),
    width: (x, y, r) => size * (0.07 + 0.26 * depth(x, y)), length: (x, y, r) => size * (1 + 7 * depth(x, y)) * r.range(0.4, 1.6), angle: (x, y, r) => (r() - 0.5) * 0.04,
    color: (x, y, r) => shift(body(x, y), r() < 0.5 ? 0.05 : -0.05), opacity: 0.7, thick: 0.25, soft: 0.4, taper: [0.3, 0.3], sway: sway * 2, shimmer: shimmer * 0.6 });
  if (glintAmount > 0) layer.scatter({ bounds: [x0, yMin, x1, bottom], spacing: size * 1.5, brush: 'liner',
    mask: (x, y) => inside(x, y) * glintAmount * 0.35 * smoothstep(0.35, 0.8, toOklab(refl(x, y))[0]),
    width: (x, y, r) => size * (0.06 + 0.12 * depth(x, y)), length: (x, y, r) => size * (0.8 + 3 * depth(x, y)) * r.range(0.5, 1.2), angle: 0,
    color: (x, y, r) => vary(glints, r, 0.02), thick: 0.9, taper: [0.6, 0.6], sway: sway * 2, shimmer });
  if (chop > 0) { // choppy sea: irregular low wave backs — a soft dark trough with a lighter, broken crest above it; bigger towards the viewer
    layer.scatter({ bounds: [x0, yMin, x1, bottom], spacing: size * 2 / Math.sqrt(chop), brush: 'filbert', order: 'down', mask: (x, y) => inside(x, y) * (0.3 + 0.6 * depth(x, y)) * (0.4 + 0.9 * noise2(x * 5, y * 16, 21)),
      each: (s, x, y, r) => { const d = depth(x, y), L = size * (1.5 + 7 * d) * r.range(0.5, 1.5), h = L * r.range(0.03, 0.09) * chop, b = body(x, y), skew = r.range(-0.25, 0.25) * L;
        layer.stroke({ brush: 'filbert', p0: [x - L / 2, y + h * 1.5], p1: [x + skew, y + h * 3], p2: [x + L / 2, y + h * 1.2], width: size * (0.3 + 1.1 * d), color: shift(b, -0.06 * chop), opacity: 0.7, thick: 0.15, soft: 0.6, sway: sway * 2, taper: [0.3, 0.3] });
        s.p0 = [x - L / 2, y + h * 0.5]; s.p1 = [x + skew, y - h * 2]; s.p2 = [x + L / 2, y + h * 0.3];
        s.width = size * (0.2 + 0.7 * d) * r.range(0.6, 1.2); s.color = vary(shift(b, 0.06 * chop), r, 0.02); s.thick = 0.45; s.soft = 0.45; s.dry = 0.25; s.sway = sway * 3; s.taper = [0.25, 0.35]; s.opacity = 0.85;
        if (r() < 0.2 * chop * (0.3 + d)) layer.stroke({ brush: 'dab', x: x + skew * 0.6, y: y - h * 0.8, angle: r.range(-0.25, 0.25), length: L * r.range(0.15, 0.35), width: size * (0.1 + 0.3 * d), color: crest, thick: 0.9, dry: 0.4, sway: sway * 3, shimmer: 0.3 }); } });
  }
  if (sunPath) {
    const w = sunPath.width ?? 0.05, c = col(sunPath.color ?? '#ffe9a8');
    layer.scatter({ bounds: [sunPath.x - w * 3, yMin, sunPath.x + w * 3, bottom], spacing: size * 0.45, brush: 'round',
      mask: (x, y) => inside(x, y) * Math.exp(-(((x - sunPath.x) / (w * (0.5 + 1.6 * depth(x, y)))) ** 2)) * (0.9 - 0.5 * depth(x, y)),
      width: (x, y, r) => size * (0.16 + 0.42 * depth(x, y)) * r.range(0.7, 1.3), length: (x, y, r) => size * (0.8 + 3.5 * depth(x, y)) * r.range(0.5, 1.3), angle: (x, y, r) => (r() - 0.5) * 0.05, soft: 0.3,
      color: (x, y, r) => vary(mixOk(c, sunPath.edge ?? shift(c, -0.14), clamp(Math.abs(x - sunPath.x) / (w * 2))), r, 0.02, 0.01, 4), thick: 0.85, taper: [0.5, 0.5], sway: sway * 2, shimmer: shimmer * 1.2 });
  }
  return layer;
}

/** A band of distant trees/bushes standing on base(x): dark bumpy masses, a few taller trees, lit tops.
 *  dark / light: the two mixes. height: typical tree height. gaps: 0..1 how broken the line is. */
export function paintTreeline(layer, { base, height = 0.05, dark, light = null, x0 = -0.1, x1 = null, size = 0.012, seed = 1, gaps = 0.2, lightFrom = -1, sway = 0.0015, tall = 0.35, thick = 0.3, soft = 0.3 }) {
  const A = layer.p.aspect; x1 ??= A + 0.1; dark = fn(dark); const lightF = light ? fn(light) : null;
  const prof = (x) => { // crown-top profile: lumps + occasional tall spires
    const lumps = 0.45 + 0.55 * noise2(x * (0.6 / height), 0, seed) + 0.3 * (noise2(x * (2.2 / height), 3, seed + 5) - 0.5);
    const spire = Math.pow(noise2(x * (0.9 / height), 7, seed + 11), 5) * tall * 6;
    const gap = smoothstep(gaps, gaps + 0.15, noise2(x * (0.35 / height), 11, seed + 17));
    return height * (lumps + spire) * gap;
  };
  const inside = (x, y) => { const b = base(x), h = prof(x); return h > 0.002 && y < b + size * 0.3 ? smoothstep(0, size * 0.5, y - (b - h)) : 0; };
  layer.scatter({ bounds: [x0, -0.1, x1, 1.1], spacing: size * 0.42 * (1 - soft * 0.5), brush: 'dab', mask: (x, y) => (y > base(x) - height * 3.2 && y < base(x) + size ? inside(x, y) : 0),
    width: (x, y, r) => size * r.range(0.7, 1.3), length: (x, y, r) => size * r.range(0.9, 1.9), angle: (x, y, r) => -Math.PI / 2 + (r() - 0.5) * 1.6,
    color: (x, y, r) => vary(dark(x, y), r, 0.02, 0.006, 4), thick, soft, sway });
  if (lightF) layer.scatter({ bounds: [x0, -0.1, x1, 1.1], spacing: size * 0.6, brush: 'dab',
    mask: (x, y) => { const b = base(x), h = prof(x); if (h < 0.004 || y > b || y < b - h) return 0; const up = (b - y) / h;
      const side = clamp(0.5 + lightFrom * (prof(x + size) - prof(x - size)) / (size * 2) * 0.6); return smoothstep(0.35, 0.9, up) * side * 0.8; },
    width: (x, y, r) => size * r.range(0.4, 0.8), length: (x, y, r) => size * r.range(0.6, 1.3), angle: (x, y, r) => r() * 6.28,
    color: (x, y, r) => vary(lightF(x, y), r, 0.02, 0.008, 5), thick: thick * 2, soft, sway });
  return layer;
}

/** Grass / reeds: flicks that grow upward from an anchored root. Darks first, then lighter blades on top.
 *  bounds + mask choose where; blade: length; dark / light colours (constants or (x,y) → colour);
 *  lean: radians of general lean; density 0.5..2. */
export function paintGrass(layer, { bounds, mask = null, blade = 0.05, dark, light, tips = null, density = 1, lean = 0.15, sway = 0.012, width = 0.004, lightAmount = 0.5, clump = 0.6, seed = 1 }) {
  dark = fn(dark); light = fn(light);
  const flick = (c, len, wid, thick, amt) => layer.scatter({ bounds, spacing: (blade * 0.16) / density / Math.sqrt(amt), mask, order: 'down', brush: 'liner',
    each: (s, x, y, r) => {
      const cl = 1 - clump + clump * 1.6 * Math.pow(noise2(x * (0.5 / blade), y * (0.2 / blade), seed), 1.5);   // tufts of uneven height
      const L = len * cl * r.range(0.5, 1.25), a = -Math.PI / 2 + lean + (noise2(x * 6, 0, seed + 2) - 0.5) * 0.5 + (r() - 0.5) * 0.6, bow = (r() - 0.5) * 0.5 * L;
      s.p0 = [x, y]; s.p2 = [x + Math.cos(a) * L, y + Math.sin(a) * L];
      s.p1 = [x + Math.cos(a) * L * 0.5 - Math.sin(a) * bow, y + Math.sin(a) * L * 0.5 + Math.cos(a) * bow];
      s.width = wid * r.range(0.7, 1.4); s.color = vary(c(x, y), r, 0.03, 0.01, 6); s.taper = [1, 0.15]; s.thick = thick; s.sway = sway * (L / blade); s.swayRoot = 0;
    } });
  flick(dark, blade, width * 1.5, 0.3, 1);
  flick((x, y) => mixOk(dark(x, y), light(x, y), 0.55), blade * 0.9, width * 1.1, 0.5, 0.6);
  flick(light, blade * 0.85, width * 0.9, 0.8, lightAmount);
  if (tips) flick(fn(tips), blade * 0.5, width * 0.8, 1, lightAmount * 0.35);
  return layer;
}
