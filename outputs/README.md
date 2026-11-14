# Outputs do Motor Científico — Lunar Landing Site Navigator

Esta pasta concentra todos os artefatos reprodutíveis gerados pelo motor Python (`science/src/lunar_science/navigator/`), utilizando dados oficiais da NASA (LRO LOLA DEM polar `ldem_80s_80m` + kernels SPICE NAIF `de421.bsp` / `moon_pa_de421_1900-2050.bpc` + validação cruzada no JPL Horizons).

## Estrutura Organizada

- **`datasets/south_pole_precomputed.v1.json`**
  Conjunto pré-computado validado estritamente contra `contracts/navigator-dataset.v1.schema.json`, contendo:
  - 10 sítios candidatos do Polo Sul Lunar (regiões Artemis III, crista de referência Shackleton–de Gerlache e piso de cratera PSR para contraste);
  - Curvas completas de horizonte geodésico de 360° (`s_max = 120 km`, passo `80 m`);
  - Séries temporais sinódicas horárias (`721` instantes cobrindo `~30 dias`) para Sol, Terra (com libração natural capturada no referencial `MOON_ME`), satélite primário ELFO, constelação ELFO 3-satélites (*LunaNet*) e LRO (`50 km`, avaliado em alta resolução de 5 minutos);
  - Malhas locais `5×5` (`espaçamento 500 m`) por sítio para interpolação espacial bilinear instantânea (`< 10 ms`) na interface React.

- **`validation/horizons_cross_validation.json`**
  Comparação direta (azimute e elevação aparentes topo-cêntricos para Sol e Terra) entre o motor local SPICE `MOON_ME` e a API oficial `NASA/JPL Horizons` (`coord@301`), reportando a discrepância angular máxima em graus.

- **`reports/site_engineering_summary.csv`** & **`reports/site_engineering_summary.md`**
  Planilha e relatório comparativo ranqueando todos os sítios candidatos segundo declividade CLPS, proximidade de PSR, fração iluminada solar, sombra máxima contínua, dimensionamento mínimo de bateria, *Duty Cycle* DTE vs Relay (ELFO/LRO), ganho de cobertura Relay, duração máxima de *blackout* e *Landing Score* composto (`0–100`).

## Como Regenerar

```bash
# 1. Baixar e verificar SHA-256 dos kernels SPICE e DEM LOLA (salvos em science/.cache)
lunar-science fetch-navigator-data

# 2. Executar simulação completa e exportar datasets/relatórios em outputs/ + frontend/src/data/
lunar-science precompute-navigator
```
