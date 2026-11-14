# Lunar South Pole Landing Site Engineering Summary

- **Generated (UTC)**: `2026-11-14T15:52:49Z`
- **Mission Window**: `2026-11-15T00:00:00Z` -> `2026-12-15T00:00:00Z` (`721` hourly epochs)
- **DEM Product**: `LRO-L-LOLA-4-GDR-V1.0 :: LDEM_80S_80M` (`80.0 m/px`, 120 km ray marching)
- **Ephemeris**: `NAIF SPICE (spiceypy) cross-checked with Skyfield` in `MOON_ME (Mean Earth / Polar Axis DE421)` (`LT+S`)
- **JPL Horizons Validation**: `verified`

| Rank | Site | Lat / Lon(E) | Slope (°) | PSR Dist (m) | Mean Illum (%) | Max Shadow (h) | DTE Full (%) | Combined DTE+ELFO (%) | Relay Gain (%) | Max Blackout Comb (h) | Score (/100) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Shackleton–de Gerlache Connecting Ridge | -89.450, 222.500 | 2.00 | 2780 | 100.0 | 0.0 | 35.1 | 100.0 | +64.9 | 0.0 | **88.2** |
| 2 | Malapert Massif | -86.000, 2.700 | 3.13 | 1237 | 73.9 | 158.0 | 68.2 | 100.0 | +31.8 | 0.0 | **82.1** |
| 3 | Nobile Rim 2 | -83.678, 55.553 | 0.70 | 1237 | 55.1 | 313.0 | 60.6 | 100.0 | +39.4 | 0.0 | **74.5** |
| 4 | Peak near Cabeus B | -82.800, 318.378 | 1.86 | 1526 | 41.0 | 218.0 | 58.1 | 100.0 | +41.9 | 0.0 | **72.8** |
| 5 | Mons Mouton Plateau | -84.361, 31.889 | 0.49 | 3705 | 59.1 | 287.0 | 78.0 | 100.0 | +22.1 | 0.0 | **71.1** |
| 6 | Slater Plain | -88.589, 108.347 | 1.23 | 4876 | 64.5 | 242.0 | 35.6 | 100.0 | +64.4 | 0.0 | **67.0** |
| 7 | Haworth | -86.689, 347.500 | 2.93 | 2476 | 43.8 | 247.0 | 36.6 | 100.0 | +63.4 | 0.0 | **66.4** |
| 8 | de Gerlache Rim 2 | -88.161, 287.389 | 1.69 | 5200 | 55.0 | 185.0 | 32.5 | 100.0 | +67.5 | 0.0 | **65.5** |
| 9 | Nobile Rim 1 | -85.122, 36.929 | 0.68 | 4115 | 46.2 | 372.0 | 37.0 | 100.0 | +63.0 | 0.0 | **61.2** |
| 10 | Shackleton Crater Floor (PSR) | -89.625, 118.820 | 4.02 | PSR | 0.0 | 721.0 | 0.0 | 100.0 | +100.0 | 0.0 | **39.6** |

## Key Findings

- **Top-Ranked Candidate**: `Shackleton–de Gerlache Connecting Ridge` scores **88.2/100** (slope `2.00°`, illumination `100.0%`, DTE `35.1%`, DTE+ELFO `100.0%`).
- **Relay Enabling PSR Operations**: `Shackleton Crater Floor (PSR)` (`0.0%` DTE vs `100.0%` with ELFO constellation) gains `+100.0%` link availability inside zero-sunlight terrain.
