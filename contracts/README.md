# Contratos de dados

Os JSON Schemas (draft-07) desta pasta são a fonte normativa. Python valida com `jsonschema`, o frontend com Ajv. Toda mudança atualiza juntos: schema (e sua cópia empacotada em `science/src/lunar_science/schemas/`, idêntica byte a byte), esta documentação, exemplos, produtor Python, consumidor TypeScript e os testes dos dois lados (`AGENTS.md`).

| Contrato | Versão | Schema | Exemplo |
| --- | --- | --- | --- |
| Status da CLI (placeholder legado) | 1.0.0 | `science-status.schema.json` | `examples/science-status.json` |
| Dataset pré-computado do navegador | **1.1.0** | `navigator-dataset.v1.schema.json` | `examples/navigator-dataset.synthetic.json` (sintético) e o dataset commitado |
| Modelo do índice ilustrativo | 1.1.0 | `landing-score-model.v1.json` (parâmetros) | `examples/landing-score-parity-cases.json` |

O transporte Python → frontend (artefato JSON estático validado nos dois lados, sem API HTTP) está descrito em [`../docs/integration.md`](../docs/integration.md).

## Status da CLI — versão 1.0.0

| Campo | Tipo | Regra |
| --- | --- | --- |
| `schema_version` | string | Literal `1.0.0` |
| `status` | string | Literal `not_implemented` |
| `message` | string | Texto de apresentação não vazio; não usar para decisões lógicas |

Todos os campos são obrigatórios. Campos extras são rejeitados. Mensagens são objetos JSON em UTF-8. **Este contrato de status** não tem entrada científica, coordenadas, unidades físicas, métricas nem resultados; esses dados ficam no contrato `navigator-dataset`, descrito abaixo. `not_implemented` indica que não existe serviço de análise sob demanda por trás desse status. Não significa análise concluída, falha de análise nem ausência de candidatos, e não descreve o dataset pré-computado do navegador.

O produtor é `python -m lunar_science` sem argumentos (ou `lunar-science`), que escreve um objeto JSON e uma quebra de linha em stdout e termina com código zero. O frontend valida o exemplo com Ajv em teste. Não há comunicação de rede entre os módulos.

## Dataset pré-computado do navegador — versão 1.1.0

O nome do arquivo de schema guarda só a versão principal (`v1`); a versão exata está em `schema_version` (`const`), então cada versão exige atualizar produtor e consumidor juntos. Produtor: `lunar-science precompute-navigator` (`science/src/lunar_science/navigator/pipeline.py`). Consumidor: `frontend/src/contract.ts` (Ajv) seguido das checagens de alinhamento de `frontend/src/navigator/integrity.ts`.

"Validado", neste contrato, significa conformidade com o schema (forma). Não é validação científica.

### Campos, unidades e proveniência

Ângulos em graus. Azimute a partir do norte selenográfico local, sentido horário (`conventions.azimuth_deg`); elevação topocêntrica sobre o plano tangente da esfera de referência de 1 737,4 km; latitude planetocêntrica; longitude leste em [0, 360). Instantes em UTC ISO 8601 com `Z`. Os textos das próprias convenções estão em `provenance.conventions`.

| Bloco | Campos (unidade) | Proveniência e ressalvas |
| --- | --- | --- |
| `provenance.dem_product` | `resolution_m` (m/px), `reference_radius_m` (m), `ray_max_distance_m` (m), `azimuth_step_deg` (°), `coverage_lat_deg` (°), `url`, `sha256` | DEM LRO LOLA `LDEM_80S_80M`. Arquivo fora do repositório; o SHA-256 fixado nunca foi conferido nos ambientes de agentes. |
| `provenance.ephemeris` | `engine`, `frame` (`MOON_ME`), `correction` (`LT+S`), `kernels[]` (`filename`, `url`, `sha256`) | Kernels NAIF com SHA-256 fixado. As séries de Sol e Terra foram reproduzidas por uma referência DE421 independente (`science/tests/test_ephemeris_regression.py`), o que confere implementação e convenções, não o DE421. |
| `provenance.horizons_validation` | `status` (enum), `tolerance_deg` (° ou `null`), `sample_count`, `raw_responses[]`, `max_*_diff_deg` (°), `notes[]` | Comparação de direções de Sol e Terra em **um** sítio. Ver a semântica de `status` abaixo. |
| `provenance.conventions` | `solar_constant_w_m2` (W/m²), `solar_radius_km`, `earth_radius_km` (km), `lunar_radius_m` (m), `clps_slope_limit_deg` (°), `slope_baseline_m` (m), `psr_search_radius_m` (m), `psr_lattice_step_m` (m), `psr_subsolar_lat_extreme_deg` (°), `psr_solar_radius_deg` (°), `score_is_illustrative` | `clps_slope_limit_deg` (12°) não tem fonte. Os campos novos da 1.1.0 são opcionais; o produtor 1.1.0 escreve todos, a migração só os que eram conhecidos (ver abaixo). |
| `provenance.limitations[]` | texto | Limitações declaradas pelo produtor; a interface mostra todas. |
| `provenance.migration` | ver "Arquivos migrados" | Só existe em arquivos convertidos da 1.0.0. |
| `mission_window` | `start_utc`, `end_utc`, `step_seconds` (s), `timestamps_utc[]`, `sun_dist_au[]` (UA), `earth_angular_radius_deg[]`, `solar_angular_radius_deg[]` (°), `synodic_period_days` (d), `seasonal_coverage` | Toda métrica solar e de comunicação vale só para esta janela. `seasonal_coverage`: `duration_days` (d), `subsolar_lat_min_deg`/`max_deg` (° ou `null` quando não registrados), `covers_seasonal_cycle` (janela ≥ 346,62 d, ano de eclipses). |
| `relay_presets.{lro, elfo_pathfinder, elfo_constellation}` | `a_km`, `apolune_alt_km`, `perilune_alt_km`, `max_range_km` (km), `e`, `i_deg`, `omega_deg` (°), `period_hours` (h), `antenna_mask_deg` (°), `freq_ghz` (GHz), `satellites_count`, `hypothetical`, `source` | **Cenários hipotéticos**, não serviços em operação; `source` diz o que tem e o que não tem fonte. |
| `horizon_azimuths_deg[]` | ° | Grade regular de 0° a 360° (exclusive); define o eixo de todos os perfis de horizonte. |
| `sites[]` | `id`, `name`, `category`, `description`, `coordinates_source` | Coordenadas sem fonte (pontos representativos); a NASA publica regiões Artemis III, não pontos. |
| `sites[].center` | `latitude_deg`, `longitude_east_deg` (°), `elevation_m` (m sobre a esfera), `slope_deg` (°, base `slope_baseline_m`), `cartesian_me_km` (km, `MOON_ME`), `psr_distance_m` (m ou `null`), `is_psr`, `observer_height_m` (m) | `psr_distance_m = null`: nenhum ponto PSR encontrado no raio de busca (distância desconhecida). |
| `sites[].horizon_elev_deg[]` | ° por azimute | *Ray marching* em círculos máximos até `ray_max_distance_m`. |
| `sites[].sky_series` | `*_az_deg`, `*_el_deg` (°), `elfo_primary_alt_km`, `elfo_primary_range_km`, `elfo_constellation_best_alt_km` (km), `elfo_constellation_best_fspl_db` (dB), booleanos de visibilidade | Uma amostra por instante de `mission_window`, no centro do sítio. Relays: geometria apenas, sem orçamento de enlace. |
| `sites[].engineering_summary.solar` | `mean_illum_fraction` (0–1), `sunlit_hours`, `max_continuous_shadow_hours` (h), `energy_*_wh_m2` (Wh/m²), `min_battery_100w_wh` (Wh) | Fração do disco solar acima do relevo; eclipses pela Terra não são modelados; η = 0,28 e 100 W sem fonte. |
| `sites[].engineering_summary.comms` | `*_duty_cycle_pct`, `relay_coverage_gain_pct` (%), `max_blackout_*_hours` (h), `mean_elfo_altitude_km` (km), `mean_elfo_fspl_db` (dB) | Amostragem horária: interrupções menores que 1 h não aparecem. |
| `sites[].engineering_summary.score` | `total_0_100`, `safety_slope_0_100`, `power_0_100`, `comms_0_100`, `science_psr_0_100` (0–100), `eliminated`, `elimination_reasons[]`, `total_without_relay_0_100` | **Índice ilustrativo**: pesos e limiares sem fonte. |
| `sites[].local_grid` | `spacing_m` (m), `grid_size`, `nodes[]` com os mesmos campos de terreno do centro e resumos por nó, `landing_score_0_100` | Grade 5×5 a 500 m no dataset commitado; a interface interpola bilinearmente entre nós. |

### Regras que o schema expressa (1.1.0)

- `horizons_validation.status` ∈ {`verified`, `failed`, `skipped_network_unavailable`, `not_requested`, `unverified_no_raw_response`}.
- `is_psr = true` ⇒ `psr_distance_m = 0` (centro e nós).
- `score.eliminated` e `score.elimination_reasons` aparecem juntos; `eliminated = true` ⇒ `total_0_100 = 0`, `safety_slope_0_100 = 0`, `total_without_relay_0_100 = 0` e ao menos um motivo (`slope_above_clps_limit`); `eliminated = false` ⇒ lista vazia.
- `psr_distance_m`, `tolerance_deg`, `sample_count` e a latitude subsolar aceitam `null`; nenhum outro número aceita.

### Semântica que o schema não expressa

- **`horizons_validation.status`**: `verified` só quando toda separação angular está dentro de `tolerance_deg`, com as respostas brutas em `outputs/validation/horizons_raw/` (`raw_responses[].response_file` é relativo a `outputs/validation/`); `failed` fora da tolerância, com os números; `skipped_network_unavailable` quando o Horizons não pôde ser contatado (sem relatório no disco); `not_requested` quando a checagem foi desligada; `unverified_no_raw_response` para a comparação herdada da 1.0.0, que foi rotulada `verified` sem tolerância e sem resposta bruta e não foi reproduzida. O produtor nunca escreve este último valor; só a migração.
- **Score**: regra 1.1.0 = declividade acima de `clps_slope_limit_deg` elimina o ponto (total e segurança 0) e distância PSR desconhecida (`null`) não recebe pontos de proximidade. Pesos, rampas e limiares ficam em `landing-score-model.v1.json` e não têm fonte. O termo de comunicação satura com a constelação hipotética; compare com `total_without_relay_0_100`.
- **Janela**: o dataset commitado cobre 30 dias (2026-11-15 a 2026-12-15), mais curtos que um ciclo sazonal; a auditoria SPA-9 situa a janela no extremo de verão austral. Não são médias anuais.

### Mudanças da 1.0.0 para a 1.1.0

| Mudança | Natureza para quem lê |
| --- | --- |
| `schema_version` `1.0.0` → `1.1.0` | Consumidores precisam ser atualizados (`const`). |
| `horizons_validation.status`: texto livre → enum (com `unverified_no_raw_response`) | Restringe. Todos os valores que o produtor 1.0.0 escrevia estão no enum. |
| `psr_distance_m`: número → número ou `null` (fim do sentinela de 5200 m) | Amplia: o consumidor precisa tratar `null`. |
| `tolerance_deg`, `sample_count`, `raw_responses`, `seasonal_coverage`, campos novos de `conventions`, `eliminated`, `elimination_reasons`, `total_without_relay_0_100`, `relaySpec.hypothetical`/`source`, `sites[].coordinates_source`, `provenance.migration` | Aditivas e opcionais. |
| Regras `if/then` acima | Restringem combinações incoerentes. |

Pela política de evolução deste repositório ("mudanças incompatíveis exigem nova versão principal"), o enum e o `null` poderiam justificar 2.0.0. A versão 1.1.0 segue a proposta de `science/AUDIT_FOLLOWUPS.md` e a tarefa SPA-12; como `schema_version` é fixo e não há compatibilidade automática, o efeito prático é o mesmo. **Decisão pendente da equipe.**

### Arquivos migrados da 1.0.0

O dataset commitado foi convertido por `science/tools/migrate_dataset_1_0_to_1_1.py`, sem recalcular números:

- 26 valores `psr_distance_m = 5200.0` (todos em `de_gerlache_rim_2`) viraram `null`. O valor não pode ser distância real na grade de busca da 1.0.0 (a distância real mais próxima fica a 3,8 m dele; teste por enumeração).
- `verified` virou `unverified_no_raw_response`, com `tolerance_deg: null` e `raw_responses: []`; as notas originais foram mantidas como declaração não reproduzida.
- Rótulos trocados pelos do produtor atual (motor sem "cross-checked with Skyfield", nomes de relays "Hypothetical", descrições de sítios corrigidas na SPA-10) e metadados conhecidos acrescentados (`hypothetical`, `source`, `coordinates_source`, `slope_baseline_m` = 2 × 80 m, `psr_search_radius_m` = 5200 m, `psr_lattice_step_m` = 500 m, `score_is_illustrative`, `seasonal_coverage` com 30 dias e `covers_seasonal_cycle: false`, `eliminated: false` nos 10 centros, cujas declividades vão até 4,02°, e limitações).
- **Ficaram de fora**, porque exigiriam recomputação: `total_without_relay_0_100` (as entradas publicadas são arredondadas e não fixam a segunda casa), a faixa de latitude subsolar (`null`; a 1.0.0 não a registrou), `psr_subsolar_lat_extreme_deg` e `psr_solar_radius_deg` (a 1.0.0 usava dois critérios PSR diferentes) e `sample_count`.
- Os scores gravados continuam os da regra 1.0.0 (`provenance.migration.stored_scores_rule = "1.0.0"`): em `de_gerlache_rim_2` o termo de ciência vale 19,2 e, nos 24 nós acima de 12°, o índice não foi zerado. A interface recalcula com a regra 1.1.0.
- `provenance.migration` registra cada valor trocado e cada chave acrescentada; `revert()` da ferramenta reconstrói o arquivo 1.0.0 byte a byte, e os testes conferem o SHA-256 (`source_sha256`, `source_frontend_sha256`).

Ainda não implementado (proposta da auditoria, item 6): declividade máxima e percentil na área de pouso de cada sítio.

## Modelo do índice ilustrativo (`landing-score-model.v1.json`)

Fonte única dos parâmetros do índice 0–100. `science/src/lunar_science/navigator/scoring.py` lê a cópia empacotada (idêntica byte a byte; teste) e `frontend/src/navigator/math.ts` importa este arquivo. As fórmulas existem nas duas linguagens, com a mesma ordem de operações:

- declive `s` (°): eliminado se `s > clps_slope_limit_deg` (do arquivo; padrão `default_elimination_limit_deg`); senão `clamp(100 · (zero − s) / (zero − full))`;
- potência: `clamp(illumination_weight · clamp(100 · mean_illum_fraction) + shadow_weight · clamp(100 · (1 − max_continuous_shadow_hours / shadow_scale_hours)))`;
- comunicação: com relays `clamp(relay_combined_weight · combined + dte_weight · dte)`, sem relays `clamp(dte)` (porcentagens);
- proximidade PSR (m): dentro de PSR `inside_psr_points`; distância `null` → `unknown_distance_points`; até `near_max_m` → `near_points`; rampa linear até `ramp_end_points` em `ramp_end_m` e até 0 em `zero_m`;
- total: média ponderada pelos `weights` (0 se eliminado), arredondada a `decimals` casas com desempate para o par (o `round()` do Python; o TypeScript implementa o mesmo desempate).

`examples/landing-score-parity-cases.json` é gerado por `science/tools/generate_score_parity_cases.py` a partir do Python (entradas sintéticas mais dois centros do dataset commitado). O teste Python confere que o arquivo ainda é a saída de `scoring.py`; o teste TypeScript (`frontend/src/navigator/scoreParity.test.ts`) exige números idênticos, sem tolerância. Os parâmetros não têm fonte: mudar um deles muda o índice, não sua validade.
