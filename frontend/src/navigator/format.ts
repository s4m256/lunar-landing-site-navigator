/** Number formatting for pt-BR text. Missing values are never turned into numbers. */

export const NO_VALUE = 'sem dado';

/** Fixed decimals with a decimal comma: 1.25 -> "1,25". */
export function formatNumber(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

/**
 * Angle in degrees. Adds decimals (up to 4) when rounding would hide a non-zero value,
 * so 0.004 prints as "0,004°" and never as "0,00°". Exactly 0 prints as "0°".
 */
export function formatDeg(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return NO_VALUE;
  if (value === 0) return '0°';
  let d = digits;
  while (d < 4 && Number(value.toFixed(d)) === 0) d += 1;
  return `${formatNumber(value, d)}°`;
}

/** Percentage of a 0–100 value; null means the value does not exist in the data. */
export function formatPct(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? NO_VALUE : `${formatNumber(value, digits)}%`;
}

/** Hours, rounded; null means the value does not exist in the data. */
export function formatHours(value: number | null): string {
  return value === null || !Number.isFinite(value) ? NO_VALUE : `${formatNumber(value, 0)} h`;
}

/** Boolean read as text; null means the value does not exist in the data. */
export function yesNo(value: boolean | null): string {
  return value === null ? NO_VALUE : value ? 'sim' : 'não';
}
