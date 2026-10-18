---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js: `bun <file>`, `bun test`, `bun install`, `bun run <script>`, `bunx`, `bun:sqlite`, `Bun.serve()`, `Bun.file`. Bun loads `.env` by itself. Code examples (server, HTML imports, tests) live in `docs/conventions.md`.

## Where things live

- Repo map, verification commands, hard rules and the "stop and ask" list: `AGENTS.md`. Read it first.
- Memory of the project is a graph: `docs/_meta/cerebro/` (`bun run scripts/cerebro.ts search <termo>`; `export`, `add-node`, `link`, `retract`, `supersede`, `verify`). Prefer querying it over re-reading prose. Never store secrets in it.
- Product state: the autonomous wallet agent replaced the old Monad and Kuru demo (decision of 2026-10-14). Spec: `docs/sdd/agente-autonomo/`. Wallet evidence: `docs/sdd/carteira-evidencia/` (read `tasks.md` first; do not copy its content elsewhere).
- No middle dots, em dashes or en dashes in rendered text. No blinking or pulsing indicators.

## Agent skills

Global defaults in `~/.claude/CLAUDE.md` apply here too.

- Issues live on GitHub (`origin` is `ori-inonu/inonu-trader`); use the `gh` CLI. `.scratch/` holds local evidence and is git-ignored.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
- Single-context repo. Read `GLOSSARY.md` and `docs/adr/` when they exist; create them lazily when a term or decision is settled. Specs and evidence are indexed in `docs/index.md`.
