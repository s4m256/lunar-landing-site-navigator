/** Contextual LOLA relief. It must never determine the scientific horizon. */
export interface TerrainContext {
  version: 1;
  size: number;
  extentM: number;
  centerElevationM: number;
  heightsM: number[];
  elevationsM: number[];
  metadata: {
    productId: "LDEM_4";
    productVersion: "V3.0";
    coordinateFrame: "MEAN EARTH/POLAR AXIS OF DE421";
    referenceRadiusM: number;
    centerLatitudeDeg: number;
    centerLongitudeEastDeg: number;
    nativePixelsPerDegree: number;
    nativeMapScaleM: number;
    gridSpacingM: number;
    rowOrder: "north-to-south";
    columnOrder: "west-to-east";
    verticalExaggeration: number;
    use: "VISUAL_CONTEXT_ONLY";
    sourceImageSha256: string;
    sourceLabelSha256: string;
    limitations: string[];
  };
}

const IMAGE_SHA256 = "972d66d7f330abca62abc21aae270661516c00dd1a881ec102b94df9563656b5";
const LABEL_SHA256 = "b5a197b4d417e3b5e0e84f8fe15f9a1d2203b8eb5d7213236c0ffbc86e940cc6";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numericGrid(value: unknown, min: number, max: number): value is number[] {
  return Array.isArray(value) && value.length === 33 * 33 &&
    value.every((n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max);
}

export function parseTerrainContext(value: unknown): TerrainContext {
  const fail = () => { throw new Error("Relevo contextual indisponível: dados incompatíveis."); };
  if (!record(value) || !record(value.metadata)) return fail();
  const m = value.metadata;
  if (
    value.version !== 1 || value.size !== 33 || value.extentM !== 120000 ||
    typeof value.centerElevationM !== "number" || !Number.isFinite(value.centerElevationM) ||
    value.centerElevationM < -8879 || value.centerElevationM > 10504 ||
    !numericGrid(value.heightsM, -25000, 25000) ||
    !numericGrid(value.elevationsM, -8879, 10504) ||
    m.productId !== "LDEM_4" || m.productVersion !== "V3.0" ||
    m.coordinateFrame !== "MEAN EARTH/POLAR AXIS OF DE421" ||
    m.referenceRadiusM !== 1737400 || m.centerLatitudeDeg !== -89.5 ||
    m.centerLongitudeEastDeg !== 0 || m.nativePixelsPerDegree !== 4 ||
    m.nativeMapScaleM !== 7580.84 || m.gridSpacingM !== 3750 ||
    m.rowOrder !== "north-to-south" || m.columnOrder !== "west-to-east" ||
    m.verticalExaggeration !== 1 || m.use !== "VISUAL_CONTEXT_ONLY" ||
    m.sourceImageSha256 !== IMAGE_SHA256 || m.sourceLabelSha256 !== LABEL_SHA256 ||
    !Array.isArray(m.limitations) || m.limitations.length === 0 ||
    !m.limitations.every((item: unknown) => typeof item === "string" && item.length > 0)
  ) return fail();
  if (Math.abs(value.heightsM[544]) > 0.001 ||
      Math.abs(value.elevationsM[544] - value.centerElevationM) > 0.001) return fail();
  return value as unknown as TerrainContext;
}

export async function loadTerrainContext(signal?: AbortSignal): Promise<TerrainContext> {
  const response = await fetch(`${import.meta.env.BASE_URL}terrain/south-a-context.json`, { signal });
  if (!response.ok) throw new Error("Não foi possível carregar o relevo contextual.");
  return parseTerrainContext(await response.json());
}
