# Avaliador offline de derivativos perpétuos OKX V1

Estado: SPEC escrita antes do código e dos testes (SDD e TDD) e atualizada ao final com o que foi implementado e verificado. Objetivo autorizado em `GOAL-INONU-TRADER.md`: comparar modalidades por retorno líquido conservador, custos, margem e risco de liquidação. Esta entrega é um avaliador **somente leitura, offline e determinístico** de duas modalidades de perpétuos OKX (SWAP linear): carry de funding (comprado no spot, vendido no perpétuo) e perpétuo direcional alavancado, este último **somente como risco**.

Os critérios D1 a D17 deste documento são independentes dos D1 a D8 de `okx-defi-v1/SPEC.md`. Guia de uso: `okx-derivatives-v1/GUIA.md`.

## 1. Fronteira e garantias

O módulo nunca coloca ordens, assina, guarda chaves, chama API autenticada nem faz chamadas de rede em tempo de execução. Recebe um snapshot normalizado (fixture embutida sintética ou arquivo JSON local) e produz um relatório. Nada aqui concede autorização financeira. Um veredito `eligible` significa apenas "passa este filtro aritmético sob as entradas informadas"; o relatório sempre traz `liveQualified: false`, `financiallyAuthorized: false` e `execution: "not_qualified"`.

Alavancagem não cria vantagem econômica. O lucro em cotação de uma operação é o mesmo em qualquer alavancagem; ela só reduz o capital comprometido (aumentando o retorno percentual sobre o capital) e aproxima o preço de liquidação. O relatório mostra os dois efeitos lado a lado para o mesmo trade.

Fixtures são sintéticas. Provam aritmética e fluxo de decisão, não rentabilidade, não existência de oportunidade e não acesso à OKX. Nenhum retorno é garantido, esperado ou prometido; cenários são hipóteses, e `recent_average` não é previsão.

## 2. Fontes primárias consultadas

Acesso em 2026-10-10 por leitura de documentação pública da OKX (ferramenta de leitura de páginas; nenhuma chamada a endpoints de dados). A página principal da API (`docs-v5/en`) é convertida pela ferramenta até cerca de 410 mil caracteres e **trunca antes da seção Public Data**; por isso as descrições campo a campo de `funding-rate`, `funding-rate-history`, `mark-price`, `position-tiers` e `market/books` **não foram lidas diretamente**. O que foi e o que não foi confirmado:

| Id | Página | O que foi confirmado | O que NÃO foi confirmado |
| --- | --- | --- | --- |
| S1 | [API v5, Trading Account, Get instruments](https://www.okx.com/docs-v5/en/) (`GET /api/v5/account/instruments`) | Campos `instType`, `instId`, `uly`, `instFamily`, `settleCcy`, `ctVal` (Contract value), `ctMult` (Contract multiplier), `ctValCcy` (Contract value currency), `ctType` (`linear`/`inverse`), `lever` (Max Leverage), `tickSz`, `lotSz` e `minSz` ("if it is a derivatives contract, the value is the number of contracts"), `state`. | Texto da variante pública `GET /api/v5/public/instruments` (a existência e os nomes dos campos públicos aparecem no changelog S3). |
| S2 | [API tricks](https://www.okx.com/docs-v5/trick_en/) | "Users can get the exchange instruments configuration from GET /api/v5/public/instruments." Alavancagem é definida por escopo, não há alavancagem global. | Definição de `mmr`/`imr` e fórmula de liquidação (a página não os define). |
| S3 | [Changelog da API](https://www.okx.com/docs-v5/log_en/) | Existem `/api/v5/public/funding-rate` (campos `method` com `current_period`/`next_period`, `formulaType` `noRate`/`withRate`, `interestRate`, `impactValue`, `premium`, `minFundingRate`, `maxFundingRate`, `settState`, `settFundingRate`, `ts`), `/api/v5/public/funding-rate-history` (limite máximo e padrão 400), `/api/v5/public/mark-price`, `/api/v5/public/position-tiers`, `/api/v5/market/books` e `books-full`. Orientação: "focus on the difference between fundingTime and nextFundingTime fields" para obter o intervalo. O livro atual não inclui liquidez ELP (2025-11-26) e, na pré-abertura, o melhor ask pode ser menor que o melhor bid (2025-05-29). | Unidade numérica de `fundingRate`, diferença entre `fundingRate` e `realizedRate`, layout dos níveis do livro e unidade de `sz` do livro de derivativos, campos de `position-tiers`. |
| S4 | [API v5, Get fee rates](https://www.okx.com/docs-v5/en/#trading-account-rest-api-get-fee-rates) (`GET /api/v5/account/trade-fee`) | Convenção de sinal: "positive number, which means the rate of rebate; negative number, which means the rate of commission". A API retorna taxas por conta e nível. | Qualquer taxa numérica da conta do operador. |
| S5 | [Help Center, funding de perpétuos](https://www.okx.com/en-us/help/perps-funding-fee-mechanism) | `Funding fee = Position value x Funding rate`. Valor da posição de contratos margeados em USDT/USDC = contratos x tamanho do contrato x multiplicador x **mark price** (margeados em cripto: dividido pelo mark). Taxa positiva: posições longas pagam as curtas; negativa: curtas pagam as longas; a plataforma não cobra taxa sobre o funding. Liquidação a cada 8 h (00:00, 08:00, 16:00 UTC) por padrão, ou a cada 1, 2 ou 4 h; é preciso ter posição aberta no momento da cobrança. Em margem isolada o funding é deduzido da margem isolada da posição. Horário e teto/piso podem ser ajustados em tempo real e a frequência escala quando a taxa atinge teto/piso. Exemplos escrevem a taxa como percentual (0,1%) e normalizam por período. | Valores numéricos de teto e piso. |
| S6 | [Help Center, cálculo do funding](https://www.okx.com/help/okx-to-optimize-funding-rate-calculation) | `Funding rate = Clamp[Average premium index, Funding cap, Funding floor]`, `Interest rate = 0`, premium index = ((melhor bid + melhor ask)/2 menos índice)/índice; média móvel calculada por minuto; desde 2024-03-05 usa as últimas N horas (N = horas entre liquidações). "The API's fundingRate and nextFundingRate fields will follow the new rules." | Valores de teto e piso. |
| S7 | [Help Center, liquidação forçada](https://www.okx.com/en-us/help/forced-liquidation-faq) | Gatilho: maintenance margin ratio (indicador) menor ou igual a 100%. A liquidação "only looks at the mark price". Liquidação parcial em degraus e depois total ao mark; taxa de liquidação ao nível taker e "liquidation clearance fee" igual à margem de manutenção no gatilho, ambas para o fundo de segurança. Preço estimado de liquidação em margem isolada USDT: vendido = (saldo de margem + valor de face x \|contratos\| x preço médio de abertura) / (valor de face x \|contratos\| x (mmr% do degrau + taxa + 1)); comprado = (saldo de margem menos o mesmo produto) / (... x (mmr% + taxa menos 1)). "The position tier maintenance margin rate is tiered according to position size." "Can't be used as the sole basis for judging risk." "Even 1x leverage can be liquidated under extreme market conditions." | Definição de "saldo de margem", valores de mmr, comportamento em margem cruzada ou multimoeda. |
| S8 | [Help Center, regras de taxas](https://www.okx.com/en-us/help/trading-fee-rules-faq) | Perpétuo margeado em USDT/USDC: taxa x (contratos x multiplicador x tamanho do contrato x preço de execução), por execução, igual para abrir e fechar, com rebate de maker possível (taxa negativa). Spot: a taxa de compra é cobrada no ativo comprado ("will receive 0.999 BTC after fee deducted"). Liquidação cobra a taxa taker. Níveis Regular e VIP. | **As taxas numéricas não estão na página** (ficam em okx.com/en-us/fees e na conta). |
| S9 | [Help Center, aviso de degraus de manutenção](https://www.okx.com/en-us/help/adjustment-of-usdt-margined-futures-perpetual-swap-tiered-maintenance-margin-ratio-schedule) | Degraus são definidos por número de contratos; degrau maior tem mmr maior e alavancagem máxima menor (1 / razão de margem inicial do degrau); o aviso remete à tabela viva. | Os valores do aviso são de 2020 e **não** são vigentes; nenhum foi usado. |

Pesquisas web adicionais por texto da API pública não retornaram a página oficial; cópias de terceiros (SDKs, agregadores) foram vistas e **não** foram usadas como fonte. A página `docs-v5/agent_en` (guia do Agent Trade Kit) foi consultada e não traz campos. Também constam pesquisas anteriores do repositório em `wallet-opportunity-research.md` (S10 a S14 daquele arquivo, hashes de 2026-10-09).

Consequência: tudo o que depende de texto não confirmado é entrada explícita, com valor desconhecido por padrão (seção 4), ou é mantido como suposição declarada (seção 6.2).

## 3. Unidades, sinais e arredondamento

- **Dinheiro** em unidades inteiras `bigint` de 1e-6 da moeda de cotação (micro), sempre derivado de racionais exatos (`bigint` numerador e denominador). Nenhum ponto flutuante binário em caminho de dinheiro. No JSON, dinheiro é string decimal com exatamente 6 casas (`"62.210000"`), campos terminam em `Quote`.
- **Razões** em ppm inteiro (1e-6): taxas, mmr, taxa de funding de cenário, retorno, distância, choque, slippage, basis. Campos terminam em `Ppm`.
- **Preços e tamanhos** são decimais exatos (texto no JSON, no máximo 18 casas, sem expoente, sem sinal `+`, sem espaços, sem zeros à esquerda). Preços reportados têm no máximo 10 casas, arredondadas contra o trader.
- **Taxas de negociação** neste módulo são **custo** (positivo = paga; negativo = rebate). A API da OKX usa o sinal oposto (S4). `feeCostPpmFromOkxApiRate("-0.0005")` devolve `500`; colar valores da API sem converter o sinal inverte o efeito. Taxa de taker negativa é rejeitada na validação.
- **Funding**: taxa assinada por período de liquidação; positiva significa que quem está comprado paga a quem está vendido (S5). Fluxo recebido por uma posição vendida = `+taxa`; por uma comprada = `-taxa`.
- **Regra de arredondamento: sempre contra o trader, uma única vez por grandeza reportada.**

| Grandeza | Regra |
| --- | --- |
| Custos (execução, taxas, custo de basis), capital comprometido, margem inicial, valor de compra, perda além da margem, drawdown em ppm, ponto de equilíbrio, slippage em ppm | arredonda para cima (ceil) |
| Fluxo de funding assinado, PnL, retorno em ppm, margem restante, valor de venda, basis de entrada | arredonda para baixo (floor, rumo a menos infinito, inclusive para negativos) |
| Preço de liquidação | vendido: floor (mais perto do preço de entrada); comprado: ceil |
| Distância de liquidação em ppm | floor |
| Taxa de negociação e mmr convertidas de decimal para ppm | ceil |
| Taxa de funding de cenário convertida para ppm | posição vendida: floor; comprada: ceil |

## 4. Desconhecidos explícitos

Entradas de fato que não podem ser confirmadas por fonte primária são campos opcionais cujo padrão é **DESCONHECIDO** (`null` ou ausente). Desconhecido nunca vira zero: o valor derivado é `null` e o veredito é `unavailable` com a razão correspondente.

- Taxas de negociação por mercado e papel: `fees.spot.makerCost`, `fees.spot.takerCost`, `fees.perp.makerCost`, `fees.perp.takerCost` (S8).
- Taxa de manutenção do degrau aplicável: `maintenanceMarginRate` (S7, S9). Não há tabela de degraus; o operador informa a taxa do degrau da posição.
- Acesso a derivativos (região, KYC, modo de conta): `access.derivatives` com `unknown` (padrão), `operator_confirmed` ou `operator_denied`.
- Fórmula exata de liquidação da OKX: **não é reproduzida**; usa-se o modelo simplificado da seção 6.9.
- Leitura direta dos endpoints públicos (seção 2): o formato do snapshot é uma normalização do operador, não a resposta bruta da OKX. A unidade de `fundingRate` (aqui, fração decimal por período) e o formato dos níveis do livro (aqui, `[preço, tamanho]` com tamanho do perpétuo em contratos) são **suposições de formato**, não confirmadas.

Parâmetros de política (limite de alavancagem, piso de distância, buffer, idade máxima, choques, basis adverso) **não** são fatos: têm padrões configuráveis, não calibrados, definidos na seção 7.

## 5. Arquitetura e arquivos

Segue `OPPORTUNITY-ARCHITECTURE.md`. Tudo está em `src/okx-derivatives/`, cada arquivo com `.test.ts` ao lado.

| Papel | Arquivo | Contrato |
| --- | --- | --- |
| VenueAdapter (somente leitura) | `adapter.ts`, `fixture.ts` | `DerivativesVenueAdapter` expõe `venue`, `adapterKind: "offline_fixture"`, `apiVersion`, `capabilities` (`read: true`; `authenticated`, `demo`, `live`, `signer`, `network` sempre `false`; `blockers`), `sourceClaim`, `mode` e os métodos síncronos `snapshot()`, `evaluation()` e `inputSha256()`, sem E/S. Nenhum método de ordem, assinatura ou rede existe. O objeto é congelado. |
| OpportunityEngine | `carry.ts`, `directional.ts`, `legs.ts`, `freshness.ts` | Funções puras: snapshot, pedido e relógio explícito produzem custos, cenários, tabela de alavancagem e razões. |
| RiskGate | `gate.ts` | Função pura: razões de um vocabulário fechado produzem `eligible`, `ineligible` ou `unavailable` (seção 8). Código de razão desconhecido lança erro. |
| Relatório | `report.ts` | Monta o JSON final (strings decimais para dinheiro, inteiros para ppm). |
| Aritmética | `decimal.ts`, `contract.ts`, `book.ts`, `fees.ts`, `funding.ts`, `margin.ts` | Racionais exatos, contratos e lotes, profundidade, taxas, funding, liquidação e choques. |
| Entrada | `snapshot.ts`, `canonical.ts`, `local-file.ts`, `types.ts` | Validação estrita, JSON canônico e hash, leitura de arquivo local, tipos e vocabulário de razões. |

CLI: `scripts/okx-derivatives.ts`, que importa somente os arquivos acima.

## 6. Modelo e fórmulas

### 6.1 Notação

`n` contratos; `cv = ctVal x ctMult` moedas por contrato; `q = n x cv` moedas (linear, `ctValCcy` igual à moeda base do spot). Preços em cotação por moeda. `S0`, `P0` pontos médios dos livros spot e perpétuo; `M` mark price. `fs`, `fp` taxas de negociação em ppm (papel `maker` ou `taker` explícito por perna). `N` liquidações mantidas; `V = q x M`. `L` alavancagem inteira. `m` mmr em ppm.

### 6.2 Suposições declaradas

1. SWAP linear apenas; contrato inverso resulta em `instrument:inverse_unsupported`. Moeda de cotação do spot igual à moeda de liquidação do perpétuo (sem conversão entre estáveis).
2. Tamanhos do livro de derivativos estão em contratos; os do spot, em moeda base (suposição do formato do snapshot, não confirmada, ver S3).
3. Margem isolada. A taxa de abertura e o funding pago **não** são deduzidos da margem isolada no cálculo de liquidação (isso aproxima a liquidação do preço de entrada na vida real e não é modelado).
4. O livro na saída é igual ao livro atual (mesma profundidade, lado oposto); o preço médio fica constante (preço plano), exceto pelo cenário de basis.
5. A taxa de funding de cada liquidação é a do cenário; o valor da posição usa o mark do snapshot constante. O intervalo e o horário não mudam durante a retenção.
6. Taxa de compra no spot é cobrada em ativo pela OKX (S8); o modelo a trata como custo em cotação no preço de execução e **não** modela a pequena diferença de hedge (cerca da própria taxa em moedas).
7. Ordens `maker` são executadas no ponto médio, sem crédito de spread, e a execução não é garantida; ordens `taker` percorrem o livro.

### 6.3 Contrato e tamanho (F1)

`q = n x ctVal x ctMult`; valor = `q x preço`. `n` deve ser múltiplo de `perp.lotSz` e pelo menos `perp.minSz`; `q` deve ser múltiplo de `spot.lotSz` e pelo menos `spot.minSz`. Preços dos livros devem ser múltiplos de `tickSz` do instrumento (validação de entrada).

### 6.4 Profundidade (F2) e execução (F3, F4)

Percorre os níveis do lado consumido (asks para comprar, bids para vender), do melhor ao pior, retirando `min(restante, tamanho)` de cada. `custo = soma(preço_i x retirado_i)`, `preço médio = custo / tamanho`, pior preço = último nível usado. Profundidade total menor que o tamanho resulta em `depth:<perna>` (indisponível); nunca se completa com preço extrapolado. Lado vazio de um livro não tem ponto médio e conta como profundidade insuficiente das pernas daquele mercado; livro cruzado ou travado (melhor bid maior ou igual ao melhor ask) resulta em `book:crossed_<mercado>`.

Perna `taker`: preço efetivo = preço médio da caminhada. Perna `maker`: preço efetivo = ponto médio (sem crédito de spread). Custo de execução frente ao meio, nunca negativo: compra spot `q x (efetivo - S0)`; venda spot `q x (S0 - efetivo)`; venda perp `q x (P0 - efetivo)`; compra perp `q x (efetivo - P0)`. Slippage frente ao melhor preço do lado: `|médio - melhor| / melhor` em ppm.

### 6.5 Taxas (F5)

`taxa_perna = taxa_ppm x valor_efetivo_da_perna / 1e6`, nas quatro pernas (abertura e fechamento de spot e de perpétuo), com o papel de cada perna explícito. Valor da perna de fechamento do perpétuo = `q x (efetivo + max(0, delta))`, sendo `delta` o deslocamento de basis do cenário. Taxa desconhecida para um papel usado torna o resultado indisponível; nunca se usa zero. A taxa taker do perpétuo é sempre necessária, pois a liquidação a cobra.

### 6.6 Funding (F6, F7)

`intervalo = (nextFundingTime - fundingTime) / 1 hora`, aceito somente em {1, 2, 4, 8}. As `N` liquidações ocorrem em `fundingTime + k x intervalo`, `k = 0..N-1` (o horizonte de retenção é expresso em liquidações mantidas); a próxima liquidação precisa estar no futuro do relógio.

Taxa de cenário (fração exata, depois convertida a ppm contra o trader, vendido floor): `recent_average` = média aritmética de todas as entradas do histórico informado (a janela "recente" é a que o operador fornece, sem filtro adicional); `worst_observed` = mínimo do histórico (para posição vendida; máximo para comprada); `zero` = 0. Fluxo = `floor(N x V x taxa_ppm / 1e6)` para vendido (recebe a taxa) e com o sinal oposto para comprado. Histórico com menos de `minFundingObservations` entradas, ou intervalo inválido, deixa só o cenário `zero` calculável.

### 6.7 Basis e convergência (F8)

`basisEntradaPpm = floor((P0 - S0) / S0 x 1e6)`. Cenários de deslocamento do preço médio do perpétuo na saída, por moeda: `flat` (delta = 0), `converge` (delta = `S0 - P0`, o perpétuo converge ao spot), `adverse` (delta = `adverseBasisPpm x S0 / 1e6`, o prêmio alarga contra o vendido). Custo de basis = `ceil(q x delta)`. **Converge não é conservador** e não decide o veredito; o cenário conservador é `worst_observed` com `adverse`.

### 6.8 Resultado líquido, capital e retorno (F9, F10)

`liquido = fluxo_funding - custo_execução - custo_basis - taxas`, soma de componentes já arredondados contra o trader (a conta fecha em inteiros). Nove cenários = 3 de funding x 3 de basis. Para cada alavancagem `L`:

- `margemInicial = ceil(valor_de_venda_perp / L)`;
- `capital = ceil(compra_spot) + ceil(taxa_abertura_spot) + margemInicial + ceil(taxa_abertura_perp)`;
- `retornoPpm = floor(liquido x 1e6 / capital)`;
- `liquidoSobreNocionalPpm = floor(liquido_conservador x 1e6 / ceil(valor_de_venda_perp))`, **independente de L** (é a métrica do portão).

### 6.9 Liquidação simplificada (F11)

Modelo de margem isolada, **aproximação** (não é a fórmula exata da OKX). Com `E` preço médio de entrada do perpétuo, `m` a taxa de manutenção do degrau, `f` a taxa taker do perpétuo (a liquidação cobra taker, S7) e margem inicial `E x q / L`:

- vendido: `P_liq = E x (1 + 1/L) / (1 + m + f)`; distância `d = (1 + 1/L) / (1 + m + f) - 1`;
- comprado: `P_liq = E x (1 - 1/L) / (1 - m - f)`; distância `d = 1 - (1 - 1/L) / (1 - m - f)`.

Para a posição vendida essa fórmula coincide algebricamente com o preço estimado publicado em S7 quando o saldo de margem é a margem inicial; a própria OKX avisa que esse preço não deve ser a única base de risco e muda em tempo real com margem, posições e funding. Efeitos que aproximariam a liquidação e **não** são modelados: dedução de taxa e funding da margem isolada, mudança de degrau com o valor da posição, divergência entre mark e último preço, outros modos de conta. **Leia a distância como estimativa otimista** (o limite real pode estar mais perto); o piso de política (padrão 25%) existe para dar folga.

Monotonia: com `m` e `f` fixos, `d` diminui estritamente quando `L` aumenta. Em `L = 1` comprado, `P_liq = 0` e a distância é 100% (o modelo não liquida por preço; a OKX alerta que 1x também pode liquidar em condições extremas).

### 6.10 Estresse do carry (F12)

Movimentos adversos para o vendido (alta) de `s` ppm contra o preço de entrada, mais um salto (`gap`). Liquidado se e somente se `s >= d` (comparação exata). Perda do perpétuo sem teto = `valor_entrada x s`. Se não liquidado: margem restante = `margemInicial - perda`; se liquidado: margem restante = 0 e a perna do perpétuo perde toda a margem inicial. Em linhas `gap` liquidadas, `perdaAlemDaMargem = max(0, perda_sem_teto - margemInicial)` (cobertura pelo fundo de segurança, não pelo trader em margem isolada, e sem garantia).

PnL do spot = `floor(compra_spot x s)`. **Enquanto o hedge está intacto os dois lados se compensam; após a liquidação o spot fica sem hedge (`hedgeBroken`) e o ganho não realizado do spot não é creditado** (só perda seria creditada). PnL creditado após custos = creditado menos custos de execução e taxas planos menos arrasto de funding (`max(0, -fluxo_worst_observed)`). `drawdownPpm` por linha = `ceil(max(0, -pnl_pós_custos) x 1e6 / capital)`; o máximo sobre o conjunto de choques é o `maxDrawdownPpm`. Como a margem postada cai com `L`, a perda dada a liquidação diminui com `L` enquanto a probabilidade aumenta: **por isso o relatório sempre mostra a distância, os choques liquidados (`shocksLiquidated`) e o hedge quebrado ao lado do drawdown**; o drawdown sozinho não é monotônico em `L`.

### 6.11 Ponto de equilíbrio (F13)

Com basis `flat`, `N* = ceil(custos_planos / (V x taxa_ppm / 1e6))` para taxa positiva (custos planos = execução mais as quatro taxas, em micro); taxa não positiva resulta em `null`. Horas = `N* x intervalo`. Reportado para `recent_average`, `worst_observed` e `zero` (este último sempre `null`).

### 6.12 Perpétuo direcional, somente risco (F14)

Lado `long` ou `short`, `n` contratos, mesma tabela de alavancagem e liquidação (6.9). Abre-se comprando (asks) e fecha-se vendendo (bids) para `long`; o inverso para `short`. Tabela de choques de **caminho de preço**: movimento adverso (queda para `long`, alta para `short`) e salto, com liquidação, margem restante, perda (limitada à margem inicial quando liquidado), perda além da margem em saltos e **percentual da margem perdido** (`lossOfMarginPpm`, ceil). Custos a preço constante, separados da tabela: execução e taxas de abertura e fechamento mais **arrasto de funding** (apenas o que é pago: `max(0, -fluxo)`; crédito recebido não é contado) para `recent_average`, `worst_observed` (o pior para o lado) e `zero`. O relatório **não contém lucro, retorno, PnL esperado nem ganho** para este ramo. O veredito nunca é `eligible`: `model:directional_no_modeled_edge` está sempre presente. `riskLimitsMet` diz se alavancagem e distância respeitam teto, máximo do instrumento e piso.

### 6.13 Veredito (F15)

Detalhado na seção 8.

## 7. Política e padrões (configuráveis, não calibrados)

| Parâmetro | Padrão | Observação |
| --- | --- | --- |
| `maxLeverage` | 3 | acima disso: `limit:leverage_above_cap` |
| `minLiquidationDistancePpm` | 250000 (25%) | abaixo: `limit:liquidation_distance_below_floor` |
| `minNetOnNotionalPpm` (buffer) | 1000 (0,1% do valor da perna do perpétuo) | líquido conservador menor ou igual: `limit:net_conservative_return_not_above_buffer` |
| `maxSnapshotAgeMs` | 60000 | acima: `stale:*` |
| `maxBookSkewMs` | 5000 | diferença entre os horários dos livros: `skew:books` |
| `minFundingObservations` | 3 | menos: `funding:insufficient_history` |
| `adverseBasisPpm` | 2000 (0,2%) | alargamento do prêmio na saída, hipótese de pesquisa |
| `stressMovesPpm` | [100000, 250000] | movimentos de 10% e 25% |
| `stressGapPpm` | 500000 | salto de 50%, maior que todos os movimentos |
| papéis (`roles`) | `taker` em todas as pernas | `maker` exige taxa maker conhecida |

Limites de entrada: alavancagem inteira de 1 a 125 (até 12 valores, estritamente crescentes), 1 a 1000 liquidações, até 400 níveis por lado de livro, até 1000 entradas de histórico, taxa de funding com valor absoluto de até 1% por período, taxa de negociação com valor absoluto de até 1%, mmr de 0 (exclusive) a 50%.

## 8. Veredito, razões e precedência

`status`: `ineligible` se houver qualquer razão da classe **limite/modelo/acesso** (fato definitivo); senão `unavailable` se houver razão da classe **indisponível**; senão `eligible`. A lista de razões é única, ordenada e determinística, e contém todas as razões (não só a que decide).

| Código | Classe | Quando |
| --- | --- | --- |
| `limit:leverage_above_cap` | inelegível | `L` maior que `maxLeverage` |
| `limit:leverage_above_instrument_max` | inelegível | `L` maior que `perp.maxLeverage` |
| `limit:liquidation_distance_below_floor` | inelegível | distância menor que o piso |
| `limit:net_conservative_return_not_above_buffer` | inelegível | `liquidoSobreNocionalPpm` do cenário conservador não é maior que o buffer |
| `access:derivatives_denied` | inelegível | `access.derivatives` igual a `operator_denied` |
| `model:directional_no_modeled_edge` | inelegível | sempre no ramo direcional |
| `unknown:access_derivatives` | indisponível | acesso desconhecido |
| `unknown:fee_spot_maker`, `unknown:fee_spot_taker`, `unknown:fee_perp_maker`, `unknown:fee_perp_taker` | indisponível | taxa necessária desconhecida (a taxa taker do perpétuo é sempre necessária para a liquidação) |
| `unknown:maintenance_margin_rate` | indisponível | mmr desconhecido |
| `stale:spot_book`, `stale:perp_book`, `stale:mark`, `stale:funding`, `stale:funding_schedule` | indisponível | idade maior que o máximo, ou próxima liquidação não está no futuro |
| `future:spot_book`, `future:perp_book`, `future:mark`, `future:funding` | indisponível | horário posterior ao relógio |
| `skew:books` | indisponível | livros capturados com horários muito distantes |
| `depth:spot_open`, `depth:perp_open`, `depth:spot_close`, `depth:perp_close` | indisponível | profundidade insuficiente (inclui lado vazio) |
| `book:crossed_spot`, `book:crossed_perp` | indisponível | melhor bid maior ou igual ao melhor ask |
| `funding:insufficient_history`, `funding:invalid_interval` | indisponível | histórico curto; intervalo fora de {1, 2, 4, 8} h |
| `size:perp_lot`, `size:perp_min`, `size:spot_lot`, `size:spot_min` | indisponível | tamanho inválido para o instrumento |
| `instrument:inverse_unsupported`, `instrument:not_live`, `instrument:asset_mismatch`, `instrument:quote_mismatch` | indisponível | contrato inverso, estado diferente de `live`, moedas inconsistentes (as duas últimas só no carry) |

Razões de classe indisponível tornam `null` apenas as grandezas que dependem do dado ausente; o relatório nunca preenche zero. Razões de instrumento e de tamanho interrompem a precificação das pernas. No ramo direcional só contam o mercado do perpétuo, seus horários e suas taxas: livro, taxas e lotes do spot não importam.

## 9. Entrada, saída e CLI

### 9.1 Arquivo de entrada (snapshot + avaliação)

`schema: "okx_derivatives_input_v1"`, `sourceClaim: "synthetic" | "operator_claimed"`, `snapshot` e `evaluation`:

- `snapshot.spot` (`instId`, `baseCcy`, `quoteCcy`, `tickSz`, `lotSz`, `minSz`, `state`), `snapshot.perp` (`instId`, `ctType`, `ctVal`, `ctMult`, `ctValCcy`, `settleCcy`, `tickSz`, `lotSz`, `minSz`, `maxLeverage`, `state`);
- `snapshot.books.spot|perp`: `tsMs`, `bids` (preço decrescente) e `asks` (preço crescente) como pares `[preço, tamanho]` em texto, sem preço repetido, no `tickSz`;
- `snapshot.mark` (`tsMs`, `markPx`); `snapshot.funding` (`tsMs`, `currentRate`, `fundingTimeMs` da liquidação pendente, `nextFundingTimeMs`, `history` em ordem estritamente crescente de `fundingTimeMs`, todas já ocorridas, com `rate`);
- opcionais desconhecidos por padrão: `snapshot.fees.spot|perp.makerCost|takerCost`, `snapshot.maintenanceMarginRate`, `snapshot.access.derivatives`;
- `evaluation.carry` (`contracts`, `roles` opcional), `evaluation.directional` opcional (`side`, `contracts`, `roles` opcional), `evaluation.leverages`, `evaluation.holdingSettlements`, `evaluation.policy` opcional (seção 7).

Chaves desconhecidas, tipos errados, números JSON no lugar de texto decimal, decimais fora do formato, livros desordenados ou com preço duplicado ou fora do tick, histórico fora de ordem, objetos com protótipo especial, acessores e limites excedidos são rejeitados com `DerivativesError` (código por seção: `invalid_input`, `invalid_snapshot`, `invalid_evaluation`) e o caminho do campo no esquema, nunca o conteúdo. A fixture embutida (`syntheticInput()`) tem exatamente esta forma.

### 9.2 Relatório

Ordem dos campos: `schema: "okx_derivatives_report_v1"`, `source`, `mode` (`synthetic` para a fixture, `imported` para arquivo), `externalAccessObserved: false`, `liveQualified: false`, `financiallyAuthorized: false`, `execution: "not_qualified"`, `generatedAtMs`, `inputSha256` (SHA-256 do JSON canônico da entrada), `unknownInputs`, `notes` (em português), `carry`, `directional`, `model` (inclui `liquidationModelIsExchangeFormula: false`), `policy`, `instrument`, `freshness`, `units` e `adapter`. `carry` começa por `strategy`, `summary` e `comparison` (uma linha por alavancagem: capital, lucro conservador em cotação, retorno conservador, distância, choques liquidados, drawdown, estado e razões) e `conservative`; `directional` começa por `strategy`, `modeledEdge: "none"` e `comparison`.

### 9.3 CLI

`bun --no-env-file run scripts/okx-derivatives.ts` imprime o relatório sintético (relógio fixo `SYNTHETIC_NOW_MS`) com 2 espaços de indentação e newline final. `--snapshot <arquivo>` lê um arquivo local (regular, até 1 MiB, UTF-8 e JSON estritos, sem URL, UNC, dispositivo Windows ou fluxo alternativo), `--now-ms <inteiro>` fixa o relógio (só com `--snapshot`; sem ele usa-se `Date.now()`), `--help` imprime ajuda em português sem abrir arquivos. Argumentos inválidos são rejeitados antes de qualquer leitura. Erro: saída 1, stdout vazio e stderr `okx-derivatives: <codigo>[ <caminho>]`, com códigos `invalid_arguments`, `invalid_file`, `invalid_utf8`, `invalid_json`, `invalid_input`, `invalid_snapshot`, `invalid_evaluation`, `invalid_clock` e `internal_error`.

## 10. Critérios de aceitação

| ID | Comportamento observável |
| --- | --- |
| D1 | Aritmética exata: dinheiro em micro `bigint`, razões em ppm inteiro, decimais estritos (sem expoente, sinal `+`, espaços ou mais de 18 casas), sem ponto flutuante binário em dinheiro. Cada grandeza é arredondada uma vez, contra o trader, conforme a tabela da seção 3, inclusive para valores negativos; custos abaixo de um micro nunca somem. |
| D2 | Contrato: contratos para moedas e valor (`ctVal x ctMult x contratos x preço`); validação de `lotSz` e `minSz` do perpétuo e do spot; contrato inverso é indisponível. |
| D3 | Profundidade: caminhada por níveis com preço médio, pior preço e slippage; tamanho acima da profundidade, lado vazio ou livro cruzado resultam em indisponível, nunca em preenchimento parcial; pernas `maker` não recebem crédito de spread. |
| D4 | Taxas: quatro pernas, papel `maker`/`taker` explícito, custo positivo e rebate negativo arredondados contra o trader; taxa necessária desconhecida resulta em `unknown:*` e saldo `null`, nunca zero; o sinal da API OKX é convertido de forma testada. |
| D5 | Funding: sinal (positivo, o comprado paga o vendido), cronograma (intervalo derivado de `fundingTime` e `nextFundingTime` em {1, 2, 4, 8} h, `N` liquidações), cenários `recent_average`, `worst_observed` e `zero`, positivo e negativo, histórico mínimo, ordem e consistência do histórico. |
| D6 | Basis: basis de entrada em ppm; cenários `flat`, `converge` e `adverse`; convergência não entra no veredito; o cenário conservador é `worst_observed` com `adverse`. |
| D7 | Capital e retorno: capital comprometido = spot mais taxa mais margem inicial mais taxa; retorno líquido sobre o capital por cenário; a métrica do portão é independente da alavancagem (alavancagem não cria vantagem). |
| D8 | Liquidação: preço e distância vendido e comprado conforme 6.9; distância estritamente decrescente em `L`; mmr desconhecido resulta em indisponível; o relatório declara que o modelo não é a fórmula exata da OKX. |
| D9 | Estresse: choques adversos e salto; margem restante ou liquidação; liquidado se e somente se `s >= d`; hedge quebrado sem crédito do ganho do spot; perda além da margem; `maxDrawdownPpm` e `shocksLiquidated`. |
| D10 | Ponto de equilíbrio em liquidações e horas por cenário; `null` quando o fluxo não é positivo. |
| D11 | Veredito `eligible`/`ineligible`/`unavailable` com razões determinísticas da seção 8, teto de alavancagem padrão 3, piso de distância, buffer estrito, desconhecido, snapshot velho/futuro/dessincronizado e profundidade insuficiente; precedência `ineligible` sobre `unavailable` sobre `eligible`; código de razão fora do vocabulário é erro. |
| D12 | O mesmo carry em várias alavancagens: o lucro em cotação é idêntico; mudam capital, retorno, distância, choques liquidados, drawdown e veredito, lado a lado em `carry.comparison`. |
| D13 | Perpétuo direcional somente risco: distância, tabela de choques, custo a preço constante; nenhuma chave nem valor de lucro, retorno ou ganho; funding recebido não é creditado; nunca `eligible`. |
| D14 | Adapter de fixture somente leitura com `capabilities` e objeto congelado; validação estrita do arquivo (chaves exatas, tipos, ordens, limites, caminho do campo sem conteúdo); fixture embutida válida e sintética; JSON canônico e hash estáveis; avaliação pura, determinística e sem mutar a entrada. |
| D15 | CLI e relatório: sem argumentos imprime relatório sintético determinístico (`source: "synthetic"`, `externalAccessObserved: false`, `liveQualified: false`, `financiallyAuthorized: false`) igual ao da biblioteca; `--snapshot <arquivo>` lê arquivo local com limite de 1 MiB, UTF-8 e JSON estritos (limite aplicado no mesmo handle, inclusive crescimento durante a leitura); erros têm código finito em stderr, stdout vazio e saída 1; `--help` não abre arquivos; o arquivo nunca é reescrito; formato de dinheiro, ppm e ordem dos campos fixos. |
| D16 | Isolamento: nenhum import de cliente de rede, nenhuma leitura de `process.env`, nenhuma credencial, ordem ou assinatura, nenhum relógio nem aleatoriedade na biblioteca, nenhum import dinâmico; guarda estática (lista de imports permitidos) e de execução (`fetch`, `WebSocket` e entradas de rede do Bun armadilhados e nunca chamados). |
| D17 | Documentação: esta SPEC (fontes, unidades, desconhecidos, não objetivos, fórmulas, razões) e `okx-derivatives-v1/GUIA.md` (execução, leitura do relatório, limites, o que não está qualificado), sem travessão, meia-risca ou ponto mediano. |

## 11. Não objetivos

Sem execução, ordens, assinatura, custódia, chaves, API autenticada, rede, WebSocket ou leitura de `.env`. Sem promessa nem previsão de retorno. Sem contrato inverso, futuros com vencimento, opções, margem cruzada ou portfólio, conversão entre estáveis, tabela de degraus de manutenção, taxas reais da conta, gestão de margem adicional, rebalanceamento, perna spot financiada por empréstimo, tributos, detecção de chaves duplicadas em JSON, ou modelagem de caminho de preço além do conjunto de choques. Sem alteração de `src/trader.ts`, `src/market.ts`, `src/config.ts`, `src/index.ts` ou de qualquer porta de execução.

## 12. Verificação, evidências e integração

```powershell
bun --no-env-file test --parallel=1 --timeout 15000 ./src ./scripts
bun --no-env-file run typecheck
bun --no-env-file run scripts/okx-derivatives.ts
```

Evidências de desenvolvimento (não entregues no repositório): os valores esperados dos testes de economia, margem e direcional foram calculados por um oráculo independente em frações exatas (Python `fractions`) a partir das fórmulas desta SPEC, não pela implementação; e 41 mutações dirigidas da implementação (inversão de arredondamento, sinal de funding, remoção de taxa do denominador de liquidação, crédito do ganho do spot após liquidação, desconhecido tratado como zero, precedência do veredito, chave desconhecida aceita, limite de tamanho, fronteiras de idade e dessincronização e outras) foram aplicadas em cópias do módulo, e todas foram detectadas por pelo menos um teste.

Observação de base: na base `62b6453`, `src/market.receipt.test.ts` e `src/trader.receipt.test.ts` importam o caminho absoluto `C:/Users/gabri/jev-trader-release-v0.0.2-receipt-safety`, que não existe nesta máquina; essas duas suítes não carregam, independentemente desta entrega, e por isso a suíte completa não é verde neste ambiente.

Arquivos do escritor: `src/okx-derivatives/*`, `scripts/okx-derivatives.ts`, `scripts/okx-derivatives.test.ts`, esta SPEC e `docs/okx-derivatives-v1/GUIA.md`. O integrador adiciona o script de pacote `"okx:derivatives": "bun --no-env-file run scripts/okx-derivatives.ts"` e um parágrafo no README. Esta entrega não altera `package.json` nem `README.md`.
