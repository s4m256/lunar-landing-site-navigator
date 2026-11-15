import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { MissionGlobe } from "./MissionGlobe";

const drawing = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn() }));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement("canvas");
      setPixelRatio() {}
      setClearColor() {}
      setSize() {}
      render = drawing.render;
      dispose = drawing.dispose;
    },
    TextureLoader: class {
      load() {
        return new actual.Texture();
      }
    },
  };
});

const sites = [
  { id: "a", label: "Site A", latitudeDeg: -85, longitudeDeg: 0 },
  { id: "b", label: "Site B", latitudeDeg: -85, longitudeDeg: 90 },
];

function camera(): THREE.PerspectiveCamera {
  return drawing.render.mock.lastCall![1];
}

beforeEach(() => {
  drawing.render.mockClear();
  drawing.dispose.mockClear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Moon exploration controls", () => {
  it("rotates with the keyboard, bounds zoom, and restores the south-pole view", () => {
    render(
      <MissionGlobe sites={sites} visitedSiteIds={[]} onSelect={vi.fn()} />,
    );
    const stage = screen.getByRole("group", { name: "Interactive Moon" });
    expect(stage).toHaveAttribute("tabindex", "0");
    expect(stage).toHaveAccessibleDescription(/arrow keys to rotate/);
    const initial = camera().position.clone();
    fireEvent.keyDown(stage, { key: "ArrowRight" });
    expect(camera().position.distanceTo(initial)).toBeGreaterThan(0.01);
    expect(camera().position.length()).toBeCloseTo(initial.length());
    fireEvent.click(screen.getByRole("button", { name: "South pole" }));
    expect(camera().position.distanceTo(initial)).toBeCloseTo(0);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(camera().position.length()).toBeLessThan(initial.length());
    expect(screen.getByRole("button", { name: "South pole" })).toBeEnabled();
    for (let i = 0; i < 25; i++) fireEvent.keyDown(stage, { key: "+" });
    expect(camera().position.length()).toBeCloseTo(1.35);
    for (let i = 0; i < 25; i++) fireEvent.keyDown(stage, { key: "-" });
    expect(camera().position.length()).toBeCloseTo(5);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(camera().position.length()).toBeCloseTo(5);
  });

  it("keeps compared sites selectable and supports optional legacy bonus actions", () => {
    const onSelect = vi.fn();
    const onDiscover = vi.fn();
    const props = {
      sites,
      selectedSiteId: "a",
      visitedSiteIds: [],
      onSelect,
      comparisonSiteIds: ["a", "b"],
    };
    const view = render(<MissionGlobe {...props} />);
    expect(
      screen.queryByRole("button", { name: /educational bonus/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Site list"));
    const compared = screen.getByRole("button", { name: /Site B/ });
    expect(compared).toHaveAttribute("data-compared", "true");
    expect(compared).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(compared);
    expect(onSelect).toHaveBeenCalledWith("b");
    view.rerender(
      <MissionGlobe {...props} onDiscover={onDiscover} discovered />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reopen educational bonus" }),
    );
    expect(onDiscover).toHaveBeenCalledOnce();

    fireEvent(
      document.querySelector("canvas")!,
      new Event("webglcontextlost", { cancelable: true }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Moon view is unavailable",
    );
    expect(screen.getByText("Site list").closest("details")).toHaveAttribute(
      "open",
    );
    expect(
      screen.queryByRole("button", { name: "Zoom in" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Site B/ }));
    expect(onSelect).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(drawing.dispose).toHaveBeenCalledOnce();
  });
});
