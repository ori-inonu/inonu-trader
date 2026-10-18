# TASKS da Fase 2 on-chain

Estado de 2026-10-13. SPEC: [SPEC.md](SPEC.md). Deltas para a SPEC do instalável: [ADENDO-REV3.md](ADENDO-REV3.md). Achados: [ACHADOS.md](ACHADOS.md). Posse dos caminhos do instalável: [OWNERSHIP.md](../../inonu-desktop-v1/OWNERSHIP.md).

Como ler: cada linha é um ciclo pequeno (teste que falha primeiro, implementação mínima, verificação real, revisão independente quando a onda fecha). **Estado:** `feito`, `elegível` (dependências atendidas), `aguarda <ID>`, `bloqueado: <motivo>`. **Owner:** `lead` é esta sessão (config-onchain-smartmoney); `integrador` é a única sessão que edita arquivo de zona quente (Z8 e arquivos modificados por outra sessão) depois de `git status --short -- <caminho>` nas duas árvores; `c38db1` é a sessão dona da SPEC do instalável. Tarefas da SPEC do instalável aparecem em crases (`T3.3`). Código novo vai em arquivo novo; edição de `src/onchain-read/catalog.ts` e `http.ts` (arquivos já sujos) é uma linha de registro pelo integrador. Esta tabela **não autoriza** nada: chamadas ao provedor das ondas W1 e W2, gasto com o modelo, pagamento, assinatura e commit exigem autorização própria do usuário.

## W0 Documentos (esta rodada)

| ID | Req/AC | Resultado | Owner e arquivos | Dep | Estado | Check |
| --- | --- | --- | --- | --- | --- | --- |
| T-F2-D1 | F2-GOV-1, AC-F2-DOC-1 | Baseline de hashes e `git status` da pasta do instalável | lead, `evidence/baseline-hashes.json` | nada | feito | `freeze.ts --check` com saída 0 antes e depois |
| T-F2-D2 | F2-MED-7, F2-GOV-1, AC-F2-MED-4 | Evidência saneada arquivada | lead, `evidence/*.json`, `evidence/tamanho-do-brief-exemplo.txt` | T-F2-D1 | feito | varredura sem credencial e sem endereço de 40 hex |
| T-F2-D3 | F2-GOV-1 | Registro de achados | lead, `ACHADOS.md` | T-F2-D2 | feito | cada achado cita evidência ou diz não verificado |
| T-F2-D4 | F2-GOV-5 | Reconciliação com a SPEC do instalável | lead, `RECONCILIACAO.md` | T-F2-D3 | feito | todo conflito tem delta |
| T-F2-D5 | F2-GOV-5 | Adendo rev-3 sem editar arquivo congelado | lead, `ADENDO-REV3.md` | T-F2-D4 | feito | hashes dos 13 arquivos iguais ao baseline |
| T-F2-D6 | F2-DIG-1, F2-DIG-4, F2-DIG-9 | SPEC da Fase 2 com o orçamento por modo e o Brief de exemplo | lead, `SPEC.md` | T-F2-D5 | feito | somas das tabelas 4.2 e 4.3 conferidas pelo verificador |
| T-F2-D7 | AC-F2-DOC-1 | Este arquivo | lead, `TASKS.md` | T-F2-D6 | feito | verificador: IDs cruzados sem órfão |
| T-F2-D8 | F2-GOV-2, AC-F2-DOC-1 | Verificador dos documentos | lead, `tools/verify.ts` | T-F2-D7 | feito | `bun --no-env-file run docs/sdd/config-onchain-smartmoney/fase-2/tools/verify.ts` sai com 0 |
| T-F2-D9 | AC-F2-DOC-1 | Revisão independente somente leitura por agente distinto | revisor (agente de leitura) | T-F2-D8 | feito | [revisao-independente-1.md](evidence/revisao-independente-1.md): 0 bloqueadores, 11 achados menores, cada um com disposição |
| T-F2-D10 | AC-F2-DOC-1 | Correção dos achados da revisão | lead | T-F2-D9 | feito | verificador com 0; parecer sem bloqueador aberto |
| T-F2-D11 | AC-F2-DOC-1 | Linha E10 em `docs/sdd/config-onchain-smartmoney/spec.md` apontando para esta pasta | lead, `../spec.md` | T-F2-D10 | feito | link resolve |
| T-F2-D12 | AC-F2-DOC-1 | Decisão do usuário: aprovar, ajustar ou rejeitar o adendo; se aprovado, nova revisão congelada (`freeze.ts --freeze --revision r3`) | usuário ou `c38db1` | T-F2-D11 | feito: aprovado pelo usuário em 2026-10-13 ("Aprovar, seguir as próximas etapas do planejamento") | `FREEZE.json` com r3 e histórico |

| T-F2-D13 | F2-GOV-5, AC-F2-DOC-1 | Aplicar os deltas `D3-01` a `D3-13` aos arquivos do instalável (SPEC, ADRs, cobertura, TASKS, CHECKPOINT) e congelar a revisão r3 | usuário ou `c38db1` (arquivos dela, em edição agora) | T-F2-D12 | aguarda a sessão `c38db1`: não editei os arquivos dela | `freeze.ts --freeze --revision r3` e `--check` com saída 0 |

## W1 Medição (depende de autorização de chamadas e, onde dito, dos prints do usuário)

| ID | Req/AC | Resultado | Owner e arquivos | Dep | Estado | Check |
| --- | --- | --- | --- | --- | --- | --- |
| T-F2-M1 | F2-MED-1, F2-MED-7 | Medidor de lote: cliente assinado **sem cache e sem gateway**, parâmetros distintos por chamada, saída só com forma e código | lead, `scripts/research/medir-lote.ts` (novo) | T-F2-D12 | elegível | teste com fetch falso: nenhum valor de dado na saída (código novo e sem chamada ao provedor) |
| T-F2-M2 | F2-MED-1, AC-F2-MED-1 | Lotes de cerca de 10 chamadas por família (social, cotação e agregador, explorer v6, X Layer v5) com os prints do portal antes e depois | lead executa; usuário envia os prints | T-F2-M1 | bloqueado: prints e autorização do usuário | deltas por camada em `evidence/api-medicoes.md` |
| T-F2-M3 | F2-MED-2, AC-F2-MED-1 | Lote em `POST`: `price-info` e `basic-info` com 1 e 5 tokens | lead, `evidence/api-medicoes.md` | T-F2-M2 | aguarda T-F2-M2 | contador sobe 1 ou 5, registrado |
| T-F2-M4 | F2-MED-3, AC-F2-MED-2 | Salva de `supported/chain` em ritmos decrescentes até a primeira recusa | lead, `evidence/api-medicoes.md` | T-F2-M1 | bloqueado: autorização do usuário | ritmo testado, recusa e ritmo adotado |
| T-F2-M5 | F2-MED-4, AC-F2-MED-2 | Bytes por rota e teto por rota | lead, `evidence/api-medicoes.md` | T-F2-M1 | bloqueado: autorização do usuário | tabela de bytes |
| T-F2-M6 | F2-OCX-11 | Sondagem única de `address-tracker/trades`, `security/*`, `defi/*` e `cross-chain/*` | lead, `evidence/api-medicoes.md` | T-F2-M1 | bloqueado: autorização do usuário | `habilitada` ou `nao_habilitada` por família |
| T-F2-M7 | F2-MED-8, AC-F2-MED-3 | Conta da escala dos percentuais ambíguos e vetor `V-F2-ESCALA-1` | lead | T-F2-M1 | bloqueado: autorização do usuário | relatório com a conta e a decisão |
| T-F2-M8 | F2-MED-5, F2-MED-6, AC-F2-MED-3 | Campo `tierSource` no catálogo, projeção de orçamento recalculada e reconciliação com o portal | lead (rotas novas) e integrador (`catalog.ts`) | T-F2-M2, T-F2-M3 | aguarda T-F2-M2 | teste: toda rota tem `tierSource`; contagem por camada |

## W2 Rotas novas (arquivos novos em `src/onchain-read/routes/`, registro por uma linha pelo integrador)

Cada tarefa entrega, para as rotas dela: fixture real-shaped saneada, teste de validador, teste de normalizador (com vazio válido, linha descartada e nulos), teste de que nenhuma saída tem campo de URL que não seja logo permitido (F2-OCX-12), e **no máximo 3 chamadas ao vivo** registradas em `evidence/`.

| ID | Req/AC | Resultado | Owner e arquivos | Dep | Estado | Check |
| --- | --- | --- | --- | --- | --- | --- |
| T-F2-O1 | F2-OCX-6, F2-OCX-12, AC-F2-OCX-1 | `/onchain/token-info` (`token/basic-info`, POST em lote) | lead, `src/onchain-read/routes/token-info.ts` | T-F2-D12 | feito offline em 2026-10-13: fixture, validador, normalizador e testes; fumaça ao vivo aguarda autorização | `src/onchain-read/f2-routes.test.ts` (token-info) e `src/onchain-read/catalog.ts`; sem chamada nova ao provedor |
| T-F2-O2 | F2-OCX-5, F2-OCX-12, AC-F2-OCX-2 | `/onchain/cluster-top-holders` e `/onchain/cluster-list` | lead, `src/onchain-read/routes/clusters-detail.ts` | T-F2-D12 | parcial: `/onchain/cluster-top-holders` feito offline em 2026-10-13; `cluster-list` elegível; fumaça ao vivo aguarda autorização | `src/onchain-read/f2-routes.test.ts` (cluster top holders) |
| T-F2-O3 | F2-OCX-4, F2-OCX-12, AC-F2-OCX-1 | `/onchain/index-price`, `/onchain/index-history`, `/onchain/candles-history` | lead, `src/onchain-read/routes/index-candles.ts` | T-F2-D12 | elegível | idem |
| T-F2-O4 | F2-OCX-1, F2-OCX-12, AC-F2-OCX-1 | `/onchain/toplist` marcada `nao_documentado` | lead, `src/onchain-read/routes/toplist.ts` | T-F2-D12 | elegível | idem |
| T-F2-O5 | F2-OCX-2, F2-OCX-12, AC-F2-OCX-1 | `/onchain/rwa` | lead, `src/onchain-read/routes/rwa.ts` | T-F2-D12 | elegível | idem |
| T-F2-O6 | F2-OCX-3, F2-OCX-12, AC-F2-OCX-2 | `/onchain/trenches-chains` e `/onchain/trenches` | lead, `src/onchain-read/routes/trenches.ts` | T-F2-D12 | elegível | idem; só nas redes que a lista devolver |
| T-F2-O7 | F2-OCX-3, F2-OCX-12, AC-F2-OCX-2 | `/onchain/trench-details`, `-dev`, `-bundle`, `-similar`, `-aped` | lead, `src/onchain-read/routes/trench-token.ts` | T-F2-O6 | aguarda T-F2-O6 | teste de que o endereço do usuário nunca vai ao provedor |
| T-F2-O8 | F2-OCX-7, F2-OCX-12, AC-F2-OCX-3 | Rotas X Layer v5 (`large-transfers`, `tokens`, `address`, `address-balance`, `address-txs`, `logs`) | lead, `src/onchain-read/routes/xlayer.ts` | T-F2-D12 | elegível | paginação `page` e `limit`; `chainShortName` fixo |
| T-F2-O9 | F2-OCX-8, F2-OCX-12, AC-F2-OCX-3 | Rotas do explorer v6 (`active-chains`, `address`, `chain-summary`, `chain-activity`, `blocks`, `tx`, `tx-logs`) | lead, `src/onchain-read/routes/explorer.ts` | T-F2-D12 | elegível | paginação `cursor`; transação confirmada com TTL de 24 h |
| T-F2-O10 | F2-OCX-9, F2-OCX-10, F2-OCX-12, AC-F2-OCX-3 | `/onchain/quote` e `/onchain/gas-price` | lead, `src/onchain-read/routes/quote.ts` | T-F2-D12 | parcial: `/onchain/quote` feito offline em 2026-10-13; `gas-price` elegível; fumaça ao vivo aguarda autorização | `src/onchain-read/f2-routes.test.ts` (quote, somente leitura) |
| T-F2-O11 | F2-OCX-13, AC-F2-OCX-3 | `tagFilter` em `/onchain/trades` | integrador, `src/onchain-read/catalog.ts` (validador da rota existente) | T-F2-D12 | feito em 2026-10-13 | `src/onchain-read/f2-routes.test.ts` (tagFilter de 1 a 9) |
| T-F2-O12 | F2-OCX-14, F2-DIG-11, AC-F2-OCX-2 | Saída interna do gateway com endereços completos para o motor | lead, `src/onchain-read/internal.ts` (novo) | T-F2-D12 | feito em 2026-10-13 | `gateway.callInternal` e `normalizeInternal` de signals, leaderboard, holders e top-traders; `src/onchain-read/f2-routes.test.ts` |
| T-F2-O13 | D3-07, AC-F2-OCX-3 | O gateway encaminha logos de token e de rede de hosts permitidos (`https` e host em `static.okx.com`, `static.oklink.com` ou `static.coinall.ltd`), só logos, e os testes passam a afirmar isso no lugar de "sem http" | lead, `src/onchain-read/catalog.ts` e `catalog.test.ts`; web só se o parser exigir | T-F2-D12 | elegível: `T3.5` do instalável espera por isto | todo campo de URL na saída é um logo permitido; `cleanText` nunca carrega URL; guarda de deriva regenerada |

## W3 Digest do Inonu (TypeScript em arquivos novos de `src/intel/` e `src/inonu/`)

Sem chamada ao modelo real em nenhuma tarefa (F2-DIG-10); testes com modelo falso.

| ID | Req/AC | Resultado | Owner e arquivos | Dep | Estado | Check |
| --- | --- | --- | --- | --- | --- | --- |
| T-F2-G1 | F2-DIG-1, F2-DIG-2, AC-F2-DIG-1 | Adaptador do rótulo de concentração e das escalas por campo | lead, `src/intel/onchain-adapt.ts` | T-F2-D12 | feito em 2026-10-13 | `src/intel/onchain-adapt.ts` e seu teste |
| T-F2-G2 | F2-DIG-1, F2-DIG-7, AC-F2-DIG-1, AC-F2-DIG-3 | Componente `risco` (`(5 - nivel) / 5`, nível 0 ausente), flags derivadas por limiares registrados e filtro do conjunto fechado de etiquetas | lead, `src/intel/onchain-risk.ts` | T-F2-G1 | feito em 2026-10-13 | `src/intel/onchain-risk.ts` e seu teste |
| T-F2-G3 | F2-DIG-3, AC-F2-DIG-1 | Mapa dos três estados do desconhecido (`vazio_valido`, `nao_consultado`, `erro`) | lead, `src/intel/onchain-nulos.ts` | T-F2-G1 | feito em 2026-10-13 | `src/intel/onchain-nulos.ts` e seu teste |
| T-F2-G4 | F2-DIG-1, F2-DIG-6, AC-F2-DIG-1, AC-F2-DIG-3 | Componentes `liquidez`, `fluxo` e `sentimento` (símbolo inequívoco) | lead, `src/intel/onchain-components.ts` | T-F2-G1, `T5.6` | feito em 2026-10-13 | `src/intel/onchain-components.ts` e seu teste |
| T-F2-G5 | F2-DIG-4, F2-DIG-5, F2-DIG-10, AC-F2-DIG-2 | Plano por modo (token com 13 e descoberta com 14 chamadas), corte de 15, contagem de chamadas enviadas, regra de material por idade | lead, `src/inonu/onchain-plan.ts` | T-F2-G3, `T7.3` | feito em 2026-10-13 | `src/inonu/onchain-plan.ts` e seu teste |
| T-F2-G6 | F2-DIG-8, AC-F2-DIG-4 | Gerador Python dos vetores de ouro (percentil e `log1p`) e o teste que os reproduz com 1e-9 | lead, `python/tools/make_onchain_vectors.py` (novo) e `src/intel/onchain-vectors.test.ts` | T-F2-G4 | feito em 2026-10-13 | `python/tools/make_onchain_vectors.py` e `src/intel/onchain-vectors.test.ts` (192 testes) |
| T-F2-G7 | F2-DIG-9, AC-F2-DIG-4 | Teste de tamanho do Brief de exemplo e do erro `BriefTooLarge` | lead, `src/intel/onchain-brief.test.ts` | T-F2-G5 | feito em 2026-10-13 | teste de tamanho em `src/intel/onchain-digest.test.ts` e `evidence/tamanho-do-brief-exemplo.txt` |
| T-F2-G8 | F2-DIG-11, F2-OCX-14, AC-F2-DIG-1 | Junção `qualidade` com `leaderboard` no servidor e varredura do Brief por endereço de carteira | lead, `src/intel/onchain-quality.ts` | T-F2-O12, T-F2-G4 | feito em 2026-10-13 (a função pura e a junção na fonte); falta a cópia do leaderboard em cache, tarefa T-F2-G11 | `src/intel/onchain-quality.ts` e `src/inonu/source-onchain.test.ts` |
| T-F2-G9 | F2-DIG-4, F2-DIG-5, AC-F2-DIG-2 | Fonte do modo token e do modo descoberta de "Pedir ao Inonu" (arquivo novo, registro pelo integrador) | lead, `src/inonu/source-onchain.ts` | T-F2-G5, T-F2-G7, `T7.3` | feito em 2026-10-13 (a fonte e `routeByMode`); ligar no núcleo é a tarefa T-F2-G10 | `src/inonu/source-onchain.ts` e seu teste (14 testes com gateway falso) |
| T-F2-G10 | F2-DIG-4, AC-F2-DIG-2 | Ligar `routeByMode` e a fonte do modo token ao núcleo e ao `/inonu/ask` (`T7.3`), com o gateway interno do núcleo | integrador, `src/desktop/handlers.ts` e `src/inonu/http.ts` (arquivos da sessão `c38db1`) | T-F2-G9 | aguarda T-F2-G9: arquivo de outra sessão | clique em um token on-chain chega à fonte; modelo falso; contador do ledger em 0 sem clique |
| T-F2-G11 | F2-DIG-1, AC-F2-DIG-1 | Cópia do leaderboard em cache e dos conjuntos de referência (`hot-tokens` da rede) que a fonte pede em `leaderboard` e `sets` | lead, `src/inonu/onchain-reference.ts` (novo) | T-F2-G9 | elegível | teste: nenhuma chamada nova ao provedor, só leitura do cache |

## W4 Interface (integrador, zona Z8, depois do adendo aprovado)

| ID | Req/AC | Resultado | Owner e arquivos | Dep | Estado | Check |
| --- | --- | --- | --- | --- | --- | --- |
| T-F2-U1 | F2-UI-1, AC-F2-UI-1 | Realocação das superfícies on-chain para as 5 abas (mapa de `D3-08`) com a política de chamadas por aba | integrador, `web/src/components/Desk/Dock/**` | T-F2-D12, `T4.6` | aguarda `T4.6` (tarefa da sessão `c38db1`) | testes de política (inativa, fora de tela, aborto por troca de chave); capturas |
| T-F2-U2 | F2-UI-2, AC-F2-UI-2 | RWA e Trenches no seletor de ativos on-chain | integrador, `web/src/components/Desk/panels/AssetPicker.tsx` | T-F2-O5, T-F2-O6 | aguarda T-F2-O5 | teste de render por estado |
| T-F2-U3 | F2-UI-3, AC-F2-UI-2 | Tokens de RWA e de Trenches nos candidatos como `token` | integrador e lead, `src/intel/candidates.ts` (uso de `tokenCandidate`) | T-F2-U2, `T7.2` | aguarda T-F2-U2 | teste de candidatos |
| T-F2-U4 | F2-UI-4, AC-F2-UI-1 | Linhas neutras de vazio válido e textos de erro por código nas telas novas | integrador, `web/src/lib/mesa/onchain-desk-rows.ts` | T-F2-U1 | aguarda T-F2-U1 | render por estado e varredura tipográfica |
| T-F2-U5 | F2-UI-5, AC-F2-UI-1 | Teste de redimensionamento: `narrow` segue a mudança e o foco on-chain não se perde | integrador, `web/src/components/Desk/MesaView.tsx` | T-F2-U1 | aguarda T-F2-U1 | teste nos 4 tamanhos; captura antes e depois |
| T-F2-U6 | F2-UI-1, AC-F2-UI-1 | Teste de layout com `/jev-read` fora do ar (o gráfico mantém altura) | integrador, `web/src/components/Desk/MesaView.module.css` | nada | elegível | teste de layout; já corrigido por `grid-row: 3` (A-06), falta o teste que o fixa |

## W5 Fechar

| ID | Req/AC | Resultado | Owner e arquivos | Dep | Estado | Check |
| --- | --- | --- | --- | --- | --- | --- |
| T-F2-C1 | F2-GOV-4, AC-F2-GOV-1 | Linha de base de testes antes de cada onda, com a lista de falhas intermitentes | lead | T-F2-D12 | elegível | saída guardada por onda |
| T-F2-C2 | F2-GOV-2, F2-GOV-5, AC-F2-GOV-1 | Varredura do bundle de produção por padrões das credenciais e log de `git status` por tarefa | lead | T-F2-O1 | elegível | varredura sem ocorrência (`AC-API-1`) |
| T-F2-C3 | F2-GOV-3, AC-F2-GOV-1 | Registro da rotação de credenciais feita pelo usuário (cofre, remoção do texto puro por `T2.4`, chave nova) | usuário | T-F2-D12 | bloqueado: ação do usuário | nota no CHECKPOINT |
| T-F2-C4 | AC-F2-MED-4, AC-F2-DOC-1 | Parecer independente final e CHECKPOINT com os quatro estados de evidência (`D3-13`) | revisor distinto e lead | T-F2-G9, T-F2-U1 | aguarda T-F2-G9 | parecer sem bloqueador; estados separados |
