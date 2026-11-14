import { useState } from "react";
import type { PlanningSite } from "./planning";

export function ComparisonChart({ sites }: { sites: PlanningSite[] }) {
  const [view, setView] = useState<"bars" | "lines">("bars");
  return (
    <section className="panel comparison" aria-labelledby="comparison-title">
      <div className="section-top">
        <div>
          <p className="eyebrow">02 / COMPARAR</p>
          <h2 id="comparison-title">Uma perspectiva lado a lado</h2>
        </div>
        <div className="segmented" aria-label="Formato do gráfico">
          <button
            aria-pressed={view === "bars"}
            onClick={() => setView("bars")}
          >
            Barras
          </button>
          <button
            aria-pressed={view === "lines"}
            onClick={() => setView("lines")}
          >
            Linhas
          </button>
        </div>
      </div>
      <div className="chart-empty" data-format={view}>
        <span className="chart-symbol" aria-hidden="true">
          {view === "bars" ? "▥" : "⌁"}
        </span>
        <h3>
          {sites.length < 2
            ? "Selecione pelo menos dois locais"
            : "Locais prontos para uma futura comparação"}
        </h3>
        <p>
          O contrato atual não fornece métricas ou séries. Nenhum gráfico
          científico foi gerado.
        </p>
        <span className="badge">
          {view === "bars" ? "Barras" : "Linhas"} · aguardando dados
        </span>
      </div>
      <ul className="comparison-sites" aria-label="Locais em comparação">
        {sites.map((site, index) => (
          <li key={site.id}>
            <span className="site-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            {site.name}
            <span>Sem resultados</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
