# Roteiro: fazer o checkout principal convergir para a main (2026-10-17)

Decisão do Jev `rc3-d5-checkout-dono` (consenso, média 0,98 na última rodada): **preparar um roteiro verificado e não executar nada no checkout**. Abortar o merge e avançar o checkout foi marcado como proibido, porque descartaria a resolução parcial não commitada de uma sessão que pode estar ativa. Nada neste roteiro foi executado.

## Situação verificada

- A branch do checkout (`autoresearch/quero-que-voc-crie-m-tricar-e-ciclos-de-melhoria-20261016`, ponta `d513d60`) é **ancestral da `main`**: a `main` já contém os 3 commits dela, com os conflitos resolvidos e validados. Um fast-forward basta depois de encerrar o merge.
- O merge em andamento (`MERGE_HEAD` `c67b39e`) é o antigo; ele não é mais necessário.
- O log do grafo do checkout já foi sincronizado de forma aditiva com a `main` (prefixo idêntico; `cerebro verify` ok).
- Cópias de segurança em `C:/Users/gabri/backup-integracao-20261017/` (feitas em 2026-10-17): `autoresearch-merge-diff-HEAD.patch` e `goal1-alteracoes-rastreadas.patch` (patches), tars dos arquivos não rastreados dos worktrees do Codex e da `goal1`, e `checkout-principal-antes-da-sincronia*` (grafo e arquivos tocados). **Elas são anteriores às suas últimas edições**: tire uma cópia nova (passo 1) antes de qualquer coisa.

## Passos (por você, com a sessão que usa esse checkout parada)

```bash
cd C:/Users/gabri/jev-trader

# 1) fotografar tudo que não está commitado, inclusive a resolução parcial do merge
B=C:/Users/gabri/backup-integracao-20261017
git diff HEAD > "$B/resolucao-parcial-$(date +%Y%m%d-%H%M).patch"
git ls-files -o --exclude-standard | tar -cf "$B/nao-rastreados-$(date +%Y%m%d-%H%M).tar" -T -
ls -la "$B" | tail -4        # conferir que os dois arquivos novos não estão vazios
```

```bash
# 2) conferir que o avanço é um fast-forward puro
git merge-base --is-ancestor HEAD main && echo "fast-forward possivel"
```

```bash
# 3) encerrar o merge antigo e avançar
git merge --abort
git merge --ff-only main
```

```bash
# 4) verificar
bun run typecheck
bun --no-env-file run scripts/cerebro.ts verify
```

## Cuidados

- `git merge --abort` pode não conseguir reconstruir mudanças feitas depois que o merge começou; é por isso que o passo 1 vem antes. Se faltar algo depois, o patch tem a resolução parcial.
- Se o `--ff-only` recusar por causa de arquivos não rastreados no mesmo caminho de um arquivo que a `main` traz, mova esses arquivos (o tar do passo 1 já os guarda) e repita.
- Alterações do seu checkout que já estão na `main` (porta 443, grafo, `jev-consensus-mcp.ts`) deixam de aparecer como diferença depois do avanço; é esperado.
- Confirme que nenhuma outra sessão (a `goal1` ou a produção em `jev-trader-main`) está apontando para este checkout antes de começar.
