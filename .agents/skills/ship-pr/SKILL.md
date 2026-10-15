---
name: ship-pr
description: Prepara um commit com mensagem convencional, roda a verificação do projeto e abre um PR com resumo e saída dos testes. Use quando a tarefa estiver pronta para revisão.
---

# Ship PR

## Passos

1. Confira o estado: `git status --short` e `git branch --show-current`. Nunca commite em `main` sem pedido do dono.
2. Revise o diff com a skill `review-diff`.
3. Rode a verificação do AGENTS.md: `bun run typecheck` e `bun run test`. Se falhar, pare.
4. Commite com mensagem convencional: `tipo(escopo): resumo` (`feat`, `fix`, `docs`, `test`, `chore`). Não inclua segredos.
5. Envie a branch e abra o PR com `gh pr create`. No corpo: o que mudou, por quê, e a saída da verificação.
6. Não use `--force`. Não habilite auto-merge sem pedido do dono.
