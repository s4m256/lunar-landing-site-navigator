import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import dataset from "../../docs/data/mvp-b-hourly.json";
import { HourlyVisibility } from "./HourlyVisibility";
import { LegacyApp as App } from "./App";

afterEach(cleanup);
function check(target: "SUN" | "EARTH", date: string, hour: string) {
  const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
  for (const [i, id] of ["south-a", "south-b"].entries()) {
    const sample = dataset.analysis.series
      .find((s) => s.site_id === id && s.target === target)!
      .samples.find((s) => s.utc === `${date}T${hour}:00:00.000Z`)!;
    const cells = within(rows[i]).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent(sample.azimuth_deg.toFixed(4) + "°");
    expect(cells[1]).toHaveTextContent(sample.elevation_deg.toFixed(4) + "°");
    expect(cells[2]).toHaveTextContent(
      sample.elevation_deg > 0 ? /^Acima$/ : /^Não acima$/,
    );
    expect(cells[3]).toHaveTextContent("Indisponível");
  }
}
function setDate(date: string) {
  fireEvent.change(screen.getByLabelText("Data (UTC)"), {
    target: { value: date },
  });
}
function setHour(hour: string) {
  fireEvent.change(screen.getByLabelText("Hora (UTC)"), {
    target: { value: hour },
  });
}
describe("MVP B hourly sampled visibility", () => {
  it("shows actual SPICE samples for both sites, targets and inclusive endpoints", () => {
    render(<HourlyVisibility />);
    check("SUN", "2026-11-15", "00");
    setDate("2026-11-30");
    setHour("13");
    check("SUN", "2026-11-30", "13");
    fireEvent.click(screen.getByRole("button", { name: "Terra" }));
    check("EARTH", "2026-11-30", "13");
    setHour("00");
    setDate("2026-12-15");
    check("EARTH", "2026-12-15", "00");
    expect(screen.getByRole("status")).toHaveTextContent(
      "2026-12-15 00:00:00 UTC",
    );
    expect(screen.getByRole("option", { name: "01:00 UTC" })).toBeDisabled();
  });
  it("renders sampled states, distinguishes timestamps from intervals, and does not draw topographic data", () => {
    render(<HourlyVisibility />);
    expect(
      screen.getByText(/721 timestamps · 720 intervalos horários/),
    ).toBeVisible();
    expect(screen.getByText(/Horizonte topográfico desativado/)).toBeVisible();
    const plot = screen.getByRole("img", { name: /Amostras horárias/ });
    expect(plot.querySelectorAll("line")).toHaveLength(4 * 721 + 1);
    expect(
      screen.getByText(/horário exato da transição não foi calculado/),
    ).toBeVisible();
    expect(
      screen.getByText(/não garante comunicação operacional/),
    ).toBeVisible();
    expect(
      screen.getByText(/Sem validação independente contra Horizons/),
    ).toBeVisible();
  });
  it.each([
    ["2026-11-14", "23"],
    ["2026-12-15", "01"],
    ["2026-12-16", "00"],
    ["", "00"],
  ])("fails closed for unavailable date/hour %s %s", (date, hour) => {
    render(<HourlyVisibility />);
    setDate(date);
    setHour(hour);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sem amostra");
    expect(
      screen
        .getByRole("img", { name: /Amostras horárias/ })
        .querySelector(".date-line"),
    ).toBeNull();
  });
  it.each([
    "{}",
    "{broken",
    JSON.stringify({
      ...dataset,
      topography: { status: "verified", reason: "fake terrain" },
    }),
  ])("shows an explicit error for bad dataset", (source) => {
    render(<HourlyVisibility source={source} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Dataset horário indisponível",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("preserves access to MVP A and free planning in separate modes", () => {
    render(<App />);
    expect(screen.getByLabelText("Data da amostra (UTC)")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Visibilidade horária / MVP B" }),
    );
    check("SUN", "2026-11-15", "00");
    expect(
      screen.queryByLabelText("Data da amostra (UTC)"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Planejamento livre" }));
    expect(screen.getByLabelText("Nome do local")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Demonstração científica 2026" }),
    );
    expect(screen.getByLabelText("Data da amostra (UTC)")).toBeVisible();
  });
});
