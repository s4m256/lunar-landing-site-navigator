import terrainUrl from "./south-pole-dem.visual.json?url";
import solarUrl from "./solar-frames.visual.json?url";
import { applyRotation, LUNAR_RADIUS_M } from "./surface-math";

/** These display assets do not extend the scientific visibility contracts. */
export interface TerrainData {
  asset_version: "1.0.0";
  purpose: "visual_topography_only";
  frame: "MOON_ME_DE421";
  projection: "south_polar_stereographic";
  reference_radius_m: number;
  width: number;
  height: number;
  origin_x_m: number;
  origin_y_m: number;
  step_m: number;
  heights_m: readonly (number | null)[];
  min_height_m: number;
  max_height_m: number;
  height_unit: string;
  pixel_registration: string;
  nodata: {
    declared_value: number | null;
    outside_extent: string;
    unexpected_int16_extreme_sentinels: number;
  };
  provenance: Record<string, unknown> & {
    product: string;
    source_img_url: string;
    source_img_sha256: string;
    source_label_url: string;
    source_label_sha256: string;
  };
  limitations: readonly string[];
}

export interface SolarFrame {
  utc: string;
  sun_unit_me: [number, number, number];
  /** Proper rotation IAU_MOON -> MOON_ME_DE421, nine row-major values. */
  iau_to_me: number[];
}

export interface SolarFrames {
  schema_version: "1.0.0";
  frame: "MOON_ME_DE421";
  samples: readonly SolarFrame[];
  provenance: Record<string, unknown> & {
    generator: string;
    method: string;
    external_validation: string;
    kernels: {
      filename: string;
      url: string;
      sha256: string;
      bytes: number;
      source: string;
    }[];
    sources: { path: string; sha256: string; timestamps: number }[];
  };
  limitations: readonly string[];
}

export interface TerrainAssets {
  terrain: TerrainData;
  solar: SolarFrames;
}

const digest = /^[a-f0-9]{64}$/;
const canonicalUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
const https = (value: unknown) =>
  typeof value === "string" && value.startsWith("https://");

function reject(asset: string, field: string): never {
  throw new Error(
    `${asset} incompatível: ${field}. Nenhum valor substituto foi usado.`,
  );
}

/** Fail closed on unknown frame, projection, units, grid or missing provenance. */
export function parseTerrainData(value: unknown): TerrainData {
  if (!object(value)) reject("Relevo", "objeto ausente");
  if (
    value.asset_version !== "1.0.0" ||
    value.purpose !== "visual_topography_only"
  )
    reject("Relevo", "versão ou finalidade");
  if (
    value.frame !== "MOON_ME_DE421" ||
    value.projection !== "south_polar_stereographic" ||
    value.reference_radius_m !== LUNAR_RADIUS_M ||
    value.projection_origin_latitude_deg !== -90 ||
    value.projection_origin_longitude_east_deg !== 0
  )
    reject("Relevo", "referencial, projeção ou raio");
  const width = value.width,
    height = value.height;
  if (
    !finite(width) ||
    !finite(height) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > 2049 ||
    height > 2049
  )
    reject("Relevo", "dimensões da grade");
  if (
    !finite(value.origin_x_m) ||
    !finite(value.origin_y_m) ||
    !finite(value.step_m) ||
    value.step_m <= 0
  )
    reject("Relevo", "origem ou passo espacial");
  if (
    value.height_unit !==
      "m radial elevation above reference sphere, not geoid or tangent-plane height" ||
    typeof value.pixel_registration !== "string" ||
    !value.pixel_registration.trim()
  )
    reject("Relevo", "unidade radial ou registro dos pixels");
  if (
    !Array.isArray(value.heights_m) ||
    value.heights_m.length !== width * height
  )
    reject("Relevo", "quantidade de alturas");
  let min = Infinity,
    max = -Infinity;
  for (const h of value.heights_m) {
    if (h === null) continue;
    if (!finite(h) || h < -LUNAR_RADIUS_M || Math.abs(h) > 100_000)
      reject("Relevo", "altura inválida");
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  if (
    !finite(value.min_height_m) ||
    !finite(value.max_height_m) ||
    min !== value.min_height_m ||
    max !== value.max_height_m
  )
    reject("Relevo", "extremos declarados da grade");
  if (
    !object(value.nodata) ||
    !(
      value.nodata.declared_value === null ||
      finite(value.nodata.declared_value)
    ) ||
    typeof value.nodata.outside_extent !== "string" ||
    value.nodata.unexpected_int16_extreme_sentinels !== 0
  )
    reject("Relevo", "tratamento de ausência de dados");
  if (
    value.nodata.declared_value !== null &&
    value.heights_m.includes(value.nodata.declared_value)
  )
    reject("Relevo", "sentinela nodata deve ser null, nunca uma altura");
  const p = value.provenance;
  if (
    !object(p) ||
    typeof p.product !== "string" ||
    !p.product.trim() ||
    !https(p.source_img_url) ||
    !https(p.source_label_url) ||
    typeof p.source_img_sha256 !== "string" ||
    !digest.test(p.source_img_sha256) ||
    typeof p.source_label_sha256 !== "string" ||
    !digest.test(p.source_label_sha256) ||
    !strings(value.limitations)
  )
    reject("Relevo", "proveniência ou limitações ausentes");
  return value as unknown as TerrainData;
}

/** The matrix is an orientation transform, not an assertion of physical accuracy. */
export function parseSolarFrames(value: unknown): SolarFrames {
  if (
    !object(value) ||
    value.schema_version !== "1.0.0" ||
    value.frame !== "MOON_ME_DE421"
  )
    reject("Orientação solar", "versão ou referencial");
  if (
    !Array.isArray(value.samples) ||
    value.samples.length === 0 ||
    value.samples.length > 100_000
  )
    reject("Orientação solar", "amostras ausentes");
  let previous = -Infinity;
  for (const sample of value.samples) {
    if (
      !object(sample) ||
      typeof sample.utc !== "string" ||
      !canonicalUtc.test(sample.utc)
    )
      reject("Orientação solar", "timestamp UTC não canônico");
    const epoch = Date.parse(sample.utc);
    if (
      !Number.isFinite(epoch) ||
      new Date(epoch).toISOString() !== sample.utc ||
      epoch <= previous
    )
      reject(
        "Orientação solar",
        "timestamps inválidos, duplicados ou fora de ordem",
      );
    previous = epoch;
    if (
      !Array.isArray(sample.sun_unit_me) ||
      sample.sun_unit_me.length !== 3 ||
      !sample.sun_unit_me.every(finite) ||
      Math.abs(Math.hypot(...sample.sun_unit_me) - 1) > 1e-8
    )
      reject("Orientação solar", "vetor solar não unitário");
    if (
      !Array.isArray(sample.iau_to_me) ||
      sample.iau_to_me.length !== 9 ||
      !sample.iau_to_me.every(finite)
    )
      reject("Orientação solar", "matriz de referencial");
    try {
      applyRotation(sample.iau_to_me, [1, 0, 0]);
    } catch {
      reject(
        "Orientação solar",
        "matriz não ortogonal ou com orientação invertida",
      );
    }
  }
  const p = value.provenance;
  if (
    !object(p) ||
    !strings(value.limitations) ||
    typeof p.generator !== "string" ||
    !p.generator.trim() ||
    typeof p.method !== "string" ||
    !p.method.trim() ||
    typeof p.external_validation !== "string" ||
    !p.external_validation.trim() ||
    !Array.isArray(p.kernels) ||
    p.kernels.length < 3 ||
    !p.kernels.every(
      (k) =>
        object(k) &&
        typeof k.filename === "string" &&
        k.filename.trim() &&
        https(k.url) &&
        typeof k.sha256 === "string" &&
        digest.test(k.sha256) &&
        finite(k.bytes) &&
        Number.isInteger(k.bytes) &&
        k.bytes > 0 &&
        typeof k.source === "string",
    ) ||
    !Array.isArray(p.sources) ||
    p.sources.length === 0 ||
    !p.sources.every(
      (s) =>
        object(s) &&
        typeof s.path === "string" &&
        s.path.trim() &&
        typeof s.sha256 === "string" &&
        digest.test(s.sha256) &&
        finite(s.timestamps) &&
        Number.isInteger(s.timestamps) &&
        s.timestamps > 0,
    )
  )
    reject("Orientação solar", "proveniência ou limitações ausentes");
  return value as unknown as SolarFrames;
}

/** Exact timestamp only; no nearest sample and no interpolation of the Sun. */
export function solarFrameAt(
  frames: SolarFrames,
  utc: string,
): SolarFrame | undefined {
  return frames.samples.find((sample) => sample.utc === utc);
}

async function readAsset(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(
      `Não foi possível carregar o relevo ou a orientação solar (HTTP ${response.status}).`,
    );
  return response.json();
}

export async function loadTerrainAssets(
  signal?: AbortSignal,
): Promise<TerrainAssets> {
  const [terrain, solar] = await Promise.all([
    readAsset(terrainUrl, signal),
    readAsset(solarUrl, signal),
  ]);
  return { terrain: parseTerrainData(terrain), solar: parseSolarFrames(solar) };
}

/**
 * Bilinear display sampling between grid centres. Out-of-coverage and nodata are
 * unavailable, never clamped to a border or replaced by radial height zero.
 */
export function surfaceHeight(
  terrain: TerrainData,
  xM: number,
  yM: number,
): number | undefined {
  if (!Number.isFinite(xM) || !Number.isFinite(yM)) return undefined;
  const column = (xM - terrain.origin_x_m) / terrain.step_m;
  const row = (terrain.origin_y_m - yM) / terrain.step_m;
  if (
    column < 0 ||
    row < 0 ||
    column > terrain.width - 1 ||
    row > terrain.height - 1
  )
    return undefined;
  const c0 = Math.floor(column),
    r0 = Math.floor(row);
  const c1 = Math.min(c0 + 1, terrain.width - 1),
    r1 = Math.min(r0 + 1, terrain.height - 1);
  const u = column - c0,
    v = row - r0;
  const cells: [number, number][] = [
    [r0 * terrain.width + c0, (1 - u) * (1 - v)],
    [r0 * terrain.width + c1, u * (1 - v)],
    [r1 * terrain.width + c0, (1 - u) * v],
    [r1 * terrain.width + c1, u * v],
  ];
  let height = 0;
  for (const [index, weight] of cells) {
    if (weight === 0) continue;
    const value = terrain.heights_m[index];
    if (value === null || !Number.isFinite(value)) return undefined;
    height += value * weight;
  }
  return height;
}
