import React from 'react';
import { formatNumber } from './format';
import { PSR_NOT_FOUND_MARKER_M } from './math';
import { formatStep, formatUtc, spanDays } from './timeWindow';
import { NavigatorDatasetV1 } from './types';

interface ProvenancePanelProps {
  dataset: NavigatorDatasetV1;
  /** Link to the exact file the page reads. */
  datasetUrl?: string;
}

/**
 * File reviewed by the internal scientific audit SPA-9 (docs/audit/scientific-audit-main.md).
 * The audit findings quoted below apply to this file; another file gets a warning instead.
 */
export const AUDITED_FILE_GENERATED_UTC = '2026-11-14T15:52:49Z';

const declared = (v: number | null | undefined) => (v == null ? 'não informado' : `${formatNumber(v, 5)}°`);

/**
 * Always-visible provenance and limitations. Text under "O que o arquivo declara" is echoed
 * from the file and marked as such; this page makes no validation claim of its own.
 */
export const ProvenancePanel: React.FC<ProvenancePanelProps> = ({ dataset, datasetUrl }) => {
  const { provenance, mission_window: mw, relay_presets: relays } = dataset;
  const hv = provenance.horizons_validation;
  const last = mw.timestamps_utc.length - 1;
  const firstUtc = formatUtc(mw.timestamps_utc[0]);
  const lastUtc = formatUtc(mw.timestamps_utc[last]);
  const isAuditedFile = dataset.generated_utc === AUDITED_FILE_GENERATED_UTC;

  return (
    <section id="proveniencia" className="panel provenance-panel" aria-labelledby="proveniencia-titulo" tabIndex={-1}>
      <h2 id="proveniencia-titulo">Origem e limitações dos dados</h2>

      <p className="callout">
        <strong>Esta página não valida os dados.</strong> Ela lê um arquivo pré-calculado, confere se o formato e o
        alinhamento das séries estão corretos e faz cálculos geométricos simples. O que o arquivo diz sobre comparações
        e validações é repetido abaixo como declaração do arquivo, não como fato confirmado.
      </p>

      <h3>Período coberto pelos dados</h3>
      <p>
        De <strong>{firstUtc}</strong> a <strong>{lastUtc}</strong> ({spanDays(mw.timestamps_utc[0], mw.timestamps_utc[last])}{' '}
        dias), {mw.timestamps_utc.length} instantes, um a cada {formatStep(mw.step_seconds)}, para {dataset.sites.length}{' '}
        locais. Não há dados para outras datas, horários ou locais. O arquivo também registra um mês sinódico de{' '}
        {formatNumber(mw.synodic_period_days, 2)} dias; o período coberto não é igual a ele.
      </p>

      <h3>Limitações conhecidas</h3>
      {isAuditedFile ? (
        <p className="field-help">
          Itens marcados com “auditoria” vêm do relatório de auditoria científica interna SPA-9, feito sobre este mesmo
          arquivo (gerado em {formatUtc(dataset.generated_utc)}).
        </p>
      ) : (
        <p className="caveat">
          Atenção: este arquivo (gerado em {formatUtc(dataset.generated_utc)}) não é o arquivo revisado pela auditoria
          científica SPA-9 ({formatUtc(AUDITED_FILE_GENERATED_UTC)}). Os itens marcados com “auditoria” podem não se
          aplicar a ele.
        </p>
      )}
      <ul className="limitations-list">
        <li>
          <strong>Validação contra o JPL Horizons não confirmada</strong> (auditoria). A consulta provavelmente
          aconteceu, mas a resposta bruta não foi guardada, e o gerador grava o rótulo de status sem nenhum critério de
          tolerância. Não use esse rótulo como prova de validação.
        </li>
        <li>
          <strong>
            “<span lang="en">cross-checked with Skyfield</span>” não é evidência
          </strong> (auditoria). É um texto fixo do gerador; a
          checagem correspondente só existe num teste que é pulado quando faltam os arquivos de efemérides, inclusive
          na integração contínua.
        </li>
        <li>
          <strong>Índice ilustrativo</strong> (auditoria). Pesos e limites não têm fonte nem análise de sensibilidade.
          Com o cenário de retransmissores incluído, a parte de linha de visada fica alta para todos os locais por causa
          de uma constelação hipotética.
        </li>
        <li>
          <strong>Retransmissores hipotéticos</strong> (auditoria). A constelação de 3 satélites, o satélite único e a
          órbita polar de 50 km são cenários modelados com fases iniciais arbitrárias; a de 50 km não é a órbita real do
          LRO, que não é um satélite retransmissor. Com um instante a cada {formatStep(mw.step_seconds)}, intervalos mais
          curtos não aparecem, e a série da órbita de 50 km (período de {formatNumber(relays.lro.period_hours, 1)} h)
          tem aliasing; só o resumo dessa órbita no arquivo usa passo de 5 min.
        </li>
        <li>
          <strong>Luz do Sol só para este período.</strong> Médias do disco solar acima do relevo e os maiores intervalos
          com o disco abaixo do relevo valem para {firstUtc} a {lastUtc}.
          {isAuditedFile &&
            ' Segundo a auditoria, esse período fica perto do verão do hemisfério sul da Lua, o melhor caso de iluminação do ano; não representa o local ao longo do ano.'}
        </li>
        <li>
          <strong>Declive</strong> (auditoria). Calculado numa base de 160 m, pode subestimar o declive na escala de um
          módulo de pouso. O limite de {formatNumber(provenance.conventions.clps_slope_limit_deg, 0)}° gravado no arquivo
          não tem fonte e não entra no índice.
        </li>
        <li>
          <strong>Sombra permanente</strong> (auditoria). O sinal “dentro” e a distância usam critérios diferentes no
          gerador. Quando a busca não encontra nada, o arquivo grava {PSR_NOT_FOUND_MARKER_M} m; esta página mostra
          “nenhuma encontrada”, mas o índice usa o número.
        </li>
        <li>
          <strong>Cálculos desta página.</strong> Fora do centro de cada local, o relevo é interpolado entre pontos da
          grade do arquivo e as posições do Sol e da Terra são as do centro; a visibilidade dos retransmissores não
          existe para esses pontos e aparece como “sem dado”. Potência e energia usam um modelo simples (irradiância,
          área, eficiência, parte do disco solar acima do relevo e inclinação do painel), sem temperatura, poeira ou
          desgaste.
        </li>
        <li>
          Nenhum resultado indica que um local é seguro para pouso, nem garante energia ou comunicação. A
          acessibilidade foi verificada só com testes automáticos, ainda não com pessoas.
        </li>
      </ul>

      <h3>O que o arquivo declara</h3>
      <p className="field-help">
        Textos entre aspas foram copiados do arquivo, em inglês, e não foram conferidos por esta página.
      </p>
      <dl className="prov-list">
        <dt>Arquivo</dt>
        <dd>
          Gerado em {formatUtc(dataset.generated_utc)}; versão do contrato {dataset.schema_version}.{' '}
          {datasetUrl && (
            <a href={datasetUrl} download>
              Baixar o arquivo de dados usado nesta página (JSON)
            </a>
          )}
        </dd>

        <dt>Modelo de relevo</dt>
        <dd>
          <span lang="en">{provenance.dem_product.product_id}</span>, {provenance.dem_product.resolution_m} m por pixel;
          horizonte calculado até {formatNumber(provenance.dem_product.ray_max_distance_m / 1000, 0)} km, a cada{' '}
          {provenance.dem_product.azimuth_step_deg}° de direção. O arquivo do relevo não está no repositório e seu código
          de integridade não foi conferido.{' '}
          <a href={provenance.dem_product.url} rel="noreferrer">
            Endereço do produto informado no arquivo
          </a>
          .
        </dd>

        <dt>Posições do Sol e da Terra</dt>
        <dd>
          Motor: <q lang="en">{provenance.ephemeris.engine}</q>; referencial <span lang="en">{provenance.ephemeris.frame}</span>;
          correção {provenance.ephemeris.correction}.
        </dd>

        <dt>Comparação com o JPL Horizons, segundo o arquivo</dt>
        <dd>
          Rótulo gravado: <q lang="en">{hv.status}</q> (sem critério de tolerância; ver limitações). Diferenças máximas
          declaradas: Sol, direção {declared(hv.max_sun_az_diff_deg)} e elevação {declared(hv.max_sun_el_diff_deg)};
          Terra, direção {declared(hv.max_earth_az_diff_deg)} e elevação {declared(hv.max_earth_el_diff_deg)}.
          {hv.notes.length > 0 && (
            <ul>
              {hv.notes.map((note, i) => (
                <li key={i}>
                  <q lang="en">{note}</q>
                </li>
              ))}
            </ul>
          )}
        </dd>

        <dt>Retransmissores (cenários hipotéticos)</dt>
        <dd>
          <ul>
            {[relays.elfo_constellation, relays.elfo_pathfinder, relays.lro].map((r) => (
              <li key={r.name}>
                <q lang="en">{r.name}</q>: {r.satellites_count} satélite(s), período {formatNumber(r.period_hours, 2)} h,
                altitude de {formatNumber(r.perilune_alt_km, 0)} a {formatNumber(r.apolune_alt_km, 0)} km.
              </li>
            ))}
          </ul>
        </dd>

        <dt>Convenções</dt>
        <dd>
          <ul lang="en">
            <li>{provenance.conventions.azimuth_deg}</li>
            <li>{provenance.conventions.elevation_deg}</li>
            <li>{provenance.conventions.latitude_type}</li>
            <li>{provenance.conventions.longitude_convention}</li>
          </ul>
        </dd>

        <dt>Limitações declaradas no arquivo</dt>
        <dd>
          <ul lang="en">
            {provenance.limitations.map((lim, i) => (
              <li key={i}>{lim}</li>
            ))}
          </ul>
        </dd>
      </dl>
      <p>
        <a href={`${import.meta.env.BASE_URL}third-party-licenses.txt`}>
          Licenças do código de terceiros incluído nesta página (React, Ajv e dependências)
        </a>
        .
      </p>
      <details>
        <summary>Arquivos de origem e códigos de integridade (SHA-256) declarados</summary>
        <ul className="hash-list">
          <li>
            Relevo: <code>{provenance.dem_product.sha256}</code>
          </li>
          {provenance.ephemeris.kernels.map((k) => (
            <li key={k.filename}>
              {k.filename}: <code>{k.sha256}</code>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
};
