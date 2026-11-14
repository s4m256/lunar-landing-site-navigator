# lunar-science

Pacote Python independente do frontend. O subcomando `analyze` calcula direções aparentes dos centros do Sol e da Terra com SpiceyPy/CSPICE, para dois observadores numa superfície lunar esférica idealizada.

Leia [GEOMETRY.md](GEOMETRY.md) para instalação, geração reproduzível de JSON, contratos, fontes e validação. O exemplo calculado é histórico (2007); o conjunto demonstrativo não cobre 2026. A comparação com Horizons está pendente devido ao bloqueio de rede, sem alegação de validação externa concluída.

Sem subcomando, `python -m lunar_science` e `lunar-science` preservam o JSON de status `not_implemented` do contrato legado. Não há servidor HTTP, topografia, potência, modelo de enlace ou ranking.

Na raiz do checkout: `python -m pip install -e './science[dev]'`. Testes: `python -m pytest` dentro de `science/`; build: `python -m build science` na raiz. Os testes de contrato usam `../contracts/` no checkout completo. A wheel contém os novos schemas necessários à execução independente. As regras de colaboração estão em `../AGENTS.md`.
