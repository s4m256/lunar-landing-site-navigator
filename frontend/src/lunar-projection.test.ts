import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  normalizeLongitude,
  projectGlobe,
  projectMap,
  unprojectGlobe,
  unprojectMap,
} from "./lunar-projection";
import { MoonView } from "./MoonView";

afterEach(cleanup);

describe("display projections preserve lunar coordinates", () => {
  it("uses east-positive longitude, north-up screen coordinates and the visible hemisphere", () => {
    const center = { latitude: 0, longitudeEast: 0 };
    expect(
      projectGlobe({ latitude: 0, longitudeEast: 90 }, center).x,
    ).toBeCloseTo(1);
    expect(
      projectGlobe({ latitude: 90, longitudeEast: 0 }, center).y,
    ).toBeCloseTo(-1);
    expect(
      projectGlobe({ latitude: 0, longitudeEast: 180 }, center).visible,
    ).toBe(false);
    expect(unprojectGlobe(1.01, 0, center)).toBeUndefined();
  });
  it("round-trips both scientific sites and visible arbitrary coordinates at polar and equatorial views", () => {
    for (const center of [
      { latitude: -75, longitudeEast: 45 },
      { latitude: 0, longitudeEast: 350 },
      { latitude: 90, longitudeEast: 0 },
    ]) {
      for (const location of [
        { latitude: -89.5, longitudeEast: 0 },
        { latitude: -89, longitudeEast: 90 },
        { latitude: 10, longitudeEast: 355 },
        { latitude: 45, longitudeEast: 180 },
      ]) {
        const projected = projectGlobe(location, center);
        if (!projected.visible) continue;
        const restored = unprojectGlobe(projected.x, projected.y, center)!;
        expect(restored.latitude).toBeCloseTo(location.latitude, 7);
        expect(
          normalizeLongitude(
            restored.longitudeEast - location.longitudeEast + 180,
          ) - 180,
        ).toBeCloseTo(0, 7);
        expect(restored.sourceSiteId).toBeUndefined();
      }
      expect(unprojectGlobe(0, 0, center)).toEqual(center);
    }
  });
  it("maps the same view center to its crosshair in both modes, never selecting beyond a pole", () => {
    const center = { latitude: -75, longitudeEast: 45 };
    expect(projectMap(center, center)).toEqual({ x: 0, y: -0, visible: true });
    expect(unprojectMap(0, 0, center)).toEqual(center);
    expect(unprojectMap(0, 0.5, center)).toBeUndefined();
    expect(unprojectMap(1.01, 0, center)).toBeUndefined();
    const site = { latitude: -89, longitudeEast: 90 };
    const projected = projectMap(site, center);
    expect(unprojectMap(projected.x, projected.y, center)).toEqual(site);
  });
  it("normalizes negative/wrapped longitude, rejects nonfinite pointer locations", () => {
    expect(normalizeLongitude(-90)).toBe(270);
    expect(normalizeLongitude(720)).toBe(0);
    const center = { latitude: 0, longitudeEast: 355 };
    expect(unprojectMap(0.125, 0, center)?.longitudeEast).toBe(10);
    expect(unprojectGlobe(NaN, 0, center)).toBeUndefined();
    expect(unprojectMap(0, Infinity, center)).toBeUndefined();
  });
});

describe("MoonView exposes equivalent selection controls", () => {
  const center = { latitude: -75, longitudeEast: 45 };
  const southA = {
    latitude: -89.5,
    longitudeEast: 0,
    sourceSiteId: "south-a" as const,
  };
  const props = {
    view: "3D" as const,
    center,
    selections: { A: southA, B: null },
    selectionMode: "center" as const,
    activeSlot: "B" as const,
    onCenterChange: vi.fn(),
    onSelect: vi.fn(),
  };
  it("confirms a free center without attaching a scientific identity, while marker selection preserves it", () => {
    const onSelect = vi.fn();
    render(createElement(MoonView, { ...props, onSelect }));
    fireEvent.keyDown(screen.getByRole("group"), { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith({
      latitude: -75,
      longitudeEast: 45,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Usar local A na seleção B" }),
    );
    expect(onSelect).toHaveBeenLastCalledWith(southA);
  });
  it("moves the camera by keyboard without changing either selected location", () => {
    const onSelect = vi.fn(),
      onCenterChange = vi.fn();
    render(createElement(MoonView, { ...props, onSelect, onCenterChange }));
    fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowRight" });
    expect(onCenterChange).toHaveBeenCalledWith({
      latitude: -75,
      longitudeEast: 50,
    });
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("identifies a hidden hemisphere selection rather than drawing a false foreground pin", () => {
    const { container } = render(
      createElement(MoonView, {
        ...props,
        center: { latitude: 60, longitudeEast: 0 },
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "Usar local A na seleção B (no verso)",
      }),
    ).toBeVisible();
    expect(container.querySelector(".lg-marker-a .lg-marker-point")).toBeNull();
  });
});
