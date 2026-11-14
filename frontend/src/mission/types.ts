/** Mission display contract. Directions concern body centres, not power or radio links. */
export type TargetName = "sun" | "earth";
export type MissionStage =
  | "briefing"
  | "launch"
  | "selection"
  | "landing"
  | "complete";
export type DirectionState = "above" | "below" | "on-horizon" | "unavailable";

export interface MissionSite {
  id: string;
  label: string;
  latitudeDeg: number;
  longitudeDeg: number;
}

export interface MissionDirection {
  azimuthDeg: number;
  elevationDeg: number;
  state: DirectionState;
}

export interface MissionAnalysis {
  site: MissionSite;
  utc: string;
  sun: MissionDirection;
  earth: MissionDirection;
  meetsGoal: boolean;
}

export interface MissionDate {
  value: string;
  label: string;
}

export interface MissionProvenance {
  summary: string;
  model: string;
  source: string;
  limitation: string;
}
