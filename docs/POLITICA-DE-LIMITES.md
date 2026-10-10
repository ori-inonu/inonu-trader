# Política de limites por fase: o envelope de risco como código

Data: 2026-10-10. Estado: especificação do módulo `src/policy/envelope.ts`, da CLI `scripts/policy-envelope.ts` e dos testes `src/policy/envelope.test.ts` e `scripts/policy-envelope.test.ts`. Base: [R3, seções 4 e 6](research/R3-estrategias-e-alavancagem.md), [seção 5 e decisões D4 e D8 da arquitetura](ARQUITETURA-CENTRAL-DE-OPERACOES.md) e [PROFIT-SPEC](PROFIT-SPEC.md). Os números são parâmetros de engenharia de risco e cálculo: não são previsão, promessa de retorno nem recomendação personalizada. Decimais com vírgula na prosa e nas tabelas, ponto nas fórmulas e no JSON.

## 0. Avisos que não mudam

1. O módulo **só calcula e compara**. Não executa, não assina, não envia, não aprova, não deposita, não monta calldata e não decide comprar ou vender (isso continua sendo do Jev, dentro dos limites). Não lê variáveis de ambiente, não abre arquivos, não usa rede, relógio nem aleatoriedade: o mesmo argumento dá sempre o mesmo resultado.
2. `ok=true` significa apenas que **a configuração informada cabe no envelope da fase escolhida**. Isso não é autorização para operar: não levanta o bloqueio de `Market.init()`, não substitui `bun run qualify:live` nem a decisão do dono (decisão D11 da arquitetura).
3. A fase é sempre uma escolha **explícita** de quem chama. Nada aqui detecta, promove ou rebaixa fase sozinho, e o padrão é a fase 0 (paper e leitura, alavancagem zero, nenhuma exposição).
4. Nenhuma fase cria lucro. Elas limitam perda, exposição e velocidade de reentrada. Alavancagem é um botão de risco, não de lucro (decisão D4): sem vantagem validada, toda alavancagem acima de zero reduz a mediana. Tudo aqui é cálculo de engenharia de risco: não é aconselhamento de investimento nem previsão.
5. As quatro alegações do demo (Jev decide a partir do feed, trades reais de carteira real, uma ordem por bloco de 300 ms na Kuru, o painel ao vivo) não são tocadas por este módulo. Ele é uma biblioteca de limites: não altera cadência, modelo, carteira nem o painel, e nunca decide "a cada N blocos".

## 1. O que é e o que não é

**É:**

- funções puras com a matemática de R3 seção 4: arrasto de volatilidade, crescimento logarítmico, Kelly e seu limite inferior, probabilidade de tocar a liquidação, riqueza mediana sem vantagem, fração máxima de exposição e piso de distância de liquidação;
- a tabela tipada e congelada das três fases (`PHASES`);
- `deriveLimits`: de capital operacional e volatilidade diária para os tetos numéricos de uma fase;
- `checkSettings`: compara uma configuração genérica (objeto de campos opcionais, sem importar tipos do operador) com uma fase e diz quais regras foram violadas e quais dados faltam;
- uma CLI de leitura (`scripts/policy-envelope.ts`) para derivar limites e para conferir um arquivo JSON contra uma fase.

**Não é (fora de escopo):**

- Não executa nem autoriza (seção 0). Não é parecer de segurança nem certificação.
- Não mede perda nem drawdown em produção e não guarda estado. `SpotLedger.snapshot()` (`src/risk.ts`) já mede `pnlUsd` e `maxDrawdownUsd`; as paradas diária e semanal (patrimônio desde o início do dia ou da semana em UTC) ainda dependem de PnL realizado e conciliado (arquitetura, seção 9). Quem chama traz os números; este módulo só diz quais tetos valem.
- Não impõe nada. O operador e o trader continuam aplicando os próprios limites; aqui se calcula o que cabe na fase e se confere se a configuração cabe.
- Não estima volatilidade nem prova vantagem. `sigmaDaily` e o limite inferior do Kelly são entradas.
- Não cobre as linhas de R3 seção 6 que não são limites numéricos de exposição, perda e espera: teto de custos por sessão (1% do capital, aplicado hoje por `MAX_SPEND_USD`), ritmo e Jev (filtro econômico P1 de `src/economics.ts` antes de qualquer inferência, sem decisão por contagem fixa de blocos), conteúdo dos kill switches (aqui só se confere se existe um), reinvestimento só de ganho líquido realizado e conciliado, preço de liquidação informado pela venue, o requisito de `>= 3x` a pior queda diária de 365 dias e a reativação manual com margem abaixo de 150%.
- Não é aconselhamento de investimento. Resultados de modelo não são previsão (o modelo é movimento browniano geométrico sem saltos, que subestima caudas; ver seção 10).

## 2. Critérios de aceitação

Cada critério é um comportamento observável. Os testes carregam o identificador no título (`L1`, `L2`, ...).

| ID | Comportamento observável | Verificado em |
| --- | --- | --- |
| L1 | `normalCdf(z)` reproduz valores de referência (`Phi(0)=0,5`, `Phi(-1)=0,158655`, `Phi(1,96)=0,975002`, `Phi(-8)` de ordem 6,2e-16) com erro relativo até 1e-11 na cauda inferior, é simétrica (`Phi(z)+Phi(-z)=1`), monótona, fica sempre em `[0, 1]`, é contínua na troca de método e lança `RangeError` para `NaN` | `envelope.test.ts` |
| L2 | `volatilityDragPerDay` e `logGrowthPerDay` reproduzem a Tabela A de R3 (arrasto 8,00% ao dia com `L=10` e `sigma=4%`; 72,00% com `L=20` e `sigma=6%`) e o exemplo de R3 (`mu=0,1%`, `sigma=4%`: `g` vale +0,03125% em `L=0,625`, 0 em `L=1,25`, -0,12% em `L=2`, -0,42% em `L=3`, -1,5% em `L=5`). Sem vantagem (`mu=0`), `g(L)` é negativo para todo `L > 0` | `envelope.test.ts` |
| L3 | `kellyLeverage(mu, sigma)` vale `mu/sigma^2` (0,625 com `mu=0,1%` e `sigma=4%`; Tabela B). `kellyLowerBound(mu, sigma, dias)` vale `max(0, mu/sigma^2 - 2/(sigma*raiz(dias)))`: o erro padrão de `L` é 4,56x com 30 dias, 2,64x com 90 e 1,31x com 365 (R3, seção 4.7), e o limite só é positivo quando `t = mu*raiz(dias)/sigma` passa de 2 | `envelope.test.ts` |
| L4 | `touchLiquidationProbability(L, sigma, dias, m)` vale `2*Phi(-(1/L - m)/(sigma*raiz(dias)))` e reproduz a Tabela C inteira de R3 com erro absoluto até 0,002 (`sigma=4%`, 7 d: 5x 5,9%, 10x 34,5%, 20x 63,7%; `sigma=6%`, 30 d: 2x 12,8%, 3x 31,0%, 5x 54,3%) e os casos com margem de manutenção de 1,25% (`sigma=4%`, 30 d: 3x 14,3%, 5x 39,2%, 10x 69,0%). `L=0` dá 0; distância não positiva dá 1; cresce com `L`, com os dias e com `sigma` | `envelope.test.ts` |
| L5 | `medianWealthNoEdge(L, sigma, dias)` vale `exp(-0,5*L^2*sigma^2*dias)` e reproduz a Tabela D de R3 (`sigma=4%`, 30 d: 3x 0,81, 5x 0,55, 10x 0,09, 20x 0,00007 com erro relativo de 5%); vale 1 com `L=0` | `envelope.test.ts` |
| L6 | `maxExposureFraction(dll, sigma)` vale `dll/(2*sigma)`: 0,50, 0,25 e 0,1667 para `dll=2%` e `sigma` de 2%, 4% e 6% (R3 arredonda 0,17); 0,25, 0,125 e 0,0833 para `dll=1%` | `envelope.test.ts` |
| L7 | `liquidationDistanceFloor(sigma)` vale `max(0,35; 2,5*sigma*raiz(7))`: 0,35 até `sigma` de cerca de 5,29%, 0,4412 para `sigma=6,67%` (R3: MON 44%); com a distância igual ao piso, a probabilidade de toque em 7 dias é `2*Phi(-2,5)`, cerca de 1,24% | `envelope.test.ts` |
| L8 | Toda função matemática lança `RangeError` para entrada ausente ou inválida (`NaN`, infinito, `sigma <= 0` ou `>= 1`, `L < 0`, dias `<= 0`, tipo errado): a entrada desconhecida nunca vira zero nem produz número | `envelope.test.ts` |
| L9 | `PHASES` é tipado e congelado (em profundidade) com as três fases e os valores da seção 4; tentar mudá-lo lança erro; todas as frações são múltiplos exatos de 1 ponto-base | `envelope.test.ts` |
| L10 | `deriveLimits` na fase 0 devolve exposição zero (teto por ordem, fração e teto de exposição e alavancagem iguais a 0) e `null` nas paradas, nos cooldowns e no piso de liquidação (não se aplicam) | `envelope.test.ts` |
| L11 | `deriveLimits` na fase 1 com capital de US$ 100 devolve teto por ordem de US$ 1, paradas diária, semanal e de drawdown de US$ 2, US$ 5 e US$ 10, exposição `min(25%, 2%/(2*sigma))` (25% com `sigma=4%`, 14,99% com `sigma=6,67%`) em USD, alavancagem 1 e cooldowns de 900000, 86400000 e 259200000 ms com reativação manual após drawdown | `envelope.test.ts` |
| L12 | `deriveLimits` na fase 2 devolve teto por ordem de 2%, teto de alavancagem de fase 2 e piso de liquidação; sem o limite inferior do Kelly o teto efetivo é `null` (e `unknown` lista `kellyLowerBound`), com ele vale `min(2, 0,25 * limite)` | `envelope.test.ts` |
| L13 | Os valores em USD de `deriveLimits` são calculados em inteiros de micro-dólar, arredondados para baixo e nunca acima do valor exato; não há `NaN` nem infinito; cooldowns são inteiros seguros; frações de exposição são arredondadas para baixo e o piso de liquidação para cima, em 1 ponto-base | `envelope.test.ts` |
| L14 | `deriveLimits` lança `RangeError` para fase desconhecida, capital ausente, não finito, `<= 0` ou acima de US$ 1 bilhão, `sigmaDaily` ausente ou fora de `(0, 1)` e limite inferior do Kelly negativo ou inválido | `envelope.test.ts` |
| L15 | `checkSettings` usa a fase 0 quando a fase é omitida, e qualquer alavancagem diferente de zero é violação nela (1 também); a fase só muda se for passada de forma explícita; fase desconhecida lança `RangeError` | `envelope.test.ts` |
| L16 | Campo obrigatório ausente (`undefined`, `null` ou objeto sem o campo) vai para `unknown`, nunca vale zero, nunca passa e impede `ok`; `{}` não é `ok` em nenhuma fase; configuração que não é objeto equivale a `{}` | `envelope.test.ts` |
| L17 | Valor inválido (string, booleano onde se espera número, `NaN`, infinito, negativo, fora da faixa) é violação e nunca é convertido (a string `"1"` não vira 1, `1` não vira `true`) | `envelope.test.ts` |
| L18 | Fase 0: alavancagem, `maxPlanUsd`, `maxCapitalFractionPerPlan`, `maxDailyNotionalUsd` e (se presente) `maxDailyPlans` precisam ser 0; os demais campos são ignorados | `envelope.test.ts` |
| L19 | Fase 1: uma configuração completa e dentro do envelope dá `ok`; cada regra, quando violada isoladamente, produz exatamente a violação do seu campo (alavancagem, ordem em USD e em fração, nocional diário, paradas, cooldowns, kill switch, carteira dedicada); paradas são frações positivas (valor em pontos percentuais é violação, com dica) | `envelope.test.ts` |
| L20 | Fase 2: exige `outOfSampleEdgeValidated=true` (ausente é desconhecido, `false` é violação); limita a alavancagem a `min(2, 0,25 * kellyLowerBound)`; com alavancagem acima de 1 exige `liquidationDistancePct` `>=` ao piso; ordem até 2% | `envelope.test.ts` |
| L21 | CLI `--capital <usd> --sigma <fração>` imprime JSON puro com `deriveLimits` das três fases, resumo curto em pt-BR no stderr, sai com 0 e é determinística byte a byte; `--kelly-lower-bound` define o teto de alavancagem da fase 2 | `policy-envelope.test.ts` |
| L22 | CLI `--check <arquivo> [--phase ...]` lê só esse arquivo, imprime o resultado de `checkSettings` em JSON com `grantsPermission: false`, resumo em pt-BR no stderr e sai com 0 para qualquer relatório completo (conforme ou não); sem `--phase` usa a fase 0 e diz isso | `policy-envelope.test.ts` |
| L23 | Erros de uso saem com 2, sem nada no stdout: sem argumentos, flag desconhecida ou repetida, valor ausente, número mal formado, combinação inválida, fase inválida, arquivo ausente, ilegível, grande demais, que não seja arquivo regular, JSON malformado ou que não seja objeto; `--help` sai com 0 | `policy-envelope.test.ts` |
| L24 | A CLI nunca lê o ambiente (segredos no ambiente não mudam a saída nem aparecem nela), nunca usa rede e nunca escreve em disco; só abre o arquivo de `--check`; nunca imprime valores de texto do arquivo | `policy-envelope.test.ts` |
| L25 | O módulo é puro: nenhum `import`, nenhum acesso a ambiente, arquivo, rede, relógio ou aleatoriedade (varredura estática do código executável) e exporta exatamente a API documentada | `envelope.test.ts` |
| L26 | Nenhum texto (documento, módulo, CLI, testes e saídas) contém ponto mediano, travessão ou meia-risca (varredura de bytes) | ambos |
| L27 | Toda saída da CLI diz que não é autorização nem recomendação e não usa palavras de aprovação ("aprovado", "liberado", "pronto para operar"); o documento cita os identificadores L1 a L27 | ambos |

## 3. Fórmulas

Notação: `sigma` é a volatilidade **diária** como fração (0.04 é 4% ao dia); `mu`, o drift diário líquido; `L`, a alavancagem (nocional dividido pelo patrimônio); `T`, o horizonte em dias; `Phi`, a normal padrão acumulada. Modelo de R3 seção 4.1: `dS/S = mu*dt + sigma*dW`, alavancagem constante.

```
drag(L)    = 0.5 * (L*sigma)^2                              por dia    volatilityDragPerDay
g(L)       = L*mu - 0.5 * L^2 * sigma^2                     por dia    logGrowthPerDay
L*         = mu / sigma^2                                              kellyLeverage
L*_lb      = max(0, mu/sigma^2 - 2/(sigma*sqrt(N)))         N dias     kellyLowerBound
P(toque)   = 2 * Phi( -(1/L - m) / (sigma*sqrt(T)) )        m = margem de manutenção (padrão 0)
                                                                       touchLiquidationProbability
mediana    = exp( -0.5 * L^2 * sigma^2 * T )                sem vantagem medianWealthNoEdge
f_max      = DLL / (2*sigma)                                           maxExposureFraction
f          = min(0.25, DLL / (2*sigma))                                deriveLimits (DLL = parada diária da fase)
piso       = max(0.35, 2.5 * sigma * sqrt(7))                          liquidationDistanceFloor
teto_L(F2) = min(2, 0.25 * L*_lb)                                      deriveLimits e checkSettings
```

- `g(L)` é uma parábola com máximo em `L*` e valor negativo além de `2*L*`. Com `mu=0`, vale `-0.5*L^2*sigma^2` e é negativo para todo `L > 0` (R3 seção 4.7).
- `kellyLowerBound` usa o erro padrão `1/(sigma*sqrt(N))` de `L*` estimado (R3 seção 4.1) e dois erros padrão. É positivo se e somente se `t = mu*sqrt(N)/sigma > 2`, o mesmo critério de promoção de R3 ("limite inferior do retorno líquido diário acima de zero com t >= 2").
- A fração `0,25` de Kelly vem de R3 (seção 4.3): um quarto de Kelly tem 0,8% de chance de, em algum momento, perder metade do capital (Kelly pleno: 50%).
- `Phi` usa `erfc` com dois métodos: série de Kummer (todos os termos positivos) abaixo de `x = 2` e fração contínua de Laplace acima, com `x = |z|/raiz(2)`. Nenhuma dependência.
- Racional de `f_max`: se o desvio padrão da perda diária de uma posição de fração `f` é `f*sigma` e o limite diário de perda é `DLL`, escolher `f <= DLL/(2*sigma)` deixa a parada diária a pelo menos dois desvios de distância. Com `f = 1` e `DLL = 2%`, a parada dispara em 15,9%, 30,9% e 36,9% dos dias para `sigma` de 2%, 4% e 6% (R3, seção 4.8).

## 4. As três fases

Fonte: R3 seção 6 e arquitetura seção 5. A coluna "fase 0" é o padrão.

| Parâmetro | Fase 0: paper e leitura | Fase 1: micro-live spot | Fase 2: vantagem validada |
| --- | --- | --- | --- |
| Alavancagem máxima | 0 | 1 (sem empréstimo) | `min(2, 0,25 x limite inferior do Kelly)` |
| Capital exposto | zero | carteira operacional separada | até 25% da carteira operacional por venue |
| Ordem individual | 0 | até 1% do capital operacional | até 2% |
| Posição por ativo `f` | 0 | `min(25%, DLL/(2*sigma))` | idem |
| Parada diária (DLL) | não se aplica | 2% do patrimônio do início do dia (UTC) | 2% |
| Parada semanal | não se aplica | 5% | 5% |
| Drawdown de pico a vale | não se aplica | 10%, reativação manual | 10%, reativação manual |
| Piso de distância de liquidação | não se aplica | não se aplica | `max(35%, 2,5*sigma*raiz(7))`, quando a alavancagem passa de 1 |
| Cooldown após parada de operação | não se aplica | 15 min (900000 ms) | idem |
| Cooldown após parada diária | não se aplica | 24 h (86400000 ms) | idem |
| Cooldown após parada semanal | não se aplica | 72 h (259200000 ms) | idem |
| Kill switch configurado | não exigido | exigido | exigido |
| Carteira dedicada | não exigida | exigida | exigida |
| Vantagem validada fora da amostra | não exigida | não exigida | exigida (`outOfSampleEdgeValidated=true`) |

- Empréstimo: nas fases 0 e 1 não existe (`borrowingAllowed=false`); como a alavancagem é nocional sobre patrimônio, `leverage <= 1` já significa nada tomado emprestado. Na fase 2 o teto de alavancagem é o único limite.
- O teto de Kelly da fase 2 pode ficar abaixo de 1. Isso não é erro: com a vantagem medida, a regra só aceita expor uma fração do capital. Alavancagem acima de 1x só aparece com limite inferior do Kelly acima de 4, e o teto de 2x só com limite inferior de 8 ou mais. Exemplo (cálculo, não previsão): `mu=0,5%` ao dia e `sigma=2%` (Sharpe anualizado 4,8) medidos fora da amostra por 365 dias dão limite inferior 7,27 e teto 1,82x.
- Estar na fase 1 ou 2 só tem sentido com autorização financeira explícita do dono, assinante separado e o pacote de qualificação (seção 9). Escolher a fase na CLI não é nenhuma dessas coisas.
- Critérios de promoção de fase (R3 seção 6, todos): autorização explícita e assinante separado; janelas congeladas fora da amostra com custos conservadores contra caixa e contra manter inventário; limite inferior do retorno líquido diário acima de zero com `t >= 2` (Sharpe 2 exige cerca de 365 dias; Sharpe 4, cerca de 90); fills reais conciliados. A fase 1 testa operação (assinatura, reconciliação, saída), não prova lucro. Este módulo **não** avalia esses critérios nem promove fase.

## 5. Derivação de limites

`deriveLimits({ capitalUsd, sigmaDaily, phase, kellyLowerBound? })` devolve um objeto plano:

| Campo | Significado | Fase 0 | Fases 1 e 2 |
| --- | --- | --- | --- |
| `orderFraction`, `orderCapUsd` | teto por ordem em fração e em USD | 0 e 0 | 1% ou 2% do capital |
| `exposureFraction`, `exposureCapUsd` | `f` e seu valor em USD | 0 e 0 | `min(25%, 2%/(2*sigma))` |
| `dailyStopFraction`, `dailyStopUsd` | perda diária que dispara a parada | `null` | 2% do capital |
| `weeklyStopFraction`, `weeklyStopUsd` | idem, semanal | `null` | 5% |
| `drawdownStopFraction`, `drawdownStopUsd` | idem, pico a vale | `null` | 10% |
| `cooldownOperationStopMs`, `cooldownDailyStopMs`, `cooldownWeeklyStopMs` | esperas em milissegundos | `null` | 900000, 86400000, 259200000 |
| `drawdownReactivation` | como retomar após drawdown | `null` | `"manual"` |
| `leverageCeiling`, `leverageCap` | teto da fase e teto efetivo | 0 e 0 | 1 e 1 (fase 1); 2 e `min(2, 0,25 x limite)` ou `null` (fase 2) |
| `liquidationDistanceFloor` | piso de distância até a liquidação | `null` | `null` (fase 1); `max(0,35; 2,5*sigma*raiz(7))` (fase 2) |
| `unknown` | entradas que faltam para fechar algum limite | `[]` | `[]`; fase 2 sem limite do Kelly: `["kellyLowerBound"]` |

Regras de aritmética:

1. O capital é lido em micro-dólares inteiros (`round(capital * 1e6)`); todo valor em USD sai de uma divisão inteira por `10000` pontos-base e é dividido uma única vez por `1e6`. Assim `80 * 1% = 0,8` e `100 * 1% = 1` saem exatos, sem ruído de ponto flutuante.
2. Tetos e paradas são arredondados **para baixo** em 1 micro-dólar; frações de exposição, **para baixo** em 1 ponto-base (0,01%); o piso de liquidação, **para cima** em 1 ponto-base; o teto de alavancagem, para baixo em 0,0001. Nenhum arredondamento aumenta um teto.
3. `null` quer dizer "não se aplica à fase" (ou "indefinido por falta de dado", no teto de alavancagem da fase 2) e **nunca** "sem limite".

Exemplos (`sigma=4%`; valores em USD):

| Capital | Fase | Ordem | Parada diária | Semanal | Drawdown | Exposição `f` | Teto de exposição | Alavancagem |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | 1 | 1 | 2 | 5 | 10 | 25% | 25 | 1 |
| 100 | 2 | 2 | 2 | 5 | 10 | 25% | 25 | indefinida sem Kelly (teto 2) |
| 80 | 1 | 0,8 | 1,6 | 4 | 8 | 25% | 20 | 1 |

## 6. Verificação de uma configuração

`checkSettings(settings, phase = "fase-0")` devolve `{ phase, ok, violations, unknown }`. Cada violação tem `id` (o nome do campo), `message` (pt-BR), `actual` e `limit`. `ok` é verdadeiro **somente** sem violações e sem campos obrigatórios desconhecidos.

Campos (todos opcionais no tipo; "obrigatório" quer dizer que a ausência vira `unknown` e impede `ok`):

| Campo | Tipo e unidade | Fase 0 | Fase 1 | Fase 2 |
| --- | --- | --- | --- | --- |
| `capitalUsd` | USD, `0 < x <= 1e9` | não usado | obrigatório | obrigatório |
| `sigmaDaily` | fração diária, `0 < x < 1` | não usado | obrigatório | obrigatório |
| `leverage` | número `>= 0` (nocional / patrimônio) | obrigatório, `= 0` | obrigatório, `<= 1` | obrigatório, `<= min(2, 0,25 x kellyLowerBound)` |
| `maxPlanUsd` | USD `>= 0` | obrigatório, `= 0` | obrigatório, `<= 1%` do capital | idem com 2% |
| `maxCapitalFractionPerPlan` | fração `>= 0` (0.01 = 1%) | obrigatório, `= 0` | obrigatório, `<= 0.01` | `<= 0.02` |
| `maxDailyNotionalUsd` | USD `>= 0` | obrigatório, `= 0` | obrigatório, `<= f x capital` | idem |
| `maxDailyPlans` | inteiro `>= 0` | opcional; se presente, `= 0` | opcional, sem teto | opcional, sem teto |
| `cooldownMs` | milissegundos | não usado | obrigatório, `>= 900000` | idem |
| `dailyStopCooldownMs` | milissegundos | não usado | obrigatório, `>= 86400000` | idem |
| `weeklyStopCooldownMs` | milissegundos | não usado | obrigatório, `>= 259200000` | idem |
| `drawdownManualReactivation` | booleano | não usado | obrigatório, `= true` | idem |
| `dailyStopPct` | fração `> 0` (0.02 = 2%) | não usado | obrigatório, `<= 0.02` | idem |
| `weeklyStopPct` | fração `> 0` | não usado | obrigatório, `<= 0.05` | idem |
| `drawdownStopPct` | fração `> 0` | não usado | obrigatório, `<= 0.10` | idem |
| `killSwitchConfigured` | booleano | não usado | obrigatório, `= true` | idem |
| `dedicatedWallet` | booleano | não usado | obrigatório, `= true` | idem |
| `outOfSampleEdgeValidated` | booleano | não usado | não usado | obrigatório, `= true` |
| `kellyLowerBound` | número `>= 0` | não usado | não usado | obrigatório se `leverage > 0` |
| `liquidationDistancePct` | fração `0 < x <= 1` | não usado | não usado | obrigatório se `leverage > 1`, `>= piso` |

Pontos que costumam enganar:

- **Unidades.** Apesar do sufixo `Pct`, `dailyStopPct`, `weeklyStopPct`, `drawdownStopPct` e `liquidationDistancePct` são **frações** (0.02 é 2%), como `maxCapitalFractionPerPlan`. Escrever `2` para 2% é lido como 200%: vira violação (a mensagem avisa que o valor parece estar em pontos percentuais). O erro cai sempre do lado seguro.
- **Paradas.** Uma parada precisa ser maior que zero e menor ou igual ao limite da fase (mais apertada é aceita, mais frouxa é violação). Zero é inválido: ele poderia significar "sem parada" ou "parar em qualquer perda". Valor negativo também é inválido.
- **Cooldowns e booleanos.** Cooldown abaixo do mínimo é violação. Kill switch, carteira dedicada, reativação manual e evidência fora da amostra precisam ser exatamente `true`.
- **Nocional diário.** `maxDailyNotionalUsd` é limitado pelo teto de exposição (`f x capital`), a medida mais próxima disponível de "quanto nocional novo por dia" (interpretação deste módulo; R3 não define teto diário de nocional). Acima de 25% do capital é violação certa mesmo sem `sigmaDaily`; abaixo disso, sem `sigmaDaily` fica desconhecido.
- **Tolerância.** Comparações de USD acontecem em micro-dólares inteiros; as demais usam tolerância de 1e-9 relativa, para que ruído de ponto flutuante (0.1*0.1) não vire violação.
- **Campos extras** no objeto são ignorados e nunca impressos.

Exemplo, perfil `micro` descrito em D8 (5 USD ou 5% por plano, 20 USD e 4 planos por dia, cooldown de 15 min) com capital de US$ 100 contra a fase 1: `maxPlanUsd` (5 acima de 1) e `maxCapitalFractionPerPlan` (0.05 acima de 0.01) são violações, e as paradas, os cooldowns longos, a volatilidade, o kill switch e a carteira dedicada aparecem como desconhecidos enquanto a configuração não os informar.

## 7. O que "desconhecido" significa

1. **Ausente é desconhecido, não zero.** `undefined`, `null` e campo inexistente contam como ausentes (como em `qualify:live`). Um campo ausente jamais é lido como `0`, `false` nem como o limite da fase, e nunca passa em uma verificação. A alavancagem ausente não vale "alavancagem zero".
2. **Inválido não é ausente.** Um valor presente e inválido é violação; a string `"1"`, o booleano `true` no lugar de número e `NaN` nunca são convertidos.
3. **`ok` exige conhecimento.** Sem violações **e** sem nenhum item obrigatório desconhecido. O relatório lista os desconhecidos por nome, em ordem fixa.
4. **Violação certa vence desconhecido.** Se o valor informado já viola o limite por qualquer valor possível do dado que falta, é violação (ex.: nocional diário acima de 25% do capital sem `sigmaDaily`). Se só o dado ausente decidiria, é desconhecido.
5. **Cálculo nunca supõe.** As funções matemáticas e `deriveLimits` lançam `RangeError` para entrada ausente ou inválida em vez de calcular com um padrão. O único limite que pode ficar indefinido é o teto de alavancagem da fase 2 sem limite inferior do Kelly: ele vira `null` (nunca 0, nunca 2) e `unknown` registra `kellyLowerBound`.
6. **Fase nunca é inferida.** Fase desconhecida lança `RangeError`; omitida, vale a fase 0.

## 8. CLI

```
bun --no-env-file run scripts/policy-envelope.ts --capital <usd> --sigma <fração diária> [--kelly-lower-bound <x>]
bun --no-env-file run scripts/policy-envelope.ts --check <arquivo.json> [--phase fase-0|fase-1|fase-2]
bun --no-env-file run scripts/policy-envelope.ts --help
```

- **Derivar.** Imprime no stdout um JSON (`schema: "policy-envelope-v1"`, `kind: "derived-limits"`) com `deriveLimits` das três fases para o capital e a volatilidade informados. Números com ponto decimal e sem notação científica na entrada (`0.04`, não `0,04` nem `4e-2`). Resumo curto em pt-BR no stderr.
- **Conferir.** Lê **apenas** o arquivo informado (arquivo regular, até 1 MiB, sem seguir link simbólico, BOM tolerado), imprime `checkSettings` em JSON (`kind: "settings-check"`, `phase`, `phaseSource`, `ok`, `violations`, `unknown`, `grantsPermission: false`) e um resumo em pt-BR no stderr. Sem `--phase`, usa a fase 0 e informa `phaseSource: "default"`.
- **Códigos de saída.** 0 para qualquer relatório completo, conforme ou não: o relatório, e não o código, carrega o resultado. 2 para erro de uso ou de entrada (seção 2, L23). Não existe código 1.
- **Isolamento.** Não lê `process.env` (por isso `--no-env-file` é só um cinto de segurança), não usa rede, não escreve arquivos, não imprime valores de texto do arquivo, só nomes de campos conhecidos e números. O JSON inclui `io` com `network: false`, `environment: false` e a lista de arquivos lidos (só o nome do arquivo, sem pasta).
- **Script sugerido** (a ser ligado pelo mantenedor em `package.json`, que este trabalho não altera): `"policy:envelope": "bun --no-env-file run scripts/policy-envelope.ts"`.

## 9. Relação com o operador e com a qualificação para execução real

- **Operador.** O pipeline da arquitetura tem uma etapa "política de limites" entre o plano e a autorização. Este módulo fornece os números e a conferência dessa etapa; a aplicação (recusar um plano, parar, esperar) continua do operador e do trader. O operador não é importado: ele traduz o perfil ativo para o objeto genérico de `checkSettings`. Pela descrição de D8, o perfil `micro` (5 USD ou 5% por plano) **não cabe** no teto de 1% por ordem da fase 1; ver seção 10, item 2.
- **`docs/LIVE-QUALIFICATION.md`.** São camadas diferentes e complementares. A qualificação reúne evidência (soak, ensaio, reconciliação, revisão) e trava o bloqueio de `Market.init()`; o envelope diz quais limites valem em cada fase. Um não satisfaz o outro: `ok=true` aqui não marca nenhum item de `qualify:live`, e `readyForOwnerReview=true` lá não escolhe nem valida uma fase. Ordem natural: o dono escolhe a fase e assina um registro com limites **dentro** do envelope (a parada diária de 2% combina com `MAX_LOSS_USD = 2` sobre US$ 100); o verificador de qualificação segue como está.
- **`src/risk.ts` e `src/economics.ts`.** O ledger fornece `pnlUsd` e `maxDrawdownUsd` para comparar com `dailyStopUsd` e `drawdownStopUsd`. O filtro econômico P1 (PROFIT-SPEC) é uma triagem de custo antes da inferência e continua valendo; o envelope não o substitui e, como ele, nunca certifica lucro esperado.
- **Jev.** Os limites vêm depois da escolha do Jev: o modelo escolhe um id ou `hold`, e o código aplica os tetos. Nada aqui dá ao modelo chave, destino, valor ou fase.

## 10. Premissas, divergências e limites conhecidos

1. **Ordem individual: 1% e 2%, não 10% e 5%.** A tabela de R3 seção 6 lista até 10% (fase 1) e 5% (fase 2) e observa que "uma regra de 1% por ordem só é viável com capital maior". A arquitetura (seção 5) adotou 1% e 2%, e é isso que o módulo implementa (pedido do dono do trabalho). Consequência prática: o mínimo de 200 MON da Kuru vale cerca de US$ 4,95 (doctor de 2026-10-09, preço do MON muda). Para essa ordem mínima caber em 1%, o capital operacional precisa ser de cerca de US$ 495 (fase 1) ou US$ 248 (fase 2); com US$ 80 o teto da fase 1 é US$ 0,80, abaixo do mínimo da venue. O módulo não conhece o mínimo da venue: conferir isso é de quem chama.
2. **Perfil `micro` do operador.** Segundo D8, 5 USD ou 5% por plano excede 1% por ordem para qualquer capital abaixo de US$ 500 (5 / 0,01) e a fração 5% excede 1% sempre. A conferência da fase 1 mostrará isso; ajustar o perfil ou o capital é decisão do dono.
3. **`sigmaDaily`.** Segue a convenção de R3 seção 6: `max(sigma_30d, sigma_90d)` do ativo. O mesmo valor serve ao piso de liquidação (R3 descreve o piso com `sigma`; `max(sigma_30d, sigma_90d) >= sigma_90d`, portanto o piso fica igual ou mais conservador). Valores de 1 ou mais são tratados como erro de unidade (4 em vez de 0.04).
4. **Nocional diário** limitado pelo teto de exposição: interpretação deste módulo (seção 6).
5. **Modelo.** Movimento browniano geométrico sem saltos subestima caudas (R3 seção 4.1: curtose em excesso de 1,4 a 2,0 e o 10/10/2025). As probabilidades de toque são, na prática, piso otimista, e o monitoramento é contínuo. Margem de manutenção, funding, taxas e gaps ficam fora, exceto o parâmetro opcional `m`.
6. **Tolerâncias dos testes.** Tabelas de R3 estão arredondadas em 0,1%; os testes aceitam erro absoluto de 0,002 (0,005 onde R3 arredonda 1/6 para 0,17).
7. **O que depende de evidência futura.** Quem informa o limite inferior do Kelly e `outOfSampleEdgeValidated` é o chamador; sem janelas fora da amostra e fills reais conciliados, a fase 2 não deve ser usada.

## 11. Como verificar

```
bun --no-env-file test --parallel=1 --timeout 15000 ./src ./scripts
bun --no-env-file run typecheck
bun --no-env-file run scripts/policy-envelope.ts --capital 80 --sigma 0.04
bun --no-env-file run scripts/policy-envelope.ts --check settings.json --phase fase-1
```

## 12. Fontes

- [R3, seção 4 (matemática da alavancagem) e seção 6 (envelope)](research/R3-estrategias-e-alavancagem.md), com as tabelas A, B, C, D e a seção 4.8.
- [Arquitetura da central de operações](ARQUITETURA-CENTRAL-DE-OPERACOES.md): seção 3 (pipeline), seção 5 (política por fase), decisões D4, D8 e D11.
- [PROFIT-SPEC](PROFIT-SPEC.md) (triagem econômica P1), `src/risk.ts` (ledger), `src/economics.ts`.
- [Qualificação para execução real](LIVE-QUALIFICATION.md).
