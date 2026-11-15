# Minimal lunar comparison

## Scope and interaction

The entry point is `ComparisonApp`, opening directly on the real-data Moon visualization. The active UI is English and uses no mandatory narrative or flight sequence. Four existing hypothetical sites and three sampled dates remain the scientific scope.

One scenario is shown initially. Choosing a Moon marker edits that active scenario; a site menu provides an equivalent keyboard/fallback route. Adding scenario 2 copies scenario 1 as a starting point, preserves scenario 1, focuses the new scenario, and states that the inputs match until one changes. Each card's date and site are independent. Removing scenario 2 preserves the first and restores focus to the comparison button.

Card headings activate a scenario. The map selection and horizon view follow that active scenario. Sun and Earth values remain visible in both cards. The comparison describes elevation differences without ranking sites or promising power, radio availability, or landing safety. Exact zero is on the horizon. Small nonzero values retain extra precision instead of rounding to zero.

## Source review

The source repository `zaczusantos-ops/aistudiolandingguide` was read at commit `6d2e5310aba05edb6436975ba7915cd2b82f5bba`. Both current assets, `lroc_color_2k.jpg` and `ldem_south_pole_1k.png`, are byte-identical to that source. The existing adaptation from integration commit `343d31f` already supplies the coordinate convention, polar projection, texture mapping, OrbitControls and marker projection. It is retained rather than transplanting the much larger source viewport.

The source's dark neutral, compact explorer controls informed the shell. Arrow-key orbit and +/- zoom are added using the existing camera convention. The current source has no tracked LICENSE/NOTICE; this review does not assert permissive licensing or independent NASA verification. Existing [asset provenance and limitations](../frontend/src/mission/globe/README.md) remain applicable.

Some upstream science code contains real SPICE and geometry work, but its custom-site builder also uses placeholder scores and approximated metrics. None of those custom-site scores, synthetic terrain fallbacks, relay assertions, or interpolated time claims are imported. The current scientific data, schemas, hashes, and audit files are unchanged.

## Rendering and accessibility

The Moon renders on demand. The LOLA detail layer fades in near the surface; the distant whole-Moon view uses the continuous LROC mosaic so the cap does not resemble a crater. A focused viewport supports arrow keys to orbit, Shift for larger steps, and +/- to zoom. Buttons provide zoom and whole-Moon/south-pole presets. Selected and compared markers have distinct outlines and textual site identities; the always-available site menus avoid dependence on drag gestures or crowded map pins.

All interactive targets are at least 44 px tall. On small screens the map precedes the cards; cards stack at narrow widths. No controls are fixed over the content. Reduced-motion preferences remove transitions. WebGL startup failure or context loss exposes the existing coordinate list; scenario menus and calculations continue to work.

The About dialog traps focus, makes the background inert, closes with Escape, and restores focus. Original data downloads use a Blob URL with cleanup. An unobtrusive status message identifies the active scenario and selected site/date.

## Science boundaries

Directions refer to body centers at 00:00 UTC on the three available dates, using SPICE/DE421, IAU_MOON and CN+S. The ideal tangent horizon is not terrain-derived. The displayed LOLA shading uses fixed illustrative light and a MOON_ME source; no transformation to IAU_MOON is applied. The map is an approximate visual reference, not measured landing safety. Snapshot comparisons do not establish continuous visibility windows or sunlight duration.

## Verification

Run the repository's TypeScript, frontend, infrastructure, Vite, and Python checks. Scenario unit tests exercise guarded lookup, full-precision horizon state, independent edits, comparison cloning/removal, active map/horizon synchronization, and dialog focus.

The current browser runner is `scripts/comparison-browser-review.mjs`. Install Playwright and Axe outside the repository as described in the historical [browser setup](guided-mission.md), then run from the repo root:

```sh
cp scripts/comparison-browser-review.mjs /tmp/lunar-review-browser/comparison-browser-review.mjs
REVIEW_URL=http://127.0.0.1:4174 node /tmp/lunar-review-browser/comparison-browser-review.mjs
```

For the standalone delivery, serve its directory and use:

```sh
REVIEW_URL=http://127.0.0.1:4188/Lunar-Explorer.html OFFLINE_REVIEW=1 node /tmp/lunar-review-browser/comparison-browser-review.mjs
```

The runner checks all 12 original site/date combinations against the audit, independent scenarios, source download, active horizon, keyboard orbit/zoom, narrow layouts, modal focus, selected Axe rules, and missing/lost WebGL. Offline mode blocks every additional HTTP request. Reports and screenshots remain outside Git. Managed Chromium blocks direct file:// navigation; local HTTP tests verify the same standalone bytes. No external StackBlitz deployment has been certified.
