import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import data from "../../../docs/audits/pr4/result-2026.json";
import type { Sample } from "../scientific-data";
import { MinimalExplorer } from "./MinimalExplorer";

vi.mock("./LunarScene", () => ({
  default: ({
    sun,
    earth,
    resetToken,
  }: {
    sun?: Sample;
    earth?: Sample;
    resetToken: number;
  }) => (
    <div
      data-testid="scene"
      data-sun={sun ? JSON.stringify(sun) : undefined}
      data-earth={earth ? JSON.stringify(earth) : undefined}
      data-reset={resetToken}
    />
  ),
}));

afterEach(cleanup);

function sample(target: "SUN" | "EARTH", date: string) {
  return data.series
    .find((series) => series.site_id === "south-a" && series.target === target)!
    .samples.find((value) => value.utc === `${date}T00:00:00.000Z`)!;
}

function setDate(date: string) {
  fireEvent.change(screen.getByLabelText("Data da amostra (UTC)"), {
    target: { value: date },
  });
}

describe("minimal lunar explorer", () => {
  it("shows both targets from the same fixed observer and exact UTC sample", async () => {
    render(<MinimalExplorer />);
    const scene = await screen.findByTestId("scene");
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByLabelText("Data da amostra (UTC)")).toHaveValue(
      "2026-01-01",
    );
    expect(screen.getByText(/89,5° S · 0° E/)).toBeVisible();
    for (const date of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      setDate(date);
      for (const [target, label, attribute] of [
        ["SUN", "Sol", "data-sun"],
        ["EARTH", "Terra", "data-earth"],
      ] as const) {
        const expected = sample(target, date);
        const card = within(screen.getByRole("article", { name: label }));
        expect(
          card.getByText(`${expected.elevation_deg.toFixed(2)}°`),
        ).toBeVisible();
        expect(
          card.getByText(`${expected.azimuth_deg.toFixed(2)}°`),
        ).toBeVisible();
        expect(JSON.parse(scene.getAttribute(attribute)!)).toEqual(expected);
      }
      expect(screen.getByRole("status")).toHaveTextContent(
        `${date}T00:00:00.000Z`,
      );
    }
  });

  it.each(["", "2027-01-01", "2025-12-31"])(
    "removes both targets for a missing UTC sample (%s)",
    async (date) => {
      render(<MinimalExplorer />);
      const scene = await screen.findByTestId("scene");
      setDate(date);
      expect(screen.getByLabelText("Data da amostra (UTC)")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getAllByText("Sem amostra para esta data.")).toHaveLength(
        2,
      );
      expect(scene).not.toHaveAttribute("data-sun");
      expect(scene).not.toHaveAttribute("data-earth");
      expect(
        screen.queryByText("Elevação", { exact: true }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Sem amostra");
    },
  );

  it.each([
    "{broken",
    "{}",
    JSON.stringify({
      ...data,
      series: [data.series[0], data.series[0], data.series[0], data.series[0]],
    }),
  ])(
    "rejects incompatible artifacts without rendering scientific directions",
    (source) => {
      render(<MinimalExplorer source={source} />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Dados científicos indisponíveis",
      );
      expect(screen.queryByTestId("scene")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Elevação", { exact: true }),
      ).not.toBeInTheDocument();
    },
  );

  it("recenters without changing the selected date or samples", async () => {
    render(<MinimalExplorer />);
    const scene = await screen.findByTestId("scene");
    setDate("2026-06-15");
    const before = scene.getAttribute("data-sun");
    fireEvent.click(screen.getByRole("button", { name: "Recentrar" }));
    expect(scene).toHaveAttribute("data-reset", "1");
    expect(scene).toHaveAttribute("data-sun", before);
    expect(screen.getByLabelText("Data da amostra (UTC)")).toHaveValue(
      "2026-06-15",
    );
  });

  it("opens accessible information, wraps keyboard focus and restores it on Escape", async () => {
    render(<MinimalExplorer />);
    await screen.findByTestId("scene");
    const trigger = screen.getByRole("button", { name: "Informações" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "Entenda o seu horizonte",
    });
    const close = within(dialog).getByRole("button", {
      name: "Fechar informações",
    });
    const download = within(dialog).getByRole("link", {
      name: /Baixar JSON completo com proveniência/,
    });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(download).toHaveFocus();
    fireEvent.keyDown(download, { key: "Tab" });
    expect(close).toHaveFocus();
    expect(download).toHaveAttribute("download", "result-2026.json");
    expect(
      within(dialog).getByText(
        /Sem validação independente contra JPL Horizons/,
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Relevo contextual, sem cálculo de bloqueio/),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/referencial lunar ME\/DE421/),
    ).toBeVisible();
    for (const kernel of data.provenance.kernels)
      expect(within(dialog).getByText(kernel.sha256)).toBeVisible();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it("can close information with its visible button", async () => {
    render(<MinimalExplorer />);
    await screen.findByTestId("scene");
    const trigger = screen.getByRole("button", { name: "Informações" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Fechar informações" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
