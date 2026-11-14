# lunar-science

Pacote Python independente do frontend para o Lunar Landing Site Navigator (NASA Space Apps 2026).

Por enquanto, `python -m lunar_science` e `lunar-science` apenas imprimem JSON de status `not_implemented`. Não há algoritmos científicos, dados externos ou serviço HTTP.

No checkout completo, instale com `python -m pip install -e './science[dev]'`, partindo da raiz. Execute os testes com `python -m pytest`, dentro de `science/`, e gere wheel/sdist com `python -m build science` na raiz.

Os testes de integração dependem de `../contracts/`, versionado na raiz do repositório; execute-os no checkout completo. A wheel e a CLI não dependem desses arquivos externos. Veja `../contracts/README.md` e `../AGENTS.md` para coordenação entre equipes.
