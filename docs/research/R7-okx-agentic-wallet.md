# R7: OKX Onchain OS e Agentic Wallet: fluxo agêntico, catálogo de APIs e plano de integração

Pesquisa documental de 2026-10-11, só com acesso público: sem login, conta, chave de API, instalação do CLI, assinatura, transação ou leitura de .env. Estende R1 (capacidades da Open API) e R2 (modelos de permissão); não repete o que lá está, só referencia. Não é aconselhamento financeiro.

**Legenda.** `confirmado` = lido em página oficial da OKX ou no código-fonte oficial do CLI (repositório `okx/onchainos-skills`, branch main, v4.6.4 de 2026-10-09) sem conflito; `parcial` = lido só em uma fonte ou com lacuna; `não verificado` = não localizado em fonte oficial. `K4` = cabeçalhos OK-ACCESS-KEY, OK-ACCESS-SIGN (HMAC SHA256 em Base64), OK-ACCESS-TIMESTAMP e OK-ACCESS-PASSPHRASE da Open API. `JWT` = `Authorization: Bearer <accessToken>` do canal privado do Agentic Wallet. Caminhos `/priapi/...` vêm do código do CLI, não de página de referência; a OKX não os documenta publicamente e pode mudá-los sem aviso.

**Método.** Páginas lidas por ferramenta que resume texto; números e nomes de campos críticos foram reconferidos em segunda fonte quando havia (código do CLI, skill, página). As páginas em `/pt-br/` têm o mesmo conteúdo das inglesas (conferido na página do Agentic Wallet). Estado do repositório lido: `src/operator/*.ts`, `src/okx-wallet/*.ts`, `scripts/okx-operator.ts`, `docs/OKX-OPERADOR-JEV.md`, R1 a R5.

## 1. Resumo executivo

1. O Agentic Wallet é uma carteira custodiada em enclave (TEE) da OKX, criada por login social (e-mail, Google, Apple) ou por chave do Developer Portal (modo "AK"); gera endereços EVM, Solana, Bitcoin e Sui e até 50 subcontas por login. Não existe API REST pública para ela: o único canal documentado é o CLI `onchainos` (binário Rust, também servidor MCP local) e as skills em linguagem natural; por baixo, o CLI fala com endpoints privados `/priapi/v5/wallet/agentic/*` autenticados por JWT.
2. Quem segura a chave da cadeia é o TEE. O agente nunca a vê. O que o agente tem é uma sessão: no login, o CLI gera um par X25519 local, o servidor devolve uma semente ed25519 cifrada com HPKE (`encryptedSessionSk`), um `sessionCert`, um `saTeeId` e `sessionKeyExpireAt`; tokens de acesso e refresh vão para o keyring do SO (ou `~/.onchainos/keyring.enc`).
3. Toda ação segue o mesmo trio: `pre-transaction/unsignedInfo` (o servidor monta e pré-executa a transação e devolve `executeResult`, hashes e `sessionCert`), assinatura local dos hashes com a chave de sessão ed25519 (`sessionSignature`, `signature` EIP-191), e `pre-transaction/broadcast-transaction` (o TEE verifica a sessão, assina com a chave real e envia; devolve `orderId` e `txHash`). Pré-execução reprovada aborta antes do envio; aviso de risco volta como código 81362 e exige repetir com `--force`.
4. A política tem só quatro regras, definidas pelo dono no portal web (nunca pelo agente): limite por transação em USD, limite diário de transferência, limite diário de trade (swaps), whitelist de destinos de transferência; os diários zeram às 00:00 UTC. O CLI só lê a política (`policy/query`) e não aplica nada localmente; onde o servidor aplica (API ou TEE) não está documentado: não verificado. Não há allowlist de contrato nem de seletor.
5. Cadeias: a matriz oficial lista Monad (143) e X Layer (196) como suportadas pelo Agentic Wallet (mais de 55 redes); o CLI traz 9 redes estáticas para criação de endereço (sem Monad) e manda consultar `wallet chains` em tempo de execução. Ordens limite (Trader Mode no TEE) só em 6 redes, sem Monad. X Layer tem gás zero (promoção) e é a rede padrão recomendada.
6. Limites de taxa do canal privado: nenhum publicado; o CLI devolve "Rate limited" em HTTP 429 sem backoff automático. A Open API segue com Trial 1 RPS (60 dias) e Start-up 2 a 50 RPS; Market em planos de US$0 a US$599 por mês.
7. O MCP hospedado (`/api/v1/onchainos-mcp`, cabeçalho OK-ACCESS-KEY) expõe só DEX, Market e Balance (21 ferramentas, sem carteira nem assinatura); o MCP local (`onchainos mcp`) expõe dezenas de ferramentas que movem fundos (`gateway_broadcast`, `defi_invest`, `payment_pay`), sem modo somente leitura global.
8. Para este projeto: o Agentic Wallet serve ao operador multichain (swaps e bridges pontuais, saldo mínimo, política baixa), não ao laço do Kuru a cada bloco de 300 ms (dois HTTP mais TEE por ação, latência não medida, Monad ausente da lista estática do CLI). A chave local do Jev continua no Kuru; o Agentic Wallet entra como segundo signatário atrás do mesmo gate do dono.
9. Mudanças que o código precisa: um adaptador de signatário que fale com o CLI por subprocesso e implemente as interfaces `EvmSigner` e `SolanaSigner` já existentes; espelho local da política; verificação de identidade da conta antes de cada plano; dry run via `swap quote`, `swap swap` (só calldata) e `security tx-scan`; kill switch em quatro camadas (arquivo STOP, `wallet logout`, limites zerados no portal, `strategy cancel --all`).
10. Maiores incógnitas: disponibilidade no Brasil (há `geoblock/check` e códigos 50125 e 80001 de região), local de aplicação da política, se `contract-call` conta no limite diário de trade, latência de `unsignedInfo` mais broadcast, estabilidade dos caminhos `/priapi`, e o que a credencial de sessão no host permite a quem a roubar.

## 2. Fluxo agêntico passo a passo

### 2.1 Atores

- **Dono (humano):** cria a conta no navegador, define a política no portal, financia a carteira, pode exportar a seed (o que desvincula a conta do login social e encerra a operação pelo agente).
- **Agente:** processo que roda o CLI `onchainos` (ou o MCP local). Guarda no host: JWT de acesso e refresh, chave de sessão X25519, semente ed25519 cifrada. Não guarda a chave da cadeia.
- **Onchain OS (servidor da OKX):** endpoints `/priapi/v5/wallet/agentic/*`; monta transações, pré-executa, aplica a política (local exato não verificado), guarda ordens limite.
- **TEE:** gera e guarda a chave da cadeia; assina quando o broadcast chega com `sessionCert` e `sessionSignature` válidos; emite documento de atestação para o Trader Mode.

### 2.2 Onboarding e autenticação (confirmado no código do CLI e nos docs)

1. Instalação: `npx -y @okxweb3/onchainos-installer install` (Node 18 ou superior) instala as 7 skills, o CLI e o runtime A2A. Modo MCP local: `claude mcp add --scope user onchainos-cli onchainos mcp`.
2. `onchainos wallet login --phase init`: o CLI gera `authSessionId` (UUID v4) e um par X25519; abre `https://web3.okx.com/account/sociallogin?authSessionId=...&tempPubKey=...&clientType=agent-cli`; guarda `pending_auth_session_id` e `pending_session_key:<id>` no keyring. `ONCHAINOS_NO_BROWSER` evita abrir o navegador.
3. No navegador o dono escolhe e-mail (código OTP), Google, Apple ou **chave de API** (digita API key, secret e passphrase do Developer Portal na própria página de login; o CLI não faz HMAC nem armazena esses três valores: conferido em `client.rs`, cujos testes asseguram a ausência dos cabeçalhos `ok-access-*`). Na primeira vez a carteira é criada (`isNew: true`) e o agente deve mostrar o aviso de política.
4. `wallet login --phase poll [--session-id]`: consulta `POST /priapi/v5/wallet/agentic/auth/session/result` a cada 2 s, por até 300 s (`SOCIAL_LOGIN_TIMEOUT_SECS`); código 10018 = login pendente. Quando pronto, recebe `accessToken`, `refreshToken`, `projectId`, `accountId`, `loginInfo.loginType` (`email` ou `ak`), `saTeeId`, `sessionCert`, `encryptedSessionSk`, `sessionKeyExpireAt`, `allAccountAddressList`.
5. Armazenamento: keyring do SO, entrada `onchainos/agentic-wallet` com `access_token`, `refresh_token`, `session_key` (Linux: `~/.onchainos/keyring.enc` cifrado; `ONCHAINOS_CREDENTIAL_STORE=file` força o arquivo); `session.json` (saTeeId, sessionCert, encryptedSessionSk, sessionKeyExpireAt, deviceId) e `wallets.json` (projectId, contas, endereços, loginType) em `ONCHAINOS_HOME` (padrão `~/.onchainos`).
6. Após o login o CLI envia um heartbeat (`POST /priapi/v5/wallet/agentic/agent-heartbeat`, chainIndex 196) e passa a renovar o JWT por `POST /priapi/v5/wallet/agentic/auth/refresh` 60 s antes do `exp`; códigos 10001, 10008, 53017 e 130100031 forçam refresh e uma repetição. Sessão ou refresh expirados exigem novo login. `wallet logout` só apaga o estado local (nenhuma chamada ao servidor foi vista no código): não verificado se o servidor revoga a sessão.
7. `wallet status` devolve `email`, `loggedIn` (chave de sessão e refresh válidos), `loginType`, `currentAccountId`, `currentAccountName`, `accountCount` e `policy` (objeto opaco vindo de `GET /priapi/v5/wallet/agentic/policy/query?accountId=...`; `null` se não definida). Os nomes dos campos internos da política não aparecem no código do CLI: não verificado.
8. Região: `GET /priapi/v5/wallet/agentic/geoblock/check` devolve `data[0].blocked`; códigos 50125 e 80001 significam serviço indisponível na região do usuário (a skill manda não exibir o código bruto).

### 2.3 Uma ação on-chain, do agente à cadeia (confirmado no código: `transfer/mod.rs`, `broadcast.rs`, `sign.rs`, `wallet_api.rs`)

```
Agente (CLI onchainos)                 Onchain OS (/priapi/v5/wallet/agentic)                TEE / cadeia
---------------------                 ---------------------------------------                ------------
1. wallet status / policy/query  --->  devolve loggedIn, accountId, policy
2. security tx-scan (opcional)   --->  POST /api/v6/security/transaction-scan/evm|sol        (sem login)
3. unsignedInfo                  --->  POST pre-transaction/unsignedInfo
   {chainPath, chainIndex, fromAddr,   monta a tx, pré-executa (executeResult,
    toAddr, amount, sessionCert,       executeErrorMsg), devolve hash, unsignedTxHash,
    contractAddr?, inputData?,         eip712MessageHash?, authHashFor7702?, extraData
    unsignedTx?, gasLimit?}
4. se executeResult == false: aborta ("transaction simulation failed")
5. assina localmente com a semente ed25519 (HPKE decrypt da encryptedSessionSk):
   hash -> signature (EIP-191 + keccak + ed25519)
   unsignedTxHash | eip712MessageHash -> sessionSignature
   authHashFor7702 -> authSignatureFor7702 ; jitoUnsignedTx -> jitoSessionSignature
6. broadcast-transaction          --->  POST pre-transaction/broadcast-transaction
   {accountId, address, chainIndex,    verifica sessionCert + sessionSignature,
    extraData{..., checkBalance,       aplica política (local não verificado)      --->  TEE assina com a
    uopHash, encoding, signType,                                                         chave real e envia
    msgForSign, txType, isMEV,
    skipWarning, agentBizType}}
7. resposta: {orderId, txHash, pkgId, orderType}; sem retry no broadcast
8. acompanhamento: wallet history --tx-hash | --order-id (PENDING, ERROR, SUCCESS, CANCELLED)
```

Regras observadas: código 81362 sem `--force` vira "Confirming" (saída 2, `confirming: true`, `message`, `next`): o agente mostra ao usuário e, só com consentimento, repete com `--force`, que adiciona `skipWarning: true`; 81363 = reversão na pré-execução do TEE; 10004 = saldo insuficiente (dispara o fluxo de funding); 100005 = endereço na lista negra; 100007 e 100008 = falha ou indisponibilidade do TEE. Lote: `pre-transaction/batch/unsignedInfo` e `batch-broadcast-transaction` aceitam até 5 itens. MEV (`--mev-protection`, `isMEV: true`) só em Ethereum, BSC e Base; na Solana via Jito (`--jito-unsigned-tx`).

### 2.4 Comandos de alto nível e o que chamam

| Comando | O que faz | Observações |
|---|---|---|
| `wallet send --chain --recipient --readable-amount|--amt [--contract-token] [--force]` | transferência nativa ou de token; segue o fluxo 2.3 com `txType=2`, `agentBizType=transfer` | MEV sempre desligado; whitelist de destinos do portal se aplica; `token-scan` recomendado antes para token de contrato |
| `wallet contract-call --chain --to --input-data <hex> [--amt] [--gas-limit] [--mev-protection] [--force]` | chamada arbitrária EVM (ou `--unsigned-tx` base58 na Solana, `--sui-tx-bytes` na Sui) | é a porta para approve, depósito, saque e qualquer contrato; a skill proíbe usá-la para swap DEX e manda `tx-scan` antes; aprovação ilimitada é recusada por regra de comportamento, não por código |
| `wallet sign-message --chain --from --message [--type personal|eip712]` | assinatura de mensagem: `personal` via `pre-transaction/sign-msg`; `eip712` via `gen-msg-hash` e depois `sign-msg` | o que o agente assina localmente é só o `msgHash`; a assinatura final sai do servidor |
| `swap quote` / `swap execute` / `swap swap` | cotação; aprovação mais swap em um passo (devolve `approveTxHash`, `swapTxHash`); só calldata | `swap execute` escolhe autoSlippage por padrão; `--force` ignora o aviso 81362; recotar após 10 s |
| `cross-chain quote|execute|status|bridges|approve|swap` | ponte via Stargate, Across, Relay, Gas.zip, Mayan, ButterSwap | só exactIn; MEV forçado em Relay, Mayan e ButterSwap; status SUCCESS, PENDING, NOT_FOUND |
| `strategy create-limit|cancel|list|resume` | ordens limite guardadas no TEE (Buy Dip, Buy Above, Take Profit, Stop Loss) | mínimo US$1, validade fixa 7 dias, slippage padrão 15, até 100 pendentes; código 60018 ativa o Trader Mode sozinho (atestação do TEE assinada pela sessão e `registerTeeInfo`) |
| `security token-scan|dapp-scan|tx-scan|sig-scan|approvals` | verificações sem login (`/api/v6/security/*`) | veredito `block > warn > vazio`; scan que falha não é aprovação |
| `gateway gas|gas-limit|simulate|broadcast|orders` | operações com transação já assinada por carteira externa | não assina; usa a Onchain Gateway API |
| `portfolio chains|total-value|all-balances|token-balances` | saldos de qualquer endereço público | até 50 cadeias por chamada |
| `gas-station status|setup|enable|disable|update-default-token` | pagar gás em USDT, USDC ou USDG | só Solana; cobra taxa de serviço |

Auditoria local: `~/.onchainos/audit.jsonl` (JSON Lines, até 10.000 linhas com rotação para 5.000; campos `ts`, `source` cli ou mcp, `command`, `ok`, `duration_ms`, `args` redigidos, `error`).

## 3. Catálogo de funcionalidades do Onchain OS

Colunas: funcionalidade; endpoint ou método; cadeias; pré-requisitos; limites de taxa; estado. "Sem rótulo" = a página está publicada sem marca GA ou beta.

### 3.1 Agentic Wallet (canal privado JWT via CLI, MCP local e skills)

| Funcionalidade | Endpoint ou método | Cadeias | Pré-requisitos | Limites de taxa | Estado |
|---|---|---|---|---|---|
| Login social e criação da carteira | `wallet login --phase init|poll`; página `/account/sociallogin`; `POST .../auth/session/result`; `POST .../auth/refresh` | n/a | e-mail, Google ou Apple; sem conta de desenvolvedor; região permitida (`geoblock/check`) | não publicados | lançado 2026-03-18; sem rótulo |
| Login por chave de API (AK) | mesma página de login, campos API key, secret e passphrase; `loginType: ak`; política em `https://web3.okx.com/onchainos/dev-portal` | n/a | conta no Developer Portal (carteira conectada, e-mail e telefone verificados; até 3 projetos e 3 chaves por projeto) | não publicados | parcial: descrito em docs e skill; mecânica da página não lida |
| Contas e subcarteiras | `wallet add`, `wallet switch`, `wallet addresses`, `wallet chains`; `POST .../account/create`, `/account/list`, `/account/address/list` | EVM, Solana, Bitcoin, Sui por conta | sessão válida | não publicados | confirmado; até 50 subcontas por login |
| Saldo da própria carteira | `wallet balance [--all] [--chain] [--token-address]`; `GET .../asset/wallet-all-token-balances[-batch]` | 17 ou mais (docs); `wallet chains` é a fonte | sessão válida | não publicados; cache local com TTL | confirmado |
| Política de gastos | portal web (4 regras); leitura `GET .../policy/query?accountId` | n/a | só o dono, no portal (e-mail) ou no dev-portal (AK) | n/a | confirmado para as regras; aplicação no servidor não verificada |
| Transferência | `wallet send`; `unsignedInfo` + assinatura de sessão + `broadcast-transaction` | matriz Agentic Wallet (inclui 143 e 196) | sessão; destino na whitelist se ligada; saldo | não publicados; 429 sem backoff | confirmado |
| Chamada de contrato | `wallet contract-call`; mesmo trio; lote de até 5 | EVM, Solana, Sui | sessão; `tx-scan` recomendado | idem | confirmado |
| Assinatura de mensagem | `wallet sign-message`; `.../pre-transaction/gen-msg-hash`, `.../pre-transaction/sign-msg` | EVM (personal, eip712), Solana (personal) | sessão | idem | confirmado |
| Swap agregado com assinatura | `swap quote`, `swap execute`, `swap swap` | EVM, Solana, Sui, Tron, Ton (skill) | sessão; para `execute` o CLI aprova valor exato | idem | confirmado; `swap swap` só calldata |
| Ponte entre cadeias | `cross-chain quote|execute|status` | pares conforme `bridges`; 143 não verificado | sessão | idem | parcial |
| Ordens limite no TEE | `strategy create-limit|cancel|list|resume`; Trader Mode por atestação | 1, 56, 196, 501, 8453, 42161 (sem 143) | sessão; Trader Mode ativado automaticamente | até 100 ordens; mínimo US$1 | confirmado |
| Histórico | `wallet history [--chain] [--tx-hash|--order-id|--uop-hash]` | por conta | sessão | 20 por página | confirmado |
| Gas Station | `gas-station *`; `.../gas-station/update`, `/update-default-token` | Solana | sessão; USDT, USDC ou USDG | n/a | confirmado; taxa de serviço |
| Pagamentos de agente (x402, APP) | skill `okx-agent-payments-protocol`; MCP `payment_quote|pay|...`; header `PAYMENT-SIGNATURE` | X Layer 196 (USDG, USDC, USDT0) | Agentic Wallet com login por e-mail | n/a | gás zero "por tempo limitado"; paga "sem intervenção humana" |
| Identidade de agente (ERC-8004) e marketplace | skill `okx-ai` (`a2mcp invoke` etc.) | não especificado | sessão | n/a | parcial: skill de roteamento, sem referência técnica lida |
| MCP local | `onchainos mcp` (stdio): `portfolio_*`, `swap_*`, `cross_chain_*`, `gateway_*` incl. `gateway_broadcast`, `defi_invest|withdraw|collect`, `payment_pay`, dezenas de Market | idem CLI | sessão para o que move fundos | idem | confirmado; sem modo somente leitura global |
| Auditoria | `~/.onchainos/audit.jsonl` | n/a | n/a | 10.000 linhas | confirmado |

### 3.2 DEX (Trade API, Open API K4)

| Funcionalidade | Endpoint ou método | Cadeias | Pré-requisitos | Limites de taxa | Estado |
|---|---|---|---|---|---|
| Cadeias e tokens suportados | `GET /api/v6/dex/aggregator/supported/chain`, `GET .../aggregator/all-tokens`, `GET .../aggregator/get-liquidity` | matriz Trade (143 e 196 incluídas) | K4 | Trial 1 RPS (até 5 após revisão), Start-up 2 a 50, Enterprise sob contrato | sem rótulo |
| Cotação | `GET /api/v6/dex/aggregator/quote` (`chainIndex`, `amount` em unidade mínima, `fromTokenAddress`, `toTokenAddress`, `swapMode`) | idem; `exactOut` só 1, 8453, 56, 42161; `maxIn` só 501 | K4 | idem | sem rótulo; `toTokenAmount` sem unidade declarada (R1) |
| Aprovação | `GET /api/v6/dex/aggregator/approve-transaction`; desde 2026-01-28 `/swap?approveTransaction=true` devolve endereço e calldata em `signatureData` | EVM | K4 | idem | sem rótulo |
| Calldata de swap | `GET /api/v6/dex/aggregator/swap` (`slippagePercent` obrigatório, `userWalletAddress`, `disableRFQ`, `priceImpactProtectionPercent`) | idem; router EVM trocado em 2025-12-09, 2026-03-30 e 2026-08-04 | K4; Trial com funções selecionadas | idem | sem rótulo |
| Instrução Solana | `GET /api/v6/dex/aggregator/swap-instruction` (`forJitoBundle`, `useTokenLedger`, `closeAuthorityAddress`) | 501 | K4 | idem | sem rótulo |
| Histórico de swaps | `GET /api/v6/dex/aggregator/history` (citado no quick start) | n/a | K4 | idem | parcial: página não lida |
| Cross-chain | `/api/v6/dex/cross-chain/{supported/tokens, supported/bridges, quote, approve-tx, swap, status}` (código do CLI); o repositório usa `/api/v5/dex/cross-chain/quote` e `build-tx` | por `supported/tokens`; 143 não verificado | K4 | idem | parcial: sem página REST vigente localizada |
| Intent swap | changelog cita integração Intent (2026-06-04), endpoint notify, EIP-1271 via `signingScheme` (2026-07-29); página `trade/dex-intent-introduction` dá 404 | não verificado | não verificado | não verificado | não verificado |
| MCP hospedado de DEX | `https://web3.okx.com/api/v1/onchainos-mcp` (HTTP, cabeçalho `OK-ACCESS-KEY`): `dex-okx-dex-aggregator-supported-chains`, `-liquidity`, `-approve-transaction`, `-quote`, `-swap`, `-solana-swap-instruction` | 20 ou mais | chave do dev-portal | não publicados | sem rótulo |
| Taxas | partner fee até 3% (10% Solana); Trial retém slippage positivo até 10% do valor; Start-up 20% de revenue share | n/a | upgrade no portal ou BD (volume acima de US$10M mensais) | n/a | confirmado |

### 3.3 Onchain Gateway (Open API K4)

| Funcionalidade | Endpoint ou método | Cadeias | Pré-requisitos | Limites de taxa | Estado |
|---|---|---|---|---|---|
| Cadeias do gateway | `GET /api/v6/dex/pre-transaction/supported/chain` | 20 ou mais | K4 | não publicados | sem rótulo |
| Preço de gás | `GET /api/v6/dex/pre-transaction/gas-price?chainIndex` (wei, SUN, microlamports; campos EIP-1559) | EVM, Tron, Solana | K4 | não publicados | sem rótulo |
| Limite de gás | `POST /api/v6/dex/pre-transaction/gas-limit` (`fromAddress`, `toAddress`, `txAmount`, `extJson.inputData`) | EVM | K4 | não publicados | sem rótulo; não exige whitelist |
| Simulação | `POST /api/v6/dex/pre-transaction/simulate` (doc diz GET; `intention`, `assetChange`, `gasUsed`, `failReason`, `risks`) | EVM, Solana, Sui | K4 e **whitelist** (dexapi@okx.com) | não publicados | restrito |
| Broadcast | `POST /api/v6/dex/pre-transaction/broadcast-transaction` (`signedTx`, `chainIndex`, `address`, `extraData{enableMevProtection, jitoSignedTx}`) | todas; `txHash` imediato e MEV só em 1, 56, 501, 8453 | K4 e **whitelist** (quick start) | não publicados | restrito; MEV "experimental, de terceiros" |
| Ordens | `GET /api/v6/dex/post-transaction/orders` (`txStatus` 1 pendente, 2 sucesso, 3 falha; limit até 100) | por cadeia | K4 | não publicados | sem rótulo |

### 3.4 Balance e histórico (Wallet API, Open API K4)

| Funcionalidade | Endpoint ou método | Cadeias | Pré-requisitos | Limites de taxa | Estado |
|---|---|---|---|---|---|
| Valor total | `GET /api/v6/dex/balance/total-value-by-address` (`assetType` 0, 1, 2; `excludeRiskToken`) | 130 ou mais (página); até 50 por chamada | K4 | tier Free (sem cobrança); RPS não publicado | sem rótulo |
| Todos os saldos | `GET /api/v6/dex/balance/all-token-balances-by-address` (`filter` 0 ou 1) | idem | K4 (o CLI chama sem auth em um caminho) | Free | sem rótulo |
| Saldo de tokens específicos | `POST /api/v6/dex/balance/token-balances-by-address` (até 20 pares) | idem | K4 | Free | sem rótulo |
| Cadeias de saldo | `GET /api/v6/dex/balance/supported/chain` | n/a | K4 | Free | sem rótulo |
| Histórico por endereço | `GET /api/v6/dex/post-transaction/transactions-by-address`; `.../transaction-detail-by-txhash` | multi | K4 | Free | sem rótulo |

### 3.5 DeFi (Open API K4)

| Funcionalidade | Endpoint ou método | Cadeias | Pré-requisitos | Limites de taxa | Estado |
|---|---|---|---|---|---|
| Busca e detalhe de produto | `POST /api/v6/defi/product/search` (`tokenKeywordList`, `productGroup` SINGLE_EARN, DEX_POOL, LENDING; `rate` em fração), `GET .../defi/product/detail` | EVM, Solana, Sui, Aptos; 143 e 196 não verificado | K4; tier não verificado | não publicados | sem rótulo |
| Depositar, resgatar, coletar | `POST /api/v6/defi/transaction/enter`, `/exit`, `/claim` (devolvem calldata em passos; `slippage` em fração, padrão 0.01) | idem | K4 | não publicados | sem rótulo; nada é assinado |
| Posições do usuário | `POST /api/v6/defi/user/asset/platform/list`, `/detail` | idem | K4 | não publicados | sem rótulo |
| Via CLI e MCP local | `defi_list|search|detail|invest|withdraw|collect|positions`, gráficos `defi_rate_chart`, `defi_tvl_chart` | idem | sessão para invest, withdraw, collect | não publicados | confirmado nos nomes de ferramentas |

### 3.6 Market (Open API K4, Free, Basic, Premium)

| Funcionalidade | Endpoint ou método | Cadeias | Pré-requisitos | Limites de taxa | Estado |
|---|---|---|---|---|---|
| Preço, índice, candles, trades | `POST /api/v6/dex/market/price`, `GET .../index/current-price`, `/historical-price`, `GET .../market/candles`, `/historical-candles`, `/trades` | Market (143 e 196 na matriz) | K4 | Free: índice; Basic: price, trades, candles; Premium: historical-candles; cota 100 mil Basic e 100 mil Premium por mês no plano Free, excedente US$0,0001 e US$0,0002 | sem rótulo |
| Token | `/token/search`, `/token/basic-info`, `/token/top-liquidity`, `/token/hot-token` (Basic); `/token/advanced-info`, `/token/holder`, `/price-info`, `/rwa/tokens`, `/token/top-trader`, clusters (Premium) | idem | K4 | idem | sem rótulo |
| Sinais, leaderboard, tracker, Meme Pump, social | `/signal/list`, `/leaderboard/list`, `/address-tracker/trades`, `/memepump/*`, `/social/*` | exemplos sem 143 | K4 | Premium na maioria | sem rótulo; Social desde 2026-05-15 |
| Portfolio e PnL | `/portfolio/overview`, `/recent-pnl` (Premium), `/token/latest-pnl`, `/dex-history` (Basic) | exemplos 1 e 501 | K4 | idem | sem rótulo |
| Onchain Core Data | `/explorer/address/*`, `/block/*`, `/transaction/*`, `/info/*`, `/log/*` | EVM | K4 | Basic | sem rótulo |
| WebSocket | `wss://wsdex.okx.com/ws/v6/dex` | multi | plano pago (Starter US$99 ou superior) | 3 req/s por chave, 480 operações por hora por conexão | sem rótulo |
| Planos | Free US$0; Starter US$99; Growth US$199; Scale US$399; Pro US$599; Enterprise; x402 por chamada em USDG ou USDT na X Layer | n/a | assinatura no portal | RPS "sob consulta" (Discord ou dexapi@okx.com) | confirmado |
| MCP hospedado de Market e Balance | mesmo servidor `/api/v1/onchainos-mcp`: `dex-okx-index-*`, `dex-okx-market-price*`, `-candlesticks*`, `-token-search`, `-token-price-info`, `-token-ranking`, `-token-holder`, `-trades`, `dex-okx-balance-*` (15 ferramentas) | 20 ou mais | chave do dev-portal | não publicados | sem rótulo |

### 3.7 Pré-transação e segurança

| Funcionalidade | Endpoint ou método | Cadeias | Pré-requisitos | Limites de taxa | Estado |
|---|---|---|---|---|---|
| Risco de token | `POST /api/v6/security/token-scan` (`source`, `tokenList` até 50 com `chainId`, `contractAddress`); CLI `security token-scan [--trade-direction buy|sell]` | EVM e Solana (cadeia não suportada volta `isChainSupported:false`) | sem login no CLI; auth REST não verificada | não publicados | páginas REST não localizadas (404 em R1); caminhos só no código |
| Risco de dApp | `POST /api/v6/security/dapp-scan` (`url`) | n/a | idem | idem | idem |
| Pré-execução de transação | `POST /api/v6/security/transaction-scan/evm` (`from`, `chainId`, `data`, `to`, `value`, `gas`, `gasPrice`) e `/transaction-scan/sol` (`transactions`, `encoding`) | EVM, Solana | idem | idem | idem; ações `block`, `warn`, vazio |
| Aprovações | `POST /api/v6/security/approval-mng` (`addressList`, `limit`, `cursor`); revogar = `approve(spender, 0)` via `contract-call` | EVM | idem | idem | idem |
| Assinatura | `POST /api/v6/security/sign-message-check` (`signType`, `message`) | EVM | idem | idem | idem |
| Pré-execução embutida no Agentic Wallet | `unsignedInfo.executeResult` e `executeErrorMsg`; 81363 em reversão | todas do Agentic Wallet | sessão | n/a | confirmado; sempre roda antes do broadcast |
| Simulação da Gateway | ver 3.3 | EVM, Solana, Sui | whitelist | n/a | restrito |

## 4. O que já temos vs. o que falta

| Capacidade | Código existente | Estado | Nota |
|---|---|---|---|
| Balance API (saldos multichain, valor total) | `src/okx-wallet/portfolio.ts` (`createOkxPortfolioClient`, `normalizeInventory`), `src/okx-wallet/chains.ts` | integrado | somente leitura; `total-value` implementado e não usado no ciclo |
| DEX quote, swap, approve | `src/okx-wallet/trade.ts` (`TRADE_PATHS.quote|swap|approve`, `okxSwapQuoter`, `prepareEvmSwap`), `src/operator/executor.ts` (`encodeApprove`, `minReceiveMatchesQuote`, `executePlan`) | integrado, atrás do gate | unidades de `toTokenAmount` ainda presumidas (`OPERATOR_TRUST_QUOTE_UNITS`) |
| Gateway gas-price | `TRADE_PATHS.gasPrice` em `trade.ts` | parcial | chamado para custo; `gas-limit`, `simulate`, `broadcast`, `orders` ausentes (whitelist) |
| Cross-chain | `TRADE_PATHS.crossChainQuote|crossChainBuildTx` (v5), `buildBridgeCandidates` em `src/operator/candidates.ts` | parcial | caminhos v5 e `slippagePercent` divergem do CLI oficial (v6 `/cross-chain/swap`, `slippage` em fração); research only até `OPERATOR_TRUST_BRIDGE_API=true` |
| DeFi busca e saída | `src/okx-wallet/defi.ts` (`okxDefiSource`, `parseDefiSearch`), `TRADE_PATHS.defiProductSearch|defiTransactionExit`, `buildYieldCandidates` | parcial | `enter`, `claim`, `detail` e posições ausentes; gate rejeita por `costs_incomplete` |
| Market (scan, sinais, preço) | `scripts/okx-market-scan.ts`, `scripts/okx-signals.ts`, `scripts/okx-dex-quote.ts`, `src/okx-market/*` | parcial | pesquisa, nunca elegível para execução; WebSocket ausente |
| Funding de perps (Exchange, pública) | `src/operator/funding.ts` (`okxPublicFundingSource`) | integrado como pesquisa | não é Onchain OS |
| Decisão do Jev | `src/operator/jev-selector.ts` (`JevOperatorModel`, `buildOperatorState`, `validateOperatorDecision`) | integrado | estado sem endereço, contrato ou cotação bruta; resposta só id elegível ou hold |
| Gate, plano, ledger, kill switch | `src/operator/risk-gate.ts`, `plan.ts`, `ledger.ts` (`data/operator/STOP`), `config.ts` (`OPERATOR_*`), `scripts/okx-operator.ts` (`OPERATOR_EXECUTE`, `DRY_RUN`, `LIVE_ACK=OWN_FUNDS_RISK`) | integrado | base para o novo signatário |
| Signatário EVM local | `executor.ts` (`EvmSigner`, `createEthersEvmSigner` com `PRIVATE_KEY`) | integrado | chave quente no .env |
| Signatário Solana local | `src/okx-wallet/solana-signer.ts` (`createSolanaSigner`, ed25519 com `node:crypto`) | integrado | idem |
| Dapp Connect (leitura no navegador) | `web/src/lib/okx-solana.ts`, `web/src/lib/evm-multichain.ts` | integrado | sem assinatura |
| Security API (token, tx, approvals, sig) | nenhum | ausente | campos `isHoneyPot`, `taxRate` só via Market |
| Agentic Wallet (login, status, política, send, contract-call, swap execute, history) | nenhum | ausente | única menção: `docs/OKX-OPERADOR-JEV.md` como alternativa |
| Ordens limite no TEE (strategy) | nenhum | ausente | contraria "Jev decide": só como proteção de risco, fora do escopo |
| MCP hospedado e local | nenhum | ausente, por decisão | Jev não chama ferramentas; o operador chamaria o CLI, não o MCP |
| Payments x402 | nenhum | ausente, fora de escopo | canal de saída de fundos a bloquear |
| Auditoria | `data/operator/cycles.jsonl`, `ledger.json`, `latest.json` | integrado | precisa correlacionar com `audit.jsonl` do CLI e `orderId` |

> Nota de correção (após R8 e R10, 2026-10-12): nas linhas de gate, de signatário EVM e de signatário Solana desta tabela, os gates de execução do operador são `OPERATOR_EXECUTE`, `OPERATOR_LIVE_ACK` e `OPERATOR_PRIVATE_KEY` (mais `--jev`, o ledger e as allowlists); `DRY_RUN` e `LIVE_ACK` do trader não são consultados pelo operador, e a `PRIVATE_KEY` do trader é lida só para recusar uma chave igual (não é gate). O signatário Solana (`src/okx-wallet/solana-signer.ts`) consta como "integrado" nas linhas acima, mas só existe em testes: a execução Solana está desligada no executor (`SOLANA_LIVE_ENABLED=false`) até existir política de transação.

## 5. Como construir o agente operador com Agentic Wallet nesta aplicação

### 5.1 Princípios (mantêm as regras do projeto)

- **Jev decide, código executa.** A decisão continua em `JevOperatorModel`: escolher um id elegível ou hold. O Agentic Wallet é só um signatário alternativo atrás do mesmo `ExecutionPlan`. Nenhuma skill, plugin ou ordem limite do TEE decide por ele.
- **Carteira real, trades reais, gate explícito do dono.** A sessão do Agentic Wallet é criada pelo dono no navegador, fora do aplicativo; o aplicativo só verifica `loggedIn`, conta e endereço esperados. Execução live continua exigindo `OPERATOR_EXECUTE=true`, `DRY_RUN=false`, `LIVE_ACK=OWN_FUNDS_RISK` e, agora, `OPERATOR_SIGNER=agentic` mais política não nula no portal.
- **O laço do Kuru não muda.** Ordem a cada bloco de 300 ms segue com a chave local do Jev na Monad. O Agentic Wallet atende o operador multichain (swaps e bridges pontuais); medir latência antes de qualquer outra ideia.
- **Texto do CLI é dado não confiável.** Nomes e símbolos de token, mensagens e `nextSteps` nunca entram no prompt do Jev; só números, enums e ids.

### 5.2 Módulos a adicionar (propostos, não implementados)

```
src/agentic-wallet/
  cli.ts            subprocesso Bun.spawn do binário onchainos; allowlist de subcomandos; parse do
                    envelope {ok,data}; exit code 2 => ConfirmingError (nunca --force automático);
                    timeout; redaction de args no log; ONCHAINOS_HOME dedicado
  session.ts        `wallet status`: loggedIn, loginType, currentAccountId/Name, policy, endereços por
                    cadeia (`wallet addresses --chain`); compara com AGENTIC_EXPECTED_*; lê
                    sessionKeyExpireAt em $ONCHAINOS_HOME/session.json e recusa sessão perto de expirar
  policy-mirror.ts  espelho local das 4 regras: planUsd <= min(perTx, OPERATOR_MAX_PLAN_USD);
                    somatório diário do ledger <= dailyTrade; transferências só para whitelist local;
                    se `policy` for null ou campos desconhecidos => bloqueia (reason policy_unknown)
  signer.ts         AgenticEvmSigner implements EvmSigner; AgenticSolanaSigner implements SolanaSigner:
                    approve exato => `wallet contract-call --to <token> --input-data <encodeApprove>`
                    swap => `wallet contract-call --to <router allowlist> --input-data <calldata do /swap>`
                    (mantém minReceiveMatchesQuote, router allowlist e approve exato do executor atual);
                    `security tx-scan` antes de cada contract-call; block => aborta; warn => aborta
                    (sem humano no laço)
  receipts.ts       `wallet history --chain --tx-hash|--order-id` mais recibo pelo RPC próprio
                    (OPERATOR_RPC_<chain>); status PENDING/ERROR/SUCCESS/CANCELLED => máquina de
                    estados do ledger (leg1_sent, leg1_confirmed, ...)
  audit.ts          lê ~/.onchainos/audit.jsonl (ou $ONCHAINOS_HOME) e cruza command, ts, ok com
                    cycles.jsonl por orderId e txHash; alerta para comando fora da allowlist ou fora
                    de um plano
```

Mudanças em código existente: `src/operator/executor.ts` recebe o signatário por injeção (já é `ExecutorDeps`), então basta uma fábrica `createSigner(config)` que devolve o local ou o agêntico; `src/operator/config.ts` ganha as variáveis abaixo; `scripts/okx-operator.ts` imprime o modo de signatário e o resumo da política; `src/server.ts` expõe em `GET /operator` o estado da sessão redigido (sem e-mail completo, sem accountId).

### 5.3 Variáveis de ambiente propostas

| Variável | Função |
|---|---|
| `OPERATOR_SIGNER=local|agentic` | escolhe o signatário; padrão `local` (comportamento atual) |
| `ONCHAINOS_BIN` | caminho do binário; o aplicativo confere o SHA256 contra `ONCHAINOS_BIN_SHA256` antes de executar |
| `ONCHAINOS_HOME` | diretório de sessão dedicado ao operador (não o do usuário) |
| `AGENTIC_EXPECTED_ACCOUNT_NAME`, `AGENTIC_EXPECTED_ADDRESS_<chainIndex>` | identidade esperada; divergência bloqueia o ciclo |
| `AGENTIC_REQUIRE_POLICY=true` | recusa executar se `policy` for null |
| `AGENTIC_MAX_PER_TX_USD`, `AGENTIC_MAX_DAILY_TRADE_USD` | tetos locais que devem ser menores ou iguais aos do portal |
| `AGENTIC_ALLOW_CHAINS` | subconjunto de `OPERATOR_CHAINS` liberado para o signatário agêntico |
| `AGENTIC_SESSION_MIN_REMAINING_MIN` | recusa sessão que expira antes do TTL do plano |
| `AGENTIC_ALLOW_FORCE=false` | fixo em false: o aplicativo nunca repete com `--force` |
| `AGENTIC_CLI_TIMEOUT_MS` | timeout por subprocesso; timeout no broadcast não é recusa: reconciliar antes de reenviar |

Permanecem: `OPERATOR_EXECUTE`, `DRY_RUN`, `LIVE_ACK`, `OPERATOR_MAX_PLAN_USD`, `OPERATOR_MAX_DAILY_*`, `OPERATOR_ROUTER_<chain>`, `OPERATOR_RPC_<chain>`, `OPERATOR_KILL_SWITCH_PATH`.

### 5.4 Modelo de autorização e limites em camadas

1. **Dono, no portal:** limite por transação, diário de transferência, diário de trade, whitelist de destinos. Recomendação inicial: por transação igual a `OPERATOR_MAX_PLAN_USD` do perfil `micro` (5 USD), diário de trade 20 USD, transferência diária 0 ou só para o endereço do dono na whitelist.
2. **Saldo da carteira:** financiar só gás e o capital aceito para perda; o saldo é o teto absoluto.
3. **Gate determinístico do aplicativo:** `risk-gate.ts` mais `policy-mirror.ts`; alvo e seletor só da allowlist (router do `/swap` por cadeia, token para approve); valor nativo 0 fora de swaps nativos; approve exato; `minReceiveAmount` conferido contra a cotação.
4. **Verificações da OKX:** `tx-scan` antes de cada chamada; pré-execução do TEE (`executeResult`); aviso 81362 nunca ignorado pelo aplicativo.
5. **Jev:** só escolhe entre candidatos já elegíveis; nenhuma ferramenta de escrita.

### 5.5 Dry run, qualificação e kill switch

- **Dry run (padrão):** `wallet status` (sem efeito), `swap quote` ou `/quote` da Open API, `swap swap` (só calldata, nunca `gateway broadcast`), `security tx-scan` sobre o calldata, registro do plano como `qualified_dry_run`. Não existe "simular sem enviar" no fluxo do Agentic Wallet além da pré-execução que antecede o broadcast; o dry run portanto para antes de `contract-call`.
- **Qualificação (ordem sugerida):** (1) conta nova, sem fundos, só `wallet status`, `wallet chains`, `geoblock check` para medir disponibilidade no Brasil e cobertura de 143 e 196; (2) política definida no portal e lida de volta; (3) uma transferência de valor mínimo para o próprio endereço do dono, cronometrando `unsignedInfo` e broadcast; (4) um swap de 1 a 2 USD na X Layer com approve exato; (5) reconciliação por `wallet history` e RPC; (6) só então `OPERATOR_SIGNER=agentic` com `LIVE_ACK`.
- **Kill switch em quatro camadas:** arquivo `data/operator/STOP` (já existe) para o laço; `onchainos wallet logout` apaga a sessão local (não verificado se revoga no servidor: tratar como insuficiente sozinho); no portal, zerar os quatro limites; `strategy cancel --all` se alguma ordem limite existir (o aplicativo nunca cria, mas verifica `strategy list` e alerta). Ensaiar e cronometrar o desligamento antes do live.
- **Auditoria:** `cycles.jsonl` guarda plano, `orderId`, `txHash`, status e o hash do calldata; `audit.ts` cruza com `audit.jsonl` do CLI; alerta se o CLI registrou comando que nenhum plano gerou (sinal de uso fora do aplicativo ou de comprometimento do host).

### 5.6 Sequência de um plano com o signatário agêntico

```mermaid
sequenceDiagram
  participant I as Inventário (Balance API)
  participant G as Gate + policy-mirror
  participant J as Jev (TypeSafe)
  participant E as Executor
  participant C as onchainos CLI
  participant O as Onchain OS (/priapi)
  participant T as TEE + cadeia
  I->>G: candidatos (round trip, bridge)
  G->>J: estado sem endereço, só ids e números
  J-->>G: id escolhido ou hold
  G->>E: ExecutionPlan (quoteHash, idempotencyKey, maxLossUsd)
  E->>C: wallet status; security tx-scan(calldata)
  C-->>E: loggedIn, policy, sem block
  E->>C: wallet contract-call --to router --input-data calldata
  C->>O: unsignedInfo (pré-execução)
  O-->>C: executeResult, hashes, sessionCert
  C->>C: assina hashes com a chave de sessão
  C->>O: broadcast-transaction
  O->>T: valida sessão e política; TEE assina e envia
  T-->>O: txHash
  O-->>C: orderId, txHash
  C-->>E: {txHash, orderId}
  E->>C: wallet history --tx-hash (mais recibo RPC)
  E->>G: ledger: leg confirmada, realizado, limites diários
```

## 6. Riscos e perguntas abertas

**Riscos**

- Canal privado e não versionado: todos os caminhos `/priapi/v5/wallet/agentic/*` vêm do código do CLI; a OKX pode mudá-los, exigir versão mínima do CLI ou bloquear clientes que não sejam o oficial (`Ok-Access-Client-type: agent-cli`, `device-id`). Falar sempre pelo binário oficial, nunca reimplementar o protocolo.
- Credencial de sessão no host equivale a chave quente até o teto da política: quem copiar keyring, `session.json` e `wallets.json` opera a carteira até `sessionKeyExpireAt` ou até a política barrar. Mitigar com `ONCHAINOS_HOME` isolado, usuário de SO dedicado, limites baixos, sessão curta.
- Política só cobre transferências (whitelist) e valores em USD; não há allowlist de contrato ou seletor, e `contract-call` para o router é a mesma porta que para um contrato malicioso. O gate do aplicativo é a única barreira de alvo.
- Local de aplicação da política não documentado; se for só na API (não no TEE), um bypass do servidor anula o limite. Pedir confirmação à OKX.
- `--force` e aviso 81362: o fluxo foi desenhado para humano no laço; em automação, o aplicativo deve tratar qualquer "Confirming" como recusa.
- Pagamentos x402 "sem intervenção humana": a skill de pagamentos pode gastar ao receber 402 de um serviço; não instalar a skill no host do operador e nunca chamar `payment_pay`.
- Injeção por metadados: PoC de terceiros (não verificado, R1 e R2) alega que nomes de token chegam ao agente sem filtro; aqui o Jev nunca lê saída do CLI.
- Cadeia de suprimento: instalador `npx -y @okxweb3/onchainos-installer` baixa binários; fixar versão, conferir SHA256 publicado nas releases, revisar antes de atualizar (a skill roda `--throttle --skill-version` sozinha em cada thread).
- Região: `geoblock/check`, códigos 50125 e 80001; o portal usa a lista de telefones como proxy de restrição. Brasil não verificado.
- Latência e cadência: duas chamadas HTTP mais TEE por ação, 429 sem backoff, poll de history; incompatível com 300 ms até prova em contrário.
- Dependência do fornecedor: bloqueio automático por anomalia, endereço na lista negra (100005), TEE indisponível (100008), `TEE.fail` como lembrete de que enclave não é prova (R2).
- Monad: na matriz do Agentic Wallet, mas fora da lista estática do CLI e das ordens limite; `wallet chains` decide. Se 143 faltar, o signatário agêntico cobre só 196, 501, 1, 56, 8453, 42161.
- Divergência de unidades e caminhos já registrada em R1 (cross-chain v5 no repositório, `toTokenAmount` sem unidade) continua valendo para qualquer signatário.

**Perguntas abertas**

1. Onde a política é aplicada (API, TEE, ambos) e se `contract-call` entra no limite diário de trade ou só `swap execute` e `strategy`.
2. O que `wallet logout` faz no servidor; existe revogação remota de sessão ou de dispositivo no portal.
3. Quais são os campos reais do objeto `policy` (nomes, moeda, campos `used`).
4. Limites de taxa e cotas do canal `/priapi` e do MCP hospedado.
5. Cobertura efetiva de Monad em `wallet chains`, `swap`, `cross-chain` e `unsignedInfo/batch/supportChainIndexList`.
6. Latência p50 e p99 de `unsignedInfo` mais broadcast na X Layer e na Monad.
7. Disponibilidade do Agentic Wallet e do dev-portal para conta brasileira.
8. Se o login AK vincula a política ao projeto do Developer Portal e se os limites de 3 projetos e 3 chaves se aplicam.
9. Se `swap execute` respeita a allowlist de router do aplicativo (não: ele escolhe o router do `/swap`), e portanto se `contract-call` com calldata próprio é o único caminho compatível com o gate atual.
10. Existe modo somente leitura ou lista de ferramentas permitidas no MCP local, ou flag equivalente no CLI.
11. Estado e documentação do Intent swap (página 404) e sua relação com EIP-1271 e carteiras de contrato.
12. Se a OKX publicará API REST pública para o Agentic Wallet (hoje só CLI, MCP e skills).

## 7. Fontes

Todas acessadas em 2026-10-11, salvo indicação.

Documentação oficial Onchain OS (web3.okx.com):
- https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/agentic-wallet
- https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet
- https://web3.okx.com/onchainos/dev-docs/home/agentic-wallet-overview
- https://web3.okx.com/onchainos/dev-docs/wallet/install-your-agentic-wallet
- https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet-skills
- https://web3.okx.com/onchainos/dev-docs/wallet/product-and-service
- https://web3.okx.com/onchainos/dev-docs/home/what-is-onchainos
- https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage
- https://web3.okx.com/onchainos/dev-docs/home/developer-portal
- https://web3.okx.com/onchainos/dev-docs/home/supported-chain
- https://web3.okx.com/onchainos/dev-docs/home/change-log
- https://web3.okx.com/onchainos/dev-docs/trade/dex-swap-api-introduction
- https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote
- https://web3.okx.com/onchainos/dev-docs/trade/dex-swap
- https://web3.okx.com/onchainos/dev-docs/trade/api-fee
- https://web3.okx.com/onchainos/dev-docs/trade/dex-use-swap-quick-start
- https://web3.okx.com/onchainos/dev-docs/trade/dex-ai-tools-mcp-server
- https://web3.okx.com/onchainos/dev-docs/trade/dex-intent-introduction (404 em 2026-10-11)
- https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-overview
- https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-gas-price
- https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-simulate-transaction
- https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-broadcast-transaction
- https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-orders
- https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-overview
- https://web3.okx.com/onchainos/dev-docs/wallet/tx-history-api-overview
- https://web3.okx.com/onchainos/dev-docs/wallet/defi-api-overview
- https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-introduction
- https://web3.okx.com/onchainos/dev-docs/wallet/defi-transaction-introduction
- https://web3.okx.com/onchainos/dev-docs/market/market-api-introduction
- https://web3.okx.com/onchainos/dev-docs/market/market-api-fee
- https://web3.okx.com/onchainos/dev-docs/market/market-ai-tools-mcp-server
- https://web3.okx.com/onchainos/dev-docs/payments/overview
- https://web3.okx.com/onchainos/dev-docs/payments/supported-networks
- https://web3.okx.com/onchainos/dev-docs/payments/payment-use-buyer
- https://web3.okx.com/learn/agentic-wallet
- https://www.okx.com/en-us/help/okx-wallet-officially-launches-agentic-wallet

Repositório oficial okx/onchainos-skills (GitHub, branch main, v4.6.4):
- https://github.com/okx/onchainos-skills/releases
- https://raw.githubusercontent.com/okx/onchainos-skills/main/README.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/SKILL.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/wallet.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/wallet-portal-actions.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/wallet-cli-reference.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/wallet-troubleshooting.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/account-faq.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/audit-log.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/strategy.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/strategy-cli-reference.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/swap.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/bridge.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/gateway.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/security.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/gas-station.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/funding.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/references/portfolio.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/_shared/chain-support.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-agentic-wallet/_shared/preflight.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-ai/SKILL.md
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/endpoints.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/client.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/wallet_api.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/wallet_store.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/keyring_store.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/crypto.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/config.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/mcp/mod.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/commands/security.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/commands/agentic_wallet/auth/mod.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/commands/agentic_wallet/transfer/mod.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/commands/agentic_wallet/broadcast.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/commands/agentic_wallet/sign.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/commands/agentic_wallet/account.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/commands/agentic_wallet/geoblock.rs
- https://raw.githubusercontent.com/okx/onchainos-skills/main/cli/src/commands/agentic_wallet/strategy/trader_mode.rs
- Listagens de diretório via https://api.github.com/repos/okx/onchainos-skills/contents/cli/src , .../cli/src/commands , .../cli/src/commands/agentic_wallet , .../agentic_wallet/auth , .../agentic_wallet/transfer , .../agentic_wallet/strategy
- https://raw.githubusercontent.com/okx/dapp-connect-agenticwallet/main/GUIDE.md

Buscas na web (só para localizar páginas; nada foi afirmado com base apenas nelas): mirrors de skills em mcpservers.org, skills.sh, termo.ai; artigo de comparação de carteiras agênticas (cobo.com); notas de lançamento de terceiros (onekey.so, unlock-bc.com).

Herdadas de R1 e R2 (lidas em 2026-10-10, não relidas hoje, citadas nas tabelas 3.4 a 3.7): páginas de Balance (`balance-total-value`, `balance-total-token-balances`, `balance-specific-token-balance`), histórico (`tx-history-transactions-by-address`), DeFi (`defi-product-search`, `defi-transaction-enter`, `defi-transaction-claim`, `defi-user-asset-overview`), Market (referências de price, token, signal, memepump, portfolio, social, websocket), Gateway (`onchain-gateway-api-gas-limit`, `onchain-gateway-api-chains`), e as páginas de erro `dex-error-code`. URLs completas em `docs/research/R1-onchain-os-capacidades.md`, seção (e), e `docs/research/R2-carteira-permissoes-delegacao.md`, seção (g).

Nota final: nada aqui autoriza execução. Login, financiamento, definição de política, transferência, swap, bridge, pagamento ou chamada autenticada continuam dependendo de qualificação e autorização separadas do dono, com a decisão do Jev limitada a escolher entre candidatos já elegíveis ou hold.
