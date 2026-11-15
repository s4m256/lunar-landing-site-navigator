# Contrato de dados — versão 1.0.0

`science-status.schema.json` (JSON Schema draft-07) é a fonte normativa. O exemplo em `examples/science-status.json` é usado pelo frontend e comparado à saída do pacote Python em testes.

## Mensagem disponível

| Campo | Tipo | Regra |
| --- | --- | --- |
| `schema_version` | string | Literal `1.0.0` |
| `status` | string | Literal `not_implemented` |
| `message` | string | Texto de apresentação não vazio; não usar para decisões lógicas |

Todos os campos são obrigatórios. Campos extras são rejeitados. Mensagens são objetos JSON em UTF-8. **Este contrato de status** não tem entrada científica, coordenadas, unidades físicas, métricas nem resultados; esses dados ficam no contrato `navigator-dataset.v1`, descrito abaixo. `not_implemented` indica que não existe serviço de análise sob demanda por trás desse status. Não significa análise concluída, falha de análise nem ausência de candidatos, e não descreve o dataset pré-computado do navegador.

## Transporte e validação

O produtor atual é `python -m lunar_science` (ou `lunar-science` após instalação), que escreve um objeto JSON e uma quebra de linha em stdout e termina com código zero. O frontend lê o exemplo local e o valida com Ajv antes de renderizar. Não há comunicação de rede entre os módulos; uma futura API deverá ser definida separadamente. Payloads incompatíveis geram erro explícito no consumidor, sem substituição por resultados fictícios.

## Evolução

Use versionamento semântico do contrato. Mudanças incompatíveis, inclusive novos campos obrigatórios ou valores de status, exigem nova versão principal. Como esta versão rejeita campos desconhecidos e fixa `schema_version`, qualquer nova versão precisa de atualização explícita do consumidor e dos testes; nenhuma compatibilidade automática é prometida. Antes de introduzir dados científicos, documente fontes, licença, proveniência, unidades, sistema de coordenadas lunar, intervalos válidos, valores ausentes e incerteza. Atualize schema, fixture, tipos TypeScript, produtor Python e testes juntos.

## Contrato científico pré-computado (`navigator-dataset.v1.schema.json`)

Define o payload pré-computado em grade para o navegador de sítios de pouso do Polo Sul lunar (`schema_version: "1.0.0"`), validado em Python (`jsonschema`) e no frontend (`Ajv`):

- **Proveniência:** produto DEM LRO LOLA (`ldem_80s_80m`, raio de referência $R_{\text{ref}} = 1\,737\,400\text{ m}$, projeção estereográfica polar em `MOON_ME`), kernels NAIF SPICE com SHA-256 fixado e o resultado da comparação com o JPL Horizons (`horizons_validation`).
- **Sítios e malha local:** candidatos no Polo Sul e pontos vizinhos espaçados a $500\text{ m}$ contendo elevação, declividade ($\theta_{\text{slope}}$, base de 160 m), distância até PSR, curva de horizonte $h_{\text{horiz}}(\text{Az})$ por *ray-marching* em círculos máximos da esfera de referência ($s_{\max} = 120\text{ km}$), séries horárias de Sol, Terra e satélites *relay* hipotéticos (cenário "LRO-like" e ELFO sem fonte; `LunaNet` é um arcabouço de interoperabilidade, não esta constelação), métricas solares/energéticas e um *Landing Score* composto ($0\text{–}100$) ilustrativo.

### Semântica que o schema não expressa

- **"Validado"** significa conformidade com este schema (forma), não validação científica.
- **`horizons_validation.status`** (string livre no schema). O produtor atual usa `verified` quando todas as separações angulares estão dentro da tolerância declarada nas `notes` (resposta bruta retida em `outputs/validation/horizons_raw/`), `failed` fora da tolerância (com os números), `skipped_network_unavailable` quando o Horizons não pôde ser contatado e `not_requested`. O dataset commitado é anterior a essa regra: seu `verified` foi atribuído sem tolerância e sem retenção da resposta bruta.
- **`psr_distance_m`**: quando nenhum PSR é encontrado no raio de busca, o produtor grava o próprio raio (5200 m) como sentinela, porque o schema exige número. Esse valor não é uma distância medida. O raio e o critério estão em `provenance.limitations`.
- **`clps_slope_limit_deg`**: limite sem fonte. No produtor atual, declividade acima dele zera o score.
- **Janela**: todas as métricas solares e de comunicação valem só para `mission_window`. O dataset commitado cobre 30 dias do pico do verão austral.

Mudanças propostas para tornar essas regras explícitas no schema estão em [`../science/AUDIT_FOLLOWUPS.md`](../science/AUDIT_FOLLOWUPS.md); nenhuma foi aplicada.
