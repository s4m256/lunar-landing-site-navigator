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

## Contrato científico pré-computado (`navigator-dataset.v1.schema.json`)

Define o payload pré-computado em grade para o navegador de sítios de pouso do Polo Sul lunar (`schema_version: "1.0.0"`), validado em Python (`jsonschema`) e no frontend (`Ajv`):

- **Proveniência:** produto DEM LRO LOLA (`ldem_80s_80m`, raio de referência $R_{\text{ref}} = 1\,737\,400\text{ m}$, projeção estereográfica polar em `MOON_ME`), kernels NAIF SPICE com SHA-256 fixado e resumo de validação cruzada com o JPL Horizons.
- **Sítios e malha local:** candidatos no Polo Sul e pontos vizinhos espaçados a $500\text{ m}$ contendo elevação, declividade ($\theta_{\text{slope}}$), distância até PSR, curva de horizonte $h_{\text{horiz}}(\text{Az})$ por *ray-marching* geodésico ($s_{\max} = 120\text{ km}$), séries horárias de Sol, Terra e satélites *relay* (LRO e ELFO *Lunar Pathfinder* / *LunaNet*), métricas solares/energéticas e *Landing Score* composto ($0\text{–}100$).
