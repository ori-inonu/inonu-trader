# Cluster jev-read: revisão de especificações (somente leitura)

Árvore alvo: `integ/consolidation` 8d0611a (`C:\Users\gabri\jev-trader-integ`), revisada em 2026-10-12. Escrevi só neste diretório. Docs e checkpoints foram tratados como fonte; cada status vem de código e teste. "Por leitura" = não executei.

## 0. O que eu executei (cwd temporário, `bun --no-env-file test`, repositório intacto depois: `git status` com 0 linhas)

| Comando | Resultado |
|---|---|
| `src/jev-read` (feed, state, read, loop, publish) | 170 pass, 0 fail, 1940 expects, 1,1 s |
| `src/system-one` (6 arquivos) | 102 pass, 0 fail, 361 expects |
| `web/src/lib` jev-read, system-one, system-one-poll | 41 pass, 0 fail |
| `scripts/http-preview.test.ts` | 4 pass, 0 fail, 107 expects, 23 s |
| Cópia temporária: integ + `feed.ts`/`feed.test.ts` do worktree Codex tape-data | 187 pass, 0 fail, 2577 expects |
| Sonda minha `work/probe-ab.ts` (fakes, sem rede) sobre os dois `feed.ts` | integ reproduz os defeitos A e B; a versão do worktree os corrige (ver 2.2) |

Logs, sonda e o script de comparação de hashes dos worktrees em `work/` (run-*.log, probe-ab.ts, cmp_wt.sh). Nenhuma rede externa (só loopback), nenhum `.env`, nenhum `--live`. Todo `git` rodou com `--no-optional-locks` e só leu.

## 1. Contagem por especificação

| Especificação | DONE | PARTIAL | MISSING |
|---|---|---|---|
| JEV-READ-MODEL-SAFETY V2 (M1 a M6; achados F5 e F6) | 6 | 0 | 0 |
| JEV-TAPE-DATA F1 a F4 SPEC V2 (9 linhas) | 5 | 4 | 0 |
| HTTP-PREVIEW P1 a P6 | 4 | 2 | 0 |
| SYSTEM-ONE-EXPOSURE E1 a E3 | 3 | 0 | 0 |

Achado central: a árvore alvo carrega um candidato F1 a F4 (feed.ts raw sha256 c93e4a28) que a revisão independente marcou REQUEST_CHANGES (mais lacunas de verificação). Defeito A: a perda de cobertura do fluxo é apagada quando o relógio monotônico regride e o teto de 5000 corta registros (feed.ts:626). Defeito B: um ts de fonte futuro vira watermark e as respostas válidas seguintes são descartadas (feed.ts:593,610). Reproduzi os dois. O worktree Codex tape-data avançou depois do patch de arquivo e tem a correção (feed.ts 346577cc), que NÃO está na árvore alvo nem em nenhum patch.

## 2. Especificações

### 2.1 JEV-READ-MODEL-SAFETY-SPEC-V2 (F5/F6). main 14cbb7b = integ: read.ts, decide.ts e public-view.ts idênticos (git diff vazio); read.test.ts da integ só migrou fixtures (git diff main HEAD: asserts F5/F6 intactos)

| ID | Status | Evidência | Falta |
|---|---|---|---|
| M1 pré-abortado | DONE | read.ts:45; read.test.ts:219 (0 chamadas, hold/error, confiança null, 0/0/1, advisory, never); insuficiente :248 e observe :257 intactos | nada |
| M2 cancelamento em voo | DONE (núcleo) | read.ts:55-57,66,68,73-77; read.test.ts:199 (modelo ignora sinal, resolve tarde, nunca vira buy) | sem assert de remoção do listener e do timer, nem de sinal do chamador intacto (só por leitura e sonda externa 83/83): A3 |
| M3 prazo decorrido | DONE (núcleo) | read.ts:67-72; read.test.ts:187 (bloqueio síncrono 30 ms, prazo 5 ms -> timeout), :273 (pendente eterno) | sem assert de que o abort interno chega ao sinal do modelo: A3 |
| M4 normalização finita | DONE | decide.ts:42-50; read.test.ts:74 (3:1 buy/hold), :97 (3:1 buy/sell), :81 (underflow), :89 (overflow), :114 (zero, negativo, NaN, escolhido sem peso), :108, :131 | nada |
| M5 contrato público | DONE | public-view.ts:57-95; read.test.ts:176 (retorno e projeção), :233, :287 (cópia do estado); schema 1 e status inalterados | nada |
| M6 evidência e integração | DONE (processo) | TDD-EVIDENCE, JEV-READ-F5-F6-INDEPENDENT-REVIEW, RELEASE-AUDIT, MAIN-INTEGRATION-AUDIT (PASS delimitado); commit 14cbb7b em main | replay do probe imutável sai exit 1 por fixtures legadas, não por regressão: B3 |
| TOKEN /health = /jev-read | DONE | http.ts:36,68 (`trim()` nos dois) | teste com token acolchoado só na sonda externa (135 combinações): A8 |

### 2.2 JEV-TAPE-DATA-F1-F4-SPEC-V2 (hash LF 10cee5fe confere; cabeçalho ainda diz "NÃO CONGELADO")

| ID | Status | Evidência | Falta |
|---|---|---|---|
| CLK relógios e TTL (§3) | DONE | state.ts:27-30; feed.ts:73,135-138 (RangeError antes de qualquer efeito); feed.test.ts:268,:281; state.test.ts:492 | nada |
| PRF prova por valor e builder direto (§4.1, bypass §7) | DONE | state.ts:32-111,134-149; state.test.ts:65,:184,:229,:402; funding direto :352 | nada |
| F1 candle futuro | DONE | state.ts:189-198 (`ageMs < 0`, sem tolerância); state.test.ts:459 (+1/+5000/+5001 -> candles_stale; 0, 150000 e fracionário passam) | nada |
| F2 book e ticker | PARTIAL | feed.ts:276-323,581-612; state.ts:32-70; feed.test.ts:1038-1426 (ts do provedor, fonte+cache, duplicata, conflito, ordem) | **B**: ts futuro grava o watermark (feed.ts:593,610) e uma resposta válida depois é descartada (minha sonda: `validRecovered:false`). Recibo wall inválido (relógio injetado) também confirma ordenação. A correção existe só no worktree (A1); o fix intermediário 5fbfd8f2 criou bloqueio permanente após 257 pendências e foi refeito até 346577cc, que não é o que a integ tem |
| F3 funding | DONE | feed.ts:356-402; state.ts:72-86; feed.test.ts:794-1035; state.test.ts:293,:322,:352 (0.004 -> 0.4, zero, negativo, TTL 60k/120k/180k, calendário) | controle público com TTL omitido só no worktree (VER) |
| F4 cobertura e perda | PARTIAL | state.ts:113-126,134-149; feed.ts:142-246,499-579,614-629; feed.test.ts:360 (0, 500, 5000, 6000, gap), :439, :467, :498; state.test.ts:526 | **A**: `age >= 0` em feed.ts:626 apaga perda após retrocesso do mono + cap (minha sonda: `lostThroughMonoMs:null`; só relógio injetado). Política de mercado ocupado: B1 |
| COMP composição pós-await (§6) | PARTIAL | loop.ts:98-123 correto por leitura (ages de novo :105; snapshot após o último await :108); loop.test.ts:142,:175 | só doubles; teste público OkxTapeFeed -> readRound existe só no worktree (feed.test.ts:413): A1 |
| VER matriz pública (§7) | PARTIAL | maior parte da matriz está nos testes acima | lacunas citadas pelo revisor: candle expirando no await com feed real, funding com TTL omitido pela via pública, F2 por transporte e eixo, 195 controles fora do repo: A1 e A9 |
| OWN/M1 a M6 preservados (§8) | DONE | git diff vazio em read/decide/public-view; read.test.ts só fixtures | nada |

Revisões independentes (fora do repo, `C:\Users\gabri\.codex\tmp`): candidato c93e4a28 = REQUEST_CHANGES (A, B, VERIFY). Candidato 5fbfd8f2 = A e B corrigidos, dois P2 novos (overflow permanente após 257 pendências, recibo inválido). Candidatos 7da7a3c6 (promoção de observação futura) e 346577cc (recuperação limitada, o mais novo, no worktree): revisão pedida, relatório não entregue.

### 2.3 HTTP-PREVIEW-SPEC-20261011 (hash LF e3224482 confere; `server.ts` e o teste da integ têm os bytes auditados em 1f08e6e)

| ID | Status | Evidência | Falta |
|---|---|---|---|
| P1 CLI só HTTP | DONE | scripts/http-preview.ts:1-23; server.ts importa só handlers (operator/http, system-one/http, jev-read/http) e tipos de market/trader; http-preview.test.ts:37 (subprocesso `--no-env-file --no-addons --no-install` com guard de fetch) | nada |
| P2 config explícita | DONE | server.ts:20-27 valida antes do bind; http-preview.test.ts:172 (11 casos), estado ausente nunca criado (:100,:163,:215) | nada |
| P3 meta honesta | PARTIAL | HTTP: teste :37 (none, null, read_only, sem produtor, histórico []). UI: presentation.ts:37-58 trata modo desconhecido como "Execução não verificada" | nenhum teste usa `mode:"read_only"` (A4); prova visual é de 1f08e6e em `/console`, a raiz da árvore alvo agora é a mesa: A5 |
| P4 CORS, 403, 405 | DONE | server.ts:54-56; teste :76-88 nas 6 rotas (403 sem ACAO, 405, OPTIONS 200/204 com ACAO) | nada |
| P5 ciclo de vida | DONE | server.ts:47-89 (heartbeat só após o bind, close idempotente, `timeout(req,0)` no SSE); testes :8 (ping aos 15 s) e :111 (porta ocupada, SSE fechado, porta liberada) | nada |
| P6 evidência | PARTIAL | RED/GREEN, revisão e rollout documentados (HTTP-PREVIEW-MAIN-1F08E6E-*) | navegador limpo independente nunca obtido (CUA indisponível, VISUAL-FOLLOWUP); flake "Unexpected end of JSON input" sem causa (DIAGNOSIS): A5, A6 |

### 2.4 SYSTEM-ONE-EXPOSURE-SPEC (E1 a E3) e afirmações de docs/SYSTEM-ONE.md

| ID | Status | Evidência |
|---|---|---|
| E1 existente + proposto <= teto, sem multiplicar por alavancagem | DONE | brief.ts:29-40 (decimal BigInt, sem tolerância), :93; system-one.test.ts:92,:104 |
| E2 acima do teto: `exposure_cap_reached`, fora de `eligibleIds` | DONE | brief.ts:93,:130; system-one.test.ts:117-136 (abaixo, igual, acima; 1x e 2x) |
| E3 via `buildLeverageBrief`, sem execução | DONE | mesmos testes; grep: nenhum import de assinatura ou executor em src/system-one, src/jev-read e nos dois CLIs |
| SYSTEM-ONE.md: 120 s, prazo do modelo 10 s, funding desconhecido bloqueia | DONE | types.ts:15; cycle.ts:42; brief.ts:85 (`funding_unknown`) |

Código vindo de main (4fe00c9, 2f8bdc9); nada dessa spec depende do worktree system-one-safety.

## 3. Pendências por classe

### A. Implementáveis agora (em ordem de valor)

- **A1. Trazer o feed novo do worktree tape-data.** Copiar `feed.ts` (raw 346577cc, 736 linhas) e `feed.test.ts` (raw 0220967b, 1956 linhas) de `C:\Users\gabri\.codex\worktrees\inonu-jev-tape-data-f1-f4\jev-trader\src\jev-read\`; state, types, loop, seus testes e read.test.ts já são iguais nos dois lados. Aceite: `bun --no-env-file test` em src/jev-read >= 187 pass (confirmei em cópia), `bun run typecheck`, minha sonda mostra B recuperado e A registrado. Revisão por agente distinto do diff de produção (+106 linhas: `ConfirmedOrdering`, `stageObservation`, `reconcileOrdering`, `MAX_PENDING_VALUES=256`), porque as duas últimas rodadas não têm revisão entregue. Se o revisor achar pesado: validar o ts na entrada exigiria dar o relógio corrigido ao feed (muda a interface congelada de `ages`/`snapshot`).
- **A2. Preservar antes de remover o worktree.** O patch `inonu-jev-tape-data-f1-f4-14cbb7b-20261011-2244.patch` é das 22:44; o worktree mudou até 23:53 (0 ocorrências de `ConfirmedOrdering` no patch). Copiar para docs os 4 checkpoints 20261012 e os 4 REPORT-*.md da seção 4, e gerar patch novo. O app Codex segue aberto (não sei se há agente ativo neste worktree): reconferir os hashes no momento da cópia.
- **A3. Testes M2/M3 que faltam** em `read.test.ts`: listener e timer removidos, sinal do chamador não abortado, abort interno chega ao modelo no prazo, rejeição tardia sem unhandled rejection. Aceite: passam e falham se a limpeza for removida do read.ts.
- **A5. P6 na árvore alvo** com o navegador embutido: `bun run preview:http --port <livre> --origin http://127.0.0.1:<web> --state-dir <abs>` e o web com `NEXT_PUBLIC_API_URL`; ler `/` (mesa) e `/console`: execução não verificada, fonte local-http-preview-no-producer, modelo none, sem decisões, System One e operador indisponíveis, carteira desconectada. Usar portas novas; as 3008 a 3011 são de sessões Codex. `next/font/google` pode pedir rede (então vira C).
- **A9. Migrar os controles independentes** (`contract-controls.ts`, `original-contract-calendar.ts`, `rollback-cap.ts`, `future-watermark.ts`, `ordering-regressions-v2.ts`) para testes do repo ou `scripts/`. Aceite: matriz §7 coberta pela via pública.
- **A4.** `presentation.test.ts`: `presentFeed(meta({dryRun:true,mode:"read_only",dataSource:"local-http-preview-no-producer"}),"live")` -> "Execução não verificada" e "Fonte: local-http-preview-no-producer".
- **A6.** Endurecer `http-preview.test.ts:60` (`child.kill()` fixo em 8 s): hipótese não provada para o flake sob carga; trocar por espera de prontidão e repetir 20x sob carga.
- **A8.** Teste de `--help` e flags inválidas de `scripts/jev-read.ts` (validação ocorre antes da rede); token acolchoado igual em `/health` e `/jev-read`; dicas "bun run jev-read --jev" (mesa-model.ts:94,255; http.ts:57) devem citar `TYPESAFE_AI_API_KEY`, pois o script usa `--no-env-file`.
- **A7.** Remover `FUTURE_TOLERANCE_MS` (types.ts:186, só importado em state.test.ts:4) e atualizar comentários de types.ts (`nowMs`, "Freshness windows").

### B. Decisão do dono

- **B1. Teto de 5000 registros de fluxo.** Hoje >5000 negócios em 60 s bloqueia a leitura por 60 s (`trades_unavailable`). Alternativas: manter (falha fechada), ou agregação exata por balde (nova spec). Recomendo manter e medir a frequência real no diário durante C1.
- **B2. Política de funding.** TTL 120 s e refresh de 120 s coincidem (scripts/jev-read.ts:156); o valor veio de conselho delegado, não de humano. Alternativas: manter (funding pisca para null por frações de segundo a poucos segundos por ciclo, estimativa minha), refresh de 60 s (muda CLI fora do escopo congelado), TTL maior (a spec proíbe). Recomendo refresh de 60 s com emenda.
- **B3. Probe imutável a7a44e94.** Sai exit 1 mesmo para F5/F6 porque as fixtures são anteriores às provas. Alternativas: aceitar os controles migrados (A9) como aceite e arquivar o probe como histórico, ou exigir probe novo. Recomendo a primeira.
- **B4. Jev real em produção.** `--max-reads` padrão 2000 por 24 h, custo faturado desconhecido, prompt com custo de ida e volta fixo em 20 bps (decide.ts:94). O dono fixa teto, instrumentos e intervalo.

### C. Bloqueadas por serviço externo, chave ou execução

- **C1. Observação ao vivo na OKX pública (sem chave, sem dinheiro).** Não verifiquei offline se o `ts` do REST de livro, ticker e funding é hora da resposta ou da última mudança; se for a última mudança, mercados quietos (MON-USDT) ficam `book_stale` para sempre. Também mede negócios por minuto contra o teto. Rodar `bun run jev-read --observe --insts MON-USDT,BTC-USDT` por 10 min, com `JEV_READ_STATE_PATH` e `JEV_READ_JOURNAL_PATH` num diretório temporário, e contar os motivos no `reads.jsonl`.
- **C2.** Inferência real do Jev: `TYPESAFE_AI_API_KEY` e custo.
- **C3.** Execução ao vivo continua bloqueada (D11). jev-read é consultivo: `execution:"never"` no tipo, em read.ts, em public-view.ts e no parser web.

### D. Obsoletas ou superadas

- D1 `JEV-READ-MODEL-SAFETY-SPEC-20261011.md` (V1): superada pela V2 (M4 com underflow).
- D2 Trecho de `SYSTEM-ONE-EXPOSURE-REVIEW-AUDIT.md` ("bloqueio de funding desconhecido não imposto"): superado por ee7db75 (brief.ts:85).
- D3 Edições do checkout primário em `brief.ts`, `system-one.test.ts`, `docs/SYSTEM-ONE.md` (lista fechada 1/2/4/8 h, razão `funding_carry_unknown`): main já bloqueia funding desconhecido; manter só no patch `primary-055a637-20261011-2244.patch`.
- D4 `HTTP-PREVIEW-INTEGRATED-RUNTIME-CHECKPOINT` e `HTTP-PREVIEW-DIAGNOSIS-CHECKPOINT` (portas 3008/3009): superados por MAIN-1F08E6E (3010/3011); `HTTP-PREVIEW-CYCLE-*.json` são rito do harness, sem uso.
- D5 `JEV-TAPE-DATA-CHECKPOINT-20261011.md` (parte histórica), `-PLAN-` ("sem implementação autorizada"), `-RECOVERY-`: superados pelos checkpoints seguintes.
- D6 `FUTURE_TOLERANCE_MS` (ver A7).

## 4. Trabalho fora da árvore alvo (sha256 curto: worktree e integ sobre conteúdo com CRLF normalizado para LF; arquivos fora de worktree em bytes brutos, como citados nos docs)

| Origem | Caminho | wt / integ | Destino |
|---|---|---|---|
| tape-data (modificado) | src/jev-read/feed.ts | 642c5ae845ba / fa98f35c3110 | entrar (A1) |
| tape-data (modificado) | src/jev-read/feed.test.ts | 49daa84350ec / cdfa67beb46f | entrar (A1) |
| tape-data (novo) | docs/JEV-TAPE-DATA-P1-P2-PUBLIC-CHECKPOINT-20261012.md | 3a4013815697 / ausente | arquivar (A2) |
| tape-data (novo) | docs/JEV-TAPE-DATA-REVIEW-CHECKPOINT-20261012.md | e65b4f44f7e2 / ausente | arquivar |
| tape-data (novo) | docs/JEV-TAPE-FUTURE-PROMOTION-CHECKPOINT-20261012.md | 50f1a9c395e6 / ausente | arquivar |
| tape-data (novo) | docs/JEV-TAPE-LOSS-RECOVERY-CHECKPOINT-20261012.md | b7bb8c1b6d40 / ausente | arquivar |
| tape-data (ignorado) | data/events.jsonl | sem relevância | descartar |
| `.codex\tmp\inonu-tape-review-01a12971-20261012-f4` | REPORT-SPEC.md f54a1a427bc7, REPORT-STANDARDS.md e8a265223b53 | só fora do repo | arquivar (única revisão independente do candidato da integ) |
| `.codex\tmp\inonu-tape-review-p1-p2-20261012` | REPORT-SPEC-P1-P2.md b6761f601409, REPORT-STANDARDS-P1-P2.md 639fd05f28df | só fora do repo | arquivar |
| `.codex\tmp\spec-probes-01a12dc0-*` | contract-controls.ts 12fbdb8e3299 e demais sondas | só fora do repo | arquivar até A9 |
| `.codex\worktrees\inonu-system-one-review-spec-20261011` | relatório F1 a F6 463a69063c76 e probe a7a44e9482c1 | só fora do repo | arquivar (fonte do aceite F1 a F6) |
| read-safety-f5-f6 | 16 docs | todos idênticos | nada a trazer; pode sair |
| system-one-safety | 98 docs (6 SYSTEM-ONE, 10 HTTP-PREVIEW, resto de outros clusters) | todos idênticos | nada a trazer; pode sair; sem código modificado |

Observação: `git diff main..integ` neste cluster mostra só os 8 arquivos F1 a F4 de src/jev-read; server.ts, http-preview e system-one são idênticos aos de main.

## 5. Contradições entre spec, docs e código

- X1. CONSOLIDACAO §7 diz "todas arquivadas em patch"; o patch do tape-data é das 22:44, o worktree mudou até 23:53 e o trabalho novo não está em patch algum (A2). §2 item 3 apresenta F1 a F4 como coberto; a revisão independente do candidato é REQUEST_CHANGES.
- X2. Cabeçalhos desatualizados: F1-F4 SPEC V2 "NÃO CONGELADO"; MODEL-SAFETY V1/V2 "proposed, freeze pending"; HTTP-PREVIEW-SPEC "No production changes or new tests yet"; PLAN "sem implementação autorizada"; TDD-EVIDENCE "review pending". Todos já implementados e auditados.
- X3. types.ts: `FUTURE_TOLERANCE_MS` com comentário de tolerância de 5 s, mas F1 exige zero e a constante é código morto; `nowMs` e "Freshness windows, receipt time based" descrevem o modelo antigo.
- X4. Dicas de UI e http.ts mandam `bun run jev-read --jev`; o script do package usa `--no-env-file` e falha sem `TYPESAFE_AI_API_KEY` exportada.
- X5. web/src/lib/jev-read.ts:158 diz que o produtor lê cada mercado "cerca de uma vez por minuto" (tarde > 90 s, velha > 300 s); o CLI padrão dá 75 s por mercado com 5 e 180 s com 12 mercados.
- X6. Probe imutável exit 1 contra código que o repo prova correto: leitura errada se tratada como regressão (B3).
- X7. P3: a prova visual citada é da mesa/console de 1f08e6e; a UI da árvore alvo mudou.

## 6. Riscos de segurança e de gate

- G1. Nenhum caminho de execução em jev-read nem em System One (grep sem assinatura/executor); `execution:"never"` em 4 camadas. Nada aqui liga o gate D11.
- G2. Defeito B é falha fechada (disponibilidade, não segurança); A exige relógio monotônico regredindo (impossível com `performance.now()` real). Merge da integ sem A1 ainda é ganho líquido de segurança sobre main, que não tem F1 a F4; o custo é um modo de indisponibilidade novo (B), que main não tem porque ignora o ts.
- G3. Listeners antigos vivos: 3008/3009 e 3010/3011 (builds de 1f08e6e e `.codex\tmp`), 3001 (primário), 3000 (reports-server). Seguram arquivos em `.codex\tmp` e em jev-trader-main; não encerrei nada.
- G4. PID 2808 em :3020 roda `src/index.ts` (o trader) com `--env-file=...\jev-trader-main\data\preview-main.env`. Não abri o arquivo (regra de credenciais): confirmar DRY_RUN e ausência de chave de assinatura antes de chamar de pré-visualização.
- G5. Apareceu o worktree `jev-trader-fin` (`final/consolidation` 309fcf5 = integ + merge dos docs R10); nenhum arquivo deste cluster difere.
- G6. O worktree tape-data ainda pode receber escrita (app Codex aberto; última escrita observada 2026-10-11 23:53, 8 h antes desta revisão).
