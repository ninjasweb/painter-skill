# The sea, after Aivazovsky

How to paint waves the way Ivan Aivazovsky built them, and how the engine does it. Read this before painting any sea, lake in a storm, or shore with surf.

Sources:

- **Paintings** (public domain, Wikimedia Commons; measured with `study.py` and studied at full resolution):
  - *The Ninth Wave* (1850);
  - *The Black Sea* (1881);
  - *Storm at Sea on a Moonlit Night*;
  - *The Wave* (1889), with a detail;
  - several storms (1880, 1899).
- **Lessons** (transcripts and frames):
  - Alexander Yakov (Crimea), "How to paint storm on the sea", presented by AlexAnd Alexei;
  - Aiymoonchild, recreating an Aivazovsky in glazing technique;
  - Daria Mars, "Aivazovsky in 15 minutes: a technique that was forgotten".
- **Writing:** Russian Life, on his glazing; biographies (he painted the sea from memory).

## 1. What his seas show

| Measured or seen | Rule |
|---|---|
| Value: the sky is lighter than the sea (*The Black Sea*: top 0.82, middle 0.59, bottom 0.42); masses close to thirds | Paint the sea darker than the sky. The horizon is low, the sky large. |
| Chroma 0.034–0.055 (very low); lights warm, darks cool (*Ninth Wave*: warmth of lights +0.93, darks +0.36; moonlit: lights +0.86, darks −0.95) | Greys of blue, green and violet. The only saturated note is the glow in the crests. |
| Each wave: a dark front face, a lighter back catching the sky, a thin broken line of foam on the crest | Faces dark, tops light, foam as a line, not a blob. |
| *Ninth Wave*: the giant wave is violet at the base, **emerald just under the crest**, foam cream above, spray the colour of the sky | Light passes through the thin top of a wave. Strongest against the light (contre-jour): the "pyramid" of the lesson, its light side brightest. |
| Foam lace: veins and webs running down and across the faces | Drawn last, with a thin brush, following the face. |
| Waves shrink and crowd toward the horizon; the far sea is a dark band with tiny marks and a light line at the horizon | Perspective plus haze. A band of light behind the horizon separates the sea from the sky (lesson). |
| The light path: glints on the crests in a band under the sun or moon | Specular light only on facets that mirror the light. |

## 2. How he painted (from the lessons)

1. **A smooth white ground, thin paint** (Daria Mars): a sanded white panel. Thin layers let the white shine through, which is why his water glows from inside.
2. **Cover the canvas, then blend with a wide brush** (Yakov), wiping the brush at every pass so the colours flow into each other. No bare canvas.
3. **Values first** (Aiymoonchild): a grisaille in greys (clouds light, sea dark), then **glazes**: turquoise over the sea, deep blue in the troughs, warm in the sky.
4. **Transparency of the wave:** turquoise + white + a touch of yellow, laid with a small brush on the side the light passes through, then smoothed with a big brush. Repeat until it glows.
5. **Foam last:** the web of foam with a thin brush and dry paint. Thick paint only here and on the brightest spray.
6. **Far water quieter:** less contrast and detail toward the horizon; keep the strongest contrast at the centre of interest.

## 3. In the engine

The waves are not invented stroke by stroke. A sea is too many sizes of wave at once, and rules made it read as bands or hills. The skill models the sea and paints the picture of it with `paintFrom`:

```js
setView(p, { horizon: 0.6, eye: 2.7 });                      // eye = camera height above the SEA, m (low = waves look big)
const pier = pierSolids(p, { X0: 3.4, D0: 5, length: 14, angle: -0.22, width: 3, deck: 2 });   // optional solids in the same world
const sea = seaSource(p, { colors: SEA_COLORS.sunset, sky, swell: 2.2, wavelength: 22, chop: 0.7, storm: 0.75, dir: 0.25,
  giant: { X: -11, D: 34, height: 5, width: 34, depth: 8 }, sun: { x, y, color }, solids: pier.solids });
paintFrom(p.layer('sea', { depth: 0.45 }), sea, { bounds: [-0.05, H - 0.1, A + 0.05, 1.05], sizes: [0.024, 0.012, 0.006, 0.003],
  mask: (x, y) => (sea(x, y).sky ? 0 : 1), rubIn: false, masses: 0, threshold: 0.02, flow: 0, thick: 0.3,
  detail: (x, y) => …, each: (s, i) => { s.sway = …; if (i.L > 0.72) s.shimmer = 0.12; } });
```

- **`seaSource`** casts a ray from the camera for every point and marches to the water. The surface is a sum of long-crested wave trains (swells peaked like trochoids, chop rounder, close in direction, so they form ridges and not peaks), plus an optional **giant** wave: a long ridge with a steep front. Big waves hide what is behind them, and a giant wave can rise above the horizon. Shading follows section 1:
  - **Reflection:** the sky is reflected by angle (Fresnel), so the sky function is reflected exactly.
  - **Water colour:** dark troughs.
  - **Glow:** green light through thin, steep, backlit crests.
  - **Foam:** whitecaps on steep crests (patchy, where the wind breaks them) and a lace of veins on the faces.
  - **Glitter:** sun glitter on mirroring facets.
  - **Haze:** toward the horizon.
- **Solids** (`pierSolids`, or your own boxes `{ cx, cz, y0, y1, hw, hl, ang, color, lit, planks }`) are ray-traced in the same world. Piles, deck and beams share the light, the perspective and the brush with the water, and the waves pass in front of and behind them correctly.
- **Painting it:** `paintFrom` with `masses: 0` (the sea's structure is in subtle values that massing would flatten), a low `threshold`, and a detail budget spread over the whole water with more at the centre of interest. Use `flow: 0` so calm areas are laid in horizontal strokes, low `thick` (thin paint), `each` for living motion (sway that grows toward the viewer, shimmer on the lights), and a light, smooth ground: `new Painting({ ground: '#e9e3d7', look: { relief: 0.22, weave: 0.06 } })`.
- **The sky:** use one function for the sky, painted with `paintFrom` and passed to `seaSource` as `sky`, so the water reflects the painted sky.
- **Tuning fast:** evaluate `seaSource` directly in Node and save the image (no painting, about 10 s at 640×360), then paint once the model looks right.
- **Palettes:** `SEA_COLORS.storm` (grey-green day storm), `.sunset` (violet troughs, emerald glow, cream foam), `.moon` (blue-black, cold foam).
- **Older helpers:** `paintSea` (rolling stroke-built waves, dynamic) and `paintSeaBase` still exist for distant or stylised water, but `seaSource` + `paintFrom` is the method that reads as Aivazovsky.

## 4. Limits

- **Motion:** the sea is painted once. Its motion is the living painting (sway, shimmer, drifting sky), not waves travelling. Re-rendering the source per frame is possible (pass `time`) but costs the full paint each frame.
- **Breaking curls:** a heightfield cannot overhang. Big breakers read as a glowing ridge with foam on top, not as a curling lip. Add a lip with strokes if a wave must visibly break.
- **Ships, rocks and people** must be placed with the same `setView` (see `references/perspective.md`), so their waterline sits where the sea is at their distance.
