# Integração Google AI Studio (`zaczusantos-ops/aistudiolandingguide`)

Esta pasta documenta a integração do protótipo aprimorado no **Google AI Studio** ([`zaczusantos-ops/aistudiolandingguide`](https://github.com/zaczusantos-ops/aistudiolandingguide), commit `6d2e531`) para dentro do repositório principal **`s4m256/lunar-landing-site-navigator`**, preservando integralmente todos os dados científicos, contratos, testes e documentações anteriores.

## O que foi incorporado ao repositório principal

- **Ativos NASA de superfície e relevo (`frontend/public/assets/lunar/`):**
  - `ldem_global_2k.png` e `ldem_south_pole_1k.png` (altimetria global e polar sul LDEM)
  - `lola_south_pole_hillshade.jpg` e `lroc_color_2k.jpg` (sombreamento LOLA e mapa cromático LROC)
- **Motor geométrico & renderização 3D em tempo real (`frontend/src/landing-guide/`):**
  - `lunarTerrainEngine.ts`: construção de atlas normal/relevo/topo em projeção equiretangular + calotas estereográficas polares.
  - `customSiteBuilder.ts`: síntese dinâmica de sítios customizados em qualquer ponto clicado, com projeção de vetores Sol/Terra de `MOON_ME` para ENU local e ray-marching de horizonte `360°`.
  - `AstronautViewport.tsx`: modo de observação em primeira pessoa na superfície lunar ("Astronaut POV").
  - `LunarViewport.tsx`: globo lunar 3D com `Three.js` (`^0.187.0`), deslocamento de relevo e fallback gracioso sem WebGL.
  - `HomeOverlay.tsx`, `ChartsDrawer.tsx`, `DataDrawer.tsx`, `SelectionPopover.tsx`, `TimePopover.tsx`, `state.ts`: suporte comparativo de até **4 locais simultâneos (A/B/C/D)** e modos de superfície (`Realista` / `Topografia`).
- **Capturas de tela preservadas (`docs/ai-studio/screenshots/`):**
  - `Captura_de_tela_2026-11-14_180854_5dcfc1b7.png`
  - `Captura_de_tela_2026-11-14_180920_a1a04f75.png`

## Ajustes feitos na integração para manter 100% do CI & Vercel íntegros

1. Dependências `three` (`^0.187.0`) e `@types/three` alocadas diretamente no workspace `@lunar/frontend` (`frontend/package.json`) com `package-lock.json` sincronizado para compatibilidade com `npm ci --include=dev`.
2. Removidas referências a fontes/CSS externas (`https://fonts.googleapis.com/...`) em `frontend/index.html` para cumprir integralmente a verificação estrita de ativos locais em [`scripts/verify-deploy.mjs`](../../scripts/verify-deploy.mjs).
3. Preservados sem exclusões: `science/`, `contracts/`, `outputs/`, `frontend/src/navigator/`, `docs/accessibility/`, `docs/ui-ux/` e `docs/prompts/`.
