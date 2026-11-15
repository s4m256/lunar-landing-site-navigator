"""PSR flags and distances in the pipeline: symmetric lattice, sentinel, mutual consistency.

DEMs and ephemerides here are SYNTHETIC (see navigator_stubs.py).
"""

from __future__ import annotations

import numpy as np

from lunar_science.navigator.data_sources import CandidateSiteSpec
from lunar_science.navigator.dem_horizon import LolaSouthPoleDem, PsrCriterion
from lunar_science.navigator.ephemeris import build_utc_grid
from lunar_science.navigator.pipeline import (
    DEFAULT_PSR_SEARCH_RADIUS_M,
    compute_psr_lattice,
    distance_to_psr_cloud_m,
    evaluate_site_and_grid,
    psr_lattice_offsets,
)
from navigator_stubs import SyntheticEphemeris

SCALE_M = 200.0
SITE = CandidateSiteSpec("synthetic_site", "Synthetic site", "artemis_candidate", -89.8, 0.0, "Synthetic DEM test point.")


def _dem_with_pit(pit_offset_m: tuple[float, float] | None) -> tuple[LolaSouthPoleDem, float, float]:
    """Flat synthetic plain; optionally a 2000 m deep, 600 m radius pit offset from SITE (map meters)."""
    n = 121
    z = np.zeros((n, n))
    dem = LolaSouthPoleDem.from_synthetic_array(z, map_scale_m=SCALE_M)
    cx, cy = dem.latlon_to_xy_m(SITE.latitude_deg, SITE.longitude_east_deg)
    if pit_offset_m is not None:
        rows, cols = np.mgrid[0:n, 0:n]
        x = (cols - dem.meta.sample_projection_offset) * SCALE_M
        y = -(rows - dem.meta.line_projection_offset) * SCALE_M
        r = np.hypot(x - (cx + pit_offset_m[0]), y - (cy + pit_offset_m[1]))
        z[r <= 600.0] = -2000.0
        dem = LolaSouthPoleDem.from_synthetic_array(z, map_scale_m=SCALE_M)
    return dem, float(cx), float(cy)


def _evaluate(dem: LolaSouthPoleDem) -> dict:
    eph = SyntheticEphemeris()
    stamps = build_utc_grid("2026-11-15T00:00:00Z", "2026-11-16T00:00:00Z", 1.0)
    base = eph.moon_centered_ephemeris(stamps)
    return evaluate_site_and_grid(
        SITE, dem, eph, base, None, stamps, 3600, az_step_deg=10.0, grid_spacing_m=500.0, grid_size=5
    )


def test_psr_lattice_is_symmetric_and_contains_the_center() -> None:
    offsets = psr_lattice_offsets(DEFAULT_PSR_SEARCH_RADIUS_M, 500.0)
    as_set = set(offsets)
    assert (0.0, 0.0) in as_set  # the old lattice (-5200..4800 m) never contained the center
    assert as_set == {(-dx, -dy) for dx, dy in as_set}
    assert max(np.hypot(dx, dy) for dx, dy in offsets) <= DEFAULT_PSR_SEARCH_RADIUS_M
    assert len(offsets) == len(as_set) == 341
    # A pit centered on the site makes the center itself a PSR lattice point.
    dem, cx, cy = _dem_with_pit((0.0, 0.0))
    xs, ys = compute_psr_lattice(dem, SITE.latitude_deg, SITE.longitude_east_deg, PsrCriterion(), 2.0, 10.0, SCALE_M)
    assert any(abs(x - cx) < 1e-6 and abs(y - cy) < 1e-6 for x, y in zip(xs, ys))


def test_psr_distance_is_none_when_nothing_is_found() -> None:
    assert distance_to_psr_cloud_m(0.0, 0.0, False, np.array([]), np.array([])) is None
    assert distance_to_psr_cloud_m(0.0, 0.0, True, np.array([]), np.array([])) == 0.0
    assert distance_to_psr_cloud_m(3.0, 4.0, False, np.array([0.0]), np.array([0.0])) == 5.0


def test_flat_site_without_psr_emits_null_distance_and_zero_science_score() -> None:
    """Contract 1.1.0: "no PSR point within the search radius" is null, never the radius itself."""
    entry = _evaluate(_dem_with_pit(None)[0])
    assert entry["center"]["is_psr"] is False
    assert entry["center"]["psr_distance_m"] is None
    assert all(n["psr_distance_m"] is None for n in entry["local_grid"]["nodes"])
    assert DEFAULT_PSR_SEARCH_RADIUS_M not in {n["psr_distance_m"] for n in entry["local_grid"]["nodes"]}
    assert entry["engineering_summary"]["score"]["science_psr_0_100"] == 0.0


def test_psr_flags_and_distances_never_contradict_each_other() -> None:
    entry = _evaluate(_dem_with_pit((1000.0, 0.0))[0])
    nodes = entry["local_grid"]["nodes"]
    psr_nodes = [n for n in nodes if n["is_psr"]]
    assert psr_nodes, "the synthetic pit should contain PSR grid nodes"
    center_d = entry["center"]["psr_distance_m"]
    for n in psr_nodes:
        assert n["psr_distance_m"] == 0.0
        assert center_d <= np.hypot(n["dx_m"], n["dy_m"]) + 0.05
    for n in nodes:
        if not n["is_psr"]:
            nearest_flagged = min(np.hypot(n["dx_m"] - p["dx_m"], n["dy_m"] - p["dy_m"]) for p in psr_nodes)
            assert n["psr_distance_m"] <= nearest_flagged + 0.05
