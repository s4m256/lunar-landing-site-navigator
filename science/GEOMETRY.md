# Geometric engine 1.0.0

This batch engine emits real apparent topocentric **center** directions of SUN (10) and EARTH (399), viewed from two configurable lunar observers. There is no HTTP service. Existing `science-status` 1.0.0 and the no-argument CLI retain their original placeholder meaning; use the `analyze` subcommand for science.

## Reproduce the committed historical calculation

From the repository root, Python 3.12+:

```sh
python -m venv .venv
.venv/bin/python -m pip install -e './science[dev]'
.venv/bin/python -m lunar_science fetch-kernels --kernel-set science/examples/kernel-set.json --kernel-dir science/.kernels
.venv/bin/python -m lunar_science analyze --request science/examples/request.json --kernel-set science/examples/kernel-set.json --kernel-dir science/.kernels --output /tmp/lunar-result.json
LUNAR_KERNEL_DIR="$PWD/science/.kernels" .venv/bin/python -m pytest science/tests
.venv/bin/python science/tools/compare_horizons.py --result /tmp/lunar-result.json --output /tmp/horizons-comparison.json
```

No kernels are committed. The downloader requires HTTPS and checks pinned SHA-256 on download and on every analysis. The committed result is calculated, not synthetic. It uses two hypothetical coordinate choices (not nominated landing sites), on 2007-01-01, at 00, 01 and 02 UTC. It is not a 2026 prediction.

## Sources, integrity and coverage

`kernel-set.json` pins a DE405 SPK subset, NAIF `pck00010.tpc`, and `naif0012.tls` from the public SpiceyPy test-kernel mirror. Their MD5 values were also checked against SpiceyPy's published gettestkernels.py; SHA-256 values are pinned here. These are JPL/NAIF-format data of documented origin, **retrieved from a third-party mirror**, not independently downloaded from NAIF in this task. Inspect SPK comments using NAIF tools for the original DE405 release details.

Upstream catalogs:
- https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/
- https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/
- https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/
- https://naif.jpl.nasa.gov/naif/data_lunar.html
- Mirror and checksum reference: https://github.com/AndrewAnnex/SpiceyPyTestKernels and https://github.com/AndrewAnnex/SpiceyPy/blob/main/src/spiceypy/tests/gettestkernels.py

Each result records all SPK object coverage intervals in ET. CSPICE must also successfully evaluate the full state chain, light-time-retarded epochs, requested boundaries and every returned sample; being inside one nominal coverage window is not sufficient. The historical subset does not cover 2026 and a test verifies that 2026 fails explicitly. For current mission dates, obtain a suitable official planetary SPK and compatible PCK/LSK, verify the upstream integrity information, then create a new filename/HTTPS-source/SHA-256 kernel-set manifest. Do not rename a file or alter a checksum merely to bypass a failure. High-accuracy PA/ME orientation is a separate model version, not silently substituted for IAU_MOON.

## Physical conventions

- Planetocentric latitude [-90,90], east-positive longitude [0,360), degrees, in `IAU_MOON`.
- Spherical reference radius **1,737,400 m**. This is a declared idealized surface, not measured elevation or a DEM. Height is radial meters above this sphere (supported range 0–10000 m). No terrain is implied.
- Convert observer radius plus height to **km** for CSPICE. Use `spkcpo` with Moon center, fixed observer in IAU_MOON, `CN+S` (reception converged light time plus stellar aberration) and output frame evaluated at `OBSERVER` epoch.
- IAU_MOON is defined by analytic PCK orientation, not a high-accuracy lunar principal-axis/mean-Earth solution. The result must not be advertised with a positional/angular accuracy unsupported by independent validation.
- ENU uses radial up; east follows increasing longitude; north completes the right-handed basis. Azimuth is atan2(east,north) modulo 360; elevation is atan2(up,hypot(east,north)). At a geographic pole the supplied longitude defines the meridian; a numerically vertical ray uses azimuth zero as an undefined-direction convention.
- Flat tangent horizon is 0 degrees, including for elevated observers. No spherical horizon dip, topographic masking, refraction, finite-disk visibility, eclipse handling, power, radio-link quality or landing ranking.
- Interval is **[start,end)**. Validate ISO UTC labels with mandatory `Z`, seconds and optional 1–3 fractional digits. Leap-second literals such as `23:59:60Z` are explicitly unsupported. Sampling follows UTC calendar labels at integer steps 1–86400 s; across leap seconds their SI separation can change. SPICE handles UTC/TDB conversion internally. Millisecond output formatting is not an accuracy claim.
- Exactly two distinct site IDs; maximum 100000 sample instants per site/target to bound memory. JSON finite values only. Unknown coverage never becomes fabricated output.

## Contracts and consumer integration

New independent contract families, each version 1.0.0:
- `contracts/analysis-request.v1.schema.json`
- `contracts/analysis-result.v1.schema.json`
- `contracts/scientific-provenance.v1.schema.json`

The result embeds the request, four site/target series, and provenance. Packaged copies of these schemas make wheel validation independent of the checkout; a test requires byte-for-byte equality with contracts. Update both copies together when evolving a new contract version. Existing status schema/fixture are unchanged. A frontend can consume the exported JSON as a static asset; this task does not edit frontend or prescribe claims beyond center directions.

Errors are JSON on stderr and exit code 2 (`INVALID_INPUT`, `MISSING_KERNEL`, `KERNEL_CHECKSUM`, `COVERAGE_ERROR`, `SPICE_ERROR`, etc.). No partial result is written. An existing output file is preserved on failure: always check exit status and do not mistake an older output for a new success. CSPICE kernel state is process-global; the batch API clears/owns the pool and must not run concurrently in threads.

## Executed validation and remaining blocker

Executed: real-kernel integration, schema validation, ENU handedness/orthogonality and cardinal directions, east longitude, height effect, invalid dates, interval endpoint behavior, unavailable 2026 coverage, and J2000-to-body-fixed path equivalence. Floating-point equivalence thresholds test numerical algebra, not physical accuracy. Without `LUNAR_KERNEL_DIR`, real-kernel tests are explicitly skipped; CI downloads the verified set and enables them.

**Horizons comparison has not succeeded.** NAIF, Horizons and GitHub API requests returned proxy HTTP 403. `examples/horizons-comparison.json` retains the actual failed attempt, with no invented residuals/tolerance. The comparison tool submits the exact sample times, lunar observer coordinates and airless observer azimuth/elevation; it retains full responses and computes wrapped azimuth and elevation differences only if references return successfully. Inspect returned times, observer radius/coordinate interpretation, ephemeris version and orientation in the retained headers before interpreting differences. Horizons commonly uses a different DE/orientation solution; numerical agreement is not assumed. No pass/fail physical tolerance is fabricated.

To finish independent validation, allow `ssd.jpl.nasa.gov` and rerun the comparison command, then review headers and residuals. Official acquisition additionally needs `naif.jpl.nasa.gov`. A Horizons-only fallback can use these same requests, retain full responses and metadata, and generate series only after validating the response's coordinate/time conventions. Until then, the SPICE calculation is real and internally tested, but **not independently validated against Horizons**.
