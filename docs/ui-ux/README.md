# UI/UX Architecture & Landing Guide MVP (`docs/ui-ux/`)

Esta pasta consolida a especificação de interface, acessibilidade (WCAG 2.2 AA), revisão crítica e plano de implementação do **Landing Guide** — a experiência centrada na Lua do **Lunar Landing Site Navigator** para o NASA Space Apps Challenge 2026.

## Documentos

- [`landing-guide-architecture.md`](./landing-guide-architecture.md): Arquitetura de telas, wireframes desktop/mobile, mapa de estados, fluxo de seleção A/B, comportamento da linha do tempo, diretrizes visuais/WCAG 2.2 AA, revisão crítica de UX & limitações científicas e plano de implementação MVP vs pós-MVP.

## Relação com o Código

- Código da nova interface: [`frontend/src/landing-guide/`](../../frontend/src/landing-guide/)
- Contrato científico e cálculo físico reutilizados sem alteração:
  - [`contracts/navigator-dataset.v1.schema.json`](../../contracts/navigator-dataset.v1.schema.json)
  - [`frontend/src/navigator/math.ts`](../../frontend/src/navigator/math.ts)
  - [`docs/accessibility/guia-acessibilidade-e-simplicidade.md`](../accessibility/guia-acessibilidade-e-simplicidade.md)
