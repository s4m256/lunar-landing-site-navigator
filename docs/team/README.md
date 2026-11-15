# Ari — comece aqui

Para Gabriel, João e demais integrantes. Retrato verificado em **15/11/2026, 00:27 UTC** (14/11, 21:27 em Brasília). Branches e checks podem mudar; os commits estão registrados no [estado técnico](estado-tecnico.md).

## O que estamos construindo

Uma experiência estática de exploração lunar que ajude alguém a entender e comparar como o **centro aparente do Sol e da Terra** aparece para observadores na Lua, em instantes efetivamente calculados. O navegador consome JSON produzido offline com Python/SPICE. Não precisamos de backend Python em produção.

**Estamos investigando duas experiências em paralelo. Nenhuma foi escolhida definitivamente.**

| Frente | Hipótese de experiência | O que existe agora |
| --- | --- | --- |
| **Playable** | Fazer uma escolha e observar sua consequência ajuda a descobrir e explicar a geometria. É a aposta de maior potencial para Samuel, **se funcionar**, e de maior dificuldade. | Missão guiada navegável, quatro locais hipotéticos, três datas, escolha de local e pouso ilustrativo. A versão mais recente inclui guia, texto e voz opcional. |
| **Minimalista** | Exploração direta, poucos controles e detalhes progressivos ajudam a compreender os dados sem tutorial. Continua sendo uma frente ativa. | Explorador de um observador, 365 datas de 2026, Sol e Terra simultâneos e relevo contextual. A entrada atual ainda não compara dois locais. |

As duas já têm código. Não devemos reconstruí-las do zero, somá-las em um aplicativo enorme ou chamar a minimalista de decisão final. Os relatórios de pesquisa anteriores são insumos; não substituem avaliação com usuários nem a decisão da equipe.

**Hoje elas não usam os mesmos locais/datas.** Comparar as telas atuais pode avaliar os fluxos, mas não provar que uma experiência ensina melhor que a outra em condições equivalentes. O inventário e o plano abaixo tratam essa diferença explicitamente.

## Leia e abra nesta ordem

1. Este guia e [AGENTS.md](../../AGENTS.md): como trabalhar sem interferir na outra frente.
2. [Estado técnico e fontes](estado-tecnico.md): qual branch contém cada implementação e qual ciência ela usa.
3. [Plano de organização no Linear](plano-linear.md): resultados esperados, dependências e critérios de saída. **É um plano preparado, ainda não sincronizado com o Linear.**
4. [Guia de acessibilidade e simplicidade](../accessibility/guia-acessibilidade-e-simplicidade.md), já presente na `main`.
5. Os documentos da sua frente, ligados na tabela técnica. Eles vivem nas respectivas branches; não espere encontrar todos os arquivos na `main`.

## O trabalho de Isaac

O repositório já identifica **Isaac na definição de UX** e **Elias na implementação**, no [índice de acessibilidade](../accessibility/README.md). Há também uma [arquitetura Landing Guide](https://github.com/s4m256/lunar-landing-site-navigator/blob/7e7a65b/docs/ui-ux/landing-guide-architecture.md) e um [prompt de concepção](https://github.com/s4m256/lunar-landing-site-navigator/blob/7e7a65b/docs/prompts/google-ai-studio-master-prompt.md) em `feat/landing-guide-mvp-ui`.

Esse material deve orientar a conversa de UX, sem assumir que toda capacidade científica mencionada nele esteja comprovada. Essa branch deriva da `main`, enquanto as experiências acima derivam do MVP A. O autor Git do commit não comprova quem concebeu cada parte. Novos acréscimos de Isaac devem ser vinculados à tarefa correspondente antes de alguém refazer o trabalho.

## Como experimentar sem perder trabalho

Requisitos das branches: **Node 24**, npm 11 e, somente para reproduzir a ciência, Python 3.12+. Comece pelo navegador estático; não baixe kernels ou DEMs para apenas conhecer a interface.

Em um clone limpo, escolha **uma** branch:

```sh
git clone https://github.com/s4m256/lunar-landing-site-navigator.git
cd lunar-landing-site-navigator
git fetch origin
# Minimalista:
git switch --track origin/feat/minimal-lunar-explorer
# Para conhecer a playable, em vez da linha anterior:
# git switch --track origin/feat/quake-inspired-mission
npm ci --include=dev
npm run dev -- --host 127.0.0.1
```

Abra o endereço informado pelo Vite. Para trocar de experiência depois, encerre o servidor, confira `git status`, preserve suas alterações, troque a branch e repita `npm ci --include=dev`. Em checkouts já preparados, use `git switch NOME_DA_BRANCH` se a branch local já existir. Não use `reset --hard` para resolver essa troca.

Para começar uma alteração, crie **sua própria branch a partir da base da frente**, não automaticamente da `main`:

```sh
# Com o checkout limpo e a base escolhida acima:
git switch -c feat/sua-tarefa-delimitada
```

Não altere a branch do colega. Antes de editar, registre no cartão qual base, commit e pasta utilizará. `App.tsx`, CSS global, lockfile, arquivos da raiz, contratos e CI são pontos de colisão; combine um responsável por alteração nesses arquivos.

## Ciência que todos precisam saber

- São **amostras calculadas**, não observações. Sol/Terra são centros aparentes; graus, UTC e identidade do observador precisam permanecer visíveis.
- O horizonte científico dessas experiências é **idealizado, 0°**. Acima dele não significa energia suficiente, enlace de rádio, terreno iluminado ou pouso seguro.
- Relevo mostrado, cratera desenhada e sombra de renderização não comprovam obstrução topográfica calculada. Não diga que o motor verificou uma montanha só porque ela aparece na tela.
- Não há validação física independente bem-sucedida contra JPL Horizons nessa linhagem auditada. Reprodução com os mesmos kernels e hashes é uma evidência diferente.
- Um ponto livre ou uma data não coberta não pode receber resultados emprestados de outro local/instante. Não interpolar silenciosamente.
- “A/B” identifica locais **dentro de cada dataset**; os locais da missão guiada não são os locais A/B do MVP A.

## Quem decide e como Gabriel e João começam

| Pessoa/frente | Responsabilidade conhecida | O que não está definido |
| --- | --- | --- |
| Samuel | Direção de produto e autorização para merge/produção. Prefere a playable se ela demonstrar valor. | Escolha final entre as experiências e limite de esforço para a comparação. |
| Isaac | Definição de UX/requisitos; material em andamento no repositório. | Quais acréscimos mais recentes já estão revisados e vinculados ao planejamento. |
| Elias | Implementação de interface, conforme o guia da equipe. | Divisão atual de arquivos com os novos integrantes. |
| Gabriel e João | Entrada na equipe agora. | Função, disponibilidade, responsável/revisor e cartões de cada um; não foram inferidos aqui. |
| Ciência e integração | Há trabalho paralelo e artefatos auditados. | Responsável nominal atual de cada revisão deve vir do acordo da equipe/Linear. |

Primeira entrega útil dos dois novos integrantes: **cada um executar uma experiência e registrar branch/commit, caminho percorrido, uma amostra conferida no JSON e um obstáculo concreto**. Em seguida, compartilhar o que encontraram e assumir uma única tarefa delimitada do plano com responsável e revisor registrados. Não começar criando novos cálculos, reescrevendo o frontend ou resolvendo sozinho os conflitos da `main`.

Para a comparação de produto, queremos observar se alguém consegue **encontrar um instante, identificar local/Sol/Terra, explicar uma conclusão pelos números e dizer o que ela não comprova**. Preferência visual e prazer de explorar também contam, mas serão registrados separadamente da compreensão científica.

## Próxima ação de equipe

Vincular a contribuição atual de Isaac e as branches existentes ao projeto do Linear, distribuir responsáveis/revisores e fechar uma pequena rodada de demonstração das duas experiências. A playable precisa demonstrar seu ciclo principal; a minimalista precisa demonstrar comparação direta, hoje ausente na entrada. Não há necessidade de novas efemérides para começar essa avaliação.
