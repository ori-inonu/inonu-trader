# Pesquisa independente: contrato round-trip — 2026-10-11

**Conclusão de pesquisa:** a discrepância continua presente. A SPEC proposta precisa explicitar slippage comum, aritmética econômica exata, cobertura dos custos, prova de vínculo da transação e revalidação após esperas. Nenhuma implementação ou aceitação foi aprovada nesta entrega.

Autor/conversa: `01a12adc-473d-7381-b067-c83af7ccda31`, distinto do integrador e do revisor de escopo `01a12ada-7b55-7fd2-8a20-c940f474c1a1`. GPT-6.1 Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Pasta exclusiva é cópia comum, sem isolamento de leitura imposto pelo sistema; disciplina operacional limitou a origem a leituras. Não executei aplicativo, testes, provider, RPC, assinatura, fundos ou Jev; não li `.env`/segredos nem criei auxiliares. Apenas documentação pública via ferramenta web. Mensagens consultivas automáticas do harness apareceram; não foram iniciadas como consultas desta pesquisa nem utilizadas como autorização, e seu processamento/custo não foi auditado.

Origem: `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader`, HEAD observado `f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c`; status de arquivos rastreados vazio. Atualização factual do usuário: CLI corrigido integrado nesse main após revisão terminal Locke, sete testes/zero falhas. Não repeti essa execução. A revisão de escopo abaixo conserva seu HEAD histórico `99523e4`; não é baseline atual. SPEC:3,27–37,41–49 permanece proposta; revisão:11–16 permanece parcial para congelamento.

## Fatos locais e limites

| Fronteira pública / localização relativa à origem | Evidência literal e consequência |
|---|---|
| `src/operator/candidates.ts:38–50,84–99,158–173` | `amountAtomic: leg1.toAmountAtomic` cota leg2 pelo output estimado integral; não existe slippage em `CandidateContext`/requisição do quoter. `tradingFeeUsd: 0` e `complete: networkFeeUsd !== null` não demonstram custos completos. Hash contém somente chain/input/output1/output2. |
| `src/operator/executor.ts:84–108,185–205,244–252` | Prepara leg2 com `amountAtomic: leg1.minReceiveAmount!`, mas compara seu mínimo ao output cotado para outro input. Piso usa `Math.round` percentual e divisão inteira. Allowlist/selector/value/min não provam input ERC20, destinatário ou mínimo codificado na calldata. |
| `src/okx-wallet/trade.ts:136–154,203–214,223–247` | Adapter de quote valida input ecoado; builder injetável não o valida por si. Prepared `chainIndex` vem da requisição. Retém mínimo/slippage opcionais, porém descarta `routerResult` e não decodifica calldata. `simulate` retorna somente sucesso/revert (`executor.ts:312–319`). |
| `scripts/okx-operator.ts:182,193,213`; `src/operator/cycle.ts:20,157–183` | CLI fixa executor `slippagePercent: 0.5`; contexto do builder não recebe esse valor. Cycle já encaminha contexto, gateia antes do modelo e cria plano após sua espera, sem atualizar idade econômica. |
| `src/operator/candidates.ts:111–118,160,170`; `src/operator/risk-gate.ts:72–80` | Conversão BigInt→Number e capital nominal `sizeUsd` podem perder precisão. Gate confia em net/completude/idade agregados. `Math.min` dos timestamps mede a quote mais antiga, mas pode ocultar uma segunda quote futura; a idade é congelada na criação. |
| `src/operator/types.ts:24–65,130–141`; `src/operator/plan.ts:45–61` | Candidate/plan não vinculam explicitamente cada input/mínimo/slippage/custo/as-of. Plano copia hash; idempotência hoje exclui timestamps. |
| `src/operator/config.ts:132–147`; `src/okx-wallet/portfolio.ts:213–250` | Defaults: mínimo US$0,05; idade 15s; TTL 30s; provisão de inferência US$0,0001. Inventário tem timestamp de observação, preço Number e origem, sem timestamp individual do preço ou limite USD demonstrado. Provisão não é faturamento confirmado. |
| `src/operator/executor.ts:205–209,223–265,293–309`; `src/operator/cycle.ts:178–192` | Envio usa gasLimit floor(1,5×estimativa), approvals de 120000 e maxFeePerGas do cap local. Gate de gas valida estimativa antes do aumento. Gas desconhecido de receipt é ignorado na soma atual. Recibos fecham etapas; reconciliação/profit continuam pendentes. |

O probe anterior é evidência sintética condicional, não comportamento OKX live: SPEC:7/revisão:7 registram rejeição após handoffs no caso 1%/0,5%. Não o reexecutei nem o substituí por novo RED.

## Contrato oficial público inspecionado hoje

Quote: GET `/api/v6/dex/aggregator/quote`; `exactIn` é default e `amount` usa unidades atômicas do input. Output é estimado; `tradeFee` estima **rede em USD**, não taxa de negociação; `estimateGasFee` usa unidades mínimas da moeda nativa. Não há parâmetro de slippage na lista inspecionada. Preços/decimais de tokens são referências; não há TTL/as-of da quote estabelecido nessa descrição. [OKX — get quote](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote).

Swap: GET `/api/v6/dex/aggregator/swap`; `slippagePercent=0.5` significa 0,5%; autoSlippage default false. `tx.gas` é quantidade estimada de gas, `gasPrice` é wei por gas, `value` é valor nativo atômico; `minReceiveAmount` é o mínimo sob slippage. A descrição não fornece algoritmo inteiro de arredondamento desse mínimo, TTL garantido ou prova de que metadata corresponde à calldata. Outputs/custos continuam estimativas. A observação sobre arredondamento de `feePercent` não define arredondamento do mínimo. [OKX — swap](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap).

Logo, timestamp de recebimento local não prova frescor de estado remoto; receipt de sucesso não prova input integral gasto, saldo intermediário disponível ou lucro atribuível. Nenhuma garantia autenticada/on-chain foi qualificada aqui.

## Requisitos propostos para revisão independente, não congelados

**R1 / A1,A3 — valor comum explícito.** Preservar o valor atual `"0.5"`, representado exatamente como decimal/racional, compartilhado pelo contexto do builder, binding do candidate/plan e executor/prepare. Não criar variável de ambiente ou novo parâmetro de risco. Validar representação/limite local existente, igualdade e slippage retornado; ausência não qualifica live. Quote não recebe um parâmetro inexistente: slippage pertence ao contrato local que deriva o mínimo e à requisição swap. Não ativar autoSlippage/exactOut ou ampliar o limite local.

**R2 / A1,A2 — unidades e mínimos exatos.** Atomic amounts permanecem BigInt com identidade chain/token/decimals comprovada. Para precisão percentual explicitamente congelada, escolher escala inteira S e fração k: `m = floor(q × (S−k) / S)`; em 0,5%, S=1000000 e k=5000. Isso é piso conservador LOCAL compatível com a direção atual, não algoritmo comprovado da OKX. Não usar Number nem tornar ceil obrigatório sem evidência, pois pode excluir um mínimo válido por um átomo. Leg2 deve ser cotada diretamente para o mínimo executável vinculado de leg1, nunca por escala linear. Prepared mínimo diferente exige reconstruir/revalidar todo o caso antes do primeiro handoff, ou rejeição explícita, conforme A3.

**R3 / A2 — conjunto obrigatório de custos.** Manifesto tipado deve identificar origem, moeda/escala, cobertura, limite superior, observação/validade e itens já incorporados no output: rede dos dois swaps; cada approval realmente previsto (zero/um/dois conforme assets e comportamento atual); trading/DEX/tax/referral quando aplicáveis; inferência e outra cobrança exigível da execução, se houver. Zero só com evidência de ausência/inclusão. `tradeFee` não justifica zerar trading fees; evitar descontar novamente taxas já incluídas no mínimo. Quote de rede é estimativa, não teto. Um teto local verificável pode usar **limites efetivamente comprometidos no plano** × fee-cap em unidades atômicas, incluindo approvals e eventuais tarifas adicionais da chain demonstradas. Não somar esse teto e a estimativa da mesma rede, nem usar indiscriminadamente o máximo global como gas de cada transação. Preservar caps/reserva existentes. Fee cap EIP-1559 já engloba priority fee; não duplicá-la. Tarifas adicionais/FX/inferência sem fonte ou limite permanecem desconhecidas e não habilitam execução.

**R4 / A1,A2 — economia decimal exata e hash.** Comparar mínimo final em USD pelo limite inferior de preço, menos capital atômico real pelo limite superior e custos limitados, usando racionais/decimal inteiro e comparação cruzada exata. Eventual quantização arredonda crédito para baixo/débito para cima. Preservar `minNetUsd` existente, inclusive igualdade; não inventar margem extra. Preços devem trazer origem, unidade, limite e validade; observação do inventário não inventa as-of do preço. Canonical binding/hash inclui ambas as identidades, inputs, quotes, mínimos, slippage, preço/custos e todos os tempos relevantes; recomputar/validar no gate/plan/executor. Separar digest da evidência temporal da identidade estável de replay: renovar recebimento não deve permitir execução duplicada. Mudança de hash isolada não prova consistência nem autorização.

**R5 / A3 — obrigação por await e handoff.** Após inventário/quotes e após decisão (`cycle.ts:157–181`), revalidar separadamente cada timestamp, preço e custo com clock atual: finito, não futuro, não expirado. TTL local existente não vira garantia do provider. Após lookup do spender e cada preparação, confirmar vínculo/mínimo/economia completos antes do primeiro approval. Após simulation, approvals, receipts e nova preparação de leg2, revalidar o conjunto relevante e STOP/TTL antes de qualquer novo handoff. Callback síncrono `beforeSubmit` deve repetir esses gates após preparação assíncrona do signer; não efetuar rede dentro do callback. Sua fronteira local não elimina awaits internos posteriores do SDK. Mudança adversa após leg1 impede leg2 sem baixar piso, aumentar quantidade ou retry; preservar hashes, exposição, custos desconhecidos e reconciliação. Mínimo previsto registrado no ledger não deve ser apresentado como saldo observado.

**R6 / A3 — capacidade de prova preparada.** Echo remoto de chain/mode/token/input/slippage/recipient e mínimos é necessário, mas não suficiente para provar execução ERC20. `chainIndex` copiado do request e `value=0` não provam essas propriedades. Requerer binding verificável da calldata para rotas/ABIs suportadas, ou outra prova local específica equivalente, incluindo input e mínimo/destinatário; boolean eth_call não a substitui. Rotas sem prova permanecem explicitamente não qualificadas; rotas suficientes e comprovadas podem passar. Não confiar em metadata anexada artificialmente a uma transação opaca.

## Alternativas reais e decisões ainda não resolvidas

1. **Quote primeiro:** derivar mínimo local de leg1, cotar leg2 nesse input e validar preparações; divergência obriga rebind/requote completo antes de handoff, ou rejeição. Menor acoplamento do builder; precisa de prova preparada e gestão explícita de invalidação.
2. **Preparação de leg1 primeiro:** obter mínimo preparado verificável sem assinar/enviar, cotar leg2 exatamente nele e validar o caso completo. Evita pressupor arredondamento remoto, mas amplia dependência do builder/preflight no adapter e exige custos/frescor da preparação. Preparação provider não foi executada nem autorizada por esta pesquisa.

Ambas precisam satisfazer A1–A6. Permanecem para revisão: representação decimal geral além do atual 0,5%, mecanismo de prova por router, cobertura/tetos das tarifas, validade dos preços/custos e projeção de idempotência. Resolver isso não autoriza inferir dados desconhecidos ou banir todos os casos suficientes. A proposta não é certificado de rentabilidade ou autorização financeira.

## Seams públicos, aceitação e exclusividade futura

Seams existentes: `SwapQuoter`/`CandidateContext`; `buildRoundTripCandidates`; `gateCandidates`; `buildExecutionPlan`; `executePlan`; `runOperatorCycle`; `OkxTradeClient` injetável e `EvmSigner.beforeSubmit`. `operator.test.ts:88–123,175–206,376–416` usa respostas/minimos estáticos que podem mascarar dependência do input. `executor.expiry.test.ts:50–81` e `executor.approval-identity.test.ts:98–136` fornecem clocks, callbacks e ledger públicos; não houve execução nesta entrega.

Novo RED sobre baseline fixo deve demonstrar 1%/0,5% inadequado cruzando handoff antes da correção; futura aceitação exige **zero approvals/sends** nesse caso e round trip sintético completo em caso suficiente com custos explícitos. Mocks devem depender do input, incluindo rota não linear. Cobrir 0%/um átomo/BigInt grande/6 e 18 decimais; threshold igual e um átomo abaixo; cada quote futura/stale separadamente; divergência de slippage, input ecoado, identidade, recipient, hash e binding de calldata; custo NaN/negativo/unidade ausente/approval omitido/FX vencido; mínimos alterados antes e depois de leg1; envelhecimento após modelo, preparação, simulation, approval receipt e signer await. Verificar efeitos/ledger, não somente helper. Preservar integralmente A5, mock rejection, dry-run/shadow explicitamente não qualificados quando incompletos, STOP/TTL, limites, exact approvals, lock/reconcile e replay. A6 ainda exige implementação autorizada, GREEN relevante e revisões independentes novas; nenhuma destas etapas foi certificada.

**Proposta de set exclusivo, não reserva nem autorização:** integrador: `src/operator/{candidates,types,plan,executor,risk-gate,cycle}.ts`, `src/okx-wallet/trade.ts`, `scripts/okx-operator.ts`; possíveis novos `src/operator/roundtrip-contract.ts`, `src/operator/roundtrip-contract.test.ts`, `src/okx-wallet/trade.roundtrip-binding.test.ts`. CLI é necessária para compartilhar o valor já existente (inclusive caminho de descoberta de router); `cycle.ts` já passa contexto, mas deve validar consistência e re-gatear após o modelo. Não é necessário editar `config.ts` para criar configuração arbitrária. Testes existentes de expiry/identity só entram no set após declaração concreta de necessidade, preservando sua aceitação. Revisores mantêm saídas exclusivas separadas. Antes de qualquer futura escrita, conferir concorrência/hash/HEAD, congelar a SPEC independente e declarar lista efetiva. Main/UI concorrentes não foram auditados por esta pesquisa; objetivo central amplo continua incompleto.

## Manifesto SHA256

Caminhos relativos à origem indicada acima; hashes observados nesta pesquisa. Documentos públicos são mutáveis, não foram tratados como arquivos locais imutáveis.

| Arquivo | SHA256 |
|---|---|
| docs/OPERATOR-ROUNDTRIP-AMOUNT-SPEC.md | `9a593d6dbf55a59287502b43abac742685a38334186c5ee29b4a626fd59f9623` |
| src/operator/candidates.ts | `3955e44992bba1a2a36a6382f3ad29fe50c2248300deb2646519f3c54dbdd219` |
| src/operator/executor.ts | `17db3012332584dce46ac712e0d48ebf71f59f13533ce40d8b12fa6667b6961a` |
| src/operator/types.ts | `f2a0476773571945cfced68768b90fc85e88914a95755b0e44d405c918408039` |
| src/operator/plan.ts | `488159912f83980e4e0a642aac9cf3342533fc76c1eac6df3a19c0f3b4d8d9f4` |
| src/operator/risk-gate.ts | `7b916e9246c16e68cb6f007f687009f54e6237d54ae7297ce8c7a663daffbaa1` |
| src/operator/config.ts | `1488d245dd30e449c8bdef7472651037ab3b68fd469ddde2f854362a2c4bc3e7` |
| scripts/okx-operator.ts | `ed937480a59c21d94deab87769ac4ae68cf10b7bdaaa743898df7039c03f5784` |
| src/okx-wallet/trade.ts | `24688d48572c9062be59910ac988c67ff7e1349d910eae1a9e1b5183ff9b7e86` |
| src/operator/cycle.ts | `adcb20abbe449b458a1b69b80a9b9226e1919791b5ad8fa0b63de3cab644f3a2` |
| src/operator/operator.test.ts | `525c75c72a0ea7d84d7262f3fe31fe9d5f8b09e28d996ffb3ea486eb686b196a` |
| src/operator/executor.expiry.test.ts | `3c49424fac0a66fde0f4f224b6dfbb9af2b2f64b8634165c573e1d4e51334f1b` |
| src/operator/executor.approval-identity.test.ts | `dfba6c5a6fe4102c394a6ad638e2ad9f65b4db983b22cfc6eaa50a22fa683681` |
| src/okx-wallet/portfolio.ts | `b07cfd5be8b74c65cadbc3c1874b9b377acf0bb568f15012423f4e5ec0dea544` |

Documento externo lido: `C:/Users/gabri/.codex/worktrees/inonu-system-one-review-spec-20261011/operator-roundtrip-amount-scope-review.md`, SHA256 `910db33589808ac0870d417c519f6b274ada65b68b2697a6fea20d1940a82556`.

Artefatos anteriores preservados na pasta exclusiva: `operator-second-leg-amount-research.md` SHA256 `056d280d616c97829955b5d3a0859476963051a77410767f5baf0a4189e6ba33`; `operator-cli-lock-final-audit.md` SHA256 `cc9378530873ae604a2b324155bdb48cc2b9dcaacb0bec2a420d91acf3a8b5a4`; `full-suite-failure-research.md` SHA256 `e2704c4e290c5bb4058f2f95370634d50223c1c28f02537f6a924cad1bec5a44`. Metadata privada do harness ficou fora deste relatório/repositório; registros locais de pesquisa não concedem autoridade.
