# Inventário de especificações e contratos do Jev Trader

Pesquisa local para preparar a instrução do próximo objetivo, em 2026-10-11. Autor pesquisador: `/root/spec_inventory`; conversa nativa observada `CODEX_THREAD_ID=01a12b61-5e42-71b1-8092-c5c1220ed3f6`, sessão `01a12b5f-ca2a-7ff1-a131-07933705d3e8`. Não houve implementação, teste de produto, consulta autenticada, assinatura, transação, alteração do checkout ou certificação independente nesta pesquisa. O contexto próprio foi recuperado em revisão 0; nenhum estado de outra conversa foi importado. Os checkpoints de outras conversas citados abaixo são documentos do projeto, não autorização para retomar suas tarefas.

## Resultado consolidado

A direção existente é uma central Web3 orientada pelo Jev com carteira, pesquisa de oportunidades, limites determinísticos e reconciliação de capital. O projeto acumulou módulos reais de código, demonstrações sintéticas, pesquisa primária e contratos de qualificação; o encadeamento autônomo inteiro permanece não demonstrado. A instrução seguinte deve conectar uma leitura real delimitada e verificável à interface, reutilizando clientes existentes e preservando identidade, representações, origem, relógios, cobertura e desconhecidos. Deve também distinguir configuração local, acesso observado e execução qualificada.

O objetivo amplo está em [GOAL-INONU-TRADER.md:3](C:/Users/gabri/jev-trader/docs/GOAL-INONU-TRADER.md:3). Seu próprio contrato exige descobrir unidades, acesso, custos e histórico antes de adaptadores, manter desconhecidos bloqueantes e reinvestir somente resultados realizados conciliados. [README.md:94](C:/Users/gabri/jev-trader/README.md:94) reconhece que as fatias presentes não estabelecem a cadeia carteira → candidatos → Jev → execução → reconciliação, qualificação live, lucro ou operação de 24 horas.

Três fatos mudam a escolha do próximo objetivo:

1. **Clientes não são a principal ausência.** [DATA-INTEGRATION-AUDIT.md:15](C:/Users/gabri/jev-trader/docs/okx-ecosystem-v1/DATA-INTEGRATION-AUDIT.md:15) identifica clientes existentes de Signals, Leaderboard e DeFi. Seus resultados normalizados não satisfazem os envelopes dos relatórios; o gravador Web3 atual só acrescenta `mark` e `candle`. A lacuna é uma adaptação explícita com fidelidade de consulta, identidade, representação e relógios, seguida de composição com a interface.
2. **Entrega visual e serviço local ainda precisam de evidência válida.** [CENTRAL-JEV-CHECKPOINT.md:34](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-CHECKPOINT.md:34) mantém C3 e C6 pendentes após recusa/bloqueio de preview; a suíte, SSR e revisão delimitada não substituem a inspeção servida. Esse registro não autoriza contornar política nem repetir a rota recusada.
3. **Saldo e resultado são contratos diferentes.** [CAPITAL-BOUNDARY-AUDIT.md:7](C:/Users/gabri/jev-trader/docs/okx-portfolio-v1/CAPITAL-BOUNDARY-AUDIT.md:7) registra `completed -> reconciliation_required` e `realizedUsd:null`. Variação de saldo não demonstra lucro, e a nova SPEC de valuation conserva valores financeiros derivados como `null`.

## Cobertura e método

Inventário delimitado: todos os Markdown de `docs/**`, mais `IDEA.md`, `SPEC.md`, `README.md`, `CONTRIBUTING.md`, `CLAUDE.md` na raiz e `README.md`, `OKX-WALLET.md`, `CLAUDE.md`, `AGENTS.md` em `web/`. São 135 arquivos: 126 em `docs`, cinco na raiz, quatro em `web`. Todos tiveram título, estrutura, declarações de estado ou trechos contratuais inventariados. Os contratos centrais curtos tiveram leitura integral; pesquisas, guias longos e registros extensos tiveram seleção de requisitos, conclusões, bloqueios e aceitação. A extensão exata declarada por arquivo consta no JSON anexo.

Não se afirma leitura integral das 135 fontes. Os extratos de comandos foram delimitados e alguns lotes longos foram truncados; trechos decisivos foram recuperados separadamente. Grandes logs, binários e diretórios de evidência não foram percorridos. JSONs de decisão, manifestos e recibos referenciados foram apenas identificados por nome, salvo o catálogo R6: suas chaves, contagens e campos foram examinados. Nenhum resultado de revisão, modelo, licença, assinatura, tier, credencial, saldo pessoal ou acesso live foi inventado. Arquivos `.env`, chaves e dados privados não foram abertos.

O arquivo `source-inventory.json` contém SHA-256 dos bytes existentes no momento de captura final, tamanho, linhas e extensão de leitura. Hash identifica bytes locais; não autentica dados externos nem certifica que um relatório histórico se aplica ao checkout atual. Não foi feito congelamento de cada arquivo antes da primeira leitura; mudanças concorrentes posteriores exigem que o integrador confira hashes antes de usar esta entrega como baseline. A presença de muitos arquivos não commitados foi observada e preservada.

## Matriz de requisitos, precedência e conflitos

| Camada | Requisitos existentes e precedência | Aplicação ao próximo objetivo |
| --- | --- | --- |
| Direção ampla | GOAL-INONU exige descoberta, comparação de modalidades, carteira/limites/paper/reconciliação. Não concede autorização financeira. IDEA, INONU-PROPOSAL e pesquisas explicam origem e hipóteses. | Executar um incremento verificável dentro dessa direção; não prometer retorno nem supor capital pessoal observado. |
| Segurança base | R1–R8 de READINESS e P1–P3 de PROFIT são mantidos por README:60. READINESS:6 substitui o demo por bloco quando conflita com proteção do capital. | Hold para custo, unidade, retorno, inventário, deadline ou reconciliação desconhecidos; não enfraquecer critérios para demonstrar atividade. |
| Contrato histórico | SPEC.md:4,14 exige Jev/order por bloco de 300 ms; SPEC.md:19,85–90 exclui carteira, configurações, navegação e backtest. CLAUDE.md:115–125 repete o tweet. | Está em conflito com produto atual e prioridade explícita do README. Preservar história e publicar a precedência, em vez de usar esses limites antigos para excluir a central atual ou remover proteção. |
| Wallet | O1–O8 (OKX-SPEC) e W1–W8/A1–A4 (WALLET-OPPORTUNITIES) fixam provider ancorado, conexão explícita, leitura finita, cadeia/contrato/BigInt/bloco, invalidação por eventos e privacidade. | Não encaminhar silenciosamente endereço/saldo para backend, modelo ou analytics. Cobertura finita de Monad/X Layer não vira patrimônio multichain completo. |
| UI | D1–D8 de INONU-DESIGN-SPEC:99–106 exigem contraste, mobile, teclado, estado/origem e ausência de piscar/pulsar. C1–C6 da Central acrescentam integração, testes, revisão e inspeção servida. | Interface útil deve mostrar origem, mock/live/unknown, relógios, unidade e cobertura por recurso. Movimento 2.5D permanece condicionado à aceitação visual/a11y; snapshot SSR não a certifica. |
| Mercado/scanner | E1–E8 no namespace okx-market mantêm pesquisa read-only, queries/identidades exatas, finitude e cobertura declarada. Errata factual e layout addendum não enfraquecem E1–E8. | Reutilizar o scanner; ausência de segurança/saída/custos impede elegibilidade financeira. `sourceClaim` ou factory identity não prova autenticidade/acesso atual. |
| DEX | D1–D8 do DEX tiveram implementação/revisão histórica; o guia posterior impõe quote autenticada única A→B com `outputUnit=unknown`. Pesquisas v3/SDK não resolveram unidade de saída. | Não montar segunda perna autenticada, delta atômico, retorno líquido ou execução a partir de `outputRaw`. Slippage v6 em percentual não é fração v5. |
| Signals e evidência | S1–S8 e E1–E8 do join preservam endpoint/category, relógio declarado, identidade por cadeia, arquivos limitados, origem não verificada e `non_qualified`. | Adaptar conscientemente `Read<SignalRow[]>` ao contrato; não inventar envelope bruto ou relógio do provedor. Dados de carteira de leaderboard foram deliberadamente descartados. |
| DeFi | D1–D8 próprios de DeFi preservam `investmentId`, lexemas, APY anunciada em fração, TVL documentado, detalhe/série com unidade desconhecida, suporte a ação sem inferir elegibilidade. | Não confundir APY com retorno líquido nem catálogo com capacidade da conta; resultado permanece observacional. |
| Consulta unificada | EC1–EC7 combinam relatórios existentes; GUIA:3 declara proposta revisada **não implementada**, `okx:ecosystem` indisponível. | Se incorporada, recuperar elegibilidade no contexto próprio e preservar EC1–EC7. O `stale_evidence` registrado pertence ao ciclo documentado, não prova bloqueio deste pesquisador. |
| OnchainOS dados | D1–D27 próprios de OKX-ONCHAINOS-DADOS-SPEC fixam HMAC, transporte injetado, allowNetwork+credencial, quotas, retry limitado, schema/redaction, unidades e captura. | Separar catálogo, cliente instalado, configuração, leitura observada e recurso qualificado. O prefixo D se repete em outros módulos: identificar namespace ao rastrear requisitos. |
| Captura pública | PUBLIC-MARKET-CAPTURE:7 mantém adaptador Node HTTPS/WS com `runtime_capability_unqualified`, recusa antes de DNS/socket/criação. API pública v5 por outros clientes é capacidade distinta. | Não tratar flag como qualificação. Selecionar um caminho já suportado ou especificar/verificar transporte antes de alegar captura real. Nenhuma licença de redistribuição foi demonstrada. |
| Modelo e limites | OPERATOR-DECISION-BOUNDARY impõe escolha por ID elegível, hold e deadline; L1–L27 são matemática/envelope determinísticos. Lab LB1–LB27 é sombra; System One mantém `dry_run|blocked`. | Jev decide dentro do envelope; scores não são probabilidades de lucro. Plugin de decisão de engenharia e modelo do produto são integrações diferentes. Configuração de capital de System One não é saldo. |
| Execução e capital | I1–I7 do Web3 mantêm entrega rastreável e parent incompleto; preflight de Wallet dá `executionQualified=false`. R8 veta estágio 3; qualificação é checklist read-only. | Nenhum passo de dados/UI levanta live, assina, envia, aprova, deposita ou reinveste. Reconciliar plano/receipts/custos/fluxos externos é tarefa própria anterior a lucro realizado. |

### Conflitos concretos que a instrução deve resolver por evidência

- **Tempo de resposta:** tweet/SPEC histórica pede 300 ms; READINESS/PROFIT impõem hold e custos conhecidos; R7:18 não mediu o caminho de duas chamadas HTTP/TEE da Agentic Wallet. System One/R9 propõem segundos/minutos. Não aceitar “rápido”, polling de 5 s, fixture ou médio de subprocesso como latência por bloco. Preservar o alvo histórico como não demonstrado e exigir medição real somente quando fizer parte do incremento.
- **Implementado versus proposto:** SPEC de DeFi ainda tem cabeçalho candidato, mas [VERIFICACAO.md:3](C:/Users/gabri/jev-trader/docs/okx-defi-v1/VERIFICACAO.md:3) declara módulo implementado. EC e WVD, ao contrário, se declaram não implementados. Estado deriva do conjunto de contrato, código e evidência datada, não da palavra SPEC nem do título candidato isolado.
- **Lucro por variação de saldo:** OKX-OPERADOR-JEV:55,73 descreve cálculo hoje contradito pela auditoria de capital:54. `realizedUsd:null` e `reconciliation_required` são barreiras atuais documentadas; não “corrigir” exibindo zero ou computando diferença patrimonial.
- **Arquitetura versus estado:** ARQUITETURA-CENTRAL:29 diz stops ainda não existentes e planeja rota Central; README:68 e auditorias posteriores registram componentes e limites. Arquitetura é direção, sem prova automática do checkout atual. AUDITORIA-OBJETIVOS chama integração de redes/demo “feito” sem qualificar provider, cadeia ponta a ponta ou live.
- **Revisões de snapshots:** R5 vetou live; R8 apenas F1 PASS e F2–F8 PARTIAL; Central OI posterior aprovou delta de contexto/modelo. Essa aprovação estreita resolve o achado do delta revisado, não converte R8 inteiro em PASS. Contagens históricas 481, 1.963, 2.377 etc. não são resultado executado nesta pesquisa.
- **Escopo:** old wallet finite excluía USD global; WVD especifica diagnóstico sem valor derivado, não autorização para inventar patrimônio. EC7 exclui Portfolio/Rewards/Alpha daquele módulo. Um novo objetivo pode especificar extensão, porém deve manter aceitação prévia e justificar o seam; “toda Wallet” não revoga exclusões sem contrato.

## Lacunas prioritárias e alternativas reais

| Prioridade | Lacuna | Evidência e consequência |
| --- | --- | --- |
| 1 | Uma trilha servida de dados read-only com estado de configuração e proveniência verificáveis | Clientes existem; relatórios/envelopes/UI são capacidades separadas. DATA-INTEGRATION-AUDIT:15–29 e Central C3/C6. Uma resposta externa pode permanecer desconhecida quando credencial/entitlement não for demonstrável; ainda assim diagnóstico e dados públicos elegíveis podem avançar. |
| 2 | Contrato de fidelidade entre transporte e relatórios | `Read<T>` perde corpo/envelope e alguns lexemas; endpoint sem query; timestamps locais não são timestamps do mercado. Não reconstruir raw inexistente. Captura nova deve dizer quais bytes/representações realmente preserva. |
| 3 | Inventário da carteira e privacidade explícita no seam | WEB3-READINESS:26 aponta ausência da ligação browser → scanner/risk; WVD define diagnóstico de representação, cobertura e duplicatas. Não transformar carteira conectada em permissão de enviar dados ao modelo/backend. |
| 4 | UI de diagnóstico e inspeção real desktop/mobile | Não mostrar missing como 0, mock como live, source claim como autenticado ou candidata rejeitada como hold de 100%. C3/C6 precisam de contexto de execução permitido e inspeção, sem contornar bloqueio anterior. |
| 5 | Pipeline elegível → Jev tipado → paper/reconciliação | WEB3-READINESS:7 e FOLLOWUP:43 mantêm chain ausente. Modelos e executores devem preservar malformed/unavailable/hold antes de efeitos; relatórios de yield/leaderboard não são candidatos econômicos qualificados. |
| 6 | Reconciliação patrimonial/custos para resultados realizados | CAPITAL-BOUNDARY-AUDIT:38,62 aponta custos parciais aparentando zero e necessidade de atribuição. Depósitos, retiradas, mark-to-market e juros/receipts exigem contratos separados. |
| 7 | História, vantagem e custo/latência reais | Lab/derivativos/envelope são infraestrutura estatística; PUBLIC capture unqualified e arquivos históricos são apenas descoberta. Não há prova OOS, operação contínua, fills reais, lucro ou 300 ms. |

Alternativas para o integrador apresentar ao Jev, caso haja decisão técnica aberta:

1. **Vertical read-only de integração:** escolher uma família pública ou autenticada com acesso efetivamente demonstrável, preservar captura/fidelidade, ligar diagnóstico de configuração e dados à Central, e testar/inspecionar o recurso servido. Maior aderência ao pedido; depende de acesso e superfície servida permitidos.
2. **Diagnóstico patrimonial WVD offline:** implementar futuramente o módulo puro já especificado, com cobertura/duplicatas/unidades/relógios e todos valores derivados `null`. Incremento mais limitado, sem dependência de credenciais; não satisfaz sozinho integração real ou UI inteira.
3. **Qualificação visual/servida da Central:** fechar C3/C6 em superfície permitida e corrigir problemas observados. Valiosa como entrega de interface, mas insuficiente sozinha para dados/configuração/Wallet reais.
4. **Novas modalidades, Agentic Wallet ou live:** documentação existe, mas limites regionais, endpoint/chain, unidades, custody, enforcement, reconciliação, execução e autorização permanecem dependências. Isso aumenta escopo antes de completar a integração observacional atual; não é substituto elegível de um seam de dados.

Essas alternativas são pesquisa para decisão consultiva, não escolha já executada nem aprovação humana. Recomenda-se orientar a nova instrução pela primeira, com diagnóstico offline e inspeção como subentregas proporcionais, após o integrador verificar fatos atuais e obter o recibo Jev se a escolha permanecer aberta.

## Aceitação independente sugerida para a instrução seguinte

Critérios abaixo são proposta para o integrador congelar e mandar a revisão independente; não foram implementados ou certificados por este autor:

- Toda funcionalidade selecionada deve ter mapa recurso → endpoint/contrato → configuração necessária → identidade/unidade/clock → dado preservado → componente → prova observada. Estado de recurso diferencia código, configuração presente, acesso observado, dado sintético/importado, cobertura parcial, recurso indisponível e execução qualificada. Configuração ausente nunca fornece dados fictícios silenciosamente.
- Um endpoint selecionado deve demonstrar a leitura real quando autorização e acesso existirem, com evidência sanitizada e sem secret/header/payload privado no repositório. Se acesso não for demonstrável, registrar desconhecido/dependência e concluir apenas os critérios independentes; não declarar a integração externa completa.
- Adaptadores reutilizam o transporte/cliente existente; não inventam envelope, provider timestamp, unidade ou origem. Fonte normalizada permanece assim, e representação local/hash recebe rótulo limitado. Campos financeiros ficam desconhecidos até contrato qualificado.
- Interface servida mostra a leitura e seus limites, fica utilizável em desktop/mobile/teclado e mantém D1–D8/C3/C6. Inspeção deve usar superfície permitida; revisão SSR e build não substituem browser.
- Dados privados da Wallet permanecem locais conforme O/W; qualquer novo fluxo para backend/modelo exige contrato e autorização próprios. Preflight permanece read-only e `executionQualified=false`.
- Decisão do produto somente sobre IDs já elegíveis, com hold/malformed/unavailable visíveis; sem calldata, wallet address ou texto hostil na entrada do modelo. Nenhuma ligação de dados/UI eleva eligibility, live ou reinvestimento.
- O integrador fixa baseline e hashes reais do recorte, protege as mudanças concorrentes, verifica comportamento afetado e entrega snapshot para revisor independente. READINESS/PROFIT/O/W/E/S/D/EC/L/LB/I/C aplicáveis permanecem intactos; achados de revisões anteriores são explicitamente rechecados ou ficam como limitações.

## Preservar e excluir

Preservar: módulos existentes e seus seams; mudanças preexistentes; mock/synthetic/imported/live distintos; default offline e fail closed; BigInt/integer units; identidade por cadeia/contrato/conta; null versus zero; provenance com limite; clocks locais versus provider; custo de inferência desconhecido; ID de plano/quote/receipt; reconciliação idempotente; stop latch; privacidade; diferenças de versão dos contratos oficiais (REST/CLI/v5/v6 não intercambiáveis); congelamento da aceitação; revisão externa ao autor.

Excluir do próximo incremento read-only: trading real, remover bloqueios de Market/operator, wallet backend signer, approve/transfer/deposit/invest/claim/bridge, automatic x402, instalar ou ativar Agentic Wallet para custodiar fundos, assumir licença/acesso/Brasil, consumir feeds privados sem autorização, rastrear carteiras de leaderboard a partir de endereço descartado, somar wallet/DeFi como patrimônio completo, converter `outputRaw` em retorno, prometer lucro/compounding/24h/300ms, nova estratégia de alavancagem não qualificada, push/commit/deploy/publicação e transferir estado privado ao checkout.

A palavra “todas” no pedido pede análise ampla e instrução com mapa de cobertura; não torna operacional cada uma das 444 capacidades do catálogo. R6 catalogou 444 itens de 18 famílias (345 leituras, 22 geradores de calldata, 77 writes na classificação histórica); a superfície elegível deve ser escolhida por evidência atual e exclusões explícitas.

## Evidência literal decisiva

| Fonte | Texto literal observado | Limite da evidência |
| --- | --- | --- |
| WEB3-INTEGRATION-READINESS:7 | “The current checkout is not a verified autonomous OKX wallet-management system.” | Estado documental datado; necessita snapshot atual para certificação. |
| okx-ecosystem-v1/GUIA:3 | “Status: proposta especificada e revisada, ainda não implementada. `okx:ecosystem` não está disponível.” | Diferencia SPEC revisada de comando entregue. |
| CAPITAL-BOUNDARY-AUDIT:7 | `reconciliation_required`; `realizedUsd: null` | Reconciliação bloqueada; não inferir lucro de saldo. |
| VALUATION-DIAGNOSTICS-SPEC:69 | `completePortfolioValueUsd`, `netReturnUsd`, `realizedNetUsd`, `totalCostsUsd`, `executableExitLiquidityUsd`, `reinvestableUsd` todos `null` | WVD é diagnóstico, não valuation financeiro calculado. |
| PUBLIC-MARKET-CAPTURE:7 | `runtime_capability_unqualified` | Adaptador fornecido recusa; teste sintético não qualifica I/O real. |
| LIVE-QUALIFICATION:9 | “`readyForOwnerReview=true` significa apenas que a checklist está completa.” | Checklist não é permissão financeira. |
| POLITICA-DE-LIMITES:9 | “o padrão é a fase 0 (paper e leitura, alavancagem zero, nenhuma exposição).” | Fase explícita não promove qualificação. |
| SYSTEM-ONE:8 | “o capital e configurado [...] nao e um saldo.” | Configuração e observação patrimonial separadas. |

## Catálogo completo de fontes Markdown

Estado abaixo descreve o papel documental e a leitura de pesquisa, sem aprovar produto ou revalidar os testes citados. Paths são relativos a `C:/Users/gabri/jev-trader`. O JSON associado guarda os hashes integrais.


| Arquivo | Estado documental | Leitura |
| --- | --- | --- |
| [CLAUDE.md](C:/Users/gabri/jev-trader/CLAUDE.md) | Instrucao local; expectativa herdada de 300 ms em conflito explicito com prioridade safety | integral |
| [CONTRIBUTING.md](C:/Users/gabri/jev-trader/CONTRIBUTING.md) | Contrato local de contribuicao/instrucoes; nao concede publicacao ou fundos | integral |
| [docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md](C:/Users/gabri/jev-trader/docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md) | Arquitetura/direcao; proposicoes e partes superadas por codigo/evidencia posterior | integral |
| [docs/AUDITORIA-OBJETIVOS.md](C:/Users/gabri/jev-trader/docs/AUDITORIA-OBJETIVOS.md) | Auditoria/diagnostico historico; fatias integradas nao provam entrega inteira | integral |
| [docs/BACKTEST-EVIDENCE.md](C:/Users/gabri/jev-trader/docs/BACKTEST-EVIDENCE.md) | Evidencia historica de paper/release; replay nao e rerun/OOS/24h/live | seletiva |
| [docs/CENTRAL-JEV-ACCEPTANCE.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-ACCEPTANCE.md) | C1-C6 preservados; C3/C6 documentalmente pendentes | integral |
| [docs/CENTRAL-JEV-CHECKPOINT.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-CHECKPOINT.md) | Checkpoint declara parent incompleto, preview bloqueado e C3/C6 pendentes | integral |
| [docs/CENTRAL-JEV-FINANCIAL-REVIEW.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-FINANCIAL-REVIEW.md) | Verificacao/revisao limitada de snapshot; nao fecha C1-C6 global ou qualifica live | integral |
| [docs/CENTRAL-JEV-INTEGRATION-78ae090.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-INTEGRATION-78ae090.md) | Verificacao/revisao limitada de snapshot; nao fecha C1-C6 global ou qualifica live | integral |
| [docs/CENTRAL-JEV-OPERATOR-INTEGRATION-SPEC.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-OPERATOR-INTEGRATION-SPEC.md) | Contrato limitado de integracao/reparo; nao amplia aceitação nem autoriza live | integral |
| [docs/CENTRAL-JEV-OPERATOR-REVIEW-7bce1e8.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-OPERATOR-REVIEW-7bce1e8.md) | Verificacao/revisao limitada de snapshot; nao fecha C1-C6 global ou qualifica live | integral |
| [docs/CENTRAL-JEV-OPERATOR-VERIFICATION-7bce1e8.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-OPERATOR-VERIFICATION-7bce1e8.md) | Verificacao/revisao limitada de snapshot; nao fecha C1-C6 global ou qualifica live | integral |
| [docs/CENTRAL-JEV-REMOTE-AUDIT-2ed0324.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-REMOTE-AUDIT-2ed0324.md) | Verificacao/revisao limitada de snapshot; nao fecha C1-C6 global ou qualifica live | integral |
| [docs/CENTRAL-JEV-REMOTE-INTEGRATION-SPEC.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-REMOTE-INTEGRATION-SPEC.md) | Contrato limitado de integracao/reparo; nao amplia aceitação nem autoriza live | integral |
| [docs/CENTRAL-JEV-REMOTE-VERIFICATION-2ed0324.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-REMOTE-VERIFICATION-2ed0324.md) | Verificacao/revisao limitada de snapshot; nao fecha C1-C6 global ou qualifica live | integral |
| [docs/CENTRAL-JEV-REVIEW-1c50fdf.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-REVIEW-1c50fdf.md) | Verificacao/revisao limitada de snapshot; nao fecha C1-C6 global ou qualifica live | integral |
| [docs/CENTRAL-JEV-REVIEW-FIX-SPEC.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-REVIEW-FIX-SPEC.md) | Contrato limitado de integracao/reparo; nao amplia aceitação nem autoriza live | integral |
| [docs/CENTRAL-JEV-REVIEW.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-REVIEW.md) | Verificacao/revisao limitada de snapshot; nao fecha C1-C6 global ou qualifica live | integral |
| [docs/CENTRAL-JEV-VERIFICATION-1c50fdf.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-VERIFICATION-1c50fdf.md) | Verificacao/revisao limitada de snapshot; nao fecha C1-C6 global ou qualifica live | integral |
| [docs/CENTRAL-JEV-ZERO-CEILING-REGRESSION.md](C:/Users/gabri/jev-trader/docs/CENTRAL-JEV-ZERO-CEILING-REGRESSION.md) | Verificacao/revisao limitada de snapshot; nao fecha C1-C6 global ou qualifica live | integral |
| [docs/CONTRIBUICAO.md](C:/Users/gabri/jev-trader/docs/CONTRIBUICAO.md) | Contrato local de contribuicao/instrucoes; nao concede publicacao ou fundos | seletiva |
| [docs/FUNDING-RESEARCH.md](C:/Users/gabri/jev-trader/docs/FUNDING-RESEARCH.md) | Pesquisa/acesso/operacao historicos; elegibilidade pessoal e lucro desconhecidos | seletiva |
| [docs/GOAL-INONU-TRADER.md](C:/Users/gabri/jev-trader/docs/GOAL-INONU-TRADER.md) | Direcao ampla vigente; descoberta e gates; sem autorizacao financeira | integral |
| [docs/INONU-DESIGN-SPEC.md](C:/Users/gabri/jev-trader/docs/INONU-DESIGN-SPEC.md) | Aceitacao visual D1-D8; entrega visual atual ainda precisa prova servida | integral |
| [docs/INONU-PROPOSAL.md](C:/Users/gabri/jev-trader/docs/INONU-PROPOSAL.md) | Historico/proposta de origem; alcance atual e gates posteriores prevalecem | integral |
| [docs/JEV-DECISAO-ONCHAIN-OS.md](C:/Users/gabri/jev-trader/docs/JEV-DECISAO-ONCHAIN-OS.md) | Registro historico de decisao/configuracao local; nao prova estado ou custo atuais | seletiva |
| [docs/JEV-LABORATORIO-DE-DECISAO.md](C:/Users/gabri/jev-trader/docs/JEV-LABORATORIO-DE-DECISAO.md) | LB1-LB27 sombra/estatistica; recommendation permanece fase0; nao lucro/live | seletiva |
| [docs/JEV-WINDOWS.md](C:/Users/gabri/jev-trader/docs/JEV-WINDOWS.md) | Registro historico de decisao/configuracao local; nao prova estado ou custo atuais | seletiva |
| [docs/LIVE-QUALIFICATION.md](C:/Users/gabri/jev-trader/docs/LIVE-QUALIFICATION.md) | Checklist read-only; readyForOwnerReview nao e autorizacao; owner-only live separado | seletiva |
| [docs/LOCALHOST-INTEGRATION-DIAGNOSIS-20261010.md](C:/Users/gabri/jev-trader/docs/LOCALHOST-INTEGRATION-DIAGNOSIS-20261010.md) | Auditoria/diagnostico historico; fatias integradas nao provam entrega inteira | seletiva |
| [docs/okx-alpha-radar-v1/RESEARCH.md](C:/Users/gabri/jev-trader/docs/okx-alpha-radar-v1/RESEARCH.md) | Pesquisa; API publica adequada nao localizada no escopo; acesso pessoal desconhecido | seletiva |
| [docs/okx-defi-v1/AUDITORIA.md](C:/Users/gabri/jev-trader/docs/okx-defi-v1/AUDITORIA.md) | DeFi observacional implementado/revisado por snapshot; APY/capacidade nao autorizam investimento | integral |
| [docs/okx-defi-v1/GUIA.md](C:/Users/gabri/jev-trader/docs/okx-defi-v1/GUIA.md) | DeFi observacional implementado/revisado por snapshot; APY/capacidade nao autorizam investimento | seletiva |
| [docs/okx-defi-v1/PROPOSTA.md](C:/Users/gabri/jev-trader/docs/okx-defi-v1/PROPOSTA.md) | Rascunho historico anterior a SPEC e integracao posterior | seletiva |
| [docs/okx-defi-v1/RESEARCH.md](C:/Users/gabri/jev-trader/docs/okx-defi-v1/RESEARCH.md) | DeFi observacional implementado/revisado por snapshot; APY/capacidade nao autorizam investimento | integral |
| [docs/okx-defi-v1/SPEC.md](C:/Users/gabri/jev-trader/docs/okx-defi-v1/SPEC.md) | D1-D8 DeFi congelados; cabecalho candidato historico, verificacao posterior declara implementado | integral |
| [docs/okx-defi-v1/VERIFICACAO.md](C:/Users/gabri/jev-trader/docs/okx-defi-v1/VERIFICACAO.md) | DeFi observacional implementado/revisado por snapshot; APY/capacidade nao autorizam investimento | integral |
| [docs/OKX-DERIVATIVES-SPEC.md](C:/Users/gabri/jev-trader/docs/OKX-DERIVATIVES-SPEC.md) | Derivativos offline/arithmetic; custos/MMR/acesso desconhecidos impedem elegibilidade | seletiva |
| [docs/okx-derivatives-v1/GUIA.md](C:/Users/gabri/jev-trader/docs/okx-derivatives-v1/GUIA.md) | Derivativos offline/arithmetic; custos/MMR/acesso desconhecidos impedem elegibilidade | seletiva |
| [docs/okx-dex-sdk-units-v1/RESEARCH.md](C:/Users/gabri/jev-trader/docs/okx-dex-sdk-units-v1/RESEARCH.md) | Pesquisa posterior de unidades: outputUnit unknown; nao destrava segunda quote autenticada | integral |
| [docs/okx-dex-units-v3/RESEARCH.md](C:/Users/gabri/jev-trader/docs/okx-dex-units-v3/RESEARCH.md) | Pesquisa posterior de unidades: outputUnit unknown; nao destrava segunda quote autenticada | integral |
| [docs/okx-dex-v2/OKX-DEX-QUOTE-CONTRACT-20261009.md](C:/Users/gabri/jev-trader/docs/okx-dex-v2/OKX-DEX-QUOTE-CONTRACT-20261009.md) | Plano/contrato/evidencia/revisao DEX por snapshot; unidade e qualificacao live nao demonstradas | seletiva |
| [docs/okx-dex-v2/OKX-DEX-V2-GUIDE.md](C:/Users/gabri/jev-trader/docs/okx-dex-v2/OKX-DEX-V2-GUIDE.md) | Guia posterior: max uma quote autenticada raw A-B, outputUnit unknown; demo two-leg synthetic | seletiva |
| [docs/okx-dex-v2/OKX-DEX-V2-PLAN.md](C:/Users/gabri/jev-trader/docs/okx-dex-v2/OKX-DEX-V2-PLAN.md) | Plano/contrato/evidencia/revisao DEX por snapshot; unidade e qualificacao live nao demonstradas | integral |
| [docs/okx-dex-v2/OKX-DEX-V2-SPEC.md](C:/Users/gabri/jev-trader/docs/okx-dex-v2/OKX-DEX-V2-SPEC.md) | D1-D8 frozen historico; barreiras posteriores do guia/reparo nao podem ser removidas | seletiva |
| [docs/okx-dex-v2/OKX-DEX-V4-INDEPENDENT-REVIEW.md](C:/Users/gabri/jev-trader/docs/okx-dex-v2/OKX-DEX-V4-INDEPENDENT-REVIEW.md) | Plano/contrato/evidencia/revisao DEX por snapshot; unidade e qualificacao live nao demonstradas | seletiva |
| [docs/okx-dex-v2/ROOT-47-VERIFICATION.md](C:/Users/gabri/jev-trader/docs/okx-dex-v2/ROOT-47-VERIFICATION.md) | Plano/contrato/evidencia/revisao DEX por snapshot; unidade e qualificacao live nao demonstradas | seletiva |
| [docs/okx-dex-v2/ROOT-INTEGRATION.md](C:/Users/gabri/jev-trader/docs/okx-dex-v2/ROOT-INTEGRATION.md) | Plano/contrato/evidencia/revisao DEX por snapshot; unidade e qualificacao live nao demonstradas | seletiva |
| [docs/okx-dex-v2/SCHEMA-REGRESSION-COMPARISON.md](C:/Users/gabri/jev-trader/docs/okx-dex-v2/SCHEMA-REGRESSION-COMPARISON.md) | Plano/contrato/evidencia/revisao DEX por snapshot; unidade e qualificacao live nao demonstradas | seletiva |
| [docs/OKX-EARN-RESEARCH.md](C:/Users/gabri/jev-trader/docs/OKX-EARN-RESEARCH.md) | Pesquisa/acesso/operacao historicos; elegibilidade pessoal e lucro desconhecidos | seletiva |
| [docs/OKX-ECOSYSTEM-PLAN.md](C:/Users/gabri/jev-trader/docs/OKX-ECOSYSTEM-PLAN.md) | E1-E8 scanner read-only; implementacao/revisoes locais separadas de acesso real | integral |
| [docs/OKX-ECOSYSTEM-SPEC.md](C:/Users/gabri/jev-trader/docs/OKX-ECOSYSTEM-SPEC.md) | E1-E8 scanner read-only; implementacao/revisoes locais separadas de acesso real | integral |
| [docs/okx-ecosystem-v1/DATA-INTEGRATION-AUDIT.md](C:/Users/gabri/jev-trader/docs/okx-ecosystem-v1/DATA-INTEGRATION-AUDIT.md) | Auditoria documental 2026-10-11: clientes existem, adaptacao raw/report/captura ausente | seletiva |
| [docs/okx-ecosystem-v1/GUIA.md](C:/Users/gabri/jev-trader/docs/okx-ecosystem-v1/GUIA.md) | EC1-EC7 especificados/revisados, NAO implementados; okx:ecosystem indisponivel | seletiva |
| [docs/okx-ecosystem-v1/SPEC.md](C:/Users/gabri/jev-trader/docs/okx-ecosystem-v1/SPEC.md) | EC1-EC7 especificados/revisados, NAO implementados; okx:ecosystem indisponivel | integral |
| [docs/okx-ecosystem/GUIA.md](C:/Users/gabri/jev-trader/docs/okx-ecosystem/GUIA.md) | Guia de capacidades distintas implementadas/propostas; nao unificacao EC entregue | seletiva |
| [docs/okx-evidence-v1/AUDITORIA.md](C:/Users/gabri/jev-trader/docs/okx-evidence-v1/AUDITORIA.md) | Modulo join integrado/revisado por snapshot; dados declarados nao autenticados | seletiva |
| [docs/okx-evidence-v1/CYCLE-REVIEW.md](C:/Users/gabri/jev-trader/docs/okx-evidence-v1/CYCLE-REVIEW.md) | Modulo join integrado/revisado por snapshot; dados declarados nao autenticados | seletiva |
| [docs/okx-evidence-v1/GUIA.md](C:/Users/gabri/jev-trader/docs/okx-evidence-v1/GUIA.md) | Modulo join integrado/revisado por snapshot; dados declarados nao autenticados | seletiva |
| [docs/okx-evidence-v1/PROPOSTA.md](C:/Users/gabri/jev-trader/docs/okx-evidence-v1/PROPOSTA.md) | Modulo join integrado/revisado por snapshot; dados declarados nao autenticados | seletiva |
| [docs/okx-evidence-v1/SPEC.md](C:/Users/gabri/jev-trader/docs/okx-evidence-v1/SPEC.md) | E1-E8 join offline; tudo non_qualified; sem ranking financeiro | integral |
| [docs/okx-evidence-v1/VERIFICACAO.md](C:/Users/gabri/jev-trader/docs/okx-evidence-v1/VERIFICACAO.md) | Modulo join integrado/revisado por snapshot; dados declarados nao autenticados | seletiva |
| [docs/okx-exit-security-v1/RESEARCH.md](C:/Users/gabri/jev-trader/docs/okx-exit-security-v1/RESEARCH.md) | Pesquisa; semantica/unidades/enablement de simulation e exit nao qualificadas | seletiva |
| [docs/OKX-HISTORICAL-ARCHIVES.md](C:/Users/gabri/jev-trader/docs/OKX-HISTORICAL-ARCHIVES.md) | Descoberta metadata raw arquivos publicos; sem download, extracao, cobertura ou vantagem | seletiva |
| [docs/OKX-INVESTIGACAO.md](C:/Users/gabri/jev-trader/docs/OKX-INVESTIGACAO.md) | Pesquisa/acesso/operacao historicos; elegibilidade pessoal e lucro desconhecidos | seletiva |
| [docs/okx-leaderboard-v1/RESEARCH.md](C:/Users/gabri/jev-trader/docs/okx-leaderboard-v1/RESEARCH.md) | Pesquisa; relatorio especifico nao iniciado; cliente read existente e cobertura parcial | seletiva |
| [docs/okx-market-v1/OKX-API-IDENTITY-FIX.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-API-IDENTITY-FIX.md) | Evidencia/guia/revisao do scanner por snapshot; leitura real/custos e integracao inteira nao certificados | seletiva |
| [docs/okx-market-v1/OKX-API-TDD-EVIDENCE.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-API-TDD-EVIDENCE.md) | Evidencia/guia/revisao do scanner por snapshot; leitura real/custos e integracao inteira nao certificados | seletiva |
| [docs/okx-market-v1/OKX-CONFIGURATION-READINESS.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-CONFIGURATION-READINESS.md) | Prontidao historica por presenca; nao prova ativacao, conexao, custo ou credencial atual | integral |
| [docs/okx-market-v1/OKX-DEX-V2-CONTRACT-AMENDMENT-DRAFT-20261009.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-DEX-V2-CONTRACT-AMENDMENT-DRAFT-20261009.md) | Emenda documental DRAFT; unidade output desconhecida nao vira segunda perna | integral |
| [docs/okx-market-v1/OKX-ECOSYSTEM-15-WORKSTREAMS-20261009.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-ECOSYSTEM-15-WORKSTREAMS-20261009.md) | Workstreams/advisoria historicos; nao execucao ou autorizacao | seletiva |
| [docs/okx-market-v1/OKX-ECOSYSTEM-V1-BASELINE.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-ECOSYSTEM-V1-BASELINE.md) | Baseline historico anterior a implementacao; nao estado atual | integral |
| [docs/okx-market-v1/OKX-ECOSYSTEM-V1-CONTRACT-ERRATA.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-ECOSYSTEM-V1-CONTRACT-ERRATA.md) | Errata factual advanced-info object; preserva E1-E8 | integral |
| [docs/okx-market-v1/OKX-ECOSYSTEM-V1-SPEC.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-ECOSYSTEM-V1-SPEC.md) | E1-E8 scanner read-only; implementacao/revisoes locais separadas de acesso real | seletiva |
| [docs/okx-market-v1/OKX-INTEGRATION-RESEARCH-20261009.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-INTEGRATION-RESEARCH-20261009.md) | Pesquisa historica; afirmacao antiga de output atomic corrigida por pesquisa/guia posterior | seletiva |
| [docs/okx-market-v1/OKX-LONG-GOAL-CHECKPOINT.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-LONG-GOAL-CHECKPOINT.md) | Evidencia/guia/revisao do scanner por snapshot; leitura real/custos e integracao inteira nao certificados | seletiva |
| [docs/okx-market-v1/OKX-SCANNER-INTEGRATION-VERIFICATION.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-SCANNER-INTEGRATION-VERIFICATION.md) | Evidencia/guia/revisao do scanner por snapshot; leitura real/custos e integracao inteira nao certificados | seletiva |
| [docs/okx-market-v1/OKX-SCANNER-LAYOUT-ADDENDUM.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-SCANNER-LAYOUT-ADDENDUM.md) | Addendum namespace src/okx-market; comportamento/aceitacao preservados | integral |
| [docs/okx-market-v1/OKX-SCANNER-TDD-EVIDENCE.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-SCANNER-TDD-EVIDENCE.md) | Evidencia/guia/revisao do scanner por snapshot; leitura real/custos e integracao inteira nao certificados | seletiva |
| [docs/okx-market-v1/OKX-WEB3-INTEGRATION.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/OKX-WEB3-INTEGRATION.md) | Evidencia/guia/revisao do scanner por snapshot; leitura real/custos e integracao inteira nao certificados | seletiva |
| [docs/okx-market-v1/REVIEW-V3.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/REVIEW-V3.md) | Evidencia/guia/revisao do scanner por snapshot; leitura real/custos e integracao inteira nao certificados | seletiva |
| [docs/okx-market-v1/ROOT-INTEGRATION-REVIEW-CORRECTED.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/ROOT-INTEGRATION-REVIEW-CORRECTED.md) | Revisao corrigida de snapshot prevalece sobre relatorio original; nao live | seletiva |
| [docs/okx-market-v1/ROOT-INTEGRATION-REVIEW.md](C:/Users/gabri/jev-trader/docs/okx-market-v1/ROOT-INTEGRATION-REVIEW.md) | Evidencia/guia/revisao do scanner por snapshot; leitura real/custos e integracao inteira nao certificados | seletiva |
| [docs/OKX-ONCHAINOS-DADOS-SPEC.md](C:/Users/gabri/jev-trader/docs/OKX-ONCHAINOS-DADOS-SPEC.md) | D1-D27 modulos dados read-only; autenticacao/RPS/tier/regiao nao qualificados | seletiva |
| [docs/OKX-OPERADOR-JEV.md](C:/Users/gabri/jev-trader/docs/OKX-OPERADOR-JEV.md) | Guia operador parcialmente superado; realized por saldo e quote trustflag contradizem auditorias atuais | seletiva |
| [docs/okx-portfolio-v1/CAPITAL-BOUNDARY-AUDIT.md](C:/Users/gabri/jev-trader/docs/okx-portfolio-v1/CAPITAL-BOUNDARY-AUDIT.md) | Auditoria documental de capital; realized null, reconciliation_required; sem nova implementacao | seletiva |
| [docs/okx-portfolio-v1/CONTRACT-COMPARISON.md](C:/Users/gabri/jev-trader/docs/okx-portfolio-v1/CONTRACT-COMPARISON.md) | Pesquisa/comparacao de alternativas V/T; nenhum contrato escolhido/implementado aqui | seletiva |
| [docs/okx-portfolio-v1/RESEARCH.md](C:/Users/gabri/jev-trader/docs/okx-portfolio-v1/RESEARCH.md) | Pesquisa/comparacao de alternativas V/T; nenhum contrato escolhido/implementado aqui | seletiva |
| [docs/okx-portfolio-v1/VALUATION-DIAGNOSTICS-SPEC.md](C:/Users/gabri/jev-trader/docs/okx-portfolio-v1/VALUATION-DIAGNOSTICS-SPEC.md) | WVD1-WVD6 SPEC documental NAO implementada; todo valor financeiro derivado null | seletiva |
| [docs/OKX-PROPOSAL.md](C:/Users/gabri/jev-trader/docs/OKX-PROPOSAL.md) | Historico/proposta de origem; alcance atual e gates posteriores prevalecem | integral |
| [docs/okx-rewards-v1/RESEARCH.md](C:/Users/gabri/jev-trader/docs/okx-rewards-v1/RESEARCH.md) | Pesquisa; API publica adequada nao localizada no escopo; acesso pessoal desconhecido | integral |
| [docs/okx-signals-v1/AUDITORIA.md](C:/Users/gabri/jev-trader/docs/okx-signals-v1/AUDITORIA.md) | Modulo Signals integrado/testado em snapshot; sem certificacao authenticated/live/recomendacao | seletiva |
| [docs/okx-signals-v1/GUIA.md](C:/Users/gabri/jev-trader/docs/okx-signals-v1/GUIA.md) | Modulo Signals integrado/testado em snapshot; sem certificacao authenticated/live/recomendacao | seletiva |
| [docs/okx-signals-v1/SPEC.md](C:/Users/gabri/jev-trader/docs/okx-signals-v1/SPEC.md) | S1-S8 offline/explicit limited live; origem/custo/retorno desconhecidos | integral |
| [docs/okx-signals-v1/VERIFICACAO.md](C:/Users/gabri/jev-trader/docs/okx-signals-v1/VERIFICACAO.md) | Modulo Signals integrado/testado em snapshot; sem certificacao authenticated/live/recomendacao | seletiva |
| [docs/OKX-SPEC.md](C:/Users/gabri/jev-trader/docs/OKX-SPEC.md) | Contrato Wallet O/W/A read-only; duas cadeias e cobertura finita; provider real nao certificado | integral |
| [docs/OPERACAO-BRASIL.md](C:/Users/gabri/jev-trader/docs/OPERACAO-BRASIL.md) | Pesquisa/acesso/operacao historicos; elegibilidade pessoal e lucro desconhecidos | seletiva |
| [docs/OPERATOR-DECISION-BOUNDARY.md](C:/Users/gabri/jev-trader/docs/OPERATOR-DECISION-BOUNDARY.md) | Contrato Jev tipado elegivel/hold; prazo e custo desconhecido separados | seletiva |
| [docs/OPPORTUNITY-ARCHITECTURE.md](C:/Users/gabri/jev-trader/docs/OPPORTUNITY-ARCHITECTURE.md) | Arquitetura/direcao; proposicoes e partes superadas por codigo/evidencia posterior | integral |
| [docs/PAPER-CAPITAL.md](C:/Users/gabri/jev-trader/docs/PAPER-CAPITAL.md) | Capital/supervisor synthetic; persistencia nao prova wallet recon ou funcionamento 24h | seletiva |
| [docs/PAPER-SUPERVISOR.md](C:/Users/gabri/jev-trader/docs/PAPER-SUPERVISOR.md) | Capital/supervisor synthetic; persistencia nao prova wallet recon ou funcionamento 24h | seletiva |
| [docs/POLITICA-DE-LIMITES.md](C:/Users/gabri/jev-trader/docs/POLITICA-DE-LIMITES.md) | L1-L27 modulo puro; fase0 default; ok nao concede permissao | seletiva |
| [docs/PROFIT-SPEC.md](C:/Users/gabri/jev-trader/docs/PROFIT-SPEC.md) | Aceitacao base congelada; prioridade expressa sobre demo historico | integral |
| [docs/PUBLIC-MARKET-CAPTURE.md](C:/Users/gabri/jev-trader/docs/PUBLIC-MARKET-CAPTURE.md) | Captura offline; adaptador Node HTTPS/WS runtime_capability_unqualified recusa antes de I/O | seletiva |
| [docs/READINESS-SPEC.md](C:/Users/gabri/jev-trader/docs/READINESS-SPEC.md) | Aceitacao base congelada; prioridade expressa sobre demo historico | integral |
| [docs/RELEASE-v0.0.2.md](C:/Users/gabri/jev-trader/docs/RELEASE-v0.0.2.md) | Evidencia historica de paper/release; replay nao e rerun/OOS/24h/live | seletiva |
| [docs/research/R1-onchain-os-capacidades.md](C:/Users/gabri/jev-trader/docs/research/R1-onchain-os-capacidades.md) | Pesquisa primaria historica de capacidades/permissoes/estrategias; nao live ou retorno comprovado | seletiva |
| [docs/research/R2-carteira-permissoes-delegacao.md](C:/Users/gabri/jev-trader/docs/research/R2-carteira-permissoes-delegacao.md) | Pesquisa primaria historica de capacidades/permissoes/estrategias; nao live ou retorno comprovado | seletiva |
| [docs/research/R3-estrategias-e-alavancagem.md](C:/Users/gabri/jev-trader/docs/research/R3-estrategias-e-alavancagem.md) | Pesquisa primaria historica de capacidades/permissoes/estrategias; nao live ou retorno comprovado | seletiva |
| [docs/research/R4-revisao-seguranca-operador-20261010.md](C:/Users/gabri/jev-trader/docs/research/R4-revisao-seguranca-operador-20261010.md) | Revisao seguranca: limites/calldata/ledger incompletos, manter dry-run | integral |
| [docs/research/R5-revisao-operador-codigo-final-20261010.md](C:/Users/gabri/jev-trader/docs/research/R5-revisao-operador-codigo-final-20261010.md) | Revisao veto estagio3: F1-F8; aprovacoes posteriores somente por delta | seletiva |
| [docs/research/R6-onchain-os-inventario.md](C:/Users/gabri/jev-trader/docs/research/R6-onchain-os-inventario.md) | Inventario primario historico 444 capacidades/18familias; capacidade nao significa acesso ou implementacao | seletiva |
| [docs/research/R7-okx-agentic-wallet.md](C:/Users/gabri/jev-trader/docs/research/R7-okx-agentic-wallet.md) | Pesquisa Agentic Wallet: custody/rate/chain/Brasil/enforcement desconhecidos, sem ativacao | seletiva |
| [docs/research/R8-re-revisao-operador-f1-f8-20261011.md](C:/Users/gabri/jev-trader/docs/research/R8-re-revisao-operador-f1-f8-20261011.md) | Re-revisao veto estagio3; F1 PASS, F2-F8 PARTIAL; achados devem ser rechecados no hash atual | seletiva |
| [docs/research/R9-system-one-alavancagem-onchainos.md](C:/Users/gabri/jev-trader/docs/research/R9-system-one-alavancagem-onchainos.md) | Pesquisa System One/leverage: dados nao sao executor margin; fases com gates separados | seletiva |
| [docs/RISCO-E-BACKTEST.md](C:/Users/gabri/jev-trader/docs/RISCO-E-BACKTEST.md) | Evidencia historica de paper/release; replay nao e rerun/OOS/24h/live | seletiva |
| [docs/superpowers/plans/2026-10-09-okx-readonly.md](C:/Users/gabri/jev-trader/docs/superpowers/plans/2026-10-09-okx-readonly.md) | Plano historico OKX readonly; contratos/gates e estado posteriores prevalecem | seletiva |
| [docs/SYSTEM-ONE.md](C:/Users/gabri/jev-trader/docs/SYSTEM-ONE.md) | Laco mock/public/shadow implementado/documentado; capital configurado; dry_run/blocked | integral |
| [docs/VERIFICACAO.md](C:/Users/gabri/jev-trader/docs/VERIFICACAO.md) | Evidencia historica de paper/release; replay nao e rerun/OOS/24h/live | seletiva |
| [docs/WALLET-FINITE-VALUATION.md](C:/Users/gabri/jev-trader/docs/WALLET-FINITE-VALUATION.md) | Barreira finitude/unknown/null; subtotal nao e patrimonio completo | integral |
| [docs/WALLET-OPPORTUNITIES-SPEC.md](C:/Users/gabri/jev-trader/docs/WALLET-OPPORTUNITIES-SPEC.md) | Contrato Wallet O/W/A read-only; duas cadeias e cobertura finita; provider real nao certificado | integral |
| [docs/wallet-opportunity-research.md](C:/Users/gabri/jev-trader/docs/wallet-opportunity-research.md) | Pesquisa primaria historica; nao demonstra permissao, custo, saldo ou unidades totais | seletiva |
| [docs/WALLET-TRANSACTION-PREFLIGHT.md](C:/Users/gabri/jev-trader/docs/WALLET-TRANSACTION-PREFLIGHT.md) | Contrato preflight read-only implementado/documentado; executionQualified false | integral |
| [docs/WEB3-INTEGRATION-DELIVERY-SPEC.md](C:/Users/gabri/jev-trader/docs/WEB3-INTEGRATION-DELIVERY-SPEC.md) | I1-I7 congelados; parent incompleto; sem autorizacao financeira/publicacao | integral |
| [docs/WEB3-INTEGRATION-READINESS.md](C:/Users/gabri/jev-trader/docs/WEB3-INTEGRATION-READINESS.md) | Readiness/remediacoes/revisoes de snapshots; cadeia autonoma nao demonstrada | seletiva |
| [docs/WEB3-INTEGRATION-REVIEW-CYCLE-2.md](C:/Users/gabri/jev-trader/docs/WEB3-INTEGRATION-REVIEW-CYCLE-2.md) | Readiness/remediacoes/revisoes de snapshots; cadeia autonoma nao demonstrada | integral |
| [docs/WEB3-INTEGRATION-REVIEW-FOLLOWUP.md](C:/Users/gabri/jev-trader/docs/WEB3-INTEGRATION-REVIEW-FOLLOWUP.md) | Readiness/remediacoes/revisoes de snapshots; cadeia autonoma nao demonstrada | integral |
| [docs/WEB3-INTEGRATION-REVIEW-REMEDIATION.md](C:/Users/gabri/jev-trader/docs/WEB3-INTEGRATION-REVIEW-REMEDIATION.md) | Readiness/remediacoes/revisoes de snapshots; cadeia autonoma nao demonstrada | integral |
| [IDEA.md](C:/Users/gabri/jev-trader/IDEA.md) | Historico/proposta de origem; alcance atual e gates posteriores prevalecem | integral |
| [README.md](C:/Users/gabri/jev-trader/README.md) | Mapa atual declarado de comandos e limites; testes/live nao reexecutados nesta pesquisa | integral |
| [SPEC.md](C:/Users/gabri/jev-trader/SPEC.md) | Historico/proposta de origem; alcance atual e gates posteriores prevalecem | integral |
| [web/AGENTS.md](C:/Users/gabri/jev-trader/web/AGENTS.md) | Contrato local de contribuicao/instrucoes; nao concede publicacao ou fundos | integral |
| [web/CLAUDE.md](C:/Users/gabri/jev-trader/web/CLAUDE.md) | Contrato local de contribuicao/instrucoes; nao concede publicacao ou fundos | integral |
| [web/OKX-WALLET.md](C:/Users/gabri/jev-trader/web/OKX-WALLET.md) | Guia Wallet finita/provider/cobertura; nao saldo Exchange ou patrimonio total | seletiva |
| [web/README.md](C:/Users/gabri/jev-trader/web/README.md) | Guia frontend; instrucoes locais sao contexto, nao prova de servico observado | seletiva |

## Hashes do recorte decisivo

SHA-256 dos bytes locais capturados no final desta pesquisa; todas as demais fontes constam no JSON.

| Fonte | SHA-256 |
| --- | --- |
| README.md | `dfca4da978f78402ed3af4f74207653070d9479489c6c1eaaaf6385ac19c2ff7` |
| docs/GOAL-INONU-TRADER.md | `968b888890679baa5b0d2d358c36d5bb7fc8ecce690e455fdcddf6da891a35fc` |
| docs/READINESS-SPEC.md | `a21f516ff056656db1b4e6579e10f1c38184b0f26f4aecca4886cae4b623af41` |
| docs/PROFIT-SPEC.md | `268e005d5891a53b7f540faa2c34da3fef440f207e2fefcac6ae113cd5bb52a8` |
| docs/CENTRAL-JEV-ACCEPTANCE.md | `20e1558da58ceae78332020f1e4f84277eacdb694748d28b9ea599dc30808054` |
| docs/CENTRAL-JEV-CHECKPOINT.md | `b2a075f540465a34c1026b8c1bfe6fea881a3731d4b2b2373be1ade5eef12a59` |
| docs/WEB3-INTEGRATION-DELIVERY-SPEC.md | `dce6610f5fdaffbe98cadd2de35f1bf84cd8a274566657e3a5d163a1d9431515` |
| docs/okx-ecosystem-v1/SPEC.md | `11b0d190dab6fc68d7f884d91ca925626e1c086f85e51f93256e557921a15401` |
| docs/okx-ecosystem-v1/GUIA.md | `f7bbf5c1d2173134fc891b81f1d5b488aef8ff88f6bd5d3d7d3939bf4eeb962c` |
| docs/okx-ecosystem-v1/DATA-INTEGRATION-AUDIT.md | `6eaf37d2775371f954d4bf9261dbb5d148229e9e4f4c75e3d484b5b255b61785` |
| docs/okx-portfolio-v1/VALUATION-DIAGNOSTICS-SPEC.md | `abc0628c97031e7bf203385ece7eaacaa3a344f0980603a4936042ff8df8076a` |
| docs/okx-portfolio-v1/CAPITAL-BOUNDARY-AUDIT.md | `aecb9ee00872aefcac6eddd783d3c205481e45315a376a9ecbe0695bab12b0ac` |
| docs/PUBLIC-MARKET-CAPTURE.md | `dd8e213c404042bdefa5ec28513095e51e491c86870ce2f3d3a810ea8bf3136c` |
| docs/research/R8-re-revisao-operador-f1-f8-20261011.md | `1b128ed5f136d4bd5d0b94f5fbf6ae61cfcdd582f0c86ed175d245df0b45de9f` |

Entrega de pesquisa concluida para integracao e revisao independente. Nenhuma recomendacao acima certifica implementacao, acesso, ativacao, lucro, custo ou autorizacao financeira.

Atualização do fechamento: o inventário final identificou também `CENTRAL-JEV-REMOTE-AUDIT-2ed0324.md` e `CENTRAL-JEV-REMOTE-VERIFICATION-2ed0324.md`, ambos lidos integralmente. A auditoria reconcilia 35 caminhos remotos por destino/comportamento, sem restaurar componentes substituídos; a verificação reutiliza resultados somente por identidade dos inputs, deixa revisão de cobertura pendente e mantém C3/C6 abertos (linhas 14–16). Assim, o total final é 135 Markdown. Nenhum lease foi alterado.
