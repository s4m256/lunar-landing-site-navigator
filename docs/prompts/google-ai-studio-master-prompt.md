# Prompt Mestre — Google AI Studio (Lunar Landing Site Navigator / Landing Guide)

> **Como usar:** Copie todo o bloco abaixo (`Prompt para Colar no Google AI Studio`) e cole diretamente no **Google AI Studio** (modo **Build** para gerar a aplicação interativa React/TypeScript completa, ou **Chat/System + User Prompt**). Todos os contratos, equações, dados NASA LOLA/SPICE e diretrizes WCAG 2.2 AA refletem o projeto real deste repositório.

---

## Prompt para Colar no Google AI Studio

```markdown
Atue como um arquiteto sênior de sistemas aeroespaciais, especialista em UI/UX científica, visualização 2D/3D e acessibilidade (WCAG 2.2 AA).

Sua missão é construir a aplicação web interativa completa **Lunar Landing Site Navigator — Landing Guide**, desenvolvida para o **NASA Space Apps Challenge 2026 (desafio Lunar Landing Sites)**, em **React + TypeScript + Vite** (com testes automatizados em Vitest + Testing Library), unindo **rigor físico lunar**, **simplicidade extrema para qualquer público** e **interface Moon-first**.

---

### 1. FILOSOFIA DE PRODUTO, PÚBLICO E ACESSIBILIDADE (WCAG 2.2 AA)

A interface precisa ser utilizável sem manual nem cadastro por uma **criança, pessoa idosa, estudante ou pesquisador**. O usuário deve sempre conseguir responder a três perguntas:
1. **Onde estou olhando?** — Qual região do Polo Sul da Lua está selecionada?
2. **O que estou vendo agora?** — O Sol e a Terra estão visíveis acima das montanhas locais ou bloqueados pelo relevo neste horário UTC?
3. **O que muda no tempo e entre locais?** — Como luz solar, comunicação e intervalos de blackout mudam comparando **Local A** e **Local B** em um período escolhido?

**Requisitos obrigatórios de acessibilidade e simplicidade:**
- **Alvos táteis:** botões principais com mínimo `48 × 48 px` e espaçamento `>= 8 px`.
- **Contraste WCAG 2.2 AA:** `>= 4.5:1` para textos e `>= 3:1` para ícones/controles; `:focus-visible` nítido (`3px solid #7dd3fc`).
- **Nunca depender apenas de cor:** diferenciar Local A e Local B por forma + rótulo (marcador circular âmbar **A** vs losango ciano **B**; linha cheia vs linha tracejada nos gráficos).
- **Alternativas acessíveis:**
  - Toda seleção no globo/mapa deve ter alternativa 100% operável por teclado e leitor de tela (busca por texto + `<select>` para **Local A** e **Local B**).
  - Todo gráfico temporal deve oferecer alternância instantânea para **Tabela HTML (`<table>`)** acessível.
  - Conceitos técnicos (*Horizonte geométrico*, *PSR*, *DTE*, *Blackout*) devem ter explicação expansível **"O que significa?"**.
  - Preferência `prefers-reduced-motion: reduce` respeitada.
- **Honestidade científica:** nunca afirmar que um local tem "pouso seguro", "energia garantida" ou "comunicação garantida". Informar sempre que se trata de análise geométrica preliminar sob DEM e efemérides pré-computadas.

---

### 2. ARQUITETURA DE TELAS E FLUXO INTERATIVO

#### A. Tela Inicial (Home)
- Ocupa 100% da viewport tendo o **Globo Lunar 3D** como protagonista ao fundo.
- Sem barra superior ou menus desnecessários.
- Card central limpo contendo apenas:
  - Título: **`Landing Guide`**
  - Subtítulo curto em linguagem simples (*"Descubra como o Sol e a Terra aparecem no céu de diferentes lugares da Lua."*)
  - Botão primário: **`Start`** (leva direto ao ambiente principal de exploração)
  - Botão secundário: **`How it works`** (abre modal visual em 4 passos rápidos, sem tutorial longo; fecha com `Escape`).

#### B. Ambiente Principal de Exploração (2D / 3D Unificado)
O palco lunar ocupa `100vw × 100dvh`. Sobre ele flutuam apenas **4 controles pequenos nos cantos** + **uma pílula compacta de Tempo no topo central**:

1. **Canto Superior Esquerdo — `Gráficos`:**
   - Botão com ícone + texto. Abre painel lateral esquerdo (ou *bottom sheet* no mobile) sincronizado com a janela de tempo configurada pelo usuário, comparando **Local A vs Local B**:
     - **Curva de Iluminação Solar (%)** ao longo das horas da janela (`f_illum` com marcador vertical da época atual).
     - **Linha do Tempo de Comunicação e Blackouts**: faixas diferenciando **Terra direta (DTE)**, **Cobertura por Satélite Relay (ELFO)** e **Intervalo de Blackout (sem sinal)**, com contagem e duração máxima.
     - **Gráfico de Céu e Horizonte 360°**: perfil `h_horiz(Az)` das montanhas locais vs trajetória do Sol, nuvem de libração da Terra e satélite ELFO-1 + linha de máscara da antena.
     - **Botão `Ver em tabela` / `Gráficos visuais`**: alterna para tabela numérica navegável por teclado.

2. **Topo Centro — `Tempo (UTC)`:**
   - Pílula compacta sempre visível exibindo data/hora atual em **UTC** e botão rápido **`Play` / `Pausar`**.
   - Ao clicar em **`Tempo`**, abre popover completo contendo:
     - Entrada direta por campo de **Data inicial (UTC)** e **Hora inicial (0–23 UTC)** — sem depender só de slider!
     - Validação humana com `role="alert"` se a data estiver fora da janela pré-computada (`2026-11-15` a `2026-12-15` UTC) + botão **`Usar período de exemplo`**.
     - Seletor de **Duração**: `1 dia`, `3 dias`, `7 dias`, `14 dias`, `30 dias` (recalcula médias e gráficos exatamente no sub-intervalo escolhido).
     - Slider de época, botões **`-1h`**, **`+1h`**, **`+6h`**, **`Iniciar animação` / `Pausar animação`**, **`Recomeçar`** e velocidade **`1×`**, **`3×`**, **`6×`**.
     - Nota explícita: *"Horários em UTC. O sombreamento 3D no globo ilustra a iluminação da época, enquanto os números usam o horizonte LOLA local."*

3. **Canto Superior Direito — `Seleção`:**
   - Alterna entre:
     - **`Centro (Mira)`**: mira fixa no centro da viewport; o usuário arrasta a Lua (ou usa setas `↑↓←→` no teclado) até alinhar o ponto sob a mira e clica em **`Fixar Local A`** ou **`Fixar Local B`**.
     - **`Cursor (Clique)`**: clicar na Lua ou nos pinos atribui/move o ponto, com seletor explícito **`Próximo clique define: [ Local A ] [ Local B ]`**.
   - Inclui **busca textual + `<select>` acessível para Local A e Local B**, botão **`Trocar A ↔ B`**, **`Remover Local B`** e atalho **`Comparar com cratera escura (PSR)`**.
   - Se usuário clicar fora da faixa `80°S–90°S` no globo 3D, exibir aviso honesto informando o limite da cobertura LOLA `80 m/px` e associando à região polar mais próxima naquela direção sem fabricar métricas.

4. **Canto Inferior Esquerdo — `2D / 3D`:**
   - Alterna instantaneamente entre:
     - **Modo 3D**: Globo lunar ortográfico interativo leve (sem WebGL pesado, compatível com todos os dispositivos e testes JSDOM), com mares/crateras projetadas, anel da faixa polar `80°S`, vetores Sol/Terra, rotação por mouse/toque/teclado, zoom e botão **`Polo Sul`**.
     - **Modo 2D**: Projeção estereográfica polar sul (`80°S–90°S`, `0° L Terra` para cima e `90° L` para direita), com pan/zoom, vetores Sol/Terra e marcadores permanentes de A e B.
   - **Regra inegociável:** trocar entre 2D e 3D preserva 100% do estado (locais A/B, offsets locais, data/duração/época, animação, painéis abertos).

5. **Canto Inferior Direito — `Dados`:**
   - **Inicia FECHADO** após clicar em `Start` para manter a Lua limpa e sem poluição visual.
   - Mostra badge discreto (`1` quando há apenas A; `A/B` quando comparando dois locais).
   - Ao abrir, organiza em **3 níveis de divulgação progressiva**:
     1. *Resumo em linguagem simples*: responde "Onde estou olhando / O que estou vendo agora / O que muda no período" + alerta honesto de limitações + botão **`O que significa?`**.
     2. *Indicadores do período*: tabela direta A vs B (Luz solar %, horas de Sol, maior sombra contínua, DTE %, link combinado DTE+ELFO %, maior blackout, declividade vs limite CLPS `< 15°`, energia estimada em `kWh`).
     3. *Opções avançadas* (recolhida inicialmente): coordenadas lat/lon/elevação/distância PSR, deslocamento fino na grade local `5×5` (`±500 m` por sliders `dx`, `dy`), área e modo do painel solar (`tracking`, `fixed_north`, `fixed_horiz`), switch **`Ativar Rede Satélites Relay (ELFO)`**, proveniência NASA LOLA/SPICE e erro máximo de validação JPL Horizons.

**Responsividade (Desktop vs Mobile `<= 820px`):**
- No desktop, `Gráficos` ancora à esquerda e `Dados` à direita (`width <= 410px`), mantendo a Lua visível ao centro; `Seleção` e `Tempo` são popovers auto-excludentes; `Escape` fecha painéis.
- No mobile, apenas 1 painel abre por vez em formato *bottom sheet* (`max-height: 58dvh`), mantendo os 4 botões de canto visíveis e acessíveis.

---

### 3. MOTOR CIENTÍFICO, EQUAÇÕES FÍSICAS E CONTRATO DE DADOS

Use exatamente as formulações geométricas abaixo (e implemente avaliação instantânea `< 10 ms` no frontend via interpolação bilinear em grade `5×5`):

1. **Topografia Polar Sul (`LDEM_80S_80M`, `80 m/px`, raio de referência $R_{\text{ref}} = 1737.4\text{ km}$):**
   - Posição 3D cartesiana em `MOON_ME`: $\vec{r} = ((R_{\text{ref}}+z)\cos\phi\cos\lambda,\; (R_{\text{ref}}+z)\cos\phi\sin\lambda,\; (R_{\text{ref}}+z)\sin\phi)$.
   - Declividade local: $\theta_{\text{slope}} = \arctan\sqrt{(\partial z/\partial x)^2 + (\partial z/\partial y)^2}$ (critério CLPS seguro de inclinação $< 15^\circ$).
   - **Curva do Horizonte 360°** (sem refração atmosférica, marcha geodésica até $s_{\max} = 120\text{ km}$, passo $1^\circ$):
     $$\theta_{\text{elev}}(s_i) = \arctan\left( \frac{(R_{\text{ref}} + z_i)\cos\psi_i - (R_{\text{ref}} + z_0)}{(R_{\text{ref}} + z_i)\sin\psi_i} \right), \quad \psi_i = \frac{s_i}{R_{\text{ref}}}, \quad h_{\text{horiz}}(\text{Az}) = \max_{0 < s_i \le s_{\max}} \theta_{\text{elev}}(s_i)$$

2. **Efemérides & Validação Cruzada:**
   - Janela validada de 1 ciclo sinódico completo: **`2026-11-15T00:00:00Z` até `2026-12-15T00:00:00Z` (`721` épocas de `1 h`)**.
   - Referencial lunar `MOON_ME` (`de421.bsp` + `moon_pa_de421_1900-2050.bpc`) com correção `LT+S`.
   - Validação cruzada verificada contra a API **NASA JPL Horizons** em `shackleton_ridge` (16 amostras): diferença angular máxima de **`1.3e-5°` (Sol)** e **`3.6e-5°` (Terra)**.

3. **Eclipse Parcial Solar, Energia & Comunicação:**
   - Fração visível do disco solar $f_{\text{illum}} \in [0, 1]$ a partir de $u = (\text{el}_{\odot} - h_{\text{horiz}}(\text{Az}_{\odot})) / \delta_{\odot}$:
     - $f_{\text{illum}} = 1$ se $u \ge 1$; $0$ se $u \le -1$; caso contrário $\frac{1}{\pi}\arccos(-u) + \frac{u}{\pi}\sqrt{1 - u^2}$.
   - Irradiância e potência: $E = (1361\text{ W/m}^2) / d_{\text{AU}}^2$; $P = \eta \cdot A_{\text{painel}} \cdot E \cdot f_{\text{illum}} \cdot f_{\text{incidência}}$.
   - **DTE (Direct-to-Earth):** visível quando $\text{el}_{\oplus} - \delta_{\oplus} > h_{\text{horiz}}(\text{Az}_{\oplus})$ (modo disco cheio) ou $\text{el}_{\oplus} > h_{\text{horiz}}$ (centro).
   - **Relay Satélite (ELFO + LRO):** constelação elíptica congelada (`ELFO`) elevando comunicação mesmo quando o relevo bloqueia a Terra.

4. **As 10 Regiões Reais do Polo Sul Pré-Computadas (para embutir no dataset JSON v1):**
   Inclua os dados reais das 10 regiões (`horizon_elev_deg[360]`, `sky_series[721]`, `local_grid 5×5` de `500 m` por sítio e métricas de engenharia):
   1. **Shackleton–de Gerlache Connecting Ridge** (`-89.450°`, `222.500° E` | Slope `2.00°` | Luz `100.0%` | DTE `35.1%` | DTE+ELFO `100.0%` | Score `88.2`)
   2. **Malapert Massif** (`-86.000°`, `2.700° E` | Slope `3.13°` | Luz `73.9%` | DTE `68.2%` | Score `82.1`)
   3. **Nobile Rim 2** (`-83.678°`, `55.553° E` | Slope `0.70°` | Luz `55.1%` | DTE `60.6%` | Score `74.5`)
   4. **Peak near Cabeus B** (`-82.800°`, `318.378° E` | Slope `1.86°` | Luz `41.0%` | DTE `58.1%` | Score `72.8`)
   5. **Mons Mouton Plateau** (`-84.361°`, `31.889° E` | Slope `0.49°` | Luz `59.1%` | DTE `78.0%` | Score `71.1`)
   6. **Slater Plain** (`-88.589°`, `108.347° E` | Slope `1.23°` | Luz `64.5%` | DTE `35.6%` | Score `67.0`)
   7. **Haworth** (`-86.689°`, `347.500° E` | Slope `2.93°` | Luz `43.8%` | DTE `36.6%` | Score `66.4`)
   8. **de Gerlache Rim 2** (`-88.161°`, `287.389° E` | Slope `1.69°` | Luz `55.0%` | DTE `32.5%` | Score `65.5`)
   9. **Nobile Rim 1** (`-85.122°`, `36.929° E` | Slope `0.68°` | Luz `46.2%` | DTE `37.0%` | Score `61.2`)
   10. **Shackleton Crater Floor (PSR)** (`-89.625°`, `118.820° E` | Slope `4.02°` | Luz `0.0%` | DTE `0.0%` | DTE+ELFO `100.0%` (+100% gain) | Score `39.6`)

*(Quando gerar modelos sintéticos/compactos no AI Studio sem o GeoTIFF binário LOLA completo, mantenha os parâmetros orbitais/físicos fiéis às elevações e horizontes acima e explicite na UI a origem dos dados.)*

---

### 4. ESTRUTURA DE PASTAS E QUALIDADE DE CÓDIGO SOLICITADA

Organize o projeto de forma limpa e modular:
- `frontend/src/landing-guide/state.ts` (estados, fatiamento temporal UTC `computeWindowSlice`, busca polar `findNearestPrecomputedSite`, resumos humanos e glossário)
- `frontend/src/landing-guide/LunarViewport.tsx` (palco unificado 3D ortográfico + 2D estereográfico polar, pinos A/B, mira central)
- `frontend/src/landing-guide/HomeOverlay.tsx` (Tela inicial `Landing Guide`, `Start`, `How it works` modal)
- `frontend/src/landing-guide/SelectionPopover.tsx` (Centro / Cursor / Busca + Lista acessível A e B / Troca A↔B)
- `frontend/src/landing-guide/DataDrawer.tsx` (inicia fechado; divulgação progressiva em 3 níveis)
- `frontend/src/landing-guide/ChartsDrawer.tsx` (luz solar A/B, DTE/ELFO/blackouts, horizonte 360° e botão `Ver em tabela`)
- `frontend/src/landing-guide/TimePopover.tsx` (UTC data/hora, duração, passos, scrubber, play/pause, velocidade)
- `frontend/src/navigator/math.ts` e `types.ts` (cálculo geométrico puro e tipagem estrita)
- `frontend/src/App.tsx` e `frontend/src/style.css`
- `frontend/src/App.test.tsx` (testes de contrato, matemática, fluxos 2D↔3D, Seleção A/B, Dados progressivos, Gráficos+Tabela e Tempo UTC).

Entregue código TypeScript estrito sem erros (`tsc --noEmit`), CSS responsivo e acessível sem dependências pesadas externas, e garanta visual espacial sofisticado em azul-profundo (`#03060d`), âncoras âmbar (`#f5b749` para A) e ciano (`#57d6ff` para B).
```
