# Guia de acessibilidade e simplicidade

**Lunar Landing Site Navigator — NASA Space Apps Challenge 2026**

> Referência para definição de experiência de uso (**Isaac**) e implementação (**Elias**). Baseado na **WCAG 2.2 AA**, complementado pelas recomendações do **W3C** sobre acessibilidade cognitiva e pelas pesquisas do **Nielsen Norman Group** sobre usuários idosos.

---

## 1. Objetivo

Criar um site em que uma criança, uma pessoa idosa, um estudante e um pesquisador consigam explorar a Lua sem precisar aprender a usar uma interface complexa.

O usuário deve conseguir entender três coisas:

1. **Onde estou olhando?** — Qual local da Lua foi selecionado?
2. **O que estou vendo?** — Onde o Sol e a Terra aparecem no céu daquele local?
3. **O que muda?** — Como essas posições variam conforme o local e a data?

O site deve ser simples desde o início, com funcionalidades avançadas disponíveis sem atrapalhar quem está começando.

**Princípio:** qualquer pessoa deve conseguir começar a explorar sem ler um manual.

## 2. Como deve funcionar

### Tela inicial

- **Título:** Explore a Lua
- **Subtítulo:** *Descubra como o Sol e a Terra aparecem no céu de diferentes lugares da Lua.*

Duas ações principais:

- **Começar a explorar** — abre uma demonstração com locais previamente escolhidos pela equipe.
- **Comparar dois lugares** — permite ao usuário escolher os locais.

Abaixo: **Como funciona?** — explicação curta, com imagem e texto.

Não exigir cadastro, conhecimento de astronomia nem coordenadas para começar.

### Escolha dos locais

Mostrar dois locais identificados como **Lugar A** e **Lugar B**.

Cada local pode ser selecionado por uma opção pronta ou por um mapa interativo.

O mapa não pode ser a única opção. Deve existir uma lista ou busca acessível por teclado e leitor de tela.

As coordenadas detalhadas devem ficar em **Opções avançadas**.

### Escolha do período

Começar com uma data ou período de exemplo previamente definido. Apresentar:

- **Mudar data**
- **Mudar horário**
- **Usar período de exemplo**

Explicar a referência temporal com texto, por exemplo: *Os horários estão em UTC (horário universal).* Permitir inserir valores por campos, sem depender exclusivamente de arrastar uma linha do tempo.

### Tela de resultados

Organizar o conteúdo nesta ordem:

1. **Resumo em linguagem simples:** o que as posições calculadas mostram.
2. **Visualização:** Sol e Terra em relação ao horizonte geométrico dos dois locais.
3. **Comparação:** diferenças entre A e B no mesmo período.
4. **Mais detalhes:** gráficos, ângulos, coordenadas, fontes e limitações.

Toda visualização precisa ter uma alternativa em texto. Gráficos também devem permitir consultar valores em tabela.

Não afirmar que um local é seguro para pouso, possui energia garantida ou tem comunicação garantida a partir da geometria isolada.

## 3. Botões intuitivos

Cada botão deve dizer claramente o que acontecerá depois do clique.

| Evitar | Usar |
|---|---|
| Run | Ver resultados |
| Configure | Escolher local |
| Reset | Recomeçar |
| Play | Iniciar animação |
| Pause | Pausar animação |
| Data | Ver dados |
| Advanced | Opções avançadas |
| ? | O que significa? |
| Ícone isolado de calendário | Mudar data |
| Ícone isolado de seta circular | Atualizar resultados |

**Regras para botões:**

- Grandes o suficiente para clicar ou tocar com facilidade; adotar **48 × 48 pixels CSS** como meta de projeto.
- Ter espaço entre controles.
- Usar palavras familiares.
- Combinar ícones e texto, nunca depender apenas de ícones ambíguos.
- Manter a mesma aparência e função em todo o site.
- Mostrar claramente quando estiverem selecionados, desativados ou recebendo foco pelo teclado.
- Evitar exigir clique duplo, precisão excessiva ou gestos complexos.
- Nunca iniciar ações inesperadas automaticamente.

## 4. Aparência visual

**Texto**

- Fonte simples e legível.
- Corpo de texto preferencialmente com 18 px como ponto de partida.
- Títulos claros e bem separados.
- Frases curtas e parágrafos pequenos.
- Evitar textos sobre imagens complexas.
- Permitir aumentar o texto até 200% sem perda de funcionalidade.

**Cores**

- Alto contraste entre texto e fundo.
- Contraste mínimo de 4,5:1 para textos comuns e 3:1 para textos grandes, conforme WCAG AA.
- Controles e elementos gráficos essenciais com contraste mínimo de 3:1.
- Nunca usar somente verde e vermelho para transmitir estados.
- Diferenciar linhas de gráficos por cor, traço, marcador e legenda.
- Preferir um fundo visualmente calmo, sem excesso de efeitos.

**Organização**

- Uma ação principal por etapa.
- Espaçamento generoso.
- Não apresentar muitos gráficos ao mesmo tempo.
- Evitar menus escondidos sem indicação.
- Funcionar em celular, tablet e computador.
- Preservar informações e controles durante ampliação e reorganização da página.

## 5. Acessibilidade para diferentes necessidades

| Necessidade | Solução necessária |
|---|---|
| Baixa visão | Alto contraste, ampliação e textos legíveis |
| Cegueira | Leitores de tela, nomes acessíveis, dados em texto e tabela |
| Dificuldade motora | Botões grandes, navegação por teclado e alternativas a gestos |
| Deficiência auditiva | Legendas e transcrições; nenhuma informação apenas por áudio |
| Dificuldade de leitura | Linguagem simples, instruções curtas e explicações visuais |
| Dificuldade de concentração | Fluxo previsível, poucos elementos simultâneos e ausência de distrações |
| Pouca familiaridade com tecnologia | Exemplos prontos, mensagens claras e erros fáceis de corrigir |

**Requisitos técnicos essenciais:**

- Navegação completa por teclado.
- Ordem lógica de foco.
- Indicador de foco sempre visível.
- Rótulos acessíveis nos formulários e botões.
- Estrutura semântica HTML.
- Mensagens de erro claras e associadas ao campo correspondente.
- Respeito às preferências de movimento reduzido.
- Animações com controles de iniciar, pausar e reiniciar.
- Leitores de tela devem receber informações essenciais sobre o estado da aplicação.

Não colocar essas funções apenas dentro de um botão chamado "Modo acessível". A interface principal já deve ser acessível.

## 6. Animações e gráficos científicos

Animações podem ajudar a compreender o movimento aparente do Sol e da Terra, mas nunca devem ser obrigatórias.

Permitir:

- Iniciar e pausar a animação.
- Avançar e retroceder em passos controlados.
- Consultar a data e o horário representados.
- Desativar movimentos não essenciais.
- Obter a mesma informação sem assistir à animação.

Os gráficos devem ter títulos, eixos identificados, unidades, legendas e explicações textuais.

**Exemplo de apresentação de um resultado calculado:**

> **Elevação do Sol: 1,8°**
>
> *O centro do Sol está 1,8 grau acima do horizonte geométrico neste horário.*
>
> *Importante: montanhas e crateras podem bloquear a luz. Este resultado não considera o relevo.*

Usar esse modelo de texto somente com valores efetivamente calculados; `1,8°` é aqui um exemplo de redação, não uma medição do projeto.

## 7. Linguagem simples sem perder precisão

| Termo técnico | Explicação para o público |
|---|---|
| Azimute | Direção em que o astro aparece |
| Elevação | Altura angular do astro em relação ao horizonte |
| Efemérides | Cálculos das posições dos astros ao longo do tempo |
| Horizonte geométrico | Referência que não considera montanhas ou crateras |
| Visibilidade da Terra | Se a Terra aparece acima do horizonte considerado |
| Coordenadas | Números que identificam um lugar na Lua |

Apresentar o conceito primeiro em palavras comuns. Os termos técnicos e suas definições devem continuar disponíveis para estudantes avançados.

Evitar linguagem infantilizada: uma interface compreensível para crianças também deve ser respeitosa e apropriada para adultos.

## 8. Ajuda durante o uso

O usuário não deve precisar decorar instruções.

- Disponibilizar **O que significa?** ao lado de conceitos difíceis.
- Apresentar uma explicação curta no próprio contexto.
- Oferecer **Ver exemplo** quando o usuário não souber escolher um parâmetro.
- Permitir **Voltar** sem perder escolhas anteriores.
- Mostrar onde ocorreu um erro e como corrigi-lo.
- Não esconder informações importantes em mensagens que desaparecem rapidamente.

Exemplo de erro:

> **Escolha uma data válida.**
>
> *Digite dia, mês e ano ou use o calendário.*

Evitar mensagens como `INVALID_DATE` ou `Request failed` para o público geral.

## 9. Testes reais de usabilidade

Antes da entrega, observar pessoas com diferentes idades, níveis de escolaridade e experiências tecnológicas.

Convidar, quando viável, crianças com autorização de responsáveis, pessoas idosas e pessoas que utilizam tecnologias assistivas.

Pedir que realizem estas tarefas sem receber instruções sobre onde clicar:

1. Abrir uma demonstração.
2. Identificar quais locais estão sendo comparados.
3. Mudar a data.
4. Descobrir em qual local o Sol aparece mais alto em um determinado horário.
5. Encontrar a explicação sobre as limitações dos resultados.

**Registrar:**

- Conseguiu completar a tarefa?
- Precisou de ajuda?
- Onde hesitou ou errou?
- Compreendeu o resultado científico?
- Conseguiu recuperar-se de um erro?

Testar também navegação somente por teclado, leitor de tela, zoom de 200%, alto contraste e celular com tela pequena.

Uma boa meta interna é conseguir completar a demonstração principal sem ajuda e compreender ao menos sua conclusão essencial. Isso deve ser avaliado com usuários reais, não apenas com testes automáticos.

## 10. Critério de conclusão

O site só deve ser considerado pronto quando:

- A tarefa principal funciona sem conhecimento técnico prévio.
- Os botões são claros e facilmente acionáveis.
- Os resultados científicos têm explicação textual.
- Nenhuma informação essencial depende apenas de cor, som, animação ou imagem.
- A navegação por teclado e leitor de tela foi verificada.
- Texto ampliado e telas pequenas não ocultam funções.
- Os erros podem ser compreendidos e corrigidos.
- Os principais fluxos foram testados com pessoas reais.

**Meta técnica:** WCAG 2.2 nível AA, acompanhada de avaliações práticas de acessibilidade cognitiva e usabilidade.

Cumprir a WCAG não garante, sozinho, que a interface será intuitiva para todos. O objetivo final é que a experiência seja compreensível, utilizável e cientificamente correta.

## Referências usadas

As regras numéricas sobre contraste, área de acionamento e ampliação têm base na **WCAG 2.2 em português**. O mínimo de tamanho de alvo na WCAG 2.2 AA é de **24 × 24 pixels CSS**, com exceções; os **48 × 48** do guia são uma recomendação de projeto mais confortável, não uma exigência da norma.

As recomendações sobre linguagem, previsibilidade e redução da carga cognitiva vêm do **guia de acessibilidade cognitiva do W3C**. Já as orientações de legibilidade e facilidade de corrigir erros são sustentadas por pesquisas com **adultos idosos (Nielsen Norman Group)**.

**Prioridade prática para a equipe:** primeiro construir um fluxo simples e acessível de escolha de locais, datas e comparação; depois acrescentar animações, visualizações 3D e funções avançadas. Isso evita que a complexidade visual comprometa a função principal do site.
