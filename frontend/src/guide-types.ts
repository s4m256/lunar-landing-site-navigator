import type { DemoResult } from "./scientific-data";

export type ViewMode = "2D" | "3D";
export type SelectionMode = "center" | "cursor";
export type Slot = "A" | "B";
export type DatasetId = "daily" | "hourly";
export interface LocationSelection {
  latitude: number;
  longitudeEast: number;
  sourceSiteId?: "south-a" | "south-b";
  coordinateFrame?: "IAU_MOON" | "MOON_ME_DE421";
}
/** Surface camera coordinates use MOON_ME_DE421, independent of analysis sites. */
export interface ViewCenter {
  latitude: number;
  longitudeEast: number;
}
export interface GuideDataset {
  id: DatasetId;
  timestamps: readonly string[];
  cadenceSeconds: number;
  result?: DemoResult;
  error?: string;
  downloadUrl: string;
}
export type Selections = Record<Slot, LocationSelection | null>;
