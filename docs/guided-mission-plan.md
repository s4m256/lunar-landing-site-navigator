# Missão lunar guiada: plano de execução

## Objetivo

Uma experiência curta de aprendizagem: entender por que a escolha de local e data importa, comparar direções do Sol e da Terra e justificar uma escolha. O usuário pode pular a narrativa e explorar diretamente. Prazo informado: até dois dias.

## Fluxo

1. Apresentação por um guia fictício. CLPS é explicado como entrega comercial robótica de cargas para a NASA; o personagem não representa uma missão tripulada.
2. Decolagem ilustrativa curta, pulável e sem movimento quando solicitado pelo sistema.
3. Mapa polar esquemático: quatro pontos científicos hipotéticos e um bônus educativo opcional. Escolher o ponto atualiza simultaneamente Sol e Terra. Os cartões selecionam qual direção explicar no corte lateral.
4. Resultado geométrico, causa e possibilidade de escolher novamente. O objetivo do exercício é encontrar centros de Sol e Terra acima do horizonte idealizado na data selecionada; não há ranking de segurança nem promessa de energia/enlace.
5. Pouso simbólico e resumo da decisão. Reinício disponível, sem pontuação ou obrigação de encontrar o bônus.

## Ciência e representação

Gerar direções para quatro observadores e datas curadas usando o motor SPICE existente, preservando a auditoria anterior. Fontes, versões, hashes e condições de aquisição acompanham os novos dados. Não reutilizar ângulos de um observador como se fossem de outro.

O relevo atual não permite afirmar bloqueio por montanhas: resolução, referencial e origem ainda não foram compatibilizados para esse cálculo. A explicação principal usa horizonte/superfície lunar idealizados e indica quando o centro do astro está abaixo deles. Texturas, crateras desenhadas, trajetórias da nave e avatar são ilustrações. Não classificar falta de dados como sucesso. Não simular um relógio contínuo a partir de amostras esparsas.

## Frentes independentes

- Fluxo: `MissionApp.tsx` e seus testes; etapas, controles, foco e acessibilidade.
- Arte: `MissionArt.tsx`, `mission.css` e ativos próprios; mapa, guia, nave e movimento reduzido.
- Dados: `mission-data.ts`, seus testes, script de geração e nova auditoria; resultados verificáveis e proveniência.
- Coordenação: contrato de apresentação, diagrama do horizonte, entrada principal, documentação, empacotamento HTML, integração e testes no navegador.

Cada frente possui arquivos exclusivos. Integração e revisão ocorrem antes do commit. Não alterar main, fazer merge ou deploy de produção.

## Aceitação

Fluxo completo e caminho de pular narrativa; troca de ponto/data sem resultados antigos; seleção inadequada explicada; múltiplas escolhas adequadas permitidas; bônus opcional; teclado/foco, movimento reduzido e celular; dados inválidos com erro explícito. Build, suites exigidas pelo repositório e navegador. Entrega de HTML autocontido e capturas para revisão sem instalação; artefatos de distribuição fora do Git.
