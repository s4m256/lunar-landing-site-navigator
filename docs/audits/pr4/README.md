# PR #4 — auditoria publicada e correção da comparação

**Estado científico: not independently validated.** Nenhum resíduo contra JPL Horizons foi obtido. O proxy rejeita a conexão com HTTP 403; o relatório atual distingue essa falha de uma comparação inválida.

Esta entrega atende ao comentário de handoff de Samuel no PR #4, que disponibiliza o contexto operacional de SPA-9/SPA-10. A branch parte de `a491081`, head auditado do PR #4. O PR de correção tem como base `feat/science-geometric-engine`: não duplica o motor no diff. Não modifica frontend, contratos ou CI; não faz merge. O MVP final permanece dependente de SPA-7/Isaac.

## Correção comprovada

Antes da mudança, uma entrada sintética deliberadamente inválida com `series=[]` retornava exit 0 sem consultar Horizons. A regressão falhou no código original: [log anterior](current/regression-before.txt).

A ferramenta agora valida o schema existente e a completude semântica antes de consultar a rede: dois sites distintos, quatro pares local/alvo, amostras finitas e grid UTC completo. Não altera os JSON Schemas. Exige referências não vazias, horários/contagens correspondentes e ângulos válidos para calcular resíduos. Retém URL da consulta antes da tentativa e respostas recebidas, inclusive em falhas.

Relatórios da ferramenta são diagnósticos, não um novo contrato científico:

| Status | Significado | Exit |
| --- | --- | --- |
| `invalid_input` | Entrada inválida/incompleta; nenhuma consulta | 2 |
| `network_error` | Falha de transporte/HTTP; URL tentada preservada | 2 |
| `invalid_reference` | JSON, resposta ou correspondência inválida | 2 |
| `computed_requires_header_review` | Todas as séries/amostras comparadas; ainda exige revisão física dos cabeçalhos | 0 |

`compared_sample_count` informa o trabalho efetivamente realizado. Uma falha posterior pode preservar resíduos parciais, mas nunca marca a comparação como completa. `validation_status` permanece `not independently validated`: calcular resíduos não certifica convenções ou precisão. Os testes de caminho positivo usam **tabelas sintéticas identificadas como fixtures**, nunca referências científicas inventadas.

## Evidências publicadas

- [Relatório original completo](REPORT.md): metodologia, fontes, achados e revisão adversarial. Preservado como registro da etapa anterior ao handoff/correção; suas observações sobre tarefas não disponíveis e bug não corrigido são históricas.
- [Solicitação de 2026](request-2026.json), [manifest dos kernels](kernel-set-2026.json) e [séries reais](result-2026.json): 365 instantes × dois locais × dois alvos = **1.460 pares**. Não representam visibilidade topográfica, potência ou enlace.
- [Segmentos SPK](segments-2026.json), [comentários internos DE421](de421-comments.txt), [proveniência do pacote](package-source.json) e [metadados do distribuidor](skyfield-data-METADATA.txt).
- [Experimentos algébricos, tempo e horizonte](experiment-summary.json) e [sensibilidade DE405/DE421](ephemeris-sensitivity.json). Consistência interna não é validação externa.
- [Fontes primárias arquivadas](primary-sources.json), [versões originais](versions.json), [inventário revisado](reviewed-files.json) e [diff histórico](pr4-code.diff).
- [Reprodução atual DE421](current/de421-reproduction-summary.json), [testes atuais](current/pytest.txt) e [tentativa atual Horizons](current/horizons-attempt.json). Esta última retornou exit 2, `network_error`, zero amostras comparadas.

Todos os hashes do arquivo original da auditoria foram conferidos antes de copiar os artefatos. `checksums.sha256.json` identifica os arquivos desta publicação. Os binários SPK e wheels não são versionados.

## Aquisição e limitações de 2026

DE421 foi extraído de `skyfield-data==7.0.0` no PyPI. SHA-256 da wheel: `4279f999f7f8c5ef5d8bf1b714f301a0844ae5df3a3f0d23610b20d8789073f5`. SHA-256 do SPK: `a20a7139da04cbc462454634918e9a9ca69127044e2cc9d4f9c16e238d2deedc`.

Isso verifica identidade e integridade em relação ao espelho, **não autenticação direta no servidor NAIF**. Os descritores mostram cobertura contínua dos segmentos 3→0, 10→0, 301→3 e 399→3 em ET [-3169195200,1696852800], cobrindo todo 2026 e margens para tempo de luz.

A orientação continua IAU_MOON analítica. O LSK usado termina com o registro de 2017; sua completude atual ainda precisa de confirmação primária. Horizonte tangente 0° não é o limbo esférico de um observador elevado. Precisão física, compatibilidade com coordenadas de DEM e comparação Horizons não foram certificadas.

## Reprodução atual

Na raiz desta branch, com dependências Python instaladas:

```sh
# Kernels históricos para os testes existentes:
.venv/bin/python -m lunar_science fetch-kernels --kernel-set science/examples/kernel-set.json --kernel-dir /tmp/lunar-historical-kernels
LUNAR_KERNEL_DIR=/tmp/lunar-historical-kernels .venv/bin/python -m pytest science/tests

# Reproduzir DE421/2026 com o motor existente; sem backend, sem novos algoritmos:
.venv/bin/python science/tools/verify_de421_audit.py --cache-dir /tmp/lunar-de421-cache --output-dir /tmp/lunar-de421-reproduction

# Consulta real (nesta execução: exit 2, HTTP 403, não validada):
.venv/bin/python science/tools/compare_horizons.py --result /tmp/lunar-de421-reproduction/result-2026.json --output /tmp/lunar-horizons-comparison.json
```

O reprodutor verifica os hashes, extrai a wheel, verifica toda a cobertura SPK de 2026 e compara as séries com as publicadas. Diferenças de reprodução geram falha para investigação, sem tolerância física inventada. A URL com fragmento no manifest do DE421 documenta o membro da wheel; não é uma URL SPK direta para `fetch-kernels`. Use o reprodutor para essa aquisição.

Os três scripts históricos neste diretório preservam o experimento baricêntrico e suas entradas em `/tmp/lunar-spice-audit`; o comando acima é o caminho portátil para a cobertura e as séries. Não constituem um segundo motor de produto.

## Revisão adversarial desta correção

- Entrada vazia, amostras vazias, pares duplicados/desconhecidos, coordenadas/ângulos NaN e grids diferentes falham antes da rede.
- Transporte bloqueado e referência inválida têm status distintos e nunca exit 0.
- Referência vazia, linhas extras/ausentes, marcadores inválidos, tempo errado, ângulos não finitos/fora da faixa e falha após progresso parcial não viram comparação completa.
- Caminho positivo determinístico verifica contagem e wrap angular; a resposta sintética não é publicada como evidência de Horizons.
- Continua obrigatória a revisão de orientação, ephemeris, altura/raio, calendário e ausência de refração nos cabeçalhos reais antes de interpretar resíduos. Não há aprovação científica automática.
- Depois da liberação de `ssd.jpl.nasa.gov`, começar com um intervalo pequeno e reter respostas reais. A conferência primária dos kernels/LSK exige também `naif.jpl.nasa.gov`.
