# AGENTS.md

Mapa do repositório. Detalhe fica em `docs/`. Antes de mexer em uma área, leia o doc apontado.

## O que é este repo

INONU TRADER: fork do Jev Trader. Agente autônomo de carteira que usa o modelo Jev (TypeSafe AI) para decidir compra, venda ou espera, com validação de código, recibos e gates de risco. Live trading fica bloqueado por design até qualificação e autorização do dono.

## Mapa de diretórios

- `src/`: núcleo do agente, mercado, decisão, execução, dashboard.
- `scripts/`: comandos operacionais (`doctor`, `capture`, `backtest`, `qualify:live`, `okx:*`, `jev:lab`).
- `web/`: painel local (Next/Bun), porta 3001.
- `docs/`: especificações, evidências e pesquisas. Índice em `docs/index.md`.
- `docs/sdd/`: especificações SDD vigentes, incluindo `agente-autonomo/` e `carteira-evidencia/`.
- `data/`: journals e evidências locais. Ignorado pelo git, não edite à mão.
- `.codex/`: harness do Codex (config, hooks). Ver `docs/conventions.md` e o relatório de configuração.
- `.agents/skills/`: skills do fluxo SDD, ship-pr e review-diff.

## Como rodar

```
bun install
bun run doctor            # lê o estado do RPC e das credenciais, sem assinar
bun run start             # servidor local na porta 3000
bun run capture --seconds 180   # exige MODE de paper
```

## Comandos de verificação (definition of done)

Uma tarefa só está pronta quando estes comandos passam, com a saída colada no final:

```
bun run typecheck         # tsc --noEmit -p tsconfig.verification.json
bun run test              # bun test em src/ e scripts/
bun run test:lab          # suíte do laboratório Jev
```

Não existe script de lint no `package.json`. Se for adicionado, ele entra nesta lista.
Para mudanças no `web/`, rode também `bun run typecheck:all` e `bun run test:all`.

## Convenções duras

- Não cole segredos, chaves ou o conteúdo de `.env` em arquivos, logs ou respostas. `TYPESAFE_AI_API_KEY` e chaves privadas ficam só no `.env` local.
- Use Bun, não Node: `bun` em vez de `node`, `bun test` em vez de jest, `bun:sqlite` em vez de better-sqlite3. Exemplos em `docs/conventions.md`.
- Nenhum texto renderizado usa ponto médio, travessão ou meia-risca. Sem indicadores piscando ou pulsando.
- Dinheiro real não é movimentado por agente. Qualquer caminho que assine ou transfira exige autorização explícita do dono.
- Um broadcast de transação não é execução confirmada. Ordens pendentes não podem ser duplicadas.
- Não prometa lucro nem recuperação de perdas.
- Nunca troque a regra de segurança do `Market.init()` para liberar live. Essa decisão é do dono.

## Sem perguntas ao dono: decisões vão ao Jev

Decisão do dono (chat, 2026-10-17): a sessão e o agente não param para perguntar. Toda dúvida de planejamento, pesquisa, investigação, implementação, validação, revisão ou teste vira uma decisão estruturada (`{"pergunta", "opcoes": [{"id", "descricao", "evidencia"}], "restricoes", "reversivel"}`) e vai ao Jev (`consensus_plan`, depois `consensus_run`). Se o Jev estiver fora do ar, escolha a opção mais reversível e de menor risco, registre com `goal.ts decide` (receipt `sem-jev`) e siga.

Fora do Jev, nunca decidir e nunca perguntar. O item vira bloqueio (`goal.ts blocked`) e a sessão segue com o resto:

- Dinheiro real, carteira, ordens, saques e transferências, e qualquer liberação de live ou mudança de limite de risco.
- Segredos, chaves, credenciais e autenticação.
- Migrações de dados ou de schema, inclusive dos journals em `data/`.
- Force-push, reescrita de histórico ou apagar branches.
- Dependências de produção novas ou trocadas.
- Billing, contratos e qualquer serviço pago.

Esses bloqueios ficam na lista do objetivo para o dono ler depois. Ver `src/goal/loop.ts` (`FENCED_TOPICS`).

## Estado atual do produto (decisão do usuário, 2026-10-14)

O usuário trocou a demo do Monad e Kuru, com ordem a cada 300 ms, pelo agente de carteira autônomo. Não apresente o agente como cumprindo os requisitos antigos.

Prioridade imediata: operação contínua no computador Windows local, com estado durável, recuperação segura e falhas visíveis. Vercel vem depois, sem budget definido. Não compre hospedagem.

Especificação vigente: `docs/sdd/agente-autonomo/`. Antes de editar caminhos concorrentes, siga os contratos de dono de sessão e de evidência.

## Regras do cerebro documental

- `docs/_meta/cerebro/events.jsonl` e a fonte autoritativa append-only; `graph.v2.json` e derivado regeneravel.
- Encaminhe cada decisao de design ao JEV antes de implementa-la. Trabalhador nao faz chamada paga ao JEV.
- Use `retract` em vez de apagar nos ou vinculos. Nunca remova eventos anteriores.
- Limite `export` ao pacote compacto aprovado para JEV; nao exporte o repositorio sem limite nem inclua segredos.
- Preserve byte a byte `graph.json` v1, curadoria, fontes e `outputs.json`. Este grafo documental nao altera operacao live ou risco.

## Workflow padrão

- Feature não trivial: use a skill `sdd-feature` (`.agents/skills/sdd-feature/SKILL.md`). Spec, plan, tasks, depois implementação.
- Mudança de uma linha ou correção óbvia: pode pular o SDD, mas rode a verificação.
- Tarefas com três ou mais passos dependentes: use o grafo de tarefas descrito em `docs/specs/_template.md`.
- Antes de commitar ou abrir PR: `ship-pr`. Para revisar um diff: `review-diff`.

## Pointers

- Índice completo de docs: `docs/index.md`.
- Convenções Bun e exemplos de código: `docs/conventions.md`.
- Contribuição: `docs/CONTRIBUICAO.md`.
- Objetivo de engenharia ativo: `docs/GOAL-INONU-TRADER.md`.
- Carteira e evidências: `docs/sdd/carteira-evidencia/` (`requirements.md`, `design.md`, `tasks.md`). Leia `tasks.md` primeiro para saber o que fazer e quais caminhos estão reservados por outras sessões.
- Cérebro em grafo: `docs/_meta/cerebro/events.jsonl` (autoridade, append-only) e `graph.v2.json` (derivado). Use `bun --no-env-file run scripts/brain.ts query|add|retract|rebuild|export`. Cada iteração vira um nó `iteracao`; esquecer é `retract`.
