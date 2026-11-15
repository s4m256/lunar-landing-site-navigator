/**
 * TypeScript types matching contracts/navigator-dataset.v1.schema.json, contract version 1.1.0.
 * The JSON Schema is normative; Ajv (contract.ts) checks every file before these types are trusted.
 */

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

/** Contract 1.1.0 enum; see contracts/README.md for what each value means and requires. */
export type HorizonsValidationStatus =
  | 'verified'
  | 'failed'
  | 'skipped_network_unavailable'
  | 'not_requested'
  | 'unverified_no_raw_response';

/** One retained raw Horizons response; response_file is relative to outputs/validation/. */
export interface HorizonsRawResponse {
  target_command: string;
  request_url: string;
  retrieved_utc: string;
  response_file: string;
  response_sha256: string;
}

export interface HorizonsValidationProvenance {
  status: HorizonsValidationStatus;
  endpoint: string;
  /** Declared acceptance tolerance; null when none was applied. */
  tolerance_deg?: number | null;
  sample_count?: number | null;
  raw_responses?: HorizonsRawResponse[];
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
  /** Slope above this value eliminates a point from the illustrative index (1.1.0 rule). Unsourced. */
  clps_slope_limit_deg: number;
  slope_baseline_m?: number;
  /** psr_distance_m is null when no PSR point was found within this radius. */
  psr_search_radius_m?: number;
  psr_lattice_step_m?: number;
  psr_subsolar_lat_extreme_deg?: number;
  psr_solar_radius_deg?: number;
  score_is_illustrative?: true;
}

/** One value changed by the 1.0.0 -> 1.1.0 migration (path is a JSON pointer). */
export interface MigrationReplacement {
  path: string;
  from: unknown;
  to: unknown;
}

/** Present only in files migrated from 1.0.0 by science/tools/migrate_dataset_1_0_to_1_1.py. */
export interface DatasetMigration {
  from_schema_version: '1.0.0';
  tool: string;
  tool_version: string;
  source_sha256: string;
  source_frontend_sha256: string;
  /** The stored score values follow the 1.0.0 rule (no slope elimination). */
  stored_scores_rule: '1.0.0';
  psr_sentinel_nulled: { value_m: number; count: number };
  added: string[];
  replaced: MigrationReplacement[];
  notes: string[];
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
  migration?: DatasetMigration;
}

export interface SeasonalCoverage {
  duration_days: number;
  /** null when the producer did not record it (files migrated from 1.0.0). */
  subsolar_lat_min_deg: number | null;
  subsolar_lat_max_deg: number | null;
  covers_seasonal_cycle: boolean;
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
  seasonal_coverage?: SeasonalCoverage;
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
  hypothetical?: boolean;
  source?: string;
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
  /** null: no PSR point found within conventions.psr_search_radius_m (distance unknown). */
  psr_distance_m: number | null;
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

export type EliminationReason = 'slope_above_clps_limit';

export interface ScoreSummary {
  total_0_100: number;
  safety_slope_0_100: number;
  power_0_100: number;
  comms_0_100: number;
  science_psr_0_100: number;
  eliminated?: boolean;
  elimination_reasons?: EliminationReason[];
  total_without_relay_0_100?: number;
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
  psr_distance_m: number | null;
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
  coordinates_source?: string;
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
  schema_version: '1.1.0';
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
  /** Maximum range for the primary relay satellite, from the file's preset. */
  elfoMaxRangeKm: number;
  dteMarginMode: 'full_disk' | 'center';
  relayEnabled: boolean;
  weights: ScoreWeightsConfig;
  /** Slope above which the illustrative index is 0 (file conventions; unsourced). */
  slopeLimitDeg: number;
}
