Rascunho para aprovação de Isaac Santos

# SPA-7 — MVP e critérios de aceitação

Estado: **proposta**. Baseada no que o PR #6 (`feat/mvp-a-scientific-integration`, `21d539b`) realmente faz e nos requisitos da [SPA-5](spa-5-requisitos-oficiais.md). O enunciado oficial do desafio não foi lido (SPA-5, seção 1); se ele exigir algo diferente, este escopo muda.

## 1. MVP proposto

```
 local (A, B)        posição aparente          estado em relação        comparação A x B
 + instante UTC  ->  do centro do Sol e    ->  ao horizonte         ->  no mesmo instante
 (amostra exata)     da Terra (az, el)         idealizado de 0°         + limitações visíveis
```

Em uma frase: para dois locais lunares fixos e um instante UTC amostrado, mostrar azimute e elevação aparentes do centro do Sol e da Terra, indicar se cada centro está acima do horizonte idealizado, e comparar os dois locais lado a lado, com fonte e limites na tela.

Definição de **cenário**: par (local, instante UTC). O mínimo é comparar dois locais no mesmo instante. Comparar o mesmo local em dois instantes é desejável, não obrigatório.

Motivo de escolher a linhagem do PR #6 e não a `main`: é a única com auditoria reproduzível (hashes, 62 testes Python, reprodução byte a byte) e com limitações declaradas. A `main` tem mais funções (relevo, relay, energia, score), mas suas alegações de validação não estão confirmadas.

## 2. Entradas

| Campo | Tipo / unidade | Domínio no MVP | Observação |
| --- | --- | --- | --- |
| `site_id` | texto | `south-a`, `south-b` | Locais hipotéticos, não sítios de pouso nomeados. |
| `latitude_deg` | graus, planetocêntrica | −89,5 (A); −89 (B) | Contrato aceita [−90, 90]. |
| `longitude_east_deg` | graus, leste positivo | 0 (A); 90 (B) | Contrato aceita [0, 360). |
| `height_m` | metros acima da esfera | 0 | Raio de referência 1 737 400 m. Não é elevação medida. |
| instante | UTC, ISO 8601 com `Z` | 365 datas, 00:00 UTC, de 2026-01-01 a 2026-12-31 | Intervalo `[2026-01-01, 2027-01-01)`, passo 86 400 s. Sem interpolação. |
| alvo | enumeração | `SUN`, `EARTH` | Centro do astro. |

Referencial: `IAU_MOON`. O usuário **não** digita coordenadas ou horas livres no MVP; só escolhe entre amostras pré-calculadas.

## 3. Saídas

Fonte normativa: `contracts/analysis-result.v1.schema.json` (na branch do PR #6).

| Campo | Unidade / faixa | Significado |
| --- | --- | --- |
| `series[].site_id`, `series[].target` | — | Identidade da série (4 séries: 2 locais × 2 alvos). |
| `samples[].utc` | UTC | Instante exato da amostra. |
| `samples[].azimuth_deg` | graus, [0, 360] | Norte = 0°, leste = 90°, base local de cada observador. |
| `samples[].elevation_deg` | graus, [−90, 90] | Ângulo do **centro** do alvo sobre o plano tangente local. |
| `provenance.frame` / `correction` / `frame_epoch` | `IAU_MOON` / `CN+S` / `OBSERVER` | Convenções do cálculo. |
| `provenance.horizon_elevation_deg` | 0 | Horizonte idealizado, sem relevo. |
| `provenance.kernels[]` | nome, URL, SHA-256, cobertura | `de421.bsp`, `pck00010.tpc`, `naif0012.tls`. |
| `provenance.horizons_validation` | `not_performed_in_engine` | Sem validação independente. |
| `provenance.limitations[]` | texto | Lista exibida na interface. |

Saída derivada na interface (proposta, **não está no contrato**):

| Estado | Regra | Texto permitido | Texto proibido |
| --- | --- | --- | --- |
| Acima | `elevation_deg > 0` | "Centro do Sol/Terra acima do horizonte idealizado" | "iluminado", "tem energia", "tem comunicação" |
| Não acima | `elevation_deg <= 0` | "Centro do Sol/Terra não está acima do horizonte idealizado" | "em sombra", "sem comunicação" |
| Sem dado | amostra ausente | "Sem amostra para este local/instante" | qualquer número |

Estado atual do PR #6: mostra números, gráfico de elevação com linha de 0° e tabela A × B; **não** mostra o rótulo de estado acima. Esse rótulo é o único acréscimo proposto, e é opcional (ver decisão D2).

## 4. Testes de aceite

Valores de referência extraídos de `docs/audits/pr4/result-2026.json` (SHA-256 `108d2adf…7e023`). A interface arredonda a 4 casas.

| Instante UTC | Local | Sol az / el (°) | Terra az / el (°) |
| --- | --- | --- | --- |
| 2026-01-01 00:00 | south-a | 32,5283 / 1,7652 | 358,7216 / 6,7813 |
| 2026-01-01 00:00 | south-b | 302,4972 / 1,8811 | 268,6082 / 6,2578 |
| 2026-02-06 00:00 | south-a | 314,9738 / 0,9256 | 5,2753 / −3,0189 |
| 2026-02-06 00:00 | south-b | 224,9757 / −0,1352 | 275,3337 / −3,4242 |
| 2026-01-22 00:00 | south-a | 137,1886 / 0,6312 | 354,6263 / 0,1546 |
| 2026-01-22 00:00 | south-b | 47,2009 / 1,6776 | 264,6287 / −0,4369 |

**CA-1 — Posição do Sol e da Terra para um local e instante**
Dado o dataset auditado carregado e válido,
Quando seleciono 2026-01-01 e o alvo Sol, depois Terra,
Então vejo para south-a 32,5283° / 1,7652° (Sol) e 358,7216° / 6,7813° (Terra), com unidade em graus e a data rotulada como UTC.

**CA-2 — Comparação de dois cenários no mesmo instante**
Dado o instante 2026-02-06 00:00 UTC e o alvo Sol,
Quando abro a comparação,
Então south-a e south-b aparecem lado a lado com seus próprios valores (0,9256° e −0,1352°), no mesmo UTC e mesmo alvo, e nenhuma linha reutiliza o valor do outro local.

**CA-3 — Indicação honesta em relação ao horizonte**
Dado o instante 2026-02-06 00:00 UTC e o alvo Sol,
Quando leio o estado de cada local,
Então south-a indica centro acima do horizonte idealizado e south-b indica que não está acima; e o texto não usa "iluminado", "sombra", "energia" ou "comunicação" como conclusão.
(Depende de D2. Sem o rótulo, o aceite é: a linha de 0° e o sinal do valor permitem a mesma leitura.)

**CA-4 — Limite estrito em zero**
Dado um valor de elevação igual a 0 em teste unitário,
Quando o estado é calculado,
Então o resultado é "não acima", sem arredondamento prévio.

**CA-5 — Limitações visíveis sem sair do fluxo**
Dado qualquer resultado na tela,
Quando procuro os limites do modelo,
Então encontro, na mesma página, que: o horizonte é de 0° sem relevo; elevação do Sol não é iluminação efetiva nem energia; elevação da Terra não garante comunicação; amostras diárias não medem duração contínua; não há validação independente contra o JPL Horizons.

**CA-6 — Ausência de dado não vira número**
Dado um instante fora do conjunto (por exemplo 2027-01-01, ou hora diferente de 00:00 UTC),
Quando tento consultá-lo,
Então a interface não exibe azimute nem elevação, não usa a amostra vizinha e informa que não há amostra.

**CA-7 — Dataset inválido interrompe a exibição**
Dado um JSON que falha no schema ou na cobertura (série duplicada, local faltando, quantidade de amostras diferente de 365),
Quando a aplicação carrega,
Então mostra erro explícito e nenhum resultado.

**CA-8 — Proveniência íntegra e acessível**
Dado o build publicado,
Quando baixo o JSON pela interface,
Então o SHA-256 é `108d2adf202442acf32ba589504482ac00b2afac830b0bf14c55bc913147e023` e o arquivo contém kernels, hashes e `horizons_validation = not_performed_in_engine`.

**CA-9 — Nenhuma alegação não comprovada**
Dado o texto da interface, do README da branch submetida e da página de submissão,
Quando busco "Horizons", "validado", "verified", "Landing Score", "relay", "bateria",
Então não há afirmação de validação contra Horizons nem de segurança/ranking de pouso.

**CA-10 — Uso por teclado e em tela de 390 px**
Dado um teclado apenas, e depois uma viewport de 390 px de largura,
Quando executo CA-1 e CA-2,
Então concluo os dois fluxos sem rolagem horizontal da página e sem depender de cor ou de canvas para ler os valores.

**CA-11 — Reprodução do cálculo**
Dado os kernels com os SHA-256 fixados,
Quando executo `lunar_science analyze` com `request-2026.json`,
Então o JSON gerado é idêntico byte a byte ao publicado.

Cobertura atual pelo PR #6, segundo `docs/mvp-a-integration.md` e os testes da branch (**não reexecutei nada nesta sessão**):

| Critério | Situação |
| --- | --- |
| CA-1, CA-2, CA-5, CA-6, CA-7, CA-8, CA-11 | Há teste ou evidência registrada na branch. Reexecutar antes de aprovar. |
| CA-10 | Registrado para 390 px e Chromium; teclado citado só para o gráfico. Verificar. |
| CA-3, CA-4 | **Não implementado** (rótulo de estado não existe). |
| CA-9 | **Falha na `main`** (README e `outputs/` afirmam validação Horizons e score). Passa na branch do PR #6 pelo texto lido. |

## 5. Fora do MVP

- Relevo, horizonte topográfico, sombras e regiões permanentemente sombreadas.
- Fração iluminada do disco solar, eclipses, energia, bateria.
- Comunicação operacional, relay (LRO, ELFO), enlace de rádio.
- Landing Score, ranking ou recomendação de local.
- Coordenadas livres, horas livres, interpolação entre amostras, duração contínua de luz ou visibilidade.
- Referencial `MOON_ME`/PA de alta precisão; altura do observador diferente de 0.
- Backend ou cálculo no navegador.
- Missão guiada, voz, cena 3D (frentes paralelas, não bloqueiam o MVP).

## 6. Limitações que a submissão deve declarar

1. Locais A e B são hipotéticos, sobre uma esfera de 1 737 400 m.
2. Uma amostra por dia às 00:00 UTC; nada se conclui entre amostras.
3. Kernels obtidos de espelhos de terceiros com hashes; origem NAIF não autenticada diretamente; atualidade da tabela de leap seconds não confirmada.
4. **Validação contra JPL Horizons: não confirmada.** A linhagem auditada registra HTTP 403 e zero amostras comparadas. O relatório `verified` da `main` não tem consulta nem resposta bruta retidas; não usar como evidência.
5. Azimutes de locais diferentes usam bases locais diferentes; a diferença entre eles não é um ângulo físico único.

## 7. Decisões pendentes para o time

| # | Decisão | Opções |
| --- | --- | --- |
| D1 | O enunciado exige relevo ou sítios reais? | Só se responde lendo a página (SPA-5, dúvida 1). Se exigir, este MVP não atende a Relevância sozinho. |
| D2 | Incluir o rótulo de estado (CA-3, CA-4)? | Incluir (pequena mudança de interface, sem ciência nova) ou manter só números e linha de 0°. |
| D3 | Faixa "próximo do horizonte"? | O raio aparente do Sol não é modelado; valores perto de 0° são ambíguos. Definir uma margem exige o responsável científico. Proposta: fora do MVP, citar como limitação. |
| D4 | Segundo eixo de comparação (mesmo local, dois instantes)? | Desejável; só se couber no prazo. |
| D5 | Qual branch vira o link de projeto final? | PR #6 tem conflito com `main`. Decidir antes da submissão. |
| D6 | Datas diárias (MVP A) ou horárias (MVP B, 721 instantes)? | MVP B deriva de A e mantém `topographic_visible = null`; os critérios acima valem para ambos mudando só os valores de referência. |
