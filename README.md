# Lunar Landing Site Navigator

A minimal English explorer for comparing lunar sites and dates. The application opens directly on the existing Three.js Moon, focused on the south pole. Choose a marked site and a sampled date, then add a second scenario to compare Sun and Earth directions without losing the first result.

## Use the explorer

1. Choose a point on the Moon, or use the **Site** menu in scenario 1.
2. Choose a **Date**. All samples are at 00:00 UTC.
3. Select **Compare another scenario** to preserve scenario 1 and edit scenario 2.
4. Change either site's coordinates preset or date. Select a scenario heading to choose which one the Moon and horizon view edit.
5. Use **Sun / Earth** to inspect that body's direction. **About & data** explains the method and provides the original data download.

There is no mandatory story, character, launch, landing, voice, or pass/fail score in the active flow. Three sampled dates and four hypothetical sites are supported. The prototype does not accept arbitrary coordinates or compute continuous visibility windows.

The Moon uses the same LROC mosaic and LOLA polar DEM found in [Isaac's AI Studio project](https://github.com/zaczusantos-ops/aistudiolandingguide/tree/6d2e5310aba05edb6436975ba7915cd2b82f5bba), via the existing repository integration. The comparison keeps the current validated geometry data. See the [implementation and source review](docs/minimal-comparison.md).

## Open without installation

Build the standalone **Lunar-Explorer.html** with Node.js 24 and npm 11:

```sh
npm ci --include=dev
npm run build:offline -- /path/to/delivery
```

Open that file in a modern desktop browser. Code, images, fonts, and science data are embedded. External source links require internet only when opened. Compatibility filenames such as Lunar-English.html and Lunar-Missao.html contain the same current app; generated files are not committed.

For a browser-only GitHub import, StackBlitz supports `https://stackblitz.com/github/s4m256/lunar-landing-site-navigator/tree/feat/minimal-site-comparison?startScript=dev`. The external StackBlitz service could not be exercised from the managed environment, so this URL is not a verified hosted deployment. No production deployment is performed.

## Develop

```sh
npm ci --include=dev
npm run dev
```

Preview the production build locally:

```sh
npm run build
npm run check:deploy
npm exec --workspace frontend -- vite preview --host 127.0.0.1 --port 4174
```

## What the results mean

The four observers are at −85° planetocentric latitude and east longitudes 0°, 90°, 180°, and 270°, on a sphere with radius 1,737,400 m. Selected dates are March 24, April 28, and September 8, 2026, at 00:00 UTC. Directions were calculated with Python/SPICE, DE421, IAU_MOON, and CN+S. The browser consumes validated static artifacts.

Each body’s center is classified above, on, or below the idealized tangent horizon using its full-precision elevation. Both centers are above it at B and C in March, A in April, and D in September. This is a geometric comparison, not a landing recommendation or a pass/fail gate.

**This does not calculate mountain obstruction, shadows, generated power, radio availability, or landing safety.** LROC imagery and LOLA relief are visual references. Fixed shading does not represent the selected date's Sun. The globe is spherical; no transformation connects the terrain's MOON_ME frame to the calculations' IAU_MOON frame. Three sampled dates cannot establish continuous visibility windows or rise/set times. About & data contains sources, limitations, and the complete data download.

Calculations are reproducible but have not been independently validated against Horizons. Kernel hashes were checked against third-party distributions; current LSK completeness is unconfirmed. Numerical reproduction does not certify physical accuracy. The project does not imply NASA endorsement.

## Architecture and verification

- [Current comparison implementation and browser review](docs/minimal-comparison.md).
- [Scientific data](docs/mission-data.md) and [reproducible audit](docs/audits/mission/README.md).
- `frontend/src/comparison/`: independent scenarios, minimal shell, explanations, source dialog, and guarded results.
- `frontend/src/mission/globe/`: existing Moon, projected site markers, keyboard camera controls, and WebGL fallback.
- `frontend/src/mission/mission-data.ts` and `HorizonDiagram.tsx`: unchanged scientific lookup and shared horizon diagram.
- Previous guided and legacy interfaces remain outside the main entry point. No speculative scores, custom-site science, or relay calculations were imported from the reference project.

```sh
npm run typecheck
npm test
npm run test:infra
npm run build
npm run check:deploy
LUNAR_KERNEL_DIR=/tmp/lunar-review-historical-kernels .venv/bin/python -m pytest science/tests -ra
.venv/bin/python -m build science
```

See [GEOMETRY.md](science/GEOMETRY.md) for scientific conventions and kernel setup. Python tests require `./science[dev]`; kernel-dependent tests explicitly skip when kernels are missing. Deployment configuration is documented in [deploy.md](docs/deploy.md).
