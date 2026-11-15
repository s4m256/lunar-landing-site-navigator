# SPA-13 — Roteiro da demo (vídeo de até 30 s ou até 7 slides)

Base: aplicação da `main` em `23cc0c7`, servida a partir de `frontend/dist` (build de produção) e
inspecionada em Chromium headless em 15/11/2026. Todos os valores abaixo vêm dessa execução, com a
configuração padrão. Se o frontend mudar antes da gravação, refazer a conferência dos números e dos
rótulos.

Regras aplicáveis (fontes e status em [checklist.md](checklist.md), seção 3): **um** formato só, vídeo
de até 30 s **ou** até 7 slides contando o título; exceder torna o projeto inelegível para o
julgamento global. Tudo em inglês (legendas no vídeo). Link público sem login. Vídeo produzido pela
própria equipe.

## 1. Antes de gravar

- [ ] Gravar a URL pública de produção (ou `vite preview` do mesmo commit), janela 1440×900 com zoom
  de 80–90 % para caber painel e números no quadro. Não gravar em largura de celular: a página tem
  rolagem horizontal a 390 px (achado F2 do checklist).
- [ ] Rótulos que contradizem a descrição: chip "JPL Horizons: verified" no cabeçalho, "cross-checked
  with Skyfield" e "Validação Cruzada JPL Horizons" na caixa de proveniência, selos "CLPS OK". O ideal
  é o frontend corrigir antes (achado F1). Se não der tempo, não mostrar nem narrar esses rótulos como
  validação; a descrição em inglês já declara a limitação.
- [ ] A interface está em português: as legendas em inglês dizem o que está na tela. Não traduzir números
  nem inventar rótulos que não existem.
- [ ] Sem rosto, voz ou nome de menores; sem dados pessoais na tela (abas, favoritos, notificações).
- [ ] Sem narração gerada por IA. Se houver qualquer imagem, vídeo ou áudio gerado por IA, aplicar marca
  d'água visível (imagem/vídeo) e declarar no campo de IA.
- [ ] O botão "Animar 30d" avança 1 hora a cada 90 ms: o mês inteiro leva cerca de 65 s. Para caber no
  vídeo, arrastar o controle temporal ou acelerar o trecho na edição e mostrar o selo "×10".
- [ ] Exportar e conferir a duração: ≤ 30,0 s.

## 2. Opção A — vídeo de 30 s (legendas em inglês)

| # | Tempo | Tela e ação (rótulos reais da interface) | Legenda |
| --- | --- | --- | --- |
| 1 | 0–4 s | Topo da página: mapa "Mapa Polar Sul (80°S–90°S)" com os 10 pontos e o painel "Curva do Horizonte" do ponto padrão, "Shackleton–de Gerlache Connecting Ridge". | Near the lunar South Pole, terrain decides where a lander gets sunlight and sees Earth. |
| 2 | 4–9 s | Destacar o panorama do horizonte (azimute 0–360° × elevação): silhueta do relevo, Sol (amarelo) e Terra (azul). | Each point's 360° horizon is traced from NASA LRO LOLA 80 m elevation data. |
| 3 | 9–14 s | Arrastar o controle "Instante da Missão" do início ao fim (ou "Animar 30d" acelerado, com "×10" na tela): Sol e Terra se movem ao longo do horizonte e a data muda. | Sun and Earth positions from NAIF SPICE (DE421), hourly, Nov 15 – Dec 15, 2026. |
| 4 | 14–19 s | Rolar até "Geração Solar, Sombra Máxima & Janelas de Link": área de iluminação e faixas DTE, ELFO e "Combinado". | We derive the visible solar disk, the longest shadow and direct-to-Earth windows. |
| 5 | 19–25 s | Selecionar "Shackleton Crater Floor (PSR)": selos "Sol: 0% disco" e "DTE (disco cheio): BLOQ", score 39.6. Corte: desmarcar "Ativar Rede Satélites Relay"; score 23.4. | Crater floor: no sunlight, no Earth in view. Only a hypothetical relay links it. |
| 6 | 25–30 s | Ranking: subir "Proximidade Ciência PSR" para 60 %; Malapert Massif (83.6) passa a crista (79.3). | Change priorities and the ranking changes. Illustrative model for one summer month, not mission-validated. |

Valores conferidos com a configuração padrão: crista 88.2 (1º); piso de Shackleton 39.6, e 23.4 sem
relay; com o peso PSR em 60 %, Malapert Massif 83.6, crista 79.3, Nobile Rim 2 78.3.

Não dizer nem escrever: "validated", "verified by NASA/JPL", "safest", "best landing site",
"real-time", "any location", "LRO relay". O "Landing Score" é um índice da equipe; os relays são
hipotéticos.

## 3. Opção B — até 7 slides (inglês)

Os slides precisam se explicar sem narração. Capturas: usar a aplicação publicada em 1440×900.

1. **Title.** "Lunar Landing Site Navigator" [nome final], equipe [sem nomes de menores], desafio
   "Lunar Landing Site Navigator", NASA Space Apps 2026, link do app e do repositório.
2. **Problem.** "Near the lunar South Pole the Sun stays within about 9° of the ideal flat horizon
   (from −5.8° to +8.7° across our 10 points in this window). A few hundred meters of terrain can
   decide between sunlight and shadow, and between seeing Earth or not."
3. **NASA data.** LRO LOLA polar DEM `LDEM_80S_80M` (80 m/px); NAIF SPICE kernels (DE421, lunar
   orientation, frames, leap seconds); JPL Horizons comparison at one point on 16 dates (raw responses
   not retained, no tolerance: "not independently reproduced"); Artemis III region names (NASA, Oct
   2024). Note: the 10 coordinates are our choices, not NASA sites.
4. **Method.** Diagrama: DEM → horizonte 360° (raios até 120 km) e declividade; SPICE → direções do Sol
   e da Terra por hora; → disco solar visível, sombra máxima, DTE, relay geométrico (órbitas
   hipotéticas) → score ponderado → JSON estático validado por schema → navegador (interpolação na malha
   e recálculo com os parâmetros do usuário).
5. **The app.** Captura anotada: mapa polar e malha 5×5, panorama do horizonte com Sol e Terra, gráficos
   de 30 dias, controles e ranking.
6. **Results for this window.** Tabela abaixo, com a frase: "One southern-summer month (best case for
   sunlight). Relay coverage depends on a hypothetical 3-satellite constellation. Score weights are
   ours."

   | Point | Mean visible solar disk | Longest shadow | Direct-to-Earth (full disk) | DTE + 3-sat relay | Score |
   | --- | ---: | ---: | ---: | ---: | ---: |
   | Shackleton–de Gerlache ridge | 100.0 % | 0 h | 35.1 % | 100 % | 88.2 |
   | Malapert Massif | 73.9 % | 158 h | 68.2 % | 100 % | 82.1 |
   | Nobile Rim 2 | 55.1 % | 313 h | 60.6 % | 100 % | 74.5 |
   | Shackleton crater floor (PSR) | 0.0 % | 721 h¹ | 0.0 % | 100 % | 39.6 |

   ¹ "The window is 720 h; durations count hourly samples, a known off-by-one (see Limitations)." O
   app mostra 721.0 h, então o slide repete o valor publicado em vez de corrigi-lo. Fonte da tabela:
   `outputs/reports/site_engineering_summary.md`.
7. **Limits, AI use, links.** Os cinco pontos mais importantes: uma janela de verão; DEM de 80 m;
   relays hipotéticos e só geometria de enlace; score ilustrativo sem incerteza; comparação com Horizons
   não reproduzida. Uma linha sobre uso de IA (texto final do campo de IA). Links do app e do repositório.

## 4. Depois de publicar

- [ ] Abrir o link da demo em janela anônima, em outro dispositivo, sem login.
- [ ] Conferir legendas em inglês, duração ≤ 30 s ou ≤ 7 slides, ausência de dados pessoais.
- [ ] Colar o link no campo "Link to Project Demo".
