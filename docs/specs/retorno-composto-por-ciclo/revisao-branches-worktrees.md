# Revisão de branches e worktrees e integração na main (2026-10-17)

Workflow `revisao-branches-worktrees` (run `wf_258bdd10-b59`): 8 revisores, 8 céticos, 2 ensaios com 2 céticos e 1 planejador, 21 agentes Haiku 5.5, 0 erros, somente leitura mais ensaios em worktrees descartáveis. Inventário determinístico (git, sem agente) em `.scratch/revisao-branches/`. Este documento registra o que foi apurado, o que foi **feito** e o que ficou **para o dono**.

## 1. Inventário

A `main` local (`c67b39e` antes desta sessão) rastreia `upstream/main`, o repositório original de **terceiros** (jarrodwatts/jev-trader); `origin` é o fork do dono. **Nunca fazer push da `main` para `upstream`.** Sugestão ao dono, reversível: `git config remote.upstream.pushurl DISABLED`.

| Item | Estado | Trabalho exclusivo |
| --- | --- | --- |
| `autoresearch/...` (checkout principal, **merge em andamento** de `c67b39e`) | 3 commits a frente, 48 atrás; 13 caminhos em conflito (12 UU e 1 AA), 4 ainda com marcadores | 3 commits e a resolução manual não commitada |
| `goal1/motor-decisao-onchainos` (worktree com **sessão ativa hoje**) | 10 commits a frente da `main`, 0 atrás; merge limpo | 10 commits; fora deles, 1712 alterações não commitadas (1062 deleções de docs, 9 de código, 233 modificações, 852 não rastreados medidos depois) |
| `codex/decision-weight-evidence` (worktree Codex) | ancestral da `main`; 33 arquivos não rastreados | só os 33 arquivos |
| detached `00a593b` (worktree Codex `learning-evidence`) | ancestral da `main`; 35 não rastreados, com versões divergentes de `src/outcomes` e `src/intel` | só os 35 arquivos |
| detached `3b695ed` em `C:/Users/gabri/jev-trader-main` | 99 commits atrás da `main`, limpo; documentos o descrevem como checkout que serve a `main` nas portas 3020 e 3021 (**produção**), com `data/` de 151 MB | nenhum |
| `fix/autoresearch-real-online-20261016`, `fix/jev-executable-decision-20261016`, `feat/cerebro-grafo-v2` | todas ancestrais da `main`, sem commit exclusivo | nenhum |
| `origin/main`, `origin/codex/*`, `upstream/main` | ancestrais; a `main` local estava 297 commits a frente (último fetch local, sem rede) | nenhum |
| worktrees e branches `wf_1930517d-e57-54/55/56` (desta sessão) | base antiga `b587759`, 2 arquivos não rastreados cada | módulos S1, S2 e S3 (copiados para backup) |

## 2. O que foi feito

1. **Cópia de segurança** fora do repo, em `C:/Users/gabri/backup-integracao-20261017/`: tar dos não rastreados da R3 (33), R4 (35), dos três worktrees `wf_*` (2 cada) e da `goal1` (852), mais os patches `autoresearch-merge-diff-HEAD.patch` e `goal1-alteracoes-rastreadas.patch`. Nada foi removido.
2. **Branch `feat/retorno-composto-por-ciclo`**, criada de `c67b39e` num worktree limpo, com 5 commits: remoção do teto diário do Jev, feed da bolsa na porta 443, módulos em sombra S1 e S3, documentação da pesquisa e grafo. Validada antes: `bun run typecheck` 0, `test:lab` 647 passam, 978 testes das áreas tocadas passam, `cerebro verify` ok, varredura sem caracteres vedados, endereços ou segredos (159 arquivos). **A `main` foi atualizada por fast-forward local** (`c67b39e` para `d28ae49`), sem push.
3. **Integração da `goal1`** na branch `integracao/goal1-na-main`, a partir da `main` nova: merge `--no-ff` dos 10 commits; o único conflito foi o log hash-encadeado do grafo (`events.jsonl` e `graph.v2.json`), resolvido ficando com a cadeia da `main` e **reaplicando os 32 eventos da `goal1` com as funções oficiais** (13 nós e 19 ligações; `verify` ok em seq 1017); correção dos 24 travessões do `roadmap.md` em commit separado (regra do `AGENTS.md`). O merge leva só os commits; as alterações não commitadas da `goal1` não entram. **A `main` local foi levada por fast-forward até a ponta desta branch** (sem push; `git rev-parse main` mostra o commit), e o checkout principal recebeu só as mudanças aditivas: a cadeia do grafo (prefixo exato, `verify` ok) e a porta 443 nos arquivos que ainda tinham a 8443, com cópia prévia em `C:/Users/gabri/backup-integracao-20261017/checkout-principal-antes-da-sincronia`.
4. **Suíte completa da integração** (38 blocos de `src`, `scripts` e os testes de primeiro nível, cerca de 8.300 testes, `--parallel=1`): tudo passa, exceto `src/real` (2 falhas, **idênticas na base**: "public Exchange market snapshot") e `src/settings` (um teste de ambiente e um de deriva, ver o item seguinte). `bun run typecheck` com saída 0 e `test:lab` com 647 testes.
5. **A suíte achou uma regressão minha**: o teste de deriva `src/settings/providers.test.ts` compara o manifesto `src/settings/providers.json` com o código, e o manifesto ainda listava a porta 8443. Além disso, **o navegador** (a Mesa de Operações liga direto na OKX, em `web/src/lib/desk/okx-ws-types.ts`, canais `public` e `business`) também usava a 8443, o que o meu `grep` em `src` e `scripts` não cobria. Corrigido em commit à parte, com o teste do navegador vermelho antes e verde depois. Sobram em `settings` só o teste que lê `node_modules/@ai-sdk/typesafe-ai` (ENOENT em qualquer worktree, que não herda esse diretório; falha igual na base) e, em `web/src/lib/desk`, 15 testes que não carregam por falta do pacote `react` nos worktrees (iguais na base).

## 3. O que o fluxo errou ou não sabia (correções minhas)

- O planejador propôs "manter o teto" (D3) e a validação por agentes reprovou o gate por motivos corretos e incorretos. **O teto diário foi removido por ordem do dono** em 2026-10-17; na `main` o limite **por execução** (1 a 40, `JEV_JUDGE_HARD_MAX_CALLS`) continua obrigatório. Só no lado `autoresearch` do merge esse limite é opcional ("sem teto"), e a mudança de `jev-consensus-mcp.ts` que aceita `max_calls` omitido fica apenas no checkout do dono, compatível com o `jev-judge.ts` dele. Resolver essa diferença faz parte do merge do dono.
- A validação por agentes **encontrou um erro real meu**: a minha edição do MCP não passava no `bun run typecheck` estrito (eu tinha checado com outra configuração). Foi corrigida e só a parte compatível com a `main` foi commitada.
- Um cético afirmou que o `MERGE_HEAD` não existia mais; **existe** (conferido). Contagens de `git status` variam (80 a 85) porque há sessões ativas.
- A validação por agentes foi **instável** entre execuções: a mesma fatia saiu aprovada numa e reprovada na outra, e uma especificação falhou por esquema. Por isso o commit final foi feito e verificado diretamente, e a suíte roda comparando com a base.

## 4. Para o dono (nada disto foi feito)

| Item | Por quê | Comando ou ação sugerida |
| --- | --- | --- |
| Concluir o merge em andamento do checkout principal | 8 arquivos de execução e risco sem resolução (`src/agent/cycle.ts`, `entry-cost.ts` e teste, `model.ts` e teste, `wire.ts` e teste) e `scripts/jev-consensus.ts` (limite de chamadas pagas ao Jev); 9 remoções vindas da `main` de arquivos que a harness da branch usa; revisão humana antes de commitar `wire.ts` e `model.ts`. Depois o merge precisa ser refeito contra a `main` nova (`d28ae49` e adiante) | O ensaio com 5 arquivos seguros resolvidos está em `.scratch/revisao-branches/autoresearch-resolucao.patch`. Não abortar sem o backup |
| `goal1`: alterações não commitadas | 1062 deleções de docs e 9 de código (inclui `src/okx-market/okx-api.ts`), `fallow` como devDependency e `bun.lock` não commitados: **dependência nova e remoções não são decididas por agente** | Decidir na sessão dona; o backup está feito |
| `goal1`: defaults | `withExecutorHealth` e `createProductionShadow` ligam por padrão (`wire.ts` linhas 627 e 636; variáveis `JEV_EXECUTOR_BREAKER` e `JEV_ENGINE_SHADOW` desligam com `0`). O merge **manteve o default do autor** | Decidir se mantém antes de atualizar o checkout de produção |
| R3 e R4 | 33 e 35 arquivos únicos; R4 tem versões divergentes de `src/outcomes` e `src/intel` | Commitar em branch própria ou descartar; reconciliar com a `main` |
| Produção (`jev-trader-main`) | 99 commits atrás, processos nas portas 3020 e 3021 e produtores em laço; o logon automático pode apontar para o checkout principal (não verificado) | **Não toquei.** Atualizar ou parar é decisão do dono, com plano de rollback e arquivo de `data/` |
| Limpeza | worktree limpo de `feat/cerebro-grafo-v2` e as branches já integradas | `git worktree remove` sem `--force` e `git branch -d` (nunca `-D`), por você, depois de confirmar que não há sessão ativa |
| Publicação | a `main` tem cerca de 300 commits que só existem localmente | `git fetch origin`, guarda do `upstream`, e só então decidir `push origin main`. Nunca para `upstream` |
| Porta 8443 | O feed vivo, o navegador e o manifesto de provedores já foram migrados para a 443. `src/public-market-capture/*` (e `docs/PUBLIC-MARKET-CAPTURE.md`) ainda usa a 8443, com recibos de acesso que trazem a URL exata | Migrar antes de 2026-10-31 e reemitir os recibos. O checkout de produção (`jev-trader-main`, 99 commits atrás) só recebe a correção quando o dono o atualizar |

## 5. Prontidão para operação real (apenas informativo)

O agente **não** liga nem recomenda ligar operação real. O estado verificado hoje não atende a nenhum portão: merge do checkout principal sem resolver, dois testes de `src/real` e um de `src/settings` já falham na base `c67b39e`, a qualificação formal (`docs/LIVE-QUALIFICATION.md`, `scripts/qualify-live.ts`) não foi percorrida, e a regra do `AGENTS.md` mantém o live bloqueado até qualificação e autorização do dono. Qualquer passo nessa direção é do dono.
