# Diagnóstico independente do intervalo Onchain

Identidade: `audit_okx` (`/root/audit_okx`), 2026-10-13. Conversa própria `01a13629-5b7c-7bf0-82c5-38d1b3b67c07`. Fontes somente leitura em `review-standards` e `baseline`; escritas exclusivamente `research/onchain-interval-diagnosis*`. Sem `.env`, credenciais reais, rede, modelo real, servidor, carteira, ordem, assinatura de transação, staging ou commit.

## Decisão e causa

**Reject para encerramento de OR-04: intervalo global não qualificado.** A contraprova controlada reproduz o defeito no candidato congelado e no baseline. É um problema preexistente, não evidência de que os novos gates ou o deadline introduziram a falha. A conclusão anterior de correctness `approve` fica superada neste ponto pela nova evidência; o relatório histórico não foi reescrito.

Em `src/onchain-read/client.ts:227`, `lastSentMs` é gravado antes de `send()`. O preparo do deadline, timestamp e HMAC ocorre depois; `fetch` começa em `client.ts:118`. A próxima chamada calcula sua espera a partir do marco antigo em `client.ts:221`. Se o primeiro preparo síncrono consumir mais que o intervalo, a espera seguinte será zero, embora o primeiro `fetch` tenha acabado de começar. O baseline tem a mesma ordem em `client.ts:198`, assinatura em `:96` e fetch em `:101`.

A fixture usa somente `createOnchainClient`, credenciais sintéticas válidas no contrato público e fetch simulado. Um getter de `secret` faz 80 ms de trabalho síncrono apenas na primeira leitura. Não substitui `signRequest`, timers ou código interno. Com `minIntervalMs=40`, os dois fetches seguintes começam separados por 0–1 ms. A versão mínima precisa apenas de duas chamadas. Mover exatamente o mesmo atraso para `credentials()`, antes de `lastSentMs`, faz o controle passar. A reprodução também mede tempo monotônico: menos de 0,5 ms entre as entradas de fetch, afastando mudança de relógio como explicação deste experimento.

O log do integrador é compatível com este mecanismo (`Expected: >=38`, `Received: 1`), mas não registra timestamps de assinatura/dispatch ou pausas do processo. **Não é possível atribuir a execução original especificamente a HMAC caro, GC ou suspensão do processo.** O getter é uma injeção controlada de atraso, não demonstra o custo das credenciais normais. Uma suíte verde sem esse atraso não refuta o defeito.

Recomendação prioritária: o integrador deve corrigir o marco do último envio no limite de dispatch real, após o preparo síncrono, e incorporar a regressão pública antes de encerrar OR-04. Preservar HMAC, retry limitado, sent/ledger, credenciais após espera e os gates/deadline aprovados. Não alargar a tolerância de 38 ms do teste existente para ocultar esta falha.

## Contraprovas executadas

Hipóteses consideradas após o primeiro loop vermelho: (1) marco de envio anterior ao setup; previsão: atraso depois do marco falha, antes dele passa; (2) timer antecipado; previsão: seria necessário aguardar o timer para reproduzir; (3) alteração de Date.now; previsão: intervalo monotônico permaneceria adequado. O controle de localização confirma (1). A reprodução não precisa de um timer antecipado: após 80 ms o cálculo da segunda espera já é zero. A medição monotônica contradiz (3) neste cenário. Outras causas da execução original permanecem desconhecidas.

| Execução | Fixture | Candidato, controle | Candidato, atraso depois do marco | Baseline, controle | Baseline, atraso depois do marco | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| run1 | 3 chamadas; controle sem atraso | gaps 46/46 ms | gaps 0/43 ms; primeiro monotônico 0,184 ms | 44/45 ms | 1/56 ms; primeiro monotônico 0,1284 ms | exit 1; 2 pass, 2 fail, 14 expects |
| run2 | 2 chamadas; mesmo atraso em credentials vs secret | 57 ms | 0 ms; monotônico 0,2976 ms | 121 ms | 1 ms; monotônico 0,3465 ms | exit 1; 2 pass, 2 fail, 12 expects |
| run3 | repetição da fixture mínima imutável | 65 ms | 0 ms; monotônico 0,4683 ms | 103 ms | 0 ms; monotônico 0,1899 ms | exit 1; 2 pass, 2 fail, 12 expects |

Todos os resultados de cliente foram `ok:true, sent:true`, sem resposta de clock skew. Três execuções independentes foram vermelhas no candidato e baseline quando o atraso ficou depois do marco. Controles passaram. Tempos dos controles podem aumentar com agendamento; os valores não são benchmark.

Comando mínimo direto, no cwd `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/review-standards`:

```powershell
bun --no-env-file test C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/research/onchain-interval-diagnosis-minimal.test.ts
```

Execução real registrada, com RTK local e captura binária:

```powershell
& 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/venv/Scripts/python.exe' 'C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/research/onchain-interval-diagnosis-run.py' 'run2' 'minimal'
```

`run3 minimal` repetiu o mesmo arquivo. `run1` executou a fixture de três chamadas. O runner usa subprocess `shell=False`, Bun `--no-env-file`, wrapper RTK com timeout 30 s e limite externo 40 s. Cada JSON preserva argv literal, exit code e hashes das saídas; stdout/stderr completos estão em `onchain-interval-diagnosis-run{1,2,3}.{stdout,stderr}.log`. RTK retornou `pass_reason=command_unsuccessful`, `archive_id=null`; nenhuma saída foi comprimida ou reexecutada pelo wrapper.

Trecho literal mínimo de run2:

```text
[INTERVAL-MIN] {"label":"candidate","delayIn":"secret","wallGapMs":0,"monotonicGapMs":0.29759999999998854,"firstSignatureToFetchMs":80,"results":[{"ok":true,"data":[],"sent":true},{"ok":true,"data":[],"sent":true}]}
Expected: >= 38
Received: 0
 2 pass
 2 fail
 12 expect() calls
```

## Proveniência e integridade

Raiz fixa `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2`. Os quatro hashes e a SPEC conferiram antes dos testes e depois do diagnóstico. A leitura final está em `research/onchain-interval-diagnosis-hashes-after.json`. Nenhuma fonte ou teste existente foi alterado.

| Fonte | SHA256 antes = depois |
| --- | --- |
| review-standards/src/onchain-read/client.ts | `7f48c71f45b317482325eb506626c8dbe930e3f50827b81a851f7d5d67fd1138` |
| review-standards/src/onchain-read/client.test.ts | `3dbb7c31fc14ffd71b2bb2c5f2378e404fc54f85bd0dd3ba786a55e943f3c958` |
| review-standards/src/onchain-read/gateway.ts | `62b3a8110719f4896d7b08a8da86e6f71080c25fa76e26b0451db7c62f59be42` |
| review-standards/src/onchain-read/gateway.test.ts | `9ad74d46714a5747432ffc812e8dab39c5f0f652aa02b5da304a4d006da61648` |
| review-standards/docs/sdd/backend-audit-20261013/ONCHAIN-SPEC.md | `4ef3aadfbb0baec1c9fdd4fb262312fd425864d53718abad9d9ba6fe94735ec3` |

SPEC OR-04 exige literalmente “preservar assinatura, normalização, retry limitado do relógio, intervalo global”. O comentário `client.ts:2` declara “One global queue sends at most one request per minIntervalMs”; `client.test.ts:196` mede as entradas de fetch e aceita 2 ms de folga (`:205`, `:206`). Esta investigação não modifica esses contratos.

| Artefato | SHA256 |
| --- | --- |
| verification/onchain-live-tests.log | `9db21bf243246facca5737ce690bdca65192a23d7ca5a0e42d73fc741d87f70a` |
| research/onchain-interval-diagnosis.test.ts | `566d41ac130a5a08927a0a915ae745f25a7ab73b1e240a5c4ad29f8221f6214e` |
| research/onchain-interval-diagnosis-minimal.test.ts | `917e61e466beabf3b5bff0c1d778f0b05fb1a0f8532c0f4501159da4365a8dbf` |
| research/onchain-interval-diagnosis-run.py | `1f6f886630202be82f2199293cee48b10cadbffab50b9c9eb37fd0b39cb0652a` |
| run1 stdout | `3a46cf9f98830ce6c666de10af35fda7f5813a9afab59fdb64df03f42f8d0a0c` |
| run1 stderr | `120c43db93f5e3356950c0638777ef21024619622cdb8ef8ea74265fdc39a32e` |
| run2 stdout | `7422cc22cb17495dc3bd88441b6b9876769ee822c35f351d0e3c52df2dfb3cb9` |
| run2 stderr | `e4c15641cb9386966b51fe4fb348d57e9681237428c1739cb875df3f3763ec5b` |
| run3 stdout | `2f9d6e10d6efa8e96fd7e2e3c585294c41b228f45748b9027a0d7002395948e3` |
| run3 stderr | `b9824a7d326d32a58dd2a01112f428eabebb6f48f8de0f9610289f0449bff0aa` |

O baseline `src/onchain-read/client.ts` é o mesmo ponto fixo da revisão anterior, SHA256 `118b8e32651986e57a83876cf84f75da533b8a6425b7f5f05f3b69379adbd1ea`. Seu resultado serve para localizar a origem preexistente, não para enfraquecer a aceitação atual.

## Limites

Nenhuma correção foi implementada ou certificada neste diagnóstico. As verificações de OR-01–03, HMAC e tipos da revisão anterior permanecem evidências históricas; não foram repetidas e não compensam a contraprova de OR-04. O log denominado live é de testes no checkout integrado, não prova tráfego a provedor real. O caso usa intervalo de 40 ms como o teste público; o padrão de 1100 ms continua suscetível a atraso síncrono superior ao seu intervalo, inferência do mesmo cálculo, não medição live. Não certifica operação de carteira, crescimento de capital, desempenho, cadência do bot de 300 ms ou autorização externa.
