<!--
Rascunho SPA-13 dos campos do formulário de submissão, em inglês (o guia de submissão exige inglês).
Escrito para a `main` em 23cc0c7 (a branch de QA não altera a aplicação) e alinhado à auditoria
científica SPA-9. Antes de colar no formulário:
- resolver todo [CONFIRM ...] e [VERIFY ...]; não inventar o que faltar;
- conferir os limites de caracteres de cada campo no formulário (não verificados aqui);
- se a equipe submeter outra branch (ex.: PR #6), reescrever "What it does" e "How it works";
- se o frontend corrigir os rótulos "verified"/"Skyfield" antes da submissão, remover as notas marcadas [IF UI UNCHANGED].
Não usar: "validated against Horizons", "NASA-validated", "safest site", "recommended landing site".
-->

# Space Apps 2026 submission fields (DRAFT)

## Project Name

Lunar Landing Site Navigator [CONFIRM final project name]

## High-Level Project Summary

Lunar Landing Site Navigator is an interactive web tool for comparing landing points near the lunar
South Pole, where the Sun grazes the horizon and nearby terrain decides light, shadow and Earth
visibility. For 10 pre-selected points, our Python pipeline traces each point's 360° terrain horizon
from NASA LRO LOLA 80 m elevation data and computes hourly Sun and Earth directions from NAIF SPICE
kernels (DE421) for 15 November to 15 December 2026. From these it derives how much of the solar disk
is visible, the longest continuous shadow, direct-to-Earth visibility and geometric coverage by
hypothetical relay orbits. In the browser, users scrub through the month, probe a 2 km × 2 km grid
around each point, change power, antenna and scoring assumptions, and watch the ranking update. The
results are a precomputed, illustrative model for one southern-summer month, not a validated mission
product.

## Link to Project Demo

[CONFIRM public link to the 30-second video or the 7-slide deck; must open without login]

## Link to Final Project

- Source code: https://github.com/s4m256/lunar-landing-site-navigator [CONFIRM the repository is public]
- Live app: [CONFIRM public Vercel production URL; not verified during QA]

## Detailed Project Description

### What it does

- Compares 10 fixed points: 8 labelled with the names of NASA's Artemis III candidate landing regions
  (October 2024 update), one point on the ridge between Shackleton and de Gerlache craters, and one
  point on the Shackleton crater floor used as a permanently shadowed contrast case. NASA lists regions,
  not points: the point coordinates are our own choices.
- For each point and for a 5 × 5 grid with 500 m spacing around it, the dataset holds elevation, slope,
  a 360° terrain horizon (1° steps) and a permanently-shadowed-region (PSR) flag and distance. Each point
  also has 721 hourly Sun, Earth and relay-satellite directions, computed at the point and reused for
  its grid nodes.
- The web interface shows: a polar map of 80°S–90°S with the points and a local heat-map grid (score,
  slope, sunlight, link); a horizon panorama (azimuth 0–360° against elevation) with the Sun, the Earth
  and one relay satellite at the selected hour; 30-day charts of sunlit fraction, power and link
  windows; controls for panel geometry, area and efficiency, survival load, relay on/off, Earth-visibility
  criterion, antenna mask and score weights; a ranking table of the 10 points; and a provenance and
  limitations box.
- Example from the committed dataset: on the Shackleton crater floor the Sun stays below the
  surrounding rim for the whole window and the Earth is never in direct view; only the hypothetical
  relay constellation gives it link coverage. With default settings its score drops from 39.6 to 23.4
  when the relay is switched off.

### How it works

Science pipeline (Python, `science/`), run once before deployment:

1. Terrain: LOLA polar DEM `LDEM_80S_80M` (80 m/px). Horizons are traced by marching great-circle rays
   up to 120 km on a 1737.4 km reference sphere, observer 2 m above the surface, including lunar
   curvature. Slope uses central differences over ±1 pixel (160 m baseline).
2. Ephemeris: SPICE `spkpos` for the Sun and the Earth in the `MOON_ME` frame (DE421 plus the DE421
   lunar orientation kernel), with light-time and stellar aberration, converted to local
   east-north-up azimuth and elevation.
3. Illumination and power: fraction of the solar disk above the local horizon (circular-segment model),
   irradiance scaled by Sun distance, energy for three panel geometries at a fixed 28 % cell efficiency,
   longest continuous shadow, and battery sizing for a constant 100 W load.
4. Communications: direct-to-Earth (DTE) when the Earth disk (or its center) clears the terrain horizon.
   Relay satellites follow two-body Kepler orbits with team-defined elements; a satellite counts as
   visible when it is 5° above the terrain horizon, within maximum range, and has a line of sight to the
   Earth that does not cross the Moon. Free-space path loss is reported as an indicator only.
5. Landing Score (0–100): weighted sum of slope, power, communications and PSR-proximity sub-scores with
   team-chosen weights (0.25 / 0.35 / 0.25 / 0.15) and thresholds.
6. Outputs: one JSON dataset validated against a JSON Schema (`contracts/navigator-dataset.v1.schema.json`),
   CSV and Markdown summaries, and a file comparing Sun and Earth directions with JPL Horizons.

Web app (TypeScript, React, Vite, `frontend/`): a static site. It does not compute ephemerides. It loads
the dataset, validates it against the same schema (Ajv), interpolates the local grid bilinearly
between nodes, and re-derives illumination, link states, durations and the score for the user's
settings. No backend, no external requests.

### What we checked, and what we did not

- Automated tests at the time of writing: 52 passing Python tests (contract, analytical cases such as
  the smooth-sphere horizon dip and the solar-disk segment, dataset invariants, and recomputation of the
  published summaries from the published series), 4 frontend tests and 8 deployment-check tests. Three
  known data issues are recorded as expected failures (see Limitations 4 and 6).
- Internal review: Sun and Earth directions were recomputed with an independent DE421 implementation
  (without SPICE) and agree with the pipeline within 6.2 × 10⁻⁶ degrees; all published solar,
  communication and score summaries were reproduced from the published inputs to rounding level. This
  checks our implementation and conventions, not DE421 itself and not the terrain inputs.
- JPL Horizons: the repository contains a comparison of Sun and Earth directions at one point on 16
  dates, with maximum separations of 1.3 × 10⁻⁵ degrees (Sun) and 3.6 × 10⁻⁵ degrees (Earth). The raw
  Horizons responses were not retained, no acceptance tolerance was defined, and we could not re-run the
  query during review. We therefore do not claim validation against Horizons.
  [IF UI UNCHANGED: The interface still labels this comparison "verified" and says the ephemeris was
  "cross-checked with Skyfield"; both labels overstate the evidence. The Skyfield check exists only in a
  test that did not run.]
- Not verified: the terrain inputs (the DEM file and its checksum could not be re-downloaded during
  review), browsers other than headless Chromium, and accessibility conformance.

### Limitations

1. One southern-summer month only (15 Nov to 15 Dec 2026, sub-solar latitude between about −1.37° and
   −1.56°). Illumination figures, such as 100 % sunlight on the ridge point, are best-case values for
   this month, not annual or long-term statistics.
2. Terrain comes from an 80 m/px DEM: boulders and craters smaller than about 80 m are invisible, slope
   on a 160 m baseline underestimates lander-scale slopes, and terrain beyond 120 km is ignored.
3. Only 10 fixed points can be evaluated; arbitrary coordinates are not supported. The coordinates are
   not NASA-designated sites, and some descriptive labels do not match the sampled elevation.
4. PSR status uses our own geometric criterion, not an official PSR map. Its maximum-Sun envelope fixes
   the sub-solar latitude at 1.543° and is exceeded by up to 0.014° by the computed Sun elevations. The
   PSR flag and the PSR distance use slightly different criteria; the distance is quantized on a 500 m
   lattice and capped at 5200 m (de Gerlache Rim 2 reports the cap, which means "no PSR found within
   the search area").
5. Communications are geometric only: no ground-station schedule, pointing, link budget or data rate.
   The relay orbits are hypothetical scenarios: the "ELFO" elements are team-defined and the "LRO-like"
   50 km orbit is not LRO's real orbit (LRO is not a relay). With the 3-satellite constellation every
   point reaches 100 % combined coverage, so the communications sub-score is driven by that assumption.
   Hourly sampling cannot resolve outages shorter than one hour.
6. Power: fixed cell efficiency, no dust, temperature or degradation; battery = load × longest shadow,
   with no depth-of-discharge or thermal margin. Durations are counted in samples, so always-dark points
   report a 721 h shadow inside a 720 h window.
7. The Landing Score weights and thresholds are our choices, without published justification,
   sensitivity analysis or uncertainty. The 12° slope limit declared in the dataset only colors the
   interface's slope badges; the score does not enforce it (a 12° slope still earns 23 of 100 slope
   points). The score is an illustrative, adjustable index, not a NASA metric and not a landing
   recommendation.
8. No uncertainties are propagated or displayed.
9. Reproducibility: regenerating the dataset requires downloading the DEM and SPICE kernels from NASA
   servers; Python dependency versions are not locked; the Horizons comparison cannot be reproduced from
   the repository alone.
10. Eclipses of the Sun by the Earth are not modeled; "partial eclipse" in the interface means
    terrain hiding part of the solar disk.
11. The interface text is in Portuguese. [CONFIRM if an English version is deployed]

### Why it matters

Near the pole, a few hundred meters can separate continuous sunlight from deep shadow and a clear view
of the Earth from none. The tool makes that geometry visible and shows how much a ranking depends on
assumptions such as relay availability, panel geometry and score weights. It is meant for education and
early trade-off exploration, not for mission decisions.

### Tools and languages

Python 3.12 (NumPy, SpiceyPy with NAIF CSPICE, jsonschema), TypeScript, React 19, Vite 7, Ajv; pytest,
Vitest and the Node.js test runner; GitHub Actions; static hosting on Vercel.

### Next steps

Retain raw Horizons responses and test them against a stated tolerance; compute illumination over a
full year or longer; use a single PSR criterion with an ephemeris-derived envelope; report "no PSR
found" instead of a capped distance; show scores with and without the hypothetical relay; add
sensitivity analysis and a hard slope limit; allow arbitrary coordinates.

## NASA Data

- **LRO LOLA gridded polar DEM `LDEM_80S_80M`** (PDS data set `LRO-L-LOLA-4-GDR-V1.0`, PDS Geosciences
  Node): elevation, slope, 360° terrain horizons and PSR classification for every point and grid node.
- **NAIF SPICE generic kernels** (`de421.bsp`, `moon_pa_de421_1900-2050.bpc`, `moon_080317.tf`,
  `moon_assoc_me.tf`, `pck00010.tpc`, `naif0012.tls`): hourly apparent directions of the Sun and the
  Earth from each point. File names, URLs and SHA-256 are recorded in the dataset provenance.
- **JPL Horizons API**: comparison of Sun and Earth directions at one point on 16 dates (status
  described above; not presented as validation).
- **NASA Artemis III candidate landing regions** (news release, 28 October 2024): region names used as
  labels for 8 of the 10 points.

## Space Agency Partner & Other Data

- ESA Lunar Pathfinder and the LunaNet concept are used only as names for hypothetical relay scenarios.
  The orbital elements are team-defined. [VERIFY: if they were taken from an ESA or NASA document, cite
  it here]
- Physical constants (solar constant, solar and Earth radii, astronomical unit, lunar GM and reference
  radius) are hard-coded. [VERIFY and cite their sources]
- Open-source software: React, Ajv, Vite, TypeScript, NumPy, SpiceyPy (which bundles NAIF CSPICE),
  jsonschema and others; full list with licenses in `THIRD-PARTY-NOTICES.md` [CONFIRM final file name].

## Use of Artificial Intelligence

[CONFIRM with every team member; list every tool, what it produced and how it was checked. Draft based
on evidence in the repository:]

- We used AI coding assistants throughout the project. Anthropic Claude (Claude Code agents) wrote and
  revised code, tests, CI scripts and documentation; commits made this way carry a
  `Co-Authored-By: Claude` trailer. AI agents also drafted our internal requirements notes, scientific
  audit and QA report.
- [CONFIRM which tools produced the science engine, the dataset pipeline and the interface merged on
  14 November, and whether Google AI Studio (named in two unmerged UI branches) contributed to the
  submitted build.]
- The published dataset is computed by the project code from NASA data. Our internal review recomputed
  its summaries from the code and found no hand-written or AI-generated values.
- [CONFIRM: no AI-generated images, video or audio are used. If any are, they carry a visible watermark,
  as the guidelines require.]
- AI was not used to create or modify NASA logos or branding.

## References

1. NASA PDS Geosciences Node. LRO LOLA gridded data record, polar product `LDEM_80S_80M`
   (`LRO-L-LOLA-4-GDR-V1.0`). [VERIFY recommended data citation]
2. Smith, D. E., et al. (2010). The Lunar Orbiter Laser Altimeter investigation on the Lunar
   Reconnaissance Orbiter mission. Space Science Reviews, 150, 209–241. [VERIFY]
3. Acton, C. H. (1996). Ancillary data services of NASA's Navigation and Ancillary Information Facility.
   Planetary and Space Science, 44(1), 65–70. [VERIFY]
4. Acton, C., Bachman, N., Semenov, B., Wright, E. (2018). A look towards the future in the handling of
   space science mission geometry. Planetary and Space Science, 150, 9–12. [VERIFY]
5. Folkner, W. M., Williams, J. G., Boggs, D. H. (2009). The Planetary and Lunar Ephemeris DE 421. IPN
   Progress Report 42-178. [VERIFY]
6. Giorgini, J. D., et al. (1996). JPL's On-Line Solar System Data Service. Bulletin of the American
   Astronomical Society, 28(3), 1158. [VERIFY]
7. Annex, A. M., et al. (2020). SpiceyPy: a Pythonic wrapper for the SPICE Toolkit. Journal of Open
   Source Software, 5(46), 2050. [VERIFY]
8. NASA (2024, October 28). NASA Provides Update on Artemis III Moon Landing Regions.
   https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
9. Project repository and third-party notices: https://github.com/s4m256/lunar-landing-site-navigator
