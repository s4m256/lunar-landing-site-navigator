# Dados científicos da missão guiada

A missão usa quatro locais hipotéticos a −85° de latitude, distribuídos pelas longitudes leste 0°, 90°, 180° e 270°, e três instantes curados de 2026 às 00h UTC. Os ângulos foram calculados separadamente para cada observador pelo motor SPICE existente, com DE421, `IAU_MOON`, `CN+S`, esfera de raio 1.737.400 m e altura radial zero. O conjunto anterior permanece em sua auditoria original.

A [auditoria da missão](audits/mission/README.md) documenta coordenadas, resultados, hashes, origem dos kernels, reprodução e limites. Os arquivos usados são saídas completas de dois lotes, cada um com exatamente dois observadores. Nenhuma mudança de motor ou de contrato científico foi necessária.

O consumidor `frontend/src/mission/mission-data.ts` oferece:

- `MISSION_SITES`, `MISSION_DATES` e `DEFAULT_MISSION_DATE`: escolhas da experiência; as datas são `2026-03-24`, `2026-04-28` e `2026-09-08`.
- `getMissionAnalysis(siteId, date)`: resultado somente para uma combinação conhecida, no instante exato. Retorna `undefined` para local/data ausente, inclusive datas não selecionadas que existam nos lotes anuais. Não interpola, extrapola ou reaproveita a última escolha.
- `MISSION_PROVENANCE`: resumo em português dos métodos e limites.
- `MISSION_AUDIT`: `{ manifest, results }`, para download JSON contendo fontes/hashes e os dois resultados completos; `undefined` se o artefato embutido falhar na validação, impedindo exportação como dado válido.
- `parseMissionResults(input)`: valida os contratos normativos, quatro observadores exatos, pares únicos, grade diária e identidade dos kernels antes de consumir os dados. Artefatos inválidos geram erro explícito. Na inicialização, o módulo guarda esse erro e o lança em `getMissionAnalysis`, permitindo à interface renderizar sua mensagem de falha sem interromper o carregamento da página.
- `classifyMissionElevation(elevationDeg)`: classifica o sinal sem arredondamento; valores não finitos ou fora de −90° a +90° geram erro.

O critério `meetsGoal` é estritamente `elevação do Sol > 0 && elevação da Terra > 0`, usando os valores completos. Em 24 de março, B e C atendem; em 28 de abril, A; em 8 de setembro, D. Zero significa centro no horizonte e não atende ao objetivo. A interface deve tratar falta/erro de dados como ausência de análise, nunca como escolha adequada.

Esses resultados dizem respeito aos centros e ao horizonte idealizado. Não demonstram bloqueio por relevo, iluminação de um painel, comunicação garantida ou pouso seguro. São cálculos reais com integridade de arquivos e reprodução verificadas, **sem validação física independente pelo Horizons**. A aquisição original foi de distribuições de terceiros; a completude atual do LSK não foi confirmada.

Verificação focada:

```sh
npm run test --workspace frontend -- src/mission/mission-data.test.ts
```
