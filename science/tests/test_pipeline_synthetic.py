"""Whole pipeline on SYNTHETIC inputs (DEM, ephemeris, Horizons): runs in CI without kernels.

Checks plumbing and labels only: schema conformance, provenance wording, window labeling,
Horizons status handling, raw-evidence retention and removal of stale artifacts. The numbers
produced here are not physical.
"""

from __future__ import annotations

import functools
import json
from pathlib import Path

import numpy as np
import pytest

from lunar_science.navigator.data_sources import CandidateSiteSpec
from lunar_science.navigator.dem_horizon import LolaSouthPoleDem
from lunar_science.navigator.ephemeris import HorizonsNetworkError, HorizonsResponseError, validate_ephemeris_against_horizons
from lunar_science.navigator.pipeline import (
    run_horizons_validation_step,
    run_navigator_pipeline,
    validate_dataset_schema,
    write_navigator_outputs,
)
from navigator_stubs import SyntheticEphemeris, SyntheticHorizons

SITES = (
    CandidateSiteSpec("syn_a", "Synthetic A", "reference_ridge", -89.8, 0.0, "Synthetic flat point."),
    CandidateSiteSpec("syn_b", "Synthetic B", "artemis_candidate", -89.8, 180.0, "Synthetic flat point."),
)


def _run(tmp_path: Path, validator, **kwargs):
    dem = LolaSouthPoleDem.from_synthetic_array(np.zeros((121, 121)), map_scale_m=200.0)
    return run_navigator_pipeline(
        cache_dir=tmp_path / "cache",
        sites=SITES,
        start_utc="2026-11-15T00:00:00Z",
        end_utc="2026-11-16T00:00:00Z",
        step_seconds=3600,
        az_step_deg=10.0,
        grid_size=3,
        dem_override=dem,
        ephemeris_factory=SyntheticEphemeris,
        horizons_validator=validator,
        horizons_step_size="6 h",
        psr_lattice_step_m=1000.0,  # coarser lattice keeps this plumbing test fast
        **kwargs,
    )


def _synthetic_validator(**stub_kwargs):
    return functools.partial(
        validate_ephemeris_against_horizons, fetch=SyntheticHorizons(**stub_kwargs), engine=SyntheticEphemeris().engine
    )


def test_pipeline_labels_engine_window_score_and_relays_honestly(tmp_path: Path) -> None:
    dataset, report = _run(tmp_path, _synthetic_validator())
    validate_dataset_schema(dataset)
    prov = dataset["provenance"]
    assert "Skyfield" not in json.dumps(prov)
    assert prov["ephemeris"]["engine"].startswith("SYNTHETIC")
    limitations = " ".join(prov["limitations"])
    assert "shorter than one seasonal cycle" in limitations
    assert "2026-11-15T00:00:00Z -> 2026-11-16T00:00:00Z (1.0 days" in limitations
    assert "ILLUSTRATIVE" in limitations and "hypothetical" in limitations
    assert "400 m baseline" in limitations  # 2 x 200 m synthetic pixels
    assert "sentinel" in limitations
    assert prov["conventions"]["clps_slope_limit_deg"] == 12.0
    assert all("Hypothetical" in p["name"] for p in dataset["relay_presets"].values())

    hv = prov["horizons_validation"]
    assert hv["status"] == "verified" == report["status"]
    assert any("<= 0.001 deg" in note for note in hv["notes"])
    assert any("horizons_raw" in note for note in hv["notes"])


def test_failed_comparison_is_published_with_numbers_and_raw_evidence(tmp_path: Path) -> None:
    dataset, report = _run(tmp_path, _synthetic_validator(el_offset_deg={"399": 0.3}))
    hv = dataset["provenance"]["horizons_validation"]
    assert hv["status"] == "failed"
    assert hv["max_earth_el_diff_deg"] == pytest.approx(0.3, abs=1e-5)

    paths = write_navigator_outputs(tmp_path, dataset, report)
    artifact = json.loads(paths["horizons_validation"].read_text())
    assert artifact["status"] == "failed"
    raw_files = sorted((tmp_path / "outputs" / "validation" / "horizons_raw").iterdir())
    assert [p.name for p in raw_files] == ["target_10.response.json", "target_399.response.json"]
    md = paths["summary_md"].read_text()
    assert "ILLUSTRATIVE" in md and "Score w/o relay" in md


def test_network_failure_skips_and_removes_stale_artifacts(tmp_path: Path) -> None:
    dataset, report = _run(tmp_path, _synthetic_validator())
    write_navigator_outputs(tmp_path, dataset, report)
    validation_dir = tmp_path / "outputs" / "validation"
    assert (validation_dir / "horizons_cross_validation.json").exists()

    def network_down(**kwargs):
        raise HorizonsNetworkError("URLError: Tunnel connection failed: 403 Forbidden")

    dataset2, report2 = _run(tmp_path, network_down)
    assert report2 is None
    assert dataset2["provenance"]["horizons_validation"]["status"] == "skipped_network_unavailable"
    paths = write_navigator_outputs(tmp_path, dataset2, report2)
    assert not (validation_dir / "horizons_cross_validation.json").exists()
    assert not (validation_dir / "horizons_raw").exists()
    assert any(k.startswith("removed_stale_horizons") for k in paths)


def test_non_network_horizons_errors_abort_the_pipeline(tmp_path: Path) -> None:
    with pytest.raises(HorizonsResponseError):
        _run(tmp_path, _synthetic_validator(drop_last_row={"10": True, "399": True}))

    def bug(**kwargs):
        raise ValueError("max() iterable argument is empty")

    with pytest.raises(ValueError):
        _run(tmp_path, bug)


def test_outputs_refuse_inconsistent_horizons_inputs(tmp_path: Path) -> None:
    dataset, report = _run(tmp_path, _synthetic_validator())
    with pytest.raises(ValueError, match="no comparison report"):
        write_navigator_outputs(tmp_path, dataset, None)
    skipped, _ = _run(tmp_path, None, run_horizons_check=False)
    assert skipped["provenance"]["horizons_validation"]["status"] == "not_requested"
    with pytest.raises(ValueError, match="report was given"):
        write_navigator_outputs(tmp_path, skipped, report)


STEP_KWARGS = dict(
    cache_dir=Path("/nonexistent"),
    site_id="t",
    site_name="Test site",
    lat_deg=-89.45,
    lon_east_deg=222.5,
    elevation_m=1953.07,
    start_utc="2026-11-15T00:00:00Z",
    stop_utc="2026-11-21T00:00:00Z",
    step_size="2 d",
)


def test_pipeline_step_labels_only_network_errors_as_network() -> None:
    def network_down(**kwargs):
        raise HorizonsNetworkError("URLError: Tunnel connection failed: 403 Forbidden")

    prov, report = run_horizons_validation_step(network_down, **STEP_KWARGS)
    assert prov["status"] == "skipped_network_unavailable" and report is None
    assert "403" in prov["notes"][0]

    for exc in (HorizonsResponseError("Horizons ephemeris table is empty."), ValueError("max() arg is an empty sequence"), KeyError("az")):
        def broken(exc=exc, **kwargs):
            raise exc

        with pytest.raises(type(exc)):
            run_horizons_validation_step(broken, **STEP_KWARGS)


def test_pipeline_step_publishes_failed_status_with_numbers() -> None:
    prov, report = run_horizons_validation_step(_synthetic_validator(el_offset_deg={"10": 0.5}), **STEP_KWARGS)
    assert prov["status"] == "failed" == report["status"]
    assert prov["max_sun_el_diff_deg"] == pytest.approx(0.5, abs=1e-6)
    assert any("Sun 4" in note for note in prov["notes"])
