# Landing Guide — validação da interface

**Registro da primeira versão, anterior ao pacote 1.** A exploração por globo foi substituída por superfície LOLA em tela inteira. Para os novos assets, sombras, verificações e limites, consulte [landing-guide-package-1.md](landing-guide-package-1.md). Os resultados de 133 testes e ausência de DEM descritos neste registro são históricos.

14/11/2026. Base: `feat/lunar-topographic-visibility` / `7d8a9f678ed146dd4b78d21ea634a39b7966d53a`. Branch de trabalho: `feat/landing-guide-experience`.

## Entrega e decisões

Entrada Landing Guide com Lua ilustrativa e duas ações. Exploração por esfera ortográfica 3D ou mapa 2D de coordenadas, com estado único para A/B, câmera, seleção por Centro/Cursor, dataset, alvo, período e UTC. Painéis reutilizáveis de Gráficos, Dados, Seleção e Tempo; ajuda curta; alternativas por teclado/lista/coordenadas.

Data e timeline só consultam amostras existentes. O período inclui seus extremos e pode conter cobertura parcial ou vazia, informada explicitamente. Início/duração ficam sob demanda no relógio. Reprodução tem pausa, velocidade e parada no fim. Um instante sem amostra possui ação explícita para voltar à primeira amostra disponível; não recebe vizinha automaticamente.

As séries pertencem a `sourceSiteId` e coordenadas exatas, não ao slot visual A/B. Uma seleção livre não herda resultados. Alterar apenas 2D/3D não modifica seleção, alvo, período ou instante. A interface anterior permanece em `?interface=legacy`; seus testes de modos passaram a importar explicitamente `LegacyApp`. A entrada nova tem testes próprios.

`science/`, `contracts/`, datasets e kernels não foram alterados nesta branch. O PR usa a branch MVP B como base, deixando a diferença pequena e revisável. A main consultada (`23cc0c7`) tem outro pipeline científico; sua reconciliação deve ser revisada separadamente, antes de integrar esta interface à main. Não houve merge nem deploy de produção.

## Verificações executadas

| Comando / método | Resultado |
|---|---|
| `npm ci --include=dev` | PASS; instalação pelo lockfile existente, sem nova dependência de produção |
| `npm run test:infra` | PASS, 7 testes; inclui hashes dos artefatos A/B |
| `npm run typecheck` | PASS |
| `npm test` | PASS, 133 testes em 8 arquivos |
| `npm run build` | PASS, build estático Vite |
| `npm run check:deploy` | PASS, arquivos locais de publicação verificados |
| `LUNAR_KERNEL_DIR=/tmp/mvp-a-historical-kernels .venv/bin/python -m pytest science/tests -ra` | PASS, 117 testes, incluindo casos com kernels históricos |
| `.venv/bin/python -m build science` | PASS, sdist e wheel; artefatos ignorados pelo Git |
| `.venv/bin/python -m lunar_science` | Saída legada `not_implemented`, conforme contrato de status; não confundida com análise |
| `scripts/browser-landing-guide.mjs` no build estático | PASS, 20 grupos de cenários em 1440×1000, 768×1000, 390×844 e 320×844 |
| Revisão independente | Bugs de modal e sobreposição encontrados, corrigidos e retestados |
| `git diff --check` | PASS |

O primeiro comando Python usou por engano um diretório inexistente de kernels e falhou em quatro casos. O comando acima, com o diretório real e hashes verificados pelo consumidor, passou em todos os 117. A primeira rodada frontend também apontou dois testes vinculados à antiga entrada; eles foram mantidos como testes da interface anterior, e os novos fluxos receberam cobertura própria. Nenhuma falha foi convertida em sucesso sem correção e nova execução.

O primeiro workflow remoto foi rejeitado antes de criar jobs: `(Line: 30, Col: 25): Unrecognized named-value: 'runner'` na expressão `runner.temp`. O erro estava herdado em `jobs.science.env`. A única alteração de CI troca esse caminho por `${{ github.workspace }}/.cache/lunar-kernels`, contexto permitido nesse nível. Não muda o conjunto de kernels, seus hashes, comandos científicos ou permissões. O resultado remoto atualizado fica nos checks do PR; os resultados da tabela acima são locais.

A integração GitHub existente gerou automaticamente um Preview Vercel com status Ready. O endereço exige login Vercel; a visita sem sessão chegou à página de autenticação, portanto não foi declarada validação funcional externa. O aplicativo foi exercitado no build estático local. Não houve publicação manual ou promoção para produção.

O build avisa sobre o tamanho do bundle: aproximadamente 1,20 MB minificado / 250 kB gzip, incluindo os JSONs científicos e os validadores. Não se ocultou o aviso. Separação futura do carregamento dos conjuntos pode reduzir o custo inicial, preservando validação e proveniência; não é dependência para executar o MVP estático.

## Aceitação no navegador

Runner reproduzível:

```sh
npm run build
npm exec --workspace frontend -- vite preview --host 127.0.0.1 --port 4174
# Em outro terminal, com Playwright/Chromium instalados:
PLAYWRIGHT_PATH=/tmp/mvp-a-browser/node_modules/playwright/index.mjs \
LANDING_GUIDE_EVIDENCE=/tmp/landing-guide-evidence \
node scripts/browser-landing-guide.mjs
```

`CHROMIUM_PATH` e `LANDING_GUIDE_URL` permitem outros executáveis/portas. Não são dependências do produto. Evidências desta execução foram guardadas fora do repositório em `/workspace/landing-guide-evidence/`, com `browser-results.json` e capturas desktop/tablet/mobile. Capturas foram abertas e inspecionadas, não apenas produzidas.

Executado em Chromium, fuso America/Sao_Paulo, UTC científico preservado, preferência de movimento reduzido:

- Start, ajuda breve, Escape, retorno de foco e painéis fechados inicialmente.
- Sol em 01/09/2026: A +0,55°, B −0,54°; Terra no mesmo instante: A +5,84°, B +5,26°, comparados ao arquivo original pelos testes do consumidor/modelo.
- Alternância 2D/3D preservando alvo e resultados; posição e identidade dos locais mantidas.
- Seleção livre em A sem resultado emprestado; B permanece correto; restauração explícita dos locais calculados.
- 721 timestamps horários, slider máximo 720, último instante 15/12/2026 00:00 UTC, ausência às 01:00, sem vizinha automática.
- Tabela dos gráficos com todas as 721 linhas; período completo visível no gráfico adaptável.
- Painéis sem sobreposição entre Gráficos e Tempo em desktop/tablet; uma folha modal por vez no celular.
- Fundo inativo nos diálogos; controles 2D/3D e ajuda ampliados; rodapé sem colisão e documento sem overflow horizontal nos tamanhos examinados.
- Sem exceções JavaScript, erros de console ou requisições externas no fluxo estático.

Também houve revisão independente de projeções/inversas, polos, longitude leste, confirmação pela mira e seleção de pontos no verso. Pontos no verso não são apresentados como se estivessem na superfície frontal; permanecem identificados na seleção acessível.

## Limites e pendências reais

- A esfera possui arte vetorial original, iluminação estática e coordenadas projetadas. Sua textura não é imagem orbital georreferenciada nem terreno lunar. Não é simulação fotométrica, não acompanha o Sol calculado e não anima sombras.
- Resultados são direções aparentes dos centros do Sol/Terra sobre horizonte tangente idealizado de 0°. Não são energia, iluminação efetiva, disponibilidade de rádio, blackout operacional, ranking ou segurança de pouso.
- O DEM LOLA continua indisponível no MVP B. Nenhuma topografia sintética foi apresentada como terreno real.
- Sem nova execução astronômica ou validação independente Horizons nesta tarefa de interface. A auditoria herdada registra bloqueio HTTP403 e ausência de conferência direta do DE421 no servidor NAIF.
- O portal oficial foi tentado antes da implementação (CONNECT403) e após mudança da rede (HTTP503 no índice e no desafio). Não foi possível ler seu conteúdo nesta execução. A proposta usa o pedido do produto, contratos, documentação e pesquisa anterior explicitamente identificada.
- Testes técnicos não provam que crianças, idosos ou pessoas usando leitores de tela completem o fluxo sem ajuda. Ainda são necessários testes humanos e auditoria completa de contraste, ampliação e tecnologias assistivas; não se alega certificação WCAG.

Fonte de requisitos de acessibilidade consultada: [guia na main em 23cc0c7](https://github.com/s4m256/lunar-landing-site-navigator/blob/23cc0c7/docs/accessibility/guia-acessibilidade-e-simplicidade.md). Proposta e wireframes: [landing-guide-design.md](landing-guide-design.md).
