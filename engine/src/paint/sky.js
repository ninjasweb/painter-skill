// Sky, sun, clouds, light rays — painted the way the cloud demonstrations do it:
// start from the light source, lay thin blended sky first, mass the clouds in a mid tone with soft edges,
// then turn each lump with a shadow side and a lit side, and finish with small thick highlights facing the sun.

import { clamp, lerp, smoothstep, billow, noise2, fbm } from '../core/math.js';
import { col, mixOk, ramp, vary, shift } from '../core/color.js';

/** Build a sky colour function. stops: [[0, zenith], …, [1, horizon]] measured from `top` to `bottom`.
 *  sun: { x, y, color, reach, strength } adds a glow that warms and lightens the sky around the light source. */
export function skyColor({ top = 0, bottom = 0.65, stops, sun }) {
  return (x, y) => {
    let c = ramp(clamp((y - top) / (bottom - top)), stops);
    if (sun) {
      const d = Math.hypot(x - sun.x, (y - sun.y) * (sun.squash ?? 1.6));
      const g = Math.exp(-(d * d) / ((sun.reach ?? 0.35) ** 2)) * (sun.strength ?? 0.8);
      c = mixOk(c, sun.color, clamp(g));
    }
    return c;
  };
}

/** Lay in a sky: big thin criss-cross strokes, then a soft blending pass (wet-into-wet). color: (x,y) → colour. */
export function paintSky(layer, { color, top = -0.05, bottom = 0.7, size = 0.07, blend = 1, drift = [0, 0] }) {
  const A = layer.p.aspect;
  layer.scatter({ bounds: [-0.1, top, A + 0.1, bottom], spacing: size * 0.42, order: 'sweep', brush: 'flat',
    width: (x, y, r) => size * r.range(0.8, 1.25), length: (x, y, r) => size * r.range(2.2, 3.6),
    angle: (x, y, r) => (r() < 0.5 ? 0.22 : -0.22) + (r() - 0.5) * 0.5, bend: (x, y, r) => (r() - 0.5) * 0.25,
    color: (x, y, r) => vary(color(x, y), r, 0.018, 0.006, 2), thick: 0.14, dry: 0.05, soft: 0.3, drift });
  if (blend > 0) {
    layer.scatter({ bounds: [-0.1, top, A + 0.1, bottom], spacing: size * 0.75, order: 'sweep', brush: 'wash',
      width: size * 1.7, length: (x, y, r) => size * r.range(3, 5), angle: (x, y, r) => (r() - 0.5) * 0.3,
      color: (x, y) => color(x, y), opacity: 0.55 * blend, thick: 0.06, drift });
  }
  return layer;
}

/** The sun: a wide soft glow, then a clean bright disc — the lightest, warmest note in the picture. Thin, even
 *  paint (a thick blob would catch the raking light and go grey). r: disc radius · glow: halo radius. */
export function paintSun(layer, { x, y, r = 0.018, color = '#fff6c8', halo = '#ffd27a', glow = 0.12, strength = 0.6 }) {
  if (glow > 0) paintGlow(layer, { x, y, radius: glow, color: halo, coreColor: color, strength, core: 0, shimmer: 0.1, squash: 0.8 });
  layer.stroke({ brush: 'dab', x, y, angle: 0.3, length: r * 2.02, width: r * 2, color, soft: 0.12, fray: 0, dry: 0, load: 0, bristles: 2, thick: 0.1, taper: [1, 1] });
  layer.stroke({ brush: 'dab', x, y, angle: 1.1, length: r * 1.3, width: r * 1.25, color: mixOk(color, '#ffffff', 0.5), soft: 0.6, fray: 0, dry: 0, load: 0, bristles: 2, thick: 0.08, taper: [1, 1] });
  return layer;
}

/** Paint a cumulus from a Lobes shape (see forms.cumulusShape).
 *  shadow / mid / light / highlight: the four mixes, dark to light. size: brush width.
 *  Order: soft body → turn the form (lit side) → thick highlights on the rims facing the light → broken underside. */
export function paintCumulus(layer, shape, { shadow, mid, light, highlight, size = 0.03, drift = [0, 0], detail = 1, soften = 0.35 }) {
  shadow = col(shadow); mid = col(mid); light = col(light); highlight = col(highlight ?? shift(light, 0.06));
  const [x0, y0, x1, y1] = shape.bounds, pad = size;
  const B = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  const edge = (x, y) => shape.density(x, y) + (noise2(x * 30, y * 30, 5) - 0.5) * 0.22; // ragged, never a perfect outline
  const H = y1 - y0;
  const litOf = (x, y) => clamp(shape.lit(x, y) * 0.75 + 0.25 * clamp((y1 - y) / H));  // tops catch more light
  // 1. body: one mass in shadow and mid tone, soft edges that melt into the sky
  layer.scatter({ bounds: B, spacing: size * 0.4, brush: 'filbert', mask: (x, y) => smoothstep(-0.12, 0.1, edge(x, y)),
    width: (x, y, r) => size * r.range(0.9, 1.4), length: (x, y, r) => size * r.range(1.4, 2.2), angle: (x, y) => shape.tangent(x, y), jitter: 0.6,
    color: (x, y, r) => vary(mixOk(shadow, mid, smoothstep(0.35, 0.8, litOf(x, y))), r, 0.018, 0.006, 3),
    soft: 0.6, thick: 0.16, pickup: soften, drift });
  // 2. turn the form: rounded dabs of lighter paint on the side of each lump that faces the light
  layer.scatter({ bounds: B, spacing: size * 0.34, brush: 'dab',
    mask: (x, y) => (edge(x, y) > 0.03 ? smoothstep(0.5, 0.74, litOf(x, y)) : 0),
    width: (x, y, r) => size * r.range(0.6, 1.0), length: (x, y, r) => size * r.range(0.7, 1.25), angle: (x, y) => shape.tangent(x, y), jitter: 0.9,
    color: (x, y, r) => vary(mixOk(mid, light, smoothstep(0.5, 0.9, litOf(x, y))), r, 0.018, 0.008, 3),
    soft: 0.55, thick: 0.3, pickup: 0.15, fray: 0.3, drift });
  // 3. highlights: small, thicker, only on the rims that face the sun
  if (detail > 0) layer.scatter({ bounds: B, spacing: size * 0.3 / detail, brush: 'dab',
    mask: (x, y) => { const d = edge(x, y); return d > 0.04 && d < 0.45 ? smoothstep(0.74, 0.92, litOf(x, y)) * 0.7 : 0; },
    width: (x, y, r) => size * r.range(0.32, 0.6), length: (x, y, r) => size * r.range(0.4, 0.8), angle: (x, y) => shape.tangent(x, y), jitter: 1,
    color: (x, y, r) => vary(highlight, r, 0.012, 0.006, 3), thick: 0.6, soft: 0.4, fray: 0.3, drift });
  // 4. underside: a little darker, dragged thinly along the flat base
  layer.scatter({ bounds: [x0, y1 - H * 0.16, x1, y1 + pad * 0.3], spacing: size * 0.5, brush: 'filbert',
    mask: (x, y) => (edge(x, y) > 0.06 ? 0.7 : 0),
    width: size * 0.8, length: (x, y, r) => size * r.range(1.2, 2.2), angle: (x, y, r) => (r() - 0.5) * 0.2,
    color: (x, y, r) => vary(shift(shadow, -0.03), r, 0.015), opacity: 0.55, thick: 0.08, soft: 0.7, drift });
  return layer;
}

/** A long cloud bank / stratus layer between top(x) and bottom(x) (functions of x → y).
 *  colorTop: body colour · colorBelow: colour of the underside (often lit by a low sun) · lump: billowy top edge. */
export function paintCloudBank(layer, { top, bottom, colorTop, colorBelow, size = 0.035, lump = 0.035, x0 = -0.1, x1 = null, drift = [0, 0], seed = 3, edgeLight = null }) {
  const A = layer.p.aspect; x1 ??= A + 0.1;
  const topE = (x) => top(x) - lump * (billow(x * 9, 0.3, seed, 3) - 0.35) * 1.6;
  let yMin = 1e9, yMax = -1e9;
  for (let x = x0; x <= x1; x += 0.02) { yMin = Math.min(yMin, topE(x)); yMax = Math.max(yMax, bottom(x)); }
  const inside = (x, y) => smoothstep(0, size * 0.6, y - topE(x)) * smoothstep(0, size * 0.9, bottom(x) - y);
  layer.scatter({ bounds: [x0, yMin - size, x1, yMax + size], spacing: size * 0.4, brush: 'filbert', mask: inside,
    width: (x, y, r) => size * r.range(0.7, 1.2), length: (x, y, r) => size * r.range(2.5, 5), angle: (x, y, r) => (r() - 0.5) * 0.3, bend: (x, y, r) => (r() - 0.5) * 0.3,
    color: (x, y, r) => { const k = clamp((y - topE(x)) / Math.max(bottom(x) - topE(x), 1e-3)); const c = typeof colorTop === 'function' ? colorTop(x, y) : colorTop;
      const cb = typeof colorBelow === 'function' ? colorBelow(x, y) : colorBelow; return vary(mixOk(c, cb, smoothstep(0.45, 1, k)), r, 0.02, 0.008, 3); },
    soft: 0.5, thick: 0.25, pickup: 0.2, drift });
  // darker belly lumps and lighter upper lumps: the bank is a row of clouds, not a flat band
  layer.scatter({ bounds: [x0, yMin - size, x1, yMax + size], spacing: size * 0.7, brush: 'dab', mask: (x, y) => inside(x, y) * (0.3 + 0.5 * billow(x * 14, y * 20, seed + 2, 2)),
    width: (x, y, r) => size * r.range(0.6, 1.1), length: (x, y, r) => size * r.range(1.2, 2.4), angle: (x, y, r) => (r() - 0.5) * 0.7,
    color: (x, y, r) => { const k = clamp((y - topE(x)) / Math.max(bottom(x) - topE(x), 1e-3)); const c = typeof colorTop === 'function' ? colorTop(x, y) : col(colorTop);
      return vary(shift(c, k < 0.4 ? 0.05 : -0.04), r, 0.02, 0.006, 3); }, soft: 0.6, thick: 0.2, pickup: 0.3, drift });
  if (edgeLight) { // soft rim light on the tops of the lumps
    layer.scatter({ bounds: [x0, yMin - size, x1, yMax], spacing: size * 0.3, brush: 'dab',
      mask: (x, y) => { const lit = typeof edgeLight === 'function' ? edgeLight(x) : edgeLight; if (!lit) return 0; const d = y - topE(x); return d > size * 0.05 && d < size * 0.6 ? 0.8 * smoothstep(0.4, 0.65, billow(x * 9, 0.3, seed, 3)) : 0; },
      width: (x, y, r) => size * r.range(0.4, 0.7), length: (x, y, r) => size * r.range(0.8, 1.6), angle: (x, y, r) => (r() - 0.5) * 0.6,
      color: (x, y, r) => vary(typeof edgeLight === 'function' ? edgeLight(x) : edgeLight, r, 0.02, 0.01, 3), thick: 0.3, soft: 0.65, pickup: 0.55, drift });   // pickup keeps it a value step, not a white dash
  }
  return layer;
}

/** Crepuscular rays fanning from `from` (usually hidden behind a cloud): a few broad, soft shafts of lighter
 *  air, widening as they travel, glazed thinly over the sky. Keep them subtle — value step, not white lines. */
export function paintRays(layer, { from, angle0, angle1, count = 7, length = 0.6, color = '#fdf3d0', width = 0.07, opacity = 0.16, shimmer = 0.3 }) {
  const r = layer.rand;
  for (let i = 0; i < count; i++) {
    const a = lerp(angle0, angle1, (i + r.range(0.2, 0.8)) / count), L = length * r.range(0.6, 1), s0 = r.range(0.12, 0.25) * L, w = width * r.range(0.5, 1.5);
    for (let k = 0; k < 3; k++) {                       // each shaft is a few overlapping glazes
      const da = (r() - 0.5) * 0.03, LL = L * r.range(0.8, 1);
      const p0 = [from[0] + Math.cos(a + da) * s0, from[1] + Math.sin(a + da) * s0], p2 = [from[0] + Math.cos(a + da) * LL, from[1] + Math.sin(a + da) * LL];
      layer.stroke({ brush: 'wash', p0, p2, width: w * r.range(0.7, 1.2), taper: [0.25, 1.5], color, opacity: opacity * r.range(0.5, 1), dry: 0.12, soft: 0.95, thick: 0.03, load: 0.9, bristles: 6, fray: 0.2, shimmer });
    }
  }
  return layer;
}

/** A soft glow around a point light (lamp, window, moon, fire): many round, very soft touches whose strength
 *  falls off with distance, plus an optional small loaded core. Paint it AFTER the dark it sits on — a glow only
 *  reads against a darker surround. shimmer makes it breathe in the living phase.
 *  radius: reach of the halo · strength: opacity at the centre · core: radius of the hot centre (0 = none). */
export function paintGlow(layer, { x, y, radius = 0.08, color = '#ffd98a', coreColor = '#fff6d8', strength = 0.5, core = 0.006, shimmer = 0.25, count = 110, squash = 1 }) {
  const r = layer.rand, rings = Math.max(4, Math.round(count / 12));
  for (let k = 0; k < rings; k++) {                 // nested soft discs, smaller and hotter towards the centre
    const f = k / (rings - 1), rad = radius * (1 - 0.88 * f);
    for (let j = 0; j < 3; j++) layer.stroke({ brush: 'wash', x: x + (r() - 0.5) * rad * 0.25, y: y + (r() - 0.5) * rad * 0.25 * squash, angle: r() * 6.28, length: rad * 2.1, width: rad * 2 * (j === 0 ? 1 : squash),
      color: mixOk(color, coreColor, f * f * 0.8), opacity: strength * (0.1 + 0.22 * f), soft: 1, fray: 0, dry: 0, load: 0, bristles: 1, thick: 0.02, shimmer });
  }
  if (core > 0) for (let i = 0; i < 5; i++) layer.stroke({ brush: 'dab', x: x + (r() - 0.5) * core, y: y + (r() - 0.5) * core, angle: r() * 6, length: core * 2.2, width: core * 2, color: coreColor, thick: 1, soft: 0.4, shimmer: shimmer * 0.4 });
  return layer;
}

/** A moon (or any small luminous disc): glow first, then a true round disc of short thin dabs, lighter on one side.
 *  r: radius · color / shade: lit and darker side · glow: halo radius (0 = none) · phaseX: −1…1 which side is lighter. */
export function paintMoon(layer, { x, y, r = 0.03, color = '#f3f1e4', shade = '#c9c8c2', glow = 0.14, glowColor = '#b9c6e6', strength = 0.35, phaseX = -0.4, shimmer = 0.1 }) {
  if (glow > 0) paintGlow(layer, { x, y, radius: glow, color: glowColor, coreColor: color, strength, core: 0, shimmer });
  // one clean round touch gives the true circular edge; faint mottling inside gives it a painted surface
  layer.stroke({ brush: 'dab', x, y, angle: 0.3, length: r * 2.02, width: r * 2, color: mixOk(color, shade, 0.25), soft: 0.07, fray: 0, dry: 0, load: 0, bristles: 3, thick: 0.15, taper: [1, 1] });
  layer.scatter({ bounds: [x - r, y - r, x + r, y + r], spacing: r * 0.2, brush: 'dab', mask: (px, py) => (Math.hypot(px - x, py - y) < r * 0.72 ? 0.8 : 0),
    width: r * 0.3, length: r * 0.38, angle: (px, py, rr) => rr() * 6.28, soft: 0.6, fray: 0.1, thick: 0.1, opacity: 0.7,
    color: (px, py, rr) => vary(mixOk(color, shade, clamp(0.45 + ((px - x) / r) * -phaseX * 0.9 + (noise2(px * 90, py * 90, 3) - 0.5) * 0.6)), rr, 0.012, 0.003, 2) });
  return layer;
}

/** Broken storm / sunset cloud masses: big ragged dark shapes with glowing rims where they face the light — the
 *  way the cloud demonstration builds a dramatic sky (dark masses first, light only on the edges turned to the sun).
 *  bounds: where to work · cover(x, y) → 0…1: how much cloud the composition wants there (1 = solid, 0 = clear sky;
 *  use it to leave the bright gap) · scale: size of the masses · dark / mid: body colours ·
 *  rim: colour of the lit edges · light: [x, y] position of the sun/moon (may be outside the frame) ·
 *  rimWidth: how far into the cloud the light bites. */
export function paintCloudMass(layer, { bounds = null, cover = () => 1, scale = 0.4, dark, mid, rim, light, size = 0.035, rimWidth = 0.035, seed = 1, drift = [0, 0], rimAmount = 1 }) {
  const A = layer.p.aspect; bounds ??= [-0.1, -0.08, A + 0.1, 0.7]; dark = col(dark); mid = col(mid); rim = col(rim);
  const dens = (x, y) => (0.62 * fbm(x / scale, y / (scale * 0.55), seed, 4, 0.55) + 0.38 * billow(x / (scale * 0.45), y / (scale * 0.3), seed + 5, 3)) * 0.56 + cover(x, y) * 0.5;
  const TH = 0.5, d = (x, y) => dens(x, y) - TH;
  const toL = (x, y) => { const dx = light[0] - x, dy = light[1] - y, n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };
  const litEdge = (x, y, reach) => { const v = d(x, y); if (v < -0.01 || v > reach) return 0; const [ux, uy] = toL(x, y);
    const out = d(x + ux * rimWidth, y + uy * rimWidth); if (out > 0.0) return 0;
    return smoothstep(reach, 0, v) * smoothstep(0.0, -0.03, out) * clamp(0.35 + 0.9 * Math.exp(-Math.hypot(x - light[0], y - light[1]) * 1.4)); };
  // 1. body: thin, soft, dark; where an edge is turned to the light the body colour itself warms and lightens,
  //    so the glow is a gradient inside the cloud, not marks laid on top of it
  layer.scatter({ bounds, spacing: size * 0.4, brush: 'filbert', mask: (x, y) => smoothstep(-0.03, 0.03, d(x, y) + (noise2(x * 40, y * 40, seed + 9) - 0.5) * 0.05),
    width: (x, y, r) => size * r.range(0.8, 1.4), length: (x, y, r) => size * r.range(1.6, 3), angle: (x, y, r) => (noise2(x * 3, y * 3, seed + 2) - 0.5) * 1.6 + (r() - 0.5) * 0.5,
    color: (x, y, r) => { const [ux, uy] = toL(x, y), facing = clamp((d(x, y) - d(x + ux * rimWidth * 2, y + uy * rimWidth * 2)) * 6 + 0.35);
      const body = mixOk(dark, mid, facing * 0.8 + 0.2 * noise2(x * 9, y * 9, seed + 3)); return vary(mixOk(body, rim, 0.75 * litEdge(x, y, 0.11) * rimAmount), r, 0.02, 0.006, 3); },
    soft: 0.6, thick: 0.16, pickup: 0.25, drift });
  // 2. ragged edges: short dry touches that break the outline (kept close to the mass — no stray spikes)
  layer.scatter({ bounds, spacing: size * 0.8, brush: 'scumble', mask: (x, y) => { const v = d(x, y); return v > -0.012 && v < 0.02 ? 0.5 : 0; },
    width: size * 0.9, length: (x, y, r) => size * r.range(1, 1.8), angle: (x, y, r) => (r() - 0.5) * 0.5, color: (x, y, r) => vary(mixOk(dark, mid, 0.4), r, 0.02), opacity: 0.45, thick: 0.06, dry: 0.5, soft: 0.5, drift });
  // 3. the lightest note: a broken line of small ROUND, soft touches right on the lit edge, melted into the glow under them
  layer.scatter({ bounds, spacing: size * 0.3, brush: 'dab', mask: (x, y) => litEdge(x, y, 0.035) * 0.75 * rimAmount * (0.4 + 0.9 * noise2(x * 8, y * 8, seed + 11)),
    width: (x, y, r) => size * r.range(0.45, 0.8), length: (x, y, r) => size * r.range(0.5, 0.9), angle: (x, y, r) => r() * 6.28,
    color: (x, y, r) => vary(shift(rim, 0.03), r, 0.012, 0.005, 2), thick: 0.3, soft: 0.8, fray: 0.1, bristles: 3, pickup: 0.3, opacity: 0.85, drift });
  return layer;
}
