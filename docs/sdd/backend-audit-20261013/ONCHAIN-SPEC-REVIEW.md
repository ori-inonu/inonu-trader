# Revisão independente de SPEC Onchain

Revisor: `audit_intelligence` (`/root/audit_intelligence`), conversa própria `01a13629-d057-7821-a554-a42994564eb9`. Não escreveu a SPEC nem o candidato. Decisão: **approve**, exclusivamente para o comportamento do candidato congelado frente a OR-01–04. Fontes e baseline permaneceram somente leitura.

## Avaliação

Não encontrei requisito funcional ausente/parcial, comportamento incorreto ou escopo extra nos quatro diffs autorizados. A SPEC congelada permanece íntegra; seus critérios não foram reinterpretados para acomodar testes.

| Critério imutável | Cobertura observada |
| --- | --- |
| OR-01, SPEC:13 | `gateway.ts:63,103–109` serializa líderes, revalida cap/mês após admissão e conta apenas enviados. Regressões cobrem três chaves com cap=1, coalescing, falhas, stale, cap dinâmico e rollover UTC/histórico anterior. Probe independente também reduz cap durante a segunda espera do retry: `budget_exhausted`, `sent=false`, sem envio adicional. |
| OR-02, SPEC:14 | `client.ts:208–229` revalida cooldown e camada antes e depois do intervalo, obtendo credenciais no despacho. Regressões cobrem 429/50011, 402 por camada, expiração, remoção e rotação de credenciais. |
| OR-03, SPEC:15 | `client.ts:90–111,138,163,183` usa um único prazo/signal para fetch, corpo e retry; descarta continuidade tardia. Regressões exercitam 200/401/403 pendentes, abort ignorado, sucesso/rejeição tardios e cache. Probe independente confirmou retry com fetch pendente, progresso da fila e status preservado após resposta tardia 429. |
| OR-04, SPEC:16 | `gateway.ts:99–117` preserva precheck por caller e nova admissão coalescida para user elegível. Vinte seguidores compartilharam um único retry, com apenas um `sent=true`. Suite de assinatura, normalização, cache, budget, cliente/gateway e HTTP passou; tipos estritos passaram. Logs red anteriores foram lidos. |

A execução independente foi **196 pass, 0 fail, 763 expects/11 arquivos**, mais **3 pass, 0 fail, 16 expects** nos probes. O diff preserva interfaces e contratos fora das correções. `ONCHAIN-VERIFICATION.md:7–13` corresponde ao candidato observado e declara corretamente integração pendente. OR-04 exige integração por hashes: este parecer aprova o candidato; a integração futura precisa de auditoria própria. Não executei typecheck global, nem certifico operação live, lucro, objetivo amplo ou aprendizado ML. Nenhuma rede, credencial real, env, modelo, ordem, publicação ou alteração de fonte foi usada.

## Anexo de hashes

SHA256, lowercase. Hashes do candidato conferidos antes e depois das verificações, sem mudança. Baseline fixo lido independentemente.

| Arquivo | Baseline | Candidato antes = depois |
| --- | --- | --- |
| `src/onchain-read/client.ts` | `118b8e32651986e57a83876cf84f75da533b8a6425b7f5f05f3b69379adbd1ea` | `7f48c71f45b317482325eb506626c8dbe930e3f50827b81a851f7d5d67fd1138` |
| `src/onchain-read/client.test.ts` | `c1c5cee59e4498268ef6788e1f7b75cddae73d84c04ec42344ee7f80c66434e6` | `3dbb7c31fc14ffd71b2bb2c5f2378e404fc54f85bd0dd3ba786a55e943f3c958` |
| `src/onchain-read/gateway.ts` | `0b4ce61c93037d9319913ddbaaa92d5d5892ffe33bfe7317177cd16f7ea95d0d` | `62b3a8110719f4896d7b08a8da86e6f71080c25fa76e26b0451db7c62f59be42` |
| `src/onchain-read/gateway.test.ts` | `aef810c529c376c58c36bf4d6938ce722bc567d656c97ff5ced74076bb3c3374` | `9ad74d46714a5747432ffc812e8dab39c5f0f652aa02b5da304a4d006da61648` |

`ONCHAIN-SPEC.md` antes/depois: `4ef3aadfbb0baec1c9fdd4fb262312fd425864d53718abad9d9ba6fe94735ec3`.

Probe exclusivo: `onchain-review-evidence-probes.test.ts`, SHA256 `a282b4f56923e2658915ce15a66c1b6d9e0d244df1d6206b255c2f8174458e59`. Usa imports do candidato, cliente/fetch sintéticos e budget em diretório temporário isolado; cleanup confere o caminho absoluto.

## Anexo de execução e limites

Diretório de execução: `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/review-spec`. Comparação somente dos quatro alvos por `git diff --no-index -- <baseline/arquivo> <candidato/arquivo>`: exit 1 indica diferenças; warnings LF/CRLF foram preservados, sem mudança de hash. Resultados literais recebidos das ferramentas e comandos de hash estão em `onchain-review-evidence-results.json`. O retorno da suíte foi truncado pela ferramenta; preservei o retorno tal como recebido e não afirmo captura integral em bytes dessa execução.

Comando da suíte, através do wrapper RTK obrigatório, que retorna Bun sem compressão sem gramática reconhecida:

```powershell
& 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/venv/Scripts/python.exe' 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/adapter/adapter_cli.py' run --cwd 'C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/review-spec' --timeout 120 --profile test --rtk 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/bin/rtk.exe' --headroom-python 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/venv/Scripts/python.exe' --store 'C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/research/onchain-review-evidence-rtk' -- bun --no-env-file test ./src/onchain-read
```

Exit 0. Resumo literal observado:

```text
 196 pass
 0 fail
 763 expect() calls
Ran 196 tests across 11 files. [4.19s]
```

```powershell
bun --no-env-file node_modules/typescript/lib/tsc.js --ignoreConfig --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --moduleResolution bundler --module preserve --moduleDetection force --target ESNext --lib ESNext --types bun src/onchain-read/client.ts src/onchain-read/client.test.ts src/onchain-read/gateway.ts src/onchain-read/gateway.test.ts
```

Exit 0, saída vazia. Sem afrouxamento de opções.

```powershell
bun --no-env-file test C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/research/onchain-review-evidence-probes.test.ts
```

Exit 0. Saída resumida literal:

```text
 3 pass
 0 fail
 16 expect() calls
Ran 3 tests across 1 file. [434.00ms]
```

Evidências históricas lidas em `docs/sdd/backend-audit-20261013/evidence/`, sem reexecutar reds nem inventar sua proveniência:

| Log | SHA256 | Evidência literal |
| --- | --- | --- |
| `onchain-cap-red.log` | `01db95043de8adeae7d26e9138258e4a4ba93ebc41091b090683f1d2ceb8ef4e` | `Expected length: 1` / `Received length: 3`; 9 pass, 1 fail. |
| `onchain-intent-red.log` | `a611abe56346ff29ed1593a95b1d2599eef8bdfdd04a2cd6f203100bf1f924f0` | user recebeu `pace_limited`, `sent=false`; 10 pass, 1 fail. |
| `onchain-queue-red.log` | `002907c508d8bb33b731d7f728f0bea5172667f0c8c3f821e5e955ca550d9d1d` | dois cooldowns receberam length 3; falha temporal adicional do intervalo `Received: 0`; 27 pass, 3 fail. |
| `onchain-deadline-red.log` | `249199f5ecec32f40adb222dad0000df9194513cc7b1f4bbafd5073e3633b62c` | três retornos `still_pending`; 30 pass, 3 fail. |

A limitação por instância, consumo de corpo antes de checar tamanho, timeout apenas da operação enviada e dependências reservadas permanecem explícitos em SPEC:29–31. Esta aprovação não concede autorização externa nem aprovação humana.
