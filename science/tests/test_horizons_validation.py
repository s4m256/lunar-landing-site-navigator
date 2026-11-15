"""Horizons comparison: parsing, tolerance, error classification and evidence retention.

Everything runs offline with SYNTHETIC stubs (see navigator_stubs.py); no assertion here says
anything about the real Horizons service or about the committed artifact.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from urllib.error import HTTPError, URLError

import numpy as np
import pytest

from lunar_science.navigator.ephemeris import (
    DEFAULT_HORIZONS_TOLERANCE_DEG,
    HorizonsNetworkError,
    HorizonsResponseError,
    angular_separation_deg,
    build_utc_grid,
    compare_engine_with_horizons,
    parse_horizons_observer_table,
    query_jpl_horizons_topocentric,
    remove_horizons_validation_artifacts,
    validate_ephemeris_against_horizons,
    wrapped_angle_diff_deg,
    write_horizons_validation_artifacts,
)
from navigator_stubs import SyntheticEphemeris, SyntheticHorizons, synthetic_horizons_body

SITE = dict(site_id="t", site_name="Test site", lat_deg=-89.45, lon_east_deg=222.5, elevation_m=1953.07)
WINDOW = dict(start_utc="2026-11-15T00:00:00Z", stop_utc="2026-11-21T00:00:00Z", step_size="2 d")


def _validate(fetch, **overrides):
    eph = SyntheticEphemeris()
    kwargs = {**SITE, **WINDOW, "cache_dir": Path("/nonexistent"), "fetch": fetch, "engine": eph.engine, **overrides}
    return validate_ephemeris_against_horizons(**kwargs)


def _result_text(table: str) -> str:
    return json.loads(synthetic_horizons_body([], table=table))["result"]


def test_parser_reads_synthetic_table_and_keeps_every_row() -> None:
    table = " 2026-Nov-15 00:00, , ,251.917870,1.385700,\n\n 2026-Nov-17 00:00,*,m,227.567520,1.182230,"
    rows = parse_horizons_observer_table(_result_text(table))
    assert [r["timestamp_utc"] for r in rows] == ["2026-11-15T00:00:00Z", "2026-11-17T00:00:00Z"]
    assert rows[1]["az_deg"] == pytest.approx(227.56752) and rows[1]["el_deg"] == pytest.approx(1.18223)


@pytest.mark.parametrize(
    "table",
    [
        " 2026-Nov-15 00:00, , ,251.9,",  # one numeric column: Az/El missing
        " 2026-Nov-15 00:00, , ,abc,1.2,",  # non-numeric
        " 2026-Nov-15 00:00, , ,361.0,1.2,",  # out of range
        " 15/11/2026 00:00, , ,251.9,1.2,",  # unknown date format
    ],
)
def test_parser_rejects_invalid_rows_instead_of_skipping_them(table: str) -> None:
    with pytest.raises(HorizonsResponseError):
        parse_horizons_observer_table(_result_text(table))


def test_empty_table_is_an_error() -> None:
    with pytest.raises(HorizonsResponseError, match="empty"):
        parse_horizons_observer_table(_result_text(""))
    with pytest.raises(HorizonsResponseError):
        _validate(lambda url, t: (200, synthetic_horizons_body([], table="   ")))


@pytest.mark.parametrize("text", ["no markers at all", "$$SOE\n$$EOE\n$$SOE\n$$EOE", "$$EOE\n x \n$$SOE"])
def test_missing_duplicated_or_swapped_markers_are_errors(text: str) -> None:
    with pytest.raises(HorizonsResponseError):
        parse_horizons_observer_table(text)


def test_large_discrepancy_is_failed_not_verified_and_reports_numbers() -> None:
    report = _validate(SyntheticHorizons(el_offset_deg={"10": 0.5}))
    assert report["status"] == "failed"
    assert report["samples_exceeding_tolerance"] == {"sun": 4, "earth": 0}
    assert report["max_sun_angular_diff_deg"] == pytest.approx(0.5, abs=1e-6)
    assert report["max_earth_angular_diff_deg"] < 1e-6
    assert all(not r["within_tolerance"] for r in report["sun_comparisons"])


def test_within_tolerance_is_verified_and_records_tolerance_and_raw_evidence() -> None:
    stub = SyntheticHorizons(el_offset_deg={"399": 2e-4})
    report = _validate(stub)
    assert report["status"] == "verified"
    assert report["tolerance_deg"] == DEFAULT_HORIZONS_TOLERANCE_DEG
    assert report["tolerance_rationale"]
    assert report["sample_count"] == 4 and report["requested_grid"]["sample_count"] == 4
    # 6-decimal formatting of the synthetic table adds up to ~1e-6 deg.
    assert report["max_earth_angular_diff_deg"] == pytest.approx(2e-4, abs=1e-6)
    queries = report["horizons_queries"]
    assert [q["target_command"] for q in queries] == ["10", "399"]
    for q, url in zip(queries, stub.calls):
        assert q["request_url"] == url
        assert q["request_params"]["EXTRA_PREC"] == "'YES'"
        assert q["retrieved_utc"].endswith("Z")
        assert "SYNTHETIC TEST FIXTURE" in q["response_text"]
        assert len(q["response_sha256"]) == 64


def test_tolerance_is_configurable_and_must_be_positive() -> None:
    assert _validate(SyntheticHorizons(el_offset_deg={"399": 2e-4}), tolerance_deg=1e-4)["status"] == "failed"
    for bad in (0.0, -1.0, float("nan"), float("inf")):
        with pytest.raises(ValueError):
            _validate(SyntheticHorizons(), tolerance_deg=bad)


def test_sun_and_earth_row_counts_must_match_each_other_and_the_request() -> None:
    with pytest.raises(HorizonsResponseError, match="Sun rows"):
        _validate(SyntheticHorizons(drop_last_row={"399": True}))
    with pytest.raises(HorizonsResponseError, match="epochs were requested"):
        _validate(SyntheticHorizons(drop_last_row={"10": True, "399": True}))


def test_horizons_epochs_must_be_the_requested_ones() -> None:
    def shifted(url: str, timeout_s: float) -> tuple[int, bytes]:
        status, body = SyntheticHorizons()(url, timeout_s)
        return status, body.replace(b"2026-Nov-17 00:00", b"2026-Nov-17 01:00")

    with pytest.raises(HorizonsResponseError, match="was requested"):
        _validate(shifted)


@pytest.mark.parametrize(
    "exc",
    [
        URLError("Tunnel connection failed: 403 Forbidden"),
        TimeoutError("timed out"),
        ConnectionResetError("reset"),
        HTTPError("https://x", 503, "Service Unavailable", {}, io.BytesIO(b"")),
        HTTPError("https://x", 403, "Forbidden", {}, io.BytesIO(b"")),
    ],
)
def test_transport_failures_are_network_errors(exc: BaseException) -> None:
    def fetch(url: str, timeout_s: float) -> tuple[int, bytes]:
        raise exc

    with pytest.raises(HorizonsNetworkError):
        query_jpl_horizons_topocentric(-89.45, 222.5, 1953.07, "2026-11-15T00:00:00Z", "2026-11-17T00:00:00Z", "2 d", "10", fetch=fetch)


@pytest.mark.parametrize(
    "fetch, expected",
    [
        (lambda u, t: (_ for _ in ()).throw(HTTPError(u, 400, "Bad Request", {}, io.BytesIO(b"{}"))), HorizonsResponseError),
        (lambda u, t: (200, b"<html>not json</html>"), HorizonsResponseError),
        (lambda u, t: (200, json.dumps({"error": "Cannot interpret date"}).encode()), HorizonsResponseError),
        (lambda u, t: (_ for _ in ()).throw(ValueError("bug in caller code")), ValueError),
    ],
)
def test_non_network_problems_are_not_network_errors(fetch, expected) -> None:
    with pytest.raises(expected) as info:
        query_jpl_horizons_topocentric(-89.45, 222.5, 1953.07, "2026-11-15T00:00:00Z", "2026-11-17T00:00:00Z", "2 d", "10", fetch=fetch)
    assert not isinstance(info.value, HorizonsNetworkError)


def test_azimuth_differences_wrap_around_north() -> None:
    assert float(wrapped_angle_diff_deg(359.99999, 0.00001)) == pytest.approx(-2e-5, abs=1e-9)
    assert float(angular_separation_deg(359.99999, 1.0, 0.00001, 1.0)) == pytest.approx(2e-5 * np.cos(np.radians(1.0)), rel=1e-6)
    stamps = build_utc_grid("2026-11-15T00:00:00Z", "2026-11-15T00:00:00Z", 1.0)

    class Series:
        sun_az_deg = np.array([359.99999])
        sun_el_deg = np.array([1.0])
        earth_az_deg = np.array([10.0])
        earth_el_deg = np.array([5.0])

    def query(target: str, az: float, el: float):
        return query_jpl_horizons_topocentric(
            -89.45, 222.5, 0.0, stamps[0], stamps[0], "1 h", target,
            fetch=lambda u, t: (200, synthetic_horizons_body([(stamps[0], az, el)])),
        )

    report = compare_engine_with_horizons(stamps, Series, query("10", 0.00001, 1.0), query("399", 10.0, 5.0))
    assert report["status"] == "verified"
    assert report["max_sun_az_diff_deg"] == pytest.approx(2e-5, abs=1e-9)


def test_artifacts_keep_exact_raw_responses_and_stale_ones_are_removed(tmp_path: Path) -> None:
    report = _validate(SyntheticHorizons())
    paths = write_horizons_validation_artifacts(tmp_path, report)
    written = json.loads(paths["horizons_validation"].read_text())
    assert written["status"] == "verified"
    for q, original in zip(written["horizons_queries"], report["horizons_queries"]):
        assert "response_text" not in q
        raw = (tmp_path / q["response_file"]).read_bytes()
        assert raw.decode("utf-8") == original["response_text"]
        assert q["response_sha256"] == original["response_sha256"]

    tampered = json.loads(json.dumps(report))
    tampered["horizons_queries"][0]["response_text"] += " "
    with pytest.raises(ValueError, match="SHA-256"):
        write_horizons_validation_artifacts(tmp_path / "other", tampered)

    removed = remove_horizons_validation_artifacts(tmp_path)
    assert {p.name for p in removed} == {"horizons_cross_validation.json", "horizons_raw"}
    assert not (tmp_path / "horizons_cross_validation.json").exists()
