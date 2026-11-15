Rascunho para aprovação de Isaac Santos

# SPA-5 — Enunciado oficial e regras: síntese com fontes

Estado: **rascunho, incompleto em um ponto crítico**. O texto integral do desafio **não pôde ser lido** (ver seção 1). Nada aqui é decisão final. Leitura feita em 15/11/2026 (segundo dia do hackathon; a submissão fecha hoje às 23:59, hora do Local Event).

## Como ler este documento

| Rótulo | Significado |
| --- | --- |
| **OBRIGAÇÃO** | A fonte oficial usa linguagem imperativa (must / not allowed / required) e a página consultada é da edição 2026. |
| **RECOMENDAÇÃO** | A fonte oficial sugere/encoraja, ou a regra vem de um guia oficial cuja página consultada **ainda mostra conteúdo de edição anterior** (2024/2025). Tratar como muito provável, reconfirmar. |
| **HIPÓTESE** | Não confirmado em fonte oficial lida nesta sessão. Inclui tudo sobre o conteúdo do desafio. |

Limite do método: as páginas foram lidas por uma ferramenta de busca/fetch que devolve um resumo com citações curtas, não o HTML bruto. As citações em inglês abaixo são as devolvidas pela ferramenta. **Um humano deve abrir cada link e conferir a redação literal antes de aprovar.**

## 1. O que NÃO foi possível verificar

| Fonte | Resultado | Consequência |
| --- | --- | --- |
| [Página do desafio](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/) | **Não carregou.** URL direta: recusada pela allowlist da sessão. Variante `?tab=details`: recusada pelo site (`robots_disallowed`). `curl` via proxy: HTTP 403 no CONNECT. | Resumo, contexto, objetivos, considerações e **lista de recursos do desafio não foram lidos**. Nenhum recurso listado na página foi consultado. |
| [Lista de desafios 2026](https://www.spaceappschallenge.org/2026/challenges/) | Não carregou (`robots_disallowed`). | Sem resumo oficial alternativo. |
| [Post do blog sobre a edição 2026](https://www.spaceappschallenge.org/blog/explore-the-next-frontier-at-the-2026-nasa-space-apps-challenge/) | Não carregou (`robots_disallowed`). | — |
| Guia de submissão 2026 | A [página](https://www.spaceappschallenge.org/resources/project-submission-guide/) carregou, mas com conteúdo datado de **2025** (4–5 de outubro). | Regras de demo, IA, dados NASA e idioma **não confirmadas para 2026**. |
| Guia de julgamento 2026 | A [página](https://www.spaceappschallenge.org/resources/judging-awards-guide) carregou, mas com datas de **2024**. | Critérios e elegibilidade **não confirmados para 2026**. |

Indício secundário, **não oficial**: três repositórios públicos de outras equipes descrevem o desafio como comparação de locais no polo sul lunar pela visibilidade do Sol e da Terra ([Angel-A-V](https://github.com/Angel-A-V/lunar-landing-site-navigator), [M9nx](https://github.com/M9nx/lunar-landing-site-navigator), [ziyadell](https://github.com/ziyadell/Lunar-Landing-Site-Navigator)). Nenhum reproduz o enunciado; um deles também registra não ter conseguido abrir a página oficial. Isso é compatível com a leitura da nossa equipe, mas **não substitui o enunciado**.

## 2. Obrigações confirmadas (edição 2026)

| # | Regra | Fonte |
| --- | --- | --- |
| O1 | **Trabalho pré-evento é proibido.** "Teams are not allowed to begin working on the challenges prior to the hackathon." | [Participant FAQs 2026](https://www.spaceappschallenge.org/resources/participant-faqs/) |
| O2 | Hackathon em 14–15/11/2026. Submissão abre sábado 14/11 às 9:00 e fecha domingo 15/11 às 23:59, hora local. | [Página 2026](https://www.spaceappschallenge.org/2026/) |
| O3 | Equipe com no máximo 6 membros, todos no mesmo Local Event ou no Universal Event. Inscrição, escolha de evento e mudanças de equipe fecham em 15/11. | [Participant FAQs 2026](https://www.spaceappschallenge.org/resources/participant-faqs/), [Página 2026](https://www.spaceappschallenge.org/2026/) |
| O4 | Para o Global Judging, o projeto deve ser submetido pela página de projeto da equipe, no prazo do Local Event. | [Participant FAQs 2026](https://www.spaceappschallenge.org/resources/participant-faqs/) |
| O5 | Cada equipe deve escolher um desafio; os termos exigem que a solução responda a pelo menos um desafio oficial para ser publicada. | [Participant FAQs 2026](https://www.spaceappschallenge.org/resources/participant-faqs/), [Termos 2026](https://www.spaceappschallenge.org/legal/) |
| O6 | Conteúdo original deve ser livre ou open source (definição OSI). Sem licença indicada, a NASA distribui sob **Apache 2.0**. | [Termos 2026](https://www.spaceappschallenge.org/legal/) |
| O7 | Materiais de terceiros (dados, código) devem ser públicos e livres ou open source; **as licenças aplicáveis devem estar identificadas na documentação submetida**. Soluções sem essa documentação não são aceitas/publicadas. | [Termos 2026](https://www.spaceappschallenge.org/legal/) |
| O8 | **Citar toda fonte usada**, mesmo aberta: "You must cite every source that is used in the creation of your project". Falha em citar pode levar à remoção de equipe/prêmio. | [Termos 2026](https://www.spaceappschallenge.org/legal/) |
| O9 | Sem dados pessoais identificáveis; sem nome/voz/imagem de menores; vídeo produzido pela própria equipe e com consentimento de quem aparece; sem promoção comercial. | [Termos 2026](https://www.spaceappschallenge.org/legal/) |
| O10 | Elegibilidade: servidores civis federais dos EUA não participam; restrições a afiliação/colaboração com entidades da China; menores registrados por responsável. Responsabilidade da equipe por controle de exportação (ITAR/EAR). | [Termos 2026](https://www.spaceappschallenge.org/legal/) |

Os Termos 2026 **não contêm** cláusula sobre IA, sobre uso de marca/logo da NASA, nem sobre dados obrigatórios (ausência constatada na leitura, não permissão).

## 3. Recomendações (guias oficiais; página lida mostra edição anterior)

O FAQ 2026 informa que os guias de submissão e de julgamento de 2026 ficariam disponíveis em 13/11. As páginas consultadas ainda exibem conteúdo antigo; reconfirmar hoje.

| # | Regra provável | Fonte (edição exibida) |
| --- | --- | --- |
| R1 | Todos os campos obrigatórios do formulário preenchidos, **em inglês**: nome, resumo, link do demo, link do projeto final, descrição detalhada, dados NASA, outros dados, uso de IA, verificação. | [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) (2025) |
| R2 | Demo obrigatório: **vídeo de até 30 s ou até 7 slides**; hospedagem externa; vídeo com legenda em inglês. Exceder o limite tira a elegibilidade ao Global Judging. | idem (2025) |
| R3 | Links do demo e do projeto final públicos, sem senha, permissão ou cadastro. | idem (2025) |
| R4 | Para concorrer a prêmio global, **usar dados ou recursos da NASA** e descrever como foram usados. | idem (2025) |
| R5 | **Declarar onde e como IA foi usada.** Imagem/vídeo gerado por IA com marca-d'água visível; áudio, código e dados gerados por IA reconhecidos no texto/metadados. IA não pode gerar nem alterar marca NASA. | idem (2025) |
| R6 | Critérios de julgamento: Impacto/Influência, Criatividade, **Validade** (cientificamente válido?), Relevância (responde ao desafio, completude, viabilidade, usabilidade), Apresentação. | [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide) (2024), [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) (2025) |
| R7 | Elegibilidade global: marcar que o trabalho é original e que todos os recursos externos estão no campo de referências; materiais vinculados em inglês. | [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide) (2024) |

## 4. Hipóteses (não confirmadas)

| # | Hipótese | Por que é hipótese |
| --- | --- | --- |
| H1 | O desafio pede uma ferramenta para comparar locais de pouso lunares (ênfase no polo sul) pela visibilidade do Sol e da Terra ao longo do tempo. | Enunciado não lido; só indício de terceiros (seção 1). |
| H2 | Relevo (LOLA), energia, relay, score de pouso são desejáveis mas não exigidos. | Enunciado não lido. Não há base para afirmar nem negar. |
| H3 | SPICE/NAIF, JPL Horizons e LRO/LOLA estão entre os recursos listados no desafio. | Lista de recursos não lida. |
| H4 | As regras R1–R7 valem sem mudança em 2026. | Páginas exibem 2024/2025. |

## 5. Dúvidas que afetam o escopo do MVP

1. **Enunciado (bloqueante).** Alguém com navegador precisa abrir a página do desafio e colar o texto integral e a lista de recursos neste diretório. Sem isso, o critério de Relevância não pode ser avaliado e a SPA-7 se apoia em H1.
2. **Trabalho pré-evento (O1).** O commit mais antigo do repositório (`287ec07`, "chore: initialize repository") tem data 2026-11-14 11:59:07 UTC, isto é, 08:59:07 em UTC−3, cerca de um minuto antes das 9:00. O conteúdo é só a inicialização do repositório e os demais commits são posteriores. Falta confirmar o fuso do Local Event da equipe e se a regra considera o início às 9:00 locais. Dúvida de conformidade, não acusação.
3. **Licença (O6, O7).** Não existe arquivo `LICENSE` em nenhuma branch. Sem escolha explícita vale Apache 2.0 por padrão. Falta também um documento de licenças/atribuição de terceiros: kernels DE421 obtidos via `skyfield-data` (PyPI), `pck00010.tpc`, `naif0012.tls`, DEM LOLA, bibliotecas npm/Python. Isso é condição para a solução ser aceita.
4. **Idioma (R1, R7).** Interface e documentação estão em português. Página de submissão e demo precisam estar em inglês; falta decidir se a interface também precisa.
5. **Uso de IA (R5).** O projeto foi desenvolvido com agentes de IA e uma branch tem voz e guia. Falta redigir a declaração de uso de IA e verificar se há imagem/vídeo/áudio gerado que exija marca-d'água.
6. **Dados NASA e Validade (R4, R6).** A `main` publica uma validação contra JPL Horizons com status `verified` ([arquivo](../../outputs/validation/horizons_cross_validation.json)); a linhagem auditada registra HTTP 403 em todas as tentativas e zero amostras comparadas. Os 32 pares publicados não vêm acompanhados de consulta, resposta bruta nem cabeçalho do Horizons. **Tratar como não confirmada** e não citar na submissão até haver evidência retida. Afirmar validação que não ocorreu é o maior risco no critério de Validade.
7. **Qual branch é o produto submetido.** `main` e o PR #6 são pipelines diferentes, com alegações diferentes. O link do "projeto final" (R3) precisa apontar para um deploy público de uma delas.
8. **Marca NASA.** Não encontrei regra de 2026 lida nesta sessão; evitar logo/insígnia até confirmar.

## 6. Próximos passos sugeridos

1. Humano lê e arquiva o enunciado (dúvida 1) e reabre os dois guias para confirmar a edição 2026.
2. Equipe decide licença e cria o arquivo de atribuições (dúvida 3).
3. Equipe decide a branch submetida e remove ou rebaixa a alegação de Horizons (dúvidas 6 e 7).
4. Redigir em inglês: resumo, descrição, dados NASA usados, declaração de IA, referências.
