# Composing a scene

Compose on paper (a comment block) before writing any stroke. A picture that works as five flat shapes in three values will survive any amount of brushwork; one that does not cannot be rescued by detail.

## The order of decisions

1. **What is the picture about?** One sentence. That thing is the focal point; everything else supports it.
2. **Format and horizon.** Low horizon (0.65–0.8 of the height) → the sky is the subject. High horizon (0.25–0.4) → land/water is. Never 0.5.
3. **Focal point** near a third intersection (x ≈ A/3 or 2A/3, y ≈ 1/3 or 2/3). There go: the strongest light/dark contrast, the highest chroma, the crispest edges, the most detail.
4. **Big shapes** (3–5): e.g. sky · cloud mass · far land · water · foreground. Unequal areas. Overlap them — overlap is depth.
5. **Value plan**: give each shape one value (0 black … 1 white) in three groups, with unequal shares (a dominant mass ≈ 45–60 %, a secondary ≈ 25–40 %, an accent ≈ 10–20 %). Write it as a comment and `tone()` every mix to it.
6. **Path for the eye**: a lead-in from the bottom edge (river, path, shoreline, row of clouds) that bends toward the focal point; stoppers at the sides (a dark trunk, a cloud) so the eye does not slide out.
7. **Depth planes**: at least three (far / middle / near), each with its own value range — far planes compressed and light, near plane with the full range.
8. **Light**: one source, one direction, one temperature. Warm light → cool shadows, and the reverse. Decide where the shadows fall before painting.

## Proven arrangements (after Edgar Payne's types)

- **Steelyard**: a large mass near the centre-side balanced by a small one far away on the other side (`sunset-river.js`: big cumulus right, sun left).
- **L / framing**: a tall dark vertical on one side plus a dark base, opening on a light distance (`lake-path.js`).
- **S-curve lead-in**: a path or river winding back to the focal point.
- **Three bands**: dark foreground, light middle, mid-value sky (or the inverse) — strong and simple.
- **Single subject against a quiet field**: the subject off-centre, leaning into the picture (`lone-pine.js`).
- **Diagonal**: two areas split by a slope; put the focal point where a counter-diagonal meets it.
- **Tunnel/O**: dark foliage ringing a bright opening.

## What the masters' numbers say

Measured with `tools/study.py` on 13 public-domain landscapes (Bierstadt, Church, Constable, Friedrich, Inness, Kuindzhi, Levitan, Monet ×2, Shishkin ×2, Turner, Van Gogh), OKLab units:

| Metric | Masters (range) | Meaning for your scene |
|---|---|---|
| Mean chroma | 0.015 – 0.061 (median ≈ 0.036) | Pictures are mostly grey-ish. If yours is > 0.07, earth it. |
| Area with chroma > 0.12 | 0 – 8.6 % (most < 1 %) | Saturated colour is an accent, not a field. |
| Value masses (dark/mid/light) | never equal; e.g. Church 41/49/9, Friedrich 27/17/55, Levitan 12/43/44 | One mass dominates; the smallest is often the focal light or dark. |
| Value range (p2–p98) | wide for drama (Bierstadt 0.19–0.95), narrow for mist (Monet's *Impression* 0.43–0.64) | Choose the key deliberately; mist = compress, drama = full range. |
| Lights vs darks temperature | lights lean warm in 12 of 13 (Friedrich's fog is the cool exception); darks warm-brown or cool depending on school | Pick a rule (warm light/cool shadow) and keep it. |
| Top/middle/bottom lightness | sky third lightest in daylight scenes; Church's twilight is lightest in the *middle* | Where the light band sits is a design choice. |
| Focal point | at a strong value edge, usually near a third; edge density there is often 1.3–2.5× the picture average (0.8–2.5 measured) | Spend detail at the focal point, rest the eye elsewhere. |

Observations from the study sheets: Church's *Twilight in the Wilderness* is a dark frame around one small, light, warm band at the horizon; Bierstadt wraps darks (cliff left, trees right, foreground) around a glowing light centre; Van Gogh's cypress is the only true dark, placed on the right third against a light, busy sky.

## Checking your own picture

```bash
uv run --with pillow --with numpy --with scikit-learn python ~/.claude/skills/painterly-video/tools/study.py stills/my-scene/t016.00.png --out stills/study
```
It writes `<name>_study.jpg` (original with thirds + detected focal point · greyscale · 3-value notan · 5-value · chroma map · focal heat-map · palette strip) and prints metrics. Open the sheet and ask:

- Does the **3-value notan** still read as the picture? Are the three shapes unequal and interesting?
- Is the detected **focal point** where you planned it? If not, something else has more contrast — reduce it.
- Is the **chroma map** dark except near the focal accent?
- Do far planes sit in a narrow, light value band, and is the darkest dark in the foreground?

The same tool works on any reference image the user gives you: study it first, write down its value plan and palette shares, then compose your own scene to that structure. Fetch references only from sources that allow programmatic access (e.g. Wikimedia Commons API with an honest User-Agent); never spoof a browser to get past a block.

## Common composition faults

- Horizon or main subject on the centre line; two masses of equal weight.
- Shapes kissing the frame edge or each other (tangents) — overlap or separate.
- Evenly spaced, same-sized repeats (trees, clouds, waves).
- Lines leading out of the corners.
- Detail everywhere; no quiet area.
- Highest contrast at an unimportant place (a white cloud edge far from the focal point).
