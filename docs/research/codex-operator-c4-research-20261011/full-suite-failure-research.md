# Pesquisa offline: execução da suíte completa — 2026-10-11

Pesquisa independente desta rodada de lock, sem aprovação de implementação. Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Conversa própria: `01a12adc-473d-7381-b067-c83af7ccda31`. O objetivo amplo central JEV continua incompleto. Relatórios antigos `operator-implementation-*` não foram usados como aceite desta rodada.

Origem somente leitura **O**: `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader`; HEAD observado `99523e427945c3154c59284662e3bbcc526eec3c`. Alteração preexistente observada: ` M scripts/okx-operator.ts`. Os hashes do candidato e teste conferem com os fornecidos pelo usuário. Diretório exclusivo **E**: `C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011`, cópia ordinária, sem repositório Git; isso não constitui sandbox de sistema operacional.

## Resultado e evidência literal

| Execução existente | Evidência | Conclusão delimitada |
|---|---|---|
| a | `exit1` informado; métricas `duration_ms=100338.5003000003`, `pass_reason="command_unsuccessful"`, sem recibo integral do exit/streams original | Causa **desconhecida**. Não converter retroativamente em timeout nem falha de teste. |
| b, diagnóstico 98638 | Atualização autoritativa: terminal `exit124`; métricas `100186.56660000852ms`; hashes dos dois logs conferem | Timeout externo **confirmado**. Nenhum marcador de falha ou resumo final encontrado nos streams capturados; execução incompleta. |
| c, processo 29047, chunk bd22c6 | Atualização autoritativa: Bun original `exit_code=0`; métricas `177000.02170000516ms`, `pass_reason="command_not_allowlisted"`; resumo íntegro abaixo | Suíte raiz passou nesta execução; dois skips continuam sem cobertura. |

Literal de `C:/Users/gabri/.codex/cli-lock-full-20261011-c.stderr.log:2242–2246`:

```text
 1993 pass
 2 skip
 0 fail
 882973 expect() calls
Ran 1995 tests across 120 files. [176.84s]
```

Nesse log, linhas 2128–2135 identificam `scripts\okx-operator.test.ts` e sete resultados `(pass)`, incluindo literalmente `CLI reconciliation rejects another owner's lock and preserves ledger bytes`. Linhas 2239–2240 identificam os skips Market/Trader receipt-safety, exigindo `RECEIPT_SAFETY_SOURCE`, com hardening não integrado em main. Passagem não autoriza integração nem qualifica esses contratos omitidos. Filtragem delimitada também não encontrou `(fail)`, `Test timed out`, erro inicial ou `ETIMEDOUT` nos logs b/c; erros esperados dentro de JSON de fixtures não equivalem a testes falhos.

## Runner, configuração e hipóteses

**A** = `C:/Users/gabri/.codex/tools/rtk-headroom-20261010/adapter`. `A/adapter.py:183–194` executa uma vez via `subprocess.run(... timeout=timeout, capture_output=True, shell=False)`; linhas 189–190 associam literalmente `subprocess.TimeoutExpired` a `124, True`. `A/adapter_cli.py:100–102` escreve ambos os streams e retorna `result.exit_code`. `A/adapter.py:197–200` omite exit e timed_out das métricas: elas isoladamente não resolvem a execução a. Linhas 133–152 retornam falhas antes de arquivar; `archive_id=null` não oferece recuperação automática dos bytes truncados. Os logs privados b/c, agora existentes e hash-verificados, são a evidência recuperável; não foram copiados para E.

`O/package.json:32` fixa `bun --no-env-file test --parallel=1 --timeout 15000 ./src ./scripts`. `O/bunfig.toml:4–5` carrega o preload; `O/scripts/test-timeout-preload.ts:21–31` injeta `setDefaultTimeout(15000)` em cada módulo de teste. Trata-se de prazo por teste, não limite de duração da suíte. `O/scripts/okx-defi.test.ts:12–13` contém limites distintos: filho 45000ms, default local 60000ms. Não proponho alterá-los. Históricos locais reportam passes de 107,11s (`O/docs/OPERATOR-PERSISTENCE-CHECKPOINT-20261011.md:20`) e 140,01s (`O/docs/SYSTEM-ONE-EXPOSURE-DECIMAL-VERIFICATION.md:3`); o resultado c acrescenta 176,84s. Um wrapper de 100s não comporta essas execuções completas. Isso não identifica a origem do exit1.

O comentário de `O/scripts/qualify-live.test.ts:32–33` relata interferência anterior entre `Bun.spawnSync` com timeout e `node:child_process.spawnSync`, produzindo `ETIMEDOUT`; a implementação atual usa spawn assíncrono e timer de 30000ms, linhas 35–45. É relato fonte-local, **não reprodução nesta pesquisa**. `O/src/paper-supervisor-runner.test.ts:65–74` reúne vários limites de handshake/saída; linhas 24–32 fixam Bun e TEMP/TMP fora de E. Isolar só cwd não isola todos os filhos. O adapter não implementa controle explícito da árvore de processos; encerramento de descendentes após timeout permanece não demonstrado.

Não executei testes nem aplicação. `O/src/doctor.test.ts:6–15` abre servidor local e inicia filho sem `--no-env-file`, herdando `process.env`; `O/scripts/okx-defi.test.ts:143–170` cria e deliberadamente carrega `.env` sintético em controles. Portanto, copiar e executar indiscriminadamente a suíte não cumpriria os limites desta pesquisa. Não li nenhum `.env`, segredo ou diretório de perfil; não instalei dependências nem fiz chamadas de rede/provider/Jev, assinaturas ou ordens. Versões observadas por comandos locais: Bun **1.3.14**, Node **v26.9.0**, Python **3.14.7**; logs registram Bun `0d9b296a`. Essas observações não certificam toda a configuração histórica.

## Orientação e aceite proposto — somente pesquisa

- **R1 — Recibo verificável:** conservar argv, cwd, hashes, versões, prazo externo, exit original, signal/timed_out e ambos os streams íntegros fora de Git. Classificar cada execução separadamente; b não explica a. Os hashes atuais não provam todos os imports históricos da execução a.
- **R2 — Gates preservados:** manter testes, asserts, prazo por teste, guards econômicos/custódia e critérios independentes. O wrapper de 240s já permitiu c completar; tratar ajuste do prazo global como instrumentação, nunca como enfraquecimento de aceite. Não repetir a suíte agora.
- **R3 — Se surgir falha nova:** extrair primeiro nome/linha/recibo do log íntegro; reproduzir somente o subconjunto pertinente em cópia exclusiva, com ambiente allowlisted, rede impedida e paths temporários realmente próprios. Comparar runner isolado versus ordem mista apenas se houver evidência de interferência. Controle externo deve limitar filhos síncronos; registrar fechamento/saída, sem cleanup abrangente por nome de processo.
- **R4 — Aceite independente:** distinguir término da suíte, sucesso dos testes executados e cobertura dos skips. A rodada c satisfaz o resumo raiz observado; não fecha receipt-safety, frontend, objetivo amplo ou revisão independente. Nenhuma SPEC/implementação é aprovada por este relatório.

Alternativas reais: preservar a como desconhecida sem repetir trabalho; recuperar seu recibo original se houver; ou, diante de falha nova identificada, diagnóstico dirigido offline. Remover testes, esconder skips, aumentar indiscriminadamente limites internos ou afirmar causa ambiental sem reprodução não são alternativas de aceite.

## SHA-256 exatos

Paths relativos a O, exceto prefixos A/P. **P** = `C:/Users/gabri/.codex/`.

| Fonte | SHA-256 |
|---|---|
| scripts/okx-operator.ts | ed937480a59c21d94deab87769ac4ae68cf10b7bdaaa743898df7039c03f5784 |
| scripts/okx-operator.test.ts | aae504a1b3219b0e8fe1a61cdf80990d9dadb3ad28c374a29e7692eef8590a2d |
| package.json | f20dcbb49539fc32e0de83bb0ad9abd5b10c3425519e3ab5241b15a84ec634c6 |
| bunfig.toml | 7a207b924222010bf45ff7cdc097443437d4d3fea6509e26c20c54fdbae31b29 |
| scripts/test-timeout-preload.ts | fb1ac1c21e45506276b6ad6a533d83d29c61f3447a59b89765c83f6c0d5d66d9 |
| scripts/okx-defi.test.ts | c75dc3c4f3818ff4340f91d1c7a1ef128f6ad6c24da2b85ccff6256de39bd3ac |
| scripts/qualify-live.test.ts | a37be81e6e1a0235af5eb93e83454f28e6f069d4b808104f473b09006c0a1b4c |
| src/doctor.test.ts | 7b8e7ad9fdbcbf0de0c20ea2aaf5b280a697c89eeb0f923eb20bddf0fbef72b7 |
| src/paper-supervisor-runner.test.ts | 22dfc3f048455ec395efd8157e6a48fa33447e009767e656adc3bf6014a38c7e |
| docs/OPERATOR-PERSISTENCE-CHECKPOINT-20261011.md | 07805138abf78c4778b54888bdd03b722faea72cd6f6fa1fe7884ec0e9f6da13 |
| docs/SYSTEM-ONE-EXPOSURE-DECIMAL-VERIFICATION.md | 7094f08a8c5d66c8d04b1d3897598ce76130f6234d0ae87cf50cfd147966504f |
| A/adapter.py | fd02d968580d0d644edcc41f6c17b3cc73b200432f3c9c6eda4e4ed9a5ee75fc |
| A/adapter_cli.py | 65a0e70d141b61365513dddd655db844b30103a388f7eabf157272859ba7335f |
| P/cli-lock-full-20261011-a.json | 0a6e7f476f52249d2226abbfbe09076340df44a74f5fd42ab781f0aed6183b3b |
| P/cli-lock-full-20261011-b.json | 507466add6c8876cf71bd77d1e29eb5bdfe5402e62fd92fae2702da2dea9bb8c |
| P/cli-lock-full-20261011-b.stdout.log | ff17bd50b3a8427ff277e767a06557a11dbd0e25ac367c7322b537c16a6bdc91 |
| P/cli-lock-full-20261011-b.stderr.log | 2aac76b1818b3b414957f206dbd3715343b998389780c0d7267f1f3280fec21e |
| P/cli-lock-full-20261011-c.json | 900b9415a87c062cf6160d8d92fcd30aae26ddcfe85451444f2b7048b36b32a8 |
| P/cli-lock-full-20261011-c.stdout.log | deee1f13a01480397c0556b873e77267a9eab385779a3d9eca556e3ea2c1ca82 |
| P/cli-lock-full-20261011-c.stderr.log | be3d31453bc7706788571ffaebdab783bbfd2e62026446de8396708934b7bd67 |

Limites de observação: uma leitura inicial volumosa teve saída truncada e foi substituída por extração delimitada; um comando auxiliar PowerShell falhou por colisão com `$Matches` e foi corrigido sem alterar arquivos. Isso não é falha da suíte. Primeiro registro SDD rejeitou payload inválido; registro corrigido usa a conversa própria, apenas metadados de pesquisa. Não houve spawn de auxiliares, aprovação de implementação ou alegação de ganho/performance, root cause financeiro ou conclusão do objetivo amplo.
