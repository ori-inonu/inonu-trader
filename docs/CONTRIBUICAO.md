# Contribuir com Inonu Trader

O projeto é um fork MIT de [jev-trader](https://github.com/jarrodwatts/jev-trader). A licença e o crédito original devem acompanhar as alterações.

```sh
git clone https://github.com/ori-inonu/inonu-trader.git
cd inonu-trader
git remote add upstream https://github.com/jarrodwatts/jev-trader.git
git switch -c codex/minha-contribuicao
bun install --frozen-lockfile
cd web
bun install
bun run test
bun run build --webpack
bun run typecheck
```

Faça um commit apenas dos arquivos da sua mudança, envie a branch e abra um pull request em rascunho. Use o fork para a identidade Inonu e proponha melhorias gerais separadamente ao projeto original. A inclusão como contribuidor depende de uma contribuição aceita pelo respectivo mantenedor.

No Windows, `scripts/github.ps1` pode executar a CLI oficial `gh` usando uma credencial GitHub já disponível no Git Credential Manager, apenas durante o processo. Ele não realiza login nem salva uma nova credencial. Se não houver autenticação disponível, configure a CLI oficial antes de usá-lo.

Nunca inclua `.env`, chaves, saldos pessoais ou registros internos de agentes em um PR. A conexão OKX da interface é somente leitura e não ativa operações financeiras. Consulte [CONTRIBUTING.md](../CONTRIBUTING.md) e [OKX-WALLET.md](../web/OKX-WALLET.md).

Memória do projeto: cada mudança relevante vira um nó no cérebro (`bun --no-env-file run scripts/brain.ts add ...`); veja `AGENTS.md`.
