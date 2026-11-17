# Documentation media

Selected from the most recent available iterations of the painter working project on November 11, 2026, with Sunset Lake, Last Light and Summer Cumulus replaced or added on November 16, 2026. The project provides evidence of the skill in use; its working directories and duplicate engines are not part of this repository.

| Published asset | Source within the working project | Selected version |
| --- | --- | --- |
| sunset-lake.jpg, MP4, GIF, and timeline | Scene agent-test-12/sunset-lake.js (cold test, November 16, 2026) | Re-rendered unchanged with the current engine: `--opening paint-on --duration 8 --size 1920x1080 --compat`; timeline `--n 12 --sheet` at 960 × 540. |
| last-light.jpg, MP4, and GIF | Scene agent-test-13/last-light.js (cold test, November 16, 2026) | Re-rendered unchanged with the current engine: `--opening paint-on --duration 10 --size 1920x1080 --compat`. |
| blue-hour-lake.jpg and MP4 | agent-test-6/blue-hour-lake.mp4 | Final MP4 from 17:41. |
| alps-morning.jpg | agent-test-9/stills/alps-morning/t008.00.png | Latest available still, 22:38. No MP4 was available. |
| summer-cumulus.jpg and MP4 | `examples/summer-cumulus.js`, `--seed 4 --opening paint-on --duration 16` | Rendered with the current engine on November 16, 2026; poster at 15.966 s. |
| studies/*_study.jpg | Images published in this directory | Regenerated using this skill's study.py tool. |

## Preparation

- Posters for the animations were extracted at duration minus 1/30 second from the source MP4, before video compression. This avoids relying on posters that might predate a correction.
- Documentation MP4s retain 1280 × 720, original duration, and 30 fps. They were recompressed with H.264, CRF 25, yuv420p, and faststart. They are not the original masters.
- GIFs retain the original duration at 640 px, 10 fps, and 128 colors, with an ffmpeg-generated palette and looping playback.
- The study sheets were generated from the published JPGs. Their metrics describe those JPGs, not the PNG masters.
- The Alps Morning still was converted to JPG at its original 1600 × 900 resolution.

To regenerate the studies from the repository root with the Python dependencies installed:

```bash
python tools/study.py docs/media/sunset-lake.jpg \
  docs/media/last-light.jpg docs/media/alps-morning.jpg docs/media/summer-cumulus.jpg \
  --out docs/media/studies
```

Gallery examples were produced with working copies of the engine during development. This repository retains the current skill, including subsequent improvements. The images are not presented as pixel-equivalence tests for a fresh render of the published engine.
