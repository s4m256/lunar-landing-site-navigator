# Lunar Landing Site Navigator

Base de desenvolvimento para o NASA Space Apps 2026. Aplicação React + TypeScript e módulo Python independentes, preparados para trabalho paralelo. Este repositório ainda **não executa análises científicas**, não contém dados NASA e não pressupõe vínculo oficial com a NASA.

## Estrutura e responsabilidades

- `frontend/`: interface React com Vite, tipagem estrita e testes de componentes.
- `science/`: pacote Python instalável, CLI e testes de contrato. Sem servidor HTTP.
- `contracts/`: JSON Schema e exemplo compartilhado; ponto de integração entre as equipes.
- `.github/workflows/ci.yml`: testes, tipos e builds das duas stacks.

As equipes podem trabalhar em frontend e ciência em branches separadas. Mudanças de contrato devem ser discutidas entre ambas antes da implementação. O frontend usa um exemplo local validado, sem chamar Python ou simular resultados científicos.

## Pré-requisitos

Node.js 24 (ver `.nvmrc`), npm 11 e Python 3.12+ com `venv`. Os comandos abaixo partem da raiz do checkout. Não são necessários segredos, banco de dados, API externa ou download de datasets.

```sh
npm ci
python -m venv .venv
.venv/bin/python -m pip install -e './science[dev]'
```

Em Windows, use `.venv\Scripts\python.exe` nos comandos Python.

## Executar

```sh
npm run dev
# Em outro terminal, a partir da raiz:
.venv/bin/python -m lunar_science
```

Vite usa a porta 5173 por padrão. A CLI imprime um objeto JSON com `status: not_implemented` e termina; não existe serviço Python para iniciar. A interface mostra claramente que é um exemplo de integração.

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
