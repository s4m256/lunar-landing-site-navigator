# Lunar Landing Site Navigator

A guided exercise exploring why **site and date** matter for a lunar landing. Lua is a fictional astronaut guide; NASA's CLPS missions are robotic and carry no astronauts. Choose among four hypothetical sites and compare the directions of the Sun and Earth. An optional bonus is separate from the scientific sites.

The interface and dialogue are in English. Text appears directly over the scenery in JetBrains Mono, with just **Back** and **Continue** below it. Continue reveals a typing line, then advances on the next click. Back revisits the previous line, including from arrival to the briefing. Voice controls are temporarily removed. The dialogue script lives in [mission-copy.ts](frontend/src/mission/mission-copy.ts).

Site selection uses the repository's existing Three.js Moon with LROC/LOLA visual data, opened over the south pole. A coordinate list supports keyboard selection and devices without WebGL. Existing illustrative launch and landing transitions last 3.2 seconds and can be skipped; reduced motion bypasses them. New spacecraft animations remain outside this text-and-navigation change.

## Open without installation

**Lunar-English.html** contains the application, images, font, and data in one file. Open it in a modern desktop browser. Generated deliveries stay outside Git.

Build it with Node.js 24 and npm 11:

```sh
npm ci --include=dev
npm run typecheck
npm run build:offline
```

The command prints the output path. Choose a directory with `npm run build:offline -- /path/to/delivery`. The same application is also written as `Lunar-Missao.html` for earlier links. External source links need internet only when opened.

## Develop

```sh
npm ci --include=dev
npm run dev
```

Open the URL printed by Vite. To preview the production build:

```sh
npm run build
npm run check:deploy
npm exec --workspace frontend -- vite preview --host 127.0.0.1 --port 4174
```

These commands run locally. Vercel configuration remains at the repository root, with output in `frontend/dist`.

## What the results mean

The four observers are at −85° planetocentric latitude and east longitudes 0°, 90°, 180°, and 270°, on a sphere with radius 1,737,400 m. Selected dates are March 24, April 28, and September 8, 2026, at 00:00 UTC. Directions were calculated with Python/SPICE, DE421, IAU_MOON, and CN+S. The browser consumes validated static artifacts.

The exercise requires the **centers** of both bodies above the idealized tangent horizon, using full-precision values. B and C qualify in March, A in April, and D in September. The result depends on the site and date.

**This does not calculate mountain obstruction, shadows, generated power, radio availability, or landing safety.** LROC imagery and LOLA relief are visual references. Fixed shading does not represent the selected date's Sun. The globe is spherical; no transformation connects the terrain's MOON_ME frame to the calculations' IAU_MOON frame. Characters and flights are illustrative. Three sampled dates cannot establish continuous visibility windows or rise/set times. About contains sources, limitations, and the complete data download.

Calculations are reproducible but have not been independently validated against Horizons. Kernel hashes were checked against third-party distributions; current LSK completeness is unconfirmed. Numerical reproduction does not certify physical accuracy. The project does not imply NASA endorsement.

## Architecture and verification

- [Current implementation and browser checks](docs/guided-mission.md), [English script and navigation](docs/mission-dialogue.md), and [guide/voice status](docs/guide-voice.md).
- [Scientific data](docs/mission-data.md) and [reproducible audit](docs/audits/mission/README.md).
- `frontend/src/mission/`: game flow, assets, diagram, and scientific consumer.
- `scripts/build-offline.mjs`: standalone delivery. Browser review scripts live in `scripts/`.
- Previous interfaces in `frontend/src/explorer/` and `LegacyApp.tsx` remain outside the main entry point. Scientific schemas and audit artifacts are unchanged.

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
