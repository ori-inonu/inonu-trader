# Cobertura da documentacao OnchainOS (499 paginas)

Gerado por `tools/okx-coverage.ts` em 2026-10-13 a partir do espelho de https://web3.okx.com/pt-br/onchainos/dev-docs/ (`tools/mirror-okx-docs.ts`). Cada pagina tem **uma decisao**, requisitos do [SPEC](SPEC.md) e tarefas de [TASKS](TASKS.md). O espelho nao e versionado; o JSON guarda o SHA-256 de cada pagina para detectar mudancas.

Decisoes: **integrar-agora** (escopo v1, leitura), **sob-demanda** (integra, so quando o usuario pede ou a tela correspondente esta aberta, e conta no orcamento), **especificado-desligado** (especificado e desligado por padrao; inclui a reserva OKX Connect, que so liga sem extensao), **depois** (valido, fora da v1), **fora** (excluido, com motivo), **referencia** (pagina de apoio sem integracao).

## Resumo

| Familia | integrar-agora | sob-demanda | especificado-desligado | depois | fora | referencia | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| home | 3 | 0 | 0 | 0 | 5 | 3 | 11 |
| market | 44 | 34 | 14 | 13 | 9 | 17 | 131 |
| okxai | 0 | 0 | 0 | 0 | 18 | 1 | 19 |
| payments | 0 | 0 | 0 | 1 | 22 | 8 | 31 |
| trade | 8 | 5 | 0 | 12 | 26 | 16 | 67 |
| wallet | 25 | 5 | 9 | 64 | 7 | 14 | 124 |
| xlayer | 3 | 6 | 0 | 4 | 98 | 5 | 116 |
| **Total** | 83 | 50 | 23 | 94 | 185 | 64 | 499 |

## Regras (primeira que casa vence)

| Regra | Grupo | Decisao | Motivo | Requisitos | Tarefas | Paginas |
| --- | --- | --- | --- | --- | --- | --- |
| home-auth | Autenticacao | integrar-agora | assinatura HMAC-SHA256, 4 cabecalhos, tolerancia de 30 s | API-2, API-3, API-11 | T3.2, T3.4 | 1 |
| home-portal | Portal | integrar-agora | 3 projetos por conta, 3 chaves por projeto, passphrase | CFG-5, WIN-8 | T0.3, T2.3 | 1 |
| home-chains | Redes | integrar-agora | lista de redes por familia | CHN-1, CHN-3 | T3.6 | 1 |
| home-changelog | Referencia | referencia | monitorar mudancas do provedor | API-6 | T3.1 | 1 |
| home-intro | Referencia | referencia | apresentacao e contato | API-6 | n/a | 2 |
| home-agentic | Agentic Wallet | fora | carteira em TEE que negocia sozinha: viola o app nunca assina sozinho | WAL-8 | n/a | 3 |
| home-mcp | MCP e Skills | fora | perde controle de chamadas e formato compacto (ADR-6) | API-1 | n/a | 1 |
| home-dapp-demo | Demo | fora | demo usa chave privada e SDK de execucao | WAL-8 | n/a | 1 |
| mkt-fee | Custo | integrar-agora | cota gratuita, camadas Basic e Premium, x402 | API-3 | T3.4 | 1 |
| mkt-x402 | x402 | fora | pagamento exige assinatura por chamada; 402 vira cota esgotada | API-10 | n/a | 2 |
| mkt-intro | Referencia | referencia | introducao e suporte | API-6 | n/a | 2 |
| mkt-ai-tools | MCP e Skills | fora | ferramentas de agente; REST direto da controle de chamadas | API-1 | n/a | 4 |
| mkt-ws-err | WebSocket | referencia | codigos do WebSocket | API-7 | T3.7 | 1 |
| mkt-ws | WebSocket | especificado-desligado | exige plano pago; 3 conexoes por segundo, 480 inscricoes por hora | API-7 | T3.7 | 14 |
| mkt-errors | Codigos de erro | integrar-agora | tabela de erros mapeada no normalizador (50011, 50038, 81001, 81104) | API-5, API-12 | T3.3 | 9 |
| mkt-refs | Referencia | referencia | indice de referencia da familia | API-6 | n/a | 14 |
| mkt-chains | Redes por familia | integrar-agora | descoberta da capacidade por familia (gratuito) | CHN-3 | T3.6 | 14 |
| mkt-price | Preco | integrar-agora | preco atual e indice de referencia (indice e gratuito) | API-4 | T3.3 | 3 |
| mkt-candles | Velas | integrar-agora | velas de tokens on-chain (ate 299 por chamada, 1440 mais recentes) | API-4, FLX-9 | T3.3 | 1 |
| mkt-candles-hist | Velas | sob-demanda | historico confirmado (Premium), profundidade nao documentada | API-4 | T3.3 | 1 |
| mkt-trades | Fluxo | integrar-agora | negocios com lado compra ou venda e valor em USD (ate 500 por chamada) | FLX-9 | T3.3, T5.6 | 1 |
| mkt-token-core | Token | integrar-agora | busca, tendencia, logos, janelas de preco e liquidez | API-4, SRC-5, ICO-4, RAS-2 | T3.3, T3.5, T8.2 | 5 |
| mkt-token-adv | Token | sob-demanda | risco do token (Premium) | API-4, SMT-4 | T3.3, T6.3 | 1 |
| mkt-token-smart | Token | sob-demanda | carteiras inteligentes, custo medio e concentracao (Premium) | SMT-3, SMT-4, DOC-2 | T3.3, T6.2, T6.3, T4.4 | 4 |
| mkt-token-cluster | Token | sob-demanda | cluster/list responde (medido em 2026-10-12); payload pesado, so sob clique na interface | API-4, SMT-4 | T3.3 | 1 |
| mkt-signal | Smart money | integrar-agora | sinais de carteiras rastreadas e leaderboard (Premium, cache) | SMT-3, SMT-4, DOC-2 | T3.3, T4.4, T6.2 | 2 |
| mkt-portfolio-basic | Portfolio | integrar-agora | PnL por token e historico de DEX do usuario (Basic) | WAL-4 | T9.4 | 2 |
| mkt-portfolio-prem | Portfolio | sob-demanda | visao geral e PnL recente do endereco (Premium) | WAL-4 | T9.4 | 2 |
| mkt-tracker | Smart money | sob-demanda | tape de carteiras rastreadas; camada de cobranca desconhecida (medir) | API-8, ASK-2 | T3.8 | 1 |
| mkt-meme | Memepump | sob-demanda | nas redes que memepump/supported/chainsProtocol listar (7 medidas em 2026-10-12); risco de dev, bundlers e carteiras | RAS-2, SMT-4 | T8.2 | 5 |
| mkt-meme-sim | Memepump | depois | aviso de copia; valor baixo na v1 | API-6 | n/a | 1 |
| mkt-rwa | RWA | sob-demanda | rwa/tokens responde com category (medido em 2026-10-12); so sob pedido | API-4 | T3.3 | 1 |
| mkt-social-core | Social | sob-demanda | sentimento e hype por simbolo; camada desconhecida (medir) | RAS-2, SMT-4, API-8 | T3.8, T6.3 | 2 |
| mkt-social-later | Social | depois | noticias e ranking de texto nao vao ao modelo; aba opcional | API-6 | n/a | 7 |
| mkt-balance | Saldo | integrar-agora | saldos do endereco conectado (gratuito, isRiskToken) | WAL-4 | T9.4 | 3 |
| mkt-txhist | Historico | integrar-agora | historico de 6 meses do endereco conectado (gratuito) | WAL-4 | T9.4 | 2 |
| mkt-od-guide | Dados on-chain | integrar-agora | lotes, paginacao, limites e recuo | API-3, API-5 | T3.3, T3.4 | 1 |
| mkt-od-forensic | Dados on-chain | sob-demanda | forense de endereco e transacao, em lote | API-4 | T3.3 | 9 |
| mkt-od-block-demand | Dados on-chain | sob-demanda | blocos e transacoes de um bloco respondem com a chave do projeto (medido em 2026-10-12); so sob pedido | API-4 | T3.3 | 3 |
| mkt-od-later | Dados on-chain | depois | varredura de logs e blocos e historico de saldo (Premium, ponto unico) | API-6 | n/a | 5 |
| mkt-od-info-demand | Dados on-chain | sob-demanda | estatisticas de cadeia respondem (medido em 2026-10-12); so sob pedido | API-4 | T3.3 | 4 |
| mkt-od-info | Dados on-chain | fora | estatisticas de cadeia que o app nao usa (block, detail, hashes) | API-6 | n/a | 3 |
| trade-fee | Custo | integrar-agora | trial de 1 requisicao por segundo (ate 5 sob aprovacao) | API-3, WAL-5 | T3.4, T9.5 | 1 |
| trade-ref | Referencia | referencia | introducao, FAQ e enderecos (usar os que a API devolve) | API-6 | n/a | 11 |
| trade-mcp | MCP e Skills | fora | ferramentas de agente | API-1 | n/a | 4 |
| trade-read | Cotacao | integrar-agora | cotacao somente leitura: impacto, rota, honeypot, taxa | WAL-5 | T9.5 | 4 |
| trade-prepare | Ticket | sob-demanda | devolve calldata nao assinado; so exibir no ticket | WAL-6 | T9.6 | 3 |
| trade-history | Ticket | depois | reconciliacao de trocas | API-6 | n/a | 1 |
| trade-examples | Referencia | referencia | exemplos usam chave privada; nao copiar | WAL-8 | n/a | 5 |
| trade-sdk | SDK | fora | SDK assina com chave do ambiente | WAL-8 | n/a | 4 |
| trade-widget | Widget | fora | iframe opaco que o app nao consegue barrar | WAL-8 | n/a | 1 |
| trade-fee-partner | Parceiro | fora | taxa de parceiro | API-6 | n/a | 1 |
| trade-intent | Intent Swap | depois | EIP-712 assinado pelo usuario; especificado para depois | WAL-9 | n/a | 10 |
| trade-solver | Solver e market maker | fora | paginas para solvers e market makers | API-6 | n/a | 14 |
| trade-errors | Codigos de erro | integrar-agora | tabela de erros do agregador | API-5, API-12 | T3.3 | 2 |
| trade-gw-chains | Redes por familia | integrar-agora | redes do gateway | CHN-3 | T3.6 | 1 |
| trade-gw-gas | Gateway | sob-demanda | custo e prazo no ticket | WAL-6 | T9.5 | 2 |
| trade-gw-sim | Gateway | depois | simulacao exige lista de clientes autorizados | WAL-9 | n/a | 1 |
| trade-gw-send | Gateway | fora | o servidor nunca difunde transacao | WAL-8 | n/a | 2 |
| wal-ref | Referencia | referencia | introducao e indices da familia | API-6 | n/a | 13 |
| wal-agentic | Agentic Wallet | fora | carteira em TEE que negocia sozinha | WAL-8 | n/a | 5 |
| wal-networks | Redes | integrar-agora | redes do Wallet API | CHN-1 | T3.6 | 1 |
| wal-balance | Saldo | integrar-agora | saldos do endereco conectado (gratuito) | WAL-4 | T9.4 | 3 |
| wal-chains | Redes por familia | integrar-agora | descoberta da capacidade por familia | CHN-3 | T3.6 | 4 |
| wal-errors | Codigos de erro | integrar-agora | tabela de erros mapeada no normalizador | API-5, API-12 | T3.3 | 3 |
| wal-txhist | Historico | integrar-agora | historico do endereco conectado (gratuito) | WAL-4 | T9.4 | 2 |
| wal-defi-assets | DeFi | sob-demanda | posicoes DeFi do endereco; camada a medir | WAL-4, API-8 | T9.4, T3.8 | 3 |
| wal-defi-later | DeFi | depois | descoberta de produtos e calldata de entrada, saida e coleta | WAL-9 | n/a | 12 |
| wal-gw-gas | Gateway | sob-demanda | custo e prazo no ticket | WAL-6 | T9.5 | 2 |
| wal-gw-sim | Gateway | depois | simulacao exige lista de clientes autorizados | WAL-9 | n/a | 1 |
| wal-gw-send | Gateway | fora | o servidor nunca difunde transacao | WAL-8 | n/a | 2 |
| dc-intro | Conexao da carteira | integrar-agora | deteccao de window.okxwallet e redes suportadas | WAL-1 | T1.1, T9.1 | 3 |
| dc-icon | Conexao da carteira | referencia | icone do app no OKX Connect | WAL-3 | n/a | 1 |
| dc-send | Envio | especificado-desligado | envio assinado pela carteira, desligado ate autorizacao (WAL-9) | WAL-9 | n/a | 1 |
| dc-evm-sol | Conexao da carteira | integrar-agora | conta, rede, troca e adicao de rede por clique (EVM e Solana) | WAL-1, WAL-2 | T9.1, T9.2 | 9 |
| dc-evm-later | Conexao da carteira | depois | exibir tokens e interagir com contratos | WAL-9 | n/a | 2 |
| dc-qr | OKX Connect por QR | especificado-desligado | reserva sem extensao (validar no export estatico) | WAL-3 | T9.3 | 8 |
| dc-other | Outras redes | depois | Bitcoin, Sui, Tron, TON, Aptos, Cosmos, Starknet, NEAR, Stacks, Cardano, Nostr e WAX ficam fora do escopo EVM e Solana da v1 | WAL-1 | n/a | 49 |
| pay-buyer | x402 | depois | fluxo do comprador; exige carteira para assinar, fora na v1 | API-10 | n/a | 1 |
| pay-ref | x402 | referencia | conceitos de pagamento do provedor | API-10 | n/a | 8 |
| pay-out | x402 | fora | lado vendedor, SDKs e APIs de corretor; pagamento nao e do app | API-10 | n/a | 22 |
| ai-ref | OKX.AI | referencia | apresentacao do mercado de agentes | API-6 | n/a | 1 |
| ai-out | OKX.AI | fora | mercado de agentes com custodia e assinatura; saida nao auditavel | WAL-8 | n/a | 18 |
| xl-const | X Layer | integrar-agora | constantes da rede 196, tokens e formato de endereco | CHN-1, CHN-2 | T3.6 | 3 |
| xl-ref | X Layer | referencia | apresentacao e erros | API-6 | n/a | 5 |
| xl-rpc | X Layer | depois | RPC sem cota (100 requisicoes por segundo por IP) para logs e saldos em 196 | API-6 | n/a | 2 |
| xl-data-demand | X Layer | sob-demanda | endpoints v5 de 196 que respondem com a chave do projeto (medido em 2026-10-12); cobranca nao documentada, so sob pedido | API-4 | T3.3 | 6 |
| xl-data-unique | X Layer | depois | endpoints v5 exclusivos de 196; cobranca nao documentada | API-6 | n/a | 2 |
| xl-tz | X Layer | fora | order book L2 da Trade Zone, que nao e uma praca do app (50038 medido para tz/*) | API-6 | n/a | 17 |
| xl-out | X Layer | fora | duplica a v6, escrita no explorador (contract/verify-*), ferramentas de terceiros e deploy de contratos | API-6 | n/a | 81 |

## Pagina a pagina

| Pagina | Decisao | Regra | Requisitos | Tarefas |
| --- | --- | --- | --- | --- |
| `home/agentic-wallet-overview` | fora | home-agentic | WAL-8 | n/a |
| `home/api-access-and-usage` | integrar-agora | home-auth | API-2, API-3, API-11 | T3.2, T3.4 |
| `home/change-log` | referencia | home-changelog | API-6 | T3.1 |
| `home/developer-portal` | integrar-agora | home-portal | CFG-5, WIN-8 | T0.3, T2.3 |
| `home/install-your-agentic-wallet` | fora | home-agentic | WAL-8 | n/a |
| `home/run-your-first-ai-agent` | fora | home-agentic | WAL-8 | n/a |
| `home/run-your-first-dapp` | fora | home-dapp-demo | WAL-8 | n/a |
| `home/skills-mcp-services` | fora | home-mcp | API-1 | n/a |
| `home/support` | referencia | home-intro | API-6 | n/a |
| `home/supported-chain` | integrar-agora | home-chains | CHN-1, CHN-3 | T3.6 |
| `home/what-is-onchainos` | referencia | home-intro | API-6 | n/a |
| `market/balance-chains` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/balance-error-code` | integrar-agora | mkt-errors | API-5, API-12 | T3.3 |
| `market/balance-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/balance-specific-token-balance` | integrar-agora | mkt-balance | WAL-4 | T9.4 |
| `market/balance-total-token-balances` | integrar-agora | mkt-balance | WAL-4 | T9.4 |
| `market/balance-total-value` | integrar-agora | mkt-balance | WAL-4 | T9.4 |
| `market/historical-index-price` | integrar-agora | mkt-price | API-4 | T3.3 |
| `market/how-to-finish-api-payment` | fora | mkt-x402 | API-10 | n/a |
| `market/index-price` | integrar-agora | mkt-price | API-4 | T3.3 |
| `market/index-price-chains` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/index-price-error-code` | integrar-agora | mkt-errors | API-5, API-12 | T3.3 |
| `market/index-price-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/market-ai-tools-introduction` | fora | mkt-ai-tools | API-1 | n/a |
| `market/market-ai-tools-llm` | fora | mkt-ai-tools | API-1 | n/a |
| `market/market-ai-tools-mcp-server` | fora | mkt-ai-tools | API-1 | n/a |
| `market/market-ai-tools-skills` | fora | mkt-ai-tools | API-1 | n/a |
| `market/market-api-fee` | integrar-agora | mkt-fee | API-3 | T3.4 |
| `market/market-api-introduction` | referencia | mkt-intro | API-6 | n/a |
| `market/market-candlesticks` | integrar-agora | mkt-candles | API-4, FLX-9 | T3.3 |
| `market/market-candlesticks-history` | sob-demanda | mkt-candles-hist | API-4 | T3.3 |
| `market/market-memepump-get-similar-tokens` | depois | mkt-meme-sim | API-6 | n/a |
| `market/market-memepump-get-supported-chains-and-protocols` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/market-memepump-get-token-aped-wallet-details` | sob-demanda | mkt-meme | RAS-2, SMT-4 | T8.2 |
| `market/market-memepump-get-token-bundle-details` | sob-demanda | mkt-meme | RAS-2, SMT-4 | T8.2 |
| `market/market-memepump-get-token-details` | sob-demanda | mkt-meme | RAS-2, SMT-4 | T8.2 |
| `market/market-memepump-get-token-developer-info` | sob-demanda | mkt-meme | RAS-2, SMT-4 | T8.2 |
| `market/market-memepump-get-token-list` | sob-demanda | mkt-meme | RAS-2, SMT-4 | T8.2 |
| `market/market-portfolio-address-tracker-trades` | sob-demanda | mkt-tracker | API-8, ASK-2 | T3.8 |
| `market/market-portfolio-dex-history` | integrar-agora | mkt-portfolio-basic | WAL-4 | T9.4 |
| `market/market-portfolio-error-code` | integrar-agora | mkt-errors | API-5, API-12 | T3.3 |
| `market/market-portfolio-latest-pnl` | integrar-agora | mkt-portfolio-basic | WAL-4 | T9.4 |
| `market/market-portfolio-overview` | sob-demanda | mkt-portfolio-prem | WAL-4 | T9.4 |
| `market/market-portfolio-recent-pnl` | sob-demanda | mkt-portfolio-prem | WAL-4 | T9.4 |
| `market/market-portfolio-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/market-portfolio-supported-chain` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/market-price` | integrar-agora | mkt-price | API-4 | T3.3 |
| `market/market-price-chains` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/market-price-error-code` | integrar-agora | mkt-errors | API-5, API-12 | T3.3 |
| `market/market-price-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/market-rwa-token` | sob-demanda | mkt-rwa | API-4 | T3.3 |
| `market/market-scan-chain-api-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/market-scan-chain-error-code` | integrar-agora | mkt-errors | API-5, API-12 | T3.3 |
| `market/market-signal-chains` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/market-signal-leaderboard-list` | integrar-agora | mkt-signal | SMT-3, SMT-4, DOC-2 | T3.3, T4.4, T6.2 |
| `market/market-signal-leaderboard-supported-chain` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/market-signal-list` | integrar-agora | mkt-signal | SMT-3, SMT-4, DOC-2 | T3.3, T4.4, T6.2 |
| `market/market-signal-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/market-social-news-by-symbol` | depois | mkt-social-later | API-6 | n/a |
| `market/market-social-news-detail` | depois | mkt-social-later | API-6 | n/a |
| `market/market-social-news-error-code` | integrar-agora | mkt-errors | API-5, API-12 | T3.3 |
| `market/market-social-news-latest` | depois | mkt-social-later | API-6 | n/a |
| `market/market-social-news-platforms` | depois | mkt-social-later | API-6 | n/a |
| `market/market-social-news-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/market-social-news-search` | depois | mkt-social-later | API-6 | n/a |
| `market/market-social-sentiment-ranking` | depois | mkt-social-later | API-6 | n/a |
| `market/market-social-sentiment-symbol` | sob-demanda | mkt-social-core | RAS-2, SMT-4, API-8 | T3.8, T6.3 |
| `market/market-social-vibe-timeline` | sob-demanda | mkt-social-core | RAS-2, SMT-4, API-8 | T3.8, T6.3 |
| `market/market-social-vibe-top-kols` | depois | mkt-social-later | API-6 | n/a |
| `market/market-token-advanced-info` | sob-demanda | mkt-token-adv | API-4, SMT-4 | T3.3, T6.3 |
| `market/market-token-basic-info` | integrar-agora | mkt-token-core | API-4, SRC-5, ICO-4, RAS-2 | T3.3, T3.5, T8.2 |
| `market/market-token-cluster-list` | sob-demanda | mkt-token-cluster | API-4, SMT-4 | T3.3 |
| `market/market-token-cluster-overview` | sob-demanda | mkt-token-smart | SMT-3, SMT-4, DOC-2 | T3.3, T6.2, T6.3, T4.4 |
| `market/market-token-cluster-supported-chain` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/market-token-cluster-top-holders` | sob-demanda | mkt-token-smart | SMT-3, SMT-4, DOC-2 | T3.3, T6.2, T6.3, T4.4 |
| `market/market-token-error-code` | integrar-agora | mkt-errors | API-5, API-12 | T3.3 |
| `market/market-token-holder` | sob-demanda | mkt-token-smart | SMT-3, SMT-4, DOC-2 | T3.3, T6.2, T6.3, T4.4 |
| `market/market-token-hot-token` | integrar-agora | mkt-token-core | API-4, SRC-5, ICO-4, RAS-2 | T3.3, T3.5, T8.2 |
| `market/market-token-price-info` | integrar-agora | mkt-token-core | API-4, SRC-5, ICO-4, RAS-2 | T3.3, T3.5, T8.2 |
| `market/market-token-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/market-token-search` | integrar-agora | mkt-token-core | API-4, SRC-5, ICO-4, RAS-2 | T3.3, T3.5, T8.2 |
| `market/market-token-top-liquidity` | integrar-agora | mkt-token-core | API-4, SRC-5, ICO-4, RAS-2 | T3.3, T3.5, T8.2 |
| `market/market-token-top-trader` | sob-demanda | mkt-token-smart | SMT-3, SMT-4, DOC-2 | T3.3, T6.2, T6.3, T4.4 |
| `market/market-trades` | integrar-agora | mkt-trades | FLX-9 | T3.3, T5.6 |
| `market/onchaindata-address-address-active-chain` | sob-demanda | mkt-od-forensic | API-4 | T3.3 |
| `market/onchaindata-address-information-evm` | sob-demanda | mkt-od-forensic | API-4 | T3.3 |
| `market/onchaindata-address-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/onchaindata-address-supported-chains` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/onchaindata-block-address-balance-history` | depois | mkt-od-later | API-6 | n/a |
| `market/onchaindata-block-block-fills` | sob-demanda | mkt-od-block-demand | API-4 | T3.3 |
| `market/onchaindata-block-block-height-by-time` | sob-demanda | mkt-od-forensic | API-4 | T3.3 |
| `market/onchaindata-block-block-list` | sob-demanda | mkt-od-block-demand | API-4 | T3.3 |
| `market/onchaindata-block-block-stats` | depois | mkt-od-later | API-6 | n/a |
| `market/onchaindata-block-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/onchaindata-block-supported-chains` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/onchaindata-block-transaction-list` | sob-demanda | mkt-od-block-demand | API-4 | T3.3 |
| `market/onchaindata-error-code` | integrar-agora | mkt-errors | API-5, API-12 | T3.3 |
| `market/onchaindata-info-address` | sob-demanda | mkt-od-info-demand | API-4 | T3.3 |
| `market/onchaindata-info-block` | fora | mkt-od-info | API-6 | n/a |
| `market/onchaindata-info-detail` | fora | mkt-od-info | API-6 | n/a |
| `market/onchaindata-info-hashes` | fora | mkt-od-info | API-6 | n/a |
| `market/onchaindata-info-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/onchaindata-info-stats` | sob-demanda | mkt-od-info-demand | API-4 | T3.3 |
| `market/onchaindata-info-summary` | sob-demanda | mkt-od-info-demand | API-4 | T3.3 |
| `market/onchaindata-info-supported-chains` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/onchaindata-info-transaction` | sob-demanda | mkt-od-info-demand | API-4 | T3.3 |
| `market/onchaindata-log-by-address` | depois | mkt-od-later | API-6 | n/a |
| `market/onchaindata-log-by-address-and-topic` | depois | mkt-od-later | API-6 | n/a |
| `market/onchaindata-log-by-block-and-address` | depois | mkt-od-later | API-6 | n/a |
| `market/onchaindata-log-by-transaction` | sob-demanda | mkt-od-forensic | API-4 | T3.3 |
| `market/onchaindata-log-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/onchaindata-log-supported-chains` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/onchaindata-transaction-internal-transaction-multi` | sob-demanda | mkt-od-forensic | API-4 | T3.3 |
| `market/onchaindata-transaction-normal-transaction-list-multi` | sob-demanda | mkt-od-forensic | API-4 | T3.3 |
| `market/onchaindata-transaction-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/onchaindata-transaction-supported-chains` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/onchaindata-transaction-token-transaction-list-multi` | sob-demanda | mkt-od-forensic | API-4 | T3.3 |
| `market/onchaindata-transaction-token-transfer-multi` | sob-demanda | mkt-od-forensic | API-4 | T3.3 |
| `market/onchaindata-transaction-transaction-multi` | sob-demanda | mkt-od-forensic | API-4 | T3.3 |
| `market/onchaindata-usage-guide` | integrar-agora | mkt-od-guide | API-3, API-5 | T3.3, T3.4 |
| `market/payment-error-handling` | fora | mkt-x402 | API-10 | n/a |
| `market/support` | referencia | mkt-intro | API-6 | n/a |
| `market/tx-history-chains` | integrar-agora | mkt-chains | CHN-3 | T3.6 |
| `market/tx-history-error-code` | integrar-agora | mkt-errors | API-5, API-12 | T3.3 |
| `market/tx-history-reference` | referencia | mkt-refs | API-6 | n/a |
| `market/tx-history-specific-transaction-detail-by-txhash` | integrar-agora | mkt-txhist | WAL-4 | T9.4 |
| `market/tx-history-transactions-by-address` | integrar-agora | mkt-txhist | WAL-4 | T9.4 |
| `market/websocket` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-address-activity-channel` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-candlesticks-channel` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-channels` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-error-code` | referencia | mkt-ws-err | API-7 | T3.7 |
| `market/websocket-kol-smartmoney-activity-channel` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-login` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-memepump-channel` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-price-channel` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-price-info-channel` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-signal-channel` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-subscribe` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-token-channel` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-trades-channel` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `market/websocket-unsubscribe` | especificado-desligado | mkt-ws | API-7 | T3.7 |
| `okxai/a2a-no-subscription` | fora | ai-out | WAL-8 | n/a |
| `okxai/a2a-subscription` | fora | ai-out | WAL-8 | n/a |
| `okxai/agent-installation-guide` | fora | ai-out | WAL-8 | n/a |
| `okxai/asp` | fora | ai-out | WAL-8 | n/a |
| `okxai/asp-introduction` | fora | ai-out | WAL-8 | n/a |
| `okxai/evaluator-introduction` | fora | ai-out | WAL-8 | n/a |
| `okxai/evaluator-registration` | fora | ai-out | WAL-8 | n/a |
| `okxai/how-to-become-a2a` | fora | ai-out | WAL-8 | n/a |
| `okxai/howtomcp` | fora | ai-out | WAL-8 | n/a |
| `okxai/okxai-evaluator` | fora | ai-out | WAL-8 | n/a |
| `okxai/okxai-faq` | fora | ai-out | WAL-8 | n/a |
| `okxai/profession-alarbitration-skill-guide` | fora | ai-out | WAL-8 | n/a |
| `okxai/registerasp` | fora | ai-out | WAL-8 | n/a |
| `okxai/roles-and-responsibilities` | fora | ai-out | WAL-8 | n/a |
| `okxai/user` | fora | ai-out | WAL-8 | n/a |
| `okxai/user-buy-service` | fora | ai-out | WAL-8 | n/a |
| `okxai/user-introduction` | fora | ai-out | WAL-8 | n/a |
| `okxai/user-register` | fora | ai-out | WAL-8 | n/a |
| `okxai/what-is-okxai` | referencia | ai-ref | API-6 | n/a |
| `payments/agent-seller` | fora | pay-out | API-10 | n/a |
| `payments/api-a2a` | fora | pay-out | API-10 | n/a |
| `payments/api-agent-onetime` | fora | pay-out | API-10 | n/a |
| `payments/api-http` | fora | pay-out | API-10 | n/a |
| `payments/api-http-batch` | fora | pay-out | API-10 | n/a |
| `payments/api-http-onetime` | fora | pay-out | API-10 | n/a |
| `payments/api-http-psyg` | fora | pay-out | API-10 | n/a |
| `payments/api-http-subscription` | fora | pay-out | API-10 | n/a |
| `payments/api-overview` | fora | pay-out | API-10 | n/a |
| `payments/app` | referencia | pay-ref | API-10 | n/a |
| `payments/core-concept` | referencia | pay-ref | API-10 | n/a |
| `payments/methods-batch` | fora | pay-out | API-10 | n/a |
| `payments/methods-escrow` | fora | pay-out | API-10 | n/a |
| `payments/methods-onetime` | fora | pay-out | API-10 | n/a |
| `payments/methods-overview` | referencia | pay-ref | API-10 | n/a |
| `payments/overview` | referencia | pay-ref | API-10 | n/a |
| `payments/pay-as-you-go` | referencia | pay-ref | API-10 | n/a |
| `payments/payment-use-buyer` | depois | pay-buyer | API-10 | n/a |
| `payments/quickstart-overview` | referencia | pay-ref | API-10 | n/a |
| `payments/sdk-go` | fora | pay-out | API-10 | n/a |
| `payments/sdk-java` | fora | pay-out | API-10 | n/a |
| `payments/sdk-nodejs` | fora | pay-out | API-10 | n/a |
| `payments/sdk-overview` | fora | pay-out | API-10 | n/a |
| `payments/sdk-python` | fora | pay-out | API-10 | n/a |
| `payments/sdk-rust` | fora | pay-out | API-10 | n/a |
| `payments/service-seller` | fora | pay-out | API-10 | n/a |
| `payments/service-seller-prompt` | fora | pay-out | API-10 | n/a |
| `payments/service-seller-reverseproxy` | fora | pay-out | API-10 | n/a |
| `payments/service-seller-sdk` | fora | pay-out | API-10 | n/a |
| `payments/subscription` | referencia | pay-ref | API-10 | n/a |
| `payments/supported-networks` | referencia | pay-ref | API-10 | n/a |
| `trade/api-fee` | integrar-agora | trade-fee | API-3, WAL-5 | T3.4, T9.5 |
| `trade/dex-aggregation-faq` | referencia | trade-ref | API-6 | n/a |
| `trade/dex-ai-tools-introduction` | fora | trade-mcp | API-1 | n/a |
| `trade/dex-ai-tools-llm` | fora | trade-mcp | API-1 | n/a |
| `trade/dex-ai-tools-mcp-server` | fora | trade-mcp | API-1 | n/a |
| `trade/dex-ai-tools-skills` | fora | trade-mcp | API-1 | n/a |
| `trade/dex-api-addfee` | fora | trade-fee-partner | API-6 | n/a |
| `trade/dex-api-intent-solver` | fora | trade-solver | API-6 | n/a |
| `trade/dex-api-intent-solver-management` | fora | trade-solver | API-6 | n/a |
| `trade/dex-api-intent-solver-notify` | fora | trade-solver | API-6 | n/a |
| `trade/dex-api-intent-solver-quote` | fora | trade-solver | API-6 | n/a |
| `trade/dex-api-intent-solver-settle` | fora | trade-solver | API-6 | n/a |
| `trade/dex-api-intent-solver-solve` | fora | trade-solver | API-6 | n/a |
| `trade/dex-api-introduction` | referencia | trade-ref | API-6 | n/a |
| `trade/dex-api-market-maker` | fora | trade-solver | API-6 | n/a |
| `trade/dex-api-market-maker-firm-order` | fora | trade-solver | API-6 | n/a |
| `trade/dex-api-market-maker-pricing` | fora | trade-solver | API-6 | n/a |
| `trade/dex-api-market-maker-sdk` | fora | trade-solver | API-6 | n/a |
| `trade/dex-api-reference` | referencia | trade-ref | API-6 | n/a |
| `trade/dex-approve-transaction` | sob-demanda | trade-prepare | WAL-6 | T9.6 |
| `trade/dex-error-code` | integrar-agora | trade-errors | API-5, API-12 | T3.3 |
| `trade/dex-get-aggregator-supported-chains` | integrar-agora | trade-read | WAL-5 | T9.5 |
| `trade/dex-get-liquidity` | integrar-agora | trade-read | WAL-5 | T9.5 |
| `trade/dex-get-quote` | integrar-agora | trade-read | WAL-5 | T9.5 |
| `trade/dex-get-tokens` | integrar-agora | trade-read | WAL-5 | T9.5 |
| `trade/dex-intent-approve-transaction` | depois | trade-intent | WAL-9 | n/a |
| `trade/dex-intent-auction-info` | depois | trade-intent | WAL-9 | n/a |
| `trade/dex-intent-cancel-order` | depois | trade-intent | WAL-9 | n/a |
| `trade/dex-intent-cancel-sign` | depois | trade-intent | WAL-9 | n/a |
| `trade/dex-intent-create-order` | depois | trade-intent | WAL-9 | n/a |
| `trade/dex-intent-get-quote` | depois | trade-intent | WAL-9 | n/a |
| `trade/dex-intent-order-list` | depois | trade-intent | WAL-9 | n/a |
| `trade/dex-intent-order-status` | depois | trade-intent | WAL-9 | n/a |
| `trade/dex-intent-reference` | referencia | trade-ref | API-6 | n/a |
| `trade/dex-intent-supported-chains` | depois | trade-intent | WAL-9 | n/a |
| `trade/dex-sdk-evm` | fora | trade-sdk | WAL-8 | n/a |
| `trade/dex-sdk-introduction` | fora | trade-sdk | WAL-8 | n/a |
| `trade/dex-sdk-solana` | fora | trade-sdk | WAL-8 | n/a |
| `trade/dex-sdk-sui` | fora | trade-sdk | WAL-8 | n/a |
| `trade/dex-smart-contract` | referencia | trade-ref | API-6 | n/a |
| `trade/dex-solana-swap-instruction` | sob-demanda | trade-prepare | WAL-6 | T9.6 |
| `trade/dex-swap` | sob-demanda | trade-prepare | WAL-6 | T9.6 |
| `trade/dex-swap-api-introduction` | referencia | trade-ref | API-6 | n/a |
| `trade/dex-swap-history` | depois | trade-history | API-6 | n/a |
| `trade/dex-use-swap` | referencia | trade-ref | API-6 | n/a |
| `trade/dex-use-swap-quick-start` | referencia | trade-examples | WAL-8 | n/a |
| `trade/dex-use-swap-solana-advance-control` | referencia | trade-examples | WAL-8 | n/a |
| `trade/dex-use-swap-solana-quick-start` | referencia | trade-examples | WAL-8 | n/a |
| `trade/dex-use-swap-sui-quick-start` | referencia | trade-examples | WAL-8 | n/a |
| `trade/dex-use-swap-ton-quick-start` | referencia | trade-examples | WAL-8 | n/a |
| `trade/dex-widget` | fora | trade-widget | WAL-8 | n/a |
| `trade/intent-swap-quickstart` | depois | trade-intent | WAL-9 | n/a |
| `trade/onchain-gateway-api-broadcast-transaction` | fora | trade-gw-send | WAL-8 | n/a |
| `trade/onchain-gateway-api-chains` | integrar-agora | trade-gw-chains | CHN-3 | T3.6 |
| `trade/onchain-gateway-api-gas-limit` | sob-demanda | trade-gw-gas | WAL-6 | T9.5 |
| `trade/onchain-gateway-api-gas-price` | sob-demanda | trade-gw-gas | WAL-6 | T9.5 |
| `trade/onchain-gateway-api-introduction` | referencia | trade-ref | API-6 | n/a |
| `trade/onchain-gateway-api-orders` | fora | trade-gw-send | WAL-8 | n/a |
| `trade/onchain-gateway-api-simulate-transaction` | depois | trade-gw-sim | WAL-9 | n/a |
| `trade/onchain-gateway-error-code` | integrar-agora | trade-errors | API-5, API-12 | T3.3 |
| `trade/onchain-gateway-reference` | referencia | trade-ref | API-6 | n/a |
| `trade/smart-contract-safety` | referencia | trade-ref | API-6 | n/a |
| `trade/solana-rfq-error-code` | fora | trade-solver | API-6 | n/a |
| `trade/solana-rfq-firm-order` | fora | trade-solver | API-6 | n/a |
| `trade/solana-rfq-integration` | fora | trade-solver | API-6 | n/a |
| `trade/solana-rfq-pricing` | fora | trade-solver | API-6 | n/a |
| `trade/support` | referencia | trade-ref | API-6 | n/a |
| `wallet/agentic-quickstart` | fora | wal-agentic | WAL-8 | n/a |
| `wallet/agentic-wallet` | fora | wal-agentic | WAL-8 | n/a |
| `wallet/agentic-wallet-skills` | fora | wal-agentic | WAL-8 | n/a |
| `wallet/balance-api-all-token-balances` | integrar-agora | wal-balance | WAL-4 | T9.4 |
| `wallet/balance-api-chains` | integrar-agora | wal-chains | CHN-3 | T3.6 |
| `wallet/balance-api-overview` | referencia | wal-ref | API-6 | n/a |
| `wallet/balance-api-reference` | referencia | wal-ref | API-6 | n/a |
| `wallet/balance-api-token-balances` | integrar-agora | wal-balance | WAL-4 | T9.4 |
| `wallet/balance-api-total-value` | integrar-agora | wal-balance | WAL-4 | T9.4 |
| `wallet/balance-error-code` | integrar-agora | wal-errors | API-5, API-12 | T3.3 |
| `wallet/dapp-connect/app-connect-aptos` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-aptos-sdk` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-aptos-ui` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-bitcoin` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-bitcoin-sdk` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-bitcoin-ui` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-cosmos` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-cosmos-sdk` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-cosmos-ui` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-evm` | especificado-desligado | dc-qr | WAL-3 | T9.3 |
| `wallet/dapp-connect/app-connect-evm-sdk` | especificado-desligado | dc-qr | WAL-3 | T9.3 |
| `wallet/dapp-connect/app-connect-evm-ui` | especificado-desligado | dc-qr | WAL-3 | T9.3 |
| `wallet/dapp-connect/app-connect-faq` | especificado-desligado | dc-qr | WAL-3 | T9.3 |
| `wallet/dapp-connect/app-connect-preparation` | especificado-desligado | dc-qr | WAL-3 | T9.3 |
| `wallet/dapp-connect/app-connect-solana` | especificado-desligado | dc-qr | WAL-3 | T9.3 |
| `wallet/dapp-connect/app-connect-solana-sdk` | especificado-desligado | dc-qr | WAL-3 | T9.3 |
| `wallet/dapp-connect/app-connect-solana-ui` | especificado-desligado | dc-qr | WAL-3 | T9.3 |
| `wallet/dapp-connect/app-connect-starknet` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-starknet-sdk` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-starknet-ui` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-sui` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-sui-sdk` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-sui-ui` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-ton` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-ton-sdk` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-ton-ui` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-tron` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-tron-sdk` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/app-connect-tron-ui` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/aptos/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/aptos/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/bitcoin/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/bitcoin/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/bitcoin/provider-fractal` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/bitcoin/provider-signet` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/bitcoin/provider-testnet` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/cardano/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/cardano/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/cosmos/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/cosmos/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/evm/introduce` | integrar-agora | dc-evm-sol | WAL-1, WAL-2 | T9.1, T9.2 |
| `wallet/dapp-connect/chains/evm/provider` | integrar-agora | dc-evm-sol | WAL-1, WAL-2 | T9.1, T9.2 |
| `wallet/dapp-connect/chains/evm/web-access-user-accounts` | integrar-agora | dc-evm-sol | WAL-1, WAL-2 | T9.1, T9.2 |
| `wallet/dapp-connect/chains/evm/web-add-network` | integrar-agora | dc-evm-sol | WAL-1, WAL-2 | T9.1, T9.2 |
| `wallet/dapp-connect/chains/evm/web-detect-user-network` | integrar-agora | dc-evm-sol | WAL-1, WAL-2 | T9.1, T9.2 |
| `wallet/dapp-connect/chains/evm/web-display-tokens` | depois | dc-evm-later | WAL-9 | n/a |
| `wallet/dapp-connect/chains/evm/web-interact-with-smart-contracts` | depois | dc-evm-later | WAL-9 | n/a |
| `wallet/dapp-connect/chains/evm/web-send-transaction` | especificado-desligado | dc-send | WAL-9 | n/a |
| `wallet/dapp-connect/chains/near/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/near/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/nostr/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/nostr/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/solana/introduce` | integrar-agora | dc-evm-sol | WAL-1, WAL-2 | T9.1, T9.2 |
| `wallet/dapp-connect/chains/solana/provider` | integrar-agora | dc-evm-sol | WAL-1, WAL-2 | T9.1, T9.2 |
| `wallet/dapp-connect/chains/solana/web-solana-detect-user-network` | integrar-agora | dc-evm-sol | WAL-1, WAL-2 | T9.1, T9.2 |
| `wallet/dapp-connect/chains/solana/web-solana-switch-network` | integrar-agora | dc-evm-sol | WAL-1, WAL-2 | T9.1, T9.2 |
| `wallet/dapp-connect/chains/stacks/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/stacks/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/starknet/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/starknet/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/sui/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/sui/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/ton/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/ton/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/tron/connect` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/tron/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/tron/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/wax/introduce` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/chains/wax/provider` | depois | dc-other | WAL-1 | n/a |
| `wallet/dapp-connect/okx-wallet-integration-introduction` | integrar-agora | dc-intro | WAL-1 | T1.1, T9.1 |
| `wallet/dapp-connect/okx-wallet-integration-supported-networks` | integrar-agora | dc-intro | WAL-1 | T1.1, T9.1 |
| `wallet/dapp-connect/web-detect-okx-wallet` | integrar-agora | dc-intro | WAL-1 | T1.1, T9.1 |
| `wallet/dapp-connect/web-display-dapp-icon` | referencia | dc-icon | WAL-3 | n/a |
| `wallet/defi-api-overview` | referencia | wal-ref | API-6 | n/a |
| `wallet/defi-error-code` | integrar-agora | wal-errors | API-5, API-12 | T3.3 |
| `wallet/defi-product-api-reference` | referencia | wal-ref | API-6 | n/a |
| `wallet/defi-product-depth-price-chart` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-product-detail` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-product-introduction` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-product-prepare` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-product-rate-chart` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-product-search` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-product-supported-chains` | integrar-agora | wal-chains | CHN-3 | T3.6 |
| `wallet/defi-product-supported-platforms` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-product-tvl-chart` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-transaction-api-reference` | referencia | wal-ref | API-6 | n/a |
| `wallet/defi-transaction-claim` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-transaction-enter` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-transaction-exit` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-transaction-introduction` | depois | wal-defi-later | WAL-9 | n/a |
| `wallet/defi-user-asset-api-reference` | referencia | wal-ref | API-6 | n/a |
| `wallet/defi-user-asset-overview` | sob-demanda | wal-defi-assets | WAL-4, API-8 | T9.4, T3.8 |
| `wallet/defi-user-asset-platform-detail` | sob-demanda | wal-defi-assets | WAL-4, API-8 | T9.4, T3.8 |
| `wallet/defi-user-asset-platform-list` | sob-demanda | wal-defi-assets | WAL-4, API-8 | T9.4, T3.8 |
| `wallet/install-your-agentic-wallet` | fora | wal-agentic | WAL-8 | n/a |
| `wallet/onchain-gateway-api-broadcast-transaction` | fora | wal-gw-send | WAL-8 | n/a |
| `wallet/onchain-gateway-api-chains` | integrar-agora | wal-chains | CHN-3 | T3.6 |
| `wallet/onchain-gateway-api-gas-limit` | sob-demanda | wal-gw-gas | WAL-6 | T9.5 |
| `wallet/onchain-gateway-api-gas-price` | sob-demanda | wal-gw-gas | WAL-6 | T9.5 |
| `wallet/onchain-gateway-api-orders` | fora | wal-gw-send | WAL-8 | n/a |
| `wallet/onchain-gateway-api-overview` | referencia | wal-ref | API-6 | n/a |
| `wallet/onchain-gateway-api-reference` | referencia | wal-ref | API-6 | n/a |
| `wallet/onchain-gateway-api-simulate-transaction` | depois | wal-gw-sim | WAL-9 | n/a |
| `wallet/onchain-gateway-error-code` | referencia | wal-ref | API-6 | n/a |
| `wallet/product-and-service` | referencia | wal-ref | API-6 | n/a |
| `wallet/run-your-first-ai-agent` | fora | wal-agentic | WAL-8 | n/a |
| `wallet/supported-networks` | integrar-agora | wal-networks | CHN-1 | T3.6 |
| `wallet/tx-history-api-chains` | integrar-agora | wal-chains | CHN-3 | T3.6 |
| `wallet/tx-history-api-detail` | integrar-agora | wal-txhist | WAL-4 | T9.4 |
| `wallet/tx-history-api-history` | integrar-agora | wal-txhist | WAL-4 | T9.4 |
| `wallet/tx-history-api-overview` | referencia | wal-ref | API-6 | n/a |
| `wallet/tx-history-api-reference` | referencia | wal-ref | API-6 | n/a |
| `wallet/tx-history-error-code` | integrar-agora | wal-errors | API-5, API-12 | T3.3 |
| `wallet/wallet-api-introduction` | referencia | wal-ref | API-6 | n/a |
| `xlayer/developer/bridge/get-testnet-okb-from-faucet` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/bridge/overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/bridge/usdc-on-x-layer` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/build-on-xlayer/about-xlayer` | referencia | xl-ref | API-6 | n/a |
| `xlayer/developer/build-on-xlayer/address-format` | integrar-agora | xl-const | CHN-1, CHN-2 | T3.6 |
| `xlayer/developer/build-on-xlayer/contracts` | integrar-agora | xl-const | CHN-1, CHN-2 | T3.6 |
| `xlayer/developer/build-on-xlayer/network-information` | integrar-agora | xl-const | CHN-1, CHN-2 | T3.6 |
| `xlayer/developer/build-on-xlayer/safe-wallet` | referencia | xl-ref | API-6 | n/a |
| `xlayer/developer/builder-codes/integration` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/builder-codes/overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/builder-codes/wallet-providers` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/address` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/address-information` | sob-demanda | xl-data-demand | API-4 | T3.3 |
| `xlayer/developer/data/address-transaction-list` | sob-demanda | xl-data-demand | API-4 | T3.3 |
| `xlayer/developer/data/batch-get-block-transactions` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/batch-get-internal-transactions-by-hash` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/batch-get-token-transactions-by-hash` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/batch-get-transactions-by-hash` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/block` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/block-details` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/block-list` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/block-transaction-list` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/contract-verification` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/contract-verification-results` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/error` | referencia | xl-ref | API-6 | n/a |
| `xlayer/developer/data/internal-transaction-by-hash` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/internal-transactions-by-address` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/internal-transactions-by-address-and-block` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/large-transaction-list` | sob-demanda | xl-data-demand | API-4 | T3.3 |
| `xlayer/developer/data/log` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/logs-by-address` | sob-demanda | xl-data-demand | API-4 | T3.3 |
| `xlayer/developer/data/logs-by-address-and-topic` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/logs-by-block-and-address` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/logs-by-hash` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/native-token-holder-addresses` | depois | xl-data-unique | API-6 | n/a |
| `xlayer/developer/data/normal-transactions-by-address` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/normal-transactions-by-address-and-block` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/overview` | referencia | xl-ref | API-6 | n/a |
| `xlayer/developer/data/proxy-contract-verification-results` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/token` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/token-balance-details-by-address` | sob-demanda | xl-data-demand | API-4 | T3.3 |
| `xlayer/developer/data/token-holder-list` | depois | xl-data-unique | API-6 | n/a |
| `xlayer/developer/data/token-list` | sob-demanda | xl-data-demand | API-4 | T3.3 |
| `xlayer/developer/data/token-transaction-by-hash` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/token-transactions-by-address` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/token-transfer-details` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/transaction` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/transaction-details-by-hash` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/transaction-list` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/tz-address` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-address-information` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-address-transaction-list` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-batch-get-block-transactions` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-batch-get-cross-chain-transactions` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-batch-get-transactions` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-block` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-block-details` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-block-list` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-block-transaction-list` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-cross-chain` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-cross-chain-transaction-details` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-cross-chain-transaction-list` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-introduction` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-transaction` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-transaction-details` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/tz-transaction-list` | fora | xl-tz | API-6 | n/a |
| `xlayer/developer/data/unconfirmed-ransaction-list` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/verified-contract-abi-and-source-code` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/verify-contract-source-code` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/verify-proxy-contract` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/data/xlayer-introduction` | referencia | xl-ref | API-6 | n/a |
| `xlayer/developer/deploy-a-smart-contract/deploy-with-foundry` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/deploy-a-smart-contract/deploy-with-hardhat` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/deploy-a-smart-contract/deploy-with-truffle` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/deploy-a-smart-contract/deploying-contract` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/flashblocks/faq` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/flashblocks/node-providers` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/flashblocks/overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/rpc-endpoints/rpc-endpoints` | depois | xl-rpc | API-6 | n/a |
| `xlayer/developer/setup-rpc/overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/setup-rpc/setup-rpc` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/setup-rpc/snapshots` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/account-abstraction-overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/account-abstraction/particle-network` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/account-abstraction/safe` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/block-explorers-overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/cross-chain-overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/cross-chain/connext` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/cross-chain/layer-zero` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/data-indexers-overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/data-indexers/subquery` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/data-indexers/subsquid` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/data-indexers/the-graph` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/dev-tooling-overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/dev-tooling/thirdweb` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/node-providers-overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/node-providers/alchemy` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/node-providers/blockdaemon` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/node-providers/blockpi` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/node-providers/getblock` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/node-providers/quicknode` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/node-providers/tenderly` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/node-providers/zan` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/oracles-overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/oracles/api3` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/oracles/chainlink` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/oracles/redstone` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/oracles/supraoracles` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/overview` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/user-onboarding` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/tools/user-onboarding/privy` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/verify-a-smart-contract/manual-verification` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/verify-a-smart-contract/verify-with-foundry` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/verify-a-smart-contract/verify-with-hardhat` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/verify-a-smart-contract/verifying-contract` | fora | xl-out | API-6 | n/a |
| `xlayer/developer/websockets-endpoints/websocket-endpoints` | depois | xl-rpc | API-6 | n/a |
