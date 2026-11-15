import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type {
  MissionAnalysis,
  MissionSite,
  TargetName,
} from "../mission/types";
import { ComparisonApp } from "./ComparisonApp";

vi.mock("../mission/globe/MissionGlobe", () => ({
  MissionGlobe: ({
    sites,
    onSelect,
  }: {
    sites: MissionSite[];
    onSelect: (id: string) => void;
  }) => (
    <div aria-label="Map">
      {sites.map((site) => (
        <button key={site.id} onClick={() => onSelect(site.id)}>
          Map {site.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("../mission/HorizonDiagram", () => ({
  HorizonDiagram: ({
    analysis,
    target,
  }: {
    analysis: MissionAnalysis;
    target: TargetName;
  }) => (
    <p data-testid="horizon">
      {analysis.site.label} {analysis.utc} {target}
    </p>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const card = (number: number) =>
  within(screen.getByRole("region", { name: `Scenario ${number}` }));
const selectMap = (site: string) =>
  fireEvent.click(screen.getByRole("button", { name: `Map Site ${site}` }));

describe("comparison explorer", () => {
  it("opens directly and keeps scenarios independent through map edits and removal", () => {
    render(<ComparisonApp />);
    expect(
      screen.getByRole("heading", { name: "Compare lunar landing sites" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /launch|voice/i }),
    ).not.toBeInTheDocument();
    const compare = screen.getByRole("button", {
      name: /compare another scenario/i,
    });
    expect(compare).toBeDisabled();
    selectMap("A");
    expect(compare).toBeEnabled();
    fireEvent.click(compare);
    expect(
      card(2).getByRole("button", { name: "Scenario 2", pressed: true }),
    ).toHaveFocus();
    expect(card(2).getByLabelText("Site for scenario 2")).toHaveValue(
      "mission-a",
    );
    expect(card(2).getByLabelText("Date for scenario 2")).toHaveValue(
      "2026-03-24",
    );
    expect(screen.getByLabelText("Comparison summary")).toHaveTextContent(
      "Same site and date. Change scenario 2 to compare.",
    );
    expect(screen.getByLabelText("Comparison summary")).not.toHaveTextContent(
      /higher|lower|winner/i,
    );
    fireEvent.change(card(2).getByLabelText("Date for scenario 2"), {
      target: { value: "2026-04-28" },
    });
    fireEvent.change(card(2).getByLabelText("Site for scenario 2"), {
      target: { value: "mission-b" },
    });
    expect(card(1).getByLabelText("Site for scenario 1")).toHaveValue(
      "mission-a",
    );
    expect(card(1).getByLabelText("Date for scenario 1")).toHaveValue(
      "2026-03-24",
    );
    expect(screen.getByLabelText("Comparison summary")).toHaveTextContent(
      "Different sites and dates.",
    );
    fireEvent.click(card(1).getByRole("button", { name: "Scenario 1" }));
    selectMap("C");
    expect(card(1).getByLabelText("Site for scenario 1")).toHaveValue(
      "mission-c",
    );
    expect(card(2).getByLabelText("Site for scenario 2")).toHaveValue(
      "mission-b",
    );
    expect(card(2).getByLabelText("Date for scenario 2")).toHaveValue(
      "2026-04-28",
    );
    fireEvent.click(card(2).getByRole("button", { name: "Remove scenario 2" }));
    expect(
      screen.queryByRole("region", { name: "Scenario 2" }),
    ).not.toBeInTheDocument();
    expect(card(1).getByLabelText("Site for scenario 1")).toHaveValue(
      "mission-c",
    );
    expect(
      screen.getByRole("button", { name: /compare another scenario/i }),
    ).toHaveFocus();
  });
  it("updates the horizon with the active scenario and selected body", () => {
    render(<ComparisonApp />);
    selectMap("A");
    expect(screen.getByTestId("horizon")).toHaveTextContent(
      "Site A 2026-03-24T00:00:00.000Z sun",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /compare another scenario/i }),
    );
    selectMap("B");
    fireEvent.change(card(2).getByLabelText("Date for scenario 2"), {
      target: { value: "2026-04-28" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Earth", pressed: false }),
    );
    expect(screen.getByTestId("horizon")).toHaveTextContent(
      "Site B 2026-04-28T00:00:00.000Z earth",
    );
    fireEvent.click(card(1).getByRole("button", { name: "Scenario 1" }));
    expect(screen.getByTestId("horizon")).toHaveTextContent(
      "Site A 2026-03-24T00:00:00.000Z earth",
    );
  });
  it("manages About focus, inert background, Escape and source URL cleanup", () => {
    const create = vi.fn(() => "blob:mission-audit");
    const revoke = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, {
        createObjectURL: create,
        revokeObjectURL: revoke,
      }),
    );
    const view = render(<ComparisonApp />);
    const about = screen.getByRole("button", { name: "About & data" });
    about.focus();
    fireEvent.click(about);
    const dialog = screen.getByRole("dialog", { name: "About this explorer" });
    expect(
      within(dialog).getByRole("button", { name: "Close about" }),
    ).toHaveFocus();
    expect(about.closest(".comparison-content")).toHaveAttribute("inert");
    const download = within(dialog).getByRole("link", {
      name: "Download source data (JSON)",
    });
    expect(download).toHaveAttribute("href", "blob:mission-audit");
    expect(download).toHaveAttribute(
      "download",
      "lunar-comparison-source-data.json",
    );
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(download).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(
      within(dialog).getByRole("button", { name: "Close about" }),
    ).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(about).toHaveFocus();
    expect(about.closest(".comparison-content")).not.toHaveAttribute("inert");
    view.unmount();
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:mission-audit");
  });
});
