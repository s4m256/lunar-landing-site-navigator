# Lunar Landing Site Navigator

Uma missão guiada para aprender por que **local e data** importam em um pouso lunar. Uma astronauta fictícia apresenta a iniciativa CLPS, que envolve entregas robóticas comerciais. O usuário escolhe entre quatro locais hipotéticos, compara as direções do Sol e da Terra e registra uma escolha. Um quinto alvo oferece um bônus educativo opcional.

O início tem formato de diálogo de jogo: astronauta no cenário, fala em fonte monoespaçada, sem caixa, com letras aparecendo e um botão que completa a frase ou avança. A imagem do astronauta é de Poly (CC BY 2.0); o terreno ilustrativo vem do NASA 3D Resources. Conversas curtas alternam com viagem e pouso animados de 3,2 segundos, puláveis. Movimento reduzido elimina as animações. É possível pular a conversa e ir direto ao globo lunar com seleção no polo sul e ao corte do horizonte. A seleção usa a base Three.js e os dados LROC/LOLA já presentes na branch feat/integrate-ai-studio-site. Uma lista de coordenadas permite continuar sem WebGL. A experiência dispensa vídeos, câmera e servidor científico.

## Abrir sem instalação

A distribuição **Lunar-Missao.html** reúne interface, ilustrações e dados em um único arquivo. Abra-o em um navegador moderno no computador. A entrega fica fora do Git, em uma pasta temporária ou na pasta de saída informada.

Para gerar a distribuição a partir do código, use Node.js 24 e npm 11:

```sh
npm ci --include=dev
npm run typecheck
npm run build:offline
```

O comando informa o caminho do HTML. Para escolher a pasta: `npm run build:offline -- /caminho/da/entrega`. Links externos de referência só precisam de internet quando abertos pelo usuário.

## Desenvolver

```sh
npm ci --include=dev
npm run dev
```

Abra o endereço informado pelo Vite. Para testar o build estático:

```sh
npm run build
npm run check:deploy
npm exec --workspace frontend -- vite preview --host 127.0.0.1 --port 4174
```

Esses comandos não publicam o site. A configuração Vercel permanece na raiz, com saída em `frontend/dist`.

## O que os resultados significam

Os quatro observadores estão a −85° de latitude planetocêntrica, em longitudes leste 0°, 90°, 180° e 270°, sobre uma esfera de raio 1.737.400 m. As datas selecionadas são 24/03, 28/04 e 08/09 de 2026, às 00:00 UTC. Cada posição tem suas próprias direções calculadas com Python/SPICE, DE421, IAU_MOON e CN+S. O navegador consome artefatos estáticos validados.

O objetivo exige os **centros** de Sol e Terra acima do horizonte tangente idealizado, usando os valores completos. Em março, B e C atendem; em abril, A; em setembro, D. Há mais de uma escolha possível, sem vencedor fixo. Mudar a data pode mudar o resultado.

**Não calcula interseção com montanhas, sombras, energia produzida, disponibilidade de enlace ou segurança de pouso.** A textura global e o relevo polar são referências visuais LROC/LOLA; o sombreamento fixo não representa a posição atual do Sol. A geometria é esférica e não existe transformação entre o referencial MOON_ME do terreno e o IAU_MOON dos cálculos. Nave e personagem são ilustrativos. As três datas não permitem inferir janelas contínuas ou horários de nascer/pôr. Fontes, método, limitações e download dos dados completos estão em Sobre a missão.

Os cálculos são reais e reproduzíveis, mas não foram validados independentemente contra Horizons. Kernels vieram de distribuições de terceiros com hashes conferidos; a completude atual do LSK não foi confirmada. Reprodução numérica não certifica precisão física. O projeto não pressupõe vínculo oficial com a NASA.

## Arquitetura e verificação

- [Plano executado](docs/guided-mission-plan.md) e [implementação, testes e revisão no navegador](docs/guided-mission.md).
- [Dados da missão](docs/mission-data.md) e [auditoria científica reproduzível](docs/audits/mission/README.md).
- `frontend/src/mission/`: fluxo, arte, diagrama e consumidor científico.
- `scripts/build-offline.mjs`: distribuição autocontida; `scripts/mission-browser-review.mjs`: revisão no Chromium.
- Interfaces anteriores preservadas em `frontend/src/explorer/` e `LegacyApp.tsx`, fora da entrada principal. A [auditoria anterior](docs/audits/pr4/README.md) e os contratos normativos não mudaram.

```sh
npm run typecheck
npm test
npm run test:infra
npm run build
npm run check:deploy
LUNAR_KERNEL_DIR=/tmp/lunar-review-historical-kernels .venv/bin/python -m pytest science/tests -ra
.venv/bin/python -m build science
```

Preparação e convenções científicas: [GEOMETRY.md](science/GEOMETRY.md). Os testes Python requerem instalação de `./science[dev]`; os kernels históricos devem ser adquiridos e verificados conforme essa documentação. Sem kernels, parte dos testes é explicitamente pulada. Configuração de CI/publicação: [deploy](docs/deploy.md).
