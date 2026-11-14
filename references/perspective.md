# Perspective: horizon, eye level, placing things

How to place and size everything in a scene from one camera. Read this before putting people, buildings, fences, trees in rows, roads or paths into a picture, or when something "looks pasted in", "too big" or "too small".

Sources:

- **Videos** (transcripts read in full, frames reviewed):
  - brokendraw, "How the horizon line ACTUALLY works": a summary of Rocky Kim's perspective course.
  - Kim Jung Gi, "Use the eye level to size and scale objects".
  - Proko, "How to draw above and below eye level".
  - Ian Roberts, "Dramatically increase the illusion of depth in your landscapes".
- **Writing:** James Gurney, *Eye Level* posts (Gurney Journey); Artyfactory; Creative Bloq.
- **Pictures measured** (public domain):
  - Caillebotte, *Paris Street; Rainy Day* (1877).
  - Seurat, *A Sunday on La Grande Jatte* (1884).
  - Bruegel, *Hunters in the Snow* (1565).
- **Plates** (public domain): Vredeman de Vries, *Perspective* (1604); Dürer's perspective draughtsman (1525).

## 1. The rules

1. **The horizon is the camera's eye level**, not where the sky meets the land. Looking straight ahead, it is at the centre of vision and moves with the viewer: standing raises it, sitting lowers it. There is only one horizon per picture. Decide it first, before any other line, and decide the camera height in metres with it (Kim Jung Gi: "you cannot just draw a line; first decide from what height you see").
2. **Whatever is at the camera's height stays on the horizon at every distance.** With the camera at a standing adult's eye height, every standing head on the same ground touches the horizon, near or far. Measured on Caillebotte, the heads of all the walkers, from the couple in front to the tiny figures down the street, sit within 43–47 % of the picture height, on the street's vanishing point. In Seurat the eye is slightly higher than the heads, so the far figures' heads sit a little lower and climb toward the horizon as they recede.
3. **An object keeps its ratio above and below the horizon** as it moves near or far (Rocky Kim). If the horizon crosses a person at 3/4 of their height, it crosses everyone of that height at 3/4. Hence the measuring rule: **height on the canvas = (feet − horizon) × real height ÷ camera height.**
4. **Measure everything at a spot with the camera height** (Kim Jung Gi). At any point on the ground, the span from the ground to the horizon equals the camera height. A 2 m door, a 70 cm table and a 1.8 m person at that spot are fractions or multiples of that span.
5. **Parallel lines on the ground converge to one vanishing point on the horizon.** Shores, roads, paths, fences, rows of trees and the edges of a field are straight lines toward their vanishing point. Equal real spacing (posts every 4 m) gives the gaps that shrink toward the horizon (Vredeman de Vries's chequered floors).
6. **Below the eye you see tops; above it, undersides.** Receding lines aim up for things below eye level and down for things above. Near the horizon, top planes flatten to a line (Proko).
7. **Where the camera is changes the meaning.** Eye at 0.5 m reads as a child's or a dog's view, and figures tower. Eye at 30 m reads as a window or a hill, and figures are seen from above (Bruegel looks down from a hill). Choose it on purpose; a person photographed from hip height cannot be put in a scene seen from eye height without looking pasted in.
8. **Atmospheric perspective completes linear perspective** (Ian Roberts). With distance, colours cool, lighten and lose contrast, edges and detail drop. But do not drown the distance in haze: a touch of definite colour far away pulls the eye in. Keep the strongest edges and contrast on the path you want the eye to follow.
9. **Marks shrink too.** Brush marks, grass blades and stones get smaller toward the horizon. A field painted with marks of one size reads as a wall.

## 2. In code

```js
import { setView, stand, groundPoint, rowToward, distanceAt, hazeColor, perspectiveGuides } from 'painter';

const view = setView(p, { horizon: 0.52, eye: 1.6, fov: 40, air: '#b9c3d6', visibility: 150 });   // decide first
const H = stand(p, { x: 1.2, feet: 0.8, meters: 1.78 });          // → { x, base, height, distance, depth, haze, air, eyeLine }
paintPerson(layer, person, { ...H });                               // size, haze and viewpoint check come with it
paintFigure(p.layer('walker', { depth: W.depth }), { joints: poseJoints(info, W), haze: W.haze, air: W.air, … });
for (const s of rowToward(p, { from: [x, y], vp: [vx, view.horizon], count: 10, spacing: 4, meters: 1.1 })) …   // posts, trees, people in a row
const [x, y] = groundPoint(p, { X: -3, D: 25 });                    // a spot 3 m left, 25 m ahead
if (guides) perspectiveGuides(p);                                   // stills only: horizon, ground grid, each figure's eye line
```

| Call | Returns / does |
|---|---|
| `setView(p, { horizon, eye, fov, cx, air, visibility })` | Stores `p.view`. `eye` in metres above the main ground; `fov` vertical field of view in degrees (40 normal, 60 wide); `cx` x of the centre of vision. |
| `stand(p, { x, feet, meters, ground })` | Size and depth of anything standing at canvas (x, feet): `height` (canvas units), `distance` (m), `depth` (for the layer's parallax), `haze` (0…1), `eyeLine` (where the horizon crosses it, as a fraction of its height). `ground` = height of the ground it stands on above the main ground (a terrace, a hill). |
| `scaleAt(p, y)` · `distanceAt(p, y)` | Canvas units per metre, and metres from the camera, at ground y. |
| `groundPoint(p, { X, D, ground })` | The canvas point of a spot X m across and D m ahead. |
| `rowToward(p, { from, vp, count, spacing, meters })` | Items with equal real spacing along a line to a vanishing point. |
| `hazeColor(rgb, haze, air)` | A colour pushed toward the air by distance. |
| `perspectiveGuides(p)` | A debug layer: the horizon (red), a ground grid converging to the centre of vision, and for each `stand()` its height (cyan) and eye-level tick (red). Render a still with it; never ship it. |

`paintPerson` and `paintFigure` take `haze` and `air` (spread a `stand()` result into them). `paintPerson` also takes `eyeLine` and warns when the photo's viewpoint differs from the scene's by more than 20 % of the person's height. `tools/person.py` writes the photo's `eyeLine`, estimated from a level camera: the horizon crosses the middle of the photo. Check it on the cyan line of `.masks.jpg`.

## 3. Workflow

1. Choose the camera: horizon y (never the middle of the canvas) and eye height. For a painting from a photo, the photo's horizon is the horizon: find where its receding lines meet, or where the far shore or sea line sits.
2. If people come from photos, read their `eyeLine` (`tools/person.py`) and set `eye` so they match. `eye` ≈ `eyeLine` × the person's height, or pick photos taken from the scene's eye height.
3. Lay the ground: shores, roads, paths, fields and fences as lines to vanishing points on the horizon. Marks shrink with distance; colours haze.
4. Place every figure and object with `stand()` at the spot where it touches the ground, and paint it on a layer with `depth: s.depth`.
5. Render a still with `perspectiveGuides`. Check that heads of same-height people all cross the horizon at the same fraction, that rows converge, and that nothing floats: every foot must be on painted ground at that y. Then render without the guides.
