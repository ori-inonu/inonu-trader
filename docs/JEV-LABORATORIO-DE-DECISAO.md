# Jev Decision Lab: laboratório de descoberta de vantagem com estatística honesta

Data: 2026-10-11. Estado: especificação dos módulos `src/lab/*.ts`, da CLI `scripts/jev-lab.ts` e dos testes `src/lab/*.test.ts` e `scripts/jev-lab.test.ts`. Base: [R3, seções 4 e 6](research/R3-estrategias-e-alavancagem.md), [arquitetura da central de operações (D1 a D11)](ARQUITETURA-CENTRAL-DE-OPERACOES.md), [política de limites](POLITICA-DE-LIMITES.md) e o [avaliador de derivativos](okx-derivatives-v1/GUIA.md). Os números são engenharia de risco e estatística: não são previsão, promessa de retorno nem recomendação personalizada. Decimais com vírgula na prosa e nas tabelas, ponto nas fórmulas, no código e no JSON.

## 0. Avisos que não mudam

1. **Somente sombra.** O laboratório registra decisões hipotéticas e mede o que teriam rendido. Não executa, não assina, não envia, não aprova, não deposita, não guarda chaves, não usa rede e não lê variáveis de ambiente. Não há caminho de código daqui até o executor do operador (`src/operator/**`), até `src/market.ts` ou até `src/trader.ts`.
2. **Dados sintéticos provam aritmética, nunca lucro.** A `SyntheticSource` existe para verificar que a máquina estatística detecta uma vantagem plantada e não inventa uma quando ela não existe. Nenhum número vindo dela descreve um mercado.
3. **O Jev padrão da CLI é um substituto simulado.** O `MockJevChooser` é uma regra determinística e offline. Toda saída diz isso em voz alta. Para medir o Jev de verdade, quem chama injeta um seletor real (seção 11); este repositório nunca importa o SDK do TypeSafe dentro de `src/lab`.
4. **O relatório não concede nada.** O portão de promoção só pode **recomendar permanecer na fase-0**. Qualquer texto de promoção diz que não concede permissão e que o dono decide com o checklist de qualificação real (`bun run qualify:live`, decisão D11).
5. **Nada aqui prova lucro.** Mesmo com dados reais e todos os critérios estatísticos atendidos, o resultado é evidência fora da amostra de uma janela, não garantia. Todo relatório termina com esse aviso fixo.
6. As quatro alegações do demo (o Jev decide comprar ou vender a partir do feed, trades reais de carteira real, uma ordem por bloco de 300 ms na Kuru, o painel ao vivo) não são tocadas. O laboratório não altera cadência, modelo, carteira nem painel, e nunca decide "a cada N blocos".

## 1. O que é e o que não é

**É:** um laço de descoberta de vantagem. Em cada época de decisão ele registra (a) os candidatos que existiam, com custos e features só do passado, (b) o que cada política escolheria, incluindo o Jev, (c) o resultado daquela escolha, medido no ponto no tempo e líquido de custos conservadores, e (d) as estatísticas que dizem se alguma política supera linhas de base simples. Acrescenta um contrafactual de alavancagem: o que 1x, 2x, 3x, 5x e 10x teriam feito com essas mesmas decisões.

**Não é (não objetivos):**

- Não executa, não assina, não envia, não gera calldata e não prepara ordem. Não guarda nem lê chave, segredo, mnemônico ou token.
- Não faz recomendação de investimento, não promete retorno e não estima "quanto o dono ganharia". Alavancagem aparece só como contrafactual de risco.
- Não promove fase. `promotionGate` devolve texto e listas de critérios; quem escolhe a fase é o dono (decisão D11).
- Não substitui `bun run qualify:live`, a política de limites (`src/policy/envelope.ts`) nem a revisão independente.
- Não coleta dados. O formato de captura (seção 3.4) é o contrato que uma tarefa posterior de coleta vai escrever; este trabalho só o lê.
- Não modela livro de ordens, impacto de mercado nem fila: custos são proxies declarados (seção 5).

## 2. Critérios de aceitação

Cada critério é um comportamento observável. Os testes carregam o identificador no título (`LB1`, `LB2`, ...).

| ID | Comportamento observável | Verificado em |
| --- | --- | --- |
| LB1 | O formato de captura aceita as seis espécies (`ticker`, `funding`, `mark`, `candle`, `book`, `oi`) e faz ida e volta: `serialize(parse(linha))` é a forma canônica e `parse(serialize(r))` devolve `r` | `capture-format.test.ts` |
| LB2 | O formato de captura rejeita, com número da linha e caminho do campo, cada violação: chave extra ou ausente, tipo errado, número não finito ou escrito como texto, `inst` mal formada, ticker ou livro cruzado, livro fora de ordem, vela incoerente, **vela conhecida antes de fechar** (`t < startMs + barMs`), funding fora da faixa ou com intervalo inválido | `capture-format.test.ts` |
| LB3 | O arquivo de captura exige `t` não decrescente, recusa vela duplicada e conflitante, linha vazia no meio, linha grande demais, caractere de controle e excesso de linhas; aceita BOM no início e fim de linha CRLF; todo erro nomeia a linha | `capture-format.test.ts` |
| LB4 | Ponto no tempo: `asOf(t)` nunca devolve registro com `t' > t`, na `SyntheticSource` e na `ReplaySource`, para muitos `t` sorteados; é monotônico (o que se sabia em `t1` continua sabido em `t2 > t1`) e a lista de instrumentos visível em `t` só tem instrumentos que já apareceram | `source.test.ts` |
| LB5 | Trava de futuro: dentro da janela de decisão, `future()` e `asOf(t')` com `t' > t` lançam `LeakError`; uma política que guarda a fonte em uma closure e tenta ler o futuro faz a rodada falhar, e nenhum registro da época fica no diário | `source.test.ts`, `run.test.ts` |
| LB6 | Invariância ao futuro: trocar todos os dados posteriores a `t` por valores absurdos não muda candidatos, features nem decisões em `t` (todas as políticas determinísticas e o Mock) | `run.test.ts` |
| LB7 | Um resultado nunca usa dado posterior ao fim do horizonte: as janelas pedidas à fonte terminam em `horizonEndMs + captureLagMs`, e envenenar tudo o que vem depois não muda o resultado | `outcomes.test.ts` |
| LB8 | Desconhecido nunca vira zero: feature `null` fica `null` (a regra de momento segura em vez de tratar como 0), candidato com qualquer custo desconhecido é inelegível e não aparece para nenhuma política, funding desconhecido torna o carry inelegível, custo de inferência desconhecido fica `null` e o relatório o declara | `candidates.test.ts`, `policies.test.ts`, `run.test.ts` |
| LB9 | Retorno líquido: `net = gross + funding - custos - custo de oportunidade`, com a tabela única de padrões conservadores (`COST_TABLE`); exemplos numéricos exatos para long, short e carry; mudar a tabela muda o resultado | `outcomes.test.ts` |
| LB10 | Funding: sinal correto para long, short e carry; só entram liquidações dentro da janela; fronteira assimétrica (na saída só conta pagamento); a taxa usada é o último registro daquela liquidação; liquidação não observada torna o resultado incompleto | `outcomes.test.ts` |
| LB11 | Resultado incompleto (`complete: false`) carrega a razão e campos numéricos `null`; nas estatísticas esses epochs saem da série daquela política e são contados, nunca somados como zero | `outcomes.test.ts`, `run.test.ts` |
| LB12 | Contrafactual de alavancagem para L em {1, 2, 3, 5, 10}: múltiplo de patrimônio, flag de liquidação por L, preço de liquidação igual ao de `src/okx-derivatives/margin.ts`, funding pago deslocando o preço de liquidação, liquidação monotônica em L, long a 1x nunca liquidado | `outcomes.test.ts` |
| LB13 | O contrafactual é consistente com `src/policy/envelope.ts`: a frequência empírica de toque bate com a fórmula exata do movimento browniano geométrico e fica na faixa declarada da aproximação de `touchLiquidationProbability`; a riqueza mediana sem vantagem concorda em média logarítmica com `medianWealthNoEdge` | `outcomes.test.ts`, `stats.test.ts` |
| LB14 | Curva de patrimônio por política (tranches de 1/K do patrimônio): números exatos, drawdown máximo, bootstrap em blocos com semente fixa reprodutível, mediana, probabilidade de liquidação e de ruína | `stats.test.ts` |
| LB15 | Linhas de base: `hold` sempre segura; `random` é reprodutível por (semente, época) e uniforme; `buy-and-hold` é passivo; `momentum-rule` e `carry-rule` seguem a regra e seguram diante de `null`; desempate determinístico por id | `policies.test.ts` |
| LB16 | `JevPolicy` valida a resposta: id desconhecido, resposta malformada, tempo esgotado e exceção viram `hold` com status próprio; abstenção é `hold` com status `ok`; o estado enviado ao seletor só tem chaves opacas, enumerações fechadas e números | `policies.test.ts` |
| LB17 | `MockJevChooser` é determinístico e offline; é o seletor padrão da CLI e a saída diz isso em voz alta | `policies.test.ts`, `jev-lab.test.ts` |
| LB18 | Média: Newey-West com a regra de lag e a inflação documentadas, p-valor com t de Student, IC de 95%; a distribuição t, o estimador e o bootstrap batem com referências numéricas | `stats.test.ts` |
| LB19 | Potência e tamanho, medidos (seção 7.6): com vantagem plantada de tamanho detectável para o N usado o relatório a sinaliza na grande maioria das sementes; sem vantagem a taxa de sinalização, por política testada e na família de Holm, fica perto do nível nominal e nunca muito acima, nas estatísticas e no pipeline completo, em dezenas de sementes | `stats.test.ts`, `lab.integration.test.ts` |
| LB20 | Comparação pareada contra baselines (união-interseção), correção de Holm, Brier e tabela de confiabilidade, Sharpe anualizado com a ressalva e dias necessários para detectar um Sharpe (valores de R3) | `stats.test.ts` |
| LB21 | `promotionGate` só recomenda `fase-0`; lista critérios atendidos, reprovados e desconhecidos; todo texto de promoção diz que não concede nada e remete ao `qualify:live`; dados sintéticos nunca passam; o limite de alavancagem vem de `kellyLowerBound` | `stats.test.ts` |
| LB22 | Diário: só anexa, é idempotente (repetir um id de época nunca duplica), retoma de onde parou, grava o snapshot de forma atômica (arquivo temporário e renomeação) | `journal.test.ts` |
| LB23 | Diário: leitura estrita (linha malformada é erro que nomeia a linha), diário ausente ou corrompido com resultados existentes faz a execução PARAR, e uma configuração diferente da gravada também | `journal.test.ts` |
| LB24 | O orquestrador é puro e o relatório sai só do diário: interromper e retomar dá exatamente os mesmos bytes que uma execução contínua | `run.test.ts` |
| LB25 | CLI: `run` e `report`, JSON no stdout, resumo curto em pt-BR no stderr, saída 0 para execução completa, 2 para uso incorreto e 3 para parada de integridade do diário; mesma semente dá os mesmos bytes; o aviso do Mock e o aviso final aparecem | `jev-lab.test.ts` |
| LB26 | Pureza estática: nenhum acesso a ambiente, rede, relógio ou aleatoriedade do sistema; escrita em disco só em `journal.ts`; nenhum import do SDK do TypeSafe, de `ethers`, do operador, de `market`, `trader`, `config` ou de carteira | `purity.test.ts` |
| LB27 | Nenhum ponto mediano, travessão, meia-risca, sinal de menos tipográfico ou marcador (varredura de bytes) no documento, nos módulos, na CLI e nos testes; nenhuma palavra de aprovação ou promessa no código | `purity.test.ts` |
| LB28 | O documento define LB1 a LB28 e cada um é exercitado por um teste cujo título começa com o identificador; as constantes do documento batem com as do código | `purity.test.ts` |

## 3. Modelo de dados

### 3.1 Tempo, épocas e candidatos

Todo instante é um inteiro seguro em milissegundos desde a época Unix. A grade de decisão é `t_i = firstEpochMs + i * stepMs`. O id da época é `e<t>` (por exemplo `e1800259200000`) e é a chave de idempotência do diário. O horizonte `horizonMs` e o passo `stepMs` são únicos por execução; a **sobreposição** é `K = ceil(horizonMs / stepMs)`.

```ts
type LabModality = "funding-carry" | "perp-directional" | "spot-momentum" | "yield-allocation" | "dex-signal" | "kuru-maker";

interface LabCandidate {
  id: string;                    // "<modalidade>.<instrumento>.<lado>", único dentro da época
  modality: LabModality;
  instrument: string;            // perp para carry e direcional, spot para spot-momentum
  hedgeInstrument: string | null;// perna spot do carry
  venue: string;                 // "okx" nas fontes atuais
  observedAtMs: number;          // t da época
  horizonMs: number;
  side: "long" | "short" | "neutral";
  features: Record<string, number | null>; // null quer dizer DESCONHECIDO, nunca zero
  costs: { feeBps: number | null; spreadBps: number | null; slippageBps: number | null; fixedUsd: number | null; notionalUsd: number; complete: boolean };
  validUntilMs: number;
  provenance: { source: string; externalAccessObserved: boolean };
}
```

`costs.complete` só é verdadeiro quando nenhum componente é `null`. **Um candidato com custo desconhecido é inelegível**: aparece na época em `ineligible` com as razões e nenhuma política o vê. `externalAccessObserved` é sempre `false` aqui: o laboratório não toca a rede. As modalidades `yield-allocation`, `dex-signal` e `kuru-maker` existem no tipo e na tabela de custos, mas **não têm gerador de candidatos nesta versão** (o formato de captura não carrega esses dados) e seu custo fixo é `null`, o que as torna inelegíveis por construção.

Features geradas (todas `number | null`; unidades entre parênteses):

| Feature | Significado |
| --- | --- |
| `retLookbackBps` | retorno do fechamento mais recente ao de `lookbackMs` atrás, velas conhecidas em `t` (bps) |
| `volHorizonBps` | desvio-padrão dos retornos logarítmicos de vela no lookback, escalado ao horizonte (bps); `null` com menos de 20 velas |
| `spreadBps` | spread cotado do instrumento no ticker mais recente e fresco, com idade de até 120000 ms (bps); no carry, soma das duas pernas |
| `basisBps` | `(perp - spot) / spot` nos tickers (bps) |
| `fundingNextBps`, `fundingLastBps` | taxa anunciada da próxima liquidação e última liquidada (bps por liquidação) |
| `fundingMeanBps`, `fundingMinBps` | média e mínimo das últimas 6 liquidações (bps); `null` com menos de 6 |
| `settlementsInHorizon` | liquidações de funding estritamente dentro da janela de retenção |
| `carryGrossBps` | `min(fundingMinBps, fundingNextBps) * settlementsInHorizon`, a leitura conservadora (bps) |
| `carryNetBps` | `carryGrossBps` menos custos totais e custo de oportunidade do capital (bps) |
| `oiChangeBps` | variação do interesse em aberto no lookback (bps); `null` sem dados `oi` |
| `costBps` | custos totais conhecidos convertidos em bps do nocional |
| `signalZ` | **só na fonte sintética com vantagem plantada** (seção 3.3) |

### 3.2 Épocas, decisões e resultados

```ts
interface Epoch { id: string; index: number; t: number; candidates: LabCandidate[]; eligibleIds: string[]; ineligible: { id: string; reasons: string[] }[] }

type DecisionStatus = "ok" | "invalid-choice" | "malformed" | "timeout" | "error";
interface PolicyDecision {
  policyId: string; epochId: string;
  choice: string;                       // id de candidato elegível ou "hold"
  probabilities: Record<string, number>;// sobre ["hold", ...elegíveis]
  latencyMs: number;
  inputTokens: number | null;           // null: o provedor não informou; nunca zero
  costUsd: number | null;               // custo de inferência; null: desconhecido
  status: DecisionStatus; note: string | null;
}

interface Outcome {
  epochId: string; candidateId: string;
  entryMs: number | null; horizonEndMs: number;
  grossReturn: number | null; fundingReturn: number | null; costReturn: number | null;
  opportunityCost: number | null; netReturn: number | null;   // frações do nocional
  capitalPerNotional: number | null;                          // 1 (direcional e spot) ou 2 (carry a 1x)
  leverage: { leverage: 1 | 2 | 3 | 5 | 10; applicable: boolean; liquidated: boolean | null; equityMultiple: number | null }[];
  complete: boolean; incompleteReason: string | null;
}
```

`netReturn` e as demais frações são **do nocional**. O retorno usado nas estatísticas é o **retorno sobre o capital comprometido a 1x**: `netReturn / capitalPerNotional`, porque o carry exige duas pernas financiadas (spot inteiro mais margem do perp) e compará-lo por nocional o favoreceria por um fator 2. `hold` vale 0: todo retorno é em excesso sobre o caixa.

### 3.3 Fontes de dados

```ts
interface DataSource {
  readonly id: string; readonly kind: "synthetic" | "replay";
  readonly coverage: { firstMs: number; lastMs: number };
  asOf(t: number): PointInTimeView;                          // só o que era conhecível em t
  future(t0: number, t1: number, kinds?: CaptureKind[]): FutureWindow; // SÓ o motor de resultados
  openDecision(t: number): void; closeDecision(): void;      // janela de decisão (seção 4)
}
```

`ReplaySource` lê o formato de captura. `SyntheticSource` gera os mesmos registros com um PRNG com semente (sfc32 semeado por hash de texto): preço de movimento browniano geométrico com deriva `dailyDrift` e volatilidade `dailyVol` por ativo, velas cujas máximas e mínimas vêm da ponte browniana exata (assim a liquidação com monitoramento contínuo não tem viés de discretização), funding AR(1) com anúncio no início do período e valor liquidado no instante da liquidação, basis amarrado ao funding, spreads. Os dois são embrulhados pela mesma classe `RecordStore`, então `asOf` existe uma vez só.

**Vantagem plantada.** `plantedEdgeBps = X` fixa a esperança do retorno bruto, por decisão, da regra oráculo "long se `signalZ > 0`, senão short" no ativo, em bps do nocional. O gerador primeiro produz o caminho de preços (que continua sendo um GBM puro) e depois define `signalZ = rho * z + sqrt(1 - rho^2) * ruido`, em que `z` é o retorno logarítmico padronizado da janela de retenção realmente ocorrida e `rho = (X / 10000) / (sigma_h * sqrt(2 / pi))`, com `sigma_h` o desvio do retorno do horizonte. Assim `corr(signalZ, retorno) = rho` e a esperança da regra oráculo é exatamente `X`. `X = 0` não planta nada e `signalZ` não existe. O sinal só aparece na visão de `asOf(t)` quando `t` é exatamente uma época da grade. Com `rho >= 0,95` a configuração é recusada.

### 3.4 Formato de captura (contrato com a tarefa de coleta)

Arquivo JSONL em UTF-8, uma linha por registro, `\n` ou `\r\n` ao fim de cada linha, BOM opcional só no início. Cada linha é exatamente:

```json
{"t": 1800000000000, "kind": "ticker", "inst": "SYNA-USDT", "data": {"bid": 99.99, "ask": 100.01, "last": 100.0}}
```

Regras gerais: as quatro chaves e nenhuma outra; `t` inteiro seguro entre 0 e 4102444800000; `kind` em `ticker | funding | mark | candle | book | oi`; `inst` casa `^[A-Z0-9]{1,20}(-[A-Z0-9]{1,20}){1,3}$` com no máximo 48 caracteres (perpétuos terminam em `-SWAP`, o spot correspondente é o mesmo id sem o sufixo); `data` é um objeto só com as chaves da tabela; todo número é um número JSON finito (texto como `"1.5"` é recusado). **`t` é o instante em que o dado se tornou conhecível para um observador ao vivo** (recebimento local), nunca um carimbo do evento anterior a isso, e não decresce ao longo do arquivo. Um preenchimento tardio de história deve usar o instante real de publicação do dado.

| Espécie | Campos de `data` (obrigatórios; opcionais marcados) | Invariantes |
| --- | --- | --- |
| `ticker` | `bid`, `ask`, `last`; opcionais `bidSize`, `askSize`, `vol24h` | preços `> 0`, `bid <= ask`, tamanhos `>= 0` |
| `funding` | `rate`, `settleMs`, `intervalMs` | `rate` fração por liquidação com `abs <= 0.05`, positiva quando quem está comprado paga; `intervalMs` em 1, 2, 4 ou 8 horas; `t < settleMs` é um anúncio, `t >= settleMs` é o valor liquidado |
| `mark` | `price`; opcional `index` | `> 0` |
| `candle` | `startMs`, `barMs`, `open`, `high`, `low`, `close`; opcional `volume` | `barMs` múltiplo de 1000 até 86400000; `low <= min(open, close)`, `high >= max(open, close)`; **`t >= startMs + barMs`** (vela só é conhecida depois de fechar); gravar só velas fechadas; uma mesma `(inst, barMs, startMs)` aparece uma vez |
| `book` | `bids`, `asks`: listas de `[preço, tamanho]` | até 50 níveis por lado, preços e tamanhos `> 0`, bids estritamente decrescentes, asks estritamente crescentes, melhor bid menor que melhor ask |
| `oi` | `oi`; opcional `oiUsd` | `>= 0` |

Limites: linha com até 65536 bytes, arquivo com até 268435456 caracteres e 5000000 registros. Chaves duplicadas dentro de uma linha valem como a última ocorrência (comportamento do `JSON.parse`) e não são detectadas, como no avaliador de derivativos. Nesta versão, `book` e `mark` são validados, guardados e expostos pela visão, mas nenhum candidato os usa; spreads e preços vêm de `ticker` e `candle`.

### 3.5 Diário

`journal.jsonl` na pasta de saída, apenas anexo. Primeira linha: o cabeçalho com o **manifesto** da execução (fonte, passo, horizonte, tabela de custos, políticas, seletor, semente), determinístico, sem relógio. Depois, linhas `{"type":"epoch"|"decision"|"outcome", ...}`. Chaves de idempotência: época por `id`, decisão por `(epochId, policyId)`, resultado por `(epochId, candidateId)`. `snapshot.json` guarda contagens e o tamanho do diário e é regravado por arquivo temporário e renomeação.

## 4. A regra do ponto no tempo

> Uma decisão em `t` só pode usar dados com `t' <= t`. Um resultado só pode usar dados até `horizonEndMs + captureLagMs`.

Três camadas, nesta ordem de força:

1. **Minimização de dados.** A política recebe apenas `PolicyInput = { epochId, t, eligible }`: candidatos congelados em profundidade, com features calculadas por `buildEpochCandidates` a partir de `asOf(t)`. Ela não recebe a fonte nem registros brutos. Não há como ler o futuro por onde não há futuro.
2. **Forma da API.** `asOf(t)` devolve uma visão cuja data de corte é uma constante interna; `future(t0, t1)` existe só na fonte e quem chama é o motor de resultados (`outcomes.ts`). O orquestrador chama `future` somente depois de fechar a janela de decisão.
3. **Armadilha em tempo de execução.** Entre `openDecision(t)` e `closeDecision()`, `future()` e `asOf(t')` com `t' > t` lançam `LeakError`. Uma política que contrabandeie a fonte por uma closure faz a rodada inteira falhar e o diário não recebe nada daquela época. É uma rede de proteção contra erro, **não** um sandbox contra código malicioso.

Os testes tentam vazar de propósito: (LB4) propriedade sobre muitos instantes, (LB5) uma política que lê `future()` e outra que lê `asOf(t + 1)`, (LB6) duas fontes idênticas até `t` e absurdas depois, que precisam dar decisões idênticas, e (LB7) um resultado calculado com tudo depois do horizonte envenenado, que precisa dar o mesmo número, mais um espião que registra cada janela pedida.

Observação: com vantagem plantada, `signalZ` depende do caminho futuro **por construção** (é a vantagem escondida do mundo sintético). Por isso o teste LB6 roda com `plantedEdgeBps = 0`.

## 5. Resultado e custos

### 5.1 Linha do tempo de uma decisão

Decisão em `t`. Entrada em `entryStart = ceil((t + executionDelayMs) / barMs) * barMs`, na abertura da vela daquele instante; saída em `exitMs = entryStart + horizonMs`, no fechamento da vela que termina ali (`horizonMs` é múltiplo de `barMs`). O atraso padrão é uma vela (`executionDelayMs = barMs`): o preço de entrada nunca é o preço que gerou o sinal. Dados usados: velas do instrumento (e do spot, no carry) e registros de funding até `exitMs + captureLagMs`.

### 5.2 Fórmulas

Todas as frações são do nocional `N`.

```
gross (long)    = P1/P0 - 1
gross (short)   = -(P1/P0 - 1)
gross (carry)   = (S1/S0 - 1) - (P1/P0 - 1)        long spot, short perp: sobra a variação do basis
funding         = soma das taxas das liquidações S em (entrada, saída], com o sinal do lado:
                  short e carry recebem +taxa, long paga -taxa
costs           = (feeBps + spreadBps + slippageBps)/10000 + fixedUsd/notionalUsd
opportunity     = cashYieldAnnual * horizonMs/(365 dias) * capitalPerNotional1x
net             = gross + funding - costs - opportunity
retorno sobre capital (1x) = net / capitalPerNotional1x
```

Fronteira de funding: uma liquidação exatamente na entrada não conta; uma liquidação exatamente na saída conta **somente se for pagamento** (arredondamento contra o operador). Liquidações esperadas são derivadas do calendário do registro de referência (`settleMs + k * intervalMs`); se alguma não tem registro, o resultado é incompleto (`funding-unobserved`). Escalar o funding pela variação do preço da posição é ignorado (segunda ordem, simétrico).

### 5.3 Tabela única de padrões conservadores (`COST_TABLE`)

| Item | Valor | Origem e leitura |
| --- | --- | --- |
| taxa taker spot | 10 bps por lado | exemplo da OKX em R3 (S19); todas as pernas são taker |
| taxa taker perp | 5 bps por lado | idem; também é a taxa de fechamento na liquidação |
| slippage | 1 bp por lado e por perna | suposição declarada, não medida |
| spread | spread cotado inteiro por perna e ida e volta (bps) | observado no ticker em `t`; a saída assume o mesmo spread |
| custo fixo CEX | 0 USD | sem gás nas modalidades da OKX |
| custo fixo das demais | `null` (desconhecido) | torna o candidato inelegível |
| atraso de execução | 1 vela | seção 5.1 |
| `captureLagMs` | 5000 ms | folga de gravação da vela de saída |
| rendimento do caixa | 4,05% ao ano | T-bill de 3 meses (R3, FRED 2026-10-08), cobrado como custo de oportunidade |
| margem de manutenção | 1,25% | referência de R3 (nível BTC 40x da Hyperliquid); trocar pela tabela de degraus da venue |
| nocional de referência | 100 USD | converte custos fixos e de inferência em fração |

Ida e volta no carry: 4 pernas, taxas `2*(10+5) = 30 bps`, igual ao cenário taker/taker de R3. Direcional: 10 bps. Spot: 20 bps.

### 5.4 Resultados incompletos

Razões fechadas: `horizon-beyond-data`, `entry-bar-missing`, `exit-bar-missing`, `candle-gap`, `funding-unobserved`, `costs-unknown`, `modality-unsupported`. Campos numéricos ficam `null`. Nas estatísticas o epoch sai da série daquela política (e da comparação pareada com qualquer outra) e entra na contagem de incompletos; o portão exige completude de pelo menos 95%.

## 6. Contrafactual de alavancagem

Aplica-se a candidatos `perp-directional` e `funding-carry` (a perna perp). Candidatos `spot-momentum` não são alavancáveis: nas curvas alavancadas ficam em 1x e `applicable: false`.

Para cada `L` em `{1, 2, 3, 5, 10}`:

- **Capital por nocional:** direcional `1/L`; carry `1 + 1/L` (spot inteiro mais margem do perp).
- **Múltiplo de patrimônio da decisão**, sem liquidação: `m_L = 1 + (gross + funding - costs) / capitalPerNotional(L) - cashYield * horizonMs/ano`. A 1x coincide com `1 + net / capitalPerNotional1x`.
- **Preço de liquidação:** reaproveita `liquidationRatio` de `src/okx-derivatives/margin.ts` com a margem de manutenção da tabela e a taxa taker de fechamento. Funding **pago** até a vela desloca o preço: long `ratio + F/(1 - m - f)`, short `ratio - F/(1 + m + f)`, com `F` o funding pago acumulado em fração do nocional (funding recebido não é creditado no caminho: conservador). O preço de entrada usado é o preço de entrada com o spread e o slippage contra o operador.
- **Detecção:** com as velas da janela, long é liquidado se `low <= preço de liquidação`, short se `high >= preço de liquidação`; no carry vale para a perna perp short. As extremidades das velas sintéticas são exatas, então o toque contínuo é reproduzido.
- **Liquidado:** direcional `m_L = 0` (margem isolada perdida; o prejuízo acima da margem, coberto pelo fundo de seguro na OKX, não é modelado). Carry: perde a margem do perp, o spot fica sem hedge e **só perda do spot é creditada**, como no avaliador de derivativos.

### 6.1 Curva de patrimônio da política

Uma decisão por época significa posições que se sobrepõem. A curva usa `K = ceil(horizonMs / stepMs)` **tranches**: cada decisão recebe `1/K` do patrimônio realizado no instante da abertura e aplica `L`; as `K` posições simultâneas somam exposição bruta `L`. No passo `j`, primeiro fecha a tranche `j - K` (`E += tamanho * (m - 1)`) e depois abre a `j`. `hold` vale `m = 1`. O drawdown máximo é medido sobre `E` realizado.

### 6.2 Distribuição por reamostragem

Para cada política e cada `L`, `2000` caminhos reamostrados pelo **bootstrap em blocos móveis** (bloco `max(3K, 4)`, semente fixa `20261011`, o mesmo índice de época nas cinco alavancagens) dão: mediana, p5 e p95 do patrimônio final, `probLiquidation` (algum caminho com liquidação) e `probRuin` (patrimônio mínimo `<= 0,5` do inicial, parâmetro `ruinFraction`). O bloco preserva a sobreposição interna; entre blocos a ordem é refeita, aproximação declarada.

### 6.3 Referência de forma fechada (consistência com `envelope.ts`)

O relatório calcula, com `sigma` diário derivado de `volHorizonBps`, a referência sem vantagem de `src/policy/envelope.ts`: `medianWealthNoEdge(L, sigma, dias)` e `touchLiquidationProbability(L, sigma, horizonDias, margem)`. É contexto, não previsão. Os testes verificam: (a) o motor reproduz a probabilidade de toque exata do GBM (`Phi((-a - nu*T)/(sigma*sqrt(T))) + exp(-2*nu*a/sigma^2) * Phi((-a + nu*T)/(sigma*sqrt(T)))`, com `nu = -sigma^2/2` e `a = -ln(1 - d)`) dentro de três erros-padrão binomiais; (b) a aproximação aritmética `2*Phi(-d/(sigma*sqrt(T)))` de `envelope.ts` fica dentro de uma faixa relativa declarada (R3, seção 4.1, já avisa que ela é levemente conservadora e difere do GBM para distâncias grandes); (c) a média do logaritmo da riqueza final sem vantagem concorda com `log(medianWealthNoEdge)`.

## 7. Estatística

### 7.1 O que é medido

Para cada política `p` e época `e`, a série `x_e^p` é o retorno líquido sobre o capital a 1x da escolha (0 em `hold`). Para o Jev subtrai-se `costUsd / notionalUsd` em toda época em que foi consultado; se `costUsd` é `null` o custo **não** é subtraído, o relatório marca `inference.costKnown: false` e o critério `custo-de-inferencia` do portão fica desconhecido. Linhas de base passivas (`buy-and-hold`) não pagam custos de negociação (`gross + funding - oportunidade`): é o benchmark sem giro.

Por política: `n`, média por época, desvio, taxa de acerto (fração das negociações com retorno líquido positivo), erro-padrão HAC, `t`, IC de 95%, p-valor unilateral, drawdown máximo, taxa de negociação, negociações por dia, Sharpe anualizado, dias para detectar esse Sharpe, e o contrafactual de alavancagem. Para o Jev: latência (p50, p95, p99), fração das consultas acima de 1500 ms (o `maxDecisionMs` da qualificação) e Brier com tabela de confiabilidade.

### 7.2 Por que não vale o desvio-padrão ingênuo (sobreposição)

Com passo menor que o horizonte, retornos de épocas vizinhas compartilham o mesmo trecho de preço: a série é uma média móvel de ordem `K - 1` mesmo que os preços sejam independentes. Em um caso puro (soma de `K` incrementos independentes) a variância de longo prazo é `K` vezes a variância amostral. Usar `sd/sqrt(n)` superestima o `t` por um fator `sqrt(K)`. Por isso a inferência usa um estimador robusto a autocorrelação.

**Escolha: Newey-West (kernel de Bartlett) para a média e para as diferenças pareadas.** Não usamos o bootstrap de blocos para o veredito porque, medido, ele subcobre sob sobreposição (limite inferior positivo em 4,1% a 6,7% das amostras nulas contra 2,5% nominal), enquanto Newey-West com a correção abaixo ficou entre 5,4% e 6,1% para um teste unilateral de 5%. O bootstrap em blocos móveis, com semente fixa, é usado só para simular caminhos de patrimônio (seção 6.2).

```
u_i      = x_i - media
gamma_j  = (1/n) * soma_{i=j+1..n} u_i * u_{i-j}
lag      = min(n - 2, max(3K, floor(4 * (n/100)^(2/9))))
LRV      = (n / (n - lag)) * ( gamma_0 + 2 * soma_{j=1..lag} (1 - j/(lag+1)) * gamma_j )
SE       = sqrt(LRV / n)          t = media / SE
gl       = max(1, floor(n/(lag+1)) - 1)
p (unilateral) = 1 - T_gl(t)      IC95 = media +- T_gl^-1(0,975) * SE
```

A inflação `n/(n - lag)` e o t de Student com `gl` graus de liberdade corrigem amostras curtas relativas à sobreposição. O tamanho do teste foi medido por simulação (4000 repetições por célula, retornos sobrepostos de incrementos normais): 4,8% a 6,1% de rejeição para nível unilateral nominal de 5%, com `K` de 1, 4 e 8 e `n` de 200 a 1000. Série com variância de longo prazo zero (por exemplo `hold`) tem `t`, p-valor e IC `null`. A seção 7.6 traz o tamanho e o poder medidos, também no pipeline completo.

### 7.3 Várias políticas e várias modalidades: correção de Holm

Testar muitas políticas e modalidades e olhar só a melhor infla o falso positivo. **Correção escolhida: Holm-Bonferroni** (passo descendente; controla a taxa de erro familiar sob qualquer dependência, o que importa porque as políticas compartilham os mesmos preços; é uniformemente mais potente que Bonferroni). A família é: o teste unilateral "média líquida > 0" de cada política exceto `hold`, mais o de cada par (política, modalidade da escolha) com pelo menos 30 negociações. Nível 0,05. Hipóteses experimentadas fora do laboratório (outras variantes, outros limiares) não são contadas: a correção é um piso, não um teto, e o dono deve fixar o conjunto de políticas antes de olhar (campo `frozenAtMs`, seção 8).

As **comparações pareadas** (`d_e = x_e^p - x_e^q`, mesmas épocas utilizáveis de ambas) de cada política testada contra cada baseline formam um teste de **união-interseção**: a política só "supera as linhas de base" se **todas** as comparações forem significativas; isso controla o erro no mesmo nível sem correção adicional. Políticas testadas: `momentum-rule`, `carry-rule` e o `jev`. Baselines: `hold`, `random`, `buy-and-hold`, `momentum-rule`, `carry-rule` (cada política testada é comparada com todos os baselines exceto ela mesma).

### 7.4 Brier e confiabilidade (Jev)

Para as decisões não `hold` do Jev com resultado completo: evento `acerto = netReturn > 0` e probabilidade `p = probabilities[choice]`. `Brier = media((p - acerto)^2)` e a referência é o Brier do preditor constante (taxa de acerto observada). Tabela de confiabilidade em 10 faixas iguais de `p`: contagem, `p` médio, frequência observada, intervalo de Wilson de 95%. As probabilidades do operador são pesos de decisão, não taxas de acerto (D1, R2): má calibração é esperada e o Brier mede o quanto.

### 7.5 Sharpe anualizado e dias necessários

Com tranches de `1/K` (seção 6.1), o Sharpe do portfólio implementável é `media / sqrt(LRV) * sqrt(passos por ano)`, igual a `t * sqrt(passos por ano / n)` e independente de `K`. Ano de 365 dias, `passos por ano = 365 * dia/stepMs`. **Ressalvas, impressas no relatório:** a anualização extrapola uma janela curta; o erro-padrão do Sharpe amostral é enorme (aproximadamente `sqrt((1 + SR^2/2)/anos)`); a variância de longo prazo é estimada com poucos graus de liberdade efetivos; custos reais e impacto não estão no número; e um Sharpe amostral alto em uma janela curta é o que a seleção entre muitas políticas produz sozinha.

**Dias necessários para detectar um Sharpe anualizado `S` com `t = 2`:** `N = (t * sqrt(365) / S)^2`.

| Sharpe anualizado | 0,5 | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- | --- |
| Dias (t = 2) | 5840 | 1460 | 365 | 162,2 | 91,3 | 58,4 |

Exemplo numérico com a sobreposição do laboratório (horizonte 24 h, passo 6 h, `K = 4`). Suponha uma política cujo retorno líquido verdadeiro seja de 12 bps por decisão com desvio de 300 bps por decisão (ativo com 3% de volatilidade diária): relação sinal-ruído por decisão `0,04`. Para `t = 2` com sobreposição, `n = K * (t / SNR)^2 = 4 * 2500 = 10000` decisões, ou `10000 * 6 h = 2500 dias` (6,8 anos). Conferindo pelo Sharpe: `SR = 0,04 / sqrt(4) * sqrt(1460) = 0,02 * 38,21 = 0,764` e `(2 / 0,7642)^2 * 365 = 2500` dias. Uma vantagem de 12 bps por decisão parece boa e é um Sharpe de 0,76: invisível por anos. Em sentido inverso, a janela padrão de 400 épocas (100 dias) só detecta Sharpe anualizado a partir de `2 * sqrt(365/100) = 3,82`; é o que R3 resume como "90 dias só detectam Sharpe de cerca de 4".

### 7.6 Poder e taxa de falso positivo medidos (LB19)

O tamanho e o poder da média (seção 7.2) foram medidos de dois modos: sobre séries simuladas (`stats.test.ts`: 1500 séries nulas por célula, com `K` de 1, 4 e 8) e, nesta seção, **no relatório inteiro**. O mesmo mundo sintético passa pelo pipeline real (fonte, candidatos, políticas, resultados com custos, diário, relatório com Newey-West, Holm e comparações pareadas) em dezenas de sementes, e as taxas são contadas no relatório que o usuário lê (`lab.integration.test.ts`). Tudo é sintético: isto verifica a máquina estatística e não diz nada sobre nenhum mercado.

**Três níveis de "sinal"**, do mais cru ao oficial: (a) *rejeição bruta*, o p-valor unilateral da média abaixo de `0,05`; (b) *rejeição após Holm*, o p ajustado abaixo de `0,05`, e *vencedor claro* quando além disso `t >= 2` e o limite inferior do IC de 95% está acima de zero; (c) *sinalizada* (`flagged`), rejeição após Holm e todas as comparações pareadas contra as linhas de base significativas. Só (c) é o veredito do relatório; (a) é uma etapa intermediária.

**Os mundos.** Todos têm um ativo com 1,5% de volatilidade diária, velas de 1 hora e horizonte de 24 horas, e usam as sementes 1, 2, 3, ...

| Mundo | Construção | Janela |
| --- | --- | --- |
| Nulo exato | Sem taxas, spreads, slippage, rendimento do caixa, funding e base: o preço é martingale e **toda política tem média líquida verdadeira zero**. A vantagem plantada é de 1e-6 bps, ou seja nada, mas faz a fonte publicar uma pontuação plantada que é ruído puro, para o Mock ter o que negociar. O elenco padrão ganha um segundo Jev, `jev-fade`, que aposta contra o movimento de 24 h quando ele passa de um desvio-padrão (uma política que reage ao retorno recente: o caso em que o teste unilateral se comporta pior) | `K = 4` (passo de 6 h), 120 épocas (30 dias) |
| Custos realistas, sem vantagem | Tabela de custos, spreads e funding padrão do gerador, a mesma pontuação de ruído | `K = 1` (passo de 24 h), 160 épocas |
| Vantagem plantada | Custos realistas e vantagem de 110 bps, o valor esperado bruto por decisão da regra oráculo "comprar se a pontuação é positiva, vender se não" (correlação 0,92 entre a pontuação e o movimento seguinte; a fonte recusa 0,95 ou mais). O Mock negocia só as pontuações fortes, cerca de 30 épocas de 160, e paga os custos de cada uma | `K = 1`, 160 épocas |

**Tamanho (sem vantagem).** Mundo nulo exato, 600 sementes, `K = 4`, 120 épocas, nível unilateral nominal de 5%:

| Política | Rejeição bruta | Após Holm | `t` médio |
| --- | --- | --- | --- |
| `random` | 3,5% | 0,0% | 0,02 |
| `buy-and-hold` | 5,3% | 0,2% | 0,00 |
| `momentum-rule` | 2,5% | 0,0% | -0,24 |
| `jev` (Mock, pontuação de ruído) | 3,3% | 0,3% | -0,04 |
| `jev-fade` | 7,0% | 0,7% | 0,21 |

Alguma rejeição na família de Holm (cerca de 10 a 11 hipóteses neste elenco): 1,3% das sementes (8 de 600), contra 5% de nível familiar. **Sinalizada (c): nenhuma em 600 sementes.** Em outras células do mundo nulo (4 políticas, com o ruído de base padrão de 2 bps), a rejeição bruta de cada política ficou entre 2,4% e 6,4%:

| `K` | Épocas | Sementes | `random` | `buy-and-hold` | `momentum-rule` | `jev` | Família de Holm | Sinalizada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 120 | 1000 | 4,9% | 4,1% | 4,2% | 4,7% | 1,7% | 0,1% |
| 1 | 240 | 600 | 5,7% | 5,3% | 4,3% | 4,0% | 3,2% | 0,3% |
| 2 | 160 | 700 | 4,0% | 5,0% | 3,4% | 5,6% | 2,6% | 0,0% |
| 4 | 120 | 800 | 4,4% | 5,8% | 4,8% | 4,1% | 2,0% | 0,1% |
| 4 | 160 | 800 | 4,5% | 6,4% | 2,4% | 4,3% | 1,8% | 0,0% |
| 4 | 400 | 300 | 4,3% | 4,7% | 4,7% | 6,3% | 2,7% | 0,0% |

Com custos realistas e sem vantagem (200 sementes, `K = 1`, 160 épocas) as taxas caem: rejeição bruta de 0,0% (`random`), 3,5% (`buy-and-hold`), 0,5% (`momentum-rule`) e 0,5% (`jev`), nenhuma rejeição após Holm e nenhuma sinalização. A política `random` perdeu dinheiro em 192 das 200 sementes (média de cerca de -15 bps por época): a tabela de custos morde, que é o objetivo de torná-la conservadora.

**A assimetria das regras que reagem ao retorno recente.** As duas regras que apostam no movimento das últimas 24 h têm caudas espelhadas: o `t` médio de `momentum-rule` é -0,24 e o de `jev-fade` é +0,21, contra 0,00 a 0,02 para `random` e `buy-and-hold`. O teste de `momentum-rule` rejeita 2,5% na cauda superior e 8,7% na inferior; o de `jev-fade`, 7,0% e 2,0%. O mesmo aparece fora do pipeline, em preços GBM horários puros (1,5% de volatilidade diária, sem custos; regra pelo sinal das últimas 24 h, sem limiar; decisão a cada 6 h, posição de 24 h aberta 1 h depois) com o mesmo `meanTest`, `K = 4`, de 1500 a 4000 repetições por célula. Rejeição na cauda superior e na inferior:

| Épocas | Seguir o movimento | Apostar contra o movimento | Passivo comprado (referência) |
| --- | --- | --- | --- |
| 60 | 1,5% e 4,2% | 4,7% e 1,3% | 3,6% e 3,5% |
| 120 | 3,8% e 6,8% | 7,2% e 2,8% | 5,2% e 4,4% |
| 400 | 3,7% e 6,4% | 7,0% e 3,8% | 4,7% e 6,1% |
| 1000 | 5,1% e 6,4% | 6,1% e 4,9% | 5,7% e 6,7% |

Sem sobreposição (`K = 1`, 120 épocas) as duas regras são simétricas (4,9% e 4,8%). A causa é que a variância de longo prazo de uma regra que aposta no retorno recente depende de a regra ter "funcionado" naquele caminho: quando funciona, as autocovariâncias são maiores e o `t` encolhe; quando falha, ocorre o oposto. O t de Student simétrico não acompanha isso. O tamanho bilateral fica certo (a soma das caudas é cerca de 10%); o do teste unilateral "média > 0" fica entre 1,5% e 7,2% conforme a regra. Por isso **nenhum veredito do laboratório depende só do teste bruto**: o portão exige, além dele, a correção de Holm sobre uma família de 8 a 11 hipóteses (o menor p-valor precisa ficar abaixo de 0,05 dividido pelo tamanho da família, de 0,0045 a 0,0063) e todas as comparações pareadas (é isso que a lista `flagged` reúne), mais uma amostra efetiva de pelo menos 30 blocos e 90 dias. Medido, o excesso do teste bruto não chega ao veredito: `jev-fade` tem 0,7% de rejeição após Holm e nenhuma sinalização em 600 sementes. Há ainda o viés conhecido do kernel de Bartlett, que subestima a variância de longo prazo em cerca de 10% para `K = 4` com lag 12 e infla o desvio do `t` em cerca de 5% (a coluna do passivo mostra o efeito).

**Poder (com vantagem plantada).** Custos realistas, elenco padrão com o Mock, 60 sementes por célula (40 quando indicado). "Vencedor claro" é o nível (b) acima; "Sinalizada" é o nível (c).

| `K` | Épocas | Vantagem plantada | Vencedor claro | Sinalizada |
| --- | --- | --- | --- | --- |
| 1 | 120 | 60 bps | 78% | 18% |
| 1 | 120 | 80 bps | 100% | 43% |
| 1 | 120 | 110 bps | 100% | 77% |
| 1 | 160 | 60 bps | 97% | 30% |
| 1 | 160 | 80 bps | 100% | 70% |
| 1 | 160 | 110 bps | 100% | 94% (120 sementes) |
| 1 | 200 | 70 bps | 100% (40) | 55% (40) |
| 1 | 200 | 110 bps | 100% (40) | 95% (40) |
| 2 | 160 | 60 bps | 93% | 15% |
| 2 | 160 | 110 bps | 100% | 73% |
| 4 | 160 | 60 bps | 67% | 2% |
| 4 | 160 | 100 bps | 92% | 18% |
| 4 | 400 | 40 bps | 90% (40) | 8% (40) |
| 4 | 400 | 80 bps | 100% (40) | 60% (40) |
| 4 | 400 | 110 bps | 100% (40) | 83% (40) |

Leitura: 110 bps por decisão é o máximo que a fonte aceita para 1,5% de volatilidade diária (sinal-ruído de 0,73 por decisão, enorme para qualquer mercado real). Mesmo assim, sem sobreposição são precisos 160 dias para sinalizar em 94% das sementes e, com `K = 4`, 400 épocas (100 dias) sinalizam em 83%. O gargalo é a sinalização, não a significância: em todas as 7 falhas das 120 sementes da célula de 160 épocas com 110 bps o Jev era vencedor claro e falhou só na comparação com `buy-and-hold`, cujas oscilações são grandes. **Sem sinal não é sem vantagem**: uma vantagem de 40 bps (sinal-ruído de 0,27) em 100 dias é "significativa" em 90% das sementes e quase nunca sinalizada (8%).

**O que o teste de ponta a ponta afirma** (`lab.integration.test.ts`, cerca de 12 s para 106 execuções do pipeline). Os limites ficam bem além do pior que a varredura mostrou em janelas de sementes consecutivas, porque as sementes são fixas e uma mudança inofensiva na ordem dos sorteios do gerador não deve tornar um teste determinístico instável; um defeito real, como um estimador que ignora a sobreposição (cerca de 20% de rejeição com `K = 4`), continua falhando.

| Teste | Afirmação | Medido nas sementes do teste |
| --- | --- | --- |
| Nulo exato, `K = 4`, 120 épocas, 60 sementes | Toda política tem p-valor em toda semente e os dois Jevs negociam; rejeição bruta de no máximo 10 de 60 por política e 36 de 300 no conjunto; no máximo 2 rejeições após Holm por política, 6 sementes com alguma rejeição na família e 1 sinalizada; `t` médio de `random`, `buy-and-hold` e `jev` entre -0,5 e 0,5 | 0, 5, 1, 4 e 3 rejeições brutas (13 de 300); 1 após Holm; 1 semente com rejeição na família; nenhuma sinalizada |
| Custos realistas sem vantagem, `K = 1`, 160 épocas, 16 sementes | `random` perde em pelo menos 13 sementes; no máximo 3 rejeições brutas, 1 semente com rejeição na família e 1 sinalizada | `random` perde em 16; nenhuma rejeição; nenhuma sinalizada |
| Vantagem plantada de 110 bps, `K = 1`, 160 épocas, 30 sementes | Vencedor claro em pelo menos 27, sinalizada em pelo menos 23, média positiva em pelo menos 29, no máximo 1 semente com outra política sinalizada, média do Jev entre 20 e 110 bps | 30, 26, 30, 0 e 43,5 bps |

Se uma taxa medida ficar claramente acima do nominal, a estatística está errada: o conserto é em `stats.ts`, nunca afrouxar o limite.

## 8. Portão de promoção

`promotionGate(report)` devolve `{ recommendation, recommendedPhase: "fase-0", passed, failed, unknown, grantsPermission: false }`. A fase recomendada é **sempre** `fase-0`: o portão não tem como produzir outra. O sujeito é a política `jev`.

| Critério | Regra | Origem |
| --- | --- | --- |
| `dados-reais` | sintético: reprovado; captura: desconhecido (a origem não é verificável pelo laboratório); nunca atendido | seção 0 |
| `dias-minimos` | dias cobertos `>= 90` | R3, seção 6 (Sharpe 4 exige cerca de 90 dias) |
| `amostra-efetiva` | `floor(n/(lag+1)) >= 30` | seção 7.2 |
| `resultados-completos` | fração de épocas com resultado utilizável `>= 0,95` (`run.completeness`) | R3, "custos conservadores" |
| `custo-de-inferencia` | todo custo de inferência informado (`inference.costKnown`); desconhecido nunca vira zero e deixa o critério desconhecido | D1 |
| `t-newey-west` | `t >= 2` | R3, seção 6 |
| `limite-inferior-positivo` | limite inferior do IC de 95% da média líquida por época `> 0` | R3, seção 6 |
| `correcao-holm` | p ajustado por Holm `< 0,05` | seção 7.3 |
| `contra-baselines` | todas as comparações pareadas com `t >= 2` e limite inferior `> 0` | seção 7.3 |
| `kelly-alavancagem` | `kellyLowerBound(mu_dia, sigma_dia, dias) > 0`; o teto de alavancagem da fase 2 sai de `deriveLimits` | `envelope.ts` |
| `janela-fora-da-amostra` | desconhecido, salvo `frozenAtMs` declarado: atendido se o primeiro epoch é posterior, reprovado se anterior (atestado pelo operador, não verificável) | R3, seção 6 |
| `fills-reais-conciliados` | **sempre desconhecido**: o laboratório não executa | R3, seção 6 |
| `autorizacao-e-assinante` | **sempre desconhecido**: autorização financeira explícita e assinante separado não são avaliáveis aqui | R3, seção 6 e D11 |

O texto de `recommendation` sempre começa com "Recomendação: permanecer na fase-0". Se os critérios estatísticos foram todos atendidos e nenhum foi reprovado, acrescenta que isto **não concede nada** e que o dono decide com o checklist de qualificação real, a autorização explícita, o assinante separado e fills reais conciliados; caso contrário, diz "Evidência insuficiente nesta janela" com a contagem de critérios reprovados e desconhecidos. Sempre afirma que a alavancagem permanece em 0x na fase-0 e termina com "Nada aqui prova lucro". O mu e o sigma diários do Kelly vêm do portfólio de tranches (seção 7.5): `mu_dia = media/K * passos por dia`, `sigma_dia = sqrt(LRV * passos por dia)/K`.

## 9. Como ler um relatório

O JSON da CLI (`schema: "jev-lab-report-v1"`) tem, em ordem: `mode` e `source`; `jev` (nome do seletor, `isMock`, `realJevCalled`, aviso); `run` (épocas, épocas pendentes, dias, passo, horizonte, sobreposição `K`, semente, vantagem plantada, `frozenAtMs`, completude); `costTable`; `policies[]`; `paired[]`; `multipleTesting`; `flagged`; `gate`; `notes`; e por último `disclaimer`.

1. Leia primeiro `jev.isMock` e `mode`. Mock ou sintético: o resultado só verifica a máquina.
2. Em `policies[]`, olhe `mean.meanBps` (média líquida por época, em bps do capital comprometido), `mean.t` e `mean.ci95Bps`. Uma média positiva com IC que contém zero **não é evidência**. `hold` tem média 0 por definição, e essa é a barra. `statuses` conta as decisões por status: tudo que não é `ok` virou `hold`.
3. `adjustedP` é o p-valor após Holm. Só ele conta, e só junto com todas as linhas de `paired[]` significativas (`significantlyBetter: true`). `flagged` lista as políticas testadas que cumprem as duas coisas.
4. `usableEpochs` e `incompleteDecisions` mostram quantos epochs entraram na série; `run.completeness` baixa invalida a leitura.
5. `sharpe` traz o Sharpe anualizado, os dias necessários para detectá-lo e a ressalva; `portfolio` traz a média e o desvio diários do portfólio de tranches e o limite inferior de Kelly.
6. `leverage` mostra, por `L`, `observed` (curva de patrimônio do histórico), `bootstrap` (distribuição reamostrada) e `reference` (forma fechada sem vantagem de `envelope.ts`). Se `bootstrap.probLiquidation` ou `bootstrap.probRuin` sobem com `L` enquanto a média líquida a 1x é zero ou negativa, é o arrasto de volatilidade de R3: alavancagem sem vantagem só reduz a mediana.
7. `calibration` (só quando a política informa probabilidades) traz o Brier, a referência da taxa de acerto e a tabela de confiabilidade.
8. `gate.failed` e `gate.unknown` dizem o que falta. `gate.recommendation` nunca é uma autorização.
9. O `disclaimer` final vale sempre.

## 10. CLI

```
bun --no-env-file run scripts/jev-lab.ts run --synthetic --epochs <N> --seed <S> [--planted-edge <bps>] --out <pasta>
bun --no-env-file run scripts/jev-lab.ts run --capture <arquivo.jsonl> --out <pasta> [--seed <S>] [--step-ms <ms>] [--horizon-ms <ms>] [--bar-ms <ms>] [--frozen-at-ms <ms>]
bun --no-env-file run scripts/jev-lab.ts report --journal <pasta ou arquivo journal.jsonl>
bun --no-env-file run scripts/jev-lab.ts --help
```

Dois subcomandos:

- **`run`** roda a grade de épocas, grava o diário em `<pasta>/journal.jsonl` e o `snapshot.json` ao lado, e imprime o relatório. Com `--synthetic`, `--epochs` (1 a 50000) e `--seed` (0 a 4294967295) são obrigatórios e `--planted-edge` (bps por decisão, decimal com ponto, padrão 0) planta a vantagem da seção 3.3; uma vantagem grande demais para a volatilidade e o horizonte (`rho >= 0,95`) é erro de uso. Com `--capture`, o arquivo é lido no formato da seção 3.4 (até 256 MiB, arquivo regular, sem seguir link simbólico), a grade fica nos múltiplos do passo depois de 3 dias de aquecimento e o número de épocas é o que a captura consegue terminar; `--seed` só semeia a política `random`. Passo padrão 21600000 ms (6 h), horizonte padrão 86400000 ms (24 h), vela padrão 900000 ms (15 min); passo e horizonte precisam ser múltiplos da vela. `--frozen-at-ms` registra no manifesto o instante em que a configuração foi congelada. Os números são inteiros sem sinal, sem vírgula e sem notação científica.
- **`report`** reconstrói o relatório só a partir de um diário existente (arquivo ou pasta). Recusa um diário com época incompleta.

- **Saída.** JSON do relatório no stdout (determinístico byte a byte), resumo curto em pt-BR no stderr com uma linha `Diário:` que diz quantas épocas foram novas, quantas já estavam completas e quantas estão pendentes. O seletor é sempre o `MockJevChooser`, e a primeira linha do stderr e o campo `jev.warning` dizem isso em voz alta. A última linha do stderr e o último campo do JSON são o aviso fixo de que nada prova lucro e nada concede permissão.
- **Códigos de saída.** 0: execução ou relatório completo (o relatório, não o código, carrega o veredito). 2: uso incorreto ou entrada inválida, incluindo captura mal formada ou curta demais e diário inexistente em `report`. 3: parada de integridade do diário (ausente com resultados existentes, vazio, truncado, corrompido, configuração divergente da gravada, época incompleta no `report`) ou tentativa de ler o futuro; nada é sobrescrito e o stdout fica vazio.
- **Isolamento.** Nunca lê `process.env`, nunca usa a rede, nunca assina, nunca escreve fora da pasta `--out` e só lê o arquivo de `--capture` (ou o diário). `--no-env-file` é cinto de segurança.
- **Retomada.** Repetir `run` na mesma pasta com a mesma configuração não duplica nada e completa o que faltar. Diário ausente com `snapshot.json` presente, diário vazio, truncado ou com linha malformada: a execução PARA com código 3 em vez de recomeçar vazia por cima. Para consertar um diário cortado no meio de uma linha, inspecione o arquivo, apague só a linha final incompleta e rode de novo: as épocas que faltarem serão refeitas.
- **Script sugerido** (o mantenedor liga em `package.json`; este trabalho não o altera): `"jev:lab": "bun --no-env-file run scripts/jev-lab.ts"`.

## 11. Como injetar o Jev real

O módulo `policies.ts` define o contrato `LabChooser` com o mesmo espírito do `OperatorModel`: recebe um estado só com chaves opacas (`c1`, `c2`, ...), enumerações fechadas (`modality`, `side`) e números (`null` = desconhecido), e devolve `{ choice, probabilities, confidence, latencyMs, inputTokens }`. Nada de texto livre, nome de ativo ou descrição externa entra no prompt (D1). A resposta é validada contra os ids conhecidos; `hold` é a abstenção; tempo esgotado (padrão de 15000 ms; só uma resposta assíncrona pode estourá-lo) e erro viram `hold`. O custo de inferência só é conhecido quando o chamador informa o preço por milhão de tokens (`inferenceUsdPerMTok`); sem isso fica `null`. Quem quiser o Jev real escreve o adaptador **fora** de `src/lab`, no mesmo molde de `JevOperatorModel`, por exemplo em um script próprio:

```ts
// exemplo, fora de src/lab: o laboratório nunca importa o SDK
import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
const model = typeSafeAi.evaluationModel("jev-latest");
const chooser: LabChooser = {
  name: "jev-latest", isMock: false,
  async choose(state) {
    const t0 = performance.now();
    const criteria = Object.fromEntries([["hold", "Não abrir posição nesta época."],
      ...state.candidates.map((c) => [c.key, `Abrir a posição ${c.key}: modalidade ${c.modality}, lado ${c.side}.`])]);
    const result = await experimental_evaluate({ model, state: state as any, maxRetries: 0, questions: { choice: { type: "choice", instructions: { question: "Qual posição abrir, ou nenhuma?", goal: "Maximizar retorno líquido de custos; preferir hold com evidência incerta.", inputs: "Todos os números são do passado; custos já estão incluídos em costBps." }, criteria } } as any });
    const answer = (result.answers as any).choice;
    return { choice: answer.choice, probabilities: answer.probabilities, confidence: null, latencyMs: performance.now() - t0, inputTokens: result.usage?.inputTokens ?? null };
  },
};
```

A chamada ao Jev real custa dinheiro e é não determinística: o diário guarda a decisão, e repetir a época não consulta o Jev de novo.

## 12. Limites e premissas conhecidas

1. Preço sintético é GBM sem saltos e subestima caudas; o toque de liquidação real em eventos como 10/10/2025 é pior (R3, seção 4.1).
2. Velas são tratadas como preço médio; o spread cheio mais slippage cobre o cruzamento do spread, com leve dupla contagem do "bounce". O spread de saída é igual ao de entrada.
3. A liquidação segue o modelo simplificado de margem isolada de `src/okx-derivatives/margin.ts` (não é a fórmula exata da OKX; ver o GUIA), sem degraus de manutenção, sem diferença entre mark e último preço, sem liquidação parcial e sem rebaixamento automático.
4. A margem de manutenção padrão de 1,25% é a referência de R3, não a tabela de degraus da venue.
5. O backtest de decisões independentes ignora impacto de mercado e capacidade; tamanhos reais mudam o resultado.
6. O t de Student com graus de liberdade `floor(n/(lag+1)) - 1` é uma heurística conservadora, validada por simulação para retornos sobrepostos de incrementos independentes. Séries com cauda muito pesada podem se comportar pior.
7. A correção de Holm conta só o que o relatório mostra (seção 7.3).
8. `frozenAtMs` é atestado pelo operador; o laboratório não consegue provar que nenhuma otimização aconteceu antes dele.
9. O `t` dos registros de captura é responsabilidade do coletor: preencher `t` com instante anterior ao que o dado era conhecível vaza o futuro e o laboratório não tem como perceber (só o caso da vela é verificado).
10. A mesma plataforma e o mesmo runtime dão os mesmos bytes; não se promete igualdade bit a bit entre plataformas.
11. Um único processo por pasta de saída; não há trava de arquivo.
12. O custo de inferência só entra se o chamador informar `inferenceUsdPerMTok`; sem isso fica desconhecido e o relatório diz.
13. A CLI só usa o `MockJevChooser`: medir o Jev real exige um script do chamador (seção 11) e é a parte que este repositório não faz.
14. O custo de inferência entra na série de 1x e nos múltiplos de patrimônio como uma redução da tranche, não como saque separado.
15. O mundo nulo e a vantagem plantada da seção 7.6 são construções sintéticas: provam que a máquina estatística tem o tamanho e o poder que diz ter, não que algum mercado se comporte assim.
16. O teste unilateral bruto de uma política que reage ao retorno recente é assimétrico: medido, rejeita de 1,5% a 7,2% quando o nível nominal é 5% (seção 7.6). Nenhum veredito depende só dele; a lista `flagged` exige também Holm e as comparações pareadas, e o portão exige ainda a amostra efetiva.
17. As taxas e o poder da seção 7.6 valem para o gerador sintético (movimento browniano geométrico sem saltos, um ativo de 1,5% de volatilidade diária). Caudas pesadas, saltos e volatilidade estocástica mudam os números, em geral para pior.

## 13. Verificação

```
bun --no-env-file test --parallel=1 --timeout 15000 ./src ./scripts
bun --no-env-file test src/lab/lab.integration.test.ts
bun --no-env-file run typecheck
bun --no-env-file run scripts/jev-lab.ts run --synthetic --epochs 400 --seed 7 --out <pasta temporária>
bun --no-env-file run scripts/jev-lab.ts report --journal <pasta temporária>/journal.jsonl
```

## 14. Mapa dos módulos

| Arquivo | Conteúdo |
| --- | --- |
| `src/lab/types.ts` | tipos, constantes e o formato do relatório |
| `src/lab/capture-format.ts` | `parseCaptureLine`, `parseCaptureText`, `serializeCaptureRecord`, `serializeCapture`, `CaptureFormatError` |
| `src/lab/rng.ts` | `Rng` (sfc32), `hashSeed` |
| `src/lab/source.ts` | `RecordStore`, `ReplaySource`, `SyntheticSource`, `LeakError`, `sampleBarExtremes` |
| `src/lab/candidates.ts` | `buildEpochCandidates`, `buildEpoch`, `epochIdFor` |
| `src/lab/outcomes.ts` | `COST_TABLE`, `computeEpochOutcomes`, `scanLiquidation`, `returnOnCapital` |
| `src/lab/policies.ts` | `holdPolicy`, `randomPolicy`, `buyAndHoldPolicy`, `momentumRulePolicy`, `carryRulePolicy`, `JevPolicy`, `MockJevChooser` |
| `src/lab/stats.ts` | `meanTest`, `neweyWestLrv`, `holmAdjust`, `trancheEquity`, `bootstrapLeverage`, `brierScore`, `calibrationReport`, `daysToDetectSharpe`, `buildPolicyReport`, `buildPairedReport`, `assignHolm`, `promotionGate` |
| `src/lab/journal.ts` | `FileJournal`, `MemoryJournal`, `parseJournalText`, `assertComplete`, `JournalError` |
| `src/lab/run.ts` | `runEpochs`, `buildReport`, `buildSyntheticSpec`, `buildReplaySpec`, `renderSummaryPt`, `STANDING_DISCLAIMER`, `MOCK_WARNING` |
| `scripts/jev-lab.ts` | CLI |

## 15. Fontes

- [R3, seção 4 (matemática da alavancagem) e seção 6 (envelope e critérios de promoção)](research/R3-estrategias-e-alavancagem.md).
- [Arquitetura da central de operações](ARQUITETURA-CENTRAL-DE-OPERACOES.md): D1 (Jev como seletor tipado), D4 (alavancagem é botão de risco), D11 (governança).
- [Política de limites](POLITICA-DE-LIMITES.md) e `src/policy/envelope.ts`: `kellyLowerBound`, `touchLiquidationProbability`, `medianWealthNoEdge`, `normalCdf`, `deriveLimits`.
- [Avaliador de derivativos](okx-derivatives-v1/GUIA.md) e `src/okx-derivatives/*`: `liquidationRatio`, `liquidationDistancePpm`, aritmética decimal exata.
- [Qualificação para execução real](LIVE-QUALIFICATION.md): o checklist que o dono usa; o laboratório não o substitui.
- Newey e West (1987), kernel de Bartlett; Holm (1979); Politis e Romano (1994), bootstrap de blocos móveis; Kiefer e Vogelsang (2005) para a razão entre lag e amostra.

Nada neste documento prova lucro e nada neste documento concede permissão.
