/** TypeScript types matching contracts/navigator-dataset.v1.schema.json. */

export interface KernelAssetProvenance {
  filename: string;
  url: string;
  sha256: string;
}

export interface DemProductProvenance {
  product_id: string;
  url: string;
  sha256: string;
  resolution_m: number;
  coverage_lat_deg: [number, number];
  reference_radius_m: number;
  coordinate_system: string;
  ray_max_distance_m: number;
  azimuth_step_deg: number;
}

export interface HorizonsValidationProvenance {
  status: string;
  endpoint: string;
  max_sun_az_diff_deg?: number | null;
  max_sun_el_diff_deg?: number | null;
  max_earth_az_diff_deg?: number | null;
  max_earth_el_diff_deg?: number | null;
  notes: string[];
}

export interface NavigatorConventions {
  azimuth_deg: string;
  elevation_deg: string;
  latitude_type: string;
  longitude_convention: string;
  solar_constant_w_m2: number;
  solar_radius_km: number;
  earth_radius_km: number;
  lunar_radius_m: number;
  clps_slope_limit_deg: number;
}

export interface NavigatorProvenance {
  dem_product: DemProductProvenance;
  ephemeris: {
    engine: string;
    frame: string;
    correction: string;
    kernels: KernelAssetProvenance[];
  };
  horizons_validation: HorizonsValidationProvenance;
  conventions: NavigatorConventions;
  limitations: string[];
}

export interface MissionWindow {
  start_utc: string;
  end_utc: string;
  step_seconds: number;
  synodic_period_days: number;
  timestamps_utc: string[];
  sun_dist_au: number[];
  earth_angular_radius_deg: number[];
  solar_angular_radius_deg: number[];
}

export interface RelaySpec {
  name: string;
  satellites_count: number;
  a_km: number;
  e: number;
  i_deg: number;
  omega_deg: number;
  period_hours: number;
  apolune_alt_km: number;
  perilune_alt_km: number;
  max_range_km: number;
  antenna_mask_deg: number;
  freq_ghz: number;
}

export interface RelayPresets {
  lro: RelaySpec;
  elfo_pathfinder: RelaySpec;
  elfo_constellation: RelaySpec;
}

export interface SiteCenter {
  latitude_deg: number;
  longitude_east_deg: number;
  elevation_m: number;
  slope_deg: number;
  cartesian_me_km: [number, number, number];
  psr_distance_m: number;
  is_psr: boolean;
  observer_height_m: number;
}

export interface SkySeries {
  sun_az_deg: number[];
  sun_el_deg: number[];
  earth_az_deg: number[];
  earth_el_deg: number[];
  elfo_primary_az_deg: number[];
  elfo_primary_el_deg: number[];
  elfo_primary_alt_km: number[];
  elfo_primary_range_km: number[];
  elfo_primary_earth_los: boolean[];
  elfo_constellation_visible: boolean[];
  elfo_constellation_best_alt_km: number[];
  elfo_constellation_best_fspl_db: number[];
  lro_visible: boolean[];
}

export interface SolarSummary {
  mean_illum_fraction: number;
  sunlit_hours: number;
  max_continuous_shadow_hours: number;
  energy_tracking_wh_m2: number;
  energy_fixed_north_wh_m2: number;
  energy_fixed_horiz_wh_m2: number;
  min_battery_100w_wh: number;
}

export interface CommsSummary {
  dte_center_duty_cycle_pct: number;
  dte_full_disk_duty_cycle_pct: number;
  elfo_pathfinder_duty_cycle_pct: number;
  elfo_constellation_duty_cycle_pct: number;
  lro_duty_cycle_pct: number;
  combined_dte_elfo_duty_cycle_pct: number;
  relay_coverage_gain_pct: number;
  max_blackout_dte_hours: number;
  max_blackout_combined_hours: number;
  mean_elfo_altitude_km: number;
  mean_elfo_fspl_db: number;
}

export interface ScoreSummary {
  total_0_100: number;
  safety_slope_0_100: number;
  power_0_100: number;
  comms_0_100: number;
  science_psr_0_100: number;
}

export interface LocalGridNode {
  row: number;
  col: number;
  dx_m: number;
  dy_m: number;
  latitude_deg: number;
  longitude_east_deg: number;
  elevation_m: number;
  slope_deg: number;
  psr_distance_m: number;
  is_psr: boolean;
  horizon_elev_deg: number[];
  mean_illum_fraction: number;
  max_continuous_shadow_hours: number;
  energy_tracking_wh_m2: number;
  dte_full_disk_duty_cycle_pct: number;
  combined_dte_elfo_duty_cycle_pct: number;
  max_blackout_combined_hours: number;
  landing_score_0_100: number;
}

export interface LandingSiteEntry {
  id: string;
  name: string;
  category: 'artemis_candidate' | 'reference_ridge' | 'psr_contrast';
  description: string;
  center: SiteCenter;
  horizon_elev_deg: number[];
  sky_series: SkySeries;
  engineering_summary: {
    solar: SolarSummary;
    comms: CommsSummary;
    score: ScoreSummary;
  };
  local_grid: {
    spacing_m: number;
    grid_size: number;
    nodes: LocalGridNode[];
  };
}

export interface NavigatorDatasetV1 {
  schema_version: '1.0.0';
  generated_utc: string;
  provenance: NavigatorProvenance;
  mission_window: MissionWindow;
  relay_presets: RelayPresets;
  horizon_azimuths_deg: number[];
  sites: LandingSiteEntry[];
}

export interface ScoreWeightsConfig {
  safety: number;
  power: number;
  comms: number;
  science_psr: number;
}

export type PanelMode = 'tracking' | 'fixed_north' | 'fixed_horiz';

export interface EngineeringConfig {
  panelAreaM2: number;
  panelEfficiency: number;
  panelMode: PanelMode;
  survivalLoadW: number;
  antennaMaskDeg: number;
  dteMarginMode: 'full_disk' | 'center';
  relayEnabled: boolean;
  weights: ScoreWeightsConfig;
}
