// A Painting is an ordered list of layers; a layer is an ordered list of brush strokes.
// Nothing here touches the GPU: it only decides WHERE each stroke goes, WHAT colour is on the
// brush and HOW the brush behaves — the decisions a painter makes. The renderer does the rest.
//
// Scene units: x in [0, aspect], y in [0, 1], origin top-left, y grows downward.

import { rng, clamp, lerp, hashStr, TAU } from './math.js';
import { col, mixOk, toOklab, fromOklab } from './color.js';

export const STRIDE = 32; // floats per stroke (see renderer.js / stroke.wgsl for the layout)

/** Brush presets: how the tool leaves paint. Any field can be overridden per stroke.
 *  bristles: streak count across the width · soft: edge softness 0 hard … 1 airbrush ·
 *  fray: ragged ends/edges · dry: 0 loaded, flowing … 1 dry-brush broken by the canvas tooth ·
 *  thick: impasto height (catches light) · load: how fast paint runs out along the stroke ·
 *  taper: width factor at [start, end]. */
export const BRUSH = {
  flat:    { bristles: 26, soft: 0.14, fray: 0.30, dry: 0.12, thick: 0.45, load: 0.35, taper: [1, 0.9] },
  filbert: { bristles: 18, soft: 0.26, fray: 0.22, dry: 0.10, thick: 0.45, load: 0.30, taper: [0.8, 0.6] },
  round:   { bristles: 10, soft: 0.34, fray: 0.15, dry: 0.06, thick: 0.40, load: 0.25, taper: [0.7, 0.35] },
  liner:   { bristles: 3,  soft: 0.30, fray: 0.05, dry: 0.02, thick: 0.30, load: 0.15, taper: [0.9, 0.12] },
  fan:     { bristles: 9,  soft: 0.10, fray: 0.85, dry: 0.55, thick: 0.35, load: 0.50, taper: [1, 1] },
  dab:     { bristles: 7,  soft: 0.30, fray: 0.45, dry: 0.08, thick: 0.80, load: 0.10, taper: [0.9, 0.8] },
  knife:   { bristles: 2,  soft: 0.04, fray: 0.35, dry: 0.20, thick: 1.00, load: 0.20, taper: [1, 1] },
  rag:     { bristles: 5,  soft: 0.95, fray: 0.50, dry: 0.25, thick: 0.03, load: 0.10, taper: [1, 1] },
  wash:    { bristles: 14, soft: 0.70, fray: 0.30, dry: 0.05, thick: 0.05, load: 0.10, taper: [1, 1] },
  scumble: { bristles: 14, soft: 0.25, fray: 0.70, dry: 0.80, thick: 0.25, load: 0.60, taper: [1, 0.9] },
};

const val = (v, x, y, r) => (typeof v === 'function' ? v(x, y, r) : v);

class Layer {
  constructor(painting, name, opts) {
    this.p = painting; this.name = name;
    this.depth = opts.depth ?? 0.5;
    this.defaults = { ...opts }; delete this.defaults.depth;
    this.data = new Float32Array(STRIDE * 1024);
    this.count = 0;
    this.rand = rng(hashStr(name) ^ painting.seed);
    this.dynamic = null; // (t, layer) => void, rebuilt every frame when set
    this.version = 0;
  }

  /** One brush stroke.
   *  Geometry: either {x, y, angle, length, bend} (centre, direction in radians, bend = sideways bow as a
   *  fraction of length) or explicit bezier {p0, p1, p2}.
   *  Paint: color, color2 + mix2 (a second colour loaded on part of the bristles), opacity,
   *  pickup (0..1 wet-into-wet: how much of the colour already on the canvas the brush drags along).
   *  Tool: brush (a BRUSH preset or name) + overrides width, soft, dry, thick, bristles, fray, load, taper.
   *  Motion: sway (wind amplitude, scene units), swayRoot (0 = anchored at p0 like grass … 1 = whole stroke moves),
   *  drift [vx, vy] units/second, shimmer (0..1 flicker of opacity, e.g. light on water).
   *  Time: t0, dur — when the stroke is laid during a paint-on reveal (set by painting.timelapse()). */
  stroke(s) {
    const d = this.defaults;
    const b = typeof (s.brush ?? d.brush) === 'string' ? BRUSH[s.brush ?? d.brush] : (s.brush ?? d.brush ?? BRUSH.flat);
    if (!b) throw new Error(`unknown brush "${s.brush ?? d.brush}"`);
    let p0, p1, p2;
    if (s.p0) {
      p0 = s.p0; p2 = s.p2; p1 = s.p1 ?? [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
    } else {
      const a = s.angle ?? 0, L = s.length ?? 0.05, hx = Math.cos(a) * L / 2, hy = Math.sin(a) * L / 2;
      p0 = [s.x - hx, s.y - hy]; p2 = [s.x + hx, s.y + hy];
      const bend = (s.bend ?? 0) * L;
      p1 = [s.x - Math.sin(a) * bend, s.y + Math.cos(a) * bend];
    }
    const width = s.width ?? d.width ?? 0.02;
    let c = col(s.color ?? d.color ?? [0.5, 0.5, 0.5]);
    const pickup = s.pickup ?? d.pickup ?? 0;
    const mx = (p0[0] + p2[0]) / 2, my = (p0[1] + p2[1]) / 2;
    if (pickup > 0) c = mixOk(c, this.p.sample(mx, my), pickup);
    const c2 = s.color2 ? col(s.color2) : c;
    const taper = s.taper ?? d.taper ?? b.taper;
    const drift = s.drift ?? d.drift ?? [0, 0];
    const opacity = s.opacity ?? d.opacity ?? 1;
    const g = (k) => s[k] ?? d[k] ?? b[k];

    if ((this.count + 1) * STRIDE > this.data.length) {
      const n = new Float32Array(this.data.length * 2); n.set(this.data); this.data = n;
    }
    const o = this.count * STRIDE, f = this.data;
    f[o] = p0[0]; f[o + 1] = p0[1]; f[o + 2] = p1[0]; f[o + 3] = p1[1]; f[o + 4] = p2[0]; f[o + 5] = p2[1];
    f[o + 6] = width; f[o + 7] = taper[0]; f[o + 8] = taper[1];
    f[o + 9] = c[0]; f[o + 10] = c[1]; f[o + 11] = c[2]; f[o + 12] = opacity;
    f[o + 13] = c2[0]; f[o + 14] = c2[1]; f[o + 15] = c2[2]; f[o + 16] = s.mix2 ?? (s.color2 ? 0.4 : 0);
    f[o + 17] = g('bristles'); f[o + 18] = g('soft'); f[o + 19] = g('dry'); f[o + 20] = g('thick');
    f[o + 21] = s.seed ?? this.rand() * 1000; f[o + 22] = s.depth ?? this.depth;
    f[o + 23] = s.t0 ?? -1e6; f[o + 24] = s.dur ?? 0.2;
    f[o + 25] = s.sway ?? d.sway ?? 0; f[o + 26] = s.swayRoot ?? d.swayRoot ?? 1;
    f[o + 27] = drift[0]; f[o + 28] = drift[1]; f[o + 29] = s.shimmer ?? d.shimmer ?? 0;
    f[o + 30] = g('fray'); f[o + 31] = g('load');
    this.count++; this.version++;
    if (!this.dynamic) {
      this.p._order.push([this, this.count - 1, this.p._phase]);
      if (opacity > 0.02) this.p._splat(p0, p1, p2, width * (taper[0] + taper[1]) / 2, c, opacity * (1 - 0.45 * g('dry')) * (1 - 0.5 * g('soft')));
    }
    return this;
  }

  /** Cover an area with many strokes — the workhorse.
   *  bounds [x0,y0,x1,y1] · spacing (distance between stroke centres; smaller = denser) ·
   *  mask(x,y) → 0..1 chance that a stroke lands there (the SHAPE you are painting; soft masks give lost edges) ·
   *  every stroke property may be a constant or a function (x, y, rand) → value, so colour, direction
   *  and size can follow the form ·
   *  order: 'random' | 'down' | 'up' | 'right' | 'left' | 'sweep' (order the hand would travel; matters for
   *  overlap and for the paint-on reveal) · each(strokeSpec, x, y, rand) → optional last-minute edit or false to skip. */
  scatter(o) {
    const r = this.rand, P = this.p;
    const [x0, y0, x1, y1] = o.bounds ?? [-0.08, -0.08, P.aspect + 0.08, 1.08];
    const sp = o.spacing ?? 0.03;
    const pts = [];
    const nx = Math.max(1, Math.ceil((x1 - x0) / sp)), ny = Math.max(1, Math.ceil((y1 - y0) / sp));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + (i + r()) * sp, y = y0 + (j + r()) * sp;
      if (o.mask !== undefined && o.mask !== null) { const m = typeof o.mask === 'function' ? o.mask(x, y) : o.mask; if (m <= 0 || (m < 1 && r() > m)) continue; }
      pts.push([x, y, r()]);
    }
    const ord = o.order ?? 'random';
    if (ord === 'random') pts.sort((a, b) => a[2] - b[2]);
    else if (ord === 'down') pts.sort((a, b) => (a[1] - b[1]) + (a[2] - b[2]) * sp * 2);
    else if (ord === 'up') pts.sort((a, b) => (b[1] - a[1]) + (a[2] - b[2]) * sp * 2);
    else if (ord === 'right') pts.sort((a, b) => (a[0] - b[0]) + (a[2] - b[2]) * sp * 2);
    else if (ord === 'left') pts.sort((a, b) => (b[0] - a[0]) + (a[2] - b[2]) * sp * 2);
    else if (ord === 'sweep') { // boustrophedon bands, like a hand working across the canvas
      const band = sp * 5;
      pts.sort((a, b) => { const ba = Math.floor(a[1] / band), bb = Math.floor(b[1] / band); return ba !== bb ? ba - bb : (ba % 2 ? b[0] - a[0] : a[0] - b[0]); });
    }
    const keys = ['color', 'color2', 'mix2', 'width', 'length', 'angle', 'bend', 'opacity', 'pickup', 'soft', 'dry', 'thick',
      'bristles', 'fray', 'load', 'taper', 'sway', 'swayRoot', 'drift', 'shimmer', 'brush', 'depth'];
    for (const [x, y] of pts) {
      const s = { x, y };
      for (const k of keys) if (o[k] !== undefined) s[k] = val(o[k], x, y, r);
      if (o.jitter) { s.angle = (s.angle ?? 0) + (r() - 0.5) * 2 * o.jitter; }
      if (o.each && o.each(s, x, y, r) === false) continue;
      this.stroke(s);
    }
    return this;
  }

  /** Paint along a polyline as a chain of overlapping strokes (trunks, branches, horizons, rays, shorelines).
   *  pts: [[x,y],...] · width: constant or (t 0..1) → width · color: constant or (t, x, y) → colour ·
   *  step: stroke length along the path · other stroke props as usual. */
  path(pts, o = {}) {
    const r = this.rand;
    const seg = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(L); total += L; }
    if (total <= 0) return this;
    const at = (d) => {
      let i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const k = clamp(d / (seg[i] || 1));
      return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
    };
    const step = o.step ?? Math.max(total / 12, 0.01), n = Math.max(1, Math.round(total / step));
    const ov = o.overlap ?? 0.35;
    for (let i = 0; i < n; i++) {
      const ta = Math.max(0, (i - ov) / n), tb = Math.min(1, (i + 1 + ov) / n), tm = (ta + tb) / 2;
      const a = at(ta * total), b = at(tb * total), m = at(tm * total);
      const w = typeof o.width === 'function' ? o.width(tm) : (o.width ?? 0.01);
      const wob = (o.wobble ?? 0) * w;
      const s = { ...o, p0: a, p2: b, p1: [2 * m[0] - (a[0] + b[0]) / 2 + (r() - 0.5) * wob, 2 * m[1] - (a[1] + b[1]) / 2 + (r() - 0.5) * wob], width: w,
        color: typeof o.color === 'function' ? o.color(tm, m[0], m[1], r) : o.color };
      for (const k of ['opacity', 'thick', 'dry', 'sway']) if (typeof o[k] === 'function') s[k] = o[k](tm, m[0], m[1], r);
      delete s.step; delete s.overlap; delete s.wobble;
      this.stroke(s);
    }
    return this;
  }

  clear() { this.count = 0; this.version++; return this; }
}

export class Painting {
  /** aspect = width/height · seed · ground = colour of the toned canvas (imprimatura) ·
   *  look = { weave, relief, gloss, vignette, grain, lightAngle } renderer finish. */
  constructor({ aspect = 16 / 9, seed = 1, ground = '#c9b89a', look = {} } = {}) {
    this.aspect = aspect; this.seed = seed >>> 0; this.ground = col(ground);
    this.look = { weave: 0.16, relief: 0.5, gloss: 0.3, vignette: 0.25, grain: 0.035, lightAngle: -2.2, ...look };
    this.layers = []; this.rand = rng(this.seed);
    this.duration = 10; this.fps = 30;
    this.camera = () => ({ x: this.aspect / 2, y: 0.5, zoom: 1 });
    this.parallax = { far: 0.25, zoomFar: 0.55 };
    this.wind = () => ({ strength: 1, speed: 1 });
    this.grade = () => ({ exposure: 1, tint: [1, 1, 1] });
    this._order = []; this._phase = 'paint'; this._phases = ['paint'];
    // memory canvas: a small CPU copy of what has been painted so far, so the brush can react to it
    this.gw = 512; this.gh = Math.round(512 / aspect);
    this.mem = new Float32Array(this.gw * this.gh * 3);
    for (let i = 0; i < this.gw * this.gh; i++) { this.mem[i * 3] = this.ground[0]; this.mem[i * 3 + 1] = this.ground[1]; this.mem[i * 3 + 2] = this.ground[2]; }
  }

  /** Create a layer. depth: 0 = far (moves least with the camera) … 1 = nearest. Layers are painted in
   *  creation order, so create them back-to-front, the order a painter works. Extra opts are stroke defaults. */
  layer(name, opts = {}) { const l = new Layer(this, name, opts); this.layers.push(l); return l; }

  /** A layer rebuilt every frame by fn(t, layer) — for things that truly move (birds, a boat, falling leaves). */
  dynamic(name, opts, fn) { const l = this.layer(name, opts); l.dynamic = fn; return l; }

  /** Name the stage of the painting process that following strokes belong to (used by timelapse pacing). */
  phase(name) { this._phase = name; if (!this._phases.includes(name)) this._phases.push(name); return this; }

  /** Colour currently on the canvas at (x, y) — look before you paint: lets a stroke be "a little lighter than
   *  what is under it", pick up wet paint, or mirror the sky into water. */
  sample(x, y) {
    const i = clamp(Math.floor(x / this.aspect * this.gw), 0, this.gw - 1), j = clamp(Math.floor(y * this.gh), 0, this.gh - 1);
    const o = (j * this.gw + i) * 3; return [this.mem[o], this.mem[o + 1], this.mem[o + 2]];
  }
  /** Value (0..1) currently on the canvas at (x, y). */
  valueAt(x, y) { return toOklab(this.sample(x, y))[0]; }

  _splat(p0, p1, p2, w, c, a) {
    const L = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
    const rad = Math.max(w / 2, 0.5 / this.gh), n = Math.max(1, Math.ceil(L / rad));
    const sx = this.gw / this.aspect, sy = this.gh;
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
      const i0 = Math.max(0, Math.floor((x - rad) * sx)), i1 = Math.min(this.gw - 1, Math.ceil((x + rad) * sx));
      const j0 = Math.max(0, Math.floor((y - rad) * sy)), j1 = Math.min(this.gh - 1, Math.ceil((y + rad) * sy));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) / sx - x, dy = (j + 0.5) / sy - y;
        if (dx * dx + dy * dy > rad * rad) continue;
        const o = (j * this.gw + i) * 3, m = this.mem;
        m[o] += (c[0] - m[o]) * a; m[o + 1] += (c[1] - m[o + 1]) * a; m[o + 2] += (c[2] - m[o + 2]) * a;
      }
    }
  }

  /** Paint-on reveal: schedule every static stroke between `start` and `end` seconds in the order it was made,
   *  so the video shows the picture being painted. weights: relative time per phase, e.g. { sketch: 1, 'block-in': 3 }
   *  (default: proportional to stroke count^0.6 so detail phases do not take forever).
   *  Strokes are long enough on screen to be seen landing: each takes `strokeDur` seconds to be drawn. */
  timelapse({ start = 0, end = this.duration * 0.6, weights = {}, strokeDur = 0.25, easeIn = 0.0 } = {}) {
    const byPhase = new Map();
    for (const e of this._order) { if (!byPhase.has(e[2])) byPhase.set(e[2], []); byPhase.get(e[2]).push(e); }
    let tot = 0; const w = new Map();
    const given = Object.values(weights), avg = given.length ? given.reduce((a, b) => a + b, 0) / given.length : 0;
    const areaOf = (arr) => arr.reduce((a, [layer, idx]) => { const o = idx * STRIDE, f = layer.data; return a + Math.hypot(f[o + 4] - f[o], f[o + 5] - f[o + 1]) * f[o + 6]; }, 0);
    const areas = new Map([...byPhase].map(([ph, arr]) => [ph, areaOf(arr)])), areaTot = [...areas.values()].reduce((a, b) => a + b, 0) || 1;
    // time per phase follows the number of strokes AND how much canvas they cover: a full-canvas wash must not land in a blink
    for (const [ph, arr] of byPhase) { const v = weights[ph] ?? (given.length ? avg : Math.pow(arr.length, 0.6) * (1 + 3 * areas.get(ph) / areaTot)); w.set(ph, v); tot += v; }
    if (!Object.keys(weights).length) { // no phase flashes by: each gets at least ~1 s when the reveal allows it
      const min = Math.max(tot * 0.08, tot * Math.min(0.2, 1.0 / Math.max(end - start, 0.1))); tot = 0;
      for (const [ph, v] of w) { const nv = Math.max(v, min); w.set(ph, nv); tot += nv; }
    }
    this.reveal = { start, end, strokeDur };
    let t = start; this.phaseTimes = {};
    for (const [ph, arr] of byPhase) {
      const span = (end - start) * w.get(ph) / tot;
      this.phaseTimes[ph] = [t, t + span];
      arr.forEach(([layer, idx], i) => {
        let k = i / arr.length; if (easeIn) k = Math.pow(k, 1 - easeIn * 0.5);
        const o = idx * STRIDE;
        layer.data[o + 23] = t + k * Math.max(0, span - strokeDur * 0.5);
        layer.data[o + 24] = strokeDur * (0.6 + 0.8 * ((idx * 7919) % 100) / 100);
        layer.version++;
      });
      t += span;
    }
    return this;
  }

  /** Scene time at which the picture is complete (end of the reveal, or 0 when there is none). Read it lazily,
   *  inside p.camera / p.wind / p.grade, so motion is keyed to the living painting whatever the opening. */
  get livingStart() { return this.reveal ? this.reveal.end + this.reveal.strokeDur : 0; }
  /** Scene time of the last frame of the video (opening offset + duration). */
  get endTime() { return (this.timeOffset || 0) + this.duration; }

  /** Choose how the video opens. Called by the host after the scene is built (CLI flag --opening).
   *   'finished'   (default) the picture is complete on the first frame; the video is the living painting.
   *   'paint-on'   the whole painting process from the toned canvas, then the living painting.
   *   'final-pass' opens on the nearly finished picture and paints only the last phase (details, highlights),
   *                showing at least the last 1.5 s of brushwork.
   *  Implemented as a time offset (scene time = video time + offset), so a scene written for the paint-on reveal
   *  needs no change: its camera, wind, grade and dynamic layers run exactly as they would after the reveal. */
  open(mode = 'finished') {
    if (!Painting.OPENINGS.includes(mode)) throw new Error(`Unknown opening "${mode}". Use one of: ${Painting.OPENINGS.join(', ')}.`);
    const r = this.reveal; let off = 0;
    if (r && mode === 'finished') off = this.livingStart;
    else if (r && mode === 'final-pass') {
      const spans = Object.values(this.phaseTimes || {});
      const s = Math.min(spans.length ? spans[spans.length - 1][0] : r.start, r.end - 1.5);
      off = Math.max(0, s - 0.5);                         // a half-second look at the picture before the brush returns
    }
    this.opening = mode; this.timeOffset = off;
    return off;
  }

  /** Everything the renderer needs for time t (seconds). Pure function of t. */
  frame(t) {
    for (const l of this.layers) if (l.dynamic) { l.count = 0; l.rand = rng(hashStr(l.name) ^ this.seed); l.dynamic(t, l); l.version++; }
    const cam = { x: this.aspect / 2, y: 0.5, zoom: 1, ...this.camera(t) };
    return { t, cam, wind: { strength: 1, speed: 1, ...this.wind(t) }, grade: { exposure: 1, tint: [1, 1, 1], ...this.grade(t) }, layers: this.layers };
  }

  get strokeCount() { return this.layers.reduce((n, l) => n + l.count, 0); }
}

Painting.OPENINGS = ['finished', 'paint-on', 'final-pass'];

export { TAU };
