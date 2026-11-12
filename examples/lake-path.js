// "By the lake's edge" — an autumn path under trees, lake and blue hills beyond (after the painterly-realism
// tree demonstration). Lessons applied: toned warm ground (imprimatura) · paint from the distance forward ·
// chroma and contrast grow towards the viewer · thick lights, thin darks · light against dark, dark against
// light · greens mixed from blue + yellow and knocked back with earth.
// Composition: the path is an S-shaped lead-in from the bottom edge to the golden poplars (focal point on the
// right third, the highest chroma in the picture); a dark trunk on the right and dark foliage on the left frame it.
import { Painting, mix, mixOk, shift, tone, chroma, earth, atmosphere, vary, skyColor, paintSky, ridge, paintHills, paintWater, paintTree, paintFoliage,
  paintGrass, clumpShape, sketch, trace, key, ease, noise2, smoothstep, clamp } from 'painter';

export const meta = { duration: 16, fps: 30 };

export default function ({ aspect, seed }) {
  const p = new Painting({ aspect, seed, ground: '#b98a63' });        // burnt sienna + umber stain, rubbed back
  p.duration = 16;
  const A = aspect, AIR = [0.80, 0.84, 0.92];

  // value plan: sky .90 · hills .66 · lake .74 · far trees .50 · poplar lights .80 · path light .66 · litter .46 · foreground darks .20
  const sky0 = tone(mix({ cobaltBlue: 1, titaniumWhite: 3 }), 0.86), sky1 = tone(mix({ nickelYellow: 0.4, cobaltBlue: 0.3, titaniumWhite: 4 }), 0.93);
  const hill = tone(mix({ ultramarine: 1.4, quinMagenta: 0.25, titaniumWhite: 1 }), 0.64);
  const lake = tone(mix({ cobaltBlue: 1, cobaltTeal: 0.25, titaniumWhite: 2 }), 0.74);
  const greenDark = tone(earth(mix({ ultramarine: 1.5, transYellowOxide: 1.2 }), 0.25, 'burntUmber'), 0.22);
  const greenMid = tone(earth(mix({ ultramarine: 1, cadmiumYellow: 1.2 }), 0.3), 0.42);
  const greenLight = tone(earth(mix({ cobaltTeal: 0.4, cadmiumLemon: 1.5, ultramarine: 0.4 }), 0.18, 'transYellowOxide'), 0.66);
  const gold = tone(mix({ cadmiumYellow: 2, transYellowOxide: 1 }), 0.8), goldDark = tone(mix({ transYellowOxide: 2, burntUmber: 0.6, ultramarine: 0.2 }), 0.48);
  const bark = tone(mix({ ultramarine: 0.8, burntUmber: 1.6 }), 0.22), barkLight = tone(mix({ ultramarine: 0.4, burntUmber: 1.2, titaniumWhite: 0.6 }), 0.46);
  const gravel = chroma(tone(mix({ burntUmber: 0.8, yellowOchre: 0.4, ultramarine: 0.15, titaniumWhite: 2 }), 0.7), 0.8), gravelShade = chroma(tone(mix({ ultramarine: 0.8, quinMagenta: 0.3, burntUmber: 0.9, titaniumWhite: 0.6 }), 0.42), 0.7);
  // the ground is EARTH (low chroma); pure orange is saved for a sprinkle of leaves
  const litter = chroma(tone(mix({ transRedOxide: 1.2, burntUmber: 1, yellowOchre: 0.6 }), 0.44), 0.6), litterLight = chroma(tone(mix({ yellowOchre: 1.5, transRedOxide: 0.5, titaniumWhite: 0.3 }), 0.6), 0.7);
  const leafCol = tone(mix({ cadmiumOrange: 1.5, cadmiumYellow: 0.6 }), 0.68);

  const shore = 0.56, hills = ridge({ y: 0.44, amp: 0.05, freq: 1.3, seed: seed + 1, rough: 0.3 });
  // the path: centre line and half-width as functions of y (wide at the bottom, narrowing as it recedes)
  const pc = (y) => A * (0.5 + 0.2 * Math.sin((y - 0.6) * 5.2) * smoothstep(1.05, 0.62, y) - 0.11 * smoothstep(0.75, 1.05, y));
  const pw = (y) => 0.02 + 0.3 * Math.pow(clamp((y - 0.6) / 0.45), 1.5);
  const onPath = (x, y) => (y < 0.605 ? 0 : smoothstep(1, 0.8, Math.abs(x - pc(y)) / pw(y)));
  const shade = (x, y) => smoothstep(0.42, 0.62, noise2(x * 3.2 + 4, y * 5.5, seed + 8));      // dappled tree shadow on the ground

  p.phase('sketch');
  const sk = p.layer('sketch', { depth: 0.3 });
  sketch(sk, trace(hills, 0, A, 16), { color: '#7a3b2a' }); sketch(sk, [[0, shore], [A, shore]], { color: '#7a3b2a' });
  sketch(sk, Array.from({ length: 12 }, (_, i) => { const y = 0.6 + i * 0.04; return [pc(y) - pw(y), y]; }), { color: '#7a3b2a' });
  sketch(sk, Array.from({ length: 12 }, (_, i) => { const y = 0.6 + i * 0.04; return [pc(y) + pw(y), y]; }), { color: '#7a3b2a' });

  p.phase('distance');   // far things first: they set the lightest, coolest, least contrasted end of the scale
  paintSky(p.layer('sky', { depth: 0 }), { color: skyColor({ top: 0, bottom: 0.5, stops: [[0, sky0], [1, sky1]] }), bottom: 0.52, size: 0.06 });
  const far = p.layer('hills', { depth: 0.1 });
  paintHills(far, { top: hills, bottom: shore + 0.01, size: 0.028, fragment: 0.35, thick: 0.12, soft: 0.5, color: (x, y, k) => atmosphere(shift(hill, -0.04 * k), 0.25, AIR) });
  paintWater(p.layer('lake', { depth: 0.15 }), { top: shore - 0.055, bottom: shore + 0.02, size: 0.016, tint: lake, tintAmount: 0.75, darken: -0.02, glintAmount: 0.6, glints: '#f4f6f4', shimmer: 0.4 });

  p.phase('middle distance');
  const mid = p.layer('far trees', { depth: 0.35 });
  const farCols = (d) => ({ barkDark: atmosphere(bark, d, AIR), barkLight: atmosphere(barkLight, d, AIR), dark: atmosphere(greenDark, d, AIR), mid: atmosphere(greenMid, d, AIR), light: atmosphere(greenLight, d, AIR) });
  [[0.08, 0.3, 0.5], [0.2, 0.34, 0.42], [0.33, 0.27, 0.5], [0.86, 0.3, 0.42], [0.97, 0.36, 0.38]].forEach(([fx, h, d], i) =>
    paintTree(mid, { x: A * fx, base: shore + 0.045, height: h, crownW: h * 0.75, trunkW: 0.012, colors: farCols(d), seed: seed + 20 + i, detail: 0.7, holes: 0.2 }));

  p.phase('ground');
  const gr = p.layer('ground', { depth: 0.6 });
  const groundCol = (x, y) => { const s = shade(x, y), pth = onPath(x, y), d = clamp((y - 0.6) / 0.45);
    const lit = mixOk(mixOk(litter, litterLight, 0.35 * noise2(x * 9, y * 14, seed + 3)), gravel, pth);
    const dark = mixOk(shift(litter, -0.14), gravelShade, pth);
    return atmosphere(mixOk(lit, dark, s * (0.55 + 0.4 * d)), 0.3 * (1 - d), AIR); };
  gr.scatter({ bounds: [-0.1, shore + 0.012, A + 0.1, 1.1], spacing: 0.011, order: 'down', brush: 'filbert', mask: (x, y) => smoothstep(shore + 0.012, shore + 0.03, y + 0.008 * noise2(x * 30, 0, seed)),
    width: (x, y, r) => (0.008 + 0.03 * clamp((y - 0.58) / 0.45)) * r.range(0.8, 1.3), length: (x, y, r) => (0.02 + 0.09 * clamp((y - 0.58) / 0.45)) * r.range(0.7, 1.3),
    angle: (x, y, r) => { const along = Math.atan2(0.02, pc(y + 0.01) - pc(y - 0.01)); return (onPath(x, y) > 0.5 ? along * 0.55 : 0) + (r() - 0.5) * 0.7; }, color: (x, y, r) => vary(groundCol(x, y), r, 0.02, 0.006, 4), thick: (x, y) => 0.2 + 0.4 * clamp((y - 0.6) / 0.4), dry: 0.15 });
  // gravel texture and fallen leaves: small thick marks, light against dark and dark against light
  gr.scatter({ bounds: [-0.1, 0.62, A + 0.1, 1.08], spacing: 0.013, brush: 'dab', mask: (x, y) => 0.45 * clamp((y - 0.6) / 0.3),
    width: (x, y, r) => 0.004 + 0.012 * clamp((y - 0.6) / 0.45) * r(), length: (x, y, r) => 0.006 + 0.02 * clamp((y - 0.6) / 0.45) * r(), angle: (x, y, r) => r() * 6.28,
    color: (x, y, r) => { const b = groundCol(x, y), leaf = onPath(x, y) < 0.5 || r() < 0.25; return vary(leaf ? mixOk(b, r() < 0.3 ? leafCol : (r() < 0.5 ? litterLight : shift(litter, -0.1)), 0.75) : shift(b, r() < 0.5 ? 0.09 : -0.08), r, 0.03, 0.01, 8); }, thick: 0.9 });

  p.phase('trees');      // the golden poplars — focal point; then the framing darks
  const pop = p.layer('poplars', { depth: 0.5 });
  const goldCols = { barkDark: atmosphere(bark, 0.25, AIR), barkLight: atmosphere(barkLight, 0.2, AIR), dark: goldDark, mid: mixOk(goldDark, gold, 0.6), light: gold };
  paintTree(pop, { x: A * 0.585, base: 0.64, height: 0.5, crownW: 0.2, trunkW: 0.016, colors: goldCols, seed: seed + 31, detail: 1.1, holes: 0.25 });
  paintTree(pop, { x: A * 0.675, base: 0.635, height: 0.44, crownW: 0.17, trunkW: 0.014, colors: { ...goldCols, light: mixOk(gold, greenLight, 0.3) }, seed: seed + 32, detail: 1, holes: 0.3 });
  const fgT = p.layer('framing trees', { depth: 0.85 });
  const nearCols = { barkDark: bark, barkLight, dark: greenDark, mid: greenMid, light: greenLight };
  paintTree(fgT, { x: A * 0.9, base: 1.08, height: 1.4, crownW: 1.0, trunkW: 0.15, colors: nearCols, seed: seed + 41, detail: 1.6, holes: 0.35, lightX: -1 });
  paintTree(fgT, { x: A * 0.16, base: 0.84, height: 0.97, crownW: 0.75, trunkW: 0.06, colors: nearCols, seed: seed + 42, detail: 1.4, holes: 0.4 });
  paintFoliage(fgT, clumpShape({ x: A * 0.07, y: 0.86, w: 0.5, h: 0.24, lobes: 10, seed: seed + 43, light: [0.5, -0.85] }), { dark: shift(greenDark, -0.03), mid: greenMid, light: greenLight, size: 0.022, holes: 0.15, seed: seed + 44 });

  p.phase('details');
  const fg = p.layer('foreground', { depth: 1 });
  paintGrass(fg, { bounds: [-0.05, 0.9, A * 0.36, 1.08], mask: (x, y) => 1 - onPath(x, y), blade: 0.06, density: 0.8, dark: shift(greenDark, -0.03), light: greenMid, tips: greenLight, lightAmount: 0.35, seed });

  p.timelapse({ start: 0.3, end: 10 });
  p.camera = (t) => ({ x: A / 2 + key(t, [[10, 0], [16, 0.025]]), y: 0.5 + key(t, [[10, 0], [16, 0.02]]), zoom: key(t, [[10, 1], [16, 1.09]], ease.inOut) });
  p.wind = (t) => ({ strength: key(t, [[0, 0], [10, 0.15], [12, 1]]) });
  return p;
}
