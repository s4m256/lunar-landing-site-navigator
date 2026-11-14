"""LRO LOLA South Pole DEM parser, slope estimator, geodesic horizon ray-marcher, and PSR proximity."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple

import numpy as np

from .data_sources import LUNAR_REFERENCE_RADIUS_M


@dataclass(frozen=True)
class PolarDemMetadata:
    lines: int
    line_samples: int
    map_scale_m: float
    scaling_factor: float
    offset_m: float
    line_projection_offset: float
    sample_projection_offset: float
    reference_radius_m: float
    coordinate_system: str


def parse_pds3_lbl(lbl_path: Path) -> PolarDemMetadata:
    """Parse essential projection and scaling keys from a PDS3 LOLA GDR .lbl file."""
    text = lbl_path.read_text(encoding="utf-8", errors="replace")

    def _num(key: str, default: float | None = None) -> float:
        m = re.search(rf"^\s*{re.escape(key)}\s*=\s*([-+]?\d+(?:\.\d+)?)", text, re.MULTILINE)
        if not m:
            if default is not None:
                return default
            raise ValueError(f"Missing numeric PDS3 keyword {key} in {lbl_path}")
        return float(m.group(1))

    def _str(key: str, default: str = "") -> str:
        m = re.search(rf'^\s*{re.escape(key)}\s*=\s*"([^"]+)"', text, re.MULTILINE)
        return m.group(1).strip() if m else default

    map_scale_match = re.search(
        r"^\s*MAP_SCALE\s*=\s*([-+]?\d+(?:\.\d+)?)\s*(?:<([^>]+)>)?",
        text,
        re.MULTILINE,
    )
    if not map_scale_match:
        raise ValueError(f"Missing numeric PDS3 keyword MAP_SCALE in {lbl_path}")
    map_scale_m = float(map_scale_match.group(1))
    map_unit = (map_scale_match.group(2) or "").strip().lower()
    if map_unit.startswith("km"):
        map_scale_m *= 1000.0

    return PolarDemMetadata(
        lines=int(_num("LINES")),
        line_samples=int(_num("LINE_SAMPLES")),
        map_scale_m=map_scale_m,
        scaling_factor=_num("SCALING_FACTOR", 0.5),
        offset_m=_num("OFFSET", LUNAR_REFERENCE_RADIUS_M),
        line_projection_offset=_num("LINE_PROJECTION_OFFSET"),
        sample_projection_offset=_num("SAMPLE_PROJECTION_OFFSET"),
        reference_radius_m=_num("A_AXIS_RADIUS", 1737.4) * 1000.0,
        coordinate_system=_str("COORDINATE_SYSTEM_NAME", "MEAN EARTH/POLAR AXIS OF DE421"),
    )


def selenographic_to_cartesian_me(
    lat_deg: float,
    lon_east_deg: float,
    elevation_m: float,
    ref_radius_m: float = LUNAR_REFERENCE_RADIUS_M,
) -> np.ndarray:
    """Convert planetocentric (lat, lon_east, elevation) to Moon-fixed Cartesian vector (meters)."""
    phi = math.radians(lat_deg)
    lam = math.radians(lon_east_deg)
    r = ref_radius_m + elevation_m
    return np.array(
        [
            r * math.cos(phi) * math.cos(lam),
            r * math.cos(phi) * math.sin(lam),
            r * math.sin(phi),
        ],
        dtype=np.float64,
    )


def max_solar_elevation_curve(lat_deg: float, azimuths_deg: np.ndarray) -> np.ndarray:
    """
    Analytical upper bound of solar center elevation over an 18.6-year lunar cycle
    for each topocentric azimuth (North=0, East=90) at southern latitude lat_deg.
    Derived from sin(delta_sun) = sin(lat)*sin(el) + cos(lat)*cos(el)*cos(az),
    evaluated at southern summer peak subsolar latitude delta_sun = -1.543 deg.
    """
    phi = math.radians(lat_deg)
    az = np.radians(azimuths_deg)
    sin_delta = math.sin(math.radians(-1.543))
    a = math.sin(phi)
    b = math.cos(phi) * np.cos(az)
    norm = np.hypot(a, b)
    # Solve a*sin(el) + b*cos(el) = sin_delta => norm*sin(el + theta) = sin_delta
    # More explicitly maximize over delta in [-1.543, +1.543]:
    # Since sin(phi) < 0 near South Pole, most negative delta gives highest el.
    ratio = np.clip(sin_delta / np.where(norm > 1e-12, norm, 1e-12), -1.0, 1.0)
    # Two roots for sin(el + atan2(b, a)) = ratio; take physical branch near horizon
    theta = np.arctan2(b, a)
    # a < 0 for South hemisphere; rewrite (-a)*sin(el) - b*cos(el) = -sin_delta (>0)
    # Let psi = atan2(-b, -a); then norm*sin(el + psi) = -sin_delta
    psi = np.arctan2(-b, -a)
    el1 = np.arcsin(np.clip(-sin_delta / np.where(norm > 1e-12, norm, 1e-12), -1.0, 1.0)) - psi
    # Normalize to [-pi/2, pi/2]
    el_deg = np.degrees(np.arctan2(np.sin(el1), np.cos(el1)))
    return el_deg


class LolaSouthPoleDem:
    """Memory-mapped LRO LOLA South Polar Stereographic DEM analyzer."""

    def __init__(self, img_path: Path | None, meta: PolarDemMetadata, array: np.ndarray | None = None):
        self.meta = meta
        if array is not None:
            self._raw = array
            self._is_scaled = True
        elif img_path is not None:
            self._raw = np.memmap(
                img_path,
                dtype="<i2",
                mode="r",
                shape=(meta.lines, meta.line_samples),
            )
            self._is_scaled = False
        else:
            raise ValueError("Provide either img_path or an in-memory elevation array")

    @classmethod
    def from_pds_files(cls, img_path: Path, lbl_path: Path) -> "LolaSouthPoleDem":
        return cls(img_path=img_path, meta=parse_pds3_lbl(lbl_path))

    @classmethod
    def from_synthetic_array(
        cls,
        elevations_m: np.ndarray,
        map_scale_m: float = 80.0,
        ref_radius_m: float = LUNAR_REFERENCE_RADIUS_M,
    ) -> "LolaSouthPoleDem":
        """Build an in-memory polar stereographic DEM for deterministic unit tests."""
        lines, cols = elevations_m.shape
        offset = (lines - 1) / 2.0
        meta = PolarDemMetadata(
            lines=lines,
            line_samples=cols,
            map_scale_m=map_scale_m,
            scaling_factor=1.0,
            offset_m=ref_radius_m,
            line_projection_offset=offset,
            sample_projection_offset=offset,
            reference_radius_m=ref_radius_m,
            coordinate_system="TEST_SYNTHETIC_POLAR_STEREOGRAPHIC",
        )
        return cls(img_path=None, meta=meta, array=np.asarray(elevations_m, dtype=np.float64))

    def latlon_to_xy_m(self, lat_deg: np.ndarray | float, lon_east_deg: np.ndarray | float) -> Tuple[np.ndarray, np.ndarray]:
        """Convert planetocentric (lat, east_lon) to polar stereographic map meters (X right=90E, Y up=0E)."""
        lat = np.asarray(lat_deg, dtype=np.float64)
        lon = np.radians(np.asarray(lon_east_deg, dtype=np.float64))
        r = 2.0 * self.meta.reference_radius_m * np.tan(np.radians(lat + 90.0) / 2.0)
        x = r * np.sin(lon)
        y = r * np.cos(lon)
        return x, y

    def xy_m_to_latlon(self, x_m: np.ndarray | float, y_m: np.ndarray | float) -> Tuple[np.ndarray, np.ndarray]:
        """Convert polar stereographic map meters back to planetocentric (lat_deg, lon_east_deg)."""
        x = np.asarray(x_m, dtype=np.float64)
        y = np.asarray(y_m, dtype=np.float64)
        r = np.hypot(x, y)
        lat = -90.0 + np.degrees(2.0 * np.arctan(0.5 * r / self.meta.reference_radius_m))
        lon = np.degrees(np.arctan2(x, y)) % 360.0
        return lat, lon

    def latlon_to_rowcol(self, lat_deg: np.ndarray | float, lon_east_deg: np.ndarray | float) -> Tuple[np.ndarray, np.ndarray]:
        x, y = self.latlon_to_xy_m(lat_deg, lon_east_deg)
        col = x / self.meta.map_scale_m + self.meta.sample_projection_offset
        row = -y / self.meta.map_scale_m + self.meta.line_projection_offset
        return row, col

    def rowcol_to_latlon(self, row: np.ndarray | float, col: np.ndarray | float) -> Tuple[np.ndarray, np.ndarray]:
        x = (np.asarray(col, dtype=np.float64) - self.meta.sample_projection_offset) * self.meta.map_scale_m
        y = -(np.asarray(row, dtype=np.float64) - self.meta.line_projection_offset) * self.meta.map_scale_m
        return self.xy_m_to_latlon(x, y)

    def sample_elevation_rowcol(self, row: np.ndarray | float, col: np.ndarray | float) -> np.ndarray:
        """Vectorized bilinear interpolation of terrain elevation (meters relative to R_ref)."""
        r = np.asarray(row, dtype=np.float64)
        c = np.asarray(col, dtype=np.float64)
        r_clipped = np.clip(r, 0.0, self.meta.lines - 1.000001)
        c_clipped = np.clip(c, 0.0, self.meta.line_samples - 1.000001)

        r0 = np.floor(r_clipped).astype(np.int64)
        c0 = np.floor(c_clipped).astype(np.int64)
        r1 = np.minimum(r0 + 1, self.meta.lines - 1)
        c1 = np.minimum(c0 + 1, self.meta.line_samples - 1)

        dr = r_clipped - r0
        dc = c_clipped - c0

        scale = 1.0 if self._is_scaled else self.meta.scaling_factor
        z00 = self._raw[r0, c0].astype(np.float64) * scale
        z01 = self._raw[r0, c1].astype(np.float64) * scale
        z10 = self._raw[r1, c0].astype(np.float64) * scale
        z11 = self._raw[r1, c1].astype(np.float64) * scale

        return (
            z00 * (1.0 - dr) * (1.0 - dc)
            + z01 * (1.0 - dr) * dc
            + z10 * dr * (1.0 - dc)
            + z11 * dr * dc
        )

    def sample_elevation(self, lat_deg: np.ndarray | float, lon_east_deg: np.ndarray | float) -> np.ndarray:
        row, col = self.latlon_to_rowcol(lat_deg, lon_east_deg)
        return self.sample_elevation_rowcol(row, col)

    def compute_slope_deg(self, lat_deg: float, lon_east_deg: float) -> float:
        """Compute local topographic slope angle via central finite differences on the DEM grid."""
        row, col = self.latlon_to_rowcol(lat_deg, lon_east_deg)
        r_f = float(row)
        c_f = float(col)
        scale = self.meta.map_scale_m
        # Account for polar stereographic scale factor at latitude phi: k = 2 / (1 - sin(phi))
        # (At -85 deg, k ~ 1.0019; included for geometric rigor)
        phi = math.radians(lat_deg)
        stereo_scale = 2.0 / (1.0 - math.sin(phi))
        dx_m = 2.0 * scale / stereo_scale
        dy_m = 2.0 * scale / stereo_scale

        z_right = float(self.sample_elevation_rowcol(r_f, c_f + 1.0))
        z_left = float(self.sample_elevation_rowcol(r_f, c_f - 1.0))
        z_down = float(self.sample_elevation_rowcol(r_f + 1.0, c_f))
        z_up = float(self.sample_elevation_rowcol(r_f - 1.0, c_f))

        dz_dx = (z_right - z_left) / dx_m
        dz_dy = (z_up - z_down) / dy_m
        return math.degrees(math.atan(math.hypot(dz_dx, dz_dy)))

    def compute_horizon_profile(
        self,
        lat_deg: float,
        lon_east_deg: float,
        observer_height_m: float = 2.0,
        max_distance_m: float = 120_000.0,
        step_m: float | None = None,
        az_step_deg: float = 1.0,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Geodesic ray-marching over sphere R_ref to determine horizon elevation h_horiz(Az).
        Uses exact lunar curvature formula:
            theta_elev(s_i) = atan(((R_ref + z_i)*cos(psi_i) - (R_ref + z_0)) / ((R_ref + z_i)*sin(psi_i)))
        """
        step = step_m if step_m is not None else self.meta.map_scale_m
        azimuths = np.arange(0.0, 360.0, az_step_deg, dtype=np.float64)
        distances = np.arange(step, max_distance_m + 0.5 * step, step, dtype=np.float64)
        distances = distances[distances <= max_distance_m]

        z0 = float(self.sample_elevation(lat_deg, lon_east_deg)) + observer_height_m
        r0 = self.meta.reference_radius_m + z0

        phi0 = math.radians(lat_deg)
        lam0 = math.radians(lon_east_deg)
        sin_phi0 = math.sin(phi0)
        cos_phi0 = math.cos(phi0)

        psi = distances / self.meta.reference_radius_m  # shape (S,)
        cos_psi = np.cos(psi)[None, :]
        sin_psi = np.sin(psi)[None, :]

        az_rad = np.radians(azimuths)[:, None]  # shape (A, 1)
        sin_phi = np.clip(sin_phi0 * cos_psi + cos_phi0 * sin_psi * np.cos(az_rad), -1.0, 1.0)
        phi = np.arcsin(sin_phi)
        lam = lam0 + np.arctan2(
            np.sin(az_rad) * sin_psi * cos_phi0,
            cos_psi - sin_phi0 * sin_phi,
        )

        lat_rays = np.degrees(phi)
        lon_rays = np.degrees(lam) % 360.0

        row_rays, col_rays = self.latlon_to_rowcol(lat_rays, lon_rays)
        in_bounds = (
            (row_rays >= 0.0)
            & (row_rays <= self.meta.lines - 1.0)
            & (col_rays >= 0.0)
            & (col_rays <= self.meta.line_samples - 1.0)
        )
        z_rays = self.sample_elevation_rowcol(row_rays, col_rays)
        r_i = self.meta.reference_radius_m + z_rays
        num = r_i * cos_psi - r0
        den = r_i * sin_psi
        elev_deg = np.degrees(np.arctan2(num, den))
        elev_deg = np.where(in_bounds, elev_deg, -90.0)

        horizon_elev = np.max(elev_deg, axis=1)
        return azimuths, horizon_elev

    def is_site_psr(self, lat_deg: float, horizon_elev_deg: np.ndarray, azimuths_deg: np.ndarray) -> bool:
        """Check whether a point remains shadowed across the maximum 18.6-year solar envelope."""
        solar_max = max_solar_elevation_curve(lat_deg, azimuths_deg) + 0.27  # + solar angular radius
        return bool(np.all(horizon_elev_deg > solar_max))

    def estimate_nearest_psr_distance_m(
        self,
        center_lat_deg: float,
        center_lon_east_deg: float,
        search_radius_m: float = 5000.0,
        coarse_step_m: float = 400.0,
    ) -> float:
        """
        Evaluate a local coarse patch around the landing site to locate real PSR pixels
        on the LOLA DEM and return Euclidean distance (meters) to the closest PSR border.
        """
        x0, y0 = self.latlon_to_xy_m(center_lat_deg, center_lon_east_deg)
        offsets = np.arange(-search_radius_m, search_radius_m + 0.1 * coarse_step_m, coarse_step_m)
        az_coarse = np.arange(0.0, 360.0, 10.0, dtype=np.float64)
        # Adaptive ray steps up to 80 km for fast regional PSR classification
        d1 = np.arange(max(self.meta.map_scale_m, 160.0), 12_000.0, 240.0)
        d2 = np.arange(12_000.0, 80_001.0, 640.0)
        distances = np.concatenate([d1, d2])
        psi = distances / self.meta.reference_radius_m
        cos_psi = np.cos(psi)[None, :]
        sin_psi = np.sin(psi)[None, :]
        az_rad = np.radians(az_coarse)[:, None]

        # Build candidate points sorted by distance from center so we can inspect all and take min
        gx, gy = np.meshgrid(x0 + offsets, y0 + offsets)
        dx = gx.ravel() - x0
        dy = gy.ravel() - y0
        dist_from_center = np.hypot(dx, dy)
        order = np.argsort(dist_from_center)

        lat_pts, lon_pts = self.xy_m_to_latlon(gx.ravel()[order], gy.ravel()[order])
        z_pts = self.sample_elevation(lat_pts, lon_pts)

        for idx, (lat_p, lon_p, z_p, d_m) in enumerate(zip(lat_pts, lon_pts, z_pts, dist_from_center[order])):
            if d_m > search_radius_m:
                break
            phi0 = math.radians(float(lat_p))
            lam0 = math.radians(float(lon_p))
            sin_phi0 = math.sin(phi0)
            cos_phi0 = math.cos(phi0)
            sin_phi = np.clip(sin_phi0 * cos_psi + cos_phi0 * sin_psi * np.cos(az_rad), -1.0, 1.0)
            phi = np.arcsin(sin_phi)
            lam = lam0 + np.arctan2(np.sin(az_rad) * sin_psi * cos_phi0, cos_psi - sin_phi0 * sin_phi)
            r_rays, c_rays = self.latlon_to_rowcol(np.degrees(phi), np.degrees(lam) % 360.0)
            in_b = (r_rays >= 0) & (r_rays <= self.meta.lines - 1) & (c_rays >= 0) & (c_rays <= self.meta.line_samples - 1)
            z_rays = self.sample_elevation_rowcol(r_rays, c_rays)
            r_i = self.meta.reference_radius_m + z_rays
            r0 = self.meta.reference_radius_m + float(z_p) + 2.0
            elev = np.where(in_b, np.degrees(np.arctan2(r_i * cos_psi - r0, r_i * sin_psi)), -90.0)
            horiz = np.max(elev, axis=1)
            if self.is_site_psr(float(lat_p), horiz, az_coarse):
                return float(d_m)
        return float(search_radius_m)
