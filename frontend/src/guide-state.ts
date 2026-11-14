import { demoSelection } from "./guide-model";
import type { Target } from "./scientific-data";
import type {
  DatasetId,
  LocationSelection,
  SelectionMode,
  Selections,
  Slot,
  ViewCenter,
  ViewMode,
} from "./guide-types";

export interface GuideState {
  view: ViewMode;
  center: ViewCenter;
  selectionMode: SelectionMode;
  activeSlot: Slot;
  selections: Selections;
  previous: Selections | null;
  datasetId: DatasetId;
  startDate: string;
  durationDays: number;
  utc: string;
  target: Target;
  playing: boolean;
  speed: number;
}
export const initialGuideState: GuideState = {
  view: "3D",
  center: { latitude: -70, longitudeEast: 45 },
  selectionMode: "cursor",
  activeSlot: "A",
  selections: { A: demoSelection("south-a"), B: demoSelection("south-b") },
  previous: null,
  datasetId: "daily",
  startDate: "2026-09-01",
  durationDays: 30,
  utc: "2026-09-01T00:00:00.000Z",
  target: "SUN",
  playing: false,
  speed: 1,
};
type Action =
  | { type: "view"; value: ViewMode }
  | { type: "center"; value: ViewCenter }
  | { type: "mode"; value: SelectionMode }
  | { type: "slot"; value: Slot }
  | { type: "select"; value: LocationSelection }
  | { type: "remove"; slot: Slot }
  | { type: "undo" }
  | { type: "demo" }
  | { type: "dataset"; value: DatasetId }
  | { type: "period"; startDate: string; durationDays: number }
  | { type: "utc"; value: string }
  | { type: "target"; value: Target }
  | { type: "playing"; value: boolean }
  | { type: "speed"; value: number };
export function guideReducer(state: GuideState, action: Action): GuideState {
  switch (action.type) {
    case "view":
      return { ...state, view: action.value };
    case "center":
      return { ...state, center: action.value };
    case "mode":
      return { ...state, selectionMode: action.value };
    case "slot":
      return { ...state, activeSlot: action.value };
    case "select":
      return {
        ...state,
        previous: state.selections,
        selections: { ...state.selections, [state.activeSlot]: action.value },
        activeSlot: state.activeSlot === "A" ? "B" : "A",
      };
    case "remove":
      return {
        ...state,
        previous: state.selections,
        selections: { ...state.selections, [action.slot]: null },
      };
    case "undo":
      return state.previous
        ? { ...state, selections: state.previous, previous: state.selections }
        : state;
    case "demo":
      return {
        ...state,
        previous: state.selections,
        selections: {
          A: demoSelection("south-a"),
          B: demoSelection("south-b"),
        },
        center: initialGuideState.center,
      };
    case "dataset":
      return {
        ...state,
        datasetId: action.value,
        startDate: action.value === "daily" ? "2026-09-01" : "2026-11-15",
        durationDays: 30,
        utc:
          action.value === "daily"
            ? "2026-09-01T00:00:00.000Z"
            : "2026-11-15T00:00:00.000Z",
        playing: false,
      };
    case "period":
      return {
        ...state,
        startDate: action.startDate,
        durationDays: action.durationDays,
        playing: false,
      };
    case "utc":
      return { ...state, utc: action.value };
    case "target":
      return { ...state, target: action.value };
    case "playing":
      return { ...state, playing: action.value };
    case "speed":
      return { ...state, speed: action.value };
  }
}
