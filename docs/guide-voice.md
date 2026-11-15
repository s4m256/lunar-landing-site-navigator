# Guia escolhida, texto e voz

O usuário escolheu a opção C, imagem existente Astronaut, de Poly. A aplicação utiliza a prévia original, incorporada também ao HTML autocontido. Os créditos estão em “Sobre a missão” e em [assets/astronaut.md](assets/astronaut.md). A apresentação explica que a astronauta é fictícia e as missões CLPS não levam astronautas.

Na caixa de diálogo do jogo, abrir “Voz” e acionar “Ouvir fala” inicia a leitura do texto completo pela Web Speech API, com preferência por uma voz pt-BR e alternativa em português. Não há reprodução automática. “Parar fala”, abrir o contexto, sair da etapa ou mudar o texto cancela a leitura. Erros, ausência de voz em português e falta de início após dez segundos produzem mensagem visível. A interface não afirma estar reproduzindo antes do evento de início do navegador.

A voz depende do navegador e do dispositivo; algumas usam serviço remoto/internet. O projeto não inclui arquivos de áudio, um serviço externo próprio ou garantia de disponibilidade offline da voz. Não há sincronização palavra a palavra entre voz e digitação. Leitores de tela recebem uma cópia completa do texto, sem anúncios a cada caractere. Movimento reduzido mostra tudo imediatamente. O botão principal da conversa alterna entre “Mostrar fala” e “Continuar” (ou a próxima ação) sem desmontar o elemento focado. O componente de texto independente conserva seu botão “Mostrar texto inteiro”.

Para gerar a missão e atualizar o link de teste anteriormente enviado:

```sh
node scripts/build-guide-preview.mjs /tmp/lunar-delivery
python -m http.server 4188 --bind 127.0.0.1 --directory /tmp/lunar-delivery
```

O endereço `http://127.0.0.1:4188/Escolher-astronauta.html` agora contém a mesma missão completa de `Lunar-Missao.html`. Não há uma demonstração separada do personagem: o link anterior foi atualizado para a experiência de jogo.

Para reproduzir a revisão automatizada, instale Playwright e Axe conforme [guided-mission.md](guided-mission.md), copie o runner para o diretório dessas dependências e execute a partir da raiz do projeto:

```sh
cp scripts/guide-browser-review.mjs /tmp/lunar-review-browser/guide-browser-review.mjs
node /tmp/lunar-review-browser/guide-browser-review.mjs
```

O runner separa a disponibilidade real do navegador dos testes com uma API de voz simulada. Confere imagem incorporada, foco por teclado, layouts desktop/celular, verificações Axe, início explícito, cancelamento e erros. A simulação não demonstra som audível. O Chromium gerenciado utilizado nesta entrega não oferece vozes instaladas; a saída sonora não foi certificada. A abertura `file://` também é bloqueada nesse ambiente; os HTMLs são verificados via HTTP local, incluindo a missão completa com requisições externas bloqueadas.
