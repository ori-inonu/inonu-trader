# R3: Modalidades alcançáveis a partir do ecossistema OKX e a matemática da alavancagem

Data: 2026-10-10. Escopo: pesquisa e análise somente leitura; nada aqui autoriza ordens, assinaturas, transferências, aprovações ou alavancagem. Não sou consultor de investimentos licenciado: os números são evidência histórica e cálculo, não previsão, promessa de retorno nem recomendação personalizada. Modelo: Sonnet 5.5 (tier e sandbox não expostos). Dados públicos lidos por GET/POST de leitura sem chave (OKX REST público, Hyperliquid info, DefiLlama, FRED, BCB), coletados por volta de 21:00 UTC; scripts Bun/Python em diretório temporário, nada salvo no repositório além deste arquivo. NAO CONFIRMADO marca o que não foi verificado em fonte primária. Citações [S#] e [R#] estão na seção 8. Decimais com vírgula na prosa e nas tabelas, ponto nas fórmulas.

## 1. Resumo executivo

1. **Veredito:** nas fontes consultadas, nenhuma modalidade tem edge líquido demonstrado e acessível a uma carteira pequena automatizada. As de retorno documentado rendem perto do juro livre de risco (carry e basis de 3 a 6% a.a.; stablecoins consolidadas de 3 a 5%; T-bill 3m 4,05%; Selic meta 13,75%); as de retorno alto (arbitragem, MEV, memes) são dominadas por poucos agentes ou mostram indícios de esperança líquida negativa para o varejo.
2. **Alavancagem não cria crescimento:** o crescimento logarítmico é `g(L) = L*mu - 0.5*L^2*sigma^2`. Sem edge (mu = 0), todo L > 0 reduz a mediana. Com sigma = 4%/dia e L = 10, a mediana em 30 dias é 0,09x do capital (a média 1,0 vem de uma cauda rara) e a chance de tocar liquidação em 7 dias é 34,5%.
3. **Kelly:** `L* = mu/sigma^2`. Edge de 0,1%/dia com sigma = 4% justifica 0,6x; acima de `2*L*` o crescimento fica negativo mesmo com edge real. Com 30 dias de dados e edge zero, o Kelly estimado tem desvio de 4,6x: o "ótimo" é ruído. Validar Sharpe 2 exige cerca de 1 ano de dados; Sharpe 1, cerca de 4 anos.
4. **Meta R$400 para R$4.000 em 7 dias** = 38,95%/dia composto: exigiria Sharpe anualizado de cerca de 15,5 sob Kelly pleno. Ordem de grandeza: uma firma HFT reportou 1 dia perdedor em 1.238 [S46], com infraestrutura de baixa latência que um agente com inferência por LLM (latência ainda não medida no repo [R13]) não tem.
5. **A anedota "US$68 para US$6.700" (x98,5) é inverificável e sem valor probatório:** para qualquer estratégia sem edge, a chance de atingir x98,5 é no máximo 1,0% (desigualdade maximal); entre milhares de tentativas alavancadas, algumas parecem gênios por sobrevivência.
6. **Evidência do repo:** 3 capturas paper de 44 a 179 s com -0,0037%, -0,0068% e +0,0199% (o último é marcação dos 200 MON iniciais, sem lucro de trade); zero edge demonstrado. Cotar todo bloco custa US$253,71/dia de gas, quase o pool estimado de receita de todos os makers da Kuru em 24 h (cerca de US$269).
7. **Ordem de viabilidade (seção 5):** 1) monitores read-only de yield; 2) funding e basis (dados públicos, execução arriscada); 3) market making na Kuru (já construído, capacidade minúscula); 4 a 7) arbitragens, loops e memes.
8. **Caudas recentes:** 10/10/2025 (mais de US$19 bi liquidados; ADL de US$2,1 bi em 12 min na Hyperliquid; USDe a US$0,65 na Binance), Stream/Elixir (nov/2025, ~US$285 mi de exposição a credores DeFi), Balancer (03/11/2025, ~US$128 mi).
9. **Escala:** com R$400 (cerca de US$80), 5% a.a. rende cerca de US$4 por ano (R$20); custos fixos de rampa (R$10 a 20 em hipótese do repo [R3]) consomem 2,5 a 5% do capital antes de qualquer trade, e o mínimo de 200 MON da Kuru já é 6,2% do capital.
10. **Envelope padrão (seção 6):** 1x spot sem empréstimo até validação, teto de 2x depois; exposição por ativo `f <= DLL/(2*sigma)`; parada diária -2%, drawdown -10%; piso de distância de liquidação `>= max(35%, 2.5*sigma*raiz(7))`.

## 2. Tabela de modalidades

| # | Modalidade | Como surge o edge | Quem compete | Retorno líquido reportado | Capacidade | Cauda principal |
|---|---|---|---|---|---|---|
| 1 | Arbitragem DEX (X Layer, Monad) | pools desalinhados após swaps | searchers MEV; 11 fazem >80% do volume não atômico no Ethereum [S24] | nenhum líquido auditável; oportunidade de 0,03 a 0,05% do volume em L2 (2024) [S25] | estimativa própria: US$5 a 8 mil/dia (X Layer) e US$10 a 17 mil/dia (Monad), brutos, para todos | revert com gas pago, bug do contrato, atomicidade só na mesma cadeia |
| 2 | CEX-DEX e cross-venue | CEX lidera, AMM defasa; segmentação entre venues [S27] | 3 de 19 searchers = 75% do valor [S23] | US$233,8 mi em 19 meses (ago/2023 a mar/2025), todos os searchers, Ethereum | profundidade do pool e capital pré-posicionado | perna sem hedge, saque suspenso, taker de 10 bps |
| 3 | Funding e basis (OKX, Hyperliquid) | varejo paga para ficar long; short perp + long spot recebe | fundos, Ethena, MMs; carry existe por escassez de capital [S22] | BTC 5,57% a.a. (OKX, 103 d), 5,85% (HL, 365 d); basis 4,4 a 5,4%; sUSDe 4,86% (2026-10-10) | grande (OI BTC na OKX US$2,49 bi), taxa baixa | liquidação da perna perp, ADL, funding negativo, depeg |
| 4 | Yield (Earn, staking, lending, LP) | juro de empréstimo, emissão, taxas de swap | capital passivo global | OKX USDT 3,5%; Aave USDC 4,30%; X Layer USDT0 2,94%; LP (2021): taxas US$199,3 mi < perda impermanente US$260,1 mi [S28] | grande, limitada por caps | contrato, depeg, custódia, resgate |
| 5 | Loops alavancados (lending, perps) | spread entre colateral e dívida vezes L | os mesmos de 4 | spread negativo em stables: 3x rende 4,46% contra 4,86% a 1x | caps e utilização (91% no Aave Monad USDC) | HF, depeg, oráculo, contágio |
| 6 | Market making Kuru/Monad | captura de spread (12,5 bps; taxa 0/0) menos seleção adversa | MMs externos, vaults, bots por bloco [S4] | sem dado de MM na Kuru; referência HLP 3,68% APR (2026-10-10) | volume 24 h US$429 mil; TVL US$1,0 mi | inventário MON, unlock, gas |
| 7 | Sinais, smart money, memes | atenção e informação antes do fluxo | snipers, insiders, bots | 98,7% dos tokens do Pump.fun com padrão de fraude [S43]; carteiras lucrativas 30 a 73% (só realizado) [S44] | pequena (impacto, liquidez de saída) | rug, honeypot, latência |

### 2.1 Pilha de custos por modalidade (medidos ou exemplos; custo fixo da rampa BRL: R$10 a 20 em hipótese do repo, 2,5 a 5% de R$400 [R3])
| # | Itens de custo e valores |
|---|---|
| 1 | gas Monad US$0,00088/tx (limite 350 mil, cobrado pelo limite) [R2]; X Layer cerca de US$0,0004/swap (gasPrice 0,02 gwei, estimativa); taxa do pool 0,05 a 0,30%; slippage; gas de reverts; manutenção do contrato |
| 2 | taker spot OKX 0,10% (exemplo [S19]); taxa do pool e gas do DEX; meio spread dos dois lados (6,3 bps Kuru + 2,0 bps OKX); retirada e depósito (NAO CONFIRMADO); capital parado nas duas venues |
| 3 | spot 0,08/0,10% e perp 0,02/0,05% maker/taker (exemplos OKX) ou HL 0,015/0,045% (perp); funding pago quando invertido; margem imobilizada; rampa BRL; imposto |
| 4 | taxa de serviço de 15% (Simple Earn flexível) [R7]; gas e aprovações; spread de conversão BRL/USDT; risco de preço do ativo pago; imposto |
| 5 | juros da dívida (4,0 a 5,7% em stables, 2026-10-10 [S9]); gas e swap em cada volta; bônus do liquidante; funding nos perps |
| 6 | gas US$253,71/dia se cotar todo bloco [R2]; inferência cerca de US$0,000084 por decisão (2.000 tokens a US$0,042/M, preço configurado [R8]); taxa maker 0; seleção adversa; cancelamentos |
| 7 | slippage alto, taxas de plataforma (NAO CONFIRMADO), tax tokens, sandwich, gas; saída ilíquida |

## 3. Modalidades

### 3.1 Arbitragem DEX (X Layer e Monad; cross-DEX e cross-chain)
- Edge: cada swap desloca o preço de um pool; quem realinha pools (Uniswap V3/V4, Curve, Balancer e o CLOB da Kuru na Monad; Uniswap V3/V4 e PotatoSwap na X Layer) captura a diferença menos taxa e gas. Agregadores (Kuru Flow, OKX DEX) roteiam o varejo pelos melhores pools e comprimem desvios. Volume 24 h em 2026-10-10: Monad US$33,9 mi (Uniswap V4 US$20,5 mi, Kuru US$0,43 mi); X Layer US$16,2 mi (Uniswap V3 US$5,75 mi) [S4, S8].
- Competição: no Ethereum, 11 searchers fazem mais de 80% do volume de arbitragem não atômica (dois fazem 49,2%) [S24]; em Base e Optimism, contratos de arbitragem cíclica usaram mais de 50% do gas no 1T2025 e pagaram menos de um quarto das taxas [S26]; em rollups de finalidade rápida, mais de 80% dos reverts são swaps de bots que duplicam e fragmentam ordens, e o leilão de prioridade aloca mal o espaço [S26]; na Monad não há mempool global, o estado visto está 3 blocos atrás (D = 3) e a FastLane descreve sondas cegas em massa, com o valor quase todo para searchers [S2, S3].
- Retorno: nenhum líquido e auditável para agentes pequenos. Oportunidades equivalem a 0,03 a 0,05% do volume em Arbitrum, Base e Optimism (0,25% em zkSync) e duram 10 a 20 blocos [S25]. Aplicado aos volumes acima: US$10 a 17 mil (Monad) e US$5 a 8 mil (X Layer) brutos por dia para todos os arbitradores somados (cálculo próprio; NAO CONFIRMADO para estas cadeias).
- Cross-chain: não atômico; exige inventário nos dois lados, ponte e finalidade. A X Layer migrou para OP Stack (blog Optimism de 2025-12-09), com um proponente e um desafiante autorizados e TVS de US$242 mi, quase só stablecoins [S5, S6]. Rota Monad a X Layer, tempo e custo: NAO CONFIRMADO.
- Caudas: bug no contrato do bot, aprovações abertas, token com taxa ou honeypot, upgrade malicioso (L2BEAT marca risco crítico na X Layer), reorg. Read-only primeiro: sim (quotes e pools públicos; ver [R5]).

### 3.2 CEX-DEX e cross-venue
- Edge: o preço da CEX lidera e o AMM defasa. 19 searchers extraíram US$233,8 mi em 7,2 mi de arbitragens CEX-DEX no Ethereum entre ago/2023 e mar/2025 (média de cerca de US$32 por operação, cálculo próprio); 3 deles ficaram com 75% do volume e do valor, e a rentabilidade depende da integração com builders [S23]. Entre exchanges e países, desvios persistem por limites de capital, e um fator comum explica cerca de 80% dos retornos do BTC [S27].
- Varejo: exige capital pré-posicionado nas duas pontas, taxa taker da CEX (exemplos da OKX: spot 0,10%, perp 0,05% [S19]), taxa e gas do DEX e risco de perna. Cruzar Kuru (spread 12,5 bps em 2026-10-09 [R8]) com OKX MON-USDT (3,9 bps em 2026-10-10 [S10]) pede dislocação mid a mid de cerca de 18 bps só para cobrir spreads e taker de 10 bps (cálculo próprio, instantes distintos).
- Caudas: perna sem hedge, depósito ou saque suspenso (a Bybit suspendeu temporariamente a rede Monad em 2026-07-23 para upgrade [R3]), USDT contra USDC, custódia, janela útil de segundos. Read-only: sim (medir gaps é barato; capturá-los é o problema).

### 3.3 Funding e basis (perpétuos da OKX e on-chain, ex.: Hyperliquid)
- Edge: demanda de varejo por alavancagem long faz o perp pagar funding; short perp + long spot é neutro em delta e recebe. O BIS mede carry médio acima de 10% a.a., com picos de 40% (revisão de 2025) a 60% (versão de 2023), ligado à escassez de capital de arbitragem; carry alto prediz crashes e o cash-and-carry sofre com picos de margem e liquidações [S22].
- Medido agora (cálculo próprio, APIs públicas; APR simples = média x períodos/dia x 365; "pior 5%" = soma de funding recebido pelo short nas 5% piores janelas de 30 dias, % do nocional) [S10, S11]:

| Ativo | OKX 103 d: APR | períodos negativos | pior 5% (30 d) | HL 365 d: APR | horas negativas | pior 5% (30 d) | janelas 30 d negativas (HL) |
|---|---|---|---|---|---|---|---|
| BTC | 5,57% | 8,0% | +0,37% | 5,85% | 19,1% | -0,02% | 6% |
| ETH | 4,24% | 16,4% | +0,11% | 6,30% | 16,3% | +0,05% | 2% |
| SOL | 3,22% | 29,9% | +0,17% | -0,25% | 37,1% | -1,17% | 41% |
| MON (OKX: funding de 4 h) | -1,63% | 32,5% | -1,10% | 4,67% | 15,8% | -0,73% | 30% |

- Janelas curtas e de um único regime de mercado; não são previsão. Na OKX, 51% das janelas de 30 dias do MON foram negativas para o short (0% para BTC, ETH e SOL); o mínimo horário da SOL na HL foi -0,205%. Basis (OKX, 2026-10-10): futuros trimestrais do BTC a 4,4 a 5,4% a.a. (simples). sUSDe da Ethena: média de 32,4% (1T2024) para 4,0% (2T2026), 4,86% hoje; oferta de USDe de US$14,8 bi (2025-10-05) para US$4,1 bi (2026-09-01), sinal de carry espremido [S9].
- Custos: exemplos da página da OKX (spot 0,08%/0,10%, perp 0,02%/0,05% maker/taker; tabela real da conta NAO CONFIRMADO) [S19]; Hyperliquid perp 0,015%/0,045% e spot 0,04%/0,07% no tier 0 [S16]. Ida e volta de 0,30% (taker) ou 0,20% (maker) do nocional leva 10 a 34 dias (taker) ou 7 a 23 dias (maker) de funding para se pagar, com APR de 10,95% a 3,2%; a perna perp exige margem (eficiência de 75% com 3x). Resultado líquido sobre capital na seção 4.8.
- Mecânica: OKX liquida funding a cada 8, 4, 2 ou 1 h, com teto de 0,375% por período no BTC; a dedução reduz margem e pode causar redução ou liquidação [S10, S17]. Hyperliquid paga por hora (1/8 da taxa de 8 h), teto de 4%/h [S14].
- Caudas: liquidação da perna perp em rally; funding invertido; falha de oráculo ou de venue (JELLY, mar/2025, com intervenção da fundação [S41]); em 10/10/2025 o ADL na Hyperliquid fez 34.983 execuções em 19.337 carteiras e fechou posições de traders lucrativos e de menor risco [S30]. O ADL age por mercado sem ver hedges em outros ativos ou venues (relatos de hedges de MMs quebrados: NAO CONFIRMADO).
- Brasil: a CVM trata derivativos de cripto como valores mobiliários (3.8); disponibilidade de perps da OKX a residentes brasileiros: NAO CONFIRMADO. Read-only: sim (funding e basis são públicos; o repo já prevê stream de funding [R11]).

### 3.4 Yield (OKX Earn, staking, lending, LP)
- Taxas em 2026-10-10 [S9, S10]: OKX Simple Earn, taxa pública estimada: USDT 3,5%, USDC 3,6%, BTC 0,5%, ETH 1,0% (taxa de serviço de 15% sobre retornos do flexível; líquido NAO CONFIRMADO [R7]). DeFi: Aave USDC Ethereum 4,30%, USDT 3,44%, sUSDe 4,86%, Sky sUSDS 3,80%, Aave X Layer USDT0 2,94%, Aave Monad USDC 4,04%; Accountable USDC (Monad) 10,85% e Morpho 7,03% (estrutura e risco de crédito NAO CONFIRMADO); MON: shMON 13,8%, Kintsu sMON 11,95%, Magma gMON 10,8%, pagos em MON (volatilidade de 5,2%/dia).
- Benchmarks: T-bill 3m 4,05% (FRED, 2026-10-08), Selic meta 13,75% desde 2026-09-17 (CDI cerca de 13,65%), dólar a R$4,9892 (BCB, 2026-10-09) [S12, S13]. Em reais, yield de stablecoin não supera o CDI sem apreciação do dólar. OKX Pay Brasil anuncia "até 10% APY" sem ativo nem condições (NAO CONFIRMADO) [S20].
- Produtos OKX: Simple Earn não protege principal e resgate pode atrasar; On-chain Earn cita elegibilidade a investidores credenciados no Brasil; DeFi Earn é autocustódia com risco de contrato [R7].
- LP: em 17 pools do Uniswap v3 (2021) as taxas somaram US$199,3 mi e a perda impermanente US$260,1 mi [S28]; LVR é custo sistemático de AMMs [S29]; a Kuru ilustra -US$2,80 em US$40 com queda de 40% [S4].
- Caudas: exploits (Balancer, 03/11/2025, ~US$128 mi, fonte secundária [S40]), depeg, lockup, custódia da exchange; L2BEAT: na X Layer, fundos podem ser perdidos por upgrade sem atraso [S5]. Read-only: sim (okx-defi-v1 do repo [R10]).

### 3.5 Loops alavancados (lending e perps) e liquidação
- Mecânica: comprar colateral com dívida em loop dá ativos `L*E` e dívida `(L-1)*E`; `HF = LT*L/(L-1)`; o colateral pode cair `x = 1 - (L-1)/(L*LT)` até HF = 1 (tabela 4.8); `L_max = 1/(1-LT)`. Aave v3 liquida com HF < 1, fator de fechamento de 50% (100% se HF <= 0,95 ou posição pequena) e bônus ao liquidante [S21].
- Retorno `L*s - (L-1)*b` com taxas de 2026-10-10 [S9]: sUSDe 4,86% contra empréstimo de USDC a 5,06% rende 4,86% (1x), 4,46% (3x), 3,06% (10x), ou seja, a alavancagem reduz o retorno quando b > s; stETH 2,22% contra WETH a 1,96% sobe de 2,22% (1x) para 4,56% (10x), com margem de queda de só 5,3% (LT 0,95, exemplo).
- Casos: o depeg do stETH em jun/2022 afetou Celsius e 3AC e expôs o risco dos loops stETH/ETH [S42]; Stream xUSD (nov/2025): suspensão após perda de US$93 mi relatada, exposição estimada em US$285 mi a credores DeFi (exposição, não perda realizada) e US$68 mi do Elixir; a alavancagem recursiva é apontada por analistas on-chain (fontes secundárias) [S39]; 10/10/2025: ativos tratados como estáveis foram vendidos como colateral comum [S38].
- Perps: a OKX liquida por preço de marca, cobra taxa de liquidação, usa fundo de segurança e ADL por ranking de lucro e alavancagem; mesmo 1x pode liquidar em condições extremas [S18]. Hyperliquid: margem de manutenção = `1/(2*alavancagem máxima)`, de 1,25% a 16,7%; liquidação parcial de 20% acima de US$100 mil; no backstop a margem de manutenção não é devolvida [S15].
- Custos: juros da dívida, gas e swap em cada volta, bônus do liquidante. Capacidade: caps e utilização. Read-only: simulação sim; execução não recomendada.

### 3.6 Market making na Kuru/Monad (venue atual do repo)
- Medido (doctor do repo, 2026-10-09T16:47Z): mid US$0,02476, spread 12,52 bps, taxas maker e taker 0/0, mínimo 200 MON (cerca de US$4,95), gas 102 gwei x 350 mil = 0,0357 MON (US$0,00088 por transação). Spread bruto hipotético de duas pernas US$0,0058 contra custo US$0,00177 (gas e inferência): líquido hipotético US$0,0040, se os dois fills ocorrerem sem seleção adversa [R8].
- Capacidade (DefiLlama, 2026-10-10): TVL da Kuru US$1,0 mi (pools de LP: MON-USDC US$53 mil, com APY atual 0,00% e média de 30 dias 8,63%; CETES-USDC US$23,6 mil a 7,61%; WETH-USDC US$12 mil) [S9]; volume 24 h US$429 mil, 7 dias US$15,6 mi; as semanas de setembro tiveram média de US$67 a 127 mi/dia e o volume caiu para US$3,7 mi/dia na semana de 30/09 e US$2,0 mi/dia de 07 a 10/10 (causa NAO CONFIRMADO; posts da Kuru no X, não abertos, citam US$1,2 mi de incentivos de trading previstos até o fim de agosto) [S8]. Pool de receita de todos os makers = volume x meio spread (6,26 bps): US$269/dia (24 h) e US$1.392/dia (média 7 dias), ordem de grandeza. Cotar a cada bloco custa US$253,71/dia só de gas [R2].
- Competição e latência: MMs externos, vaults, Flip orders e AMM de backstop alimentam o mesmo livro; há post-only e cancelamento em lote, mas não colocação em lote documentada [S4]. Blocos de 300 ms, finalidade em 600 ms [S1] e estado 3 blocos atrás [S2], somados à inferência do Jev (latência não medida; a documentação manda medir p50/p95/p99 antes de pô-lo no caminho quente [R13]), tendem a deixar as cotações velhas frente a bots por bloco (NAO CONFIRMADO): seleção adversa [S29] e corrida de velocidade [S31].
- Referência: o vault HLP da Hyperliquid (market making e liquidação) tem APR de 3,68%, PnL acumulado de US$138,6 mi sobre US$180,4 mi de valor e perdas episódicas (JELLY, mar/2025; valores divergem entre fontes) [S11, S41].
- Riscos: inventário MON (sigma 5,2%/dia; queda máxima de 50% em 202 dias); 50,6% do supply ficou bloqueado por pelo menos um ano desde 2025-11-24, calendário exato NAO CONFIRMADO [S7]; contratos auditados (Spearbit, Cantina) com TVL baixo [S4]; MarginAccount é spot, sem empréstimo [R3].
- Tensão a decidir pelo dono: a mensagem do demo (ordem a cada bloco de 300 ms) contra a economia acima; o doctor usa `quoteIntervalBlocks = 100` e o filtro P1 [R1, R8]. Este documento só quantifica. Paper e read-only: já existem (capture e replay).

### 3.7 Sinais, smart money e memes
- Edge: atenção e informação antes do fluxo. OKX Signals, Alpha Radar e Meme Pump aparecem no repo como scanners read-only, sem esquema de desempenho nem prova de retorno [R10].
- Evidência: Solidus (fornecedor de detecção): 98,7% dos tokens do Pump.fun (jan/2024 a mar/2025; mais de 7 mi com 5 ou mais trades, só ~97 mil mantiveram liquidez acima de US$1 mil) com padrão de pump-and-dump ou rug, e 93% das pools Raydium [S43]. CoinGecko (apenas PnL realizado): carteiras lucrativas de 30,1% (jun/2025) a 73,3% (abr/2026), subindo quando as carteiras ativas caíram de 5,26 mi para 1,8 mi; em abr/2026 só 5,37% lucraram mais de US$1 mil [S44]. LIBRA: 86% dos traders perderam US$251 mi [S45]. Rug pulls em DEX são estudados desde 2022 [S36].
- Copiar carteiras: lucro de quem é copiado não garante lucro do copiador (preço pior na bonding curve, bots manipuladores); um preprint de 2026 reporta +3% médio por memecoin só para seu sistema multiagente com LLM, em simulação sem replicação (NAO CONFIRMADO) [S37].
- Custos: slippage alto, taxas de plataforma, honeypot e tax tokens; honeypot=false não garante venda [R10]. Read-only: sim, como pesquisa; execução automática não.

### 3.8 Ponteiros regulatórios do Brasil (fatos, não aconselhamento)
- Marco legal: Lei 14.478/2022 (prestadoras de serviços de ativos virtuais exigem autorização prévia) e Decreto 11.563/2023 (BCB regula e supervisiona) [S48, S49]. Resoluções BCB 519, 520 e 521 (10/11/2025; em vigor desde 02/02/2026): autorização, funcionamento e tratamento de stablecoins e transferências internacionais com ativos virtuais como operações de câmbio, segundo o resumo do BCB; texto integral e IOF: NAO CONFIRMADO [S47].
- Receita: DeCripto (IN RFB 2.291/2025) substitui a IN 1.888/2019 desde 2026-07-01 e alcança prestadoras estrangeiras que miram o Brasil; é norma de reporte e não altera a tributação [S50, S51]. Segundo escritório, seguem o IR sobre ganho de capital e a isenção para vendas mensais até R$35 mil (confirmar com contador) [S52]. Tributação de trading frequente, derivativos e DeFi: NAO CONFIRMADO.
- Derivativos: a CVM mandou suspender em 2020 a oferta de derivativos de cripto da Binance a residentes e o caso fechou em acordo em 2024; entende derivativos como valores mobiliários [S53, S54]. Perps da OKX para residentes: NAO CONFIRMADO (a OKX Brasil divulga spot, Pix e Earn; futuros só em material promocional).

### 3.9 Onde o Jev entra (inferência desta pesquisa)
- O cálculo de spread, funding, basis, HF e custos é aritmética determinística (código e gates); o Jev pode escolher entre candidatos já elegíveis ou hold, como na arquitetura de [R5], mas isso não cria edge: a confiança do Jev não é calibrada [R2].
- Onde o juízo importaria (sinais, memes), a pesquisa não achou evidência de que um LLM supere a penalidade de imitação e a latência [S37]. Jogos por bloco (arbitragem, cotação) provavelmente são mais rápidos que a inferência, mas a latência do Jev não foi medida [R13] (NAO CONFIRMADO).
- Se nada disso mudar, o papel defensável do Jev é seleção e recusa (hold) dentro do envelope da seção 6, medido contra caixa, manter inventário e maker simples [R2].

## 4. Matemática da alavancagem

### 4.1 Fórmulas e premissas
```
Modelo: dS/S = mu*dt + sigma*dW   (mu: drift aritmético diário líquido de carregamento; sigma: vol diária; t em dias)
Alavancagem constante L: d ln W = (L*mu - 0.5*L^2*sigma^2) dt + L*sigma dW        [arrasto de ETFs alavancados, S33]
  g(L) = L*mu - 0.5*L^2*sigma^2 ; arrasto = 0.5*(L*sigma)^2 ; edge mínimo para g > 0: mu > 0.5*L*sigma^2
Kelly: L* = mu/sigma^2 ; g* = mu^2/(2*sigma^2) = S^2/2 (S: Sharpe diário) ; c = L/L* => g = g*(2c - c^2)   [S32]
  g > 0 só para 0 < L < 2*L* ; P(riqueza cair alguma vez à fração x do início) = x^(2/c - 1)
Toque de liquidação (mu = 0, reflexão, monitoramento contínuo): P = 2*Phi(-d/(sigma*sqrt(T))), d = 1/L - m   [S34]
Sem edge: E[W_T] = 1 (antes de custos) ; mediana = exp(-0.5*L^2*sigma^2*T) ; P(W_T < 1) = Phi(0.5*L*sigma*sqrt(T))
Maximal: se W >= 0 é martingale (supermartingale com custos), P(max W >= c*W0) <= 1/c   [S35]
  (parar em tau = 1o tempo com W >= c*W0: E[W_tau^n] <= W0 e W_tau^n >= c*W0*1{tau <= n})
Kelly estimado: sd(L_hat) = 1/(sigma*sqrt(N)) com edge real zero ; dias para detectar Sharpe anual S com t = 2: N = (2*sqrt(365)/S)^2
```
- Premissas: movimento browniano geométrico sem saltos (subestima caudas); Phi exata via erfc; as tabelas C e D usam mu = 0; a tabela D vale para L constante com rebalanceamento contínuo (perp de notional fixo tem mediana melhor, mas a liquidação domina; ver 4.6); a tabela C usa distância aritmética `1/L`, levemente conservadora para L baixo (a simulação com preço lognormal dá 7,4% contra 12,8% a 3x e 4%, 30 d, sem margem).
- Calibração de sigma (OKX, fechamentos diários, 2026-10-10) [S10]: BTC 1,91% (90 d; 2,21% em 399 d), ETH 2,46% (2,99%), SOL 2,83% (3,38%), MON 5,17% (5,20% em 202 d; 6,67% em 30 d). Assim 2% ~ BTC, 4% ~ ETH/SOL em regime agitado, 6% ~ MON. Curtose em excesso de 1,4 a 2,0; o BTC teve 5 dias além de 3 desvios contra 1,1 esperados; amplitude intradiária mediana: BTC 2,9%, MON 7,4%; queda máxima fechamento a fechamento: BTC 53%, ETH 67%, SOL 75% (399 d), MON 50% (202 d).

### 4.2 Tabela A: arrasto de volatilidade por dia (`0.5*(L*sigma)^2`) e edge diário mínimo (`0.5*L*sigma^2`)
| L | arrasto s=2% | s=4% | s=6% | mu mínimo s=2% | s=4% | s=6% |
|---|---|---|---|---|---|---|
| 1x | 0,02% | 0,08% | 0,18% | 0,02% | 0,08% | 0,18% |
| 2x | 0,08% | 0,32% | 0,72% | 0,04% | 0,16% | 0,36% |
| 3x | 0,18% | 0,72% | 1,62% | 0,06% | 0,24% | 0,54% |
| 5x | 0,50% | 2,00% | 4,50% | 0,10% | 0,40% | 0,90% |
| 10x | 2,00% | 8,00% | 18,00% | 0,20% | 0,80% | 1,80% |
| 20x | 8,00% | 32,00% | 72,00% | 0,40% | 1,60% | 3,60% |

Leitura: a 10x e sigma 4%, o ativo precisa render +0,8%/dia (mais de 1.000% a.a.) só para a conta log empatar. A 20x e sigma 6%, um dia de 1 desvio (6%) já passa dos 5% de distância de liquidação.

### 4.3 Tabela B: Kelly `L* = mu/sigma^2` (Sharpe anualizado na última coluna, s = 2% / 4% / 6%)
| mu por dia | L* s=2% | L* s=4% | L* s=6% | Sharpe anual |
|---|---|---|---|---|
| 0,02% | 0,50x | 0,12x | 0,06x | 0,19 / 0,10 / 0,06 |
| 0,05% | 1,25x | 0,31x | 0,14x | 0,48 / 0,24 / 0,16 |
| 0,10% | 2,50x | 0,62x | 0,28x | 0,96 / 0,48 / 0,32 |
| 0,25% | 6,25x | 1,56x | 0,69x | 2,39 / 1,19 / 0,80 |
| 0,50% | 12,50x | 3,12x | 1,39x | 4,78 / 2,39 / 1,59 |

Com edge real e L acima de `2*L*` o crescimento é negativo: mu = 0,10%/dia e sigma 4% dão L* = 0,62x e g = +0,03%/dia em L*, 0 em 1,25x, -0,12%/dia em 2x, -0,42%/dia em 3x e -1,5%/dia em 5x. Crescimento máximo `g* = S^2/2` por ano (Kelly pleno, sem custos, sem erro de estimação): Sharpe 1 dá x1,65/ano; Sharpe 2, x7,4; Sharpe 3, x90. Kelly pleno tem 50% de chance de, em algum momento, perder metade do capital; meio Kelly, 12,5% (com 75% do crescimento); um quarto, 0,8% (44%).

### 4.4 Tabela C: P(tocar liquidação) = `2*Phi(-(1/L)/(sigma*sqrt(T)))`, sem margem de manutenção
| L | 2%/1d | 2%/7d | 2%/30d | 4%/1d | 4%/7d | 4%/30d | 6%/1d | 6%/7d | 6%/30d |
|---|---|---|---|---|---|---|---|---|---|
| 1x | ~0 | ~0 | ~0 | ~0 | ~0 | ~0 | ~0 | ~0 | 0,2% |
| 2x | ~0 | ~0 | ~0 | ~0 | ~0 | 2,2% | ~0 | 0,2% | 12,8% |
| 3x | ~0 | ~0 | 0,2% | ~0 | 0,2% | 12,8% | ~0 | 3,6% | 31,0% |
| 5x | ~0 | 0,02% | 6,8% | ~0 | 5,9% | 36,1% | 0,09% | 20,8% | 54,3% |
| 10x | ~0 | 5,9% | 36,1% | 1,2% | 34,5% | 64,8% | 9,6% | 52,9% | 76,1% |
| 20x | 1,2% | 34,5% | 64,8% | 21,1% | 63,7% | 81,9% | 40,5% | 75,3% | 87,9% |

(~0 = menor que 0,01%.) Com margem de manutenção de 1,25% (nível BTC 40x da Hyperliquid [S15]) a 4% e 30 d: 3x sobe a 14,3%, 5x a 39,2%, 10x a 69,0%. Máx. L com P(toque) <= 5%: 1 d: 25,5x / 12,8x / 8,5x; 7 d: 9,6x / 4,8x / 3,2x; 30 d: 4,7x / 2,3x / 1,6x (s = 2% / 4% / 6%). Com P <= 1%: 7 d: 7,3x / 3,7x / 2,4x; 30 d: 3,5x / 1,8x / 1,2x.

### 4.5 Tabela D: sem edge, L constante, 30 dias (média = 1,00 em todas as células, antes de custos)
| L | mediana s=2% | s=4% | s=6% | P(perda) s=2% | s=4% | s=6% |
|---|---|---|---|---|---|---|
| 1x | 0,994 | 0,976 | 0,947 | 52,2% | 54,4% | 56,5% |
| 2x | 0,976 | 0,909 | 0,806 | 54,4% | 58,7% | 62,9% |
| 3x | 0,947 | 0,806 | 0,615 | 56,5% | 62,9% | 68,9% |
| 5x | 0,861 | 0,549 | 0,259 | 60,8% | 70,8% | 79,4% |
| 10x | 0,549 | 0,091 | 0,0045 | 70,8% | 86,3% | 95,0% |
| 20x | 0,091 | 0,00007 | ~0 | 86,3% | 98,6% | 99,9% |

Média igual a 1 com mediana despencando significa que a média é sustentada por resultados raros e enormes; com custos reais a média também cai abaixo de 1 (4.6).

### 4.6 Monte Carlo: perp long de notional fixo, sem edge, 30 dias
Parâmetros: passos horários, preço martingale, 40.000 caminhos, semente 20261010, margem de manutenção 1,25%, taxa taker de 0,05% na entrada e na saída, funding de 5,57% a.a. pago pelo long (média OKX do BTC); W = múltiplo da margem postada; liquidação zera W.

| L | P(liq) s=2% | s=4% | s=6% | média (s=4%) | mediana (s=4%) | p5 | p95 |
|---|---|---|---|---|---|---|---|
| 1x | 0,0% | 0,0% | 0,0% | 0,994 | 0,970 | 0,675 | 1,392 |
| 2x | 0,0% | 0,3% | 5,3% | 0,989 | 0,942 | 0,358 | 1,784 |
| 3x | 0,1% | 8,9% | 28,3% | 0,982 | 0,907 | 0,000 | 2,168 |
| 5x | 6,2% | 37,4% | 57,2% | 0,962 | 0,738 | 0,000 | 2,968 |
| 10x | 42,1% | 70,1% | 80,6% | 0,900 | 0,000 | 0,000 | 4,662 |
| 20x | 73,6% | 86,5% | 91,2% | 0,833 | 0,000 | 0,000 | 6,797 |

Com caudas t(3) horárias a 4%, as P(liq) mudam até 3 p.p. (3x 8,6%; 10x 67,2%); saltos e gaps reais ficam fora do modelo. Sem custos e sem margem, mediana e média ficam em 0,93 / 1,00 (3x) e 0,00 / 1,05 (10x): a média sobrevive por poucos caminhos ricos (o 1,05 inclui o piso de perda em zero e ruído de amostra).

### 4.7 Por que alavancagem não substitui edge validado
- Crescimento exponencial exige `g > 0` sustentado. `g(L)` é uma parábola com máximo `g* = S^2/2` em `L*` e valor negativo além de `2*L*`; sem edge (`mu = 0`) ela vale `-0.5*L^2*sigma^2 < 0` para todo L > 0, então alavancar só escolhe a velocidade com que o log do capital decai. Com edge, a alavancagem acelera até `L*` e destrói acima de `2*L*`; ela nunca cria o `mu`.
- Sem edge a média é, no máximo, 1; a mediana é menor que 1 e cai com `L^2`; custos derrubam a média (10x: 0,90). Alavancagem só multiplica um `mu` já líquido, medido e estável; ela escala também o arrasto, as taxas (cobradas sobre nocional) e o funding.
- Loteria: P(atingir 10x em 7 dias | sem edge), MC com 200 mil caminhos e margem de 1,25%: sigma 4%: alavancagem 10x, 0,00%; 20x, 0,04%; 50x, 3,98% (91% liquidados); sigma 6%: 20x, 1,19% (78,9% liquidados); 50x, 6,97% (92,1%). O teto teórico é 10%. Para x98,5 (US$68 a US$6.700) o teto é 1,01%: com 10.000 tentativas sem edge e regra de parar só em x98,5 ou zero, cerca de 100 chegam lá e cerca de 9.900 zeram.
- Mesmo com edge verdadeiro e Kelly pleno, o 10x semanal é raro (lognormal, sem custos, 7 dias; meio Kelly entre parênteses):

| Sharpe anual verdadeiro | mediana em 7 d | P(perder metade em 7 d) | P(10x em 7 d) |
|---|---|---|---|
| 1 | x1,010 | ~0% | ~0 |
| 2 | x1,039 | 0,4% | ~0 |
| 3 | x1,090 | 3,0% | 5e-8 |
| 5 | x1,271 | 8,9% | 0,15% (4e-10) |
| 10 | x2,609 | 11,6% | 16,6% (1,1%) |
| 15,5 | x10,01 | 8,1% | 50% (29,6%) |

- Estimação: com 30 dias e sigma 4%, `sd(L_hat)` = 4,6x e P(L_hat > 3x | sem edge) = 26%; com 90 dias, 2,6x e 13%; com 365 dias, 1,3x e 1,1%. Dias para detectar Sharpe anual com t = 2: Sharpe 0,5: 5.840 (16 anos); 1: 1.460 (4 anos); 2: 365; 3: 162; 5: 58. Logo, janelas de minutos (as do repo) não validam nada e 90 dias só detectam Sharpe de cerca de 4.
- Variância subestimada: o desvio-padrão da variação diária do basis (mark menos índice) do BTC na OKX é 0,0118% (400 d); com funding de 5,57% a.a., `mu/sigma^2` daria L* de cerca de 10.900x. É a armadilha do carry: a variância medida ignora eventos como 10/10/2025.

### 4.8 Loops e carry com custos
Queda do colateral que leva HF a 1 (`x = 1 - (L-1)/(L*LT)`; n/d = liquidável na abertura; `L_max = 1/(1-LT)` = 5x, 10x, 20x):

| L | LT=0,80 | LT=0,90 | LT=0,95 |
|---|---|---|---|
| 2x | 37,5% | 44,4% | 47,4% |
| 3x | 16,7% | 25,9% | 29,8% |
| 5x | 0,0% | 11,1% | 15,8% |
| 8x | n/d | 2,8% | 7,9% |
| 10x | n/d | 0,0% | 5,3% |
| 15x | n/d | n/d | 1,8% |

Carry líquido sobre o capital (eficiência 75% com perna perp 3x; taxas de ida e volta; manutenção por 30 / 90 / 180 dias; anualizado), comparado ao T-bill de 4,05% e ao CDI de 13,65%:

| Cenário | 30 d | 90 d | 180 d |
|---|---|---|---|
| BTC funding 5,57% a.a., taker/taker 0,30% | 1,44% | 3,27% | 3,72% |
| BTC funding 5,57% a.a., maker/maker 0,20% | 2,35% | 3,57% | 3,87% |
| ETH funding 4,24% a.a., taker/taker | 0,44% | 2,27% | 2,72% |
| BTC basis 4,44% a.a. (dez/2026), taker/taker | 0,59% | 2,42% | 2,87% |

Todos os cenários ficam abaixo do T-bill e muito abaixo do CDI, antes de basis, funding negativo, liquidação e rampa BRL. Em escala de R$400 (cerca de US$80), 5% a.a. rende cerca de US$4 por ano (R$20): um custo fixo de R$10 consome metade [R3].

Exposição por limite de perda diária (DLL), `f_max = DLL/(2*sigma)`: DLL 1%: 0,25 / 0,12 / 0,08; DLL 2%: 0,50 / 0,25 / 0,17 (s = 2% / 4% / 6%). Com f = 1 e DLL 2%, a parada dispara em 15,9% / 30,9% / 36,9% dos dias. Parada de drawdown de 10% em 30 d (tocar): f = 1: 36,1% / 64,8% / 76,1%; f = 0,25: 0,03% / 6,8% / 22,4%.

### 4.9 O que a evidência do repo diz
- Capturas paper (mock, não Jev real): 179,6 s: US$100 para US$99,9963 (-0,0037%); 44,8 s: -0,00678%; 44,4 s: +0,01992%, só da marcação dos 200 MON iniciais menos gas, com 0 fill; sessão Jev de cerca de 89 s: 3 decisões, 0 fills, +0,00266% (marcação). Sem lucro realizado nem fora da amostra [R2, R6, R9].
- Custos medidos: US$0,00088 por transação; 288.000 tx/dia = US$253,71/dia; a cada 100 blocos, US$2,54/dia; spread bruto hipotético de duas pernas US$0,0058 contra custo US$0,00177 [R2, R8].
- Escopo: spot financiado, sem empréstimo; MarginAccount da Kuru não é alavancagem; derivativos exigiriam outra integração e qualificação; o +900% é meta aritmética, não expectativa [R2, R3, R5, R6].
- Conclusão: o projeto ainda não tem edge para alavancar; a ordem correta é validar sem alavancagem e, só havendo edge, dimensionar com Kelly fracionado.

## 5. Viabilidade ranqueada (viabilidade de pesquisa e operação segura com a stack atual, não retorno esperado)
| # | Modalidade | Dados | Custo | Competição | Risco de cauda | Esforço | Read-only primeiro? |
|---|---|---|---|---|---|---|---|
| 1 | Yield (monitor e comparação) | alta: OKX público, DefiLlama, okx-defi do repo | baixo | nenhuma (não é jogo de edge) | nulo em leitura; médio se depositar | baixo | sim |
| 2 | Funding e basis | alta: funding e basis públicos (OKX, HL) | médio (0,20 a 0,30% ida e volta) | alta, mas capacidade grande | alto na execução (liquidação, ADL, depeg) | alto (conta/API, margem, hedge; elegibilidade BR NAO CONFIRMADO) | sim |
| 3 | Market making Kuru | alta: repo já captura | médio (gas US$253,71/dia por bloco) | alta (MMs, vaults, bots) | médio (inventário MON, unlock) | baixo (já construído) | sim (paper) |
| 4 | Arbitragem DEX X Layer/Monad | média: quotes OKX DEX (autenticado) e RPC público | médio a alto (contrato atômico, gas de falhas) | muito alta | médio a alto (contrato, MEV) | alto | sim (scanner) |
| 5 | CEX-DEX e cross-venue | média | alto (inventário duplo, taker 10 bps) | extrema (3 searchers = 75%) | alto (perna sem hedge, saques) | alto | sim (medir gaps) |
| 6 | Loops alavancados | média | médio (juros) | n/d | muito alto (liquidação, depeg, contágio) | médio a alto | parcial (simulação) |
| 7 | Sinais, smart money, memes | alta: scanners OKX read-only | médio a alto (slippage, taxas, rugs) | muito alta (snipers) | muito alto (rug, honeypot) | médio | sim |

## 6. Envelope de política recomendado (parâmetros de engenharia de risco, não recomendação personalizada)
Convenção: `sigma = max(sigma_30d, sigma_90d)` do ativo (hoje: BTC 1,96%, ETH 2,46%, SOL 3,25%, MON 6,67%).

| Parâmetro | Fase 0 (hoje: paper e read-only) | Fase 1 (micro-live spot, só com autorização financeira explícita) | Fase 2 (edge validado fora da amostra) | Base numérica |
|---|---|---|---|---|
| Alavancagem máxima | 0x (sem perp, sem empréstimo) | 1,0x | 2,0x e `<= 0.25 x` limite inferior de L* | 4.4: a 2x e sigma 6%, P(toque em 30 d) = 12,8%; a 3x, 31% |
| Capital exposto | zero | carteira operacional separada; perda total aceitável pelo dono (referência do repo: R$400 [R6]) | até 25% da carteira operacional por venue | sem edge, perda total é cenário plausível |
| Posição por ativo | n/a | `f <= min(25%, 2%/(2*sigma))`: BTC, ETH, SOL 25%; MON 15% | idem; nocional total `<= 2x` o capital | 4.8: `f_max = DLL/(2*sigma)`; repo: `MAX_CAPITAL_FRACTION = 0.25` [R12] |
| Ordem individual | n/a | `<= 10%` do capital operacional, somada às abertas e ao inventário dentro de `f`; com R$400 (cerca de US$80) o mínimo de 200 MON da Kuru (cerca de US$4,95) já é 6,2% | `<= 5%` | mínimo da venue [R8]; uma regra de 1% por ordem só é viável com capital maior |
| Parada diária | n/a | -2% do patrimônio do início do dia (UTC), sem novas ordens | idem | repo: `MAX_LOSS_USD = 2` por sessão (2% de US$100) [R12]; a f = 1, dispara em 31% dos dias (s = 4%) |
| Teto de custos por sessão | idem | 1% do capital (gas + inferência + taxas) | idem | repo: `MAX_SPEND_USD = 1` em US$100 [R12]; cotar todo bloco custa US$253,71/dia [R2] |
| Parada semanal | n/a | -5% | -5% | 2,5 x a diária |
| Drawdown (pico a vale) | n/a | -10%: encerra e exige reativação manual | -10% | f = 0,25, s = 4%: 6,8% de toque em 30 d; f = 1: 64,8% |
| Piso de distância de liquidação | n/a | n/a | `>= max(35%, 2.5*sigma*raiz(7))` (MON: 44%) até o preço de liquidação informado pela venue e `>= 3x` a pior queda diária de 365 d; abaixo disso, só reduzir | `2*Phi(-2.5)` = 1,2% em 7 d; 35% implica L menor que 2,9x |
| Cooldowns | n/a | 15 min após stop por operação; 24 h após parada diária; 72 h após semanal; manual após drawdown ou margem < 150% | idem | evita reentrada reativa depois de perdas |
| Ritmo e Jev | filtro econômico P1 antes de qualquer inferência [R1] | idem; gas limit por tx limitado e custo registrado [R3]; sem decisão por contagem fixa de blocos; sem Jev disponível, hold | idem | custo fixo por tx domina |
| Kill switches | dado velho, divergência de reconciliação, gas > 2x a mediana, desvio de oráculo, incidente da venue, falha de assinatura | idem | idem | [R5] |
| Reinvestimento | só ganho líquido realizado e conciliado | idem | idem | [R5] |

Critérios para promover de fase (todos): autorização financeira explícita e signer separado [R4]; janelas congeladas fora da amostra com custos conservadores contra caixa, manter inventário e maker simples [R2]; limite inferior do retorno líquido diário acima de zero com t >= 2 (Sharpe 2 exige cerca de 365 dias; Sharpe 4, cerca de 90); fills reais conciliados. A Fase 1 testa operação (assinatura, reconciliação, saída), não prova lucro. Posições alavancadas só na Fase 2 e só com edge medido no mesmo instrumento. Resultados não são previsão.

## 7. Lacunas e NAO CONFIRMADO
- Elegibilidade e produtos OKX para residentes no Brasil (perps, On-chain Earn, taxas Lv1 reais) e disponibilidade da Hyperliquid para residentes; custos reais da rampa BRL/Pix/USDC-Monad [R3].
- Retorno real de market making na Kuru (sem fills reais); causa da queda de volume; share do MON-USDC no volume total; estabilidade das taxas 0/0 (a documentação indica taxa fixa por mercado, não verificada).
- Calendário de desbloqueio do MON; estrutura e risco de pools de APY alto na Monad (Accountable); rota e custo Monad a X Layer; ordenação do sequenciador da X Layer.
- Textos integrais das Resoluções BCB 519 a 521, IOF sobre stablecoins e tributação de trading frequente, derivativos e DeFi.
- Stream/Elixir e Balancer vêm de fontes secundárias; Solidus é fornecedor de detecção; CoinGecko mede só PnL realizado; o preprint de copy trading não foi replicado; hedges de MMs quebrados por ADL em 10/10/2025 são relato não aberto.

## 8. Fontes (todas acessadas em 2026-10-10)
Repositório (caminhos locais): R1 docs/PROFIT-SPEC.md; R2 docs/RISCO-E-BACKTEST.md; R3 docs/FUNDING-RESEARCH.md; R4 docs/GOAL-INONU-TRADER.md; R5 docs/OPPORTUNITY-ARCHITECTURE.md; R6 docs/OKX-INVESTIGACAO.md; R7 docs/OKX-EARN-RESEARCH.md; R8 docs/evidence/doctor-final-20261009.json; R9 docs/evidence/economic-gate-backtest-20261009.json e demais evidências do mesmo dia; R10 docs/okx-ecosystem/GUIA.md, docs/okx-alpha-radar-v1/RESEARCH.md, docs/okx-exit-security-v1/RESEARCH.md, docs/okx-defi-v1/RESEARCH.md; R11 docs/PUBLIC-MARKET-CAPTURE.md; R12 src/config.ts e src/trader.ts (limites padrão MAX_LOSS_USD, MAX_SPEND_USD, MAX_CAPITAL_FRACTION, lidos sem executar); R13 docs/okx-market-v1/OKX-ECOSYSTEM-15-WORKSTREAMS-20261009.md.

- S1 https://docs.monad.xyz/developer-essentials/summary ; S2 https://docs.monad.xyz/monad-arch/consensus/asynchronous-execution ; S3 https://www.fastlane.xyz/blog/fastlane-mev-protocol
- S4 https://docs.kuru.io/contracts/OrderBook ; https://docs.kuru.io/concepts/liquidity ; https://docs.kuru.io/liquidity/risks-impermanent-loss ; https://docs.kuru.io/contracts/Audits ; https://docs.kuru.io/kuru-flow/flow-overview
- S5 https://l2beat.com/scaling/projects/xlayer ; S6 https://optimism.io/blog/okx-migrates-xlayer-to-the-op-stack ; S7 https://www.theblock.co/post/380094/monad-mainnet-launches
- S8 https://api.llama.fi (v2/chains, overview/dexs/Monad, overview/dexs/X%20Layer, overview/fees, summary/dexs/kuru-clob, protocols) ; S9 https://yields.llama.fi (pools, lendBorrow, chart/{id}) e https://stablecoins.llama.fi/stablecoin/146
- S10 https://www.okx.com/api/v5 (public/funding-rate-history, public/instruments, public/open-interest, market/ticker, market/history-candles, market/history-index-candles, market/history-mark-price-candles, finance/savings/lending-rate-summary)
- S11 https://api.hyperliquid.xyz/info (fundingHistory, vaultDetails) ; S12 https://fred.stlouisfed.org/series/DTB3 ; S13 https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json (e séries 4189 e 1)
- S14 https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding ; S15 https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations ; S16 https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees
- S17 https://www.okx.com/en-us/help/perps-funding-fee-mechanism ; S18 https://www.okx.com/en-us/help/forced-liquidation-faq ; S19 https://www.okx.com/en-us/help/trading-fee-rules-faq ; S20 https://www.okx.com/en-us/learn/okx-powers-digital-dollar-accounts
- S21 https://raw.githubusercontent.com/aave-dao/aave-v3-origin/main/src/contracts/protocol/libraries/logic/LiquidationLogic.sol
- S22 https://www.bis.org/publ/work1087.htm ; S23 https://arxiv.org/abs/2507.13023 ; S24 https://arxiv.org/abs/2401.01622 ; S25 https://arxiv.org/abs/2406.02172
- S26 https://drops.dagstuhl.de/storage/00lipics/lipics-vol354-aft2025/html/LIPIcs.AFT.2025.28/LIPIcs.AFT.2025.28.html ; https://arxiv.org/abs/2506.01462 ; S27 https://dspace.mit.edu/handle/1721.1/130495
- S28 https://arxiv.org/abs/2111.09192 ; S29 https://arxiv.org/abs/2208.06046 ; S30 https://arxiv.org/abs/2512.01112 ; S31 https://econ.umd.edu/publication/high-frequency-trading-arms-race-frequent-batch-auctions-market-design-response-0
- S32 https://sites.oxy.edu/lengyel/M330/thorp/paper.htm ; S33 https://math.nyu.edu/%7Eavellane/SIAMLETFS.pdf.pdf ; S34 https://en.wikipedia.org/wiki/Reflection_principle_(Wiener_process) ; S35 https://en.wikipedia.org/wiki/Doob%27s_martingale_inequality
- S36 https://arxiv.org/abs/2201.07220 ; S37 https://arxiv.org/abs/2601.08641 ; S38 https://www.galaxy.com/insights/research/cryptos-flash-crash-liquidation-binance-adl-auto-deleveraging
- S39 https://forklog.com/en/collateral-damage-from-stream-finance-hack-estimated-at-285-million/ ; S40 https://blog.verichains.io/p/balancer-exploit-small-rounding-errors ; S41 https://www.theblock.co/post/348314/hyperliquid-delists-jellyjelly-memecoin-amid-whale-manipulation-fiasco
- S42 https://fortune.com/2022/06/29/crypto-winter-crash-nansen-three-arrows-capital-celsius-ether-staked-depeg ; S43 https://www.soliduslabs.com/reports/solana-rug-pulls-pump-dumps-crypto-compliance ; S44 https://www.coingecko.com/research/publications/pump-fun-traders-are-making-a-comeback
- S45 https://www.theblock.co/post/342266/traders-of-solana-based-libra-memecoin-lost-251-million-nansen ; S46 https://www.sec.gov/Archives/edgar/data/0001592386/000104746914002070/a2218589zs-1.htm
- S47 https://www.bcb.gov.br/en/pressdetail/2639/nota ; S48 https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/l14478.htm ; S49 https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/decreto/d11563.htm
- S50 https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/criptoativos/decripto ; S51 https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/stablecoins-ja-respondem-por-cerca-de-80-do-volume-declarado-de-criptoativos-no-brasil ; S52 https://www.mattosfilho.com.br/unico/decripto-receita-federal-ocde/
- S53 https://www.gov.br/cvm/pt-br/assuntos/noticias/2020/cvm-alerta-sobre-realizacao-de-ofertas-irregulares-d5f0e7dc8b8a4a3b851638dbbe031d60 ; S54 https://www.coindesk.com/policy/2024/08/14/binance-to-pay-17m-to-brazilian-securities-commission-to-end-probe-into-unauthorized-derivatives-offering
