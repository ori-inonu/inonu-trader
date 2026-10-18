# Carteira OKX conectada: ler, preparar e (desligado) enviar

Parte do [SPEC](SPEC.md): WAL-1 a WAL-9, U13, U14, D-U3. Decisão: [ADR-5](adr/ADR-5-carteira.md). Tarefas: M9 em [TASKS.md](TASKS.md). Código novo em `web/src/lib/wallet/` e `src/onchain-read/`; reaproveita sem editar `web/src/lib/okx-wallet.ts` e `web/src/lib/okx-solana.ts` (zona Z3).

**Regra firme (WAL-8):** o app nunca guarda chave privada, nunca assina sozinho, o servidor nunca difunde transação, e nunca usa Agentic Wallet, `@okx-dex/okx-dex-sdk` nem o DEX Widget. Só a janela da carteira assina, depois de clique do usuário.

## 1. Conexão (WAL-1, WAL-2, WAL-3)

Ordem de detecção:

1. `window.okxwallet` (EVM, EIP-1193: `request`, `on`, `removeListener`; Solana em `okxwallet.solana`). **O código existente já faz isso** (`web/src/lib/okx-wallet.ts`: descoberta por EIP-6963 nas linhas 959 a 966, `eth_requestAccounts` na 674, `wallet_switchEthereumChain` na 785): T9.1 o estende, não o reescreve, e o único método novo é `wallet_addEthereumChain` (T9.2). A documentação da OKX não cita EIP-6963, então o spike T1.1 verifica se a extensão anuncia mesmo e se injeta em `http://127.0.0.1` dentro de uma janela `msedge --app`.
2. Sem extensão: OKX Connect por QR (`OKXUniversalProvider.init({ DAppMetaData: { name, icon } })`, o ícone deve ser PNG ou ICO, não SVG), exige o app OKX 6.88 ou posterior (6.90.1 para Solana e UI). No export estático isto precisa ser validado (T9.3); se falhar, a limitação fica registrada.
3. Sem nenhum dos dois: o Doctor mostra como instalar a extensão (a máquina do usuário já a tem no Edge).

Regras de uso:

- `eth_requestAccounts` e `solana.connect()` **só em resposta a clique**, com o botão desabilitado enquanto pendente (um pedido por vez: erro -32002 significa que já há um diálogo aberto).
- Eventos: `accountsChanged`, `chainChanged` (recarrega o estado, não a página), `disconnect`.
- Troca e adição de rede, só por clique: `wallet_switchEthereumChain({ chainId })`; em 4902 (rede desconhecida) `wallet_addEthereumChain({ chainId, chainName, rpcUrls, nativeCurrency, blockExplorerUrls })` com dados de `providers.json`. A tabela padrão da OKX tem 18 redes (Ethereum, ETHW, OKT, BSC, Polygon, Avalanche C, Fantom, Arbitrum, Optimism, Cronos, Klaytn, KCC, Metis, Boba, Gnosis, Moonriver, Moonbeam, Conflux eSpace) e **não** lista Base, Linea, zkSync nem Mantle: tratar 4902.
- Solana: `okxwallet.svm.getNetwork()` e `changeNetwork({ genesisHash })`; a mainnet é `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`.
- Códigos tratados: 4001 recusou, 4100 não autorizado, 4900 desconectado, 4902 rede desconhecida, -32002 diálogo já aberto; OKX Connect: 300 recusou, 400 método não suportado, 500 rede não suportada, 700 erro de conexão. Cada código tem texto próprio (sem acentos) e ação.
- Escopo de redes da v1: EVM e Solana. Bitcoin (`okxwallet.bitcoin`), Sui (wallet-standard), Tron (`okxwallet.tronLink`), TON (`window.okxTonWallet.tonconnect`), Aptos, Cosmos e Starknet ficam registradas como "depois".
- Pré-configuração (U14): nenhuma chave existe; "pré-configurada" significa que o instalador e o lançador já escolhem o perfil do navegador com a extensão e que a lista de redes e os RPCs vêm de `providers.json`.

## 2. Leituras do endereço conectado (WAL-4)

Todas pelo gateway, com cache, TTL e orçamento; o endereço sai do navegador para o gateway local apenas para essas consultas (nunca para o modelo sem o Brief sanitizado: endereço encurtado).

| Dado | Endpoint | Camada | Observação |
| --- | --- | --- | --- |
| Valor total | `GET /api/v6/dex/balance/total-value-by-address` | Free | até 50 redes por consulta |
| Saldos por token | `GET /balance/all-token-balances-by-address`, `POST /balance/token-balances-by-address` | Free | `isRiskToken` (o filtro de honeypot só vale em ETH, BSC, SOL, BASE); até 20 tokens por consulta |
| Histórico | `GET /post-transaction/transactions-by-address`, `.../transaction-detail-by-txhash` | Free | 6 meses; 20 linhas por rede (100 entre redes) |
| PnL por token | `GET /market/portfolio/token/latest-pnl` | Basic | um token por chamada |
| Visão geral e PnL recente | `GET /market/portfolio/overview`, `/portfolio/recent-pnl` | Premium | uma rede por chamada |
| Histórico de DEX | `GET /market/portfolio/dex-history` | Basic | `begin` e `end` obrigatórios |
| Posições DeFi | `POST /api/v6/defi/user/asset/platform/list`, `.../platform/detail` | não documentado (a medir) | `healthRate`, `availableRewards`, `totalEarnings` |

Aba **Carteira** mostra o que o usuário tem e quando foi lido (idade, origem), sem totais sem fonte. Dados que dependem de camada desconhecida ficam atrás de medição (T3.8).

## 3. Cotação e ticket de ordem (WAL-5, WAL-6, WAL-7)

- **Escada de cotações** (`GET /aggregator/quote`, só `chainIndex`, `amount` em menor unidade, `fromTokenAddress`, `toTokenAddress`): para até 5 tamanhos, mostra `toTokenAmount`, `priceImpactPercent`, `dexRouterList` (rota e divisões), `tradeFee`, `estimateGasFee`, `isHoneyPot`, `taxRate`, `tokenUnitPrice`. A cotação **não** traz mínimo recebido; ele vem do `/swap`. Trial da Trade API: 1 requisição por segundo (até 5 sob aprovação), respeitado pelo gateway, e **válido por 60 dias a partir da criação da chave** (F19; data desconhecida): depois dele a escada e o ticket entram em estado degradado explícito e mostram que, no plano seguinte, o ganho de slippage positivo pode ficar com a OKX (API-14).
- **Ticket de ordem** (somente exibição): chama `GET /aggregator/swap` (precisa de `slippagePercent` e `userWalletAddress`) e `GET /aggregator/approve-transaction`, e **mostra** `routerResult`, `minReceiveAmount`, `slippagePercent`, impacto e a etapa de aprovação, com o aviso de impacto acima do limite definido pelo usuário. **Não existe botão nem caminho de envio** (teste de varredura: nenhuma chamada a `eth_sendTransaction`, `signAndSendTransaction`, `wallet_sendCalls`, `broadcast-transaction`).
- **Aceitar** a sugestão do Inonu apenas preenche o ticket (par, rede, tamanho sugerido dentro de um teto), nunca o envia.
- Intent Swap (EIP-712, redes 1, 56, 42161, 8453 e 196) e DeFi `enter`, `exit`, `claim` (calldata em etapas) ficam **especificados para depois**; ambos devolvem dados não assinados.

## 4. Envio pela carteira do usuário: especificado e desligado (WAL-9)

Implementar exige autorização expressa do usuário em ciclo próprio. Quando autorizado, o portão é cumulativo e **todo** item deve valer, caso contrário o botão não aparece:

1. Opção em Configurações "Permitir enviar pela minha carteira", **desligada por padrão**, com texto explícito de risco.
2. Teto por operação em USD definido pelo usuário e teto diário; sem teto definido, sem envio.
3. Cotação e calldata com menos de 30 s; se passou, refaz e pede nova confirmação.
4. `priceImpactPercent` e taxa dentro do limite do usuário; `isHoneyPot` falso e `taxRate` abaixo do limite.
5. `minReceiveAmount` exibido e o slippage do `/swap` igual ao confirmado.
6. Confirmação digitada (por exemplo, o símbolo do ativo e o valor) além do clique, e o clique que abre o popup da carteira.
7. O envio é feito **pelo navegador** com `eth_sendTransaction` ou `solana.signAndSendTransaction` do provider; o servidor nunca assina nem difunde; `chainId` do pedido é ignorado pela extensão e tirado da carteira, então a rede é checada antes.
8. Botão de parada geral (kill switch) e log local de cada tentativa (hash da transação, resultado, ids do ticket e do pedido ao Inonu), sem segredos.
9. Sem pagamento x402, sem Agentic Wallet, sem SDK, sem Widget.

Aceitação: o [SPEC](SPEC.md) AC-WAL-5 só exige este documento e a opção desligada.

## 5. Testes e spikes

- **T1.1 (spike A)**: abrir `msedge --app=http://127.0.0.1:<porta>/ --profile-directory=Default` e verificar no console `typeof window.okxwallet`, `window.okxwallet?.isOkxWallet` e um ouvinte de `eip6963:announceProvider`. Exige tela desbloqueada.
- **T9.1**: provider falso rotulado `synthetic_fixture` para testar estados e códigos de erro; conferência manual com a extensão real.
- **T9.3 (spike)**: `@okxconnect/universal-provider` no export estático; se o pacote não empacotar, registrar.
- **WAL-6/WAL-8**: teste estático que falha se qualquer arquivo novo contiver os métodos de envio ou importar os pacotes proibidos (`@okx-dex/okx-dex-sdk`, `@okxweb3/dex-widget`, `@okxweb3/x402-*`).
