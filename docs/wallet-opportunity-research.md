# Pesquisa: patrimônio Web3 e classes de oportunidade

Data de acesso: **2026-10-09**. Idioma: português. Escopo: fontes públicas primárias e entradas para especificação; nenhuma implementação ou certificação.

## Objetivo observado e limites

Investigar por que a carteira OKX Web3 conectada não apresenta o patrimônio esperado e fundamentar a ampliação de oportunidades de spot, swaps, futuros e arbitragem, com operação contínua e contabilização de capital composto. Fato informado pelo usuário: **o ativo USDT está em X Layer; o painel atual lê MON/USDC em Monad**. Essa informação é evidência da conversa, não uma inspeção do código por este pesquisador. Não foram consultados endereços ou quantias privados na rede, nem realizada execução financeira.

A pesquisa não autoriza ordens, assinaturas, aprovações de tokens, transferências, bridges, criação de chaves, escolha de alavancagem ou publicação. Jev permanece consultivo. Não há promessa de lucro, disponibilidade regional ou execução sem supervisão demonstrada. A SPEC e os critérios congelados serão responsabilidade do coordenador; os critérios abaixo são propostas para revisão independente.

## 1. Achados que mudam o diagnóstico

### Web3, Exchange e cobertura de rede

A OKX mantém os ativos da conta Exchange e da carteira Web3 separados. A conexão da Web3 não concede leitura da conta custodial da Exchange. [OKX: Exchange e Web3](https://web3.okx.com/help/understanding-the-link-between-okx-and-web3-wallets) (S01).

No provider EVM da OKX, as chamadas RPC seguem a rede conectada. `eth_getBalance` consulta apenas o saldo nativo daquela rede; ERC-20 exige leitura de `balanceOf(address)` no contrato correto. Uma consulta a Monad não inclui USDT de X Layer. A inferência de diagnóstico é **cobertura incompatível com o ativo informado**, sem concluir ausência de dinheiro ou perda do ativo. [Provider OKX](https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/chains/evm/provider) (S02), [JSON-RPC Ethereum](https://ethereum.org/developers/docs/apis/json-rpc/) (S05), [ERC-20](https://eips.ethereum.org/EIPS/eip-20) (S04).

A API oficial Check Balance oferece patrimônio multichain e tokens, mas o acesso efetivo, quotas e cobertura contratada no projeto são **desconhecidos**. A existência da documentação não comprova habilitação da conta. [Check Balance](https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-overview) (S09).

### X Layer: identidade de ativos e unidades

Mainnet X Layer: **chain ID 196 = `0xC4`**, RPC público `https://rpc.xlayer.tech` ou `https://xlayerrpc.okx.com`, moeda nativa **OKB**, **18 casas decimais**. O OKB nativo não tem contrato ERC-20; WOKB é outro ativo. O testnet atual documentado é 1952, não mainnet. [Rede](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information) (S19), [RPC](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/rpc-endpoints/rpc-endpoints) (S25), [Definição oficial da rede](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/builder-codes/integration) (S26).

| Ativo em X Layer mainnet | Contrato / identidade | Casas decimais | Evidência e ressalva |
| --- | --- | --- | --- |
| OKB nativo | `native`, chain 196 | 18 | S19/S26; consultar `eth_getBalance`, não contrato |
| USDT / Tether USD | `0x1E4a5963aBFD975d8c9021ce480b42188849D41d` | 6 | S20/S21; exemplo oficial relaciona contrato, nome e `precision=6` |
| USDT0 / USD₮0 | `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` | 6 | S20/S22; fonte JSON usa símbolo exato `USD₮0`; consulta pública P03 confirmou 6 |
| USDC nativo, emitido pela Circle | `0xB6CEceAB302E2E4948951eE7843FC24E92933061` | 6 | S23/S24 identificam novo contrato; consulta pública P01 confirmou 6 |
| USDC_Bridged, legado | `0x74b7F16337b8972027F6196A17a631aC6dE26d22` | 6 | S22 para casas; S23/S24 para denominação atual; não emitido pela Circle |
| USDC.e, legado | `0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035` | 6 | S20/S23 para contrato e denominação; consulta pública P02 confirmou 6 |

**Conflito de fontes preservado:** a tabela de contratos S20 e a lista JSON S22 ainda denominam `0x74b7...` como USDC. O anúncio da Circle de **6 de agosto de 2026** e o anúncio OKX de **7 de agosto de 2026** identificam esse contrato como **USDC_Bridged** e o novo `0xB6CE...` como USDC nativo. Não resolver identidade por símbolo. Usar a chave `(chainId, contrato)` e denominação explícita; manter origem da classificação. [Contratos OKX](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/contracts) (S20), [Lista OKX](https://raw.githubusercontent.com/okx/xlayer-tokenlist/main/xlayer.tokenlist.json) (S22), [Anúncio OKX](https://web3.okx.com/learn/usdc-cctp-on-xlayer) (S23), [Anúncio Circle](https://www.circle.com/blog/now-available-native-usdc-cctp-on-x-layer) (S24).

Um inteiro bruto `1_000_000` de USDT/USDC com 6 casas representa 1 token, não um milhão de tokens. `1_000_000_000_000_000_000` unidades de OKB nativo representam 1 OKB. Manter inteiros exatos e formatar por casas conhecidas. O ERC-20 torna `decimals()` opcional: falta/falha de metadata deve ser estado desconhecido, sem assumir 18 por padrão (S04). USDT e USDT0 não são intercambiáveis por nome; o contrato que realmente mantém o ativo informado ainda depende da leitura local do projeto.

### Leitura somente de consulta via provider EVM

Contrato proposto, derivado de S02–S05/S19/S25:

1. Recuperar as contas já autorizadas por `eth_accounts`; conferir `eth_chainId`. Usar 196 para X Layer. `eth_requestAccounts` é interação de conexão iniciada pelo usuário, não polling de saldo.
2. Selecionar contexto de consulta coerente com a rede. No provider injetado, todas as leituras seguem a rede atual. Para consulta multichain com transportes RPC separados, definir explicitamente o transporte por chain ID e verificar o `eth_chainId` dele. Não atribuir à rede escolhida na tela um resultado obtido de outra rede.
3. Consultar `eth_getBalance(address, block)` para OKB; `eth_call` de `balanceOf(address)` para cada contrato monitorado. Não é necessário `approve`, assinatura ou envio de transação para essas leituras. Um endereço privado pode permanecer no processo local e no provider já autorizado; esta pesquisa não o enviou a serviços.
4. Registrar cadeia, contrato, inteiro bruto, casas, bloco/contexto, horário, origem e erro. Manter identidade da conta local. Usar o mesmo bloco quando a comparação exigir snapshot consistente.
5. Ao receber `accountsChanged`, `chainChanged` ou `disconnect`, invalidar o contexto e descartar respostas atrasadas da consulta anterior. A orientação OKX recomenda reload em mudança de rede; limpar listeners no encerramento do componente. Conta vazia significa desconexão/sem autorização, não saldo zero.

Conexão, saldo, preço em USD e prontidão de execução são estados distintos. `zero` requer resposta válida igual a zero; erro RPC, preço ausente, rede não coberta e carregamento precisam permanecer distinguíveis. EIP-1193 define conectividade como capacidade de atender RPC, não como acesso ao patrimônio de todas as redes. [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) (S03).

## 2. Cotações, rotas e riscos DEX

A API atual documentada usa **v6** `/api/v6/dex/aggregator/quote` e `/api/v6/dex/aggregator/swap`. Quantias usam unidades mínimas. `slippagePercent=0.5` representa **0,5%**. Na API **v5**, `slippage=0.005` representava o mesmo percentual. Não transportar nomes ou unidades entre versões. Isso é entrada para um contrato versionado, não autorização para migração automática. [Quote v6](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote) (S06), [Swap v6](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap) (S07), [Swap v5](https://web3.okx.com/onchainos/dev-docs-v5/dex-api/dex-swap) (S08).

A cotação oferece estimativas, rota, impacto, metadata e gas; o resultado efetivo é o da cadeia. `tradeFee` em S06 é **taxa de rede estimada em USD**, não automaticamente comissão de negociação. Não somá-lo novamente ao mesmo gas calculado. Preço de token pode ser nulo; proteção de impacto também pode ficar desabilitada se o cálculo for nulo. Políticas devem validar limites e cálculos, em vez de aceitar uma resposta como proteção garantida. S06/S07.

Geração de calldata não executa uma transação. Uma rota multihop ou um lote não comprova que o ciclo inteiro de arbitragem é atômico. A atomicidade deve ser demonstrada pela transação que reúne todas as pernas na mesma cadeia e pela capacidade concreta do executor. Não se estende a CEX, transferências ou redes distintas. A própria OKX documenta capacidades de lote por chain ID (S02). Ethereum descreve arbitragem entre DEXs em uma única transação, mas também competição por gas, frontrunning e sandwich. [MEV](https://ethereum.org/developers/docs/mev/) (S15).

Slippage é limite de execução; impacto depende da própria ordem e da liquidez. Cotação antiga, RFQ sensível ao tempo, deadline vencido, rota sem liquidez e mudança de gas podem invalidar a oportunidade. Uniswap documenta deadline e `amountOutMinimum`; esses conceitos não autorizam presumir que o calldata OKX tem schema idêntico. [Guia Uniswap](https://developers.uniswap.org/docs/protocols/v3/guides/swapping/single-hop-swapping) (S16). Reversão durante execução pode consumir gas mesmo sem efetuar a troca; rejeição antes de execução não é a mesma situação. [Gas Ethereum](https://ethereum.org/developers/docs/gas/) (S18).

## 3. Classes reais para classificação e simulação

A tabela é uma proposta analítica. Cada classe precisa de adapters, dados verificáveis e limites próprios; não é uma seleção de estratégia ou autorização de operação.

| Classe | Dados mínimos | Limitações que precisam aparecer |
| --- | --- | --- |
| Swap/roundtrip DEX na mesma cadeia | Quotes no tamanho real, todos os contratos e pools, saída de cada perna, gas total, custos de aprovação já necessários, deadline/minReceive, saldo nativo | Apenas executor verificado pode dar atomicidade; impacto, MEV, tokens com taxa e gas de falha consomem margem |
| Spot em livro / ciclo triangular | Bid/ask executável, profundidade, timestamp, tamanho mínimo, tick/lot e taxas reais por execução | Último preço não é preço de execução; pernas podem preencher parcialmente; exposição residual e rebalanceamento |
| Spot + futuro com vencimento | Base/basis, vencimento, tamanho por contrato, regra de liquidação/settlement, collateral, custo de financiamento | Basis até vencimento depende de hedge e custos; risco de liquidação e indisponibilidade de margem |
| Spot + perp/SWAP com funding | Mark price, funding previsto/próximo horário, posição e margem, contrato, taxas, custos de borrow quando houver | Funding muda ou inverte; hedge não elimina liquidation; não tratar funding recebido como renda garantida |
| Derivativos entre mercados / venues | Dois livros/quotes, posições, collateral por venue, fills e plano de exposição residual | Ordens simultâneas não são atômicas; uma perna pode falhar; há risco de contraparte/inventário |
| Crosschain | Dados das redes, tempo/finalidade, custos e capital em cada lado | Bridge/transferência não é arbitragem atômica e está fora do escopo autorizado de execução |

A OKX descreve classes spot/futuro e spot/perp, além de risco de funding e preenchimento de uma só perna. [Arbitragem OKX](https://www.okx.com/en-us/learn/arbitrage-crypto-trading-bot) (S17). Instrumentos spot, futures e swap têm contratos diferentes na API; notional, margem e número de contratos não podem ser confundidos (S11).

## 4. Pré requisitos OKX Exchange e derivados

Dados públicos de instrumentos e livros não provam acesso privado. Antes de declarar uma classe executável, são necessárias evidências locais de região/conta elegível, modo de conta, modo de posição, saldo disponível/collateral, permissões, instrumentos ativos e respectivos `tickSz`, `lotSz`, `minSz`, `ctVal`, `ctMult` e moeda de settlement. A API documenta quatro modos de conta; a configuração inicial é na Web/App. `totalEq` é patrimônio total da conta em USD, distinto do patrimônio Web3. Região, KYC, tarifas efetivas e acesso do usuário permanecem **desconhecidos**. [API OKX](https://www.okx.com/docs-v5/en/) (S11).

Permissões **Read**, **Trade** e **Withdraw** são separadas. Uma chave Read pode consultar dados, mas não criar ordens. Demo exige chave de demo, domínio apropriado e header `x-simulated-trading: 1`; ordens demo também dependem da permissão Trade. Nenhuma chave foi criada nesta tarefa. [FAQ API](https://www.okx.com/en-us/help/api-faq) (S10).

Funding positivo transfere de longs para shorts, negativo faz o inverso; intervalos podem ser 8, 4, 2 ou 1 hora e mudar por instrumento. O financiamento consome equity e pode afetar a margem. [Funding](https://www.okx.com/en-us/help/perps-funding-fee-mechanism) (S12). A OKX usa mark price e manutenção de margem no processo de liquidação; mesmo 1x pode liquidar em condições extremas. Não adotar alavancagem ou limite numérico universal sem contrato atual e estado da conta. [Liquidação](https://www.okx.com/en-us/help/forced-liquidation-faq) (S13).

Taxas incidem sobre execução/notional, não apenas a margem depositada. Funding é custo distinto; alguns campos de PnL já incluem comissões/funding, outros não. Preservar a definição de cada campo para não subtrair custos duas vezes. A tarifa aplicável do usuário não foi demonstrada. [Regras de taxas](https://www.okx.com/en-us/help/trading-fee-rules-faq) (S14).

## 5. Resultado líquido e capital composto

Definições propostas para o ledger, não previsão financeira:

```text
resultado_liquido_realizado = receitas efetivamente realizadas
                           - custo/base das posições encerradas
                           - taxas de negociação/venue
                           - gas de execução e aprovações atribuíveis
                           - gas efetivamente consumido em falhas
                           - juros/borrow/financiamento
                           + funding recebido - funding pago
                           - custos de encerrar exposição residual
```

Valores efetivos de execução já incorporam slippage/impacto no preço: não subtrair esses efeitos novamente. Em **estimativas**, descontar slippage/impacto e custos usando hipóteses explícitas, evitando double count de gas e taxas. Se uma API fornece PnL já líquido, decompor com definição de origem antes de aplicar a fórmula. S06/S12/S14/S18.

```text
capital_t = capital_t-1 + resultado_liquido_realizado_t + entradas_t - retiradas_t
```

Separar patrimônio marcado a mercado, lucro realizado, exposição aberta e capital disponível. Na ausência de fluxos externos e com retornos definidos sobre a mesma base de capital: `C_n = C_0 * produto(1 + r_t)`. Reinvestimento de lucro realizado pode compor capital; não cria retorno positivo por si. Não anualizar uma operação/um dia excepcional como se fossem retornos repetíveis. Perdas, liquidação, ruína e custos precisam permanecer observáveis.

## 6. Entradas arquiteturais e alternativas reais

### Dados e estados necessários

- Patrimônio: rede, conta local, contrato/native, casas, inteiro bruto, bloco/asof, origem, cobertura e erro; subtotal por rede e total apenas da cobertura explicitamente indicada.
- Valoração: fonte, moeda e horário do preço, preço ausente distinto de zero; não fixar stablecoin automaticamente em USD 1 como preço de mercado verificado.
- Oportunidade: classe, cadeia/venue, par e direção, tamanho/depth, rota de todas as pernas, custos separados, retorno bruto e líquido, validade, hipótese e motivo de exclusão.
- Derivativos: instrumento, número de contratos, valor por contrato, mark/index/last separados, funding/horários, vencimento e collateral; elegibilidade e modo de conta comprovados localmente.
- Operação contínua: estados persistentes de observação/simulação/execução quando autorizada, heartbeat, backoff e rate limit, invalidação por dado velho, retomada e reconciliação; uma UI aberta ou carteira conectada não prova processo autônomo após restart. Fonte RPC S25 documenta rate limits; tamanho e frequência precisam ser definidos no contrato local.
- Resultado: ledger de fills/receipts/custos efetivos, exposição residual, reconciliation, entradas/retiradas e resultados simulados separados dos realizados. Observações repetidas não são novos lucros.

### Alternativas de cobertura da carteira

| Alternativa | Benefício | Custo/dependência |
| --- | --- | --- |
| A. Registry explícito + RPC por rede, somente leitura | Determinismo para os 5–6 ativos monitorados e menor dependência de API autenticada | Não descobre todo token; cobertura deve aparecer; requer preços e gestão RPC |
| B. API oficial Check Balance | Descoberta e patrimônio multichain em uma interface documentada | Acesso, quota, redes e preço efetivos desconhecidos; não bloquear saldo local por ausência da API |
| C. RPC determinístico para monitorados + aggregate opcional | Mostra o ativo conhecido mesmo sem API; aggregate enriquece descoberta | Precisa deduplicação por chain/contrato, precedência e reconciliação de preços/asof |

Escolha permanece decisão do coordenador/Jev dentro do objetivo. As fontes não demonstram que B está disponível para este usuário. Não instalar ou comprar provider como parte implícita da pesquisa.

## 7. Requisitos e aceitação independente propostos

Não congelados e não certificados por este pesquisador. Cada caso deve ter oracle fixo e evidência produzida pelo implementador, revisada independentemente. Valores de fixtures abaixo são sintéticos e nunca quantias do usuário.

| ID | Requisito / evento → comportamento | Critério verificável e oracle |
| --- | --- | --- |
| R1 | USDT em X Layer, painel originalmente em Monad → ler e rotular a rede/contrato corretos | Fixture/provider com chain 196 e USDT bruto 1_000_000 resulta 1 USDT em X Layer; Monad não sobrescreve esse saldo; cobertura parcial visível |
| R2 | native zero e ERC-20 positivo → manter valores separados | Resposta válida OKB=0 e USDT>0 não produz patrimônio total zero; ambos com identidade correta; leitura token não chama approve/send/sign |
| R3 | contas/rede mudam ou desconectam → invalidar consultas antigas | Resposta tardia do contexto anterior não atualiza conta/rede nova; listeners removidos; eth_accounts vazio não é saldo zero |
| R4 | erro/metadata/preço ausente → representar estado sem inventar número | RPC error preservado; decimals desconhecido não recebe18; preço nulo não vira USD0; subtotal explicita exclusões e horário |
| R5 | símbolos repetidos → chave de identidade por chain/contrato | USDT/USDT0 e USDC nativo/Bridged/e são observados separadamente; cadastro usa fontes S20–S24; discrepância de denominação mantida como provenance |
| R6 | quote expira, gas/custos anulam spread ou proteção nula → reduzir elegibilidade | Caso bruto positivo e líquido negativo não é rentável; deadline velho/impacto não calculado não vira proteção validada; v5/v6 recebem unidades corretas e versionadas |
| R7 | classe futures/funding sem elegibilidade ou funding inverso → exposição/dependência explícitas | Ausência de chave/conta/região não vira acesso pronto; simulador distingue funding pago/recebido e partial fill; Read nunca é tratada como Trade |
| R8 | reinício ou falha de fonte → retomar observação com reconciliação e validade | Evidência de restart controlado, estado persistido, heartbeat, dado velho e backoff; resultado simulado separado do realizado; nenhuma duplicação de evento ou lucro |
| R9 | total capital/PnL → cálculo reconciliável | Fills/custos e entradas/saídas explicam mudança de capital; preço já incorpora slippage; taxas/gas/funding não são subtraídos duas vezes |

Os requisitos R1–R5 são prioridade factual para o problema de patrimônio. R6–R9 são entradas para fases seguintes; não pressupõem que o projeto atual já possua executor ou daemon. Nenhum teste do projeto foi executado por este pesquisador; a pesquisa não é certificação de implementação, disponibilidade de conta ou ganho medido.

## 8. Anecdota de US$ 68 a US$ 750 mil

**Não verificada.** Buscas limitadas por combinações de “Japanese”, “19”, “68”, “6700” e “750,000” não localizaram identificação e registro primário atribuível ao suposto trader de 19 anos. Uma repetição promocional aponta um post `sumitdoriya21/status/2085698462117658799`; tentar abrir [o post alegado](https://x.com/sumitdoriya21/status/2085698462117658799) retornou literalmente `Internal Error ()` na ferramenta. Isso não demonstra autenticidade nem falsidade do relato.

Não há evidência primária verificada nesta pesquisa de identidade, capital inicial, ordens, lucro líquido, período, perdas, depósitos ou estratégia. Não inferir estratégia pela história, não inventar identidade e não transformar seus números em meta/critério de aceitação. A metodologia autorizada continua sendo oportunidade executável com custos e risco observáveis.

## 9. Proveniência: hashes exatos e evidência literal

Hashes SHA-256 do **corpo bruto HTTP capturado** (HTML ou JSON, `Accept-Encoding: identity`), não do texto renderizado pelo navegador. Todos os S01–S26 abaixo retornaram HTTP 200 na captura indicada; links são o alvo/final URL daquela captura. Conteúdo remoto pode mudar. Os corpos integrais não foram salvos neste repositório nem em outros arquivos; os hashes identificam a captura observada e não garantem reprodução de um servidor dinâmico. Trechos literais curtos vinculam a conclusão à fonte, respeitando os limites de citação.

| ID e fonte | Evidência literal curta | UTC da captura em 2026-10-09 / bytes / SHA-256 |
| --- | --- | --- |
| S01 [Exchange/Web3](https://web3.okx.com/help/understanding-the-link-between-okx-and-web3-wallets) | “aren't automatically interoperable” | 19:06:34.896210Z / 86469 / `4562b8c9e076e1c77e22656a0985b7db80747ded720be7344fa92af143cb8b53` |
| S02 [Provider EVM](https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/chains/evm/provider) | “All RPC requests are submitted to the currently connected chain.” | 19:06:34.914617Z / 147249 / `0992d22345ac021abd107731bfac89380bb5b9b9f1c132f761ccb1afe9ac8e46` |
| S03 [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) | “at least one chain” | 19:06:34.924096Z / 71338 / `7a29e3f43c262ad3f663b8f419257132c127e1580c91cbe837d59f86a5bd7ab4` |
| S04 [ERC-20](https://eips.ethereum.org/EIPS/eip-20) | “Returns the account balance of another account with address `_owner`.” | 19:06:34.925771Z / 26125 / `98bda5e4707841a68684879878c4c165fdaa47d89ed69ebf232ab9be06ff050e` |
| S05 [JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/) | “Returns the balance of the account at a given address.” | 19:06:34.927241Z / 1424522 / `98c131a1bd99a0c2051dd6d6716fd306c36cdd45995d5ffd559bd9c690569c0f` |
| S06 [Quote v6](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote) | “Estimated network fee (USD) of the quote route” | 19:06:34.939970Z / 128614 / `4607c744e0f3d9465f262f81a12132239d34efcf5e270fd4fb9408158143e1f6` |
| S07 [Swap v6](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap) | `slippagePercent` / `0.5` | 19:06:35.487651Z / 125692 / `37889de33ebb9e017b1626b54de9f69942d856f34beb634c4a3be761e5516967` |
| S08 [Swap v5](https://web3.okx.com/onchainos/dev-docs-v5/dex-api/dex-swap) | `slippage` / `0.005` | 19:06:35.495429Z / 93366 / `c2c14ec8ad8cf23974fd247e7f2c47c539a3282396627d7be7856fcc291ce094` |
| S09 [Check Balance](https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-overview) | “Query total asset value across all supported chains by wallet address.” | 19:06:35.623049Z / 57950 / `2345997af5a5a6965db5323802ea8099a852393f40b7d4ae490246529eb2d092` |
| S10 [API FAQ EN-US](https://www.okx.com/en-us/help/api-faq) | “cannot place orders” | 19:07:13.488920Z / 120920 / `bc91927b5aa840c061782e82c1a4fefa1637acb53ccfa4c088e3d534ee2864a4` |
| S11 [API docs](https://www.okx.com/docs-v5/en/) | “4 account modes are supported” | 19:06:35.686244Z / 5247633 / `009d139c6386fad226e43a47a346d00be4cac2fe8412779078d65c2cc9e50f0d` |
| S12 [Funding EN-US](https://www.okx.com/en-us/help/perps-funding-fee-mechanism) | “Funding fee = Position value × Funding rate” | 19:07:13.490659Z / 82494 / `1ece4ff8fbe965f9815a290872502517aa7d8d250454067372a91503a908f02e` |
| S13 [Liquidação EN-US](https://www.okx.com/en-us/help/forced-liquidation-faq) | “Even 1x leverage can be liquidated under extreme market conditions.” | 19:07:13.491977Z / 102649 / `20668bec9445ea4e95d5f290958e8e78de53c094b4fc89e728491bd31bb7281e` |
| S14 [Taxas EN-US](https://www.okx.com/en-us/help/trading-fee-rules-faq) | “Fees are charged when an order is executed.” | 19:07:13.493264Z / 186859 / `18d564f6620f71521c40680c7a95f775e920ddec9ab1a273dcccd99eb2bde336` |
| S15 [MEV](https://ethereum.org/developers/docs/mev/) | “in a single, atomic transaction” | 19:06:36.008887Z / 509795 / `89fd4d79e4369c6cae6a61da6faa060f8bdeb8ca920be3e5fae88ee7d423d1da` |
| S16 [Uniswap](https://developers.uniswap.org/docs/protocols/v3/guides/swapping/single-hop-swapping) | `amountOutMinimum` / `deadline` | 19:06:36.483564Z / 370891 / `8e1a0f69aed8f9b6b9a4f08b8d17816afa017285a387f33e8372f88d0a094c04` |
| S17 [Arbitragem OKX](https://www.okx.com/en-us/learn/arbitrage-crypto-trading-bot) | “the funding rate goes against you” | 19:06:36.652385Z / 116829 / `c01ecce24513760e200909bbfefd7b7c701c690cb7bff5810f48988249886ae3` |
| S18 [Gas](https://ethereum.org/developers/docs/gas/) | “all the gas provided will still be consumed” | 19:06:36.691972Z / 495145 / `88bf96eaf79553ac2cc712975330daa8847a439ae0bcbd56adeca587dbf40003` |
| S19 [X Layer network](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information) | “Chain ID” / `196` / `OKB` | 19:12:52.423416Z / 58164 / `d9e5a0b219ca53e7e20b7c1521325ee0ff3bed31a8631ac69d7c4cc4c3cd51ee` |
| S20 [X Layer contracts](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/contracts) | “USDT Token Address” / “USDC.e Token Address” | 19:12:52.420133Z / 73876 / `e2d35140b3adb25e02466ff2d849c30cd9c657c089e29db59e166b10cc2721ee` |
| S21 [Token list API](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/data/token-list) | `"token": "USDT"` / `"precision": "6"` | 19:12:52.436570Z / 73594 / `776d9d536347578a6208905a69fc43ae34ae4c9d4f401179eff00066c377547e` |
| S22 [OKX tokenlist JSON](https://raw.githubusercontent.com/okx/xlayer-tokenlist/main/xlayer.tokenlist.json) | `"decimals": 6` / `USD₮0` | 19:13:32.095205Z / 3257 / `7f90151402fdba147e31833edd13b485fa813337fbbc2ee56bd3d5539b823382` |
| S23 [OKX novo USDC](https://web3.okx.com/learn/usdc-cctp-on-xlayer) | “Native USDC (Circle-issued)” / “USDC_Bridged” | 19:13:32.504916Z / 88217 / `28c26cb92054efe65160a8c951d2c51b984412363eb05f7156e01a428c81f5eb` |
| S24 [Circle novo USDC](https://www.circle.com/blog/now-available-native-usdc-cctp-on-x-layer) | “USDC_Bridged is not issued by Circle.” | 19:13:32.154491Z / 262102 / `865bc1b69254cb5c35cfecb44df3bbf310476d46f8cdc480ae0f8c90c881f308` |
| S25 [X Layer RPC](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/rpc-endpoints/rpc-endpoints) | “0xC4, 196 in decimals” | 19:13:32.473299Z / 70057 / `aa94ad0f91ecdcb081395fb0922c4711c80f72325e0d8a745e18c22e09ccc2c3` |
| S26 [OKB metadata](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/builder-codes/integration) | `nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }` | 19:13:32.503834Z / 91700 / `119f7e16eab810968f2c06bc8d75f592ff05ac34943d35364ac2ea4270cf00a2` |

### Consultas públicas de contrato, sem conta privada

Endpoint oficial `https://rpc.xlayer.tech`; método `eth_call` com `data=0x313ce567` (decimals), tag `latest`. Não há private key, endereço de proprietário, balanceOf de usuário, assinatura ou envio de transação nestas consultas. São observações de metadata no instante, não uma certificação de carteira ou saldo. A identificação de rede provém de S19/S25; não foi registrado um bloco fixo nesta consulta.

```json
{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0xB6CEceAB302E2E4948951eE7843FC24E92933061","data":"0x313ce567"},"latest"]}
{"jsonrpc":"2.0","id":2,"method":"eth_call","params":[{"to":"0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035","data":"0x313ce567"},"latest"]}
{"jsonrpc":"2.0","id":3,"method":"eth_call","params":[{"to":"0x779Ded0c9e1022225f8E0630b35a9b54bE713736","data":"0x313ce567"},"latest"]}
```

| Observação | Resultado literal | UTC / bytes / SHA-256 do corpo bruto |
| --- | --- | --- |
| P01 USDC nativo | `{"jsonrpc":"2.0","result":"0x0000000000000000000000000000000000000000000000000000000000000006","id":1}` | 19:14:00.796039Z / 103 / `b9affdcdc9ebdd0148b7e901e8839657e1a9bb488878788e7234df75a6d8099e` |
| P02 USDC.e | `{"jsonrpc":"2.0","result":"0x0000000000000000000000000000000000000000000000000000000000000006","id":2}` | 19:14:01.190213Z / 103 / `1092d145e2dbc705ef63ba55a088891c5b333c1f7835c98c05c4a1d1f700cfda` |
| P03 USDT0 | `{"jsonrpc":"2.0","result":"0x0000000000000000000000000000000000000000000000000000000000000006","id":3}` | 19:14:01.562119Z / 103 / `01070508deb418c520b97e1a514d1766237e607561b580cd0009df74e6616c64` |

O coordenador informou separadamente uma consulta pública de `decimals()` ao USDT `0x1E4...`, com resultado 6; sem receipt/hash entregue a este pesquisador. Essa mensagem não substitui S21 nem é apresentada como consulta executada por este escritor.

### Erros e limitações preservados

- A ferramenta de navegação retornou `Internal Error ()` para abertura/find de `https://www.okx.com/docs-v5/en/`; HTTP bruto via cliente Python retornou 200 e permitiu localizar os campos usados de S11. Não inferir indisponibilidade da API a partir do erro do parser.
- Uma abertura do FAQ global de liquidação também retornou `Internal Error ()`; a rota explícita EN-US foi acessível. Rotas globais de ajuda redirecionaram algumas capturas HTTP para PT-BR; os S10/S12/S13/S14 acima são capturas explícitas EN-US, coerentes com os trechos registrados.
- O post X citado na anecdota retornou `Internal Error ()`; hash do corpo de origem é `null`, porque a fonte não foi capturada. Nenhuma repetição de terceiros foi adotada como prova primária.
- A primeira impressão local dos metadados S22 encontrou erro de console `UnicodeEncodeError: 'charmap' codec can't encode character '\u20ae' ... character maps to <undefined>` (Python/cp1252). Nova captura/serialização com `ensure_ascii=True` concluiu e forneceu S22–S26 acima. Foi falha de apresentação local, não falha RPC/metadata. Não se descartou a denominação USD₮0.

## Próximo passo elegível

O coordenador pode congelar uma SPEC limitada de patrimônio readonly X Layer e cobertura explícita, com registry de 5–6 ativos, sem depender do acesso ainda desconhecido à API aggregate. As classes de oportunidade devem entrar primeiro como contratos de dados/avaliação/simulação com resultado líquido e motivos de inelegibilidade. Ordens reais, derivados habilitados e operação independente exigem evidência e autorização próprias; esta pesquisa não fornece nenhuma dessas permissões.