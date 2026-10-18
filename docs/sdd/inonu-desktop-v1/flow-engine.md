# Motor de inteligência: fluxo, zonas, trilha do dinheiro esperto e Evidence Brief

Parte do [SPEC](SPEC.md): FLX-1 a FLX-12, SMT-1 a SMT-7, ING-1 a ING-4, ASK-3. Tarefas: M5, M6 e T7.1 em [TASKS.md](TASKS.md). Código em `src/intel/**` (novo, TypeScript puro, sem E/S, sem rede, sem relógio: o tempo entra por parâmetro). Nenhum rótulo, campo ou texto do motor usa vocabulário de ordem (lista exata em FLX-10), exceto os campos `side` do lado agressor dos negócios e a coluna `aggressor`. O motor descreve; **o modelo (Jev) decide a ação** (ASK-4). Revisão 2: incorpora os achados 22 a 26 da [revisão independente](evidence/revisao-independente-1.md).

## 1. Entradas, unidades e normalização

Negócio (canal público `trades` da OKX): `{ ts: ms, px: texto decimal, sz: texto decimal, side: "buy" ou "sell" (lado agressor, ou seja, o taker) }`. Vela: janela UTC alinhada ao intervalo (`abertura = piso(ts / intervalo) * intervalo`) para 1 m, 5 m, 15 m, 1 H, 4 H, 1 D.

- **Unidade (FLX-11).** No spot, `sz` é em moeda base. Em perpétuo e futuro, `sz` é em **contratos**: converte-se para moeda base por `ctVal * ctMult` de `public/instruments` (por exemplo `BTC-USDT-SWAP`: `ctVal` 0,01, `ctMult` 1, `lotSz` 0,01 contrato; 5 contratos = 0,05 BTC). Toda soma é em moeda base; spot e perpétuo nunca se misturam sem conversão. O piso `lotSz` também é convertido (`lotSz * ctVal * ctMult`).
- **Inteiros exatos.** Os volumes são convertidos para inteiros na unidade `u = lotSz` em moeda base (decimais exatos, sem ponto flutuante); somas, razões e comparações `>=` são feitas sobre inteiros. Só a nota final usa ponto flutuante e é arredondada em 2 casas.
- **Nível de preço.** `nivel = piso(px / (binTicks * tickSz))` por aritmética decimal exata (escalonar por 10 elevado ao maior número de casas e usar inteiros grandes). `binTicks` é inteiro `>= 1`. Padrão automático: `binTicks = max(1, teto(medianaDaAmplitudeEmTicks(últimas 20 velas fechadas) / 30))`, calculado **no início de cada sessão UTC e fixo durante ela**; os limiares adaptativos usam o **volume por tick** (volume do nível dividido por `binTicks`), assim velas de larguras diferentes são comparáveis.
- **Footprint de uma vela:** mapa `nivel -> { c, v }` com `c` = soma de `sz` dos negócios com `side = "buy"` e `v` = com `side = "sell"`. Notação: `A_c(L)` e `A_v(L)`; níveis em ordem crescente de preço; "vizinho de baixo" é `L-1` e "de cima" é `L+1`; nível ausente vale 0 e **quebra** qualquer sequência.
- **ATR14.** ATR de Wilder de 14 períodos sobre as velas **fechadas do mesmo intervalo** da vela analisada (mesma definição do SMC em `docs/sdd/grafico-jev/spec.md`).
- **Coalescer (ING-1).** Entradas: negócios e atualizações de livro. Saídas: barras de 1 s, 5 s e 1 min por tempo do evento; fila limitada (padrão 5000 negócios por instrumento) com descarte contado e exposto. Recalcular só na barra fechada (ING-2). Contadores de mensagens por segundo por fonte (ING-3).

## 2. Fatores de fluxo (FLX-2 a FLX-7)

A fonte (Nelogica, Plugin Tape Reading) define cada fator por exemplos e não dá fórmula. As definições abaixo são **operacionais e próprias**: semelhantes, **não idênticas** ao Profit Pro. Os números dos exemplos da fonte são reutilizados nos vetores, mas a disposição por nível e as contrapartes são **escolhidas por nós** e marcadas assim. Todo limiar é parâmetro (2.8), nunca constante de mercado. Parâmetros iniciais: Imbalance `X = 3` (o exemplo da fonte usa 2), Sequencial `N = 3`, Progressão `X = 3`, Exaustão `X = 3`, Fator Volume `K = 1`.

### 2.1 Imbalance (FLX-2)

Parâmetros: `X` (razão, `> 1`, até três casas decimais; comparação exata em milésimos), `minVol` (piso de volume, inteiro `>= 1`), `modo`: `diagonal` (padrão) ou `horizontal`.

- Modo `diagonal`: desequilíbrio **de compra** em `L` se `A_c(L) >= X * A_v(L-1)` e `A_c(L) >= minVol`; desequilíbrio **de venda** em `L` se `A_v(L) >= X * A_c(L+1)` e `A_v(L) >= minVol`.
- Modo `horizontal`: compra se `A_c(L) >= X * A_v(L)`; venda se `A_v(L) >= X * A_c(L)`; ambos com `>= minVol`.
- Contrapartida ausente (0): a desigualdade vale e só o piso `minVol` decide.
- Resultado por nível: `imb` é `"c"`, `"v"`, `"cv"` (as duas desigualdades passam, possível no modo diagonal) ou `null`.

### 2.2 Sequencial (FLX-3)

Parâmetros: `N` (inteiro `>= 2`), mais os do Imbalance. Marca corridas **maximais** de `N` ou mais níveis adjacentes com o mesmo lado de desequilíbrio (2.1); um nível `cv` participa das corridas **dos dois lados**. Resultado: lista de corridas `{ lado, nivelInicial, nivelFinal, comprimento }`, e cada nível da corrida recebe `seq: lado`.

### 2.3 Progressão (FLX-4)

Parâmetros: `X` (inteiro `>= 2`, número de **níveis** consecutivos, ou seja, `X - 1` passos) e `minVol` (inteiro `>= 1`: piso do volume do lado em cada nível da corrida; um nível abaixo do piso encerra a corrida). Para o lado de compra percorre-se o preço em sentido crescente; para o de venda, em sentido decrescente. Há progressão quando existe uma corrida **maximal** de `X` ou mais níveis adjacentes com volume agredido do mesmo lado **estritamente crescente** (`A_c` na compra, `A_v` na venda). O comprimento reportado é o da corrida maximal. Resultado: `{ lado, niveis[], comprimento }`.

### 2.4 Exaustão (FLX-5)

Parâmetros: `X` (inteiro `>= 2`) e `minVol` (inteiro `>= 1`, piso aplicado ao volume líquido de cada nível da cadeia). A cadeia reportada é a **maximal** que termina no extremo (pode ter mais de `X` níveis). No extremo **inferior** da vela (menor nível com negócio), seja `D_v(L) = A_v(L) - A_c(L)`. Há exaustão de venda se existirem `X` níveis adjacentes terminando no extremo com `D_v > 0` e **estritamente decrescente** em direção ao extremo (do nível mais alto para o extremo). No extremo **superior**, simetricamente com `D_c(L) = A_c(L) - A_v(L)`. Resultado: `{ extremo: "baixo" ou "alto", niveis[], valores[] }`. Exaustão não prevê nada: descreve enfraquecimento da agressão dominante no extremo.

### 2.5 Fator Volume, Ordem original e Alerta de quantidade (FLX-6)

- **Fator Volume `K` (0 a 3).** Ordena os níveis por volume total `A_c + A_v` decrescente; empate pelo menor nível; marca os `K` primeiros com o lado dominante (`c` se `A_c > A_v`, `v` se `A_v > A_c`, `n` se igual).
- **Ordem original `T`.** Cada negócio individual com `sz >= T` é contado no seu nível: `{ nivel, quantidade, maior }`.
- **Alerta de quantidade `Q`.** Nível com `A_c(L) >= Q` ou `A_v(L) >= Q`, **por lado** (não pela soma).

### 2.6 Delta, CVD e absorção (FLX-7)

- `delta(vela) = soma(A_c) - soma(A_v)`; `cvd(sessão) = soma acumulada de delta` desde 00:00 UTC **ou desde o primeiro negócio recebido**, o que for mais tarde, e declara `desde` (FLX-12).
- **Absorção** do lado `S` na vela: verdadeira se `volume_S >= P90(volume_S, N = 50 velas fechadas)` e o deslocamento do preço **no sentido de `S`** for pequeno: para venda, `max(0, abertura - fechamento) <= 0,25 * ATR14` (queda pequena apesar de muita venda agressiva); para compra, `max(0, fechamento - abertura) <= 0,25 * ATR14`. Parâmetros `0,25` e `N` são configuráveis; resultado `{ lado, razaoVolume, deslocamentoEmATR }`.

### 2.7 Perfil de volume (FLX-7)

Sobre uma janela (sessão UTC ou últimas N velas): volume total por nível `V(L)`. **POC** = nível de maior `V` (empate: o mais próximo do fechamento; empate de distância: o menor nível). **Área de valor**: parte do POC e, a cada passo, acrescenta o vizinho (acima ou abaixo) de **maior** volume (empate: acima; vizinho inexistente não conta) até somar `>= 70%` do total; reporta `VAL` e `VAH`. **HVN**: máximos locais estritos (maior que os dois vizinhos; um platô de níveis iguais conta como um só, no menor nível) com `V >= P80(V)`. **LVN**: mínimos locais estritos (mesma regra de platô) com `V <= P20(V)` e `V > 0`. Níveis nas bordas da janela não são extremos.

### 2.8 Limiares adaptativos e aquecimento (FLX-8, FLX-12)

Percentis móveis sobre as últimas `N` velas fechadas (padrão `N = 50`), por instrumento e intervalo, sobre o **volume por tick**; sem constante de mercado:

| Limiar | Cálculo | Piso (metadado do instrumento, não de mercado) |
| --- | --- | --- |
| `minVol` | `P50` do volume total por nível | `lotSz` em moeda base |
| `Q` | `P90` do volume agredido por nível e lado | `lotSz` em moeda base |
| `T` | `P99` do `sz` de negócio nas últimas 2000 negócios | `lotSz` em moeda base |

Percentil `P` (inteiro de 0 a 100) sobre `N` valores: método do posto mais próximo, ordem ascendente, sem interpolação, com aritmética inteira: `posto = teto(P * N / 100)` (base 1, mínimo 1); resultado é o valor nesse posto.

**Aquecimento (FLX-12).** Antes de `N` velas fechadas, `minVol`, `Q`, `T`, a absorção e o CVD de sessão são `null` com motivo `aquecimento`, e **nenhum fator usa limiar parcial como se fosse completo**. O motor aceita um backfill opcional de `market/history-trades` (REST público da OKX, até 100 negócios por chamada, custo REST declarado no diagnóstico) para encurtar o aquecimento; sem backfill o aquecimento dura `N` velas do intervalo.

**Memória entre execuções (FLX-12, revisão r3).** O coletor grava, a cada minuto fechado, o histórico por minuto (níveis `c` e `v` e o `binTicks` de cada vela) e os últimos 2000 tamanhos de negócio em `data/flow/flow-<instrumento>.json` (escrita atômica, só os campos documentados, nunca os negócios). Ao começar a seguir um instrumento ele relê o arquivo se tiver até 6 horas e se passar na validação estrita (formato, limites, números finitos e não negativos, instrumento igual, carimbo não futuro); qualquer outra coisa é "sem memória". O que volta conta como minutos fechados e a interface diz quantos (`restaurado`, "com historico salvo (N min)"); a nota some quando 50 minutos novos o substituíram. Os limiares são por tick, então histórico de largura de nível diferente continua comparável. Medido ao vivo: depois do primeiro minuto fechado os quatro arquivos existem e, reiniciado o núcleo, a leitura devolve `fechadas: 1, restaurado: 1`.

### 2.9 Equivalente on-chain (FLX-9)

Rotulado `aprox: true` e `fonte`. De `market/trades` (até 500 negócios por chamada, com `type` buy ou sell e `volume` em USD): footprint aproximado por faixa de preço em USD, mesma álgebra, sobre os últimos 500 negócios (não a vela inteira). De `hot-token`, e **só dele**: `buyShare = txsBuy / (txsBuy + txsSell)` e `inflowUsd / volume` por janela de 5 m, 1 h, 4 h e 24 h (uma chamada por janela). O `price-info` traz apenas totais (`txs5M` a `txs24H`, `volume*`), sem lado. Faixa: tokens do topo; resto `null` com motivo.

## 3. Zonas de interesse dinâmicas (SMT-1, SMT-2, SMT-5)

**Famílias de evidência** (independentes; cada uma emite propostas `{ baixo, alto, lado, forca, ts }` com `forca` em 0..1; o `lado` aqui é descritivo, demanda ou oferta, nunca uma ordem):

| Família | Fonte | Proposta | Peso |
| --- | --- | --- | --- |
| E1 estrutura | SMC existente (`web/src/lib/desk/chart/smc.ts`): blocos de ordem, FVG, liquidez | zona do bloco ou do FVG ativo; `forca` pelo preenchimento e idade | 1,0 |
| E2 footprint | 2.1 a 2.6 | faixa de imbalances empilhados (Sequencial) e de absorção ou exaustão no extremo | 1,0 |
| E3 perfil | 2.7 | POC, HVN (referência) e LVN (vazio) | 0,8 |
| E4 livro | profundidade persistente (`books`) | paredes que sobrevivem a `>= 5` snapshots de 1 s | 0,6 |
| E5 VWAP ancorado | negócios desde o último pivô | faixa de `±0,5 * ATR14` em torno do VWAP ancorado | 0,5 |
| E6 custo inteligente | 4. (só ativos on-chain) | referência de custo médio das carteiras rastreadas | 1,2 |
| E7 derivativos | funding e open interest da API pública da OKX, lidos em TypeScript (sem Python) | **modificador**: ajusta a `forca` das outras famílias entre 0,8 e 1,2 conforme o regime; sem dado vale 1,0; nunca zona isolada nem entra no denominador | n/a |

**Fusão:** propostas que se sobrepõem ou ficam a até `0,25 * ATR14` viram uma zona. **Nota:** `nota = 100 * soma(w_f * s_f) / soma(w_f das famílias habilitadas para o ativo)`, onde `s_f` é a maior `forca` da família na zona (0 se ausente). O denominador soma só as famílias **habilitadas para aquele ativo** (E6 só on-chain), então a nota **não é comparável entre ativos com conjuntos diferentes**; o Brief traz `familiasHabilitadas`. Pesos iniciais **configuráveis e registrados** no journal: E1 1,0; E2 1,0; E3 0,8; E4 0,6; E5 0,5; E6 1,2. São priors e **não** afirmam desempenho: a validação é T6.6.

**Decaimento:** `nota_t = nota * 0,5 ^ (idadeEmBarras / meiaVida)`, `meiaVida = 50` barras do intervalo da zona. **Estados** (precedência de cima para baixo): `expirada` (zona que já existia e cuja nota decaída ficou `< minNota`, ou idade `> idadeMax`); `mitigada` (fechamento além do limite oposto); `testada` (o preço entrou na zona sem fechar além do limite oposto); `ativa` (nota `>= minNota` e `>= 2` famílias com `s >= 0,2`); `fraca` (nota `>= minNota` com menos de 2 famílias: candidata, **não** é oferecida ao modelo). Uma proposta nova com nota `< minNota` não vira zona. `minNota = 15`, `idadeMax = 500` barras (parâmetros). **Invalidação:** limite oposto `± 0,1 * ATR14`. **Lado:** `demanda` ou `oferta` pela maioria ponderada das propostas; empate é `neutra`. **Identidade estável:** hash de `(lado, nivelBaixo, nivelAlto, primeiroTs)`. **Saída:** até 6 zonas ativas ou testadas mais próximas do preço por intervalo. **Recalcular** a cada barra de 1 min fechada (SMT-2).

## 4. Trilha do dinheiro esperto on-chain (SMT-3, SMT-4)

Por token, janela de `72 h` (parâmetro). Duas estimativas **separadas**, sem misturar unidades:

- `custoSinais = soma(price_i * amountUsd_i) / soma(amountUsd_i)` sobre os `signal/list` do token; `distribuicao = soma(amountUsd_i * soldRatioPercent_i / 100) / soma(amountUsd_i)`.
- `custoTopTraders = soma(avgBuyPrice_j * boughtAmount_j) / soma(boughtAmount_j)` de `top-trader` com `tagFilter = 3`, e `vendaTopTraders = soma(soldAmount) / soma(boughtAmount)`. É corroboração: quando `custoTopTraders` fica a até `0,5 * ATR14` de `custoSinais`, a `forca` de E6 sobe 10% (teto 1,0).
- Família E6: faixa `custoSinais ± 0,5 * ATR14` com `forca = max(0, 1 - distribuicao)`. É uma **referência de custo**, não um alvo.
- O gateway repassa os endereços de `triggerWalletAddress` **só ao motor, no servidor** (SMT-4), para obter a taxa de acerto no `leaderboard`.

Pontuação por token (0..100), componentes normalizados em 0..1, ausentes excluídos e listados em `componentesAusentes`: compra líquida `log1p(soma(amountUsd * (1 - soldRatio))) / log1p(P95 do conjunto)`; carteiras `min(1, n / 10)`; fração não vendida `1 - média(soldRatioPercent)/100`; qualidade da carteira (média de `winRatePercent` do `leaderboard` em cache); concentração (`clusterConcentration` Baixa 1, Média 0,5, Alta 0; `top10HolderPercent`); risco (`riskControlLevel` e tags; `honeypot` zera a nota inteira); liquidez `min(1, liquidez / P75 do conjunto)`; fluxo `buyShare`; sentimento `bullishRatio`. `nota = 100 * soma(w_k * s_k) / soma(w_k dos presentes)`. Pesos iniciais configuráveis e registrados: compra 1,5; carteiras 1,0; naoVendida 1,0; qualidade 1,0; concentracao 1,0; risco 1,5; liquidez 0,8; fluxo 0,8; sentimento 0,4. Também são priors.

## 5. Evidence Brief v1 (ASK-3)

Objeto JSON por **instrumento ou token** (o orçamento de 2 KB vale por objeto, não por zona), `schemaVersion: 1`, ordenado deterministicamente, com hash SHA-256 sobre a forma canônica:

```
{ schemaVersion: 1, alvo: { instId } ou { chainIndex, address }, asOfMs, hash, familiasHabilitadas: [...],
  fluxo: { delta, cvd, desde, imb: {c,v}, seq, prg, exh, absorcao, aprox },   // contagens e níveis, nunca ticks
  candidatos: [ { id, tipo: "zona" | "token" | "spot" | "perp" | "manter",
                  limitesBps?: [baixo, alto], nota?, fatores?: [...], idadeBarras?, estado?, invalidacaoBps? } ],   // neutros: sem lado de ordem
  trilha: { nota, componentes: {...}, componentesAusentes: [...] } ou null,
  risco: { nivel, flags: [...] } ou null,
  regime: { funding, oiVar, btcBeta } ou null,
  idades: { <campo>: ms },  origens: { <campo>: "okx_public_v5" | "onchainos" | "wallet" },
  nulos: { <campo>: "motivo" } }
```

Distâncias em pontos-base do preço atual. Campos desconhecidos são `null` com motivo em `nulos`. **Ordem de descarte** quando passar de 2 KB: primeiro `fatores` e `componentes`, depois zonas de menor nota, depois `regime`, mantendo sempre `candidatos` (ids), `idades` e `nulos`. O Brief só é regerado se um fator cruzar limiar material: mudança de `estado` de uma zona, aparição ou fim de uma corrida (Sequencial, Progressão, Exaustão), variação de `nota` maior ou igual a 10, ou idade de um dado acima do TTL. **Contrato de `POST /inonu/ask`** (T7.3): pedido `{ modo: "ativo" ou "token" ou "descoberta" ou "filtro" ou "ranking", alvo?, textoLivre? }` (o texto livre só no modo filtro, onde o modelo recebe apenas o esquema de filtros); resposta `{ ok, id, status: "respondido" ou "em_andamento" ou "teto_atingido" ou "cooldown" ou "cancelado" ou "sem_chave" ou "erro", decisao?: { action, candidateId, pesos, razao, modelo }, custo: { chamadasOnchainos, tokens, usd } (null quando desconhecido), briefHash }`. HTTP: 200 respondido, 202 em andamento, 400 pedido inválido, 429 teto ou cooldown, 503 sem chave do modelo; `DELETE /inonu/ask/<id>` cancela. Os filtros de sinais do gráfico persistem em `localStorage` sob `inonu.chart.signals.v1`.

**Pergunta ao modelo:** escolha uma ação (buy, sell ou hold) e um `candidateId` dentre os ids do Brief (nulo em hold); o código descarta qualquer resposta fora desse conjunto (ASK-4) e **nunca** traduz o lado de uma zona em ação.

## 6. Vetores de teste (calculáveis à mão)

Todos com `origin: synthetic_fixture` (só em testes). Salvo indicação, `lotSz = 1` e `minVol = 1`.

**V-FOOT-1** (negócios para footprint), `tickSz = 0,5`: `(100,0; 2; buy)`, `(100,0; 3; sell)`, `(100,5; 1; buy)`, `(100,5; 4; buy)`, `(101,0; 6; sell)`. `binTicks = 1`: nível 200 `{c 2, v 3}`; nível 201 `{c 5, v 0}`; nível 202 `{c 0, v 6}`. `binTicks = 2`: nível 100 `{c 7, v 3}`; nível 101 `{c 0, v 6}`. Delta da vela = 7 - 9 = -2.

**V-PERP-1** (FLX-11): `ctVal = 0,01`, `ctMult = 1`, `lotSz = 0,01` contrato (0,0001 BTC). Negócios no mesmo preço: 5 contratos `buy` e 3 contratos `sell`: em moeda base 0,05 e 0,03 BTC; em unidades de `u = 0,0001 BTC`: compra 500, venda 300; delta = +200 unidades = +0,02 BTC.

**V-BIN-1**: mediana da amplitude das 20 últimas velas = 90 ticks: `binTicks = max(1, teto(90 / 30)) = 3`; mediana 25: `max(1, teto(25 / 30)) = 1`.

**V-IMB-1** (fonte, horizontal, `X = 2`): nível 1000 `{c 80, v 215}` -> desequilíbrio de venda em 1000 (`215 >= 160`); sem desequilíbrio de compra (`80 >= 430` falso). *Os números 80 e 215 vêm da fonte; o nível e o modo são nossos.*

**V-IMB-2** (diagonal, `X = 3`, `minVol = 10`): níveis `100 {c 5, v 40}`, `101 {c 130, v 12}`, `102 {c 20, v 60}`. Compra em 101 (`130 >= 3 * 40`); venda em 102 (`60 >= 3 * 0` e `60 >= 10`); nenhum outro. Resultado: `{101: "c", 102: "v"}`.

**V-SEQ-1** (horizontal, `X = 2`, `N = 3`, `minVol = 1`): níveis 200 a 202 com `A_c = 475, 315, 560` e `A_v = 100, 80, 120` (compra em todos); nível 203 `{c 30, v 25}` sem desequilíbrio. Corrida de compra `{inicial 200, final 202, comprimento 3}`. Com `N = 4`: nenhuma. *Valores 475, 315 e 560 da fonte; contrapartes nossas.*

**V-PRG-1** (`X = 3`, `minVol = 1`): compra em 300 a 302 com `A_c = 50, 190, 290` e em 303 `A_c = 120`. Progressão de compra nos níveis 300, 301, 302 (corrida maximal de comprimento 3; 303 a quebra). Negativo: `50, 190, 190` não é progressão. *Valores 50, 190 e 290 da fonte.*

**V-EXH-1** (`X = 3`, `minVol = 1`): extremo inferior em 400; níveis 402, 401, 400 com `A_v = 385, 165, 30` e `A_c = 0, 0, 0`: exaustão de venda `{extremo: baixo, niveis: [402, 401, 400]}`. Negativo: `385, 165, 170`. *Valores 385, 165 e 30 da fonte.*

**V-VOL-1**: totais `500: 120`, `501: 300`, `502: 80`, `503: 300`. `K = 1` marca 501; `K = 2` marca 501 e 503; `K = 3` marca 501, 503 e 500.

**V-ORD-1** (`T = 250`): negócios no nível 1000 com `sz` 100, 250 e 400: 2 ordens originais, `maior = 400`; no nível 1001 um negócio de 249: nenhuma.

**V-QTY-1** (`Q = 500`): nível com `A_c = 500, A_v = 499`: alerta só do lado de compra; nível com `A_c = 300, A_v = 300`: nenhum (por lado, não pela soma).

**V-CVD-1**: três velas com `(soma A_c, soma A_v)` = (100, 60), (50, 90), (200, 20): deltas +40, -40, +180; CVD 40, 0, 180.

**V-ABS-1** (venda): `volume_v = 900`, `P90` das 50 velas anteriores = 800, `abertura = 100`, `fechamento = 99,8`, `ATR14 = 2`: queda de `0,2 <= 0,5` e volume `>= P90`: absorção de venda verdadeira com `razaoVolume = 1,125`. Com `fechamento = 98`: queda de `2 > 0,5`: falsa.

**V-POC-1**: volumes por nível `10:5, 11:20, 12:50, 13:30, 14:30, 15:10, 16:60, 17:10` (total 215). POC = 16. Área de valor (70% de 215 = 150,5): 16 (60); vizinhos 15 e 17 empatam em 10, vai acima: 17 (70); acima não há, 15 (80); 14 (110); 13 (140); 12 (190, atinge): `VAL = 12`, `VAH = 17`. `P80` dos 8 volumes ordenados `[5, 10, 10, 20, 30, 30, 50, 60]` é o 7º valor = 50: HVN em 12 (máximo local, 50) e 16. `P20` é o 2º valor = 10: LVN em 15 (mínimo local entre 30 e 60); o nível 17 está na borda e não conta.

**V-ZONA-1** (todas as famílias de 1.0 a 1.2 habilitadas, soma dos pesos 5,1): zona com `s_E1 = 0,8` e `s_E2 = 0,6`, demais 0: `nota = 100 * (1,0 * 0,8 + 1,0 * 0,6) / 5,1 = 27,45`; 2 famílias com `s >= 0,2`: `ativa`. Com `idade = 50` barras e `meiaVida = 50`: `nota = 13,73 < 15`: `expirada`.

**V-ZONA-2** (fusão e estados, `ATR14 = 2`, ativo da OKX sem E6, soma dos pesos 3,9): proposta E1 `[100,0; 101,0]` `s = 0,8` e proposta E2 `[100,8; 101,5]` `s = 0,6` se sobrepõem e fundem em `[100,0; 101,5]`; `nota = 100 * 1,4 / 3,9 = 35,90`, 2 famílias: `ativa`. Uma mínima de 100,7 sem fechar abaixo de 100,0: `testada`. Um fechamento em 99,9: `mitigada`. Uma única proposta E3 com `s = 0,9`: `100 * 0,8 * 0,9 / 3,9 = 18,46 >= 15` com 1 família: `fraca` (não vai ao modelo); com `s = 0,5`: `10,26 < 15`: não vira zona.

**V-CUSTO-1**: sinais `(price 2,00; amountUsd 1000; sold 10%)` e `(2,50; 3000; 50%)`: `custoSinais = (2000 + 7500) / 4000 = 2,375`; `distribuicao = (100 + 1500) / 4000 = 0,40`; `forca(E6) = 0,60`.

**V-TRAIL-1**: componentes `compra 0,8; carteiras 0,6; naoVendida 0,6; qualidade ausente; concentracao 0,5; risco 1,0; liquidez 0,4; fluxo 0,7; sentimento ausente`. Pesos presentes `1,5 + 1,0 + 1,0 + 1,0 + 1,5 + 0,8 + 0,8 = 7,6`; soma ponderada `1,2 + 0,6 + 0,6 + 0,5 + 1,5 + 0,32 + 0,56 = 5,28`; `nota = 100 * 5,28 / 7,6 = 69,47`; `componentesAusentes = [qualidade, sentimento]`. Com `honeypot`: nota 0.

**V-PERC-1**: `P90` de `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]`: `posto = teto(90 * 10 / 100) = 9`, valor 9. `P50` de `[10, 20, 30, 40]`: `posto = 2`, valor 20. `P100` de qualquer lista é o máximo.

## 7. Camada de gráfico (T5.7, T6.4)

Marcas ligáveis por grupo ("Fluxo", "Zonas") com persistência local: caixa de Sequencial, barra lateral de Progressão e de Exaustão, realce de Fator Volume, número de Delta sob a vela, retângulos de zona com estado e nota, linha tracejada de invalidação. Texto de rótulo sem acentos, sem ponto médio, travessão ou meia-risca, sem animação piscante; cores do tema atual. Nenhum rótulo diz comprar ou vender; o marcador de decisão do Inonu é separado e identificado como tal e é o **modelo** que escolhe a ação.
