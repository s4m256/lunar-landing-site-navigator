import * as THREE from "three";

// 343d31f lunarTerrainEngine.ts: native 7600 × 80 m image, radius 1737.4 km.
export const POLAR_STEREO_SPAN = 608000 / (2 * 1737400);
export function southPolarUv(point: THREE.Vector3) {
  const denominator = Math.max(0.05, 1 - point.y);
  return {
    u: 0.5 + point.z / denominator / POLAR_STEREO_SPAN,
    v: 0.5 + point.x / denominator / POLAR_STEREO_SPAN,
  };
}

/** Generate a visual hillshade from the existing 16-bit packed LOLA elevations.
 * This is a display image, not an illumination, horizon, or landing calculation. */
export function shadePolarDem(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const result = new Uint8Array(width * height * 4);
  const heightKm = (x: number, y: number) => {
    const p =
      (Math.max(0, Math.min(height - 1, y)) * width +
        Math.max(0, Math.min(width - 1, x))) *
      4;
    return -9.5 + (((pixels[p] << 8) | pixels[p + 1]) / 65535) * 20.5;
  };
  const cellKm = 608 / width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (heightKm(x + 1, y) - heightKm(x - 1, y)) / (2 * cellKm);
      const dy = (heightKm(x, y + 1) - heightKm(x, y - 1)) / (2 * cellKm);
      // Fixed oblique light makes measured relief legible, without a time-dependent claim.
      const normalLength = Math.hypot(dx * 2.05, dy * 2.05, 1);
      const light =
        (-dx * 2.05 * -0.5 - dy * 2.05 * -0.5 + 0.7071) / normalLength;
      const gray = Math.max(25, Math.min(235, Math.round(50 + 165 * light)));
      const p = (y * width + x) * 4;
      result[p] = result[p + 1] = result[p + 2] = gray;
      result[p + 3] = 255;
    }
  }
  return result;
}
