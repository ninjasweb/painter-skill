// Colour the way a painter handles it: named pigments mixed subtractively (Kubelka–Munk),
// then judged by value (lightness), chroma and temperature in OKLCH.
// Colours are plain [r, g, b] arrays in sRGB 0..1 ("what you see").

import { clamp, lerp } from './math.js';
import { Color as SColor, mix as spectralMix } from '../vendor/spectral.js';

export const hex = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
export const toHex = (c) => '#' + c.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');
export const col = (c) => {
  if (typeof c === 'string') return c[0] === '#' ? hex(c) : pigment(c);
  if (Array.isArray(c) && c.length >= 3) return c;
  throw new Error(`expected a colour ('#hex', pigment name or [r,g,b]) but got ${typeof c === 'function' ? 'a function' : JSON.stringify(c)} — check the colour options of the call in the stack below`);
};

const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055);

export function toOklab(c) {
  const [r, g, b] = c.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => clamp(toSrgb(v)));
}
/** [L 0..1, C ~0..0.35, h degrees] */
export function toLch(c) { const [L, a, b] = toOklab(c); return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]; }
export function lch(L, C, h) { const r = h * Math.PI / 180; return fromOklab([L, C * Math.cos(r), C * Math.sin(r)]); }

/** Value (perceptual lightness 0..1) — the thing that matters most. */
export const value = (c) => toOklab(col(c))[0];

/** Perceptual blend (for gradients across the picture: skies, atmosphere). */
export function mixOk(a, b, t) {
  const A = toOklab(col(a)), B = toOklab(col(b));
  return fromOklab([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}
/** Multi-stop perceptual gradient: ramp(t, [[0, c0], [0.4, c1], [1, c2]]). */
export function ramp(t, stops) {
  if (t <= stops[0][0]) return col(stops[0][1]);
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    return mixOk(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  }
  return col(stops[stops.length - 1][1]);
}

// ---- adjust like a painter ----
/** Set the value, keep hue/chroma. */
export const withValue = (c, L) => { const [, C, h] = toLch(col(c)); return lch(clamp(L), C, h); };
/** tone(colour, L): the same paint brought to an exact value (0 black … 1 white). Plan the picture in values
 *  first, then give every mix its place in that plan: tone(mix({...}), 0.72). */
export const tone = (c, L) => withValue(c, L);
/** Lighten/darken by a value step (+0.05 = "a gentle elevation in value"). */
export const shift = (c, dL, dC = 0, dH = 0) => { const [L, C, h] = toLch(col(c)); return lch(clamp(L + dL), Math.max(0, C + dC), h + dH); };
/** Multiply chroma (0 = grey, 1 = unchanged). "Knock the chroma back." */
export const chroma = (c, k) => { const [L, C, h] = toLch(col(c)); return lch(L, C * k, h); };
/** Push towards warm (+) or cool (−) without changing value. */
export function temper(c, amount) {
  const [L, a, b] = toOklab(col(c));
  return fromOklab([L, a + 0.06 * amount, b + 0.09 * amount]);
}
/** Atmospheric perspective: with distance d (0 near … 1 far) a colour drifts to the air colour,
 *  loses contrast and chroma. Use it on every layer behind the foreground. */
export function atmosphere(c, d, air = [0.72, 0.78, 0.9]) {
  const k = clamp(d);
  const m = mixOk(c, air, k * 0.85);
  return chroma(m, 1 - 0.25 * k);
}

// ---- pigments (approximate masstone colours of real tube paints) ----
export const PIGMENTS = {
  titaniumWhite: '#f7f5ee', cremnitzWhite: '#f3eedf',
  cadmiumLemon: '#f4e02a', cadmiumYellow: '#f8c416', hansaYellow: '#f6d525', indianYellow: '#e39a12',
  nickelYellow: '#e6d86a', yellowOchre: '#c4923a', transYellowOxide: '#b5791e', rawSienna: '#b0752f',
  cadmiumOrange: '#ee6f12', cadmiumRed: '#d5301f', permanentCrimson: '#8e1230', alizarin: '#7d1028',
  quinMagenta: '#a51b55', dioxazineViolet: '#2a1247', burntSienna: '#8a4425', transRedOxide: '#8c3a1c',
  burntUmber: '#3f2a1d', rawUmber: '#5a4a35', ultramarine: '#1b2a8c', cobaltBlue: '#1f4fa3',
  prussianBlue: '#0e2545', ceruleanBlue: '#2f7fb5', cobaltTeal: '#19a39a', turquoise: '#1aa6a0',
  phthaloGreen: '#0b4a3a', sapGreen: '#3f5a1f', viridian: '#0f6652', ivoryBlack: '#1a1917', payneGrey: '#2b3340',
};
export const pigment = (name) => { if (!PIGMENTS[name]) throw new Error(`unknown pigment "${name}"`); return hex(PIGMENTS[name]); };

/** Subtractive paint mixing on spectral reflectance curves (Kubelka–Munk, via spectral.js): blue + yellow
 *  really gives green, complements really give a dark neutral, white tints without going chalky-grey.
 *  mix({ ultramarine: 2, transYellowOxide: 1 }) → an earthy green; add titaniumWhite to tint.
 *  Parts are relative amounts. Accepts pigment names, or pairs for arbitrary colours: mix([[colorA, 2], ['#aabbcc', 1]]). */
export function mix(parts) {
  const list = (Array.isArray(parts) ? parts : Object.entries(parts)).filter(([, w]) => w > 0);
  if (list.length === 1) return col(list[0][0]);
  const m = spectralMix(...list.map(([c, w]) => [new SColor(col(c).map((v) => Math.round(clamp(v) * 255))), w]));
  return m.sRGB.map((v) => v / 255);
}
/** Two-colour paint mix by amount t of b. */
export const mixPaint = (a, b, t) => mix([[a, 1 - t], [b, t]]);

/** "Earth your greens": knock a green back with an earth pigment so it sits in the landscape. */
export const earth = (c, amount = 0.25, earthPigment = 'transRedOxide') => mixPaint(c, earthPigment, amount);

/** Small random variation around a colour (value, chroma, hue jitter) — no two strokes are the same mix. */
export function vary(c, rand, dL = 0.03, dC = 0.01, dH = 4) {
  const [L, C, h] = toLch(col(c));
  return lch(clamp(L + (rand() - 0.5) * 2 * dL), Math.max(0, C + (rand() - 0.5) * 2 * dC), h + (rand() - 0.5) * 2 * dH);
}
