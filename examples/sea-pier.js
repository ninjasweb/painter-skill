// A storm at sunset seen from a pier, after Aivazovsky. Low eye (0.7 m above the deck, 2.7 m above the sea): the sky
// dominates and the waves look tall. The sun is low on the left behind torn cloud; waves roll toward us, backlit, so
// their crests glow green; one big wave rises left of centre. A woman (refs/woman-dress.jpg: "Woman in a dress", Unsplash, CC0; prepared with tools/person.py --horizon 0.64) stands
// near the end of the pier, her dress in the wind, sized by perspective (the horizon crosses her at the same height
// as in her photo). Value plan: sky .55–.9 · glow at the sun .95 · sea .15–.45 · foam .85 · figure .25 against the sky.
import { Painting, mix, mixOk, tone, chroma, skyColor, paintSun, paintRays, fbm, setView, stand, perspectiveGuides,
  paintFrom, seaSource, pierSolids, SEA_COLORS, loadPerson, paintPerson, key, ease, smoothstep, clamp } from 'painter';
export const meta = { duration: 16, fps: 30 };

export default async function ({ aspect, seed, guides = false }) {
  // Aivazovsky painted thin on a smooth white ground: light ground, little canvas relief, thin paint (thick only on foam)
  const p = new Painting({ aspect, seed, ground: '#e9e3d7', look: { relief: 0.22, weave: 0.06, gloss: 0.25, vignette: 0.2 } });
  p.duration = 16;
  const A = aspect, view = setView(p, { horizon: 0.6, eye: 2.7, fov: 42, air: '#c7b3a6', visibility: 220 });
  const H = view.horizon, sun = [A * 0.3, H - 0.1];

  // sky: a gradient (cool violet-grey above, warm glow around the low sun) with torn cloud masses whose edges facing
  // the sun take a warm rim; one function, painted with paintFrom AND reflected by the sea, so both agree
  const zenith = chroma(tone(mix({ ultramarine: 2, dioxazineViolet: 1, burntUmber: 0.5 }), 0.42), 0.7);
  const mid = tone(mix({ quinMagenta: 0.6, cadmiumOrange: 0.6, titaniumWhite: 2, ultramarine: 0.4 }), 0.68);
  const glow = tone(mix({ cadmiumOrange: 1, cadmiumYellow: 1, titaniumWhite: 1 }), 0.86), hot = tone(mix({ cadmiumYellow: 2, titaniumWhite: 1 }), 0.95);
  const cloudDark = chroma(tone(mix({ dioxazineViolet: 1, ultramarine: 2, burntUmber: 0.6 }), 0.36), 0.6), cloudMid = chroma(tone(mix({ dioxazineViolet: 1, ultramarine: 1, titaniumWhite: 2 }), 0.55), 0.6);
  const rim = tone(mix({ cadmiumYellow: 1, cadmiumOrange: 1, titaniumWhite: 2 }), 0.88);
  const base = skyColor({ top: -0.05, bottom: H, stops: [[0, zenith], [0.55, mid], [1, mixOk(mid, glow, 0.5)]] });
  const clear = (x, y) => { const d = Math.hypot(x - sun[0], (y - sun[1]) * 1.8); return mixOk(mixOk(base(x, y), glow, 0.85 * Math.exp(-((d / 0.45) ** 2))), hot, 0.9 * Math.exp(-((d / 0.12) ** 2))); };
  const cloudAt = (x, y) => { const n = fbm(x * 1.6 + 2, y * 3.2, seed + 5, 5); const gap = Math.exp(-((Math.hypot(x - sun[0], (y - sun[1]) * 1.3) / 0.3) ** 2));
    return clamp((n - 0.42 - 0.35 * gap + 0.25 * smoothstep(H - 0.05, 0.05, y)) * 4) * smoothstep(H, H - 0.12, y); };
  const sky = (x, y) => {
    const k = cloudAt(x, y); if (k <= 0) return clear(x, y);
    const e = 0.01, gx = cloudAt(x + e, y) - cloudAt(x - e, y), gy = cloudAt(x, y + e) - cloudAt(x, y - e);       // edge facing the sun?
    const facing = clamp(-(gx * (sun[0] - x) + gy * (sun[1] - y)) / (Math.hypot(gx, gy) * Math.hypot(sun[0] - x, sun[1] - y) + 1e-6));
    const body = mixOk(cloudMid, cloudDark, clamp(k * 1.3)), lit = mixOk(body, rim, facing * clamp((1 - k) * 3) * Math.exp(-Math.hypot(x - sun[0], y - sun[1]) * 1.2));
    return mixOk(clear(x, y), lit, clamp(k * 1.5));
  };
  p.phase('sky');
  paintFrom(p.layer('sky', { depth: 0 }), sky, { bounds: [-0.05, -0.05, A + 0.05, H + 0.02], sizes: [0.05, 0.025, 0.012], masses: 0, threshold: 0.025, rubIn: true,
    focal: sun, focalRadius: 0.4, flow: 0.15, chroma: 1, thick: 0.06, each: (s) => { s.drift = [0.0025, 0]; } });
  paintSun(p.layer('sun', { depth: 0.02 }), { x: sun[0], y: sun[1], r: 0.02, color: hot, halo: glow, glow: 0.16, strength: 0.6 });
  paintRays(p.layer('rays', { depth: 0.03 }), { from: sun, angle0: -1.4, angle1: -0.2, count: 6, length: 0.9, width: 0.08, color: glow, opacity: 0.14 });

  p.phase('sea');
  const G = { X: -11, D: 34, height: 5, width: 34, depth: 8 };
  // the pier is part of the same world: solids in the sea model, so waves and wood share light, perspective and brush
  const pier = pierSolids(p, { X0: 3.4, D0: 5, length: 14, angle: -0.22, width: 3, deck: 2, spacing: 3 });
  const seaColors = { ...SEA_COLORS.sunset, deep: '#121426', body: '#283350' };   // darker near water: depth
  const sea = seaSource(p, { colors: seaColors, sky, swell: 2.2, wavelength: 22, chop: 0.7, storm: 0.75, dir: 0.25, giant: G, sun: { x: sun[0], y: sun[1], color: glow }, solids: pier.solids, seed });
  const gTop = view.horizon + view.f * (view.eye - G.height) / G.D, gx0 = view.cx + view.f * (G.X - G.width / 2) / G.D, gx1 = view.cx + view.f * (G.X + G.width / 2) / G.D;
  const focal = [view.cx + view.f * (G.X + 4) / G.D, gTop + 0.03];
  paintFrom(p.layer('sea', { depth: 0.45 }), sea, { bounds: [-0.05, gTop - 0.03, A + 0.05, 1.05], sizes: [0.024, 0.012, 0.006, 0.003],
    mask: (x, y) => (sea(x, y).sky ? 0 : 1), rubIn: false, masses: 0, threshold: 0.02, flow: 0, chroma: 1, thick: 0.3,
    detail: (x, y) => 0.5 + 0.5 * Math.exp(-((Math.hypot(x - focal[0], y - focal[1]) / 0.4) ** 2)),
    each: (s, i) => { if (i.y > H) { const k = i.y - H; s.sway = 0.0008 + 0.005 * k; s.swayRoot = 1; if (i.L > 0.72) s.shimmer = 0.12; } } });

  // the woman, 13 m along the pier, on the deck (ground 2 m): the scene's eye is 0.7 m above her feet, like her photo
  p.phase('figure');
  const woman = await loadPerson('refs/woman-dress.jpg'), [fx, fy] = pier.at(11.5, -0.1);
  const W = stand(p, { x: fx, feet: fy, meters: 1.65, ground: pier.ground, name: 'woman' });
  paintPerson(p.layer('woman', { depth: W.depth }), woman, { ...W, detail: 1, harmonize: { light: '#ffd2a0', shadow: '#47465f', amount: 0.4 },
    each: (s, i) => { s.sway = 0.0015; } });

  if (guides) perspectiveGuides(p);
  p.timelapse({ start: 0.3, end: 9 });
  p.camera = (t) => ({ zoom: key(t, [[p.livingStart, 1], [p.endTime, 1.04]], ease.inOut) });
  p.wind = (t) => ({ strength: key(t, [[0, 0], [p.livingStart, 0.4], [p.livingStart + 2, 1]]) });
  return p;
}
