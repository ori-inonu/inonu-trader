---
name: review-diff
description: Revisa um diff por segurança, testes e escopo antes de commit ou PR. Use antes de qualquer ship-pr ou quando pedirem revisão.
---

# Review diff

## Checklist

1. Escopo: o diff faz só o que a spec pede? Há arquivos fora da tarefa?
2. Segredos: nenhuma chave, token ou conteúdo de `.env` aparece no diff.
3. Dinheiro e risco: nada assina, transfere ou muda limite de risco sem autorização. `Market.init()` não foi alterado para liberar live.
4. Testes: cada critério de aceitação tem teste ou comando que o prova.
5. Verificação: `bun run typecheck` passou.
6. Compatibilidade: arquivos já modificados por outras sessões não foram sobrescritos.
7. Convenções: Bun no lugar de Node, sem ponto médio nem travessão em texto renderizado.
8. Memória: a iteração tem nó no cérebro (`scripts/brain.ts`), `rebuild` passa e prompts novos vêm de nós `prompt` (`gen-prompts`), não de literais no código.

## Saída

Liste os achados por severidade: bloqueante, importante, menor. Para cada um, arquivo e linha. Se não houver achados, diga isso com a evidência do que foi verificado.
