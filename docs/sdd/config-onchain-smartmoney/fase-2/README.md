# Fase 2 on-chain: achados medidos, adendo rev-3 e SPEC

Estado: **aprovada pelo usuário em 2026-10-13**, com implementação parcial em andamento (ver [TASKS.md](TASKS.md) e a seção "Implementação depois da aprovação" abaixo). A rodada de planejamento foi só de documentos; a implementação que veio depois não fez nenhuma chamada nova ao provedor. Continua [config-onchain-smartmoney](../spec.md) (gateway, painel inferior, smart money no gráfico, rotas ECO) e conversa com a SPEC do instalável em [../../inonu-desktop-v1](../../inonu-desktop-v1/README.md), que é de outra sessão (c38db1).

## O que o usuário pediu e decidiu

Pedido: planejar as próximas especificações com o que foi encontrado. Decisões registradas na rodada de planejamento:

| Tema | Decisão |
| --- | --- |
| Escopo | Adendo rev-3 à SPEC do instalável **e** SPEC nova da Fase 2 on-chain |
| Primeiro resultado desejado | "Pedir ao Inonu" com dados on-chain e sociais estruturados (por isso o digest é o grupo F2-DIG, de maior prioridade) |
| Entrega | Só documentos SDD, sem código de produto |
| SPEC do instalável | Adendo em arquivo novo; nenhum arquivo de `inonu-desktop-v1/` é editado |
| Cálculo do digest | TypeScript em runtime; Python só gera vetores de ouro onde a matemática for sutil |
| Itens promovidos de "depois" ou "fora" | Trenches com detalhes e RWA; índice, velas históricas e clusters em detalhe; X Layer (baleias e saldos); explorer forense e saúde da rede |
| Ritmo do gateway | Manter 1,1 s até medir |
| Camada de cobrança | Medir com prints do uso do Dev Portal antes e depois de lotes controlados |

## Implementação depois da aprovação (2026-10-13, sem chamada nova ao provedor)

- **Gateway** (`src/onchain-read/`): `tagFilter` em `/onchain/trades`; rotas `/onchain/cluster-top-holders`, `/onchain/quote` (somente leitura) e `/onchain/token-info`; `gateway.callInternal` (endereços completos e `soldAmount` só no servidor, com o aviso `sent`, nunca por HTTP); duas correções de defeito achadas por teste (A-29, `topTokens` do leaderboard sempre vazio com dados reais, e A-30, etiqueta de 33 caracteres descartada).
- **Digest** (`src/intel/onchain-*.ts`): adaptador do rótulo de concentração e das escalas, componente de risco e etiquetas do conjunto fechado, os três estados do nulo, liquidez, fluxo, sentimento por símbolo inequívoco, qualidade pela junção no servidor, custo dos sinais contra o preço, e a montagem do `BriefInput` (Brief de exemplo com 1.124 bytes). Vetores de ouro escritos em Python (`python/tools/make_onchain_vectors.py`) e reproduzidos em TypeScript (192 casos, tolerância 1e-9).
- **Fonte do modo token** (`src/inonu/onchain-plan.ts`, `src/inonu/source-onchain.ts`): plano de 13 chamadas com corte em 15, chamadas só por clique, `onchainosCalls` contando só o que saiu, e `routeByMode`. Está pronta e testada com gateway falso; **ainda não está ligada ao núcleo** (`T-F2-G10`, arquivos da sessão `c38db1`).
- **Testes** de 2026-10-13: os 10 arquivos novos têm 332 testes aprovados; gateway, configurações, motor e Inonu juntos 888 aprovados e nenhuma falha; a suíte da raiz 4258 aprovados, 2 ignorados e nenhuma falha; `typecheck` da raiz limpo.
- **Não feito:** fumaça ao vivo das rotas novas e as medições (`F2-MED`), que pedem autorização de chamadas e os prints do Dev Portal; as rotas restantes de `F2-OCX`; a interface; aplicar o adendo aos arquivos da sessão `c38db1` e congelar a r3 (`T-F2-D13`).

## Arquivos desta pasta

| Arquivo | Para quê |
| --- | --- |
| [ACHADOS.md](ACHADOS.md) | Registro dos fatos medidos ou lidos, cada um com evidência ou marcado como não verificado |
| [RECONCILIACAO.md](RECONCILIACAO.md) | O que já foi entregue contra cada requisito e tarefa da SPEC do instalável, e os conflitos |
| [ADENDO-REV3.md](ADENDO-REV3.md) | Deltas propostos para uma revisão 3 da SPEC do instalável, com texto pronto para colar |
| [SPEC.md](SPEC.md) | Requisitos e aceitação da Fase 2 (digest, medição, rotas novas, superfícies, governança) |
| [TASKS.md](TASKS.md) | Tarefas pequenas por onda, com dono, dependência e verificação |
| [evidence/revisao-independente-1.md](evidence/revisao-independente-1.md) | Parecer de revisão independente somente leitura, com a disposição de cada achado |
| [tools/verify.ts](tools/verify.ts) | Verificador dos documentos (links, citações, IDs, tipografia, segredos, baseline) |
| [evidence/](evidence/) | Evidência arquivada e saneada (a original estava em `.scratch/`, ignorada pelo git) |

Evidência arquivada: [probe-2026-10-12.json](evidence/probe-2026-10-12.json) (124 chamadas da sonda: forma e código, nunca valores de dados), [portal-endpoints-2026-10-12.json](evidence/portal-endpoints-2026-10-12.json) (a lista de 174 endpoints com requisições por segundo, colada pelo usuário), [docs-params-2026-10-12.json](evidence/docs-params-2026-10-12.json) (parâmetros obrigatórios e opcionais das páginas públicas), [baseline-hashes.json](evidence/baseline-hashes.json) e [tamanho-do-brief-exemplo.txt](evidence/tamanho-do-brief-exemplo.txt). Evidência já versionada em `docs/sdd/config-onchain-smartmoney/`: [okx-portal-coverage.md](../okx-portal-coverage.md), [onchainos-gateway.md](../onchainos-gateway.md), [live-onchainos-20261012.md](../evidence/live-onchainos-20261012.md) e [INDEX.md](../evidence/INDEX.md).

## Regras de identificação (para não colidir com a SPEC do instalável)

A SPEC do instalável já usa `CFG`, `API`, `SRC`, `DOC`, `CHN`, `ICO`, `DAT`, `FLX`, `SMT`, `ING`, `ASK`, `RAS`, `WAL`, `INF`, `QLT`, `WIN`. Esta pasta usa prefixos próprios:

| Prefixo | Uso |
| --- | --- |
| `A-nn` | Achado em [ACHADOS.md](ACHADOS.md) |
| `D3-nn` | Delta proposto em [ADENDO-REV3.md](ADENDO-REV3.md) |
| `F2-DIG-n`, `F2-MED-n`, `F2-OCX-n`, `F2-UI-n`, `F2-GOV-n` | Requisitos da [SPEC.md](SPEC.md) |
| `AC-F2-*` | Aceitação da SPEC |
| `T-F2-*` | Tarefas de [TASKS.md](TASKS.md) |

IDs da SPEC do instalável são citados em crases (por exemplo `API-11`, `T3.8`) e nunca redefinidos aqui.

## Estados de evidência

Cada item distingue quatro estados e nunca os mistura: **configuração válida** (testes passam), **carregado em sessão nova** (instalação ou início limpo), **funcionando ao vivo** (sonda ou captura real) e **ganho medido** (comparação ou ledger). "Não medido" e "não verificado" são respostas válidas.

## Baseline contra a SPEC do instalável

Registrado em 2026-10-13 em [baseline-hashes.json](evidence/baseline-hashes.json). A SPEC do instalável está congelada na **revisão r2** (2026-10-13, 13 arquivos: `SPEC.md`, `flow-engine.md`, `rastreador.md`, `info-diet.md`, `wallet.md`, `onchainos-coverage.json`, `onchainos-coverage.md` e os seis ADRs), e `freeze.ts --check` confere. `PLAN.md`, `TASKS.md`, `OWNERSHIP.md` e `CHECKPOINT.md` saíram do congelamento (carregam progresso); só os hashes deles foram registrados. Se qualquer arquivo congelado mudar depois, este adendo está **desatualizado em relação a r2** e precisa ser relido antes de uso. Mudar escopo ou critério dos 13 arquivos exige nova revisão com histórico e autorização do usuário: este adendo só propõe.

## Limites desta entrega

Nenhuma chamada ao modelo, nenhum pagamento, nenhuma assinatura, nenhum envio de transação, nenhum commit, nenhum push, nenhuma mudança de visibilidade do repositório. As medições da [SPEC.md](SPEC.md) (`F2-MED`) estão **especificadas, não executadas**: exigem autorização de chamadas e os prints do usuário. Credenciais e endereços pessoais não aparecem em nenhum arquivo desta pasta; endereços usados nas sondas são públicos e conhecidos.
