// "Evening on the river" — sunset sky with cumulus, a dark cloud bank, light rays, a river that mirrors the sky.
// Composition: low horizon (0.72) so the sky is the subject; sun on the left third near the horizon (the light
// source and warmest note); the big lit cumulus on the right third is the focal point; the dark bank and the
// dark foreground shore frame the light (dark · light · dark value bands).
import { Painting, mix, mixOk, shift, chroma, skyColor, paintSky, paintSun, paintCumulus, paintCloudBank, paintRays,
  cumulusShape, ridge, paintHills, paintWater, paintTreeline, paintGrass, sketch, trace, key, ease } from 'painter';

export const meta = { duration: 16, fps: 30 };

export default function ({ aspect, seed }) {
  const p = new Painting({ aspect, seed, ground: '#d9cdb8' });
  p.duration = 16;
  const A = aspect, H = 0.72;                       // horizon
  const sun = { x: A * 0.2, y: H - 0.035 };
  const toSun = (x, y) => { const dx = sun.x - x, dy = sun.y - y, n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };

  // ---- palette: mixed from pigments, then checked by value ----
  const zenith = mix({ ultramarine: 3, dioxazineViolet: 1, titaniumWhite: 2.2 });
  const midSky = mix({ ultramarine: 2, quinMagenta: 0.6, titaniumWhite: 4 });
  const lowSky = mix({ quinMagenta: 1, cadmiumOrange: 0.5, titaniumWhite: 3 });
  const glow = mix({ cadmiumOrange: 2, cadmiumYellow: 1, titaniumWhite: 0.6 });
  const sunCol = mix({ cadmiumYellow: 1, titaniumWhite: 3 });
  const cloudShadow = mix({ dioxazineViolet: 1.4, ultramarine: 1, burntSienna: 0.5, titaniumWhite: 1.6 });
  const cloudMid = mix({ quinMagenta: 0.6, cadmiumOrange: 1, dioxazineViolet: 0.4, titaniumWhite: 4 });
  const cloudLight = mix({ cadmiumOrange: 1, cadmiumYellow: 0.8, titaniumWhite: 7 });
  const cloudHi = mix({ cadmiumYellow: 0.6, titaniumWhite: 10 });
  const bankDark = mix({ dioxazineViolet: 2, ultramarine: 1, burntUmber: 1, titaniumWhite: 0.7 });
  const landDark = mix({ prussianBlue: 1, burntUmber: 1.5, sapGreen: 1 });
  const landGreen = mix({ sapGreen: 2, transRedOxide: 0.6, yellowOchre: 0.6 });

  const farGlow = mix({ quinMagenta: 1.2, cadmiumOrange: 1, dioxazineViolet: 0.3, titaniumWhite: 2 });
  const base = skyColor({ top: -0.05, bottom: H, stops: [[0, zenith], [0.45, midSky], [0.78, lowSky], [1, farGlow]] });
  const hot = mix({ cadmiumYellow: 1.2, cadmiumOrange: 0.5, titaniumWhite: 2.5 });
  const sky = (x, y) => { const d = Math.hypot(x - sun.x, (y - sun.y) * 2.6);
    return mixOk(mixOk(base(x, y), glow, 0.8 * Math.exp(-((d / 0.55) ** 2))), hot, 0.85 * Math.exp(-((d / 0.2) ** 2))); };

  // ---- shapes ----
  const LIGHT = [-0.55, -0.83];                     // clouds are top-lit from the sun side
  const big = cumulusShape({ x: A * 0.66, y: 0.5, w: 0.62, h: 0.4, lobes: 60, seed: seed + 11, light: LIGHT });
  const small = cumulusShape({ x: A * 0.92, y: 0.52, w: 0.3, h: 0.17, lobes: 26, towers: 2, seed: seed + 23, light: LIGHT });
  const left = cumulusShape({ x: A * 0.06, y: 0.36, w: 0.5, h: 0.24, lobes: 34, seed: seed + 31, light: [0.3, -0.95] });
  const bankTop = ridge({ y: 0.56, amp: 0.035, freq: 1.6, seed: seed + 3 });
  const bankBot = ridge({ y: 0.645, amp: 0.012, freq: 2.2, seed: seed + 4 });
  const farShore = ridge({ y: H, amp: 0.006, freq: 2, seed: seed + 5 });
  const nearShore = (x) => 0.9 - 0.14 * Math.pow(Math.max(0, 1 - x / (A * 0.55)), 1.6) + 0.012 * Math.sin(x * 9);

  // ---- 1. sketch: place the big shapes before any colour ----
  p.phase('sketch');
  const sk = p.layer('sketch', { depth: 0.2 });
  sketch(sk, trace(farShore, 0, A, 20));
  sketch(sk, trace(nearShore, 0, A * 0.6, 14));
  for (const s of [big, small, left]) sketch(sk, s.outline(40));
  sketch(sk, trace(bankTop, 0, A, 24));

  // ---- 2. sky: start at the light source and work outwards, thin paint, blended ----
  p.phase('sky');
  const skyL = p.layer('sky', { depth: 0 });
  paintSky(skyL, { color: sky, bottom: H + 0.03, size: 0.075 });
  paintSun(skyL, { ...sun, color: sunCol, halo: mixOk(glow, sunCol, 0.5), glow: 0.16 });

  // ---- 3. clouds: far bank first, then the cumulus masses, then turn the form, then highlights ----
  p.phase('clouds');
  const bank = p.layer('cloud bank', { depth: 0.08 });
  paintCloudBank(bank, { top: bankTop, bottom: bankBot, size: 0.034, seed: seed + 9, drift: [0.0025, 0],
    colorTop: (x, y) => mixOk(bankDark, shift(cloudShadow, -0.05), 0.35),
    colorBelow: (x, y) => mixOk(shift(bankDark, 0.06), glow, 0.75 * Math.exp(-(((x - sun.x) / 0.55) ** 2))),
    edgeLight: (x) => (Math.abs(x - sun.x) < 0.75 ? mixOk(cloudLight, glow, 0.35) : null) });
  const cl = p.layer('cumulus', { depth: 0.14 });
  paintCumulus(cl, left, { shadow: shift(cloudShadow, -0.02), mid: mixOk(cloudShadow, cloudMid, 0.6), light: mixOk(cloudMid, glow, 0.45), highlight: mixOk(cloudLight, glow, 0.3), size: 0.034, drift: [0.004, 0] });
  paintCumulus(cl, small, { shadow: cloudShadow, mid: cloudMid, light: cloudLight, highlight: cloudHi, size: 0.022, drift: [0.0035, 0] });
  paintCumulus(cl, big, { shadow: cloudShadow, mid: cloudMid, light: cloudLight, highlight: cloudHi, size: 0.03, drift: [0.003, 0], detail: 1.3 });

  // ---- 4. rays through the gap between the bank and the big cloud ----
  p.phase('light');
  const rays = p.layer('rays', { depth: 0.1 });
  paintRays(rays, { from: [sun.x + 0.04, 0.6], angle0: -2.5, angle1: -0.35, count: 8, length: 0.75, color: mixOk(cloudHi, glow, 0.2) });

  // ---- 5. land and water, far to near ----
  p.phase('land');
  const far = p.layer('far shore', { depth: 0.35 });
  paintHills(far, { top: (x) => farShore(x) - 0.012, bottom: (x) => farShore(x) + 0.006, size: 0.012, fragment: 0.3,
    color: (x) => mixOk(mixOk(landDark, bankDark, 0.5), glow, 0.35 * Math.exp(-(((x - sun.x) / 0.3) ** 2))) });
  paintTreeline(far, { base: farShore, height: 0.03, size: 0.009, seed: seed + 41, gaps: 0.35, x0: A * 0.3,
    dark: mixOk(landDark, bankDark, 0.35), light: mixOk(landGreen, glow, 0.35) });
  const water = p.layer('water', { depth: 0.5 });
  paintWater(water, { top: (x) => farShore(x) + 0.004, bottom: 1.06, size: 0.026, tint: mix({ ultramarine: 1, dioxazineViolet: 1, titaniumWhite: 1.5 }), tintAmount: 0.18,
    sunPath: { x: sun.x, width: 0.035, color: sunCol, edge: glow }, glints: cloudLight });
  const near = p.layer('near shore', { depth: 0.85 });
  paintHills(near, { top: nearShore, x1: A * 0.62, bottom: 1.12, size: 0.03, fragment: 0.8, thick: 0.45,
    color: (x, y, k) => mixOk(mixOk(landGreen, landDark, 0.55 + 0.4 * k), glow, 0.18 * (1 - k) * Math.exp(-(((x - sun.x) / 0.4) ** 2))) });
  p.phase('details');
  const grass = p.layer('grass', { depth: 1 });
  paintGrass(grass, { bounds: [-0.05, 0.72, A * 0.6, 1.08], mask: (x, y) => (y > nearShore(x) - 0.004 ? 1 : 0), blade: 0.05, density: 1,
    dark: shift(landDark, -0.06), light: mixOk(landDark, landGreen, 0.7), tips: mixOk(landGreen, glow, 0.55), lightAmount: 0.3, seed });

  // ---- time: paint it on, then let it live ----
  p.timelapse({ start: 0.3, end: 9 });
  p.camera = (t) => ({ x: A / 2 + key(t, [[9, 0], [16, 0.03]]), y: 0.5 - key(t, [[9, 0], [16, 0.012]]), zoom: key(t, [[0, 1.0], [9, 1.0], [16, 1.06]], ease.inOut) });
  p.wind = (t) => ({ strength: key(t, [[0, 0], [9, 0.2], [11, 1]]) });
  return p;
}
