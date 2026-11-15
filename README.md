# Lunar Landing Site Navigator

Solução completa em **duas camadas** para o desafio **NASA Space Apps Challenge — Lunar Landing Sites**:

1. **Motor científico em Python (`science/src/lunar_science/navigator/`)**: pré-computa, a partir do DEM polar LRO/LOLA `ldem_80s_80m` e dos kernels SPICE `de421.bsp` / `moon_pa_de421_1900-2050.bpc` (referencial `MOON_ME`), declividades (diferenças centrais com base de 160 m), curvas de horizonte de 360° por *ray marching* em círculos máximos da esfera de referência (`s_max = 120 km`), visibilidade direta à Terra (DTE) e via satélites relay **hipotéticos** (cenário "LRO-like" e constelação ELFO sem fonte publicada), fração do disco solar acima do relevo (`f_illum`, ocultação pelo terreno; eclipses pela Terra não são modelados), dimensionamento de bateria e um **Landing Score composto (0–100) ilustrativo**. Leia [Estado da verificação científica](#estado-da-verificação-científica) antes de usar os números.
2. **Interface interativa React/TypeScript (`frontend/src/navigator/`)**: carrega o dataset pré-computado conferido contra o JSON Schema (`contracts/navigator-dataset.v1.schema.json`; conformidade de formato, não validação científica) e realiza interpolação espacial bilinear (`< 10 ms`) nas malhas locais `5×5` (`500 m`), análise temporal de 30 dias (`721` horas, só o pico do verão austral), perfil polar/topocêntrico de horizonte, curvas de energia/blackout e ranking configurável.

## Estado da verificação científica

Os números do dataset commitado em `outputs/` e `frontend/src/data/` foram gerados pelo código **anterior** à tarefa SPA-10 e não foram regenerados (o DEM e os kernels NAIF não estão acessíveis nos ambientes de agentes). Na SPA-12 o arquivo foi convertido para o contrato 1.1.0 por uma migração **estrutural e reversível** (`science/tools/migrate_dataset_1_0_to_1_1.py`): rótulos e metadados mudaram (por exemplo `verified` → `unverified_no_raw_response`, sem "cross-checked with Skyfield", sentinela de 5200 m → `null`), nenhum número foi recalculado. Detalhes em [`contracts/README.md`](contracts/README.md#arquivos-migrados-da-100). O texto abaixo prevalece sobre o que o dataset diz de si mesmo.

**Reproduzido de forma independente (com o quê e onde; não é validação científica):**

- Direções aparentes de Sol e Terra em `MOON_ME` (`sky_series` dos 10 sítios e colunas `spice_*` de `outputs/validation/horizons_cross_validation.json`): reproduzidas sem SPICE a partir do DE421 distribuído no PyPI, dentro do arredondamento gravado (0,0005° e 1e-5°). Teste `science/tests/test_ephemeris_regression.py`, que roda na CI. Isso confere implementação e convenções (referencial, escalas de tempo, aberração, projeção ENU); não confere o DE421 contra a realidade nem contra o JPL Horizons.
- Resumos solar, de comunicação e de score dos 10 sítios e 250 nós: recalculados pela auditoria SPA-9 ([`docs/audit/scientific-audit-main.md`](docs/audit/scientific-audit-main.md), feita sobre a versão 1.0.0 do arquivo em `main` 23cc0c7) com diferenças só de arredondamento, dadas as entradas derivadas do DEM.
- SHA-256 fixados de `moon_080317.tf`, `moon_assoc_me.tf` e `moon_pa_de421_1900-2050.bpc`: iguais aos das cópias do pacote PyPI `lunarsky==1.0.1.post2`.

**Sem conferência independente:**

- **Comparação com o JPL Horizons.** O `horizons_cross_validation.json` commitado não retém a resposta bruta (URL, parâmetros, cabeçalho, data da consulta), e o rótulo `verified` da versão 1.0.0 era atribuído sem nenhuma tolerância. Não foi reproduzido de forma independente (host bloqueado). O dataset 1.1.0 o rotula `unverified_no_raw_response`. O código atual retém a resposta bruta em `outputs/validation/horizons_raw/` e só usa `verified` dentro de uma tolerância declarada (0,001° por padrão; caso contrário `failed`, com os números).
- **Conferência com o Skyfield.** Nunca rodou: o único teste que a faz é pulado sem kernels, inclusive na CI. A string `cross-checked with Skyfield` da versão 1.0.0 vinha de um texto fixo do código antigo e foi retirada na migração.
- **DEM LOLA**: arquivo e hashes não conferidos aqui; elevação, declividade, horizonte e PSR dependem dele.
- **Iluminação**: a janela vai de 2026-11-15 a 2026-12-15 (30 dias) e começa no extremo sul da latitude subsolar do ciclo 2026–27 (−1,557°). As métricas solares são do melhor período para o polo sul, não médias anuais (o ciclo sazonal dura cerca de 346,6 dias).
- **Landing Score**: índice ilustrativo; pesos e limiares (`contracts/landing-score-model.v1.json`) não têm fonte nem análise de sensibilidade. O termo de comunicação satura em 100 % em todos os sítios por causa da constelação relay hipotética. Os scores gravados no arquivo seguem a regra 1.0.0 (sem eliminação por declividade); a interface recalcula com a regra 1.1.0.
- **Relays e sítios**: as órbitas são cenários hipotéticos; as coordenadas são pontos representativos sem fonte dentro ou perto das regiões Artemis III anunciadas pela NASA (que publica regiões, não pontos).

Pendências e mudanças de contrato propostas: [`science/AUDIT_FOLLOWUPS.md`](science/AUDIT_FOLLOWUPS.md).

## Estrutura e responsabilidades

- `science/src/lunar_science/navigator/`: motor científico (`data_sources.py`, `dem_horizon.py`, `ephemeris.py`, `comms.py`, `solar.py`, `scoring.py`, `pipeline.py`).
- `frontend/src/navigator/`: componentes interativos (`SouthPoleGridMap.tsx`, `PolarHorizonSkyPlot.tsx`, `PowerCommsCharts.tsx`, `SiteComparisonPanel.tsx`, `math.ts`, `types.ts`).
- `outputs/`: artefatos gerados pelo motor (`datasets/`, `reports/`, `validation/`); regenerá-los exige baixar o DEM e os kernels externos.
- `docs/accessibility/`: guia de acessibilidade WCAG 2.2 AA e simplicidade cognitiva ([`guia-acessibilidade-e-simplicidade.md`](docs/accessibility/guia-acessibilidade-e-simplicidade.md)).
- `contracts/`: JSON Schemas (`navigator-dataset.v1.schema.json` na versão 1.1.0, `science-status.schema.json`) e o modelo do índice ilustrativo (`landing-score-model.v1.json`), compartilhados entre Python (`jsonschema`) e TypeScript (`Ajv`).
- `.github/workflows/ci.yml`: testes, tipagem, build do frontend (`check:deploy`) e smoke test da wheel Python.

## Pré-requisitos

Node.js 24 (ver `.nvmrc`), npm 11 e Python 3.12+ com `venv`.

```sh
npm ci --include=dev
python -m venv .venv
.venv/bin/python -m pip install -e './science[dev]'
```

Em Windows, use `.venv\Scripts\python.exe` nos comandos Python.

## Executar & Regenerar Dados NASA

```sh
# Baixar e verificar SHA-256 dos kernels SPICE e DEM LOLA (cache em science/.cache):
.venv/bin/python -m lunar_science fetch-navigator-data

# Pré-computar os 10 sítios do Polo Sul, comparar com a API JPL Horizons e exportar outputs/.
# "verified" só dentro da tolerância declarada (--horizons-tolerance-deg, padrão 0.001°);
# a resposta bruta fica em outputs/validation/horizons_raw/. Sem rede: status
# skipped_network_unavailable e o artefato antigo é removido. Janela padrão: 30 dias de verão
# austral; use --end-utc 2027-11-15T00:00:00Z para cobrir um ciclo sazonal (séries ~12x mais
# longas; dataset estimado em ~4x o tamanho atual).
.venv/bin/python -m lunar_science precompute-navigator

# Interface web interativa:
npm run dev
```

Sem argumentos, `.venv/bin/python -m lunar_science` preserva o JSON placeholder compatível com `contracts/science-status.schema.json` (status `not_implemented`, o único que esse contrato legado admite); ele não descreve o motor do navegador.

## Testes, checagens e artefatos

```sh
npm run typecheck
npm test
npm run build
npm run check:deploy      # artefatos publicáveis, orçamento de JS e SHA-256 do dataset publicado
npm run test:infra        # testes do check:deploy e varredura de alegações sem qualificação (CA-9)
(cd science && ../.venv/bin/python -m pytest -ra -o xfail_strict=true)
.venv/bin/python -m build science
.venv/bin/python science/tools/migrate_dataset_1_0_to_1_1.py --check   # dataset 1.1.0 reproduzível
```

Frontend: `frontend/dist/`. Python: wheel e distribuição fonte em `science/dist/`. O build frontend também verifica tipos. Os testes validam renderização, contrato compartilhado, rejeição de payloads incompatíveis e saída real da CLI. CI usa instalação npm pelo lockfile. As dependências Python de ferramentas são fixadas em `science/pyproject.toml`; dependências transitivas ainda não possuem lockfile.

## Contrato, transporte e próximos passos

Leia [o contrato de dados](contracts/README.md) antes de integrar as stacks e [a integração Python → frontend](docs/integration.md) para o transporte (artefato JSON estático conferido contra o schema nos dois lados, sem API), a regeneração dos artefatos e o mapa dos testes de aceite do MVP. Há dois contratos de dados: `science-status.schema.json` (placeholder legado da CLI sem argumentos) e `navigator-dataset.v1.schema.json` (versão 1.1.0), que contém coordenadas, métricas e o índice ilustrativo dos sítios candidatos; os parâmetros do índice ficam em `contracts/landing-score-model.v1.json`, lido pelo Python e pelo TypeScript. Os requisitos científicos desse dataset (fontes dos pesos e limiares, incerteza, janela temporal) ainda não foram definidos com a equipe. Para evoluir: definir entradas, fontes, unidades, proveniência e incerteza; versionar o contrato; atualizar produtor, consumidor e testes juntos. Pendências da auditoria: `science/AUDIT_FOLLOWUPS.md`.

## Deploy e integração contínua

A configuração da Vercel instala e compila a partir da raiz e publica `frontend/dist`. Veja [deploy, integração de PRs e diagnóstico](docs/deploy.md) para configurar a conta Vercel, executar os checks de infraestrutura e investigar falhas. O deploy publica somente o frontend; o pacote científico Python permanece independente.

Após `npm run build`, execute `npm run check:deploy` para verificar os artefatos publicáveis. Os testes dessa verificação rodam com `npm run test:infra`.
