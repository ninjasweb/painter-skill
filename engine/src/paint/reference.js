// Painting from a reference: the drawing and the values come from a source image, the painter's judgement
// decides how it is painted. Multi-scale, in the spirit of Hertzmann's "Painterly Rendering with Curved Brush
// Strokes of Multiple Sizes" (SIGGRAPH 1998), with three painter's rules added:
//   1. Block in VALUE MASSES first: the coarsest pass paints a simplified source whose lightness is quantised
//      to a few masses (squint, then commit to 3–5 values).
//   2. Strokes follow the FORM: direction comes from the smoothed structure tensor of the source (along
//      edges and contours); where the source has no clear direction a chosen `flow` takes over.
//   3. A DETAIL BUDGET: fine brushes, hard edges and thick paint are spent only near the focal point;
//      elsewhere the picture stays broad, with soft, lost edges.
// Strokes are placed only where the canvas still differs from the source, so each stroke has a reason.
// Deterministic: the same source, options and layer seed give the same strokes.

import { clamp, smoothstep } from '../core/math.js';
import { col, toOklab, fromOklab } from '../core/color.js';
import { hazeColor } from './perspective.js';

/** Load an image that sits next to the scene file (or any URL the page can fetch). Async: `await` it in the
 *  scene function (`export default async function …`). maxSize caps the longest side (pixels). */
export async function loadReference(url, { maxSize = 1600 } = {}) {
  const href = /^(https?:|data:|blob:|\/)/.test(url) ? url : '/scene/' + url;
  const res = await fetch(href);
  if (!res.ok) throw new Error(`loadReference: cannot load "${url}" (${res.status}). Put the image next to the scene file.`);
  const bmp0 = await createImageBitmap(await res.blob());
  const k = Math.min(1, maxSize / Math.max(bmp0.width, bmp0.height));
  const w = Math.max(1, Math.round(bmp0.width * k)), h = Math.max(1, Math.round(bmp0.height * k));
  const bmp = k < 1 ? await createImageBitmap(bmp0, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' }) : bmp0;
  const oc = new OffscreenCanvas(w, h), cx = oc.getContext('2d');
  cx.drawImage(bmp, 0, 0);
  return { kind: 'image', url, w, h, aspect: w / h, data: cx.getImageData(0, 0, w, h).data, _cache: new Map() };
}

// ---------------------------------------------------------------- image helpers (working resolution, OKLab)

function blur(src, W, H, sigma) {
  if (sigma < 0.3) return src.slice();
  const r = Math.ceil(sigma * 2.5), k = new Float32Array(2 * r + 1);
  let s = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) { const xx = x + i < 0 ? 0 : x + i >= W ? W - 1 : x + i; a += src[row + xx] * k[i + r]; }
      tmp[row + x] = a;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) { const yy = y + i < 0 ? 0 : y + i >= H ? H - 1 : y + i; a += tmp[yy * W + x] * k[i + r]; }
    out[y * W + x] = a;
  }
  return out;
}

/** 1-D k-means on a sample of values → sorted centres. */
function kmeans1(vals, k) {
  const s = Float32Array.from(vals).sort();
  let c = Array.from({ length: k }, (_, i) => s[Math.floor((i + 0.5) / k * (s.length - 1))]);
  for (let it = 0; it < 25; it++) {
    const sum = new Float64Array(k), n = new Float64Array(k);
    for (const v of s) { let b = 0, bd = 9; for (let j = 0; j < k; j++) { const d = Math.abs(v - c[j]); if (d < bd) { bd = d; b = j; } } sum[b] += v; n[b]++; }
    c = c.map((v, j) => (n[j] ? sum[j] / n[j] : v));
  }
  return c.sort((a, b) => a - b);
}

/** Share of the picture in each of 3 value masses (dark, mid, light), measured like tools/study.py:
 *  squint (blur), 3-means on lightness. Returns { masses: [d, m, l], centres: [..] }. */
function valueMasses(L, W, H, sigma) {
  const Lb = blur(L, W, H, sigma), sample = [];
  const step = Math.max(1, Math.floor(Lb.length / 20000));
  for (let i = 0; i < Lb.length; i += step) sample.push(Lb[i]);
  const c = kmeans1(sample, 3), n = [0, 0, 0];
  for (let i = 0; i < Lb.length; i++) { let b = 0, bd = 9; for (let j = 0; j < 3; j++) { const d = Math.abs(Lb[i] - c[j]); if (d < bd) { bd = d; b = j; } } n[b]++; }
  return { masses: n.map((v) => +(v / Lb.length).toFixed(3)), centres: c.map((v) => +v.toFixed(3)) };
}

const norm = (x, y, fx, fy) => { let l = Math.hypot(x, y); if (l < 1e-9) { x = fx; y = fy; l = Math.hypot(x, y) || 1; if (l === 1 && !fx && !fy) return [1, 0]; } return [x / l, y / l]; };

/** Bilinear sampler of an image in scene coordinates: 'cover' fit (with o.crop), or o.place = { u: [u0, v0, u1, v1] (source,
 *  0..1), to: [x0, y0, x1, y1] (scene) } to put a region of the photo anywhere. all = true returns all 4 channels 0..1. */
function imageSampler(img, A, o, all = false) {
  const { w, h, data } = img, pl = o.place;
  let map;
  if (pl) { const [u0, v0, u1, v1] = pl.u, [x0, y0, x1, y1] = pl.to;
    map = (x, y) => [(u0 + (x - x0) / (x1 - x0) * (u1 - u0)) * w, (v0 + (y - y0) / (y1 - y0) * (v1 - v0)) * h]; }
  else { const [cx, cy] = o.crop ?? [0.5, 0.5], k = img.aspect > A ? h : w / A;
    const ux = clamp(cx * w, A * k / 2, w - A * k / 2), uy = clamp(cy * h, k / 2, h - k / 2); map = (x, y) => [ux + (x - A / 2) * k, uy + (y - 0.5) * k]; }
  const nc = all ? 4 : 3;
  return (x, y) => {
    let [u, v] = map(x, y); const out = u < 0 || v < 0 || u > w - 1 || v > h - 1; u = clamp(u, 0, w - 1.001); v = clamp(v, 0, h - 1.001);
    const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0, c = new Array(nc);
    for (let ch = 0; ch < nc; ch++) {
      const p = (j, i) => data[(j * w + i) * 4 + ch];
      c[ch] = ((p(j0, i0) * (1 - fu) + p(j0, i0 + 1) * fu) * (1 - fv) + (p(j0 + 1, i0) * (1 - fu) + p(j0 + 1, i0 + 1) * fu) * fv) / 255;
    }
    if (all && out) c.fill(0);                              // outside the photo: no mask
    return c;
  };
}

/** Load a person prepared by tools/person.py: the photo, its masks (R hair, G skin, B clothes, A person) and the pose. */
export async function loadPerson(photo, { maxSize = 1600 } = {}) {
  const base = photo.replace(/\.(jpe?g|png|webp)$/i, '');
  const [src, mask, info] = await Promise.all([loadReference(photo, { maxSize }), loadReference(base + '.mask.png', { maxSize }),
    fetch(/^(https?:|\/)/.test(base) ? base + '.person.json' : '/scene/' + base + '.person.json').then((r) => { if (!r.ok) throw new Error(`loadPerson: run tools/person.py on ${photo} first (no ${base}.person.json)`); return r.json(); })]);
  return { src, mask, info };
}

/** Paint a real person from a photo into the scene, standing with the feet at (x, base) and `height` tall.
 *  The photo gives the body, the pose and the hair; the painter's rules decide how: big-to-small passes inside the
 *  silhouette (no spill), fine brushes and thick light on the head and hands, hair painted as locks that follow
 *  their growth with a few flyaways, and the colours pulled toward the scene's light (harmonize).
 *  person: loadPerson() result · harmonize: { light, shadow, amount } · hair: false to skip the hair pass ·
 *  detail: 0…1 · each(stroke, info) as in paintFrom (e.g. sway on the hair) · phase: name of the reveal phase
 *  ('figure'; false to keep the current one). Returns { rect, report }. */
export function paintPerson(L, person, { x, base, height, harmonize = null, hair = true, detail = 1, each, phase = 'figure', chroma = 0.9, flip = false, haze = 0, air = null, eyeLine = null } = {}) {
  const { src, mask, info } = person, [bx0, by0, bx1, by1] = info.bbox, feet = info.feet ?? [(bx0 + bx1) / 2, by1];
  const A = L.p.aspect; let place, to;
  if (x === undefined) {                                            // in place: the person where she is in the photo (cover fit)
    const k = src.aspect > A ? src.h : src.w / A; height = (by1 - by0) * src.h / k;
    const ux = clamp(0.5 * src.w, A * k / 2, src.w - A * k / 2), uy = clamp(0.5 * src.h, k / 2, src.h - k / 2), S2 = (u, v) => [(u * src.w - ux) / k + A / 2, (v * src.h - uy) / k + 0.5];
    to = [...S2(bx0, by0), ...S2(bx1, by1)];
  } else {
    const lm = info.landmarks, cut = by1 > 0.985 || (lm && Math.min(lm[29][3], lm[30][3], lm[31][3], lm[32][3]) < 0.4);
    if (cut) console.warn(`paintPerson: ${info.image} — the person is cut by the photo's frame (feet not visible); standing them on the ground will float them. Use a full-body photo, hide the cut behind foreground, or paint in place.`);
    const scale = height / ((by1 - by0) * src.h);                   // scene units per source pixel
    const u0 = bx0 - 0.04, u1 = bx1 + 0.04, v0 = by0 - 0.03, v1 = Math.max(by1, feet[1]) + 0.01;
    to = [x - (feet[0] - u0) * src.w * scale, base - (feet[1] - v0) * src.h * scale, x + (u1 - feet[0]) * src.w * scale, base + (v1 - feet[1]) * src.h * scale];
    place = flip ? { u: [u1, v0, u0, v1], to } : { u: [u0, v0, u1, v1], to };
  }
  if (eyeLine != null && info.eyeLine != null && Math.abs(eyeLine - info.eyeLine) > 0.2)   // viewpoint check (stand() gives eyeLine)
    console.warn(`paintPerson: ${info.image} was taken with the camera at ~${Math.round(info.eyeLine * 100)} % of the person's height; the scene's camera is at ${Math.round(eyeLine * 100)} %. `
      + 'The figure will look pasted in: pick a photo taken from the scene\'s eye level, or move the scene\'s camera.');
  const hc = harmonize && { l: col(harmonize.light ?? '#ffe6c4'), s: col(harmonize.shadow ?? '#7f95b8'), k: harmonize.amount ?? 0.25 };
  const airC = air ? col(air) : null;
  const color = (hc || (haze > 0 && airC)) ? (rgb, sx, sy, i) => {
    let c = rgb;
    if (hc) { const t = smoothstep(0.25, 0.85, i.L); c = c.map((v, k) => v + ((hc.s[k] * (1 - t) + hc.l[k] * t) * (0.4 + 0.6 * v) - v) * hc.k); }
    return haze > 0 && airC ? hazeColor(c, haze, airC) : c;            // atmospheric perspective by distance
  } : undefined;
  const vT = place ? place.u[1] : by0, vB = place ? place.u[3] : by1, H = height;
  const headY = info.landmarks ? to[1] + (info.landmarks[0][1] - vT) / (vB - vT) * (to[3] - to[1]) : to[1] + H * 0.08;
  const detailFn = (sx, sy) => clamp(0.55 + 0.45 * Math.exp(-(((sy - headY) / (H * 0.25)) ** 2))) * detail;   // head and shoulders carry the detail
  if (phase) L.p.phase(phase);                                      // the person is painted when it is called, in one phase (body, then hair)
  const common = { place, maskImage: mask, chroma, color, each, phases: false, vignette: true, flow: Math.PI / 2, ...(place ? {} : { bounds: [to[0] - 0.02, to[1] - 0.02, to[2] + 0.02, to[3] + 0.02] }) };
  const body = paintFrom(L, src, { ...common, maskFn: (m) => (m[3] >= 0.5 && m[0] < 0.5 ? 1 : 0), sizes: [H * 0.07, H * 0.035, H * 0.018, H * 0.009],
    detail: detailFn, threshold: 0.03, length: [6, 5, 4, 3], curve: 0.5, masses: 4, thick: 0.3 });
  let hairRep = null;
  if (hair && (info.hair_share ?? 1) > 0.01) {
    // hair: locks along the growth (strong structure → long curved strokes), dark masses first, thick selective lights, flyaways
    hairRep = paintFrom(L, src, { ...common, maskFn: (m) => (m[0] >= 0.45 ? 1 : 0), sizes: [H * 0.03, H * 0.016, H * 0.008, H * 0.004],
      detail: () => detail, threshold: 0.022, length: [12, 12, 11, 9], curve: 0.8, tolerance: 2.2, masses: 3, thick: 0.35, brushes: ['filbert', 'filbert', 'round', 'liner'],
      flyaways: Math.round(30 * detail) });
  }
  return { rect: to, report: { body, hair: hairRep } };
}

// ---------------------------------------------------------------- the painter

const LEVEL_NAMES = ['block-in', 'masses', 'form', 'detail', 'accents', 'accents-2'];
const LEVEL_BRUSH = ['filbert', 'filbert', 'filbert', 'round', 'round', 'round'];

/** Paint a layer from a reference.
 *  source: result of loadReference(), or a function (x, y) → colour in scene units (e.g. an engine-generated study).
 *  Options (sizes in scene units, i.e. fractions of the canvas height):
 *   sizes      brush widths coarse → fine                                      [0.04, 0.02, 0.01, 0.005]
 *   masses     value masses of the block-in (2–6; 0 = paint the block-in from the plain source)        4
 *   massLevels how many of the coarsest passes paint the massed source                                  1
 *   focal      [x, y] scene units, or 'auto' (strongest contrast × chroma, like study.py)           'auto'
 *   focalRadius reach of the detail budget around the focal point                                     0.32
 *   detail     (x, y) → 0..1 custom detail budget (replaces focal/focalRadius)
 *   threshold  OKLab difference a cell must show before a stroke is laid there (higher = fewer)       0.04
 *   length     max stroke length per level, in brush widths                                   [8, 7, 5, 3.5]
 *   tolerance  how far a stroke's colour may drift before it stops (hair locks: 2)                         1
 *   flow       stroke angle where the source has no clear direction: radians or (x, y) → radians        0
 *   curve      0 straight … 1 follows every turn of the form                                            0.55
 *   values     (L) → L remap of lightness before painting (push the key, compress the range)
 *   chroma     multiplier on source chroma (masters: low chroma, saved for the accent)                 0.9
 *   color      (rgb, x, y, info) → rgb last word on each stroke's colour
 *   brushes    brush name per level                                   filbert, filbert, filbert, round…
 *   thick      impasto on the lights near the focal point (thin paint elsewhere)                        0.5
 *   mask       (x, y) → 0..1 where this layer may start strokes (split a reference into depth layers)
 *   bounds     [x0, y0, x1, y1] painted area (default: the canvas plus 5 % overscan for camera moves)
 *   fit        'cover' (default, crop to fill) · crop [cx, cy] 0..1 centre of the crop in the source
 *   vignette   true → pre-compensate the finish pass's vignette so values match the source                true
 *   phases     true → one p.phase() per level (block-in, masses, form, detail…) for the paint-on reveal  true
 *   each       (strokeSpec, info) → edit a stroke (sway on grass, shimmer on water) or return false to drop it
 *  Returns a report: strokes per level, focal point, and the value masses of the source vs the painted model. */
export function paintFrom(L, source, o = {}) {
  const P = L.p, A = P.aspect, rand = L.rand;
  const sizes = o.sizes ?? [0.04, 0.02, 0.01, 0.005];
  const n = sizes.length, minSize = Math.min(...sizes);
  const ov = 0.05, pl = o.place, [bx0, by0, bx1, by1] = o.bounds ?? (pl ? [pl.to[0] - 0.01, pl.to[1] - 0.01, pl.to[2] + 0.01, pl.to[3] + 0.01] : [-ov, -ov, A + ov, 1 + ov]);
  // working raster: about 3 px across the finest brush, capped for speed
  const Hw = Math.round(clamp(3 / minSize * (by1 - by0), 240, 720)), sc = (by1 - by0) / Hw;
  const Ww = Math.max(8, Math.round((bx1 - bx0) / sc)), N = Ww * Hw;
  const toScene = (px, py) => [bx0 + (px + 0.5) * sc, by0 + (py + 0.5) * sc];

  // ---- source → OKLab raster
  const Ls = new Float32Array(N), as = new Float32Array(N), bs = new Float32Array(N);
  const cacheKey = `${Ww}x${Hw}:${bx0},${by0},${bx1},${by1}:${A}:${(o.crop ?? [0.5, 0.5]).join(',')}:${pl ? pl.u.join(',') + pl.to.join(',') : ''}`;
  const cached = source?._cache?.get(cacheKey);
  let skyMask = null;                                                // a source may flag misses (c.sky): that is a silhouette
  if (cached) { Ls.set(cached[0]); as.set(cached[1]); bs.set(cached[2]); skyMask = cached[3] ?? null; }
  else {
    let sample;
    if (typeof source === 'function') sample = (x, y) => col(source(x, y));
    else if (source && source.kind === 'image') sample = imageSampler(source, A, o);
    else throw new Error('paintFrom: source must be the result of loadReference() or a function (x, y) → colour');
    for (let py = 0; py < Hw; py++) for (let px = 0; px < Ww; px++) {
      const [x, y] = toScene(px, py), c = sample(x, y), lab = toOklab(c), i = py * Ww + px;
      Ls[i] = lab[0]; as[i] = lab[1]; bs[i] = lab[2];
      if (c.sky !== undefined) { if (!skyMask) skyMask = new Float32Array(N).fill(1); skyMask[i] = c.sky ? 0 : 1; }
    }
    source?._cache?.set(cacheKey, [Ls.slice(), as.slice(), bs.slice(), skyMask]);
  }
  // silhouette mask from an image channel (tools/person.py): strokes start inside, stop at the edge
  let M = o.silhouette === false ? null : skyMask;                 // flagged misses stop strokes like an image mask
  if (o.maskImage) {
    const ms = imageSampler(o.maskImage, A, o, true), ch = o.maskChannel ?? 3, f = o.maskFn;
    M = new Float32Array(N);
    for (let py = 0; py < Hw; py++) for (let px = 0; px < Ww; px++) { const [x, y] = toScene(px, py), m = ms(x, y); M[py * Ww + px] = f ? f(m) : m[ch]; }
  }
  const inM = (px, py) => !M || M[clamp(Math.round(py), 0, Hw - 1) * Ww + clamp(Math.round(px), 0, Ww - 1)] >= 0.5;
  const chromaK = o.chroma ?? 0.9;
  for (let i = 0; i < N; i++) { if (o.values) Ls[i] = clamp(o.values(Ls[i])); as[i] *= chromaK; bs[i] *= chromaK; }

  // ---- what a painter sees before the first stroke: value masses and the focal point
  const squint = 0.012 / sc;                              // ~1.2 % of the height, like study.py's blur
  const sourceMasses = valueMasses(Ls, Ww, Hw, squint);
  let focal = o.focal ?? 'auto';
  if (focal === 'auto' && !o.detail) {
    const Lb = blur(Ls, Ww, Hw, 1.5), f = new Float32Array(N);
    for (let y = 1; y < Hw - 1; y++) for (let x = 1; x < Ww - 1; x++) {
      const i = y * Ww + x, gx = Lb[i + 1] - Lb[i - 1], gy = Lb[i + Ww] - Lb[i - Ww];
      f[i] = Math.hypot(gx, gy) * (1 + 4 * Math.hypot(as[i], bs[i]));
    }
    const F = blur(f, Ww, Hw, 0.1 / sc); let best = 0, bi = 0;
    for (let y = 0; y < Hw; y++) for (let x = 0; x < Ww; x++) {
      const [sx, sy] = toScene(x, y); if (sx < 0.08 || sx > A - 0.08 || sy < 0.08 || sy > 0.92) continue;
      if (F[y * Ww + x] > best) { best = F[y * Ww + x]; bi = y * Ww + x; }
    }
    focal = toScene(bi % Ww, Math.floor(bi / Ww)).map((v) => +v.toFixed(3));
  }
  const fr = o.focalRadius ?? 0.32;
  const budget = o.detail ?? ((x, y) => (focal === 'auto' ? 1 : Math.exp(-((x - focal[0]) ** 2 + (y - focal[1]) ** 2) / (fr * fr))));
  const B = new Float32Array(N);
  for (let py = 0; py < Hw; py++) for (let px = 0; px < Ww; px++) { const [x, y] = toScene(px, py); B[py * Ww + px] = clamp(budget(x, y)); }

  // massed source for the block-in: lightness snapped to a few values, colour broadened
  const nm = o.masses ?? 4;
  let massed = null;
  if (nm >= 2) {
    const Lb = blur(Ls, Ww, Hw, squint), sample = [], st = Math.max(1, Math.floor(N / 20000));
    for (let i = 0; i < N; i += st) sample.push(Lb[i]);
    const c = kmeans1(sample, nm), Lm = new Float32Array(N);
    for (let i = 0; i < N; i++) { let b = 0, bd = 9; for (let j = 0; j < nm; j++) { const d = Math.abs(Lb[i] - c[j]); if (d < bd) { bd = d; b = j; } } Lm[i] = c[b]; }
    massed = [Lm, blur(as, Ww, Hw, squint * 2), blur(bs, Ww, Hw, squint * 2)];
  }

  // ---- the painted model: what the canvas looks like so far (OKLab), starting from the toned ground
  const g = toOklab(P.ground), cL = new Float32Array(N).fill(g[0]), ca = new Float32Array(N).fill(g[1]), cb = new Float32Array(N).fill(g[2]);
  const stamp = (pts, wpx, lab, alpha) => {           // disc stamps along a polyline, like a loaded brush
    const r = Math.max(0.7, wpx / 2), r2 = r * r;
    for (let s = 1; s < pts.length; s++) {
      const [x0, y0] = pts[s - 1], [x1, y1] = pts[s], len = Math.hypot(x1 - x0, y1 - y0), m = Math.max(1, Math.ceil(len / (r * 0.5)));
      for (let k = s === 1 ? 0 : 1; k <= m; k++) {
        const cx = x0 + (x1 - x0) * k / m, cy = y0 + (y1 - y0) * k / m;
        for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(Hw - 1, Math.ceil(cy + r)); y++)
          for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(Ww - 1, Math.ceil(cx + r)); x++) {
            if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
            const i = y * Ww + x; cL[i] += (lab[0] - cL[i]) * alpha; ca[i] += (lab[1] - ca[i]) * alpha; cb[i] += (lab[2] - cb[i]) * alpha;
          }
      }
    }
  };

  const T = o.threshold ?? 0.04, curve = clamp(o.curve ?? 0.55), lens = o.length ?? [8, 7, 5, 3.5];
  const brushes = o.brushes ?? LEVEL_BRUSH, phases = o.phases ?? true, thickK = o.thick ?? 0.5;
  const flowAt = (x, y) => (typeof o.flow === 'function' ? o.flow(x, y) : (o.flow ?? 0));
  const massLevels = o.massLevels ?? 1;
  // the finish pass darkens the corners (look.vignette); pre-compensate so the painting keeps the source's values
  const vig = (o.vignette ?? true) ? (P.look.vignette ?? 0) : 0;
  const unVig = (rgb, x, y) => {
    if (!vig) return rgb;
    const vg = Math.hypot(x / A - 0.5, y - 0.5) * 1.25, f = Math.max(0.35, 1 - vig * vg * vg);
    return rgb.map((v) => Math.min(1, v / f));
  };
  const report = { focal, strokes: [], source: sourceMasses };

  // ---- rub-in: a thin, broad wash of the masses so no bare canvas survives between the strokes
  if (o.rubIn ?? !M) {
    if (phases) P.phase('rub-in');
    const src = massed ?? [Ls, as, bs], w = sizes[0] * 2.2, wpx = w / sc;
    const R = [blur(src[0], Ww, Hw, wpx * 0.3), blur(src[1], Ww, Hw, wpx * 0.3), blur(src[2], Ww, Hw, wpx * 0.3)];
    const st = wpx * 0.32; let row = 0;
    for (let gy = 0; gy < Hw + st; gy += st) {
      const xs = [];
      for (let gx = -st; gx < Ww + st; gx += st) xs.push(gx + (rand() - 0.5) * st);
      if (row++ % 2) xs.reverse();                         // the hand sweeps back and forth
      for (const gx of xs) {
        const py = clamp(gy + (rand() - 0.5) * st, 0, Hw - 1), px = clamp(gx, 0, Ww - 1), i = Math.round(py) * Ww + Math.round(px);
        const [x, y] = toScene(px, py);
        if (o.mask) { const m = o.mask(x, y); if (m <= 0 || (m < 1 && rand() > m)) continue; }
        const lab = [R[0][i], R[1][i], R[2][i]], a = flowAt(x, y) + (rand() - 0.5) * 0.35;
        let rgb = fromOklab(lab); if (o.color) rgb = o.color(rgb, x, y, { x, y, level: -1, L: lab[0], budget: B[i] });
        rgb = unVig(rgb, x, y);
        L.stroke({ brush: 'wash', x, y, angle: a, length: w * (1.6 + rand()), width: w, color: rgb, opacity: 1, soft: 0.4, dry: 0, fray: 0.15, thick: 0.02 });
        const hx = Math.cos(a) * wpx, hy = Math.sin(a) * wpx;
        stamp([[px - hx, py - hy], [px + hx, py + hy]], wpx * 0.8, lab, 0.8);
      }
    }
  }

  for (let lv = 0; lv < n; lv++) {
    if (phases) P.phase(LEVEL_NAMES[lv] ?? `detail-${lv}`);
    const w = sizes[lv], wpx = w / sc;
    // reference for this brush: blurred in proportion to its size (a big brush cannot say small things)
    const useMass = massed && lv < massLevels, sig = Math.max(0.5, wpx * 0.35);
    const rL = blur(useMass ? massed[0] : Ls, Ww, Hw, sig), ra = blur(useMass ? massed[1] : as, Ww, Hw, sig), rb = blur(useMass ? massed[2] : bs, Ww, Hw, sig);
    // structure tensor → direction along the form, and how sure we are of it (coherence)
    const Lt = useMass ? blur(Ls, Ww, Hw, sig) : rL, Jxx = new Float32Array(N), Jxy = new Float32Array(N), Jyy = new Float32Array(N);
    for (let y = 1; y < Hw - 1; y++) for (let x = 1; x < Ww - 1; x++) {
      const i = y * Ww + x, gx = (Lt[i + 1] - Lt[i - 1]) / 2, gy = (Lt[i + Ww] - Lt[i - Ww]) / 2;
      Jxx[i] = gx * gx; Jxy[i] = gx * gy; Jyy[i] = gy * gy;
    }
    // a sharper copy of the source: textured areas take their colour from it, keeping leaf/gap contrast (broken colour)
    const ss = Math.max(0.5, sig * 0.35), sL = blur(Ls, Ww, Hw, ss), sa = blur(as, Ww, Hw, ss), sb = blur(bs, Ww, Hw, ss);
    const ts = Math.max(1.5, wpx * 0.9), Sxx = blur(Jxx, Ww, Hw, ts), Sxy = blur(Jxy, Ww, Hw, ts), Syy = blur(Jyy, Ww, Hw, ts);
    const dirAt = (px, py) => {
      const i = clamp(Math.round(py), 0, Hw - 1) * Ww + clamp(Math.round(px), 0, Ww - 1);
      const a = Sxx[i], b = Sxy[i], c = Syy[i], tr = a + c, det = Math.sqrt((a - c) ** 2 + 4 * b * b);
      const coh = tr > 1e-9 ? (det / tr) ** 2 : 0, ang = 0.5 * Math.atan2(2 * b, a - c) + Math.PI / 2;   // along the edge
      const [sx, sy] = toScene(px, py), fl = flowAt(sx, sy);
      const k = smoothstep(0.15, 0.6, coh) * smoothstep(1e-6, 4e-5, tr);   // weak or incoherent structure → flow
      let dx = Math.cos(ang), dy = Math.sin(ang); const fx = Math.cos(fl), fy = Math.sin(fl);
      if (dx * fx + dy * fy < 0) { dx = -dx; dy = -dy; }
      // texture: busy but directionless (foliage, gravel) → short, varied touches instead of long flow strokes
      const tex = (1 - smoothstep(0.15, 0.6, coh)) * smoothstep(4e-6, 6e-5, tr);
      return [dx * k + fx * (1 - k), dy * k + fy * (1 - k), tex];
    };

    // cells: every one at the block-in, then only where the canvas is still wrong and the budget allows
    const step = Math.max(1, wpx * 0.6), cells = [];
    for (let gy = 0; gy < Hw; gy += step) for (let gx = 0; gx < Ww; gx += step) cells.push([gx, gy, rand()]);
    if (lv === 0) { const band = step * 4; cells.sort((p, q) => { const a = Math.floor(p[1] / band), b = Math.floor(q[1] / band); return a !== b ? a - b : (a % 2 ? q[0] - p[0] : p[0] - q[0]) + (p[2] - q[2]) * step; }); }
    else cells.sort((p, q) => p[2] - q[2]);
    const need = lv < 2 ? 0 : 0.2 + 0.5 * (lv - 2) / Math.max(1, n - 3);   // fine passes only inside the budget
    let count = 0;
    for (const [gx, gy] of cells) {
      const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(Ww, Math.ceil(gx + step)), y1 = Math.min(Hw, Math.ceil(gy + step));
      let err = 0, best = -1, bx = x0, by = y0, cnt = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = y * Ww + x; if (M && M[i] < 0.5) continue;
        const d = Math.hypot(rL[i] - cL[i], ra[i] - ca[i], rb[i] - cb[i]);
        err += d; cnt++; if (d > best) { best = d; bx = x; by = y; }
      }
      if (!cnt) continue;
      if (lv > 0 && err / cnt < T * (1 - 0.5 * B[Math.floor((y0 + y1) / 2) * Ww + Math.floor((x0 + x1) / 2)])) continue;   // look harder at the focal point
      // start near the worst spot, not exactly on it: no grid shows through
      bx = clamp(Math.round(bx + (rand() - 0.5) * step * 0.6), 0, Ww - 1); by = clamp(Math.round(by + (rand() - 0.5) * step * 0.6), 0, Hw - 1);
      const bi = by * Ww + bx;
      // big silhouettes stay drawn everywhere: a strong value edge across one brush width earns the form pass
      let edge = 0;
      if (lv === 2) { const r = Math.max(1, Math.round(wpx)), xa = Math.max(0, bx - r), xb = Math.min(Ww - 1, bx + r), ya = Math.max(0, by - r), yb = Math.min(Hw - 1, by + r);
        edge = smoothstep(0.08, 0.2, Math.max(Math.abs(Ls[by * Ww + xb] - Ls[by * Ww + xa]), Math.abs(Ls[yb * Ww + bx] - Ls[ya * Ww + bx]))); }
      if (Math.max(B[bi], edge) + (rand() - 0.5) * 0.2 < need) continue;
      const [sx, sy] = toScene(bx, by);
      if (o.mask) { const m = o.mask(sx, sy); if (m <= 0 || (m < 1 && rand() > m)) continue; }
      if (M && !inM(bx, by)) continue;
      // grow a curved stroke along the form while the colour still belongs to it (Hertzmann)
      let c0 = [rL[bi], ra[bi], rb[bi]]; const pts = [[bx + 0.5, by + 0.5]], maxN = Math.max(2, Math.round((lens[lv] ?? 3) * 2 * (0.55 + 0.9 * rand())));
      let [dx, dy, tex] = dirAt(bx, by); if (rand() < 0.5) { dx = -dx; dy = -dy; }
      { const j = (rand() - 0.5) * (0.3 + 2.2 * tex), c = Math.cos(j), s = Math.sin(j); [dx, dy] = [dx * c - dy * s, dx * s + dy * c]; }
      const stop = Math.max(2, Math.round(maxN * (1 - 0.7 * tex)));
      const d0x = dx, d0y = dy;
      if (tex > 0.05) { const k = Math.min(1, tex * 1.4); c0 = [c0[0] + (sL[bi] - c0[0]) * k, c0[1] + (sa[bi] - c0[1]) * k, c0[2] + (sb[bi] - c0[2]) * k]; }
      for (let s = 1; s < stop; s++) {
        const [px, py] = pts[pts.length - 1], i = clamp(Math.round(py), 0, Hw - 1) * Ww + clamp(Math.round(px), 0, Ww - 1);
        if (s > 2) {
          const dRef = Math.hypot(rL[i] - c0[0], ra[i] - c0[1], rb[i] - c0[2]), dCan = Math.hypot(rL[i] - cL[i], ra[i] - ca[i], rb[i] - cb[i]);
          if (dRef > dCan * (o.tolerance ?? 1) || (lv > 0 && dRef > T * 2.2 * (o.tolerance ?? 1))) break;
        }
        let [nx, ny] = dirAt(px, py); if (nx * dx + ny * dy < 0) { nx = -nx; ny = -ny; }
        dx = dx * (1 - curve) + nx * curve; dy = dy * (1 - curve) + ny * curve; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
        if (dx * d0x + dy * d0y < 0.35) break;              // a brush does not turn back on itself: no swirls
        const qx = px + dx * wpx * 0.5, qy = py + dy * wpx * 0.5;
        if (qx < -wpx || qy < -wpx || qx > Ww + wpx || qy > Hw + wpx) break;
        if (M && !inM(qx, qy)) break;                       // the silhouette stops the brush
        pts.push([qx, qy]);
      }
      if (pts.length < 2) { pts.push([pts[0][0] + dx * wpx * 0.5, pts[0][1] + dy * wpx * 0.5]); }
      // one engine stroke = one quadratic through start, middle and end
      const P0 = toScene(pts[0][0] - 0.5, pts[0][1] - 0.5), P2 = toScene(pts[pts.length - 1][0] - 0.5, pts[pts.length - 1][1] - 0.5);
      const mid = pts[Math.floor((pts.length - 1) / 2)], Mid = toScene(mid[0] - 0.5, mid[1] - 0.5);
      const P1 = pts.length > 2 ? [2 * Mid[0] - (P0[0] + P2[0]) / 2, 2 * Mid[1] - (P0[1] + P2[1]) / 2] : [(P0[0] + P2[0]) / 2, (P0[1] + P2[1]) / 2];
      // the shader rounds and fades the ends INSIDE the stroke's length: extend each end by about half a width so the
      // painted mark covers what the model stamped (otherwise short detail strokes shrink to faint dots)
      { const ext = w * 0.55, u0 = norm(P1[0] - P0[0], P1[1] - P0[1], P2[0] - P0[0], P2[1] - P0[1]), u2 = norm(P2[0] - P1[0], P2[1] - P1[1], P2[0] - P0[0], P2[1] - P0[1]);
        P0[0] -= u0[0] * ext; P0[1] -= u0[1] * ext; P2[0] += u2[0] * ext; P2[1] += u2[1] * ext; }
      const end = pts[pts.length - 1], ei = clamp(Math.round(end[1]), 0, Hw - 1) * Ww + clamp(Math.round(end[0]), 0, Ww - 1);
      const b = B[bi], info = { x: sx, y: sy, level: lv, L: c0[0], budget: b };
      let rgb = fromOklab(c0), rgb2 = fromOklab([rL[ei], ra[ei], rb[ei]]);
      if (o.color) { rgb = o.color(rgb, sx, sy, info); rgb2 = o.color(rgb2, sx, sy, info); }
      rgb = unVig(rgb, sx, sy); rgb2 = unVig(rgb2, sx, sy);
      const broken = Math.hypot(rL[ei] - c0[0], ra[ei] - c0[1], rb[ei] - c0[2]) > 0.012;
      const spec = {
        brush: tex > 0.5 && lv > 0 ? 'dab' : (brushes[lv] ?? 'round'), p0: P0, p1: P1, p2: P2, width: w * (0.9 + 0.2 * rand()), color: rgb,
        ...(broken ? { color2: rgb2, mix2: 0.3 } : {}),
        opacity: lv < 2 ? 0.94 : 1, pickup: lv === 0 ? 0.12 : lv === 1 ? 0.05 : 0,
        // small brushes carry fresh, loaded paint: a detail that breaks up is no detail
        ...(lv >= 2 ? { dry: 0, fray: 0.08, load: 0.05, taper: [0.95, 0.75] } : {}),
        soft: (lv < 2 ? 0.16 : 0.1) + 0.16 * (1 - b) * (lv < 2 ? 1 : 0.4),   // lost edges away from the focal point
        thick: thickK * (0.2 + 0.8 * smoothstep(0.45, 0.9, c0[0])) * (0.08 + 0.92 * b * b) * (lv < 2 ? 0.45 : 1),   // thick lights at the focus, thin elsewhere
      };
      if (M && lv < n - 1) {                                // a big brush must not cross the silhouette: check both sides of the stroke
        const hw = spec.width / sc * 0.45, d2 = norm(P2[0] - P0[0], P2[1] - P0[1], 1, 0), nx2 = -d2[1], ny2 = d2[0];
        const mid = pts[Math.floor((pts.length - 1) / 2)];
        if (!inM(mid[0] + nx2 * hw, mid[1] + ny2 * hw) || !inM(mid[0] - nx2 * hw, mid[1] - ny2 * hw)) { spec.width *= 0.55; if (lv === 0) continue; }
      }
      if (o.each && o.each(spec, info) === false) continue;
      L.stroke(spec);
      stamp(pts, spec.width / sc, [c0[0], c0[1], c0[2]], 0.9);   // the model must cover what the brush covers, or edges spill
      count++;
    }
    report.strokes.push(count);
  }
  // flyaways: a few single hairs leaving the silhouette along the flow (hair is never a cut-out)
  if (M && o.flyaways) {
    if (phases) P.phase(LEVEL_NAMES[n - 1] ?? 'detail');
    const edge = [];
    for (let y = 1; y < Hw - 1; y += 2) for (let x = 1; x < Ww - 1; x += 2) { const i = y * Ww + x; if (M[i] >= 0.5 && (M[i - 1] < 0.5 || M[i + 1] < 0.5 || M[i - Ww] < 0.5 || M[i + Ww] < 0.5)) edge.push([x, y]); }
    for (let k = 0; k < o.flyaways && edge.length; k++) {
      const [x, y] = edge[Math.floor(rand() * edge.length)], i = y * Ww + x;
      let gx = M[i + 1] - M[i - 1], gy = M[i + Ww] - M[i - Ww]; const gl = Math.hypot(gx, gy) || 1; gx /= -gl; gy /= -gl;   // outward normal
      const ang = Math.atan2(gy, gx) + (rand() - 0.5) * 1.6, len = minSize * (3 + 6 * rand());
      const [sx, sy] = toScene(x, y), c = fromOklab([Ls[i] + 0.04, as[i], bs[i]]);
      L.stroke({ brush: 'liner', p0: [sx, sy], p1: [sx + Math.cos(ang) * len * 0.5 + (rand() - 0.5) * len * 0.3, sy + Math.sin(ang) * len * 0.5], p2: [sx + Math.cos(ang + 0.3 * (rand() - 0.5)) * len, sy + Math.sin(ang) * len],
        width: minSize * 0.35, color: unVig(c, sx, sy), opacity: 0.5 + 0.3 * rand(), taper: [0.8, 0.1], thick: 0.15, soft: 0.2, ...(o.each ? {} : {}) });
    }
  }
  report.model = valueMasses(cL, Ww, Hw, squint);
  report.total = report.strokes.reduce((a, b) => a + b, 0);
  P.reference = report;
  return report;
}
