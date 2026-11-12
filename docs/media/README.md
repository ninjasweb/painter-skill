# Documentation media

Selected from the most recent available iterations of the painter working project on November 11, 2026. The project provides evidence of the skill in use; its working directories and duplicate engines are not part of this repository.

| Published asset | Source within the working project | Selected version |
| --- | --- | --- |
| sunset-lake.jpg, MP4, and GIF | agent-test-8/sunset-lake.mp4 | Corrected MP4 from 22:26, project local time. |
| sunset-lake-timeline.jpg | agent-test-8/timeline-sheet.jpg | Contact sheet updated at 22:26. |
| last-light.jpg, MP4, and GIF | agent-test-7/last-light.mp4 | Final MP4 from 17:51. |
| blue-hour-lake.jpg and MP4 | agent-test-6/blue-hour-lake.mp4 | Final MP4 from 17:41. |
| alps-morning.jpg | agent-test-9/stills/alps-morning/t008.00.png | Latest available still, 22:38. No MP4 was available. |
| studies/*_study.jpg | Images published in this directory | Regenerated using this skill's study.py tool. |

## Preparation

- Posters for the three animations were extracted at duration minus 1/30 second from the source MP4, before video compression. This avoids relying on posters that might predate a correction.
- Documentation MP4s retain 1280 × 720, original duration, and 30 fps. They were recompressed with H.264, CRF 25, yuv420p, and faststart. They are not the original masters.
- GIFs retain the original duration at 640 px, 10 fps, and 128 colors, with an ffmpeg-generated palette and looping playback.
- The three study sheets were generated from the published JPGs. Their metrics describe those JPGs, not the PNG masters.
- The Alps Morning still was converted to JPG at its original 1600 × 900 resolution.
- Older studies from agent-test-8 were omitted because they preceded the corrected MP4.

To regenerate the studies from the repository root with the Python dependencies installed:

```bash
python tools/study.py docs/media/sunset-lake.jpg \
  docs/media/last-light.jpg docs/media/alps-morning.jpg \
  --out docs/media/studies
```

Gallery examples were produced with working copies of the engine during development. This repository retains the current skill, including subsequent improvements. The images are not presented as pixel-equivalence tests for a fresh render of the published engine.
