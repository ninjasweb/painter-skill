# Engine API

Everything is imported from `'painter'` (the CLI maps it to `engine/src/index.js`). A scene module exports `default function ({ aspect, seed, ...params }) → Painting` and optionally `meta = { duration, fps, aspect, seed }`.

**Units.** x ∈ [0, aspect], y ∈ [0, 1], origin top-left, y down. All sizes are fractions of the picture height, so a scene renders identically at any resolution. Angles in radians (0 = →, π/2 = ↓, −π/2 = ↑). Colours are `[r, g, b]` sRGB 0–1; functions also accept `'#hex'` and pigment names.

## Painting

```js
const p = new Painting({ aspect, seed, ground: '#c9b89a', look: { weave: 0.16, relief: 0.5, gloss: 0.3, vignette: 0.25, grain: 0.035, lightAngle: -2.2, boil: 0, boilFps: 8 } });
p.duration = 16; p.fps = 30;
```
| Member | Purpose |
|---|---|
| `p.layer(name, { depth, ...strokeDefaults })` | New layer, drawn after all earlier layers. `depth` 0 = far … 1 = near (camera parallax only; it does not change draw order). |
| `p.dynamic(name, opts, (t, layer) => …)` | Layer rebuilt every frame — for things that move along a path. Keep it small (tens of strokes). |
| `p.phase(name)` | Tags following strokes with a stage name for `timelapse` pacing. |
| `p.sample(x, y)` / `p.valueAt(x, y)` | Colour / value already painted there (a low-res memory of the canvas). Use it to react: reflections, "a little lighter than what is under", wet pickup. |
| `p.timelapse({ start, end, weights, strokeDur, easeIn })` | Schedules every static stroke for the paint-on reveal. Call once, after all painting; afterwards `p.phaseTimes` = `{ phaseName: [startSec, endSec] }`. |
| `p.camera = (t) => ({ x, y, zoom })` | Camera centre (default `A/2, 0.5`) and zoom. |
| `p.parallax = { far, zoomFar }` | How much depth-0 layers follow the camera (default 0.25 pan, 0.55 zoom). |
| `p.wind = (t) => ({ strength, speed })` | Scales all `sway`. |
| `p.grade = (t) => ({ exposure, tint: [r, g, b] })` | Global light change over time (dusk falling, a cloud passing). |
| `p.strokeCount`, `p.layers`, `layer.hidden` | Inspection / isolating layers while working. |

## Strokes

`layer.stroke(spec)` — one mark.

| Field | Meaning |
|---|---|
| `x, y, angle, length, bend` *or* `p0, p1, p2` | Centre + direction (+ sideways bow as a fraction of length; for a horizontal stroke, negative `bend` arches upward), or explicit quadratic bezier. |
| `width`, `taper: [start, end]` | Brush width; width factors at each end. |
| `color`, `color2`, `mix2` | Paint; optional second colour on a share (0–1) of the bristles. |
| `opacity`, `pickup` | Coverage; 0–1 of the underlying colour dragged into the stroke (wet-into-wet). |
| `brush` | Preset name or object. Overridable fields: `bristles, soft, fray, dry, thick, load`. |
| `sway, swayRoot` | Wind amplitude (scene units); 0 = anchored at `p0` (grass) … 1 = whole stroke moves (leaves). |
| `drift: [vx, vy]` | Constant velocity, units/second (clouds 0.002–0.005). |
| `shimmer` | 0–1 flicker of opacity (water glints, rays). |
| `depth`, `seed`, `t0`, `dur` | Per-stroke overrides; `t0/dur` are normally set by `timelapse`. Dynamic strokes honour them too — set `t0`/`dur` by hand to have a moving subject painted on during the reveal. |

`layer.scatter(opts)` — cover an area. `bounds [x0,y0,x1,y1]`, `spacing` (≈ 0.35–0.45 × stroke width for full coverage), `mask` — `(x, y) → 0…1` or a constant 0…1 (the shape; fractional values thin the strokes out → soft edge), `order` (`'random' | 'down' | 'up' | 'left' | 'right' | 'sweep'`), `jitter` (random angle), any stroke field as a constant **or** `(x, y, rand) → value`, and `each(spec, x, y, rand)` for last-moment edits (return `false` to skip). `rand` is the layer's seeded generator: `rand()` → 0…1, `rand.range(a, b)`, `rand.pick(array)`, `rand.int(a, b)`, `rand.gauss()`; the same object is `layer.rand`, and `rng(seed)` makes a private one.

`layer.path(points, opts)` — a chain of overlapping strokes along a polyline: `width` may be a function of `t ∈ [0,1]`; `color`, `opacity`, `thick`, `dry`, `sway` may be functions `(t, x, y, rand)`; every other stroke field is a constant. Also `step` (stroke length), `overlap`, `wobble`.

### Brushes (`BRUSH`)

| Name | Character | Use for |
|---|---|---|
| `flat` | wide, streaky, square ends | skies, water, trunks, block-ins |
| `filbert` | rounded, softer | cloud bodies, hills, soft masses |
| `round` | tapered | branches, ripples |
| `liner` | thin, long taper | grass, twigs, glints, sketch lines |
| `fan` | separate hairs, dry | pine needles, grass texture, scumbling |
| `dab` | short loaded touch, thick | leaves, cloud lights, highlights, gravel |
| `knife` | hard-edged slab, thickest | rocks, walls, snow, bold highlights |
| `rag` / `wash` | airbrush-soft, thin | toned grounds, glows, rays, mist, blending |
| `scumble` | very dry and broken | haze over dry paint, bark, texture |

`node bin/paint.mjs still examples/brush-chart.js` renders all of them.

## Colour

| Function | Use |
|---|---|
| `mix({ pigment: parts, … })` or `mix([[colour, parts], …])` | Subtractive (spectral Kubelka–Munk) mixing. Pigments: `titaniumWhite, cadmiumLemon, cadmiumYellow, hansaYellow, indianYellow, nickelYellow, yellowOchre, transYellowOxide, rawSienna, cadmiumOrange, cadmiumRed, permanentCrimson, alizarin, quinMagenta, dioxazineViolet, burntSienna, transRedOxide, burntUmber, rawUmber, ultramarine, cobaltBlue, prussianBlue, ceruleanBlue, cobaltTeal, turquoise, phthaloGreen, sapGreen, viridian, ivoryBlack, payneGrey`. |
| `tone(c, L)` | Same paint at an exact value — how every mix is placed on the value plan. |
| `shift(c, dL, dC, dH)` | Small steps: `shift(c, 0.05)` a touch lighter. |
| `chroma(c, k)` | Multiply saturation. `earth(c, amount, pigment)` knocks it back with an earth colour. |
| `temper(c, ±amount)` | Warmer / cooler at the same value. |
| `atmosphere(c, d, air)` | Aerial perspective for distance `d` 0…1. |
| `mixOk(a, b, t)`, `ramp(t, stops)` | Perceptual blends for gradients across the picture (not pigment mixing). |
| `vary(c, rand, dL, dC, dH)` | Per-stroke variation — no two strokes the same mix. |
| `value(c)`, `toLch(c)`, `lch(L, C, h)`, `hex`, `toHex` | Inspect / construct. |

Useful mixes: natural green `ultramarine + transYellowOxide`; sap-like dark `phthaloGreen + transRedOxide`; chromatic black `phthaloGreen + permanentCrimson` or `ultramarine + burntUmber`; sunset violet shadow `dioxazineViolet + ultramarine + burntSienna`; warm cloud light `cadmiumOrange + cadmiumYellow + white`.

## Subject painters

Shapes: `ridge({ y, amp, freq, seed, rough, slope }) → (x) → y` (rolling hills, shores, plateaus) · `peaks({ y, height, count, seed, x0, x1, sharp, jag, saddle, main }) → (x) → y` (pointed alpine summits — use this, not `ridge`, as `top` for `paintMountains`; `y` is the BASE line of the range, the tallest summit reaches `y − height`; set `x1` to `A + 0.1`; `sharp` 0.6 broad … 1 default … 1.6 needle-like; `jag` 0 smooth flanks … 0.12 default … 0.3 very broken; `saddle` 0…0.6 (default 0.3) = height of the passes between summits as a share of `height`, 0 gives isolated pyramids; `main` = x of the tallest summit, so you can put it on a third; the range exists only between `x0` and `x1` and tapers out at both ends — narrow them to leave part of the horizon open, e.g. for a low sun) · `cumulusShape({ x, y, w, h, lobes, towers, seed, light })` · `clumpShape({ x, y, w, h, lobes, seed, light })` → `Lobes` with `.density(x,y)`, `.lit(x,y)`, `.tangent(x,y)`, `.bounds`, `.outline()`. `trace(fn, x0, x1, n)` samples a function to points. `light` is a vector pointing *towards* the light, e.g. `[-0.55, -0.83]` = up-left. Painters that take `lightX` instead use −1 = light comes from the left (left-facing sides are lit), +1 = from the right.

| Painter | Key options |
|---|---|
| `skyColor({ top, bottom, stops, sun })` → `(x,y) → colour` | vertical ramp + optional glow `{ x, y, color, reach, strength, squash }` |
| `paintSky(layer, { color, top, bottom, size, blend, drift })` | criss-cross thin block-in + soft blending pass |
| `paintSun(layer, { x, y, r, color, halo, glow, strength })` | wide soft glow + a clean bright disc; `color` must be the lightest value in the picture (≥ 0.93) and the sky right behind it must be darker than the disc, or it reads as a grey moon; `halo` = glow colour, `glow` = glow radius, `strength` = glow opacity 0…1 |
| `paintMoon(layer, { x, y, r, color, shade, glow, glowColor, strength, phaseX })` | a true round disc with a cool halo — also for a large pale sun. `shade` = colour of its darker side/mottling, `glow` = halo radius in scene units (0 = none), `strength` = halo opacity 0…1, `phaseX` −1…1 = which side is lighter |
| `paintCumulus(layer, shape, { shadow, mid, light, highlight, size, drift, detail, soften })` | body → lit dabs → rim highlights → underside |
| `paintCloudBank(layer, { top, bottom, colorTop, colorBelow, size, lump, edgeLight, drift, seed, x0, x1 })` | long lumpy band; `top/bottom` are functions of x; colours may be `(x,y) → colour`. `edgeLight` (colour or `(x) → colour/null`) must be only a small value step above `colorTop`, or it reads as white dashes |
| `paintCloudMass(layer, { bounds, cover(x,y), scale, dark, mid, rim, light: [x, y], size, rimWidth, rimAmount, drift, seed })` | large ragged dark cloud masses for dramatic / sunset / storm skies, lit only on the edges that face the light. `cover(x, y) → 0…1` says where the composition wants cloud: below ≈ 0.15 clear sky, ≈ 0.25 broken scattered cloud, above ≈ 0.35 solid — for separate masses build it from a few soft blobs that fall to 0 between them (and subtract a blob for a luminous gap) rather than one wide band. `rimWidth` 0.02–0.05 (default 0.035) = how far the light bites into an edge; `rimAmount` 0.5–2 (default 1) = how many lit touches; the glow is a soft gradient painted into the cloud's own edge plus a broken line of round touches; keep `rim` ≈ 0.3–0.4 lighter in value than `mid` and lower `rimAmount` (0.5) for a quieter edge. `light` is the position of the sun or moon |
| `paintRays(layer, { from, angle0, angle1, count, length, color, width, opacity, shimmer })` | soft shafts from a hidden sun |
| `paintGlow(layer, { x, y, radius, color, coreColor, strength, core, shimmer, squash })` | halo + hot core for a lamp, lit window, moon, fire. Paint it after the dark behind it. Do not build glows from one long `wash`/`rag` stroke — a single stroke has bristle streaks and square-ish ends |
| `paintHills(layer, { top, bottom, color(x,y,k), size, brush, fragment, thick, soft, edge, x0, x1 })` | any land mass; `top` is a function of x, `bottom` a number or function; `k` = 0 crest … 1 bottom |
| `paintWater(layer, { top, bottom, tint, tintAmount, darken, size, glints, glintAmount, sunPath, shimmer, sway, mask, chop, crest, mirror, x0, x1, reflect })` | mirrors what is painted above `top` (number or function of x); call after sky/clouds/far shore. `chop` 0 = still water … 1–1.5 = choppy sea (wave backs with troughs, crests and a few white caps in `crest`). `sunPath: { x, width, color, edge }` is the glitter column under a sun or moon (`edge` = colour at its sides, default a darker `color`). Raise `tintAmount` to 0.4–0.6 to mute reflections on rough or night water. `mirror` 0…1 (default 0.35) = how faithfully shapes above are mirrored: 0 = long blended drags (soft bands of colour), 0.8–1 = short drags that keep peaks, trees and houses recognisable. Mirror-lake recipe: `mirror: 1, tintAmount: 0.1, size: 0.02, glintAmount: 0.2` — shapes come back upside-down and recognisable but with broken, dragged edges (it is painted water, not a photograph); the mirror needs value contrast above the waterline to show (light peaks against a darker sky, or the reverse). The mirror works from a low-resolution memory of the canvas, so small things (a moon disc, a window) are not mirrored — paint their reflection yourself: a few level `round` strokes of the same colour below the waterline, or `sunPath` for a sun/moon. All colour options (`tint`, `glints`, `crest`, `sunPath.color`) are colours; the amounts are `tintAmount`, `glintAmount` (0…1). `reflect(x, y) → colour` replaces the automatic mirror |
| `paintTreeline(layer, { base, height, dark, light, size, gaps, tall, thick, soft, seed })` | distant woods standing on `base(x)` |
| `paintGrass(layer, { bounds, mask, blade, dark, light, tips, density, lean, sway, lightAmount, clump })` | anchored blades, dark → light |
| `paintPine(layer, { x, base, height, trunkW, lean, lightX, boughs, bare, detail, colors })` | `colors: { barkDark, barkLight, barkShadow, needleDark, needleMid, needleLight }` |
| `paintFir(layer, { x, base, height, width, lightX, tiers, detail, lean, colors })` | fir / spruce: narrow cone of drooping tiers with a pointed leader; `colors: { trunk, dark, mid, light, snow? }` — add `snow` for snow-laden boughs. Use it for conifer forests and dark framing trees; `paintPine` is the open, bare-trunked pine |
| `paintTree(layer, { x, base, height, crownW, trunkW, lightX, colors, detail, holes })` | broadleaf; `colors: { barkDark, barkLight, dark, mid, light }`; returns the crown shape |
| `paintFoliage(layer, shape, { dark, mid, light, size, holes, sway })` | bushes, canopies, hedges from any `Lobes` |
| `birds(painting, { count, around, spread, size, velocity, depth, from, color, name })` | flapping V marks (dynamic layer); give each flock its own `name` and `seed` |
| `sketch(layer, points, { color, width, opacity })` | thin guideline drawing |
| `paintMountains(layer, { top, bottom, light, shadow, lightX, snow: { line, light, shadow }, size, facets, thick, soft, haze, hazeAmount, seed })` | each summit of the skyline sends straight arêtes down its flanks: lit plane on the side facing `lightX`, shadow plane on the other, strokes running down the fall line, base fading into `haze`. `facets` (0.06–0.2) = spacing of the secondary arêtes, smaller = more broken; `soft` = stroke edge softness (keep ≤ 0.2 for crisp planes); `light`/`shadow` may be `(x,y,k) → colour`; `snow.line` = share of the height that is snow-covered from the top |
| `paintRocks(layer, shape, { light, mid, dark, size })` | boulders from a `clumpShape`: flat light tops, steep dark sides, knife edges |
| `paintHouse(layer, { x, base, w, h, depthW, roofH, lightX, windows: 1, door: true, chimney: true, colors })` | gabled cabin/house; `colors: { wallLight, wallShadow, roofLight, roofShadow, trim, window }`; returns `{ window: [x,y], windows: [[x,y], …], chimney: [x,y] }` — put a `paintGlow` on each window at night |
| `figureStrokes(layer, { x, base, height, colors, facing, walk, lightX, opacity })` | a small figure in ~8 marks; `colors: { skin, top, topLight, legs }`; `walk` = phase in radians |
| `walker(painting, { from: [x,y,scale], to: [x,y,scale], t0, t1, height, colors, depth })` | figure walking between two points (dynamic layer); `scale` shrinks it with distance |
| `smoke(painting, { from, color, rise, lean, width, life, count, start, opacity })` | chimney smoke / rising mist (dynamic layer) |
| `boat(painting, { from: [x, y], to: [x, y], t0, t1, len, colors, rock, paintAt, mast, glow, depth, seed, name })` | small boat that is painted on at `paintAt` (seconds; pick it from `paint info` phase times), rocks (`rock` = roll in radians, default 0.05) and sails `from → to` with a smooth start and stop (bow points the way it travels); `mast` = mast height as a fraction of `len` (0 = none); if `colors.lantern` is set it hangs at the mast top with a halo of radius `glow` (default 0.1; 0.06 subtle … 0.16 strong; it only shows against dark water or sky) and a broken reflection; `colors: { hullDark, hullLight, cabin?, mast?, lantern? }`. `boatStrokes(layer, { x, y, len, a, facing, colors, t0 })` draws one (returns `{ lantern, bow }` positions) |

Typical sizes (fractions of height): sky brush 0.06–0.08 · cloud dabs 0.022–0.035 · far treeline 0.009–0.016 · hill strokes 0.02–0.03 · grass blade 0.045–0.06 · hero-tree leaf dab ≈ height × 0.035.

## Writing a new subject painter

Follow the same recipe every existing painter uses (read `engine/src/paint/*.js` — each is 20–60 lines):

1. **Shape**: a function or `Lobes` that answers "inside?" (0…1, soft at the edge) — add noise to the edge so no outline is perfect.
2. **Form**: a "how lit is this point" value 0…1 from one light direction.
3. **Passes, dark to light**: (a) whole shape in shadow/mid, thin, larger marks; (b) only where lit > ~0.5, lighter, smaller, thicker; (c) only where lit > ~0.75 and near an edge, the highlight — small, few, thickest.
4. **Direction**: stroke angle follows the surface (tangent, slope, growth, flow).
5. **Variation**: `vary()` every colour, randomise width/length ±30 %, never a regular grid.
6. **Motion hooks**: pass `sway/drift/shimmer` through so the subject can live.

**Worked example — a boat in 6 marks** (the shipped `boatStrokes` is this, plus `facing`; +u is the bow end. Use inside `p.dynamic` with a rocking angle `a = Math.sin(t * 1.3) * 0.06`):
```js
function boatStrokes(L, { x, y, len, a = 0, colors, t0 }) {            // colors: { hullDark, hullLight, deck, cabin, mast }
  const c = Math.cos(a), s = Math.sin(a), P = (u, v) => [x + (u * c - v * s) * len, y + (u * s + v * c) * len];   // boat-local → scene
  const S = (o) => L.stroke({ thick: 0.6, soft: 0.1, t0, dur: 0.3, ...o });
  S({ brush: 'flat', p0: P(-0.5, -0.05), p1: P(0, 0.1), p2: P(0.5, -0.09), width: len * 0.16, color: colors.hullDark, seed: 1 });     // hull: one sagging stroke, shadow side
  S({ brush: 'round', p0: P(-0.48, -0.1), p1: P(0, 0.0), p2: P(0.5, -0.14), width: len * 0.035, color: colors.hullLight, thick: 0.9, seed: 2 }); // gunwale: the light edge
  S({ brush: 'knife', p0: P(-0.12, -0.13), p2: P(0.1, -0.13), width: len * 0.12, color: colors.cabin, seed: 3 });                    // cabin block
  S({ brush: 'liner', p0: P(0.16, -0.1), p2: P(0.16, -0.62), width: len * 0.018, color: colors.mast, seed: 4 });                    // mast
  S({ brush: 'round', p0: P(-0.45, 0.06), p2: P(0.45, 0.07), width: len * 0.05, color: [0.05, 0.06, 0.1], opacity: 0.5, soft: 0.7, thick: 0.05, seed: 5 }); // dark reflection under the hull
}
```
The pattern: a local coordinate helper, one big dark shape, one light edge, one or two blocks, one thin line, one contact shadow/reflection; fixed `seed` per mark so nothing flickers.

The built-in mountains, rocks, house and figure (`engine/src/paint/built.js`) are the model for anything constructed or faceted: block the silhouette with `scatter` + `mask`, split it into a lit plane and a shadow plane, add one dark accent and one small highlight — at painting scale that is all a painter gives them. `paintMountains` cuts its faces with crease lines (folded noise stretched down the fall line) — reuse that trick wherever planes must be angular (cliffs, ice, crystals, roofs of a town).
