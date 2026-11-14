/** Display geometry for the south-polar DEM; no ephemeris or terrain inference. */
export const LUNAR_RADIUS_M = 1_737_400;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const ROTATION_TOLERANCE = 1e-6;

export type Vector3Tuple = [number, number, number];
export interface TerrainCoordinate {
  latitude: number;
  longitudeEast: number;
  height_m: number;
}

function finite(values: readonly number[], count: number, name: string): void {
  if (values.length !== count || !values.every(Number.isFinite)) {
    throw new RangeError(`${name} requires ${count} finite numbers.`);
  }
}

function latitudeAndLongitude(latitude: number, longitude: number): number {
  finite([latitude, longitude], 2, "Coordinates");
  if (latitude < -90 || latitude > 90) {
    throw new RangeError("Latitude must be between -90 and 90 degrees.");
  }
  return ((longitude % 360) + 360) % 360;
}

function radius(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("Reference radius must be finite and positive.");
  }
}

/**
 * MOON_ME planetocentric coordinates to Three.js Y-up kilometres.
 * The south-pole reference surface is the origin:
 * world (East, Up, South) = (ME_Y, -ME_Z - R, -ME_X) / 1000.
 * Height is radial metres above the reference sphere, not height above terrain.
 */
export function geoToWorld(
  latitude: number,
  longitudeEast: number,
  heightM = 0,
): Vector3Tuple {
  const longitude = latitudeAndLongitude(latitude, longitudeEast) * RAD;
  const radial = LUNAR_RADIUS_M + heightM;
  radius(radial);
  const phi = latitude * RAD;
  const horizontal = radial * Math.cos(phi);
  return [
    (horizontal * Math.sin(longitude)) / 1000,
    (-radial * Math.sin(phi) - LUNAR_RADIUS_M) / 1000,
    (-horizontal * Math.cos(longitude)) / 1000,
  ];
}

/** Inverse of geoToWorld; longitude at a geographic pole is canonically zero. */
export function worldToGeo(world: readonly number[]): TerrainCoordinate {
  finite(world, 3, "World point");
  const x = -world[2] * 1000;
  const y = world[0] * 1000;
  const z = -world[1] * 1000 - LUNAR_RADIUS_M;
  const radial = Math.hypot(x, y, z);
  radius(radial);
  const horizontal = Math.hypot(x, y);
  const longitude = horizontal < 1e-9 ? 0 : Math.atan2(y, x) * DEG;
  return {
    latitude: Math.atan2(z, horizontal) * DEG,
    longitudeEast: ((longitude % 360) + 360) % 360,
    height_m: radial - LUNAR_RADIUS_M,
  };
}

/**
 * South-polar stereographic projection, true scale at the pole,
 * central longitude 0 degrees, east-positive longitude:
 * x = rho sin(lambda), y = rho cos(lambda).
 * Product pixel offsets, registration and coverage belong to the DEM reader.
 */
export function geoToStereo(
  latitude: number,
  longitudeEast: number,
  referenceRadiusM = LUNAR_RADIUS_M,
): [number, number] {
  const longitude = latitudeAndLongitude(latitude, longitudeEast) * RAD;
  radius(referenceRadiusM);
  if (latitude === 90) {
    throw new RangeError(
      "South-polar stereographic projection is singular at the north pole.",
    );
  }
  const rho =
    2 * referenceRadiusM * Math.tan(Math.PI / 4 + (latitude * RAD) / 2);
  return [rho * Math.sin(longitude), rho * Math.cos(longitude)];
}

export function stereoToGeo(
  xM: number,
  yM: number,
  referenceRadiusM = LUNAR_RADIUS_M,
): { latitude: number; longitudeEast: number } {
  finite([xM, yM], 2, "Stereographic point");
  radius(referenceRadiusM);
  const rho = Math.hypot(xM, yM);
  if (!Number.isFinite(rho)) {
    throw new RangeError("Stereographic distance is outside the finite range.");
  }
  return {
    latitude: -90 + 2 * Math.atan2(rho, 2 * referenceRadiusM) * DEG,
    longitudeEast:
      rho === 0 ? 0 : (((Math.atan2(xM, yM) * DEG) % 360) + 360) % 360,
  };
}

/** Apply a proper rotation supplied as nine row-major values. */
export function applyRotation(
  matrix: readonly number[],
  vector: readonly number[],
): Vector3Tuple {
  finite(matrix, 9, "Rotation matrix");
  finite(vector, 3, "Vector");
  for (let row = 0; row < 3; row += 1) {
    for (let other = 0; other < 3; other += 1) {
      let dot = 0;
      for (let column = 0; column < 3; column += 1) {
        dot += matrix[row * 3 + column] * matrix[other * 3 + column];
      }
      if (Math.abs(dot - (row === other ? 1 : 0)) > ROTATION_TOLERANCE) {
        throw new RangeError("Rotation matrix must be orthonormal.");
      }
    }
  }
  const determinant =
    matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7]) -
    matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6]) +
    matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6]);
  if (Math.abs(determinant - 1) > ROTATION_TOLERANCE) {
    throw new RangeError(
      "Rotation matrix must preserve handedness (determinant +1).",
    );
  }
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ];
}

/** MOON_ME direction toward the Sun to a unit Three.js world direction; no origin translation. */
export function sunToWorld(directionME: readonly number[]): Vector3Tuple {
  finite(directionME, 3, "Sun direction");
  const length = Math.hypot(...directionME);
  if (!Number.isFinite(length) || length === 0) {
    throw new RangeError("Sun direction must have a finite nonzero magnitude.");
  }
  return [
    directionME[1] / length,
    -directionME[2] / length,
    -directionME[0] / length,
  ];
}
