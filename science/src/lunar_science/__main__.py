"""CLI entry point for lunar-science status placeholder and Navigator pipeline commands."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from lunar_science import get_status


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _default_cache_dir(repo_root: Path) -> Path:
    return repo_root / "science" / ".cache"


def main(argv: list[str] | None = None) -> None:
    args_list = list(sys.argv[1:] if argv is None else argv)
    if not args_list:
        # Legacy science-status.schema.json placeholder (its only allowed status is
        # "not_implemented"); it does not describe the navigator engine below.
        print(json.dumps(get_status(), ensure_ascii=False))
        return

    from lunar_science.navigator.ephemeris import DEFAULT_HORIZONS_TOLERANCE_DEG

    parser = argparse.ArgumentParser(prog="lunar-science")
    sub = parser.add_subparsers(dest="command", required=True)

    p_fetch = sub.add_parser("fetch-navigator-data", help="Download/verify NAIF kernels & LOLA DEM.")
    p_fetch.add_argument("--cache-dir", type=Path, default=None)

    p_pre = sub.add_parser(
        "precompute-navigator",
        help="Run topography, SPICE MOON_ME ephemeris, comms, solar & score precomputation.",
    )
    p_pre.add_argument("--repo-root", type=Path, default=None)
    p_pre.add_argument("--cache-dir", type=Path, default=None)
    p_pre.add_argument("--start-utc", default="2026-11-15T00:00:00Z")
    p_pre.add_argument(
        "--end-utc",
        default="2026-12-15T00:00:00Z",
        help="Default gives 30 days of southern summer only; use >= ~346.6 days for annual statistics.",
    )
    p_pre.add_argument("--step-seconds", type=int, default=3600)
    p_pre.add_argument("--skip-horizons", action="store_true")
    p_pre.add_argument("--horizons-tolerance-deg", type=float, default=DEFAULT_HORIZONS_TOLERANCE_DEG)
    p_pre.add_argument("--horizons-step", default="2 d", help="Horizons STEP_SIZE, e.g. '2 d', '12 h'.")
    p_pre.add_argument("--allow-download", action="store_true")

    p_hor = sub.add_parser(
        "validate-horizons",
        help="Compare SPICE MOON_ME topocentric Sun/Earth directions with the JPL Horizons API.",
    )
    p_hor.add_argument("--cache-dir", type=Path, default=None)
    p_hor.add_argument("--site-id", default="shackleton_ridge")
    p_hor.add_argument("--lat-deg", type=float, default=-89.45)
    p_hor.add_argument("--lon-east-deg", type=float, default=222.5)
    p_hor.add_argument(
        "--elevation-m",
        type=float,
        required=True,
        help="Site elevation above the 1737.4 km sphere (take it from the DEM/dataset).",
    )
    p_hor.add_argument("--start-utc", default="2026-11-15T00:00:00Z")
    p_hor.add_argument("--stop-utc", default="2026-12-15T00:00:00Z")
    p_hor.add_argument("--step-size", default="2 d")
    p_hor.add_argument("--tolerance-deg", type=float, default=DEFAULT_HORIZONS_TOLERANCE_DEG)
    p_hor.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Write the report and the raw Horizons responses here instead of printing everything.",
    )

    parsed = parser.parse_args(args_list)
    repo_root = getattr(parsed, "repo_root", None) or _default_repo_root()
    cache_dir = parsed.cache_dir or _default_cache_dir(repo_root)

    if parsed.command == "fetch-navigator-data":
        from lunar_science.navigator.data_sources import ALL_REMOTE_ASSETS, ensure_assets

        res = ensure_assets(cache_dir, ALL_REMOTE_ASSETS, allow_download=True)
        print(json.dumps({"cache_dir": str(cache_dir), "assets": res}, indent=2))
        return

    if parsed.command == "precompute-navigator":
        from lunar_science.navigator.pipeline import (
            run_navigator_pipeline,
            write_navigator_outputs,
        )

        dataset, horizons_report = run_navigator_pipeline(
            cache_dir=cache_dir,
            start_utc=parsed.start_utc,
            end_utc=parsed.end_utc,
            step_seconds=parsed.step_seconds,
            allow_download=parsed.allow_download,
            run_horizons_check=not parsed.skip_horizons,
            horizons_tolerance_deg=parsed.horizons_tolerance_deg,
            horizons_step_size=parsed.horizons_step,
        )
        paths = write_navigator_outputs(repo_root, dataset, horizons_report)
        print(
            json.dumps(
                {
                    "sites_count": len(dataset["sites"]),
                    "epochs_count": len(dataset["mission_window"]["timestamps_utc"]),
                    "horizons_status": dataset["provenance"]["horizons_validation"]["status"],
                    "outputs": {k: str(v) for k, v in paths.items()},
                },
                indent=2,
            )
        )
        return

    if parsed.command == "validate-horizons":
        from lunar_science.navigator.ephemeris import (
            validate_ephemeris_against_horizons,
            write_horizons_validation_artifacts,
        )

        report = validate_ephemeris_against_horizons(
            cache_dir=cache_dir,
            site_id=parsed.site_id,
            site_name=parsed.site_id,
            lat_deg=parsed.lat_deg,
            lon_east_deg=parsed.lon_east_deg,
            elevation_m=parsed.elevation_m,
            start_utc=parsed.start_utc,
            stop_utc=parsed.stop_utc,
            step_size=parsed.step_size,
            tolerance_deg=parsed.tolerance_deg,
        )
        if parsed.output_dir is not None:
            paths = write_horizons_validation_artifacts(parsed.output_dir, report)
            print(json.dumps({"status": report["status"], "outputs": {k: str(v) for k, v in paths.items()}}, indent=2))
        else:
            print(json.dumps(report, indent=2))
        return


if __name__ == "__main__":
    main()
