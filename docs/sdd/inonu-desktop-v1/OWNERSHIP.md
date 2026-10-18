# OWNERSHIP - quem edita o quê

Instantâneo de 2026-10-12, HEAD `00a593b`, branch `main`. No primeiro instantâneo (lista em [evidence/git-status-2026-10-12.txt](evidence/git-status-2026-10-12.txt)): 111 entradas, 1 delas desta pasta, ou seja **110 de outras sessões** (eram 108 no início da sessão). Depois de a implementação começar (22 h): 131 entradas, **21 desta sessão** (lista na seção 5) e as mesmas **110 de outras sessões**, sem arquivos novos delas desde então. Lista completa em [evidence/git-status-2026-10-12.txt](evidence/git-status-2026-10-12.txt). Segundo worktree: `C:/Users/gabri/jev-trader-main` (detached `3b695ed`), **não** removê-lo.

Este arquivo é um registro de leitura, não concede autorização. Sessões que escrevem em paralelo não podem ser instruídas por esta; por isso cada tarefa de código usa **zona livre** ou passa por um **integrador** depois de conferir `git status --short -- <caminho>` nas duas árvores.

## 1. Agrupamento das 110 entradas de outras sessões

| Grupo (caminho) | Entradas | Dono provável (inferência por conteúdo) | Observação |
| --- | --- | --- | --- |
| `web/src` (Desk, lib/desk, lib/mesa, lib/onchain, lib/settings, app/configuracoes, components/Settings) | 60 | sessão de `config-onchain-smartmoney` e `grafico-jev` | quente: gráfico, painel inferior, configurações, cliente do gateway |
| `src/portfolio-evidence` | 22 | sessão de `carteira-evidencia` (GOAL 2) | não tocar |
| `src/jev-read` e `scripts/jev-read.ts`, `scripts/jev-analytics.ts`, `python/` | 15 | sessão de `grafico-jev` | pacote Python e validador de análise |
| `docs/portfolio-evidence-v1` | 3 | `carteira-evidencia` | não tocar |
| `src/settings`, `src/onchain-read`, `src/server.ts` | 3 | `config-onchain-smartmoney` | gateway e configurações; E7 aberta |
| `docs/sdd/config-onchain-smartmoney`, `docs/sdd/grafico-jev` | 2 | idem | documentos que este SPEC referencia |
| `package.json`, `README.md`, `.env.example`, `scripts/make-onchain-web-fixtures.ts`, `.playwright-mcp/` | 5 | idem | `package.json` é compartilhado |

Pelo registro da memória do projeto, o código de `src/portfolio-evidence/**` foi entregue "como está" por decisão do usuário e a quarta revisão e o commit ficaram com ele; não tocar.

## 2. Zonas (herdadas de [carteira-evidencia design 2.4](../carteira-evidencia/design.md), conferidas em 2026-10-12)

| Zona | Caminhos | Regra para este SPEC |
| --- | --- | --- |
| Z1 | `src/jev-read/**`, `scripts/jev-read.ts`, `src/server.ts` | quente; só integrador |
| Z2 | `src/mobile-decision-report/**` | não tocar |
| Z3 | `src/real/**`, `scripts/real-*.ts`, `web/src/lib/{okx-wallet,useOkxWallet,wallet-store,real-pipeline*}.ts`, `web/src/app/page.tsx` | reaproveitar sem editar (WAL usa `web/src/lib/wallet/` novo) |
| Z4 | `src/okx-wallet/valuation-diagnostics*` | não tocar; o resto de `src/okx-wallet/*` (portfolio, trade) foi editado em uma linha por T3.2, e o diagnóstico de valuation ficou intacto |
| Z5 | `src/onchainos/**`, `docs/research/**` | T3.2 não precisou editar `src/onchainos/http.ts` (o chamador injeta `okxNowMs`); nada de Z5 foi alterado |
| Z6 | `web/src/components/{Rail,SystemOne,DecisionCenter,CommandCenter}`, `src/okx-evidence/**` | não tocar |
| Z7 | `src/operator/**`, `scripts/okx-operator.ts` | não tocar |
| Z8 | `web/src/components/Desk/**`, `web/src/lib/mesa/**`, `web/src/lib/jev-read.ts` | quente hoje; só integrador, de forma aditiva |
| Livre | `docs/sdd/inonu-desktop-v1/**`, e as pastas **novas** abaixo | uso desta entrega |

**Escritas em paralelo por outra sessão dentro de pastas desta entrega (2026-10-13):** a sessão da Fase 2 on-chain ([config-onchain-smartmoney/fase-2](../config-onchain-smartmoney/fase-2/README.md)) escreve rotas novas em `src/onchain-read/**` e o digest do token em `src/intel/onchain-*.ts` (arquivos novos, com testes próprios). Esta sessão não os edita; os arquivos de `src/intel/` que ela escreveu (`analyst.ts`, `brief.ts`, `candidates.ts`, `trail.ts`...) continuam sendo os de c38db1.

Pastas novas desta entrega (livres, não existem hoje): `src/desktop/`, `src/intel/`, `src/inonu/`, `installer/`, `web/src/lib/rastreador/`, `web/src/lib/wallet/`, `web/src/app/rastreador/`, `web/src/app/doctor/`, `scripts/research/`.

## 3. Arquivos que as tarefas tocam e situação em 2026-10-12

| Arquivo ou pasta | Situação | Tarefas | Tratamento |
| --- | --- | --- | --- |
| `src/server.ts` | SUJO | T1.4, T7.3 | **resolvido**: `src/desktop/core.ts` tem o próprio `Bun.serve` em loopback e monta os mesmos manipuladores (`src/desktop/handlers.ts`); `startServer` não é composável (um `Bun.serve` fixo, sem hostname fora do preview, sem rota estática, `require('./config')` do Kuru) e não é usado nem editado |
| `src/settings/http.ts`, `src/settings/store.ts` | SUJO (novos) | T1.6, T2.1 | integrador; ou camada nova `vault.ts` que o `store.ts` consome por injeção |
| `src/onchain-read/http.ts`, `catalog.ts` | SUJO (novos) | T1.6, T3.3 | arquivos novos ao lado (`normalize/*.ts`, `governor.ts`, `logos.ts`, `chains.ts`); edição de `http.ts` pelo integrador |
| `web/src/lib/wallet/holdings*.ts(x)`, `web/src/components/Desk/Dock/HoldingsPanel.*` | novos, **de c38db1** (2026-10-13) | T9.4 | a única mudança em arquivo com outro escritor é uma linha de `DockWalletTab.tsx` |
| `src/onchain-read/routes/wallet.ts` e `wallet.test.ts` | novos, **de c38db1** (2026-10-13) | T3.12, T9.4 | só tipos importados do catálogo (sem ciclo); **ligar ao catálogo** (`catalog.ts` mais `catalog.test.ts`, que fixa a lista de rotas) fica para o dono do catálogo ou para o usuário |
| `src/onchainos/http.ts`, `src/okx-wallet/*`, `src/okx-signals/client.ts`, `src/okx-api.ts` | limpo, zonas Z3 e Z5 | T3.2 | **feito sem editar as bibliotecas**: módulo novo `src/okx-clock.ts` e injeção da opção `now` nos pontos de entrada (núcleo desktop e três CLIs); uma primeira versão que editava as bibliotecas quebrou os testes de isolamento do piloto, de `src/onchainos` e de `okx-cli` e foi desfeita |
| `src/okx-market/token-identity.ts` | limpo | T3.6 | **feito**: só dados, as sete redes de CHN-2 (143, 4663, 5042, 999, 57073, 1672, 9745), com `token-identity.test.ts` |
| `src/jev-read/decide.ts`, `scripts/jev-read.ts` | SUJO | T7.3, T7.7 | reaproveitar `readRound` e `decide.ts` por importação, sem editar; sem alterar o `jev-read` |
| `web/src/lib/onchain/client.ts`, `chains.ts`, `web/src/lib/mesa/onchain-rows.ts` | SUJO (novos) | T4.1, T4.2 | integrador |
| `web/src/lib/mesa/dock.ts` | SUJO (novo) | T4.6 | integrador |
| `web/src/lib/mesa/mesa-model.ts`, `mesa-model.test.ts`, `mesa-render.test.tsx`, `topbar-render.test.tsx` | limpos, Z8 | T4.5, T7.6, T8.1 | integrador, testes primeiro |
| `web/src/components/Desk/DeskRail.tsx`, `MesaView.tsx`, `JevStage.tsx`, `panels/PriceChart.tsx`, `panels/Watchlist.tsx`, `panels/AssetPicker.tsx`, `Dock/**` | SUJO | T1.11, T4.3, T4.4, T6.5, T7.5, T7.6, T7.9, T8.1 | integrador; componentes novos em arquivos novos. `JevStage.tsx:14,26,87` renderiza a linha legada e `MesaView.tsx:21,394` a liga (achado 6 da revisão) |
| `web/src/lib/desk/chart/**` | SUJO (novo) | T5.7, T6.4, T6.5 | arquivos novos (`factors.ts`, `zones.ts`); `prefs.ts` pelo integrador |
| `web/next.config.ts` | limpo | T1.3 | edição direta (arquivo próprio do web) |
| `web/src/components/DexReportPanel/**` | limpo | T10.2 | remoção da importação sintética |
| `src/system-one/readings.ts` | limpo, Z-sistema | T7.2 | importar candidatos de perpétuos sem editar |
| `package.json` | SUJO | T1.9 | acrescentar scripts `build:desktop` e `desktop:smoke` só no fim, pelo integrador |

## 4. Regras operacionais

1. Antes de editar: `git status --short -- <caminho>` em `C:/Users/gabri/jev-trader` e `C:/Users/gabri/jev-trader-main`; registrar o resultado no `CHECKPOINT.md`.
2. Se o caminho estiver sujo, **não** editar: criar arquivo novo ou registrar o pedido de integração ao dono.
3. Commits só dos caminhos próprios (`git add <caminhos>`), com a atribuição exigida pela sessão; nunca `git add -A`.
4. Não remover worktrees nem branches alheios; não reiniciar processos nas portas 3000, 3001, 3030 e 3031 sem o usuário (são de outras sessões).
5. Reatualizar este arquivo no início de cada onda (T0.1).

## 5. O que esta sessão alterou (para o integrador e para commits só dos caminhos próprios)

Nenhum commit foi feito. Posição em 2026-10-13.

**Novos, todos desta sessão:** `docs/sdd/inonu-desktop-v1/`, `installer/`, `scripts/build-desktop.ts` (+ teste), `scripts/desktop-smoke.ts`, `scripts/provision.ts`, `src/desktop/` (núcleo, lançador, navegador, caminhos, cofre, provisionamento, Doctor, manipuladores), `src/okx-clock.ts` (+ teste), `src/intel/` (motor de fluxo), `src/inonu/` ("Pedir ao Inonu": pedido, HTTP, ledger, leituras públicas da OKX, fonte, adaptador do Jev, ícones, WebSocket, coletor), no web `src/app/doctor/`, `src/components/Doctor/`, `src/components/Desk/AssetIcon.*`, `src/components/Desk/InonuAsk.*`, `src/components/Desk/Dock/DockInonu.*`, `src/lib/doctor/`, `src/lib/inonu/`, `src/lib/onchain/icons.*`, `src/lib/onchain/asset-icon-render.test.tsx`.

**Modificados em arquivos de outras sessões (edições mínimas, cada uma com teste; os donos estavam parados havia horas, conferido por data de modificação antes de editar):**

| Arquivo | O que mudou |
| --- | --- |
| `scripts/okx-market-scan.ts`, `scripts/okx-signals.ts`, `scripts/okx-dex-quote.ts` | injeção do relógio corrigido (`now`) e `syncOkxClock()` depois da validação, só em `--live` |
| `web/src/components/Settings/SettingsView.tsx` | propriedade `storage` e cinco textos que dizem "cofre do Windows" no app instalado |
| `web/src/lib/onchain/client.ts`, `useOnchainResource.ts`, `web/src/lib/mesa/onchain-rows.ts` | erros `backend_stale` e `origin_denied` no lugar de "fora do contrato" |
| `web/src/components/Desk/Dock/ChainChips.tsx`, `panels/Watchlist.tsx`, `panels/AssetPicker.tsx` | ícone de moeda antes das letras e dos nomes |
| `web/src/components/Desk/MesaView.tsx` | importação do painel, corpo da aba Inonu, `systemOneLine={null}` |
| `web/src/lib/mesa/dock.ts` | rótulo da aba `diario`: "Inonu" |
| `web/next.config.ts`, `web/.gitignore`, `.gitignore` | exportação estática condicional a `INONU_EXPORT=1` e pastas de build |

**Rodada de 2026-10-13 (camada do gráfico, Rastreador, T1.11, T7.9), mesma regra de edição mínima com teste e conferência da data de modificação:**

| Arquivo | O que mudou |
| --- | --- |
| `web/src/lib/desk/ui/draw-chart.ts` | entrada opcional `inonu` em `CandleChartInput` e duas chamadas (`drawInonuBehind` e `drawInonuFront`); Renko ignora |
| `web/src/components/Desk/panels/PriceChart.tsx` | o gancho `useInonuLayer`, a tira de sinais, o filtro das marcas de carteiras e a entrada `inonu` no desenho |
| `web/src/components/Desk/DeskRail.tsx` | link "Rastreador" e o link "Central" que some no app instalado (`NEXT_PUBLIC_INONU_DESKTOP`) |
| `web/src/components/Desk/MesaView.tsx` | lê `?ativo=` uma vez e rótulo da aba |
| `web/next.config.ts` | `env.NEXT_PUBLIC_INONU_DESKTOP` quando exporta |
| cerca de 25 arquivos de `components/Desk`, `lib/mesa`, `lib/desk`, `components/Settings`, `app/` | troca de "Jev" por "Inonu" nos textos exibidos (T7.9), com os testes fixados; `web/src/lib/inonu/naming-scan.test.ts` impede a volta |
| `docs/MESA-TOPBAR-SPEC.md` | T2: três seções e a Central só no build do desenvolvedor |

**Novos desta rodada:** `web/src/lib/desk/chart/inonu-layer.ts`, `web/src/lib/inonu/{overlay,overlay-feed,signals,decision-store,useInonuLayer}.ts`, `web/src/components/Desk/InonuSignalStrip.*`, `web/src/lib/rastreador/`, `web/src/components/Rastreador/`, `web/src/app/rastreador/`, `web/src/lib/purity-bundle.test.ts`, `web/src/lib/mesa/{panels-registry,dock-subviews,dock-layout,flow-tab-model}.*`, `web/src/lib/inonu/{overlay-share,useOverlayReading,feed-text}.ts`, `web/src/components/Desk/Dock/DockComposite.*`, `web/src/components/Desk/TopbarDiscovery.tsx`, `web/src/lib/inonu/{accept,ask-target,ask-trigger,engine-alerts,useEngineAlerts}.ts`, `web/src/lib/mesa/view-source.ts`, `src/inonu/source-discovery.ts` (novo; **usa sem editar** `src/inonu/onchain-plan.ts`, `src/inonu/source-onchain.ts` e `src/intel/onchain-*.ts` da Fase 2; em `src/desktop/handlers.ts` o registro `routeByMode` é a tarefa T-F2-G10 que a Fase 2 delegou ao integrador), `src/inonu/{flow-memory,overlay,screener}.ts` e a fixture manual `web/src/lib/desk/ui/inonu-layer-fixture*.ts` (fora do pacote de produção).

**Revertido:** as edições de relógio nas bibliotecas `src/okx-api.ts`, `src/okx-market/*`, `src/okx-wallet/*`, `src/okx-signals/client.ts` e em `scripts/onchainos-capture.ts`: os testes de isolamento do projeto as proíbem (ver [evidence/T3.2-relogio.md](evidence/T3.2-relogio.md)). Nenhuma das outras 110 entradas sujas foi alterada além da tabela acima.
