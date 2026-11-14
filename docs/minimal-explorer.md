# MVP minimalista

A entrada principal passa a ser a exploração de **um observador e uma data**, com Sol e Terra simultâneos. O local fixo é `south-a`; a seleção usa os instantes diários de 2026 do artefato científico existente. Os três controles principais são data UTC, Recentrar e Informações.

## Implementação

- `App.tsx` monta a nova experiência. `LegacyApp.tsx` preserva a interface anterior fora da entrada principal.
- `explorer/MinimalExplorer.tsx` valida o artefato, busca as duas amostras pelo UTC exato e coordena os controles.
- `explorer/LunarScene.tsx` usa Three.js diretamente, sem framework adicional de cena React ou backend.
- O referencial gráfico local usa +X para leste, +Y para cima e −Z para norte. Os raios vêm dos azimutes/elevações do dataset, sem deslocar alvos abaixo do horizonte para cima.
- A representação do astronauta é simbólica; sua escala visual não modifica a altura física do observador.
- Fontes de relevo são documentadas em [terrain-source.md](terrain-source.md). A luz de apresentação do renderizador não representa insolação calculada.

Dados auditados, schemas normativos e código Python permanecem intactos. O download é o JSON original completo, incluindo o segundo local da auditoria, embora a tela apresente apenas o local piloto.

## Acessibilidade

Controles rotulados, foco visível, teclado e resultados em texto fazem parte do fluxo. A câmera tem um comando de recuperação. O diálogo contém o foco, fecha com Escape e devolve o foco ao controle de abertura. Ausência de WebGL não impede a leitura dos resultados disponíveis. Não há webcam, personagem controlável, animação automática de voo ou cálculo de energia/enlace.

## Verificação

Os testes existentes de contrato/dados e das interfaces anteriores são preservados. A nova experiência acrescenta testes de sincronização Sol/Terra por UTC, datas sem dados, erro de artefato, câmera, diálogo e transformação das direções locais.

Verificações executadas nesta implementação:

- TypeScript sem erros; 82 testes de frontend e 8 testes de infraestrutura passaram.
- Build Vite e verificação da saída estática passaram. Three.js fica em um chunk separado; o Vite ainda avisa sobre chunks acima de 500 kB, incluindo os dados científicos incorporados à entrada.
- 62 testes Python passaram, sem skips, usando os kernels históricos; o pacote Python também foi construído com sucesso.
- Chromium em modo headless conferiu os 12 valores de Sol/Terra em três datas, UTC independente do fuso local, teclado/recentrar, foco do diálogo, integridade do download, ausência de amostra, falha do DEM e alternativa sem WebGL.
- Layouts de 320, 390 e 768 pixels não apresentaram overflow horizontal nem sobreposição dos rótulos visíveis. Rótulos fora da câmera ficam ocultos em telas pequenas; os valores permanecem nos cartões.
- Axe não encontrou violações nos critérios automatizados WCAG A/AA selecionados para desktop, diálogo e celular. Isso não substitui testes com pessoas ou certifica conformidade integral.
- A reprodução do recorte com os arquivos de origem conferiu byte a byte. Testes de hash e consistência radial verificam o artefato, sem certificar sua precisão física.

Testes de interface não certificam precisão física do modelo SPICE ou do terreno. A revisão cruzada entre os agentes de interface, cena e dados não encontrou divergência bloqueadora; a distinção entre relevo contextual e horizonte científico permanece explícita.

### Repetir a revisão no navegador

O runner usa Playwright e Axe fora das dependências do aplicativo. Na raiz, depois do build, inicie o preview em um terminal:

```sh
npm exec --workspace frontend -- vite preview --host 127.0.0.1 --port 4174
```

Em outro terminal, ainda na raiz:

```sh
npm install --prefix /tmp/lunar-review-browser --no-audit --no-fund playwright@1.65.1 @axe-core/playwright@4.14.0
cp scripts/minimal-browser-review.mjs /tmp/lunar-review-browser/minimal-review.mjs
CHROMIUM_EXECUTABLE=/usr/lib/chromium/chromium node /tmp/lunar-review-browser/minimal-review.mjs
```

Ajuste `CHROMIUM_EXECUTABLE` para o navegador instalado. `REVIEW_URL` altera o endereço do preview e `REVIEW_OUTPUT` altera a pasta de evidências. Por padrão, relatório JSON e capturas ficam em `/tmp/lunar-minimal-review/`, fora do repositório. Não é feito deploy.
