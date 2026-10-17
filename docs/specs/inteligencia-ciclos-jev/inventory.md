# Inventário de APIs, superfícies e estado

Auditoria em 2026-10-16. Esta abertura descreve apenas a revisão estática/documental: classificações **confirmado em código** = fonte/callsite lido; **documentado externamente** = contrato oficial aberto; **runtime observado** = resultado loopback sanitizado abaixo; **não verificado** = não demonstrado. Nenhuma assinatura, transmissão, trade, chamada autenticada, leitura de segredo ou execução de CLI ocorreu nessa revisão estática; isso não afirma ausência de efeitos em outras etapas históricas. A tentativa posterior de `POST /agent/wallet` e os efeitos desconhecidos estão registrados em `status.md`/`observations.md`. Limites locais não equivalem a quotas do provedor.

## Aplicação, consumidor e superfícies

| Grupo / arquivo-símbolo | Caminho ou recurso | Consumidor / estado | Auth e limites observáveis | Lacunas |
|---|---|---|---|---|
| UI raiz `web/src/app/page.tsx` | `/` | importa AgentView; superfície atual de entrada confirmada no código, não runtime | - | deploy/processo servido não observado |
| `web/src/app/configuracoes/page.tsx` | `/configuracoes` | settings UI; implemented and routed | credentials are handled server-side/vault; keys are fixed by form/code, no secret values recorded | process/build deployment not observed |
| `web/src/app/api/dev-agent/[...path]/route.dev.ts` | dev-agent proxy | dev-only source route; not part of production UI claim | development proxy | deployment not observed |
| `src/agent/http.ts:createAgentHandler`, `src/agent/wire.ts` | `/agent/*` | AgentView root consumer; routes enumerated below | loopback IP/Host + allowlisted Origin; writes require user-intent header | no process state inferred from source |
| `src/server.ts:startServer` and router factories | `/operator`, `/system-one`, `/jev-read`, `/settings/*`, `/onchain/*` | ordinary server composition; distinct from AgentView; exact paths below | local origin/token/write guards vary by router | reachability depends on selected entrypoint |
| `src/real/server.ts:createRealHandler` | `/api/real/*` | separate real-console server; code present, not presumed running | loopback/origin/consent | no process state inferred |
| `src/dashboard/reports-server.ts`, `src/desktop/handlers.ts` | reports service; desktop IPC | separate entrypoints/consumers; not the root web UI | local report guards; desktop bridge | process state not observed |
| `src/onchain-read/http.ts`, `catalog.ts`, route files | `/onchain/*` | local read/API surface; wallet/trade transaction builders distinct from Agentic Wallet | allowlisted Origin + loopback; catalog calls can make outbound API calls | specific use distinguished in route table |
| `src/onchainos/endpoints.ts`, `http.ts`, `gateway.ts` | OnchainOS REST and OKX public V5 | outbound client registry; agent only uses callsites identified below | HMAC credentials for SaaS calls; public V5 no auth; local budget/cache | no account tier/usage observed |
| `src/okx-wallet/portfolio.ts`, `trade.ts`, `defi.ts` | OKX wallet-family REST | utility surface; do not infer agent/UI use absent callsite | trade adapter signs HTTP requests; does not sign/broadcast transactions | transaction construction is not execution |
| `src/agent/agent-wallet.ts`, `cli.ts`, `swap-args.ts` | local Agentic Wallet CLI subprocess | agent wallet setup/execution code; not the same as SaaS API or browser wallet SDK | CLI login/session/TEE; secret material not inspected | no CLI process/runtime call made |
| `src/agent/live.ts:createBookReader` | managed/watch EVM and Solana balances | agent cycle dependency; implementation confirmed | OKX wallet-family adapter | upstream quota for configured account unknown |
| `src/agent/live.ts`, `wire.ts`, `cycle.ts` | market context, risk, candidates, model, cycle/plans | active agent code path from AgentView/service composition | OnchainOS and TypeSafe via injected clients/config | MAPA pacing values remain historical estimates only |
| `scripts/` + root `package.json` | 40 root commands, fully enumerated below | independent CLI entrypoints; some run checks/fixtures | command-specific | command existence does not establish execution |

Estas tabelas distinguem alcance pelo código, relações entre callers, superfícies utilitárias e observações de runtime. O bloco “Diagnóstico local sanitizado” abaixo registra somente o snapshot inicial daquela fase; verificações posteriores e de escopo isolado estão em [observations.md](observations.md) e [status.md](status.md). Somente durante o inventário estático e a fase inicial de GETs loopback não foi invocada carteira nem operação de trading real. Essa frase não cobre todo o histórico: a tentativa posterior de `POST /agent/wallet`, com erro de rede e efeitos desconhecidos, está preservada em [status.md](status.md) e [observations.md](observations.md).

### Frontend ativo versus legado

`web/src/app/page.tsx` seleciona `AgentView`; a cadeia `AgentView.tsx` → `HudView`/`HudGate` e o uso de `readOnly` em development estão sustentados pela inspeção do código, sem atribuição ao usuário. A UI ativa considerada aqui é somente a cadeia rastreada desde essa raiz e `/configuracoes`. `AgentScreen`, Deck e Mesa não são declarados ativos sem import alcançável desde a rota raiz. Os demais servidores e desktop são entrypoints separados. Status de build/deploy não observado.

## OnchainOS: dados JEV e pressão de quota

Mapa histórico `docs/sdd/agente-autonomo/MAPA-DE-APIS-20261015.md` relata como chamadas atuais do agente: `hot-tokens` (Basic), `signals` (Premium), `token-risk` (Premium), `candles` 5m/1H (Basic), `price` (Basic), `price-info` (Premium). O texto associa scan a `source-ecosystem.ts`, risco também a `live.ts`, candles a `live.ts` e preço a `wire.ts`. São afirmações documentais de 15/10, não telemetria desta auditoria.

Callsites atuais confirmados no agente: `/onchain/hot-tokens` (`source-ecosystem.ts`), `/onchain/signals` e `/onchain/token-risk` (`live.ts`), candles (`live.ts`), `/onchain/price` (`wire.ts`) e `/onchain/price-info` (`live.ts`). A coluna de uso da tabela de rotas abaixo distingue os chamados pelo ciclo daqueles disponíveis apenas na UI/API. O MAPA de 15/10 é documentação histórica, não medição atual.

**Pressão histórica estimada, não uso medido nem limite oficial:** mapa relata Basic “perto do teto”; Premium cerca de 5.100 chamadas/dia livres no restante de outubro, ~972/dia de uso projetado e hipóteses de cache/K=3/5. Frequências `top-traders` e `holders` 15 min eram explicitamente supostas; cálculos não são quotas oficiais nem relatório de consumo real. O documento `VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md` também é viabilidade calculada, não prova de conta/plano.

Leitura aderente ao pedido: não adicionar enrichment por padrão. Usar proveniência/frescor já disponíveis e cache existente sem rejuvenescimento; pedido repetido pode ser reaproveitado somente quando o gateway já o faz. O mapa fornece apenas pressão documental histórica. Sem evidência de falha/latência runtime, não se recomenda nova telemetria, breaker ou mudança de carga.

## SaaS/API, SDK e Agentic Wallet são produtos distintos

1. **OnchainOS Open API (SaaS REST)**: autenticação API key + secret + passphrase, headers `OK-ACCESS-*`, assinatura HMAC-SHA256/Base64 de timestamp+method+request path (incluindo query para GET)/body POST. Código implementa este canal em `src/onchainos/http.ts`; só envia com credenciais válidas e `allowNetwork:true`.
2. **Agentic Wallet**: programa/CLI local OnchainOS skills, login email/Google/Apple (ou fluxo API key também documentado), sessão da carteira e execução delegada; chave gerida em TEE segundo OKX. Isso não é o mesmo que chamada SaaS REST nem SDK de wallet do browser. Projeto usa subprocesso `onchainos`; docs descrevem comando/integração, mas runtime não observado.
3. **Wallet SDK / extensão**: assinatura interativa via provider de carteira e acesso do usuário; não inferir que Agentic Wallet CLI ou servidor REST esteja integrado só por `@okxweb3`/documentação existente.
4. **Assinatura/gestão**: API keys e assinatura REST em backend; sessão Agentic Wallet em CLI/TEE; assinatura do provider browser é outro fluxo. Nunca misturar custódia nem transportar segredo para UI/log.

Documentação oficial consultada: [API access and usage](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage) (leitura 2026-10-16). Explica autenticação e diferencia Agentic Wallet e Open API. Página não fornece uma tabela universal de RPS por endpoint. Página oficial DEX [Trade API Fee tiers](https://web3.okx.com/es-es/onchainos/dev-docs/trade/api-fee) foi aberta diretamente e lista Trial 1 RPS por padrão, possível aumento a 5 após revisão, Start-up 2-50 RPS, Enterprise custom; tais números são para DEX API / tiers citados, não podem ser atribuídos automaticamente a cada endpoint OnchainOS nem a Agentic Wallet CLI. Para Agentic Wallet `/priapi` e CLI: limite publicado verificável nesta auditoria **desconhecido**. Não assumir as cotas de Basic/Premium como RPS; quotas de plano e RPS por endpoint são métricas distintas.

## CLI, scripts e outras APIs externas

Inventário dos consumidores externos efetivos e evidência de limites consta na tabela de providers abaixo. Nenhum `.env`, credencial, conta ou plano real foi lido. Root `package.json` (40 scripts) e `web/package.json` estão enumerados nesta página; os entrypoints são superfícies separadas e não provam execução.

### Diagnóstico local sanitizado (GET only)

Código revisado antes da consulta: `src/agent/http.ts` GET `/agent/status` chama `service.status()`, mas `src/agent/wire.ts:walletView()` pode iniciar `refreshAccount()` por subprocesso em segundo plano; não é seguro para o requisito estrito “sem rede/mutação”, portanto **não consultado**. `GET /onchain/budget` foi igualmente excluído: `snapshot()` chama `ensureMonth()` e pode gravar o mês anterior se houver contadores pendentes. `GET /onchain/status` chama `gateway.status()`/`client.status()` e credenciais locais sem chamada de provider ou gravação, portanto consultado.

Resultado do snapshot diagnóstico inicial: `http://localhost:3000/onchain/status` respondeu 403 (Origin/guard não aceito nessa tentativa); `http://127.0.0.1:3000/onchain/status` expirou em 1,5 s; nenhum corpo/JSON foi preservado. Nesse snapshot, servidor/API disponível: **não observado**. `http://localhost:3001/` respondeu HTTP 200; título sanitizado: `INONU TRADER, agente autonomo`. Nenhum navegador foi aberto durante esse diagnóstico inicial. Não foi chamada rota POST/PUT, wallet CLI, SaaS, RPC ou endpoint de trade. Sem status HTTP 200, connected mode, readiness, scheduler, quota ou timestamp/contagens em runtime eram **não verificados**; as consultas `/agent/status` e `/onchain/budget` foram deliberadamente evitadas por potencial efeito secundário. Isso não descreve todas as fases posteriores: `observations.md` e `status.md` registram provas separadas com handler GET, Chromium real em escopo isolado e leituras read-only; elas não demonstram a aplicação Next completa implantada, deploy ou estado live.

## Rotas web server: métodos e paths registrados

Status de processo não inferido pela presença da rota. As rotas abaixo são alcançáveis pela composição do código; handlers OPTIONS/preflight não são funcionalidades.

| Router / arquivo-símbolo | Método + path | Consumidor | Auth/estado |
|---|---|---|---|
| Roteador geral `src/server.ts:startServer` | GET `/`, `/history`, `/events`; delega rotas descritas abaixo | dashboard, diagnostics, settings, onchain | CORS; rota específica protege endpoints |
| `src/operator/http.ts:createOperatorHandler` | GET `/operator`, `/operator/history?limit=`, `/operator/insights` | operator dashboard | token Bearer opcional; guard de Origin |
| `src/system-one/http.ts:createSystemOneHandler` | GET `/system-one` | diagnostics/operator | token Bearer opcional; guard de Origin |
| `src/jev-read/http.ts:createJevReadHandler` | GET `/jev-read` | consumer JEV read | token Bearer opcional; guard de Origin |
| `src/settings/http.ts:createSettingsHandler` | GET `/settings`; PUT `/settings/secrets`, `/settings/prefs`; DELETE `/settings/secrets/{id}`; POST `/settings/test/onchainos`, `/settings/test/jev` | UI settings | loopback/origin/write limiter; test/onchainos faz probe de rede, não executado |
| `src/onchain-read/http.ts:createOnchainHandler` | GET `/onchain/status`, `/onchain/budget`, and each exact catalog route enumerated in the tables below | UI/API onchain | loopback IP/Host + allowlisted Origin; catalog requests may call provider |
| `src/agent/http.ts:createAgentHandler` | GET `/agent/status`, `/agent/analysis`, `/agent/ledger`; POST `/agent/connect`, `/agent/disconnect`, `/agent/wallet`, `/agent/run`, `/agent/resolve`; PUT `/agent/config` | AgentView root | loopback IP/Host + allowlisted Origin; writes exigem `x-inonu-intent:user`, body max 4096 |
| `src/real/server.ts:createRealHandler` | GET `/api/real/health`, `/api/real/latest`, `/api/real/public-market`; POST `/api/real/public-market/refresh`, `/api/real/refresh`, `/api/real/consent`; DELETE `/api/real/consent` | real console separado | loopback + origin/consent guards |
| `src/dashboard/reports-server.ts` | GET `/health`, `/operator`, `/operator/history`, `/operator/insights` | reports server | read-only service; optional local read token |
| `web/src/app/api/dev-agent/[...path]/route.dev.ts` | dev proxy catch-all | dev only | não declarado em produção |
| `web/src/app/page.tsx`, `configuracoes/page.tsx` | GET `/`, `/configuracoes` | Next UI | runtime reportado separadamente |

`src/desktop/handlers.ts` é bridge desktop, não router web. `src/inonu/http.ts` existe em fonte como handler legado/independente; não é alcançado pela composição `src/server.ts` nem pela rota raiz Web.


## Onchain-read public REST route → upstream mapping

O handler local `src/onchain-read/http.ts` expõe somente GET para o catálogo (além de OPTIONS preflight); `src/onchain-read/catalog.ts` combina 37 rotas locais, incluindo as extras em `EXTRA_ENDPOINTS`. Todas as 37 requisições HTTP locais são GET; nas chamadas upstream dessas entradas, o source usa 33 GET e 4 POST. `/onchain/status` e `/onchain/budget` são endpoints locais adicionais fora dessa contagem. Cada endpoint provider requer credenciais OnchainOS e budget local; tier é classificação local, não RPS.

| Local HTTP + route | Upstream request method/path | tier | TTL/local catalog | Agente |
|---|---|---|---|---|
| GET `/onchain/chains` | GET `/api/v6/dex/market/supported/chain` | free | 24h | disponível |
| GET `/onchain/signal-chains` | GET `/api/v6/dex/market/signal/supported/chain` | free | 24h | disponível |
| GET `/onchain/leaderboard-chains` | GET `/api/v6/dex/market/leaderboard/supported/chain` | free | 24h | disponível |
| GET `/onchain/hot-tokens` | GET `/api/v6/dex/market/token/hot-token` | basic | 5m | usado |
| GET `/onchain/search` | GET `/api/v6/dex/market/token/search` | basic | 10m | available |
| GET `/onchain/candles` | GET `/api/v6/dex/market/candles` | basic | bar-specific | used |
| GET `/onchain/price` | POST `/api/v6/dex/market/price` | basic | 30s | used |
| GET `/onchain/signals` | POST `/api/v6/dex/market/signal/list` | premium | 5m | used |
| GET `/onchain/leaderboard` | GET `/api/v6/dex/market/leaderboard/list` | premium | 30m | available |
| GET `/onchain/holders` | GET `/api/v6/dex/market/token/holder` | premium | validator TTL | available |
| GET `/onchain/top-traders` | GET `/api/v6/dex/market/token/top-trader` | premium | validator TTL | available |
| GET `/onchain/price-info` | POST `/api/v6/dex/market/price-info` | premium | configured | used |
| GET `/onchain/token-risk` | GET `/api/v6/dex/market/token/advanced-info` | premium | configured | used |
| GET `/onchain/pools` | GET `/api/v6/dex/market/token/top-liquidity` | basic | configured | available |
| GET `/onchain/trades` | GET `/api/v6/dex/market/trades` | basic | configured | available |
| GET `/onchain/cluster-chains` | GET `/api/v6/dex/market/token/cluster/supported/chain` | free | 24h | available |
| GET `/onchain/clusters` | GET `/api/v6/dex/market/token/cluster/overview` | premium | configured | available |
| GET `/onchain/cluster-top-holders` | GET `/api/v6/dex/market/token/cluster/top-holders` | premium | configured | available |
| GET `/onchain/sentiment` | GET `/api/v6/dex/market/social/sentiment/symbol` | tier unknown | configured | available |
| GET `/onchain/sentiment-ranking` | GET `/api/v6/dex/market/social/sentiment/ranking` | basic | configured | available |
| GET `/onchain/vibe` | GET `/api/v6/dex/market/social/vibe/timeline` | tier unknown | configured | available |
| GET `/onchain/kols` | GET `/api/v6/dex/market/social/vibe/top-kols` | tier unknown | configured | available |
| GET `/onchain/news` | GET `/api/v6/dex/market/social/news/latest` (no symbol) or `/api/v6/dex/market/social/news/by-symbol` (symbol) | basic | 300s | available; normalizer forbids forwarding news text/content/URL to Jev |
| GET `/onchain/quote` | GET `/api/v6/dex/aggregator/quote` | basic | configured | available |
| GET `/onchain/token-info` | POST `/api/v6/dex/market/token/basic-info` | basic | 24h | available |

As rotas adicionais de `/onchain/networks`, wallet, cluster-list, address-tracker, memepump, swap e approve estão discriminadas em “Rotas adicionais” abaixo. São implementadas em `src/onchain-read/routes/{wallet,chain-list,clusters-detail,address-tracker,memepump,trade}.ts` e mescladas em `EXTRA_ENDPOINTS` de `catalog.ts`; não são aliases para Agentic Wallet. Suas rotas HTTP locais são GET; a coluna Upstream registra separadamente método/path do provider. A comparação por caminho exato com `src/onchainos/endpoints.ts` deixou 14 das 37 entradas locais sem match nesse registry; isso não prova ausência de documentação oficial em outras fontes.

## OnchainOS client registry: all paths in `src/onchainos/endpoints.ts`

Método/path/tier abaixo são as entradas exatas do registry; tiers são os registrados no source. O `LIST` atual tem 44 registros: 35 OnchainOS e 9 public V5, com 38 GET e 6 POST. A classificação de famílias observada é market-price 7, market-token 12, signals 4, social 3, gateway 2, defi 7 e public-okx 9. Este registry é distinto das 37 rotas locais e não representa o total de APIs ou endpoints do ecossistema/projeto; não somar os registros nem inferir uso ativo/caller.

| Method + upstream path | Tier |
|---|---|
| GET `/api/v6/dex/market/supported/chain` | free |
| POST `/api/v6/dex/market/price` | basic |
| POST `/api/v6/dex/index/current-price` | free |
| GET `/api/v6/dex/market/candles` | basic |
| GET `/api/v6/dex/market/historical-candles` | premium |
| GET `/api/v6/dex/market/trades` | basic |
| GET `/api/v6/dex/index/historical-price` | free |
| GET `/api/v6/dex/market/token/search` | basic |
| POST `/api/v6/dex/market/token/basic-info` | basic |
| POST `/api/v6/dex/market/price-info` | premium |
| GET `/api/v6/dex/market/token/advanced-info` | premium |
| GET `/api/v6/dex/market/token/holder` | premium |
| GET `/api/v6/dex/market/token/top-liquidity` | basic |
| GET `/api/v6/dex/market/token/hot-token` | basic |
| GET `/api/v6/dex/market/token/top-trader` | premium |
| GET `/api/v6/dex/market/token/cluster/supported/chain` | free |
| GET `/api/v6/dex/market/token/cluster/overview` | premium |
| GET `/api/v6/dex/market/token/cluster/list` | premium |
| GET `/api/v6/dex/market/token/cluster/top-holders` | premium |
| GET `/api/v6/dex/market/signal/supported/chain` | free |
| POST `/api/v6/dex/market/signal/list` | premium |
| GET `/api/v6/dex/market/leaderboard/supported/chain` | free |
| GET `/api/v6/dex/market/leaderboard/list` | premium |
| GET `/api/v6/dex/market/social/sentiment/symbol` | unknown |
| GET `/api/v6/dex/market/social/vibe/timeline` | unknown |
| GET `/api/v6/dex/market/social/vibe/top-kols` | unknown |
| GET `/api/v6/dex/pre-transaction/supported/chain` | unknown |
| GET `/api/v6/dex/pre-transaction/gas-price` | unknown |
| GET `/api/v6/defi/product/supported-chains` | unknown |
| GET `/api/v6/defi/product/supported-platforms` | unknown |
| POST `/api/v6/defi/product/search` | unknown |
| GET `/api/v6/defi/product/detail` | unknown |
| GET `/api/v6/defi/product/rate/chart` | unknown |
| GET `/api/v6/defi/product/tvl/chart` | unknown |
| GET `/api/v6/defi/product/depth-price/chart` | unknown |
| GET `/api/v5/public/instruments` | public, 20/2s |
| GET `/api/v5/public/funding-rate` | public, 10/2s |
| GET `/api/v5/public/funding-rate-history` | public, 10/2s |
| GET `/api/v5/public/mark-price` | public, 10/2s |
| GET `/api/v5/public/open-interest` | public, 20/2s |
| GET `/api/v5/market/ticker` | public, 20/2s |
| GET `/api/v5/market/candles` | public, 40/2s |
| GET `/api/v5/market/history-candles` | public, 20/2s |
| GET `/api/v5/market/books` | public, 40/2s |

Public v5 per-2s values are source registry references to official endpoint docs; not quotas of OnchainOS Basic/Premium. `src/okx-wallet/trade.ts` is explicitly signed GET/POST to `web3.okx.com` paths for DEX quote/swap-build/approve/gas, cross-chain build and DeFi product/exit; its source comment explicitly says it does not sign or broadcast a transaction. Do not label it exchange trading/broadcast.
Agent-used OnchainOS paths: GET `/api/v6/dex/market/token/hot-token` (`source-ecosystem.ts`), POST `/api/v6/dex/market/signal/list`, GET `/api/v6/dex/market/token/advanced-info`, GET `/api/v6/dex/market/candles`, POST `/api/v6/dex/market/price-info` (`src/agent/live.ts`), POST `/api/v6/dex/market/price` (`src/agent/wire.ts`). These correspond to `/onchain/hot-tokens`, `/onchain/signals`, `/onchain/token-risk`, `/onchain/candles`, `/onchain/price-info`, `/onchain/price` in the route table. Active-agent public OKX V5 calls are GET `/api/v5/market/candles`, `/api/v5/public/funding-rate`, `/api/v5/public/open-interest` via `okxPublicCandles` / `okxPublicDerivatives` in `src/agent/live.ts`; other V5 paths in the registry are not agent calls (capture/utility availability only).

## package.json public command surface

Root `package.json` command surface (all 40 scripts; command labels and exact entrypoint/args from the package). Entries that use `data/*.env` are identified only as configured commands; no env file was read or command run.

| Script | Exact command / entrypoint | Surface / classification |
|---|---|---|
| `start` | `bun run src/index.ts` | primary trader/service entrypoint |
| `dev` | `bun --watch run src/index.ts` | watched trader/service entrypoint |
| `preview:http` | `bun --no-env-file run scripts/http-preview.ts` | isolated read-only HTTP preview |
| `doctor` | `bun run scripts/doctor.ts` | diagnostics CLI |
| `qualify:live` | `bun run scripts/qualify-live.ts` | live qualification utility |
| `policy:envelope` | `bun --no-env-file run scripts/policy-envelope.ts` | envelope utility |
| `jev:lab` | `bun --no-env-file run scripts/jev-lab.ts` | JEV lab utility |
| `jev:lab:plan` | `bun --no-env-file run scripts/jev-lab-real.ts plan` | planning mode |
| `jev:lab:real` | `bun --no-env-file --env-file=data/jev.env run scripts/jev-lab-real.ts` | real lab command; not run |
| `test:lab` | `bun --no-env-file test src/lab src/lab-jev scripts/jev-lab.test.ts scripts/jev-lab.deps.test.ts scripts/jev-lab-real.test.ts` | published test command |
| `onchainos:capture` | `bun --no-env-file run scripts/onchainos-capture.ts` | capture utility |
| `onchainos:capture:env` | `bun --no-env-file --env-file=data/onchainos.env run scripts/onchainos-capture.ts` | capture with env; not run |
| `capture` | `bun run scripts/capture.ts` | data capture utility |
| `backtest` | `bun run scripts/backtest.ts` | backtest utility |
| `test` | `bun --no-env-file test --parallel=1 --timeout 15000 ./src ./scripts` | published test command |
| `test:all` | `bun --no-env-file run test && bun --no-env-file run --cwd web test` | published full test command |
| `typecheck` | `tsc --noEmit -p tsconfig.verification.json` | published typecheck |
| `typecheck:all` | `bun --no-env-file run typecheck && bun --no-env-file run --cwd web typecheck` | published full typecheck |
| `build:desktop` | `bun --no-env-file run scripts/build-desktop.ts` | desktop packaging |
| `desktop:smoke` | `bun --no-env-file run scripts/desktop-smoke.ts` | desktop smoke utility |
| `desktop:provision` | `bun --no-env-file run scripts/provision.ts` | desktop provisioning |
| `build` | `bun --no-env-file run --cwd web build` | web build |
| `okx:market-scan` | `bun --no-env-file run scripts/okx-market-scan.ts` | OKX read/signal CLI |
| `okx:dex-quote` | `bun --no-env-file run scripts/okx-dex-quote.ts` | DEX quote utility |
| `okx:signals` | `bun --no-env-file run scripts/okx-signals.ts` | signal read utility |
| `okx:evidence` | `bun --no-env-file run scripts/okx-evidence.ts` | evidence read utility |
| `okx:defi` | `bun --no-env-file run scripts/okx-defi.ts` | DeFi read utility |
| `okx:derivatives` | `bun --no-env-file run scripts/okx-derivatives.ts` | derivatives read utility |
| `okx:operator` | `bun --no-env-file run scripts/okx-operator.ts` | operator utility |
| `system-one` | `bun --no-env-file run scripts/system-one.ts` | System One standalone entrypoint |
| `jev-read` | `bun --no-env-file run scripts/jev-read.ts` | Jev-read standalone entrypoint |
| `analytics` | `bun --no-env-file run scripts/jev-analytics.ts run` | recurring analytics |
| `analytics:once` | `bun --no-env-file run scripts/jev-analytics.ts once` | one-shot analytics |
| `analytics:test` | `bun --no-env-file run scripts/jev-analytics.ts test` | published analytics test command |
| `real:console` | `bun --no-env-file run scripts/real-console.ts` | separate real console |
| `real:start` | `bun --no-env-file run scripts/real-start.ts` | separate real runner; not run |
| `real:doctor` | `bun --no-env-file run scripts/real-doctor.ts` | real pipeline diagnostics |
| `reports:serve` | `bun --no-env-file --no-install scripts/reports-server.ts` | reports service |
| `pilot` | `bun --no-env-file run scripts/gev-wallet-pilot.ts` | wallet pilot utility |
| `pilot:fixture` | `bun --no-env-file run scripts/gev-wallet-pilot-fixture.ts --fixture` | fixture-mode pilot utility |

`web/package.json`: `dev`, `build`, `start`, `test`, `typecheck` (five commands); UI pages are `/` and `/configuracoes`. CLI names mean the command is published in package metadata, not that it is active in a running process.

## Provider / outbound callsite corrections

| Provider | Code callsites | Auth/use | official limit evidence |
|---|---|---|---|
| TypeSafe AI (`@ai-sdk/typesafe-ai`, `src/agent/model.ts`) | `createTypeSafeAi` + `experimental_evaluate`; same adapter referenced by System One and “Pedir ao Inonu” in source comments | API key supplied from vault getter; model eval | docs [TypeSafe models](https://docs.typesafe.ai/models) source pricing only; request quota/RPM for JEV model not verified; docs searched, no published JEV-specific quota found |
| OKX public V5 (`src/onchainos/public-okx.ts`, `src/agent/live.ts`) | funding, open interest, candles and registered market endpoints | no auth for public reads | official docs linked per route in `src/onchainos/endpoints.ts`, per-endpoint 2s source limits above; docs: https://www.okx.com/docs-v5/en/#rest-api-public-data |
| OKX OnchainOS REST (`src/onchainos/http.ts`, `src/onchain-read/client.ts`, `src/okx-wallet/trade.ts`) | web3.okx.com v6/v5 endpoints above | signed REST key; `trade.ts` requests disabled unless `allowLiveRequests:true` and only allowlisted GET/POST; no broadcast by adapter | official [DEX API Fee tiers](https://web3.okx.com/es-es/onchainos/dev-docs/trade/api-fee), opened 2026-10-16: DEX Trial 1 RPS default/5 after approval for 60 days; Start-up 2-50 RPS; Enterprise custom. This is DEX module partner tier, NOT free/basic/premium per-endpoint classification. Basic/Premium route tiers are catalog/product entitlements; public docs page does not establish universal endpoint quotas. |
| Agentic Wallet CLI (`src/agent/agent-wallet.ts`, `cli.ts`) | installer validates/downloads pinned CLI; service calls its subprocess; `cli.ts` local allowlist covers wallet status/balance/addresses/history/login, swap quote and swap execute | browser login/session/TEE; execution command path requires local user confirmation | official install + skills pages below; no numeric CLI/`priapi` RPS published on reviewed pages |
| Monad public RPC (`src/config.ts`, `src/chain.ts`, `src/book.ts`, `src/real/rpc-read.ts`) | `https://rpc.monad.xyz` default for legacy EVM clients; real read-only client uses it for chain IDs 143 methods `eth_chainId`, `eth_getBlockByNumber`, `eth_getBalance`, `eth_getCode`, `eth_call`; Kuru legacy path also uses the Monad RPC | public JSON-RPC reads; legacy trader also has separate order execution | official [Monad mainnet network information](https://docs.monad.xyz/developer-essentials/network-information), opened 2026-10-16: `rpc.monad.xyz` QuickNode 25 RPS, batch max 100. These limits belong to this public RPC, not OnchainOS |
| X Layer public RPC (`src/real/config.ts`, `src/real/rpc-read.ts`) | `https://rpc.xlayer.tech`, chain 196; real read-only client methods listed above | dedicated real qualification/read path, not AgentView active use | official [X Layer RPC endpoints](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/rpc-endpoints/rpc-endpoints), opened 2026-10-16: 100 requests/sec/IP, mainnet and testnet; this is RPC not SaaS REST |
| Kuru/Monad (`@kuru-labs/kuru-sdk`, `src/config.ts`, `src/trader.ts`) | legacy Kuru market/strategy path; Monad public RPC default as above | utility/legacy strategy wiring; not established as active JEV agent or web root consumer | official [Kuru docs](https://docs.kuru.io/) opened; describe DEX/SDK, no numeric SDK/API quota located there; Monad RPC limit is separately documented above |
| TypeSafe AI (`@ai-sdk/typesafe-ai`, `src/agent/model.ts`) | `createTypeSafeAi` / `experimental_evaluate`; agent model callsite and separate System One/analytics/model consumers | API key fetched from vault getter; model requests only from caller execution | official [TypeSafe models](https://docs.typesafe.ai/models); docs cover models/pricing, not JEV model RPM/quota; quota unknown |
Outbound catalog detail: `src/onchainos/endpoints.ts` records exact registered OKX REST methods/paths/tier and public V5 per-endpoint limits. Actual agent use is the distinct code callsite set at lines 32-34 and `live.ts`/`wire.ts`; other registry entries are available, not evidence of agent usage. Third-party RPC quota is separate from OKX plans.

## Official Agentic Wallet and plan references actually opened

- [Install Your Agentic Wallet](https://web3.okx.com/fi/onchainos/dev-docs/home/install-your-agentic-wallet): install/login flow; email/social authentication and same-account wallet restoration; TEE claims.
- [Agentic Wallet skills](https://web3.okx.com/pt/onchainos/dev-docs/wallet/agentic-wallet-skills): documented CLI skills/commands. Source-level detail differs from local allowlist: presence in upstream docs does not mean this app invokes them.
- [API access and usage](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage): Open API HMAC auth and separate Agentic Wallet identity/login. This page provides no CLI request rate.
- [Developer Portal](https://web3.okx.com/onchainos/dev-docs/home/developer-portal): max 3 projects per developer account, max 3 API keys per project, email/phone verification; not a request quota.
- [Trade API Fee tiers](https://web3.okx.com/es-es/onchainos/dev-docs/trade/api-fee): opened directly; DEX API tier info above, not Basic/Premium route plan.


## Rotas adicionais e funcionalidades da API

O roteador geral usa os métodos e paths exatos abaixo; composição/consumidor e guardas são descritos ao lado. Rotas de diagnóstico são locais; catálogo onchain GET pode despachar provider.

| HTTP method + path | File/symbol | Upstream | tier/cache | Consumer/status |
|---|---|---|---|---|
| GET `/onchain/networks` | `src/onchain-read/routes/chain-list.ts:CHAIN_LIST_ENDPOINTS` | GET `/api/v6/dex/balance/supported/chain` | free/24h | network picker |
| GET `/onchain/wallet-value` | `routes/wallet.ts:WALLET_ENDPOINTS` | GET `/api/v6/dex/balance/total-value-by-address` | free/60s | connected wallet portfolio |
| GET `/onchain/wallet-balances` | same | GET `/api/v6/dex/balance/all-token-balances-by-address` | free/30s | connected wallet |
| GET `/onchain/wallet-history` | same | GET `/api/v6/dex/post-transaction/transactions-by-address` | free/120s | connected wallet history |
| GET `/onchain/wallet-token-pnl` | same | GET `/api/v6/dex/market/portfolio/token/latest-pnl` | basic/300s | portfolio |
| GET `/onchain/wallet-overview` | same | GET `/api/v6/dex/market/portfolio/overview` | premium/600s | portfolio |
| GET `/onchain/wallet-pnl` | same | GET `/api/v6/dex/market/portfolio/recent-pnl` | premium/300s | portfolio |
| GET `/onchain/cluster-list` | `routes/clusters-detail.ts:CLUSTER_DETAIL_ENDPOINTS` | GET `/api/v6/dex/market/token/cluster/list` | premium/900s | on-demand cluster detail |
| GET `/onchain/address-tracker-trades` | `routes/address-tracker.ts:ADDRESS_TRACKER_ENDPOINTS` | GET `/api/v6/dex/market/address-tracker/trades` | premium (local assumed; provider tier unknown)/30s | on-demand tracker |
| GET `/onchain/memepump-list` | `routes/memepump.ts:MEMEPUMP_ENDPOINTS` | GET `/api/v6/dex/market/memepump/tokenList` | premium (local assumed; provider tier unknown)/30s | on-demand launches |
| GET `/onchain/swap` | `routes/trade.ts:TRADE_ENDPOINTS` | GET `/api/v6/dex/aggregator/swap` | basic (local assumed; provider tier unknown)/uncached | browser returns tx data for wallet user confirmation |
| GET `/onchain/approve` | same | GET `/api/v6/dex/aggregator/approve-transaction` | basic (local assumed; provider tier unknown)/uncached | browser returns tx data for wallet user confirmation |

`/onchain/swap` and `/onchain/approve` are transaction-building endpoints: the gateway itself does not sign/broadcast; wallet extension signs and sends only after person click (`src/onchain-read/routes/trade.ts` comment). That is distinct from Agentic Wallet's TEE signing/sending capability. Gateway routes are loopback app APIs, not unauthenticated internet services; CORS/origin checks in `src/onchain-read/http.ts`.

| Method + path | File/symbol | Consumer/status |
|---|---|---|
| GET `/operator` | `src/operator/http.ts` | local dashboard state, optional Bearer `OPERATOR_READ_TOKEN` |
| GET `/operator/history?limit=` | same | local cycles, default 50/cap 500, optional Bearer |
| GET `/operator/insights` | same | local insights, optional Bearer |
| GET `/system-one` | `src/system-one/http.ts` | local state snapshot, optional Bearer |
| GET `/jev-read` | `src/jev-read/http.ts` | local board snapshot, optional Bearer |
| GET `/settings` | `src/settings/http.ts` | local settings/status |
| PUT `/settings/secrets` | same | user settings UI writes secret to vault; protected origin/write limiter |
| DELETE `/settings/secrets/{id}` | same | user settings UI |
| PUT `/settings/prefs` | same | user settings UI |
| POST `/settings/test/onchainos` | same | tests configured OnchainOS credential (network probe; not run in this audit) |
| POST `/settings/test/jev` | same | reports key presence/format only, `tested:false`; no model request |
| GET `/onchain/budget`, GET `/onchain/status` | `src/onchain-read/http.ts` | UI diagnostics; local |
| GET each exact local route listed in the onchain route tables above | `src/onchain-read/http.ts` dispatch + `catalog.ts` | local endpoint methods/paths enumerated above |
| POST/PUT/DELETE any above not specified | respective router | 405/not found; OPTIONS preflight |
| GET `/health`, `/operator`, `/operator/history`, `/operator/insights` | `src/dashboard/reports-server.ts` | report service; optional local read token where configured |


## Funcionalidades: estado atual do código versus plano

| Funcionalidade | Implementação confirmada / vínculo | Estado |
|---|---|---|
| Scheduler single-flight | `src/agent/scheduler.ts:createScheduler`: um chain timer, ciclo compartilhado entre chamadas simultâneas, `runNow`/event cycle, guard de posição sem overlap, espera `before`/`after`, start explícito pelo host | implementado no agente; não prova scheduler iniciado no runtime |
| Owner, recuperação e estado | `src/agent/lock.ts:acquireAgentLock` exclusividade por data folder; PID vivo impede outro ciclo, owner stale pode ser removido; `state.ts` persistência de conexão/stop/circuit breaker; `wire.ts` guarda config/ledger/mandate/plans/fees/scoreboard/equity e health | implementado em código; dados operacionais não inspecionados |
| Mandato, envelope, guards e pendências | `mandate.ts` closed options e avanço de um nível/ciclo; `cycle.ts` valida limites e decisões; `execution-guards.ts` e `autopilot.ts` limitam execução; ledger mantém in-flight/uncertain order e recovery/resolve; pending buys impedem duplicidade | implementado; não executado nesta auditoria |
| Placar, trips, custos e resultado | `scoreboard.ts` liquida 15m/1h/4h/24h por preços de fim, mede decisão contra manter, exclui overlap, desconhecidos não viram zero e net só com custo conhecido; `fills.ts`/settlement registram custo realizado quando disponível. Quotes de ordem mantêm custo estimado separado do realizado | placar implementado; resultado líquido depende de fonte/custos conhecidos; não significa desempenho financeiro medido nesta sessão |
| Lab / capture / backtest | `src/lab/*`, `scripts/jev-lab*.ts`, `scripts/capture.ts`, `scripts/onchainos-capture.ts`, `scripts/backtest.ts` e `src/backtest.ts` | utilitários publicados, não UI root/execução do agente; scripts de modo real não executados |
| Autoresearch | `scripts/autoresearch/candidate.ts:createCandidatePolicy` calcula score offline de histórico, penalizado por custo, funding e volatilidade; não é previsão nem inferência JEV. O scan de callers encontrou `scripts/autoresearch/workload.ts` e `scripts/autoresearch/workload.test.ts`, sem símbolo/import em `src/`, `src/agent/` ou `web/` | utilitário offline implementado; nenhum callsite no agente ativo/UI; não executado nesta sessão |
| Desktop | `src/desktop/handlers.ts` e packaging/provisioning scripts | superfície desktop separada; não é rota web nem AgentView |
| Real console/pipeline | `src/real/server.ts`, `src/real/config.ts`, scripts `real:*`; default `executionEnabled:false`, mode paper, RPC reads qualificação separada | implementação separada; `real:start` não executado; não confundir como AgentView active |
| System One standalone / risco / non-exec | `scripts/system-one.ts`, `src/system-one/*`, `src/jev-read/*`; diagnóstico/read-only snapshots; `src/real/rpc-read.ts` retorna `executionEnabled:false`, `financiallyQualified:false`, mode unverified | utilities/standalone; não é prova de decisão/trade ou uso do agente |
| Inteligência no contexto JEV | `src/agent/live.ts:createTimingReader` fornece idade a partir do início da última barra; `src/agent/model.ts:timingBrief` mapeia `tm.ag` e `LEGEND.ag` define idade de price-info/cache do holding, não idade do saldo nem prova de frescor de todas as entradas; o shortlist do produtor é de oito holdings e sete compras, com orçamento de referência de 12.000 bytes registrado em `model.ts:21` e afirmado por testes, sem truncamento runtime; `src/agent/cycle.ts:materialBrief` exclui apenas `mo.ag` e `tm.ag` finitos da chave de repetição, mantendo ausência e expiração materiais; `src/agent/analysis.ts:buildCycleReviews` e `buildAnalysis` criam revisão limitada a 120 ciclos; `src/agent/http.ts:createAgentHandler` pagina; `CycleReviewPanel` e `AgentView` mostram a página na HUD ativa | implementado e exercitado por cenários isolados de ciclo, handler, parser e browser local; sem novas consultas upstream ou dados privados adicionais; não prova estado conectado/live |

Planos SDD antigos (`docs/sdd/agente-autonomo/TASKS.md`, `docs/sdd/carteira-evidencia/tasks.md`) são registros históricos. Foram comparados com os callsites atuais; o estado “não iniciado” nesses documentos não é usado sozinho como prova de falta presente.



## Source limitation, not a TODO

Páginas oficiais abertas: OKX API access/usage, Agentic Wallet install/skills, DEX fee tiers, developer portal, V5 REST, X Layer RPC, Monad mainnet network information e Kuru docs. Quotas numericamente publicadas e aplicáveis: DEX Trial/Start-up/Enterprise somente ao módulo DEX descrito; Monad `rpc.monad.xyz` 25 RPS/lote 100; X Layer public RPC 100 req/s/IP. OnchainOS endpoint Free/Basic/Premium (fora do DEX fee tier), Agentic Wallet CLI/`/priapi`, TypeSafe AI request RPM e Kuru SDK/API quotas permanecem desconhecidas nas fontes abertas. Nenhuma conta/plano/consumo real foi inspecionado.

## Fontes efetivamente consumidas pelo ciclo e pelo HUD raiz

Escopo confirmado pelo código, não pelo estado de deploy: `web/src/app/page.tsx` monta `AgentView`; no fluxo operacional, `web/src/components/Agent/AgentView.tsx` consulta `GET /agent/status` e, quando conectado, `GET /agent/analysis` (ver tabela de rotas e `src/agent/http.ts:createAgentHandler`). O poll de status da UI é de 6 s, mas não corresponde a uma leitura de carteira por poll: a rota de status pode iniciar ou compartilhar o refresh de Book de 30 s. Timer, cache e single-flight não demonstram ausência de leitura inicial nem redução do volume total. O agente recebe suas fontes pela composição de `src/agent/wire.ts` e pelo `source` montado em `src/desktop/handlers.ts` / `src/server/cloud-runtime.ts`. Pontos injetáveis de teste/host podem substituir esses defaults. Nenhum GET de produção foi autorizado ou realizado.

| Fonte e rota observada | Uso no agente ativo / normalização | Idade, frescor e limites observados |
|---|---|---|
| OKX portfolio API, GET `/api/v6/dex/balance/all-token-balances-by-address` (`src/okx-wallet/portfolio.ts:createOkxPortfolioClient`) | `src/agent/wire.ts` usa `allTokenBalances` como `BalanceSource`; `createBookReader` normaliza as carteiras gerida/observada e compartilha cache entre ciclos, refresh backend e status. Com serviço iniciado e carteira gerida configurada, um timer read-only chama o mesmo reader a cada 30 s; `GET /agent/status` pode iniciar ou compartilhar esse refresh, não implica uma leitura por cada poll de 6 s. Cache/single-flight/timer não demonstram ausência de chamada inicial nem volume geral menor. | `RawTokenAsset` não fornece timestamp do provedor. `Book.observedAtMs` é horário local de observação, não prova frescor upstream. Falha mantém o último snapshot verificado com quality stale; credenciais, endpoint e leitor de saldo existentes são preservados. Quota/custo da API e timestamp upstream são desconhecidos; intervalo de 30 s é somente a cadência aprovada, não quota oficial. |
| OnchainOS hot tokens + signals: local `/onchain/hot-tokens`, `/onchain/signals`; upstream `/api/v6/dex/market/token/hot-token`, `/api/v6/dex/market/signal/list` | `src/inonu/source-ecosystem.ts:createEcosystemSource` consulta cada chain selecionada (`timeFrame=4`, limites 100); normaliza e valida os candidatos/sinais antes do ranking. Só consome sinais não marcados stale; a lista hot inválida/stale não sustenta a leitura. | Usa `meta.ageMs`/`meta.stale` do gateway e registra idade da fonte hot no brief; metadados de gateway/cache não são timestamp do provedor. `src/agent/wire.ts` passa teto observado de 15 chamadas OnchainOS para esse build. |
| OnchainOS token risk: `/onchain/token-risk` → `/api/v6/dex/market/token/advanced-info` | `source-ecosystem.ts` consulta risco dos candidatos ranqueados; `src/agent/live.ts:createHoldingFactsReader` lê risco de holdings. Digest valida nível/flags; resposta stale não é evidência verificada nem entra em fatos utilizáveis. | Gateway pode fornecer `ageMs`/`stale`; cache local de risco de holdings até 6 h. Sem timestamp de provedor declarado, não inferir frescor do payload. |
| OnchainOS price-info: `/onchain/price-info` → `/api/v6/dex/market/price-info` | `createHoldingFactsReader` normaliza preço, variações, liquidez, volume e transações para holdings selecionados; resposta stale não vira fato de holding. | Usa `tsMs` do payload quando presente e `meta.ageMs` do gateway quando positivo, acrescidos do tempo em cache local (info: 2 min com plano, 10 min acionável, até 60 min para dust). `dataAgeMin` usa a maior idade disponível; se `tsMs` faltar, não atribui frescor de provedor. |
| OnchainOS candles: `/onchain/candles` → `/api/v6/dex/market/candles` | `src/agent/live.ts` normaliza `ts`/OHLC/`confirmed`: barras 1H (60) para timing e 5m (24) para momentum dos candidatos. Ambos rejeitam `meta.stale=true`; timing/momentum também limitam dados pelo timestamp da barra. `wire.ts:createPriceLookup` usa candles confirmados 5m/1H para preços de fim de janela do placar (limite 299). | Cache local de timing é 10 min; momentum tem base 5 min e TTL de 2 min no agente (falhas retidas 2 min/1 min). `createPriceLookup` mantém candles até 30 min, no máximo 64 chaves, para consultar a barra confirmada correspondente ao horário do settlement; esse uso histórico é separado das evidências de timing/momentum. São candles OnchainOS, distintos dos candles públicos OKX abaixo. |
| OnchainOS price: `/onchain/price` → `/api/v6/dex/market/price` | `src/agent/wire.ts` aceita `data[0].price` somente quando numérico, finito, positivo e a resposta não está stale; resposta inválida/stale é tratada como indisponível. | Callback não propaga timestamp do payload nem metadados de idade; não afirmar idade/frescor upstream para cotações aceitas. |
| OKX público candles: `/api/v5/market/candles` | `okxPublicCandles` em `src/agent/live.ts` lê BTC-USDT e ETH-USDT 1H (72); normaliza timestamp, OHLC, volume e confirmação para retornos e volatilidade no contexto do agente. Não é `/onchain/candles`. | Timestamp/confirm da barra são preservados para seleção/cálculo, mas o `MarketContext` não expõe idade das barras ao status/HUD. |
| OKX público funding e open interest: `/api/v5/public/funding-rate`, `/api/v5/public/open-interest` | `okxPublicDerivatives` é consumidor separado dos candles; normaliza `fundingRate` e `oiUsd` para funding BTC e amostras de OI no contexto. | Parsers retêm números, não timestamp do endpoint. O delta de OI usa horário local das amostras colhidas em refresh; não é idade do dado do provedor. Os limites por endpoint V5 na tabela registry são referências documentais, não quota medida da conta. |
| Arquivo local `data/system-one/latest.json` (ou caminho injetado) | `src/agent/wire.ts` fornece ao market context o snapshot local; `src/agent/live.ts:createMarketContext` aceita dados não sintéticos somente quando `completedAtMs` está entre agora e 30 min atrás, e não projeta nenhum campo `s1_*` quando `brief.market.source` ou `brief.wallet.source` é exatamente `synthetic`. Fontes declaradas não sintéticas e registros sem `source` mantêm o comportamento anterior. | Idade derivada de `completedAtMs` local no conteúdo; não é feed de mercado nem chamada de API. A leitura/ingestão runtime desse arquivo não foi verificada nesta alteração; cobertura é por fixtures sintéticas locais.

O HUD raiz não consulta esses provedores diretamente: `AgentView` envia status/análise a `HudView` e `web/src/lib/hud/model.ts:buildHudModel`. A carteira exibida vem de `status.book` (totais, cash, posições, `observedAtMs` e quality), equity de `status.performance.series`, BTC/ETH/tendência de `status.context`, e ciclos/eventos de ledger/status; painéis de estudo vêm de `GET /agent/analysis`. `snapshotAtMs` e idade de recursos no modelo HUD usam relógio local da UI. Falha no poll marca valores anteriores como stale, não atualiza dados do provedor.

### Registry e superfícies que não equivalem a uso ativo

As chamadas ativas acima são o subconjunto confirmado pelos callsites do ciclo; **não** classificar as 44 entradas de `src/onchainos/endpoints.ts` como feeds do agente. As demais linhas desse catálogo — por exemplo, busca/basic-info, holder/top-liquidity/top-trader, clusters, social, pre-transaction, DeFi, funding history, mark-price, ticker, instruments, history-candles e books — não são chamadas do ciclo ativo listadas acima; algumas têm rotas locais, consumers de utilitário/capture ou superfícies opcionais documentadas nas tabelas anteriores. A presença no registry/API catalog, isoladamente, não estabelece montagem, chamada pela raiz ou uso pelo agente. Rotas de wallet/dados, UI de configurações, desenvolvimento/read-only, `AgentScreen`/Deck/Mesa e servidores desktop/real são superfícies distintas ou condicionais, não entradas adicionais inferidas para o HUD raiz. Outros V5 públicos não listados como chamados acima não são feeds do agente.

### Fixtures, placeholders, configuração e regras deliberadas

| Categoria | Evidência / interpretação |
|---|---|
| Fixture ou exemplo offline | `src/okx-wallet/portfolio.ts:syntheticInventory` declara explicitamente inventário determinístico para demos/testes, nunca carteira real; exemplos em testes de `src/agent/*` e `web/src/lib/hud/hud.test.ts` não são saldos/fatos de produção. `web/src/lib/hud/parse-analysis.ts:EMPTY_ANALYSIS` preenche campos vazios/zero quando análise falta; `buildHudModel` sinaliza `analysisOk=false`, portanto esses zeros não são medições. |
| Configuração do usuário | Endereços de carteira gerenciada/observada, chains e modo vêm do config store usado por `wire.ts`/`createBookReader`; credenciais OKX/modelo vêm do armazenamento de credenciais. São parâmetros de seleção/acesso, não valores de saldo de exemplo. |
| Constantes de regra/segurança | `src/agent/book.ts` usa allowlist de contratos e faixa de reconhecimento de stablecoin; `src/agent/live.ts` tem limites de seleção de holdings (US$ 5–1.000.000), e `source-ecosystem.ts` tem defaults de chains/ranking. São regras/limites explícitos de segurança, consulta ou configuração, não dados dinâmicos que devam ser tratados como placeholders. Cadências e caches citados acima também são comportamento local, não frescor do provedor. |

**Desconhecido:** throttling/quota efetivos por credencial/conta OnchainOS, limites da API OKX de saldo e uso real não foram observados. Os valores públicos V5 citados no registry são apenas referências documentais dos endpoints correspondentes; não estabelecem quota da conta nem throughput observado. Também não há timestamp do provedor no `Book`, nem timestamp exposto pelos parsers de funding/OI.
