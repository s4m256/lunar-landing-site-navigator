import dailySource from "../../docs/audits/pr4/result-2026.json?raw";
import dailyUrl from "../../docs/audits/pr4/result-2026.json?url";
import hourlySource from "../../docs/data/mvp-b-hourly.json?raw";
import hourlyUrl from "../../docs/data/mvp-b-hourly.json?url";
import { HOURLY_TIMES, parseHourlyResult } from "./hourly-data";
import {
  DEMO_SITES,
  DEMO_TIMESTAMPS,
  getSample,
  parseDemoResult,
  type Sample,
  type Target,
} from "./scientific-data";
import type { DatasetId, GuideDataset, LocationSelection } from "./guide-types";

/** Preserve the existing scientific consumers, including their coverage checks. */
export function loadGuideDataset(id: DatasetId, source?: string): GuideDataset {
  const base = {
    id,
    cadenceSeconds: id === "daily" ? 86400 : 3600,
    downloadUrl: id === "daily" ? dailyUrl : hourlyUrl,
  };
  try {
    const raw = JSON.parse(
      source ?? (id === "daily" ? dailySource : hourlySource),
    );
    const result =
      id === "daily" ? parseDemoResult(raw) : parseHourlyResult(raw).analysis;
    return {
      ...base,
      result,
      timestamps: id === "daily" ? DEMO_TIMESTAMPS : HOURLY_TIMES,
    };
  } catch (error) {
    return {
      ...base,
      timestamps: [],
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível validar as amostras.",
    };
  }
}

export function demoSelection(id: "south-a" | "south-b"): LocationSelection {
  const site = DEMO_SITES.find((site) => site.id === id);
  if (!site) throw new Error("Local demonstrativo desconhecido.");
  return {
    latitude: site.latitude_deg,
    longitudeEast: site.longitude_east_deg,
    sourceSiteId: id,
  };
}

/** A/B is a display slot, never an implicit scientific site identity. */
export function selectedSample(
  dataset: GuideDataset,
  selection: LocationSelection | null,
  target: Target,
  utc: string,
): Sample | undefined {
  if (
    dataset.error ||
    !dataset.result ||
    !selection?.sourceSiteId ||
    !dataset.timestamps.includes(utc)
  ) {
    return undefined;
  }
  const site = DEMO_SITES.find((site) => site.id === selection.sourceSiteId);
  if (
    !site ||
    selection.latitude !== site.latitude_deg ||
    selection.longitudeEast !== site.longitude_east_deg
  )
    return undefined;
  return getSample(dataset.result, site.id, target, utc);
}

function missionBounds(
  startDate: string,
  durationDays: number,
): [number, number] | undefined {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !Number.isFinite(durationDays) ||
    durationDays <= 0 ||
    durationDays > 366
  )
    return undefined;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  if (
    !Number.isFinite(start) ||
    new Date(start).toISOString().slice(0, 10) !== startDate
  )
    return undefined;
  return [start, start + durationDays * 86400000];
}

/** Inclusive endpoints filter existing UTC samples; duration is elapsed days, not sample count. */
export function missionTimestamps(
  dataset: GuideDataset,
  startDate: string,
  durationDays: number,
): string[] {
  const bounds = missionBounds(startDate, durationDays);
  if (!bounds || dataset.error || !dataset.result) return [];
  return dataset.timestamps.filter((utc) => {
    const epoch = Date.parse(utc);
    return epoch >= bounds[0] && epoch <= bounds[1];
  });
}

/** Coverage concerns the requested closed period, not continuous physical visibility. */
export function periodCoverage(
  dataset: GuideDataset,
  startDate: string,
  durationDays: number,
): "complete" | "partial" | "empty" {
  const bounds = missionBounds(startDate, durationDays);
  if (!bounds || !missionTimestamps(dataset, startDate, durationDays).length)
    return "empty";
  const first = Date.parse(dataset.timestamps[0]);
  const last = Date.parse(dataset.timestamps[dataset.timestamps.length - 1]);
  return bounds[0] >= first && bounds[1] <= last ? "complete" : "partial";
}

export function utcLabel(utc: string): string {
  const epoch = Date.parse(utc);
  if (!Number.isFinite(epoch) || !utc.endsWith("Z"))
    return "Sem instante UTC válido";
  return (
    new Intl.DateTimeFormat("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "UTC",
    }).format(new Date(epoch)) + " UTC"
  );
}

export function angle(value: number): string {
  if (!Number.isFinite(value)) return "Indisponível";
  return (
    (value > 0 ? "+" : "") +
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    "°"
  );
}
