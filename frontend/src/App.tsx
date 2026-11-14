import { useRef, useState, type FormEvent } from "react";
import example from "../../contracts/examples/science-status.json";
import { parseScienceStatus } from "./contract";
import { LunarMap } from "./LunarMap";
import { ComparisonChart } from "./ComparisonChart";
import { validateSite, type PlanningSite } from "./planning";

const status = parseScienceStatus(example);

export function App() {
  const [sites, setSites] = useState<PlanningSite[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [error, setError] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const nextId = useRef(1);
  const nameInput = useRef<HTMLInputElement>(null);
  const invalidDates = Boolean(start && end && end < start);
  const selected = sites.filter((site) => selectedIds.includes(site.id));

  function toggle(id: number) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
  function addSite(event: FormEvent) {
    event.preventDefault();
    const message = validateSite(name, latitude, longitude);
    if (message) {
      setError(message);
      return;
    }
    const id = nextId.current++;
    setSites((current) => [
      ...current,
      {
        id,
        name: name.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
      },
    ]);
    setSelectedIds((current) => [...current, id]);
    setName("");
    setLatitude("");
    setLongitude("");
    setError("");
    nameInput.current?.focus();
  }
  function removeSite(id: number) {
    setSites((current) => current.filter((site) => site.id !== id));
    setSelectedIds((current) => current.filter((value) => value !== id));
  }
  return (
    <>
      <header className="header">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            ◒
          </span>
          <span>
            LUNAR<span className="brand-sub">LANDING SITE NAVIGATOR</span>
          </span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#explore">Explorar</a>
          <a href="#comparison-title">Comparar</a>
        </nav>
        <span className="header-tag">SPACE APPS 2026</span>
      </header>
      <main id="top">
        <section className="hero" aria-labelledby="title">
          <div>
            <p className="eyebrow">
              <span className="live-dot" /> PLANEJAMENTO LUNAR / BASE DE
              DESENVOLVIMENTO
            </p>
            <h1 id="title">
              Lunar Landing Site Navigator<span>Seu próximo horizonte.</span>
            </h1>
            <p className="hero-copy">
              Organize locais, explore coordenadas e prepare uma nova
              perspectiva sobre a Lua.
            </p>
          </div>
          <div className="moon" aria-hidden="true" />
          <span className="moon-label">LUA / ILUSTRAÇÃO</span>
        </section>
        <aside className="notice">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>Uma base para explorar. Ciência em construção.</strong>
            <p role="status">Ainda não implementado — {status.message}</p>
            <small>
              Exemplo local do contrato {status.schema_version}. Nenhum cálculo
              ou dado científico.
            </small>
          </div>
        </aside>
        <div className="workspace" id="explore">
          <aside className="panel planner" aria-label="Planejamento de locais">
            <p className="eyebrow">01 / PLANEJAR</p>
            <h2>Defina sua exploração</h2>
            <p className="muted">
              Entradas locais de planejamento, informadas por você. Não são
              candidatos validados.
            </p>
            <form onSubmit={addSite} noValidate>
              <h3>Adicionar local</h3>
              <label htmlFor="site-name">Nome do local</label>
              <input
                id="site-name"
                ref={nameInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Ex.: ponto de interesse A"
                required
                aria-describedby={error ? "site-error" : undefined}
              />
              <div className="coordinate-fields">
                <div>
                  <label htmlFor="latitude">Latitude (°)</label>
                  <input
                    id="latitude"
                    type="number"
                    min="-90"
                    max="90"
                    step="any"
                    placeholder="−90 a 90"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="longitude">Longitude (°)</label>
                  <input
                    id="longitude"
                    type="number"
                    min="-180"
                    max="180"
                    step="any"
                    placeholder="−180 a 180"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    required
                  />
                </div>
              </div>
              <p className="field-help">
                Convenção visual: norte e leste positivos. Confirme a referência
                das suas coordenadas antes de utilizá-las.
              </p>
              {error && (
                <p id="site-error" role="alert" className="error">
                  {error}
                </p>
              )}
              <button className="primary" type="submit">
                + Adicionar local
              </button>
            </form>
            <div className="site-list">
              <h3>
                Seus locais <span className="count">{sites.length}</span>
              </h3>
              {sites.length === 0 ? (
                <p className="muted">Nenhum local adicionado.</p>
              ) : (
                <ul>
                  {sites.map((site) => (
                    <li key={site.id}>
                      <label className="site-check">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(site.id)}
                          onChange={() => toggle(site.id)}
                        />
                        <span>
                          <strong>{site.name}</strong>
                          <small>
                            {site.latitude}°, {site.longitude}°
                          </small>
                        </span>
                      </label>
                      <button
                        className="remove"
                        onClick={() => removeSite(site.id)}
                        aria-label={`Remover ${site.name}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <fieldset className="dates">
              <legend>Intervalo de planejamento</legend>
              <label htmlFor="start">Data inicial</label>
              <input
                id="start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <label htmlFor="end">Data final</label>
              <input
                id="end"
                type="date"
                min={start || undefined}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                aria-invalid={invalidDates}
                aria-describedby={invalidDates ? "date-error" : undefined}
              />
              {invalidDates && (
                <p id="date-error" role="alert" className="error">
                  A data final deve ser igual ou posterior à inicial.
                </p>
              )}
              <p className="field-help">
                As datas organizam o planejamento; não calculam condições
                lunares.
              </p>
            </fieldset>
          </aside>
          <div className="visuals">
            <section className="panel map-panel" aria-labelledby="map-title">
              <div className="section-top">
                <div>
                  <p className="eyebrow">VISÃO GEOGRÁFICA</p>
                  <h2 id="map-title">Explore seus pontos</h2>
                </div>
                <span className="badge">{selected.length} selecionados</span>
              </div>
              <LunarMap
                sites={sites}
                selectedIds={selectedIds}
                onToggle={toggle}
              />
              <p className="map-note">
                Mapa esquemático de coordenadas • Sem imagem orbital, relevo ou
                avaliação de pouso. Pontos próximos podem se sobrepor; use a
                lista para selecioná-los.
              </p>
            </section>
            <ComparisonChart sites={selected} />
          </div>
        </div>
        <footer>
          <span>◒ LUNAR / EXPLORAR COMEÇA COM PERGUNTAS.</span>
          <span>Rascunho temporário · não é salvo ao recarregar</span>
        </footer>
      </main>
    </>
  );
}
