# lunar-science

Pacote Python independente do frontend para o Lunar Landing Site Navigator (NASA Space Apps 2026).

## O que existe

- `lunar_science.navigator`: motor que pré-computa o dataset `navigator-dataset.v1` a partir do DEM LOLA `ldem_80s_80m` e de kernels NAIF SPICE (DE421, `MOON_ME`): declividade, horizonte de 360°, iluminação, visibilidade DTE e relay, bateria e um Landing Score ilustrativo. Os dados externos são baixados para `science/.cache` com SHA-256 fixado (`data_sources.py`).
- CLI `python -m lunar_science <comando>` (ou `lunar-science`):
  - `fetch-navigator-data`: baixa e confere DEM e kernels.
  - `precompute-navigator`: gera `outputs/` e a cópia em `frontend/src/data/`.
  - `validate-horizons --elevation-m <m>`: compara SPICE com a API JPL Horizons; `--output-dir` grava o relatório e as respostas brutas.
- Sem argumentos, a CLI imprime o placeholder legado de `contracts/science-status.schema.json` (`not_implemented`, único status que esse contrato admite). Ele não descreve o motor acima. Não há serviço HTTP.

## Comparação com o JPL Horizons

- A resposta bruta de cada consulta (URL, parâmetros, horário de recuperação, corpo e SHA-256) é retida em `outputs/validation/horizons_raw/`, ao lado de `horizons_cross_validation.json`.
- O Horizons precisa devolver exatamente os instantes pedidos, para Sol e Terra; linha inválida, tabela vazia ou contagens diferentes são erro.
- `verified` só quando toda separação angular está dentro da tolerância declarada (`--horizons-tolerance-deg`, padrão 0,001°, justificativa no relatório). Caso contrário, `failed`, com os números.
- Só falhas de transporte viram `skipped_network_unavailable`. Qualquer outro erro interrompe a execução. Sem relatório novo, o artefato antigo é apagado.
- O `horizons_cross_validation.json` commitado é anterior a essas regras: não tem resposta bruta e seu `verified` não tem tolerância. Os testes registram isso como `xfail` estrito.

## Janela temporal

A janela padrão (2026-11-15 a 2026-12-15, horária) começa no extremo sul da latitude subsolar do ciclo 2026–27, ou seja, a melhor estação de iluminação do polo sul. Use `--start-utc/--end-utc` com pelo menos um ciclo sazonal (cerca de 346,6 dias) para estatísticas anuais. As séries ficam cerca de 12 vezes mais longas e o dataset, estimado em cerca de 4 vezes o tamanho atual (horizontes e malhas não crescem com a janela). A cobertura e a faixa de latitude subsolar efetivas vão para `provenance.limitations`.

## Mudanças de método desde o dataset commitado (SPA-10)

- PSR: um critério único (`PsrCriterion`) para `is_psr` e `psr_distance_m`. A envoltória solar usa a latitude subsolar extrema do DE421 em 1900–2050 (−1,591°) mais o raio solar máximo (0,272°). A malha de busca é simétrica e inclui o centro. Sem PSR no raio de busca, a distância é desconhecida: o dataset grava o raio (5200 m) como sentinela documentado e o score não dá crédito por proximidade.
- Declividade: base de 160 m declarada. Acima de `clps_slope_limit_deg` (12°, sem fonte), o score é 0.
- Score, relays e coordenadas de sítios: rotulados como ilustrativos, hipotéticos e sem fonte, respectivamente.

Detalhes, efeitos esperados na regeneração e mudanças de contrato propostas estão em [`AUDIT_FOLLOWUPS.md`](AUDIT_FOLLOWUPS.md).

## Testes

No checkout completo, instale com `python -m pip install -e './science[dev]'`, partindo da raiz. Rode `python -m pytest` dentro de `science/` e gere wheel/sdist com `python -m build science` na raiz.

- `tests/test_ephemeris_regression.py`: compara o motor e o dataset commitado com uma referência DE421 independente (`tests/fixtures/independent_de421_reference.json`), gerada sem SPICE a partir de dados do PyPI. Roda na CI sem rede e sem kernels.
- `tests/test_horizons_validation.py` e `tests/test_pipeline_synthetic.py`: usam stubs sintéticos (efeméride analítica, Horizons sintético e DEM sintético) para exercitar o pipeline inteiro sem kernels.
- Os testes que precisam de kernels em `science/.cache` são pulados quando eles não existem, o que sempre acontece na CI.

Os testes de integração dependem de `../contracts/`, versionado na raiz do repositório; execute-os no checkout completo. A wheel e a CLI não dependem desses arquivos externos. Veja `../contracts/README.md` e `../AGENTS.md` para coordenação entre equipes.
