import type { Sample } from "../scientific-data";

export type Direction = readonly [east: number, up: number, south: number];

/** Local visual axes: +X east, +Y up, −Z north. No terrain or visibility model. */
export function directionFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
): Direction {
  if (
    !Number.isFinite(azimuthDeg) ||
    !Number.isFinite(elevationDeg) ||
    azimuthDeg < 0 ||
    azimuthDeg >= 360 ||
    elevationDeg < -90 ||
    elevationDeg > 90
  ) {
    throw new RangeError("Direção angular inválida.");
  }
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  return [
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    -Math.cos(elevation) * Math.cos(azimuth),
  ];
}

export function hasUsableDirection(
  sample: Sample | undefined,
): sample is Sample {
  return Boolean(
    sample &&
      Number.isFinite(sample.azimuth_deg) &&
      sample.azimuth_deg >= 0 &&
      sample.azimuth_deg < 360 &&
      Number.isFinite(sample.elevation_deg) &&
      sample.elevation_deg >= -90 &&
      sample.elevation_deg <= 90,
  );
}

/** An equal-angle panorama for the non-WebGL alternative, not a terrain profile. */
export function panoramaPosition(sample: Sample): { x: number; y: number } {
  if (!hasUsableDirection(sample)) throw new RangeError("Amostra inválida.");
  return {
    x: 60 + (sample.azimuth_deg / 360) * 840,
    y: 240 - sample.elevation_deg * 1.8,
  };
}

/** Position a DEM context grid without changing its vertical/horizontal ratio.
 * Rows run north to south, columns west to east. Heights already include curvature.
 */
export function terrainPositions(
  size: number,
  extentM: number,
  heightsM: readonly number[],
  visualExtent = 80,
): Float32Array {
  if (
    !Number.isInteger(size) ||
    size < 2 ||
    !Number.isFinite(extentM) ||
    extentM <= 0 ||
    !Number.isFinite(visualExtent) ||
    visualExtent <= 0 ||
    heightsM.length !== size * size ||
    heightsM.some((height) => !Number.isFinite(height))
  ) {
    throw new RangeError("Grade de relevo inválida.");
  }
  const scale = visualExtent / extentM;
  const positions = new Float32Array(size * size * 3);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const index = row * size + column;
      positions[index * 3] = (column / (size - 1) - 0.5) * extentM * scale;
      positions[index * 3 + 1] = heightsM[index] * scale;
      positions[index * 3 + 2] = (row / (size - 1) - 0.5) * extentM * scale;
    }
  }
  return positions;
}
