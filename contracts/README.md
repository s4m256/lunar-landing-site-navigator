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
