# Leitura integral do 42 Quake Heroes

## Fonte e cobertura

Referência indicada: https://gabrielchayb.github.io/42-quake-heroes/

Foi examinada a versão estática em `docs/` da branch **Website** do repositório público `gabrielchayb/42-quake-heroes`, commit **4fe7f89c74ab40090b65c306ff37ea389c1bd454**. O acesso ao domínio publicado está bloqueado pela rede deste ambiente; não foi afirmada equivalência entre esta revisão e um deploy consultado ao vivo. A branch `main` anteriormente examinada contém templates Flask, não os caminhos estáticos desta revisão.

Leitura integral de **19 arquivos próprios de código/documentação, 2.044 linhas lógicas**. O ambiente `venv/` versionado pelo projeto é dependência de terceiros e não faz parte dessa contagem. Caches `.pyc`, `.DS_Store`, vídeos, imagens e GLBs não foram tratados como código-fonte. A configuração `.flaskenv` e o marcador `.nojekyll` também foram inspecionados.

| Responsabilidade | Arquivos | Linhas |
| --- | --- | ---: |
| Narrativa | `docs/index.html`, `solarsystem.html`, `home.html`, `homemoon.html`, `homemars.html`, `hometired.html`, `receivingcode.html`, `poscode.html` | 599 |
| Seleção, conteúdos e estilos | `docs/static/css/styles.css`, `docs/catalog.html`, `choosemission.html`, `marsquake1.html`, `moonquake1.html`, `moonquake2.html`, `moonquake3.html`, `moonquakes.html`, `team.html` | 1.349 |
| Coordenação | `README.md`, `app.py` | 96 |

Contagens usam linhas lógicas, incluindo a última linha sem newline em alguns arquivos. Os dois leitores trabalharam em fatias sem sobreposição; o coordenador conferiu a árvore, commit, inventário total e referências a assets.

## O que o código implementa

A sequência é apresentação digitada → vídeo do sistema solar → cinco páginas narrativas sobre sismos, energia e transmissão → vídeo de recebimento → escolha Lua/Marte → conteúdos e vídeos. O módulo é imagem clicável que avança para a página seguinte; Back/Team/Forward também navegam entre HTMLs.

O aspecto da narrativa vem de imagens PNG em camadas: superfície na base, Terra no alto à direita, módulo central e texto curto sobre fundo preto. O CSS usa Orbitron, branco, botões azuis e borda ciano. A expressão do módulo muda porque cada página usa outro PNG. Não há animação articulada de astronauta ou módulo nessa sequência.

`index.html` usa a biblioteca Typewriter, com caracteres a cada 30 ms, pausas e inserção de logo; `receivingcode.html` usa 100 ms. As páginas intermediárias mostram texto inteiro e apenas fade de entrada. Portanto, nem toda fala da referência é digitada.

Somente `choosemission.html` usa Three.js/GLTFLoader: dois modelos de planetas, luzes, câmera e raycasting para selecionar/rotacionar. O raycasting escolhe objetos; não calcula relevo, iluminação, comunicação ou interseções científicas. O loop não reproduz animações GLB.

O README descreve uma proposta de detecção de sismos com IA, mas `app.py` contém rotas e renderização de templates, não esse algoritmo. Não se inferiu um sistema científico implementado a partir do texto de apresentação.

## Assets e origem

As imagens narrativas incluem `modulo2.png`, `modulox.png`, `moduloreal.png`, `modulofeliz.png`, `insght.png`, `terrareal.png`, `lua.png` e `marsfloor0.png`. Os vídeos locais são `solarsystem.mp4`, `code.mp4` e `REC.mp4`. As páginas de sismos também usam iframes YouTube.

Foram inspecionados os metadados das 25 imagens e dos dois GLBs. Os GLBs registram apenas o exportador Khronos Blender glTF 2.0; não possuem créditos/licença no campo `asset`. As imagens examinadas não forneceram autoria, copyright ou origem nos campos de metadados consultados. Os 19 arquivos textuais não estabelecem uma licença de reutilização dos assets. **Estar no repositório público não confirma origem NASA, ausência de geração por IA ou permissão de redistribuição.** Nenhum asset dessa referência foi incorporado ao aplicativo nesta revisão.

Fonte Orbitron: existe distribuição própria com licença SIL Open Font License, separada dos assets do projeto. Uma cópia obtida do repositório Google Fonts ficou fora do aplicativo, aguardando a escolha visual do usuário.

## Limitações a não reproduzir automaticamente

- Links de alguns cartões omitem `.html`, potencialmente incompatíveis com a hospedagem estática.
- Modelos no canvas e cartões `div onclick` não oferecem equivalentes adequados por teclado.
- Vídeo `receivingcode` pode depender do evento final para liberar o avanço e tenta autoplay com som; esse comportamento pode falhar conforme o navegador.
- Textos pequenos, posicionamento absoluto e rolagem bloqueada podem sobrepor conteúdo em telas menores.
- Não há tratamento de movimento reduzido; alguns efeitos dependem de JavaScript para tornar conteúdo visível.
- O carregamento inicial assíncrono dos modelos pode não reaplicar a disposição móvel até ocorrer resize.

São observações do código; a revisão não certifica funcionamento do site publicado.

## Direção autorizada pelo usuário após a leitura

- Não utilizar imagens geradas por IA; procurar imagens/modelos existentes com fonte identificada.
- Perguntar antes de qualquer decisão importante não técnica, incluindo asset, aparência, personagem ou mudança importante da experiência.
- Usar astronauta como guia, explicando que **não há astronautas a bordo da missão CLPS robótica**.
- Falas casuais, curtas e com apresentação progressiva; posteriormente o usuário pediu também para ouvir a fala.
- O usuário escolheu a opção C, Astronaut de Poly; créditos e origem estão em [assets/astronaut.md](assets/astronaut.md). A identidade visual final e mudanças importantes no roteiro continuam sujeitas à revisão do usuário.

O rascunho de reformulação não aprovado foi separado; a versão funcional anterior foi preservada. Não houve incorporação de imagens de IA, merge ou deploy de produção.
