// Perspective: one camera, one horizon, everything placed and sized from it (see references/perspective.md).
//
//   The horizon is the CAMERA's eye level, not the sky line. On flat ground, anything at the camera's height stays
//   on the horizon at every distance: with the camera at a standing person's eye height, every standing head sits
//   on the horizon (Caillebotte, Paris Street; Rainy Day). An object keeps its ratio above/below the horizon as it
//   moves near or far (Rocky Kim), so its size follows from where it touches the ground:
//
//       height on canvas = (feet − horizon) × real height ÷ (camera height − ground height)
//
// Scene units: y 0 (top) … 1 (bottom), x 0 … aspect. Distances in metres.

import { clamp } from '../core/math.js';
import { col, mixOk } from '../core/color.js';

/** Declare the view: horizon (y of the camera's eye level on the canvas), eye (camera height above the main ground,
 *  metres: 1.6 standing, 1.1 seated, 0.4 a child or a dog, 30 a window up a building), fov (vertical field of view,
 *  degrees; 40 is a normal lens), cx (x of the centre of vision, default the middle), air (haze colour), visibility
 *  (metres at which haze reaches ~63 %). Returns the view and stores it as p.view. */
export function setView(p, { horizon, eye = 1.6, fov = 40, cx = null, air = '#b9c3d6', visibility = 150 } = {}) {
  if (horizon === undefined) throw new Error('setView: give the horizon (y of the eye level on the canvas)');
  const f = 0.5 / Math.tan((fov * Math.PI / 180) / 2);           // focal length in canvas heights
  p.view = { horizon, eye, fov, f, cx: cx ?? p.aspect / 2, air: col(air), visibility, figures: [] };
  return p.view;
}
const V = (p) => { if (!p.view) throw new Error('call setView(p, { horizon, eye }) first'); return p.view; };

/** Canvas units per metre at a ground point whose canvas y is `feet` (ground: its height above the main ground, m). */
export function scaleAt(p, feet, { ground = 0 } = {}) {
  const v = V(p), e = v.eye - ground, d = feet - v.horizon;
  if (e <= 0) throw new Error(`scaleAt: ground at ${ground} m is at or above the camera (${v.eye} m); this helper only handles ground below the eye`);
  if (d <= 0) throw new Error(`scaleAt: feet y ${feet.toFixed(3)} is on or above the horizon ${v.horizon} — a standing figure on ground below the eye must touch the ground below the horizon`);
  return d / e;
}
/** Distance (m) of a ground point from the camera. */
export function distanceAt(p, feet, { ground = 0 } = {}) { const v = V(p); return v.f * (v.eye - ground) / (feet - v.horizon); }

/** Canvas point of a ground spot given in metres: X across (+ right), D ahead, ground height g. */
export function groundPoint(p, { X = 0, D, ground = 0 }) {
  const v = V(p); return [v.cx + v.f * X / D, v.horizon + v.f * (v.eye - ground) / D];
}

/** Everything needed to put a person or an object standing at canvas (x, feet): height on the canvas, distance,
 *  layer depth for parallax (1 near … 0 at the horizon), haze 0…1. meters: its real height. Registers the figure
 *  for perspectiveGuides(). Pass the result to paintPerson / paintFigure (x, base, height, haze, air). */
export function stand(p, { x, feet, meters = 1.7, ground = 0, name = '' }) {
  const v = V(p), k = scaleAt(p, feet, { ground }), D = distanceAt(p, feet, { ground });
  const Dnear = v.f * v.eye / (1 - v.horizon);                     // distance seen at the bottom edge
  const r = { x, base: feet, height: k * meters, distance: D, depth: clamp(Dnear / D, 0.05, 1), haze: 1 - Math.exp(-D / v.visibility), air: v.air,
    eyeLine: (v.eye - ground) / meters, name };
  v.figures.push(r);
  return r;
}

/** Positions along a line on the ground that runs toward a vanishing point on the horizon: equal REAL spacing
 *  (metres) gives the right foreshortening. from: canvas point of the first item; vp: [x, horizon] (default the
 *  centre of vision); count; spacing (m); meters: item height. Returns stand() results (trees, posts, people). */
export function rowToward(p, { from, vp = null, count = 6, spacing = 5, meters = 1.7, ground = 0 }) {
  const v = V(p), [vx, vy] = vp ?? [v.cx, v.horizon];
  const D0 = distanceAt(p, from[1], { ground }), out = [];
  for (let i = 0; i < count; i++) {
    const D = D0 + i * spacing, y = v.horizon + v.f * (v.eye - ground) / D, t = (y - vy) / (from[1] - vy);
    out.push(stand(p, { x: vx + (from[0] - vx) * t, feet: y, meters, ground }));
    v.figures.pop();                                               // rows are not listed in the guides one by one
  }
  return out;
}

/** Atmospheric perspective for a colour at a given haze (0…1): toward the air colour, lower contrast and chroma. */
export function hazeColor(rgb, haze, air) { return haze > 0 ? mixOk(rgb, air, clamp(haze) * 0.85) : rgb; }

/** Debug overlay (render a still with it, never the final video): the horizon in red, a ground grid converging to the
 *  centre of vision with lines every 5 m, and for each figure placed with stand() its height bar and the camera's
 *  eye-level tick. Heads of standing people must touch the horizon when the camera is at their eye height. */
export function perspectiveGuides(p, { grid = true, step = 5 } = {}) {
  const v = V(p), L = p.layer('perspective-guides', { depth: 1 }), A = p.aspect, red = [0.9, 0.1, 0.1], cyan = [0.1, 0.8, 0.9];
  const line = (a, b, c, w = 0.0025, op = 0.9) => L.stroke({ brush: 'liner', p0: a, p2: b, width: w, color: c, opacity: op, thick: 0, soft: 0.05, fray: 0, dry: 0, load: 0, taper: [1, 1] });
  line([-0.05, v.horizon], [A + 0.05, v.horizon], red, 0.003);
  if (grid) {
    for (let X = -60; X <= 60; X += step) { const n = groundPoint(p, { X, D: v.f * v.eye / (1.05 - v.horizon) }); line(n, [v.cx, v.horizon], [0.95, 0.9, 0.2], 0.0012, 0.5); }
    for (let D = step; D < 400; D += step * (D < 50 ? 1 : 4)) { const y = v.horizon + v.f * v.eye / D; if (y > 1.05) continue; line([-0.05, y], [A + 0.05, y], [0.95, 0.9, 0.2], 0.001, 0.35); }
  }
  for (const s of v.figures) {
    line([s.x + 0.012, s.base], [s.x + 0.012, s.base - s.height], cyan, 0.002);
    const eyeY = s.base - s.height * Math.min(1.2, s.eyeLine); line([s.x - 0.02, eyeY], [s.x + 0.04, eyeY], red, 0.002);
  }
  return L;
}
