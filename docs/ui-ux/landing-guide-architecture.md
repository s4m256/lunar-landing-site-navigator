# Landing Guide — Arquitetura UI/UX, Acessibilidade e Revisão Crítica

**Projeto:** Lunar Landing Site Navigator (NASA Space Apps Challenge 2026)  
**Padrão de Acessibilidade:** WCAG 2.2 Nível AA + diretrizes cognitivas W3C + [`docs/accessibility/guia-acessibilidade-e-simplicidade.md`](../accessibility/guia-acessibilidade-e-simplicidade.md)  
**Motor Científico Subjacente:** LOLA DEM `80°S–90°S` (`80 m/px`) + efemérides SPICE (`MOON_ME`, `de421.bsp`) + grades locais `5 × 5` pré-computadas em [`frontend/src/data/south_pole_precomputed.v1.json`](../../frontend/src/data/south_pole_precomputed.v1.json).

---

## 1. Arquitetura de Telas

A interface adota o paradigma **Moon-first**: a Lua ocupa 100% da viewport desde o primeiro instante, sem barras superiores de navegação nem painéis permanentes competindo pela atenção.

```
[ Tela Inicial (Home) ]
   ├── Fundo: Globo Lunar 3D interativo (iluminação solar em tempo real da época selecionada)
   ├── Título central: "Landing Guide" + subtítulo curto em linguagem simples
   ├── Ação primária: "Start"  ────────────────────────────────┐
   └── Ação secundária: "How it works" ──> [ Modal Visual Rápido ] │
                                                                   ▼
[ Ambiente Principal de Exploração (2D ou 3D) ]
   ├── Palco Central (100% viewport): Globo 3D ou Projeção Polar 2D
   │     ├── Pinos permanentes visíveis para Local A e Local B
   │     ├── Mira central fixa quando Seleção = "Centro"
   │     └── Controles acessíveis de rotação/pan por teclado ao focar o palco
   ├── Canto Superior Esquerdo: Botão "Gráficos" ──> [ Painel / Drawer de Gráficos A vs B + Tabela ]
   ├── Canto Superior Direito:  Botão "Seleção"  ──> [ Popover Centro/Cursor + Busca/Lista A e B ]
   ├── Canto Inferior Direito:  Botão "Dados" (badge discreto) ──> [ Gaveta Progressiva: Simples -> Métricas -> Opções Avançadas ]
   ├── Canto Inferior Esquerdo: Botão "2D / 3D"  ──> Alterna projeção preservando TODO estado
   └── Barra/Botão Compacto "Tempo": Popover UTC (Início, Duração, Passo, Scrubber, Play/Pause, Velocidade)
```

### Fluxo Progressivo de Complexidade
1. **Camada 0 (Descoberta — 0 a 10 s):** Tela Inicial limpa (`Landing Guide`, `Start`, `How it works`). Qualquer criança ou pessoa idosa começa sem manual nem login.
2. **Camada 1 (Exploração Visual):** Ao clicar `Start`, apenas os 4 cantos + controle compacto de `Tempo` flutuam sobre a Lua. A gaveta `Dados` inicia **fechada**.
3. **Camada 2 (Leitura Humana):** Usuário seleciona **Local A** (e opcionalmente **Local B**), abre `Dados` ou `Gráficos` e lê imediatamente *"Onde estou olhando / O que estou vendo / O que muda"*, com termos explicados por *"O que significa?"*.
4. **Camada 3 (Análise de Missão / Pesquisador):** Usuário alterna para **Tabela acessível** em `Gráficos`, ajusta passo de tempo ou expande **Opções avançadas** em `Dados` para visualizar coordenadas selenográficas, deslocamento local no grid `5 × 5`, perfil de horizonte `360°`, presets de painel/relay ELFO e validação cruzada JPL Horizons.

---

## 2. Wireframes (Desktop e Mobile)

### 2.1 Desktop (`>= 1024px`) — Tela Inicial

```
+------------------------------------------------------------------------+
|                                                                        |
|                                                                        |
|                          (  Globo Lunar 3D   )                         |
|                        (   Sombreado + Polos   )                       |
|                                                                        |
|                            Landing Guide                               |
|        Explore como o Sol e a Terra aparecem no céu lunar.             |
|                                                                        |
|                  [  Start  ]     [ How it works ]                      |
|                                                                        |
|              Polo Sul Lunar (80°S–90°S) · LOLA + SPICE                 |
+------------------------------------------------------------------------+
```

### 2.2 Desktop — Ambiente Principal (Painéis Fechados vs Painéis Abertos)

Estado padrão após `Start`:
```
+------------------------------------------------------------------------+
| [Gráficos]             (Tempo: 15 Nov · 00h UTC [▶])     [Seleção: A]  |
|                                                                        |
|                                                                        |
|                          . - ~ ~ ~ - .                                 |
|                      . '    (•) A      ' .                             |
|                     /       [+] Mira      \                            |
|                     |        (•) B        |                            |
|                      \                   /                             |
|                       ' .             . '                              |
|                           ' - . . - '                                  |
|                                                                        |
| [2D / 3D: 3D]                                     [Dados · A selecionado]|
+------------------------------------------------------------------------+
```

Estado com `Gráficos` e `Dados` abertos simultaneamente (docking sem obstruir centro):
```
+------------------------------------------------------------------------+
| [Gráficos x]           (Tempo: 15 Nov · 00h UTC [▶])     [Seleção]     |
| +-------------------+                              +-----------------+ |
| | Curvas A vs B     |        . - ~ ~ ~ - .         | Dados (A vs B)  | |
| | • Luz Solar       |      /    (A) [+]    \       | 1. Resumo       | |
| | • Visib. Terra    |     |       (B)       |      | 2. Céu Agora    | |
| | • Blackout / Link |      \               /       | 3. Métricas     | |
| | [Ver em Tabela]   |        ' - . . - '           | ▸ Opções Avanç. | |
| +-------------------+                              +-----------------+ |
| [2D / 3D: 2D]                                     [Dados · A/B]        |
+------------------------------------------------------------------------+
```

### 2.3 Mobile (`< 768px`)

Em telas estreitas, os 4 botões de canto permanecem ancorados fora da zona central do globo (`48×48 px` mínimos, `gap >= 8px`), enquanto `Tempo` vira uma pílula compacta no topo central/inferior e **apenas 1 painel contextual** abre por vez em formato *bottom sheet* (`max-height: 62dvh`) para nunca esconder os controles nem o pino selecionado:

```
+--------------------------------------+
| [Gráficos]              [Seleção: A] |
|        [ Tempo: 15 Nov 00h ▶ ]       |
|                                      |
|             . - ~ ~ - .              |
|            /   (A)     \             |
|           |     [+]     |            |
|            \   (B)     /             |
|             ' - . . - '              |
|                                      |
| +----------------------------------+ |
| | Bottom Sheet Ativa (ex.: Dados)  | |
| | Resumo A vs B · [Fechar]         | |
| +----------------------------------+ |
| [2D / 3D]            [Dados · A/B]   |
+--------------------------------------+
```

---

## 3. Mapa de Estados dos Controles e Painéis

| Elemento | Posição | Estado Inicial (pós-`Start`) | Comportamento ao Clicar / Ativar | Regra Responsiva (Mobile) |
| --- | --- | --- | --- | --- |
| **Globo / Mapa (`2D/3D`)** | Fundo `100%` | Modo `3D` (ou último escolhido), Local `A` pré-definido em `Shackleton Ridge` | Arrastar rotaciona/move; clicar avalia ponto (`Cursor`); focar permite teclado (`↑↓←→`) | Gestos touch + botões +/- rotação acessíveis |
| **Botão `Gráficos`** | Canto Superior Esquerdo | Fechado (`aria-expanded="false"`) | Abre painel esquerdo com curvas de Luz Solar, DTE Terra, Link Combinado, Blackout, Perfil 360° e Tabela numérica | Ao abrir no mobile, fecha `Dados` / `Tempo` automaticamente |
| **Botão `Seleção`** | Canto Superior Direito | Fechado (mostra badge `Centro` ou `Cursor` + `A` / `A/B`) | Abre popover de escolha entre **Centro** vs **Cursor**, busca/lista acessível para A e B, troca `A ↔ B` e limpeza | Fecha outro popover ativo para evitar sobreposição |
| **Botão `Dados`** | Canto Inferior Direito | **Fechado** (`badge`: `A` ou `A/B`) | Abre gaveta progressiva: Resumo simples -> Métricas solares/comms -> *Opções avançadas* | Abre como *bottom sheet* com rolagem interna |
| **Botão `2D / 3D`** | Canto Inferior Esquerdo | Ativo em `3D` (com rótulo claro `Modo: 3D · Ir para 2D`) | Alterna instantaneamente entre **Globo 3D** e **Projeção Polar 2D** preservando A, B, tempo, seleção e painéis | Mantido sempre acessível no canto inferior esquerdo |
| **Pílula `Tempo`** | Topo-Centro | Fechado (mostra data UTC + botão direto Play/Pause) | Abre popover com Data início UTC, Hora UTC, Duração (`1–30 dias`), passos (`-1h`/`+1h`/`+6h`), scrubber, Play/Pause, Recomeçar e Velocidade (`1×`, `3×`, `6×`) | Em telas estreitas ocupa faixa compacta própria |

---

## 4. Fluxo de Interação para Seleção de 1 ou 2 Pontos (A e B)

### 4.1 Modos Visuais + Alternativa por Teclado
1. **Modo `Centro` (Mira Central Fixa):**
   - Uma mira de alto contraste permanece fixa no centro da viewport.
   - O usuário arrasta a Lua (em 3D rotaciona a esfera; em 2D desloca/foca o mapa polar ou o grid local) até alinhar uma região desejada com a mira.
   - Na parte inferior da mira ou no painel `Seleção`, dois botões diretos (`Definir este ponto como A` e `Definir este ponto como B`) gravam o local sem exigir precisão de clique fino.
2. **Modo `Cursor` (Seleção Direta):**
   - Um clique/toque direto sobre o globo ou mapa seleciona o ponto de interesse.
   - Regra de atribuição transparente:
     - Se apenas A existe (ou botão ativo = `Definir A`), atribui/move **A**;
     - Ao clicar para comparar (**Próximo clique = B** ou tendo A definido e comparando), atribui/move **B**;
     - O painel `Seleção` exibe explicitamente um seletor segmentado: **`Próximo clique define: [ Local A ] [ Local B ]`** para eliminar ambiguidade sobre qual pino será movido.
3. **Alternativa 100% Acessível por Teclado & Leitor de Tela:**
   - Dentro do popover `Seleção` (e acessível via Tab), existem **campo de busca + `<select>` nativos para Local A e Local B ("Nenhum / Comparar")**, cobrindo integralmente as 10 regiões polares validadas.
   - Botões explícitos: **`Trocar A ↔ B`**, **`Limpar B`** e **`Voltar ao exemplo inicial`**.

### 4.2 Aderência Científica na Seleção Livre na Lua
- Ao clicar ou mirar sobre o globo 3D/mapa 2D dentro da zona polar sul (`80°S–90°S`), o algoritmo mapeia para o sítio pré-computado mais próximo **e** calcula o deslocamento fino na grade local `5 × 5` (`500 m`), exibindo claramente o nome da região + coordenadas exatas.
- Ao clicar fora da faixa `80°S–90°S` (médias/baixas latitudes no globo 3D), **não inventamos métricas de declividade/horizonte**: um aviso amigável explica que o DEM LOLA `80 m/px` pré-computado cobre o Polo Sul (`80°S–90°S`), projeta o ponto para o sítio polar mais próximo na mesma longitude ou convida a selecionar uma região polar na lista.

---

## 5. Comportamento da Linha do Tempo e Animação

- **Janela Temporal Validada:** `2026-11-15T00:00Z` até `2026-12-15T00:00Z` (`721` passos de `1 hora` em UTC, cobrindo 1 mês sinódico lunar completo).
- **Controles Disponíveis no Popover `Tempo`:**
  - **Data inicial (UTC)** e **Hora inicial (UTC)**: edição via campos nativos (sem depender apenas de slider) + botão **`Usar período de exemplo`**. Se o usuário digitar data fora de `2026-11-15` a `2026-12-15`, aparece mensagem clara e humana em `role="alert"` explicando o limite das efemérides pré-computadas.
  - **Duração analisada:** `1 dia`, `3 dias`, `7 dias`, `14 dias` ou `30 dias` (recalcula gráficos e médias do período selecionado em `< 5 ms`).
  - **Controle de época atual:** Slider acessível (`aria-label` + `aria-valuetext` em UTC legível), botões **`-1h`**, **`+1h`**, **`+6h`**, **`Iniciar animação` / `Pausar animação`**, **`Recomeçar`** e seletor de velocidade (**`1×`**, **`3×`**, **`6×`**).
- **Sincronização 2D/3D e Honesta Comunicação Visual:**
  - Em **3D**, avançar o tempo rotaciona suavemente o vetor de iluminação solar na esfera lunar (terminador visual) mantendo a consistência com a elevação solar calculada em UTC.
  - Um rótulo discreto informa: *"Sombreamento 3D é uma aproximação visual; números de luz e comunicação usam relevo real LOLA 80 m/px e horizonte 360°."*
  - Quando `prefers-reduced-motion: reduce` está ativo, animações CSS e saltos automáticos contínuos respeitam preferência de movimento reduzido (velocidade suave/pausada por padrão até clique explícito).

---

## 6. Diretrizes Visuais, de Contraste e Acessibilidade (WCAG 2.2 AA)

1. **Identidade Visual Espacial-Científica:**
   - Paleta escura profunda calibrada para legibilidade sem ofuscamento: fundo espacial `#050912`, superfícies translúcidas com fallback opaco `#0D1524` (`92%` opacidade + borda `#2D405E`), texto principal `#F4F7FB` (contraste `> 14:1`), texto secundário `#B7C6DB` (contraste `>= 7.2:1`).
   - Acentos funcionais sem depender só de cor:
     - **Local A:** Âmbar/Ouro `#F5B749` + marcador circular sólido **`A`**.
     - **Local B:** Ciano Claro `#57D6FF` + marcador losango/borda dupla **`B`**.
     - **Sol:** Dourado `#FFD166` + linha contínua.
     - **Terra:** Azul `#74A9FF` + linha tracejada (`stroke-dasharray`).
2. **Alvos Táteis e Teclado:**
   - Todos os botões principais de canto e ações possuem área mínima **`>= 48 × 48 px`** (`min-height: 48px`) com `gap >= 8px`.
   - Ordem lógica de foco (`Tab` segue Home -> Controles de Canto -> Canvas/Palco -> Painéis Abertos), `:focus-visible` com contorno sólido de `3px` em `#7DD3FC` + halo externo.
   - `Escape` fecha popovers/drawers abertos e retorna foco ao botão acionador.
3. **Linguagem Simples e Sem Afirmações Exageradas:**
   - Todo gráfico possui alternativa numérica completa em **`<table>`** acessível (*"Ver valores em tabela"*).
   - Conceitos técnicos possuem botão de ajuda inline **`O que significa?`** (ex.: *Horizonte geométrico*, *PSR*, *DTE / Direct-to-Earth*, *Blackout*).
   - Nunca declara "pouso seguro" ou "energia garantida"; explicita condições geométricas sob o modelo pré-computado.

---

## 7. Revisão Crítica e Riscos de UI/UX

### 7.1 Possíveis Problemas de Usabilidade Detectados
1. **Conflito de sobreposição de 4 cantos + painéis abertos:** Se usuário abrir `Gráficos`, `Dados`, `Seleção` e `Tempo` ao mesmo tempo em notebooks `1280px` ou celulares, a Lua desaparece. **Mitigação:** No desktop, `Seleção` e `Tempo` são popovers auto-fecháveis quando outro popover abre, enquanto `Gráficos` (esquerda) e `Dados` (direita) têm largura restrita (`<= 390px`) deixando faixa central livre. No mobile (`< 768px`), apenas 1 painel abre por vez.
2. **Desorientação na transição 3D ↔ 2D:** Um usuário leigo pode perder onde está o Polo Sul ao girar o globo 3D até o equador. **Mitigação:** Botão **`Centralizar no Polo Sul`** sempre disponível e faixa polar sul sutilmente demarcada tanto no 3D quanto no 2D, com pinos **A** e **B** idênticos nos dois modos.
3. **Invisibilidade silenciosa quando `Dados` inicia fechado:** Alguém que clicou em um local pode achar que "nada aconteceu" se `Dados` estiver fechado. **Mitigação:** Toast/feedback curto no região `aria-live="polite"` + atualização imediata do badge no botão `Dados` (`Dados · A: Shackleton...` / `Dados · A vs B`).

### 7.2 Pontos Ambíguos da Especificação Original e Decisões Tomadas
1. **Regra do modo `Cursor` para 1 ou 2 pontos:** *"primeiro clique A, segundo clique B"* fica confuso quando o usuário quer ajustar A novamente depois de definir B. **Decisão:** Adicionamos controle explícito no popover `Seleção`: **`Próximo clique define: [ A ] [ B ]`** (com avanço automático apenas quando B ainda está vazio na primeira seleção).
2. **Escopo da seleção de Data/Duração vs Dados Pré-computados:** Especificação pedia "escolher data inicial e duração". Sem delimitar a janela SPICE pré-computada, datas arbitrárias exigiriam backend online ou inventariam dados. **Decisão:** Mantemos edição real de data/hora/duração **dentro da janela validada (`2026-11-15` a `2026-12-15` UTC)** recalculando instantaneamente métricas e gráficos apenas no sub-intervalo escolhido pelo usuário, com aviso transparente para datas fora do catálogo offline.
3. **Globo 3D pesado (Three.js/WebGL):** Em máquinas modestas e testes automatizados/leitores de tela, WebGL pode falhar ou aumentar o bundle em >600 KB. **Decisão:** Globo 3D interativo em projeção ortográfica vetorial + canvas/SVG leve com zero dependências externas, renderização instantânea, degradando perfeitamente em qualquer dispositivo e totalmente acessível por teclado.

### 7.3 Melhorias Recomendadas Aplicadas
- **Presets diretos na barra `Seleção`:** *"Artemis Top vs PSR"* e *"Comparar A vs B"* com 1 clique.
- **Resumo comparativo humano:** Cartão instantâneo *"Diferença entre A e B neste período"* destacando quem recebe mais luz solar e quem sofre menos blackout, sem jargão.
- **Toggle gráfico ↔ tabela em 1 clique** para leitores de tela e pesquisadores exportarem/lerem números exatos.

### 7.4 Limitações Técnicas e Científicas que Devem Ser Comunicadas ao Usuário
1. **Cobertura geográfica:** Modelos LOLA `80 m/px` com perfil de horizonte `360°` estão pré-computados para **10 regiões-chave do Polo Sul Lunar (`80°S–90°S`)**, cada qual com grade local `5 × 5` (`±500 m`). O globo 3D completo serve para orientação espacial e contexto de iluminação global; fora do Polo Sul não há cálculo topográfico de horizonte neste MVP offline.
2. **Modelo puramente geométrico:** O cálculo verifica linha de vista topográfica para Sol (fração de disco visível), Terra (disco completo/centro) e satélites relay (`ELFO`/`LRO`). **Não inclui** reflexão difusa em paredes de crateras, poeira eletrostática, balanço térmico do lander ou atenuação RF por multipercurso.
3. **Engenharia preliminar:** Valores de bateria (`Wh`) e declividade (`slope < 15°`) são estimativas educacionais/exploratórias sob parâmetros ajustáveis em *Opções avançadas*, não certificação de pouso real.

### 7.5 Escopo MVP (Hackathon) vs Pós-MVP

| Capacidade | MVP (Implementado nesta Entrega) | Pós-MVP (Próxima Fase) |
| --- | --- | --- |
| **Home Minimalista** | Globo 3D + `Landing Guide` + `Start` + `How it works` | Vídeo/tour animado interativo por voz |
| **Palco 2D / 3D** | Globo 3D ortográfico interativo + Mapa Polar 2D sincronizados | Mosaico raster LOLA `20 m/px` completo com zoom contínuo via WebGL tiles |
| **Seleção A/B** | Modos `Centro`, `Cursor` + Lista/Busca acessível + troca `A↔B` + grid local `5×5` | Clique arbitrário em qualquer pixel `80°S–90°S` com ray-marching sob demanda no servidor Python |
| **Gráficos & Tabelas** | Luz solar, Visib. Terra, Link combinado/Blackout, Horizonte 360°, Tabela acessível | Exportação CSV/PNG e comparativo de até 4 locais simultâneos |
| **Tempo** | Sub-janela UTC configurável (`1–30 dias`), Play/Pause, Passo, Velocidade | Consulta direta à API NASA JPL Horizons para qualquer ano (`2025–2035`) |

---

## 8. Plano de Implementação Priorizado (e Rastreabilidade)

1. **Prioridade 1 (Núcleo + Acessibilidade):** Modelo de estado único (`frontend/src/landing-guide/state.ts`), suporte completo a sub-janelas temporais derivadas do dataset real (`computeWindowSlice` e `summarizeAnalysisWindow`).
2. **Prioridade 2 (Home + Palco 2D/3D):** `HomeOverlay.tsx` + `HowItWorksModal.tsx` + `LunarViewport.tsx` garantindo estado 100% compartilhado entre 2D e 3D.
3. **Prioridade 3 (Controles de Canto e Descoberta Progressiva):**
   - `SelectionPopover.tsx` (Centro / Cursor / Lista A & B)
   - `DataDrawer.tsx` (Fechado inicialmente, Resumo -> Métricas -> *Opções avançadas* + *O que significa?*)
   - `ChartsDrawer.tsx` (Comparação temporal A vs B + Horizonte 360° + Tabela HTML acessível)
   - `TimePopover.tsx` (Data/Hora UTC validada + Duração + Play/Pause/Velocidade)
4. **Prioridade 4 (Polimento CSS WCAG AA + Testes Automatizados):** Estilos de alto contraste + responsividade mobile (`frontend/src/style.css`) e testes abrangentes de fluxos UI/científicos em `frontend/src/App.test.tsx`.
