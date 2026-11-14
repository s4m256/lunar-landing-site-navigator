import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import data from "../../docs/audits/pr4/result-2026.json";
import { ScienceDemo } from "./ScienceDemo";
import { LegacyApp } from "./LegacyApp";

afterEach(cleanup);
const changeDate = (date: string) =>
  fireEvent.change(screen.getByLabelText("Data da amostra (UTC)"), {
    target: { value: date },
  });
function checkTable(target: "SUN" | "EARTH", date: string) {
  const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
  for (const [i, id] of ["south-a", "south-b"].entries()) {
    const sample = data.series
      .find((s) => s.site_id === id && s.target === target)!
      .samples.find((s) => s.utc === date + "T00:00:00.000Z")!;
    const cells = within(rows[i]).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent(sample.azimuth_deg.toFixed(4) + "°");
    expect(cells[1]).toHaveTextContent(sample.elevation_deg.toFixed(4) + "°");
  }
}
describe("static scientific demonstration", () => {
  it("uses actual independent site/target samples at the selected exact UTC date", () => {
    render(<ScienceDemo />);
    checkTable("SUN", "2026-01-01");
    changeDate("2026-06-15");
    checkTable("SUN", "2026-06-15");
    fireEvent.click(screen.getByRole("button", { name: "Terra" }));
    checkTable("EARTH", "2026-06-15");
    expect(screen.getByRole("button", { name: "Terra" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    changeDate("2026-12-31");
    checkTable("EARTH", "2026-12-31");
    expect(screen.getByRole("status")).toHaveTextContent(
      "2026-12-31T00:00:00.000Z",
    );
  });
  it("draws all discrete elevation samples with units and a zero horizon", () => {
    render(<ScienceDemo />);
    const chart = screen.getByRole("img", {
      name: /Elevação do centro do Sol/,
    });
    expect(chart.querySelectorAll("polyline")).toHaveLength(2);
    expect(chart.querySelectorAll("circle")).toHaveLength(732); // 730 samples + 2 selected
    expect(
      within(chart).getByText("Horizonte geométrico 0°"),
    ).toBeInTheDocument();
    expect(within(chart).getByText("Elevação (°)")).toBeInTheDocument();
    expect(screen.getByText(/não há interpolação/i)).toBeVisible();
    expect(screen.getByText("● Local A")).toBeVisible();
    expect(screen.getByText("◆ Local B")).toBeVisible();
  });
  it.each(["", "2027-01-01", "2025-12-31"])(
    "shows no numbers for an unavailable selection: %s",
    (date) => {
      render(<ScienceDemo />);
      changeDate(date);
      expect(screen.getByRole("status")).toHaveTextContent("Sem amostra");
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(
        screen
          .getByRole("img", { name: /Elevação/ })
          .querySelectorAll(".selected-point"),
      ).toHaveLength(0);
    },
  );
  it.each([
    "{broken",
    "{}",
    JSON.stringify({
      ...data,
      series: [data.series[0], data.series[0], data.series[0], data.series[0]],
    }),
  ])("fails closed for an invalid artifact", (source) => {
    render(<ScienceDemo source={source} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o dataset científico",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("discloses scientific limits and offers unchanged full provenance", () => {
    render(<ScienceDemo />);
    expect(
      screen.getByText(/Sem validação independente contra JPL Horizons/),
    ).toBeVisible();
    expect(screen.getByText(/não garante comunicação/)).toBeVisible();
    expect(
      screen.getByText(/não verificado diretamente no servidor NAIF/),
    ).toBeVisible();
    fireEvent.click(screen.getByText("Versões, kernels e hashes SHA-256"));
    for (const k of data.provenance.kernels)
      expect(screen.getByText(k.sha256)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Baixar JSON completo/ }),
    ).toHaveAttribute("download", "result-2026.json");
  });
  it("keeps user-defined coordinates and dates isolated from the scientific demonstration", () => {
    render(<LegacyApp />);
    expect(screen.getByRole("table")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Planejamento livre" }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome do local"), {
      target: { value: "Meu local" },
    });
    fireEvent.change(screen.getByLabelText("Latitude (°)"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Longitude (°)"), {
      target: { value: "-120" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Adicionar local" }));
    expect(screen.getByRole("checkbox", { name: /Meu local/ })).toBeChecked();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/Este modo não utiliza as séries/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Demonstração científica 2026" }),
    );
    checkTable("SUN", "2026-01-01");
    expect(screen.queryByText("Meu local")).not.toBeInTheDocument();
  });
});
