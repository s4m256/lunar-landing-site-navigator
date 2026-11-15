# Implementação da missão guiada

## Escopo entregue

A aplicação abre em uma cena de jogo: astronauta no cenário lunar, falas curtas digitadas e diálogo monoespaçado sem caixa na parte inferior. A sequência é apresentação → viagem ilustrativa → conversa de chegada → mapa e análise → pouso ilustrativo → fala final. Conversas e animações podem ser puladas. São quatro observadores científicos hipotéticos e um bônus separado da superfície, sem coordenadas científicas. O usuário não precisa descobrir o bônus para concluir.

Sol e Terra ficam simultaneamente nos cartões; selecionar um cartão muda o corte explicativo. A data muda o resultado para todos os pontos. O corte conserva a proporção entre os eixos e o sinal do ângulo; raios abaixo do horizonte são tracejados. Não existem interseções de montanhas calculadas nesta versão.

## Organização

- `MissionApp.tsx`: etapas, decisões, seleção/data, foco, diálogo, download e erros. Viagens de 3,2 s, puláveis e omitidas com movimento reduzido. Abrir “Sobre a missão” pausa animação e contagem de tempo; fechar retoma o tempo restante.
- `MissionArt.tsx` e `mission.css`: guia com a imagem existente Astronaut, de Poly (CC BY 2.0), nave em SVG e a versão antiga do mapa esquemático, preservada fora do fluxo principal. A seleção atual usa `globe/MissionGlobe.tsx`, que adapta câmera, coordenadas, marcadores e assets do commit 343d31f, com superfície global LROC e cap polar derivado do DEM LOLA. Ver [fonte e limitações](../frontend/src/mission/globe/README.md).
- `GameScene.tsx`, `game-scene.css` e `game-shell.css`: cenário em tela cheia com ilustração existente do NASA 3D Resources, astronauta C e movimento ilustrativo da nave; não representam relevo medido do local.
- `GameDialogue.tsx`, `TypewriterText.tsx` e `SpeechControl.tsx`: o mesmo botão completa a fala ou avança para a próxima; o controle de voz fica na opção recolhida “Voz”. Ver [voz e validação](guide-voice.md) e [crédito da imagem](assets/astronaut.md).
- `HorizonDiagram.tsx`: corte no azimute selecionado. Origem no horizonte tangente; comprimentos e tamanhos não são distâncias físicas. A animação revela uma direção estática, sem interpolar data ou simular propagação da luz.
- `mission-data.ts`: valida contrato, coordenadas, grade UTC, kernels e resultados. Falha gera erro tratável pela interface, nunca valores substitutos.
- `types.ts`: contrato de apresentação. Contratos científicos JSON Schema intactos.
- `base.css`: base mínima da entrada principal. O estilo anterior pertence a `LegacyApp.tsx`, evitando interferência na nova interface.

## Acessibilidade e celular

Mapa com botões HTML de no mínimo 44 px, seleção por teclado e indicação textual de visitado. Cartões com `aria-pressed`; valores e explicações fora dos SVGs. O diálogo torna o fundo inerte, controla foco, fecha com Escape e restaura foco. Foco nas mudanças de etapa, sem roubar foco no carregamento inicial.

Em telas pequenas, selecionar um local revela o painel por rolagem imediata. Voltar ao mapa preserva local, data e astro. Movimento reduzido elimina transições, animação dos raios e digitação progressiva. A voz é opcional, iniciada por botão; não há webcam, reprodução contínua ou vídeos obrigatórios.

## Distribuição autocontida

`npm run build:offline` incorpora JavaScript, CSS, ilustrações e dados em `Lunar-Missao.html`, junto de um LEIA-ME. A saída padrão fica no diretório temporário; um argumento escolhe outra pasta. Não depende de CDN ou fetch de recursos para a interface e os dados. As vozes vêm do navegador/dispositivo; algumas dependem de internet. A auditoria usa uma URL Blob, revogada no cleanup.

O build regular Vite permanece disponível. Seu aviso de chunk acima de 500 kB inclui os dados científicos completos e a validação; não foi ocultado. Three.js é carregado na experiência principal para a seleção lunar; o globo renderiza sob demanda, sem animação orbital contínua.

## Revisão no navegador

Após `npm run build`, inicie o preview:

```sh
npm exec --workspace frontend -- vite preview --host 127.0.0.1 --port 4174
```

Em outro terminal, na raiz:

```sh
npm install --prefix /tmp/lunar-review-browser --no-audit --no-fund playwright@1.65.1 @axe-core/playwright@4.14.0
cp scripts/mission-browser-review.mjs /tmp/lunar-review-browser/mission-review.mjs
node /tmp/lunar-review-browser/mission-review.mjs
```

Ajuste `CHROMIUM_EXECUTABLE` para o navegador instalado. `REVIEW_URL` e `REVIEW_OUTPUT` alteram endereço e pasta de evidências. O runner confere as 12 combinações, download, teclado, transições, movimento reduzido, foco, bônus, layouts de 320/390/768 px e critérios automatizados de acessibilidade com Axe.

Para a distribuição, sirva a pasta do HTML localmente e use `REVIEW_URL=http://127.0.0.1:PORTA/Lunar-Missao.html OFFLINE_REVIEW=1`. Qualquer pedido HTTP adicional ao HTML é bloqueado. Isso verifica autonomia dos recursos; não certifica abertura por duplo clique em todos os navegadores/aparelhos.

## Validação

TypeScript, 155 testes de frontend, 10 de infraestrutura e 62 de Python passaram; o pacote Python foi construído. Hashes da auditoria anterior preservados e dois lotes novos reproduzidos byte a byte. Isso não constitui validação física independente. Relatórios e capturas de navegador ficam fora do Git, na pasta indicada pelo runner.

O runner completo passou tanto no build Vite quanto no HTML autocontido (aproximadamente 4,34 MiB), neste último bloqueando requisições HTTP adicionais. Conferiu 24 elevações, 24 azimutes e 12 decisões contra os resultados científicos. Nenhum erro de página ou requisição falhou. Axe não apontou violações nos critérios selecionados para sete estados/visualizações, incluindo celular e diálogos; essa revisão automatizada não certifica conformidade integral ou substitui testes com pessoas.

A navegação direta `file://` é bloqueada pela política do Chromium gerenciado neste ambiente. Por isso, os mesmos bytes do HTML foram testados por HTTP local, sem recursos externos. A abertura por duplo clique não foi certificada aqui.

A revisão específica `scripts/globe-browser-review.mjs` verifica WebGL real (SwiftShader no ambiente de teste), detalhe do relevo no framebuffer, enquadramento polar, vista global, alvos de toque, teclado e recuperação por lista após perda/ausência de WebGL. A fonte JetBrains Mono é local, com licença incorporada ao HTML; o diálogo não tem borda nem fundo próprio. A camada polar é sombreada por luz fixa, sem simulação solar. A consistência com o código reaproveitado não constitui validação independente da georreferência ou da transformação MOON_ME/IAU_MOON.
