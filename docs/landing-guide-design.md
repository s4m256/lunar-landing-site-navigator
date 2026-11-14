# Landing Guide — proposta consolidada e implementação

**Revisão do pacote 1:** a exploração passa a um mapa de superfície em tela inteira, visto de cima em 2D ou inclinado em 3D. O globo permanece somente na entrada. Esta correção substitui as referências à esfera na área de exploração abaixo. Centro, zoom, giro, A/B e instante são compartilhados. A especificação vigente da camada LOLA/SPICE e suas limitações está em [landing-guide-package-1.md](landing-guide-package-1.md).

Base isolada: `feat/lunar-topographic-visibility`, commit `7d8a9f6`. A main consultada em 14/11/2026 está em `23cc0c7` e contém outro pipeline científico. Esta mudança de UX não o incorpora nem altera `science/` ou `contracts/`. O guia de acessibilidade da main foi lido como referência. O portal oficial `/2026/challenges/` retornou CONNECT403; após mudança da política de rede, o índice e a página do desafio retornaram HTTP503, sem conteúdo. A orientação recuperada anteriormente no canal NASA/spaceapps e os contratos existentes sustentam o recorte, sem alegar nova leitura do portal.

## Arquitetura das telas

1. **Entrada:** Lua central, título Landing Guide, Start e How it works. Sem menu superior. Ilustração é distinta da ciência: aparência da esfera não é DEM, orientação solar ou sombra calculada.
2. **Exploração:** Lua ocupa a cena; quatro cantos abrem Gráficos, Seleção, Dados e alternância 2D/3D. Relógio e resumo UTC ficam na base. Seleções A/B sempre identificadas por letra e nome.
3. **Ajuda curta:** três passos visuais — escolher lugar, comparar dados, mudar amostra. Dispensa tutorial obrigatório.

### Desktop

```text
┌ Gráficos ───────────────────────────── Selecionar A/B ┐
│ [painel opcional]                                     │
│                     LUA                              │
│               mapa 2D / esfera 3D                    │
│                  mira no centro                     │
│        A/B: posições + lista acessível               │
│                                                      │
└ 2D | 3D ────── Tempo / UTC / amostra ─────── Ver dados┘
```

Painéis desktop flutuantes mantêm a cena visível. Gráficos podem permanecer abertos durante seleção. Fechar/Escape devolve foco ao acionador. Não depender de clicar num alvo de poucos pixels: lista de locais calculados e campos de coordenadas são equivalentes ao apontamento.

### Mobile

```text
┌ Gráficos                 Seleção ┐
│                                 │
│            LUA                  │
│                                 │
│     A/B identificados           │
├ 2D/3D      Tempo        Dados ───┤
│ folha única, quando aberta       │
│ título                 Fechar   │
│ controles/dados com rolagem      │
└─────────────────────────────────┘
```

Uma folha por vez evita empilhar painéis sobre controles. O botão de fechar permanece alcançável; conteúdo pode rolar. Não reduzir texto para simular quatro painéis de desktop.

## Estados e seleção

Estado compartilhado: seleção A/B com identidade científica separada do papel visual; slot ativo; Centro/Cursor; câmera; 2D/3D; dataset; período; UTC; alvo; reprodução/velocidade. As vistas recebem o mesmo estado. Painéis e gráficos consultam seletores puros do consumidor científico existente.

| Controle     | Estados e comportamento                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- |
| Start        | Abre demonstração com os dois locais calculados; não exige coordenadas                      |
| How it works | Abre ajuda breve; Escape/fechar retorna foco                                                |
| Seleção      | A ou B ativo; substituir explícito, remover individualmente; lista e entrada numérica       |
| Centro       | Orientar a esfera/mapa não muda seleção; confirmar a mira no slot ativo                     |
| Cursor       | Clique na superfície escolhe coordenada; teclado/lista substituem o gesto                   |
| Dados        | Fechado inicialmente; indicador distingue resultados A/B de seleção sem cobertura           |
| Gráficos     | Aberto opcionalmente, período sincronizado; gráfico e tabela equivalente                    |
| 2D/3D        | Troca apenas representação; câmera/seleções/tempo/dataset continuam no estado compartilhado |
| Tempo        | Campos UTC, período, passos, slider discreto, play/pausa e velocidade; nunca interpola      |

Locais livres não herdam séries por proximidade ou slot. Só escolhas explícitas dos locais calculados associam `sourceSiteId`, com coordenadas conferidas. A seleção no verso da esfera continua na lista; não deve ser desenhada falsamente na face visível. Rótulos podem ter linhas-guia para não esconder pontos polares próximos, preservando posições reais.

## Timeline e ciência

MVP A: 365 instantes diários às 00:00 UTC em 2026. MVP B: 721 timestamps entre 15/11 e 15/12/2026, extremos inclusivos, 720 intervalos horários. Um período filtra essas amostras; não dispara novos cálculos. Duração é extensão do intervalo em dias, não número de timestamps; início e fim do filtro são inclusivos. Cobertura parcial ou vazia deve ser informada.

Reprodução percorre amostras existentes, para no fim, tem pausa e velocidade. Não representa velocidade física nem trajetória entre pontos. Alterar período/dataset pausa a reprodução. Data/hora sem amostra não recebe resultado vizinho. O slider tem alternativa por campo e botões. Não há autoplay.

Gráficos disponíveis: elevação aparente do centro solar/terrestre em graus, comparação no mesmo UTC e estados amostrados acima de 0°. Comunicação operacional, energia e blackout de rádio não são calculados. O relevo está indisponível: sem sombra topográfica, DEM ou animação solar fisicamente orientada. Texturas/iluminação da esfera são ilustração estática, com identificação próxima. Azimutes usam nortes locais distintos. SPICE/DE421/IAU_MOON/CN+S, hashes, downloads e ausência de validação independente Horizons continuam acessíveis.

## Linguagem visual e acessibilidade

Identidade própria: fundo carvão calmo, Lua em tons minerais, acento âmbar e contraste claro; A círculo e B losango, além de nomes. Controles com ícones e palavras, meta 48px de toque, texto essencial legível e foco forte. Sem navegação de cabeçalho na entrada, sem mosaico de métricas, sem estrelas animadas ou pontos por missão.

Teclado: todos os comandos por botões/campos; setas podem orientar vista com instrução contextual; seleção por lista e coordenadas; Escape fecha painel; foco retorna. Tabelas com cabeçalhos e unidades, resumo de seleção/UTC anunciado brevemente, alternativa textual à geometria, sem dependência de cor/movimento/arraste. Redução de movimento respeitada; nenhuma transição move astros por instantes não calculados. Verificação técnica não substitui teste com pessoas nem certificação WCAG.

## Plano priorizado

1. Consumidor e estado únicos; preservar contratos/artefatos e rejeição de dados inválidos.
2. Entrada, esfera ilustrativa e vistas 2D/3D sincronizadas; seleção acessível e ausência de cobertura explícita.
3. Painéis reutilizáveis; valores, gráficos/tabela e fonte; tempo UTC por amostras reais.
4. Fluxos de teclado, telas estreitas, erros, playback e preservação de estado; testes/build e revisão independente.
5. Depois do hackathon: teste com crianças, idosos e leitores de tela; terreno/refletância/referenciais verificados; eventual iluminação ou enlace somente com modelos e contratos próprios validados.

Não incorporar relay, Landing Score, recomendação de pouso, interpolação científica automática ou sombras decorativas apresentadas como resultado. A interface oferece comparação geométrica preliminar; não certifica uma análise operacional real.
