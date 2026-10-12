# Revisão independente de src/portfolio-evidence (somente leitura)

Alvo: C:\Users\gabri\jev-trader-fin, branch final/consolidation, HEAD b7b4c6b, módulo no commit 8786fd6 (31 arquivos: 28 em src/portfolio-evidence mais SPEC, REPORT e MANIFEST). O `git show --stat` confirma que nada de terceiros foi tocado e `git log 8786fd6..HEAD` não mostra mudança posterior no módulo. Revisor distinto do autor (GOAL 2).
Método: nada no repositório foi alterado. Execução em cópia de `git archive HEAD` fora do repo (bun 1.3.14, tsc 7.0.2, cwd temporário, `--no-env-file`, sem rede, sem credenciais, só canários sintéticos; só o typecheck e uma execução com a config do repo rodaram na raiz da cópia). No processo real (main.ts) rodei apenas demo, help, plan e `refresh` recusado: sem flags e, no probe3, com só `--live`, em ambiente sem credenciais; ambos saíram com 2 antes de ler ambiente ou abrir rede (aviso: essa segunda chamada contém o texto `refresh --live`, recusada pelo gate). O caminho completo das 3 flags rodou só dentro do processo de teste, via runCli com fetch roteirizado e credenciais canário. A cópia extraída foi apagada ao final (o rmdir falhou em caminhos longos de node_modules; concluí com espelho vazio via robocopy); sondas e saídas ficam em portfolio-review\probes, \mutate e \*.out.

## 1. Veredito: APPROVE_WITH_NOTES
- Seguro para entrar em main: nenhum caminho de assinar, enviar, aprovar, transferir, comprar ou vender (fecho de imports de 39 arquivos varrido); o padrão sem flags é totalmente offline; nenhum segredo nem endereço completo vazou em saída, erro, store ou journal; nada no repo importa o módulo (grep em src, scripts e web).
- Não há P1. Há 5 P2 e 15 P3. Os P2 não bloqueiam o merge, mas bloqueiam que uma camada superior (análise do JEV, relatório, adaptador do System One) confie em `status: valid` ou `netWorth.valueText` antes de F1 a F4 (correções pequenas) e dos testes de F5.
- Reproduzido por mim: 184 testes, 704 asserções, 7 arquivos, 0 falhas (6 execuções e 3 em ordem aleatória); typecheck saída 0 (o tsc inclui os 28 arquivos); dependências (onchainos e okx-wallet) 370 testes verdes; `main.ts demo` saída 0 com as 6 cenas e rótulo sintético na primeira linha; `refresh` sem flags saída 2; manifesto 30 de 30 no worktree.

## 2. Conformidade (RQ-01 a RQ-10, AC-a a AC-f)
| ID | Estado | Código (arquivo:linha) | Teste que prova |
| --- | --- | --- | --- |
| RQ-01 identidade | DONE | identity.ts:19-21,38-49; balances.ts:277-304; reconcile.ts:96-111 | core.test.ts:81-132; acceptance.test.ts:275-294; builders.test.ts:216-223 |
| RQ-02 quantidade exata | DONE | decimal.ts (BigInt); balances.ts:120-165,194; types.ts:119-130 | core.test.ts:28-65; acceptance.test.ts:296-321; purity.test.ts:128-134 |
| RQ-03 avaliação | PARTIAL: o instante do preço é gravado e nunca avaliado (F2) | balances.ts:174-215; types.ts:132-140 | acceptance.test.ts:142-147; builders.test.ts:171-186 |
| RQ-04 dois tempos | PARTIAL: não existe campo de bloco/slot; clockOffsetMs só entra, nada o mede; fonte sempre unknown na via OKX (collector.ts:424); cache congela o frescor (F1) | types.ts:55-69; state.ts:20-33 | acceptance.test.ts:323-345; core.test.ts:134-162 |
| RQ-05 proveniência | DONE (nomes: evidenceId, wallet_evidence_v1, fetchedAtMs) | types.ts:71-111,418-443; evidence.ts:77-123; balances.ts:327-370 | acceptance.test.ts:383-415; collector.test.ts:32-63 |
| RQ-06 conceitos distintos | DONE (só a trava do custo; o cálculo não existe, declarado) | evidence.ts:49-75; history.ts:207-228; types.ts:245-267,379-392 | acceptance.test.ts:150-165,220-249 |
| RQ-07 estados | DONE | types.ts:19-26; state.ts:11-15,35-67 | core.test.ts:154-161 |
| RQ-08 conciliação | DONE com ressalvas: RC2 só cobre zero, ausente e desconhecido; RC5 é por revisão | reconcile.ts:40-78,96-154,187-200; store.ts:80-90 | acceptance.test.ts:114-218; builders.test.ts:216-240; collector.test.ts:353-366 |
| RQ-09 sintético | DONE com ressalva: origem afirmada pelo chamador (F11) | types.ts:11; evidence.ts:105; report.ts:23; fixtures.ts:13 | purity.test.ts:142-161; acceptance.test.ts:383-392; cli.test.ts:26-59 |
| RQ-10 aritmética | DONE | decimal.ts; purity.test.ts:49,128-134 | core.test.ts:28-65 |
| AC-a omitido não vira zero | DONE | balances.ts:229-244,338-352; reconcile.ts:113-116 | acceptance.test.ts:71-112; collector.test.ts:74-113 |
| AC-b histórico contra ativo zerado | DONE no núcleo; mais estreito que o design 4.5 (só preço zero, não preço ausente) | reconcile.ts:118-154 | acceptance.test.ts:114-148 |
| AC-c PnL fora do patrimônio | DONE | evidence.ts:49-75; types.ts:390 | acceptance.test.ts:150-165; collector.test.ts:94-95 |
| AC-d total contra soma | DONE (causas não quantificadas, por desenho) | reconcile.ts:40-78 | acceptance.test.ts:167-218 |
| AC-e duplicidade, rede, decimais, ordem | DONE | balances.ts:254-304; history.ts:114,127 | acceptance.test.ts:251-381; builders.test.ts:80-85 |
| AC-f fixtures rotuladas | DONE | fixtures.ts:1-13; report.ts:23 | purity.test.ts:142-161; cli.test.ts:26-59 |

## 3. Segurança
(a) Imports: o fecho de main.ts tem 30 arquivos; o de todos os 28 arquivos mais testes, 39. Fora do módulo só entram lab/capture-format, okx-wallet/chains e onchainos/{capture-types,capture,endpoints,errors,fakes,http,paging,read,values}. Zero ocorrência de operator, solana-signer, ethers, executor, pilot, server, trader. Especificadores não relativos: node:crypto (canonical.ts:6) e, só em testes, bun:test, node:fs, node:path, node:child_process (cli.test.ts:7, só comandos offline com env mínimo). Grep de sign, approve, transfer, swap, broadcast, order, buy, sell, privateKey, mnemonic no código: só nomes (signal, signedStatement = número com sinal) e comentários.
(b) Pontos de rede, arquivo e ambiente (código, sem testes):
| Ponto | Onde | Proteção |
| --- | --- | --- |
| fetch global | main.ts:16 | só chega ao refresh (cli.ts:187-193) |
| process.env | main.ts:20; valores lidos em cli.ts:180,191 | só no refresh, depois de --live, --credentials-from-env e --allow-network (cli.ts:174-179) |
| Date.now, setTimeout, console | main.ts:22-25 | único arquivo permitido; purity.test.ts:54-65 |
| node:fs via CaptureFs | main.ts:12,26 -> onchainos/capture.ts:55-83 | usado em store.ts:54-87, só com --store-dir (cli.ts:194-195) |
| setTimeout por chamada e HMAC | onchainos/http.ts:344-351,119-121 | dependência; segredos em closure (:526-529); `ready` exige credencial válida e allowNetwork === true (:524) |
| WebSocket, node:net, child_process, Bun.spawn | nenhum no código | purity.test.ts:45-51 (não cobre Bun.spawn, ver F17) |
Sem flags (`main.ts`, `demo`, `plan`): sem env, sem rede, sem arquivo (probe3 no entry point real, env só com PATH).
(c) Tentativas de furar (probe2 S1 a S6, probe3, probe4): as 7 combinações incompletas das 3 flags: saída 2 e zero chamadas; cada variável OKX ausente, vazia ou só espaços: saída 2 e zero chamadas; credencial como `--api-key X`: recusada (a opção não existe); endereços malformados (vazio, 0x, não hex, curto, quebra de linha, espaço, 10 mil caracteres, NUL, unicode, EVM para Solana e o inverso, 0X, injeção `&chains=56`): zero chamadas, valor não ecoado, seção `falhou`; limites (--max-calls 0, 61, 1e3, -1, 99999999999, --max-pages 11, --deadline-ms 300001, --per-token-cap 21): saída 2 e zero chamadas. Biblioteca: coletor sobre cliente com allowNetwork false, sem credenciais, "true" em texto, 1 ou omitido: zero chamadas de fetch, stoppedBy offline, nenhum dado de exemplo.
(d) Vazamento: 5 respostas hostis (401, 500, api 50001, fetch lançando, corpo refletindo o segredo) com canários de chave, segredo, passphrase e o endereço: nenhum aparece em stdout, stderr, arquivos do store ou journal, com busca sem distinção de caixa (o caso 5 é o F12). Endereço nunca gravado, só `accountRef.sha256` (evidence.ts:44-47; M69 e M70 mortos). Todo endereço de 40 hex no módulo e nos docs é zero preenchido; nenhuma chave real. O ramo "falha inesperada" (cli.ts:204) é seguro (probe7), mas sem teste (M71 sobrevive). Eco de argumentos: F6.
(e) Cliente HMAC: com todas as opções ligadas (histórico, PnL em 2 redes, mercado com liquidez e risco, probe) saem exatamente 10 pares método+caminho, todos de leitura: GET balance/all-token-balances-by-address, GET balance/total-value-by-address, POST balance/token-balances-by-address, GET post-transaction/transactions-by-address (histórico), GET market/portfolio/overview, GET market/portfolio/recent-pnl, POST market/price, POST market/token/basic-info, GET market/token/top-liquidity, GET market/token/advanced-info. Nenhum de troca, transação, pagamento ou segurança; GET sem corpo; todos assinados. Ressalva: ONCHAINOS_PATH_PATTERN (http.ts:481) aceita qualquer /api/v6/*; a garantia vem dos pontos de chamada. Sugestão: lista fechada no wrapper collector.ts:225-234.

## 4. Correção dos números (probe1, probe4, fuzz probe8)
117 verificações ok: parseDec (quebra de linha, dígitos não ASCII, expoente, sinal, 80 e 81 caracteres, escala 60 e 61), arredondamento half_even e floor com negativos, 6 e 18 decimais, 1 átomo a 18 casas, uint256 máximo exato, preço "0" e "0.000" nunca valorados (patrimônio desconhecido, RC2 duas vezes), produto exato sem arredondar, 300 posições somam 30, raw com zeros à esquerda, raw ou balance em número JSON recusados, zero reportado, decimais derivados/fixados/em conflito, SOL com 9 casas, RC1 (delta 0.01 dentro, 0.010000000000000001 fora, negativo exato, total ilegível, sem posição avaliada), RC2/RC3/RC4/RC6, fronteiras de frescor (+5000 fresco, +5001 futuro, NaN e negativo falham fechado), offset, hash estável, round trip JSON, adulteração de qualquer campo e campo extra. Fuzz (80 mil casos, 3 sementes): 0 exceção, 0 falha de verify, 0 chave duplicada, 0 posição em rede não pedida. Anomalias: F4 (22 a 41 casos por rodada) e token de risco com quantidade zero marcado `included` (inofensivo, valor 0).

## 5. Força dos testes: 108 mutações em memória (plugin de preload; nada em disco)
88 de lógica e 20 de sensibilidade do scanner de pureza; cada `find` casa exatamente 1 vez (validate.ts). Resultado: 97 mortas e 11 sobreviventes (10 lacunas e 1 controle equivalente, M85). Só com a suíte do módulo: 95 mortas e 13 sobreviventes (M44 e M73 só morrem na suíte da dependência). As 13 categorias do REPORT foram reproduzidas por equivalentes: M01, M26, M11, M31/M32, M36, M17, M04, M14, M21, M86, M87, M52, M45.
| Regra crítica | Mutante (falhas) | Quem mata |
| --- | --- | --- |
| omitido por filtro vira zero | M01 (6), M02, M03 | acceptance.test.ts:72,87,94; collector.test.ts:74 |
| preço zero valorizado, preço ausente vira 0 | M04 (2), M05 | acceptance.test.ts:142; builders.test.ts:181; acceptance.test.ts:211 |
| PnL somado ao patrimônio | M11 (3) | acceptance.test.ts:151; collector.test.ts:74 |
| duplicata somada, conflito colapsado | M14 (9), M15, M16 | acceptance.test.ts:275,282,291; builders.test.ts:74 |
| frescor ignorado, futuro, offset | M21 (5), M22 (4), M23, M24, M25 | acceptance.test.ts:323,333,340; core.test.ts:135,143,148 |
| janela parcial como completa | M36 (6), M37, M38 (3) | acceptance.test.ts:221,233,244; builders.test.ts:102 |
| gate de rede e credenciais | M40, M41, M42, M43 (3), M44 | cli.test.ts:88,97; collector.test.ts:255; okx-read.test.ts:288; M44 só onchainos D2 |
| 401, 402, 403, 429 não encerram | M45 a M48 | collector.test.ts:241 (5 casos), :157 |
| limite de chamadas, prazo, teto, cap por token | M49 a M53 | collector.test.ts:177,192,216,149 |
| paginação | M39, M54 a M59 | okx-read.test.ts:120,125,139,148,159; collector.test.ts:201; paging.test.ts |
| hash | M60, M61, M62 | core.test.ts:68; acceptance.test.ts:406; collector.test.ts:368 |
| RC1 a RC6, tolerância, revisão, cache | M26 a M34, M65 a M68 | acceptance.test.ts:114-218; builders.test.ts:225; collector.test.ts:305,353 |
| privacidade, sintético, aritmética | M69 a M79 (M71 e M73 à parte) | acceptance.test.ts:393; cli.test.ts:54,62; core.test.ts:38,49 |
Sobreviventes reais: M08 (balances.ts:163, guarda do raw com uma única fonte de decimais), M35 (reconcile.ts:63-66, soma desconhecida lida como 0 no RC1), M63 e M64 (evidence.ts:129, evidenceId e schema no verify), M84 (balances.ts:354, ordem de entrada não afeta o hash), M71 (cli.ts:204), P03 (import dinâmico de ../operator), P05 e P06 (Bun.spawn e Bun.$), P14 (globalThis["fetch"]). Confirmei por sonda que M08, M35, M63, M84 e M71 mudam o comportamento real (probe5, probe1 sob MUTANT, probe7).
Cobertura de linhas (bun test --coverage): cada arquivo de produção entre 97,65% e 100%; descobertas: balances.ts:343-344, cli.ts:130-131, evidence.ts:130-131, reconcile.ts:64-65. Linha executada não é asserção: M08 e M71 vivem em linhas "cobertas".

## 6. Documentos contra o código
1. MANIFEST.sha256: 16 hashes são de arquivos LF e 14 de CRLF. No worktree 30 de 30 passam; num checkout uniforme falham 16 (tudo CRLF, como no meu git archive) ou 14 (tudo LF). O comando do REPORT ("sha256sum -c MANIFEST.sha256" na raiz) não acha o arquivo; o certo é `sha256sum -c docs/portfolio-evidence-v1/MANIFEST.sha256`.
2. REPORT (linhas 3 e 132) ainda diz nada commitado, revisão pendente e "o usuário não pediu" commit; o módulo está em 8786fd6 e esta é a revisão. state.ts e REPORT falam em "desvio de relógio medido": nada mede, só aplica.
3. REPORT "Teto 12 chamadas": conta chamadas lógicas; retentativas (padrão 2) triplicam as requisições HTTP (F9). "Timeout configurável até 60 s": só na biblioteca, não no CLI.
4. SPEC PE-14 promete `missing` explícito; só preço e decimais geram `missing`, falha de liquidez ou risco vira erro em collection.errors. store.ts:10-11 cita um `data/` padrão do CLI que não existe.
5. Mercado: REPORT e `plan` dizem tier desconhecido, mas o registro marca price, basic-info e top-liquidity como basic e advanced-info como premium (onchainos/endpoints.ts:34,41,43,45), e collector.ts:340 grava tier "unknown".
6. SDD: tasks.md e requirements.md ainda dizem que nada foi implementado; nomes divergem do design (wallet_evidence_v1 contra portfolio_evidence_snapshot_v1, fetchedAtMs contra capturedAtMs, evidenceId contra snapshotId, chave `1:contract:` contra `1:`) sem tabela de correspondência; faltam os vectors/ compartilhados da T1.1.
7. Confirmados: contagem de testes por bloco A1 a A7 (4, 5, 2, 5, 3, 16), limites (12/60, 3/10, 60/300 s, 5/20), cache desligado por padrão, varredura de segredos, "nenhum arquivo de terceiros editado". Não verificáveis offline: as páginas da OKX e o comportamento ao vivo (flag de risco booleana, default de excludeRiskToken no total-value, nativo como "").

## 7. Achados
P1: nenhum.
P2 (relevantes):
- F1 Cache devolve evidência congelada como `valid` e `fresh` além de `maxAgeMs`. collector.ts:200-206; `--cache-ttl-ms` aceita até 999999999 (cli.ts:79,109) e o fingerprint ignora maxAgeMs e valueToleranceUsd (collector.ts:148-163). Cenário: maxAge 60 s, TTL 600 s, segunda chamada aos 500 s: hit, status valid, captura fresh. Sonda: probe2 S10, probe4 item 5. Correção: limitar o TTL ao maxAge ou reavaliar o frescor na leitura.
- F2 Instante do preço gravado e nunca avaliado; unidade não normalizada. balances.ts:196-209, market.ts:27-41, okx-read.ts:331-335 (aceita 10 a 16 dígitos: segundos e microssegundos viram "ms"; history.ts:51-56 e address-analysis.ts:47-52 validam a faixa). Cenário: preço de mercado de 1 ano ou de 1970 mantém a posição ok e o status valid; `valid` só certifica a captura (fonte e preço sem relógio na via OKX). Sonda: probe1 seção E, probe4 item 1.
- F3 Campos de segurança ilegíveis falham abertos. balances.ts:167-172,311: `isRiskToken` string, número, null ou ausente => assessment unknown, posição contada, status valid, sem ressalva; o mesmo vale para `address` ausente, nulo ou vazio na linha (a conta da linha não é conferida, balances.ts:265). src/okx-wallet/portfolio.ts:107 rejeita a resposta inteira nos dois casos. Sonda: probe6 e probe10. Correção: tratar como unverified e não contar.
- F4 `sumIncluded` descarta em silêncio a posição incluída cujo valueText passa dos limites de parseDec (80 caracteres, 60 casas). balances.ts:420-427, decimal.ts:13-32. Cenário: 18 casas e preço com 43 ou mais casas, ou quantidade enorme com preço de 3 casas: valuedCount conta, netWorth e RC1 não. Sonda: probe1 (82 caracteres) e probe8 (22, 27 e 41 casos). Correção: guardar o Dec ou marcar unverified.
- F5 Lacunas de teste em regras críticas: M08, M35, M63, M64, M84, M71 (seção 5), mais M44 e M73 que só a dependência cobre.
P3 (menores):
- F6 Eco de argumento desconhecido em stderr: `--api-key=SEGREDO` e `--address=0x...` aparecem na mensagem (cli.ts:71,209). Sonda: probe2 S2, probe3.
- F7 Saída 0 quando toda seção falha sem parada (rede, 404, 500, schema, endereço inválido): cli.ts:201. Sonda: probe4 item 4, probe2 S3.
- F8 `--json` em cache hit imprime linha que não é JSON depois do JSON (cli.ts:197-200); `--help` como primeiro argumento sai com 2 (cli.ts:60,209).
- F9 Retentativas não entram no teto: maxCalls 2 e HTTP 500 permanente geram 6 requisições (12 com maxRetries 5); `outcome.quota` existe e o CLI não o imprime. Sonda: probe2 S11.
- F10 `plan` mostra caminho e método só dos 6 endpoints da carteira; os 4 de mercado (chamados por padrão, e com --liquidity e --risk, este premium) não aparecem com tier (cli.ts:169). Sonda: probe3.
- F11 `origin` vem do chamador (collector.ts:61-62): fetch roteirizado marcado okx_web3_api sai "DADO REAL"; report.ts:23 imprime "origem okx_web3_api" para qualquer origem real. Sonda: probe2 S12.
- F12 Texto do provedor sem limite fica no arquivo: `Quantity.rawText` (balances.ts:122) e `RejectedRow.chainIndex` (balances.ts:255); 1,9 milhão de caracteres persistidos e eco de segredo se o provedor o refletir. Sonda: probe2 S8 caso 5 e S9. Correção: aceitar rawText só com ^\d{1,80}$.
- F13 Alias nativo 0xeee...e não normalizado: `1:native` e `1:contract:0xeeee...` viram dois ativos somados (patrimônio duplicado), só aviso de símbolo. Sonda: probe4 item 3.
- F14 store.latest não confere accountRef nem origin do arquivo (store.ts:53-62,78): arquivo de outra conta renomeado é servido. Sonda: probe4 item 5.
- F15 Seção `balances` de resposta vazia sai `valid` (balances.ts:383-388); só o patrimônio e o status geral ficam incompletos. Sonda: probe4 item 4.
- F16 RC1 com total menor que a soma recebe causas candidatas que só explicam total maior e fica unreconciled em vez de divergent (reconcile.ts:51-59,76). Sonda: probe1.
- F17 O scanner de pureza não pega import dinâmico, Bun.spawn, Bun.$ nem globalThis["fetch"] (purity.test.ts:26-28,42-65). O código real não tem nenhum.
- F18 Contrato: sem bloco/slot (RQ-04); RC2 não compara positivo com positivo nem trata preço ausente como pendência (design 4.5); a tolerância de preço usa piso (balances.ts:201-203): 200,9 bps passa.
- F19 Falha de gravação do store depois das leituras faz o CLI sair com "falha inesperada" sem imprimir a evidência já lida (collector.ts:451). Sonda: probe7.
- F20 Privacidade: com --history o arquivo guarda hashes de transação, que ligam o arquivo ao endereço na cadeia, e o REPORT afirma só o hash da conta; não há guarda para --store-dir dentro de pasta versionada.

## 8. Limites e reprodução
Não verificado: páginas da OKX, assinatura aceita, tiers, forma real de `data` (sem rede, por regra). Mutações são textuais; o fuzz usa um corpus finito. Windows, bun 1.3.14; `git archive` converteu tudo para CRLF (numeração de linhas igual à do blob LF).
Reprodução: extrair `git archive HEAD` do worktree, `cd` para um diretório temporário e rodar `bun --no-env-file probes\probeN-*.ts <cópia>\src`. Mutações: `bun mutate\runner.ts <cópia>\src <cwd> "<regex de ids>"` (preload.ts fixa o nome copy-b7b4c6b no filtro) ou `MUTANT=M08 bun --no-env-file test --preload mutate\preload.ts --timeout 60000 <cópia>\src\portfolio-evidence`. Resultados: mutate\run-all.out e results-_.json; probe1.out, probe2.out, probe4.out, typecheck.out.
