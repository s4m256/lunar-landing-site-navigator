import type { LocationSelection, ViewCenter } from "./guide-types";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
export const MAP_LONGITUDE_HALF_SPAN = 120;
export const MAP_LATITUDE_HALF_SPAN = 60;

export interface ProjectedPoint {
  x: number;
  y: number;
  visible: boolean;
}
export const normalizeLongitude = (longitude: number) =>
  ((longitude % 360) + 360) % 360;
const longitudeDelta = (longitude: number, center: number) =>
  ((longitude - center + 540) % 360) - 180;

/** Unit-radius orthographic projection. This is display geometry, not an ephemeris model. */
export function projectGlobe(
  location: LocationSelection,
  center: ViewCenter,
): ProjectedPoint {
  const latitude = location.latitude * RAD;
  const origin = center.latitude * RAD;
  const delta =
    longitudeDelta(location.longitudeEast, center.longitudeEast) * RAD;
  const depth =
    Math.sin(origin) * Math.sin(latitude) +
    Math.cos(origin) * Math.cos(latitude) * Math.cos(delta);
  return {
    x: Math.cos(latitude) * Math.sin(delta),
    y: -(
      Math.cos(origin) * Math.sin(latitude) -
      Math.sin(origin) * Math.cos(latitude) * Math.cos(delta)
    ),
    visible: depth >= -1e-12,
  };
}

export function unprojectGlobe(
  x: number,
  y: number,
  center: ViewCenter,
): LocationSelection | undefined {
  if (![x, y, center.latitude, center.longitudeEast].every(Number.isFinite))
    return undefined;
  const distance = Math.hypot(x, y);
  if (distance > 1 + 1e-12) return undefined;
  if (distance < 1e-12)
    return {
      latitude: center.latitude,
      longitudeEast: normalizeLongitude(center.longitudeEast),
    };
  const radius = Math.min(1, distance);
  const angle = Math.asin(radius);
  const origin = center.latitude * RAD;
  const north = -y;
  const latitude =
    Math.asin(
      Math.max(
        -1,
        Math.min(
          1,
          Math.cos(angle) * Math.sin(origin) +
            (north * Math.sin(angle) * Math.cos(origin)) / distance,
        ),
      ),
    ) * DEG;
  const delta = Math.atan2(
    x * Math.sin(angle),
    distance * Math.cos(origin) * Math.cos(angle) -
      north * Math.sin(origin) * Math.sin(angle),
  );
  return {
    latitude,
    longitudeEast: normalizeLongitude(center.longitudeEast + delta * DEG),
  };
}

/** Local equirectangular view, intentionally retaining its polar distortion. */
export function projectMap(
  location: LocationSelection,
  center: ViewCenter,
): ProjectedPoint {
  const x =
    longitudeDelta(location.longitudeEast, center.longitudeEast) /
    MAP_LONGITUDE_HALF_SPAN;
  const y = -(location.latitude - center.latitude) / MAP_LATITUDE_HALF_SPAN;
  return {
    x,
    y,
    visible:
      Math.abs(x) <= 1 && Math.abs(y) <= 1 && Math.abs(location.latitude) <= 90,
  };
}

export function unprojectMap(
  x: number,
  y: number,
  center: ViewCenter,
): LocationSelection | undefined {
  if (
    ![x, y, center.latitude, center.longitudeEast].every(Number.isFinite) ||
    Math.abs(x) > 1 ||
    Math.abs(y) > 1
  )
    return undefined;
  const latitude = center.latitude - y * MAP_LATITUDE_HALF_SPAN;
  if (Math.abs(latitude) > 90) return undefined;
  return {
    latitude,
    longitudeEast: normalizeLongitude(
      center.longitudeEast + x * MAP_LONGITUDE_HALF_SPAN,
    ),
  };
}
