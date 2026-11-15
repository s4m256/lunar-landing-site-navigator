# Integração Python → frontend (SPA-12)

Este documento define o transporte entre o motor científico e a interface, diz como regenerar cada artefato e mapeia os testes de aceite do MVP (`docs/product/spa-7-mvp-criterios-aceite.md`) para este repositório. O contrato de dados está em [`contracts/README.md`](../contracts/README.md).

## Transporte: um artefato JSON estático, conferido contra o schema nos dois lados

Não há API HTTP nem backend: o Python gera um arquivo JSON, o build publica esse arquivo como recurso estático e o navegador o baixa e valida antes de mostrar qualquer número.

```
 science/ (Python)                       contracts/ (normativo)                 frontend/ (TypeScript)
 ─────────────────                       ──────────────────────                 ──────────────────────
 lunar-science precompute-navigator      navigator-dataset.v1.schema.json       AppLoader: fetch do JSON
   DEM LOLA + kernels NAIF                 (schema_version 1.1.0)                 │
   │                                     landing-score-model.v1.json            ▼
   ├─ jsonschema (cópia empacotada) ◄──── mesmo schema ────────────────────► Ajv (contract.ts)
   │                                                                            │
   ├─► outputs/datasets/south_pole_precomputed.v1.json   (indentado)            ▼
   └─► frontend/src/data/south_pole_precomputed.v1.json  (minificado) ──┐   integrity.ts (eixos, tamanhos)
       frontend/src/data/…json.sha256 (sha256sum)                       │      │
                                                                        ▼      ▼
                                        npm run build: Vite emite dist/assets/south_pole_precomputed.v1-<hash>.json
                                        npm run check:deploy: SHA-256 do recurso = .sha256 commitado
                                                                        │
                                        Vercel serve frontend/dist ─────┴──► navegador: interface (chunk separado)
```

| Etapa | Onde | O que garante | Teste |
| --- | --- | --- | --- |
| Produção | `pipeline.py::run_navigator_pipeline` | Documento conforme o schema 1.1.0 antes de gravar | `test_pipeline_synthetic.py`, `test_contract.py` |
| Gravação | `pipeline.py::write_dataset_copies` | Duas cópias com o mesmo conteúdo; a servida tem SHA-256 gravado ao lado | `test_known_cases.py` (cópias e checksum) |
| Publicação | `frontend/src/datasetLoader.ts` (`?url`), `scripts/verify-deploy.mjs` | O JSON fica fora do JavaScript; o recurso publicado tem exatamente os bytes commitados e é o que a página busca | `scripts/verify-deploy.test.mjs` |
| Consumo | `contract.ts` (Ajv, `allErrors`), `integrity.ts` | Arquivo fora do schema ou desalinhado interrompe a exibição inteira | `contract.test.ts`, `integrity.test.ts`, `AppLoader.test.tsx` |
| Cálculos na página | `navigator/math.ts` | Mesmo índice que `scoring.py` (parâmetros de `landing-score-model.v1.json`) | `scoreParity.test.ts`, `test_scoring.py` |

O arquivo publicado tem cerca de 1,4 MB (cerca de 480 kB com gzip) e é baixado uma vez, ao abrir a página. A página mostra o SHA-256 publicado ao lado do link de download; ela **não** recalcula o hash do que recebeu (a verificação de bytes acontece no build, em `check:deploy`).

## Como regenerar

Com acesso a `naif.jpl.nasa.gov`, `pds-geosciences.wustl.edu` e `ssd.jpl.nasa.gov` (bloqueados nos ambientes de agentes):

```sh
.venv/bin/python -m lunar_science fetch-navigator-data
.venv/bin/python -m lunar_science precompute-navigator   # dataset 1.1.0, cópias, checksum, relatórios
npm test && npm run build && npm run check:deploy
(cd science && ../.venv/bin/python -m pytest -ra -o xfail_strict=true)
```

Uma regeneração com rede troca o arquivo migrado por uma saída nativa 1.1.0 (sem `provenance.migration`). Os testes que hoje dependem do arquivo migrado dizem o que esperar: o xfail estrito de evidência do Horizons passa a XPASS e deve ser removido; o teste de reprodução da migração deixa de se aplicar e deve ser apagado junto com a ferramenta.

Sem rede:

| Artefato | Comando | Observação |
| --- | --- | --- |
| Dataset 1.1.0 migrado | `.venv/bin/python science/tools/migrate_dataset_1_0_to_1_1.py --check` | Reconstrói a fonte 1.0.0 a partir de `provenance.migration`, confere o SHA-256 e compara os bytes; sem `--check`, regrava as cópias e o checksum (por exemplo, depois de mudar um rótulo do produtor). |
| Exemplo sintético do contrato | `.venv/bin/python -I science/tools/generate_contract_example.py` | Produtor real sobre stubs; `test_contract.py` acusa quando o exemplo fica desatualizado. |
| Tabela de paridade do índice | `.venv/bin/python -I science/tools/generate_score_parity_cases.py` | Gerada pelo Python; o TypeScript precisa reproduzi-la sem tolerância. |

A auditoria SPA-9 (`docs/audit/`) foi feita sobre a versão 1.0.0 do arquivo e do código (`main` em 23cc0c7). Para reproduzi-la, use aquele commit: seus scripts leem `outputs/datasets/…` e o pacote `science/src` da mesma árvore.

## Testes de aceite do MVP neste repositório

O rascunho SPA-7 foi escrito para a linhagem do PR #6 (contrato `analysis-result.v1`, locais `south-a`/`south-b`, amostras diárias, `IAU_MOON`). Esta integração usa a linhagem da `main` (`navigator-dataset`, 10 sítios, 721 instantes horários, `MOON_ME`). Os critérios foram adaptados sem copiar números de referência de outra linhagem: os valores esperados vêm do próprio arquivo carregado. A escolha da branch submetida (decisão D5) continua pendente.

| CA | Situação | Onde |
| --- | --- | --- |
| CA-1 posição de Sol e Terra para um local e instante | Automatizado, adaptado: o resumo mostra azimute e elevação do arquivo, em graus, com o instante em UTC. Os valores de referência do CA-1 são do PR #6 e não se aplicam. | `App.test.tsx` (estado do Sol e da Terra; elevação exatamente 0 do arquivo) |
| CA-2 A × B no mesmo instante | Automatizado: A e B escolhidos no próprio arquivo, mesmo UTC, cada coluna com os próprios valores. | `App.test.tsx` (CA-2/CA-3) |
| CA-3 estado em relação ao horizonte | Automatizado, para o horizonte idealizado e para o relevo; a tabela A × B não usa “iluminado”, “sombra”, “energia” ou “comunicação” como conclusão. | `App.test.tsx`, `horizonState.test.ts` |
| CA-4 limite estrito em zero | Automatizado: 0 conta como “não está acima”, sem arredondar antes. | `horizonState.test.ts`, `App.test.tsx` |
| CA-5 limitações na mesma página | Automatizado em parte: o painel de origem e limitações está na página e o teste confere os itens principais (Horizons não confirmado, índice ilustrativo, relays hipotéticos, janela de verão). Os itens do CA-5 específicos do PR #6 (horizonte de 0° sem relevo, amostras diárias) não se aplicam. | `App.test.tsx` (painel de origem) |
| CA-6 ausência de dado não vira número | Automatizado: instante fora do arquivo ou entre amostras não mostra valores nem usa a amostra vizinha, inclusive na comparação A × B. | `timeWindow.test.ts`, `App.test.tsx` |
| CA-7 dataset inválido interrompe a exibição | Automatizado: erro de schema (Ajv), versão 1.0.0, enum, regras `if/then`, séries desalinhadas, local repetido. | `AppLoader.test.tsx`, `contract.test.ts`, `integrity.test.ts` |
| CA-8 SHA-256 do JSON | Automatizado: o recurso publicado tem o SHA-256 commitado em `frontend/src/data/south_pole_precomputed.v1.json.sha256` (hoje `502f59ae083a4d98c430c17db7af815ff54fbd129e4f818d3607a3350be6f2ca`), é o arquivo que a página busca e oferece para download, e contém kernels com SHA-256 e `horizons_validation.status = unverified_no_raw_response`. O hash citado no CA-8 é o do arquivo do PR #6 e não se aplica. | `verify-deploy.test.mjs`, `npm run check:deploy`, `AppLoader.test.tsx`, `test_known_cases.py` |
| CA-9 nenhuma alegação não comprovada | Automatizado como checagem léxica: frases com “verified”, “validado”, “Skyfield”, “Landing Score”, “seguro” e afins precisam de qualificação na mesma frase, no README, nos documentos de contratos e dados, neste documento, na página de submissão, nos textos do dataset mostrados na interface e no texto renderizado da interface. Não prova que um texto qualificado esteja certo. | `scripts/claims.test.mjs`, `frontend/src/claims.test.tsx` |
| CA-10 teclado e 390 px | **Não automatizado.** Exige navegador real (layout e foco). Há testes de estrutura acessível (rótulos, papéis, link para pular) e o CSS da SPA-11 para 320 px, mas ninguém mediu a rolagem horizontal nem percorreu os fluxos por teclado nesta integração. | `App.test.tsx` (estrutura) |
| CA-11 reprodução byte a byte | **Não automatizável aqui** para o cálculo: exige DEM, kernels e rede. Automatizado só para a migração: o arquivo 1.1.0 volta byte a byte ao 1.0.0 registrado e é regenerado byte a byte pela ferramenta. | `test_migration_1_0_to_1_1.py` |

## Limitações conhecidas da integração

- Os números do dataset são os do código 1.0.0; a migração só trocou rótulos e metadados. Os scores gravados seguem a regra 1.0.0; a interface recalcula com a regra 1.1.0 e não mostra os gravados.
- `outputs/reports/` e `outputs/validation/horizons_cross_validation.json` não foram migrados: são artefatos da versão 1.0.0 (por exemplo, o CSV ainda mostra 5200 m em de Gerlache Rim 2).
- A paridade TS ↔ Python cobre a fórmula do índice. As séries de iluminação e de visada que a página recalcula a partir de `sky_series` são cálculos próprios do TypeScript; o teste de reprodução do índice gravado confere que ficam próximos dos resumos do Python, sem exigir igualdade.
- O versionamento 1.1.0 (em vez de 2.0.0) segue a proposta da ciência e a tarefa SPA-12; ver `contracts/README.md`.
- O transporte supõe um único arquivo pequeno o bastante para o navegador. Janelas anuais (cerca de 4 vezes maiores, segundo `science/README.md`) podem exigir dividir o arquivo por sítio; isso pediria uma nova versão do contrato.

## Resultados dos comandos de teste e build (SPA-12, Node 24.22.1, npm 11.19.1, Python 3.13.18)

| Comando | Resultado |
| --- | --- |
| `npm ci` | OK. Aviso do npm 11: o `postinstall` do esbuild não rodou (`allowScripts`); o build passa assim mesmo. |
| `npm run typecheck` | OK |
| `npm test` | 9 arquivos, 75 testes aprovados |
| `npm run build` | OK: JavaScript inicial 373,6 kB (gzip 115,5 kB), interface em chunk separado de 78,3 kB, dataset como recurso de 1 409 kB (gzip 484,6 kB) |
| `npm run check:deploy` | OK: 373 578 de 1 048 576 bytes do orçamento; dataset publicado com SHA-256 `502f59ae…6f2ca`, igual ao commitado |
| `npm run test:infra` | 14 testes aprovados (deploy e CA-9) |
| `(cd science && ../.venv/bin/python -m pytest -ra -o xfail_strict=true)` | 130 aprovados, 2 pulados (sem kernels NAIF, como na CI), 2 xfail estritos: durações de 721 h numa janela de 720 h (achado D1 da QA) e falta de resposta bruta do Horizons |
| `.venv/bin/python -m build science` | OK: sdist e wheel; a wheel leva o schema e o modelo do índice. Instalada fora do checkout, a CLI responde e `scoring.py` carrega o modelo empacotado. |
| `science/tools/migrate_dataset_1_0_to_1_1.py --check` | OK: as cópias 1.1.0 são reproduzíveis a partir da fonte 1.0.0 registrada |

Não executado (hosts bloqueados): `fetch-navigator-data`, `precompute-navigator`, consulta ao Horizons, teste SPICE × Skyfield, conferência dos SHA-256 do DEM e dos kernels, deploy na Vercel e verificação manual de teclado e de 390 px (CA-10).
