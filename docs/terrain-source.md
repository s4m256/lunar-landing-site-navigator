# Relevo contextual LOLA do explorador mínimo

## Estado desta versão

O explorador mínimo inclui um **recorte visual de um DEM real da missão LRO/LOLA**, de baixa resolução, e mantém o **horizonte científico idealizado**. O relevo não determina obstrução por montanhas, sombras ou estados de visibilidade. O astronauta é um marcador visual ampliado; seu tamanho desenhado não define uma altura física do observador.

As direções do Sol e da Terra continuam vinculadas ao observador `south-a` do artefato científico existente: latitude planetocêntrica −89,5°, longitude leste 0°, altura radial 0 m sobre a esfera de referência, em `IAU_MOON`. O DEM é definido no referencial **Mean Earth/Polar Axis de DE421**. O recorte tem o mesmo centro numérico de latitude/longitude, mas **não foi efetuada uma transformação entre os referenciais**. Portanto, não se afirma que o ponto mostrado corresponda fisicamente ao observador SPICE no terreno.

O rótulo da cena deve permanecer: **“Relevo contextual LOLA · horizonte idealizado”**. Estar acima desse horizonte não comprova iluminação efetiva, disponibilidade de energia ou comunicação. Não foram acrescentadas montanhas procedurais nem alterado o JSON científico auditado.

## Produto incorporado e provas

Produto `LDEM_4`, versão `V3.0`, conjunto `LRO-L-LOLA-4-GDR-V1.0`, criado em 15/09/2017 pela equipe LRO/LOLA. A label PDS identifica o produtor como NASA Goddard Space Flight Center. A aquisição veio de dois espelhos públicos do mesmo produto:

- [marianaq11/lunar-terrain-analysis](https://github.com/marianaq11/lunar-terrain-analysis/tree/3281471e49abb5c58445ff2a3bfc726409b73424), commit `3281471e49abb5c58445ff2a3bfc726409b73424`;
- [rp3gregorio/Lunar-Clean](https://github.com/rp3gregorio/Lunar-Clean/tree/c3de060a9843b7f87bfe516a0af19c3bdbde8bdf), commit `c3de060a9843b7f87bfe516a0af19c3bdbde8bdf`.

Os dois arquivos IMG e as duas labels são idênticos byte a byte. Isso documenta consistência entre espelhos, **sem autenticação direta no arquivo primário** e sem validação física independente.

| Entrada | Bytes | SHA-256 |
| --- | ---: | --- |
| `LDEM_4.IMG` | 2.073.600 | `972d66d7f330abca62abc21aae270661516c00dd1a881ec102b94df9563656b5` |
| `LDEM_4.LBL` | 5.107 | `b5a197b4d417e3b5e0e84f8fe15f9a1d2203b8eb5d7213236c0ffbc86e940cc6` |

A label original está preservada em [frontend/public/terrain/LDEM_4.LBL](../frontend/public/terrain/LDEM_4.LBL), junto do [manifesto de proveniência](../frontend/public/terrain/provenance.json), que registra as URLs fixadas nos commits e o hash do recorte publicado. O IMG original fica fora do bundle: o aplicativo só precisa da grade reduzida.

Metadados confirmados na label:

- 720 linhas × 1440 colunas; inteiros de 16 bits com sinal, little-endian;
- projeção cilíndrica simples; norte acima, longitude positiva para leste, 0–360°;
- registro por pixels, resolução 4 pixels/grau, espaçamento angular 0,25°;
- centro do primeiro pixel: latitude 89,875°, longitude 0,125°;
- `HEIGHT = DN × 0,5`, em metros; `PLANETARY_RADIUS = HEIGHT + 1.737.400 m`;
- referencial `MEAN EARTH/POLAR AXIS OF DE421`;
- escala cartográfica nominal 7.580,84 m/pixel. O espaçamento leste–oeste no globo varia com a latitude;
- limites declarados de DN −17.758 a 21.008. No arquivo adquirido, os extremos observados são −17.757 e 21.008; todos os 1.036.800 valores ficam dentro dos limites e não há sentinelas extremos de int16. DN zero é uma elevação válida, não ausência de dados.

### Recorte e representação

O [JSON contextual](../frontend/public/terrain/south-a-context.json) contém uma grade **33 × 33**, com extensão de **120 km**, centrada numericamente em −89,5°/0° no referencial do DEM. As linhas percorrem norte→sul e as colunas oeste→leste. O espaçamento dos vértices é de 3.750 m; a interpolação **não acrescenta detalhes medidos** à resolução original.

A amostragem usa interpolação bilinear dos centros dos pixels, longitude periódica e limitação ao centro da última linha nos extremos de latitude. A grade é construída em projeção ortográfica local leste/norte/cima: `x` é leste, `z` é sul e `y` é a altura local acima do nível do ponto central do DEM, **incluindo a curvatura lunar**. Uma iteração numérica faz a direção de amostragem concordar com o raio do ponto. Sua tolerância de convergência não é uma alegação de precisão física.

`heightsM` contém alturas locais relativas ao centro para a cena. `elevationsM` preserva as alturas radiais sobre a esfera de referência. Os três eixos devem ser escalados igualmente; não há exagero vertical. A posição científica permanece independente dessa camada contextual.

### Reprodução

O gerador [scripts/prepare-terrain-context.py](../scripts/prepare-terrain-context.py) usa apenas a biblioteca padrão de Python, não faz downloads e exige os hashes exatos da IMG e label. Obtenha os arquivos nas URLs do manifesto e execute, da raiz:

```sh
python scripts/prepare-terrain-context.py \
  --image /caminho/LDEM_4.IMG \
  --label /caminho/LDEM_4.LBL \
  --output-dir /tmp/lunar-terrain-reproduction
```

Compare o hash do JSON produzido com `artifactSha256` em `frontend/public/terrain/provenance.json`. O gerador não modifica a auditoria SPICE nem calcula um horizonte do terreno.

### Atribuição e condições de reutilização

Atribuição dos dados: **NASA / Lunar Reconnaissance Orbiter / Lunar Orbiter Laser Altimeter — LRO LOLA team**. Os links primários do IMG e da label no arquivo PDS/LOLA do MIT estão preservados no manifesto. Esse é um produto científico NASA distribuído publicamente pelo PDS; não atribuímos a licença MIT do código do projeto ou dos espelhos ao dataset. A label original e a atribuição devem acompanhar redistribuições do recorte. Nenhum código dos espelhos foi copiado para o gerador.

## Aquisição examinada em 14/11/2026

As fontes oficiais abaixo retornaram `Tunnel connection failed: 403 Forbidden` no ambiente de execução. A política de rede informada pelo ambiente restringe os domínios acessíveis; portanto, esses resultados não indicam indisponibilidade pública dos serviços.

| Fonte/tentativa | Resultado observado |
| --- | --- |
| [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) | HTTP 403 no proxy |
| [Moon Kit — ldem_3_8bit.jpg](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg) | HTTP 403 no proxy; conteúdo/metadados não recuperados |
| [Moon Kit — ldem_64.tif](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_64.tif) | HTTP 403 no proxy; conteúdo/metadados não recuperados |
| [LRO/LOLA no PDS Geosciences](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) | HTTP 403 no proxy |
| [SLDEM2015 no PGDA](https://pgda.gsfc.nasa.gov/products/54) | HTTP 403 no proxy |

Foram examinadas alternativas públicas no GitHub, permitido pela política, sem executar código dos repositórios externos:

### Jaanga: heightmaps de 256 pixels por grau

O [README de moon-heightmaps-256p-se](https://github.com/jaanga/moon-heightmaps-256p-se/blob/gh-pages/readme.md) declara 10.800 PNGs para latitudes de 0° a −60° e longitudes de 0° a 180°. Essa cobertura **não inclui** o observador em −89,5°. Não foi incorporado ao projeto.

### Recorte SLDEM2015 de demonstração Three.js

O [repositório satoshi7190/threejs-lunar-crater-demo](https://github.com/satoshi7190/threejs-lunar-crater-demo) disponibiliza `SLDEM2015.tif` com 18.893.293 bytes. A leitura do cabeçalho TIFF confirmou:

- 3072 × 3072 amostras de 16 bits, tipo inteiro com sinal;
- passo de 0,001953125° por pixel (512 pixels por grau);
- ponto de amarração em longitude 337°, latitude 12,701171875°;
- identificação `GCS_Moon_2000`, datum `Moon_2000`, elipsoide esférico com raio 1.737.400 m.

Esse recorte cobre aproximadamente longitudes 337–343° e latitudes 6,7–12,7°. **Não inclui o polo sul.** O cabeçalho foi inspecionado sem baixar o raster completo. Não se verificaram todos os valores nem a escala vertical/origem primária, e o arquivo não foi incorporado.

### Primeiro espelho global examinado

O [repositório BrendanLuke15/Lunar_DEM_Interpreter](https://github.com/BrendanLuke15/Lunar_DEM_Interpreter) contém `ldem_4.img` com 2.073.600 bytes. Seus scripts descrevem uma grade 1440 × 720, inteiros de 16 bits com sinal em ordem little-endian, norte acima e longitudes 0–360°. O plotador divide os valores por dois e rotula o resultado como elevação em metros.

Não há nessa raiz uma label PDS que permita confirmar independentemente o datum vertical, georreferenciamento dos centros dos pixels, valores especiais/nodata ou versão do produto. O arquivo `.txt` é uma transcrição hexadecimal, não uma label científica. A grade de 0,25° tem espaçamento norte–sul aproximado de 7,6 km na esfera lunar, insuficiente para resolver relevo local de pouso.

Esse primeiro espelho não foi usado. Uma busca adicional encontrou os dois espelhos com label completa descritos acima, permitindo incorporar o contexto visual com escala, referencial e registro de pixels documentados. A resolução permanece inadequada para resolver obstáculos locais de pouso.

## Requisitos para integrar terreno real

1. Obter um DEM cujo domínio inclua o local e a vizinhança necessária, com metadados primários de projeção/referencial, unidades, referência vertical, resolução, nodata e cobertura.
2. Preservar a fonte, versão e hashes do arquivo adquirido; documentar qualquer recorte, reamostragem ou conversão. Confirmar as condições de uso do produto.
3. Definir o ponto sobre o terreno e a altura do observador/instrumento. Compatibilizar esse ponto com a origem usada pelo motor científico. Colocar o marcador sobre um DEM sem atualizar essa origem criaria duas posições diferentes.
4. Gerar um novo artefato científico, com proveniência própria, caso a posição física do observador mude. Preservar a auditoria existente.
5. Calcular e verificar o horizonte do terreno ou as intersecções, considerando curvatura, extensão e resolução do DEM. A geometria simplificada usada para renderizar a cena não é automaticamente adequada para esse cálculo.
6. Tratar falta de cobertura como resultado indisponível. Não transformar ausência de dados em direção desobstruída.

A mesma distinção vale para sombras de renderização: iluminação visual do material não é validação de sombra científica. Uma futura animação de aproximação/pouso tampouco representa uma trajetória física calculada.

Até cumprir esses requisitos, os resultados do MVP devem permanecer descritos como **direções aparentes relativas a um horizonte idealizado**. O relevo LOLA fica restrito à contextualização visual e não participa dos resultados científicos.
