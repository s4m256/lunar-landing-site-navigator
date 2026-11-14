# Dados da missão guiada

Esta auditoria acrescenta quatro observadores hipotéticos e três datas curadas à experiência educativa. Os cálculos são reais, feitos pelo motor SPICE existente. A auditoria anterior em `../pr4/` e seus observadores foram preservados.

## Observadores e datas

Todos os observadores têm latitude planetocêntrica **−85°**, altura radial **0 m** sobre a esfera de raio **1.737.400 m**, no referencial `IAU_MOON`. As longitudes são positivas para leste: Local A (`mission-a`) 0°, B 90°, C 180°, D 270°. São escolhas de coordenadas para o exercício, não regiões geológicas identificadas ou recomendações de pouso.

Cada célula abaixo apresenta **elevação do centro do Sol / elevação do centro da Terra**, em graus, arredondada somente nesta tabela. O consumidor usa os valores completos dos arquivos.

| Instante UTC | Local A | Local B | Local C | Local D | Ambos estritamente acima de 0° |
| --- | --- | --- | --- | --- | --- |
| 24/03/2026 00:00 | −2,72 / +11,48 | +3,91 / +6,53 | +1,46 / +1,47 | −5,17 / +6,36 | B e C |
| 28/04/2026 00:00 | +1,97 / +2,62 | +2,33 / −1,87 | −4,72 / −7,33 | −5,09 / −2,83 | A |
| 08/09/2026 00:00 | −3,18 / +7,62 | −2,98 / +2,81 | +4,08 / −2,37 | +3,89 / +2,41 | D |

As datas foram escolhidas após examinar os sinais das elevações diárias calculadas em 2026. Em conjunto mostram as quatro combinações acima/abaixo, uma data com múltiplas soluções e uma solução para cada local em alguma data. A menor elevação absoluta entre os 24 valores exibidos é aproximadamente 1,46°; a escolha evita depender de arredondamentos junto ao horizonte. Isso é uma curadoria didática, não uma busca de janelas operacionais. Não se simula um relógio contínuo nem se infere o instante de transição.

## Arquivos e reprodução

- `request-ab-2026.json` e `request-cd-2026.json`: exatamente dois observadores por solicitação, conforme o contrato original.
- `result-ab-2026.json` e `result-cd-2026.json`: saídas completas, quatro séries por lote, 365 amostras por série, intervalo `[2026-01-01, 2027-01-01)`, passo diário UTC.
- `selected-samples.json`: cópias exatas das 24 direções selecionadas, mais o critério booleano do exercício; é um índice de revisão, não um novo resultado `analysis-result`.
- `manifest.json`: versões de execução, fontes, SHA-256 dos kernels, fontes locais e saídas; cada resultado também preserva a proveniência integral do motor, inclusive cobertura SPK em ET.
- `verification.json`: conferência executada dos hashes, reprodução das saídas e rejeição de cache adulterado.

Na raiz do repositório, com as dependências científicas instaladas e o cache previamente adquirido:

```sh
.venv/bin/python science/tools/generate_mission_fixture.py \
  --cache-dir /tmp/lunar-review-de421-cache \
  --output-dir /tmp/lunar-mission-reproduced
```

O gerador não baixa nada. É possível reconstruir um cache ausente pelo fluxo documentado na [auditoria anterior](../pr4/README.md), que informa as fontes reais. O script exige também o wheel `skyfield_data-7.0.0-py2.py3-none-any.whl` para verificar sua integridade e a do membro DE421, além dos três kernels. O motor é chamado duas vezes sequencialmente, pois o pool de kernels CSPICE é global. Todos os cálculos e verificações terminam antes da gravação das saídas. O horário de geração do manifesto varia entre execuções; os resultados científicos foram reproduzidos exatamente no ambiente registrado.

## Aquisição e validação efetivamente realizadas

Foram reutilizados os arquivos existentes em `/tmp/lunar-review-de421-cache`; não houve nova aquisição de rede. O DE421 de origem JPL veio da distribuição de terceiros `skyfield-data` 7.0.0 no PyPI. PCK e LSK vieram do espelho de kernels de teste SpiceyPy no GitHub. SHA-256 do wheel, do DE421 extraído e de cada kernel foram conferidos contra o manifesto anterior. Um hash preserva a identidade do arquivo; não comprova por si só a integridade contra uma publicação oficial da NAIF.

O motor validou os contratos JSON e resolveu as cadeias de estados para todas as amostras e para os limites solicitados, incluindo as correções de tempo de luz. A nova reprodução compara os arquivos completos e os hashes. Os testes do consumidor verificam coordenadas, pares local/astro únicos, grade temporal, ângulos finitos e em intervalo, kernels, igualdade das amostras selecionadas, estados e casos inválidos. Essa é validação estrutural e de reprodutibilidade numérica.

**Não houve comparação independente bem-sucedida com Horizons.** As tentativas bloqueadas preservadas em `../pr4/` são evidência histórica, não uma nova tentativa nem validação destes quatro locais. Não se declara tolerância física certificada. A integridade de aquisição diretamente da NAIF e a atualidade/completude do LSK continuam não confirmadas.

## Limites do modelo

Usa-se `IAU_MOON`, orientação analítica PCK, correção aparente `CN+S`, referencial na época `OBSERVER` e horizonte tangente idealizado de 0°. Os estados acima/abaixo/no horizonte se referem ao **centro** de cada astro, sem uma faixa arbitrária de tolerância; zero não atende ao objetivo estrito `Sol > 0 && Terra > 0`.

Não há relevo, altura medida, montanha obstruindo um raio, refração, extensão dos discos, eclipses, energia, qualidade de enlace ou avaliação de segurança de pouso. Elevação negativa indica a direção abaixo do horizonte idealizado; nenhum dado aqui permite atribuir essa condição a uma cratera ou montanha específica. Os milissegundos dos rótulos UTC não são uma declaração de precisão física.
