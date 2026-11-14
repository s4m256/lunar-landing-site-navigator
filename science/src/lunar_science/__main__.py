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
        print(json.dumps(get_status(), ensure_ascii=False))
        return

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
    p_pre.add_argument("--end-utc", default="2026-12-15T00:00:00Z")
    p_pre.add_argument("--step-seconds", type=int, default=3600)
    p_pre.add_argument("--skip-horizons", action="store_true")
    p_pre.add_argument("--allow-download", action="store_true")

    p_hor = sub.add_parser(
        "validate-horizons",
        help="Cross-check SPICE MOON_ME topocentric Sun/Earth directions vs JPL Horizons API.",
    )
    p_hor.add_argument("--cache-dir", type=Path, default=None)
    p_hor.add_argument("--site-id", default="shackleton_connecting_ridge")
    p_hor.add_argument("--lat-deg", type=float, default=-89.45)
    p_hor.add_argument("--lon-east-deg", type=float, default=222.5)
    p_hor.add_argument("--elevation-m", type=float, default=1400.0)
    p_hor.add_argument("--start-utc", default="2026-11-15T00:00:00Z")
    p_hor.add_argument("--stop-utc", default="2026-12-14T00:00:00Z")

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
        from lunar_science.navigator.ephemeris import validate_ephemeris_against_horizons

        report = validate_ephemeris_against_horizons(
            cache_dir=cache_dir,
            site_id=parsed.site_id,
            site_name=parsed.site_id,
            lat_deg=parsed.lat_deg,
            lon_east_deg=parsed.lon_east_deg,
            elevation_m=parsed.elevation_m,
            start_utc=parsed.start_utc,
            stop_utc=parsed.stop_utc,
        )
        print(json.dumps(report, indent=2))
        return


if __name__ == "__main__":
    main()
