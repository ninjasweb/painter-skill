# Painting lessons → code

What the four demonstrations teach (watched frame by frame with their narration) and how each lesson is expressed in the engine. Read this before writing a new subject painter or when a still "doesn't look painted".

## 1. The four-step process (Alpay Efe, "Paint anything in 4 simple steps")

| Step | In the studio | In a scene |
|---|---|---|
| 1. Outlines | Solve drawing/proportion/composition *before* paint, so painting is only about colour, light, texture. | Shapes are functions and constants at the top of the scene (`ridge`, `cumulusShape`, path centre lines). `sketch()` them in a first phase — it also makes the reveal read as a real painting session. |
| 2. Hardest, most important part first | Nail the focal area early; it is the hardest thing to fix later. | Get the focal subject right in isolation first (render only its layers; set `layer.hidden = true` on others) before filling the rest. |
| 3. Fill it out | Bigger brushes, looser, cover the whole surface; aim for overall harmony, not accuracy. | Large `scatter` passes with big `size`; no bare ground left except on purpose. |
| 4. Adjust, make it your own | Stop comparing to the reference; judge the painting on its own; push contrast, change colour, add or remove. | The look → critique → fix loop on stills. Change the picture, not just parameters: move the sun, drop a tree, simplify. "Painting what you see only gets you what you see." |

## 2. Sunset clouds (A Lu Art, acrylic cloud technique) — order of work, by timestamp

1. `0:00–1:30` thin violet **outline** of horizon, shoreline and cloud silhouettes.
2. `1:30–3:30` **start at the light source**: yellow-white at the sun → orange → red-violet along the horizon, blended wet. The sun band is the lightest, warmest thing; everything is judged against it.
3. `3:30–5:30` dark violet **cloud base** blended into the orange; pink glow behind where the big cloud will be; then the blue-violet **sky painted around the clouds** (negative painting), darker at the zenith.
4. `5:30–9:00` cloud **bodies** in a peach mid-tone, violet shadow underneath, edges softened into the sky.
5. `12:30–15:30` **rays**: a nearly dry brush dragged outward from the hidden sun — pale, soft, few.
6. `15:30–24:00` **turn the form**: on each lump a cream light on the side facing the sun, round dabs, then tiny thick highlights on the rims; shadows stay thin and soft.
7. `10:00–12:00`, `30:00–37:00` land last: dark far shore, **water = the sky's colours laid in flat horizontal strokes**, distant trees with reflections, foreground grasses lit warm, birds.

Checked against the demonstration's finished canvas with `study.py`: its sky is DARK-dominant (dark 47 % · mid 35 % · light 18 %), the clouds are large ragged masses rather than separate puffs, and light appears only as soft fringes on edges facing the sun plus one luminous gap. `examples/sunset-study.js` (`paintCloudMass`) follows that structure; `sunset-river.js` is the lighter, fair-weather variant.

In code: `skyColor` + a glow term centred on the sun → `paintSky` → `paintCloudBank` → `paintCumulus` (body → lights → highlights → underside) → `paintRays` → `paintHills`/`paintTreeline` → `paintWater` (it mirrors what is already on the canvas) → `paintGrass` → `birds`.

## 3. A pine in 45 minutes (Thomas Windsor) — order of work

1. **Tone the canvas with the sky**, rubbed in thin, lighter towards the bottom, not perfect ("we don't start with a blank canvas").
2. **Far trees: only an idea** — pale violet, soft, no detail. A nearer band darker and bluer-green. Two colours interacting give depth.
3. **Trunk as a dry dark scrub**: "find a value and a basic form"; wider at the base, thinner at the top.
4. **Branches**: expressive, irregular; some droop.
5. **Darkest needle masses first**, fan brush, thin paint, "let it show through" — keep sky holes.
6. **Branches again on top** of the needles, warmer (burnt sienna).
7. **Light side of the trunk**: ochre + orange + white, *thick*; dark side: violet-black. "Dark makes our light spots look lighter."
8. **Middle green, then the lightest needles** (yellow + ochre + a little green + white), with a lot of paint, only on top — "the thickest paint is closest to us".
9. Step back often; "every little brushstroke is important and yet none of them are".

In code: `paintPine` follows exactly this order. Its parameters are the decisions: `lightX`, `boughs`, `bare`, `detail`, six colours.

## 4. Painterly realism for trees (Andrew Tischler)

- **Imprimatura**: a dry burnt sienna/umber stain harmonises everything laid over it → `new Painting({ ground })`; let it peek through (dry strokes, sky holes).
- **Start in the distance and work forward**: it sets the light, cool, low-chroma end of the scale. "Depth comes from relationships" — value first, then **chroma, increasing as we come forward** → `atmosphere(c, d, air)` on every non-foreground mix.
- **Thick vs thin**: highlights thick and chunky, shadows thin. Texture makes surfaces physical: lumps of paint each catch a highlight and cast a tiny shadow (gravel, bark, fallen leaves) → `thick` drives a real height map lit by a raking light.
- **Contrast patterns**: "light against dark, dark against light" — not a checkerboard; a *gentle* value step is enough; less contrast in the distance, most in the foreground, darkest darks nearest. It "fractures the surface" and reads as realism → the `fragment` passes in `paintHills`, the three-value passes in `paintFoliage`, ±0.05 `shift()` marks over any flat mass.
- **Earth your greens**: mix from blue + yellow (ultramarine + transparent yellow oxide = natural green), knock tube/phthalo greens back with burnt umber or transparent red/yellow oxide; saturation "only here and there" → `earth()`, `chroma()`.
- **Make a mark faithful to the surface**: smooth leaves with soft brushes, rough bark and gravel with broken thick marks → choose `BRUSH` by material.

## 5. How a brush mark is built (what the renderer simulates)

- A stroke is a ribbon along a curve; across it run **bristle streaks**; ends are ragged because bristles lift at different moments.
- **Paint runs out** along the stroke (`load`): the end is drier and more broken.
- **Dry-brush** (`dry`): paint only catches the high points of the canvas tooth and the bristle tracks.
- **Two colours on one brush** (`color2`, `mix2`): unmixed streaks — richer than a flat colour.
- **Wet-into-wet** (`pickup`): the stroke takes some of what is already there → soft transitions.
- **Impasto** (`thick`): ridges between bristles and at stroke edges; the finish pass lights them and adds gloss. Thin paint lets the canvas weave show.

## 6. The gesture (seen in frame-by-frame sequences, 2 frames per second)

| What is being painted | What the hand does | In code |
|---|---|---|
| Water, far shore | One loaded brush **dragged level across the whole width**, again and again, each pass blending into the last. No dashes. | long `flat` strokes (length 6–20 × width), tiny angle jitter, `pickup`, then a `wash` blending pass (`paintWater` body) |
| Cloud highlights | The tip of a small round brush **touched repeatedly on the rim** of a lump, a few millimetres each time; the body is never touched again. | `dab`, length ≈ width, only where `lit > 0.74` and near the edge |
| Pine needle masses | A fan brush **tapped** in place many times, moving a little between taps; back to the palette every few seconds. Dense dark core, ragged edge. | bursts of short `fan` strokes around a clump centre (`paintPine`) |
| Sunlit foliage | Single small touches with a pointed round, **working the edge of the mass**, with dots of violet-dark left between the yellows. | sparse `dab` passes over the dark mass, light and dark marks interleaved (`paintFoliage`) |
| Rays | The brush barely touches, pulled outward from the light in one slow move. | few long `wash` strokes, very low opacity (`paintRays`) |
| Big simple areas (hair, background) | A wide flat brush, long confident sweeps that change direction. | large `flat` strokes with `sweep` order and ±0.25 rad jitter |

The rhythm matters for the reveal: a painter lays a handful of marks, pauses to reload, moves on. Long drags take longer than taps — `timelapse` already makes each stroke's duration vary; keep `strokeDur` 0.2–0.35 s.

## 7. Things painters do that code forgets

- Simplify. Three to five big shapes carry the picture; detail is spent near the focal point only.
- Repeat a colour elsewhere (sky colour in the water, a warm note from the light in the foreground) so the picture is one family.
- Leave things out. A far forest is a strip of two values, not trees.
- Never the same twice: no two clouds the same size, no evenly spaced trees, no horizon in the middle, no object dead centre unless the picture is about symmetry.
