# Lunar Landing Site Navigator — Ari / MVP A + janela horária MVP B

MVP web estático para comparar direções aparentes dos **centros do Sol e da Terra** em dois locais lunares hipotéticos durante 2026. React + TypeScript + Vite exibem efemérides calculadas offline com SPICE; nenhum Python ou backend executa em produção. O projeto não pressupõe vínculo oficial com a NASA.

## Executar a demonstração

Requer Node.js 24 e npm 11. Na raiz:

```sh
npm ci --include=dev
npm run dev
```

Abra o endereço local informado pelo Vite (porta 5173). Para testar o build estático:

```sh
npm run build
npm run check:deploy
npm exec --workspace frontend -- vite preview --host 127.0.0.1 --port 4173
```

A Vercel usa a raiz do repositório, `npm ci --include=dev`, `npm run build` e publica `frontend/dist`, conforme `vercel.json`. Não precisa instalar Python nem baixar kernels. Não foi realizado deploy público nesta integração. Veja [configuração e diagnóstico](docs/deploy.md).

## MVP B — visibilidade horária, terreno indisponível

Use o botão **Visibilidade horária / MVP B**. O modo original do MVP A e o planejamento livre continuam disponíveis.

- Mesmos locais científicos e modelo IAU_MOON/CN+S do MVP A.
- 15/11/2026 00:00 UTC até 15/12/2026 00:00 UTC, **incluindo ambos os extremos**: 721 timestamps, 720 intervalos de uma hora.
- Tabela e linhas amostradas lado a lado para centros do Sol/Terra acima do horizonte idealizado de 0°. Mudanças são delimitadas entre amostras, sem horários de eventos ou durações contínuas exatas.
- **LOLA bloqueado por HTTP 403 no proxy:** nenhum DEM foi adquirido/verificado. Topografia desativada, resultados topográficos `null`; nenhum terreno sintético aparece como relevo lunar. Compatibilidade de datum/projeção/referencial ainda não estabelecida.
- [Dataset derivado](docs/data/mvp-b-hourly.json), [proveniência e reprodução](docs/mvp-b-visibility.md), [bloqueio e testes topográficos controlados](docs/mvp-b-terrain.md).

As duas gerações do dataset horário foram byte a byte idênticas; 124 amostras coincidentes com o MVP A têm os mesmos valores. São verificações de reprodutibilidade, não validação física independente.

## Fluxo e limites da demonstração

- **Local A / south-a:** latitude planetocêntrica −89,5°, longitude leste 0°, altura radial 0 m.
- **Local B / south-b:** latitude planetocêntrica −89°, longitude leste 90°, altura radial 0 m.
- Datas: 01/01/2026 a 31/12/2026, às **00:00 UTC**; fim exclusivo 01/01/2027. São 365 instantes em cada um dos quatro pares local/alvo.
- Escolha data e Sol/Terra. A tabela mostra azimute/elevação em graus; o gráfico mostra amostras discretas de elevação e horizonte geométrico 0°. As linhas são guias visuais, sem interpolação.
- O **planejamento livre** do frontend original permanece em modo separado, sem resultados científicos para coordenadas/datas próprias. Seu rascunho é temporário e é descartado ao trocar de modo ou recarregar.

O JSON original de [2026](docs/audits/pr4/result-2026.json) é importado como texto estático e validado em tempo de execução pelo contrato `analysis-result` 1.0.0 e por invariantes de cobertura, pares e grade UTC. Dados incompatíveis geram erro explícito, sem números substitutos. O download oferece o arquivo original completo, incluindo proveniência e hashes; não existe cópia manual divergente no frontend.

**Não são observações diretas nem recomendações de pouso.** Modelo esférico com orientação analítica IAU_MOON e correção CN+S; não modela relevo, sombras de crateras/montanhas, refração, disco finito, eclipses, energia, qualidade de enlace ou segurança. Elevação não é iluminação efetiva nem garantia de comunicação. Amostras diárias não fornecem duração contínua de iluminação.

**Não validado independentemente contra JPL Horizons:** a auditoria registra HTTP 403 e zero comparações. DE421 veio de espelho de terceiros, com hashes, sem conferência direta no servidor NAIF; completude atual do LSK e precisão física não estão certificadas. Reproduzir o cálculo não equivale a validar sua precisão física.

## Verificação

```sh
npm run test:infra
npm run typecheck
npm test
npm run build
npm run check:deploy
```

O runner de infraestrutura também confere o SHA-256 do artefato auditado. Os testes frontend cobrem o consumidor científico, todos os 1.460 pares amostrados, seleções de locais/alvos/datas, erros e isolamento do planejamento livre.

Para desenvolvimento e reprodução Python (Python 3.12+):

```sh
python -m venv .venv
.venv/bin/python -m pip install -e './science[dev]'
.venv/bin/python -m lunar_science fetch-kernels --kernel-set science/examples/kernel-set.json --kernel-dir /tmp/lunar-historical-kernels
LUNAR_KERNEL_DIR=/tmp/lunar-historical-kernels .venv/bin/python -m pytest science/tests -ra
.venv/bin/python -m build science
.venv/bin/python science/tools/verify_de421_audit.py --cache-dir /tmp/lunar-de421-cache --output-dir /tmp/lunar-de421-reproduction
```

O conjunto histórico de testes usa DE405 e não cobre 2026. O reprodutor usa DE421, verifica hashes/cobertura e compara as séries com a auditoria. Sem kernels, alguns testes Python são explicitamente pulados; não interpretar skips como execução científica aprovada. A CLI sem argumentos mantém o status legado `not_implemented`; o subcomando `analyze` executa o motor geométrico. Veja [GEOMETRY.md](science/GEOMETRY.md).

## Organização e evidências

- `frontend/`: interface, mapa esquemático, gráficos e testes.
- `science/`: motor batch, ferramentas offline e testes.
- `contracts/`: contratos normativos; `science-status` e `analysis-result` são famílias separadas.
- `docs/audits/pr4/`: auditoria original preservada, dados, fontes e hashes.
- [Integração MVP A](docs/mvp-a-integration.md): commits incorporados, decisões, pré-voo e resultados desta execução.

Não altere contratos ou introduza alegações científicas sem coordenar produtor, consumidor e testes. Dependências transitivas Python ainda não possuem lockfile; a evidência de reprodução registra as versões efetivamente usadas.
