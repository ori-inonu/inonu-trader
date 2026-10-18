# Auditoria de UI, UX e performance

Baseline Git: `00a593bcabe25dbb6d83795268533551098f645b`. A análise considera os bytes do worktree, que contém mudanças preexistentes e concorrentes, e não assume que HEAD ou o deploy sejam equivalentes. Os hashes são observações datadas em [inventory.json](inventory.json) e nos relatórios de pesquisa.

## Superfícies e método

| Superfície | Evidência | O que permite concluir |
|---|---|---|
| Público Jev/Kuru | Navegação de leitura em https://jev-trader.vercel.app, HTTP 200, 13/10 às 16:19 UTC, 1440x900 e 390x844 | Layout e texto observados naquela sessão; nenhum teste de negociação |
| Mesa/Inonu local | Cópia isolada de web/src e configuração; Next dev com webpack; sem .env; backend indisponível em 127.0.0.1:3967; HTTP 200, 16:27 UTC | Composição atual e DOM em estados sem dados; não é baseline de performance ou validação de feeds ativos |
| Rastreador local | Mesma cópia, /rastreador em 390x844 | Ordem dos controles e estado inicial; não mede o universo real de ativos |
| Código local | Pesquisa de componentes, hooks, transportes e testes existentes | Mecanismos e gatilhos por inspeção, separados de reprodução interativa |
| Capturas de SDD anteriores | grafico-jev e inonu-desktop-v1/evidence | História do design; não certificam layout atual |

A raiz local monta MesaView. /console monta RealPipeline/PublicMarket e mantém legado em details. A página pública capturada mostra outro layout. Sem manifesto de deploy não se atribui um defeito público a uma revisão local específica.

## Achados priorizados

P0 significa informação financeira potencialmente ambígua que merece prioridade antes de embelezar a interface. Não significa que uma perda financeira ou bug de execução foi demonstrado. P1 cobre correção de interação e integridade de estado; P2 cobre organização e hipóteses que dependem de medição.

| ID | Prioridade e certeza | Evidência e impacto | Tratamento |
|---|---|---|---|
| C01 | P0, display público confirmado | A captura desktop mostra Buying/confiança 94% junto de BUY 6% e SELL 94%, sem associação visível entre eventos. Pode ser atualização de eventos diferentes; não inferir decisão financeira errada. | R03/T01: vincular lado, probabilidades, bloco e horário ao mesmo evento; dado incompleto fica desconhecido. |
| C02 | P1, visual público confirmado | Em 390px, Missed the block e o preço se sobrepõem. | R06/T05: regiões distintas para preço e decisão; regressão mobile da superfície correspondente após identificar o deploy. |
| C03 | P0, limite público confirmado | Público exibe dry run, mock e fills sim. A conexão do feed e os números exibidos não provam os trades reais exigidos pela mensagem do demo. | R01/R12/T01: modo e evidência honestos. Execução real é dependência operacional fora deste plano de UI. |
| C04 | P1, DOM local reproduzido | dock-tab-diario/radar/fluxo/carteira/mercado e dock-body-diario repetidos em desktop e mobile. Relações ARIA ficam ambíguas. | R09/T03: namespace por instância e teste do DOM completo, preservando montagem condicional dos corpos. |
| C05 | P1, mecanismo na fonte | AssetPicker.tsx:242-268 intercepta Enter no ancestral e pode escolher highlighted quando o foco está em mercado, Buscar ou outra opção. | R07/T02: atalhos restritos ao campo/lista; controles nativos mantêm comportamento. |
| C06 | P1, delta revalidado na fonte | A lacuna de teclado onchain foi corrigida: OnchainBody.tsx:170-179 agora aceita Enter/Space com guard locked. RastreadorView.tsx:172-178 ainda intercepta Enter de sort/pin quando há linha selecionada. | R08/T02: verificar a correção onchain já presente e restringir o atalho CEX aos alvos apropriados. Interação runtime ainda não exercitada após o delta. |
| C07 | P1, mecanismo na fonte | useOnchainResource passa signal, useOnchainCandles:149 ignora; client:331-340 não o entrega ao fetch. Suprimir resposta não cancela transporte. | R14/T04: AbortSignal opcional ponta a ponta, sem promessa de cancelar processamento/faturamento do provedor. |
| C08 | P1, risco demonstrável na fonte | operator-center.ts:88-120 permite A lento terminar depois de B e sobrescrever estado, ou URL anterior escrever no contexto novo. | R03/R14/T04: geração/origem, resposta monotônica e cancelamento; reproduzir com promises controladas. |
| C09 | P1, risco demonstrável na fonte | SettingsView:111-139 limpa draft depois de await; alteração B durante save A pode ser apagada. Ausência de pending nos botões permite concorrência. | R15/T06: proteger rascunho e ações pendentes usando cliente fake, sem segredos. |
| C10 | P2, visual local confirmado, impacto a validar | Inonu mobile em estado vazio ocupa quase toda altura com espaço livre e repetição de Indisponivel. Rastreador exibe pergunta/filtros antes da lista. | R04/R06/R10/T05/T07: estado compacto e filtros secundários recolhíveis, sem esconder causa ou fonte. |
| C11 | P2, divergência documental confirmada | MesaView mantém FlowGauge/DerivativesStrip à direita; info-diet destina Fluxo/Radar. Snapshot local confirma esses painéis permanentes. | R05/R19/T00/T05: reconciliar e mover detalhes para abas sem remover dados. Reserva Z8/Z2 é gate real. |
| C12 | P0, estado local observado | Ativos mostra Ao vivo enquanto preços são indisponíveis e Fontes informa 0 de 5 ao vivo. Pode ser status genérico de painel, ainda ambíguo para usuário. | R01/R04/T01: badge derivado da fonte e frescor próprios, independente do transporte global. |
| H01 | P2, hipótese, sem profiling | Snapshot inteiro de useDesk, objeto jev novo por render, geometria calculada em duas etapas e getComputedStyle por desenho podem elevar custo. RAF não é um loop infinito. | R16/R17/T08/T09: medir primeiro; otimização específica só com custo demonstrado. |
| H02 | P2, hipótese, sem profiling | Alguns clocks/polls não verificam visibility; overlay e rastreador já têm mecanismos de pausa. | R16/R17/T08/T09: medir hidden/resume e separar publicação visual de ingestão/executor. |

Capturas: [público desktop](public-1440x900.png), [público mobile](public-390x844.png), [Mesa desktop](local-1440x900.png), [Mesa mobile](local-390x844.png), [Rastreador mobile](local-tracker-390x844.png). Dados da captura pública são observações transitórias, não fixtures ou recomendação de negociação.

## O que já existe e deve ser preservado

PriceChart já oferece teclado, OHLCV em HTML e resumo acessível; não é correto tratar o canvas como totalmente inacessível. OnchainResource e overlay já têm guards de visibilidade, orçamento/intent e geração; a Mesa evita montar corpos onchain inativos apesar das instâncias responsivas. Buffers são limitados, ResizeObserver tem cleanup, Doctor tem busy/alive guard e não há polling automático confirmado nele. O plano corrige lacunas, sem reescrever esses mecanismos ou criar novas consultas Jev implícitas.

## Documentação, cobertura e conflitos

O inventário percorreu todos os 1.091 arquivos regulares não ocultos de docs. O catálogo anterior tinha 992 arquivos e 413 documentos; não é prova de conteúdo live. Leitura semântica foi dirigida aos contratos que governam frontend, estados financeiros, carteira, dados e ownership. Não se declara leitura integral dos 477 Markdown, dos anexos binários, logs e documentos históricos. [docs-research.md](docs-research.md) e [frontend-research.md](frontend-research.md) registram caminhos, trechos, hashes e cobertura exata dos pesquisadores. O coordenador leu README/índices/catálogo, concepts/interface-e-central, INONU-DESIGN-SPEC, tarefas e contratos pertinentes de Mesa, gráfico, configuração, desktop, wallet e relatório mobile. Os demais arquivos entram no inventário, não como requisitos implicitamente aprovados.

| Conflito ou dependência | Decisão de planejamento |
|---|---|
| Desktop SPEC DOC-3/AC-DOC-2 fala em Ecossistema; info-diet remove a aba e distribui status em Doctor/Fontes | Manter as cinco abas atuais e acesso a estado/fontes. T00 deve registrar resolução identificada e alinhamento com responsável antes de mudar aceitação antiga. Nenhum requisito congelado é silenciosamente apagado. |
| Dieta pede até 12 linhas; conceito diz que teste de registry cobre intenção, não a totalidade; raw/onchain usam altura | Definir região mensurável e prova por captura/DOM. Não aceitar registry como certificação do layout inteiro. |
| G1 exige área útil >=900x420 em 1600x900 e >=680x320 em 1280x720; relatórios antigos mostram altura 383/404 | Medir largura e altura úteis atuais nas duas viewports. História não é exceção ao contrato. |
| G9 limita dock a 120px, mas DOC-2 posterior requer altura inicial 26%, mínimo 190px e máximo 55% | Conflito ainda aberto. T00 exige resolução rastreável antes de fixar geometria; não escolher silenciosamente uma dimensão. |
| T1.3/export e evidências de desktop são parciais ou históricas | Testar as quatro rotas instaladas requeridas, sem /console; não anunciar cobertura universal por arquivo de configuração. |
| Canonical wallet Z1-Z8, mobile Z2, shared UI Z8; Fase 2/onchain e desktop têm writers próprios | Nenhuma transferência de ownership presumida. T00 revalida reservas/hashes por slice; dependência adiada não impede arquivos exclusivos livres. |
| Docs e fonte podem mudar durante a análise | Revalidar os hashes antes da implementação. Mudança invalida a parte afetada do plano até reconciliar. |

## Métricas e fontes externas

O alvo futuro de campo é LCP <=2,5s, INP <=200ms e CLS <=0,1 no percentil 75, separados por mobile/desktop. Lighthouse/TBT e traces locais são diagnóstico, não substituem INP de usuários reais. Não existe baseline atual nesta auditoria. [Web.dev: Core Web Vitals](https://web.dev/articles/vitals).

Verificação de acessibilidade deve incluir teclado, foco, nome/estado dos controles, reflow/zoom, contraste e relações tab/panel. Usar alvos de 44px como padrão de produto e verificar o mínimo WCAG 2.2 AA de 24px ou exceções válidas. Não afirmar conformidade integral sem auditoria. [W3C: tamanho mínimo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [W3C: tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).

## Revalidação concorrente

As capturas C04/C10/C12 são das 16:27 UTC; os mecanismos de fonte foram revalidados na cópia fixa das 16:44 UTC. Houve mudanças de outras sessões em 35 arquivos de docs/web e 14 adições documentais, sem arquivos removidos. [source-revalidation.json](source-revalidation.json) preserva o delta e o inventário original. [frontend-revalidation.md](frontend-revalidation.md) confirma os mecanismos C04/C05/C07/C08/C09/C11 nos bytes novos, corrige C06 e limita o cancelamento ausente ao cliente onchain: InonuClient já passa AbortSignal. Capturas locais não foram refeitas após essas mudanças.

[docs-revalidation.md](docs-revalidation.md) distingue contratos fixos, fontes originais concorrentes, implementação relatada e proposta futura. O rastreador onchain básico, a escada consultiva e o draft Aceitar token já têm implementação relatada por outra sessão; o plano preserva essas entregas e verifica lacunas, sem recriá-las. A confirmação atual de modelConfigured=true invalida a premissa histórica de chave ausente; os previews deste chat foram isolados sem ambiente e não demonstram estado atual de credenciais. A consulta Inonu continua somente por gesto explícito.

CHECKPOINT do desktop relata testes/typecheck/build vermelhos após mudanças concorrentes, e correções de revisão ainda sem nova revisão independente. São relatos daquela integração, não resultados executados nesta auditoria nem falhas atribuídas ao novo plano. T00 requer triagem pelo dono e nova captura antes da próxima slice afetada.

Mesa de decisão, Inteligência de decisão e Quant são entregas concorrentes com reservas próprias. Gráfico ampliável/carteira/Settings, Veredito, perfil de risco, glossário, oportunidades e recorder já estão especificados ou em execução por seus donos. Não entram como implementação paralela deste plano. Quant offline não prova lucro, precisão Jev/ML ou performance frontend; a UI quant é proposta e sua revisão independente está pendente. PORT-2 versus tamanho/confiança permanece conflito de integração: não apresentar número de aparência confiável sem perfil escolhido, cálculo rastreável e gate de validação aplicável.

Nota de precisão documental: a fonte primária usa os IDs DOC-3/AC-DOC-2 no SPEC desktop e DOC-2 no SPEC config-onchain-smartmoney. Os relatórios de pesquisa preservam a grafia abreviada da leitura anterior; o plano usa os IDs exatos. DOC-2 fixa altura inicial 26%, mínimo 190px e máximo 55%; 26% não é máximo. G1 usa 1280x720, além de 1600x900.
