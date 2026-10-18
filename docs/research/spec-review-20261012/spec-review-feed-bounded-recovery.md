# Revisão independente: feed da fita do Jev, candidato 346577cc (commit ae5453e)

**Veredito: REQUEST_CHANGES, com um único bloqueio (F1, P2).** Os defeitos A e B, os dois P2 do 5fbfd8f2 e o achado de promoção do
Standards estão corrigidos (reproduzidos por sondas minhas, offline). F1 reabre B no regime de rajada: um timestamp futuro distante,
seguido de 256 ou mais amostras válidas entre duas leituras do mesmo par, bloqueia o par sem recuperação por refresh. Falha fechada
(0 chamadas ao modelo) e não é regressão frente a 309fcf5, mas viola "refresh válido restaura" (SPEC:197).

## 1. Alvo, integridade e baseline
- Alvo: `git archive ae5453e` extraído em pasta própria (o HEAD do worktree já andou por outras sessões; nada foi escrito no repositório).
  feed.ts: raw CRLF sha256 346577cc54c9... (736 linhas), blob LF 642c5ae845ba. feed.test.ts: raw 0220967b26e9 (1956 linhas), blob LF 49daa84350ec.
  feed.ts antigo (309fcf5): blob fa98f35c3110.
- Diff 309fcf5..ae5453e: só feed.ts (+108/-2) e feed.test.ts (+413). state, types, loop, read, decide, http, public-view e store idênticos
  (hash por arquivo). `git diff --check` limpo. A cópia terminou intacta (hash LF de cada arquivo igual ao commit).
- Baseline reproduzido: `bun --no-env-file test --timeout 60000 ./src/jev-read` = 187 pass, 0 fail, 2577 expects (feed.test.ts: 86 pass;
  com clock.test.ts: 212). `tsc --noEmit -p tsconfig.verification.json` (tsc 7.0.2) exit 0. Sem flutuação: 12 execuções seguidas de
  ./src/jev-read passam, e feed.test.ts passa em 5 sementes de `--randomize` (sem dependência de ordem).
- feed.test.ts novo contra o feed antigo: 12 dos 86 testes falham (RED real): cap com rollback, histórico perdido, 4 de recibo wall,
  4 de recuperação REST, recibo monotônico, tombstone.

## 2. Defeitos anteriores: reproduzidos como corrigidos (NEW = ae5453e, OLD = 309fcf5)
| Item | Sonda (checks) | OLD | NEW |
|---|---|---|---|
| A: retrocesso mono + teto 5000 | probe-A.ts (8) | 3 FAIL: lostThrough null, built.ok, 1 chamada | 8/8: lostThrough 200000, só trades_unavailable, 0 chamadas; borda 260000 bloqueia, 260001 recupera |
| B: ts futuro (E+60000 e 2^53-1), book/ticker x REST/WS | probe-B.ts (24) | 8 FAIL: fonte futura gravada, *_stale preso | 24/24: só *_stale do alvo, 0 chamadas; E+1 restaura com 1 chamada |
| P2: overflow de 257 pendências | probe-p2.ts P2-1 (126: n de 255 a 5000, book/ticker/ambos, REST/WS) | sem fila | 126/126 legíveis, 1 chamada, antes e depois de novo refresh |
| P2: recibo wall inválido | probe-p2.ts P2-2/2b (96: NaN, +-Inf, 0.5, -1, 2^53; mono NaN/Inf/-1) | 36 FAIL: E+100 confirmado, E+1 recusado | 96/96: recibo rejeitado (*_stale, 0 chamadas) e E+1 restaura |
| Standards: promoção sem histórico | probe-promo.ts (32: eixos fonte e mono, WS/REST) | 32/32 (desenho antigo não tem a camada) | 32/32: futuro só vira elegível com os relógios; antigo não substitui; duplicata não renova captureId; conflito faz tombstone |

Sonda A (trecho): `st.mono=130_000; prints(); st.mono=200_000; await core(); const fin = await r.inspect();`
Saída NEW: `lostThrough 200000, insufficient ["trades_unavailable"], modelCalls 0`. Saída OLD: `lostThrough null, insufficient [], modelCalls 1`.
Sonda B (trecho): `st.bookTs=E+60_000; await feed.refreshBook(INST); st.exchange=E+1; st.bookTs=E+1; await feed.refreshBook(INST);`
Saída OLD: `built {ok:false, reasons:[book_stale]}, stored 2000000060000`. Saída NEW: `built.ok true, modelCalls 1, stored 2000000000001`.
Conferência cruzada com as sondas do revisor anterior (hash idêntico ao do REPORT-SPEC-P1-P2; só a raiz do import foi trocada, cópias em
probes\prior\): rollback-cap.ts exit 0, future-watermark.ts exit 0, ordering-regressions-v2.ts exit 0 (no 5fbfd8f2 saía 1) e contract-controls.ts 195/195.

## 3. Lógica nova (diff de feed.ts): achados
**F1, P2, BLOQUEIA. feed.ts:652-655 (dobra dos despejados num envelope min/max) e 689-694 (teste do envelope).**
- Causa: `stageObservation` não conhece o relógio; uma amostra futura despejada entra em `lost.maxSourceTsMs` junto com histórico válido
  (envelope misto). `reconcile` descarta toda amostra com `source <= lost.max` enquanto o envelope tem alguma amostra não futura
  (`min <= relógio`). Dado válido só supera esse máximo quando o relógio da bolsa alcança o ts futuro.
- Gatilho (probe-threshold.ts): ts futuro e pelo menos 256 amostras válidas depois dele no mesmo canal antes da próxima leitura (257 se ele for a
  primeira da janela; com uma a menos a leitura segue ok). A rodada padrão do CLI é 5 pares x 15 s = 75 s por par (scripts/jev-read.ts:59,68,179), então bastam
  cerca de 3,4 msg/s. A taxa de ~10 msg/s da OKX em pares líquidos é suposição minha (sem rede).
- Sonda `probe-poison.ts` (ClockKeeper + readRound, janelas de 75 s a 10 Hz, uma anomalia na janela 1). NEW: sem anomalia, `ok` nas 6 janelas;
  anomalia +1 h sem rajada (100 msgs por janela), `ok`; **anomalia +1 h ou 2^53-1 com rajada: `book_missing` nas janelas 1 a 5, 0 chamadas**
  (no ticker, `ticker_missing`); +60 s recupera sozinha quando o relógio alcança o ts. OLD: `book_stale` preso nos dois regimes (defeito B).
- Não limpam o bloqueio: refresh REST (ages() é null, então readRound refaz o REST a cada rodada, mas o ts trazido é <= lost.max) e reconexão WS
  (probe-reconnect.ts). Só `stop()/start()` (probe-n.ts N3) ou o relógio da bolsa passar do ts futuro.
- Fuzz `fuzz.ts` (3400 sequências, sementes 1-400 e 1000-3999): 0 falhas de segurança e 95 de liveness, todas com n=600 e amostra futura
  na mistura (0 sem futuro). O checkpoint do autor (docs/JEV-TAPE-LOSS-RECOVERY-CHECKPOINT-20261012.md:17) já admite que envelopes mistos
  "can conservatively remain blocked" e pede avaliação independente: o resultado é este.
- Experimento em memória FIX1 (não é patch proposto): classificar o despejado contra o último relógio visto zera as falhas do eixo fonte
  (nas 3000 sementes restam 45, todas com recibo monotônico inválido) e passa probe-poison, mas quebra 1 teste (históricos "newer"/"duplicate", que saltam o
  relógio da bolsa sem reconciliar). Direção: dois envelopes (válido e futuro), promovendo o futuro quando <= relógio corrente, e um teste
  misto via readRound.

**F2, P3. Lacunas de teste (12 mutantes vivos, seção 4).** Reset da ordenação em start()/stop() (feed.ts:162,166,184,188), a única saída de F1,
sem teste (M36 vivo; probe-n N3 pega). Re-expor o confirmado ao limpar `lost` (M34 vivo; probe-older-burst pega: com M34 vira `book_missing`).
Teto 256 (M20), borda `age<60000` do teto de trades (M02, feed.ts:732).
**F3, P3. feed.ts:239, 270, 600-641.** `ages()` e `snapshot()` agora mutam estado (reconcile); há duas marcas d'água (`bookLastSourceTsMs` tentativa
e `ordering.sourceTsMs` confirmada), aplicação dupla (na entrada e no replay) e a duplicação acceptBook/acceptTicker e applyBook/applyTicker
(apontada pelo Standards) segue. Com `exchangeNow=null` o estado tentativo (inclusive ts futuro) é
exposto, mas `built.ok=false` (clock_unknown) e sem chamada (probe-n N6).
**F4, P3. Código redundante.** feed.ts:668 (`if (ordering.lost) write(null, ...)`, M33 equivalente) e feed.ts:677 (imutabilidade do recibo,
inalcançável pela API pública, M08 equivalente).

Refutados com sonda:
- Regressão de relógio: probe-A e probe-n N2 (ages() null com recibos no futuro mono; amostra nova aceita; histórico futuro não ressuscita).
- Teto e perda de fluxo (A): `fuzz-trades.ts`, 1500 sequências, 5561 leituras, 1333 retrocessos de relógio, modelo de referência com todo recibo
  recebido: NEW 0 violações (nenhuma leitura elegível subnotifica a janela de 60 s) e sempre recupera; OLD 33 violações.
- Memória: N4 (pending <= 256 por canal após 20000 amostras mistas; `lost` é O(1)).
- Ordem de chegada: guarda de captureId (M32 morto); fuzz2 S3.
- Watermark com dado inválido: P2-2 (96 checks) e fuzz S1/S2 (0 violações).
- Pendência que nunca drena: drena a cada reconcile; só o envelope misto persiste (F1).
- Duplicidade: promo e fuzz2 (captureId não renova).
- Concorrência entre awaits: N5 (resposta REST após stop/start é descartada); o teste novo de candle expirando durante o await do ticker real passa.
- Disponibilidade: probe-longrun.ts (16 janelas a 10 Hz, 3 Hz e 0,2 Hz, com duplicatas e reinício) legível; fuzz2.ts (750 sequências, 43233 leituras,
  0 violações de ordem/TTL; elegíveis 4634 de 8536 no NEW contra 2820 de 8536 no OLD).

## 4. Mutações (36 em memória; plugin de preload do Bun reescreve o texto de feed.ts; nenhum arquivo do repositório alterado)
SENTINEL (lança ao carregar) provou o plugin efetivo sob `bun test`; sem MUT ele é inerte (86 pass). Cada mutante rodou em feed.test.ts e em
./src/jev-read inteiro, com resultados idênticos: nenhum outro arquivo de teste mata algo a mais.
- **Mortos 24/36, e o teste que pega:**
  - "cap loss during monotonic rollback blocks the model after the clock returns": M01. "cap removal outside the flow window ...": M03.
  - "lost ordering history blocks ambiguous data and permits proven recovery": M05, M11, M12, M13, M14, M17, M19, M35 (oito mutantes do
    envelope dependem só deste teste, que é frágil: um único laço de 2 transportes x 4 históricos) e também M04, M06, M15, M16, M21, M28, M29.
  - "invalid wall receipts do not poison {book,ticker} ordering through {REST,WS}" (4 testes): M07, M16, M28, M29.
  - "an invalid monotonic receipt cannot confirm a newer source watermark": M09. "valid REST book and ticker recover with intermediateRead/wallJump" (4): M04, M15, M22.
  - "future observations confirm ordering before becoming eligible for the model": M06, M16, M21. "valid bursts preserve ordering and recover without restarting the feed": M18, M25, M27.
  - "REST snapshots for quiet markets > older and duplicate ticker/book": M18, M25, M27. "... delayed earlier book ...": M32.
- **Vivos 12/36:** M02 (borda age<60000), M08, M10 (validação feedId/época/wsGeneration no reconcile), M20 (teto 256 para 2), M23, M24, M36 (sem reset em
  start()/stop()), M26 (guarda do relógio mono), M30 e M31 (validade do despejado no envelope), M33, M34 (não re-expor o confirmado).
  Equivalentes ou redundantes: M08, M33 e, isolados, M23 e M24 (um reset cobre o outro). Lacunas reais: M36, M34, M10 (alcançáveis em produção),
  M02, M20, M30, M31 (borda ou relógio inválido) e M26 (só com monotônico quebrado).
- Sensibilidade das minhas sondas: A morre sob M01 (3 FAIL), B sob M04 (8), p2 sob M07 (20), promo sob M16 (8) e M18 (4).

## 5. Segurança (src/jev-read/feed.ts inteiro e linhas adicionadas)
- Imports: só `./types`. Sem `process`, `Bun.env`, `import.meta`, `.env`, segredo, token, HMAC ou `crypto.subtle`; `crypto.randomUUID()` só para o feedId.
  Sem fs, child_process, eval, Bun.file/write. Nenhuma linha adicionada toca rede, arquivo, ambiente ou criptografia.
- Rede (inalterada): GET público, sem cabeçalho nem corpo, em `https://www.okx.com` (`/api/v5/market/books|ticker|candles`, `/api/v5/public/funding-rate`)
  e WebSocket `wss://ws.okx.com:8443/ws/v5/public`; `socket.send` só envia subscribe de books5, trades, tickers e "ping". Sem login, canal privado, ordem,
  assinatura ou aprovação. Timers: deadline REST de 5 s e backoff de reconexão. Arquivos tocados: nenhum. feed.test.ts: sem fs, rede ou env (URLs só em expects).

## 6. Veredito e bloqueio exato
**REQUEST_CHANGES. Bloqueia apenas F1:** impedir que uma amostra futura envenene o envelope de histórico perdido (dois envelopes, válido e futuro, com
promoção quando o relógio alcança) e acrescentar o teste misto (ts futuro + 256 ou mais amostras válidas) via feed.snapshot e readRound, em book e
ticker, com controle sem rajada. F2 a F4 são notas P3 e não bloqueiam. Se o dono aceitar F1 como limitação documentada (checkpoint:17, falha fechada,
saída por reinício), o restante qualifica APPROVE_WITH_NOTES. Não reexecutei a matriz VERIFY completa (SPEC:186-217), o replay original imutável, build
nem prova visual: UNKNOWN. Modelo e esforço efetivos deste revisor: não verificados.

## 7. Evidências e reprodução
- Pasta: `...\scratchpad\spec-review\feed-review\` com probes\ (lib, probe-A, -B, -p2, -promo, -poison, -n, -reconnect, -older-burst, -longrun, -threshold, fuzz, fuzz2, fuzz-trades, prior\ com as sondas do revisor anterior),
  harness\ (mutate-preload.ts, run-mutations.ts), logs\ (saída .json por sonda em NEW e OLD, mutations.json, mut\*.xml) e old\feed-old.ts (309fcf5 com import absoluto de types).
- sha256 (12 hex): lib 7dd1bebc31b2, probe-A 46e7ef5aa6e9, probe-B b1cdd861c421, probe-p2 1b520b3d60c9, probe-promo 32d0e4add616, probe-poison 8e041a32a3e6,
  probe-n 4cace0f585e1, probe-reconnect 18597c5174f8, probe-older-burst 34a5bde9f63c, probe-longrun af2887d8b33c, fuzz 5d8e09768898, fuzz2 8ded76863930,
  probe-threshold 219ce804ee1c, fuzz-trades 13ffdaaa3d67, mutate-preload cd81be389ed4, run-mutations 7ea1f981cce7, feed-old 8d7d7632fca1.
- Reproduzir: `git archive ae5453e | tar -x -C <pasta>`; robocopy de node_modules (112 MB, sem junção); em cwd vazio, `FEED_IMPL=<feed.ts ou old\feed-old.ts>
  bun --no-env-file <probe>.ts`; mutantes: `MUT=Mxx bun --no-env-file test --preload harness\mutate-preload.ts ./src/jev-read/feed.test.ts` (cwd na cópia).
  Sem rede, sem .env, sem --live. lib.ts e old\feed-old.ts apontam para o caminho absoluto `feed-review\copy-ae5453e` (removido): recriar a cópia nele.
- Incidente de processo: um `cat` e um `python3 -` meus ficaram presos em stdin por erro de comando; encerrei só esses dois PIDs (nenhum processo de outra
  sessão foi tocado). A cópia extraída foi removida ao final.
