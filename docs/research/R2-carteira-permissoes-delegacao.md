# R2: carteira, permissões e delegação para um assinador guiado por IA

Pesquisa documental de 2026-10-10, só com acesso público: sem login, conta, chave de API, assinatura, transação ou leitura de .env. Não é aconselhamento financeiro nem promessa de retorno.
Legenda: NAO CONFIRMADO = sem fonte primária recuperada ou não testado por mim. [S#] = seção (g). "Sondagem" = leitura sem estado (eth_getCode, eth_call, eth_estimateGas, eth_getStorageAt) nos RPCs públicos da X Layer (rpc.xlayer.tech, chain 196) e da Monad (rpc.monad.xyz, chain 143), em 2026-10-10 [S39].
Estado do repositório (lido): painel OKX só leitura (web/OKX-WALLET.md, web/src/lib/okx-wallet.ts); executor live bloqueado até qualificação (docs/OPERACAO-BRASIL.md, src/market.ts); alvo JevSelector, ExecutionPlan, gate, executor, Reconciler (docs/OPPORTUNITY-ARCHITECTURE.md); conexão da carteira não fornece signer (docs/WEB3-INTEGRATION-DELIVERY-SPEC.md).

## (a) Resumo executivo

- **Sem delegação nativa no OKX Wallet principal.** A conexão `window.okxwallet` concede só a permissão `eth_accounts`; a documentação não descreve pré-autorização de assinaturas, ERC-7715 nem revogação programática [S1, S8, S14]. Limites precisam vir de conta separada, de contrato ou do servidor do usuário.
- **Há produtos OKX para agentes, com chave em TEE do fornecedor:** Agentic Wallet (conta separada por e-mail/Google/Apple, até 50 subcarteiras, política de 4 regras definida só no portal web, X Layer e Monad listadas) e Trader Mode (a chave da conta de seed fica no TEE por 7/15/30 dias; só ordens OKX DEX). São afirmações do fornecedor, sem auditoria independente recuperada, e nenhum filtra por contrato ou seletor [S20, S21, S23].
- **O núcleo do demo (ordem Kuru a cada bloco de 300 ms) não é provado por nenhuma carteira remota.** Latência, política e revogação do Agentic Wallet no loop são NAO CONFIRMADO; o caminho viável hoje é uma carteira de agente dedicada, com chave própria, saldo mínimo e teto duro.
- **On-chain (sondagem 2026-10-10):** a Monad tem EntryPoint v0.6 a v0.9, Permit2, Safe 1.4.1, Safe Allowance Module, Safe4337Module, Zodiac Roles e MetaMask DelegationManager; a X Layer tem EntryPoint, Permit2, Safe e o smart wallet da OKX, mas não o Allowance Module, o Roles oficial nem o DelegationManager [S39].
- **EIP-7702:** aceito nas duas redes (estimateGas com authorizationList cobra o custo intrínseco; docs da Monad; OP Stack Isthmus), mas o OKX Wallet só documenta o upgrade para o delegado dele (2025-05-07, sem lista de redes) e a Monad exige reserva de 10 MON em EOAs delegadas [S10, S15, S28, S29].
- **ERC-7715 e ERC-7710 seguem Draft; o método vigente é `wallet_requestExecutionPermissions`** (o nome `wallet_grantPermissions`, de guias e rascunhos anteriores, não aparece no texto atual). Suporte conhecido: MetaMask 13.23 ou superior com smart account; OKX: NAO CONFIRMADO [S13, S14, S34].
- **Camadas de permissão também falham:** Zodiac Roles v2/Delay (Gnosis Pay, 2026-06-01, ~US$1,5 mi roubados mais ~US$0,3 mi inacessíveis), agente com injeção de prompt (Grok/Bankr, 2026-05) e TEE não é prova (TEE.fail, 2025-10). O teto deve estar no saldo, no contrato e no humano, não no modelo [S33, S42, S45].
- **Recomendação:** T0 leitura (ampliar); T1 humano assina na extensão (financiar e aprovar com valor exato, revogar); T2-A agora (agente dedicado, gate determinístico, teto = margem Kuru); T2-B alvo (Safe + Roles/Allowance na Monad; alvo = mercado Kuru, seletores `batchUpdate` 0x5339c59f e `batchCancelOrders` 0x23afbff3, sem `withdraw`) [S38, S39].
- **Gás é parte do teto:** 288 mil blocos por dia x 350 mil de limite x ~102 gwei dá ~10,3 mil MON por dia no pior caso de uma tx por bloco (a Monad cobra o limite, não o gás usado; conta feita com src/config.ts, não medida) [S29].
- **Maiores desconhecidos:** onde o Agentic Wallet aplica a política e como se revoga o agente; latência de assinatura; Kuru com contrato como maker; versão corrigida do Roles; disponibilidade no Brasil; prompts reais da extensão para typed data.

## (b) O que o OKX Wallet expõe hoje

| Recurso | Evidência e URL | Confiança |
|---|---|---|
| Provider injetado `window.okxwallet` (EventEmitter, `request({method,params})`, `isConnected()`, `chainId`; eventos accountsChanged, chainChanged, connect, disconnect, message) | Página oficial do provider EVM [S1]; semântica EIP-1193 Final [S6]. A página documenta só o erro 4001; o Connect Kit lista 4100, 4200, 4900 e 4901 [S4] | alta |
| Descoberta EIP-6963 | A página do provider não cita 6963. O Connect Kit transmite eventos 6963 em mobile e Telegram, e em PC `init()` basta para dApps que suportam 6963 [S4]. O rdns é auto-atestado e falsificável [S7]; o painel já ancora em `okxwallet` | média |
| Redes | Tabela Open API: X Layer (196) e Monad (143) têm Wallet API, Trade, Market e Dapp Connect (Payments só X Layer); também Ethereum, BNB Chain, Base, Arbitrum, Polygon, Optimism, Solana, Tron, SUI, Bitcoin e dezenas de EVM. A tabela do Agentic Wallet (~50 EVM) também inclui Monad e X Layer [S2] | alta (tabela lida duas vezes) |
| Conexão e escopo | `eth_requestAccounts` abre popup, só por gesto do usuário, e chama `wallet_requestPermissions`; `eth_accounts` é a única permissão [S1]. O EIP-2255 não define revogação [S8] | alta |
| Revogação da conexão | Extensão: Settings, DApps connection, Disconnect all; sem revogação por site descrita (artigo de 2023, revisto em 2026-08) [S18]. Método programático (`wallet_revokePermissions`) não documentado. O "Desconectar" do painel só encerra a sessão local | média |
| wallet_switchEthereumChain, wallet_watchAsset | Switch só aparece em exemplos; watchAsset: ERC20, apenas extensão [S1]. `wallet_addEthereumChain` consta no Universal Provider do app [S5], não na página do provider | alta / média |
| eth_sendTransaction, personal_sign, eth_signTypedData_v4 | Ausentes da página do provider da extensão [S1]; listados no Universal Provider do app (OKX App 6.88.0 ou superior) [S5]. Prompt e comportamento na extensão: NAO CONFIRMADO em doc | média |
| EIP-5792 | `wallet_sendCalls` (version 2.0.0, atomicRequired), `wallet_getCallsStatus` (100/200/400/500), `wallet_getCapabilities`; a doc diz que toda transação OKX é atômica; capabilities (ex. paymasterService) não suportadas; exemplos só Ethereum e Sepolia [S1, S9]. X Layer e Monad: NAO CONFIRMADO | alta (existe), baixa (cobertura) |
| EIP-7702 na carteira | Upgrade opcional (Home, Mais, 7702 Upgrade), anunciado em 2025-05-07; redes, delegado e reversão não documentados [S15, S16]. Código okxlabs/okx-smart-wallet-evm: 7702 e 4337 v0.7, owners com expiração e hook, AllowanceManager, sem chaves de sessão, auditores não nomeados; fábrica e entry têm bytecode na X Layer e não na Monad [S17, S39] | média |
| Simulação e avisos antes de assinar | A OKX descreve simulação (mudanças de ativos, autorizações, erros) e ressalva que o resultado pode divergir; fala de alertas de phishing e pontuação de risco de contrato sem detalhes [S19]. Avisos por tipo de assinatura e por rede: NAO CONFIRMADO | média |
| Mobile e deep link | App (OKX Connect/Universal Provider: namespaces `eip155:<id>`, redirect, sessão apagada no disconnect, sem expiração documentada) ou extensão, que também funciona no navegador DApp do app; o app sozinho não injeta provider no desktop [S3, S5]. Connect Kit: App Wallet, Mini Wallet, QR [S4]. Deep link `okx://wallet/dapp/url?dappUrl=`: só fonte comunitária, NAO CONFIRMADO | média / baixa |
| API aberta Onchain OS | Chave, secret e passphrase; HMAC SHA-256 em cabeçalhos OK-ACCESS-*; relógio com tolerância de 30 s; não custodia chave de usuário; escopos e allowlist de IP não descritos [S26]. Nenhuma chave foi solicitada | alta |

## (c) Produtos da carteira aproveitáveis

| Produto | Acesso por software ou link, e cobertura | Limites e riscos | Uso |
|---|---|---|---|
| Swap (agregador, 500+ DEXs) | API Trade (HMAC) e CLI `onchainos swap quote/execute` (aprova, assina, transmite); X Layer e Monad com Trade [S2, S21, S26] | Slippage automático; MEV protection só Ethereum, BSC, Base, Solana; recotar após ~10 s; `swap swap` só devolve calldata | T0 cotação; T1 plano assinado na extensão |
| Cross-chain | CLI `cross-chain` (Stargate, Across, Relay, Gas.zip, Mayan, ButterSwap), só exactIn [S21] | Lista de cadeias não publicada: X Layer e Monad NAO CONFIRMADO; destino diferente do remetente pede 2ª confirmação | T1 manual (X Layer para Monad) |
| Earn e DeFi | Skill `okx-defi` (descobrir, depositar, sacar, claim, posições) e web3.okx.com/earn [S21]; Aave na X Layer desde 2026-03-30 [S46] | Monad não citada no skill; APY não é retorno garantido; contrato e lockup | T0 leitura |
| Perps | `okx-dapp-discovery` roteia para Hyperliquid; como assina: não descrito [S21] | Fora do escopo (alavancagem); X Layer e Monad: NAO CONFIRMADO | nenhum |
| Smart money e copy trading | Leaderboard e Tracker (web); sinais `okx-dex-market` só leitura, campos tratados como não confiáveis [S21]; copy em Trader Mode: Solana, BSC, X Layer, Base [S23] | Monad não citada; janelas de 7 dias enganam; copiar carteira alheia herda o risco dela | T0, insumo opcional |
| Rewards e airdrops | Claim de recompensas de protocolos no `okx-defi` [S21]; campanhas Wallet e Cryptopedia sem API achada (docs/okx-rewards-v1/RESEARCH.md) | Regras e elegibilidade mudam; sem estimativa de valor | fora de escopo |
| Gás | Gas Station: só Solana; Agentic Wallet sem gás na X Layer; transferências USDT/USDC na X Layer sem gás via x402 desde 2025-12-17 [S21, S24] | Monad paga MON; sem patrocínio documentado | nenhum |
| Aprovações e revogação | Aba Approval (anúncios de 2023 e 2024; a lista de 2023 não tem X Layer nem Monad) [S25]; CLI `security approvals` (EVM; revoga com approve(0) após tx-scan) [S21]; `approve(spender,0)` é sempre possível | Cobertura atual NAO CONFIRMADO; Permit2 no CLI NAO CONFIRMADO | T0 leitura; T1 revogar; kill switch |
| Scans de segurança | `token-scan`, `dapp-scan`, `tx-scan` (simulação pré-execução), `sig-scan` (EIP-712, personal_sign); sem login; scan que falha não é aprovação (exceção: em swap, falha do token-scan segue com aviso) [S21] | Serviço do fornecedor, cobertura por rede NAO CONFIRMADO; não substitui o `eth_call` próprio | T1 e T2 antes de assinar |
| Pagamentos x402/APP | O Agentic Wallet assina pagamentos de forma autônoma; X Layer é a única rede citada [S26] | Sem tetos descritos: é canal de saída extra a limitar | bloquear no T2 |

## (d) Modelos de permissão, ranqueados por segurança e viabilidade

Critério: segurança = perda máxima se agente, servidor ou modelo forem comprometidos; viabilidade = existe hoje na X Layer ou na Monad, com o OKX Wallet como origem dos fundos. Esforço (estimativa minha, não medida): S até ~3 dias; M de 1 a 3 semanas; L mais de 3 semanas mais revisão independente.

| # | Modelo | Segurança se o agente for comprometido | Viabilidade hoje | Esforço | Viável agora? |
|---|---|---|---|---|---|
| 1 | Carteira de agente dedicada, saldo mínimo, teto duro | média: perde no máximo o saldo; chave quente | alta | S | sim (T2-A) |
| 2 | Safe 1.4.1 + Allowance Module ou Roles, chave de agente | alta: alvo, seletor e período on-chain | média: Monad sim, X Layer parcial | L | parcial (T2-B, após testes) |
| 3 | OKX Agentic Wallet (TEE + política no portal) | média: chave fora do host, confiança no fornecedor | média para swaps; baixa para Kuru por bloco | M | parcial (swaps, não o loop de 300 ms) |
| 4 | Aprovação exata e expirável + co-assinatura humana | alta para aprovações; não limita quem executa | alta | S a M | sim (T1) |
| 5 | ERC-4337 com chaves de sessão (ERC-7579) | alta | média na Monad; incerta na X Layer | L | não por ora |
| 6 | EOA delegada por EIP-7702 | média: depende do contrato delegado | baixa: OKX Wallet sem delegado customizado | L | não |
| 7 | ERC-7715 e ERC-7710 | alta em tese | baixa: Draft, sem suporte OKX documentado | L | não (bloqueado) |
| 8 | OKX Trader Mode | baixa para "sem a chave principal" | baixa: só OKX DEX | S | não recomendado |

**1. Carteira de agente dedicada com teto duro** (esforço S; viável agora: sim)
- Como funciona: o dono cria fora do OKX Wallet uma chave nova (nunca derivada da seed principal), guarda em cofre do SO (como já se faz com a chave Jev) e financia só gás e margem Kuru; o saldo é o teto; um gate determinístico no executor aplica allowlist, tetos e kill switch. É o desenho que o repositório já presume (chave operacional separada, `MARGIN_MON`, `MARGIN_USDC`).
- Suporte hoje: X Layer e Monad: EOA comum, sim. OKX Wallet: só envia fundos (T1) e recebe o sweep; não oferece permissão sobre essa conta.
- Riscos e revogação: chave quente; sem limite on-chain (quem tiver a chave gasta o saldo e saca a margem com `withdraw`); lucros ou airdrops que chegam ao endereço aumentam a exposição. Revogar = cancelar ordens, sacar, varrer para o endereço do dono e girar a chave.

**2. Safe + módulo de limites ou Roles** (esforço L; viável agora: parcial)
- Como funciona: os ativos ficam num Safe cujo dono é o OKX Wallet do dono; a chave do agente é só membro de papel (Roles: alvo, seletor, parâmetros e frequência) ou delegado do Allowance Module (valor por período, apenas transferências de ETH e tokens) [S32, S33]. Revogar = desabilitar o módulo ou remover o membro, por transação do dono.
- Suporte hoje: Monad: Safe 1.4.1, Allowance v0.1.1 e Safe4337Module v0.3.0 constam nos registros da Safe e têm bytecode; o contrato Roles do README da Zodiac tem bytecode (a lista de redes do README não foi conferida para 143) [S31, S33, S39]. X Layer: Safe e fábrica de proxies Zodiac sim; Allowance Module e Roles do README não [S39]. UI Safe{Wallet} em 143 e 196: NAO CONFIRMADO. OKX Wallet assina como dono (transações e typed data comuns, NAO CONFIRMADO em doc da extensão).
- Riscos: um módulo tem controle total do Safe [S32]; Roles v2 e Delay tiveram falha ERC-1271 em 2026-06, corrigida, versão implantada NAO CONFIRMADA [S33]; Kuru aceitar contrato como maker é NAO CONFIRMADO; sobrecarga de gás e latência NAO MEDIDAS; faixa de preço dentro de arrays exige condição de parâmetro ou contrato próprio; Guards do Safe (verificação pré e pós-execução de toda tx) não foram avaliados aqui.

**3. OKX Agentic Wallet** (esforço M; viável agora: parcial)
- Como funciona: conta separada, chave gerada e usada no TEE da OKX; o agente (Claude Code, Cursor etc.) usa a CLI/MCP `onchainos` (`wallet send`, `contract-call`, `sign-message`, `swap`); o dono define no portal web limite por transação, limite diário de transferência, limite diário de trade (USD, reinício 00:00 UTC) e whitelist de destinos de transferência; o agente só lê via `wallet status` [S20, S21]. Exportar a seed desvincula a conta e encerra a operação pelo agente.
- Suporte hoje: X Layer: sim, sem gás [S2, S21]. Monad: sim na tabela oficial e no repositório dapp-connect-agenticwallet, mas ausente do chain-support.md da CLI; confirmar com `onchainos wallet chains` (não executado) [S2, S21, S22]. Existe login por API key (AK), com política no portal de desenvolvedor logando pela carteira EOA criadora (mecânica NAO CONFIRMADA). Não é o OKX Wallet principal.
- Ordens limite do CLI (`strategy create-limit`): ficam no TEE e disparam sozinhas por preço em USD (mínimo US$1, validade fixa de 7 dias, até 100 pendentes, slippage padrão 15%); redes: Ethereum, BSC, X Layer, Solana, Base, Arbitrum, sem Monad [S21].
- Riscos: local de aplicação da política, expiração de sessão e revogação do agente NAO documentados; não há allowlist de contrato ou seletor (a whitelist cobre transferências) e não está claro se `contract-call` arbitrário conta no limite de trade; `--force`, confirmações e a recusa de aprovação ilimitada são regras de comportamento do agente no skill (um PoC de terceiros, não verificado, afirma que não há checagem em código) e o skill prevê modo silencioso com autorização explícita; o CLI ativa sozinho o Trader Mode da conta ao criar ordens limite, sem perguntar (alcance concedido NAO CONFIRMADO); bloqueio automático do fornecedor; sem auditoria independente recuperada; latência por bloco NAO MEDIDA; Brasil NAO CONFIRMADO. Serve a swaps pontuais, não ao loop de 300 ms.

**4. Aprovações exatas e expiráveis + co-assinatura humana** (esforço S a M; viável agora: sim, como complemento)
- Como funciona: `approve(spender, valor exato)` ou `wallet_sendCalls` atômico (aprova e age) assinados pelo dono; Permit2 com AllowanceTransfer (valor e expiração) ou SignatureTransfer (uso único, prazo, nonce); acima de um limite ou para destino novo, assinatura humana (prompt da extensão ou Safe 2 de 2) [S9, S36].
- Suporte hoje: Permit2 canônico (0x0000...8BA3) tem bytecode nas duas redes, com `approve`, `lockdown` e `invalidateNonces` no código (conferido na Monad; mesmo tamanho de bytecode na X Layer); `wallet_sendCalls` documentado, cobertura por rede NAO CONFIRMADO; o skill do OKX manda recusar aprovação ilimitada por padrão (teto: valor do swap + 10%), mas como regra de comportamento do agente [S21].
- Riscos: não limita quem executa depois da aprovação; Permit2 costuma exigir aprovação máxima uma vez por token; assinaturas de permit são alvo de phishing; humano não acompanha 300 ms. Revogar: `approve(spender,0)`, `lockdown`.

**5. ERC-4337 com chaves de sessão** (esforço L; viável agora: não por ora)
- Como funciona: conta inteligente (Kernel/ZeroDev, Biconomy Nexus Smart Sessions, Safe com Safe4337Module) e chave de sessão com políticas (chamada por contrato, função e parâmetro; gás; taxa; tempo) via módulos ERC-7579 (Draft); revogar = desinstalar o validador ou expirar [S12, S30, S35].
- Suporte hoje: Monad: EntryPoints e provedores em mainnet (bundler e paymaster: Alchemy, Pimlico, ZeroDev, thirdweb; orquestração: Biconomy; relayer: Sequence) [S30, S37]. X Layer: EntryPoints sim; bundler NAO CONFIRMADO (Alchemy sem linha de X Layer na tabela de Smart Wallets; página antiga cita Bundler e Gas Manager, mas ainda diz Polygon CDK) [S37]. OKX Wallet: os smart accounts de 2023 não listavam nenhuma das duas redes [S25].
- Riscos: UserOp passa por bundler e custa mais gás e latência que uma tx simples (NAO MEDIDO); bug de módulo; dependência de bundler e paymaster; revogação exata no SDK não descrita na fonte lida.

**6. EOA delegada por EIP-7702** (esforço L; viável agora: não)
- Como funciona: o EOA recebe código delegado (indicador 0xef0100 seguido do endereço), persistente até nova autorização; autorizar o endereço zero restaura o EOA; o contrato delegado aplica os limites [S10].
- Suporte hoje: Monad: tipo 4 suportado, com reserva de 10 MON, sem CREATE/CREATE2 em código delegado; Simple7702Account e EIP7702StatelessDeleGator (MetaMask) têm bytecode [S29, S39]. X Layer: OP Stack com hardforks até Isthmus desde o gênese e estimateGas aceita authorizationList [S27, S28, S39]; sem EIP7702StatelessDeleGator. OKX Wallet: upgrade para o delegado da OKX; delegado customizado NAO CONFIRMADO.
- Riscos: delegado mal escrito dá controle quase total; autorização com chain_id 0 vale em qualquer rede; colisão de storage ao trocar de delegado; quebra de `tx.origin`; phishing de autorização [S10, S16].

**7. ERC-7715 e ERC-7710** (esforço L; viável agora: não, bloqueado)
- Como funciona: o dApp chama `wallet_requestExecutionPermissions` (tipo, expiração, regras); a resposta traz `context` e `delegationManager`; a execução é `redeemDelegations` (ERC-7710); revogação por `wallet_revokeExecutionPermission` [S13, S14].
- Suporte hoje: ambos Draft. MetaMask 13.23+ com smart account e conta de sessão sem fundos [S34]; DelegationManager v1.3.0 e enforcers de alvo e método têm bytecode na Monad e não na X Layer [S34, S39]. OKX Wallet: a doc só lista `eth_accounts`; NAO CONFIRMADO.
- Riscos: nomes e formatos mudam (o método já mudou), carteiras divergem, a revogação depende da carteira, a seção de verificação do ERC-7710 segue em discussão.

**8. OKX Trader Mode** (esforço S; viável agora: não recomendado)
- Como funciona: o usuário ativa por 7, 15 ou 30 dias e assina intenções de ordem; o TEE confere que a tx corresponde à intenção e assina ordens OKX DEX (market, limite, TP/SL, copy); a chave fica criptografada no TEE e é apagada no fim do período [S23].
- Suporte hoje: EVM e Solana; copy em Solana, BSC, X Layer, Base; Monad não citada; primeira ativação de conta de seed só até US$200 mil; sem API pública documentada para agente externo.
- Riscos: coloca a chave da conta de seed sob custódia de TEE do fornecedor, o que contradiz "sem a chave principal" se usado na conta principal (busca indica que reativar exige reenviar a chave; guia não aberto); auditoria prometida e não publicada; só OKX DEX, não Kuru.

**Alternativa não ranqueada: custódia de terceiros com motor de política.** A lista de wallet infra da Monad cita Turnkey, Cubist, Para, Fordefi, Privy e Sequence com TEE ou MPC e política de sessão [S30]. A página de política da Turnkey mostra restrição por destino (`eth.tx.to`) e aprovadores por consenso; seletor, valor e limite por período não aparecem na página lida e a X Layer não foi conferida: NAO CONFIRMADO [S35]. Esforço M a L e a mesma ressalva de confiança no fornecedor.

**Outras ofertas OKX documentadas (nenhuma serve como delegação):** keyless wallet MPC 2 de 3, com criação de novas carteiras removida em 2025-05-23; smart accounts ERC-4337 de 2023 (Ethereum, Arbitrum, Polygon, Optimism, BNB Chain, Avalanche, OKTC; sem X Layer nem Monad) [S25]; API aberta Onchain OS, que não custodia chaves [S26]. WaaS de custódia para terceiros além do Agentic Wallet: NAO CONFIRMADO, nenhuma página localizada.

Evidência on-chain (sondagem 2026-10-10, bytecode presente = sim; identidade por endereço canônico, auditoria não verificada) [S39]:

| Contrato | X Layer 196 | Monad 143 |
|---|---|---|
| EntryPoint v0.6, v0.7, v0.8, v0.9 (0x5FF1...2789, 0x0000...a032, 0x4337...f108, 0x4337...D009) | sim | sim |
| Permit2 0x0000...8BA3, Multicall3, CreateX | sim | sim |
| Safe 1.4.1 (singleton registrado 0x4167...461a, L2, fábrica, MultiSendCallOnly) e 1.3.0 (L2, fábrica) | sim | sim |
| Safe4337Module v0.3.0 0x75cf...c226 | sim (fora do registro oficial) | sim |
| Safe Allowance Module v0.1.1 0xAA46...091C | não | sim |
| Zodiac Roles do README oficial 0xF296...83D5 e biblioteca Packer | não | sim |
| Fábrica de proxies Zodiac 0x0000...a236 e biblioteca Integrity | sim | sim |
| MetaMask DelegationManager 1.3.0 0xdb9B...7dB3, EIP7702StatelessDeleGator 0x63c0...E32B, enforcers | não | sim |
| Simple7702Account 0xe6Ca...555B | sim | sim |
| OKX smart wallet: fábrica 0x2531...7A2A, entry 0xcEF0...4743 | sim | não |
| `eth_estimateGas` com authorizationList fictícia | aceito (+~25 mil gás) | aceito (+~25 mil gás) |

## (e) Arquitetura recomendada em níveis

**T0, observar (somente leitura).**
- Hoje: conta, rede e saldos (MON e USDC na Monad; OKB, USDT, USDT0 e três variantes de USDC na X Layer) no mesmo bloco, sem assinatura; "Desconectar" é local; nada vai ao backend.
- Ampliar sem permissão nova: `eth_getCode` da conta conectada (prefixo 0xef0100 = delegação 7702 ativa); `allowance(owner, spender)` para spenders conhecidos (MarginAccount Kuru, Permit2, roteadores OKX DEX); saldo, nonce e margem Kuru do endereço do agente (públicos, sem conectar a carteira); sempre com bloco e instante, e erro nunca vira zero.
- Insumos opcionais (scans OKX, sinais smart money): dados não confiáveis, como o próprio skill do OKX manda; entram como número ou enum, nunca como texto no prompt. Teste de regressão: o bundle do painel não contém `eth_sendTransaction`, `wallet_sendCalls`, `eth_sign*` nem `personal_sign` enquanto T1 não for aprovado.

**T1, propor planos; o humano aprova e assina na extensão.**
- Fluxo: Jev escolhe um ID elegível ou hold; o gate monta o ExecutionPlan (passos, alvo, seletor, valor, minOut, expiry em blocos, quoteHash, idempotencyKey, perda máxima, hash do calldata); o painel decodifica pelo ABI em código determinístico (nunca por texto do modelo), mostra `eth_call` no mesmo bloco e, se houver, `tx-scan`; o dono clica e confere o prompt da extensão (simulação da OKX [S19]) contra o plano.
- Escopo: financiar o agente (MON de gás; depósito exato na margem via `deposit(user, token, amount)`), aprovar valor exato, revogar, mover X Layer para Monad, sacar e varrer. `wallet_sendCalls` atômico só depois de confirmar a rede; senão duas transações. Assinatura de `eth_sendTransaction` e typed data na extensão: testar com valor mínimo no ambiente do dono (não executado aqui).
- Regras: `eth_requestAccounts` só em clique; conferir conta e chainId antes e depois; mudar conta ou rede invalida o plano; nunca aprovação ilimitada; destino fora da allowlist bloqueia; sucesso só pelo recibo na cadeia.
- Limite: humano não acompanha blocos de 300 ms, então T1 não sustenta "ordem a cada bloco"; serve para capital, parâmetros e revogação. Decisão do dono: devolver o txHash do navegador ao backend quebra a regra atual de não enviar dados da carteira; preferir que o Reconciler observe a cadeia pelo endereço do agente.

**T2, executor delegado com limites duros.** Variantes: T2-A (agora) agente dedicado + gate; T2-B (alvo) Safe + Roles/Allowance na Monad; T2-C (swaps pontuais) Agentic Wallet com limites baixos no portal, só `swap quote/execute` após `tx-scan`, fora do loop do Kuru. Especificação de política (exemplo derivado desta pesquisa e do ABI; não implementada):

```
chainId 143; principal: endereço do agente (T2-A) ou Safe do dono (T2-B)
alvo permitido: mercado Kuru MON/USDC 0x065C9d28E428A0db40191a54d33d5b7c71a9C394 (proxy ERC-1967; implementação 0x5e3446c600524be453bbcefd46a9e4c9be8899a0)
seletores: 0x5339c59f batchUpdate(uint32[],uint96[],uint32[],uint96[],uint40[],bool); 0x23afbff3 batchCancelOrders(uint40[])
negados ao agente (no gate em T2-A, on-chain em T2-B): MarginAccount 0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5 withdraw 0x00f714ce, batchWithdrawMaxTokens 0x0f163fa8, deposit 0x8340f549; qualquer outro alvo; delegatecall
valor nativo 0; postOnly true; no máximo N itens por array; preço dentro de banda do mid; sweep só para o endereço do dono
papel ou chave com expiração de horas, renovada pelo dono; tetos em inteiros (unidades base): por plano, por dia (incluindo gás), perda diária
```

O que precisa existir:
1. Signatário isolado: chave em cofre do SO ou HSM, processo sem egress além dos RPCs, nunca no contexto do modelo; expiração e rotação.
2. Gate determinístico entre o Jev e a assinatura: só assina calldata cujo hash pertence a um plano elegível gravado antes (amarra a assinatura à decisão, como na defesa A-VIP [S41]); valida ID ou hold, expiry, quoteHash, bloco, banda de preço, chainId, alvo, seletor, tamanho dos arrays e nonce local; idempotencyKey no journal; timeout não é recusa: reconciliar antes de reenviar.
3. Tetos em camadas: saldo da margem = perda máxima do capital; tetos por plano e por dia em inteiros, incluindo gás; reserva por plano liberada só após reconciliação.
4. Kill switch em 4 camadas: latch HOLD no software; cancelAll mais sweep; revogação on-chain pelo dono (desabilitar módulo, remover papel, mover fundos); política do portal, se Agentic Wallet; desligamento ensaiado e cronometrado.
5. Reconciler e alertas: compara eventos da cadeia com o journal; alerta para chamada fora da política, saldo ou margem divergente e nonce avançando sem plano.
6. Governança: aprovação humana acima de um limite configurável e para novo destino ou contrato; política só muda pelo canal do dono (transação on-chain ou portal), nunca por ferramenta do modelo.

Bloqueado hoje:
- Código: `Market.init()` recusa chave em modo live até qualificação, reconciliação e revisão independente; `LIVE_ACK` não remove (docs/OPERACAO-BRASIL.md, src/market.ts).
- Kuru: contrato como maker NAO CONFIRMADO (mercado e MarginAccount marcam o KuruForwarder como trusted forwarder, `isTrustedForwarder` = true, mas a fonte do forwarder não foi lida); auditorias listadas (Spearbit, Cantina) são do fornecedor, sem escopo e datas [S38, S39]. Exige teste em fork.
- Roles: versão corrigida e auditoria específica; a X Layer não tem Allowance Module nem Roles oficial.
- OKX Wallet principal: sem permissões nem chaves de sessão (ERC-7715 não documentado); o dono configura o Safe com transações comuns, e a UI Safe{Wallet} em 143 e 196 é NAO CONFIRMADO.
- Agentic Wallet no loop: política, revogação e latência não documentadas ou medidas; Brasil NAO CONFIRMADO.
- Tensão registrada: a mensagem central exige ordem a cada bloco de 300 ms e os documentos de prontidão preveem hold e gates; nenhum teto aqui relaxa esses gates.

Verificações propostas (não executadas por esta pesquisa): `onchainos wallet chains` e `wallet status` numa conta Agentic nova e sem fundos; latência p50/p99 de assinatura remota contra o bloco de 300 ms; fork test na Monad com Safe + Roles + `batchUpdate` por contrato; registrar o prompt exato da extensão para `eth_sendTransaction`, `eth_signTypedData_v4` e `wallet_sendCalls`; obter a versão corrigida do Roles e o relatório de auditoria; confirmar no portal onde a política do Agentic Wallet é aplicada.

Mapa de revogação:

| Mecanismo | Como revogar | Observação |
|---|---|---|
| Conexão do OKX Wallet | Settings, DApps connection, Disconnect all [S18] | Não revoga approvals nem delegações |
| Agente dedicado (T2-A) | cancelAll, `withdraw`, sweep ao dono, girar a chave | Sem revogação on-chain: o saldo é o controle |
| Safe + Roles/Allowance | Transação do dono: desabilitar módulo, remover membro ou papel, apagar allowance | Exige o dono disponível |
| approve e Permit2 | `approve(spender,0)`; Permit2 `lockdown` ou `invalidateNonces` | Funções confirmadas no bytecode (sondagem) |
| Agentic Wallet | Portal: zerar limites; `wallet logout` (local); exportar a seed desvincula a conta | Revogação do agente e local de aplicação NAO documentados |
| Trader Mode | Desativar (ordens suspensas ou canceladas); chave apagada do TEE no fim do período [S23] | Apagar ao desativar: NAO CONFIRMADO |
| EIP-7702 | Nova autorização para o endereço zero [S10] | Exige tx tipo 4; na Monad, conferir reserva de 10 MON |
| ERC-7715 | `wallet_revokeExecutionPermission` [S14] | Depende da carteira; OKX NAO CONFIRMADO |
| ERC-4337 com sessão | Desinstalar o validador ou deixar expirar | Procedimento exato NAO descrito na fonte lida |

## (f) Ameaças e mitigações para um assinador guiado por LLM

| Ameaça | Como aparece neste projeto | Mitigação concreta |
|---|---|---|
| Injeção de prompt por nome, símbolo ou descrição de token | Texto on-chain entra no contexto do Jev (OWASP LLM01); o skill do OKX manda tratar campos da CLI como não confiáveis; um PoC de terceiros alega que `name()` de ERC20 chega ao agente sem filtro e leva a `approve` ilimitado via `contract-call`, e há relato de mídia sem estudo nomeado (ambos não verificados) [S21, S40, S42] | Jev recebe só números e IDs de candidatos já elegíveis; texto livre fora do prompt, ou truncado e escapado; saída tipada (ID finito ou hold); modelo sem ferramenta de escrita; ativos por contrato em allowlist |
| Memória e canais sociais envenenados | Memory injection supera prompt injection em agentes Web3 (ElizaOS) [S41]; Grok/Bankr (2026-05): instrução em Morse num post, um NFT concedeu permissões, perda de ~US$150 a 215 mil conforme a fonte [S42] | Sem memória persistente com texto externo; permissão só pelo canal do dono; teto por transação; humano acima do limite |
| Excesso de agência | OWASP LLM06: funcionalidade, permissão e autonomia demais [S40] | Única ferramenta do modelo: escolher ID ou hold; execução só no gate; autorização no destino (contrato, portal), não no LLM |
| Calldata maliciosa ou alvo desconhecido | Valor nativo, delegatecall, seletor inesperado, arrays enormes | Allowlist de (alvo, seletor); valor 0; decodificação determinística; `eth_call` no mesmo bloco; `tx-scan`; limite de itens; calldata nunca vem do modelo |
| Aprovações ilimitadas e permits | Agente aprova o máximo; typed data com spender estranho [S21, S36] | `approve` exato e expirável, revogado depois; negar approve, permit e setApprovalForAll fora da lista; `sig-scan`; Permit2 só com spender em allowlist |
| Roubo da chave de agente ou de sessão | Chave quente no servidor; sessão da CLI no host | Cofre ou HSM; processo isolado; expiração e rotação; teto = saldo; papel revogável; alerta de chamada fora da política; TEE não é garantia (ataque físico fica fora do modelo de ameaça dos fabricantes) [S45] |
| Replay | Assinatura reaproveitada em outra rede, contrato ou plano | chainId 143 explícito; domínio EIP-712 com chainId e verifyingContract; nonce; 7702 sem chain_id 0; 4337 amarra EntryPoint e rede [S10, S11]; idempotencyKey por plano |
| Cotação obsoleta | A CLI do OKX manda recotar após ~10 s; a Monad faz ~3,3 blocos por segundo [S21, S29] | quoteHash com bloco de validade; revalidar no bloco de envio; minOut e slippage fixos no gate; descartar plano expirado |
| MEV e sandwich | MEV protection do OKX só em Ethereum, BSC, Base e Solana [S21]; Monad sem mempool global [S29]; X Layer ordena pelo sequenciador da OKX (descentralização NAO CONFIRMADA) [S27] | Ordens post-only (`postOnly=true`), minOut, tamanhos pequenos; rota privada na Monad e na X Layer: NAO CONFIRMADO |
| Envenenamento de endereço | Cópia de endereço do histórico (US$83,8 mi em perdas medidas em Ethereum e BSC, 2022-2024) [S43] | Destinos só de allowlist, comparação dos 20 bytes e checksum; nunca do histórico, da área de transferência ou do modelo; destino novo exige humano e espera |
| Ordens fora do mercado (Kuru) | Ordem de limite fora da banda pode ser preenchida por contraparte do atacante e drena a margem | Banda de preço contra mid ou TWAP; teto de notional em repouso; post-only; limite de ordens por bloco; margem pequena |
| Assinatura cega e UI adulterada | Bybit 2025: máquina de dev comprometida e transação disfarçada [S44]; painel ou dependência adulterada | Decodificar o calldata em código independente da UI; comparar com o prompt da extensão; dependências fixas, CSP, SRI; segundo dispositivo para valores altos |
| Falha do módulo de permissão | Gnosis Pay: checagem ERC-1271 sem validar o sucesso da chamada em módulos Zodiac [S33] | Módulos pequenos e auditados; versão corrigida; revisão independente; teste em fork; teto baixo; monitor de eventos |
| Risco do fornecedor (TEE) | Chave e política no servidor da OKX; bloqueio automático; sem auditoria independente recuperada; disponibilidade regional [S20, S21, S23] | Teto baixo; política definida pelo dono no portal; plano de saída (mover fundos, exportar e desvincular); fora do loop de 300 ms |
| Estado desconhecido e falha silenciosa | Timeout, tx perdida, saldo divergente | Latch HOLD; cancelAll e sweep; reconciliar antes de reenviar; aprovação humana acima do limite; ensaio periódico do desligamento |

## (g) Fontes (acesso em 2026-10-10)

- S1. OKX Onchain OS, Provider EVM: https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/chains/evm/provider (2026-10-10)
- S2. OKX Onchain OS, Supported Networks: https://web3.okx.com/onchainos/dev-docs/home/supported-chain (2026-10-10)
- S3. OKX, Connecting Wallet (UI SDK, app, extensão): https://web3.okx.com/onchainos/dev-docs/sdks/okx-wallet-integration-introduction (2026-10-10; as páginas filhas app-connect-preparation e web-detect-okx-wallet devolveram só a introdução, NAO LIDAS)
- S4. README @okxweb3/connect-kit: https://cdn.jsdelivr.net/npm/@okxweb3/connect-kit/README.md (2026-10-10)
- S5. README @okxconnect/universal-provider: https://cdn.jsdelivr.net/npm/@okxconnect/universal-provider/README.md (2026-10-10)
- S6. EIP-1193: https://eips.ethereum.org/EIPS/eip-1193 (2026-10-10)
- S7. EIP-6963: https://eips.ethereum.org/EIPS/eip-6963 (2026-10-10)
- S8. EIP-2255: https://eips.ethereum.org/EIPS/eip-2255 (2026-10-10)
- S9. EIP-5792: https://eips.ethereum.org/EIPS/eip-5792 (2026-10-10)
- S10. EIP-7702: https://eips.ethereum.org/EIPS/eip-7702 (2026-10-10)
- S11. ERC-4337: https://eips.ethereum.org/EIPS/eip-4337 (2026-10-10)
- S12. ERC-7579: https://eips.ethereum.org/EIPS/eip-7579 (2026-10-10)
- S13. ERC-7710: https://eips.ethereum.org/EIPS/eip-7710 (2026-10-10)
- S14. ERC-7715: https://eips.ethereum.org/EIPS/eip-7715 e https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-7715.md (2026-10-10)
- S15. OKX Help, Wallet suporta EIP-7702 (2025-05-07): https://web3.okx.com/help/okx-wallet-to-support-eip-7702 (2026-10-10)
- S16. OKX Research, implementação do SDK EIP-7702: https://web3.okx.com/learn/eip-sdk-implementation (2026-10-10)
- S17. okxlabs/okx-smart-wallet-evm: https://github.com/okxlabs/okx-smart-wallet-evm e README em https://raw.githubusercontent.com/okxlabs/okx-smart-wallet-evm/main/README.md (2026-10-10)
- S18. OKX Help, DApps connection e Disconnect all: https://www.okx.com/en-us/help/how-to-switch-between-okx-web3-wallet-and-other-wallets-in-google-chrome (2026-10-10)
- S19. OKX Orbit, simulação não garante o resultado: https://www.okx.com/en-us/orbit/insight/88953970216512 ; OKX Learn, alertas da carteira: https://www.okx.com/en-us/learn/okx-wallet-for-web3 (2026-10-10)
- S20. OKX Agentic Wallet: https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet ; https://web3.okx.com/onchainos/dev-docs/wallet/install-your-agentic-wallet ; https://www.okx.com/en-us/help/okx-wallet-officially-launches-agentic-wallet (2026-03-18) ; https://web3.okx.com/learn/agentic-wallet (2026-10-10)
- S21. okx/onchainos-skills (MIT): https://github.com/okx/onchainos-skills ; SECURITY.md ; skills/okx-agentic-wallet/references/{wallet,wallet-portal-actions,wallet-cli-reference,security,swap,strategy,strategy-cli-reference,gateway,bridge,gas-station,audit-log,account-faq}.md e _shared/chain-support.md ; skills/{okx-defi,okx-dex-market,okx-dapp-discovery}/SKILL.md, todos sob https://raw.githubusercontent.com/okx/onchainos-skills/main/ (2026-10-10)
- S22. okx/dapp-connect-agenticwallet: https://github.com/okx/dapp-connect-agenticwallet e GUIDE.md em https://raw.githubusercontent.com/okx/dapp-connect-agenticwallet/main/GUIDE.md (2026-10-10)
- S23. OKX Trader Mode: https://web3.okx.com/help/what-is-smart-account ; https://web3.okx.com/help/how-to-trade-with-smart-account ; https://www.okx.com/en-us/help/how-do-i-use-the-okx-wallet-smart-account-for-copy-trading (2026-10-10)
- S24. OKX gás: https://www.okx.com/en-us/help/okx-wallet-x-layer-0-gas (2025-12-17) ; https://web3.okx.com/learn/wallet-gas-station (2026-10-10)
- S25. OKX Help: keyless wallet https://www.okx.com/en-us/help/what-is-okx-keyless-wallet ; smart accounts 2023 https://www.okx.com/en-us/help/okx-wallet-supports-account-abstraction-create-smart-accounts-with-one-click ; aprovações https://www.okx.com/help/okx-wallet-now-support-on-full-approval-history e https://www.okx.com/help/okx-web3-wallet-has-updated-approval-management (2026-10-10)
- S26. OKX Onchain OS: https://web3.okx.com/onchainos/dev-docs/home/what-is-onchainos ; .../home/api-access-and-usage ; .../wallet/product-and-service ; .../payments/overview ; .../trade/dex-api-introduction (2026-10-10)
- S27. X Layer: https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information ; .../contracts ; https://www.okx.com/en-us/learn/from-geth-to-reth (2026-10-10)
- S28. OP Stack, Isthmus: https://specs.optimism.io/protocol/isthmus/overview.html (2026-10-10)
- S29. Monad docs: https://docs.monad.xyz/developer-essentials/network-information ; .../summary ; .../eip-7702 ; .../reserve-balance (2026-10-10)
- S30. Monad docs, infraestrutura: https://docs.monad.xyz/tooling-and-infra/wallet-infra/account-abstraction ; .../smart-accounts ; .../embedded-wallets (2026-10-10)
- S31. Registros Safe: https://raw.githubusercontent.com/safe-global/safe-deployments/main/src/assets/v1.4.1/safe.json ; https://raw.githubusercontent.com/safe-global/safe-modules-deployments/main/src/assets/allowance-module/v0.1.1/allowance-module.json ; .../safe-4337-module/v0.3.0/safe-4337-module.json (2026-10-10)
- S32. Safe, módulos e Allowance Module: https://docs.safe.global/advanced/smart-account-modules ; https://raw.githubusercontent.com/safe-global/safe-modules/main/modules/allowances/README.md (2026-10-10)
- S33. Zodiac Roles: https://docs.roles.gnosisguild.org/ ; https://github.com/gnosisguild/zodiac-modifier-roles ; Gnosis Pay post-mortem https://www.gnosis.io/blog/post-mortem-gnosis-pay-vulnerability-exploit ; https://www.cryptotimes.io/2026/06/03/zodiac-reveals-flaw-behind-gnosis-pay-exploit-safe-unaffected/ (2026-10-10)
- S34. MetaMask: https://docs.metamask.io/smart-accounts-kit/concepts/advanced-permissions/ ; https://raw.githubusercontent.com/MetaMask/delegation-framework/main/documents/Deployments.md (2026-10-10)
- S35. ZeroDev permissões: https://docs.zerodev.app/sdk/permissions/intro ; Turnkey políticas: https://docs.turnkey.com/concepts/policies/overview (2026-10-10)
- S36. Uniswap Permit2: http://developers.uniswap.org/llms.mdx/docs/protocols/permit2/overview (2026-10-10)
- S37. Alchemy: https://www.alchemy.com/docs/wallets/supported-chains.md ; https://www.alchemy.com/rpc/xlayer.md (2026-10-10)
- S38. Kuru: https://docs.kuru.io/contracts/Contract-addresses ; .../MarginAccount ; .../OrderBook ; .../Audits (2026-10-10)
- S39. Sondagens RPC sem estado em https://rpc.xlayer.tech e https://rpc.monad.xyz: eth_chainId, eth_blockNumber, eth_getCode, eth_call, eth_estimateGas, eth_getStorageAt; seletores a partir do ABI de @kuru-labs/kuru-sdk instalado no repositório (2026-10-10). Nada foi assinado nem enviado.
- S40. OWASP LLM01:2025 https://genai.owasp.org/llmrisk/llm01-prompt-injection/ ; LLM06:2025 https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ (2026-10-10)
- S41. arXiv 2503.16248 https://arxiv.org/abs/2503.16248 ; arXiv 2609.11757 (A-VIP) https://arxiv.org/abs/2609.11757 (2026-10-10)
- S42. Grok/Bankr: https://www.giskard.ai/knowledge/how-grok-got-prompt-injected-an-x-user-drained-150-000-from-an-ai-wallet ; metadados de token: https://www.tokenpost.com/news/technology/25397 ; PoC de terceiros contra o CLI do OKX: https://github.com/ZerodriftSec/okx-onchainos-poc (2026-10-10; mídia e alegação de terceiro, confiança baixa a média, nada reproduzido por mim)
- S43. Envenenamento de endereço: https://arxiv.org/abs/2501.16681 ; https://kb.etherscan.com/address-poisoning-attacks-are-rising-on-ethereum (2026-10-10)
- S44. Safe Foundation, incidente Bybit: https://safefoundation.org/blog/safe-ecosystem-foundation-statement (2026-10-10)
- S45. TEE.fail: https://www.securityweek.com/new-attack-targets-ddr5-memory-to-steal-keys-from-intel-and-amd-tees/ (2026-10-10)
- S46. The Block, Aave na X Layer: https://www.theblock.co/post/395594/aave-goes-live-okx-x-layer (2026-10-10)
