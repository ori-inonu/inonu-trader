# Integração da branch autoresearch na main (2026-10-17)

Registro da integração da branch `autoresearch/quero-que-voc-crie-m-tricar-e-ciclos-de-melhoria-20261016` (3 commits, ponta `d513d60`) na `main`, feita num worktree descartável (`integracao/autoresearch-na-main`) sem tocar no merge em andamento do checkout principal. Nada foi enviado (push), nada foi apagado e nenhuma configuração de execução, risco ou live foi alterada.

## O que entrou

- A pesquisa e as especificações em `docs/specs/inteligencia-ciclos-jev`, `painel-dev-somente-leitura` e `decisao-executavel-jev` (rascunho anterior descartado a favor da versão posterior da `main`).
- O código do agente da branch: `analysis`, `book`, `budget`, `candidates`, o Brief com proveniência de `priceInfo`, as revisões por ciclo (`cycleReviews`) e o painel do desktop e da web que as lê.
- O cliente OnchainOS com porteiro de envio por requisição, abortos seguros por prazo e leitura de `Retry-After` (ver a decisão 4).
- O Jev sem teto de chamadas, como o dono decidiu (decisão 3).

## Decisões de conflito (18 arquivos em conflito, resolvidos à mão)

1. **Skills** (`.agents/skills/*`): fica o ponteiro para o grafo da `main`. A regra "sem perguntas ao dono, decisões vão ao Jev" mora no `AGENTS.md` e vale sempre.
2. **`docs/log.md`**: as entradas dos dois lados foram mantidas.
3. **Jev sem teto** (`scripts/jev-consensus.ts`, `scripts/jev-consensus-mcp.ts`, `src/consensus/quota.ts`): vale o lado do dono, `--max-calls` opcional e sem `--allow-paid-inference`. A contagem do ledger da `main` fica: sem teto o uso é somado ao ledger depois da execução; com `--max-calls` reserva antes e devolve o que sobrou. O teto diário continua infinito.
4. **Cliente OnchainOS** (`src/onchain-read/client.ts`, `probe.ts`, `src/onchainos/http.ts`): os dois lados construíram desenhos diferentes para o mesmo problema. Foram unidos, sem escolher um e perder o outro:
   - Da `main`: orçamento persistente por endpoint (`api-budget`), 402 bloqueia o endpoint até o próximo mês UTC, 429 e 50011 abrem cooldown com recuo exponencial e jitter, `Retry-After` nunca é ignorado.
   - Da `autoresearch`: `call(request, tier, admitDispatch)`; o porteiro é consultado antes de CADA requisição física (inclusive o reenvio por 50102) e pode recusar com `budget_exhausted` ou `pace_limited`; resposta que chega depois do prazo monotônico não altera estado; `sent` é `dispatched.n > 0`; o `gateway.ts` registra cada envio admitido, por isso `extraDispatches` saiu do resultado.
   - `admitDispatch` é obrigatório na interface, como na `autoresearch`: nenhuma chamada passa sem decidir a cota.
   - `http.ts`: `Retry-After` em segundos inteiros lido do cabeçalho e passado ao `backoffMs`; o bloqueio de 402 segue por caminho (mapa da `main`).
   - Os testes que criam cliente ganharam um orçamento isolado (`testBudget`), para não compartilharem o ledger do repositório.
5. **Sonda de custo de entrada** (`entry-cost.ts`, `cycle.ts`, `wire.ts`, testes): a recusa `gas_station_pendente` existia nos dois lados (a `main` a portou da branch). Fica a implementação da `main`, já revisada. Os testes extras da branch foram mantidos ao lado dos da `main`.
6. **Extração de prompts adiada** (13 arquivos voltados à versão da `main`): o commit `0147547` troca os textos de prompt de `jev-model`, `jev-read/decide`, `lab-jev/jev-chooser`, `operator/jev-selector`, `real/jev` e `system-one/decide` por `PROMPTS[...]` importado de `src/generated/prompts`. Esse módulo e o gerador não existem em nenhum commit, worktree ou histórico; a branch sozinha não compila. Em vez de inventar o arquivo gerado (e arriscar mudar texto de prompt do Jev), esses arquivos e seus testes ficam como na `main`. Reversível: depois que o dono commitar o gerador e o módulo, o commit `0147547` pode ser reaplicado.
7. **Documentos de regras**: seção duplicada "Regras do cerebro documental" removida do `AGENTS.md`; as referências ao `scripts/brain.ts` (inexistente) em `AGENTS.md`, `CLAUDE.md` e `docs/CONTRIBUICAO.md` apontam agora para `scripts/cerebro.ts`.
8. **Ajustes de compilação**: a fixture `analysisView` do teste do relatório de autoresearch ganhou `cycleReviewPage` e `cycleReviews`; o `describe` do teste do Brief em `model.test.ts` foi restaurado.
9. **Fora da integração**: os logs de verificação em `.tmp/final-verifier-*` (2,3 MB de saída de teste) não entram; `.tmp/` foi para o `.gitignore`.
10. **Estilo**: nos 12 arquivos em conflito, o recuo de 1 espaço por nível do lado da branch foi normalizado para 2 espaços (o estilo da base e da `main`) antes da fusão, para que o conflito mostrasse só diferenças reais. Os demais arquivos da branch mantêm a formatação deles.

## Validação

- `bun run typecheck` com saída 0.
- Suíte por bloco (`src/*`, `scripts`, `src/*.test.ts`): tudo passa, exceto `src/real` (2 falhas, as mesmas da base) e `src/settings` (1 teste que lê `node_modules/@ai-sdk/typesafe-ai`, falha de ambiente igual na base). `src/onchain-read` 344, `src/onchainos` 331, `src/agent` 1460, `scripts` 709, `src/*.test.ts` 390.
- `bun run test:lab` com 649 passando; `cerebro verify` ok.
- Revisão independente do resultado da fusão (leitura somente): ver o registro no grafo.

## Para o dono (nada disto foi decidido por agente)

| Item | Por quê |
| --- | --- |
| Commitar o gerador de prompts e `src/generated/prompts.ts` (ou os nós `p-*` do grafo) | A extração de prompts do commit `0147547` ficou de fora; sem o gerador ela não compila. Depois, reaplicar `0147547` sobre a `main` |
| Merge em andamento do checkout principal | Continua intocado. Com esta integração na `main`, refazer o merge contra a `main` nova deve ter bem menos conflitos |
| `docs/Sem título.md` e arquivos de `docs/.obsidian` | Vieram junto da branch (anotação solta e estado do Obsidian); decidir se ficam |
| Modo real, produção e limites de risco | Não tocados. O `AGENTS.md` mantém o live bloqueado até qualificação e autorização do dono |
