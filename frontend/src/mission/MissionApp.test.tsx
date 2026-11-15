import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionSite } from "./types";

const dataControl = vi.hoisted(() => ({ mode: "valid", lookup: vi.fn() }));

vi.mock("./mission-data", () => {
  const sites = ["a", "b", "c", "d"].map((name, index) => ({
    id: `mission-${name}`,
    label: `Site ${name.toUpperCase()}`,
    latitudeDeg: -85,
    longitudeDeg: index * 90,
  }));
  return {
    MISSION_SITES: sites,
    DEFAULT_MISSION_DATE: "2026-03-24",
    MISSION_DATES: [
      { value: "2026-03-24", label: "March 24, 2026 — 00:00 UTC" },
      { value: "2026-04-28", label: "April 28, 2026 — 00:00 UTC" },
    ],
    MISSION_PROVENANCE: {
      summary: "SPICE data",
      model: "DE421",
      source: "Test audit",
      limitation: "Idealized horizon",
    },
    MISSION_AUDIT: { manifest: { model: "DE421" }, results: [] },
    getMissionAnalysis(id: string, date: string) {
      dataControl.lookup(id, date);
      if (dataControl.mode === "throw") throw new Error("Invalid fixture");
      if (dataControl.mode === "missing") return undefined;
      const good =
        date === "2026-03-24"
          ? id === "mission-b" || id === "mission-c"
          : id === "mission-a";
      const elevation =
        dataControl.mode === "invalid" ? Number.NaN : good ? 5 : -3;
      return {
        site: sites.find((site) => site.id === id),
        utc: `${date}T00:00:00Z`,
        sun: {
          azimuthDeg: 90,
          elevationDeg: elevation,
          state: good ? "above" : "below",
        },
        earth: { azimuthDeg: 20, elevationDeg: 2, state: "above" },
        // The UI must enforce the angle criterion even if this flag is wrong.
        meetsGoal: true,
      };
    },
  };
});

vi.mock("./MissionArt", () => ({
  GuidePortrait: () => <div aria-label="Guide illustration" />,
  RocketIllustration: ({ phase }: { phase: string }) => (
    <div data-testid="rocket" data-phase={phase} />
  ),
}));

vi.mock("./globe/MissionGlobe", () => ({
  MissionGlobe: ({
    sites,
    selectedSiteId,
    onSelect,
    onDiscover,
  }: {
    sites: MissionSite[];
    selectedSiteId?: string;
    onSelect: (id: string) => void;
    onDiscover: () => void;
  }) => (
    <div>
      {sites.map((site) => (
        <button
          key={site.id}
          aria-pressed={selectedSiteId === site.id}
          onClick={() => onSelect(site.id)}
        >
          {site.label}
        </button>
      ))}
      <button onClick={onDiscover}>Discover bonus</button>
    </div>
  ),
}));

vi.mock("./HorizonDiagram", () => ({
  HorizonDiagram: ({
    target,
    analysis,
  }: {
    target: string;
    analysis: { site: MissionSite };
  }) => (
    <div data-testid="horizon">
      {analysis.site.id} / {target}
    </div>
  ),
}));

import { MissionApp } from "./MissionApp";
import { openingDialogue, arrivalDialogue } from "./mission-copy";

function continueLine() {
  const button = screen.getByRole("button", { name: "Continue" });
  fireEvent.click(button);
  fireEvent.click(button);
}

function finishOpening() {
  for (const _line of openingDialogue) continueLine();
}

function directMap() {
  render(<MissionApp />);
  finishOpening();
  fireEvent.click(screen.getByRole("button", { name: "Skip launch" }));
  for (const _line of arrivalDialogue) continueLine();
}

function selectSite(label = "Site B") {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

beforeEach(() => {
  dataControl.mode = "valid";
  dataControl.lookup.mockClear();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1024,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:mission-audit"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("guided lunar mission", () => {
  it("offers only Back and Continue, without voice or speech API calls", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal("SpeechSynthesisUtterance", vi.fn());
    render(<MissionApp />);
    const dialogue = screen.getByRole("group", { name: "Dialogue from Lua" });
    expect(within(dialogue).getAllByRole("button")).toHaveLength(2);
    expect(within(dialogue).getByRole("button", { name: "Back" })).toBeDisabled();
    expect(within(dialogue).getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(dialogue).toHaveTextContent(openingDialogue[0]);
    continueLine();
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(speak).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(globalThis.SpeechSynthesisUtterance).not.toHaveBeenCalled();
  });

  it("returns while typing and retains focus at the first line boundary", () => {
    render(<MissionApp />);
    continueLine();
    const dialogue = screen.getByRole("group", { name: "Dialogue from Lua" });
    expect(dialogue).toHaveTextContent(openingDialogue[1]);
    const back = within(dialogue).getByRole("button", { name: "Back" });
    back.focus();
    fireEvent.click(back);
    expect(dialogue).toHaveTextContent(openingDialogue[0]);
    expect(back).toBeDisabled();
    expect(within(dialogue).getByRole("button", { name: "Continue" })).toHaveFocus();
  });

  it("skips launch, goes back across stages without replaying it, then reaches an unselected map", () => {
    vi.useFakeTimers();
    const schedule = vi.spyOn(window, "setTimeout");
    const cancel = vi.spyOn(window, "clearTimeout");
    render(<MissionApp />);
    const button = screen.getByRole("button", { name: "Continue" });
    button.focus();
    for (const _line of openingDialogue) {
      expect(button).toHaveFocus();
      continueLine();
    }
    const transitionIndex = schedule.mock.calls.findIndex(([, delay]) => delay === 3200);
    expect(transitionIndex).toBeGreaterThanOrEqual(0);
    const transitionTimer = schedule.mock.results[transitionIndex].value;
    expect(screen.getByTestId("rocket")).toHaveAttribute("data-phase", "launch");
    fireEvent.click(screen.getByRole("button", { name: "Skip launch" }));
    expect(cancel).toHaveBeenCalledWith(transitionTimer);
    expect(screen.getByRole("heading", { name: "Welcome to the Moon" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("group", { name: "Dialogue from Lua" })).toHaveTextContent(openingDialogue.at(-1)!);
    expect(screen.queryByRole("button", { name: "Skip launch" })).not.toBeInTheDocument();
    continueLine();
    fireEvent.click(screen.getByRole("button", { name: "Skip launch" }));
    continueLine();
    expect(screen.getByRole("group", { name: "Dialogue from Lua" })).toHaveTextContent(arrivalDialogue[1]);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("group", { name: "Dialogue from Lua" })).toHaveTextContent(arrivalDialogue[0]);
    for (const _line of arrivalDialogue) continueLine();
    expect(screen.getByRole("heading", { name: "Where should we land?" })).toHaveFocus();
    expect(screen.getByText("Pick a point on the Moon.")).toBeVisible();
    expect(screen.queryByTestId("horizon")).not.toBeInTheDocument();
    expect(dataControl.lookup).not.toHaveBeenCalled();
  });

  it("advances launch automatically and completes both arrival lines", () => {
    vi.useFakeTimers();
    render(<MissionApp />);
    finishOpening();
    act(() => vi.advanceTimersByTime(3200));
    expect(screen.getByRole("heading", { name: "Welcome to the Moon" })).toHaveFocus();
    for (const _line of arrivalDialogue) continueLine();
    expect(screen.getByRole("heading", { name: "Where should we land?" })).toHaveFocus();
  });

  it("pauses the launch timer while the context dialog is open", () => {
    vi.useFakeTimers();
    render(<MissionApp />);
    finishOpening();
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId("rocket")).toHaveAttribute("data-phase", "launch");
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    act(() => vi.advanceTimersByTime(2199));
    expect(screen.getByTestId("rocket")).toHaveAttribute("data-phase", "launch");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("heading", { name: "Welcome to the Moon" })).toHaveFocus();
  });

  it("explains an unsuitable choice and allows another point without replaying the briefing", () => {
    directMap();
    selectSite("Site A");
    expect(screen.getByRole("status")).toHaveTextContent(
      "The Sun’s center is on or below the horizon",
    );
    expect(
      screen.getByRole("button", { name: "Land here" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Choose another point" }),
    );
    expect(
      screen.getByRole("heading", { name: "Explore the sites" }),
    ).toHaveFocus();
    selectSite();
    expect(
      screen.getByRole("button", { name: "Land here" }),
    ).toBeEnabled();
    expect(screen.getByText("2 of 4 explored")).toBeVisible();
  });

  it("recalculates on date changes and switches which target the diagram explains", () => {
    directMap();
    selectSite();
    fireEvent.click(screen.getByRole("button", { name: /^Earth/ }));
    expect(screen.getByRole("button", { name: /^Earth/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("horizon")).toHaveTextContent(
      "mission-b / earth",
    );
    fireEvent.change(screen.getByLabelText(/Date/), {
      target: { value: "2026-04-28" },
    });
    expect(dataControl.lookup).toHaveBeenLastCalledWith(
      "mission-b",
      "2026-04-28",
    );
    expect(screen.getByRole("button", { name: /^Sun/ })).toHaveTextContent(
      "-3.0°",
    );
    expect(
      screen.getByRole("button", { name: "Land here" }),
    ).toBeDisabled();
    selectSite("Site A");
    expect(
      screen.getByRole("button", { name: "Land here" }),
    ).toBeEnabled();
  });

  it("lets mobile explorers return to the map while preserving date, target, and chosen point", () => {
    window.innerWidth = 390;
    directMap();
    fireEvent.change(screen.getByLabelText(/Date/), {
      target: { value: "2026-04-28" },
    });
    const point = screen.getByRole("button", { name: "Site A" });
    point.focus();
    fireEvent.click(point);
    expect(point).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /^Earth/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back to map" }));
    expect(
      screen.getByRole("heading", { name: "Explore the sites" }),
    ).toHaveFocus();
    expect(point).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Date/)).toHaveValue(
      "2026-04-28",
    );
    expect(screen.getByRole("button", { name: /^Earth/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Land here" }),
    ).toBeEnabled();
    selectSite("Site B");
    expect(
      screen.getByRole("button", { name: "Land here" }),
    ).toBeDisabled();
    expect(screen.getByTestId("horizon")).toHaveTextContent(
      "mission-b / earth",
    );
    expect(screen.getByLabelText(/Date/)).toHaveValue(
      "2026-04-28",
    );
  });

  it.each(["Back", "Continue"])("returns to exploration from completion with %s", (action) => {
    directMap();
    selectSite("Site C");
    fireEvent.click(screen.getByRole("button", { name: "Land here" }));
    expect(screen.getByTestId("rocket")).toHaveAttribute(
      "data-phase",
      "landing",
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip landing" }));
    expect(
      screen.getByRole("heading", { name: "Site selected." }),
    ).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Site C" })).toBeVisible();
    expect(
      screen.getByText(/Illustrative landing at a hypothetical site/),
    ).toBeVisible();
    if (action === "Continue") continueLine();
    else fireEvent.click(screen.getByRole("button", { name: action }));
    expect(screen.getByRole("button", { name: "Site C" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    selectSite("Site B");
    expect(
      screen.getByRole("button", { name: "Land here" }),
    ).toBeEnabled();
  });

  it("respects reduced motion for both launch and landing", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    render(<MissionApp />);
    for (const _line of openingDialogue) {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    }
    expect(screen.getByRole("heading", { name: "Welcome to the Moon" })).toHaveFocus();
    expect(screen.queryByText("Skip launch")).not.toBeInTheDocument();
    for (const _line of arrivalDialogue) {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    }
    expect(screen.getByRole("heading", { name: "Where should we land?" })).toHaveFocus();
    selectSite();
    fireEvent.click(screen.getByRole("button", { name: "Land here" }));
    expect(
      screen.getByRole("heading", { name: "Site selected." }),
    ).toHaveFocus();
  });

  it("opens the optional bonus without selecting a point or blocking the mission", () => {
    directMap();
    const bonus = screen.getByRole("button", { name: "Discover bonus" });
    bonus.focus();
    fireEvent.click(bonus);
    const dialog = screen.getByRole("dialog", {
      name: "Sound on the Moon",
    });
    expect(dialog).toHaveTextContent(/Sound needs a medium/);
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    const back = within(dialog).getByRole("button", {
      name: "Back to exploring",
    });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(back).toHaveFocus();
    fireEvent.keyDown(back, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bonus).toHaveFocus();
    selectSite();
    expect(
      screen.getByRole("button", { name: "Land here" }),
    ).toBeEnabled();
  });

  it("shows provenance in a keyboard-contained dialog and restores focus", () => {
    render(<MissionApp />);
    const about = screen.getByRole("button", { name: "About" });
    about.focus();
    fireEvent.click(about);
    const dialog = screen.getByRole("dialog", { name: "About this mission" });
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    const download = within(dialog).getByRole("link", {
      name: "Download data and audit (JSON)",
    });
    expect(dialog).toHaveTextContent("DE421");
    expect(dialog).toHaveTextContent(/do not measure mountain obstruction/);
    expect(close).toHaveFocus();
    expect(download).toHaveAttribute("href", "blob:mission-audit");
    expect(download).toHaveAttribute("download", "lunar-mission-audit.json");
    expect(document.body.style.overflow).toBe("hidden");
    expect(about.closest(".mission-content")).toHaveAttribute("inert");
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(download).toHaveFocus();
    fireEvent.keyDown(download, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(about).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("releases the audit download URL on unmount", () => {
    const view = render(<MissionApp />);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mission-audit");
  });

  it.each(["missing", "throw", "invalid"])(
    "fails closed for %s data and recovers with a new selection",
    (mode) => {
      directMap();
      dataControl.mode = mode;
      selectSite();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We could not load this site and date",
      );
      expect(screen.queryByTestId("horizon")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Land here" }),
      ).not.toBeInTheDocument();
      dataControl.mode = "valid";
      selectSite("Site C");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Land here" }),
      ).toBeEnabled();
    },
  );
});
