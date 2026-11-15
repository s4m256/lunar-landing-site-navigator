import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HorizonDiagram } from "./HorizonDiagram";
import type { MissionAnalysis } from "./types";

afterEach(cleanup);
const analysis: MissionAnalysis = {
  site: { id: "test", label: "Test", latitudeDeg: -85, longitudeDeg: 0 },
  utc: "2026-03-24T00:00:00.000Z",
  sun: { azimuthDeg: 40, elevationDeg: 5, state: "above" },
  earth: { azimuthDeg: 110, elevationDeg: -3, state: "below" },
  meetsGoal: false,
};

describe("mission horizon explanation", () => {
  it("communicates the exact selected direction and the terrain limitation in text", () => {
    render(<HorizonDiagram analysis={analysis} target="sun" />);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /Sun: 5.00°, above the idealized horizon/,
    );
    expect(
      screen.getByText(/Azimuth 40.00°. Mountain blocking is not included/),
    ).toBeVisible();
  });
  it("switches to Earth and explicitly distinguishes the below-horizon direction", () => {
    const view = render(<HorizonDiagram analysis={analysis} target="sun" />);
    view.rerender(<HorizonDiagram analysis={analysis} target="earth" />);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /Earth: -3.00°, below the idealized horizon/,
    );
    expect(
      screen.getByText(/The dashed line indicates the center is below/),
    ).toBeVisible();
  });
  it("does not display a substitute ray for a non-finite direction", () => {
    render(
      <HorizonDiagram
        analysis={{ ...analysis, sun: { ...analysis.sun, elevationDeg: NaN } }}
        target="sun"
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Direction unavailable",
    );
  });
});
