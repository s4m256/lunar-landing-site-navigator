# Ari — estado técnico verificável

Inventário de leitura, em **15/11/2026, aproximadamente 00:27 UTC**. Isto separa código disponível, integração e evidência; não é certificação científica ou aprovação para merge.

## Branches: qual abrir e por quê

Links fixados nos commits inspecionados; os nomes das branches podem avançar.

| Referência | Commit | Estado e uso |
| --- | --- | --- |
| `main` | [23cc0c7](https://github.com/s4m256/lunar-landing-site-navigator/tree/23cc0c7) | Pipeline amplo `navigator`, interface de grades e guia de acessibilidade. **Não equivale ao MVP A auditado.** |
| `feat/mvp-a-scientific-integration` | [21d539b](https://github.com/s4m256/lunar-landing-site-navigator/tree/21d539b) | [PR #6](https://github.com/s4m256/lunar-landing-site-navigator/pull/6), rascunho para `main`; **conflitos detectados**. Base da linhagem das duas experiências. |
| `feat/lunar-topographic-visibility` | [7d8a9f6](https://github.com/s4m256/lunar-landing-site-navigator/tree/7d8a9f6) | MVP B sobre MVP A: janela horária; horizonte topográfico científico não disponível. Sem PR próprio listado na consulta. |
| `feat/landing-guide-experience` | [7659e62](https://github.com/s4m256/lunar-landing-site-navigator/tree/7659e62) | [PR #7](https://github.com/s4m256/lunar-landing-site-navigator/pull/7), rascunho **para a branch MVP B**, sem conflito contra essa base. Mapa de superfície em tela inteira, 2D superior/3D inclinado, A/B, painéis e tempo. |
| `feat/minimal-lunar-explorer` | [25fdf9f](https://github.com/s4m256/lunar-landing-site-navigator/tree/25fdf9f) | Minimalista, deriva do MVP A. Sem PR listado. Um observador, datas diárias, Sol/Terra simultâneos. |
| `feat/guided-lunar-mission` | [4a20619](https://github.com/s4m256/lunar-landing-site-navigator/tree/4a20619) | Playable guiada sobre a minimalista. Sem PR listado. Quatro observadores novos e três cenários. |
| `feat/quake-inspired-mission` | [0e6f5f3](https://github.com/s4m256/lunar-landing-site-navigator/tree/0e6f5f3) | Continuação da missão guiada com astronauta, texto e voz opcional. **Versão playable mais recente encontrada**, apesar do nome da branch. Sem PR listado. |
| `feat/landing-guide-mvp-ui` | [7e7a65b](https://github.com/s4m256/lunar-landing-site-navigator/tree/7e7a65b) | Outra implementação Landing Guide, diretamente sobre `main`; arquitetura UX e prompt. Não é o PR #7 e não deve ser incorporada inteira por conveniência. Sem PR listado. |

Histórico científico: [PR #4](https://github.com/s4m256/lunar-landing-site-navigator/pull/4), motor `a491081`; [PR #5](https://github.com/s4m256/lunar-landing-site-navigator/pull/5), correções/auditoria `063ba0a`, **com base na branch do #4**. O PR #6 incorpora frontend #2 e ciência/auditoria #4/#5 localmente. Os PRs #2/#4/#5 continuam abertos; #1 e #3 estão integrados. Não duplicar essas mudanças ao reconciliar o histórico.

## Dados e diferença entre as experiências

| Dataset/uso | Locais e tempo | Interpretação permitida |
| --- | --- | --- |
| MVP A; base auditada | `south-a`: −89,5°/0°E; `south-b`: −89°/90°E. Altura radial 0 m. Quatro séries, 365 timestamps diários cada, `[2026-01-01, 2027-01-01)` UTC. | Azimute e elevação dos centros do Sol/Terra em horizonte idealizado. A tela minimalista usa apenas `south-a`, embora o artefato preserve os dois locais. |
| MVP B; PR #7 | Mesmos dois locais. Quatro séries de **721 timestamps** entre 15/11/2026 00h e 15/12/2026 00h UTC, inclusive: **720 intervalos horários**. | Estados amostrados em relação a 0°; não duração contínua. `topographic_visible` continua `null`. |
| Missão guiada/playable | `mission-a/b/c/d`: latitude −85°, longitudes leste 0°/90°/180°/270°, altura radial 0 m. Dois lotes anuais completos; a UX oferece 24/03, 28/04 e 08/09/2026, 00h UTC. | Escolha didática: ambos os centros estritamente acima de 0°. Não é recomendação de pouso, energia ou comunicação. |

O objetivo booleano da missão é `elevaçãoSol > 0 && elevaçãoTerra > 0`, sem arredondamento. Em março atendem B e C; em abril A; em setembro D, conforme a [auditoria própria](https://github.com/s4m256/lunar-landing-site-navigator/blob/0e6f5f3/docs/audits/mission/README.md). Zero não atende. Não tratar o resultado do exercício como Landing Score.

Na linhagem auditada: SPICE/DE421, `IAU_MOON`, correção `CN+S`, esfera de raio 1.737.400 m. Azimute local: norte 0°, leste 90°. Coordenadas iguais em `IAU_MOON` e `MOON_ME_DE421` não garantem o mesmo ponto físico; azimutes de observadores diferentes usam bases locais diferentes.

## Terreno, sombra e alegações que exigem cuidado

- **Minimalista:** LDEM_4 contextual, 33×33 vértices/3,75 km; fonte via espelhos documentados com label e hashes. Não houve transformação entre o observador `IAU_MOON` e o DEM ME/DE421. O terreno não calcula obstrução, sombra científica ou visibilidade. [Evidência e limites](https://github.com/s4m256/lunar-landing-site-navigator/blob/25fdf9f/docs/terrain-source.md).
- **Playable:** mapa/crateras/voos/pouso são ilustrativos; corte explica o ângulo, não interseção com montanhas. [Dados](https://github.com/s4m256/lunar-landing-site-navigator/blob/0e6f5f3/docs/mission-data.md).
- **PR #7:** terreno PDS LOLA real e transformação documentada de referenciais para a cena, mas malha reduzida e sombras GPU são aproximações visuais. Isso não transforma os resultados A/B em janelas topográficas. [Pacote de mudanças](https://github.com/s4m256/lunar-landing-site-navigator/blob/7659e62/docs/landing-guide-package-1.md).
- **`main` e `landing-guide-mvp-ui`:** contêm alegações/capacidades de Horizons, relay, energia e score de outra linhagem. Sua presença no código ou README não as torna evidência aceita no MVP A. Exigem revisão própria antes de apresentação como fato científico.

Os kernels da auditoria A/playable têm proveniência de distribuições de terceiros e hashes preservados; não houve confirmação direta completa no servidor NAIF nem comparação independente bem-sucedida com Horizons. A completude atual do LSK continua uma limitação documentada. Reproduzir números com os mesmos arquivos não certifica precisão física.

## Arquitetura e áreas de trabalho

| Área | Onde olhar | Regra de colaboração |
| --- | --- | --- |
| Interface minimalista | `frontend/src/explorer/` em `25fdf9f` | Entrada `MinimalExplorer.tsx`; cena `LunarScene.tsx`; preservar dados/contratos. |
| Interface playable | `frontend/src/mission/` em `0e6f5f3` | `MissionApp.tsx`, `mission-data.ts`, diagramas/estilos; não trocar o resultado por uma regra narrativa. |
| Landing Guide/PR #7 | `frontend/src/LandingGuide.tsx`, `SurfaceTerrainView.tsx` e `terrain/` em `7659e62` | Conferir a árvore dessa branch antes de reutilizar câmera/terreno; não é a mesma implementação de `landing-guide/` na outra branch. |
| UX da linhagem main | `frontend/src/landing-guide/` em `7e7a65b` | Revisar separadamente UX reaproveitável e pressupostos do dataset `navigator`. |
| Ciência offline | `science/` e ferramentas de auditoria da branch escolhida | Mudança precisa de revisão científica, reprodução e testes próprios; não necessária para este onboarding. |
| Contratos | `contracts/` | JSON Schema normativo. Coordenar produtor, consumidor, exemplos e testes se houver necessidade real de mudança. |
| Compartilhados | `App.tsx`, estilos globais, lockfile, CI e raiz | Combinar responsável antes de editar; evitar alterações concorrentes invisíveis entre frentes. |

Não compartilhar código apenas por ter nome parecido. Compartilhar semântica: identidade de amostra, unidades/UTC, validação, proveniência, mensagem de limite e padrões acessíveis. As experiências podem manter fluxos distintos.

## Checks: o que foi observado agora

| Referência | Evidência consultada no GitHub | Limite |
| --- | --- | --- |
| PR #7, `7659e62` | `frontend`, `science`, `Vercel`, `Vercel Preview Comments`: SUCCESS. Base limpa/mergeável na consulta. | CI não certifica precisão física nem ausência de conflitos contra `main`; a base é MVP B. |
| PR #6, `21d539b` | Rollup retornou apenas `Vercel` e `Vercel Preview Comments`: SUCCESS. `CONFLICTING`/`DIRTY`. | Não foi demonstrado CI frontend/science atual nesse rollup. Não pronto para merge. |
| Minimalista, `25fdf9f` | Documento histórico registra 82 testes frontend, 8 infraestrutura, 62 Python e navegador/Axe. | Não reexecutados neste inventário. [Registro](https://github.com/s4m256/lunar-landing-site-navigator/blob/25fdf9f/docs/minimal-explorer.md). |
| Missão guiada, `4a20619` | Documento histórico registra 130 frontend, 10 infraestrutura, 62 Python e revisão estática/offline. | Não reexecutados aqui; não transferir automaticamente ao commit posterior de voz. [Registro](https://github.com/s4m256/lunar-landing-site-navigator/blob/4a20619/docs/guided-mission.md). |
| Voz, `0e6f5f3` | Runner distingue API simulada de vozes reais; Chromium gerenciado não tinha voz instalada. | Som audível e funcionamento da voz offline não certificados. [Limites](https://github.com/s4m256/lunar-landing-site-navigator/blob/0e6f5f3/docs/guide-voice.md). |

Para mudanças de interface, usar os scripts disponíveis na branch: `npm ci --include=dev`, `npm run test:infra`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check:deploy`, além de teclado/mobile/ausência/erro no navegador. Os runners estão documentados em cada frente. `npm run build:offline` existe na playable; não presumir que exista nas outras.

Reprodução científica exige o ambiente Python e os arquivos documentados na auditoria correspondente. Não anunciar testes com kernels reais se a execução os pulou. Acesso ao frontend estático não depende deles.

## Fontes e como atualizar este inventário

Fontes normativas de cada linhagem: [contratos do MVP A](https://github.com/s4m256/lunar-landing-site-navigator/blob/21d539b/contracts/README.md), [geometria](https://github.com/s4m256/lunar-landing-site-navigator/blob/21d539b/science/GEOMETRY.md), [auditoria DE421](https://github.com/s4m256/lunar-landing-site-navigator/blob/21d539b/docs/audits/pr4/README.md), [integração A](https://github.com/s4m256/lunar-landing-site-navigator/blob/21d539b/docs/mvp-a-integration.md), [MVP B](https://github.com/s4m256/lunar-landing-site-navigator/blob/7d8a9f6/docs/mvp-b-visibility.md). Contratos diferentes não devem ser tratados como substitutos transparentes.

Comandos de leitura usados: `git fetch origin`, `git status`, `git for-each-ref`, `git log`, `git merge-base`, `git ls-tree`, `git show`, `gh pr list --state all` e `gh pr view 6/7` com `mergeable`, `mergeStateStatus` e `statusCheckRollup`. A documentação de cada frente foi lida na branch apropriada. Nenhum teste científico ou build de aplicação foi reexecutado para este documento.

Antes de assumir uma tarefa, atualize refs e repita a consulta do PR correspondente. Registre o novo SHA no cartão: uma descrição antiga de CI verde não substitui os checks do commit atual.
