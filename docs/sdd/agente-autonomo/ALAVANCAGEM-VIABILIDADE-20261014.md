# Viabilidade de alavancagem financeira para o agente autonomo (2026-10-14)

Estado: estudo de viabilidade, so leitura de documentos e codigo LOCAIS. Nao e especificacao aprovada, nao liga instrumento, nao autoriza ordem, emprestimo, margem, transferencia nem assinatura. Escrito em 2026-10-14 e finalizado em 2026-10-15 (a primeira rodada foi cortada quando a maquina dormiu). Continua valendo o que o ADENDO-B diz: o dono autorizou a alavancagem em 2026-10-14, e a autorizacao NAO e um instrumento (`instruments: []`).

## 0. Metodo, limites e legenda

- Nenhuma chamada de rede, carteira, conta, assinatura ou processo vivo. O binario `onchainos` NAO foi executado (nem `--help`). Portas 3000 e 3001 intocadas. Unica escrita: este arquivo. Os numeros de liquidacao da secao 4 foram calculados localmente com a formula do R3 (secao 4.1), sem rede.
- Legenda: **[V]** verificado em documento ou codigo local citado; **[V relatado]** verificado so por uma pesquisa anterior que leu a pagina da OKX (ver o limite abaixo); **[I]** inferido por raciocinio a partir de [V]; **[D]** desconhecido (nenhum documento local diz; "como descobrir" no fim de cada caminho).
- **Limite central.** O espelho das 499 paginas da OKX NAO esta em disco. `docs/sdd/inonu-desktop-v1/onchainos-coverage.md` diz que o espelho nao e versionado, e procurei as paginas `defi-transaction-enter` e `defi-transaction-exit` na pasta do usuario (ate 7 niveis) sem achar. Em disco ha o INDICE do espelho (`docs/sdd/inonu-desktop-v1/onchainos-coverage.json`: caminho, titulo, tamanho e sha256 de cada pagina, gerado em 2026-10-13) e as pesquisas anteriores que leram as paginas. Por isso o texto das paginas DeFi e conhecido por relato dessas pesquisas, nao por leitura minha.
- Fonte preferida: `docs/research/`. Onde um fato so existe fora dessa pasta eu digo o arquivo e marco "fora de docs/research": `docs/real-integration/PESQUISA-OKX.md`, `docs/sdd/agente-autonomo/*`, `docs/sdd/inonu-desktop-v1/*`, o codigo em `src/`, e uma copia local da skill oficial `okx-defi` (v4.6.4) em `C:/Users/gabri/.codex/tmp/agentic-01a136cd-review/install-skills/okx-defi-SKILL.md`.

## 1. Resposta curta

1. Existe UM caminho de alavancagem documentado dentro do ecossistema da carteira Agentic: **emprestimo DeFi pela API DeFi do OnchainOS** (`defi/transaction/enter` e `exit`, que a pesquisa relata como deposito OU emprestimo, saque OU pagamento da divida), com exemplo em Solana (Kamino). Nao e um produto de alavancagem pronto: e uma peca (tomar emprestimo) que o nosso codigo teria de compor com deposito de colateral e troca spot. [V relatado] / [I]
2. O produto pronto de alavancagem da OKX (Multiply e Loop, X Layer) so aparece como guia e como dois enderecos de contrato; sem API, sem ABI, sem parametros documentados; e o capital do agente esta em Solana. [V] / [D]
3. Margem e perpetuo ficam na exchange da OKX, com conta, chave de negociacao e margem que o app nao tem e que so o dono pode criar. [V]
4. Hoje o agente nao consegue nem LER posicao de emprestimo: o guarda de comandos so deixa passar `wallet status|balance|addresses|history|login` e `swap quote|execute`. [V]
5. Nao ha evidencia local de vantagem (edge) em preco; a alavancagem multiplica perda e custo, e nao cria vantagem. O que se pode construir agora e a parte que nao mexe em dinheiro: leitura, fatos para o Brief e medicao em sombra. [V] / [I]

## 2. Estado do codigo hoje (verificado)

| Fato | Onde | Nivel |
| --- | --- | --- |
| `OWNER_AUTHORIZATIONS = { leverage: { granted: true, since: "2026-10-14", instruments: [] } }` | `src/agent/autopilot.ts` linha 33 | [V] |
| Lista branca de comandos: `wallet status`, `wallet balance`, `wallet addresses`, `wallet history`, `wallet login`, `swap quote`, `swap execute`. Opcoes em lista branca, `--force` nunca, saida 2 ou `confirming` e recusa. Nada de `defi`, `wallet contract-call`, `security`, `cross-chain`, `strategy`, `send`. | `src/agent/cli.ts` linhas 41 a 63; `docs/sdd/agente-autonomo/design.md` linha 106 | [V] |
| So ha montagem de argumentos de troca; mapa de redes: 1, 56, 8453, 42161, 137, 10, 501, 196 (sem Avalanche 43114) | `src/agent/swap-args.ts` | [V] |
| Redes padrao do agente: 1, 56, 8453, 42161, 137, 10, 143, 196 (Solana entra pelo endereco gerido) | `src/agent/config.ts` linha 56 | [V] |
| Leitura DeFi: 7 endpoints de descoberta (busca, detalhe, series), SEM consumidor no agente. O cabecalho do arquivo diz "Not implemented": prepare, calculadora, enter, exit, claim e posicoes. | `src/onchainos/defi-read.ts`; `docs/research/OKX-DEFI-WIRING-ADDENDUM-20261011.md` | [V] |
| Busca simples (SINGLE_EARN, pagina 1) usada so pelo operador de pesquisa; `trade.ts` apenas REGISTRA o caminho `defiTransactionExit`, nao o implementa | `src/okx-wallet/defi.ts`, `src/okx-wallet/trade.ts`; `docs/research/OKX-DEFI-ENDPOINT-COVERAGE-20261011.md` | [V] |
| O executor do operador recusa tudo que nao e `dex_round_trip` | `src/operator/executor.ts` linha 158; `docs/research/DEFI-CANDIDATE-BOUNDARY-FINDINGS-20261011.md` | [V] |
| Derivativos so offline: avaliador de carry e de perpetuo direcional "somente como risco", `liveQualified:false` | `src/okx-derivatives/*`; `docs/okx-derivatives-v1/GUIA.md` | [V] |
| Dados da exchange so publicos: apenas `/api/v5/public/*` e `/api/v5/market/*` alcancaveis; rotas de conta, trade e asset recusadas | cabecalho de `src/onchainos/public-okx.ts` | [V] |
| Credenciais OKX no projeto: so `OKX_WEB3_API_KEY/SECRET/PASSPHRASE` (Open API Web3, leitura). Nao ha chave de exchange nem cliente privado de exchange. | `.env.example`; `src/okx-api.ts`; `src/okx-market/okx-api.ts` (origem `web3.okx.com`) | [V] |
| Matematica pronta (pura): toque de liquidacao, Kelly, arrasto de volatilidade, distancia de liquidacao; toque long e short, gaussiano e por simulacao com caudas | `src/policy/envelope.ts`, `src/quant/touch.ts` | [V] |
| Registro de ordens: estagios `preparada, enviando, executada, falhou, incerta`; chave `cycleId:candidateId`; ordem incerta segura o resto e nunca reenvia; um registro por ordem simples. NAO existe conceito de operacao com varios passos. | `src/agent/ledger.ts` | [V] |
| Tamanho de compra: fracoes do maximo executavel (`buy_tenth, buy_third, buy_two_thirds, buy_full`), o Jev nunca escreve numero | `src/agent/sizing-agent.ts`; `docs/sdd/agente-autonomo/ADENDO-B-autonomia-economica.md` secao 4 | [V] |
| Teto do Brief: 10000 bytes (era 9000) | `src/agent/model.ts` (`BRIEF_MAX_BYTES`) | [V] |

Conclusao da secao: para o agente, "instrumento de alavancagem" hoje e zero em tres camadas (comando permitido, leitor de posicao, registro de operacao em varios passos).

## 3. Quais instrumentos existem, o que cada um exige

### 3.1 Caminho A: emprestimo DeFi pela API DeFi do OnchainOS, assinado pela carteira Agentic

**O que e verificado nos documentos locais**

- A familia DeFi tem descoberta, transacao e posicoes: `POST /api/v6/defi/product/search` (com `productGroup` SINGLE_EARN, DEX_POOL ou LENDING), `GET .../product/detail`, `POST .../product/detail/prepare`, `POST .../calculator/enter/info` (so pool V3), `POST .../transaction/enter`, `.../transaction/exit`, `.../transaction/claim`, `POST .../user/asset/platform/list` e `.../detail`. Fonte: `docs/research/OKX-DEFI-ENDPOINT-COVERAGE-20261011.md` (tabela de contratos) e `docs/research/R6-onchain-os-catalogo.json` (entradas `defi.*`). [V]
- Paginas do indice do espelho: `wallet/defi-transaction-enter` ("Subscription", 13395 caracteres, sha256 a62d293ed05d...), `wallet/defi-transaction-exit` ("Redemption", 7686, be77c6603e5c...), `wallet/defi-transaction-claim`, `wallet/defi-product-search`, `wallet/defi-product-detail`, `wallet/defi-product-prepare`, `wallet/defi-product-supported-platforms`, `wallet/defi-user-asset-platform-detail` ("Holdings Detail", 16092, e396e7dae18d...), `wallet/defi-user-asset-platform-list`. Todas existem no indice (`onchainos-coverage.json`). Nenhuma pagina do indice tem no caminho ou no titulo as palavras multiply, loop, margin, perp, leverage, lending ou borrow (varredura minha do JSON). [V]
- Catalogo R6, `defi.transaction.enter`: "Calldata de deposito ou emprestimo", classe `prepares-calldata`, redes "EVM, Solana, Sui e Aptos", `safetyClass: human-approval-required`, bloqueio "Plano separado e qualificado; resgate sem garantia de liquidez". Caveats: `coinAmount` em unidade legivel; `slippage` em FRACAO (padrao 0.01); blockhash Solana expira em cerca de 60 s; gas EVM nao vem na resposta; V3 exige ticks e tokenId. [V]
- Catalogo R6, `defi.transaction.exit`: "Devolve passos para sacar ou quitar emprestimo"; sempre enviar `redeemPercent` (os aTokens variam de saldo). A pesquisa de cobertura registra o conflito: a tabela chama o campo recomendado, as notas o chamam obrigatorio. [V]
- Catalogo R6, `defi.user.platform-detail`: "Detalhe das posicoes, recompensas disponiveis e saude de emprestimo (healthRate)". `docs/sdd/inonu-desktop-v1/wallet.md` secao 2 repete `healthRate` e marca a camada de preco como "a medir". [V]
- CLI: `onchainos defi` tem 15 subcomandos (`support-chains | support-platforms | list | search | detail | prepare | deposit | redeem | claim | calculate-entry | rate-chart | tvl-chart | depth-price-chart | positions | position-detail`); **`deposit`, `redeem` e `claim` devolvem so calldata**, nao assinam. Flags incluem `--investment-id`, `--address`, `--user-input`, `--slippage` (padrao 0.01), `--ratio`, `--token-id`. Conflito de fonte: `--user-input` aparece em unidade minima no CLI e legivel no REST. Fonte: `docs/research/R6-onchain-os-catalogo.json`, entrada `cli.defi` (lida do codigo oficial em 2026-10-11). [V]
- A skill oficial `okx-defi` v4.6.4 (copia local, fora de docs/research) lista entre os gatilhos "lending", "borrow or repay" e "CLMM", e manda "contract calls, or transaction broadcasts" para a skill `okx-agentic-wallet`. As referencias `invest.md` e `invest-cli-reference.md` que ela cita NAO estao em disco. [V]
- Assinatura: o CLI da carteira tem `wallet contract-call --chain --to --input-data <hex> [--amt] [--gas-limit] [--mev-protection]` (chamada arbitraria EVM; `--unsigned-tx` base58 na Solana; `--sui-tx-bytes` na Sui), com pre-execucao do servidor antes do envio (`executeResult`); `security tx-scan` recomendado antes; aprovacao ilimitada e recusada por regra de comportamento da skill, nao por codigo. Fonte: `docs/research/R7-okx-agentic-wallet.md` secoes 2.3 e 2.4. [V]
- Politica do portal (4 regras: limite por transacao, limite diario de transferencia, limite diario de trade, whitelist de destinos de transferencia): NAO ha allowlist de contrato nem de seletor. Fonte: `docs/research/R7-okx-agentic-wallet.md` secao 1 item 4 e `docs/research/OKX-AUTH-CUSTODY-MATRIX-20261011.md` ("Portal policy contract verified"). [V]

**O que so existe por relato de pesquisa anterior (fora de docs/research ou de segunda mao)**

- `docs/real-integration/PESQUISA-OKX.md`, secao "Correcao material de DeFi e leverage" (2026-10-11): a pagina `enter` documenta preparar deposito **ou tomar emprestimo**, com exemplos **Aave V3 USDC Borrow (investmentId 33901, chainIndex 43114, Avalanche)**, **NAVI SUI Borrow (40047, rede 784, Sui)** e **Kamino USDC Borrow (29130, rede 501, Solana)**; a resposta `dataList` traz passos ordenados de assinatura e broadcast; no Aave o enum WITHDRAW pode significar borrow e DEPOSIT pode significar repay ("nao deduzir negocio pelo enum isolado"). A mesma secao diz que isso nao comprova API completa de margem, fator de saude, monitor de liquidacao nem credito disponivel. [V relatado]
- `docs/sdd/agente-autonomo/capacidades-okx.md` item 2: a mesma API diz "subscribe (deposit/borrow)" e "redeem (withdraw/repay)" com exemplos Aave V3 e NAVI; "nao ha produto de alavancagem na propria carteira Agentic; o que existe e montar a posicao sobre esses protocolos". [V relatado]
- Entrada de skill no R6: "Aave, Lido, PancakeSwap, Kamino, NAVI e outros". [V]

**Inferido**

- [I] Uma posicao comprada alavancada por esse caminho seria COMPOSTA pelo nosso codigo em passos separados: (1) depositar colateral, (2) tomar emprestimo de estavel, (3) trocar a estavel pelo ativo (o `swap` que ja existe), (4) depositar o ativo novo como colateral; repetir ou parar no fator escolhido. Fecho: retirar parte do colateral, vender, quitar a divida, retirar o resto. Mecanica geral do R3 (`docs/research/R3-estrategias-e-alavancagem.md` secao 3.5): ativos `L*E`, divida `(L-1)*E`, `HF = LT*L/(L-1)`.
- [I] Pelos exemplos, o que se toma emprestado e estavel ou moeda nativa (USDC, SUI); o colateral e outro produto (outro `investmentId`) do mesmo mercado.
- [I] Mercados de emprestimo listam poucos ativos como colateral. Os tokens que o agente compra hoje (listas de tokens quentes, caudas longas) quase certamente NAO sao colateral aceito. Alavancagem por emprestimo valeria para um universo diferente do atual (SOL, majors, tokens de staking liquido), e isso muda a estrategia, nao so liga um botao.
- [I] Em EVM o calldata de `defi deposit` entra em `wallet contract-call` (`--to`, `--input-data`). Em Solana o formato da entrega (o `--unsigned-tx` aceita o que `defi deposit` devolve?) NAO esta em nenhum documento local.

**Desconhecido**

- [D] Se a Kamino USDC Borrow (id 29130) esta ativa hoje, se SOL e colateral aceito, quais produtos de emprestimo existem em Solana e a quanto (falta ler `supported-platforms` e `search` com LENDING; `capacidades-okx.md` ja listava isso como pendente).
- [D] Parametros que o Brief precisaria e que o exemplo de detalhe de produto NAO traz: LTV maximo, limiar de liquidacao, penalidade de liquidacao, teto de emprestimo, oraculo. O exemplo do detalhe (fixture `defi.product.detail/doc` em `src/onchainos/fixtures.ts`) mostra APY, TVL, `utilizationRate`, `rateDetails` ("Supply APY") e flags `isInvestable`, `isSupportRedeem`, mas nenhum campo desse tipo; nao ha fixture de produto de emprestimo no repo.
- [D] Unidade e escala de `healthRate`, e se vem preenchido para Kamino.
- [D] Se a chamada de contrato conta no limite diario de trade do portal e como o limite por transacao mede um emprestimo (`docs/research/R9-system-one-alavancagem-onchainos.md` pergunta aberta 7; R7 secao 1 item 10). Isso afeta o "backstop independente" do ADENDO-B secao 7.
- [D] Tarifas por passo, valor minimo de deposito e de emprestimo, aluguel de contas na Solana, taxa de servico (`feeRate` sem base nem unidade, ver OKX-DEFI-ENDPOINT-COVERAGE).
- [D] Disponibilidade regional (R7: `geoblock check`).
- [D] Tempo de vida da sessao do CLI (`sessionKeyExpireAt`): `docs/sdd/agente-autonomo/SPEC.md` secao 1 lista "expiracao da sessao" como nao documentada.

**Como descobrir com seguranca** (nada disso foi feito; todos usam rede e so leitura, sem assinatura e sem fundos; exigem autorizacao propria)

1. Regerar o espelho com `docs/sdd/inonu-desktop-v1/tools/mirror-okx-docs.ts --out <pasta vazia fora do repo>` e ler `defi-transaction-enter`, `defi-transaction-exit`, `defi-transaction-introduction` e `defi-user-asset-platform-detail`.
2. `onchainos defi --help`, `onchainos defi deposit --help` e `onchainos wallet contract-call --help` (ajuda local; a instalacao em `docs/sdd/carteira-evidencia/ONCHAINOS-INSTALL-20261014.md` ja rodou `wallet --help` sem efeito).
3. Uma captura unica, so de leitura: `defi support-platforms`, `defi search --chain solana --product-group LENDING`, `defi detail` do id citado, `defi positions` do endereco publico do agente (manda um endereco publico ao provedor). Guardar as respostas brutas como fixture.

### 3.2 Caminho A2: Multiply e Loop da OKX (X Layer)

- [V] A pagina `trade/dex-smart-contract` (indice: 6247 caracteres, sha256 2cc33f251742...) lista na secao de negociacao alavancada o contrato Multiply `0x18a6704775570afA8dB0D3FC0242515D90d120C0` e o Loop `0x714A871d3B471FF7Ee6A1896B16c5f55884fd910`, ambos na X Layer, "usados para assinar transacoes" desses produtos. Sem API, guia, parametros ou ABI. Fonte: `docs/research/R9-system-one-alavancagem-onchainos.md` secoes 1 e 2.5; `docs/research/OKX-MULTIPLY-LOOP-ADDENDUM-20261011.md`; classe `never-automate`, P3 em `docs/research/R6-onchain-os-inventario.md` (`trade.leveraged-contracts`).
- [V relatado] O guia publico do Multiply (OKX-MULTIPLY-LOOP-ADDENDUM, fonte S1): posicoes compradas ou vendidas em BTC, ETH e SOL apoiadas no Aave, na X Layer, com entrada e liquidacao em USDT; tetos de lancamento por ativo e direcao dependem de fundos, do fator de saude da conta e da capacidade do pool; fator de saude agregado na conta; exige E-Mode desligado; Loop simultaneo exige outra carteira; fechar repaga a divida e deixa o resto depositado no Aave; custos: juros, taxas, slippage e impacto; disponibilidade regional desconhecida.
- [D] API ou SDK programavel, elegibilidade da conta, ABI e bytecode, permissoes, recibos de abertura e fechamento (a propria tabela do addendum lista isso como "prova de integracao ausente").
- [V] O capital do agente esta em Solana (USDC de cerca de US$ 85 e cerca de US$ 1 de SOL, de `capacidades-okx.md`). Multiply exigiria USDT na X Layer: precisa de ponte (`cross-chain`, fora do guarda; R7 marca ponte como "parcial") ou transferencia do dono. [I]
- [I] Conclusao do caminho: nao e integravel hoje. Nao copiar premissas do Multiply para o Loop (addendum, tabela "Loop discovery").

### 3.3 Caminho B: margem e perpetuo na exchange da OKX

- [V] O app so le dados publicos da exchange (secao 2). Para negociar seria preciso: conta da exchange com derivativos habilitados, chave de API com permissao de negociacao, margem depositada na exchange, e um cliente privado novo (assinatura, ordens, posicoes, margem, liquidacao). Nada disso existe no repo.
- [V] O catalogo R6 (secao "Exchange agent-trade-kit") lista, no kit oficial `okx/agent-trade-kit`, o modulo `account` com 12 leituras e 2 escritas de configuracao (modo de posicao e alavancagem) e os modulos de ordens `spot, swap, futures, option, event, earn, bot`; todos classificados como "nunca automatizar" (N). Os caminhos e campos dos endpoints privados NAO estao em nenhum documento local: [D]. Nao invento nomes.
- [V] Mercado (fixture `public.instruments.swap/live`, obtida sem chave em 2026-10-11, em `src/onchainos/fixtures.ts`): BTC-USDT-SWAP linear, `ctVal` 0.01 BTC, `minSz` 0.01 e `lotSz` 0.01 contrato, alavancagem maxima 100, liquida em USDT. Com o ultimo preco da fixture (82970.8) o menor pedido e de cerca de US$ 8,30 de nocional. Funding liquidado a cada 8 h na fixture, teto de 0,375% por periodo (`maxFundingRate 0.00375`).
- [V relatado] Taxas de exemplo da pagina de ajuda da OKX: spot 0,08% e 0,10%, perpetuo 0,02% e 0,05% maker e taker; a tabela real da conta e [D] (R3 secao 3.3). Liquidacao por preco de marca, taxa de liquidacao, fundo de seguro e ADL (R3 S18, fonte externa). A OKX pode liquidar mesmo a 1x em condicoes extremas (R3 secao 3.5).
- [D] Perpetuos da OKX para residentes no Brasil: R3 secao 3.3 e 3.8 marca como NAO CONFIRMADO e lembra que a CVM trata derivativos de cripto como valores mobiliarios.
- [D] Se a ordem de parada nativa da exchange existe e como e configurada (nenhum documento local descreve). Existe, em compensacao, o avaliador offline de carry e direcional (`src/okx-derivatives`).
- [I] Perpetuos so existem para pares listados (BTC, ETH, SOL e poucos mais); as apostas do agente em tokens de cauda longa nao tem perpetuo. Outro universo, como no caminho A.
- [I] Colocar uma chave de negociacao da exchange no app cria uma classe nova de segredo (o cofre `src/desktop/vault.ts` existe, mas guarda hoje a chave do modelo e as de leitura) e quebra a propriedade "o app nunca ve chave da cadeia"; pede revisao de seguranca propria. O dinheiro teria de sair da carteira para a exchange: `send` esta fora do guarda e o portal tem whitelist de destinos, entao so o dono faz.

Como descobrir: ler `okx/agent-trade-kit` e o espelho `okx/ai-builder-openapi-md` (rede, so leitura); confirmar elegibilidade no suporte da OKX; nada disso e feito por codigo.

### 3.4 O que mais os documentos mencionam

- [V] Ordens limite no TEE (`strategy create-limit`: stop loss e take profit, 6 redes, minimo US$ 1, 7 dias): protecao de posicao SPOT na carteira, nao alavancagem; nao protegem colateral depositado em protocolo [I] (R7 secao 2.4).
- [V] Aave v3 na X Layer (desde 2026-03-30), RWAperp (perpetuos na X Layer desde 2026-09-03), Dolomite, "Loop investing" do app e integracao Contango: so por noticia ou press release, "nao verificado"; a OKX nao documenta API para nenhum (R9 secoes 2.5 e 2.7).
- [V] Hyperliquid e outros perpetuos on-chain: so como DADOS no R3; nenhum caminho documentado com a carteira Agentic. [D]
- [V] Simple Earn, On-chain Earn e rendimento do caixa parado: nao e alavancagem (ver `capacidades-okx.md` e R3 secao 3.4).

## 4. Custos e riscos com cerca de US$ 120

### 4.1 Escala e evidencia de vantagem

- [V] Capital ~US$ 121; USDC parado ~US$ 85 na Solana; SOL ~US$ 1 (`capacidades-okx.md`). Gas Station pendente: venda cujo caminho exija mais SOL que isso falha com `gas_station_pendente`.
- [V] As seis voltas fechadas foram negativas antes da taxa em SOL (ADENDO-B secao 1). O Placar nao mede ganho (`docs/sdd/agente-autonomo/evidence/AUT-fase0.md`).
- [V] A medicao propria sobre preco diario nao achou vantagem firme: 170 pares, 27.263 pares-dia, 2025-08-31 a 2026-10-10; a tese "barato" ficou abaixo da media dos pares; funding saiu ao contrario sem t acima de 2 (`docs/sdd/inonu-desktop-v1/evidence/RAS-7-motor-de-oportunidades.md`, fora de docs/research). R3 secao 4.9: "o projeto ainda nao tem edge para alavancar".
- [V] R3 secao 4.1: crescimento logaritmico `g(L) = L*mu - 0.5*L^2*sigma^2`. Com mu = 0, todo L > 0 reduz a mediana. Detectar Sharpe 2 pede cerca de 1 ano de dados (R3 secao 4.7). Alavancagem so multiplica um mu ja liquido, medido e estavel.

### 4.2 Custo por passo e passos por operacao

| Item | O que se sabe | Nivel |
| --- | --- | --- |
| Troca spot (perna de compra do ativo) | `swap quote` devolve `tradeFee` em USD e impacto; o executor ja guarda `costUsd` | [V] `src/agent/cli.ts` |
| Passo DeFi (deposito, emprestimo, retirada, pagamento) | taxa do protocolo e da OKX: `feeRate` sem base nem unidade; busca nao publica taxa de subscricao; gas EVM nao vem na resposta | [V] OKX-DEFI-ENDPOINT-COVERAGE, R6 |
| Taxa de rede na Solana e aluguel de contas novas | nao documentado; a carteira tem ~US$ 1 de SOL | [D] |
| Passos para abrir um fator unico (colateral ja em carteira) | cerca de 4 transacoes (depositar, emprestar, trocar, depositar); partindo de USDC, mais 1 troca; para fechar, cerca de 4 | [I] |
| Comparacao com spot | compra e venda spot = 2 trocas; alavancado = 8 a 10 transacoes por ida e volta, cada uma com taxa, cotacao fresca e chance de falha | [I] |

Juros contra arrasto, para capital proprio de US$ 40 numa posicao (calculo local; juros de 5% a.a. na faixa de 4,0 a 5,7% que o R3 mediu em estaveis de Aave e Morpho em 2026-10-10; taxa da Kamino e [D]; sigma de 4% por dia e hipotese ilustrativa do R3, nao medida dos candidatos do agente):

| Fator L | Divida | Juros por dia | Arrasto extra de volatilidade por dia (acima de 1x) |
| --- | --- | --- | --- |
| 1,25 | US$ 10 | US$ 0,0014 | US$ 0,018 |
| 1,5 | US$ 20 | US$ 0,0027 | US$ 0,040 |
| 2,0 | US$ 40 | US$ 0,0055 | US$ 0,096 |

Leitura: nesta escala o juro e quase irrelevante; o que pesa e (a) o custo FIXO por passo, (b) o arrasto de volatilidade, que e de 10 a 20 vezes o juro, e (c) a liquidacao. E o edge minimo para empatar a conta logaritmica: `mu > 0.5*L*sigma^2` (R3 tabela A: 0,16% por dia a 2x com sigma 4%).

### 4.3 Fator de saude e distancia de liquidacao

Formula do R3 secao 4.8: queda do colateral que leva HF a 1 = `1 - (L-1)/(L*LT)`, com `HF = LT*L/(L-1)` e `L_max = 1/(1-LT)`. O limiar `LT` do colateral real e [D]; as colunas abaixo sao HIPOTESES.

| L | LT 0,70: HF / queda ate liquidar | LT 0,80 | LT 0,90 |
| --- | --- | --- | --- |
| 1,25 | 3,50 / 71,4% | 4,00 / 75,0% | 4,50 / 77,8% |
| 1,5 | 2,10 / 52,4% | 2,40 / 58,3% | 2,70 / 63,0% |
| 2,0 | 1,40 / 28,6% | 1,60 / 37,5% | 1,80 / 44,4% |

Probabilidade de TOCAR a liquidacao (calculo local; movimento browniano geometrico sem tendencia e monitoramento continuo, a premissa do R3 secao 4.1; sem saltos, sem gap de oraculo, sem penalidade; subestima caudas; sigma de 10% por dia e outra hipotese ilustrativa para ativo volatil):

| L, LT | sigma 4%: 7 d / 30 d | sigma 6%: 7 d / 30 d | sigma 10%: 7 d / 30 d |
| --- | --- | --- | --- |
| 1,5, 0,70 | 0,0% / 0,1% | 0,0% / 2,4% | 0,5% / 17,6% |
| 2,0, 0,70 | 0,1% / 12,5% | 3,4% / 30,6% | 20,3% / 53,9% |
| 1,5, 0,80 | 0,0% / 0,0% | 0,0% / 0,8% | 0,1% / 11,0% |
| 2,0, 0,80 | 0,0% / 3,2% | 0,3% / 15,3% | 7,6% / 39,1% |

Riscos que o modelo acima NAO cobre:

- **Oraculo e gap.** O protocolo liquida pelo preco do oraculo, nao pelo preco do DEX. Para ativo fino o oraculo pode ser manipulado ou atrasar; liquidacao a mercado paga bonus ao liquidante (Aave: fator de fechamento de 50%, 100% se HF <= 0,95; R3 S21). Regras de Kamino e NAVI: [D]. Episodios do R3 (10/10/2025, Stream xUSD, Balancer) mostram que colateral "estavel" caiu junto (fontes secundarias).
- **Cadencia.** O agente olha a cada 2 minutos quando quente e a cada 5 a 20 minutos no ritmo normal (`src/agent/autopilot.ts`: `HOT_INTERVAL_MIN`, `INTERVAL_MIN`). Dentro desse intervalo ele nao reage. Nao ha stop do lado do servidor para colateral depositado em protocolo [I]. A unica protecao e o colchao de HF escolhido na abertura.
- **Sessao.** O app so abre compra se a sessao do CLI dura mais que o tempo maximo de posicao (`MIN_SESSION_LEFT_MS` e `maxHoldMs` em `src/agent/cli.ts`). Com divida aberta o mesmo vale ate a divida ser quitada: sessao vencida com divida e posicao sem quem assine o desfazer, ate o dono entrar de novo com codigo por e-mail. [I]
- **Retirada travada.** Utilizacao do pool perto de 100% pode impedir retirar colateral (o detalhe traz `utilizationRate`). [I]
- **Risco de contrato e de rede.** Contrato do protocolo, upgrade sem atraso (R3 cita L2BEAT para a X Layer), depeg. [V relatado]
- **Perpetuo.** Funding (R3 secao 3.3: BTC 5,57% a.a. medio na OKX, mas 29,9% dos periodos negativos em SOL), liquidacao por preco de marca, ADL (10/10/2025), taxas de entrada e saida. [V relatado]

### 4.4 Falha no meio de um laco (laco parcial)

| Estado | O que existe | Risco | Saida |
| --- | --- | --- | --- |
| E0 | nada | nenhum | |
| E1 | colateral depositado, sem divida | so preco do ativo | retirar |
| E2 | divida tomada, estavel ainda na carteira | HF do colateral inicial contra a divida nova; a estavel em carteira quita a divida sem nova troca | repagar |
| E3 | estavel trocada pelo ativo, ativo na carteira e fora do colateral | **estado mais fraco**: a divida conta, o ativo novo nao; risco de preco do ativo solto | depositar o ativo (completa) ou vender e repagar |
| E4 | ativo depositado | posicao completa | desfazer em ordem inversa |

Em cada passo a chance de falha e a de "enviado, desfecho desconhecido". Hoje, ordem incerta bloqueia duplicata. Para emprestimo isso pesa mais: **repetir um passo de emprestimo dobra a divida**. Na Solana, a pagina do `enter` diz que o blockhash expira em cerca de 60 s (R6); passado esse prazo a transacao nao pode mais entrar na cadeia, e a incerteza se resolve lendo o estado [I].

### 4.5 Recibos e idempotencia de uma operacao em varios passos (proposta)

- Uma OPERACAO (`opId`) com intencao (abrir, ajustar, fechar), fator escolhido e passos ordenados `opId:i`, cada um com pre-condicao e pos-condicao medidas (saldo de carteira, divida, colateral), e o mesmo ciclo de estagios do ledger por passo.
- Antes de cada passo, ler a posicao e comparar com o estado gravado: se a posicao mudou de modo inesperado (um passo anterior pousou depois), NAO seguir; reconciliar. Idempotencia por ESTADO, nao so por hash.
- Recibo = hash conferido (`wallet history --tx-hash`, `createReceiptLookup` em `src/agent/cli.ts`) MAIS o efeito lido na posicao (divida e colateral mudaram como esperado). Hash confirmado nao prova efeito completo.
- Passo incerto congela a operacao e a posicao; sem decisao automatica de reenvio; se a leitura de estado nao decide, parar e mostrar ao dono (mesma regra do ledger de ordens).
- Ordem dos passos escolhida para que o estado intermediario com HF mais baixo (E3) dure o menor tempo e em fatias pequenas; a viabilidade da trilha (HF acima de 1 em todo estado intermediario) e uma checagem fisica, porque o protocolo reverteria o passo.

## 5. Desenho que respeita o principio do dono

Principio (ADENDO-B secoes 2 e 3): o codigo organiza dados e garante so propriedades fisicas; o Jev escolhe tamanho e risco; fato desconhecido e `null`, nunca zero; nada e redimensionado em silencio.

### 5.1 Fatos que chegam ao Brief (bloco novo, compacto, ate o teto de 10000 bytes (`BRIEF_MAX_BYTES`; era 9000 antes dos campos de tamanho))

Por candidato que TENHA instrumento verificado:

- Instrumento e origem: id opaco `c<n>`, protocolo e rede como codigo; de onde veio cada fato (API da OKX, protocolo na cadeia, calculo do app) e a idade em segundos.
- Do protocolo: LTV maximo na abertura, limiar de liquidacao, penalidade, teto de emprestimo e de deposito restante, utilizacao do pool, taxa de emprestimo (variavel ou fixa) e de deposito.
- Por degrau de fator (1,25, 1,5, 2,0): HF na abertura, queda do colateral ate liquidar, probabilidade de toque no horizonte do plano (de `src/quant/touch.ts` ou `envelope.ts`, rotulada "modelo" com a premissa: sem saltos), custo de juros no horizonte, numero de passos, custo por passo (`null` com motivo se desconhecido), impacto de saida (cotacao de vender o colateral no tamanho).
- Do ambiente: tempo restante da sessao, cadencia do vigia, e quantos sigmas do intervalo do vigia cabem na distancia de liquidacao (fato, nao veto).
- Marcas de cuidado em lista fechada: oraculo desconhecido, taxa variavel, colateral fino, retirada com utilizacao alta, rede com risco de upgrade, instrumento nao qualificado.
- Da conta (posicao aberta): HF atual, divida, colateral, patrimonio liquido, alavancagem atual, distancia de liquidacao, idade da leitura.
- Evidencia propria: o registro do Placar (nada medido, as voltas fechadas negativas) fica visivel como fato; nao e porta.

Se um fato necessario para validar a execucao fisica for `null` (por exemplo LTV maximo), o degrau NAO e oferecido e o motivo nomeado entra em `dropped` (`fato_fisico_ausente`).

### 5.2 Alternativas estruturadas (o Jev escolhe, nunca escreve numero)

- Abertura: duas perguntas fechadas por candidato elegivel: o tamanho (as fracoes existentes de `sizing-agent.ts`) e o fator `lev_1_00` (so spot, sem emprestimo), `lev_1_25`, `lev_1_50`, `lev_2_00`, mais `skip`. Fator = exposicao dividida pelo capital proprio posto.
- Posicao alavancada aberta: `hold`, `desalavancar_metade`, `fechar_tudo` (analogos a `hold, trim_half, exit_all` de `src/agent/types.ts`), mais o perfil de saida em termos do preco do colateral.
- Um degrau so e oferecido se for fisicamente executavel (secao 5.3). Nenhum degrau e vetado por parecer arriscado; HF e queda ate liquidar ficam ao lado.

### 5.3 O que e fisico (codigo recusa com motivo nomeado) e o que e economico (do Jev)

| Fisico, nao e juizo economico | Economico, e do Jev |
| --- | --- |
| Autoridade, modo, parada (STOP), ledger legivel, relogio, binario por hash, endereco da conta | Usar alavancagem ou nao |
| Instrumento ligado e qualificado (`instruments` nao vazio); identidade exata: rede, protocolo, `investmentId`, enderecos de token | Qual fator (1,0, 1,25, 1,5, 2,0) |
| Nao passar do LTV maximo, teto de emprestimo ou de deposito do PROPRIO protocolo (ele reverteria) | Qual tamanho |
| Solvencia: colateral e saldo existem; taxas de cada passo pagaveis (SOL); saldo da estavel para quitar | Perfil e distancia do stop |
| Representabilidade: decimais reais, truncamento para baixo, sem piso em dolar | Se a taxa de emprestimo compensa |
| Trilha viavel: HF acima de 1 em todo estado intermediario; saida existe (flag de resgate e cotacao de venda) | Se a distancia de liquidacao basta |
| Limite do portal da OKX como fato que delimita o executavel (dividir passos quando der; sem dividir, degrau removido com motivo) | Quando desalavancar ou fechar |
| Dado fresco (cotacao, blockhash da Solana ~60 s), uma operacao por posicao, passo incerto bloqueia | |
| Sessao vale ate o fim da operacao e do desfazer possivel [I] | |

Pontos cinzentos para o dono decidir, porque tocam o principio: (a) a regra de sessao acima e fisica ou economica? Recomendo fisica (sem assinar, nao ha como desfazer). (b) "degrau cuja distancia de liquidacao e menor que um intervalo do vigia" e inviavel de defender: recomendo tratar como FATO (a coluna de sigmas), nao como veto; assumir isso e aceitar que o codigo nao impede uma escolha provavelmente liquidavel. (c) O SPEC (`SPEC.md` secao 8) ainda condiciona o uso de alavancagem a retorno medido do Placar (condicao 1) e a "teto de alavancagem e distancia minima por codigo" (condicao 3): sao limites economicos e contradizem a autorizacao do dono de 2026-10-14; precisam ser revogados ou reescritos como fatos.

## 6. Fatias em ordem de risco, com aceite sem dinheiro real

| Fatia | Conteudo | Aceite que nao usa dinheiro | Risco |
| --- | --- | --- | --- |
| F0 | So documentos: corrigir as contradicoes da secao 8 | revisao de texto | nenhum |
| F1a | Leitura offline: parsers para busca LENDING, detalhe, posicoes e `healthRate` contra fixtures. Hoje so ha fixtures de descoberta (`src/onchainos/fixtures.ts`); nenhuma de enter, exit ou posicoes: criar fixtures SINTETICAS marcadas como tal | testes puros com `fetch` injetado; campo ausente vira `null`; identidade devolvida diferente da pedida e rejeitada (a falha de identidade ja apontada em DEFI-CANDIDATE-BOUNDARY-FINDINGS); o guarda continua recusando `defi *` e `contract-call` (teste de que a lista branca nao mudou) | nenhum |
| F1b | Captura unica de leitura (rede, sem assinatura, sem fundos) conforme a secao 3.1 "como descobrir"; troca as fixtures sinteticas pelas reais | respostas brutas guardadas e comparadas por hash; nenhuma ordem | baixo; exige autorizacao de uso de rede e envia um endereco publico |
| F2 | Fatos e sombra: funcoes puras `leverageFacts` (HF, queda, toque, custo com `null`), bloco `lv` do Brief, degraus oferecidos, contrafactual no Placar (o que o fator teria rendido e se teria tocado a liquidacao, com preco realizado) | propriedades: HF monotono em L; a formula reproduz 37,5%, 44,4% e 47,4% a 2x para LT 0,80, 0,90 e 0,95 (R3 tabela 4.8); `null` remove o degrau com motivo; bloco cabe em 9000 bytes; modelo falso nos testes; sem travessao nem ponto mediano em texto renderizado | nenhum; consulta ao Jev real so com autorizacao |
| F3 | Caminho so de calldata: abrir no guarda apenas `defi search|detail|prepare|deposit|redeem|calculate-entry|positions|position-detail` (os de transacao so devolvem calldata, R6) e, se necessario, `security tx-scan`; `wallet contract-call` continua FORA. Montar a operacao, o plano de passos e a conferencia de HF intermediario. | executor com runner falso e envelopes gravados; teste de que nada assinavel e executado; teste de operacao com passo incerto congelando; teste de reconciliacao por estado; simulacao sem enviar nao existe no fluxo da carteira (R7 secao 5.5) e a simulacao da Gateway tem whitelist (R7 secao 3.3): o ensaio e calldata mais checagens locais | baixo; muda o guarda, entao pede revisao independente e qualificacao do Codex |
| F4 | Passo real minimo, so com OK explicito e separado do dono: o ciclo completo numa quantia de poeira (depositar, emprestar, repagar, retirar) para provar recibos, estado e desfazer | lido depois: recibos de todos os passos, divida zero ao final, ledger consistente; valor minimo do produto e [D] e pode nao permitir poeira | medio: custo de taxas e SOL; ADENDO-B proibe trade manual de teste sem novo OK |
| F5 | Primeira posicao escolhida pelo Jev, em degraus liberados pelo dono | os mesmos testes, mais o disjuntor existente; relatorio de custo real por passo | alto |
| F6 | Exchange (paralelo, bloqueado): cliente privado com runner falso, leitura de posicao e margem, desfazer | testes com respostas gravadas; nenhuma chave real | bloqueado ate o dono criar a chave e a conta |

Regra de cada fatia: nada liga `instruments` ate a F4 passar; a tela continua dizendo "autorizada, sem instrumento ligado".

## 7. O que SO o dono pode fazer (separado do que e engenharia)

1. Autorizar, por escrito e fatia a fatia, o uso de rede para a captura de leitura (F1b), qualquer consulta ao Jev real em sombra (F2) e, separadamente, a poeira real (F4). Autorizacao de alavancagem nao autoriza teste.
2. Manter a sessao da carteira valida: o login por codigo de e-mail e ato do dono; o agente nao entra sozinho.
3. Ajustar a politica do portal (limite por transacao, diario de trade, transferencia, whitelist) sabendo que pode nao valer para chamadas de contrato [D].
4. Colocar SOL na carteira ou decidir sobre o Gas Station (a OKX pede consentimento do dono; o agente nunca responde).
5. Para Multiply ou qualquer rede diferente da Solana: transferir ou fazer a ponte dos fundos (o guarda proibe `send` e `cross-chain`).
6. Para margem e perpetuo: abrir conta da exchange com derivativos, passar pelo cadastro, confirmar elegibilidade para residente no Brasil, criar a chave de API COM permissao de negociacao (nome exato da permissao: [D] nos documentos locais) e restricao de IP se houver, depositar a margem na exchange (transferencia que sai da carteira), aceitar os avisos de risco, e entregar a chave ao cofre do app.
7. Decidir os pontos cinzentos da secao 5.3 e revogar as condicoes economicas do SPEC secao 8.
8. Responsabilidade fiscal e regulatoria (CVM, Receita; R3 secao 3.8).

## 8. Contradicoes entre documentos locais a corrigir (F0)

- `docs/sdd/agente-autonomo/SPEC.md` secao 8 ("Nenhuma pagina nem comando oferece alavancagem, emprestimo com saque a descoberto ou perpetuos"; "Alavancagem por emprestimo: nao documentada como fluxo da carteira do agente") e `docs/sdd/agente-autonomo/tasks.md` Fase 3 ("A documentacao da OKX nao oferece alavancagem na carteira do agente") divergem de `docs/real-integration/PESQUISA-OKX.md` (2026-10-11, exemplos de borrow) e de `capacidades-okx.md` (2026-10-14). A leitura que o conjunto sustenta: a API DeFi documenta tomar emprestimo; nao documenta alavancagem pronta.
- `docs/research/R9-system-one-alavancagem-onchainos.md` secoes 1 e 2.5 ("nenhuma API de emprestimo") esta superada pelo item acima (a propria PESQUISA-OKX o diz). A parte sobre Multiply e Loop (so enderecos) continua valida.
- `docs/sdd/inonu-desktop-v1/onchainos-coverage.md` marca as paginas da carteira Agentic como "fora" e as de transacao DeFi como "depois": e a postura do produto v1 ("o app nunca assina sozinho"), que o produto autonomo substituiu. Nao vale como decisao para este estudo.

## 9. Conclusao honesta

- **Pode ser construido agora, sem dinheiro:** a camada de leitura (F1a), os fatos e o bloco do Brief (F2), a medicao em sombra e o desenho da operacao em varios passos com seu registro (F3 contra runner falso). Isso nao liga alavancagem; deixa o Jev e a tela falando de fato (HF, distancia, custo) em vez de texto.
- **Bloqueado por quem e por que:** o caminho de emprestimo DeFi, por ausencia de documentacao local do contrato exato (parametros do protocolo, formato da entrega na Solana, unidade do HF) e por tres decisoes do dono (rede para a captura, SOL ou Gas Station, OK da poeira). O Multiply, por falta de API e porque o capital esta em outra rede. A exchange, por conta, chave de negociacao, margem e elegibilidade que so o dono cria e confirma.
- **Verdade que nao muda:** alavancagem multiplica perda e custo, e nao cria vantagem. O projeto nao tem vantagem demonstrada em preco; com mu = 0 todo fator acima de 1 reduz a mediana, e o arrasto de volatilidade pesa 10 a 20 vezes o juro nesta escala. Com US$ 120, custos fixos por passo, uma liquidacao em minutos que o vigia nao acompanha e uma sessao que vence sozinha, a probabilidade de um laco alavancado melhorar o resultado e baixa. O que o dono autorizou continua sendo do Jev, mas ele so deve ter degraus a escolher quando os fatos estiverem verdadeiros, frescos e verificados.

## 10. Fontes (locais)

- Em `docs/research/`: `R3-estrategias-e-alavancagem.md` (secoes 3.3, 3.5, 4.1, 4.7, 4.8, 4.9); `R6-onchain-os-catalogo.json` (entradas `defi.product.*`, `defi.transaction.*`, `defi.user.platform-detail`, `cli.defi`, skill `okx-defi`) e `R6-onchain-os-inventario.md`; `R7-okx-agentic-wallet.md` (secoes 1, 2.3, 2.4, 3.3, 3.5, 5.5); `R9-system-one-alavancagem-onchainos.md` (secoes 1, 2.5, 2.7, 5); `OKX-MULTIPLY-LOOP-ADDENDUM-20261011.md`; `OKX-DEFI-ENDPOINT-COVERAGE-20261011.md`; `OKX-DEFI-WIRING-ADDENDUM-20261011.md`; `OKX-DEFI-WIRING-INDEPENDENT-REVIEW-20261011.md`; `DEFI-CANDIDATE-BOUNDARY-FINDINGS-20261011.md`; `OKX-AUTH-CUSTODY-MATRIX-20261011.md`.
- Indice do espelho OKX em disco: `docs/sdd/inonu-desktop-v1/onchainos-coverage.json` e `onchainos-coverage.md` (o texto das paginas nao esta em disco).
- Fora de `docs/research/`: `docs/real-integration/PESQUISA-OKX.md`; `docs/sdd/agente-autonomo/{ADENDO-B-autonomia-economica,capacidades-okx,SPEC,design,tasks}.md`; `docs/sdd/inonu-desktop-v1/{wallet.md,evidence/RAS-7-motor-de-oportunidades.md}`; `docs/sdd/carteira-evidencia/ONCHAINOS-INSTALL-20261014.md`; `docs/okx-derivatives-v1/GUIA.md`; copia local de `okx-defi/SKILL.md` e `okx-agentic-wallet/SKILL.md` em `C:/Users/gabri/.codex/tmp/agentic-01a136cd-review/install-skills/`.
- Codigo lido (so leitura): `src/agent/{autopilot,cli,swap-args,config,ledger,sizing-agent,model,types}.ts`, `src/onchainos/{defi-read,public-okx,fixtures}.ts`, `src/okx-wallet/{defi,trade}.ts`, `src/okx-api.ts`, `src/okx-market/okx-api.ts`, `src/policy/envelope.ts`, `src/quant/touch.ts`, `src/operator/executor.ts`, `src/okx-derivatives/*`, `.env.example`.
