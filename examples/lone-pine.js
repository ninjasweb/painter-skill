// "The neighbour's pine" — a single pine against a soft sky (after the 45-minute pine demonstration).
// Vertical format. Composition: the trunk stands off-centre (right of the middle) and leans left into the picture;
// the crown fills the upper two thirds; far woods stay low, pale and violet so the dark, warm pine comes forward.
// Light from the left: thick orange lights on the left of the trunk, cool violet darks on the right.
import { Painting, mix, mixOk, shift, tone, chroma, atmosphere, skyColor, paintSky, ridge, paintHills, paintTreeline, paintGrass, paintPine,
  sketch, trace, birds, key, ease, noise2 } from 'painter';

export const meta = { duration: 16, fps: 30, aspect: 9 / 16 };

export default function ({ aspect, seed }) {
  const p = new Painting({ aspect, seed, ground: '#e6e2d6' });
  p.duration = 16;
  const A = aspect;

  // palette (the demonstrator's tubes: titanium white, Prussian blue, dioxazine violet, turquoise, sap green,
  // burnt umber, burnt sienna, yellow ochre, cadmium orange/red/yellow)
  // Each mix is placed on the VALUE PLAN with tone(): sky 0.80–0.92 · far woods 0.70 · mid woods 0.50 ·
  // ground 0.33–0.55 · pine darks 0.24, lights 0.62 · bark lights 0.66. Light sky / mid distance / dark subject.
  const skyTop = chroma(tone(mix({ prussianBlue: 1, dioxazineViolet: 0.3, titaniumWhite: 1.6 }), 0.78), 0.75);
  const skyMid = chroma(tone(mix({ prussianBlue: 1, turquoise: 0.6, titaniumWhite: 2 }), 0.85), 0.55);
  const skyLow = chroma(tone(mix({ turquoise: 1, yellowOchre: 0.5, titaniumWhite: 3 }), 0.92), 0.45);
  const farViolet = tone(mix({ dioxazineViolet: 1, prussianBlue: 0.7, burntUmber: 0.3, titaniumWhite: 1 }), 0.68);
  const midBlueGreen = tone(mix({ prussianBlue: 1.2, sapGreen: 1, yellowOchre: 0.3 }), 0.5);
  const needleDark = tone(mix({ prussianBlue: 1.2, sapGreen: 1.5, burntUmber: 0.8 }), 0.24);
  const needleMid = tone(mix({ sapGreen: 2.5, prussianBlue: 0.6, yellowOchre: 0.8 }), 0.42);
  const needleLight = tone(mix({ sapGreen: 1.3, cadmiumYellow: 0.5, yellowOchre: 1.5, titaniumWhite: 0.3 }), 0.64);
  const barkDark = tone(mix({ burntUmber: 2, prussianBlue: 1 }), 0.2);
  const barkLight = tone(mix({ cadmiumOrange: 1, yellowOchre: 1.2, burntSienna: 1.6 }), 0.64);
  const barkShadow = tone(mix({ dioxazineViolet: 1.5, burntUmber: 1 }), 0.24);
  const groundDark = tone(mix({ sapGreen: 1.5, burntUmber: 1.2, prussianBlue: 0.6 }), 0.3);
  const groundLight = tone(mix({ sapGreen: 1.5, yellowOchre: 1.6 }), 0.56);

  const sky = skyColor({ top: -0.05, bottom: 0.86, stops: [[0, skyTop], [0.5, skyMid], [1, skyLow]] });
  const cloudy = (x, y) => mixOk(sky(x, y), '#f6f2e8', 0.75 * Math.pow(noise2(x * 3.2, y * 2.4, seed + 4), 2.2));   // rubbed-in lighter patches

  const farLine = ridge({ y: 0.83, amp: 0.012, freq: 3, seed: seed + 1 });
  const midLine = ridge({ y: 0.87, amp: 0.015, freq: 2.2, seed: seed + 2 });
  const ground = ridge({ y: 0.915, amp: 0.012, freq: 2.5, seed: seed + 3 });
  const px = A * 0.6, pineBase = 0.955, pineH = 0.9;

  // 1. sketch
  p.phase('sketch');
  const sk = p.layer('sketch', { depth: 0.3 });
  sketch(sk, trace(farLine, 0, A, 12)); sketch(sk, trace(ground, 0, A, 12));
  sketch(sk, [[px, pineBase], [px - 0.01, 0.5], [px - 0.03, 0.08]]);

  // 2. tone the canvas with the sky, lighter towards the bottom, rubbed in
  p.phase('sky');
  paintSky(p.layer('sky', { depth: 0 }), { color: cloudy, bottom: 0.9, size: 0.06 });

  // 3. far woods: pale violet idea of trees, no detail; then a nearer blue-green band
  p.phase('distance');
  const farL = p.layer('far woods', { depth: 0.2 });
  paintTreeline(farL, { base: (x) => farLine(x) + 0.03, height: 0.075, size: 0.014, seed: seed + 5, gaps: 0.0, tall: 0.25, thick: 0.08, soft: 0.6,
    dark: (x, y) => atmosphere(farViolet, 0.25, skyLow), light: atmosphere(shift(farViolet, 0.06), 0.3, skyLow) });
  const midL = p.layer('mid woods', { depth: 0.4 });
  paintTreeline(midL, { base: (x) => midLine(x) + 0.03, height: 0.085, size: 0.016, seed: seed + 6, gaps: 0.1, tall: 0.2, thick: 0.15, soft: 0.45,
    dark: shift(midBlueGreen, -0.06), light: shift(midBlueGreen, 0.07) });
  paintHills(midL, { top: (x) => midLine(x) + 0.022, bottom: 1.1, size: 0.02, fragment: 0.4, color: (x, y, k) => mixOk(shift(midBlueGreen, -0.08), groundDark, k) });

  // 4. the pine
  p.phase('pine');
  const pine = p.layer('pine', { depth: 0.8 });
  paintPine(pine, { x: px, base: pineBase, height: pineH, trunkW: 0.062, lean: -0.05, lightX: -1, boughs: 16, seed: seed + 9, detail: 1.25, bare: 0.26,
    colors: { barkDark, barkLight, barkShadow, needleDark, needleMid, needleLight } });

  // 5. foreground: dark first, light grass on top
  p.phase('foreground');
  const fg = p.layer('foreground', { depth: 1 });
  paintHills(fg, { top: ground, bottom: 1.12, size: 0.028, fragment: 0.8, thick: 0.45, color: (x, y, k) => mixOk(groundLight, groundDark, 0.45 + 0.5 * k) });
  paintGrass(fg, { bounds: [-0.05, 0.89, A + 0.05, 1.08], mask: (x, y) => (y > ground(x) - 0.004 ? 1 : 0), blade: 0.045, density: 0.9,
    dark: shift(groundDark, -0.04), light: groundLight, tips: mixOk(groundLight, barkLight, 0.4), lightAmount: 0.4, seed });
  birds(p, { count: 4, around: [A * 0.22, 0.3], spread: 0.08, size: 0.012, velocity: [0.012, -0.003], depth: 0.15, seed, from: 10.5 });

  p.timelapse({ start: 0.3, end: 10 });
  p.camera = (t) => ({ y: 0.5 - key(t, [[10, 0], [16, 0.02]]), zoom: key(t, [[10, 1], [16, 1.07]], ease.inOut) });
  p.wind = (t) => ({ strength: key(t, [[0, 0], [10, 0.15], [12, 1]]) });
  return p;
}
