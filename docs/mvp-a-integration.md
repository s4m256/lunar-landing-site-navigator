# Integração MVP A — evidência e reprodução

## Histórico preservado

Base: main `03bbba26137e499cda82e9dd61d600d276ea78c8`.

- PR #2 / frontend `09f7152db954527deaf8eea36c1108663a53d450`, incorporado por merge local `64dd982`.
- PR #4 / motor `a491081f245965448360aa27186a7be9f129cc21`.
- PR #5 / auditoria `063ba0a78a5a8b87076334c485f008123d7787e1`, descendente de #4, incorporado por merge local `deb4e89`. Isso preserva #4 sem duplicar seu commit.
- Branch de integração: `feat/mvp-a-scientific-integration`. Nenhum conflito nos dois merges locais; nenhuma branch original ou main foi modificada. Nenhum PR foi integrado no GitHub.

## Pré-voo desta execução

`git remote get-url origin`, `git ls-remote --heads` e `git fetch --no-tags` confirmaram o repositório `s4m256/lunar-landing-site-navigator` e os quatro HEADs acima. `git log` confirmou a ancestralidade #4 → #5. Checkout inicialmente limpo. Leitura de AGENTS, README, contratos, componentes frontend, GEOMETRY, README/REPORT da auditoria e request/result realizada antes da implementação.

Node 24.22.1, npm 11.9.0 e Python 3.12.14 disponíveis. `npm ci --include=dev --cache /workspace/.cache/lunar-npm` passou; esse cache explícito evita o diretório home sem escrita deste ambiente. `.venv` preparada com instalação editável do pacote científico. A API GitHub permanece bloqueada por HTTP 403 no proxy; leituras Git e das páginas públicas funcionam. Não há dependência de Linear.

## Decisões de produto e integração

O modo inicial é a demonstração científica: dois locais fixos, datas amostradas às 00:00 UTC e seletor Sol/Terra. Mantém a identidade visual do frontend de Elias. O planejamento livre continua isolado e é explicitamente sem resultados; trocar de modo descarta seu rascunho, com aviso visível.

A família `science-status` legada continua intacta. O consumidor novo usa o schema `analysis-result` existente, sem modificar contratos. Além de Ajv com números finitos, exige os dois locais exatos, quatro pares distintos, intervalo/cadência de 2026 e 365 timestamps canônicos idênticos por série. Busca por chave local/alvo/UTC, não pela ordem das séries. Ausência de data não usa a amostra vizinha. Erro de parsing/schema/cobertura interrompe a exibição de resultados.

Pipeline: SPICE offline → JSON auditado → import estático validado → React. A aplicação e o download usam diretamente o arquivo original da auditoria; não há backend, banco, novas dependências de produção ou Python no navegador. O build publica também o JSON completo com proveniência.

Tabela numérica compara os dois locais no mesmo instante, com arredondamento visual a quatro casas e aviso de ausência de precisão certificada. Gráfico de elevação apresenta todos os pontos e horizonte 0°, com linhas apenas como guia visual; não determina duração contínua de iluminação. Não se conecta azimute em gráfico linear, evitando descontinuidade 0°/360°. Mapa polar equidistante esquemático usa distância radial proporcional a `90 + latitude`, meridiano 0° acima e 90°E à direita, sem textura ou dados de relevo.

## Ciência: executado agora versus herdado

Nesta execução, não somente herdado da auditoria:

- 44 hashes dos arquivos auditados conferidos; schemas normativos e cópias empacotadas coincidem.
- Validaram-se request/result/proveniência e semântica: dois locais, quatro séries, 365 dias em 2026, valores finitos/intervalos angulares.
- O reprodutor DE421 executou com hashes e cobertura dos segmentos para todo 2026. JSON completo e bytes reproduzidos são idênticos ao publicado; diferença angular máxima 0,0° nesta execução.
- SHA-256 do resultado: `108d2adf202442acf32ba589504482ac00b2afac830b0bf14c55bc913147e023`.
- SpiceyPy 8.0.0, NumPy 2.5.4, CSPICE N0067, Python 3.12.14.
- 62 testes Python passaram, zero skips, com kernels históricos reais. Build wheel/sdist passou. Wheel instalada em venv nova fora do checkout executou o cálculo DE421/2026 e produziu JSON igual à auditoria.

Detalhes: [evidência estruturada](evidence/mvp-a/scientific-validation.json), [log pytest](evidence/mvp-a/python-tests.txt), [resumo do reprodutor](evidence/mvp-a/reproduction-summary.json). Caminhos `/tmp` nesses registros são locais desta execução; comandos portáteis estão no README. Não são arquivos necessários à execução do frontend.

Herdado e ainda não resolvido: a tentativa Horizons da auditoria registra `network_error` HTTP 403, zero amostras comparadas; não foi repetida nesta execução. Nenhum resíduo independente foi inventado. A aquisição DE421 via PyPI/skyfield-data, mesmo reproduzida com hashes, não autentica diretamente o arquivo no servidor NAIF. Completude atual do LSK, orientação lunar de alta precisão e precisão física continuam sem certificação independente. Hipóteses e limitações estão visíveis na aplicação.

## Aceitação técnica

Os resultados finais dos testes frontend, build estático e navegador são registrados abaixo após a revisão da integração. Nenhuma evidência deste documento implica deploy público, aprovação de merge ou atendimento definitivo dos critérios SPA-7 de Isaac.

### Resultado final desta execução

- `npm ci --include=dev --cache /workspace/.cache/lunar-npm`: passou.
- `npm run test:infra`: **6 passaram**; `npm run typecheck`: passou; `npm test`: **45 passaram** em 3 arquivos.
- `npm run build` e `npm run check:deploy`: passaram. Vite emitiu aviso não bloqueante de bundle >500 kB: aproximadamente 613 kB / 158 kB gzip, incluindo schema/validador e texto científico. Não foi ocultado nem tratado como falha.
- Playwright/Chromium 156 contra o build servido pelo Vite Preview: **passou**, desktop e viewport móvel de 390 px, timezone America/Sao_Paulo. Os 24 valores conferidos cobrem ambos locais/alvos e primeiro/meio/último dia do dataset. Seleção UTC, limites temporais, números, gráfico, legendas, coordenadas, ausência de dados e isolamento de planejamento verificados.
- Download do JSON servido: SHA-256 idêntico ao original. Sem erros JavaScript, warnings de console ou recursos com falha no navegador.
- Revisão encontrou e corrigiu eixos pequenos no celular e favicon ausente. Gráfico móvel agora mantém fontes de 11 px, com região de rolagem horizontal acessível por teclado e aviso de deslize; sem overflow horizontal da página.
- Revisões adversariais independentes do consumidor/testes e da ciência não encontraram bloqueadores restantes. Longitude, UTC, pares, limites do intervalo, unidades e alegações conferidos.

[Relatório do navegador](evidence/mvp-a/browser-validation.json) e [runner usado](evidence/mvp-a/browser-review.mjs) preservam a verificação. O runner requer Playwright instalado fora do projeto e Chromium no caminho indicado; pode ser adaptado para um executável Chromium equivalente, sem mudar o app. Capturas desta execução: `/tmp/mvp-a-desktop.png` e `/tmp/mvp-a-mobile.png` (artefatos locais, não deploys nem dependências do produto).

Para reproduzir o runner neste ambiente:

```sh
npm install --prefix /tmp/mvp-a-browser --cache /workspace/.cache/lunar-npm playwright
npm run build
npm exec --workspace frontend -- vite preview --host 127.0.0.1 --port 4173
# Em outro terminal: o runner usa seu diretório para resolver Playwright.
cp docs/evidence/mvp-a/browser-review.mjs /tmp/mvp-a-browser/review.mjs
node /tmp/mvp-a-browser/review.mjs
```

Os critérios finais SPA-7/Isaac e a autorização de integração/publicação continuam com a equipe. Esta implementação encerra no conjunto demonstrativo definido, sem estender ciência ou adicionar serviços.
