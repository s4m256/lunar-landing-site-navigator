# SPA-10 — Correções da auditoria científica: pendências e propostas

Proposta para revisão de Samuel Santiago (responsável pela SPA-10), na branch local `fix/spa-10-science-audit-corrections`. Base: auditoria SPA-9 (`docs/audit/scientific-audit-main.md`, branch `docs/spa-9-scientific-audit`, commit `0006025`).

Ambiente desta rodada: `ssd.jpl.nasa.gov`, `naif.jpl.nasa.gov`, `pds-geosciences.wustl.edu` e `ntrs.nasa.gov` bloqueados (HTTP 403 no proxy). Nenhum dataset, relatório ou número em `outputs/` ou `frontend/src/data/` foi regenerado ou editado. `contracts/*.schema.json`, `frontend/` e a CI não foram alterados.

## 1. O dataset commitado não reflete o código desta branch

As mudanças só aparecem depois de regenerar o dataset em um ambiente com acesso a NAIF, PDS e Horizons. Até lá, o dataset commitado continua com:

- `provenance.ephemeris.engine = "NAIF SPICE (spiceypy) cross-checked with Skyfield"`: alegação sem suporte, porque a checagem nunca rodou.
- `horizons_validation.status = "verified"` sem tolerância e sem resposta bruta retida.
- Nomes de relay sem o rótulo de hipotético, e limitações sem a janela sazonal.
- PSR com dois critérios. Exemplo concreto: em `slater_plain`, o nó `(row 0, col 3)`, a 1118 m do centro, tem `is_psr = true`, mas o centro reporta `psr_distance_m = 4876.5` e os outros nós, de 3546,8 a 6243,4 m.
- 24 nós com declividade acima de 12°, pontuando de 18,5 a 53,2.
- O sentinela 5200 m em `de_gerlache_rim_2` (centro e 25 nós), que hoje recebe 19,2 pontos de ciência, ou 2,88 pontos no total.

Dois testes `xfail(strict=True)` em `tests/test_navigator.py` registram essa dívida. Eles passam a falhar como XPASS quando o dataset for regenerado corretamente, para que o marcador seja removido.

### Passos de regeneração (ambiente com rede)

1. `lunar-science fetch-navigator-data`. Confere os SHA-256 fixados; os do DEM, de `naif0012.tls`, de `pck00010.tpc` e de `de421.bsp` nunca foram conferidos nos ambientes de agentes.
2. `lunar-science precompute-navigator`, mantendo a janela padrão para comparar com o dataset atual. Opcionalmente, uma segunda execução com `--end-utc 2027-11-15T00:00:00Z` para estatísticas anuais. O caminho de saída é fixo, então essa execução precisa de outro diretório ou de uma flag nova.
3. Commitar `outputs/validation/horizons_cross_validation.json` junto com `outputs/validation/horizons_raw/`. Conferir no cabeçalho retido a versão da efeméride, o raio do sítio e a convenção de coordenadas. Os parâmetros `EXTRA_PREC='YES'` e `APPARENT='AIRLESS'` foram adicionados sem teste contra o serviço real. Se o formato mudar, o parser falha com erro explícito (não com `skipped_network_unavailable`).
4. Remover os dois `xfail` de `tests/test_navigator.py`. Se a janela mudar, regenerar a fixture (seção 4).
5. Tempo extra esperado: a malha de PSR passou a usar a mesma amostragem do flag (1°, 80 m, 120 km). Em DEM sintético, aqui, isso deu cerca de 0,1 s por horizonte, ou cerca de 34 s por sítio e 6 min para os 10. Para engrossar a malha, use `psr_lattice_az_step_deg` e `psr_lattice_ray_step_m`; isso volta a quebrar a consistência.

Efeitos esperados que não podem ser projetados aqui, porque dependem do DEM: `is_psr` e `psr_distance_m` de todos os pontos. O critério mudou: envoltória −1,591° em vez de −1,543°, raio solar 0,272° nos dois usos, observador de 2 m nos dois usos, malha simétrica e nós marcados incluídos. Os números derivados de PSR também mudam. Não estimei esses valores.

## 2. Mudanças de contrato propostas (não aplicadas)

`navigator-dataset.v1.schema.json` usa `additionalProperties: false` em todos os objetos e fixa `schema_version: "1.0.0"`. Por isso, nada abaixo cabe sem nova versão. Proposta: `1.1.0` aditiva, atualizando juntos o schema, `science/src/lunar_science/schemas/`, os tipos em `frontend/src/navigator/types.ts`, o produtor e os testes. Nesta rodada, tudo foi acomodado em campos de texto livre (`status`, `engine`, `notes`, `limitations`, `name`, `description`).

```jsonc
// provenance.horizons_validation (adicionar; status passa a enum)
"status": { "enum": ["verified", "failed", "skipped_network_unavailable", "not_requested"] },
"tolerance_deg": { "type": ["number", "null"], "exclusiveMinimum": 0 },
"sample_count": { "type": ["integer", "null"], "minimum": 0 },
"raw_responses": { "type": "array", "items": { "type": "object", "additionalProperties": false,
  "required": ["target_command", "request_url", "retrieved_utc", "response_file", "response_sha256"],
  "properties": { "target_command": {"type": "string"}, "request_url": {"type": "string"},
    "retrieved_utc": {"type": "string"}, "response_file": {"type": "string"},
    "response_sha256": {"type": "string", "pattern": "^[0-9a-f]{64}$"} } } }

// mission_window (adicionar)
"seasonal_coverage": { "type": "object", "additionalProperties": false,
  "required": ["duration_days", "subsolar_lat_min_deg", "subsolar_lat_max_deg", "covers_seasonal_cycle"],
  "properties": { "duration_days": {"type": "number"}, "subsolar_lat_min_deg": {"type": "number"},
    "subsolar_lat_max_deg": {"type": "number"}, "covers_seasonal_cycle": {"type": "boolean"} } }

// center.psr_distance_m e local_grid.nodes[].psr_distance_m (alterar: null = nenhum PSR no raio)
"psr_distance_m": { "type": ["number", "null"], "minimum": 0 }

// provenance.conventions (adicionar)
"slope_baseline_m": { "type": "number", "exclusiveMinimum": 0 },
"psr_search_radius_m": { "type": "number", "exclusiveMinimum": 0 },
"psr_lattice_step_m": { "type": "number", "exclusiveMinimum": 0 },
"psr_subsolar_lat_extreme_deg": { "type": "number" },
"psr_solar_radius_deg": { "type": "number", "exclusiveMinimum": 0 },
"score_is_illustrative": { "const": true }

// engineering_summary.score (adicionar)
"eliminated": { "type": "boolean" },
"elimination_reasons": { "type": "array", "items": { "type": "string" } },
"total_without_relay_0_100": { "type": "number", "minimum": 0, "maximum": 100 }

// definitions.relaySpec (adicionar)
"hypothetical": { "type": "boolean" },
"source": { "type": "string" }

// sites[] (adicionar)
"coordinates_source": { "type": "string", "minLength": 1 }
```

Também é necessário (auditoria, item 6) acrescentar a declividade máxima e um percentil na área de pouso de cada sítio, porque a declividade pontual na base de 160 m não representa o terreno do pouso. Essa métrica ainda não foi implementada.

## 3. Frontend (anotado, não editado)

Os pesos e fórmulas estão duplicados em `frontend/src/navigator/math.ts`. Com esta branch, Python e TypeScript divergem nos pontos abaixo.

- `computeCompositeScore`:
  - Declividade acima de `provenance.conventions.clps_slope_limit_deg` deve zerar `total_0_100` e `safety_slope_0_100`. Hoje, por exemplo, 13° rende 15,4 pontos de segurança.
  - Sem PSR no raio (`!isPsr && psrDistanceM >= 5200`, ou `null` após a mudança de contrato), `sciencePsr` deve ser 0. Hoje o sentinela rende 19,2.
- `interpolateLocalGrid`: interpola `psr_distance_m` bilinearmente, misturando o sentinela com distâncias reais. Quando algum dos quatro nós for sentinela, tratar a distância como desconhecida.
- Rótulos de interface:
  - Landing Score como "índice ilustrativo (pesos sem fonte)".
  - Relays como "hipotéticos".
  - Janela como "30 dias de verão austral (melhor estação)".
  - Mostrar o score sem relay ao lado do score com relay. O termo de comunicação satura em 65 pontos ou mais em todos os sítios.
- `App.tsx:111` e `SiteComparisonPanel.tsx:325-337` exibem `horizons_validation.status` e `ephemeris.engine` direto do dataset. Com o dataset commitado, a interface mostra "verified" e "cross-checked with Skyfield", que não têm suporte. Até a regeneração, mostrar algo como "comparação Horizons não reproduzida". Depois dela, `failed` precisa ficar visível.
- `evaluateLiveSite` repete o limite de alcance de 12000 km e a máscara de 5° do ELFO. Convém ler esses valores de `relay_presets`.
- Sugestão: um teste de paridade Python × TypeScript sobre uma tabela de casos compartilhada (por exemplo, um JSON em `contracts/examples/`), cobrindo eliminação por declividade e sentinela de PSR.

## 4. Testes e CI

- Os testes novos rodam na CI sem rede, sem kernels e sem dependências novas:
  - `tests/test_ephemeris_regression.py`: fixture DE421 independente.
  - `tests/test_horizons_validation.py`, `tests/test_psr_slope_score.py` e `tests/test_pipeline_synthetic.py`: stubs sintéticos.
- Para regenerar a fixture (não roda na CI; usa só o PyPI):
  ```sh
  pip download --no-deps -d /tmp/k skyfield-data==7.0.0 lunarsky==1.0.1.post2
  # extrair skyfield_data/data/de421.bsp, lunarsky/data/pck/moon_pa_de421_1900-2050.bpc
  # e lunarsky/data/fk/satellites/moon_080317.tf (o script confere os SHA-256)
  python -I science/tests/fixtures/generate_independent_de421_reference.py \
    --spk de421.bsp --bpc moon_pa_de421_1900-2050.bpc --fk moon_080317.tf \
    --out science/tests/fixtures/independent_de421_reference.json
  ```
- Kernels via PyPI, conferidos em 2026-11-15:
  - `lunarsky==1.0.1.post2` traz `moon_080317.tf`, `moon_assoc_me.tf` e `moon_pa_de421_1900-2050.bpc`, com SHA-256 iguais aos fixados.
  - `skyfield-data==7.0.0` traz `de421.bsp` com outro SHA-256 (`a20a7139…`).
  - Nenhum dos dois traz `naif0012.tls` nem `pck00010.tpc`.
  - Por isso, `SpiceLunarEphemeris` (que exige os 6 kernels fixados) continua sem rodar na CI. Os testes que dependem dele são pulados.
  - Para rodá-los na CI seria preciso um cache de kernels preenchido por um job com acesso à NAIF. É uma mudança de CI que precisa de decisão da equipe.
- Checagens feitas nesta rodada, fora da suíte (scripts descartáveis, não versionados):
  - CSPICE (spiceypy 8.0.0), com FK/BPC do `lunarsky`, SPK do `skyfield-data` e ET pela fórmula do LSK, reproduz as colunas `spice_*` do artefato commitado em até 6,4e-6° (limite do arredondamento de 5 casas). As colunas `horizons_*` diferem até 3,9e-5°, como na auditoria.
  - A fixture independente e o CSPICE, com as mesmas entradas, concordam em até 2,8e-9° (Sol) e 8,3e-8° (Terra). A matriz PA→ME é idêntica.
  - A série `sky_series` commitada e a fixture concordam em até 0,0005°, que é o arredondamento de 3 casas, em 10 sítios e 121 instantes.
  - A latitude subsolar na janela commitada vai de −1,5570° a −1,3717°. O extremo do ciclo 2026–27 é −1,5573°, em 2026-11-14. Em 1900–2050, os extremos são −1,5903° (1927-03-19) e +1,5891°. O período sazonal medido em 2000–2030 é 346,62 ± 0,55 d, o ano de eclipses.

## 5. Itens da auditoria não feitos nesta rodada

| Item | Por quê |
| --- | --- |
| Reexecutar Horizons, regenerar dataset e iluminação anual | Hosts bloqueados. O código já suporta janela configurável e rotula a cobertura. |
| Score com e sem relay no dataset | Exige mudança de contrato (seção 2). Por enquanto, só nos relatórios CSV/MD. |
| Declividade máxima/percentil na área de pouso | Exige contrato novo e DEM para validar. |
| Flag para raios fora da grade (`compute_horizon_profile`) | Fora das prioridades 1–7 desta tarefa. Está documentado na docstring. |
| Passo de amostragem do relay abaixo de 1 h | Só documentado em `limitations`: o blackout tem resolução de 1 h e há aliasing na série `lro_visible`. |
| Reconciliar com o motor dos PRs #4/#5 (`IAU_MOON`, `CN+S`) | Fora do escopo. Hoje existem dois motores com convenções diferentes. |
| Coordenadas dos sítios | Não há fonte para substituí-las. As descrições que contradiziam o DEM foram corrigidas ("Peak near Cabeus B" a −163 m; "Slater Plain" a −349 m, antes descrita como "elevada"). As coordenadas continuam as mesmas. |
| Mensagem do placeholder `science-status` ("Aguardando implementação científica pela equipe.") | Mudá-la exige editar `contracts/examples/science-status.json`, que o frontend testa. Proposta: "Sem serviço de análise sob demanda; o navegador usa o dataset pré-computado navigator-dataset.v1." |
| Contradições em `AGENTS.md` ("Esta base não implementa ciência", "Nunca versione artefatos gerados", "não faça push de funcionalidades em main") | Arquivo de governança. Não editei; precisa de decisão humana. |

## 6. Decisões tomadas nesta branch que pedem revisão

- **Tolerância Horizons de 0,001°.** É um limiar de produto, justificado pela sensibilidade a jusante (menos de 0,4 % do raio solar; cerca de 1/40 de um pixel do DEM visto a 120 km). Não é uma alegação de exatidão de nenhuma das efemérides.
- **HTTP 403, 407, 408, 429 e 5xx contam como "rede indisponível".** O proxy dos agentes responde 403 para hosts bloqueados. Qualquer outro código HTTP é tratado como rejeição da consulta e aborta a execução.
- **Envoltória de PSR.** Usa a latitude subsolar extrema do DE421 em 1900–2050 (−1,591°) e o raio solar máximo (0,272°), com o horizonte calculado a 2 m de altura, e não ao nível do solo. Isso torna a classificação PSR mais restritiva do que a anterior.
- **Sentinela de PSR sem crédito.** Sem PSR no raio de busca, o termo de ciência do score vale 0. A alternativa seria dar o valor do score no raio de busca, um limite superior otimista.
- **Declividade eliminatória acima de 12°.** O limite é o mesmo `clps_slope_limit_deg` já publicado, e continua sem fonte.
