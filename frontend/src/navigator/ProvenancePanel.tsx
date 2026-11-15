import React from 'react';
import { formatNumber } from './format';
import { formatStep, formatUtc, spanDays } from './timeWindow';
import { HorizonsValidationProvenance, NavigatorDatasetV1 } from './types';

interface ProvenancePanelProps {
  dataset: NavigatorDatasetV1;
  /** Link to the exact file the page reads. */
  datasetUrl?: string;
}

/**
 * SHA-256 of the 1.0.0 file reviewed by the internal scientific audit SPA-9
 * (docs/audit/scientific-audit-main.md; outputs/datasets copy at main 23cc0c7). A file migrated
 * from it records this value in provenance.migration.source_sha256, so the audit findings quoted
 * below apply to it; any other file gets a warning instead.
 */
export const AUDITED_SOURCE_SHA256 = '27c73ed24ff3b8e100556ac2eebbd4d0ef8fbbd48f28b6da34457dfb18710954';

const declared = (v: number | null | undefined) => (v == null ? 'não informado' : `${formatNumber(v, 5)}°`);

/** Plain-language meaning of the contract 1.1.0 Horizons status; never stronger than the status. */
export function horizonsStatusText(hv: HorizonsValidationProvenance): string {
  const tolerance = hv.tolerance_deg == null ? null : `${formatNumber(hv.tolerance_deg, 4)}°`;
  const samples = hv.sample_count == null ? 'instantes não informados' : `${hv.sample_count} instantes`;
  switch (hv.status) {
    case 'unverified_no_raw_response':
      return 'Comparação não confirmada: o arquivo registra uma comparação do gerador antigo, mas não guarda a resposta bruta do Horizons nem um critério de tolerância, e ela não foi reproduzida.';
    case 'verified':
      return `Segundo o arquivo, todas as diferenças ficaram dentro da tolerância declarada de ${tolerance ?? 'valor não informado'} (${samples}), com as respostas brutas guardadas no repositório. Compara só as direções do Sol e da Terra em um local.`;
    case 'failed':
      return `Segundo o arquivo, ao menos uma diferença ficou fora da tolerância declarada de ${tolerance ?? 'valor não informado'} (${samples}).`;
    case 'skipped_network_unavailable':
      return 'Comparação não realizada: o serviço do JPL Horizons não pôde ser contatado quando o arquivo foi gerado.';
    case 'not_requested':
      return 'Comparação não realizada: foi desligada quando o arquivo foi gerado.';
  }
}

/** The 1.0.0 file claimed a Skyfield cross-check that never ran; the 1.1.0 migration removed it. */
function skyfieldLabelRemoved(dataset: NavigatorDatasetV1): boolean {
  return (dataset.provenance.migration?.replaced ?? []).some(
    (r) => r.path === '/provenance/ephemeris/engine' && typeof r.from === 'string' && r.from.includes('Skyfield'),
  );
}

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
  const migration = provenance.migration;
  const isAuditedFile = migration?.source_sha256 === AUDITED_SOURCE_SHA256;
  const coverage = mw.seasonal_coverage;
  const conv = provenance.conventions;
  const psrRadius = conv.psr_search_radius_m === undefined ? null : `${formatNumber(conv.psr_search_radius_m / 1000, 1)} km`;

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
        {coverage &&
          (coverage.covers_seasonal_cycle
            ? ' Segundo o arquivo, o período cobre ao menos um ciclo de estações da Lua.'
            : ' Segundo o arquivo, o período é mais curto que um ciclo de estações da Lua (cerca de 346,6 dias): os valores valem só para essa época do ano.')}
        {coverage && coverage.subsolar_lat_min_deg !== null && coverage.subsolar_lat_max_deg !== null && (
          <>
            {' '}
            Latitude do ponto subsolar no período: de {formatNumber(coverage.subsolar_lat_min_deg, 3)}° a{' '}
            {formatNumber(coverage.subsolar_lat_max_deg, 3)}°.
          </>
        )}
      </p>

      <h3>Limitações conhecidas</h3>
      {isAuditedFile ? (
        <p className="field-help">
          Itens marcados com “auditoria” vêm do relatório de auditoria científica interna SPA-9, feito sobre a versão
          1.0.0 deste mesmo arquivo (gerado em {formatUtc(dataset.generated_utc)}), da qual esta versão foi migrada sem
          recalcular números.
        </p>
      ) : (
        <p className="caveat">
          Atenção: este arquivo (gerado em {formatUtc(dataset.generated_utc)}) não é o arquivo revisado pela auditoria
          científica SPA-9. Os itens marcados com “auditoria” podem não se aplicar a ele.
        </p>
      )}
      <ul className="limitations-list">
        <li>
          <strong>Comparação com o JPL Horizons</strong>
          {hv.status === 'unverified_no_raw_response' && isAuditedFile ? ' (auditoria)' : ''}. {horizonsStatusText(hv)}{' '}
          {hv.status === 'unverified_no_raw_response' &&
            'Não use a comparação registrada como prova de validação: o gerador antigo gravava o rótulo de sucesso sem critério de tolerância.'}
        </li>
        {skyfieldLabelRemoved(dataset) && (
          <li>
            <strong>Sem conferência com o Skyfield</strong>
            {isAuditedFile ? ' (auditoria)' : ''}. A versão 1.0.0 do arquivo dizia que as posições foram conferidas com
            o Skyfield; essa conferência nunca rodou (só existe num teste pulado sem os arquivos de efemérides) e o
            texto foi retirado na migração para a versão 1.1.0.
          </li>
        )}
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
          <strong>Declive</strong> (auditoria). Calculado numa base de{' '}
          {formatNumber(conv.slope_baseline_m ?? 2 * provenance.dem_product.resolution_m, 0)} m, pode subestimar o declive
          na escala de um módulo de pouso. O limite de {formatNumber(conv.clps_slope_limit_deg, 0)}° gravado no arquivo não
          tem fonte; acima dele esta página dá índice 0 ao ponto.
          {migration &&
            ' Os índices gravados no arquivo seguem a regra antiga e não foram zerados; esta página não os usa.'}
        </li>
        <li>
          <strong>Sombra permanente</strong>
          {migration ? ' (auditoria)' : ''}.{' '}
          {migration
            ? 'O sinal “dentro” e a distância usam critérios diferentes no gerador da versão 1.0.0.'
            : 'O sinal “dentro” e a distância usam o mesmo critério do gerador.'}{' '}
          Quando a busca {psrRadius ? `(até ${psrRadius} do centro) ` : ''}não encontra nada, a distância fica sem valor no
          arquivo: esta página mostra “nenhuma encontrada” e o índice não dá pontos de proximidade.
          {migration &&
            ` Antes da versão 1.1.0, o arquivo gravava ${formatNumber(migration.psr_sentinel_nulled.value_m, 0)} m nesses casos, como se fosse uma distância.`}
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

        {migration && (
          <>
            <dt>Migração de versão</dt>
            <dd>
              Convertido da versão {migration.from_schema_version} do contrato por <code>{migration.tool}</code> (versão{' '}
              {migration.tool_version}) sem recalcular números: rótulos trocados, metadados acrescentados e{' '}
              {migration.psr_sentinel_nulled.count} distâncias de sombra permanente que eram o valor de “nada encontrado”
              passaram a ficar sem valor. Os índices gravados no arquivo seguem a regra {migration.stored_scores_rule};
              esta página recalcula o índice com a regra atual. Código de integridade (SHA-256) da versão{' '}
              {migration.from_schema_version}: <code>{migration.source_sha256}</code>.
            </dd>
          </>
        )}

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
          Rótulo gravado: <code>{hv.status}</code>. {horizonsStatusText(hv)} Tolerância declarada:{' '}
          {hv.tolerance_deg == null ? 'nenhuma' : `${formatNumber(hv.tolerance_deg, 4)}°`}; respostas brutas guardadas:{' '}
          {hv.raw_responses?.length ?? 0}. Diferenças máximas declaradas, não conferidas por esta página: Sol, direção{' '}
          {declared(hv.max_sun_az_diff_deg)} e elevação {declared(hv.max_sun_el_diff_deg)}; Terra, direção{' '}
          {declared(hv.max_earth_az_diff_deg)} e elevação {declared(hv.max_earth_el_diff_deg)}.
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
                altitude de {formatNumber(r.perilune_alt_km, 0)} a {formatNumber(r.apolune_alt_km, 0)} km
                {r.hypothetical === true ? '; marcado como hipotético no arquivo' : ''}.
                {r.source && (
                  <>
                    {' '}
                    Fonte declarada: <q lang="en">{r.source}</q>
                  </>
                )}
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
