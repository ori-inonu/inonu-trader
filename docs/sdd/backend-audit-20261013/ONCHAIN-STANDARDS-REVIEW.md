# Revisão independente Onchain: Standards/correctness

Decisão: **approve** neste eixo e neste candidato. Revisor: `audit_okx`, conversa própria `01a13629-5b7c-7bf0-82c5-38d1b3b67c07`, 2026-10-13. Não implementei as fontes revisadas. Inspecionei a cópia isolada `review-standards` contra o ponto fixo `baseline`; escrevi somente este relatório e evidências `research/onchain-standards-evidence-*`.

## Parecer, menos de 400 palavras

**Padrões documentados:** nenhum achado material. `AGENTS.md:10,29` e `CLAUDE.md` exigem Bun e `bun:test`; as verificações executadas seguem ambos. As mudanças não introduzem I/O de arquivo, frameworks alternativos ou texto renderizado e preservam a fronteira de leituras. O contrato central de `AGENTS.md:113-125` permanece fora deste diff. Tipos e regras verificadas pelo compilador não foram repetidos como achados manuais.

**Heurísticas Fowler:** nenhum smell que justifique alteração neste diff. `gateway.ts:63-67` não é um possível Middle Man relevante: o wrapper é dono da sequência de admissão e de sua recuperação após rejeição. `client.ts:208-212` reúne o gate reutilizado, evitando duplicar cascatas de bloqueio. A separação `send`/`sendBeforeDeadline` mantém deadline, consumo e retry no mesmo domínio; não exige uma abstração adicional. As heurísticas foram tratadas como julgamento, com prevalência das normas do repositório.

**Correctness:** nenhum contraexemplo material encontrado. A reserva final e o registro ficam na mesma sequência de líderes, após coalescing (`gateway.ts:102-112`). O novo retry de user é limitado a uma tentativa e volta pela mesma reserva serial (`116-117`). Testei adicionalmente 1, 8 e 32 seguidores user: todos receberam sucesso após recusa background na fila, um único user marcou `sent`, houve um único envio adicional e cache subsequente. Uma falha injetada de líder também não travou a admissão seguinte. No cliente, os gates precedem o envio após espera (`219-226`); os checkpoints após awaits impedem que trabalho tardio atualize estado ou produza sucesso (`111,134,138,163,183`). `Promise.race` observa a operação tardia, e o deadline compartilhado é limpo em `finally` (`90-104`).

Verificação própria: 196 testes, 763 expects e 11 arquivos, zero falhas; quatro contraprovas, 29 expects, zero falhas; typecheck focado estrito exit 0. Hashes antes/depois coincidem. A aprovação não agrega nem substitui o eixo Spec separado. Integração CAS ainda é responsabilidade do integrador. Não houve env real, rede, modelo pago, servidor, carteira, ordem, staging ou commit; esta revisão não certifica operação live, capital, desempenho ou regra de 300 ms.

## Critérios usados como contexto e evidência examinada

| Critério | Inspeção e execução pertinentes |
| --- | --- |
| OR-01 | `gateway.ts:60-66,99-112`; `gateway.test.ts:75,84,93,145,178`: teto concorrente, cap dinâmico durante fila, rollover UTC, ledger anterior, enviado versus não enviado, coalescing e stale. |
| OR-02 | `client.ts:208-229`; `client.test.ts:42,58,163`: 429/50011 global, 402 por camada e expiração, remoção/rotação de credenciais durante intervalo. |
| OR-03 | `client.ts:90-104,107-183`; `client.test.ts:77,101,121,142`, `gateway.test.ts:45`: transporte que ignora abort, fetch/corpos 200/401/403 pendentes, sucesso/rejeição tardios, cache e retry de relógio com mesmo signal/deadline. |
| OR-04 | `gateway.ts:99-117`; `gateway.test.ts:121,135,155`; contraprovas próprias; suíte completa inclui HMAC, normalização, HTTP, budget, cache e leak com sentinelas sintéticas. Evidências TDD fornecidas foram lidas; não alego ter produzido seus red logs. |

Implementado e verificado offline são estados demonstrados pelas fontes e execuções acima. Os testes HTTP invocam funções com dependências injetadas. Nenhum processo live foi observado. Mantêm-se os limites explícitos da SPEC: orçamento por instância, tamanho validado após ler corpo e timeout da operação enviada, sem deadline de coleta inteira. A integração só é elegível se os quatro hashes ainda coincidirem e o eixo Spec independente for satisfatório.

## Anexo: ponto fixo e hashes

SPEC imutável: `review-standards/docs/sdd/backend-audit-20261013/ONCHAIN-SPEC.md`, SHA256 `4ef3aadfbb0baec1c9fdd4fb262312fd425864d53718abad9d9ba6fe94735ec3`, confirmado antes e depois.

| Arquivo em `src/onchain-read/` | Baseline SHA256 | Candidato SHA256, antes = depois |
| --- | --- | --- |
| client.ts | `118b8e32651986e57a83876cf84f75da533b8a6425b7f5f05f3b69379adbd1ea` | `7f48c71f45b317482325eb506626c8dbe930e3f50827b81a851f7d5d67fd1138` |
| client.test.ts | `c1c5cee59e4498268ef6788e1f7b75cddae73d84c04ec42344ee7f80c66434e6` | `3dbb7c31fc14ffd71b2bb2c5f2378e404fc54f85bd0dd3ba786a55e943f3c958` |
| gateway.ts | `0b4ce61c93037d9319913ddbaaa92d5d5892ffe33bfe7317177cd16f7ea95d0d` | `62b3a8110719f4896d7b08a8da86e6f71080c25fa76e26b0451db7c62f59be42` |
| gateway.test.ts | `aef810c529c376c58c36bf4d6938ce722bc567d656c97ff5ced74076bb3c3374` | `9ad74d46714a5747432ffc812e8dab39c5f0f652aa02b5da304a4d006da61648` |

Fontes primárias locais examinadas:

- `AGENTS.md` e `CLAUDE.md`: ambos SHA256 `17c63ea3c3328fbbd5cf0cf3934af0dd6ee142b9e4bf6e3b5b58724277dfdc34`. Busca delimitada não encontrou instruções locais adicionais em `src/onchain-read`.
- `src/onchain-read/budget.ts`: SHA256 `1dc6100a2bed1f0d8f5a5b5f5eece8ead23118dcd0f7bba23c1c4f408871879d`; contrato literal: "Only calls actually sent to the provider are recorded; cache hits are free."
- `src/onchain-read/cache.ts`: SHA256 `cb08989f26ff4f1ee9d4eb8cd29c556bc8e680af3ed205775f95823a5fd0b6d0`; contrato literal: "Identical in-flight requests coalesce into a single provider call."
- `ONCHAIN-VERIFICATION.md`: SHA256 `bd0af58d7b4d152d188966a19f8c429e06221c19a3dd3f35cd077ee6e0f316b6`.
- Skill `C:/Users/gabri/.agents/skills/code-review/SKILL.md`: SHA256 `47f4e52c21694def9c7c11cbfbf891ca35eac7a93e395797515be3c8a409ae50`. A revisão Spec segue em outro agente; não abri delegações adicionais.
- Harness `C:/Users/gabri/.codex/skills/codex-desktop-harness/SKILL.md`: SHA256 `4d438885fe9c0646725bc82652cec4309baed5a1a570be73c0ed2b7141399b11`; playbook SHA256 `86f7b8f22e4eb2aa352ff8d021d5d8dfad1b4ba6a56156252807bce528d5c258`.

O diff usa `git diff --no-index -- <baseline/src/onchain-read/arquivo> <review-standards/src/onchain-read/arquivo>` para cada um dos quatro arquivos. Todos retornaram exit 1, indicando diferenças, com os avisos literais de conversão LF/CRLF preservados no JSON; não houve operação Git de escrita. Saídas exatas: `onchain-standards-evidence-diff-*.log`. Hashes e argv/estado posterior: `onchain-standards-evidence-hashes-after.json`.

## Anexo: comandos e saídas próprias

Cwd: `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/review-standards`. Runner de captura binária: `research/onchain-standards-evidence-run.py`. Cada subprocesso usou o wrapper RTK local, timeout 45 segundos e Bun `--no-env-file`; timeout externo 55 segundos. O wrapper retornou `command_not_allowlisted`, `archive_id=null`, preservando bytes e status sem compressão. Os JSON `onchain-standards-evidence-{suite,counterexamples,types}.json` registram argv completo, exit code, tamanhos e hashes das duas streams.

Executado, para cada modo `suite`, `counterexamples` e `types`:

```powershell
& 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/venv/Scripts/python.exe' 'C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/research/onchain-standards-evidence-run.py' '<modo>'
```

Original argv da suíte: `bun --no-env-file test ./src/onchain-read`. Saída literal final, exit 0:

```text
 196 pass
 0 fail
 763 expect() calls
Ran 196 tests across 11 files. [3.04s]
```

Original argv das contraprovas: `bun --no-env-file test C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/research/onchain-standards-evidence-counterexamples.test.ts`. Saída literal final, exit 0:

```text
 4 pass
 0 fail
 29 expect() calls
Ran 4 tests across 1 file. [175.00ms]
```

Original argv do typecheck:

```text
bun --no-env-file node_modules/typescript/lib/tsc.js --ignoreConfig --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --moduleResolution bundler --module preserve --moduleDetection force --target ESNext --lib ESNext --types bun ./src/onchain-read/client.ts ./src/onchain-read/client.test.ts ./src/onchain-read/gateway.ts ./src/onchain-read/gateway.test.ts
```

Exit 0; stdout e stderr vazios. Não substitui typecheck global de áreas reservadas.

| Stream de evidência própria | SHA256 |
| --- | --- |
| suíte stdout, 28 bytes | `d6684989b8dd63b37d2f1954270826fbe1bd89a8debd12bcacf03ed1c6140ef6` |
| suíte stderr, 19425 bytes | `ea9a8b4c0328a21f436335e0e3ccbab88f3b065139e2021741a12d8192635ea6` |
| contraprovas stdout, 28 bytes | `d6684989b8dd63b37d2f1954270826fbe1bd89a8debd12bcacf03ed1c6140ef6` |
| contraprovas stderr, 496 bytes | `b53c8cb5c945406a8b017fe1c208763ca785e04d72a7cfe08e009f4f9f84fa20` |
| tipos stdout e stderr, 0 bytes cada | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Evidências TDD fornecidas e lidas: `onchain-cap-red.log` SHA256 `01db95043de8adeae7d26e9138258e4a4ba93ebc41091b090683f1d2ceb8ef4e`; `onchain-intent-red.log` `a611abe56346ff29ed1593a95b1d2599eef8bdfdd04a2cd6f203100bf1f924f0`; `onchain-queue-red.log` `002907c508d8bb33b731d7f728f0beA5172667f0c8c3f821e5e955ca550d9d1d`; `onchain-deadline-red.log` `249199f5ecec32f40adb222dad0000df9194513cc7b1f4bbafd5073e3633b62c`. A falha temporal no teste preexistente de intervalo consta no histórico fornecido; a execução própria atual passou. Nenhuma necessidade de alterar o candidato foi demonstrada.

Próximo passo prioritário do integrador: considerar o eixo Spec independente e efetuar comparação estrita dos quatro hashes antes de integrar, preservando alterações concorrentes. Esta recomendação não autoriza ações externas.
