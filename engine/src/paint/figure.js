// Human figures, built the way figure painters build them (see references/figures.md):
//   1. gesture — one line of action through the body;
//   2. blobs  — head (small), ribcage (medium), pelvis (large), a waist between them, limbs in TWO sections
//               each (elbows and knees exist), overlapping at the joints;
//   3. form   — every mass is a cylinder/egg lit by ONE light: lit side, a warm terminator, a core shadow, and
//               cool reflected light at the shadow edge. Hard edge on the lit silhouette, soft toward the shadow;
//   4. skin   — low contrast, colour zones (ochre forehead, red middle, cool jaw), darker and redder at knees,
//               elbows, hands and feet; saturated dark occlusion in the crevices (armpit, under the jaw, crotch);
//   5. accents — face planes, hair, a few thick highlights.
// Proportions follow the classical canon (7.5 heads; Richer, Bridgman, Vanderpoel). Everything is in units of the
// figure's height H, measured from the soles up.

import { clamp, lerp, smoothstep } from '../core/math.js';
import { col, shift, mixOk, toLch, lch } from '../core/color.js';
import { hazeColor } from './perspective.js';

// ------------------------------------------------------------------ proportions and bodies

/** Body types. Widths are full widths in units of H. shoulders = distance between the shoulder joints. */
export const BODIES = {
  female:  { shoulders: 0.205, hips: 0.19, ribs: 0.155, waist: 0.12, pelvis: 0.215, muscle: 0.4, neck: 0.05, limb: 1 },
  male:    { shoulders: 0.235, hips: 0.17, ribs: 0.18, waist: 0.14, pelvis: 0.18, muscle: 0.6, neck: 0.058, limb: 1 },
  heroic:  { shoulders: 0.26, hips: 0.17, ribs: 0.2, waist: 0.145, pelvis: 0.18, muscle: 1, neck: 0.066, limb: 1.08 },
  child:   { shoulders: 0.2, hips: 0.17, ribs: 0.17, waist: 0.16, pelvis: 0.17, muscle: 0.2, neck: 0.05, limb: 0.9, heads: 5.5 },
};

// segment lengths (units of H) for a 7.5-head figure; the pelvis centre (hip joints) sits at 0.52 above the soles
const LEN = { thigh: 0.245, shin: 0.24, ankle: 0.035, foot: 0.13, upper: 0.185, fore: 0.155, hand: 0.1, spine: 0.3, neck: 0.05, head: 0.133 };

// ------------------------------------------------------------------ poses

/** Pose presets. Angles in radians. Limb angles are measured from straight down, positive towards screen-right;
 *  `el`/`knee` bend the lower segment relative to the upper one. lean tilts the torso, hipTilt/shTilt tilt the
 *  hip and shoulder lines (contrapposto: opposite signs). Side of each limb: `l` = screen-left, `r` = screen-right. */
export const POSES = {
  stand: () => ({ lean: 0, hipTilt: 0, shTilt: 0, head: 0,
    arms: { l: { sh: -0.1, el: 0.08 }, r: { sh: 0.1, el: -0.08 } }, legs: { l: { hip: 0.05, knee: 0 }, r: { hip: -0.05, knee: 0 } } }),
  /** weight on one leg ('l' or 'r'): that hip rises, the shoulders tilt the other way, the free knee relaxes. */
  contrapposto: (w = 'r') => { const s = w === 'r' ? 1 : -1; return { lean: -0.03 * s, hipTilt: -0.09 * s, shTilt: 0.06 * s, head: 0.06 * s,
    arms: { l: { sh: -0.08, el: 0.1 }, r: { sh: 0.08, el: -0.1 } },
    legs: { [w]: { hip: -0.07 * s, knee: 0 }, [w === 'r' ? 'l' : 'r']: { hip: -0.06 * s, knee: 0.18, footOut: 0.5 } } }; },
  /** hand on hip on one side (elbow out), the other arm relaxed; weight on the same side. */
  handOnHip: (side = 'l') => { const p = POSES.contrapposto(side), s = side === 'r' ? 1 : -1;
    p.arms[side] = { sh: 0.85 * s, el: -1.7 * s }; return p; },
  /** both arms raised and bent over the head (the stretch). */
  armsUp: () => ({ lean: 0, hipTilt: 0, shTilt: 0, head: 0.05,
    arms: { l: { sh: -2.55, el: -1.6 }, r: { sh: 2.55, el: 1.6 } }, legs: { l: { hip: 0.05, knee: 0 }, r: { hip: -0.05, knee: 0 } } }),
  /** one arm reaching up and out, looking at the hand. */
  reach: (side = 'r') => { const s = side === 'r' ? 1 : -1, p = POSES.contrapposto(side === 'r' ? 'l' : 'r');
    p.arms[side] = { sh: 2.45 * s, el: 0.15 * s }; p.head = 0.2 * s; p.lean = -0.04 * s; return p; },
  /** walk cycle, seen from the side (use turn ±1). phase in radians; 2π = two steps. From Muybridge's plates:
   *  thighs swing ±0.4, the swinging knee folds up to ~1.1, arms counter-swing, the body rises on the passing leg. */
  walk: (phase = 0) => { const s = Math.sin(phase), c = Math.cos(phase);
    const leg = (q) => ({ hip: 0.42 * Math.sin(q), knee: 0.08 + 0.9 * Math.max(0, Math.sin(q + 1.3)) ** 2 });
    return { lean: 0.04, hipTilt: 0, shTilt: 0, head: 0, bob: 0.012 * Math.abs(c),
      arms: { l: { sh: -0.32 * s, el: -0.25 - 0.15 * Math.max(0, -s) }, r: { sh: 0.32 * s, el: -0.25 - 0.15 * Math.max(0, s) } },
      legs: { l: leg(phase), r: leg(phase + Math.PI) } }; },
  /** sitting on the ground or a rock, seen from the side (turn ±1): thighs forward, shins down, hands on knees. */
  sit: () => ({ lean: 0.12, hipTilt: 0, shTilt: 0, head: 0.1, seated: true,
    arms: { l: { sh: 0.55, el: 0.5 }, r: { sh: 0.45, el: 0.55 } }, legs: { l: { hip: 1.45, knee: 1.5 }, r: { hip: 1.35, knee: 1.45 } } }),
};

const dir = (a) => [Math.sin(a), Math.cos(a)];
const add = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k];

/** Joint positions (scene units) for a pose. x, base: point between the feet on the ground · height H ·
 *  turn: 0 front … ±1 profile facing screen-right/left (the body narrows, limbs swing in the picture plane) ·
 *  facing for profile = sign(turn). Returns joints plus the body description used by the painter. */
export function skeleton({ x, base, height: H, pose = POSES.stand(), body = BODIES.female, turn = 0 }) {
  const B = typeof body === 'string' ? BODIES[body] : body, kx = 1 - 0.62 * Math.abs(turn), face = Math.sign(turn) || 1;
  const heads = B.heads ?? 7.5, hk = 7.5 / heads;                       // a child's head is bigger relative to H
  const lean = pose.lean ?? 0, up = [Math.sin(lean) * face, -Math.cos(lean)], P0 = [0, 0];
  const hipAx = [Math.cos(pose.hipTilt ?? 0), Math.sin(pose.hipTilt ?? 0)], shAx = [Math.cos(pose.shTilt ?? 0), Math.sin(pose.shTilt ?? 0)];
  const lim = B.limb ?? 1, J = { H, kx, turn, face, body: B };
  const legBend = Math.abs(turn) > 0.5 ? -face : 1;                    // in profile the knee folds backwards
  for (const [side, s] of [['l', -1], ['r', 1]]) {
    const L = pose.legs?.[side] ?? { hip: 0, knee: 0 }, hip = add(P0, hipAx, s * B.hips * 0.31 * kx * H);   // the hip joints sit inside the pelvis
    const a1 = (L.hip ?? 0) * (Math.abs(turn) > 0.5 ? face : 1), knee = add(hip, dir(a1), LEN.thigh * lim * H);
    const a2 = a1 + (L.knee ?? 0) * legBend, ankle = add(knee, dir(a2), LEN.shin * lim * H);
    const footDir = Math.abs(turn) > 0.5 ? [face * 0.97, 0.25] : [s * (0.25 + 0.3 * (L.footOut ?? 0)), 0.97];
    const toe = add(add(ankle, [0, 1], LEN.ankle * H), footDir, LEN.foot * H * (Math.abs(turn) > 0.5 ? 1 : 0.45));
    J[side + 'Hip'] = hip; J[side + 'Knee'] = knee; J[side + 'Ankle'] = ankle; J[side + 'Toe'] = toe; J[side + 'Heel'] = add(ankle, [0, 1], LEN.ankle * H);
  }
  const pit = add(P0, up, LEN.spine * H);
  J.pelvis = P0; J.waist = add(P0, up, 0.115 * H); J.chest = add(P0, up, 0.205 * H); J.pit = pit;
  for (const [side, s] of [['l', -1], ['r', 1]]) {
    const A = pose.arms?.[side] ?? { sh: 0, el: 0 }, sh = add(add(pit, shAx, s * B.shoulders / 2 * kx * H), [0, 1], 0.018 * H);
    const mir = Math.abs(turn) > 0.5 ? face : 1;                      // in profile, poses are written facing right
    const a1 = (A.sh ?? 0) * mir, elbow = add(sh, dir(a1), LEN.upper * lim * H), a2 = a1 + (A.el ?? 0) * mir, wrist = add(elbow, dir(a2), LEN.fore * lim * H);
    J[side + 'Sh'] = sh; J[side + 'Elbow'] = elbow; J[side + 'Wrist'] = wrist; J[side + 'Hand'] = add(wrist, dir(a2 + (A.wr ?? 0.08 * -s)), LEN.hand * H);
  }
  const hUp = [Math.sin(lean * face + (pose.head ?? 0)), -Math.cos(lean * face + (pose.head ?? 0))];
  J.neckTop = add(pit, hUp, LEN.neck * H * hk); J.chin = add(J.neckTop, hUp, 0.005 * H); J.crown = add(J.chin, hUp, LEN.head * H * hk); J.headUp = hUp; J.up = up;
  // place on the ground: the lowest sole (or the seat for a sitting pose) touches `base`
  const pts = Object.entries(J).filter(([k, v]) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && k !== 'headUp' && k !== 'up');
  const low = pose.seated ? Math.max(P0[1] + 0.05 * H, ...['lHeel', 'rHeel'].map((k) => J[k][1]) ) : Math.max(J.lHeel[1], J.rHeel[1], J.lToe[1], J.rToe[1]);
  const dy = base - low - (pose.bob ?? 0) * H, cx = (J.lHeel[0] + J.rHeel[0]) / 2, dx = x - (pose.seated ? P0[0] : cx);
  for (const [k, v] of pts) J[k] = [v[0] + dx, v[1] + dy];
  return J;
}

/** Joints from a REAL pose: the 33 landmarks that tools/person.py reads from a photo (MediaPipe), scaled so the
 *  person stands with the feet at (x, base) and is `height` tall. Pass the result as `joints` to paintFigure: the
 *  mannequin then takes the model's actual weight shift, twist and asymmetry instead of invented angles.
 *  info: the .person.json object · body: as in paintFigure · flip: mirror left/right. */
export function poseJoints(info, { x, base, height: H, body = BODIES.female, flip = false }) {
  const B = typeof body === 'string' ? BODIES[body] : body, lm = info.landmarks, [W, Hp] = info.size;
  if (!lm) throw new Error('poseJoints: no landmarks in ' + info.image);
  const top = info.bbox ? info.bbox[1] : Math.min(...lm.map((l) => l[1])), feet = info.feet ?? [lm[29][0], Math.max(lm[29][1], lm[30][1])];
  const sc = H / ((feet[1] - top) * Hp), P = (i) => [x + (flip ? -1 : 1) * (lm[i][0] - feet[0]) * W * sc, base + (lm[i][1] - feet[1]) * Hp * sc];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const unit = (a, b) => { const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...d) || 1; return [d[0] / l, d[1] / l]; };
  const J = { H, body: B };
  // screen-left / screen-right by position, not by the model's anatomical side
  for (const [a, b, name] of [[11, 12, 'Sh'], [13, 14, 'Elbow'], [15, 16, 'Wrist'], [23, 24, 'Hip'], [25, 26, 'Knee'], [27, 28, 'Ankle'], [29, 30, 'Heel'], [31, 32, 'Toe']]) {
    const pa = P(a), pb = P(b), [l, r] = pa[0] <= pb[0] ? [pa, pb] : [pb, pa]; J['l' + name] = l; J['r' + name] = r;
  }
  for (const [wi, pi, ii] of [[15, 17, 19], [16, 18, 20]]) {                   // the hand: wrist → past the knuckles
    const w = P(wi), hand = lerp2(w, mid(P(pi), P(ii)), 1.6), s = w[0] === J.lWrist[0] && w[1] === J.lWrist[1] ? 'l' : 'r';
    J[s + 'Hand'] = hand;
  }
  J.pelvis = mid(J.lHip, J.rHip); const shMid = mid(J.lSh, J.rSh);
  J.up = unit(J.pelvis, shMid); J.pit = lerp2(shMid, J.pelvis, -0.02); J.waist = lerp2(J.pelvis, shMid, 0.38); J.chest = lerp2(J.pelvis, shMid, 0.68);
  const head = mid(P(7), P(8)); J.headUp = unit(J.pit, head);
  J.chin = [head[0] - J.headUp[0] * 0.05 * H, head[1] - J.headUp[1] * 0.05 * H]; J.crown = [head[0] + J.headUp[0] * 0.075 * H, head[1] + J.headUp[1] * 0.075 * H];
  J.neckTop = lerp2(J.pit, J.chin, 0.85);
  const kx = clamp(Math.hypot(J.rSh[0] - J.lSh[0], J.rSh[1] - J.lSh[1]) / (B.shoulders * H), 0.38, 1);
  J.kx = kx; J.turn = (1 - kx) / 0.62 * (lm[0][0] < (lm[11][0] + lm[12][0]) / 2 ? -1 : 1) * (flip ? -1 : 1); J.face = Math.sign(J.turn) || 1;
  return J;
}

// ------------------------------------------------------------------ palettes

/** Skin palette from one mid colour, following the painters' rules: shadows darker AND redder (never just grey),
 *  a saturated warm band where light turns to shadow (subsurface scattering), cool reflected light from the sky in
 *  the shadows, low overall contrast. */
export function skinPalette(mid, { ambient = '#8fa3c2', light = '#fff1dc' } = {}) {
  const m = col(mid), [L, C, h] = toLch(m), amb = col(ambient), lt = col(light);
  return {
    light: mixOk(lch(Math.min(0.92, L + 0.13), C * 0.9, h + 4), lt, 0.25),
    mid: m,
    terminator: lch(L - 0.04, Math.min(0.2, C * 1.6 + 0.03), h - 12),          // warm, saturated band (subsurface)
    shadow: lch(L - 0.2, C * 1.1, h - 10),                                      // darker → redder
    reflected: mixOk(lch(L - 0.14, C * 0.8, h - 6), amb, 0.35),                // sky bounce in the shadow
    occlusion: lch(Math.max(0.12, L - 0.34), Math.min(0.2, C * 1.4 + 0.02), h - 18), // crevices: dark and saturated
    blush: lch(L - 0.03, C * 1.5 + 0.03, h - 20),                               // red zone: cheeks, nose, ears, knees, knuckles
    cool: mixOk(m, amb, 0.25),                                                  // jaw / stubble zone
    highlight: mixOk(lch(Math.min(0.96, L + 0.22), C * 0.5, h + 8), lt, 0.5),
  };
}

/** Cloth palette from one colour: same light logic, no subsurface, crisper folds. */
export function clothPalette(mid, { ambient = '#8fa3c2', light = '#fff1dc' } = {}) {
  const m = col(mid), [L, C, h] = toLch(m);
  return { light: mixOk(lch(Math.min(0.95, L + 0.14), C * 0.9, h), col(light), 0.2), mid: m, terminator: lch(L - 0.05, C * 1.05, h),
    shadow: lch(Math.max(0.08, L - 0.2), C * 0.95, h - 4), reflected: mixOk(lch(L - 0.14, C * 0.8, h), col(ambient), 0.3),
    occlusion: lch(Math.max(0.06, L - 0.32), C, h), highlight: mixOk(lch(Math.min(0.97, L + 0.2), C * 0.5, h), col(light), 0.4) };
}

// ------------------------------------------------------------------ the painter

const bump = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));

/** Paint a human figure with brush strokes, in the order of the construction.
 *  layer: a static layer, or the layer inside p.dynamic (call it every frame with a moving pose).
 *  x, base: ground point between the feet · height · pose (POSES.*) · body ('female' | 'male' | 'heroic' | 'child' | object) ·
 *  turn: 0 front … ±1 profile · back: true → seen from behind (no face; spine and shoulder blades) ·
 *  skin: mid skin colour · outfit: { top, sleeves: 0…1 of the arm covered, bottom, legs: 0…1 of the leg covered
 *  (0.3 shorts, 1 trousers), dress: true (a skirt from the waist to `legs`), shoes } ·
 *  hair: { color, style: 'short' | 'long' | 'bun' | 'none', length } · light: [lx, ly] direction TO the light in the
 *  picture (default [-0.8, -0.6]: upper left) · ambient: sky colour bounced into the shadows · detail: 0 a distant
 *  figure in a few masses … 1 a near figure with face planes · stages: how many construction stages to paint
 *  (1 gesture, 2 + blobs, 3 + form, 4 + skin, 5 + accents; default 5 — lower values make a construction chart) ·
 *  t0, dur: paint the figure on between t0 and t0 + dur (reveal; omit = always visible) · wind: 0…1 moves hair/cloth ·
 *  time: seconds (for wind) · opacity. */
export function paintFigure(L, o) {
  const J = o.joints ?? skeleton(o), H = J.H ?? o.height, B = J.body, kx = J.kx, back = !!o.back;
  const lx0 = o.light?.[0] ?? -0.8, ly0 = o.light?.[1] ?? -0.6, ln = Math.hypot(lx0, ly0, 0.55), Lt = [lx0 / ln, ly0 / ln, 0.55 / ln];
  const SK = skinPalette(o.skin ?? '#c08a6a', { ambient: o.ambient, light: o.lightColor });
  const fit = o.outfit ?? {}, CL = (c) => (c ? clothPalette(c, { ambient: o.ambient, light: o.lightColor }) : null);
  const top = CL(fit.top), bottom = CL(fit.bottom), shoes = fit.shoes === false ? null : CL(fit.shoes ?? '#3a2f2a');
  if (o.haze > 0 && o.air) for (const pal of [SK, top, bottom, shoes]) if (pal) for (const k in pal) pal[k] = hazeColor(pal[k], o.haze, col(o.air));   // atmospheric perspective
  const detail = clamp(o.detail ?? 0.6), stages = o.stages ?? 5, opacity = o.opacity ?? 1, wind = o.wind ?? 0, time = o.time ?? 0;
  const muscle = B.muscle ?? 0.5;
  const hazePal = (pal) => { if (o.haze > 0 && o.air) for (const k in pal) pal[k] = hazeColor(pal[k], o.haze, col(o.air)); return pal; };
  let n = 0; const total = 60 + 120 * detail;                       // rough stroke budget for reveal timing
  const S = (s) => { const k = n++; L.stroke({ opacity, seed: 7 + k, ...(o.t0 !== undefined ? { t0: o.t0 + (o.dur ?? 3) * Math.min(1, k / total), dur: 0.22 } : {}), ...s, opacity: (s.opacity ?? 1) * opacity }); };

  // ---- a mass = a blob from A to B with a width profile w(t) (the "sweet potato"): one rounded base stroke that
  //      overlaps the next mass at the joint, then a few form strokes — shadow side, warm terminator, cool reflected
  //      light at the shadow edge, light side — each following the axis. Hard silhouette, soft inside.
  const RT = (k) => (o.t0 !== undefined ? { t0: o.t0 + (o.dur ?? 3) * k, dur: 0.25 } : {});
  const mass = (A, Bp, wf, pal, { round = true, occl = null, light = 1 } = {}) => {
    const ax = [Bp[0] - A[0], Bp[1] - A[1]], len = Math.hypot(...ax) || 1e-6, u = [ax[0] / len, ax[1] / len], pv = [-u[1], u[0]];
    const w0 = wf(0), wm = Math.max(wf(0.35), wf(0.5), wf(0.65)), w1 = wf(1), wmax = Math.max(w0, wm, w1, 1e-6);
    const e0 = round ? w0 * 0.42 : w0 * 0.1, e1 = round ? w1 * 0.42 : w1 * 0.1;            // overlap past the joints
    const P0 = [A[0] - u[0] * e0, A[1] - u[1] * e0], P2 = [Bp[0] + u[0] * e1, Bp[1] + u[1] * e1];
    const bulge = (wm - (w0 + w1) / 2) * 0;                                                  // (silhouette stays straight; width carries the bulge)
    const lxy = Math.hypot(Lt[0], Lt[1]) || 1, side = (pv[0] * Lt[0] + pv[1] * Lt[1]) / lxy;  // +1: the +pv side faces the light
    const sg = side >= 0 ? 1 : -1, str = 0.45 + 0.55 * Math.abs(side);
    const lane = (off, wk, color, extra = {}) => {                                            // a stroke parallel to the axis, offset across the form
      const q0 = [P0[0] + pv[0] * off * w0, P0[1] + pv[1] * off * w0], q2 = [P2[0] + pv[0] * off * w1, P2[1] + pv[1] * off * w1];
      const qm = [(A[0] + Bp[0]) / 2 + pv[0] * off * wm, (A[1] + Bp[1]) / 2 + pv[1] * off * wm];
      const q1 = [2 * qm[0] - (q0[0] + q2[0]) / 2, 2 * qm[1] - (q0[1] + q2[1]) / 2];
      const wd = wmax * wk * 1.16;                                    // a round brush covers less than its nominal width (soft edge, fray)
      L.stroke({ brush: 'round', p0: q0, p1: q1, p2: q2, width: wd, taper: [clamp(w0 / wmax, 0.2, 1), clamp(w1 / wmax, 0.2, 1)], color, opacity, fray: 0.1, dry: 0.03, load: 0.05,
        seed: 7 + n++, ...extra, opacity: (extra.opacity ?? 1) * opacity });
    };
    // stage 2: the blob, in the half-tone (thin paint)
    if (stages >= 2) lane(0, 1, stages >= 3 ? pal.mid : mixOk(pal.mid, pal.shadow, 0.3), { soft: 0.1, thick: 0.12, ...RT(0.1 + 0.25 * Math.min(1, n / total)) });
    if (stages < 3) return;
    // stage 3: form — the shadow side first (thin), then the light side (thicker), as painters do
    const k3 = 0.35 + 0.45 * Math.min(1, n / total);
    lane(-sg * 0.24, 0.52, pal.shadow, { soft: 0.6, thick: 0.08, opacity: 0.8 * str, ...RT(k3) });
    lane(-sg * 0.40, 0.14, pal.reflected, { soft: 0.6, thick: 0.05, opacity: 0.4 * str, ...RT(k3) });
    lane(-sg * 0.02, 0.2, pal.terminator, { soft: 0.75, thick: 0.06, opacity: 0.32 * str, ...RT(k3) });
    lane(sg * 0.2, 0.46, pal.light, { soft: 0.6, thick: 0.25 + 0.3 * light, opacity: (0.4 + 0.35 * str) * light, ...RT(k3 + 0.02) });
    if (stages >= 4 && occl) for (const t of occl) {
      const p = [A[0] + ax[0] * t, A[1] + ax[1] * t];
      S({ brush: 'round', x: p[0], y: p[1], angle: Math.atan2(pv[1], pv[0]), length: wf(t) * 0.9, width: H * 0.012, color: pal.occlusion ?? pal.shadow, opacity: 0.6, soft: 0.55, thick: 0.04 });
    }
  };
  const skinOr = (cloth, k = 1) => (cloth && k > 0 ? cloth : SK);
  const sleeves = fit.sleeves ?? 0.5, legCover = fit.legs ?? 0.3;

  // ---- stage 1: gesture — the line of action from the head through the spine to the weight foot
  if (stages >= 1) {
    const wf = J.lHeel[1] > J.rHeel[1] ? 'l' : 'r', pts = [J.crown, J.pit, J.waist, J.pelvis, J[wf + 'Knee'], J[wf + 'Heel']];
    L.path(pts, { brush: 'liner', width: H * 0.008, color: mixOk(SK.shadow, [0.2, 0.15, 0.2], 0.4), opacity: (stages <= 2 ? 0.8 : 0.35) * opacity, step: H * 0.12, thick: 0.02,
      seed: 7 + n++, ...(o.t0 !== undefined ? { t0: o.t0, dur: 0.6 } : {}) });
  }
  if (stages < 2) return J;

  // order of overlap: far limbs first, then the trunk, then near limbs and the head
  const far = J.turn > 0.2 ? 'l' : J.turn < -0.2 ? 'r' : null, near = far === 'l' ? 'r' : far === 'r' ? 'l' : null;
  const lim = B.limb ?? 1;
  const leg = (side) => {
    const hip = J[side + 'Hip'], knee = J[side + 'Knee'], ankle = J[side + 'Ankle'], dim = side === far ? 0.92 : 1;
    const thighW = (t) => H * lim * ((0.1 - 0.035 * t) + 0.012 * muscle * bump(t, 0.25, 0.3)) * (side === far ? 0.95 : 1);
    const shinW = (t) => H * lim * ((0.066 - 0.032 * t) + 0.016 * (0.5 + muscle) * bump(t, 0.28, 0.2));
    const pantsThigh = bottom && legCover > 0, cutT = clamp(legCover / 0.5), cutS = clamp((legCover - 0.5) / 0.5);
    // thigh (cloth to the cut), knee, shin
    if (pantsThigh && cutT < 1) { const m = [lerp(hip[0], knee[0], cutT), lerp(hip[1], knee[1], cutT)];
      mass(m, knee, (t) => thighW(lerp(cutT, 1, t)), SK, { occl: stages >= 4 ? [] : null }); mass(hip, m, (t) => thighW(t * cutT) * 1.08, bottom, { round: false }); }
    else mass(hip, knee, (t) => thighW(t) * (pantsThigh ? 1.08 : 1), skinOr(bottom, pantsThigh ? 1 : 0), { round: !pantsThigh });
    if (bottom && cutS > 0) { const m = [lerp(knee[0], ankle[0], cutS), lerp(knee[1], ankle[1], cutS)];
      mass(knee, m, (t) => shinW(t * cutS) * 1.12, bottom, { round: false }); if (cutS < 1) mass(m, ankle, (t) => shinW(lerp(cutS, 1, t)), SK); }
    else mass(knee, ankle, shinW, SK);
    if (stages >= 4 && !(bottom && cutS > 0.05)) {                    // knees catch red and a little light
      S({ brush: 'dab', x: knee[0], y: knee[1], angle: 1.5, length: H * 0.04, width: H * 0.034, color: SK.blush, opacity: 0.45 * dim, soft: 0.6, thick: 0.1 }); }
    // foot / shoe
    const fp = shoes ?? SK; mass(J[side + 'Heel'], J[side + 'Toe'], (t) => H * (0.045 - 0.012 * t), fp, { lanes: 3, steps: 2 });
    mass(ankle, J[side + 'Heel'], () => H * 0.04, bottom && cutS >= 0.98 ? bottom : SK, { lanes: 3, steps: 1, round: false });
  };
  const arm = (side) => {
    const sh = J[side + 'Sh'], el = J[side + 'Elbow'], wr = J[side + 'Wrist'], hd = J[side + 'Hand'];
    const upW = (t) => H * lim * ((0.066 - 0.016 * t) + 0.014 * muscle * bump(t, 0.3, 0.25) + 0.012 * bump(t, 0.05, 0.12));
    const foreW = (t) => H * lim * ((0.058 - 0.025 * Math.pow(t, 0.8)) + 0.01 * muscle * bump(t, 0.18, 0.18));
    const cutU = top ? clamp(sleeves / 0.5) : 0, cutF = top ? clamp((sleeves - 0.5) / 0.5) : 0;
    if (cutU > 0 && cutU < 1) { const m = [lerp(sh[0], el[0], cutU), lerp(sh[1], el[1], cutU)];
      mass(sh, m, (t) => upW(t * cutU) * 1.12, top, { round: false }); mass(m, el, (t) => upW(lerp(cutU, 1, t)), SK); }
    else mass(sh, el, (t) => upW(t) * (cutU >= 1 ? 1.1 : 1), cutU >= 1 ? top : SK);
    if (cutF > 0 && cutF < 1) { const m = [lerp(el[0], wr[0], cutF), lerp(el[1], wr[1], cutF)];
      mass(el, m, (t) => foreW(t * cutF) * 1.1, top, { round: false }); mass(m, wr, (t) => foreW(lerp(cutF, 1, t)), SK); }
    else mass(el, wr, (t) => foreW(t) * (cutF >= 1 ? 1.08 : 1), cutF >= 1 ? top : SK);
    // the hand: a slightly darker, redder mass (hands gradate into colour), thumb suggested
    const handPal = { ...SK, mid: mixOk(SK.mid, SK.blush, 0.35), light: mixOk(SK.light, SK.blush, 0.15) };
    mass(wr, hd, (t) => H * (0.044 - 0.016 * t * t), handPal, { lanes: 3, steps: 2 });
    if (stages >= 5 && detail > 0.4) { const d = [hd[0] - wr[0], hd[1] - wr[1]], m = add(wr, d, 0.35), s = side === 'l' ? -1 : 1;
      S({ brush: 'round', p0: m, p2: [m[0] + (d[1] * -s + d[0]) * 0.35, m[1] + (-d[0] * -s + d[1]) * 0.35], width: H * 0.013, color: handPal.mid, thick: 0.3, soft: 0.2 }); }
  };
  const trunk = () => {
    const sp = J.lSh, sq = J.rSh, pit = J.pit, waist = J.waist, pel = J.pelvis;
    const upper = top ?? SK, lower = bottom ?? (top && fit.dress ? top : SK);
    // pelvis: wide basin, then ribcage egg, the waist in between (blobs: large, small, medium)
    const crotch = add(pel, J.up, -0.075 * H);
    mass(add(pel, J.up, 0.115 * H), crotch, (t) => H * kx * (lerp(B.waist, B.pelvis, smoothstep(0, 0.45, t)) - 0.07 * smoothstep(0.6, 1, t)), lower,
      { occl: stages >= 4 && !bottom ? [0.97] : null });
    const chestTop = add(pit, J.up, -0.01 * H);
    mass(chestTop, add(waist, J.up, -0.01 * H), (t) => H * kx * (lerp(B.shoulders * 0.92, B.ribs, smoothstep(0, 0.35, t)) - (B.ribs - B.waist) * smoothstep(0.55, 1, t)
      + (B.muscle ?? 0.5) * 0.012 * bump(t, 0.25, 0.2)), upper);
    // shoulder caps (deltoids) and trapezius slopes — the neck-to-shoulder line beginners forget
    for (const [p, s] of [[sp, -1], [sq, 1]]) {
      const tz = (top && sleeves > 0.02) ? top : SK, n0 = [J.neckTop[0] + s * 0.014 * H * kx, J.neckTop[1] + 0.012 * H], n1 = [lerp(J.neckTop[0], p[0], 0.55), J.neckTop[1] + 0.032 * H], n2 = [p[0] - s * 0.012 * H, p[1] - 0.008 * H];
      S({ brush: 'round', p0: n0, p1: n1, p2: n2, width: H * 0.05, taper: [0.7, 1], color: tz.mid, thick: 0.12, soft: 0.15 });           // the trapezius wedge
      if (stages >= 3) S({ brush: 'filbert', p0: n0, p1: [n1[0], n1[1] - 0.008 * H], p2: n2, width: H * 0.022, color: (Lt[0] * s > 0 ? tz.light : mixOk(tz.mid, tz.shadow, 0.5)), thick: 0.25, soft: 0.3 });
    }
    if (stages >= 4) {                                                // occlusion: armpits, under the chest, the spine (back)
      for (const p of [sp, sq]) S({ brush: 'round', x: p[0] + (pel[0] - p[0]) * 0.18, y: p[1] + 0.075 * H, angle: 1.4, length: H * 0.05, width: H * 0.014, color: upper.occlusion ?? upper.shadow, opacity: 0.6, soft: 0.5, thick: 0.03 });
      if (back) S({ brush: 'round', p0: add(pit, J.up, -0.02 * H), p2: add(waist, J.up, -0.02 * H), width: H * 0.01, color: upper.shadow, opacity: 0.55, soft: 0.6, thick: 0.05 });
      if (back && !top) for (const s of [-1, 1]) S({ brush: 'round', x: pit[0] + s * H * B.shoulders * 0.27 * kx, y: pit[1] + 0.07 * H, angle: 1.3 * s, length: H * 0.06, width: H * 0.012, color: SK.shadow, opacity: 0.4, soft: 0.6, thick: 0.05 });
    }
  };
  const neckHead = () => {
    const nk = J.neckTop, hu = J.headUp, hp = [-hu[1], hu[0]];
    mass(add(J.pit, J.up, 0.012 * H), add(nk, hu, 0.02 * H), () => H * B.neck * (0.9 + 0.1 * kx), SK, { lanes: 3, steps: 2, round: false });
    // head: an egg narrowing to the jaw (Loomis ball + jaw), seen from the side the jaw moves forward
    const headW = (t) => H * 0.106 * (0.78 + 0.22 * kx) * Math.pow(Math.sin(Math.PI * (0.06 + 0.9 * t)), 0.55) * (1 - 0.3 * smoothstep(0.55, 1, t));
    const crownSh = add(J.crown, hp, -J.turn * 0.012 * H), chinSh = add(J.chin, hp, J.turn * 0.018 * H);
    const headPal = back ? SK : { ...SK, mid: SK.mid };
    mass(crownSh, chinSh, headW, headPal, { lanes: 5, steps: 4 });
    const at = (t, s) => { const c = [lerp(crownSh[0], chinSh[0], t), lerp(crownSh[1], chinSh[1], t)]; return add(c, hp, s * headW(t) / 2); };
    if (stages >= 4 && !back) {                                       // colour zones: ochre brow, red middle, cool jaw
      S({ brush: 'wash', p0: at(0.33, -0.5), p2: at(0.33, 0.5), width: H * 0.03, color: mixOk(SK.mid, [0.85, 0.7, 0.45], 0.25), opacity: 0.35, soft: 0.8, thick: 0.02 });
      S({ brush: 'wash', p0: at(0.6, -0.65), p2: at(0.6, 0.65), width: H * 0.03, color: SK.blush, opacity: 0.4, soft: 0.8, thick: 0.02 });
      S({ brush: 'wash', p0: at(0.86, -0.4), p2: at(0.86, 0.4), width: H * 0.022, color: SK.cool, opacity: 0.35, soft: 0.8, thick: 0.02 });
      S({ brush: 'round', p0: at(1.0, -0.6), p2: at(1.0, 0.6), width: H * 0.012, color: SK.occlusion, opacity: 0.55, soft: 0.6, thick: 0.03 });   // under the jaw
    }
    if (stages >= 5 && !back && detail > 0.35) {                      // face planes, not features: sockets, nose, mouth
      const ft = J.turn * 0.35;                                       // the centre line slides with the turn
      for (const s of [-0.42, 0.42]) { const e = at(0.52, s + ft); const far = Math.sign(s) === -Math.sign(J.turn) && Math.abs(J.turn) > 0.3;
        S({ brush: 'dab', x: e[0], y: e[1], angle: Math.atan2(hp[1], hp[0]), length: H * 0.026 * (far ? 0.7 : 1), width: H * 0.014, color: mixOk(SK.shadow, SK.occlusion, 0.5), opacity: 0.75, soft: 0.45, thick: 0.05 }); }
      const nTop = at(0.5, ft), nTip = at(0.7, ft + 0.06 * Math.sign(J.turn || 1));
      S({ brush: 'round', p0: nTop, p2: nTip, width: H * 0.012, color: Lt[0] * (J.turn || 1) > -0.2 ? SK.light : SK.mid, thick: 0.6, soft: 0.2 });
      S({ brush: 'dab', x: nTip[0] - Lt[0] * H * 0.008, y: nTip[1] + H * 0.006, angle: 0, length: H * 0.014, width: H * 0.008, color: SK.shadow, opacity: 0.7, soft: 0.4, thick: 0.05 });
      const m = at(0.82, ft); S({ brush: 'round', x: m[0], y: m[1], angle: Math.atan2(hp[1], hp[0]), length: H * 0.026, width: H * 0.006, color: mixOk(SK.occlusion, SK.blush, 0.4), opacity: 0.8, soft: 0.3, thick: 0.05 });
      const br = at(0.42, ft - 0.1 * Lt[0]); S({ brush: 'round', x: br[0], y: br[1], angle: Math.atan2(hp[1], hp[0]), length: H * 0.05, width: H * 0.01, color: SK.light, opacity: 0.6, soft: 0.4, thick: 0.4 });  // brow ridge catches light
      if (Math.abs(J.turn) > 0.2) { const ear = at(0.55, -Math.sign(J.turn) * 0.75); S({ brush: 'dab', x: ear[0], y: ear[1], angle: 1.5, length: H * 0.028, width: H * 0.016, color: SK.blush, opacity: 0.85, soft: 0.3, thick: 0.3 }); }
    }
    // hair (painters' method): ONE mass with volume, bigger than the skull → shadow side thin and dark → locks as
    // ribbons that grow from the crown, wrap the skull and fall → a selective band of light, thick, on the lit side →
    // soft edge at the forehead, broken tips, a few flyaways. Never strand by strand.
    const hair = o.hair ?? { style: 'short', color: '#3b2a20' };
    if (hair.style !== 'none' && stages >= 3) {
      const HP = hazePal(clothPalette(hair.color ?? '#3b2a20', { ambient: o.ambient, light: o.lightColor })), ls = Lt[0] * hp[0] >= 0 ? 1 : -1;
      const hw = headW(0.35) / 2 * 1.18, cap = back ? 0.95 : 0.36;
      // 1. the mass: covers the skull (from behind: the whole head), wider than it
      S({ brush: 'round', p0: at(-0.1, 0), p2: at(cap, 0), width: hw * 2.05, taper: [0.8, back ? 0.92 : 0.98], color: mixOk(HP.mid, HP.shadow, 0.35), thick: 0.12, soft: 0.3 });
      // 2. shadow side, thin
      S({ brush: 'filbert', p0: at(0.0, -ls * 0.5), p2: at(cap + 0.05, -ls * 0.95), width: hw * 0.7, color: HP.shadow, thick: 0.05, soft: 0.45, opacity: 0.8 });
      // 3. locks: ribbons from the crown around the skull
      const nL = back ? 6 : 5;
      for (let k = 0; k < nL; k++) {
        const s = (k + 0.5) / nL * 2 - 1, a = at(-0.02, s * 0.25), b = at(cap + (back ? 0.02 : 0.08 * (1 - Math.abs(s))), s * 1.02), m = at(cap * 0.45, s * 0.92);
        const lit = s * ls;
        S({ brush: 'filbert', p0: a, p1: [2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2], p2: b, width: hw * 0.42, taper: [0.85, 0.45],
          color: lit > 0.35 ? HP.light : lit < -0.3 ? mixOk(HP.mid, HP.shadow, 0.5) : HP.mid, thick: 0.25 + 0.3 * Math.max(0, lit), soft: 0.25, fray: 0.3, opacity: 0.9 });
      }
      // 4. the band of light: where the skull turns to the light, a few short thick strokes ACROSS the locks
      for (let k = 0; k < 3; k++) { const c = at(0.16 + 0.05 * k, ls * (0.35 + 0.12 * k));
        S({ brush: 'round', x: c[0], y: c[1], angle: Math.atan2(hu[1], hu[0]) + Math.PI / 2 + 0.3 * ls, length: hw * (0.55 - 0.1 * k), width: hw * 0.12, color: HP.highlight, thick: 0.8, soft: 0.3, opacity: 0.75 }); }
      // 5. soft hairline over the forehead (front) and a couple of flyaways off the silhouette
      if (!back) { const f0 = at(cap, -0.6), f1 = at(cap + 0.02, 0.6); S({ brush: 'wash', p0: f0, p2: f1, width: hw * 0.25, color: mixOk(HP.mid, SK.mid, 0.5), opacity: 0.45, soft: 0.85, thick: 0.02 }); }
      for (let k = 0; k < 3; k++) { const s = k === 1 ? -ls : ls, a = at(0.08 + 0.18 * k, s * 1.0), d = [hp[0] * s, hp[1] * s];
        S({ brush: 'liner', p0: a, p1: [a[0] + d[0] * hw * 0.25 - hu[0] * hw * 0.2, a[1] + d[1] * hw * 0.25 - hu[1] * hw * 0.2], p2: [a[0] + d[0] * hw * 0.45 + hu[0] * hw * 0.1, a[1] + d[1] * hw * 0.45 + hu[1] * hw * 0.1],
          width: H * 0.0025, color: k === 1 ? HP.mid : HP.light, opacity: 0.55, taper: [0.8, 0.1], thick: 0.1, soft: 0.2 }); }
      if (hair.style === 'bun') { const b = at(back ? 0.35 : -0.05, 0.12 * ls); S({ brush: 'round', x: b[0], y: b[1], angle: 0.4, length: H * 0.05, width: H * 0.046, color: HP.mid, thick: 0.4 });
        S({ brush: 'round', x: b[0] + Lt[0] * H * 0.008, y: b[1] - H * 0.008, angle: 0.4, length: H * 0.025, width: H * 0.016, color: HP.light, thick: 0.7, opacity: 0.8 }); }
    }
  };
  // long hair: a mass that falls from the head over the back (from behind) or behind the shoulders (front), wider
  // below, locks along the fall with broken tips, the lit side catching light, moving with the wind
  const longHair = () => {
    const hair = o.hair ?? {}; if (hair.style !== 'long' || stages < 3) return;
    const HP = hazePal(clothPalette(hair.color ?? '#3b2a20', { ambient: o.ambient, light: o.lightColor })), hu = J.headUp, hp = [-hu[1], hu[0]];
    const len = (hair.length ?? 0.18) * H, hw = H * 0.058 * (0.8 + 0.2 * kx), top = add(J.crown, hu, -0.045 * H), ls = Lt[0] * hp[0] >= 0 ? 1 : -1;
    const sway = (k) => wind * H * 0.016 * Math.sin(time * 1.6 + k * 1.1), down = [0, 1];
    const end = add(top, down, len + 0.07 * H), wEnd = hw * (back ? 1.5 : 1.7);
    // the mass (dark, thin)
    S({ brush: 'round', p0: top, p1: [lerp(top[0], end[0], 0.5) + sway(0) * 0.3, lerp(top[1], end[1], 0.5)], p2: [end[0] + sway(0), end[1]], width: wEnd * 2,
      taper: [hw / wEnd, 0.8], color: mixOk(HP.mid, HP.shadow, 0.45), thick: 0.1, soft: 0.35, fray: 0.3 });
    // locks along the fall; tips broken and uneven
    const nL = back ? 7 : 6;
    for (let k = 0; k < nL; k++) {
      const s = (k + 0.5) / nL * 2 - 1, a = add(top, hp, s * hw * 0.85), lk = len * (0.82 + 0.25 * Math.abs(Math.sin(k * 2.3))) + 0.06 * H;
      const b = add(add(a, down, lk), hp, s * (wEnd - hw) * 0.9 + sway(k)), m = add([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], hp, s * hw * 0.3 + sway(k) * 0.5);
      const lit = s * ls;
      S({ brush: 'filbert', p0: a, p1: [2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2], p2: b, width: hw * 0.55, taper: [1, 0.25],
        color: lit > 0.3 ? HP.light : lit < -0.35 ? HP.shadow : HP.mid, thick: 0.2 + 0.35 * Math.max(0, lit), soft: 0.25, fray: 0.45, opacity: 0.9 });
    }
    // light catches the curve where the hair turns over the shoulder blades / at the crown (selective, thick)
    for (let k = 0; k < 3; k++) { const c = add(add(top, down, len * (0.18 + 0.12 * k)), hp, ls * hw * (0.35 + 0.25 * k));
      S({ brush: 'round', p0: c, p2: add(c, down, len * 0.12), width: hw * 0.16, color: HP.highlight, thick: 0.8, soft: 0.3, opacity: 0.7 }); }
    // a few flyaways
    for (let k = 0; k < 4; k++) { const s = k % 2 ? 1 : -1, a = add(add(top, down, len * (0.1 + 0.2 * k)), hp, s * (hw + (wEnd - hw) * 0.3 * k));
      S({ brush: 'liner', p0: a, p1: add(add(a, hp, s * hw * 0.25), down, len * 0.06), p2: add(add(a, hp, s * hw * 0.45 + sway(k) * 0.6), down, len * 0.16), width: H * 0.0025, color: HP.light, opacity: 0.5, taper: [0.8, 0.1], thick: 0.1 }); }
  };
  // a soft cast shadow on the ground, away from the light
  if (stages >= 3 && !o.noShadow) { const g = [lerp(J.lHeel[0], J.rHeel[0], 0.5), Math.max(J.lHeel[1], J.rHeel[1])];
    S({ brush: 'wash', p0: [g[0] - Lt[0] * H * 0.02, g[1] + H * 0.005], p2: [g[0] - Lt[0] * H * 0.5, g[1] + H * 0.03], width: H * 0.06, color: [0.12, 0.11, 0.16], opacity: 0.35, soft: 0.8, thick: 0.01 }); }

  if (!back) longHair();
  if (far) { arm(far); leg(far); }
  for (const s of ['l', 'r']) if (s !== far && s !== near) leg(s);
  trunk();
  if (near) leg(near);
  neckHead();
  if (back) longHair();
  for (const s of ['l', 'r']) if (s !== far && s !== near) arm(s);
  if (near) arm(near);
  if (fit.dress && (top ?? bottom)) {                                 // a skirt from the waist, swinging with the wind
    const P = bottom ?? top, w0 = H * B.pelvis * kx * 1.05, len = H * 0.52 * (fit.legs ?? 0.5), wb = w0 * 1.45, g = add(J.pelvis, J.up, 0.06 * H);
    for (let k = 0; k < 7; k++) { const s = (k + 0.5) / 7 * 2 - 1, a = [g[0] + s * w0 / 2, g[1]], b = [g[0] + s * wb / 2 + wind * H * 0.02 * Math.sin(time * 1.3 + k), g[1] + len * (0.95 + 0.05 * Math.sin(k * 1.7))];
      const lit = -s * Math.sign(-Lt[0]); S({ brush: 'flat', p0: a, p2: b, width: wb / 5.5, color: lit > 0.3 ? P.light : lit < -0.3 ? P.shadow : P.mid, thick: 0.25, soft: 0.2, taper: [0.8, 1] }); }
  }
  // stage 5: accents — a few thick highlights where the light hits hardest (forehead, shoulder, knee), rim light on the shadow side
  if (stages >= 5) {
    const hi = (p, w) => S({ brush: 'dab', x: p[0] + Lt[0] * w, y: p[1] + Lt[1] * w, angle: 1.2, length: w * 1.1, width: w * 0.7, color: SK.highlight, thick: 1, soft: 0.25, opacity: 0.8 });
    if (!back) hi(add(J.crown, J.headUp, -0.035 * H), H * 0.012);
    if (!(top && sleeves > 0.05)) hi(Lt[0] < 0 ? J.lSh : J.rSh, H * 0.012);
    if (detail > 0.3) for (const s of ['l', 'r']) { const p = [J[s + 'Sh'], J[s + 'Elbow']], rimC = mixOk(SK.reflected, col(o.ambient ?? '#8fa3c2'), 0.5);
      if ((s === 'l' ? -1 : 1) * Lt[0] < 0) continue;                 // only the shadow-side arm gets the rim
      S({ brush: 'liner', p0: add(p[0], [-Lt[0], 0], H * 0.03), p2: add(p[1], [-Lt[0], 0], H * 0.024), width: H * 0.005, color: rimC, opacity: 0.6, thick: 0.1, soft: 0.3 }); }
  }
  return J;
}

/** A figure that lives: a static pose that breathes and sways, or any pose function of time (walk cycles).
 *  pose: an object or (t) → pose; move: (t) → { x, base } to travel. Other options as paintFigure. Dynamic layer. */
export function figure(painting, o) {
  const name = o.name ?? 'figure' + (o.seed ?? 1);
  return painting.dynamic(name, { depth: o.depth ?? 0.8 }, (t, L) => {
    if (o.from !== undefined && t < o.from) return;
    const base = typeof o.pose === 'function' ? o.pose(t) : (o.pose ?? POSES.stand());
    const breathe = o.breathe ?? 1, pose = { ...base, lean: (base.lean ?? 0) + breathe * 0.006 * Math.sin(t * 1.4), head: (base.head ?? 0) + breathe * 0.01 * Math.sin(t * 0.5 + 1) };
    const at = o.move ? o.move(t) : {};
    paintFigure(L, { ...o, ...at, pose, time: t, opacity: (o.opacity ?? 1) * (o.from !== undefined ? clamp((t - o.from) / 0.6) : 1) });
  });
}
