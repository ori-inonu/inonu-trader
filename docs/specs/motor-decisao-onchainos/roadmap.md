# Roadmap priorizado: arquitetura técnica do motor de decisão e OnchainOS

Status: referência de plano de implementação, recebida do dono em 2026-10-17 e salva como veio.
Corte: o texto recebido termina no meio da palavra, no critério de aceite de E8 ("slipp"). E9 a E13 aparecem na visão geral, mas sem o detalhe de tarefas e critérios. Nada foi inventado para completar o que faltou; quando o restante chegar, entra aqui.
Formatação: só os títulos e a tabela foram ajustados para Markdown. O conteúdo é o do dono.
Contexto de execução: o trabalho já feito no GOAL 1 está na spec ao lado (`spec.md`); a seção "Cobertura pelo trabalho do GOAL 1" no fim deste arquivo é anotação posterior e não faz parte do documento original.

---

## Título original

Roadmap priorizado — JEV | Arquitetura técnica do motor de decisão e OnchainOS

## Objetivo

Construir, validar e operar de forma controlada uma plataforma orientada a eventos para descobrir, avaliar, simular, executar e reconciliar oportunidades de criptoativos, priorizando segurança, auditabilidade, retorno líquido ajustado ao risco e bloqueio seguro diante de dados, orçamento ou dependências inválidas.

A operação real permanecerá desabilitada até que todos os critérios de promoção sejam atendidos.

## Princípios de priorização

1. Segurança, isolamento e capacidade de pausa antes de qualquer execução.
2. Observabilidade e baseline antes de otimização.
3. Governança de APIs antes de ampliar ingestão ou descoberta.
4. Qualidade de dados e decisão explícita antes de execução.
5. Simulação, idempotência e reconciliação antes de capital real.
6. Rollout gradual, capital restrito e circuit breakers antes de escala.
7. Toda hipótese de retorno será validada por métricas realizadas, nunca apenas por simulação.

## Papéis sugeridos

- Líder técnico/Arquiteto: decisões de arquitetura, contratos e integração entre módulos.
- Engenheiro de plataforma: filas, armazenamento, cache, observabilidade e CI/CD.
- Engenheiro de dados: ingestão, normalização, qualidade e replay.
- Engenheiro de risco: políticas, sizing, circuit breakers e portfólio.
- Engenheiro de execução/on-chain: carteiras, adaptadores, transações e finalização.
- Engenheiro de segurança: segredos, permissões, isolamento, auditoria e incidentes.
- Engenheiro de QA/SRE: testes, benchmarks, SLOs, alertas, runbooks e recuperação.
- Product/Operations Owner: priorização, aprovações operacionais, exceções e critérios de promoção.

## Visão dos incrementos

| Ordem | Épico | Objetivo | Dependências | Entregável principal |
|---|---|---|---|---|
| P0 | E0 — Auditoria e baseline | Conhecer o estado atual e os riscos | Nenhuma | Relatório de baseline e plano de remediação |
| P0 | E1 — Segurança, isolamento e controle operacional | Impedir execução insegura e proteger credenciais | E0 | Ambientes isolados, pausa emergencial e controle de acesso |
| P0 | E2 — Observabilidade e auditoria | Tornar o ciclo mensurável e explicável | E0, E1 | Métricas, logs, traces, auditoria e alertas |
| P0 | E3 — Contratos, estado e mensageria | Criar base confiável para evolução incremental | E0, E1 | Schemas versionados, idempotência e máquina de estados |
| P1 | E4 — Registry e orçamento de APIs | Controlar custo, limites e disponibilidade de provedores | E2, E3 | ApiBudgetRegistry e RateLimiter |
| P1 | E5 — Ingestão, normalização e qualidade de dados | Garantir dados válidos, frescos e rastreáveis | E3, E4 | Pipeline de dados com classificação de qualidade |
| P1 | E6 — Descoberta e pipeline de decisão | Separar descoberta, avaliação, risco e decisão | E4, E5 | Decisão OPERATE/DO_NOT_OPERATE/NEEDS_REVALIDATION |
| P1 | E7 — Gestão de risco e portfólio | Aplicar limites antes e depois da operação | E3, E6 | RiskEngine e circuit breakers |
| P1 | E8 — Simulação e cotação | Validar se a vantagem persiste antes da assinatura | E5, E6, E7 | QuoteSimulator e validação final |
| P1 | E9 — Reconciliação e contabilidade | Provar execução, PnL e divergências | E3, E8 | ReconciliationService e PnL realizado |
| P2 | E10 — Adaptadores OnchainOS, OKX Wallet e redes | Encapsular execução e permissões | E1, E3, E8, E9 | Adaptadores com allowlists e validações |
| P2 | E11 — Orquestração de execução controlada | Executar somente sob autorização e condições válidas | E7, E8, E9, E10 | ExecutionOrchestrator em rollout restrito |
| P2 | E12 — Experimentação, replay e promoção | Separar pesquisa de produção e validar mudanças | E2, E3, E5, E6 | Replay determinístico, paper trading e pipeline de promoção |
| P2 | E13 — Operação, SLOs e melhoria contínua | Sustentar produção com recuperação e governança | Todos os épicos anteriores | Runbooks, SLOs, rollback e relatório executivo |

---

## Épicos e tarefas priorizadas

### E0 — Auditoria e baseline

#### Objetivo

Inspecionar o sistema atual, identificar riscos, validar integrações e estabelecer métricas de referência sem expor credenciais.

#### Tarefas

- Inventariar código, módulos, serviços, conectores e dependências.
- Mapear o ciclo atual de dados, decisão, execução e reconciliação.
- Inspecionar integrações OnchainOS, OKX Wallet, RPCs, APIs e redes.
- Registrar existência, escopo, idade, armazenamento e necessidade de rotação das credenciais.
- Confirmar permissões efetivas de cada credencial.
- Verificar endpoints, planos, limites, unidades de cobrança, burst, expiração e comportamento após excedente.
- Identificar pontos únicos de falha, dependências críticas e ausência de procedimentos.
- Medir p50, p95, p99, throughput, erros, retries, dados vencidos, duplicidades, reconciliação e recuperação.
- Catalogar testes existentes, lacunas e código ocioso.
- Produzir matriz de riscos e backlog de remediação.

#### Dependências

Nenhuma.

#### Responsáveis sugeridos

Líder técnico, engenheiro de segurança, engenheiro de plataforma, QA/SRE e Product/Operations Owner.

#### Critérios de aceite

- Todos os módulos, integrações e dependências críticas estão catalogados.
- Nenhuma credencial aparece em logs, relatórios, artefatos ou saídas de diagnóstico.
- Cada credencial possui registro de escopo, idade, armazenamento e necessidade de rotação.
- Limites de API estão classificados como confirmados, não confirmados ou desconhecidos.
- O baseline contém métricas por etapa e metodologia de medição.
- Riscos possuem severidade, impacto, proprietário e ação recomendada.
- O relatório é reproduzível e aprovado pelo responsável técnico.

#### Entregáveis

- Relatório de auditoria inicial.
- Diagrama do fluxo atual.
- Inventário de integrações e permissões.
- Baseline de desempenho, custos, erros e reconciliação.
- Matriz de riscos.
- Backlog priorizado de remediação.
- Plano de rotação ou revogação de credenciais, quando necessário.

---

### E1 — Segurança, isolamento e controle operacional

#### Objetivo

Garantir que pesquisa, simulação e produção sejam isoladas e que nenhuma execução real ocorra sem autorização explícita.

#### Tarefas

- Separar ambientes, bancos, filas, armazenamento, credenciais e permissões.
- Criar feature flag de execução real desabilitada por padrão.
- Implementar modo replay, simulação e paper trading.
- Configurar secret manager e política de acesso mínimo.
- Impedir que processos de pesquisa acessem credenciais de movimentação.
- Criar allowlists iniciais de chains, contratos, métodos, destinatários e limites de valor.
- Implementar mascaramento de segredos em logs, métricas, traces e erros.
- Definir MFA para operações administrativas.
- Criar procedimento de pausa emergencial, revogação de credenciais e retomada.
- Implementar auditoria de alterações de configuração, permissões e feature flags.
- Definir política de expiração de autorizações operacionais.

#### Dependências

E0.

#### Responsáveis sugeridos

Engenheiro de segurança, engenheiro de plataforma, líder técnico e Operations Owner.

#### Critérios de aceite

- Produção e experimentação não compartilham credenciais, filas ou armazenamento.
- Execução real permanece desabilitada após deploy e reinício.
- Pesquisa não consegue assinar, enviar ou movimentar ativos.
- Segredos não aparecem em logs, traces, métricas ou mensagens de erro.
- Pausa emergencial impede novas execuções e é auditada.
- Revogação de credenciais e rollback foram testados.
- Alterações de permissões e flags possuem identidade, horário e justificativa.

#### Entregáveis

- Matriz de ambientes e permissões.
- Configuração do secret manager.
- Feature flags e política de promoção.
- Allowlists de execução.
- Runbook de pausa, revogação e recuperação.
- Relatório de teste de isolamento e segurança.

---

### E2 — Observabilidade e auditoria

#### Objetivo

Instrumentar o ciclo completo para permitir diagnóstico, medição de risco, auditoria e operação segura.

#### Tarefas

- Instrumentar ingestão, normalização, cache, descoberta, avaliação, risco, cotação, execução e reconciliação.
- Criar métricas de oportunidades, decisões, edge, custos, PnL, risco, APIs, latência e filas.
- Implementar logs estruturados com correlation ID, strategy ID, environment e reason codes.
- Criar traces distribuídos sem dados sensíveis.
- Implementar trilha append-only de decisões, autorizações, transações e alterações.
- Definir retenção, controle de acesso e integridade dos logs.
- Criar alertas para execução inesperada, dados vencidos, orçamento, perdas, divergências, circuit breakers e incidentes.
- Associar cada alerta a severidade, proprietário, runbook e condição de resolução.
- Configurar sincronização de relógio.
- Criar dashboards operacionais e executivos.

#### Dependências

E0 e E1.

#### Responsáveis sugeridos

Engenheiro de plataforma, QA/SRE, engenheiro de segurança e líder técnico.

#### Critérios de aceite

- O ciclo completo possui correlation ID rastreável.
- Métricas p50, p95 e p99 estão disponíveis por etapa.
- Decisões OPERATE e DO_NOT_OPERATE possuem motivos persistidos.
- Execuções reais, erros, circuit breakers e divergências não são eliminados por amostragem.
- Alertas críticos possuem teste automatizado ou periódico.
- Auditoria permite reconstruir dados, configuração, política e identidade envolvidos em uma decisão.
- Nenhum segredo ou payload sensível é exposto.

#### Entregáveis

- Dashboards de operação, risco, APIs e desempenho.
- Catálogo de métricas e logs.
- Traces ponta a ponta.
- Trilha de auditoria append-only.
- Catálogo de alertas e runbooks.
- Relatório de cobertura de observabilidade.

---

### E3 — Contratos, estado e mensageria

#### Objetivo

Estabelecer contratos versionados, processamento idempotente e estados transacionais para produção e experimentação.

#### Tarefas

- Definir schemas para MarketEvent, OpportunityCandidate, OpportunityScore, OrderIntent, RiskDecision, Quote, ExecutionHandle, ExecutionResult e ReconciliationResult.
- Adicionar identificador, versão, timestamps, correlation ID, strategy ID, environment, origem, motivos, idempotency key e configuração.
- Implementar schema registry ou mecanismo equivalente.
- Definir transporte inicial com outbox transacional, Kafka, NATS ou equivalente.
- Implementar confirmação explícita, retry limitado, backoff, dead-letter e replay.
- Definir ordenação por carteira, nonce, estratégia e oportunidade.
- Criar armazenamento transacional para intenções, reservas, estados, auditoria e reconciliação.
- Implementar chave de idempotência canônica.
- Criar máquina de estados de execução.
- Implementar reserva de nonce com lease, expiração e recuperação.
- Rejeitar transições inválidas e duplicidades.

#### Dependências

E0 e E1.

#### Responsáveis sugeridos

Líder técnico, engenheiro de plataforma e engenheiro de dados.

#### Critérios de aceite

- Schemas são versionados e compatíveis entre produção e experimentação.
- Mensagens não são descartadas silenciosamente.
- Retries e dead-letter são observáveis e reprocessáveis.
- Duplicidades preservam o primeiro resultado válido.
- Transições inválidas são rejeitadas e auditadas.
- Timeout de envio consulta transação e nonce antes de qualquer nova assinatura.
- A máquina de estados suporta falha, expiração, substituição, finalização e reconciliação.

#### Entregáveis

- Schemas versionados.
- Schema registry ou mecanismo equivalente.
- Outbox e consumidores idempotentes.
- Máquina de estados.
- Modelo transacional de execução.
- Procedimento de replay e recuperação de mensagens.

---

### E4 — Registry e orçamento de APIs

#### Objetivo

Controlar limites, custos, prioridades e bloqueios de APIs sem contornar restrições de provedores.

#### Tarefas

- Implementar ApiBudgetRegistry por módulo, endpoint, provedor, chave lógica e cadeia.
- Registrar RPS/RPM, limites horários e diários, franquia, custo, prioridade, reserva e expiração.
- Validar limites reais no portal e na documentação.
- Registrar fonte, data, plano, unidade de cobrança, burst e comportamento após excedente.
- Implementar token bucket distribuído ou centralizado.
- Adicionar reservas para execução, segurança e reconciliação.
- Implementar cache, deduplicação, coalescing e batching quando suportado.
- Implementar backoff com jitter para 429.
- Bloquear chamadas em 402.
- Implementar failover apenas para provedores aprovados e orçados.
- Reconciliar custo estimado e custo efetivo.
- Bloquear chamadas não essenciais e suspender execução quando o orçamento for desconhecido, divergente ou esgotado.
- Criar alertas de consumo, expiração e divergência.

#### Dependências

E2 e E3.

#### Responsáveis sugeridos

Engenheiro de plataforma, engenheiro de dados e Operations Owner.

#### Critérios de aceite

- Toda chamada relevante possui política de orçamento identificável.
- Reservas, commits e releases são idempotentes.
- 429 aciona backoff com jitter e não gera tempestade de retries.
- 402 bloqueia o provedor conforme política.
- Orçamento desconhecido ou esgotado impede execução.
- Não existe rotação automática de chaves ou criação automática de cobrança.
- Consumo estimado e efetivo são comparáveis e auditáveis.
- Alertas são emitidos antes de atingir limites críticos.

#### Entregáveis

- ApiBudgetRegistry.
- RateLimiter.
- Painel de consumo e franquia.
- Catálogo de limites verificados.
- Políticas de bloqueio e failover.
- Relatório de divergência entre custo estimado e efetivo.

---

### E5 — Ingestão, normalização e qualidade de dados

#### Objetivo

Garantir que dados de mercado e blockchain sejam identificáveis, frescos, completos, consistentes e adequados ao uso pretendido.

#### Tarefas

- Implementar conectores REST, WebSocket quando confirmado, RPC, eventos on-chain e adaptadores aprovados.
- Normalizar ativos, redes, pools, pares, timestamps, unidades, decimais e identificadores.
- Validar origem, frescor, completude, sequência, relógio e integridade.
- Detectar duplicidade, reordenação, lacunas, divergência de relógio e reorg.
- Classificar dados como VALID, STALE, INCOMPLETE, INCONSISTENT ou UNTRUSTED.
- Publicar eventos internos versionados.
- Implementar cache efêmero, compartilhado, histórico e auditável.
- Definir TTL, versionamento, invalidação e fonte de autoridade.
- Diferenciar ausência, vencimento e valor explicitamente igual a zero.
- Bloquear execução com dados incompletos, vencidos ou sem proveniência.
- Criar replay de eventos e snapshots.

#### Dependências

E3 e E4.

#### Responsáveis sugeridos

Engenheiro de dados, engenheiro de plataforma e engenheiro on-chain.

#### Critérios de aceite

- Todo evento possui os campos obrigatórios de identificação, origem, tempo, versão e qualidade.
- Dados sem timestamp confiável ou origem identificável não alimentam execução.
- Falhas de cache não são mascaradas por valores padrão.
- Saldos, nonce e confirmação possuem fonte de autoridade definida.
- Reorgs e lacunas são detectados e tratados.
- Dados vencidos exigem revalidação antes de uso operacional.
- Replay reproduz o mesmo estado para o mesmo conjunto de eventos.

#### Entregáveis

- Conectores e normalizadores.
- Modelo de qualidade de dados.
- Camadas de cache e armazenamento histórico.
- Política de TTL e invalidação.
- Pipeline de replay.
- Dashboard de frescor, completude e consistência.

---

### E6 — Descoberta e pipeline de decisão

#### Objetivo

Separar descoberta, avaliação, ranking e decisão, tornando explícita a opção de não operar.

#### Tarefas

- Implementar OpportunityDiscovery para ativos, pares, pools, rotas e redes.
- Aplicar filtros de liquidez, volume, profundidade, idade, cotação e qualidade.
- Implementar cache, deduplicação e coalescing de consultas.
- Manter listas de ativos, contratos, bridges e protocolos bloqueados.
- Gerar opportunity_id determinístico, janela de validade, fontes, bloco e restrições.
- Implementar OpportunityEvaluator.
- Calcular retorno bruto e líquido incluindo taxas, gas, spread, slippage, impacto, falhas, MEV, latência, probabilidade de preenchimento, capital, exposição, correlação, risco de token, contrato e cadeia.
- Modelar incerteza, erro de estimativa e custo de oportunidade.
- Implementar decisões OPERATE, DO_NOT_OPERATE e NEEDS_REVALIDATION.
- Persistir limiares, premissas, versão do modelo e motivos.
- Medir p50, p95 e p99 da decisão local com snapshot disponível.

#### Dependências

E4 e E5.

#### Responsáveis sugeridos

Engenheiro de dados, engenheiro de risco, engenheiro de estratégia e líder técnico.

#### Critérios de aceite

- Oportunidades possuem identificador determinístico e janela de validade.
- Valores ausentes nunca são tratados como zero.
- OPERATE só é emitido com dados válidos, frescos e completos.
- O edge líquido supera margem mínima com erro, falhas e reserva de segurança.
- DO_NOT_OPERATE é persistido com código estável e valores observados.
- O resultado contém retorno, risco, confiança, custos, frescor, versão e premissas.
- O benchmark da decisão local declara hardware, carga, snapshot, cache hit e versão.
- O alvo p95 ≤ 80 ms é medido somente no escopo definido.

#### Entregáveis

- OpportunityDiscovery.
- OpportunityEvaluator.
- Catálogo de reason codes.
- Modelo de score e decisão.
- Benchmark reproduzível.
- Relatório de oportunidades rejeitadas e motivos.

---

### E7 — Gestão de risco e portfólio

#### Objetivo

Impedir operações que excedam limites de perda, exposição, liquidez, dados ou dependências.

#### Tarefas

- Implementar RiskEngine.
- Definir limites por operação, ativo, cadeia, estratégia e carteira.
- Implementar perda máxima, drawdown, slippage, validade de cotação e saldo mínimo de gas.
- Controlar risco de token, contrato, bridge, protocolo e contraparte.
- Implementar exposição correlacionada e concentração por provedor.
- Controlar nonce, duplicidade e transações pendentes.
- Implementar circuit breakers globais e por estratégia.
- Bloquear por degradação de dados, provedor, reorg ou finalização incompleta.
- Calcular sizing após edge líquido, confiança, liquidez, capital e limites.
- Persistir rejeições com código, valor observado, limite e versão da política.
- Implementar post_trade_check para reduzir limites, congelar operações e acionar circuit breakers.

#### Dependências

E3 e E6.

#### Responsáveis sugeridos

Engenheiro de risco, engenheiro de estratégia e QA/SRE.

#### Critérios de aceite

- Toda intenção passa por pre_trade_check antes de cotação final ou execução.
- Rejeições são fail-closed e auditáveis.
- Circuit breakers impedem novas operações no escopo correto.
- Sizing respeita capital, liquidez, edge, confiança e exposição.
- Perdas, divergências e anomalias podem reduzir limites automaticamente.
- Limites e políticas possuem versão e histórico.
- Testes cobrem concorrência, duplicidade, dados degradados e transações pendentes.

#### Entregáveis

- RiskEngine.
- Catálogo de políticas e limites.
- Circuit breakers.
- Modelo de exposição e correlação.
- Relatórios de rejeição e acionamento de limites.
- Runbook de recuperação após bloqueio.

---

### E8 — Simulação e cotação

#### Objetivo

Revalidar a oportunidade com dados atuais e impedir assinatura quando a vantagem desaparecer.

#### Tarefas

- Implementar QuoteSimulator.
- Solicitar cotação atualizada e simular rota e impacto.
- Validar gas, saldo, allowance, nonce e chain ID.
- Simular transação quando suportado.
- Comparar cotação atual com hipótese original.
- Validar contrato, calldata, destinatário, valor nativo e parâmetros.
- Aplicar limites de gas, prazo, slippage e valor máximo.
- Persistir quote_id, validade, rota, taxas, bloco, provedor e hash dos dados.
- Classificar divergências entre simulação e execução.
- Bloquear cotação vencida, inconsistente ou sem evidência suficiente.

#### Dependências

E5, E6 e E7.

#### Responsáveis sugeridos

Engenheiro on-chain, engenheiro de risco e engenheiro de plataforma.

#### Critérios de aceite

- Toda cotação possui validade explícita e bloco de referência.
- Cotação vencida exige nova cotação.
- Divergência entre hipótese e cotação invalida ou rebaixa a operação conforme política.
- Chain ID, destinatário, calldata, nonce e valor são comparados à intenção aprovada.
- Simulação não é tratada como prova de lucro ou execução.
- Falhas de simulação são classificadas e observáveis.
- Testes cobrem gas insuficiente, allowance, nonce, slipp

[TEXTO RECEBIDO TERMINA AQUI, CORTADO NO MEIO DA PALAVRA. O DETALHE DE E9 A E13 NÃO FOI RECEBIDO.]

---

## Cobertura pelo trabalho do GOAL 1 (anotação posterior, não faz parte do documento do dono)

Estado em 2026-10-17 (atualizado depois da ligação ao ciclo), na branch `goal1/motor-decisao-onchainos`. Sem lucro declarado; os números vêm de `spec.md` e dos relatórios em `data/bench/`.

| Épico | Estado | O que existe | O que falta |
|---|---|---|---|
| E0 Auditoria e baseline | Parcial | Baseline medido do agente (`scripts/baseline-audit.ts`): ciclos, ordens por estágio e motivo, latência do modelo e da cotação, ciclo de vida da ordem (fila, executor, inclusão, recibo), slippage contra a cotação, impacto de preço, fills por FIFO, PnL realizado das vendas pareadas, patrimônio e drawdown, projeção de franquia; varredura de código ocioso (`scripts/idle-code.ts`); limites da OKX lidos na fonte e classificados. Presença das credenciais verificada sem expor valor | Escopo efetivo, idade, armazenamento e rotação de cada credencial; plano real das chaves (o portal exige login); diagrama do fluxo; matriz de riscos formal; aprovação do responsável técnico |
| E1 Segurança e isolamento | Parcial | Motor sem caminho de assinatura, rede ou live, verificado por `boundary.test.ts`; modo live inexistente no motor; ambiente atual com `DRY_RUN=true` e `LIVE_ACK` vazio | Secret manager, MFA, separação física de ambientes, allowlists de contratos e destinatários, pausa emergencial e revogação testadas, auditoria de flags |
| E2 Observabilidade e auditoria | Parcial | Log de motivos append-only em JSONL, resumo por ação, motivo e etapa; telemetria de latência por etapa com etapa não medida declarada; trilha gravada antes do envio; painel estático (`scripts/decision-dashboard.ts`); `engine-shadow.jsonl` e `executor-health.jsonl` no agente | Correlation ID, traces, alertas com runbook, dashboards, retenção e integridade dos logs, sincronização de relógio |
| E3 Contratos, estado e mensageria | Parcial | Tipos do motor, idempotência por id, nonce sequencial na porta paper, passos do runner serializados | Schemas versionados e registry, outbox e mensageria, dead-letter, reserva de nonce com lease, armazenamento transacional |
| E4 Registry e orçamento de APIs | Em grande parte | Registry por pool com limites validados na fonte, token bucket com pacing adaptativo, reserva de 20% para execução e segurança, cache com TTL e invalidação, coalescing, backoff com jitter e Retry-After, bloqueio no 402 até o mês seguinte, ledger compartilhado, contagem por endpoint, relatório e projeção de franquia, batcher desligado até o limite de lote ser conhecido | Failover entre provedores, reconciliação de custo estimado contra efetivo, alertas de consumo e expiração, painel |
| E5 Ingestão e qualidade de dados | Mínimo | Validação de domínio da oportunidade, da carteira e dos limites, com `bad_data` | Conectores, normalização, classificação VALID/STALE/INCOMPLETE/INCONSISTENT/UNTRUSTED, reorg e lacunas, cache histórico, replay de eventos |
| E6 Descoberta e decisão | Parcial | Pipeline filtro, edge, sizing e controles com `NAO_OPERAR` explícito e motivo estável; custo por perna; benchmark da decisão local (p95 0,005 ms); adaptador do fechamento real para a oportunidade e replay em sombra sobre 240 fechamentos reais (o motor recusou os 108 avaliáveis, como a produção) | Descoberta de oportunidades, estado `NEEDS_REVALIDATION` (hoje há `COMPRAR`, `VENDER` e `NAO_OPERAR`), incerteza e custo de oportunidade no edge, `pWin` calibrado a partir de dados reais |
| E7 Risco e portfólio | Parcial | Limites de posição, exposição bruta, perda do dia e drawdown, saldo de gas, correlação, breaker de execução, breaker de executor com sonda **aplicado no `Executor` de produção** (teste ponta a ponta), fechar posição como redução de risco | `post_trade_check`, concentração por provedor, transações pendentes, versão e histórico de políticas |
| E8 Simulação e cotação | Não iniciado | Validade da cotação como filtro de idade | QuoteSimulator, validação de calldata, destinatário, chain ID, allowance e nonce |
| E9 Reconciliação e contabilidade | Parcial | Reconciliação do custo da perna de entrada na porta paper; PnL realizado líquido de taxa e gas no paper; nas execuções reais, o slippage contra a cotação (15 pares: p50 0 bps, p95 10,6) e o PnL das 7 vendas pareadas (-0,41%) | ReconciliationService contra a cadeia e PnL realizado de execuções reais |
| E10 e E11 Adaptadores e execução | Bloqueado por desenho | Nenhum: o motor não envia | Dependem das aprovações do dono; fora do alcance de qualquer agente |
| E12 Experimentação, replay e promoção | Parcial | Paper-run, replay sobre fechamentos reais (`scripts/shadow-engine.ts`), benchmark reproduzível, fronteira entre motor e experimentação | Pipeline de promoção e critérios de promoção |
| E13 Operação e SLOs | Não iniciado | Nada além dos relatórios acima | Runbooks, SLOs, rollback, relatório executivo |

Achados do baseline que mudam a prioridade deste roadmap: desde 2026-10-15 18:38 UTC toda ordem falha por `gas_station_pendente` (E0 e E1: causa de configuração da carteira, só o dono resolve), e a cadência de 80 a 100 ms é inviável nos planos atuais (E4: 11,1 requisições por segundo contra 1 de teto de trade). Detalhes em `spec.md`.
