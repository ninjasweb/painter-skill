# painterly-video review

Publication review: November 11–12, 2026. This review covers the skill in this repository. External working projects were consulted to select recent examples of its use.

## Assessment

The main strength is the connection between artistic judgment and executable implementation. SKILL.md establishes composition, values, palette, layer order, and visual review. The references translate these decisions into concrete functions; the engine provides strokes, texture, reveal, and motion. The study tool offers a reproducible way to inspect those decisions.

The structure works well as a skill: one entry point, topic-specific references, starter scenes, and tools. Detailed references are separate from the main workflow, and examples are executable. The README gallery shows recent work while the examples directory retains the six original starter scenes.

## Publication improvements

| Finding | Change |
| --- | --- |
| Documentation and package specified Node ≥18, but Puppeteer 25.17.0 requires ≥22.12.0. | Aligned the requirement in SKILL.md, package.json, the lockfile, and README. |
| JavaScript dependencies had no lockfile in the skill. | Included the working project's lockfile, matching the declared dependencies, and documented npm ci. |
| Setup assumed one installation location. | Used a configurable path in SKILL.md, with an explanation of how to resolve it. |
| Study tool dependencies were implicit. | Added tools/requirements.txt and a virtual-environment example. |
| Sunset Lake's poster and study predated its latest corrected MP4. | Extracted a poster from the final MP4 and regenerated its study with this skill's tool. |
| Public documentation was missing. | Added installation, workflow, a recent gallery, studies, GIFs, MP4s, and reference links, in English. |

Existing engine improvements were preserved. The engine was not replaced with an older copy from an example project.

## Checks performed

- Built all six starter scenes in Node.js 22.22.0 without rendering: positive stroke counts, finite data, and identical stroke data when repeating a seed.
- Manually checked skill frontmatter and reference paths. The bundled validator was attempted but could not run because its Python environment lacked PyYAML.
- Ran the study tool on three gallery images and visually inspected posters and study sheets.
- Analyzed the three compressed MP4s with this skill's CLI: resolution, duration, frame counts, sudden changes, and black segments. All three returned ok: true.
- Checked local links and publication contents, excluding installed dependencies, environments, private files, and duplicate engines.
- Rendered the README through GitHub's Markdown API and checked its presentation and image loading in a browser.

### Verification limits

A fresh npm installation could not complete in the publication environment because registry.npmjs.org failed to resolve. Local checks used dependencies already installed in the working project, with versions matching the lockfile.

A fresh render attempt stopped when opening the local server: the restricted environment returned listen EPERM on 127.0.0.1. This publication therefore does not claim a new end-to-end WebGPU render or a verified installation from scratch. Videos are existing deliverables, processed and checked for the documentation.

## Functional limits and possible improvements

- **Platforms:** development took place on macOS/Apple Silicon. Linux and Windows paths and flags still need GPU and codec testing on those systems.
- **Focal metric:** the map combines local contrast and chroma. It is a visual heuristic, not a validated model of human attention.
- **Artistic rules:** off-center horizons, unequal masses, and chroma limits are starting criteria. Explicit intentions such as symmetry, graphic style, or intense color should take precedence.
- **QA:** the ok field does not evaluate composition. Frozen frames are reported but do not fail the report on their own. The CLI prints the result without setting a different exit code when ok is false; integrations need to inspect the JSON.
- **Study robustness:** uniform images can cause division by zero in the focal map; extreme panoramas can leave fewer than 6,000 pixels for sampling without replacement. These cases remain candidates for hardening and were not encountered in the published sheets.
- **Preview server:** bound to loopback and intended for trusted local files. A shared service would need explicit path restrictions and stronger error handling.
- **Reproducibility:** a fixed seed stabilizes stroke generation; engine, browser, GPU, and encoder changes can affect output. Gallery provenance is preserved without promising pixel equality with the current engine.
- **Licensing:** the vendored spectral.js component retains its MIT license. The owner has not yet specified a repository-wide license for the remaining code and media.
