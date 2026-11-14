# Pacote de mudanças 1 — superfície lunar e sombras visíveis

## Correção de experiência

A exploração anterior mostrava a Lua de fora, numa esfera central. O pedido era uma navegação de superfície semelhante à interação do Google Maps: o mapa ocupa a viewport, e alternar 2D/3D inclina a mesma região.

Agora o globo fica somente na entrada. Start abre o relevo LOLA do polo sul em tela inteira. O mesmo mesh e estado de centro/zoom/giro/A/B/UTC servem às duas vistas. A câmera olha de cima em 2D e inclina 40° em desktop, 32° em telas estreitas. Não há troca por outro mapa nem perda de seleção. Há pan, zoom por roda/pinça/botões, giro e alternativas de teclado. A mira confirma a interseção real do raio central com o terreno.

Os controles nos cantos, painéis e análises anteriores foram preservados. O giro é da projeção polar; o botão 0° restaura sua orientação, sem afirmar que existe um norte local único no recorte.

## Terreno real, não textura inventada

Foi obtido diretamente do PDS Geosciences o produto LOLA **LDEM_80S_80M V2.0**, conjunto `LRO-L-LOLA-4-GDR-V1.0`, criado em 15/06/2017. Não foi incorporado o motor da outra branch científica.

| Evidência                   | Valor                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonte                       | [IMG oficial](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.img) · [label](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.lbl) |
| Fonte completa              | 7.600 × 7.600, int16 little-endian, 115.520.000 bytes                                                                                                                                                                                                   |
| SHA256 IMG                  | `e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc`                                                                                                                                                                                      |
| Projeção                    | Estereográfica polar sul, meridiano central 0°, latitude planetocêntrica, longitude leste                                                                                                                                                               |
| Referencial                 | Mean Earth / Polar Axis of DE421, identificado como `MOON_ME_DE421`                                                                                                                                                                                     |
| Altura                      | `DN × 0,5 m`, elevação radial sobre R=1.737.400 m; offset não somado duas vezes                                                                                                                                                                         |
| Asset de exibição           | 513 × 513, 400 m, células exatas a cada 5 pixels da fonte80m                                                                                                                                                                                            |
| Origem dos centros de pixel | x=−102.360 m, y=+102.360 m; x cresce por coluna, y decresce por linha                                                                                                                                                                                   |
| Resolução efetiva da malha  | 257 × 257, 800 m, sem exagero vertical                                                                                                                                                                                                                  |
| Alturas do asset            | −4.982,5 a +5.402 m                                                                                                                                                                                                                                     |
| SHA256 asset                | `39304500707c4974c733d821cc88ee33e8ae7872db178b27a27310ce5e24b660`                                                                                                                                                                                      |

Tamanho, grade, tipo de amostra e extremos foram conferidos com o label. Todos os 263.169 valores do asset foram comparados às células correspondentes do raster original. O registro de pixel preserva o deslocamento de meio pixel; não se forçou simetria no polo. O produto não declara valor nodata; sentinelas extremas inesperadas foram procuradas, sem ocorrências. O consumidor trata nodata/fora de cobertura como ausência, sem clipping de índices ou preenchimento por zero.

O SHA é um digest local fixado após aquisição HTTPS oficial. Não foi encontrado manifesto de checksum do distribuidor na raiz consultada; isso não é assinatura do PDS ou validação física independente. O próprio DEM interpola trilhas LOLA: não equivale a uma medição direta em cada pixel.

O raster original de 115 MB fica no cache local, fora do Git. Apenas o asset reduzido necessário ao produto estático, sua proveniência e o gerador são versionados.

## Referenciais e posições

O DEM não foi renomeado como IAU_MOON. Foram obtidos da NAIF o FK `moon_080317.tf` e o PCK binário `moon_pa_de421_1900-2050.bpc`, com hashes e cobertura registrados no asset solar. O SPK DE421 mantém sua proveniência anterior do espelho skyfield-data; não se transforma toda a cadeia em aquisição oficial NAIF.

O produtor offline emite direção solar em MOON_ME_DE421 e matriz de rotação IAU_MOON→MOON_ME_DE421 para cada um dos **1.055 UTCs únicos** dos datasets diário/horário. A/B permanecem definidos em IAU_MOON, altura radial 0 m, e são transformados para a vista em cada instante. Seleções feitas na superfície são explicitamente MOON_ME_DE421 e não recebem séries IAU por coincidência numérica.

As matrizes foram verificadas quanto a ortogonalidade, determinante e inversa. A transformação desloca os exemplos dezenas de metros em 2026; ela não foi presumida identidade. Os vértices usam posição cartesiana lunar `(R+h)·unit(lat,lon)` e base local com curvatura, em quilômetros para Three.js. Não se trata altura radial como z de um plano infinito.

Os observadores originais de 0 m sobre a esfera podem ficar centenas de metros acima/abaixo do DEM. Seus marcadores conservam essa posição analítica; a análise não foi silenciosamente deslocada para 2 m sobre o chão.

## O que as sombras mostram

A luz sempre usa **SUN**, mesmo quando o painel compara Terra. A direção do centro solar é calculada com SPICE/CN+S em MOON_ME e aproximada como paralela no recorte. O relógio só escolhe vetores em UTCs existentes: não há interpolação temporal. O asset contém matrizes e vetores, não uma classificação de iluminação do terreno.

O render usa sombras direcionais PCF, mesh que projeta/recebe sombra e curvatura lunar. Desligar **Sombras do Sol** permite observar seu efeito; **Ver exemplo horário** seleciona a janela de novembro. Avançar/reproduzir amostras modifica a direção da luz e as sombras mantendo câmera e zoom.

Esta camada é uma **aproximação visual**, separada dos gráficos e flags científicos:

- Fonte80m → asset400m → mesh800m omite pequenas feições.
- Recorte finito de aproximadamente205km pode omitir obstáculos externos.
- Shadow map2048 sobre330km tem resolução aproximada161m no plano da luz, com erro projetado maior em Sol rasante; há bias/normalBias e antialiasing.
- Luz ambiente artificial, cores por altura e curvas de nível auxiliam a leitura; não são refletância, radiância ou fotografia.
- Abaixo do horizonte tangente do polo, a luz direta é desativada como convenção de exibição. Isso não classifica todo ponto do recorte como noite.
- Não há disco solar finito, penumbra fisicamente calibrada, eclipse, validação de janelas contínuas, energia ou enlace de rádio.
- As séries A/B continuam usando o horizonte idealizado0° e `topographic_visible` do JSON horário continua `null`.
- Não há validação independente contra Horizons nem certificação de precisão física.

## Reproduzir e executar

App estático: Node24/npm11, `npm ci --include=dev`, `npm run dev`; ou `npm run build` e `npm run check:deploy`. Three.js é a única nova dependência de produção. Sem Python/kernels/backend em runtime. Assets são carregados por URL estática e validados; erro não produz terreno fictício.

Preparação offline, com o ambiente Python do repositório:

```sh
.venv/bin/python tools/prepare-terrain-visual.py --cache /tmp/landing-guide-terrain-investigation
.venv/bin/python tools/prepare-terrain-solar.py --kernel-dir /tmp/landing-guide-solar-kernels --fetch
```

Com caches já obtidos, usar `--no-download` no gerador de terreno e omitir `--fetch` no solar. Ambos foram executados novamente e produziram os mesmos bytes/hashes. SHA256 do asset solar: `b8a4e320869a5b2b26808db07570c29049719bb9e5974c7fb3d4aef6043cc4ce`.

## Evidência de verificação

Verificações locais desta revisão: **181 testes frontend**, **117 Python**, **7 de infraestrutura**, typecheck, build e check de deploy aprovados. O navegador executou **29 grupos de cenários** nos quatro tamanhos. No recorte GPU de 800×400, sombras ligadas/desligadas alteraram 109.377 pixels; 00→20UTC alterou 187.866 pixels. Esses números medem diferença de imagem, sem representar precisão científica.

- Testes TypeScript cobrem geometria esférica/curvatura, polos, longitude, matrizes próprias, validação de assets, nodata/bordas e consulta temporal exata. Trocar para ME não libera dados científicos IAU por ID ou coordenada.
- A revisão independente verificou orientação exterior dos 131.072 triângulos, sinais do vetor solar e distinção IAU/ME/altura radial.
- Navegador Chromium com WebGL foi exercitado em desktop/tablet e mobile320/390: canvas em toda a viewport, pan/zoom/giro, 2D/3D preservando câmera, mira por raycast, seleção livre sem ciência substituta, foco/painéis e tempo.
- Capturas com mesma câmera e UTC, sombras ligadas/desligadas, mostram alteração visual real. Capturas 00→20UTC mostram evolução temporal sem mover a câmera. São provas funcionais de renderização, não erro angular ou precisão científica.
- O runner `scripts/browser-landing-guide.mjs` exporta os recortes; `python tools/check-terrain-render-images.py DIRETORIO` (Pillow apenas para teste) mede diferenças de pixels. Evidências ficam fora do repositório.

Não houve alterações em `science/` ou `contracts/`, merge na main ou promoção em produção. O PR permanece uma revisão empilhada sobre a base MVP B.
