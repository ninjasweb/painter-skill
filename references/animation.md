# Time: the reveal and the living painting

A frame is a pure function of `t`: the same `t` always gives the same pixels, so any instant can be previewed, and stills match the video.

## 1. Paint-on reveal (`p.timelapse`)

Every static stroke gets a start time in the order it was created, grouped by `p.phase()`. A stroke is drawn from its start to its end over `strokeDur` seconds.

```js
p.timelapse({ start: 0.3, end: 10 });                                   // automatic pacing
p.timelapse({ start: 0.5, end: 14, weights: { sketch: 1, sky: 2, clouds: 4, land: 3, details: 2 }, strokeDur: 0.3 });
```
- Automatic pacing gives each phase time by its stroke count and by how much canvas it covers (a full-canvas sky wash gets a fair share), with a minimum of about one second when the reveal is long enough, so block-ins feel quick and details do not drag. Pass `weights` (relative shares of the time) to direct it; a phase you leave out gets the average of the ones you listed.
- **The order you write the scene is the order the audience watches it painted.** Write it in a painter's order: sketch → toned sky → distance → middle → focal subject → foreground → details and highlights. Draw order is layer order, so creating layers back-to-front keeps both consistent.
- `scatter({ order })` decides how the hand travels: `'sweep'` (back-and-forth bands) for skies and washes, `'down'` for land and water, `'random'` for foliage and texture.
- Hold on the blank toned canvas for 0.3–0.5 s at the start, and on the finished picture for ≥ 1 s before any camera move.
- A `p.phase()` with no static strokes gets no time in the reveal; to paint a dynamic subject on, take a time from `phaseTimes` (e.g. the end of the layer it sits on) and pass it as `t0`/`paintAt`.
- `painting.phaseTimes` (also printed by `paint info`) gives each phase's start/end — use it to cut music or captions to the stages.
- If `qa` reports a motion spike during the reveal, one phase is landing too fast (typically a big sky wash): give it more time with `weights`.
- A reveal of 8–12 s suits 20–40 k strokes; longer pieces can go 30–60 s. Under ~5 s it reads as a wipe, not as painting.

## 2. Living painting

Per-stroke motion, evaluated on the GPU (free at any stroke count):

| Field | Effect | Typical values |
|---|---|---|
| `sway` + `swayRoot` | wind displacement; root 0 = anchored at `p0` | grass 0.008–0.015 (root 0) · needles/leaves 0.003–0.005 (root 0.3–1) · far trees 0.0015 · water 0.004 |
| `drift: [vx, vy]` | constant travel | clouds 0.002–0.005 (far slower than near) |
| `shimmer` | opacity flicker, random phase per stroke | glints 0.5 · sun path 0.6 · rays 0.3 |

Scene-level:
```js
p.wind   = (t) => ({ strength: key(t, [[0, 0], [10, 0.15], [12, 1]]), speed: 1 });   // still while being painted, then the air moves
p.camera = (t) => ({ x: A / 2 + key(t, [[10, 0], [16, 0.03]]), zoom: key(t, [[10, 1], [16, 1.07]], ease.inOut) });
p.grade  = (t) => ({ exposure: key(t, [[10, 1], [16, 0.9]]), tint: key(t, [[10, [1, 1, 1]], [16, [1.03, 0.97, 0.92]]]) }); // dusk deepening
```
- **Parallax**: layers with small `depth` follow the camera less (`p.parallax.far` = 0.25 by default), so a 3 % pan already separates the planes. Paint 8–10 % beyond the frame on moving layers (the painters' default bounds overscan by 0.08–0.1) or the canvas edge will show.
- Keep camera moves slow and single-purpose: a 5–9 % push-in or a 2–4 % drift over 6–10 s. Painted pictures are destroyed by fast moves.
- Keep `wind.strength` at 0–0.2 during the reveal: strokes should land where the brush puts them.
- `key(t, [[time, value], …], easing)` interpolates numbers or arrays. The default easing is `ease.inOut` (smooth start and stop between every pair of keys); pass `ease.linear` for constant speed.

### Things that travel: `p.dynamic`

```js
p.dynamic('boat', { depth: 0.5 }, (t, L) => {
  const x = 0.2 + 0.02 * t, y = 0.74 + Math.sin(t * 1.2) * 0.002;
  L.stroke({ brush: 'flat', x, y, angle: 0, length: 0.05, width: 0.012, color: hullDark, thick: 0.6, seed: 1 });
  L.stroke({ brush: 'dab', x: x + 0.005, y: y - 0.02, angle: -1.5, length: 0.035, width: 0.012, color: sailLight, thick: 0.8, seed: 2 });
});
```
Give each stroke a fixed `seed` so its bristle texture does not change between frames (inside a dynamic layer `layer.rand` is reset to the same sequence every frame, so ready-made painters such as `paintGlow` are stable there too). Ready-made painters do not take `t0`: to make one appear at a moment, gate it yourself — `if (t > 6) paintGlow(L, { …, strength: 0.5 * Math.min(1, t - 6) })`. `timelapse` does not schedule dynamic strokes. Either fade them in with `opacity` after the picture is finished (`birds()` does this with `from`), or give them `t0`/`dur` yourself so a moving subject is painted on at the right moment of the reveal (pick the time from the phase order, e.g. just after the layer it sits on).

### Hand-made "boil"

`look: { boil: 0.3, boilFps: 8 }` jitters every stroke slightly at 8 fps, like frames painted one by one (the *Loving Vincent* feel). Use 0.15–0.4; 0 (default) is a rock-steady canvas. Boil raises the bitrate needed — render with `--bitrate 24e6` or more.

### Night scenes

Dark toned ground (value ≈ 0.25, blue-violet); sky 0.18–0.32; the lightest things are small (moon, windows, lantern, glitter path) and each gets a `paintGlow`. Moonlight is cool, lamps are warm — the only warm notes in the picture. Snow or white walls by moonlight sit at value 0.55–0.68, never white. Water: `tintAmount` 0.5, `crest` a muted blue-grey, `sunPath` under the moon. Put the moon and its glitter path on layers of similar `depth`, or a camera move will slide them apart.

## 3. Pacing recipes

| Piece | Structure |
|---|---|
| 16 s loop-ish short | 0.3 s canvas · 9.5 s reveal · 6 s living with push-in |
| 30–60 s speed-paint | 80 % reveal with explicit `weights`, 20 % living; end on a 2 s hold |
| Ambient background (minutes) | no reveal (`timelapse` not called); slow drift, wind and `grade`; keep motion periodic so the end matches the start |
| Story shot | reveal only the last layers (give earlier phases weight ≈ 0.01), or start already painted and animate camera + dynamic layers |

For several shots, make one scene module per shot, render each, and join with ffmpeg (`concat` demuxer) — shots stay independent and cheap to re-render.

## 4. Sound

`paint render scene.js --audio track.mp3` muxes audio (AAC) and trims to the shorter of the two. Brush sounds, wind and water sell the illusion; cut them to `phaseTimes`. The engine does not generate audio.
