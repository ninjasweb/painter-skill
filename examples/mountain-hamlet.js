// "First light in the valley" — snow peaks at dawn, a cabin with a lit window and chimney smoke, rocks, a walker.
// Composition: high drama in the top half (peaks catching warm light against a cool sky), quiet blue-shadowed
// snow below. Focal point = the cabin's warm window on the left third (the only orange in a blue picture);
// the path is the lead-in from the bottom right, the dark firs and rocks frame the cabin.
// Value plan: sky .62→.80 · peaks lit .86 / shadow .52 · far slopes .58 · snow field lit .84 / shadow .64 ·
// firs .22 · cabin walls .30/.20 · window .88 (accent) · rocks .28–.55 · figure .20.
import { Painting, mix, mixOk, shift, tone, chroma, atmosphere, vary, skyColor, paintSky, ridge, peaks as summits, paintHills, paintMountains, paintRocks, paintHouse, paintTreeline,
  paintPine, clumpShape, walker, smoke, sketch, trace, key, ease, noise2, smoothstep, clamp } from 'painter';

export const meta = { duration: 14, fps: 30 };

export default function ({ aspect, seed }) {
  const p = new Painting({ aspect, seed, ground: '#b9b3c4' });          // cool violet-grey ground under a snow scene
  p.duration = 14;
  const A = aspect, AIR = [0.78, 0.8, 0.9];

  const skyTop = chroma(tone(mix({ ultramarine: 2, dioxazineViolet: 0.5, titaniumWhite: 1 }), 0.6), 0.8);
  const skyLow = chroma(tone(mix({ quinMagenta: 0.6, cadmiumOrange: 0.6, titaniumWhite: 3 }), 0.82), 0.75);
  const rockLit = tone(mix({ cadmiumOrange: 0.6, quinMagenta: 0.4, burntSienna: 0.6, titaniumWhite: 2 }), 0.72);
  const rockSh = chroma(tone(mix({ ultramarine: 1.5, dioxazineViolet: 0.5, burntUmber: 0.5, titaniumWhite: 0.6 }), 0.46), 0.8);
  const snowLit = tone(mix({ cadmiumOrange: 0.35, quinMagenta: 0.25, titaniumWhite: 6 }), 0.9);
  const snowSh = chroma(tone(mix({ ultramarine: 1.2, dioxazineViolet: 0.3, titaniumWhite: 2 }), 0.62), 0.75);
  const fir = tone(mix({ prussianBlue: 1.2, sapGreen: 1, burntUmber: 0.8 }), 0.2);
  const wood = tone(mix({ burntUmber: 2, transRedOxide: 0.8 }), 0.3), woodSh = tone(mix({ burntUmber: 2, ultramarine: 1 }), 0.18);
  const windowGlow = tone(mix({ cadmiumOrange: 1, cadmiumYellow: 1.2, titaniumWhite: 0.6 }), 0.86);

  const peaks = summits({ y: 0.56, height: 0.42, count: 5, seed: seed + 1, x1: A + 0.1 });
  const slopes = ridge({ y: 0.5, amp: 0.07, freq: 1.2, seed: seed + 2, rough: 0.5 });
  const field = ridge({ y: 0.66, amp: 0.025, freq: 1.4, seed: seed + 3, rough: 0.3 });
  const pathX = (y) => A * (0.36 + 0.42 * Math.pow(clamp((y - 0.7) / 0.35), 1.3) + 0.03 * Math.sin(y * 18));
  const onPath = (x, y) => (y > 0.71 ? smoothstep(1, 0.6, Math.abs(x - pathX(y)) / (0.012 + 0.11 * clamp((y - 0.7) / 0.35))) : 0);
  const cabin = { x: A * 0.25, base: 0.715, w: 0.12, h: 0.075 };

  p.phase('sketch');
  const sk = p.layer('sketch', { depth: 0.2 });
  sketch(sk, trace(peaks, 0, A, 40)); sketch(sk, trace(field, 0, A, 16));
  sketch(sk, Array.from({ length: 10 }, (_, i) => { const y = 0.72 + i * 0.035; return [pathX(y), y]; }));

  p.phase('sky');
  paintSky(p.layer('sky', { depth: 0 }), { color: skyColor({ top: 0, bottom: 0.5, stops: [[0, skyTop], [1, skyLow]] }), bottom: 0.56, size: 0.065 });

  p.phase('mountains');
  paintMountains(p.layer('peaks', { depth: 0.08 }), { top: peaks, bottom: 0.6, lightX: -1, facets: 0.14, seed: seed + 5,
    light: (x, y, k) => atmosphere(rockLit, 0.2, AIR), shadow: (x, y, k) => atmosphere(rockSh, 0.25, AIR), snow: { line: 0.55, light: snowLit, shadow: atmosphere(snowSh, 0.2, AIR) } });
  paintHills(p.layer('far slopes', { depth: 0.2 }), { top: slopes, bottom: 0.7, size: 0.024, fragment: 0.35, thick: 0.15, soft: 0.4,
    color: (x, y, k) => atmosphere(mixOk(snowSh, fir, 0.35 + 0.25 * noise2(x * 5, y * 9, seed)), 0.35, AIR) });

  paintTreeline(p.layer('far firs', { depth: 0.25 }), { base: (x) => slopes(x) + 0.1 + 0.04 * noise2(x * 2, 1, seed), height: 0.05, size: 0.011, seed: seed + 7, gaps: 0.3, tall: 0.5, thick: 0.12, soft: 0.4,
    dark: atmosphere(fir, 0.35, AIR), light: atmosphere(mixOk(fir, snowLit, 0.5), 0.3, AIR) });

  p.phase('snow field');
  const snowL = p.layer('snow', { depth: 0.6 });
  const drift = (x, y) => smoothstep(0.4, 0.62, noise2(x * 2.2 + 3, y * 5, seed + 9));       // long blue shadows across the snow
  paintHills(snowL, { top: field, bottom: 1.12, size: 0.034, fragment: 0.35, thick: 0.5, brush: 'flat',
    color: (x, y, k) => { const s = Math.max(drift(x, y) * 0.8, 0.25 * k); return mixOk(mixOk(snowLit, snowSh, s), shift(snowSh, -0.1), onPath(x, y) * 0.75); } });

  p.phase('cabin and trees');
  const midL = p.layer('cabin', { depth: 0.55 });
  const pineCols = { barkDark: woodSh, barkLight: wood, barkShadow: woodSh, needleDark: fir, needleMid: shift(fir, 0.07), needleLight: mixOk(shift(fir, 0.16), snowLit, 0.45) };
  [[0.13, 0.3], [0.19, 0.22], [0.42, 0.26], [0.47, 0.19]].forEach(([fx, h], i) => paintPine(midL, { x: A * fx, base: 0.72 + i * 0.004, height: h, trunkW: 0.012, lean: 0, boughs: 14, bare: 0.08, detail: 0.6, seed: seed + 20 + i, colors: pineCols, sway: 0.002 }));
  const hs = paintHouse(midL, { ...cabin, depthW: 0.07, lightX: -1, seed, colors: { wallLight: wood, wallShadow: woodSh, roofLight: snowLit, roofShadow: snowSh, trim: woodSh, window: windowGlow } });
  // warm light spilling from the window onto the snow: repeat the accent once, small
  midL.scatter({ bounds: [hs.window[0] - 0.05, cabin.base, hs.window[0] + 0.06, cabin.base + 0.035], spacing: 0.008, brush: 'round', mask: 0.6, width: 0.006, length: 0.03, angle: 0.05,
    color: (x, y, r) => vary(mixOk(windowGlow, snowLit, 0.45), r, 0.02), opacity: 0.6, thick: 0.5, shimmer: 0.15 });

  p.phase('foreground');
  const fg = p.layer('rocks', { depth: 0.95 });
  paintRocks(fg, clumpShape({ x: A * 0.13, y: 0.93, w: 0.42, h: 0.17, lobes: 9, seed: seed + 31, light: [-0.5, -0.86] }), { light: mixOk(rockLit, snowLit, 0.55), mid: chroma(tone(rockSh, 0.4), 0.35), dark: chroma(tone(woodSh, 0.17), 0.6), size: 0.026, seed });
  paintPine(fg, { x: A * 0.93, base: 1.04, height: 0.95, trunkW: 0.05, lean: -0.03, boughs: 16, bare: 0.1, detail: 1.2, seed: seed + 41, colors: pineCols });

  smoke(p, { from: hs.chimney, color: mixOk(snowLit, skyLow, 0.5), rise: 0.035, lean: 0.018, width: 0.011, depth: 0.5, start: 8, seed });
  walker(p, { from: [pathX(0.97), 0.97, 1], to: [pathX(0.86), 0.86, 0.62], t0: 8, t1: 14, height: 0.2, depth: 0.85, seed,
    colors: { skin: '#c99a7c', top: tone(mix({ cadmiumRed: 1, burntUmber: 1 }), 0.3), topLight: tone(mix({ cadmiumRed: 1, cadmiumOrange: 0.6 }), 0.55), legs: woodSh } });

  p.timelapse({ start: 0.3, end: 8 });
  p.camera = (t) => ({ x: A / 2 - key(t, [[8, 0], [14, 0.03]]), y: 0.5 + key(t, [[8, 0], [14, 0.015]]), zoom: key(t, [[8, 1], [14, 1.08]], ease.inOut) });
  p.wind = (t) => ({ strength: key(t, [[0, 0], [8, 0.1], [10, 0.8]]) });
  return p;
}
