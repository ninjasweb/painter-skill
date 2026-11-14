// Painting from a photo reference: the photo gives the drawing and the values; paintFrom decides how it is painted
// (rub-in → value-mass block-in → masses → form → detail; fine brushes and thick paint only near the focal point).
// Reference: refs/mountain-lake.jpg — "Beautiful mountain reflection (Unsplash)", CC0, Wikimedia Commons.
//
// Composition (from the photo, checked with study.py): far shore at y ≈ 0.52, focal point on the main summit
// (42 % of the width, y 0.42), dark mass = mountains and their reflection, light mass = the glow at the left.
// Value masses of the photo 44 / 35 / 21 (dark / mid / light); the painting measures 42 / 38 / 20 with the photo's thresholds.

import { Painting, loadReference, paintFrom, key, ease } from 'painter';
export const meta = { duration: 14, fps: 30 };

export default async function ({ aspect, seed }) {
  const p = new Painting({ aspect, seed, ground: '#b9a184' });   // warm toned ground, like the glow
  p.duration = 14;
  const A = aspect;
  const src = await loadReference('refs/mountain-lake.jpg');

  paintFrom(p.layer('painting', { depth: 0.5 }), src, {
    focal: [A * 0.42, 0.42],                                      // 'auto' would pick the bright glow at the left edge
    chroma: 0.85,                                                 // a photo is more saturated than paint
    each: (s, i) => { if (i.y > 0.53) { s.shimmer = 0.1; s.sway = 0.0012; } },   // the lake breathes a little
  });
  // `paint info` prints the report: source.masses (the photo) vs model.masses (the painting), focal, strokes per level

  p.timelapse({ start: 0.3, end: 9 });
  p.camera = (t) => ({ zoom: key(t, [[p.livingStart, 1], [p.endTime, 1.05]], ease.inOut) });
  p.wind = (t) => ({ strength: key(t, [[0, 0], [p.livingStart, 0.2], [p.livingStart + 2, 1]]) });
  return p;
}
