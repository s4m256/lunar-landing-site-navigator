# Auditoria científica da `main` (SPA-9)

- **Alvo:** `main` em `23cc0c7` (idêntico a `origin/feat/lunar-navigator-mission-pipeline`), commits `3c39376`, `be56d21`, `c8418be`, `3aa5557`.
- **Data:** 2026-11-15. **Escopo:** alegações científicas do README, de `outputs/` e de `science/src/lunar_science/navigator/*`.
- **Nenhum código de produção foi alterado.** Esta entrega contém só este relatório e dois scripts de verificação em `docs/audit/scripts/`.

Cada conclusão é classificada como **Comprovado** (reproduzido aqui), **Provável** (evidência indireta consistente) ou **Não verificável aqui** (depende de rede/arquivos bloqueados neste ambiente).

## 1. Veredito por alegação

| Alegação da `main` | Veredito | Resumo |
| --- | --- | --- |
| Geometria Sol/Terra em `MOON_ME` (DE421, LT+S) | **Comprovado** | Recalculada de forma independente (sem SPICE, sem NAIF): concorda com os valores `spice_*` do artefato em ≤ 6,2e-6° e com as séries do dataset no limite do arredondamento (0,0005°). |
| "Validação cruzada contra JPL Horizons" | **Não verificável aqui; provável que a consulta tenha ocorrido** | Existe caminho de código real, sem fallback/mock/cópia. Os resíduos têm estrutura temporal suave, não são cópia dos valores SPICE. Mas a resposta bruta não foi retida, e o rótulo `verified` é atribuído sem nenhum critério de tolerância. |
| "Validação cruzada contra Skyfield" | **Não sustentada como evidência** | A string é fixa no código; a checagem só existe em um teste que é pulado sem kernels (pulado aqui e na CI). |
| DEM LOLA `ldem_80s_80m` real | **Provável, não verificável aqui** | Elevações e horizontes são plausíveis; DEM e rótulo não estão no repositório e o host está bloqueado. Hashes fixados não puderam ser conferidos. |
| Dataset `south_pole_precomputed.v1.json` | **Comprovado como saída do código** (dadas as entradas derivadas do DEM); **não reprodutível só com o repositório** | 10 sítios + 250 nós: resumos solar, comunicação, relay e score recalculados com diferenças só de arredondamento. Elevação, declividade, horizonte e PSR dependem do DEM externo. |
| Landing Score 0–100 | **Aritmética comprovada; validade científica não sustentada** | Pesos e limiares sem fonte, sem análise de sensibilidade; termo de comunicação saturado por constelação hipotética; iluminação medida em um único mês de verão austral. |
| Dataset "validado" | **Ambíguo** | No código, "validado" significa conformidade com JSON Schema, não validação científica. |

Nenhuma evidência de dados sintéticos, sementes aleatórias ou valores numéricos escritos à mão nos artefatos. O DEM sintético existe apenas no caminho de teste (`dem_override`) e é rotulado como tal.

## 2. Método e limites do ambiente

- Leitura integral de `navigator/*.py`, testes, README, contratos e artefatos; `git log/diff` contra as branches `feat/science-geometric-engine` (PR #4) e `fix/horizons-validation-audit` (PR #5).
- Suítes executadas: `pytest` (15 aprovados, 1 pulado), `npm test` (4 aprovados), `npm run typecheck` (ok).
- Bloqueados pelo proxy (HTTP 403): `ssd.jpl.nasa.gov`, `naif.jpl.nasa.gov` e `pds-geosciences.wustl.edu`. Logo: nenhuma consulta Horizons, nenhum kernel NAIF, nenhum DEM LOLA foram obtidos. **Esta auditoria não produziu resíduos contra Horizons nem qualquer validação externa.**
- Verificação independente da efeméride: posições do DE421 via `skyfield-data` (PyPI) + `jplephem`; orientação lunar pelos ângulos de libração do DE421 do pacote `de421` (PyPI); rotação constante PA→ME do DE421 (R1(−0,30″)·R2(−78,56″)·R3(−67,92″)); TDB−UTC = 69,184 s (37 segundos intercalares, mesma hipótese do `naif0012.tls`); tempo de luz e aberração estelar implementados à mão. Isso testa implementação e convenções (referencial, tempo, aberração, ENU). Não testa o DE421 contra a realidade nem contra Horizons, pois a efeméride de origem é a mesma.

## 3. `horizons_cross_validation.json`

### 3.1 Existe caminho de código capaz de produzi-lo? — Comprovado que sim

```
precompute-navigator
   └─ run_navigator_pipeline (pipeline.py)
        └─ validate_ephemeris_against_horizons (ephemeris.py:352)
             ├─ query_jpl_horizons_topocentric  → HTTP GET ssd.jpl.nasa.gov (alvos 10 e 399)
             ├─ SpiceLunarEphemeris.compute_topocentric_series (nos instantes devolvidos)
             └─ separação angular → relatório
        └─ write_navigator_outputs → outputs/validation/horizons_cross_validation.json
```

- Os campos `horizons_*` vêm exclusivamente de `sun_rows`/`earth_rows`, que só são preenchidos pela resposta HTTP. Não há fallback, mock, valor padrão nem cópia dos valores SPICE. Em falha, a função lança exceção.
- O artefato é coerente com esse caminho: 16 amostras = 15/nov a 15/dez em passo de 2 dias (a chamada do pipeline, não o padrão da CLI `validate-horizons`); elevação 1953,07 m = elevação do centro no dataset; os valores `spice_*` batem com `sky_series` do dataset no arredondamento.
- Arredondamento não mascara: `angular_diff_deg` é calculado antes de arredondar; os valores são gravados com 5 casas.

### 3.2 Os valores Horizons são implausivelmente iguais aos SPICE? — Não

- Não são idênticos: diferem em até 4e-5° (Terra) e 2e-5° (Sol).
- O resíduo de elevação da Terra (Horizons − SPICE, em 1e-5°), em ordem temporal, é: `+2 +2 +1 +1 0 −1 −3 −4 −4 −3 −2 −2 −1 +1 +1 +2`. É uma curva suave de período aproximadamente mensal. Ruído aleatório ou cópia dariam zeros ou saltos sem padrão. Diferença sistemática entre dois modelos (efeméride/orientação) dá exatamente esse tipo de curva.
- O cálculo independente desta auditoria reproduz a coluna `spice_*` (≤ 6,2e-6°) e **não** reproduz a coluna `horizons_*` (até 3,9e-5°). Portanto a coluna `horizons_*` não foi derivada do DE421 pelo mesmo caminho.
- Ordem de grandeza: 1 m na superfície lunar equivale a ~3,3e-5° de rotação. Diferenças de 1e-5° são compatíveis com realizações ligeiramente diferentes da orientação lunar. Isto é um argumento de plausibilidade, não uma validação.

### 3.3 O que impede aceitar a alegação como está

1. **Sem evidência bruta.** URL, resposta, cabeçalho (versão da efeméride, raio, convenção de coordenadas) e data da consulta não foram retidos. O PR #5 retém tudo isso; a `main` não.
2. **Conflito com o registro da SPA-9** ("Horizons sempre respondeu 403"). Fatos observados: os commits da `main` têm fuso −0300; `generated_utc` do dataset é 15:52:49Z (12:52:49 −0300), cerca de 4 min antes dos commits (12:57:07–09). Isso é compatível com execução em máquina fora do proxy dos agentes. Não é prova. Quem executou precisa confirmar e reexecutar retendo a resposta.
3. **`verified` não significa nada.** `pipeline.py:460` grava `status: "verified"` sempre que a consulta é analisada sem exceção. Não há tolerância. Demonstrado com stubs: referência a 90° do valor calculado retorna normalmente com `max_sun_angular_diff_deg = 89.98`.
4. **Precisão do Horizons.** A consulta não pede `EXTRA_PREC`. Se a saída padrão de az/el tem casas suficientes para resíduos de 1e-5° não pôde ser conferido aqui.
5. **Cobertura.** Um sítio, 16 instantes, só direções do centro do Sol e da Terra. Não valida horizonte do DEM, iluminação, comunicação nem score.

### 3.4 O bug de "falso sucesso" do PR #5 existe na `main`?

O bug específico (comparador retorna sucesso com `series=[]`) **não existe** na `main`: `science/tools/compare_horizons.py` não está na `main`, e o validador da `main` falha com tabela vazia (`ValueError: max() iterable argument is empty`, testado). Existem, porém, falhas análogas — todas comprovadas por leitura e/ou stub:

| Falha | Local | Efeito |
| --- | --- | --- |
| Sucesso sem tolerância | `pipeline.py:431-471` | Qualquer discrepância vira `verified`. |
| `except Exception` genérico | `pipeline.py:472` | Erro de parsing ou bug de código é rotulado `skipped_network_unavailable`. |
| Artefato obsoleto sobrevive | `write_navigator_outputs` (`pipeline.py:584`) | Se a consulta falhar, o JSON antigo permanece em `outputs/validation/` ao lado de um dataset novo. |
| Linhas descartadas em silêncio | `ephemeris.py:336` | Linhas com menos de 5 colunas são ignoradas sem erro. |
| Contagens Sol/Terra não comparadas | `ephemeris.py:372-422` | Terra com mais linhas que o Sol passa sem erro (testado: 1 vs 2 → `sample_count = 1`). |
| Grade de tempo não conferida | `ephemeris.py:372` | SPICE é avaliado nos instantes que o Horizons devolveu; não se verifica se são os solicitados. |
| Diferença de azimute sem wrap | `pipeline.py:444-455` | 359,99999° vs 0,00001° daria "360°". Latente. |
| Teste circular | `test_navigator.py:329` | O teste exige que o arquivo commitado diga `verified`. |

## 4. Dataset pré-computado

### 4.1 Reprodutibilidade

```
Entradas externas (fora do repo)             Código do repo                   Artefato
┌──────────────────────────────┐
│ DEM LOLA .img/.lbl (PDS)     │──► dem_horizon.py ──► elevação, declividade, ─┐
└──────────────────────────────┘                      horizonte 360°, PSR      │
┌──────────────────────────────┐                                               ├─► dataset v1
│ 6 kernels NAIF (DE421, PA…)  │──► ephemeris.py ──► az/el Sol e Terra ────────┤
└──────────────────────────────┘                                               │
   presets fixos no código ─────► comms.py / solar.py / scoring.py ────────────┘

   Verificado nesta auditoria: ramo da efeméride e todo o ramo comms/solar/score.
   Não verificado: ramo do DEM (arquivo inacessível).
```

- **Comprovado:** alimentando as funções do próprio repositório (`analyze_site_solar`, `analyze_site_comms`, `compute_composite_landing_score`) com a efeméride independente e com as entradas derivadas do DEM lidas do dataset, todos os resumos dos 10 sítios e dos 250 nós são reproduzidos. Maiores diferenças: `mean_illum_fraction` 0,0001; `max_continuous_shadow_hours` 1 h (em um nó); score 0,03; energia 7 Wh/m² em ~187 000; séries ELFO 0,001°/0,01 km; zero divergências nas séries booleanas. Tudo atribuível ao arredondamento das entradas a 3 casas.
- **Comprovado:** `frontend/src/data/...json` é o mesmo conteúdo de `outputs/datasets/...json` (comparação estrutural idêntica).
- **Não reprodutível só com o repositório:** exige baixar o DEM e os kernels de hosts externos. `generated_utc` torna a saída não determinística byte a byte.
- **Não verificável aqui:** os SHA-256 fixados em `data_sources.py`. Observação: o `de421.bsp` do `skyfield-data` usado pelo PR #5 tem hash diferente do fixado na `main` para o arquivo do NAIF; podem ser empacotamentos distintos do mesmo DE421.
- **Provável:** o DEM é LOLA real. Indícios: crista Shackleton–de Gerlache a +1953 m, piso de Shackleton a −2868 m com horizonte de 18–27°, Malapert a +5141 m.

### 4.2 Valores fixos no código (sem fonte citada)

| Item | Local | Observação |
| --- | --- | --- |
| Coordenadas dos 10 sítios | `data_sources.py:95` | Sem referência. Nomes e descrições nem sempre batem com o ponto: "Peak near Cabeus B" está a −163 m; "Slater Plain: planície elevada" está a −349 m. |
| Órbitas ELFO e "LRO-like" | `comms.py:70-110` | Cenários hipotéticos. O LRO não é satélite relay e o preset (50 km circular, fase inicial arbitrária) não é a órbita real. Fases iniciais são arbitrárias. |
| η = 0,28, carga de 100 W | `solar.py:12-13` | Parâmetros de engenharia arbitrários. |
| Limite CLPS de 12° | `pipeline.py:519` | Declarado na proveniência, sem fonte e **não usado** no score. |
| Pesos e limiares do score | `scoring.py` | Ver seção 6.4. |

### 4.3 Os testes testam ciência ou forma?

| Teste | Natureza |
| --- | --- |
| Parser PDS3, ida e volta da projeção | Forma/álgebra, com rótulo sintético. |
| Declividade em rampa, horizonte em cratera sintética | Física básica, DEM sintético; tolerância larga (`> 50°`). |
| Base ENU, segmento circular, 1/d² | Álgebra. Correto. |
| Kepler, oclusão, FSPL | Álgebra. Correto. |
| Trade-offs do score | Só monotonicidade. |
| SPICE vs Skyfield + mini-pipeline | **Pulado** sem kernels. A CI não baixa kernels, logo nunca roda. |
| Artefatos commitados | Schema + valores esperados do próprio arquivo. Circular. |

Não há teste do parser Horizons, do DEM real, nem regressão numérica contra referência externa. Os testes do frontend cobrem renderização e contrato.

## 5. Contradições na documentação

| Onde | Texto | Contradiz |
| --- | --- | --- |
| `README.md`, "Contrato e próximos passos" | "Não há campos de pontuação, coordenadas ou candidatos até que requisitos científicos sejam definidos." | O mesmo README anuncia Landing Score, 10 sítios e ranking. |
| `science/README.md` | "Não há algoritmos científicos, dados externos ou serviço HTTP." | `navigator/*` (≈2500 linhas) e download de DEM/kernels. |
| `lunar_science/__init__.py` | Docstring "no scientific algorithms yet"; CLI sem argumentos responde `not_implemented`. | Pipeline completo no mesmo pacote. |
| `contracts/README.md` | "nem coordenadas, unidades físicas, métricas ou resultados" | Seção seguinte descreve o contrato do dataset com score. |
| `AGENTS.md` | "Esta base não implementa ciência"; "Nunca versione artefatos gerados"; "não faça push de funcionalidades em `main`". | 5,3 MB de artefatos gerados (duas cópias) e motor científico entraram direto na `main`. |
| README / `outputs/README.md` | "artefatos reprodutíveis", "dataset validado" | Seção 4.1; "validado" = JSON Schema. |
| README / proveniência | "validação cruzada contra Skyfield" | Seção 1. |
| README | "eclipse parcial solar (`f_illum`)" | É ocultação do disco solar pelo relevo. Eclipses do Sol pela Terra não são modelados. |
| `outputs/README.md` | "Curvas de horizonte geodésico" | É marcha ao longo de círculos máximos sobre esfera; terminologia aceitável, mas "exato" no código é exagero. |

## 6. Revisão de correção física

### 6.1 `ephemeris.py` — correto nas convenções

- `spkpos(alvo, et, "MOON_ME", "LT+S", "MOON")` e subtração do vetor do sítio: correto. O centro do referencial coincide com o observador, logo a orientação é avaliada em `et`. O erro de usar o centro da Lua como observador para a aberração é desprezível.
- Matriz ENU, azimute horário a partir do norte, longitude leste, raio esférico de 1737,4 km: consistentes entre efeméride, DEM e relay. **Comprovado** pela reprodução independente.
- Ressalva: a função Skyfield lê os mesmos arquivos de kernel; ela verificaria implementação, não dados.

### 6.2 `dem_horizon.py`

- **Curvatura lunar: correta.** `atan2((R+z_i)·cosψ − (R+z_0), (R+z_i)·sinψ)`. Testado: esfera lisa com observador a 2 m dá −0,0869° (analítico −0,0869°); pico de 1000 m a 10 km dá 5,542° (analítico com curvatura 5,544°; plano daria 5,711°).
- Projeção estereográfica polar sul, sinais de linha/amostra e fator de escala na declividade: corretos. Possível desvio de meio pixel conforme a convenção do rótulo real — não verificável aqui.
- **Declividade com base de 160 m** (diferença central de ±1 pixel de 80 m). Isso subestima a declividade na escala do módulo de pouso. No dataset, sítios com centro a 0,5–4° têm nós a até 19–24° a menos de 1,5 km.
- **"Limite superior" solar não é limite superior.** `max_solar_elevation_curve` usa latitude subsolar fixa de −1,543°. A efeméride independente dá −1,557° em 2026-11-15. Erro pequeno (0,014°), mas a docstring afirma envoltória de 18,6 anos.
- **Dois critérios de PSR diferentes.** `is_site_psr` exige `horizonte > sol_max + 0,27°` com observador a 2 m e passo de 1°/80 m. `_compute_site_local_psr_mask` usa `horizonte ≥ sol_max` (sem raio solar), observador a 0,5 m, passo de 5°/320 m. O flag `is_psr` e a distância ao PSR não medem a mesma coisa.
- **Distância ao PSR quantizada e com sentinela.** A malha de busca vai de −5200 a +4800 m em passos de 500 m (assimétrica, não contém o centro). Sem PSR encontrado, devolve 5200 m, que entra no score e aparece no relatório como distância medida (caso `de_gerlache_rim_2`).
- Raios fora da grade recebem −90° em silêncio. Supondo grade de 7600×7600, nenhum dos sítios atuais é afetado; é risco latente.
- Alcance de 120 km: obstáculos além disso precisam estar ~4,1 km acima do observador para aparecer a 0°. Limitação declarada na proveniência.

### 6.3 `solar.py` e `comms.py`

- Fração do disco (`f_illum`): fórmula do segmento circular correta para horizonte reto na largura do disco. Ignora inclinação do horizonte ao longo de 0,53° e escurecimento de limbo.
- Geometria dos painéis (rastreador vertical, vertical fixo ao norte, horizontal): correta. Unidades coerentes (W/m², Wh/m² elétricos com η).
- **Viés sazonal (achado principal).** A janela de 15/nov a 15/dez de 2026 tem latitude subsolar entre −1,56° e −1,37°, ou seja, o extremo do verão austral. A "iluminação média" (100 % na crista) é o melhor caso do ano e não representa o sítio. A janela de 30,0 dias também não é um mês sinódico (29,53 d).
- Bateria mínima = 100 W × maior sombra: ignora profundidade de descarga e térmica; a sombra é truncada pela janela (721 h no PSR); iluminação de 0,0001 % já conta como "sol".
- DTE: elevação da Terra contra o horizonte, máscara de 0°, sem orçamento de enlace nem visibilidade de estação. Relay usa máscara de 5°: critérios desiguais.
- Kepler, sinal de ω = 90° (apolúnio ao sul), oclusão pela Lua, FSPL: corretos. Propagação de dois corpos: limitação declarada.
- **Amostragem horária** para órbitas de 10,84 h: "blackout máximo 0,0 h" não resolve interrupções menores que 1 h. A série horária `lro_visible` sofre aliasing (período de 1,88 h); só o duty cycle do centro usa 5 min.
- `combined_dte_elfo_duty_cycle_pct` = 100 % em todos os 10 sítios, graças à constelação hipotética.

### 6.4 `scoring.py`

- Aritmética correta e reproduzida. Os mesmos pesos e fórmulas estão duplicados em `frontend/src/navigator/math.ts` (risco de divergência).
- Pesos 0,25/0,35/0,25/0,15, mistura 70/30, normalização por 360 h, 65/35 em comunicação, 15 pontos para PSR, 500–5000 m de "alcance de rover": **nenhum tem fonte ou justificativa**. Não há análise de sensibilidade nem incerteza.
- Declividade: 100 até 2°, zero em 15°. O limite de 12° declarado rende 23 pontos em vez de reprovar. Não há restrição eliminatória.
- O termo de comunicação dá ≥ 65 pontos a todo sítio (16,25 no total), inclusive ao piso de Shackleton, por causa do relay hipotético.
- Conclusão: o ranking publicado é um índice ilustrativo. Não pode ser apresentado como resultado científico validado.

## 7. Correções recomendadas (prioridade decrescente)

1. **Horizons — evidência e critério.** `ephemeris.py::query_jpl_horizons_topocentric` e `validate_ephemeris_against_horizons`: reter URL, resposta bruta, cabeçalho e data; pedir `EXTRA_PREC`; exigir contagens e instantes iguais aos solicitados; falhar em linha inválida. `pipeline.py::run_navigator_pipeline`: trocar `verified` por estado que exija tolerância declarada e justificada; capturar só erros de rede; aplicar wrap no azimute. `write_navigator_outputs`: apagar ou marcar o artefato antigo quando a consulta falhar. Reexecutar em ambiente com acesso e commitar a resposta bruta. Até lá, o texto deve ser "comparação não reproduzida de forma independente".
2. **Documentação.** Alinhar `README.md`, `science/README.md`, `contracts/README.md`, `lunar_science/__init__.py` e `AGENTS.md` com o estado real; separar "validado por schema" de "validado cientificamente"; remover "cross-checked with Skyfield" da string fixa em `pipeline.py` ou gravá-la só quando a checagem rodar; trocar "eclipse" por ocultação pelo relevo.
3. **Janela temporal.** `pipeline.py` / `solar.py::analyze_site_solar`: calcular iluminação sobre pelo menos um ano (idealmente 18,6 anos) ou rotular a métrica como "mês de verão austral 2026".
4. **Score.** `scoring.py` e `frontend/src/navigator/math.ts`: documentar origem dos pesos ou rotular como ilustrativo e configurável; tornar a declividade restrição eliminatória; calcular o score com e sem relay hipotético; fonte única para as fórmulas.
5. **PSR.** `dem_horizon.py::is_site_psr`, `max_solar_elevation_curve` e `pipeline.py::_compute_site_local_psr_mask`: critério único; envoltória solar derivada da efeméride; malha simétrica; `null` em vez de 5200 m quando não há PSR.
6. **Declividade.** `dem_horizon.py::compute_slope_deg`: declarar a base de 160 m no contrato e reportar máximo/percentil em uma área de pouso.
7. **Testes e CI.** Regressão numérica da efeméride que rode na CI (o script desta auditoria usa apenas PyPI); fixture do parser Horizons identificada como sintética; remover a asserção circular de `verified`; teste com recorte real do DEM.
8. **Presets e sítios.** `comms.py`, `data_sources.py`: citar fontes das órbitas e coordenadas; rotular "LRO" e ELFO como cenários hipotéticos na interface; corrigir descrições que não batem com a elevação.
9. **Amostragem.** `comms.py::analyze_site_comms`: passo menor para relay ou declarar a resolução de 1 h no blackout; flag para raios fora da grade em `compute_horizon_profile`.
10. **Integração.** Passar o conteúdo dos commits `be56d21`/`c8418be`/`3aa5557` por revisão em PR, reconciliando com o motor dos PRs #4/#5 (`IAU_MOON`, `CN+S`) — hoje há dois motores com convenções diferentes.

## 8. Como reproduzir esta auditoria

Só PyPI é necessário:

```sh
python3 -m venv /tmp/audit-venv
/tmp/audit-venv/bin/pip install numpy jplephem de421 skyfield-data spiceypy==8.0.0 jsonschema
cd docs/audit/scripts
/tmp/audit-venv/bin/python independent_ephemeris_check.py <raiz-do-repo>
/tmp/audit-venv/bin/python recompute_dataset_summaries.py <raiz-do-repo>
```

- `independent_ephemeris_check.py`: recalcula az/el de Sol e Terra e compara com o artefato Horizons e com `sky_series` de todos os sítios.
- `recompute_dataset_summaries.py`: recalcula resumos solar/comunicação/score de 10 sítios e 250 nós com as funções do repositório e lista a maior diferença por campo.

`spiceypy` é instalado apenas porque o pacote o importa; nenhum kernel é carregado.
