# Revisao independente: closing-audit.ts e risk-quality.ts (2026-10-14)

Revisor: Claude (agente independente, somente leitura sobre src/ e web/). Autor revisado: Codex. Pedido: COORDENACAO-CLAUDE-20261013.md secoes 83, 85 e 86.

Arquivos revisados (todos nao rastreados no git no momento da revisao, nao importados por nenhum codigo de producao):

- src/decision-review/closing-audit.ts (85 linhas) e closing-audit.test.ts (79)
- src/decision-review/risk-quality.ts (97) e risk-quality.test.ts (92)

Codigo produtor lido para conferir as reivindicacoes: src/agent/closing.ts, closing-phase.ts, cycle.ts (closingPhase, linhas 772-815), wire.ts (journal closings.jsonl, linhas 620-645), cli.ts (quoter, linha 413-452), src/decision-review/entry-quote.ts, src/inonu/source-ecosystem.ts (linhas 79-85, 270-323, 327-352), src/intel/brief.ts, src/intel/candidates.ts, src/okx-wallet/chains.ts, src/agent/quote-facts.ts, src/onchain-read/gateway.ts.

## 1. Resultado

| Classe | Quantidade |
|---|---|
| BLOCKING | 0 |
| SHOULD FIX | 7 |
| NOTE | 12 |

Nenhum defeito que impeça a existencia dos dois modulos como helpers puros e ainda nao integrados. Os dois fazem o que o cabecalho promete dentro do que verificam. Os achados SHOULD FIX sao de dois tipos: (a) o auditor nao verifica coisas que o nome "auditor da segunda olhada" sugere que verifica, e o resultado limpo (`findings: []`) pode ser lido como mais do que prova; (b) o risk-quality tem uma dependencia do relogio de captura passado pelo chamador que reabre o problema que o modulo diz fechar (rejuvenescer a idade do risco).

Tres principais:

1. SF-2: `shadowUnchanged` e tautologico contra o produtor real. `applied` nunca e informado pelo chamador e `closingRecord` o copia de `appliedByGate`; logo, em shadow, `applied === first.appliedByGate` em TODO registro real. "Detecta escolha alterada em shadow" so dispara em registro editado a mao.
2. SF-1: o auditor separa recusa de decisao, mas nao verifica a recusa. Uma cotacao com `provider_block`, `provider_warn` ou honeypot, que o gate objetivo deveria recusar, seguida de pergunta ao modelo e resposta, da `findings: []`. Tambem passam: recusa + resposta juntas, recusa com `would:"buy"`, `would:"buy"` sem resposta nem recusa.
3. SF-3: o auditor ignora `placed`, `phaseStartedAtMs`, `askedAtMs`, `answeredAtMs` (campos que o produtor atual ja grava) e continua devolvendo `quoteFreshAtModelCall: null` como literal. O comentario "atMs alone does not establish..." esta superado: o registro agora traz a hora fisica.

## 2. Metodo e evidencia

- Leitura integral dos quatro arquivos e do codigo produtor.
- Testes existentes: `bun --no-env-file test src/decision-review/closing-audit.test.ts src/decision-review/risk-quality.test.ts` = 23 pass, 0 fail, 59 expect (11 + 12 testes). Junto com entry-quote.test.ts, closing.test.ts e closing-phase.test.ts: 61 pass, 227 expect. (Os numeros 23/82 e 12/36 das notas do Codex vem de outros agrupamentos; nao encontrei divergencia, so nao reproduzi essas contagens exatas.)
- Typecheck isolado dos quatro arquivos com o tsc do repositorio e um tsconfig no scratchpad que estende o do projeto: saida vazia, exit 0.
- 80 testes adversariais proprios, fora do repositorio, em `C:\Users\gabri\AppData\Local\Temp\claude\C--Users-gabri-jev-trader\a645aa24-a0d6-487a-bc12-0ed706e0c859\scratchpad\review-agent\`:
  - closing-audit-adversarial.test.ts: 51 testes (14 gerados a partir de registros reais do produtor).
  - risk-quality-adversarial.test.ts: 29 testes (inclui o produtor real createEcosystemSource com gateway FALSO).
  - Rodar: `cd C:\Users\gabri\jev-trader` e `bun --no-env-file test "<caminho absoluto do arquivo>"`. Resultado final: 51 pass e 29 pass.
  - Convencao: teste "OK:" afirma comportamento correto; teste "GAP:" e "NOTE:" afirma o comportamento ATUAL que constitui o achado (passa hoje, serve de reprodutor; o comentario diz o que seria o correto). Sao 14 GAP e 14 NOTE.
- Nada foi enviado a rede, a provedor, a executor, a carteira, nem as portas 3000/3001. Os "registros reais" foram produzidos por `runClosing` com cotador, modelo e orcamento FALSOS em memoria, depois passados por JSON.stringify/parse (o caminho do arquivo jsonl). Nao existe closings.jsonl em disco (o runtime vivo em %LOCALAPPDATA%\InonuTrader\data\agent ainda nao o gerou), entao nao houve registro de producao para auditar.

## 3. Reivindicacoes dos comentarios conferidas contra o codigo

| Reivindicacao | Resultado |
|---|---|
| closing-audit: recomputa hash (16 hex) e bytes do Brief | Confere. Mesma formula de closing.ts:219. Estavel apos round trip JSON (testado com -0, NaN, undefined, 1e21, 0.1+0.2 e chaves inteiras). |
| recomputa fingerprint da quote | Confere (sha256 completo do corpo sem `fingerprint`, ordem de insercao igual a entry-quote.ts:95-102). Ver NOTE-8 sobre dependencia da ordem das chaves. |
| identidade de ciclo, candidato, request, ativos | Confere. Solana sensivel a caixa, EVM canonico minusculo, nome de rede ou indice com zero a esquerda nunca casa, mesma rede com outro indice nao casa, prefixo `sell:` nao casa. |
| relogios internos da quote | Confere com a regra do binder, incluindo a borda: idade exata de 15000 ms passa nos tres lugares (binder, `quoteIsFresh`, auditor) e 15001 e recusado no binder e sinalizado pelo auditor sob a janela honesta. Ver SF-4 para a janela que o registro pode alargar. |
| detecta escolha alterada em shadow | So para registro editado. Ver SF-2. |
| separa recusa objetiva de decisao do modelo | Separa os campos, nao valida a recusa. Ver SF-1. |
| quase empate arredondado a seis casas nao e reconstruivel | Confere numericamente. Limiar 1,1e-6 correto: com cada lado arredondado a 6 casas o erro maximo da diferenca e 1e-6, logo diferenca registrada acima disso preserva o sinal. Testado em 0,500001/0,5 (nao reconstroi), 0,500002/0,5 (buy), 0,5/0,500002 (skip). |
| frescor no instante da request fisica fica null porque atMs nao prova | Verdadeiro para atMs; obsoleto agora que `askedAtMs` existe. Ver SF-3. |
| nenhuma consistencia comprova fonte autentica, fill ou lucro | Confere: `executionProven: false` e `financialProfitProven: false` sao literais de tipo; campos extras (profitUsd, filled, txHash) nao sao ecoados. Ver NOTE-10. |
| puro: sem fetch, arquivo, env, processo, relogio | Confere. Imports: `node:crypto` e `../okx-wallet/chains` (modulo de dados com Map criado no load, sem E/S). Varredura por fetch, Bun., process., Date., performance, Math.random, fs, env, timers, import(): unica ocorrencia e a palavra "fetched" num comentario (risk-quality.ts:6). Mesma entrada duas vezes gera saida igual e a entrada nao e mutada (testado). |
| risk-quality: le Brief schema 1, candidatos[].estado, fluxo.ecossistema.itens[id].q | Confere contra o produtor real (source-ecosystem.ts:79-85, 311-313, 327-352). Rodei createEcosystemSource com gateway falso: candidato com leitura de risco ok vira `risco_conferido` com q `[ageMs, stale]`; leitura falha ou candidato alem do teto de chamadas vira `risco_nao_conferido` com q `null`; meta sem ageMs/stale vira `[null, null]`. Todos capturados com o `check` e a tupla corretos. |
| liga por token:rede:endereco, EVM canonico, Solana sensivel a caixa | Confere (ids do Brief ja saem minusculos para 0x, tokenCandidate em candidates.ts:40). |
| `checked` so significa que a FONTE relatou leitura | Confere e e ainda mais fraco: no produtor `checked` e `result.ok` (source-ecosystem.ts:288), mesmo com payload sem campo de risco (testado com `data: {}`). Ver NOTE-6. |
| idade do risco e LIMITE INFERIOR | Valido como limite, mas depende do `capturedAtMs` do chamador. Ver SF-6. |
| view sem endereco, saldo, dolares ou texto externo | Confere: notas sao codigos enumerados; texto livre em `estado` vira `unknown` e nao aparece na view. |

## 4. SHOULD FIX

### SF-1. A recusa objetiva e a coerencia de `would` nao sao verificadas

Onde: closing-audit.ts:68-79.

O auditor so le `refusal` como codigo e usa para pular a checagem de veredito. Nao reaplica `quoteRefusal(q)` (closing.ts:113-119) ao proprio quote do registro, nem exige as exclusoes mutuas que o produtor sempre escreve.

Entradas que passam com `findings: []` (testes C2 GAP e C8 GAP):

- Quote valida por fingerprint com `disposition: "provider_block"` (ou `provider_warn`), `refusal: null`, brief e `answer {buy:.9, skip:.1}` preenchidos. O produtor jamais perguntaria; um bug que perguntasse passa limpo.
- `refusal: "honeypot"` mantendo `answer` e brief (recusa e resposta juntas), com `quote.honeypot.to === false`.
- `refusal: "cotacao_bloqueada"` com `would: "buy"` (o produtor sempre grava `skip` em recusa, closing.ts:213).
- `answer: null`, `refusal: null`, `would: "buy"` (decisao sem base).
- Brief e hash presentes com `quote: null` e `answer: null` (pergunta feita sem quote ligada).

Correcao sugerida (pura, importando `quoteRefusal` ou copiando as 4 regras): calcular `expected = quoteRefusal(quote)` quando houver quote; findings `closing_asked_despite_objective_refusal` (expected != null e brief/answer presentes), `closing_refusal_mismatch` (refusal != expected), `closing_refusal_with_answer`, `closing_would_without_basis` (would != null, refusal null, answer null), `closing_brief_without_quote`. Tratar `refusal` nao nulo e fora do conjunto enumerado {honeypot, cotacao_bloqueada, cotacao_aviso, honeypot_desconhecido} como finding, nao como null silencioso (ver NOTE-9).

### SF-2. `shadowUnchanged` e tautologico contra o produtor real

Onde: closing-audit.ts:80; origem em closing.ts:221, closing-phase.ts:72-79 e cycle.ts:794.

`runClosing` nunca passa `applied`; `closingRecord` faz `applied: input.applied ?? input.appliedByGate`. Em shadow, `applied === first.appliedByGate` vale por construcao em todo registro (teste C1 GAP verifica nos registros produzidos por `runClosing`). O finding `closing_shadow_changed_choice` so aparece se alguem editar o campo a mao. O comentario de ClosingRecord.applied (closing.ts:181-182) diz "what the cycle really did", mas o cycle nunca informa isso.

Risco: `shadowUnchanged: true` ser lido como prova de que a fase extra nao alterou a escolha, justamente a propriedade cuja prova a secao 83 exige ("sem chamar sombra de comportamento totalmente identico"). Detalhe relacionado no produtor (nao no auditor): `appliedByGate: from.gated[c.id] ?? "skip"` (cycle.ts:794) fabrica "skip" quando o gate nao deixou entrada.

Correcao: (a) imediata, so no auditor: renomear para `shadowFieldsEqual` e documentar no tipo que, enquanto o produtor copiar `appliedByGate`, o campo nao tem poder de deteccao; ou (b) correta: o ciclo informar `applied` a partir do que realmente foi entregue ao executor para aquele candidato (depois da fase) e o auditor comparar com isso; ate la `shadowUnchanged` deveria ser `null`.

### SF-3. Os campos de tempo fisico que o produtor ja grava sao ignorados

Onde: closing-audit.ts:23-24 e 84 (`quoteFreshAtModelCall: null` como tipo literal); campos em closing.ts:183-188 e 222.

O auditor nao valida nem devolve `placed`, `phaseStartedAtMs`, `askedAtMs`, `answeredAtMs`. Passam com `findings: []` (teste C1 GAP): `askedAtMs: 1, answeredAtMs: 0`; `phaseStartedAtMs = atMs + 1e9`; `placed: "sideways"`; resposta presente com `askedAtMs: null`; `atMs` depois da resposta. Registro real aceito sem finding em 14 execucoes do produtor (resposta buy, skip, falha de quote, quote que nao liga, block, warn, honeypot, quote vencida, modelo sem fechamento, erro de modelo, resposta inutil, reserva para primarias, e `placed: "depois"`), entao nao ha falso positivo; ha campo que importa e e descartado.

Correcao: quando os campos existem, validar `placed in {antes, depois}`, `phaseStartedAtMs <= atMs`, `quote.reviewedAtMs <= askedAtMs <= answeredAtMs`, `answer != null implica askedAtMs != null`, `askedAtMs == null implica answeredAtMs == null`; expor `quoteAgeAtAskMs = askedAtMs - quote.startedAtMs` rotulado como auto-relatado pelo relogio local (nao como frescor provado) e sinalizar acima de CLOSING_QUOTE_FRESH_MS mais folga (o passo 5 do runClosing checa antes do brief e do `budget.begin`, entao uma folga pequena e legitima). Campos ausentes = registro legado = "desconhecido", nunca defeito. Atualizar o comentario de `quoteFreshAtModelCall`.

### SF-4. A janela de validade da quote e a que o proprio registro disser

Onde: closing-audit.ts:65.

O check e `reviewedAtMs <= expiresAtMs`, mas `expiresAtMs` e campo do registro. Com `expiresAtMs = startedAtMs + 1e12`, `reviewedAtMs = startedAtMs + 600000` (10 minutos), `ageMs` coerente e fingerprint recomputado, passa (teste C2 GAP). Com a janela honesta de 15 s e o mesmo atraso, o auditor sinaliza (teste OK). O auditor nao exige que a janela seja a de `criteria: "closing-v1"`.

Correcao: para `criteria === "closing-v1"` exigir `expiresAtMs - startedAtMs === CLOSING_QUOTE_FRESH_MS` (ou ao menos `reviewedAtMs - startedAtMs <= CLOSING_QUOTE_FRESH_MS`), finding `closing_quote_window_unexpected`.

### SF-5. O Brief nao e amarrado a quote nem a primeira resposta do mesmo registro

Onde: closing-audit.ts:47-53 (e `first.pBuy` nunca validado).

Hash e bytes do Brief conferem consigo mesmos. Nada liga `brief.cot` a `quote`, nem `brief.sua.p` a `first.pBuy`. Reprodutor (C2 GAP): registro cujo brief diz `cot.e: "bloqueio"`, `cot.imp: -9.5`, `sua.p: 0.99`, com hash/bytes recomputados, junto a uma quote com `impactPct -0.3` e `disposition ok`: `findings: []`. Tambem passam `first.pBuy: 7` e `first.pBuy: "abc"` (C8 NOTE).

Correcao: conferir `cot.e` contra `disposition` (ok/aviso/bloqueio), `cot.imp` contra `round(facts.impactPct, 4)`, `cot.imposto` contra `facts.taxFromPct/taxToPct` arredondados a 4 casas, e `sua.p` contra `first.pBuy` com tolerancia 0,005 + 1e-6 (`sua.p` e arredondado a 2 casas a partir do valor cheio, `first.pBuy` a 6; comparar igualdade exata daria falso positivo raro por duplo arredondamento). Validar `first.pBuy` como numero finito em [0,1] ou null. `cot.taxa`/`entra` dependem de `sizeUsd`, que nao e gravado, entao nao sao recomputaveis; dizer isso no comentario.

### SF-6. A idade do risco depende do relogio de captura passado pelo chamador

Onde: risk-quality.ts:95 (e 85).

`riskAgeAtLeastMin = (providerAgeMs + nowMs - capturedAtMs) / 60000`. Se o chamador capturar tarde (por exemplo `captureRiskQuality(built, id, nowDaDecisao)` sobre um `built` de 9 minutos atras), a idade do risco volta a `providerAge` e o modulo "rejuvenesce", o oposto do que promete. Reprodutor (R3 GAP): Brief com `asOfMs = NOW`, q `[60000,false]`, captura em NOW+9min, view em NOW+9min => `snapshotAgeMin = 9` mas `riskAgeAtLeastMin = 1` (menor que a idade do snapshot; o limite provavel e 10). O Brief proprio ja da o limite melhor: `asOfMs` e `deps.now()` lido depois de todas as leituras de risco (source-ecosystem.ts:327), logo o risco foi lido antes de `asOfMs`.

Correcao: `base = snapshot.snapshotAtMs ?? snapshot.capturedAtMs` e `riskAgeAtLeastMin = (providerAgeMs + nowMs - base) / 60000`. Mantem o limite inferior valido, tira a dependencia do chamador. Manter `capturedAtMs` para as checagens de monotonia.

### SF-7. A view confia na forma do snapshot

Onde: risk-quality.ts:89-97.

`riskQualityView` valida identidade e relogio, mas nao a forma de `snapshot`. As notas do Codex (secao 86) pedem "preservar no journal"; um snapshot que passe por armazenamento volta como dado nao tipado. Reprodutores (R4 GAP): `providerAgeMs: "60000"` vira concatenacao de strings e `riskAgeAtLeastMin` da mais de 1e9 em vez de null; snapshot sem `capturedAtMs` da `NaN` (vira `null` no JSON) com `check: "checked"`.

Correcao: validar no inicio da view (version 1, `time(capturedAtMs)`, `assetKey` string, `check` enumerado, `providerAgeMs` via `age()` ou null, `providerStale` boolean ou null, `notes` lista de codigos conhecidos) e devolver `unknown("snapshot_invalid")` (novo codigo). Coerente com "ausencia em legado e unknown".

## 5. NOTE

1. risk-quality.ts:77-79. No conflito `unchecked` + q presente a view mantem `providerAgeMs`/`providerStale` e portanto expoe `riskAgeAtLeastMin` para um candidato `unchecked` (R4 GAP). O produtor nao gera esse caso (unchecked implica q null, source-ecosystem.ts:272-281, 311-313), entao e defensivo. Anular as idades no conflito.
2. risk-quality.ts:69-70. Mais de 40 chaves em `itens` viram `risk_meta_missing` em silencio, enquanto mais de 40 candidatos viram `candidate_list_invalid` (R5 NOTE). Assimetria de codigos; usar `risk_meta_oversized`. Inalcancavel hoje (o produtor emite 5).
3. risk-quality.ts:35-41. O id do candidato do agente tem prefixo `buy:` (cycle.ts:765, `ecoById` usa `buy:${candidateId}`); `captureRiskQuality(built, "buy:token:501:...", ...)` devolve `candidate_identity_invalid` (R2 NOTE). Falha fechada, mas o integrador precisa remover o prefixo. Aceitar o prefixo de forma explicita ou exportar um helper.
4. risk-quality.ts:33 e 92. `time()` exige inteiro seguro; `nowMs` fracionario (performance.timeOrigin + performance.now()) vira `view_clock_invalid` e `unknown` (R3 NOTE). Falha fechada; preferir finito e nao negativo.
5. risk-quality.ts:10 e 85. `source` e sempre `"inonu_ecosystem_brief"`: `alvo.escopo` nao e validado (um Brief de descoberta seria rotulado assim, R7 NOTE) e o `hash` do Brief nao e recomputado (Brief com `estado` editado e capturado em silencio). Alem disso `providerAgeMs` e a idade no cache do gateway (`now - cachedAtMs`, gateway.ts:74), nao a do provedor; o comentario do campo ja diz, o nome ainda sugere o contrario (`gatewayAgeMs`).
6. Produtor, source-ecosystem.ts:288. `risco_conferido` = `result.ok`, inclusive payload sem campo de risco (R6 NOTE). O modulo o disclama corretamente; ao mostrar ao modelo, preferir um rotulo que nao leia como "risco examinado".
7. closing-audit.ts:44. Cabecalho invalido devolve `null`, igual a linha estranha, versao nao suportada ou registro corrompido. Um `applied: "buy full"` (com espaco) faz o registro sumir de um laco `map(auditClosing).filter(Boolean)` em vez de ser acusado (C8 NOTE). Devolver resultado discriminado `{ok:false, reason}` para ao menos separar "nao e closing" de "closing corrompido".
8. closing-audit.ts:34 e 59; entry-quote.ts:102; closing.ts:219. Os dois fingerprints dependem da ordem de insercao das chaves de `JSON.stringify`. Correto para o jsonl escrito e lido pelo mesmo JS (verificado). Qualquer reserializacao com chaves ordenadas (`jq -S`, JSONB) torna todo registro legitimo `mismatched` (C3 NOTE). Relevante para a persistencia em nuvem planejada. Documentar, ou o produtor hashear uma forma canonica ordenada.
9. closing-audit.ts:31 e 68. `code()` aceita `[A-Za-z0-9_:./@-]{1,160}`, que comporta texto com cara de URL ou de instrucao (`ignore_previous_instructions/https://evil.example@x`), e `criteria`, `refusal`, `applied` e ids sao ecoados na saida (C5 NOTE). `refusal` nao nulo e fora do charset vira `null` sem finding. Se a saida chegar a um modelo, enumerar os valores aceitos.
10. closing-audit.ts:13-15 e 49. O rotulo `matched` e um checksum de 64 bits (hash truncado a 16 hex) sem segredo: um brief editado e re-hasheado le `matched` com `findings: []` (C3 NOTE). O comentario do cabecalho avisa, o resultado nao carrega nada equivalente. Sugestao: campo literal `sourceAuthenticated: false` e rotulo `consistent`.
11. Canonicalizacao de endereco em tres copias (entry-quote.ts:66, closing-audit.ts:35-39, risk-quality.ts:35-41) com diferencas pequenas: closing-audit usa `startsWith`/`slice` e aceita enderecos com `:` (TON bruto `0:abc...`), risk-quality usa `split(":")` e os rejeita; Sui (0x hex) e minusculizado por tokenCandidate (candidates.ts:40) mas tratado como sensivel a caixa pelas tres. Inalcancavel (cadeias do ecossistema: 501, 8453, 56, 1). Exportar um unico helper.
12. closing-audit.test.ts:9-16. A fixture grava `atMs = NOW = reviewedAtMs` e nenhum tempo fisico, formato que o produtor nunca escreve (o real tem `atMs <= quote.startedAtMs` e `askedAtMs` preenchido quando ha resposta), e nenhum teste passa um registro de `runClosing` pelo auditor. Por isso SF-2 e SF-3 nao aparecem na suite. Adicionar o teste de aceitacao com registros reais (meu C1). Tambem: `briefBytes` acima de CLOSING_BRIEF_MAX_BYTES (6000) nao e sinalizado, e a constante so e aplicada em testes (closing.ts:17), nao em tempo de execucao.

## 6. O que tentei e nao encontrei defeito

- Identidade: Solana em minusculas contra a quote original = mismatch (correto); EVM com caixa de checksum = mesmo ativo da quote minuscula; "solana", "0501", "501 ", "Solana" nunca casam; mesmo endereco em outra rede valida (8453 contra 1) = mismatch; `__proto__` e `constructor` como indice de rede ou segmento sao recusados em risk-quality; EVM com caixa mista no id de entrada resolve para o id minusculo do Brief.
- Hash e bytes: edicao de um campo, de bytes, do corpo da quote, de ciclo/candidato/request, de ativo (com fingerprint recomputado) e de relogio (com fingerprint recomputado) sao todas detectadas. Round trip JSON preserva ambos os fingerprints.
- Unidades: ms vs s (`cot.idade` em segundos nao e usada; idades do risk-quality em ms e minutos com divisao por 60000 correta), percentual vs fracao (nao tratado nestes modulos; o binder converte taxRate fracao para percentual em quote-facts.ts:49-52 e 82-83 e o auditor nao o reinterpreta), unidades menores vs decimais (`outputUnit: "unverified"` e `execution: "not_inferred"` exigidos).
- Bordas de frescor: 15000 passa e 15001 e recusado de forma consistente (binder, `quoteIsFresh`, auditor). `capturedAtMs` igual a `nowMs` aceito; um ms antes e `view_clock_invalid`; `asOfMs` um ms no futuro = `source_clock_invalid`.
- Null, NaN, Infinity: distribuicoes com NaN, strings, chaves extras, array, fora de [0,1], so uma chave: todas `closing_distribution_invalid`; idades de q com Infinity, NaN, negativa, acima do inteiro seguro, string e booleano: todas rejeitadas como `risk_meta_invalid`; `buildBrief` ja recusa numero nao finito, entao nao ha Infinity num Brief real.
- Chaves de prototipo: `__proto__`, `constructor` em registro, quote, answer, `itens` e `candidatos` vindos de `JSON.parse`: sem excecao, sem poluicao de Object.prototype, sem ligacao indevida.
- Entradas enormes: Brief de 30 MB audita em menos de 3 s; aninhamento de 50000 niveis nao lanca (JSON.stringify falha e a funcao trata); lista de 1 milhao de candidatos e recusada em tempo constante; 1 milhao de chaves em `itens` fica abaixo de 2 s. 20000 registros mutados aleatoriamente (campo removido ou trocado por lixo) nunca lancam excecao.
- Campos extras: `profitUsd`, `filled`, `txHash`, `execution` no registro sao ignorados e nunca aparecem na saida.
- Veredito: empate arredondado nao inventa empate original; `refusal` nulo com `would` divergente da resposta reconstruivel gera `closing_verdict_mismatch`.

## 7. Limites desta revisao

- Nao existe registro de producao (closings.jsonl) nem Brief de ecossistema de producao; os "registros reais" sao do `runClosing` e do `createEcosystemSource` com dependencias falsas. Isso prova compatibilidade de formato com o codigo atual, nao com dados vivos.
- A suite completa do projeto nao foi rodada (existe um teste vermelho conhecido segundo a secao 86, closing-priority.test.ts; nao e dos modulos revisados).
- O codigo produtor (cycle.ts, closing-phase.ts) esta em trabalho do Claude principal e pode mudar; os numeros de linha citados sao do estado lido em 2026-10-14.
- Nenhuma afirmacao aqui implica que a segunda olhada, o scan de risco ou qualquer ordem foram executados, preenchidos ou lucrativos.
