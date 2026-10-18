# Revisão independente preparatória — round-trip amount

Autor: 01a12ada-7b55-7fd2-8a20-c940f474c1a1; distinto do implementador codex-inonu-system-one-safety. Sol/xhigh solicitado; modelo/esforço/tier efetivos desconhecidos. Cópia exclusiva comum, sem RO imposto pelo sistema; origem apenas lida.

**Parecer: escopo APROVADO preparatoriamente; SPEC PARCIAL para congelamento.** A correção integra o objetivo central JEV/OKX e preserva os limites financeiros. Não autoriza implementação, begin_cycle, commit, merge ou conclusão ampla. CLI audit84/integração continuam pré-requisitos (SPEC:3,43).

A pesquisa referenciada e seus artefatos sustentam a discrepância: candidates.ts:159 cota output integral; executor.ts:241–251 prepara pelo mínimo. O probe registra dois handoffs sintéticos antes da rejeição; economia conservadora −US$0,021969. Li probe, resultado e recibo exit0; não executei testes. Esse probe demonstra o problema, mas não substitui o novo RED de A6.

| Critério | Avaliação preparatória e lacuna |
|---|---|
| A1 | **partial**. “Exact atomic inputs” é verificável. Definir slippage comum, precisão percentual e arredondamento conservador; executor.ts:84–87 usa arredondamento numérico. Resolver contrato antes de congelar, conforme SPEC:44. |
| A2 | **partial**. Rejeitar antes do primeiro efeito é observável. Enumerar custos obrigatórios, unidades, validade, limites conservadores e taxas já incorporadas ao output, evitando dupla contagem. trade.ts:150 apenas renomeia tradeFee como USD; candidates.ts:117–118 converte BigInt para Number. Especificar comparação econômica sem perda de precisão. |
| A3 | **partial**. Definir evidência confiável de input/minimum/slippage da transação preparada: chainIndex copiado da requisição e calldata opaca não provam vínculo (trade.ts:238–246). Revalidar quote/custo após awaits e antes dos handoffs; executor.ts:198–203 verifica STOP/plan expiry. |
| A4 | **adequado como plano**. Matriz pública cobre regressões relevantes. Explicitar limites econômicos igual/um átomo abaixo, cada quote stale/future separadamente, slippage divergente e custos não finitos/unidade desconhecida. Nenhum GREEN futuro certificado. |
| A5 | **adequado como requisito**. Preservação explícita; testar replay/idempotência e objetos antigos sem binding, sem requalificação silenciosa. Não certifica controles atuais universalmente. |
| A6 | **partial**. Fixar baseline após CLI, novos caminhos de testes/helpers e set exclusivo efetivo. risk-gate.ts:72–80 hoje confia em custos/net/idade agregados; avaliar sua inclusão ou validação equivalente. Seam de slippage/CLI não ganha autorização implícita. |

A seleção proposta de cinco fontes é pertinente, mas “relevant new regression tests” (SPEC:41) não identifica arquivos exclusivos. Publicar a lista antes de iniciar; preservar concorrência e main. Contrato autenticado OKX, balances reais e lucro permanecem não comprovados. Não houve API, rede, fundos, credenciais, delegação ou suíte ampla nesta revisão.

## Vínculo SHA256

HEAD observado: 99523e427945c3154c59284662e3bbcc526eec3c; não é baseline congelado do próximo ciclo.

Origem: C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader.

| Arquivo | SHA256 confirmado |
|---|---|
| docs/OPERATOR-ROUNDTRIP-AMOUNT-SPEC.md | 9a593d6dbf55a59287502b43abac742685a38334186c5ee29b4a626fd59f9623 |
| src/operator/candidates.ts | 3955e44992bba1a2a36a6382f3ad29fe50c2248300deb2646519f3c54dbdd219 |
| src/operator/executor.ts | 17db3012332584dce46ac712e0d48ebf71f59f13533ce40d8b12fa6667b6961a |
| src/operator/types.ts | f2a0476773571945cfced68768b90fc85e88914a95755b0e44d405c918408039 |
| src/operator/plan.ts | 488159912f83980e4e0a642aac9cf3342533fc76c1eac6df3a19c0f3b4d8d9f4 |
| src/okx-wallet/trade.ts | 24688d48572c9062be59910ac988c67ff7e1349d910eae1a9e1b5183ff9b7e86 |

Pesquisa: C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/operator-second-leg-amount-research.md; SHA256 056d280d616c97829955b5d3a0859476963051a77410767f5baf0a4189e6ba33.
Artefatos em operator-second-leg-20261011-d113f5f-v2: run-receipt.json SHA256 30a8db032da6e380735586451b5b038988fb2d13e49ffc9542b86a83fbb290c0; probe-result.json SHA256 f68a8e26cbf77053f82ac027ac9ae934ddfa99d8965b56188c6ac1e8c953db30.
