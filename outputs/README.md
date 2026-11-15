# Outputs do Motor Científico — Lunar Landing Site Navigator

Artefatos gerados pelo motor Python (`science/src/lunar_science/navigator/`) a partir do DEM polar LRO LOLA `ldem_80s_80m` e dos kernels SPICE NAIF `de421.bsp` / `moon_pa_de421_1900-2050.bpc`. Regenerá-los exige baixar esses arquivos de hosts externos. A saída também não é idêntica byte a byte, porque inclui `generated_utc`.

> Os arquivos commitados aqui foram gerados pelo código anterior à SPA-10 e não foram regenerados. Os rótulos que eles trazem sobre si mesmos (`cross-checked with Skyfield`, `verified`) não têm suporte. Veja a seção "Estado da verificação científica" do [README](../README.md) e [`science/AUDIT_FOLLOWUPS.md`](../science/AUDIT_FOLLOWUPS.md).

## Estrutura

- **`datasets/south_pole_precomputed.v1.json`**
  Dataset pré-computado conforme `contracts/navigator-dataset.v1.schema.json`. "Validado" aqui significa conformidade com o schema, não validação científica. Contém:
  - 10 pontos candidatos no Polo Sul (pontos representativos sem fonte dentro ou perto de regiões Artemis III, a crista Shackleton–de Gerlache e o fundo de Shackleton como contraste em PSR);
  - curvas de horizonte de 360° por *ray marching* em círculos máximos da esfera de referência (`s_max = 120 km`, passo `80 m`);
  - séries horárias (`721` instantes, 2026-11-15 a 2026-12-15, ou seja, 30 dias e não um mês sinódico) para Sol, Terra, satélite ELFO primário, constelação ELFO de 3 satélites e um cenário "LRO-like". Os três relays são hipotéticos. A janela começa no extremo sul da latitude subsolar, então a iluminação é a da melhor estação, não a média anual;
  - malhas locais `5×5` (espaçamento `500 m`) por sítio, usadas pela interface para interpolação bilinear.

- **`validation/horizons_cross_validation.json`**
  Comparação de azimute/elevação aparentes de Sol e Terra entre SPICE `MOON_ME` e a API JPL Horizons (`coord@301`) em um único sítio. **O arquivo commitado não retém a resposta bruta** (URL, parâmetros, cabeçalho, data), e seu rótulo `verified` foi atribuído sem tolerância. Ele não foi reproduzido de forma independente. As colunas `spice_*` foram conferidas contra uma referência DE421 independente (`science/tests/test_ephemeris_regression.py`); as colunas `horizons_*` não puderam ser conferidas. Execuções novas gravam as respostas brutas em `validation/horizons_raw/` e apagam este arquivo quando a comparação não roda.

- **`reports/site_engineering_summary.csv`** e **`reports/site_engineering_summary.md`**
  Tabelas por sítio: declividade, proximidade de PSR, fração iluminada, sombra máxima contínua, bateria mínima, duty cycle DTE e relay, ganho de cobertura relay, blackout máximo e Landing Score (`0–100`, índice ilustrativo). Execuções novas também marcam sítios eliminados por declividade, mostram "nenhum PSR no raio" em vez do sentinela e incluem o score sem relay.

## Como regenerar

```bash
# 1. Baixar e verificar SHA-256 dos kernels SPICE e do DEM LOLA (salvos em science/.cache)
lunar-science fetch-navigator-data

# 2. Executar o pipeline e exportar datasets/relatórios em outputs/ + frontend/src/data/
lunar-science precompute-navigator
```
