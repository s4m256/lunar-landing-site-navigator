# Lunar Landing Site Navigator

Solução completa em **duas camadas** para o desafio **NASA Space Apps Challenge — Lunar Landing Sites**:

1. **Motor Científico em Python (`science/src/lunar_science/navigator/`)**: pré-computa a partir de dados oficiais da NASA (DEM polar LRO/LOLA `ldem_80s_80m` + kernels SPICE `de421.bsp` / `moon_pa_de421_1900-2050.bpc` em `MOON_ME`, com validação cruzada contra Skyfield e API JPL Horizons) as declividades topográficas, curvas de horizonte geodésicas de 360° (`s_max = 120 km`), visibilidade direta DTE e via satélites relay (LRO e constelação ELFO/LunaNet), eclipse parcial solar (`f_illum`), dimensionamento de bateria e **Landing Score composto (0–100)**.
2. **Interface Interativa React/TypeScript (`frontend/src/navigator/`)**: carrega o dataset validado por JSON Schema (`contracts/navigator-dataset.v1.schema.json`) e realiza interpolação espacial bilinear instantânea (`< 10 ms`) nas malhas locais `5×5` (`500 m`), análise temporal de 30 dias (`721` horas), perfil polar/topocêntrico de horizonte, curvas de energia/blackout e ranking dinâmico configurável.

## Estrutura e responsabilidades

- `science/src/lunar_science/navigator/`: motor científico (`data_sources.py`, `dem_horizon.py`, `ephemeris.py`, `comms.py`, `solar.py`, `scoring.py`, `pipeline.py`).
- `frontend/src/navigator/`: componentes interativos (`SouthPoleGridMap.tsx`, `PolarHorizonSkyPlot.tsx`, `PowerCommsCharts.tsx`, `SiteComparisonPanel.tsx`, `math.ts`, `types.ts`).
- `outputs/`: artefatos reprodutíveis organizados (`datasets/`, `reports/`, `validation/`).
- `docs/accessibility/`: guia de acessibilidade WCAG 2.2 AA e simplicidade cognitiva ([`guia-acessibilidade-e-simplicidade.md`](docs/accessibility/guia-acessibilidade-e-simplicidade.md)).
- `contracts/`: JSON Schemas (`navigator-dataset.v1.schema.json`, `science-status.schema.json`) compartilhados entre Python (`jsonschema`) e TypeScript (`Ajv`).
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

# Pré-computar as 10 regiões do Polo Sul, validar na API JPL Horizons e exportar outputs/:
.venv/bin/python -m lunar_science precompute-navigator

# Interface web interativa:
npm run dev
```

Sem argumentos, `.venv/bin/python -m lunar_science` preserva o JSON placeholder compatível com `contracts/science-status.schema.json`.

## Validar e gerar artefatos

```sh
npm run typecheck
npm test
npm run build
(cd science && ../.venv/bin/python -m pytest)
.venv/bin/python -m build science
```

Frontend: `frontend/dist/`. Python: wheel e distribuição fonte em `science/dist/`. O build frontend também verifica tipos. Os testes validam renderização, contrato compartilhado, rejeição de payloads incompatíveis e saída real da CLI. CI usa instalação npm pelo lockfile. As dependências Python de ferramentas são fixadas em `science/pyproject.toml`; dependências transitivas ainda não possuem lockfile.

## Contrato e próximos passos

Leia [o contrato de dados](contracts/README.md) antes de integrar as stacks. Não há campos de pontuação, coordenadas ou candidatos até que requisitos científicos sejam definidos. Para evoluir: definir entradas, fontes, unidades, sistema de referência, proveniência e incerteza com a equipe; versionar o contrato; só então implementar algoritmos e transporte.

## Deploy e integração contínua

A configuração da Vercel instala e compila a partir da raiz e publica `frontend/dist`. Veja [deploy, integração de PRs e diagnóstico](docs/deploy.md) para configurar a conta Vercel, executar os checks de infraestrutura e investigar falhas. O deploy publica somente o frontend; o pacote científico Python permanece independente.

Após `npm run build`, execute `npm run check:deploy` para verificar os artefatos publicáveis. Os testes dessa verificação rodam com `npm run test:infra`.
