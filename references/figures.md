# Figures: anatomy → code

What three figure-drawing demonstrations and the classic construction books teach, and how `paintFigure` puts it into strokes. Read this before painting a person, or when a figure "looks like a robot" or "looks like a stick".

Sources studied (transcripts read in full, frames reviewed every 8–10 s):

- **Fungzau, "Easiest anatomy tutorial"** (after an artist on Xiaohongshu): the blob method.
- **NIRO, "How I practice drawing anatomy"**: gesture first, then 3D-shape structure, studied part by part.
- **Sinix Design, "Anatomy quick tips: skin"**: painting skin (value range, colour zones, edges, subsurface, rim light).
- Plates, all public domain:
  - George Bridgman, *Constructive Anatomy* (1920): interlocking block masses, the head as a box, wedges of ribcage and pelvis.
  - John Vanderpoel, *The Human Figure* (1907): tonal modelling, soft turning edges.
  - Leonardo's *Vitruvian Man*: the proportion canon.
  - Muybridge, *Animal Locomotion* plate 470: the walk cycle.

## 0. Real people come from references (read this first)

A body invented from rules reads as a mannequin: straight tubes, symmetric weight, a cap of hair. Painters paint people from a model or a photo. The skill does the same, at two levels:

| Figure in the picture | Use | What comes from the photo |
|---|---|---|
| **Large or near**: carries the picture, over about 20 % of the frame height | `paintPerson`, painting the real person from a photo | Body, pose, clothing folds, hair, light |
| **Small or far**, or animated: a walker on a path, people on a beach | `paintFigure` with `joints: poseJoints(info, …)` | The pose (weight shift, twist, asymmetry). The mannequin supplies the masses. |
| Charts, sketches, crowds of specks | `paintFigure` with a `POSES.*` preset | Nothing |

**Prepare a photo** (needs Python with `tools/requirements.txt`; downloads two Apache-2.0 MediaPipe models once into `tools/models/`):

```bash
python tools/person.py photo.jpg            # → photo.person.json (33 pose landmarks, bbox, feet) + photo.mask.png + photo.masks.jpg
```
Open `photo.masks.jpg` before using the photo. It shows the hair (red), skin (green) and clothes (blue) masks and the skeleton. Choose another photo when the person is cut by the frame, the masks miss a limb, or the skeleton is wrong.

**Paint the person:**

```js
const person = await loadPerson('photo.jpg');                 // next to the scene, with its .person.json and .mask.png
paintPerson(layer, person, { x, base, height: 0.45, harmonize: { light: '#ffd9a8', shadow: '#5f6f94', amount: 0.3 } });
paintPerson(layer, person);                                    // no x: in place, where the person is in the same photo (paint the background from the photo first)
```
How it paints: the body, big-to-small, inside the silhouette, so no stroke crosses it. The detail budget centres on the head and shoulders. Then the hair is painted as its own pass (section 4). `harmonize` pulls the photo's colours toward the scene's light and shadow; without it, a daylight photo looks pasted into a sunset. Choose photos whose light comes from the same side as the scene's light, or set `flip: true`.

**Rules for choosing the photo:** full body, with the feet visible (`paintPerson` warns when they are cut); light from the side of the scene's light; a pose that reads in silhouette; CC0, public domain, or the user's own picture. Credit the source in the scene's header.

## 1. The construction order (every source agrees)

| Step | In the studio | In `paintFigure` (`stages`) |
|---|---|---|
| 1. Gesture | One fluid line of action through head, spine and weight leg; captures movement before anatomy. Do it quickly: it fights perfectionism. | `stages: 1` — a liner along crown → spine → pelvis → weight knee → heel. |
| 2. Blobs | Three circles: **small head, medium ribcage, large pelvis**, a small waist circle between them, a neck line, a shoulder line. Limbs in **two sections** each ("elbows exist, knees exist"); thigh bases as two extra circles. Semi-transparent brush, so the overlaps show the joints like a Venn diagram. | `stages: 2` — each mass is one rounded stroke that **overlaps the next one past the joint**; painted in the half-tone, thin. |
| 3. Sticks and balls / 3D shapes | Spheres for joints, cylinders for limbs, boxes for ribcage and pelvis joined by the spine. Arm = shoulder sphere + upper-arm cylinder + elbow sphere + forearm cylinder + hand box. Leg = three sections; the thigh **slants inward to the knee**, the shin is not straight either. Hand = palm box + fingers with three joints each. | `skeleton()` — joints from a canon; thighs angled in; hands and feet as their own masses. |
| 4. Form | One light. Muscles simplified to "sweet potatoes" on the upper arm and thigh; the forearm has **long, straighter** muscles. Do not forget the **trapezius**, the slope from neck to shoulder. | `stages: 3` — on every mass: shadow side (thin), warm terminator, cool reflected light at the shadow edge, light side (thicker). Width profiles bulge where the muscle sits. Trapezius wedge on each side. |
| 5. Refine | Clean sketch over the guides; angular simplification at elbows, knees and shoulders; liquify until it looks right; details only at the end. | `stages: 4–5` — skin zones, occlusion, face planes, hair, highlights. |

## 2. Proportions (7.5-head canon, units of the figure's height H, from the soles)

| Landmark | Height above the soles | Notes |
|---|---|---|
| Crown | 1.0 | Head = H / 7.5 ≈ 0.133 H. |
| Chin | 0.87 | — |
| Shoulder line / pit of the neck | 0.81–0.82 | Shoulders ≈ 2 heads wide on a man, ≈ 1.75 on a woman. |
| Nipples | 0.73 | — |
| Elbows / waist / navel | 0.60–0.62 | — |
| Hip joints | 0.52 | The pelvis centre. |
| Wrists / crotch | 0.48–0.50 | Half the height. |
| Fingertips | 0.40 | Mid-thigh. |
| Knees | 0.27–0.28 | — |
| Ankles | 0.035 | — |

Segment lengths: thigh 0.245, shin 0.24, upper arm 0.185, forearm 0.155, hand 0.1, foot 0.13. Female: hips as wide as the shoulders, smaller ribcage, narrower waist. Child: 5–6 heads (`body: 'child'`).

**Perspective:** from below (frog view), the lower body grows and contours curve **upwards**; from above (eagle view), the head grows, the hips shrink and contours curve **downwards**. Clothing openings (sleeves, waistbands, hems) follow the same curves.

## 3. Painting skin (Sinix)

- **Low contrast.** Skin's value range is narrower than beginners expect; squint and the figure should feel unified. `skinPalette()` keeps light and shadow close.
- **Shadows darker AND redder.** Shift the hue toward red as the value drops. Plain darker orange goes green. → `shadow`, `occlusion` are lower and redder.
- **Colour zones of the face.** Ochre forehead, red middle (cheeks, nose, ears: capillaries), cool bluish jaw. → wash bands at stage 4.
- **Where skin is redder and darker.** Knees, elbows, hands and feet, sun-exposed shoulders and neck. Gradate heavily into the hands so they flow from the arm. → `blush` on knees, hands painted redder.
- **Ambient occlusion crevices.** Dark, saturated warm marks: armpits, under the jaw, between the legs, where masses meet. → `occlusion` strokes.
- **Hard edge on one side, soft on the other.** Hard on the lit silhouette, soft where the form turns into shadow. A hard edge is a line in the drawing: only put one where you would draw a line (a young face has few). → `soft` per lane.
- **Subsurface scattering.** A saturated orange band where direct light meets shadow; strongest on ears. → `terminator`.
- **Rim light and bounce.** The sky's colour bounces into the shadows. Dark skin shows the environment more (tighter highlights, more ambient colour); light skin shows the undertone zones more. → `reflected`, `ambient`, and a cool rim on the shadow-side arm.
- **Background.** Paint on a mid-tone, slightly cool ground; skin comes out too light and too orange on white.

## 4. Painting hair

Sources: painting guides on hair in oil (Painters Online, Kheder Paintings, Paintable, Escape Motions), and Sinix's notes on priming and flyaways. Hair painted "strand by strand", or as a smooth cap, reads as a wig or as baldness. Painters do this:

1. **One mass with volume, bigger than the skull.** Hair adds thickness around the head; establish its shape and values first. Block the darkest darks thin (even transparent), then the mid-tones.
2. **Locks, not strands.** Group the hair into clumps or ribbons that grow from the crown or the parting, wrap the skull, then fall. Each lock has its own light side and shadow side. Strokes follow the flow.
3. **Highlights last, selective and thick.** A band of light where the form of the head turns toward the light, crossing the locks. Smooth hair gives a sharper band; messy hair a broken one. Use opaque, heavier paint. Do not light every lock.
4. **Edges vary.** Soft where hair meets the forehead and lower cheek (skin shows through), harder over the cheekbone and where locks overlap. Never blur the whole outline: a few hard edges sell it.
5. **The silhouette is never a cut-out.** Tips break unevenly. A few flyaways with a liner leave the mass along the flow, especially in rim light.
6. **Colour.** Shadows darker and warmer, lights take the light's colour. Prime the area with a saturated tone before the hair.

In code:
- `paintPerson` paints the hair mask in a separate pass: long curved strokes along the hair's own structure (`length` up to 12 widths, `curve: 0.8`, `tolerance: 2.2`, so a lock continues through small colour changes), thick paint only on the lights, and flyaways at the edge.
- The mannequin's procedural hair in `paintFigure` follows steps 1–5: a mass larger than the skull, a thin shadow side, ribbon locks from the crown, a band of light across them, a soft hairline and flyaways. Long hair falls as a mass with broken tips that moves with `wind`.

## 5. In a landscape

- At landscape scale, a figure is **masses, not features**. Use `detail: 0.3` or lower, and no face planes, when the figure is under about 15 % of the frame height. Use `detail: 0.9` for a figure that carries the picture.
- Seen **from behind** (`back: true`), a figure looking into the scene leads the eye into it (Friedrich). It also avoids painting a face at a size where a face would be wrong.
- **Light logic.** The figure's light must come from the same direction as the scene's light: `light: [lx, ly]` pointing to the sun. Set `ambient` to the sky colour and `lightColor` to the sunlight colour.
- Give the figure a **cast shadow** on the ground, away from the light (on by default).
- **Value.** Place the figure where it contrasts with what is behind it: a dark figure against a light sky or water, or a lit figure against a dark ridge. The figure is a focal point; it gets the strongest edge contrast.

## 6. API

```js
import { paintFigure, figure, POSES, BODIES, skeleton, skinPalette } from 'painter';

// static, in any layer (painted on during the reveal between t0 and t0 + dur)
paintFigure(layer, { x, base, height: 0.45, pose: POSES.contrapposto('r'), body: 'female', turn: 0.2,
  skin: '#c99272', outfit: { top: '#4f6377', sleeves: 0.3, bottom: '#7a6648', legs: 0.34, shoes: '#2f2622' },
  hair: { style: 'long', color: '#5a3c26' }, light: [-0.85, -0.5], ambient: '#7f95b8', detail: 0.9, t0: 6, dur: 2.5 });

// alive: inside p.dynamic, a pose that changes with time (breathing, wind, walk cycles)
p.dynamic('hiker', { depth: 0.9 }, (t, L) => paintFigure(L, { ...opts, pose: POSES.walk(t * 5), turn: 1, x: 0.4 + 0.03 * t, time: t, wind: 1 }));
```

| Option | Meaning |
|---|---|
| `joints` | `poseJoints(info, { x, base, height, body, flip })`: a real pose read by `tools/person.py`; replaces `pose`/`turn`. |
| `x`, `base`, `height` | Ground point between the feet (scene units) and the full height. |
| `pose` | `POSES.stand()`, `.contrapposto('l'/'r')`, `.handOnHip(side)`, `.armsUp()`, `.reach(side)`, `.walk(phase)` (profile), `.sit()` (profile, on a seat ≈ 0.27 H high). Or your own object: `{ lean, hipTilt, shTilt, head, arms: { l: { sh, el }, r }, legs: { l: { hip, knee }, r } }`. Angles in radians from straight down, positive toward screen-right; `el`/`knee` bend the lower segment. Contrapposto = `hipTilt` and `shTilt` of opposite sign. |
| `body` | `'female'`, `'male'`, `'heroic'`, `'child'`, or `{ shoulders, hips, ribs, waist, pelvis, muscle, neck, limb, heads }`. |
| `turn` | 0 front … ±1 profile facing right/left. Profiles narrow the trunk and mirror the pose. |
| `back` | Seen from behind: no face, hair over the head, spine and shoulder-blade shadows. |
| `skin` | Mid skin colour. The palette (light, terminator, shadow, reflected, occlusion, blush, cool) is derived. |
| `outfit` | `top`, `sleeves` (fraction of the arm covered), `bottom`, `legs` (fraction of the leg covered: 0.3 shorts, 1 trousers), `dress: true` (skirt to `legs`), `shoes` (`false` = barefoot). |
| `hair` | `{ style: 'short' \| 'long' \| 'bun' \| 'none', color, length }`. |
| `light`, `ambient`, `lightColor` | Direction to the light in the picture, sky colour for the shadows, sunlight colour. |
| `detail` | 0 a few masses … 1 face planes, thumbs, rim light. |
| `stages` | 1–5: stop the construction early (charts, sketches). |
| `t0`, `dur` | Paint the figure on during the reveal, in construction order. |
| `wind`, `time` | Move the hair and skirt. |

What the procedural mannequin does not do (use `paintPerson` for these): hands with separated fingers, facial features beyond planes, foreshortened limbs pointing at the viewer, overlapping limbs crossing in front of the trunk in depth (arms are painted over the trunk). Keep poses readable in silhouette, which is good figure design anyway.
