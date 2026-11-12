# Pipeline: preview, render, QA

## Stack and why

| Stage | Tool | Notes |
|---|---|---|
| Stroke rendering | **WebGPU + WGSL** (instanced bezier ribbons, two float render targets: colour + paint height) | 30 k strokes render at ~15 fps in 1080p and ~29 fps in 720p on an Apple M3 — close to real time. |
| Finish | WGSL full-screen pass | lights the height map (impasto relief, gloss), canvas weave, grade, vignette, grain |
| Pigment mixing | **spectral.js** (Kubelka–Munk on 38-band reflectance, vendored, MIT) | real subtractive mixes on the CPU when the palette is built |
| Host | **headless Chrome** via `puppeteer-core`, page served from `127.0.0.1` | WebGPU/WebCodecs need a secure origin; flags `--enable-unsafe-webgpu --enable-features=WebGPU` |
| Encoding | **WebCodecs `VideoEncoder` + Mediabunny** (MP4 muxer), frames read back from the GPU as RGBA | hardware H.264/HEVC/AV1; streamed to disk in chunks |
| Remux / QA | **ffmpeg / ffprobe** | faststart, optional audio, optional x264 re-encode, flicker/black/freeze checks |

No frame is a screenshot: pixels are copied from the render texture (`copyTextureToBuffer`), so headless compositing quirks cannot affect the output.

## Commands (run inside the engine folder)

```bash
node bin/paint.mjs still   scene.js [--t 2,5,9 | --n 12] [--size 1280x720] [--out dir] [--sheet]
node bin/paint.mjs render  scene.js [--out video.mp4] [--size 1920x1080] [--fps 30] [--codec avc|hevc|av1|vp9]
                                    [--bitrate 16e6] [--start s] [--end s] [--audio file] [--compat] [--seed n]
                                    [--params '{"mood":"dawn"}'] [--duration s]
node bin/paint.mjs preview scene.js [--port 4173]     # scrub and play in your own Chrome
node bin/paint.mjs info    scene.js                   # strokes per layer, phase times
node bin/paint.mjs qa      video.mp4 [--still frame.png --t 5]
```
- `--size` sets the aspect: `1920x1080`, `1080x1920`, `1080x1080`, `3840x2160`. Scenes are resolution-independent.
- `--params` JSON is spread into the scene function's argument (variants: mood, season, seed-dependent layouts).
- `--compat` re-encodes with x264 to limited-range `yuv420p` bt709 (CRF 15; change with `--crf n`) — use it for anything that will be uploaded or edited. Without it the hardware-encoded stream is kept as is (full-range `yuvj420p`), fine for review.
- Default outputs: stills in `<scene dir>/stills/<scene>/t<time>.png`, video in `<scene dir>/out/<scene>.mp4`.

## Working loop

1. `still --t <end>` at 1280×720 or 1600×900 while painting (1–3 s per try). **Read the command output before opening the PNG** — on an error the old PNG is still there.
2. `still --n 12 --sheet` → one contact sheet of the whole timeline, written to `<out dir>/sheet.jpg` (blank canvas, each phase, living section).
3. `render --start 10 --end 13 --size 960x540` to judge motion cheaply, then the full render with `--compat`.
4. `qa` on the result; then extract frames from the MP4 itself and look at them:
   `ffmpeg -i out.mp4 -vf "fps=1/2,scale=480:-2,tile=4x2" -frames:v 1 sheet.jpg`

## QA

`paint qa` prints JSON with `ok: true/false` and, when false, a `problems` list saying why:

- `frames == duration × fps`, codec, size, pixel format, bitrate.
- `motion_median` / `motion_max`: mean absolute frame-to-frame difference (0–255 scale, 320 px grey copy). Typical: reveal 0.3–1, living 0.3–1, with boil 1–2. `spikes` lists instants where a frame jumps > 8× the median — a pop, a layer appearing at once, or a seed changing between frames.
- `frozen_frames`: identical consecutive frames (expected only during deliberate holds).
- `black_segments`.
- `still_psnr_db` (with `--still --t`): decoded frame vs the PNG still of the same instant (the still is scaled to the video's size, so any still size works); ≥ 30 dB means colours survived encoding (36 dB measured on the examples). Render the still and run `qa --still` with the SAME `--t`, and not the very end: the last frame of a video is at `duration − 1/fps`.

Automatic checks do not judge the painting. Always also look at: the final still, the timeline sheet, and frames pulled from the MP4. Say in your report which of these you did.

## Performance and limits

- Cost ≈ covered pixels × overlap. The examples use 30–75 k strokes; higher counts have not been measured — expect time to grow with covered area. Big soft strokes (washes, rays) are the expensive ones.
- Scene build (CPU, deterministic) is 0.2–0.5 s for 30 k strokes; it runs once per render.
- Memory is modest (one Chrome tab; ~100–150 bytes per stroke on the GPU). Do not launch several renders in parallel on an 8 GB machine.
- 4K: `--size 3840x2160 --bitrate 45e6` (stills verified; expect roughly 4× the 1080p render time).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `WebGPU not available` | Chrome too old or GPU blocked: update Chrome; set `CHROME_PATH` if Chrome is elsewhere. Verified on macOS (Apple Silicon, Metal). Linux/Windows are untested: the CLI passes Vulkan flags on Linux, and a machine without a GPU will need a software adapter (slow). |
| `Timed out … waiting for the WS endpoint`, `Navigation timeout … exceeded` | Chrome was slow to start (machine low on memory or swapping). The CLI waits up to 3 minutes for launch and without limit for the page; raise launch with `PAINT_LAUNCH_TIMEOUT=600000`, close other apps, and never run two renders at once. Stills then take tens of seconds instead of 1–3 s. |
| `Scene failed to build` + stack | Runtime error in the scene; the stack shows `scene/<file>.js:line`. Syntax errors are reported with the line before Chrome starts. |
| `c.map is not a function` | A colour argument is not a colour: undefined palette entry, a function passed where a colour is expected, or a shadowed variable. |
| `unknown pigment "…"` / `unknown brush` | Check the lists in `references/api.md`. |
| Blank or ground-only still | `t` is before the reveal reached those strokes — use `--t <duration>`; or a `mask` returns 0 everywhere (print a few values). |
| Layer missing at the frame edge during camera moves | Extend `bounds`/`x0`/`x1` beyond the frame for that layer. |
| Everything flickers | `Math.random()` or time used at build time, or missing `seed` on dynamic strokes. |
| Colours differ between still and video | Use `--compat`, and compare with `qa --still`. |
| `ffmpeg remux failed` | The raw WebCodecs MP4 is kept at the output path; check the ffmpeg install. |

## Deliverables checklist

- `out/<scene>.mp4` rendered with `--compat`, `qa.ok == true`.
- A poster still (`still --t <end> --size 1920x1080`) — the finished painting.
- The scene module (it *is* the source; anyone can re-render at another size, seed or duration).
- Timeline contact sheet and, if a reference was used, its `study` sheet next to yours.
