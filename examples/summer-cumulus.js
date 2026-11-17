// "Summer cumulus" — a towering cumulus over a summer plain, painted with the alla-prima cloud method.
// Composition: horizon low (0.80) so the sky is the subject. Focal point: the sunlit top of the main tower on the
// left third (x ≈ A/3), where the lightest light meets the darkest blue of the zenith — the strongest contrast in
// the picture. A second, smaller cumulus on the right and a row of small, flattened distant clouds whose bases sink
// towards the horizon give the sky depth (cloud bases share one level, so in perspective the far ones sit lower,
// smaller, flatter, greyer and closer together). The dark land band frames the light from below.
// Value plan (three unequal masses): sky 0.40 → 0.66 (mid, ~45 %) · clouds 0.70 → 0.97 (light, ~30 %) ·
// land 0.22 → 0.48 (dark, ~25 %). Chroma: the sky is the only saturated area; land is earthed, clouds near neutral.
import { Painting, mix, mixOk, lerp, smoothstep, noise2, tone, chroma, earth, atmosphere, skyColor, paintSky, billowCloud, paintBillowCloud, cloudPalette, CLOUD_STAGES,
  ridge, paintHills, paintTreeline, paintGrass, sketch, trace, key, ease } from 'painter';

export const meta = { duration: 18, fps: 30 };

export default function ({ aspect, seed }) {
  const p = new Painting({ aspect, seed, ground: '#cfc6b4', look: { weave: 0.12 } });
  p.duration = 18;
  const A = aspect, H = 0.8;
  const LIGHT = [-0.75, -0.65];                                   // the sun is high, up and to the left

  // ---- palette from pigments, placed on the value plan ----
  const zenith = chroma(tone(mix({ ultramarine: 2, phthaloGreen: 0.12, cadmiumRed: 0.08, titaniumWhite: 1 }), 0.4), 0.88);
  const midSky = chroma(tone(mix({ ultramarine: 1.4, ceruleanBlue: 0.6, titaniumWhite: 2 }), 0.53), 0.88);
  const lowSky = tone(mix({ ceruleanBlue: 1, ultramarine: 0.4, yellowOchre: 0.08, titaniumWhite: 4 }), 0.68);
  const sky = (() => { const base = skyColor({ top: 0, bottom: H, stops: [[0, zenith], [0.5, midSky], [1, lowSky]] });
    return (x, y) => mixOk(base(x, y), zenith, 0.25 * clamp01((x / A - 0.55) * 1.6) * clamp01(1 - y / 0.5)); })();  // a touch darker top right, away from the sun
  const near = cloudPalette({ warm: 0.15 });
  const far = (k) => Object.fromEntries(Object.entries(near).map(([n, c]) => [n, mixOk(c, lowSky, k * (n === 'deep' || n === 'shadow' ? 0.55 : 0.3))]));
  const hillFar = chroma(atmosphere(mix({ ultramarine: 1, sapGreen: 1, burntUmber: 0.3 }), 0.6, lowSky), 0.8);
  const woods = earth(mix({ sapGreen: 2, ultramarine: 1, burntUmber: 0.6 }), 0.2);
  const field = chroma(earth(mix({ sapGreen: 2, yellowOchre: 1, cadmiumYellow: 0.5 }), 0.2), 0.75);
  const meadowDark = earth(mix({ sapGreen: 2, ultramarine: 0.8, burntUmber: 0.8 }), 0.2);
  const meadowLight = earth(mix({ sapGreen: 1, cadmiumYellow: 1, yellowOchre: 0.5, titaniumWhite: 0.6 }), 0.2);

  // ---- shapes ----
  const hero = billowCloud({ x: A * 0.35, base: 0.7, w: 0.9, h: 0.49, seed: seed + 3, light: LIGHT,
    towers: [{ x: -0.08, w: 0.17, h: 1 }, { x: 0.2, w: 0.14, h: 0.58 }, { x: -0.33, w: 0.1, h: 0.4 }] });
  const second = billowCloud({ x: A * 0.79, base: 0.735, w: 0.36, h: 0.17, seed: seed + 8, light: LIGHT, rim: 0.09,
    towers: [{ x: -0.1, w: 0.22, h: 1 }, { x: 0.22, w: 0.16, h: 0.55 }] });
  const distant = [
    { x: A * 0.04, base: 0.76, w: 0.22, h: 0.06, k: 0.6 }, { x: A * 0.66, base: 0.77, w: 0.2, h: 0.055, k: 0.7 },
    { x: A * 0.98, base: 0.775, w: 0.26, h: 0.05, k: 0.75 }, { x: A * 0.47, base: 0.785, w: 0.14, h: 0.03, k: 0.85 },
  ].map((d, i) => ({ ...d, c: billowCloud({ x: d.x, base: d.base, w: d.w, h: d.h, seed: seed + 20 + i, light: LIGHT, flat: 0.18, rim: 0.12, towers: 2 }) }));
  const hills = ridge({ y: 0.785, amp: 0.022, freq: 2.4, seed: seed + 5 });
  const treeBase = ridge({ y: 0.83, amp: 0.008, freq: 3, seed: seed + 6 });
  const fieldEdge = (x) => 0.9 + 0.025 * Math.sin(x * 2.2 + 0.6) + 0.01 * Math.sin(x * 7.3);

  // ---- 1. sketch ----
  p.phase('sketch');
  const sk = p.layer('sketch', { depth: 0.1 });
  sketch(sk, trace(hills, 0, A, 24));
  for (const c of [hero, second]) sketch(sk, c.outline(50));

  // ---- 2. sky first, the darkest blue at the top — the clouds are cut out of it ----
  p.phase('sky');
  paintSky(p.layer('sky', { depth: 0 }), { color: sky, bottom: H + 0.02, size: 0.07 });

  // ---- 3. clouds, far to near: the distant ones thin and soft, the hero last ----
  for (const d of distant) paintBillowCloud(p.layer(`far-cloud-${d.x.toFixed(2)}`, { depth: 0.05 }), d.c, { sky, colors: far(d.k), size: 0.012, detail: 0.5, drift: [0.0015, 0], phase: 'far-clouds' });
  paintBillowCloud(p.layer('second', { depth: 0.12 }), second, { sky, colors: far(0.32), size: 0.018, drift: [0.003, 0], phase: 'second' });
  paintBillowCloud(p.layer('hero', { depth: 0.15 }), hero, { sky, colors: near, size: 0.03, drift: [0.004, 0], phase: 'hero' });

  // ---- 4. land, back to front ----
  p.phase('land');
  paintHills(p.layer('hills', { depth: 0.4 }), { top: hills, bottom: 0.86, color: (x, y, k) => mixOk(tone(hillFar, 0.58), tone(hillFar, 0.5), k * 0.6 + 0.3 * (Math.sin(x * 9) * 0.5 + 0.5)), size: 0.014, thick: 0.12, soft: 0.45 });
  paintHills(p.layer('fields', { depth: 0.6 }), { top: treeBase, bottom: fieldEdge, color: (x, y, k) => { const shade = smoothstep(0.52, 0.62, noise2(x * 2.4, y * 9, seed + 4));       // cloud shadows lying on the fields
      return mixOk(mixOk(tone(field, 0.45), tone(chroma(field, 0.8), 0.33), shade), tone(atmosphere(field, 0.45, lowSky), 0.52), (1 - k) * 0.5); }, size: 0.02, thick: 0.22 });
  paintTreeline(p.layer('woods', { depth: 0.55 }), { base: treeBase, height: 0.03, dark: tone(woods, 0.3), light: tone(mixOk(woods, field, 0.5), 0.42), size: 0.008, gaps: 0.3, tall: 0.15, x0: A * 0.42, x1: A * 1.05, seed: seed + 9 });
  paintHills(p.layer('meadow', { depth: 0.85 }), { top: fieldEdge, bottom: 1.06, color: (x, y, k) => mixOk(tone(meadowLight, 0.36), tone(meadowDark, 0.2), k), size: 0.03, thick: 0.35 });
  paintGrass(p.layer('grass', { depth: 1 }), { bounds: [-0.05, 0.9, A + 0.05, 1.06], mask: (x, y) => (y > fieldEdge(x) + 0.01 ? 1 : 0), blade: 0.045, dark: tone(meadowDark, 0.22), light: tone(meadowLight, 0.5), density: 0.8, seed: seed + 11 });

  // ---- time ----
  // pace the reveal like the demonstration: the hero gets most of the time, stage by stage; the distant clouds are quick
  const pace = { sketch: 0.6, sky: 1.4, land: 1.8, 'hero-block-in': 1.6, 'hero-blend': 0.7, 'hero-lights': 1.2, 'hero-folds': 0.9, 'hero-edges': 0.9, 'hero-base': 0.4 };
  for (const st of CLOUD_STAGES) { pace[`second-${st}`] = 0.25; pace[`far-clouds-${st}`] = 0.1; }
  p.timelapse({ start: 0.3, end: 11, weights: pace });
  p.camera = (t) => ({ zoom: key(t, [[p.livingStart, 1], [p.endTime, 1.05]], ease.inOut), y: key(t, [[p.livingStart, 0.5], [p.endTime, 0.47]], ease.inOut) });
  p.wind = (t) => ({ strength: key(t, [[0, 0], [p.livingStart, 0.2], [p.livingStart + 2, 0.8]]) });
  return p;
}

function clamp01(v) { return Math.min(1, Math.max(0, v)); }
