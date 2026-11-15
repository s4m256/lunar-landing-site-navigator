# SPA-13 — Checklist de submissão (QA/Deploy)

> **Atualização da integração SPA-12 (`feat/spa-12-integration`).** Este checklist registra a rodada de QA
> sobre a `main` (seção 6 em diante: números daquela rodada). Na integração: D2 resolvido no contrato 1.1.0
> (distância desconhecida = `null`), D3 resolvido no código pela SPA-10 (o xfail virou teste normal), D1
> continua como xfail estrito; F1 (rótulos) e F7 (fórmulas duplicadas) foram tratados no frontend; F5 em parte
> (o marcador de 5200 m saiu, as 721 h de D1 continuam); o orçamento de JS caiu para 1 MiB porque o dataset
> deixou de ir no bundle. Resultados
> atuais dos comandos e o mapa dos critérios de aceite: [`docs/integration.md`](../integration.md).

NASA Space Apps Challenge 2026, desafio "Lunar Landing Site Navigator". Estado avaliado: `main` em
`23cc0c7` mais a branch `chore/spa-13-qa-submission`, que só altera testes, CI e esta pasta (a
aplicação publicada é a mesma da `main`). Revisão de 15/11/2026.

**Prazo:** submissão fecha em 15/11/2026 às 23:59, hora do Local Event do Team Owner (O2). Para o
julgamento global, o projeto precisa ser submetido pela página do projeto dentro desse prazo (O4).

Status: **feito** = executado ou verificado nesta tarefa, com evidência; **pendente** = ação da equipe,
possível hoje; **bloqueado** = depende de acesso ou insumo indisponível neste ambiente (precisa de
uma pessoa). Os códigos O*, R* e H* remetem ao rascunho de requisitos SPA-5. Os responsáveis são
sugestões por papel; nomes só onde a documentação do repositório já os usa.

Documentos desta pasta:

- [project-description-en.md](project-description-en.md): campos do formulário, em inglês.
- [demo-script.md](demo-script.md): vídeo de 30 s e alternativa de 7 slides.
- [third-party-notices-draft.md](third-party-notices-draft.md): dados, bibliotecas, licenças e referências.

## 0. Bloqueantes — resolver antes de clicar em "Submit for Judging"

| # | Ação | Responsável sugerido | Status |
| --- | --- | --- | --- |
| B1 | Abrir a [página do desafio](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/), arquivar texto e lista de recursos, conferir se a aplicação responde aos objetivos (critério Relevância) e se o enunciado exige relevo ou sítios reais (SPA-7, D1). | Produto/Ciência (Isaac) | **bloqueado** aqui: `spaceappschallenge.org` recusado para agentes. Precisa de navegador humano. |
| B2 | Decidir o produto submetido: `main` (motor LOLA + SPICE + relay + score) ou a linhagem do PR #6 (MVP A, mais conservador, menos funções, em conflito com a `main`). | Team Owner + Isaac | **pendente**. Todo o material desta pasta descreve a `main`. Trocar exige reescrever descrição e demo e refazer a validação da seção 6. Leitura do QA: a `main` é a única linhagem verificada aqui de ponta a ponta (build, testes, preview, navegador); submetê-la é defensável só com B3 feito ou com as limitações declaradas como no rascunho em inglês. |
| B3 | Corrigir rótulos da interface que afirmam mais do que a evidência (achado F1): chip "JPL Horizons: verified", "cross-checked with Skyfield" e "Validação Cruzada JPL Horizons" na caixa de proveniência, selos "CLPS OK", legenda "eclipse parcial", título "Ranking dos Sítios Candidatos (Artemis III…)". | Frontend (Elias), com Ciência | **pendente**. Fora do escopo do QA (`frontend/src`). Os textos de proveniência vêm do dataset; regenerá-lo exige DEM e kernels, então o caminho rápido é ajustar a exibição. |
| B4 | Versionar `LICENSE` OSI na raiz e o arquivo final de avisos de terceiros (seção 4). | Team Owner | **pendente**. Não há `LICENSE` em nenhuma branch. |
| B5 | Publicar avisos de licença junto com o site: o bundle minificado não tem nenhum (achado C2). | Frontend (Elias) | **pendente** |
| B6 | Deploy público na Vercel, aberto em janela anônima, sem erro de console, com JS/CSS 200 (seção 5). | Quem tem acesso à conta Vercel | **bloqueado** aqui: sem acesso à conta e sem URL registrada no repositório. |
| B7 | Repositório público na hora da submissão (O6, R3). | Team Owner | **bloqueado** aqui: a API do GitHub não está habilitada nesta sessão; não verificado. |
| B8 | Preencher o formulário em inglês a partir de `project-description-en.md`, resolvendo cada `[CONFIRM]` e `[VERIFY]`. | Team Owner + Isaac | **pendente** (rascunho feito) |
| B9 | Confirmar a declaração de uso de IA com cada membro (R5). | Todos | **pendente** (rascunho com lacunas) |
| B10 | Gravar e hospedar a demo (≤ 30 s ou ≤ 7 slides), link público sem login (R2, R3). | Team Owner | **pendente** (roteiro feito) |
| B11 | Confirmar fuso e horário de fechamento com o Local Lead e submeter. | Team Owner | **pendente** |

## 1. Fontes oficiais

| Fonte | O que sustenta | Situação (segundo SPA-5) |
| --- | --- | --- |
| [Página do evento 2026](https://www.spaceappschallenge.org/2026/) | Datas, prazo (O2) | Lida em 15/11 por ferramenta, não por pessoa |
| [Participant FAQs](https://www.spaceappschallenge.org/resources/participant-faqs/) | Trabalho pré-evento proibido (O1), equipe (O3), submissão pela página do projeto (O4) | Lida, edição 2026 |
| [Termos 2026](https://www.spaceappschallenge.org/legal/) | Licença OSI ou Apache 2.0 por padrão (O6), licenças de terceiros identificadas (O7), citar toda fonte (O8), menores e vídeo (O9), elegibilidade (O10) | Lida, edição 2026 |
| [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) | Campos em inglês (R1), demo 30 s / 7 slides (R2), links públicos (R3), dados NASA (R4), IA (R5) | Página exibia edição 2025: reconfirmar |
| [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide) | Critérios (R6), elegibilidade global e inglês (R7) | Página exibia edição 2024: reconfirmar |
| [Página do desafio](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/) | Objetivos e recursos (H1–H3) | **Não lida** (B1) |

Uma pessoa deve reabrir cada link e conferir a redação literal antes de submeter (limite declarado na SPA-5).

## 2. Equipe e elegibilidade

| Item | Responsável sugerido | Status |
| --- | --- | --- |
| No máximo 6 membros, todos no mesmo Local Event e na aba Members; mudanças de equipe fecham em 15/11 (O3). | Team Owner | pendente |
| Projeto associado ao desafio oficial, não a "Create Your Own Challenge" (O5). | Team Owner | pendente |
| Trabalho pré-evento (O1): o primeiro commit (`287ec07`, só inicialização) é de 14/11 às 08:59:07 −03:00, um minuto antes da abertura às 9:00. Confirmar o fuso do Local Event e registrar a explicação, se necessário. | Team Owner | pendente |
| Menores: registro pelo responsável legal; nenhum nome, voz ou imagem de menor no material (O9). | Team Owner | pendente |
| Elegibilidade e controle de exportação (O10). | Todos | pendente |

## 3. Formulário e demo

| Campo | Fonte do texto | Status |
| --- | --- | --- |
| Project Name | `project-description-en.md` | pendente: confirmar nome |
| High-Level Project Summary | idem | rascunho feito |
| Link to Project Demo | demo publicada (B10) | pendente |
| Link to Final Project | repositório (B7) e URL Vercel (B6) | bloqueado |
| Detailed Project Description, com limitações | `project-description-en.md` | rascunho feito |
| NASA Data | idem | rascunho feito |
| Space Agency Partner & Other Data | idem | pendente: fontes das órbitas e constantes |
| Use of Artificial Intelligence | idem | pendente: B9 |
| References | idem e `third-party-notices-draft.md` | pendente: itens `VERIFICAR` |
| Project Submission Verification | formulário | pendente |

Demo (R2, R3, R5, O9), roteiro em `demo-script.md`:

- [ ] Um formato só: vídeo ≤ 30 s **ou** ≤ 7 slides com o título. Exceder tira o projeto do julgamento global.
- [ ] Inglês (legendas no vídeo). A interface está em português; as legendas explicam a tela.
- [ ] Hospedagem externa com link público sem login, testado em janela anônima. Segundo o guia de submissão (edição 2025 exibida), a página do projeto só aceita imagens (JPG, PNG, GIF até 10 MB).
- [ ] Vídeo feito pela equipe; mídia gerada por IA com marca d'água visível e declarada.
- [ ] Nenhum logotipo ou identidade visual da NASA gerado ou alterado por IA. O cabeçalho da interface usa o texto "NASA Space Apps Challenge :: Lunar Landing Sites" (sem logotipo): conferir a regra de marca com o Local Lead.

## 4. Licença e atribuições — o que fazer

1. **Escolher a licença do projeto** (código e dataset derivado). Os Termos exigem conteúdo livre ou open
   source (OSI); sem licença indicada, a NASA distribui o conteúdo original sob Apache 2.0 (O6). Opções
   diretas: Apache-2.0 (igual ao padrão, com cláusula de patentes) ou MIT (mais curta). Decisão do
   Team Owner com a equipe. — pendente
2. **Criar `LICENSE`** na raiz com o texto oficial e o titular, por exemplo "Copyright 2026 <nome da
   equipe>". — pendente
3. **Declarar a licença nos manifestos:** `license` em `package.json`, `frontend/package.json` e
   `science/pyproject.toml`. Hoje o npm lista o próprio workspace sem licença. São arquivos da raiz e da
   ciência: coordenar com os donos (AGENTS.md). — pendente
4. **Finalizar os avisos de terceiros:** revisar `third-party-notices-draft.md`, resolver cada
   `VERIFICAR` e versioná-lo como `THIRD-PARTY-NOTICES.md` na raiz. Os Termos não aceitam solução sem
   as licenças de terceiros identificadas (O7). — pendente
5. **Avisos no site publicado:** React, ReactDOM, scheduler, Ajv, fast-deep-equal e json-schema-traverse
   (MIT) e fast-uri (BSD-3-Clause) estão no bundle, que não contém nenhum aviso. Publicar um arquivo de
   avisos com o site (por exemplo em `frontend/public/`) e linká-lo na página, ou preservar os
   comentários legais no build. — pendente (Frontend)
6. **Dados NASA:** não relicenciar. Citar LOLA, kernels NAIF, Horizons e o comunicado das regiões
   Artemis III em References, com a forma recomendada por cada fonte (itens `VERIFICAR`). — pendente
7. **CSPICE:** o SpiceyPy (MIT) embute a biblioteca CSPICE da NAIF; conferir as regras de uso e de
   crédito da NAIF (host bloqueado aqui). — bloqueado aqui
8. **Valores sem fonte:** órbitas de relay, constantes físicas e coordenadas dos 10 pontos não têm
   referência no código. Citar a fonte ou declarar como escolha da equipe (já feito no rascunho em
   inglês). — pendente (Ciência)

## 5. Deploy

| Verificação | Status | Evidência |
| --- | --- | --- |
| `vercel.json` coerente com o build da raiz | feito | `npm run check:deploy` aprovado |
| Build de produção servido localmente (`vite preview`) | feito | `index.html`, JS (1 782 785 B) e CSS (8 716 B) com HTTP 200 e tipos `text/html`, `text/javascript`, `text/css` |
| Renderização real, desktop 1440×900 | feito | Chromium headless 153.0.8010.12 (Playwright): título, 10 sítios no seletor, 10 linhas no ranking, 5 SVG; 0 erros de console, 0 erros de página, 0 requisições fora da origem, 0 falhas de rede |
| Interações | feito | Troca de sítio (crista 88.2 → piso de Shackleton 39.6); relay desligado no piso: 23.4; "Animar 30d" avança o tempo; caixa de proveniência abre |
| Largura de celular (390 px) | feito, **com defeito** | Rolagem horizontal: largura do documento 511 px (achado F2) |
| Deploy na Vercel (Node 24, raiz como Root Directory, `main` como Production Branch) | **bloqueado** | Seguir `docs/deploy.md`; abrir a URL em janela anônima, conferir console, rede, recarga e 390 px; registrar a URL em B6 |
| Navegadores reais (Chrome, Firefox, Safari, celular) | pendente | Só Chromium headless foi testado |

Observação: o servidor responde 200 para qualquer rota (fallback do `vite preview`), então uma URL
errada não aparece como 404 no preview local. A Vercel pode se comportar diferente: testar a URL final.

## 6. Validação executada — resultados reais (15/11/2026)

Ambiente: Linux. O Node do PATH é 22.23.4 (npm 10.9.9), fora do requisito `>=24 <25`. A validação usou
o Node 24.22.1 com npm 11.19.1 que já existe em `/opt/node24` (fora do PATH);
`npx -y node@24` também funciona (24.22.3). Python 3.13.18 no `.venv` e 3.12.3 em venv temporário com
instalação não editável, como na CI. Antes da rodada final, os caches de bytecode do pytest (copiados
de outro checkout, mesmas fontes) foram apagados.

| Comando | Resultado |
| --- | --- |
| `npm ci --include=dev` | OK: 164 pacotes, 0 vulnerabilidades. Aviso do npm 11.19: o `postinstall` do esbuild não rodou (allowScripts); o build passa mesmo assim |
| `npm run test:infra` | 8 aprovados (5 originais, 2 do commit `404b24d`, 1 desta revisão) |
| `npm run typecheck` | OK |
| `npm test` | 1 arquivo, 4 testes aprovados (Vitest 4.1.12) |
| `npm run build` | OK: JS 1 782,79 kB (gzip 601,53 kB), CSS 8,72 kB; aviso do Vite de chunk > 500 kB |
| `npm run check:deploy` | OK: 1 bundle, 1 782 785 de 3 145 728 bytes do orçamento |
| `pytest -ra -o xfail_strict=true` (em `science/`, Python 3.13 e 3.12) | 52 aprovados, 1 ignorado (SPICE × Skyfield: sem kernels NAIF), 3 xfail estritos (achados D1–D3). A `main` tinha 15 aprovados e 1 ignorado |
| `python -m build science` | OK: `lunar_science-0.2.0.tar.gz` e `lunar_science-0.2.0-py3-none-any.whl` |
| `python -m lunar_science` e wheel instalada fora do checkout | Ambos emitem `{"status": "not_implemented", ...}` (achado C3) |

Não executado (hosts bloqueados ou sem acesso): `fetch-navigator-data`, `precompute-navigator`,
consulta ao Horizons, teste SPICE × Skyfield, conferência dos SHA-256 do DEM e dos kernels, deploy na
Vercel, auditoria de acessibilidade com leitor de tela.

## 7. Achados de QA

### Ciência e dados (xfail estrito em `science/tests/test_known_cases.py`)

Os três somem da lista de xfail quando o dataset for corrigido: com `xfail_strict`, um xfail que
passar derruba a CI e força a remoção do marcador.

- **D1. Durações maiores que a janela.** Sombra contínua e blackout DTE contam amostras × passo: o piso
  de Shackleton e 26 nós em PSR publicam 721 h numa janela de 720 h; `min_battery_100w_wh` herda o erro
  (72 100 Wh). `sunlit_hours` usa outra convenção (720 h na crista). Dono: Ciência.
- **D2. Distância a PSR com valor de fallback.** Sem PSR na busca, o código devolve 5200 m, publicado
  como distância medida e usado no score (`de_gerlache_rim_2`, centro e 25 nós). Dono: Ciência.
- **D3. Envoltória solar não é limite superior.** `max_solar_elevation_curve` (usada na classificação
  PSR) fixa a latitude subsolar em −1,543°; as elevações publicadas do Sol a excedem em até 0,014° nos
  10 sítios. Confirma a auditoria SPA-9, seção 6.2. Dono: Ciência.

### Interface (`frontend/src`, fora do escopo do QA)

- **F1. Rótulos não sustentados** (B3): "JPL Horizons: verified", "cross-checked with Skyfield",
  "CLPS OK", "eclipse parcial". Segundo a auditoria, `verified` é gravado sem tolerância e o Skyfield
  nunca rodou para gerar o dataset.
- **F2. Rolagem horizontal a 390 px.** A `.mission-bar` fica com 468 px: o `<select>` com nomes longos
  força a largura. Correção provável no CSS: `min-width: 0` nos filhos do grid e `max-width: 100%` no
  `select`. Afeta WCAG 1.4.10 (Reflow).
- **F3. Rótulo envolvendo o botão.** O `<label>` "Instante da Missão" envolve o botão "Animar 30d" e
  o controle deslizante. Na árvore de acessibilidade do Chromium, o nome do botão é "Instante da Missão
  (Ciclo Sinódico): 2026-11-15T00:00:00Z 0", sem "Animar 30d", e clicar no texto do rótulo inicia a
  animação. Correção provável: tirar o botão de dentro do `<label>`.
- **F4. Rótulos cortados** no gráfico de janelas de enlace: aparecem "TE (Terra)", "LFO 3-Sat",
  "RO (50km)" e "ombinado".
- **F5. Interface reproduz D1 e D2:** o ranking mostra 721,0 h e 5200 m; `navigator/math.ts` usa a
  mesma contagem de amostras.
- **F6. Idioma:** `lang="pt-BR"` e textos em português, enquanto a submissão é em inglês (R1, R7).
- **F7. Fórmulas do score duplicadas** em Python e em `math.ts`: risco de divergência (auditoria 6.4).

### Conformidade e documentação

- **C1.** Sem `LICENSE` e sem campo `license` nos manifestos (B4).
- **C2.** Bundle de produção sem avisos de licença: 0 ocorrências de `@license` e de `Copyright` (B5).
- **C3.** `python -m lunar_science` responde `not_implemented`, e `README.md`, `science/README.md` e
  `contracts/README.md` ainda dizem que não há pontuação nem algoritmos. Pode confundir quem avaliar.
- **C4.** `outputs/README.md` chama o dataset de "validado" e o README fala em validação cruzada com
  Skyfield e Horizons; os testes sustentam conformidade ao schema e consistência interna, não
  validação científica.
- **C5.** O dataset não é reprodutível só com o repositório (DEM e kernels externos, sem lockfile
  Python, `generated_utc` variável).
- **C6.** `test_navigator.py` exige que o relatório commitado diga `verified` (teste circular, auditoria
  4.3). Esta branch só pode adicionar testes; a remoção fica com a Ciência.

### CI (alterado nesta branch)

- `verify-deploy`: orçamento de 3 MiB para o JS carregado por `index.html` (scripts e `modulepreload`,
  contados uma vez), checagem de `modulepreload` ausente, paridade de `workspaces` e `engines` entre
  `package.json` e o lockfile.
- Job `science`: `pytest -ra -o xfail_strict=true` lista ignorados e xfails; timeout de 15 min nos
  dois jobs.
- Limite que permanece: a CI não baixa kernels, então o teste SPICE × Skyfield nunca roda lá.

## 8. Limitações a declarar

A lista completa, em inglês, está em `project-description-en.md` (seção "Limitations", 11 itens), com
base na auditoria SPA-9. Os pontos que mais afetam o critério Validade:

1. Uma janela de verão austral (15/11–15/12/2026): iluminação é o melhor caso do ano.
2. Comparação com o Horizons não reproduzida: sem resposta bruta e sem tolerância. Não dizer "validated".
3. Relays hipotéticos saturam a comunicação: todos os pontos chegam a 100 % combinado.
4. Score ilustrativo: pesos e limiares da equipe, sem incerteza nem análise de sensibilidade.
5. Terreno de 80 m/px; dados de terreno não reprodutíveis só com o repositório.
