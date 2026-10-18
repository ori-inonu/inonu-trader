# Dieta de informação: interface enxuta para humanos, dados estruturados para o agente

Parte do [SPEC](SPEC.md): INF-1 a INF-3, DOC-4, U12. Tarefas: T4.6 e T10.4 em [TASKS.md](TASKS.md).

## 1. Regra

Cada tela mostra o que o humano precisa para **decidir ou auditar o Inonu**. Todo o resto vive em gavetas (abertas por pedido) ou sai da interface. O agente recebe o dado estruturado (Evidence Brief, [flow-engine.md](flow-engine.md) seção 5); o humano vê o resultado, a razão curta e a proveniência. Um painel só existe se tiver ID de requisito (INF-3).

Orçamentos por superfície (testados em T10.4):

| Superfície | Máximo visível sem abrir gaveta |
| --- | --- |
| Faixa do Inonu (acima do gráfico) | 1 linha de estado do pedido, 1 decisão com 3 pesos, 1 razão curta |
| Gráfico | candles, o grupo "Smart money" ligado, marcador do Inonu; fatores e zonas ligáveis |
| Lista Ativos | 8 linhas com ícone, preço e variação; resto por rolagem e pelo Rastreador |
| Painel inferior | 5 abas, cada uma com cabeçalho fixo e até 12 linhas visíveis |
| Barra superior | busca, fontes, alertas, preferências, captura, tela cheia, entrada do Rastreador, engrenagem |

## 2. Tabela manter, mover ou remover (INF-2), estado de 2026-10-12

| Painel ou elemento atual | Onde está hoje | Decisão | Destino e motivo |
| --- | --- | --- | --- |
| Faixa de leitura do modelo (`JevStage`) | `Desk/JevStage.tsx` | **Manter e renomear** | Passa a "Inonu": estado do pedido, decisão, pesos, razão; substitui a linha legada do System One |
| Linha "System One, alavancagem em MON-USDT-SWAP..." | `JevStage.tsx:87`, `mesa-model.ts:359-367` | **Remover** | Texto legado de um instrumento fixo e de um modelo nunca consultado (F9, F10); vira estado do pedido |
| Gráfico de preço com SMC | `panels/PriceChart.tsx`, `lib/desk/chart/**` | **Manter** | Núcleo da decisão; ganha camadas ligáveis de Fluxo e Zonas |
| Indicadores clássicos (EMA, Bollinger, VWAP, Supertrend, RSI, MACD) | grupo "Classicos" do gráfico | **Mover para gaveta** (desligados, já são o padrão atual) | Não são o conceito central |
| Marcadores de decisão e cartão (`DecisionCard`) | `panels/DecisionCard.tsx` | **Manter** | Mostra a decisão no gráfico com Aceitar, Ignorar, Silenciar |
| `JevIndicators` (resumo do pacote Python) | `panels/JevIndicators.tsx` | **Mover** | Vira detalhe da aba Radar; o humano vê notas e zonas, não o dump |
| Lista Ativos (`Watchlist`, `AssetPicker`) | `panels/Watchlist.tsx`, `AssetPicker.tsx` | **Manter**, 8 linhas | Resto no Rastreador |
| Fluxo agressor (`FlowGauge`) | `panels/FlowGauge.tsx` | **Mover** | Aba Fluxo do painel inferior |
| Derivativos (`DerivativesStrip`) | `panels/DerivativesStrip.tsx` | **Mover** | Detalhe da aba Radar (regime E7) |
| Livro de ofertas (`OrderBookLadder`) | `panels/OrderBookLadder.tsx` | **Mover para gaveta** | Aba "Mercado bruto", recolhida |
| Fita de negócios (`TimeAndSales`) | `panels/TimeAndSales.tsx` | **Mover para gaveta** | Aba "Mercado bruto", recolhida |
| Superfície de liquidez (`LiquiditySurface`) | `panels/LiquiditySurface.tsx` | **Mover para gaveta** | Aba "Mercado bruto", recolhida |
| Aba Smart money, Traders, Holders | `Desk/Dock/OnchainTabs.tsx` | **Fundir** | Aba **Radar**: sinais, carteiras e holders em uma lista curta ordenada por nota |
| Aba Carteira | `DeskDock.tsx`, `lib/okx-wallet.ts` | **Manter e ampliar** | Saldos, histórico, PnL e ticket (ADR-5) |
| Aba Diário do Jev | `Desk/Dock/DockTabs.tsx` | **Renomear** | Aba **Inonu**: ledger de pedidos, decisões, custo medido |
| Aba Ecossistema | `Desk/Dock/DockTabs.tsx`, `mesa-model.ts:278-318` | **Remover como aba** | Vira linha de estado no Doctor e na pílula de fontes |
| Pílula de fontes e idades | `Desk/DeskRail.tsx` | **Manter** | Honestidade de dado (DAT-2) |
| Alertas de preço, captura, tela cheia, paleta, modo de gráfico | `TopbarTools.tsx`, `TopbarAlerts.tsx` | **Manter** | Ferramentas pequenas e já entregues |
| Rota `/console` (Central de observação), `SystemOneView`, `DexReportPanel`, `GevPilotPanel`, `RealPipeline`, `WalletProposalReview` | `app/console/page.tsx` | **Fora do instalável** (T1.11, WIN-13) | Pertencem ao fluxo Kuru e a relatórios antigos (D-U2); permanecem no repositório sem remoção; o núcleo responde 404 a `/console*` e o link "Central" de `DeskRail.tsx:116-119` some. `DexReportPanel` importa `SYNTHETIC_DEX_REPORT` (ADR-4) |
| Rota `/configuracoes` | `app/configuracoes/page.tsx` | **Manter e ampliar** | Cofre, providers, orçamento, ledger |
| Rota `/rastreador` | novo | **Adicionar** | RAS-1 |
| Rota `/doctor` | novo | **Adicionar** | WIN-8 |

## 3. Painel inferior alvo (DOC-4)

| Aba | Conteúdo | Fonte |
| --- | --- | --- |
| Inonu | Estado do pedido atual, decisão (id, razão), histórico de pedidos, custo medido do dia | ledger (T7.4) |
| Radar | Zonas ativas (até 6), sinais de carteiras rastreadas, holders inteligentes, regime | motor e gateway |
| Fluxo | Delta, CVD, desequilíbrios, Sequencial, Progressão, Exaustão, Fator Volume da vela atual e da última | motor (`trades`) |
| Carteira | Saldos, histórico, PnL, ticket de ordem | gateway e extensão |
| Mercado bruto | Livro, Fita, Liquidez, recolhidos por padrão | OKX público |

### 3.1 Destino das superfícies on-chain que já existem (revisão r3, D3-08)

| Superfície atual (componente) | Destino nas 5 abas | Observação |
| --- | --- | --- |
| Smart money, Traders e Holders (`SmartMoneyTab`, `TradersTab`, `HoldersTab`) | **Radar**, lista curta ordenada por nota | já respeitam a política de chamadas por aba ativa |
| Cartão Estrutura e risco (`RiskCard`) | **Radar**, detalhe do token selecionado | usa `token-risk` e `clusters` |
| Janelas e Pools (`OnchainLiquidityTab`) | **Radar** (métricas do token) e **Mercado bruto** (Liquidez) | só com foco on-chain |
| Fita on-chain (`OnchainTapeTab`) | **Mercado bruto**, aba Fita em modo on-chain | único que faz poll (30 s) |
| Notícias e sentimento (`EcoNewsSection`) | **Radar**, gaveta "Noticias e sentimento" | a aba Ecossistema deixa de existir (DOC-3); a linha de estado do orçamento vai para o Doctor |

A realocação é trabalho do integrador (zona Z8) e entra em T4.4 e T4.6; `web/src/lib/mesa/panels-registry.ts` (T10.4) mantém o registro de rotas, abas e painéis em sincronia com o SPEC.

## 4. Teste (INF-3)

`web/src/lib/mesa/panels-registry.test.ts` falha se existir painel, aba ou rota sem entrada no registro `{ id, requisito }` e se uma aba exceder o orçamento de itens visíveis.
