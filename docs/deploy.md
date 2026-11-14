# Deploy, integração e diagnóstico

## Escopo

A Vercel publica somente o frontend estático gerado pelo Vite. O módulo Python continua separado: não é instalado nem executado pela Vercel. O exemplo de contrato exibido na interface não representa uma API científica disponível. Esta configuração não exige credenciais no repositório nem secrets no GitHub Actions.

## Importar o repositório na Vercel

Uma pessoa com acesso ao repositório e à conta/time da Vercel deve:

1. Instalar/autorizar a integração GitHub da Vercel para `s4m256/lunar-landing-site-navigator` e importar o repositório em um projeto.
2. Definir **Root Directory como a raiz do repositório** (`.` / campo vazio na UI). Não selecionar `frontend`: o lockfile npm e o workspace ficam na raiz, e o frontend importa arquivos de `contracts/`.
3. Selecionar **Vite** e **Node.js 24.x** nos ajustes do projeto, em acordo com `.nvmrc` e `package.json`. Confirmar a disponibilidade dessa versão na conta antes do primeiro deploy.
4. Conferir as configurações versionadas em `vercel.json`:

   | Ajuste | Valor |
   | --- | --- |
   | Install Command | `npm ci --include=dev` |
   | Build Command | `npm run build` |
   | Output Directory | `frontend/dist` |

   Os caminhos são relativos à raiz. `--include=dev` instala TypeScript e Vite mesmo quando o ambiente é de produção. Não usar `npm install`, outro gerenciador ou instalação restrita ao diretório frontend. Remover overrides antigos conflitantes no painel.
5. Usar **main** como Production Branch. Ativar a integração Git para gerar Preview Deployments dos PRs; conferir as políticas de autorização de forks e de proteção dos previews na conta/time. Não configurar Ignored Build Step inicialmente: mudanças no contrato e no lockfile também podem afetar a interface.
6. Aguardar o primeiro deploy e conferir no navegador a página inicial, os recursos JS/CSS e o console. Para o PR de infraestrutura, validar primeiro um Preview; a publicação em produção ocorrerá depois do merge autorizado em `main`.

Não há variáveis obrigatórias atualmente. Não inventar tokens da Vercel. Se variáveis `VITE_*` forem introduzidas, seus valores entram no bundle público; nunca usá-las para segredos. `.vercel/` é ignorado pelo Git para evitar versionar vinculação local de conta/projeto.

O código atual só precisa da página inicial; não foi adicionada regra genérica de rewrite. Se Elias introduzir rotas de cliente, coordenar e testar o acesso direto/reload dessas rotas antes de adicionar fallback SPA. Não usar fallback para mascarar arquivos JS/CSS ausentes.

## Reproduzir a preparação de deploy

Na raiz, com Node 24 e npm 11:

```sh
npm ci --include=dev
npm run test:infra
npm run typecheck
npm test
npm run build
npm run check:deploy
```

`test:infra` usa o runner nativo do Node, sem novas dependências. Testa se a verificação recusa bundles ausentes, fontes TypeScript não compiladas, arquivos fora do diretório publicado e CSS vazio. `check:deploy` confere a configuração de monorepo e os arquivos JS/CSS realmente referenciados por `frontend/dist/index.html`. Ele não substitui testes da aplicação nem valida regras/credenciais do provedor. Execute o build antes: arquivos antigos em `dist` não demonstram que o commit atual compila.

Para conferir a aplicação produzida, use `npm exec --workspace frontend -- vite preview --host 127.0.0.1` e abra a página no navegador local. Verifique carregamento e console, além de HTTP 200: só uma porta aberta não comprova a renderização.

Validação Python independente, na raiz:

```sh
python -m venv .venv
.venv/bin/python -m pip install -e './science[dev]'
(cd science && ../.venv/bin/python -m pytest)
.venv/bin/python -m build science
.venv/bin/python -m lunar_science
```

O job Python também instala a wheel gerada em outro ambiente virtual e executa `lunar-science` fora do checkout. Isso verifica empacotamento e entrypoint, enquanto pytest verifica comportamento e contrato. Dependências transitivas Python ainda não têm lockfile.

## Integração de PRs

1. Criar uma branch da `main` atual. Coordenar arquivos da raiz/CI com infraestrutura; interface com Elias; requisitos científicos com Isaac e implementação com o responsável pelos algoritmos.
2. Evitar mudanças cruzadas sem coordenação. Alterações de contrato precisam seguir `contracts/README.md` e atualizar os dois consumidores/produtores em trabalho próprio.
3. Rodar os comandos relevantes e descrever resultados, limitações e eventuais mudanças de contrato no PR. Manter o lockfile npm sincronizado.
4. Aguardar os jobs **frontend** e **science** do workflow **CI** e o Preview da Vercel, quando a integração estiver configurada. Inspecionar o Preview antes de aprovar. O CI executa em todos os PRs e em pushes à `main`; branches sem PR não disparam esse workflow. Execuções superadas na mesma referência são canceladas.
5. Um administrador deve configurar proteção de `main`/ruleset com revisão e checks obrigatórios **frontend** e **science** (confirmar os nomes exibidos após a primeira execução). CI verde sozinho não bloqueia merge sem essa configuração. Tornar o check Vercel obrigatório somente depois de a integração funcionar e seu nome ser conhecido.
6. Fazer merge apenas após aprovação da equipe. O fluxo de integração Git da Vercel publica a Production Branch automaticamente; não há deploy por GitHub Actions, nem token Vercel a cadastrar no CI.

Para rollback, um responsável pode promover um deploy anterior conhecido no painel da Vercel. Registrar o incidente e preparar PR de correção/revert para alinhar novamente `main` ao que está publicado.

## Diagnóstico rápido

Começar pelo SHA, branch e ambiente (Preview ou Production) exibidos no deploy. Comparar com o commit do PR para evitar analisar logs antigos.

| Sintoma | Onde conferir / ação |
| --- | --- |
| Falha em Install / `npm ci` | Conferir lockfile, Node 24/npm e Root Directory; reproduzir `npm ci --include=dev` na raiz. Não regenerar lockfile no servidor para ocultar inconsistência. |
| `tsc`, Vite ou módulo não encontrado | Abrir primeiro erro do Build Log; executar `npm run typecheck` e `npm run build`. Confirmar dependências de desenvolvimento instaladas. |
| `contracts/` ausente | Root Directory deve ser a raiz; conferir imports e arquivos versionados no commit, sem mover módulos. |
| Output Directory não encontrado | Build deve gerar `frontend/dist/index.html`; conferir `vercel.json`, overrides e `npm run check:deploy`. |
| Página em branco ou JS/CSS 404 | Conferir Network/Console, URLs dos assets, commit e Build Log; executar `check:deploy`. HTTP 200 do HTML não basta. |
| Rota de cliente funciona por navegação, mas falha no reload | Coordenar com frontend a política de roteamento/fallback; testar acesso direto à rota. |
| Deploy não começou | Conferir autorização da integração GitHub, branch, políticas de fork/Preview e Ignored Build Step. CI e Vercel são sistemas independentes. |
| CI Python falha | Abrir o job science: separar instalação, pytest, build e smoke da wheel; reproduzir a etapa que falhou. Não afeta a instalação do frontend na Vercel, mas bloqueia integração se o check for obrigatório. |
| Permissão negada na conta Vercel | Responsável pela conta deve conceder acesso/autorizar integração. Não inserir credenciais no código ou no chat. |

Não foram executados deploy remoto, `vercel build` ou validação de credenciais nesta tarefa: exigem acesso/vinculação à conta. Os checks locais comprovam consistência e geração dos artefatos, não publicação ou disponibilidade do provedor.
