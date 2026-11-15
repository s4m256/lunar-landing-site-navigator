# Ari — plano de organização no Linear

**Estado desta entrega: preparado, não sincronizado.** Não há ferramentas do Linear disponíveis nesta sessão, mesmo após a solicitação de conexão. Não foi possível consultar o projeto, membros, statuses ou issues. Nenhum cartão foi criado, movido ou atribuído. O [CSV de planejamento](backlog-candidato.csv) preserva o trabalho para aplicação após a conexão; não é prova de importação nem de compatibilidade automática com o importador do workspace.

## Estrutura proposta, sem multiplicar projetos

Usar **o projeto Ari existente**, preservando seus identificadores e workflow. Dentro dele, distinguir **Compartilhado**, **Playable** e **Minimalista** por labels ou milestones já existentes. Não criar três projetos, dois motores científicos ou um workflow novo para resolver organização.

Cada cartão precisa conter: resultado esperado, branch/SHA base, arquivos envolvidos, responsável e revisor acordados, dependências, critérios de aceite e link de evidência. Não inventar datas ou atribuições. Um trabalho em branch é “implementado em branch”, não automaticamente “integrado”, “validado” ou “concluído”.

Referências históricas conhecidas: **SPA-7** (critérios de produto), **SPA-9/SPA-10** (contexto científico/auditoria), **SPA-12** (integração MVP A). Seus títulos, responsáveis e statuses atuais **não foram consultados**. Localizar e ler antes de atualizar; não recriar esses cartões com outro nome.

## Ordem de aplicação quando o acesso existir

1. Identificar workspace, equipe e projeto pelo repositório; consultar membros, labels e workflow reais.
2. Ler issues abertas **e encerradas**, buscando os resultados abaixo e SPA-7/9/10/12. Reaproveitar cartões existentes; registrar a evidência entregue antes de criar mais trabalho.
3. Vincular o material de UX, branches das duas experiências e PRs #6/#7 aos cartões correspondentes. Registrar o conflito do #6; não atribuir ao #7 base `main`.
4. Cobrir apenas lacunas reais com cartões novos. Registrar dependências com relações do Linear, não apenas em texto, quando suportado.
5. Acordar responsável/revisor e uma pequena rodada de avaliação. Aplicar datas somente com disponibilidade conhecida.

## Backlog candidato — resultados, não duplicatas obrigatórias

IDs `ARI-*` abaixo são **chaves locais de planejamento**, não IDs do Linear. “P0/P1/P2” indica ordem técnica relativa, não prazo nem enumeração da API. O CSV tem os mesmos oito resultados, todos com status **a mapear**.

| Chave / frente | Resultado e aceite | Dependência / destino sugerido |
| --- | --- | --- |
| **ARI-01 · Compartilhado · P0** | Vincular o estado técnico e o material de UX; cada entrega tem branch/SHA, fonte, estado de revisão e lacuna explícita. O guia deste PR já entrega o inventário; resta vinculá-lo e conferir novos acréscimos. | Ler SPA-7 e cartões existentes. Não refazer o documento. |
| **ARI-02 · Compartilhado · P0** | Definir o problema e o ciclo de cada frente em uma frase; registrar responsável/revisor, limite de esforço e critérios de comparação. Playable permanece aposta preferida condicionada à evidência; minimalista segue ativa. | ARI-01; candidato a atualizar SPA-7, conforme escopo real. |
| **ARI-03 · Compartilhado · P0** | Preparar proposta de reconciliação da linhagem auditada com `main`: conflitos do PR #6 identificados, contratos/datasets preservados e plano de checks. Entrega é plano/PR revisável; não merge automático. | ARI-01; candidato a SPA-12. Pode ocorrer em paralelo às experiências, sem bloquear sua execução local. |
| **ARI-04 · Playable · P1** | Revisar a missão existente em `0e6f5f3`: escolha → evidência → explicação; números batem com JSON, múltiplas soluções aceitas, nenhum pouso/voz ilustrativo tratado como resultado físico. Teclado/mobile, opção de pular efeitos, acesso direto a fonte/limites e ausência/erro funcionam. Registrar lacunas antes de implementar qualquer correção. | ARI-02; base `feat/quake-inspired-mission`. Não construir um jogo novo. |
| **ARI-05 · Minimalista · P1** | Revisar `25fdf9f` e delimitar a menor adaptação para comparação real A/B já coberta pelo MVP A. Demonstrar mesmo UTC/alvo, valores próprios por local e fonte/limites, mantendo exploração direta e acesso por teclado/mobile. A entrada atual de um local ainda não satisfaz esse aceite. | ARI-02; base `feat/minimal-lunar-explorer`. Não encomendar novas efemérides. |
| **ARI-06 · Compartilhado · P1** | Conferir ciência/contratos e preparar protocolo comum: IDs, UTC, unidades, fontes, erro/sem amostra e limitações. Selecionar cenários com dados existentes; como não há locais comuns hoje, registrar a adaptação necessária ou declarar comparação apenas de fluxo. Não chamar dados diferentes de teste controlado. | ARI-02; coordena ARI-04/05. SPA-9/10 são antecedentes a ler, não prova de aceite das experiências novas. |
| **ARI-07 · Compartilhado · P1** | Avaliar as duas experiências pelo protocolo abaixo. Guardar observações e separar compreensão, descoberta, estética e acessibilidade. Se não houver participantes, registrar revisão técnica, mantendo avaliação humana pendente. | ARI-04/05/06. Incluir limitações de cobertura ainda não resolvidas. |
| **ARI-08 · Compartilhado · P2** | Registrar a decisão de produto e preparar uma demonstração estática reproduzível, com roteiro, checks atuais e limitações visíveis. Escolher uma direção ou combinação pequena sustentada pela avaliação; preservar a outra branch. | ARI-07; resolução de ARI-03 necessária antes de integração em `main`. Merge/produção dependem de autorização. |

## Como comparar sem escolher pela aparência

As experiências atuais têm conjuntos de locais diferentes. Para avaliação controlada, primeiro alinhar **locais, timestamp, alvo, dados e pergunta**, reutilizando artefatos existentes. Pode ser necessária uma adaptação pequena de apresentação; isso deve ser um trabalho explícito, não uma troca silenciosa de resultados.

Enquanto não houver equivalência, testar recuperação e compreensão da evidência nas duas, declarando a diferença. Não calcular uma “nota de precisão” ou conclusão causal sobre a melhor interface a partir disso.

Perguntas/tarefas observáveis:

1. Sem tutorial externo, encontrar um local/instante disponível e identificar os centros do Sol e da Terra.
2. Ler elevação e azimute com unidade/UTC; conferir uma amostra na fonte. Quando houver A/B, comparar no **mesmo instante**.
3. Explicar uma conclusão e um limite: “o centro está acima de 0° no modelo” não equivale a “a missão terá energia/comunicação”.
4. Investigar outro instante e explicar o que mudou; avaliar descoberta separadamente de cumprir uma sequência narrativa.
5. Repetir o fluxo por teclado e no celular; encontrar fonte/limites sem depender de canvas, áudio ou cor.

Registrar perfil/quantidade de participantes e condições; alternar a ordem das experiências quando possível. Não transformar opinião de especialista ou Axe sem erros em comprovação de aprendizagem ou acessibilidade integral.

**Critério de escolha:** a playable deve demonstrar ganho útil de descoberta/compreensão, mantendo rigor, acesso direto à evidência, acessibilidade e viabilidade. Ser mais difícil ou ter mais efeitos não é evidência de valor. A minimalista deve oferecer uma comparação completa, não apenas menos controles. A decisão de produto deve considerar esses resultados.

## Limites de escopo

Não criar relays, baterias, Landing Score, segurança de pouso, backend, novos datasets ou sistemas de recompensa para preencher o backlog. Não integrar integralmente o pipeline amplo da `main` como atalho. Corrigir primeiro erro de identidade/local/tempo/contrato; depois fluxo principal/acesso; acabamento vem após isso. Check verde e reprodução numérica não autorizam alegações de Horizons, sombra topográfica ou precisão física sem evidência própria.
