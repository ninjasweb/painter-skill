// "After the demonstration" — a master study of the sunset-cloud lesson: not a copy of the picture, a copy of its
// STRUCTURE, measured from the video's finished canvas: a sky dominated by large dark violet cloud masses
// (dark 45–50 % of the picture), one luminous gap where rays fan out, rims of warm light only on edges that
// face the sun, the hottest and lightest colour in a low band at the horizon, land reduced to a thin dark base.
// Composition: sun low on the left third; the bright gap sits above it and leads up to the right along the rays;
// dark masses top-left and across the lower sky frame the gap (a dark · light · dark sandwich on a diagonal).
// Value plan: cloud darks .38–.48 · sky in the gap .78–.86 · upper sky .6 · horizon glow .82 · sun .95 · land .18.
import { Painting, mix, mixOk, shift, tone, chroma, skyColor, paintSky, paintSun, paintCloudMass, paintRays, ridge, paintHills, paintTreeline, paintWater,
  birds, sketch, trace, key, ease, smoothstep, clamp } from 'painter';

export const meta = { duration: 16, fps: 30 };

export default function ({ aspect, seed }) {
  const p = new Painting({ aspect, seed, ground: '#d8ccb8' });
  p.duration = 16;
  const A = aspect, H = 0.8, sun = [A * 0.24, H - 0.04], gap = [A * 0.46, 0.4];

  const zenith = chroma(tone(mix({ ultramarine: 3, dioxazineViolet: 1 }), 0.56), 0.85);
  const gapSky = tone(mix({ cobaltBlue: 1, titaniumWhite: 3, cadmiumYellow: 0.15 }), 0.86);
  const lowSky = tone(mix({ quinMagenta: 1, cadmiumOrange: 0.8 }), 0.66);
  const glow = tone(mix({ cadmiumOrange: 2, cadmiumYellow: 1 }), 0.78), hot = tone(mix({ cadmiumYellow: 2, cadmiumOrange: 0.3 }), 0.92);
  const cloudDark = chroma(tone(mix({ dioxazineViolet: 2, ultramarine: 1, burntUmber: 0.8 }), 0.38), 0.8);
  const cloudMid = chroma(tone(mix({ dioxazineViolet: 1, quinMagenta: 0.6, burntSienna: 0.6 }), 0.52), 0.8);
  const rim = chroma(tone(mix({ cadmiumYellow: 1, cadmiumOrange: 0.5, titaniumWhite: 1 }), 0.9), 0.75);
  const land = tone(mix({ prussianBlue: 1, burntUmber: 1.5 }), 0.17);

  // sky: cool dark zenith → light, slightly warm gap → hot band at the horizon around the sun
  const base = skyColor({ top: -0.05, bottom: H, stops: [[0, zenith], [0.5, mixOk(zenith, gapSky, 0.55)], [0.82, lowSky], [1, glow]] });
  const sky = (x, y) => { const dg = Math.hypot((x - gap[0]) * 0.8, y - gap[1]), ds = Math.hypot(x - sun[0], (y - sun[1]) * 2.6);
    return mixOk(mixOk(mixOk(base(x, y), gapSky, 0.85 * Math.exp(-((dg / 0.3) ** 2))), glow, 0.8 * Math.exp(-((ds / 0.6) ** 2))), hot, 0.9 * Math.exp(-((ds / 0.2) ** 2))); };
  // where the composition wants cloud: everywhere except the gap and the horizon band; heavier top-left and lower-right
  const cover = (x, y) => { const g = Math.exp(-((Math.hypot((x - gap[0]) * 0.75, (y - gap[1]) * 1.15) / 0.24) ** 2));
    const band = smoothstep(H - 0.2, H - 0.3, y) * smoothstep(-0.2, 0.15, y), diag = 0.5 + 0.3 * Math.sin((x / A - y) * 4.2 + 0.6);
    return clamp((0.5 + 0.5 * diag) * band - g * 1.0); };
  const lowCover = (x, y) => smoothstep(0.12, 0.0, Math.abs(y - (H - 0.2 + 0.05 * Math.sin(x * 3)))) * (0.5 + 0.4 * smoothstep(0.2, 0.9, x / A));

  p.phase('sketch');
  const sk = p.layer('sketch', { depth: 0.2 });
  sketch(sk, [[0, H], [A, H]]); sketch(sk, Array.from({ length: 30 }, (_, i) => { const a = i / 29 * 6.283; return [gap[0] + Math.cos(a) * 0.3, gap[1] + Math.sin(a) * 0.2]; }));

  p.phase('light');           // start from the light source
  const skyL = p.layer('sky', { depth: 0 });
  paintSky(skyL, { color: sky, bottom: H + 0.03, size: 0.075 });
  paintSun(skyL, { x: sun[0], y: sun[1], r: 0.016, color: tone(hot, 0.96), halo: hot, glow: 0.15 });

  p.phase('rays');            // rays first, so the dark masses can overlap their roots
  paintRays(p.layer('rays', { depth: 0.05 }), { from: [sun[0] + 0.1, H - 0.22], angle0: -1.25, angle1: -0.25, count: 7, length: 0.95, width: 0.085, color: tone(gapSky, 0.95), opacity: 0.3 });

  p.phase('cloud masses');    // big dark shapes, then only the edges that face the sun are lit
  const cl = p.layer('clouds', { depth: 0.12 });
  paintCloudMass(cl, { cover, scale: 0.42, dark: cloudDark, mid: cloudMid, rim, light: sun, size: 0.036, seed: seed + 3, drift: [0.003, 0] });
  const low = p.layer('low clouds', { depth: 0.16 });
  paintCloudMass(low, { bounds: [-0.1, H - 0.36, A + 0.1, H - 0.04], cover: lowCover, scale: 0.3, dark: shift(cloudDark, -0.04), mid: mixOk(cloudMid, glow, 0.35), rim: mixOk(rim, glow, 0.4), light: sun, size: 0.026, seed: seed + 8, drift: [0.004, 0], rimAmount: 1.3 });

  p.phase('land');
  const far = p.layer('land', { depth: 0.4 }), shore = ridge({ y: H, amp: 0.006, freq: 2, seed });
  paintHills(far, { top: (x) => shore(x) - 0.01, bottom: (x) => shore(x) + 0.008, size: 0.012, fragment: 0.3, color: () => mixOk(land, cloudDark, 0.3) });
  paintTreeline(far, { base: shore, height: 0.03, size: 0.009, seed: seed + 4, gaps: 0.4, x0: A * 0.45, dark: land, light: mixOk(land, glow, 0.3) });
  paintWater(p.layer('water', { depth: 0.6 }), { top: (x) => shore(x) + 0.004, bottom: 1.06, size: 0.024, tint: cloudDark, tintAmount: 0.18, mirror: 0.3,
    sunPath: { x: sun[0], width: 0.035, color: hot, edge: glow }, glints: rim, glintAmount: 0.35 });
  birds(p, { count: 5, around: [A * 0.3, H - 0.1], spread: 0.07, size: 0.011, velocity: [0.012, -0.004], depth: 0.2, seed, from: 10.5, color: '#2a2030' });

  p.timelapse({ start: 0.3, end: 10 });
  p.camera = (t) => ({ x: A / 2 - key(t, [[10, 0], [16, 0.025]]), y: 0.5 - key(t, [[10, 0], [16, 0.02]]), zoom: key(t, [[10, 1], [16, 1.07]], ease.inOut) });
  p.wind = (t) => ({ strength: key(t, [[0, 0], [10, 0.15], [12, 1]]) });
  return p;
}
