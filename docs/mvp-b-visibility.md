# MVP B — janela horária, com topografia real indisponível

## Base, escopo entregue e bloqueio

Branch `feat/lunar-topographic-visibility`, criada diretamente do PR #6 `feat/mvp-a-scientific-integration`, commit `21d539b723f599c11fd60958a562057e2d5a12b5`. Não se incorporou a branch mission-pipeline, nem se reescreveu o frontend. MVP A anual e planejamento livre continuam disponíveis; foi adicionado um modo separado de visibilidade horária.

**Não foi possível entregar perfis LOLA ou janelas topográficas reais.** PDS/LOLA, NASA PGDA e NASA LOLA retornaram HTTP 403 no CONNECT do proxy antes de metadados. [Registro das requisições](evidence/mvp-b/dem-access.json). Não se inventaram hashes, datum, projeção, alturas ou transformações de coordenadas. O fallback temporal está funcional; a interface mostra indisponibilidade, não supostos efeitos do relevo.

A decisão segue o fallback autorizado no escopo. A [etapa de terreno](mvp-b-terrain.md) registra as verificações necessárias para habilitar topografia posteriormente. IAU_MOON não foi renomeado como MOON_ME; coordenadas numéricas iguais nesses referenciais não são presumidas o mesmo ponto físico.

## Dados e significado

- Dois locais preservados: south-a = −89,5° / 0°E / altura radial 0 m; south-b = −89° / 90°E / altura radial 0 m. Locais hipotéticos, não recomendações.
- SPICE `spkcpo`, IAU_MOON, CN+S e época OBSERVER, usando o mesmo DE421/PCK/LSK do MVP A com hashes conferidos. Esfera de referência de 1.737.400 m.
- Quatro séries (dois locais × Sol/Terra), cada uma com **721 instantes** de 15/11/2026 00:00 a 15/12/2026 00:00 UTC inclusive. São **720 intervalos horários e 720 horas** entre extremos.
- O motor original usa intervalo semiaberto: o pedido interno termina em 15/12 01:00 UTC para incluir a amostra final desejada de 00:00. O envelope do produto explicita essa distinção; nenhum estado às 01:00 é exibido.
- `ideal_visible` significa exclusivamente elevação do **centro** aparente > 0°. Contato em 0° não é acima. `topographic_visible` permanece `null`, não `false` e não uma cópia dos estados idealizados.
- Os traços são estados amostrados, sem interpolação. Os pares de horários das mudanças detectadas delimitam intervalos de uma hora; não são horários exatos de eventos. Mudanças adicionais entre amostras podem passar despercebidas. Não há soma de timestamps como duração contínua.

Não se modelam geração de energia, iluminação total do terreno, enlace operacional, relays, baterias, Landing Score ou segurança. Não se alega comparação independente contra Horizons. DE421 veio de espelho de terceiros, não de verificação direta no servidor NAIF; a completude atual do LSK e precisão física continuam sem certificação independente.

## Reproduzir e executar

Para abrir o app estático, Node 24/npm 11 bastam:

```sh
npm ci --include=dev
npm run dev
# selecionar “Visibilidade horária / MVP B”
```

Para reproduzir a aquisição dos kernels do MVP A e gerar o dataset horário, Python 3.12+:

```sh
python -m venv .venv
.venv/bin/python -m pip install -e './science[dev]'
.venv/bin/python science/tools/verify_de421_audit.py --cache-dir /tmp/lunar-de421-cache --output-dir /tmp/lunar-de421-reproduction
.venv/bin/python science/tools/build_visibility_window.py --cache-dir /tmp/lunar-de421-cache --output /tmp/mvp-b-hourly.json --evidence /tmp/mvp-b-hourly-evidence.json
```

O segundo comando científico reutiliza `geometry.analyze`, sem alterar o motor ou os contratos anteriores. O produtor valida o novo schema e a semântica antes de escrever. É um programa offline; o build Vite publica apenas HTML/JS/CSS/JSON.

Dataset publicado: [mvp-b-hourly.json](data/mvp-b-hourly.json). SHA-256:

`42d232fdd7f9a4d48f7fa267d983fa56b3b039d579c001aca8e01c80da0d118f`

[Registro científico](evidence/mvp-b/hourly-validation.json): duas gerações byte-idênticas, 124 amostras diárias sobrepostas ao MVP A exatamente iguais. Isso comprova consistência/reprodutibilidade com o mesmo motor e kernels, não precisão física independente. O consumidor Ajv verifica schema, cobertura, IDs/coordenadas, pares, grade UTC, finitude e flags; erro gera mensagem explícita sem resultados substitutos. O download conserva o arquivo completo com proveniência.

## Verificações executadas

- `npm ci --include=dev --cache /workspace/.cache/lunar-npm`: passou. O cache explícito é ajuste deste ambiente sem escrita no cache home.
- `npm run test:infra`: **7 passaram**, incluindo hashes do dataset A e B.
- `npm run typecheck`: passou; `npm test`: **93 passaram**, incluindo todas as 2.884 amostras B, erros de schema, flags incoerentes, alvos/locais/grids trocados, datas/horas fora da cobertura e preservação do MVP A.
- `npm run build` e `npm run check:deploy`: passaram. Vite emitiu aviso não bloqueante de bundle >500 kB: cerca de 1.157 kB / 237 kB gzip, incluindo os dois datasets e validadores.
- `LUNAR_KERNEL_DIR=/tmp/mvp-a-historical-kernels .venv/bin/python -m pytest science/tests -ra`: **117 passaram, zero skips**. [Log](evidence/mvp-b/python-tests.txt).
- `.venv/bin/python -m build science`: wheel e sdist gerados. Os schemas empacotados e normativos são comparados em testes.
- **25 testes analíticos/sintéticos de horizonte** dentro dessa suíte: esfera lisa/altura, montanha/borda conhecida, latitude/longitude/azimute, cobertura/nodata/bordas e convergência radial/angular. [Detalhes e limites](mvp-b-terrain.md). Não validam LOLA nem produzem perfis dos dois locais.
- Navegador Chromium/Playwright sobre build estático local: desktop e 390 px, UTC sob timezone America/Sao_Paulo, 24 números angulares e 12 flags conferidos em datas inicial/intermediária/final; todas as seleções, ausência de dados, modo anterior, gráfico/tabela e download por hash passaram. Sem erros/avisos de console nem recursos com falha. [Registro](evidence/mvp-b/browser-validation.json).

Capturas locais: `/tmp/mvp-b-desktop.png` e `/tmp/mvp-b-mobile.png`. Não foi realizado deploy público. A suíte distingue explicitamente evidências sintéticas, kernels reais e aquisições externas bloqueadas.

## Revisão independente

Agentes separados verificaram aquisição/terreno, geração horária e consumidor/testes, além de navegador. O achado defensivo de grade inconsistente no helper de transições TypeScript foi corrigido e coberto por regressão. Não se detectou associação incorreta de local/alvo/UTC no produto demonstrado.

A próxima etapa científica concreta é obter label/DEM oficial com integridade verificável e estabelecer sua compatibilidade de referencial/vertical/projeção antes de conectar um adaptador de terreno. Nenhum controle da interface habilita dados topográficos neste estado.
