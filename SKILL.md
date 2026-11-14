---
name: painterly-video
description: Paint scenes in code and turn them into video — oil-painting look built from real brush strokes (bristles, impasto, dry-brush, canvas weave), spectral pigment mixing, a paint-on reveal (the picture being painted stroke by stroke) and a "living painting" phase (wind, drifting clouds, shimmering water, parallax camera). Stack — WebGPU/WGSL instanced strokes in headless Chrome, WebCodecs + Mediabunny MP4 export, ffmpeg QA. Use when the user wants a painted / painterly / oil / hand-painted / "como pintado" animated scene, a speed-painting or timelapse-style video, an animated landscape or background, a painted look for a story/music/ambient video, or wants to study a reference painting's composition, values and palette. Triggers — "pintar", "pintura animada", "escena pintada", "óleo", "painterly", "paint a scene", "speedpaint", "living painting".
---

# Painterly video

You paint with code the way a painter paints with a brush: **decide the picture first (composition, values, palette), then lay real strokes back-to-front, look at the result, and adjust.** The engine turns those strokes into frames; nothing is a filter over a render — every mark is a brush stroke you placed.

The method was learned from four painting demonstrations (process, pine tree, painterly trees, sunset clouds) and from measuring 13 public-domain master landscapes. The distilled lessons are in `references/`; the working code is in `engine/` and `examples/`.

## Setup (once per project)

```bash
cp -R /path/to/painterly-video/engine ./painter-engine
cd painter-engine
npm ci
node bin/paint.mjs still ../path/to/scene.js --t 8          # → PNG next to the scene (stills/<scene>/)
```

Replace `/path/to/painterly-video` with the folder containing this `SKILL.md` (for example `~/.claude/skills/painterly-video`). Needs Node ≥ 22.12, Google Chrome with WebGPU (or `CHROME_PATH`), ffmpeg and ffprobe. Reference studies additionally need Python with `tools/requirements.txt`. No build step or rendering API keys; rendering runs on local hardware. Start a new scene by copying the closest file in `examples/` (`sunset-river.js` sky/clouds/water · `lone-pine.js` vertical, single subject · `lake-path.js` trees/depth/path · `sunset-study.js` dramatic sky of dark cloud masses with rim light (a study of a demonstration's structure) · `mountain-hamlet.js` mountains, cabin, rocks, walking figure, smoke · `from-photo.js` painted from a photo with `paintFrom` · `figure-chart.js` people: construction stages and poses · `people-landscape.js` real people placed with perspective · `sea-pier.js` a storm after Aivazovsky · `brush-chart.js` brushes and mixes).

## Workflow — do not skip the looking steps

1. **Brief — ask before painting.** Subject, mood and time of day, plus the three delivery options below. Ask the user for every option the request does not state, in one message, with the choices and the default. If you cannot ask (non-interactive run), use the defaults and state them in your report.

   | Option   | Choices                                                                                                                                                                                                                                                                                          | Default          | Render flag                                    |
   | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------- |
   | Format   | 16:9 landscape 1920×1080 · 9:16 vertical 1080×1920 · 1:1 square 1080×1080 · 4K 3840×2160                                                                                                                                                                                                         | 16:9             | `--size`                                       |
   | Duration | seconds of video                                                                                                                                                                                                                                                                                 | 15 s             | `--duration`                                   |
   | Opening  | **Finished artwork**: the painting is complete on the first frame and the whole video is the living painting · **Painting process**: painted stroke by stroke from the toned canvas, then it comes alive · **Final pass**: opens on the nearly finished picture and paints only the last details | Finished artwork | `--opening finished \| paint-on \| final-pass` |

   Always write the scene with `p.timelapse()` and key motion to `p.livingStart`/`p.endTime` (skeleton below): the same scene then renders in any opening, size and duration, chosen only by flags.

2. **Study a reference when one exists** (`tools/study.py`, see `references/composition.md`). It reports value masses, key, chroma, palette and focal point — copy the _structure_, never the picture. **When the user supplies a photo to paint** (or the drawing must be true: a real place, real mountains), paint it with `paintFrom` (`references/api.md` → _Painting from a reference_, `examples/from-photo.js`): the photo gives drawing and values; you choose the focal point, the simplification and the colour. Check the report's `focal` — 'auto' often lands on a bright sky glow.
3. **Compose before colour.** Decide the camera first: `setView(p, { horizon, eye })` — the horizon is the camera's eye level and every person, building, fence or path is placed and sized from it with `stand()` / `rowToward()` (`references/perspective.md`). Write the composition as a comment at the top of the scene: horizon height (never the middle), focal point (on a third, where the strongest value contrast and highest chroma go), the lead-in, what frames it, and a **value plan** — one value (0–1) for each big shape, in three unequal masses. `references/composition.md`.
4. **Palette from pigments, placed on the value plan.** `tone(mix({ ultramarine: 1, transYellowOxide: 1 }), 0.42)`. Keep chroma low everywhere except the focal accent (masters: mean OKLab chroma 0.02–0.06, high-chroma area under ~8 %).
5. **Paint back to front** with the subject painters (`paintSky`, `paintCumulus`, `paintHills`, `paintMountains`, `paintWater`, `paintTreeline`, `paintPine`, `paintFir`, `paintTree`, `paintGrass`, `paintRocks`, `paintHouse`, `paintGlow`, `paintMoon`, `walker`, `boat`, `smoke`, `paintFigure`/`figure` for people, `seaSource` for seas and surf…) and raw `layer.scatter/stroke/path` for anything else. People: read `references/figures.md` first. A person who carries the picture is painted from a real photo (`tools/person.py` → `loadPerson` → `paintPerson`), never invented; the procedural `paintFigure` is for small or distant figures, with a real pose from `poseJoints`. One `p.phase('name')` per stage, layers created far → near. `references/api.md`.
6. **Look, critique, adjust — at least two rounds.** Render a still, open the PNG, and judge it like a painting: squint (do the three value masses read?), is the focal point where planned, is anything equally spaced / equally sized / equally saturated, does any mark look mechanical? Fix the _cause_ in code. Run `study.py` on your own still and compare with the plan. This loop is the skill; first renders are never right.
7. **Time.** `p.timelapse()` for the reveal (used by the _paint-on_ and _final-pass_ openings, skipped over by _finished_), then motion: `sway`, `drift`, `shimmer`, `p.wind`, `p.camera` (parallax by layer depth), `p.dynamic` for things that travel. `references/animation.md`.
8. **Contact sheet, then render.** `still --n 12 --sheet --opening paint-on` → check every stage of the painting (do this even when delivering _finished_: it shows each phase); then `render --size … --duration … --opening …` with the brief's choices → `qa`. `references/pipeline.md`.
9. **Report honestly**: what was checked automatically, what you looked at, what you did not.

## Scene skeleton

```js
import {
  Painting,
  mix,
  tone,
  mixOk,
  skyColor,
  paintSky,
  ridge,
  paintHills,
  paintGrass,
  key,
  ease,
} from "painter"
export const meta = { duration: 16, fps: 30 }

export default function ({ aspect, seed }) {
  // aspect = width / height of the render
  const p = new Painting({ aspect, seed, ground: "#c9b89a" }) // toned canvas, never white
  p.duration = 16
  const A = aspect // scene units: x 0…A, y 0 (top) … 1 (bottom)

  const skyTop = tone(mix({ ultramarine: 2, titaniumWhite: 2 }), 0.72),
    skyLow = tone(mix({ cadmiumOrange: 1, titaniumWhite: 3 }), 0.88)
  const hillCol = tone(mix({ ultramarine: 1, burntUmber: 1 }), 0.3)
  const hill = ridge({ y: 0.68, amp: 0.05, freq: 2, seed })

  p.phase("sky")
  paintSky(p.layer("sky", { depth: 0 }), {
    color: skyColor({
      top: 0,
      bottom: 0.7,
      stops: [
        [0, skyTop],
        [1, skyLow],
      ],
    }),
    bottom: 0.72,
  })
  p.phase("land")
  paintHills(p.layer("hill", { depth: 0.6 }), {
    top: hill,
    color: (x, y, k) => hillCol,
    size: 0.03,
  })
  paintGrass(p.layer("grass", { depth: 1 }), {
    bounds: [0, 0.8, A, 1.05],
    dark: hillCol,
    light: tone(hillCol, 0.5),
    blade: 0.05,
  })

  p.timelapse({ start: 0.3, end: 10 }) // the painting process (shown with --opening paint-on / final-pass)
  // key motion to p.livingStart (picture complete) and p.endTime (last frame): correct for every opening and --duration
  p.camera = (t) => ({
    zoom: key(
      t,
      [
        [p.livingStart, 1],
        [p.endTime, 1.07],
      ],
      ease.inOut,
    ),
  })
  p.wind = (t) => ({
    strength: key(t, [
      [0, 0],
      [p.livingStart, 0.15],
      [p.livingStart + 2, 1],
    ]),
  })
  return p
}
```

## Rules that make it look painted (the short list)

1. **Value does the work, colour gets the credit.** Plan three unequal value masses; squint-test every still.
2. **Toned ground, never white.** Pick the imprimatura to harmonise the picture (warm sienna under greens, pale cream under a sunset).
3. **Distance first, then forward.** Far = lighter, cooler, greyer, softer, thinner paint, smaller marks. Near = darkest darks, highest contrast and chroma, thickest paint, biggest marks. Use `atmosphere(color, d, air)`.
4. **Darks first and thin, lights last and thick.** `thick` 0.1–0.3 for shadows and distance, 0.8–1 for highlights; highlights are small and few.
5. **Light against dark, dark against light.** Break every mass with marks one small value step (±0.05) from what is under them; `p.valueAt(x, y)` / `p.sample(x, y)` tell you what is there.
6. **Strokes follow the form**: around a cloud lump, along a slope, flat on water, up a blade of grass, down a trunk.
7. **Mix greens and earth them** (`earth(mix({ ultramarine: 1, cadmiumYellow: 1 }), 0.3)`); save pure chroma for one accent.
8. **Vary everything**: sizes, spacing, heights, intervals. Equal = mechanical. Odd groups, overlapping shapes, one dominant.
9. **Lost and found edges**: soft where forms turn away or recede (`soft` 0.5+), crisp at the focal point.
10. **Pure function of time.** A scene is deterministic from `seed`; a frame depends only on `t`. Never use `Math.random()` or wall-clock time — use `layer.rand` / `rng(seed)`.

## Where things go wrong (learned building this)

- **White swallows mixes.** The spectral mixer weights pigments by luminance; a 1:9 colour:white mix is nearly white. Mix the hue with little or no white, then place it with `tone(c, value)`. Cut garish results with `chroma(c, 0.5–0.8)`.
- **Clouds as balls with sticks** → many small lobes on a flat base (`cumulusShape` lobes 40–60), light on the side facing the sun only, round soft dabs, modest `thick`.
- **Pine as palm tree** → needles are rounded clumps (bursts of short fan strokes) sitting on the boughs with sky holes between, dark underneath, lights on top; boughs droop low and reach up high.
- **Trees with umbrella-spoke branches / black trunks** → limbs must end inside the crown; trunk darks are value ~0.22, not black, and get air (`atmosphere`) with distance.
- **A whole area in saturated colour** (orange ground, turquoise sky) → earth it; scatter the pure colour as a few small marks.
- **Path reads as a river** → warm light grey, strokes along the direction of travel, cool violet only in its shadows.
- **Water made of short dashes looks digital** → water is long level drags blended into each other, with only a few ripple marks near the viewer (what `paintWater` does); do not add rows of dashes by hand.
- **Sea reads as a glassy mirror** → `paintWater({ chop: 1 })` for wave backs and white caps; keep `chop: 0` for lakes and rivers.
- **Lamp / window light is a flat patch** → `paintGlow` over a dark surround, then the small hot core; one long soft stroke is not a glow.
- **Rays as white spikes** → few, broad, very soft, low-opacity shafts (`paintRays` defaults).
- **Canvas weave turns into a grid** on pale thin paint → keep `look.weave` ≤ 0.2.
- **Mountains as a scaly wall or zebra stripes** → build the skyline with `peaks()`, keep the range far (thin paint, `size` ≈ 0.02, narrow value range) and let `paintMountains` split it into a few big lit and shadow planes.
- **A flat band is not a cloud bank / hill / treeline** → vary the top edge, the inside values and leave gaps.
- **Scene fails with a vague browser error** → the CLI syntax-checks first; a runtime error prints the scene line. A local variable shadowing a colour (`leaf`, `sky`, `hill`) is the usual cause of `c.map is not a function`.
- **Reading a stale still**: always check the command output for an error before opening the PNG.
- WebGPU and WebCodecs only exist on a secure origin — the CLI serves `http://127.0.0.1`; never open scenes via `file://`.

## Reference files

- `references/painting-lessons.md` — what each demonstration teaches and how it maps to engine calls.
- `references/composition.md` — composing a scene, the value plan, numbers from the masters, `study.py`.
- `references/api.md` — Painting / layer / brush / colour / subject-painter reference, writing a new subject painter.
- `references/sea.md` — the sea after Aivazovsky: what his waves show, how he painted them, and `seaSource` + `paintFrom` (a modelled sea, solids like piers, painted with his palette and glow).
- `references/perspective.md` — horizon = eye level, sizing people and objects from where they touch the ground, vanishing points, atmospheric depth, the debug guides.
- `references/figures.md` — people: gesture → blobs → form → skin, the 7.5-head canon, painting skin, poses, `paintFigure` options.
- `references/animation.md` — reveal pacing, living motion, camera and parallax, dynamic layers, boil, audio.
- `references/pipeline.md` — CLI, render settings, performance, QA, troubleshooting, deliverables.
