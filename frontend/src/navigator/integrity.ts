import type { LandingSiteEntry, NavigatorDatasetV1 } from './types';

/**
 * Consistency checks that JSON Schema v1 does not express: array lengths must agree with the
 * time axis and the azimuth grid, and the axes must be regular because the page indexes and
 * interpolates them that way. They do NOT judge scientific correctness. Any problem stops the
 * whole display (SPA-7 draft, CA-7): the page never draws a partially consistent file.
 */

const SKY_SERIES_KEYS = [
  'sun_az_deg',
  'sun_el_deg',
  'earth_az_deg',
  'earth_el_deg',
  'elfo_primary_az_deg',
  'elfo_primary_el_deg',
  'elfo_primary_alt_km',
  'elfo_primary_range_km',
  'elfo_primary_earth_los',
  'elfo_constellation_visible',
  'elfo_constellation_best_alt_km',
  'elfo_constellation_best_fspl_db',
  'lro_visible',
] as const;

const AZIMUTH_TOLERANCE_DEG = 1e-9;

/** Problems in the shared axes (time window and azimuth grid). */
export function findDatasetIssues(dataset: NavigatorDatasetV1): string[] {
  const issues: string[] = [];
  const mw = dataset.mission_window;
  const n = mw.timestamps_utc.length;
  for (const key of ['sun_dist_au', 'earth_angular_radius_deg', 'solar_angular_radius_deg'] as const) {
    if (mw[key].length !== n) {
      issues.push(`mission_window.${key} tem ${mw[key].length} valores; esperado ${n} (um por instante).`);
    }
  }

  const times = mw.timestamps_utc.map((t) => Date.parse(t));
  if (times.some((t) => Number.isNaN(t))) {
    issues.push('mission_window.timestamps_utc contém datas que não puderam ser interpretadas.');
  } else {
    const stepMs = mw.step_seconds * 1000;
    const badStep = times.findIndex((t, i) => i > 0 && t - times[i - 1] !== stepMs);
    if (badStep > 0) {
      issues.push(
        `mission_window.timestamps_utc não tem passo regular de ${mw.step_seconds} s (primeira diferença no índice ${badStep}).`,
      );
    }
    if (Date.parse(mw.start_utc) !== times[0] || Date.parse(mw.end_utc) !== times[n - 1]) {
      issues.push('mission_window.start_utc/end_utc não coincidem com o primeiro e o último instante.');
    }
  }

  const az = dataset.horizon_azimuths_deg;
  const stepAz = 360 / az.length;
  if (az.some((a, i) => Math.abs(a - i * stepAz) > AZIMUTH_TOLERANCE_DEG)) {
    issues.push(`horizon_azimuths_deg não é uma grade regular de 0° a 360° com passo de ${stepAz}°.`);
  }

  const seenIds = new Set<string>();
  for (const site of dataset.sites) {
    if (seenIds.has(site.id)) issues.push(`Local repetido no arquivo: id "${site.id}".`);
    seenIds.add(site.id);
  }
  return issues;
}

/** Problems that prevent one site from being drawn. Empty array = the site has aligned data. */
export function findSiteDataIssues(site: LandingSiteEntry, dataset: NavigatorDatasetV1): string[] {
  const issues: string[] = [];
  const n = dataset.mission_window.timestamps_utc.length;
  const nAz = dataset.horizon_azimuths_deg.length;

  if (site.horizon_elev_deg.length !== nAz) {
    issues.push(`Perfil de horizonte com ${site.horizon_elev_deg.length} azimutes; esperado ${nAz}.`);
  }
  for (const key of SKY_SERIES_KEYS) {
    const len = site.sky_series[key].length;
    if (len !== n) issues.push(`Série ${key} com ${len} valores; esperado ${n}.`);
  }
  const grid = site.local_grid;
  const expectedNodes = grid.grid_size * grid.grid_size;
  if (grid.nodes.length !== expectedNodes) {
    issues.push(`Grade local com ${grid.nodes.length} nós; esperado ${expectedNodes}.`);
    return issues;
  }
  const seen = new Set<string>();
  for (const node of grid.nodes) {
    if (node.row >= grid.grid_size || node.col >= grid.grid_size) {
      issues.push(`Nó (${node.row}, ${node.col}) fora da grade ${grid.grid_size}×${grid.grid_size}.`);
      return issues;
    }
    if (node.horizon_elev_deg.length !== nAz) {
      issues.push(
        `Nó (${node.row}, ${node.col}) com horizonte de ${node.horizon_elev_deg.length} azimutes; esperado ${nAz}.`,
      );
      return issues;
    }
    seen.add(`${node.row},${node.col}`);
  }
  if (seen.size !== expectedNodes) issues.push('Grade local com nós repetidos ou ausentes.');
  return issues;
}

/** Every problem in the file, site problems prefixed with the site name. Empty = drawable. */
export function findAllIssues(dataset: NavigatorDatasetV1): string[] {
  const issues = findDatasetIssues(dataset);
  for (const site of dataset.sites) {
    for (const issue of findSiteDataIssues(site, dataset)) issues.push(`${site.name}: ${issue}`);
  }
  return issues;
}
