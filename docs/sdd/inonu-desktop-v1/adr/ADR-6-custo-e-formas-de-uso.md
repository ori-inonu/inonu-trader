# ADR-6 Custo da API e decisão por forma de uso da OnchainOS

Estado: proposta. Requisitos: API-1 a API-12, U3, U13. Evidência: [onchainos-coverage.md](../onchainos-coverage.md) (499 páginas); `okx-docs/market/market-api-fee.txt`, `how-to-finish-api-payment.txt`, `home/api-access-and-usage.txt`, `home/developer-portal.txt`.

## Contexto

A OnchainOS oferece várias formas de uso. O plano atual é gratuito: 100 mil chamadas Basic e 100 mil Premium por mês, **sem WebSocket**. Acima disso o provedor exige pagamento x402 (USDG ou USDT na X Layer, assinatura EIP-3009 por chamada) ou assinatura mensal (Starter US$ 99, Growth US$ 199, Scale US$ 399, Pro US$ 599, Enterprise sob consulta). O app nunca deve assinar sozinho.

## Decisão por forma de uso

| Forma | O que é | Decisão |
| --- | --- | --- |
| REST assinado `/api/v6/dex/*` e `/api/v6/explorer/*` | HMAC-SHA256 de `timestamp + METHOD + path + body`, Base64, 4 cabeçalhos, tolerância de 30 s | **Principal**, só pelo gateway local (API-1) com catálogo, TTL e orçamento |
| WebSocket `wss://wsdex.okx.com/ws/v6/dex` | 9 canais (preço, price-info, token, velas, trades, sinais, memepump, rastreador de endereços, KOL e smart money); exige plano pago; 3 conexões por segundo por chave; 480 inscrições por hora por conexão; `ping` antes de 30 s | Adaptador **especificado e desligado** (API-7); polling com TTL até o dono assinar |
| MCP `https://web3.okx.com/api/v1/onchainos-mcp` | só `OK-ACCESS-KEY`; poucas ferramentas | **Não usar**: perde o controle de chamadas e do formato compacto |
| Skills, CLI `onchainos`, Agentic Wallet | assina sozinho por skill; fundos na carteira TEE | **Fora** (D-U3) |
| Pagamento x402 | assinatura por chamada com chave no `.env` ou carteira TEE | **Fora na v1** (API-10, coerente com `payments/payment-use-buyer` como "depois"): **402** vira "cota esgotada" (o gateway já responde `provider_payment_required` e bloqueia a camada por 1 h) e serve cache; **50011** (HTTP 429) é limite de taxa, não de cota: recuo e `rate_limited`. Um modo opcional futuro exigiria decisão própria: carteira descartável de no máximo cerca de US$ 5, processo isolado, teto mensal aprovado, política fixando host `web3.okx.com`, rede `eip155:196`, ativo USDG ou USDT e `payTo` confirmado, valor máximo de 0,0005 por chamada e log de cada pagamento |
| Assinatura mensal | paga pelo usuário no Developer Portal com a carteira dele | Opção do dono; não implementada pelo app. Starter só supera x402 acima de cerca de 990 mil chamadas Basic excedentes por mês |
| DApp Connect (extensão e QR) | conexão da carteira | **Integrar** (ADR-5) |
| Trade API (agregador, Intent Swap, gateway) | cotação e calldata não assinados | Cotação e simulação somente leitura; envio só pela carteira do usuário, atrás de portão (WAL-9) |
| Dados on-chain v6 (explorer) | forense de endereço, transações e logs | Sob demanda e em lote (até 20 `txId`, até 50 endereços); `log/by-transaction` explica uma troca |
| X Layer RPC (100 requisições por segundo por IP, sem cota) e Data API v5 | cadeia 196 | **Depois**: o RPC é o caminho sem cota para logs e saldos em 196 |
| OKX.AI e A2A | mercado de agentes com custódia e escrow | **Fora** |

## Orçamento por pedido ao Inonu

Modo token (até 15 chamadas, cerca de 5 Basic e 6 Premium): `token/search` (só se vier símbolo), `price-info` em lote com BTC, ETH, SOL e o nativo da rede, `candles` 1H, `trades` sem filtro e com `tagFilter=3`, `signal/list` por token, `top-trader` com `tagFilter=3`, `advanced-info`, `top-liquidity`, `cluster/overview`, `cluster/top-holders` e `sentiment/symbol`. Modo descoberta: `hot-token` por entrada líquida, `signal/list`, `address-tracker/trades`, `memepump/tokenList` só em Solana e BNB, `price-info` em lote da lista curta e aprofundamento só das 3 melhores. Na cota gratuita cabem cerca de 16 mil pedidos por mês **se nada mais usar Premium** (o teto padrão do gateway é de 50 mil por camada, abaixo da cota de 100 mil). O governador corta qualquer pedido acima de 15 chamadas (API-3). "Pedir ao Inonu" em várias linhas do Rastreador aceita **até 5 linhas por pedido** (uma consulta de `signal/list` por token): 10 linhas custariam cerca de 20 chamadas e só vão adiante com um teto maior aprovado pelo usuário.

## Fatos que viram requisito e medição

Sem limite numérico de requisições por segundo publicado para o Market API (limitador de cerca de 1 por segundo e recuo em 50011 até medir, API-11); lote em `POST` pode contar 1 chamada ou N (medir, API-8); códigos 50038 chegam com HTTP 200; enums de tipo de carteira e nomes de campo divergem entre endpoints (API-5); `address-tracker/trades` e `social/*` não aparecem na tabela de preços; a documentação diverge sobre o `price-info` (tabela diz US$ 0,0002, exemplo mostra `amount: "500"`).

## Consequências

O custo variável do provedor é limitado a zero pela política "nunca paga"; o custo do modelo é controlado pelo ledger e pelos tetos (ASK-5, ASK-6). O limite de 3 projetos por conta e 3 chaves por projeto, a região (50125) e o plano real do usuário no portal ficam como dependências do usuário (T0.3).
