# Ari — contexto do projeto

## O que ler

1. [AGENTS.md](../../AGENTS.md): regras de trabalho.
2. [Estado técnico](estado-tecnico.md): branches, dados e limitações. Consulte os documentos da frente em que vai trabalhar.
3. [Guia de acessibilidade](../accessibility/guia-acessibilidade-e-simplicidade.md) ao alterar a interface; [plano do Linear](plano-linear.md) ao organizar tarefas.

## Contexto para a IA

Copie o bloco abaixo e acrescente sua tarefa ao final. As referências são do inventário de 15/11/2026; confira os commits atuais antes de editar.

```text
PROJETO
Lunar Landing Site Navigator, para o NASA Space Apps Challenge 2026.
Repositório: https://github.com/s4m256/lunar-landing-site-navigator
Estado de referência: inventário de 15/11/2026. Confirme HEADs e checks atuais.

O produto ajuda a explorar e comparar como o centro aparente do Sol e da
Terra aparece para observadores na Lua, em instantes calculados. React,
TypeScript e Vite consomem JSON produzido offline por Python/SPICE.
A aplicação é estática; Python não roda no navegador ou em um backend.

DUAS FRENTES EM PARALELO
- Playable: escolha de local/data, consequência visível e explicação da
  evidência. É a aposta de maior potencial, se funcionar, e maior dificuldade.
  Branch mais recente no inventário: feat/quake-inspired-mission, 0e6f5f3.
  Continua feat/guided-lunar-mission, 4a20619. Já existe missão navegável,
  com guia, texto e voz opcional. Voos e pouso são ilustrativos.
- Minimalista: exploração direta, poucos controles e detalhes progressivos.
  Branch: feat/minimal-lunar-explorer, 25fdf9f. Já existe explorador com um
  observador, data UTC, Sol/Terra simultâneos e relevo contextual. A entrada
  ainda não oferece comparação A/B.

Nenhuma frente foi escolhida definitivamente. Preserve ambas. Aproveite o
código existente; não crie um terceiro produto ou reescreva tudo. Avalie
compreensão, descoberta, acesso, rigor e viabilidade. Aparência e quantidade
de efeitos, sozinhas, não decidem. Hoje as duas usam locais/datas diferentes:
comparar seus fluxos não equivale a um experimento controlado.

BASES QUE NÃO DEVEM SER CONFUNDIDAS
- MVP A: feat/mvp-a-scientific-integration, 21d539b, PR #6 para main.
  Base auditada das duas experiências. Havia conflito com main no inventário.
- MVP B: feat/lunar-topographic-visibility, 7d8a9f6, deriva do MVP A.
  Acrescenta janela horária; horizonte topográfico científico indisponível.
- Landing Guide: feat/landing-guide-experience, 7659e62, PR #7 com base
  na branch MVP B, não main. Mapa de superfície em tela inteira, 2D superior
  e 3D inclinado, A/B, tempo e painéis.
- main, 23cc0c7 no inventário, contém outro pipeline: navigator, grades,
  relay, energia e score. Não equivale ao MVP A auditado. Alegações no seu
  README não bastam como validação científica.
- feat/landing-guide-mvp-ui, 7e7a65b, deriva de main. Contém outra interface
  Landing Guide, arquitetura UX e prompt. Não é o PR #7. Reaproveitar uma
  ideia de UX não exige incorporar todo o pipeline dessa branch.

PR #5 corrige/audita o motor do PR #4 e tem como base a branch do #4.
O PR #6 incorpora localmente frontend #2 e ciência/auditoria #4/#5.
Não duplique essas mudanças nem presuma que PR aberto foi integrado.
Consulte bases, HEADs, conflitos e checks atuais antes de planejar integração.

DADOS DISPONÍVEIS
MVP A: south-a = latitude planetocêntrica −89,5°, longitude 0°E;
south-b = −89°, 90°E; altura radial 0 m. São locais hipotéticos.
Quatro séries: dois locais × Sol/Terra, 365 timestamps diários por série,
de 2026-01-01 inclusive a 2027-01-01 exclusivo, às 00h UTC.
A entrada minimalista usa apenas south-a; o JSON preserva os dois locais.

MVP B: mesmos locais, 721 timestamps horários entre 15/11/2026 00h e
15/12/2026 00h UTC, ambos inclusive. São 720 intervalos, não 721 horas.
Os estados são amostrados; topographic_visible permanece null.

Playable: quatro observadores novos, mission-a/b/c/d, latitude −85°,
longitudes leste 0°/90°/180°/270°, altura radial 0 m. A interface oferece
24/03, 28/04 e 08/09/2026 às 00h UTC, extraídos de dois lotes anuais.
Não são os locais A/B do MVP A. O exercício verifica estritamente
“elevação do Sol > 0 e elevação da Terra > 0”, sem arredondamento.
Isso não é recomendação de pouso nem Landing Score.

CIÊNCIA E LIMITES
- Amostras calculadas, não observações. Ângulos em graus, datas em UTC;
  azimute local norte = 0°, leste = 90°. Azimutes de locais diferentes
  usam bases locais diferentes; sua diferença não é um ângulo inercial.
- Linhagem auditada: DE421, SPICE, IAU_MOON, correção CN+S, esfera de
  raio 1.737.400 m e horizonte idealizado de 0° para os centros dos astros.
- Elevação acima de 0° não garante terreno iluminado, energia, comunicação
  operacional ou segurança. Não inferir duração contínua entre amostras.
- Relevo da minimalista: LOLA LDEM_4 contextual, sem transformação entre
  o observador IAU_MOON e o DEM ME/DE421. Não calcula obstrução topográfica.
- PR #7: DEM LOLA real e transformação documentada para a cena, mas malha
  reduzida e sombras GPU são aproximações visuais. Não são janelas
  topográficas validadas. Crateras/voos da playable são ilustrações.
- Não houve comparação independente bem-sucedida contra JPL Horizons na
  linhagem auditada. Hashes e reprodução com os mesmos kernels demonstram
  integridade/reprodutibilidade, não precisão física independente.
  Aquisição direta completa na NAIF e atualidade do LSK não confirmadas.
- Não apresentar dados para outro local/data, interpolar silenciosamente,
  substituir erro por números ou confundir ausência com invisibilidade.

ONDE TRABALHAR
Leia AGENTS.md, README.md e contracts/ na branch da tarefa. Arquivos podem
existir em uma branch e não em outra; use git show origin/BRANCH:caminho.
- Minimalista: frontend/src/explorer/, docs/minimal-explorer.md e
  docs/terrain-source.md.
- Playable: frontend/src/mission/, docs/guided-mission.md,
  docs/mission-data.md, docs/audits/mission/README.md e docs/guide-voice.md.
- MVP A: science/GEOMETRY.md, docs/audits/pr4/ e docs/mvp-a-integration.md.
- MVP B/PR #7: docs/mvp-b-visibility.md e docs/landing-guide-package-1.md.
- UX: docs/accessibility/; arquitetura adicional em
  feat/landing-guide-mvp-ui:docs/ui-ux/landing-guide-architecture.md.

Crie sua branch a partir da base correta da tarefa. Preserve alterações
locais e branches de colaboração. Coordene App.tsx, estilos globais,
lockfile, raiz, CI e contratos antes de alterações concorrentes.
JSON Schema é normativo. Não altere ciência/contratos por conveniência visual.
Não faça merge, deploy em produção ou ações destrutivas sem autorização.
Não introduza backend, relay, bateria, score ou novos cálculos fora da tarefa.

EXECUÇÃO E VERIFICAÇÃO
Node 24 e npm 11; Python 3.12+ somente para ciência offline.
Na branch escolhida: npm ci --include=dev; npm run dev.
Para mudanças de interface: npm run test:infra, npm run typecheck,
npm test, npm run build e npm run check:deploy, conforme os scripts da branch.
Teste teclado, celular, seleção/data, valores do JSON e estados sem dados/erro.
Reprodução científica exige dependências e arquivos da auditoria correspondente.
Registre o que realmente executou; CI verde não comprova precisão física.

ORGANIZAÇÃO
O plano em docs/team/plano-linear.md e seu CSV não estavam sincronizados
com o Linear no inventário: a conexão não disponibilizou ferramentas.
ARI-01 a ARI-08 são chaves locais, não IDs do Linear. SPA-7/9/10/12 são
referências históricas a consultar, sem status ou responsáveis presumidos.
Reutilize cartões existentes antes de criar outros.

Execute somente a tarefa recebida. Antes de editar, identifique a branch,
o commit, os arquivos envolvidos e os critérios de aceite. Ao terminar,
informe alterações, verificações reais e bloqueios, com links de revisão.
```
