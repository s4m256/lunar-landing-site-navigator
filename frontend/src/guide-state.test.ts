import { describe, expect, it } from "vitest";
import {
  guideReducer,
  initialGuideState,
  type GuideState,
} from "./guide-state";
import { demoSelection, loadGuideDataset, selectedSample } from "./guide-model";
import type { LocationSelection } from "./guide-types";

type GuideAction = Parameters<typeof guideReducer>[1];
const evolve = (state: GuideState, ...actions: GuideAction[]) =>
  actions.reduce(guideReducer, state);
const seed = (): GuideState => ({
  ...initialGuideState,
  center: { ...initialGuideState.center },
  selections: {
    A: demoSelection("south-a"),
    B: demoSelection("south-b"),
  },
});

describe("surface camera and science share state without changing each other's meaning", () => {
  it("changes only the viewing angle through 2D/3D after a customized comparison", () => {
    const state = evolve(
      seed(),
      { type: "dataset", value: "hourly" },
      { type: "period", startDate: "2026-11-20", durationDays: 5 },
      { type: "utc", value: "2026-11-22T12:00:00.000Z" },
      { type: "target", value: "EARTH" },
      { type: "center", value: { latitude: -89.3, longitudeEast: 359.9 } },
      { type: "zoom", value: 4.75 },
      { type: "bearing", value: -37 },
      { type: "mode", value: "center" },
      { type: "slot", value: "A" },
      { type: "select", value: demoSelection("south-b") },
      { type: "select", value: demoSelection("south-a") },
      { type: "playing", value: true },
    );
    const snapshot = structuredClone(state);
    const hourly = loadGuideDataset("hourly");
    const sampleA = selectedSample(
      hourly,
      state.selections.A,
      state.target,
      state.utc,
    );
    const sampleB = selectedSample(
      hourly,
      state.selections.B,
      state.target,
      state.utc,
    );
    expect(sampleA).toBeDefined();
    expect(sampleB).toBeDefined();
    expect(sampleA).not.toEqual(sampleB);

    const topDown = guideReducer(state, { type: "view", value: "2D" });
    expect(topDown).toEqual({ ...snapshot, view: "2D" });
    expect(state).toEqual(snapshot);
    const tilted = guideReducer(topDown, { type: "view", value: "3D" });
    expect(tilted).toEqual(snapshot);
    expect(
      selectedSample(hourly, tilted.selections.A, tilted.target, tilted.utc),
    ).toEqual(sampleA);
    expect(
      selectedSample(hourly, tilted.selections.B, tilted.target, tilted.utc),
    ).toEqual(sampleB);
    expect(tilted.selections.A?.sourceSiteId).toBe("south-b");
    expect(tilted.selections.B?.sourceSiteId).toBe("south-a");
    expect(tilted.selections.A?.coordinateFrame).toBe("IAU_MOON");
  });

  it("retains a terrain-frame selection as uncovered instead of promoting it to an IAU site", () => {
    const terrainPick: LocationSelection = {
      latitude: -89.5,
      longitudeEast: 0,
      coordinateFrame: "MOON_ME_DE421",
    };
    const state = evolve(
      seed(),
      { type: "center", value: { latitude: -89.5, longitudeEast: 0 } },
      { type: "slot", value: "A" },
      { type: "select", value: terrainPick },
      { type: "view", value: "2D" },
      { type: "view", value: "3D" },
    );
    expect(state.center).toEqual({ latitude: -89.5, longitudeEast: 0 });
    expect(state.selections.A).toEqual(terrainPick);
    expect(state.selections.A?.sourceSiteId).toBeUndefined();
    expect(state.selections.B).toEqual(demoSelection("south-b"));
    const daily = loadGuideDataset("daily");
    expect(
      selectedSample(daily, state.selections.A, "SUN", state.utc),
    ).toBeUndefined();
    expect(
      selectedSample(daily, state.selections.B, "SUN", state.utc)
        ?.elevation_deg,
    ).toBe(-0.5438251172899302);
  });

  it("restores the complete previous selection including its coordinate frame", () => {
    const terrainPick: LocationSelection = {
      latitude: -88.75,
      longitudeEast: 120,
      coordinateFrame: "MOON_ME_DE421",
    };
    const selected = guideReducer(seed(), {
      type: "select",
      value: terrainPick,
    });
    const removed = guideReducer(selected, { type: "remove", slot: "A" });
    expect(removed.selections.A).toBeNull();
    const restored = guideReducer(removed, { type: "undo" });
    expect(restored.selections.A).toEqual(terrainPick);
    expect(restored.selections.B).toEqual(demoSelection("south-b"));
    expect(restored.selections.A?.sourceSiteId).toBeUndefined();
  });

  it("bounds zoom and wraps bearing without modifying the geographic or scientific state", () => {
    const state = evolve(
      seed(),
      { type: "center", value: { latitude: -89.2, longitudeEast: 6 } },
      { type: "target", value: "EARTH" },
    );
    const close = guideReducer(state, { type: "zoom", value: 100 });
    expect(close.zoom).toBe(12);
    const far = guideReducer(close, { type: "zoom", value: -10 });
    expect(far.zoom).toBe(1);
    const turned = guideReducer(far, { type: "bearing", value: -450 });
    expect(turned.bearing).toBe(270);
    const sameHeading = guideReducer(turned, { type: "bearing", value: 990 });
    expect(sameHeading.bearing).toBe(270);
    expect({
      ...sameHeading,
      zoom: state.zoom,
      bearing: state.bearing,
    }).toEqual(state);
    expect(sameHeading.center).toEqual(state.center);
    expect(sameHeading.selections).toEqual(state.selections);
  });

  it("keeps visual shadow controls independent from the scientific target and dataset", () => {
    const state = evolve(
      seed(),
      { type: "shadows", value: false },
      { type: "zoom", value: 3.5 },
      { type: "bearing", value: 120 },
      { type: "target", value: "EARTH" },
      { type: "dataset", value: "hourly" },
      { type: "utc", value: "2026-11-15T03:00:00.000Z" },
    );
    expect(state.shadows).toBe(false);
    expect(state.target).toBe("EARTH");
    expect(state.zoom).toBe(3.5);
    expect(state.bearing).toBe(120);
    expect(state.selections).toEqual(seed().selections);
    const withShadows = guideReducer(state, { type: "shadows", value: true });
    expect(withShadows).toEqual({ ...state, shadows: true });
    expect(
      selectedSample(
        loadGuideDataset("hourly"),
        withShadows.selections.A,
        withShadows.target,
        withShadows.utc,
      ),
    ).toEqual(
      selectedSample(
        loadGuideDataset("hourly"),
        state.selections.A,
        state.target,
        state.utc,
      ),
    );
  });

  it("changes the mission filter and pauses playback without resetting the surface viewpoint", () => {
    const state = evolve(
      seed(),
      { type: "center", value: { latitude: -89.75, longitudeEast: 270 } },
      { type: "zoom", value: 6 },
      { type: "bearing", value: 315 },
      { type: "shadows", value: false },
      { type: "playing", value: true },
    );
    const updated = guideReducer(state, {
      type: "period",
      startDate: "2026-12-01",
      durationDays: 7,
    });
    expect(updated.playing).toBe(false);
    expect(updated.startDate).toBe("2026-12-01");
    expect(updated.durationDays).toBe(7);
    expect(updated.center).toEqual(state.center);
    expect(updated.zoom).toBe(6);
    expect(updated.bearing).toBe(315);
    expect(updated.shadows).toBe(false);
    expect(updated.selections).toEqual(state.selections);
  });
});
