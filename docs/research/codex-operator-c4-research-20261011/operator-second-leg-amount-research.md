# Pesquisa independente: valor da segunda perna

**Resultado:** discrepância concreta confirmada no código e reproduzida condicionalmente por mocks nas fronteiras públicas. Não há demonstração de comportamento autenticado da OKX, frequência de falha, saldo efetivamente recebido ou rentabilidade. Nenhuma implementação foi alterada/aprovada; o objetivo completo da central JEV continua incompleto.

Autorização: pesquisa e experimento offline nesta pasta exclusiva. Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Identidade desta conversa: `01a12adc-473d-7381-b067-c83af7ccda31`; sessão `01a12971-f941-7e42-8a42-fab6d44d4eb5`. Harness local consultado na própria identidade; nenhum agente auxiliar criado ou aprovação externa solicitada. Preview local de decisão não chamou provedor nem constituiu conselho executado/autorização.

## Fontes, concorrência e contratos

Origem somente leitura: `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader`. Baseline congelado: `d113f5fe52f7d281ae0ad9be98d7f37fc253b916`. Durante a pesquisa HEAD avançou para `99523e427945c3154c59284662e3bbcc526eec3c`; estado tracked limpo no snapshot e na verificação final. Os 16 arquivos presentes no baseline foram copiados de blobs Git; os dois SPECs abaixo foram copiados do disco, pois não existem naquele commit. Nos 18 arquivos examinados, conteúdo atual e cópia coincidem após apenas normalizar CRLF→LF. Hashes brutos distintos permanecem distintos.

Referências congeladas, relativas a [source](operator-second-leg-20261011-d113f5f-v2/source):

- [candidates.ts:159](operator-second-leg-20261011-d113f5f-v2/source/src/operator/candidates.ts:159): `amountAtomic: leg1.toAmountAtomic`. Linhas 160–171 calculam retorno, `netUsd` e `quoteHash` para esse valor integral.
- [executor.ts:246](operator-second-leg-20261011-d113f5f-v2/source/src/operator/executor.ts:246): `amountAtomic: leg1.minReceiveAmount!`. Linha 251 ainda compara contra `expectedOutAtomic: candidate.expectedOutAtomic!`; linhas 84–87 aplicam o desconto de slippage ao retorno da cotação original.
- [trade.ts:153](operator-second-leg-20261011-d113f5f-v2/source/src/okx-wallet/trade.ts:153) rejeita `Quote amount mismatch`; linhas 223–247 repassam o novo `amount` ao preparo, mas o contrato `PreparedEvmTransaction` não preserva uma cotação vinculada a esse input.
- [types.ts:35](operator-second-leg-20261011-d113f5f-v2/source/src/operator/types.ts:35) e [plan.ts:45](operator-second-leg-20261011-d113f5f-v2/source/src/operator/plan.ts:45): candidato/plano mantêm outputs/hash, sem vínculo explícito do input conservador da segunda perna.
- [ledger.ts:162](operator-second-leg-20261011-d113f5f-v2/source/src/operator/ledger.ts:162): `failed_leg_requires_manual_reconciliation` bloqueia inclusive outra dupla. Não equivale a saldo ou P&L verificado.
- [R8:73](operator-second-leg-20261011-d113f5f-v2/source/docs/research/R8-re-revisao-operador-f1-f8-20261011.md:73) já registra N1 e ressalva `INCERTO até chamada autenticada`. “Sempre”, estimativas de frequência e remédios desse relato não foram confirmados/aprovados aqui.
- [MODEL-BOUNDARY-SPEC:15](operator-second-leg-20261011-d113f5f-v2/source/docs/OPERATOR-MODEL-BOUNDARY-SPEC.md:15), M1–M4: decisão/contexto validado, rejeição de mock, dry-run preservado e fronteiras sintéticas. Literal M3: “Existing expiry, STOP, signer, allowlist, receipt and reconciliation guards remain effective.” [CLI-LOCK-SPEC:31](operator-second-leg-20261011-d113f5f-v2/source/docs/OPERATOR-CLI-LOCK-SPEC.md:31) mantém a discrepância como trabalho separado; experimento de lock não repetido.

SHA256 brutos principais (disco atual | cópia congelada):

| Arquivo | Disco | Cópia |
|---|---|---|
| executor.ts | `17db3012332584dce46ac712e0d48ebf71f59f13533ce40d8b12fa6667b6961a` | `4b413799c101eed60512376f6b02a84875f3a9d5b523e5090244a09cb1e819ef` |
| candidates.ts | `3955e44992bba1a2a36a6382f3ad29fe50c2248300deb2646519f3c54dbdd219` | `6edfa00c5ca891bf0bc86c0cffcfdc7759902b587e878a2ddeab26ad9767efa7` |
| trade.ts | `24688d48572c9062be59910ac988c67ff7e1349d910eae1a9e1b5183ff9b7e86` | `1f55e3377bb178b585587ba064792e67b416f542e3ffaed4fe97f0f0c740522d` |
| plan.ts | `488159912f83980e4e0a642aac9cf3342533fc76c1eac6df3a19c0f3b4d8d9f4` | `f97aa1f2ef77ff9d2099865914c7960674984b5e2e4662d34704aec784b6e5a9` |
| types.ts | `f2a0476773571945cfced68768b90fc85e88914a95755b0e44d405c918408039` | `0be6bb6275b4b13bfce4714fe59bf15703d03dc9204b8a9fde9a798aa5ce97cb` |
| ledger.ts | `3f56974ea89b86bbf0bea90061d0797463fc5deb1062f772d8cee9f536ee02ab` | `9bc779019432a4944a7a2d6896071cdb6121f8b6a21fa0f9f4d923c00b433176` |

Todos os 18 hashes, proveniência, requisitos registrados antes do probe e preservação posterior: [manifesto](operator-second-leg-20261011-d113f5f-v2/source-manifest.json), [verificação](operator-second-leg-20261011-d113f5f-v2/verification.json). Hashes dos SPECs atuais: model `7cd7c31a2e9af8d04e807aaf63faa26ef90af2f1c99881f33a04f21c6cf0f701`; lock `ff9ec65c9aecb76509ca1cc9009387919516abbe13eb39ba31becf34497adf5e`.

## Reprodução pública offline

Uma execução de [probe.ts](operator-second-leg-20261011-d113f5f-v2/probe.ts), usando código copiado intacto: `okxSwapQuoter → buildRoundTripCandidates → gateCandidate → buildExecutionPlan → executePlan → parseLedger`. Cliente injetado, signer/recibos inteiramente falsos, ledger em memória. Somente imports externos `ai`/TypeSafe foram mockados para lançar erro se usados; zero tentativas de inferência. Identidade sintética explícita não prova modelo real ou autorização financeira.

Mock linear, edge 1%, seis/18 decimais, slippage 0,5% por perna; configuração standard e limites econômicos existentes. Candidato elegível: input `25000000`, retorno cotado `25250000`, net sintético `0.2299`, custos `0.0201`, mínimo exigido `0.05`.

| Quantidade | Atomic |
|---|---:|
| Input cotado da perna 2 | 25000000000000000000 |
| Input preparado, mínimo da perna 1 | 24875000000000000000 |
| Retorno mock para esse input | 25123750 |
| Mínimo preparado da perna 2 | 24998131 |
| Piso calculado sobre cotação antiga | 25123750 |

Resultado exato: `sent`, `leg2_blocked: min_receive_below_quote`. Duas chamadas falsas de handoff (approve1/perna1), dois recibos falsos; nenhuma segunda transação. Ledger validado: `failed`, `closeTxHash=null`, notional diário 50, um plano; próxima dupla bloqueada por reconciliação manual. Os snapshots incluem `leg1_confirmed`. Valor mínimo da segunda perna menos input/custos seria `-0.021969` apenas nesta aritmética sintética; baixar o piso isoladamente também prejudicaria o requisito econômico.

Controles na mesma execução: mínimo igual à cotação → `completed` sintético, ainda “realized result pending reconciliation”; dry-run → zero efeitos de execução; modelo `mock` → `execution_model_mock`, zero efeitos. Os fakes existentes [operator.test.ts:108](operator-second-leg-20261011-d113f5f-v2/source/src/operator/operator.test.ts:108), [expiry:71](operator-second-leg-20261011-d113f5f-v2/source/src/operator/executor.expiry.test.ts:71), [approval-identity:129](operator-second-leg-20261011-d113f5f-v2/source/src/operator/executor.approval-identity.test.ts:129) devolvem mínimos fixos, sem desconto dependente do input. A suíte completa não foi executada.

[Recibo exato](operator-second-leg-20261011-d113f5f-v2/run-receipt.json): Bun `1.3.14`/`0d9b296af33f2b851fcbf4df3e9ec89751734ba4`, launcher Node `v26.9.0`; `--no-env-file --no-install --no-addons`, bunfig/preload próprios, ambiente literal allowlisted com perfil/temp exclusivos, timeout 20s, 204ms, exit 0, stderr vazio. [Resultado](operator-second-leg-20261011-d113f5f-v2/probe-result.json), [stdout bruto](operator-second-leg-20261011-d113f5f-v2/stdout.raw.log), [stderr bruto](operator-second-leg-20261011-d113f5f-v2/stderr.raw.log), [guard](operator-second-leg-20261011-d113f5f-v2/network-guard.jsonl). Nenhum arquivo de segredo/.env foi lido, nem aplicação/feed/RPC iniciado. Guard intercepta APIs comuns, sem sandbox de rede do SO; não certifica isolamento universal.

Falhas de preparação preservadas como limitações: Git presumido → `spawnSync git ENOENT`, errno `-4058`; gate de HEAD → `Unexpected HEAD: 99523e427945c3154c59284662e3bbcc526eec3c`; `git show` do SPEC ausente → exit 128, “exists on disk, but not in 'd113f5fe52f7d281ae0ad9be98d7f37fc253b916'”. Cópia parcial retida; v2 usa Git instalado e proveniência explícita. Nenhuma dessas tentativas foi contabilizada como reprodução.

## Proposta de aceitação, sem aprovação

Para revisão independente e eventual congelamento antes de implementar:

1. **A1:** cada perna vincula chain/tokens/decimais, input atomic exato, output/minimum, slippage, custos, instante e identidade/hash ao plano. Input preparado diferente da cotação vinculada deve falhar fechado; não reutilizar `Q(B)` para `B'`.
2. **A2:** antes do primeiro handoff irreversível, evidência conservadora para o input executável da volta e todos os custos deve satisfazer os limites/net existentes. Nesta fixture a solução não pode exigir completar: deve impedir iniciar uma rota economicamente insuficiente.
3. **A3:** reavaliação após perna1 não enfraquece mínimos, freshness, STOP, allowlists, identidade, simulação, valor/approval exatos, reservas, caps ou reconciliação. Quantidade realizada desconhecida não autoriza vender saldo adicional. Falha posterior preserva intermediário/hash/caps e status verdadeiro; zero retry automático.
4. **A4:** testes públicos com desconto dependente do input nas duas pernas, s=0, mínimo igual ao esperado, rounding de uma unidade/BigInt grande, 6/18 decimais, rota não linear, echo errado, custo/quote ausente ou vencido e resultado adverso. Caso conservador elegível separado pode completar só com recibos sintéticos, sem declarar lucro.
5. **A5:** preservar M1–M4 e dry-run/shadow. Primeiro regressão RED de requisito novo no baseline, depois implementação mínima/TDD por integrador e revisão independente vinculada aos hashes. Este probe confirma o defeito atual; não constitui GREEN de remédio, revisão de SPEC ou aprovação de merge.

Alternativas reais: cotar novamente o input conservador exato (e antes do handoff validar economia/freshness); manter rota bloqueada quando falta evidência; proporcionalidade somente com contrato de linearidade demonstrável — AMMs/rotas não têm essa garantia aqui. Vender saldo realizado exige reconciliação independente, escopo e contratos adicionais; não autorizado por esta pesquisa. Decodificação de calldata/receiver, comportamento real do provedor e atribuição financeira continuam pendentes.

Possíveis arquivos exclusivos de um ciclo futuro, após coordenação: novo teste de amount-binding, candidates/types/plan/trade/executor conforme contrato escolhido; são integração compartilhada e **não** estão atribuídos a este sidecar. Hashes e freezes precisam ser renovados diante de concorrência. Os 18 fontes e 21 arquivos anteriores do root permaneceram byte a byte iguais entre snapshot e verificação; artefatos anteriores/experimentos não foram reexecutados.

SHA256 de reprodução: probe `0ad296ce76d7c149601556bf6f3d2deab1d04507eead159a867f0628422e3ca6`; recibo `30a8db032da6e380735586451b5b038988fb2d13e49ffc9542b86a83fbb290c0`; resultado `f68a8e26cbf77053f82ac027ac9ae934ddfa99d8965b56188c6ac1e8c953db30`; verificação `569a3c7644f48832fd2ade44b4ee40c3001c9317e7b1f2993ad2fb9f094e6b6c`. Scripts/guard/logs restantes têm hashes exatos no recibo/verificação. Pesquisa local terminal; aconselhamento não é autoridade.
