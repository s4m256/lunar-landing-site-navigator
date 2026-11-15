import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import * as mission from "../mission/mission-data";
import type { MissionAnalysis } from "../mission/types";
import { ScenarioCard } from "./ScenarioCard";

vi.mock("../mission/mission-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mission/mission-data")>()),
  getMissionAnalysis: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const value = { siteId: "mission-a", date: "2026-03-24" };
const analysis: MissionAnalysis = {
  site: mission.MISSION_SITES[0],
  utc: "2026-03-24T00:00:00.000Z",
  sun: { elevationDeg: 0.01, azimuthDeg: 30, state: "above" },
  earth: { elevationDeg: 0, azimuthDeg: 120, state: "on-horizon" },
  meetsGoal: false,
};
const props = {
  slot: "A" as const,
  value,
  active: true,
  onActivate: vi.fn(),
  onChange: vi.fn(),
};

describe("ScenarioCard", () => {
  it("shows English labels and classifies full precision, including zero", () => {
    vi.mocked(mission.getMissionAnalysis).mockReturnValue(analysis);
    render(<ScenarioCard {...props} />);
    expect(
      screen.getByRole("button", { name: "Scenario 1", pressed: true }),
    ).toBeVisible();
    expect(screen.getByLabelText("Site for scenario 1")).toBeVisible();
    expect(screen.getByLabelText("Date for scenario 1")).toBeVisible();
    expect(screen.getByText("Above horizon")).toBeVisible();
    expect(screen.getByText("On horizon")).toBeVisible();
    expect(screen.getByText("0.01° elevation")).toBeVisible();
    expect(screen.getByText("0.0° elevation")).toBeVisible();
    expect(screen.getByText("Azimuth 30.0°")).toBeVisible();
  });
  it("activates before changing only the selected scenario's site or date", () => {
    const order: string[] = [];
    const changeA = vi.fn();
    const changeB = vi.fn(() => order.push("change"));
    render(
      <>
        <ScenarioCard {...props} onChange={changeA} />
        <ScenarioCard
          {...props}
          slot="B"
          active={false}
          onActivate={() => order.push("activate")}
          onChange={changeB}
        />
      </>,
    );
    const cardB = screen.getByRole("region", { name: "Scenario 2" });
    fireEvent.change(within(cardB).getByLabelText("Site for scenario 2"), {
      target: { value: "mission-b" },
    });
    expect(order).toEqual(["activate", "change"]);
    expect(changeB).toHaveBeenLastCalledWith({ ...value, siteId: "mission-b" });
    fireEvent.change(within(cardB).getByLabelText("Date for scenario 2"), {
      target: { value: "2026-04-28" },
    });
    expect(changeB).toHaveBeenLastCalledWith({ ...value, date: "2026-04-28" });
    expect(order).toEqual(["activate", "change", "activate", "change"]);
    expect(changeA).not.toHaveBeenCalled();
  });
  it("fails closed for invalid data and does not retain an earlier result", () => {
    vi.mocked(mission.getMissionAnalysis)
      .mockReturnValueOnce(analysis)
      .mockReturnValueOnce({
        ...analysis,
        sun: { ...analysis.sun, elevationDeg: NaN },
      });
    const view = render(<ScenarioCard {...props} />);
    expect(screen.getByText("Above horizon")).toBeVisible();
    view.rerender(<ScenarioCard {...props} />);
    expect(screen.queryByText("Above horizon")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Data unavailable. Try another site or date.",
    );
  });
  it("offers removal only for B when a callback is supplied", () => {
    const remove = vi.fn();
    const view = render(<ScenarioCard {...props} onRemove={remove} />);
    expect(
      screen.queryByRole("button", { name: /Remove scenario/ }),
    ).not.toBeInTheDocument();
    view.rerender(<ScenarioCard {...props} slot="B" onRemove={remove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove scenario 2" }));
    expect(remove).toHaveBeenCalledOnce();
  });
});
