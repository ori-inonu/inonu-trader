# Evidência de carteira OKX: especificação do GOAL 2

Implementa, em `src/portfolio-evidence/**` (zona livre do SDD `docs/sdd/carteira-evidencia`), o núcleo de evidência e os adaptadores somente de leitura. Estende o vocabulário de `src/okx-wallet/valuation-diagnostics.ts` sem editá-lo e reaproveita o transporte de `src/onchainos` (cliente assinado, limitador, `collectPages`, `CaptureFs`) sem editá-lo.

Natureza: **leitura**. Nenhum caminho deste módulo assina, envia, aprova, transfere, compra ou vende. Dado sintético é sempre rotulado `origin: synthetic_fixture`.

## Fontes oficiais lidas em 2026-10-11

| Página | Fato usado |
| --- | --- |
| market-api-introduction | A API de Mercado agrupa Balance, Transaction history e Address Analysis. A página de introdução não declara caminhos, limites nem unidades. |
| market-portfolio-overview | `GET /api/v6/dex/market/portfolio/overview`, uma rede por chamada (`chainIndex`, `walletAddress`, `timeFrame` 1 a 5 = 1D, 3D, 7D, 1M, 3M). Sem paginação, sem janela de histórico declarada. `realizedPnlUsd` em USD. |
| market-portfolio-recent-pnl | `GET /api/v6/dex/market/portfolio/recent-pnl`, limite de 1000 registros e 100 por chamada, cursor, ordem decrescente. `tokenBalanceAmount` sem unidade declarada, `unrealizedPnlUsd` pode valer `SELL_ALL`. Sem custo de aquisição nem método contábil. |
| market-portfolio-latest-pnl | `GET .../portfolio/token/latest-pnl`: só PnL e `isPnlSupported`; o exemplo publicado não fecha (realizado + não realizado diferente do total). |
| market-portfolio-supported-chain | `GET .../portfolio/supported/chain`: lista `chainIndex`; o exemplo mostra só 1 e 501 e a página não diz se é a lista inteira. |
| market-portfolio-dex-history | `GET .../portfolio/dex-history`: `begin` e `end` obrigatórios, 1000 registros, 100 por chamada, tipos 1 a 4. |
| market-price, basic-info, top-liquidity, advanced-info, error tables, autenticação | lidas em 2026-10-12; resumo e efeitos no código em REPORT.md, seção "Consulta à documentação oficial". |
| balance (all-token-balances) | `GET /api/v6/dex/balance/all-token-balances-by-address`: até 50 redes, `excludeRiskToken` (padrão: filtra), filtro de honeypot só em ETH, BSC, SOL e BASE; `balance`, `rawBalance` (vazio em redes não suportadas), `tokenPrice` em USD; **sem decimais, sem relógio do preço, sem paginação**. |
| balance (total-value) | `GET .../balance/total-value-by-address`, `assetType` 0 tudo, 1 tokens, 2 DeFi; `totalValue` em USD. |
| balance (specific token) | `POST .../balance/token-balances-by-address`, até 20 tokens; o exemplo da página usa `/token-balances` (divergência não resolvida pela página). |
| tx-history | `GET /api/v6/dex/post-transaction/transactions-by-address`: **seis meses**, ordem decrescente, `limit` 20 (uma rede) ou 100 (várias), cursor; a tabela nomeia `transactions`, o exemplo `transactionList`; `amount` e `txFee` sem unidade. |

Nenhuma dessas páginas declara limite de taxa, tier de plano, códigos de erro ou restrição regional. Esses itens ficam **desconhecidos** (tier `unknown`, custo de cota `costKnown: false`).

## Requisitos (IDs próprios; entre parênteses, o requisito do SDD que cada um cumpre)

| ID | Requisito | SDD |
| --- | --- | --- |
| PE-01 | Identidade de ativo = rede + contrato, chave canônica determinística; nativo com marcador explícito; símbolo só em `display`. | RQ-01 |
| PE-02 | Quantidade exata: `atoms` (inteiro em texto), `decimals`, `decimalsSource`, unidade. Nenhum `number` no caminho de valor. Sem decimais conhecidos não há valor derivado. | RQ-02, RQ-10 |
| PE-03 | Preço em texto decimal com moeda, fonte e instante. Preço `"0"` ou vazio nunca vira valor. | RQ-03 |
| PE-04 | `fetchedAtMs` (captura local) e `sourceTimeMs` (relógio do provedor) separados; frescor de captura e de fonte calculados separadamente; relógio local desviado corrigido por `clockOffsetMs` quando conhecido. | RQ-04 |
| PE-05 | Proveniência: fonte, endpoint, versão do adaptador, cobertura por rede (pedida, observada, não reportada), filtros, hash do conteúdo. | RQ-05 |
| PE-06 | Saldo ativo, histórico, custo de aquisição e PnL são tipos separados; patrimônio soma somente saldos ativos avaliados. | RQ-06 |
| PE-07 | Estados fechados por dado (`ok`, `missing`, `omitted_by_filter`, `stale`, `future`, `divergent`, `unreconciled`, `unverified`) e cinco status derivados (`valid`, `incomplete`, `stale`, `divergent`, `unreconciled`). | RQ-07 |
| PE-08 | Conciliação RC1 a RC6 (total contra soma, histórico contra ativo, identidade, rede, ordem, filtro). | RQ-08 |
| PE-09 | Sintético identificado no dado e no relatório; ausência de dado real não é mascarada. | RQ-09 |
| PE-10 | Adaptadores recebem portas injetadas; nunca leem ambiente, relógio global, `fetch` global ou arquivo. Credenciais só no cliente assinado existente. | RQ-11 |
| PE-11 | Limites explícitos: timeout por chamada, teto de chamadas por atualização, teto de páginas, prazo total. Atualização sob demanda; sem agendador. | RQ-11 |
| PE-12 | Acesso negado, restrição regional, pagamento exigido e credencial recusada **encerram** a atualização (sem nova tentativa, sem contorno). | RQ-11 |
| PE-13 | Cache e persistência sobre a porta `CaptureFs` existente: gravação atômica, revisão que não regride, TTL, verificação de hash na leitura. | RQ-13 |
| PE-15 | Address Analysis completa (overview, PnL recente, PnL do último token, negociações DEX, redes suportadas): tudo `provider_reported_unverified`; o total do provedor é conferido contra as partes; somas de negociações são observadas numa janela e nunca custo; nada entra no patrimônio. | RQ-06, RQ-12 |
| PE-14 | Cobertura de preço, decimais, liquidez e risco por token. Preço e decimais que o provedor não devolve ficam em `market.missing`; uma leitura de liquidez ou de risco que falha vira erro em `collection.errors` (e encerra a atualização se for acesso negado). Moeda do preço de mercado não declarada: não entra no valuation. | RQ-12 |

## Aceitação (A1 a A7 do objetivo)

| ID | Critério | Teste |
| --- | --- | --- |
| A1 | Token omitido por filtro de risco não vira saldo zero. | `acceptance.test.ts` A1 |
| A2 | Quantidade histórica com saldo ativo zerado exige reconciliação. | A2 |
| A3 | PnL não é somado ao patrimônio. | A3 |
| A4 | Diferença entre total reportado e soma das posições é explicada ou sinalizada, nunca fechada por arredondamento. | A4 |
| A5 | Histórico limitado a seis meses não é custo histórico completo. | A5 |
| A6 | Rede ou contrato errado, duplicidade, decimais, dados antigos, erro, resposta parcial e paginação têm teste. | A6 e testes por módulo |
| A7 | Fixtures explicitamente sintéticas; a ausência de dado real aparece como estado, não como exemplo. | A7 |

## Fora de escopo

Trade, assinatura, transferência, pagamento, criação de chaves, conexão de contas, plano pago, agendamento, merge, push, deploy. O caminho vivo existe só como fiação desligada por padrão e **não foi exercido** (não há credenciais).
