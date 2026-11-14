# Auditoria científica do PR #4 — evidências e limites

Objeto: s4m256/lunar-landing-site-navigator, PR #4, head `a491081f245965448360aa27186a7be9f129cc21`, base observada `03bbba26137e499cda82e9dd61d600d276ea78c8`. Experimentos realizados em 14/11/2026. Não houve alteração no checkout, frontend, main, contratos ou CI; não houve merge ou publicação de comentários. Nenhum resultado deste relatório veio de Horizons.

## Situação das instruções e acesso

SPA-9 e SPA-10 não foram lidas: nenhum conector Linear está disponível, e seus conteúdos foram solicitados ao usuário. Nenhuma implementação/correção foi iniciada antes dessa leitura. Esta entrega é uma análise técnica e experimentos externos ao checkout.

O PR foi obtido por Git, e a página pública pelo GitHub. Inventário integral dos 23 arquivos em `reviewed-files.json`; diff completo salvo em `pr4-code.diff` (schemas normativos também foram lidos separadamente; cópias empacotadas verificadas byte a byte). A página informa PR aberto, um commit, sem descrição e sem revisões; o comentário visível do Vercel informa Preview Ready. A API GitHub está bloqueada, portanto não se declara inspeção de dados privados/inacessíveis. Não se interpreta Preview Ready como teste científico aprovado.

A política observada é restricted, sem exceções personalizadas; permite os presets de gerenciadores de pacotes/GitHub. NAIF e JPL Horizons falham no CONNECT do proxy com HTTP 403, antes de resposta do serviço científico. Evidência com URLs e horário em `network-observations.json`, tentativa da ferramenta original em `horizons-2026-attempt.json`. Isso é bloqueio de egress, não evidência de defeito, indisponibilidade ou divergência do Horizons.

## Resultado principal: cobertura SPK real para 2026

Sem duplicar o motor, foi usado `analyze` do PR, com um manifest externo que substitui apenas o SPK demonstrativo por DE421.

Aquisição: wheel `skyfield-data==7.0.0` do PyPI, SHA-256 `4279f999f7f8c5ef5d8bf1b714f301a0844ae5df3a3f0d23610b20d8789073f5`, conferido com o registro PyPI. DE421 extraído: 16.788.480 bytes, SHA-256 `a20a7139da04cbc462454634918e9a9ca69127044e2cc9d4f9c16e238d2deedc`. Fontes e metadados completos em `package-source.json` e `skyfield-data-METADATA.txt`. O manifest externo aponta a wheel e seu membro interno como proveniência: é usado por `analyze`, não diretamente por `fetch-kernels` (que não extrai wheels). A aquisição reproduzível usa `prepare_data.py` antes da análise.

É um **espelho de terceiros que distribui dados atribuídos ao JPL**, não uma aquisição direta/bit a bit autenticada contra o servidor NAIF. O checksum comprova identidade e integridade em relação ao artefato adquirido; não substitui verificação independente da origem primária. Os comentários internos identificam conversão NIOSPK de DE421, em `de421-comments.txt`.

`spkcov` encontrou a janela ET [-3169195200, 1696852800] para 3, 10, 301 e 399. Os descritores confirmam os segmentos 3→0, 10→0, 301→3 e 399→3, em J2000, tipo 2 (`segments-2026.json`). Portanto há cobertura contínua para a cadeia SPK necessária em todo 2026, inclusive ampla margem para tempo de luz. A janela corresponde aproximadamente a julho/1899–outubro/2053; datas UTC nas extremidades distantes usam a tabela de leap seconds carregada e não são previsões históricas/futuras exatas de UTC.

O motor existente executou [2026-01-01T00:00:00Z, 2027-01-01T00:00:00Z), passo de um dia UTC: 365 amostras × 2 locais × 2 alvos = 1460 pares azimute/elevação. O limite final também foi consultado pelo motor. Arquivos: `request-2026.json`, `kernel-set-2026.json`, `result-2026.json` e `experiment-summary.json`.

Exemplo, 2026-01-01 00:00 UTC, local -89,5° / 0°E / altura 0 na esfera:
- Sol: azimute 32.52825562822418°, elevação 1.7652457306331049°.
- Terra: azimute 358.72155095563°, elevação 6.781256907477674°.

Esses dígitos registram o cálculo, não uma precisão física certificada. Não são resultados de Horizons.

## Auditoria das transformações e fontes primárias

Foram consultados os documentos NAIF/CSPICE distribuídos no repositório oficial NASA/EMTG (cópia arquivada, não documentação mais recente do portal bloqueado). URLs, arquivos e SHA-256 em `primary-sources.json`, textos completos em `primary-sources/`:

- `spkcpo_c`: posição fixa de observador; unidades km; CN+S; referencial avaliado em OBSERVER.
- `spkssb_c`, `stelab_c`: estados baricêntricos e aberração estelar usados no experimento alternativo.
- Required Reading `frames`, `time`, `abcorr`: referenciais, UTC/TDB e correções.
- Comentário primário do próprio pck00010: IAU_MOON é aproximação trigonométrica de Mean Earth/Polar Axis; FK lunar + PCK binário oferecem aproximação mais precisa. Snapshot em `pck00010.tpc.txt`.

A conversão m→km, latitude planetocêntrica, longitude leste, ENU radial e orientação right-handed estão corretas nos casos examinados. A definição az=atan2(E,N), elevação=atan2(U,hypot(E,N)) e a avaliação do referencial em época do observador são compatíveis com os documentos. Não foi encontrado erro algébrico nos experimentos; isso não é prova universal de ausência de erros.

Foi realizado um caminho de cálculo distinto do motor: estado baricêntrico do observador (Lua + estado rotacional do ponto superficial), solução iterativa de tempo de luz, aberração estelar e produtos escalares ENU em J2000. Dois locais, dois alvos e três datas de 2026: 12 casos. Máximo resíduo de azimute 0° à resolução numérica observada; elevação 7.105427357601002e-15°. É teste de consistência de implementação: compartilha CSPICE e kernels, portanto **não é validação dinâmica independente nem comparação com Horizons**.

Sensibilidade às efemérides em 12 amostras de 2007, mudando apenas DE405 subset→DE421: máximo |Δaz|=1.2596362353178847e-6°, |Δel|=3.9790966921415816e-7°. São diferenças medidas entre versões, não erro contra verdade nem tolerância de aceitação. Dados em `ephemeris-sensitivity.json`.

Sensibilidade às correções em 12 casos de 2026: para Sol, maior diferença de azimute NONE versus CN+S ≈0.00596386°. Para Terra, LT versus CN+S ≈0.00578701°. Tabelas completas em `experiment-summary.json`. Não se pode concluir que uma correção isolada é desprezível a partir de cancelamentos entre correções.

## Achados adversariais

### P1 — ferramenta de comparação pode declarar cálculo sem nenhuma comparação

Em `science/tools/compare_horizons.py:21–47`, não há validação de entrada nem exigência de séries/amostras/resíduos não vazios. Entrada sintética deliberadamente inválida `{"series":[],"request":{"sites":[]}}` produz exit 0, `status=computed_requires_header_review` e `comparisons=[]`. Arquivos `synthetic-empty-*` retêm a reprodução. Não se trata de resposta simulada do Horizons; nenhuma consulta foi feita nesse teste negativo.

Correção proposta, NÃO aplicada: validar entrada contra schema e invariantes semânticas antes da rede; exigir as quatro séries corretas e amostras não vazias, correspondência de horários/alvos/locais e quantidade de resíduos; finalizar sem sucesso quando não houver comparações. Preservar configuração e URL antes da consulta, inclusive quando ela falha. Adicionar regressão para entrada vazia e respostas inválidas. Leitura de SPA-9/SPA-10 e branch isolada são pré-requisitos antes de implementar.

### P2 — testes chamados independentes ainda compartilham o mesmo núcleo

`science/tests/test_geometry.py:59–71` chama SPKCPO nos dois lados e reutiliza a projeção, apesar de comentário mencionar SPKPOS. Confirma consistência de transformações, não validação independente. O experimento baricêntrico desta auditoria amplia a diversidade algorítmica, mas também não substitui Horizons nem valida os kernels contra observações. Proposta: corrigir a alegação/comentário e acrescentar referências externas reais após acesso.

### P2 — schemas não asseguram completude semântica

Uma saída com quatro cópias da mesma série passa no schema atual (`duplicate_series_pass_schema=true`). O motor atual gera quatro combinações corretamente; não foi observado erro equivalente na saída real. Consumidores devem verificar unicidade de pares local/alvo, igualdade dos grids e pertencimento dos sites. Qualquer alteração de schema/contrato deve ser proposta para revisão, não aplicada silenciosamente.

### Limitação de orientação, não erro algébrico demonstrado

IAU_MOON com pck00010 não equivale à solução numérica lunar ME/PA de alta precisão. Usar DE421 de translação não atualiza a orientação. Não foram obtidos PCK binário/FK correspondentes, logo não se quantificou a diferença. Coordenadas cartográficas de um produto ME não podem ser copiadas sem verificar/transformar o referencial. Mudança de referencial/superfície deve ser explícita e versionada.

### Horizonte: tangente local não é o limbo de uma esfera para observador elevado

O código mantém horizonte em 0° para qualquer altura; isso está declarado e é consistente como referência tangente. Porém não deve ser chamado de limite físico de ocultação pela esfera em altitude. Para raio R, o limbo fica em -acos(R/(R+h)). A 1 m: -0.06147345°; a 1 km: -1.94349575°; a 10 km: -6.13265872°. Valores analíticos de uma esfera, não terreno lunar medido. A altura 0 do exemplo elimina essa diferença. Não foi aplicada correção de modelo sem revisão.

### Tempos e leap seconds

O PR define calendário UTC semiaberto e rejeita literais de leap second; não promete passo uniforme em SI ao cruzar leap second. Foi medido ET(2017-01-01 00:00:00)−ET(2016-12-31 23:59:59)=2 s. Isso é compatível com a convenção declarada. O último registro do naif0012 é 2017-01-01. Não se confirmou com uma fonte atual se a tabela permanece completa até cada data de 2026: SPICE aceitar UTC futuro não comprova atualização da tabela. A documentação NAIF alerta que futuras leap seconds não são previsíveis indefinidamente.

## Horizonte/JPL Horizons: o que falta conferir

O script existente foi executado de novo com a saída real de 2026 e falhou por HTTP 403. Não há resíduos numéricos contra Horizons. Não se avaliaram com resposta primária os parâmetros/calendários enviados nem a geometria assumida pelo serviço.

Após liberação, começar com um intervalo pequeno: duas horas, dois locais, dois alvos. Reter consultas e respostas integrais. Conferir explicitamente no cabeçalho o centro observador lunar, longitude leste, latitude planetocêntrica versus planetográfica, raio/altura, UTC, ausência de refração, DE usado e orientação lunar. Não presumir que coordenadas numéricas iguais em referenciais diferentes representam o mesmo ponto físico. Comparar direções/azimutes com wrap, tratar singularidade do azimute e investigar diferenças antes de adotar qualquer tolerância. O erro angular entre vetores pode complementar azimute perto do zênite/polo.

## Reprodução

No checkout do PR #4 em a491081, com dependências de science já instaladas. Os scripts de auditoria usam somente `/tmp/lunar-spice-audit` para seus artefatos:

```sh
mkdir -p /tmp/lunar-spice-audit
# Copiar prepare_data.py, run_experiments.py e additional_experiments.py deste relatório para /tmp/lunar-spice-audit/
.venv/bin/python -m lunar_science fetch-kernels --kernel-set science/examples/kernel-set.json --kernel-dir /tmp/lunar-engine-kernels
.venv/bin/python /tmp/lunar-spice-audit/prepare_data.py
.venv/bin/python /tmp/lunar-spice-audit/run_experiments.py
.venv/bin/python /tmp/lunar-spice-audit/additional_experiments.py
LUNAR_KERNEL_DIR=/tmp/lunar-engine-kernels .venv/bin/python -m pytest science/tests
.venv/bin/python -m lunar_science analyze --request /tmp/lunar-spice-audit/request-2026.json --kernel-set /tmp/lunar-spice-audit/kernel-set-2026.json --kernel-dir /tmp/lunar-spice-audit/kernels --output /tmp/lunar-result-2026.json
.venv/bin/python science/tools/compare_horizons.py --result /tmp/lunar-result-2026.json --output /tmp/lunar-horizons-2026.json
```

A última etapa foi executada e retornou exit 2 por bloqueio de rede; não é um comando aprovado. O preparo via PyPI funciona com os destinos permitidos. Versões em `versions.json`. Os 34 testes do PR foram executados com kernels reais e passaram, sem skips (`pytest.txt`). Nenhum teste frontend foi necessário para esta auditoria sem alterações de código.

## Revisão adversarial das conclusões e encerramento

- Cobertura dos segmentos foi lida, não inferida de nome/metadata de pacote; amostras reais de 2026 e limite final foram calculados.
- Integridade PyPI/mirror não foi confundida com autenticação de origem NAIF.
- Checagens de consistência e 34 testes verdes não foram chamadas de validação independente.
- Os defeitos de completude da ferramenta/schema foram produzidos por entradas negativas explicitamente sintéticas, não por dados científicos fabricados.
- Não foi afirmado erro físico do modelo tangente ou do calendário onde as limitações são declaradas.
- Não foi adotada tolerância arbitrária nem alegada aprovação científica por Preview Vercel.
- Acesso a SPA-9/SPA-10, conferência primária de kernels/LSK e comparação Horizons permanecem pendentes. A auditoria documentada tem resultados verificáveis, mas a missão integral não está concluída.

Próximo passo autorizado após leitura das tarefas: corrigir em branch isolada o falso sucesso da comparação, com regressão, sem mudar contratos/CI/frontend; depois completar validação real de um intervalo curto de 2026 com Horizons liberado.
