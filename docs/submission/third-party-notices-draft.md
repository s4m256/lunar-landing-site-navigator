<!--
Rascunho SPA-13 (QA). Os Termos 2026 exigem identificar as licenças de dados e de código de terceiros
na documentação submetida e citar todas as fontes. O corpo está em inglês porque vai acompanhar a
submissão. "OK (metadados locais)" = licença lida nos metadados instalados nesta máquina em 15/11/2026.
"VERIFICAR" = não confirmado aqui (host bloqueado, fonte ausente no código ou versão incerta).
Antes de publicar: resolver cada VERIFICAR, escolher a licença do projeto e renomear para
THIRD-PARTY-NOTICES.md (ou equivalente) na raiz.
-->

# Third-party data, software and references (DRAFT)

Scope: repository `s4m256/lunar-landing-site-navigator`, `main` at `23cc0c7` plus the QA branch
`chore/spa-13-qa-submission`. Versions are the ones resolved by `package-lock.json` and by a fresh
`pip install -e './science[dev]'` on 2026-11-15. The committed dataset was generated on 2026-11-14 in an
environment whose Python package versions were not recorded (there is no Python lockfile).

## 1. Data

| Data | How the project uses it | Source | License / terms | Status |
| --- | --- | --- | --- | --- |
| LRO LOLA gridded polar DEM `LDEM_80S_80M` (`.img` + `.lbl`), PDS data set `LRO-L-LOLA-4-GDR-V1.0`, 80 m/px, 80°S–90°S | Elevation, slope, 360° terrain horizon (rays up to 120 km), PSR classification for 10 points and their 5×5 grids | `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.img` (and `.lbl`), as pinned in `science/src/lunar_science/navigator/data_sources.py` with SHA-256 | NASA PDS public data. NASA data are generally not subject to US copyright; follow the PDS Geosciences Node citation guidance | VERIFICAR: host blocked here, SHA-256 not re-checked, citation wording not confirmed |
| NAIF generic kernels: `naif0012.tls` (LSK), `pck00010.tpc` (PCK), `moon_080317.tf` and `moon_assoc_me.tf` (FK), `moon_pa_de421_1900-2050.bpc` (binary PCK), `de421.bsp` (SPK, DE421) | Sun and Earth apparent az/el in `MOON_ME` with `LT+S` for every site and hour | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/...` (exact paths and SHA-256 in `data_sources.py` and in the dataset `provenance.ephemeris.kernels`) | NASA/JPL NAIF public distribution; NAIF publishes rules of use and credit guidance (`https://naif.jpl.nasa.gov/naif/rules.html`, `https://naif.jpl.nasa.gov/naif/credit.html`) | VERIFICAR: host blocked here; kernels not present in this environment |
| JPL Horizons API (`https://ssd.jpl.nasa.gov/api/horizons.api`, `CENTER='coord@301'`, `QUANTITIES='4'`) | Comparison of Sun/Earth directions at one site, 16 epochs (`outputs/validation/horizons_cross_validation.json`) | NASA/JPL Solar System Dynamics | Public NASA/JPL service; cite per Horizons documentation | VERIFICAR: the SPA-9 audit found the query probably happened, but the raw response was not retained and could not be reproduced here (host blocked) |
| NASA, "NASA Provides Update on Artemis III Moon Landing Regions" (news release, 2024-10-28) | Names of 8 of the 9 candidate regions are used as labels for 8 of the 10 points | `https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/` | NASA web content | OK: page read on 2026-11-15. The point coordinates do NOT come from this release (NASA lists regions, not points); their source is not recorded in the code: VERIFICAR |
| Relay orbit presets: "ELFO" `a = 5740 km, e = 0.58, i = 57.8°, ω = 90°` (1 and 3 satellites, labelled Lunar Pathfinder / LunaNet) and an "LRO-like" 50 km circular polar orbit | Geometric relay visibility series and duty cycles | Hard-coded in `science/src/lunar_science/navigator/comms.py` | No source cited | VERIFICAR: cite a public source or declare them as team-defined hypothetical scenarios. LRO is not a relay and the preset is not LRO's real orbit |
| Physical constants: solar constant 1361 W/m²; solar radius 695 700 km; Earth equatorial radius 6378.137 km; AU 149 597 870.7 km; lunar GM 4902.800066 km³/s²; lunar reference radius 1737.4 km | Irradiance, angular radii, Kepler propagation, reference sphere | Hard-coded in `data_sources.py` | Facts, not copyrightable; still to be cited | VERIFICAR: no reference in the code |

The committed outputs (`outputs/` and `frontend/src/data/south_pole_precomputed.v1.json`) are derived
from the data above by the project code. They will be distributed under the project license once one is
chosen (there is no `LICENSE` file yet).

## 2. Software distributed with the web app

Determined from the production build source map (`vite build --sourcemap`): only these packages end up
in `frontend/dist/assets/*.js`.

| Package | Version | License | Status |
| --- | --- | --- | --- |
| react | 19.3.1 | MIT | OK (metadados locais, LICENSE presente) |
| react-dom | 19.3.1 | MIT | OK (metadados locais, LICENSE presente) |
| scheduler | 0.28.0 | MIT | OK (metadados locais, LICENSE presente) |
| ajv | 8.20.0 | MIT | OK (metadados locais, LICENSE presente) |
| fast-deep-equal | 3.1.3 | MIT | OK (metadados locais, LICENSE presente) |
| fast-uri | 3.1.9 | BSD-3-Clause | OK (metadados locais, LICENSE presente) |
| json-schema-traverse | 1.0.0 | MIT | OK (metadados locais, LICENSE presente) |

Compliance gap: the minified bundle contains no license or copyright notice (0 matches for `@license`
and `Copyright` in `frontend/dist/assets/*.js`). MIT and BSD-3-Clause require the notice to accompany
copies. Fix in the frontend: publish a notices file with the site (for example under `frontend/public/`)
and link it from the page, or configure the build to keep legal comments. VERIFICAR after the fix.

The app loads no external fonts, images, scripts or APIs (headless Chromium run: zero requests outside
the preview origin).

## 3. Software used to produce the dataset (Python, not shipped in the web app)

Runtime dependency closure of `lunar-science` 0.2.0 as installed on 2026-11-15:

| Package | Version | License (metadata) | Role | Status |
| --- | --- | --- | --- | --- |
| numpy | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | Numerics | OK (metadados locais) |
| spiceypy | 8.0.0 | MIT (wrapper) | SPICE calls (`spkpos`, frames, time) | OK for the wrapper. The wheel bundles the NAIF CSPICE library (`libcspice.so`): VERIFICAR NAIF rules of use |
| skyfield | 1.55 | MIT | Declared dependency. Only `cross_check_skyfield_sun_earth` uses it, and only a test that is skipped without kernels calls that function; it was not used to produce the dataset | OK (metadados locais) |
| jsonschema | 4.23.0 | MIT | Dataset validation against the JSON Schema | OK (metadados locais) |
| jplephem | 2.24 | MIT | Skyfield dependency | OK (metadados locais) |
| sgp4 | 2.27 | MIT | Skyfield dependency | OK (metadados locais) |
| certifi | 2026.10.23 | MPL-2.0 | Skyfield dependency (CA bundle) | OK (metadados locais) |
| attrs | 26.1.0 | MIT | jsonschema dependency | OK (metadados locais) |
| referencing | 0.37.0 | MIT | jsonschema dependency | OK (metadados locais) |
| jsonschema-specifications | 2025.9.1 | MIT | jsonschema dependency | OK (metadados locais) |
| rpds-py | 2026.9.1 | MIT | jsonschema dependency | OK (metadados locais) |

VERIFICAR: the versions actually used on 2026-11-14 to generate the dataset.

## 4. Build, test and CI tools (not distributed)

- npm direct dev dependencies: vite 7.3.8 (MIT), typescript 5.9.3 (Apache-2.0), vitest 4.1.12 (MIT),
  jsdom 27.4.0 (MIT), @vitejs/plugin-react 5.2.0 (MIT), @testing-library/react 16.3.3 (MIT),
  @testing-library/jest-dom 6.9.1 (MIT), @types/react and @types/react-dom 19.3.0 (MIT).
- Whole installed npm tree (164 packages): MIT 139, ISC 7, Apache-2.0 5, BSD-3-Clause 3,
  BlueOak-1.0.0 3 (`lru-cache`), BSD-2-Clause 2, MIT-0 2, CC-BY-4.0 1 (`caniuse-lite`, data),
  CC0-1.0 1 (`mdn-data`), and 1 without a license field (the project's own `@lunar/frontend` workspace).
- Python dev tools: pytest 8.3.5 (MIT), build 1.2.2.post1 (MIT), pluggy 1.7.0 (MIT), iniconfig 2.3.1
  (MIT), packaging 26.3 (Apache-2.0 OR BSD-2-Clause), pyproject_hooks 1.3.3 (MIT).
- GitHub Actions `actions/checkout@v4`, `actions/setup-node@v4`, `actions/setup-python@v5` (MIT,
  VERIFICAR); hosting on Vercel (service terms, not a license).

## 5. References to cite (bibliographic form to be checked)

1. NASA PDS Geosciences Node, LRO LOLA GDR polar product `LDEM_80S_80M` (`LRO-L-LOLA-4-GDR-V1.0`). VERIFICAR the recommended data citation.
2. Smith, D. E., et al. (2010). The Lunar Orbiter Laser Altimeter investigation on the Lunar Reconnaissance Orbiter mission. *Space Science Reviews*, 150, 209–241. VERIFICAR.
3. Acton, C. H. (1996). Ancillary data services of NASA's Navigation and Ancillary Information Facility. *Planetary and Space Science*, 44(1), 65–70. VERIFICAR (NAIF credit page).
4. Acton, C., Bachman, N., Semenov, B., Wright, E. (2018). A look towards the future in the handling of space science mission geometry. *Planetary and Space Science*, 150, 9–12. VERIFICAR (NAIF credit page).
5. Folkner, W. M., Williams, J. G., Boggs, D. H. (2009). The Planetary and Lunar Ephemeris DE 421. *IPN Progress Report* 42-178. VERIFICAR.
6. Giorgini, J. D., et al. (1996). JPL's On-Line Solar System Data Service. *Bulletin of the American Astronomical Society*, 28(3), 1158. VERIFICAR (Horizons documentation).
7. Annex, A. M., et al. (2020). SpiceyPy: a Pythonic Wrapper for the SPICE Toolkit. *Journal of Open Source Software*, 5(46), 2050. VERIFICAR.
8. NASA (2024-10-28). NASA Provides Update on Artemis III Moon Landing Regions. https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ (read 2026-11-15).
9. Rhodes, B. Skyfield (software). Only if the team keeps the Skyfield claim; today it is not evidence (see section 3).

## 6. How to re-check

```sh
# npm: license of every installed package, from package-lock + node_modules metadata
npm query '*' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s))console.log(p.name,p.version,p.license)})'
# bundled npm packages: build with source maps outside the repo and list node_modules entries in "sources"
npm exec --workspace frontend -- vite build --sourcemap --outDir /tmp/lunar-srcmap --emptyOutDir
# Python: license metadata of the runtime closure
.venv/bin/python -m pip show numpy spiceypy skyfield jsonschema jplephem sgp4 certifi attrs referencing jsonschema-specifications rpds-py
```
