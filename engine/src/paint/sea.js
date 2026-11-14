// The sea after Aivazovsky (see references/sea.md). Waves are built the way his canvases show them, and placed with
// the perspective module so they shrink and crowd toward the horizon and roll toward the viewer:
//   1. a dark base: the sea is darker than the sky; a quiet band near the horizon;
//   2. per wave, back to front: the FRONT FACE dark at the trough, rising to a translucent green band under the crest
//      (light passing through thin water — strongest against the light); the BACK/TOP catching the sky's colour;
//   3. foam: a broken line along the crest, warm on the lit side, violet-grey in shadow; on big waves a curling
//      mass and spray that dissolves into the air; lace veins running down the faces;
//   4. the light path: glints on crests in a band under the sun or moon.
// Low chroma everywhere (his mean chroma measures 0.035–0.055); the only saturated note is the glow in the crests.

import { clamp, lerp, rng, hashStr, fbm } from '../core/math.js';
import { col, mixOk } from '../core/color.js';
import { hazeColor } from './perspective.js';
import { traceScene, shadeScene } from './sdf.js';

export const SEA_COLORS = {
  storm: { deep: '#0e2226', body: '#21424a', glow: '#5c9c86', top: '#7e95a0', foam: '#ebe6da', foamShade: '#8d8ba0', spray: '#cfc8c0', horizon: '#3b4d55' },
  sunset: { deep: '#1b1f33', body: '#38405a', glow: '#79a874', top: '#b39c96', foam: '#f3e2c6', foamShade: '#8f7f98', spray: '#e8cfb4', horizon: '#5a5266' },
  moon: { deep: '#0b1424', body: '#18283e', glow: '#3f6f78', top: '#5c6f86', foam: '#d9dfe6', foamShade: '#56627a', spray: '#a9b6c6', horizon: '#26334a' },
};

const V = (p) => { if (!p.view) throw new Error('paintSea: call setView(p, { horizon, eye }) first (eye = camera height above the sea, m)'); return p.view; };

/** The still water under the waves: horizontal strokes, darker near, a quiet band at the horizon, the light path under
 *  the sun/moon. Static. light: { x, color, width } (canvas x of the sun/moon and the path's half width). */
export function paintSeaBase(layer, { colors = SEA_COLORS.storm, light = null, x0 = -0.08, x1 = null, size = 0.03 } = {}) {
  const P = layer.p, v = V(P), A = P.aspect, C = Object.fromEntries(Object.entries(colors).map(([k, c]) => [k, col(c)]));
  const near = (y) => clamp((y - v.horizon) / (1 - v.horizon));
  const lc = light ? col(light.color ?? '#f6e2b8') : null;
  layer.scatter({ bounds: [x0, v.horizon - 0.002, x1 ?? A + 0.08, 1.08], spacing: size * 0.35, order: 'down', brush: 'flat', angle: 0, jitter: 0.04,
    width: (x, y) => size * (0.15 + 0.85 * near(y)), length: (x, y) => size * (1.5 + 5 * near(y)), thick: 0.15, pickup: 0.15,
    color: (x, y, r) => {
      const n = near(y); let c = mixOk(C.horizon, mixOk(C.body, C.deep, n), smoothN(n * 6));
      if (lc) { const d = Math.abs(x - light.x) / ((light.width ?? 0.12) * (0.4 + 1.6 * n)); c = mixOk(c, lc, 0.55 * Math.exp(-d * d) * (0.4 + 0.6 * r())); }
      return c;
    } });
  return layer;
}
const smoothN = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };

/** A living sea of waves that roll toward the viewer (dynamic layer). Needs setView(p, { horizon, eye }) with eye =
 *  camera height above the sea (m). Options:
 *   colors      SEA_COLORS.storm | .sunset | .moon | your own { deep, body, glow, top, foam, foamShade, spray, horizon }
 *   swell       wave height in metres (0.5 calm … 2 rough … 5 storm)        wavelength  metres between crests (≈ 6–10 × swell)
 *   storm       0…1 how much the crests break (foam, curls, spray)         speed       m/s toward the viewer
 *   light       { x, color, back } canvas x of the sun/moon; back 0…1 how much it shines THROUGH the waves (contre-jour)
 *   rows        number of wave rows from the horizon to the bottom (≈ 24)  near, far   distance range in metres
 *   x0, x1      canvas x range; mask(x, y) → 0…1 to keep waves out of a region (a pier, a rock)
 *   giant       { X, D, height, width } one dominant wave (metres) — the "ninth wave" — rolling at distance D
 *   depth, seed, from (seconds: fade the waves in), reveal: { t0, dur } paint the waves on during the reveal */
export function paintSea(P, o = {}) {
  const v = V(P), A = P.aspect, seed = o.seed ?? 7;
  const C = Object.fromEntries(Object.entries(o.colors ?? SEA_COLORS.storm).map(([k, c]) => [k, col(c)]));
  const swell = o.swell ?? 2, lambda = o.wavelength ?? swell * 7, storm = clamp(o.storm ?? 0.6), speed = o.speed ?? 2.2;
  const rows = o.rows ?? 24, Dfar = o.far ?? 400, Dnear = o.near ?? Math.max(1.5, v.f * v.eye / (1.1 - v.horizon));
  const light = o.light ? { x: o.light.x, color: col(o.light.color ?? '#f6e2b8'), back: o.light.back ?? 0.6 } : null;
  const x0 = o.x0 ?? -0.1, x1 = o.x1 ?? A + 0.1;
  const scr = (X, D, h = 0) => [v.cx + v.f * X / D, v.horizon + v.f * (v.eye - h) / D];      // a point h metres above the sea
  return P.dynamic(o.name ?? 'sea', { depth: o.depth ?? 0.6 }, (t, L) => {
    if (o.from !== undefined && t < o.from) return;
    const fadeIn = o.from !== undefined ? clamp((t - o.from) / 1.5) : 1;
    const S = (spec, sd) => {                                          // every stroke has a fixed seed: no flicker as waves move
      const rv = o.reveal ? { t0: o.reveal.t0 + (o.reveal.dur ?? 3) * ((sd * 0.618) % 1), dur: 0.3 } : {};
      L.stroke({ thick: 0.25, soft: 0.25, ...spec, ...rv, seed: sd % 997 + 1, opacity: (spec.opacity ?? 1) * fadeIn });
    };
    const travel = (t * speed) / (Dfar - Dnear);                        // rows advance toward the viewer
    const items = [];
    for (let i = 0; i < rows; i++) {
      const u = ((i / rows + travel * 3) % 1 + 1) % 1, rowId = i + rows * Math.floor(i / rows + travel * 3);   // u: 0 far … 1 near
      const D = Dfar * Math.pow(Dnear / Dfar, u), fade = smoothN(u * 8) * (1 - smoothN((u - 0.94) / 0.06));
      if (fade <= 0.01) continue;
      const r = rng(hashStr('row' + rowId) ^ seed), seg = lambda * (1.6 + 1.6 * r()), gap = lambda * (0.4 + 0.8 * r()), off = r() * (seg + gap);
      const Xmin = (x0 - v.cx) * D / v.f - seg, Xmax = (x1 - v.cx) * D / v.f + seg;
      for (let k = Math.floor((Xmin - off) / (seg + gap)); k * (seg + gap) + off < Xmax; k++) {
        const rs = rng(hashStr(`w${rowId}:${k}`) ^ seed), X = k * (seg + gap) + off + (rs() - 0.5) * gap, w = seg * (0.7 + 0.6 * rs());
        const h = swell * (0.45 + 0.8 * rs() * rs()) * (0.75 + 0.25 * Math.sin(t * 0.7 + rowId + k));
        items.push({ D, X, w, h, fade, id: rowId * 131 + k * 7 + seed, rs });
      }
    }
    if (o.giant) { const g = o.giant; items.push({ D: g.D, X: g.X, w: g.width ?? lambda * 4, h: g.height ?? swell * 3, fade: 1, id: 99991, rs: rng(seed * 17), giant: true }); }
    items.sort((a, b) => b.D - a.D);                                   // paint far to near
    for (const it of items) wave(it);

    function wave({ D, X, w, h, fade, id, rs, giant }) {
      const [cxL, yb] = scr(X - w / 2, D), [cxR] = scr(X + w / 2, D), crestY = scr(X, D, h)[1];
      const hpx = yb - crestY;                                         // wave height on the canvas
      if (cxR < x0 || cxL > x1 || hpx < 0.0008) return;
      const haze = 1 - Math.exp(-D / (v.visibility * 1.5)), hz = (c) => hazeColor(c, haze * 0.8, v.air);
      const mid = (cxL + cxR) / 2, half = (cxR - cxL) / 2;
      if (o.mask && o.mask(mid, yb) <= 0) return;
      const prof = (s) => Math.pow(Math.max(0, Math.sin(Math.PI * s)), 0.8);   // height along the crest
      const N = 6, ptsTop = Array.from({ length: N + 1 }, (_, j) => [lerp(cxL, cxR, j / N), yb - hpx * prof(j / N) * (0.85 + 0.3 * Math.sin(j / N * 9 + id))]);
      const trough = (s) => yb + hpx * (0.35 + 0.25 * prof(s)) * (giant ? 1.4 : 1);   // the face runs down into the trough in front
      const crest = (s) => yb - hpx * prof(s) * (0.85 + 0.3 * Math.sin(s * 9 + id));
      const back = light ? light.back * clamp(1 - Math.abs(mid - light.x) / (A * 0.6)) : 0.25;
      const near = clamp(v.f * v.eye / D / (1 - v.horizon));            // 0 far … 1 at the bottom edge
      const op = fade, sd = (j) => id * 17 + j;
      const lit = light ? Math.sign(light.x - mid) : -1;               // which flank faces the light
      // a lane = a stroke chain following the crest's arch at a fraction k between crest (0) and trough (1)
      const lane = (k, color, wk, extra, j, sA = 0.04, sB = 0.96) => {
        const yAt = (s) => lerp(crest(s), trough(s), k), n = 3;
        for (let q = 0; q < n; q++) {
          const a = lerp(sA, sB, q / n) - 0.03, b = lerp(sA, sB, (q + 1) / n) + 0.03, m = (a + b) / 2;
          const P0 = [lerp(cxL, cxR, a), yAt(a)], P2 = [lerp(cxL, cxR, b), yAt(b)], M = [lerp(cxL, cxR, m), yAt(m)];
          const band = Math.max(0.0012, (trough(m) - crest(m)) * wk);
          S({ brush: 'filbert', p0: P0, p1: [2 * M[0] - (P0[0] + P2[0]) / 2, 2 * M[1] - (P0[1] + P2[1]) / 2], p2: P2, width: band, color, opacity: op, soft: 0.5, thick: 0.12, pickup: 0.15, taper: [0.7, 0.7], ...extra }, sd(j * 5 + q));
        }
      };
      // the body, bottom up: deep trough → body → the translucent band under the crest (the "pyramid": brightest on the
      // flank where light passes through, smoothed into the body), then the top catching the sky
      const glowC = hz(mixOk(mixOk(C.body, C.glow, 0.45 + 0.5 * back), light ? light.color : C.glow, 0.12 * back));
      lane(0.82, hz(C.deep), 0.45, {}, 0);
      lane(0.6, hz(mixOk(C.deep, C.body, 0.6)), 0.4, {}, 1);
      lane(0.38, hz(C.body), 0.38, {}, 2);
      if (hpx > 0.003) {
        const sA = lit > 0 ? 0.35 : 0.12, sB = lit > 0 ? 0.88 : 0.65;
        lane(0.2, glowC, 0.32, { opacity: op * (0.45 + 0.5 * back), soft: 0.6 }, 3, sA, sB);
        lane(0.1, hz(mixOk(glowC, C.top, 0.3)), 0.18, { opacity: op * (0.4 + 0.4 * back), soft: 0.6 }, 4, sA + 0.08, sB - 0.08);
      }
      lane(0.0, hz(C.top), 0.12, { brush: 'round', opacity: op * 0.9, soft: 0.3, thick: 0.25 }, 5, 0.08, 0.92);
      // foam: a broken line of small marks hugging the crest, densest at the peak; more where it breaks
      const breakK = clamp(storm * (0.4 + h / (swell * 1.4)) * (giant ? 1.6 : 1));
      const nf = Math.round(4 + 18 * breakK * (0.3 + near));
      for (let j = 0; j < nf; j++) {
        const s = clamp(0.5 + (rs() - 0.5) * (0.4 + 0.5 * breakK) + (rs() - 0.5) * 0.15, 0.06, 0.94), x = lerp(cxL, cxR, s), y = crest(s) + (rs() - 0.2) * hpx * 0.12;
        const fw = Math.min(0.012, Math.max(0.0009, hpx * (0.05 + 0.08 * breakK) * (0.6 + 0.8 * rs())));
        const tang = Math.atan2(crest(Math.min(1, s + 0.02)) - crest(Math.max(0, s - 0.02)), (cxR - cxL) * 0.04);
        const shade = rs() < 0.4;
        S({ brush: 'round', x, y, angle: tang + (rs() - 0.5) * 0.5, length: fw * (1.5 + 1.5 * rs()), width: fw,
          color: hz(shade ? C.foamShade : mixOk(C.foam, light ? light.color : C.foam, 0.3 * (lit * (x - mid) > 0 ? 1 : 0.2))),
          opacity: op * (0.6 + 0.4 * rs()), thick: shade ? 0.25 : 0.7, soft: 0.3, fray: 0.4, shimmer: 0.06 }, sd(40 + j));
      }
      // breaking: the falling lip and spray that dissolves into the air — soft, low, the colour of the lit sky
      if (breakK > 0.5 && hpx > 0.01) {
        const sPk = 0.5 + 0.15 * lit, pk = [lerp(cxL, cxR, sPk), crest(sPk)], lip = Math.min(0.03, hpx * 0.18);
        S({ brush: 'filbert', p0: [pk[0] - lip * 2, pk[1] + lip * 0.3], p1: [pk[0], pk[1] - lip * 0.6], p2: [pk[0] + lip * 2.2 * -lit, pk[1] + lip * 1.4], width: lip,
          color: hz(mixOk(C.foam, C.foamShade, 0.25)), opacity: op * 0.85, thick: 0.6, soft: 0.3 }, sd(70));
        const ns = Math.round(6 + 10 * breakK);
        for (let j = 0; j < ns; j++) {
          const sx = pk[0] + (rs() - 0.5) * half * 0.7, sy = pk[1] - hpx * (0.05 + 0.5 * rs() * breakK), rr = Math.min(0.025, hpx * (0.08 + 0.15 * rs()));
          S({ brush: 'rag', x: sx, y: sy, angle: -0.7 - rs() * 0.6, length: rr * 1.8, width: rr, color: hz(mixOk(C.spray, light ? light.color : C.spray, 0.35 * back)),
            opacity: op * (0.12 + 0.18 * rs()), soft: 0.95, thick: 0.01, drift: [0.003 * (rs() - 0.3), -0.002] }, sd(80 + j));
        }
      }
      // lace: a web of foam veins drawn down and across the face
      const nl = Math.round((2 + 6 * breakK) * (0.3 + near));
      for (let j = 0; j < nl && hpx > 0.006; j++) {
        const s0 = 0.15 + 0.7 * rs(), s1 = clamp(s0 + (rs() - 0.5) * 0.35), k0 = 0.05 + 0.3 * rs(), k1 = k0 + 0.25 + 0.45 * rs();
        const p0 = [lerp(cxL, cxR, s0), lerp(crest(s0), trough(s0), k0)], p2 = [lerp(cxL, cxR, s1), lerp(crest(s1), trough(s1), Math.min(0.95, k1))];
        S({ brush: 'liner', p0, p1: [(p0[0] + p2[0]) / 2 + (rs() - 0.5) * half * 0.2, (p0[1] + p2[1]) / 2], p2, width: Math.max(0.0008, Math.min(0.003, hpx * 0.03)),
          color: hz(mixOk(C.foam, C.top, 0.35)), opacity: op * 0.5, taper: [0.8, 0.2], thick: 0.15, soft: 0.2, shimmer: 0.1 }, sd(100 + j));
      }
      // glints in the light path
      if (light) { const d = Math.abs(mid - light.x) / (0.06 + 0.25 * near);
        if (d < 1.5) { const g = Math.exp(-d * d); S({ brush: 'dab', x: mid + (rs() - 0.5) * half * 0.6, y: ptsTop[N / 2][1] + hpx * 0.1, angle: 0, length: Math.max(0.003, half * 0.5), width: Math.max(0.0012, hpx * 0.12),
          color: mixOk(light.color, [1, 1, 1], 0.3), opacity: op * 0.9 * g, thick: 0.9, shimmer: 0.6 }, sd(90)); } }
    }
  });
}

/** A wooden pier on piles, in perspective (static). Its centre line starts X0 m across and D0 m ahead and runs
 *  `length` m at `angle` radians (0 = straight away, negative = toward the left); deck `deck` m above the sea,
 *  `width` m wide, piles every `spacing` m. lightX: canvas x of the light (lit faces). Returns { at(along, across) →
 *  canvas point on the deck, ground: deck height } for placing people with stand(p, { …, ground: deck }). */
export function paintPier(layer, { X0 = 2, D0 = 3, length = 15, angle = -0.2, width = 3, deck = 2, spacing = 3, lightX = null,
  colors = { deck: '#5b4a3c', deckLit: '#a3866a', side: '#2b2320', pile: '#231c1a', pileLit: '#6d5747' } } = {}) {
  const P = layer.p, v = V(P), C = Object.fromEntries(Object.entries(colors).map(([k, c]) => [k, col(c)]));
  const ta = Math.tan(angle), scr = (X, D, h) => [v.cx + v.f * X / D, v.horizon + v.f * (v.eye - h) / D];
  const at = (a, s = 0) => { const D = D0 + a, X = X0 + a * ta + s * width / 2; return scr(X, D, deck); };
  const lx = lightX ?? v.cx - 0.5;
  // piles first (they stand in the sea), far to near, both edges
  for (let a = length; a >= 0; a -= spacing) for (const s of [-1, 1]) {
    const D = D0 + a, X = X0 + a * ta + s * width / 2, top = scr(X, D, deck), bot = scr(X, D, -0.6), wpx = Math.max(0.0015, v.f * 0.3 / D);
    layer.stroke({ brush: 'flat', p0: top, p2: bot, width: wpx, color: C.pile, thick: 0.3, soft: 0.15, taper: [1, 0.9] });
    layer.stroke({ brush: 'round', p0: [top[0] + Math.sign(lx - top[0]) * wpx * 0.3, top[1]], p2: [bot[0] + Math.sign(lx - top[0]) * wpx * 0.3, (top[1] + bot[1]) / 2], width: wpx * 0.3, color: C.pileLit, opacity: 0.7, thick: 0.5 });
  }
  // the side beam on the visible edge, then the deck surface in planks across, then the lit edge
  const side = X0 + width / 2 < 0 ? 1 : -1;                             // the edge facing the centre of vision shows its side
  const edge = (a) => at(a, side), edgeLow = (a) => { const D = D0 + a, X = X0 + a * ta + side * width / 2; return scr(X, D, deck - 0.35); };
  for (const k of [0.2, 0.5, 0.8]) for (let a = 0; a < length; a += 2) {   // the side beam: lanes along the edge, overlapping
    const pt = (aa) => { const e = edge(aa), l = edgeLow(aa); return [lerp(e[0], l[0], k), lerp(e[1], l[1], k)]; };
    layer.stroke({ brush: 'flat', p0: pt(a), p2: pt(Math.min(length, a + 2.6)), width: Math.max(0.0012, Math.abs(edgeLow(a + 1)[1] - edge(a + 1)[1]) * 0.45), color: mixOk(C.side, C.pile, k), thick: 0.2, taper: [1, 1] });
  }
  for (let a = 0; a < length; a += 0.5) {
    const l = at(a, -1), r = at(a, 1), w2 = Math.max(0.001, Math.abs(at(a + 0.55, 0)[1] - at(a, 0)[1]) * 1.3);
    const k = ((a * 7.3) % 1);
    layer.stroke({ brush: 'flat', p0: l, p2: r, width: w2, color: mixOk(C.deck, C.deckLit, 0.15 + 0.35 * k), thick: 0.35, taper: [1, 1] });
  }
  layer.stroke({ brush: 'round', p0: at(0, -side), p2: at(length, -side), width: Math.max(0.0015, v.f * 0.05 / (D0 + length / 2)), color: C.deckLit, thick: 0.7, taper: [1, 0.3] });
  return { at, ground: deck };
}

// ------------------------------------------------------------------ a physical sea to paint from
//
// The waves of a real sea are many sizes at once: long swells, waves riding on them, chop on those. Rather than
// inventing their shapes, model the surface and look at it from the camera, then paint the picture with paintFrom
// (its strokes follow the waves' contours). The surface is a sum of sharpened sine trains (crests peaked, troughs
// broad, like trochoids); each canvas point casts a ray from the camera and marches to the first hit, so big waves
// hide what is behind them and a giant wave can rise above the horizon. The shading is Aivazovsky's, not a
// renderer's: sky reflection by angle (Fresnel), the green glow through thin backlit crests, foam on steep crests
// and a lace of foam on the faces, the light path, haze with distance.


/** Returns (x, y) → colour of the sea seen from the view (canvas coordinates), or the sky's colour where the ray
 *  misses the water (that colour array has .sky = true: use `mask: (x, y) => (sea(x, y).sky ? 0 : 1)` to paint only
 *  the water and the solids). Give it to paintFrom as the source. Options:
 *   sky(x, y)   the sky's colour function (used for reflections and misses)       colors  SEA_COLORS.* or your own
 *   swell, wavelength (m), dir (radians the waves travel toward; 0 = toward the camera), chop 0…1, storm 0…1
 *   giant { X, D, height, width } one dominant wave · sun { x, y, color } canvas position of the light · time (s)
 *   objects: an sdf.js scene (boats, people) traced in the same world · objectLight: { dir, color } a key light for
 *   them if the sun is behind them (a painter lights the subject from the side even in a backlit sea) */
export function seaSource(P, o = {}) {
  const v = V(P), C = Object.fromEntries(Object.entries(o.colors ?? SEA_COLORS.storm).map(([k, c]) => [k, col(c)]));
  const swell = o.swell ?? 2, L0 = o.wavelength ?? swell * 8, storm = clamp(o.storm ?? 0.6), chop = clamp(o.chop ?? 0.6), time = o.time ?? 0;
  const r = rng((o.seed ?? 3) * 7919 + 11), dir0 = o.dir ?? 0;
  // wave trains: a few swells, then shorter waves at spread directions (a stormy, short-crested sea)
  const trains = [];
  for (let i = 0; i < 8; i++) {                                        // long-crested trains, close in direction: ridges, not peaks
    const L = L0 * Math.pow(0.62, i) * (0.85 + 0.3 * r()), a = dir0 + (r() - 0.5) * (0.3 + i * 0.14);
    const A = swell * 0.42 * Math.pow(L / L0, 0.8) * (i > 2 ? 0.5 + chop * 0.7 : 1);
    trains.push({ kx: Math.sin(a) * 2 * Math.PI / L, kz: -Math.cos(a) * 2 * Math.PI / L, A, ph: r() * 6.283, w: Math.sqrt(9.81 * 2 * Math.PI / L), sharp: i < 3 ? 1.7 + storm * 1.6 : 1.3 + storm * 0.4 });   // swells peaked (trochoid crests), chop rounder
  }
  const sumA = trains.reduce((s, t) => s + t.A, 0);
  const g = o.giant;
  const height = (X, Z) => {
    let h = 0;
    for (const t of trains) { const s = 0.5 + 0.5 * Math.sin(t.kx * X + t.kz * Z + t.ph + t.w * time); h += t.A * (2 * Math.pow(s, t.sharp) - 0.6); }
    if (g) { const dz = (Z - g.D) / (g.depth ?? 9), dx = (X - g.X) / ((g.width ?? 40) / 2); if (Math.abs(dz) < 3 && Math.abs(dx) < 1.6) {
      const along = Math.exp(-Math.pow(Math.abs(dx), 3) * 0.9), prof = dz < 0 ? Math.exp(-dz * dz * 4) : Math.exp(-dz * dz * 0.45);   // a long ridge, steep front toward us
      h += (g.height ?? swell * 3) * along * prof; } }
    return h;
  };
  const sun = o.sun ? { x: o.sun.x, y: o.sun.y, color: col(o.sun.color ?? '#f6e2b8') } : null;
  // light direction (from the sea toward the sun), from its canvas position
  const Ls = sun ? (() => { const dx = (sun.x - v.cx) / v.f, dy = (v.horizon - sun.y) / v.f, l = Math.hypot(dx, dy, 1); return [dx / l, dy / l, 1 / l]; })() : [0, 0.3, 1];
  const sky = o.sky ?? (() => C.top);
  const solids = o.solids ?? [];
  // ray (0, eye, 0) + t·(dx, −dy, 1) against a box rotated by ang about the vertical through (cx, cz)
  const rot = (n, a) => [n[0] * Math.cos(a) + n[2] * Math.sin(a), n[1], -n[0] * Math.sin(a) + n[2] * Math.cos(a)];
  const rayBox = (dx, dy, b) => {
    const ca = Math.cos(-b.ang), sa = Math.sin(-b.ang);
    const ox = -b.cx, oz = -b.cz, lx = ox * ca + oz * sa, lz = -ox * sa + oz * ca, ldx = dx * ca + 1 * sa, ldz = -dx * sa + 1 * ca;
    const o3 = [lx, v.eye, lz], d3 = [ldx, -dy, ldz], lo = [-b.hw, b.y0, -b.hl], hi = [b.hw, b.y1, b.hl];
    let t0 = 0.3, t1 = 1e9, ax = -1, sgn = 1;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d3[k]) < 1e-9) { if (o3[k] < lo[k] || o3[k] > hi[k]) return null; continue; }
      let ta = (lo[k] - o3[k]) / d3[k], tb = (hi[k] - o3[k]) / d3[k], s0 = -1; if (ta > tb) { [ta, tb] = [tb, ta]; s0 = 1; }
      if (ta > t0) { t0 = ta; ax = k; sgn = s0; } t1 = Math.min(t1, tb); if (t0 > t1) return null;
    }
    const n = [0, 0, 0]; if (ax >= 0) n[ax] = sgn; return { t: t0, n };
  };
  const lace = (X, Z) => { const n = fbm(X * 0.3, Z * 0.7, 41, 4), m = fbm(X * 0.9 + 7, Z * 1.6, 43, 3); return clamp(1 - Math.abs(n - 0.5) * 8) * 0.8 + clamp(1 - Math.abs(m - 0.5) * 12) * 0.5; };   // a web of veins
  return (x, y) => {
    const dx = (x - v.cx) / v.f, dy = (y - v.horizon) / v.f;          // ray direction: (dx, −dy, 1) per metre ahead
    // march from near to far: the first point where the ray goes below the surface
    let prevD = 0.5, prevGap = v.eye - height(dx * 0.5, 0.5) + dy * 0.5, hitD = -1;
    for (let k = 1; k <= 64; k++) {
      const D = 0.5 * Math.pow(1.13, k), gap = v.eye - dy * D - height(dx * D, D);
      if (gap <= 0) { let a = prevD, b = D; for (let q = 0; q < 6; q++) { const m = (a + b) / 2; if (v.eye - dy * m - height(dx * m, m) > 0) a = m; else b = m; } hitD = (a + b) / 2; break; }
      prevD = D; prevGap = gap; if (D > 2500) break;
    }
    // modelled objects (sdf.js: a boat, a person): traced in the same world; nearer than the water wins
    if (o.objects) {
      const hit = traceScene(o.objects, v, x, y);
      if (hit && (hitD < 0 || hit.p[2] < hitD)) {
        const c = shadeScene(o.objects, hit, { light: o.objectLight ?? { dir: Ls, color: sun ? sun.color : [1, 0.95, 0.85] }, sky: { up: sky(v.cx, v.horizon - 0.4), low: sky(v.cx, v.horizon - 0.02) }, bounce: mixOk(C.body, C.top, 0.5) });
        return hazeColor(c, 1 - Math.exp(-hit.p[2] / (v.visibility * 1.2)), mixOk(v.air, C.horizon, 0.5));
      }
    }
    // solids (a pier): the nearest box hit in front of the water wins
    if (solids.length) {
      let best = Infinity, sb = null, sn = null;
      for (const b of solids) { const hit = rayBox(dx, dy, b); if (hit && hit.t < best) { best = hit.t; sb = b; sn = hit.n; } }
      if (sb && (hitD < 0 || best < hitD)) {
        const X = dx * best, Y = v.eye - dy * best, Z = best, n3 = rot(sn, sb.ang);
        const lam = Math.max(0, n3[0] * Ls[0] + n3[1] * Ls[1] + n3[2] * Ls[2]), u = sb.grain ? (X * Math.cos(sb.ang) - Z * Math.sin(sb.ang)) : 0;
        let c = mixOk(col(sb.color), col(sb.lit ?? sb.color), clamp(lam * 1.4));
        if (sb.planks && sn[1] > 0.5) { const along = (X * Math.sin(-sb.ang) + Z * Math.cos(sb.ang)); if ((along * (1 / sb.planks)) % 1 < 0.12) c = mixOk(c, [0.08, 0.06, 0.06], 0.7); }
        c = mixOk(c, mixOk(C.top, col(sb.color), 0.5), 0.18 * clamp(Y / 4));   // wet wood reflects the sky a little
        return hazeColor(c, 1 - Math.exp(-best / (v.visibility * 1.2)), mixOk(v.air, C.horizon, 0.5));
      }
    }
    if (hitD < 0) { const c = sky(x, y).slice(); c.sky = true; return c; }   // a miss: the sky (flagged, for masks)
    const X = dx * hitD, Z = hitD, h = height(X, Z), e = Math.max(0.05, hitD * 0.004);
    const hx = (height(X + e, Z) - height(X - e, Z)) / (2 * e), hz = (height(X, Z + e) - height(X, Z - e)) / (2 * e);
    const nl = Math.hypot(hx, 1, hz), n = [-hx / nl, 1 / nl, -hz / nl];  // normal (y up)
    const V3 = (() => { const l = Math.hypot(dx, dy, 1); return [-dx / l, dy / l, -1 / l]; })();   // toward the camera
    const ndv = Math.max(0, n[0] * V3[0] + n[1] * V3[1] + n[2] * V3[2]);
    const fres = 0.03 + 0.97 * Math.pow(1 - ndv, 5);
    const R = [2 * ndv * n[0] - V3[0], 2 * ndv * n[1] - V3[1], 2 * ndv * n[2] - V3[2]];   // reflected ray
    const skyAtR = sky(v.cx + v.f * R[0] / Math.max(0.05, R[2]), v.horizon - v.f * Math.max(0, R[1]) / Math.max(0.05, R[2]));
    const crest = clamp((h / (sumA * 0.9 + (g && Math.abs(Z - g.D) < 25 && Math.abs(X - g.X) < (g.width ?? 40) ? (g.height ?? 0) * 0.8 : 0)) + 0.45) / 1.25);   // 0 trough … 1 crest
    let c = mixOk(mixOk(C.deep, C.body, Math.pow(crest, 1.4)), skyAtR, clamp(fres * 1.3));   // dark troughs, the sky on grazing faces
    // light through the thin crest: strongest against the light, on the upper face, where the wave is steep
    const back = Math.max(0, -(Ls[0] * V3[0] + Ls[1] * V3[1] + Ls[2] * V3[2])), steep = clamp(Math.hypot(hx, hz) * 2.2);
    c = mixOk(c, sun ? mixOk(C.glow, sun.color, 0.12) : C.glow, clamp(Math.pow(crest, 1.5) * (0.35 + 0.9 * back) * (0.4 + steep)) * 0.85);
    // foam: steep, high crests; and lace on the faces
    // foam: whitecaps on the steep tops of some crests (where the wind breaks them), lace webs on the faces below
    const capNoise = clamp((fbm(X * 0.07 + 3, Z * 0.05, 17, 3) - (0.55 - 0.25 * storm)) * 4);
    const cap = clamp((crest - 0.72) * 5) * clamp(steep * 2.5) * (0.3 + 0.9 * capNoise);
    const foamK = clamp(cap + lace(X, Z) * clamp((crest - 0.25) * 2.5) * clamp(1.25 - crest) * storm * 0.8);
    if (foamK > 0.02) { const lit = clamp(0.62 + (n[0] * Ls[0] + n[1] * Ls[1] + n[2] * Ls[2]) * 0.45 + 0.45 * back * crest);   // backlit foam glows
      c = mixOk(c, mixOk(C.foamShade, sun ? mixOk(C.foam, sun.color, 0.2) : C.foam, lit), clamp(foamK)); }
    // glitter of the sun on facets that mirror it
    if (sun) { const sp = Math.pow(Math.max(0, R[0] * Ls[0] + R[1] * Ls[1] + R[2] * Ls[2]), 180); c = mixOk(c, mixOk(sun.color, [1, 1, 1], 0.35), clamp(sp * 1.6)); }
    // atmosphere: far water takes the horizon's colour
    return hazeColor(c, 1 - Math.exp(-hitD / (v.visibility * 1.2)), mixOk(v.air, C.horizon, 0.5));
  };
}

/** A pier as solids for seaSource (so the waves and the pier share one light, one perspective and one brush):
 *  deck slab with planks, two edge beams, piles every `spacing` m. Same parameters as paintPier. Returns
 *  { solids, at(along, across) → canvas point on the deck, ground } — pass solids to seaSource({ solids }). */
export function pierSolids(P, { X0 = 2, D0 = 3, length = 15, angle = -0.2, width = 3, deck = 2, spacing = 3, colors = { deck: '#5b4a3c', deckLit: '#b8946e', beam: '#2e2420', pile: '#231c1a', pileLit: '#7a604c' } } = {}) {
  const v = V(P), ta = Math.tan(angle), solids = [];
  const box = (along, across, y0, y1, hw, hl, color, lit, extra = {}) => solids.push({ cx: X0 + along * ta + across, cz: D0 + along, y0, y1, hw, hl, ang: angle, color, lit, ...extra });
  box(length / 2, 0, deck - 0.12, deck, width / 2, length / 2, colors.deck, colors.deckLit, { planks: 0.45, grain: true });
  for (const s of [-1, 1]) box(length / 2, s * (width / 2 - 0.1), deck - 0.45, deck - 0.1, 0.12, length / 2, colors.beam, colors.pileLit);
  for (let a = 0.5; a <= length; a += spacing) for (const s of [-1, 1]) box(a, s * (width / 2 - 0.15), -1.5, deck - 0.1, 0.16, 0.16, colors.pile, colors.pileLit);
  const at = (a, s = 0) => { const D = D0 + a, X = X0 + a * ta + s * width / 2; return [v.cx + v.f * X / D, v.horizon + v.f * (v.eye - deck) / D]; };
  return { solids, at, ground: deck };
}
