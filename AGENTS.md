# Orientações para colaboradores e agentes

## Escopo e organização

- Use o checkout existente: tarefas na nuvem já são isoladas. Não crie worktrees sem pedido explícito.
- Trabalhe em uma branch própria e abra PR; não faça push de funcionalidades em `main`.
- Frontend em `frontend/`, ciência em `science/`, interfaces compartilhadas em `contracts/`.
- Esta base não implementa ciência. Não invente datasets, métricas, resultados, unidades ou alegações de validação científica.
- Preserve alterações existentes do usuário. Nunca versione segredos, `.venv`, dependências ou artefatos gerados.

## Colaboração em paralelo

- Divida trabalho por diretório; coordene alterações em `contracts/`, arquivos da raiz e CI antes de editar.
- Cada PR deve explicar comportamento, testes realizados e limitações.
- JSON Schema é a fonte normativa do contrato. Mudanças precisam atualizar documentação, exemplo, produtor Python, consumidor TypeScript e testes de ambos.
- Não acople Python à interface ou introduza backend, infraestrutura ou dependências pesadas sem necessidade da tarefa.

## Preparar e validar

Na raiz: `npm ci`, `python -m venv .venv`, `.venv/bin/python -m pip install -e './science[dev]'`.

Antes de concluir alterações relevantes:

```sh
npm run typecheck
npm test
npm run build
(cd science && ../.venv/bin/python -m pytest)
.venv/bin/python -m build science
```

Execute `npm run dev` para a interface e `.venv/bin/python -m lunar_science` para conferir a saída JSON da CLI. Não confunda o exemplo estático com uma integração HTTP. Novas funcionalidades devem ter testes relevantes; mantenha o lockfile npm sincronizado e use instalação congelada em CI.
