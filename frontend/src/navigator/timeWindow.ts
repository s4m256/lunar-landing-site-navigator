/** Helpers for the UTC date/time fields. The dataset time axis is the only source of instants. */

const pad = (n: number) => String(n).padStart(2, '0');

function formatMs(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** "2026-11-15T03:00:00Z" -> "15/11/2026 03:00 UTC". Returns the raw text if unparseable. */
export function formatUtc(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : formatMs(ms);
}

/** ISO instant -> value for <input type="datetime-local">, expressed in UTC. */
export function toInputValue(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "YYYY-MM-DDTHH:MM[:SS]" read as UTC; null when it is not a real calendar date and time. */
export function parseUtcInput(inputValue: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(inputValue.trim());
  if (!match) return null;
  const [y, mo, d, h, mi, s] = match.slice(1).map((v) => (v === undefined ? 0 : Number(v)));
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(ms);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return ms;
}

export type InstantLookup =
  | { ok: true; index: number }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'out_of_range' | 'not_sampled'; requestedLabel: string };

/**
 * Finds the dataset instant equal to a typed UTC date/time. There is no "nearest instant":
 * a time between two samples, or outside the file window, is reported as missing so the UI
 * never shows a neighbouring sample as if it were the requested one (SPA-7 draft, CA-6).
 */
export function findInstantIndex(inputValue: string, timestampsUtc: string[]): InstantLookup {
  const ms = parseUtcInput(inputValue);
  if (ms === null) return { ok: false, reason: 'invalid' };
  const requestedLabel = formatMs(ms);
  const first = Date.parse(timestampsUtc[0]);
  const last = Date.parse(timestampsUtc[timestampsUtc.length - 1]);
  if (ms < first || ms > last) return { ok: false, reason: 'out_of_range', requestedLabel };
  const index = timestampsUtc.findIndex((t) => Date.parse(t) === ms);
  if (index < 0) return { ok: false, reason: 'not_sampled', requestedLabel };
  return { ok: true, index };
}

/** User-facing explanation for a lookup that found no sample. */
export function describeMissingInstant(lookup: Exclude<InstantLookup, { ok: true }>, timestampsUtc: string[], stepSeconds: number): string {
  if (lookup.reason === 'invalid') {
    return 'Escolha uma data e um horário válidos: preencha dia, mês, ano, hora e minuto.';
  }
  const first = formatUtc(timestampsUtc[0]);
  const last = formatUtc(timestampsUtc[timestampsUtc.length - 1]);
  if (lookup.reason === 'out_of_range') {
    return `Não há amostra para ${lookup.requestedLabel}. O arquivo só tem instantes de ${first} a ${last}.`;
  }
  return `Não há amostra para ${lookup.requestedLabel}. O arquivo tem um instante a cada ${formatStep(stepSeconds)}, a partir de ${first}; valores de instantes vizinhos não são usados.`;
}

/** Evenly spaced indices in [start, end], both ends included, at most maxRows entries. */
export function sampleIndices(start: number, end: number, maxRows: number): { indices: number[]; stride: number } {
  const span = Math.max(0, end - start);
  const stride = Math.max(1, Math.ceil((span + 1) / Math.max(1, maxRows)));
  const indices: number[] = [];
  for (let i = start; i <= end; i += stride) indices.push(i);
  if (indices[indices.length - 1] !== end) indices.push(end);
  return { indices, stride };
}

/** "1 h", "6 h", "30 min" for a step expressed in seconds. */
export function formatStep(seconds: number): string {
  return seconds % 3600 === 0 ? `${seconds / 3600} h` : `${Math.round(seconds / 60)} min`;
}

/** Whole days between two ISO instants, with one decimal when not whole: 30 -> "30", 29.5 -> "29,5". */
export function spanDays(startIso: string, endIso: string): string {
  const days = (Date.parse(endIso) - Date.parse(startIso)) / 86_400_000;
  return Number.isInteger(days) ? String(days) : days.toFixed(1).replace('.', ',');
}
