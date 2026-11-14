# Lunar Landing Site Navigator

MVP estático para explorar a direção aparente dos centros do **Sol e da Terra** a partir de um ponto próximo ao polo sul lunar. A tela principal apresenta um observador simbólico, uma cena 3D e três controles agrupados: **data UTC, Recentrar e Informações**.

## Executar

Requer Node.js 24 e npm 11. Na raiz:

```sh
npm ci --include=dev
npm run dev
```

Abra o endereço informado pelo Vite. Para conferir os arquivos estáticos:

```sh
npm run build
npm run check:deploy
npm exec --workspace frontend -- vite preview --host 127.0.0.1 --port 4173
```

Esses comandos não publicam o site. A configuração Vercel permanece na raiz, com saída em `frontend/dist`.

## O que a versão mínima mostra

- Um local fixo: **south-a**, latitude planetocêntrica −89,5°, longitude leste 0°, altura radial 0 m sobre a esfera de referência.
- Sol e Terra simultaneamente, com azimute e elevação do mesmo instante UTC.
- 365 datas de 2026, sempre às **00:00 UTC**. Não há interpolação nem escolha de horário entre amostras; o fim em 01/01/2027 é exclusivo.
- Câmera manipulável e comando para recuperar a vista inicial. Os resultados também estão disponíveis em texto.
- Fontes, método, hipóteses e download do JSON original em Informações.

O astronauta é um marcador visual, não uma simulação de uma pessoa ou veículo. A cena inclui um recorte contextual de 120 km do DEM LRO/LOLA LDEM4, com escala e proveniência documentadas. O relevo está no referencial ME/DE421, sem transformação para o IAU_MOON das direções. A origem científica permanece no observador definido no dataset; a malha não calcula obstruções, sombras ou segurança. Se o relevo não carregar, a vista identifica explicitamente a superfície idealizada.

**Não são observações diretas, recomendações de pouso ou estimativas de energia/enlace.** O cálculo de direções usa superfície esférica, IAU_MOON e correção CN+S. Ele não incorpora obstrução pelo relevo, refração, disco finito, eclipses ou antenas. Amostras diárias não fornecem horários de nascer/pôr nem duração contínua de janelas. Não há validação independente contra Horizons; a auditoria registra HTTP 403 e zero comparações. Reprodução numérica não certifica precisão física.

Detalhes: [MVP minimalista](docs/minimal-explorer.md). Situação das fontes de terreno: [relevo](docs/terrain-source.md).

## Dados e arquitetura

Python/SPICE calcula offline; React/TypeScript consome o [artefato auditado de 2026](docs/audits/pr4/result-2026.json). Nenhum backend ou Python executa no navegador. O contrato `analysis-result` 1.0.0 e invariantes de cobertura são verificados antes de mostrar valores; falhas não geram números substitutos. O artefato original e seus hashes são preservados.

`frontend/src/explorer/` contém a nova experiência. A demonstração comparativa e o planejamento anterior permanecem em `LegacyApp.tsx` e seus componentes para manter o histórico e os testes, fora da entrada principal do produto.

Three.js é carregado separadamente para a cena. Não foram copiados código, fontes proprietárias ou ativos do Lunar Trek; ele serviu como referência de composição visual.

## Validação

```sh
npm run test:infra
npm run typecheck
npm test
npm run build
npm run check:deploy
```

Desenvolvimento científico, Python 3.12+:

```sh
python -m venv .venv
.venv/bin/python -m pip install -e './science[dev]'
.venv/bin/python -m lunar_science fetch-kernels --kernel-set science/examples/kernel-set.json --kernel-dir /tmp/lunar-historical-kernels
LUNAR_KERNEL_DIR=/tmp/lunar-historical-kernels .venv/bin/python -m pytest science/tests -ra
.venv/bin/python -m build science
.venv/bin/python science/tools/verify_de421_audit.py --cache-dir /tmp/lunar-de421-cache --output-dir /tmp/lunar-de421-reproduction
```

Os kernels históricos de teste usam DE405 e não cobrem 2026; o reprodutor usa DE421 e compara com a auditoria. Sem kernels, parte dos testes é explicitamente pulada. DE421 foi adquirido por espelho de terceiros com hashes, sem autenticação direta no servidor NAIF. Veja [GEOMETRY.md](science/GEOMETRY.md).

Histórico da integração anterior: [MVP A](docs/mvp-a-integration.md). Configuração de publicação e CI: [deploy](docs/deploy.md). O projeto não pressupõe vínculo oficial com a NASA.
