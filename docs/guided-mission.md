# Guided mission implementation

The English interface follows briefing → illustrative flight → arrival dialogue → Moon selection and analysis → illustrative landing → final dialogue. The astronaut appears in the scenery; monospaced text has no dialogue box. Back and Continue are the only conversation controls. Continue reveals incomplete text before advancing; Back revisits earlier lines. On the first line, Back is disabled. The globe and scientific comparisons are unchanged.

## Components

- `MissionApp.tsx`: stages, selection/date, navigation, focus, modal, audit download, and errors. Existing 3.2-second flights remain skippable and are bypassed for reduced motion. About pauses the active flight timer and resumes its remaining duration.
- `mission-copy.ts`: the three briefing lines, two arrival lines, and completion text.
- `GameDialogue.tsx` and `TypewriterText.tsx`: stable Back/Continue controls, typewriter effect, full accessible text, and reduced motion. No voice control is mounted.
- `GameScene.tsx` and scene styles: the existing Poly astronaut, NASA 3D Resources terrain illustration, and symbolic SVG spacecraft. They do not represent measured landing-site terrain.
- `globe/MissionGlobe.tsx`: camera, coordinates, markers, and LROC/LOLA assets adapted from commit 343d31f. See the [source and limitations](../frontend/src/mission/globe/README.md).
- `HorizonDiagram.tsx`: a section in the selected azimuth, with equal angle scales and dashed rays below the ideal horizon. Icon distances and sizes are illustrative. No mountain intersections are computed.
- `mission-data.ts`: validates schema, coordinates, UTC grid, kernels, and results. Errors never substitute invented values. The scientific JSON schemas remain unchanged.

## Accessibility

The dialogue exposes complete text to assistive technology without announcing each typed character. Controls retain keyboard focus across lines; returning to the first line moves focus from the now-disabled Back control to Continue. Touch targets are at least 44 px. Reduced motion shows text immediately and bypasses flight animations.

The context modal makes its background inert, traps focus, closes with Escape, and restores focus. Stage transitions focus headings without stealing focus on initial load. Small-screen site selection scrolls to the analysis; Back to map preserves site, date, and selected body. The Moon provides a coordinate-list fallback when WebGL is absent or lost.

## Standalone delivery

`npm run build:offline` embeds code, styles, assets, the font license, and scientific data in `Lunar-English.html` and the compatibility alias `Lunar-Missao.html`. README.txt explains how to open it. There are no required external requests. The audit download uses a Blob URL revoked on cleanup.

`node scripts/build-guide-preview.mjs /path/to/delivery` also updates previous preview filenames to the same application. Vite remains available. Its existing large-chunk warning includes scientific JSON, validation, and Three.js; it is not suppressed.

## Browser review

Build, then run a preview:

```sh
npm run build
npm exec --workspace frontend -- vite preview --host 127.0.0.1 --port 4174
```

Install review-only dependencies outside the repository and run from the repository root:

```sh
npm install --prefix /tmp/lunar-review-browser --no-audit --no-fund playwright@1.65.1 @axe-core/playwright@4.14.0
cp scripts/mission-browser-review.mjs /tmp/lunar-review-browser/mission-review.mjs
node /tmp/lunar-review-browser/mission-review.mjs
```

`REVIEW_URL`, `REVIEW_OUTPUT`, and `CHROMIUM_EXECUTABLE` select the target, evidence directory, and browser. The mission runner checks all 12 site/date combinations, 24 elevations, 24 azimuths, decisions, audit download, modal focus, bonus, animations, reduced motion, mobile layouts, and selected Axe accessibility rules.

`guide-browser-review.mjs` checks two-button navigation, going back across scenes, speech API absence, English metadata, and desktop/mobile dialogue. `globe-browser-review.mjs` checks real WebGL rendering, polar detail, camera reset, touch targets, keyboard input, and context-loss fallback.

For the standalone HTML, serve its directory locally and pass `REVIEW_URL=http://127.0.0.1:4188/Lunar-English.html OFFLINE_REVIEW=1`. The mission and guide runners then block every extra HTTP request. The managed Chromium here blocks direct `file://` navigation, so the same bytes are verified over local HTTP; double-click behavior is not certified for every browser/device. Automated Axe checks do not establish complete accessibility conformance.

Scientific hashes, datasets, and geometry are unchanged by the English dialogue update. Test reports and screenshots are generated outside Git.
