# Síntese dos 15 workstreams OKX e JEV

Data dos relatórios: 9 de outubro de 2026. Delegação: `deleg_09004d82`. Estado: pesquisa consolidada; não é autorização, qualificação de mercado ou evidência de lucro.

Os 15 agentes concluíram. Seus relatórios foram preparados a partir de documentação primária e inspeção local, mas esta síntese não reabriu cada fonte nem reproduziu cada teste. Trate conclusões e escolhas JEV como advisory até a fonte, recibo e comportamento correspondente serem verificados. Nenhum agente alterou arquivos compartilhados. Os relatórios não fizeram chamadas de mercado/wallet, assinatura, ordem, transferência ou trade. Nenhum saldo, quota, custo de API, elegibilidade regional ou retorno foi qualificado.

## Síntese executiva

1. **Prioridade técnica imediata: fechar o contrato DEX antes de integrar.** Uma revisão paralela encontrou que o contrato consultado documenta `amount` de entrada em unidade mínima, mas não documenta explicitamente a unidade de `toTokenAmount` na resposta. O candidato atual ainda produz campos chamados `outputAtomic` e `quotedGrossDeltaAtomic` e usa a saída como entrada da segunda quote, embora marque essa inferência como desconhecida. Até haver evidência oficial suficiente ou uma nova regra conservadora aprovada, não tratar esse delta como atomic nem integrar esse fluxo. Preservar a SPEC congelada; qualquer ajuste deve ser uma revisão versionada, não alteração retroativa.
2. **Separar latência de decisão e execução.** WebSocket público pode alimentar observações rápidas; REST serve recuperação e metadados. Isso não comprova 300 ms de ponta a ponta. Não colocar JEV no caminho quente até medir p50/p95/p99 no ambiente-alvo e definir o que os 300 ms incluem.
3. **Construir primeiro simuladores offline.** Para arbitragem entre CEX e DEX, modelar inventário pré-financiado e as duas pernas como não atômicas. Para futuros, limitar a replay local de SWAP linear com metadados, mark/index e funding versionados. Dados incompletos tornam o resultado não pontuável, não zero.
4. **Adiar superfícies com contratos/risco não qualificados.** Bridge cross-chain, execução em Exchange, Earn/staking/lending e sinais de NFT/campanha ficam em pesquisa somente leitura. Cotação, APY, ranking e recomendação do JEV não são fill, liquidação, elegibilidade nem autorização.

## Resultados por workstream

| # | Área | Recomendação e limite principal | Resultado JEV relatado |
|---|---|---|---|
| 1 | Auditoria do contrato DEX V2 | Revisar a SPEC antes de qualquer integração: assinar exatamente o path/query enviados e manter timestamp assinado igual ao header; explicitar que `toTokenAmount` tem unidade não confirmada; não produzir delta atomic nessa condição; distinguir secret local de API key/passphrase enviados somente ao host fixo OKX. A SPEC congelada não deve ser editada in-place. | Sem decisão/recibo. O agente não tinha dispatcher Jev disponível. |
| 2 | Descoberta de tokens e risco | Manter discovery limitado por chain/stage e até 30 itens; search geral é fonte separada e não está integrada. Identidade é chain + contrato. Tags, concentração, holders, pools, price timestamp, taxa e risco são dimensões separadas; desconhecido não significa seguro. | Sem nova decisão necessária; sem avaliação ou recibo. |
| 3 | Cobertura de rede, identidade e gas | Cobertura é específica por endpoint: lista MemePump não prova suporte de quote, gas ou preço. Reutilizar exatamente unidades e identity; gas-price não é taxa total. | `dynamic_per_endpoint`, confiança 0.96, mas o input de avaliação afirmou incorretamente uma cobertura Market genérica. Sem receipt ID; não usar a escolha como evidência dessa premissa. |
| 4 | Bridge e transferências | Adiar quotes live. Não foi verificado contrato V6 atual para cross-chain; exemplo V5 de repositório contém comentário de chain inconsistente. Quote não é transação nem arbitragem atômica; taxas, finality e status exigem contrato próprio. | `defer_until_contract_verified`, confiança 0.91; sem receipt ID. |
| 5 | Market data da Exchange | Preferir WebSocket público para feed e REST para recovery/backfill. BBO, books e trades têm semânticas diferentes. Um intervalo de update não garante latência fim a fim; instrumento/região, canais, uso de dados e permissões permanecem desconhecidos. | `websocket_primary_rest_recovery`, confiança 0.98; uma latência observada de 408.6339 ms não é benchmark de serviço e já excede a meta indicada. Sem receipt ID. |
| 6 | Trading Spot da Exchange | Manter apenas metadados/ticker público sem credenciais. Leituras privadas e ordens são estados autenticados distintos. Demo é estado remoto simulado, não fixture offline; eligibility/região não qualificada. | `public_data_only`, confiança 0.97; sem receipt ID. |
| 7 | Arbitragem CEX-DEX | Começar com simulator offline de inventário pré-financiado. Não chamar as duas pernas de atômicas; transferência, confirmação, crédito e disponibilidade são eventos separados. Simular fills por profundidade, custos, partial fills e exposição residual. | `prefunded_inventory_simulation`, confiança 0.99; sem receipt ID. |
| 8 | Metadados de futuros | Escopo futuro: replay offline de SWAP linear USDT, separado de FUTURES expiries e X-Perps. Exigir `ctVal`, `ctMult`, currencies, tick/lot/min size e estado válidos; não inferir unidade nem elegibilidade de demo/região. | `local_inventory`, confiança 0.61; sem receipt ID. |
| 9 | Funding e basis | Modelar funding por evento de liquidação usando `realizedRate`; estimativa só entra em feature se houver snapshot que prove disponibilidade antes da decisão. Mark, index e preços executáveis são séries distintas. Custos ou fees ausentes bloqueiam net P&L. | `event_time_ledger`, confiança 0.83; sem receipt ID. |
| 10 | Margem e liquidação | Especificação somente para simulador offline, inicialmente posição sintética isolated/one-way. Exigir tier, maintenance margin, leverage cap, mark, funding e fees versionados. Nenhum cálculo de posição real. | `isolated_oneway_v1`, confiança 1.0; sem receipt ID. |
| 11 | Backtest e paper | Não declarar edge a partir do replay contábil atual. Exigir provenance, clocks de evento/recepção, anti-lookahead, fills/queue/latency, custos completos, walk-forward e holdout fechado. Resultado seedado por mark sem fill não é lucro de trading. | Nenhuma escolha Jev necessária; bloqueio determinístico por falta de dados causais/fills. |
| 12 | JEV em pipeline de 300 ms | Relatório disponível trouxe apenas evidência local: 99 testes/547 assertions em 15 arquivos, typecheck passou, journal hash preservado, runtime boot não executado. Não contém recomendação técnica detalhada para consolidar. | Escolha/recibo não constam no resumo recebido. |
| 13 | Conectividade e autoridade da wallet | Separar wallet browser read-only de qualquer signer/executor; conexão, resposta JEV e label live não autorizam assinatura. O relatório aponta riscos a remediar antes de qualquer execução: endpoint de signing existente, URLs/errors/logs, CORS e servidor sem bind/auth explicitados. | Sem decisão Jev; invariantes de segurança são determinísticas. |
| 14 | Earn, staking e lending | Apenas catálogo/read-only futuro, com chain, contrato, tipo de taxa e as-of time. APY cotado não é rendimento líquido; filas de withdrawal e availability são dinâmicas. Nenhum depósito, stake ou borrow. | `read_only_research`, confiança 1.0; sem receipt ID. |
| 15 | NFT, campanhas, airdrops e dApps | Só considerar metadata watch separado. Não foi localizado endpoint atual documentado para ranking NFT/eligibilidade; APIs legadas não devem ser assumidas como suportadas. Métrica de marketplace e tarefa de campanha não comprovam wash-free demand nem eligibility individual. | `metadata_watch_only`, confiança 0.74; sem receipt ID. |

## Portões e sequência recomendada

### Gate A: contrato DEX

- A revisão independente do código congelado v2 já identificou e motivou correções locais para `msg` do envelope e `chainName`/`dexTokenApproveAddress` da cobertura. Essas correções permanecem no candidato isolado.
- A revisão paralela de documentação traz riscos adicionais que não estão resolvidos por esses testes: timestamp/header e bytes exatos da assinatura; unidade de saída não explicitada; escopo de envio das credenciais. O parecer pendente D1-D8 contra snapshot v4 não substitui esta revisão de contrato.
- JEV Choice real selecionou `single_leg_raw_only` (confiança 0.79): preservar uma resposta futura como valor bruto opaco, sem quote dependente nem aritmética atômica, até documentação oficial da unidade. Evidência local: `docs/evidence/okx-dex-unit-policy-jev-20261009.json`; receipt ID e custo cobrado não foram retornados.
- Rascunho versionado criado em `docs/okx-market-v1/OKX-DEX-V2-CONTRACT-AMENDMENT-DRAFT-20261009.md`. Próximo gate: revisão independente deste rascunho, preservar o freeze original e só então congelar uma revisão sucessora. Até resolver unidade, não chamar quantidade ou delta `atomic` nem integrar o round trip como medida comparável.

### Gate B: pipeline de mercado

- Usar adaptadores separados para OKX OnchainOS, OKX Exchange e feeds on-chain Kuru.
- Definir os 300 ms como requisito mensurável antes de otimizar; medir evento a evento, idade dos dados e p50/p95/p99. JEV não decide deterministic safety gates e não entra no hot path sem benchmark.
- Revisar licença/termos e minimização antes de enviar qualquer dado de mercado bruto ao JEV.

### Gate C: simulação

- Priorizar replay de arbitragem de inventário pré-financiado, com fills/custos/exposição residual.
- Futuro permanece projeto de simulator separado, não conectado a conta nem a demo remota; usar dados locais versionados e falhar para `unknown/unscorable` quando incompletos.
- Só avaliar estratégias após proveniência, cobertura, sincronização, custos e holdout terem sido verificados. Não usar USD 68 -> USD 6.700 como baseline ou evidência.

### Gate D: superfícies adiadas

Bridge, ordens Exchange, wallet signer, Earn, NFT, claims e campanhas dependem de contratos atuais, eligibility e gates próprios. Não entram no scanner nem ganham autorização por uma recomendação Jev.

## Evidência, JEV e limites

Os resultados Jev acima são escolhas advisory relatadas pelos agentes. Muitos não incluem receipt ID; onde o receipt não foi retornado, persistência/custo são desconhecidos. Não tratar confiança como calibração, autorização, verificação de fonte ou prova de desempenho. Workstream 3 teve uma premissa incorreta no input e seu resultado não valida suporte de rede.

Não houve chamadas live de OKX/Exchange/Wallet, assinatura, ordem, transferência, pagamento, posição, teste de latência, backtest qualificado nem medição de retorno nesta pesquisa. A alegação de USD 68 para USD 6.700 segue não auditada.

## Fontes e artefatos locais relacionados

Os workstreams reportaram consulta às páginas oficiais OKX OnchainOS sobre API access, market token list/price/advanced/pools, DEX quote/supported chains/fees, às páginas oficiais OKX Exchange API V5 sobre market data/orders/funding, e a documentação Kuru, EIP-140, Aave e Lido conforme a área. As referências e evidências completas permanecem nos resumos dos 15 agentes na delegação `deleg_09004d82`; esta síntese não substitui sua verificação.

Artefatos locais relacionados: `docs/OKX-ECOSYSTEM-SPEC.md`, `docs/OKX-ECOSYSTEM-PLAN.md`, `docs/okx-market-v1/OKX-ECOSYSTEM-V1-SPEC.md`, `docs/okx-market-v1/OKX-LONG-GOAL-CHECKPOINT.md` e o candidato DEX V2 isolado em `C:/Users/gabri/.codex/tmp/jev-trader-01a1216a/okx-ecosystem`.
