# Contrato de dados — versão 1.0.0

`science-status.schema.json` (JSON Schema draft-07) é a fonte normativa. O exemplo em `examples/science-status.json` é usado pelo frontend e comparado à saída do pacote Python em testes.

## Mensagem disponível

| Campo | Tipo | Regra |
| --- | --- | --- |
| `schema_version` | string | Literal `1.0.0` |
| `status` | string | Literal `not_implemented` |
| `message` | string | Texto de apresentação não vazio; não usar para decisões lógicas |

Todos os campos são obrigatórios. Campos extras são rejeitados. Mensagens são objetos JSON em UTF-8. Não existe entrada científica nesta versão, nem coordenadas, unidades físicas, métricas ou resultados. `not_implemented` indica ausência de implementação, e nunca análise concluída, falha de análise ou ausência de candidatos.

## Transporte e validação

O produtor atual é `python -m lunar_science` (ou `lunar-science` após instalação), que escreve um objeto JSON e uma quebra de linha em stdout e termina com código zero. O frontend lê o exemplo local e o valida com Ajv antes de renderizar. Não há comunicação de rede entre os módulos; uma futura API deverá ser definida separadamente. Payloads incompatíveis geram erro explícito no consumidor, sem substituição por resultados fictícios.

## Evolução

Use versionamento semântico do contrato. Mudanças incompatíveis, inclusive novos campos obrigatórios ou valores de status, exigem nova versão principal. Como esta versão rejeita campos desconhecidos e fixa `schema_version`, qualquer nova versão precisa de atualização explícita do consumidor e dos testes; nenhuma compatibilidade automática é prometida. Antes de introduzir dados científicos, documente fontes, licença, proveniência, unidades, sistema de coordenadas lunar, intervalos válidos, valores ausentes e incerteza. Atualize schema, fixture, tipos TypeScript, produtor Python e testes juntos.

## Famílias científicas adicionais

`analysis-request.v1.schema.json`, `analysis-result.v1.schema.json` e `scientific-provenance.v1.schema.json` são contratos novos e independentes (versão 1.0.0 cada). Não substituem nem estendem silenciosamente `science-status` 1.0.0. Veja `../science/GEOMETRY.md` para semântica temporal, unidades, referencial, superfície e limitações. O exemplo calculado está em `../science/examples/result.json`.


## Janela horária MVP B

`visibility-window.v1.schema.json` é uma família independente, versão 1.0.0, para o fallback horário sem terreno. Não modifica as famílias anteriores. Incorpora a definição existente de `analysis-result` sem mudar sua semântica.

O produto declara início 15/11/2026 00:00 UTC e fim **inclusivo** 15/12/2026 00:00 UTC: 721 timestamps, 720 intervalos horários. O pedido interno do motor continua semiaberto e termina em 15/12/2026 **01:00 UTC**, para que a última amostra desejada às 00:00 esteja incluída. Não há amostra às 01:00 no produto.

Além do schema, produtor e consumidor verificam locais/coordenadas, quatro pares únicos, grade UTC exata e `ideal_visible == (elevation_deg > 0)`. Igualdade a zero não é classificada como acima do horizonte. Topografia é obrigatoriamente `unavailable` e `topographic_visible` é `null`, distinto de uma série toda falsa ou horizonte de zero. Essa família não aceita terreno real ou sintético: habilitar topografia futuramente exige contrato e testes coordenados após conferência do DEM/referencial.
