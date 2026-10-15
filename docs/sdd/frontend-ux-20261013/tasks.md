# Plano de implementação finito

Status: pronto para planejamento de slices, sem implementação de produto nesta entrega. Objetivo autorizado deste chat foi auditoria/especificação/plano. As tasks abaixo são propostas, não execução aprovada de operações financeiras ou publicação. Leia este arquivo primeiro e revalide fontes/ownership por slice.

## Gates e ordem

T00 precede toda alteração. Primeira onda: T01-T04, clareza e acessibilidade/integridade. T06 pode ocorrer em arquivo exclusivo após T00, sem depender do redesign. Segunda onda: T05/T07/T10. Medição T08 pode ocorrer em paralelo a arquivos livres, mas o baseline usado por T09 deve ser tirado após a onda funcional correspondente. T09 é condicional e pode terminar sem mudança de código. T11 integra e verifica. Cada task tem critério próprio; cumprir uma não prova toda UI.

Arquivos citados são candidatos de responsabilidade, não reservas automáticas. Desk/** e lib/mesa/** são Z8; mobile é Z2 no plano da carteira; client onchain/settings têm trabalho concorrente. Integrador é o único escritor de compartilhados após autorização de ownership vigente. Cada writer usa cópia/worktree isolado e arquivos exclusivos. Não tocar backend/executor, carteira canônica, fontes de segredos, package.json ou specs de outras sessões por conveniência.

| Task | Prioridade | Requisitos | Depende | Condição de conclusão |
|---|---|---|---|---|
| T00 | Gate | R19 | Nenhuma | Baseline atual, superfícies, conflitos e ownership registrados |
| T01 | P0 | R01,R02,R03,R04 | T00 | Estados e valores/eventos coerentes, sem claims de trade inferidos |
| T02 | P1 | R07,R08,R13 | T00 | Teclado real de picker/tabelas passa sem consulta implícita |
| T03 | P1 | R09 | T00 | IDs únicos e relações ARIA corretas em DOM responsivo completo |
| T04 | P1 | R03,R14 | T00 | Cancelamento e publicação monotônica sob atraso controlado |
| T05 | P1/P2 | R04,R05,R06,R11,R18 | T00,T01,T03 | Layout/dieta/estados mobile sem sobreposição, chart/keyboard preservados |
| T06 | P1 | R13,R15 | T00 | Pending e rascunho preservados com cliente fake |
| T07 | P2 | R06,R08,R10 | T00,T02 | Descoberta/filtros mobile sem perder contexto ou interação |
| T08 | P2 | R16 | T00 | Baseline produção e protocolo pareado, sem números inventados |
| T09 | Condicional | R17 | T08 + wave medida | Gargalo elegível tratado e ganho/gates medidos, ou hipótese encerrada |
| T10 | P0/P1 | R02,R11,R12,R13,R18 | T01 + slices afetados | Compatibilidade carteira/gráfico e a11y das telas alteradas |
| T11 | Gate final | R19,R20 | T01-T10 elegíveis | Verificação pertinente e revisão independente com evidência |

## Slices executáveis

### T00: baseline, verdade e ownership

Responsável: integrador. Saída: checkpoint do slice, hashes, arquivos exclusivos e tabela de conflitos resolvidos/dependências. Ler primeiro carteira-evidencia/tasks.md, desktop TASKS/OWNERSHIP e SPEC/info-diet; conferir git status por caminho nos worktrees pertinentes. Revalidar inventory/reports sem substituir fontes atuais por histórico. Mapear /, /console, /rastreador, /configuracoes e /doctor; obter identidade do deploy público quando disponível, caso contrário manter mudança pública como dependência e seguir UI local elegível.

Reconciliar DOC-3/AC-DOC-2 versus Ecossistema removido, dieta de 12 linhas, G1 completo (área útil >=900x420 em 1600x900; >=680x320 em 1280x720) e G9 <=120px versus DOC-2 altura inicial 26%/mínimo 190px/máximo 55% do dock, com IDs e verificação. Jev pode escolher alternativas técnicas sob delegação, nunca fornecer fatos de deploy/acesso ou apagar critério independente. Não editar specs canônicos sem escopo próprio. Registro de decisão/proposta não transfere lease. Fechar T00 por slice livre, declarando dependências dos demais.

Ler [docs-revalidation.md](docs-revalidation.md) e as SPECs Mesa de decisão/Inteligência de decisão atuais. MesaView/Settings/carteira/ask/vault/quant e novos Veredito/glossário/recorder têm donos próprios; não duplicar essas entregas. Triar os testes/typecheck/build concorrentes relatados como vermelhos pelo dono antes de alterar a slice afetada; não exigir corrigir backend alheio para fechar parte independente livre. Nova captura/hashes e status de modelo são obrigatórios: chave ausente histórica não é guard de segurança. Preservar consultas somente por gesto, mesmo com modelo configurado.

### T01: apresentação financeira e estados honestos

Responsabilidade candidata: `web/src/components/Desk/{MesaView.tsx,JevStage.tsx,panels/Watchlist.tsx,panels/DecisionCard.tsx}`, primitivas puras existentes de apresentação sob `web/src/lib/mesa/`, testes de mesa/truth/render. Público: candidatos JevCore/DecisionCenter/FlowChart somente após mapear a fonte do deploy. Integrador resolve os arquivos compartilhados.

Passos: escrever regressões para Ao vivo sem preços, sim/meta ausente/stale, zero versus ausente, evento com BUY/SELL e payload incompleto; falha deve mostrar o comportamento errado, não só snapshot novo. Implementar mapeamento mínimo sem fonte de verdade nova. Acrescentar fonte/mode/idade e event identity na apresentação. Verificar lado/probabilidade/bloco e unidade em desktop/mobile. Sem event identity comprovável, mostrar desconhecido e registrar dependência do contrato, não criar ID artificial.

Fim: R01-R04 em estados controlados, revisão visual e sem alteração executor. Biblioteca financeira canônica é consumida, não reescrita.

### T02: teclado da busca e das tabelas

Responsabilidade candidata: `web/src/components/Desk/panels/AssetPicker.tsx`, `web/src/components/Rastreador/{RastreadorView.tsx,OnchainBody.tsx}`, testes `web/src/lib/desk/ui/panels-render.test.tsx` e `web/src/lib/rastreador/{screen-render.test.tsx,onchain-body-render.test.tsx}`; novo teste comportamental local quando SSR não exercitar eventos.

Passos: criar harness com dois ativos e fetch fake; reproduzir Enter em Perp/Spot/Buscar, opção focada diferente de highlighted, sort/pin/checkbox com selectedId. OnchainBody já aceita Enter/Space no delta: verificar seleção/desmarcação, locked e foco como regressão antes de escrever código; não recriar a correção. Fazer controles nativos funcionarem e restringir handlers ancestrais ainda afetados. Verificar Escape/foco e setas no escopo. Executar teclado real em navegador da cópia isolada; contar requests e confirmar zero modelo/wallet por seleção. SSR sozinho não fecha o slice.

Fim: R07/R08/R13 exercitados. Nenhuma migração combobox/grid por estética.

### T03: dock acessível sem colisão

Responsabilidade candidata: `web/src/components/Desk/Dock/DockPanel.tsx`, testes `web/src/lib/desk/ui/{dock-render.test.tsx,dock-composite-render.test.tsx}`. MesaView só pelo integrador se um prefixo explícito precisar ser passado.

Passos: regressão DOM completo das três instâncias simultâneas; escolher namespace estável por instância e corrigir tab/panel. Exercitar roving tabStop/setas/Home/End e resize. Verificar montagem condicional e contagem de consultas onchain, sem mover todo corpo por efeito da correção.

Fim: R09 a 1600/1280/820/390 e após resize, relações locais sem duplicação.

### T04: transporte cancelável e estado monotônico

Responsabilidade candidata: `web/src/lib/onchain/{client.ts,useOnchainResource.ts,useOnchainCandles.ts}` e respectivos testes; callers de AssetPicker somente via integrador; `web/src/lib/operator-center.ts` e `operator-center.test.ts`. Não editar src/operator ou gateways de outras sessões.

Passos: promises controladas A/B e URL antiga/nova, unmount, refresh e abort; primeiro confirmar regressões. Adicionar signal opcional à assinatura existente e fetch init, propagá-lo em callers, tratar AbortError como cancelamento. Generation por origem/lifecycle e ordenação/versionamento real impedem publicação antiga. Escolher singleflight/timeout por canal somente se necessário para o contrato; não alterar TTL/intent/orçamento silenciosamente. Verificar null-key e hidden/visible existentes.

Fim: R03/R14, signal registrado e resposta nova preservada; request remoto/billing não certificado como cancelado.

### T05: layout, dieta e estados responsivos

Responsabilidade candidata: `web/src/components/Desk/{MesaView.tsx,MesaView.module.css}`, composição dos `Dock/**`, `panels/{PriceChart.tsx,PriceChart.module.css,DecisionCard*}`, `web/src/lib/mesa/{panels-registry.ts,panels-registry.test.ts}`; somente integrador em Z8/Z2. Nenhuma edição da carteira ou modelo por mover componente.

Passos: mapa ID->requisito->destino; capturas antes nas larguras alvo. Separar preço/decisão mobile, remover altura fixa inútil de estado vazio, preservar contexto, barras e safe-area. Organizar FlowGauge no Fluxo, Derivatives/JevIndicators no Radar segundo contrato reconciliado. Preservar G1 completo nas duas viewports e resolver G9/DOC-2 antes de dimensionar o dock; manter acesso a apoio/table scroll em menores larguras. Verificar zoom 200%, teclado virtual, resize, foco não coberto e ausência de middle dot/dashes/blink/pulse renderizados.

Fim: R04-R06/R11/R18 com evidência atual, sem usar captura antiga como baseline atual. Sobreposição pública C02 permanece dependente do mapeamento do deploy, se ainda desconhecido.

### T06: configuração sem perda de rascunho

Responsabilidade candidata: `web/src/components/Settings/SettingsView.tsx`, `web/src/lib/settings/{useSettings.ts,settings-view-render.test.tsx}`, teste comportamental fake.

Passos: reproduzir save A pendente/editar B, double click, Salvar+Limpar, falha. Adicionar pending/guard e limpar só draft correspondente ao salvo. Testar mensagens e foco, uma consulta explícita por gesto. Inputs/logs usam dados fictícios locais sem chaves reais.

Fim: R13/R15; B preservado e ações concorrentes sob contrato claro.

### T07: rastreador orientado aos resultados

Responsabilidade candidata: `RastreadorView.tsx`, `RastreadorView.module.css`, `NumberFilter.tsx`, `OnchainBody.tsx`, testes de screen/onchain e filtros existentes. Serializar com T02 nos mesmos arquivos.

Passos: preservar estado atual e defaults; elevar busca/fonte/mercado/contador; filtros avançados e salvar tela em disclosure mobile; exibir resumo dos filtros ativos e indisponibilidade de views. Pergunta Inonu acessível por gesto, privacidade e budget conservados. Testar seleção->Mesa, CEX/perp/onchain, unidade aproximada e fonte/idade. Não mudar semântica do ranking/mercado para caber.

Fim: R06/R08/R10 em mobile com foco e filtros observáveis ao recolher.

### T08: baseline de performance

Responsabilidade: medidor read-only, build isolado e relatório, sem alterar produto. Usar Bun e scripts existentes; aplicar RTK/Headroom para saídas volumosas com recuperação exata. Sem instalar ferramentas por reflexo; runtime Playwright/Edge disponível pode medir browser.

Passos: verificar guias atuais Next locais e configurações antes de build; copiar fonte/config necessária sem segredos, não sobrescrever .next alheio. Usar build produção, cold load e cenários do design. Registrar hashes/build/dispositivo/rede/viewport/fonte, mínimo 5 execuções pareadas como ponto inicial e variação por cenário; aumentar somente se variância impedir decisão. Trace lab pode usar fixture/replay sanitizado para correção e localizar custo, mas ganho live exige fonte real autorizada sob condições comparáveis. Nenhuma coleta automática de carteira/mercado para provedor.

Fim: R16 com métricas ou dependência explícita. Campo ausente fica sem medição, nunca inventar p75. Escolher gargalo e registrar critério de ganho/ruído antes de T09.

### T09: otimização condicionada ao profiling

Responsabilidade candidata depende de T08: `web/src/lib/desk/{useDesk.ts,desk-store.ts}`, `panels/PriceChart.tsx`, `web/src/lib/desk/ui/draw-chart.ts` e clocks/polls específicos via integrador. Apenas um mecanismo por comparação inicial.

Passos: custo relevante confirmado -> regressão funcional -> mínima alteração -> comparação pareada -> revisão. Considerar seletor/props estáveis, geometria reusada, palette por tema, lazy chunk ou pausa visual somente se evidência sustentar. Manter freshness/expiry de marcas nas chaves, chart hit-test e fonte. Não pausar trader/ingestão ou decidir por N blocos. Sem gargalo/ganho, documentar hipótese encerrada sem refatorar.

Fim: R17 com resultado medido e gates; custo faturado/uso desconhecido continuam null.

### T10: compatibilidade financeira e acessibilidade

Responsabilidade: verificador independente, scripts/testes existentes e relatório; integrador corrige apenas achados do slice. `web/src/lib/no-send-scan.test.ts`, testes wallet canônicos pertinentes, chart/ui e render existentes. Não modificar critérios para passar.

Passos: conferir sim/real/desconhecido, preço/unidade/PnL/coverage, chart OHLCV/teclado/marks, modelo por gesto e Accept sem envio. Explicitar exclusões do scan no-send, inclusive legado, sem extrapolar cobertura. Contraste e alvos nos temas; foco, leitor de tela, zoom/reflow e reduced-motion das telas alteradas. Wallet fake/observação read-only, nunca assinatura/broadcast de teste.

Fim: R02/R11-R13/R18 cobertos no escopo alterado; limitações de AT/campo/operacional declaradas.

### T11: integração, verificação e revisão

Responsável: integrador + revisor distinto read-only/cópia isolada. Revalidar todos os arquivos tocados, aplicar apenas slice próprio e preservar mudanças preexistentes. Comandos candidatos em web: `bun --no-env-file test --parallel=1 --timeout 15000 <arquivos pertinentes>`, `bun run typecheck`, `bun run build` no ambiente isolado. Os scripts/contratos QLT atuais determinam ampliação de checks da wave; não repetir suite global por microedição, nem chamar histórico de teste novo.

Verificar /, /rastreador, /configuracoes e /doctor no desktop export quando afetado; /console somente como superfície web pertinente, sem adicioná-la ao export por conveniência. Revisor recebe baseline fixo, R01-R20 relevantes, fontes/hashes, logs e capturas. Corrigir achados e rever os arquivos corrigidos. Checkpoint distingue implementado/testado/live/ganho medido. Publicação e negociação não são critérios desta entrega de frontend.

Fim: R19/R20, rastreabilidade completa, nenhuma aprovação do próprio autor e nenhuma reivindicação de estado externo não lido.

## Rastreabilidade e execução

A tabela inicial mapeia todos R01-R20 a tasks. T00 pode revelar que um comportamento já foi corrigido por outra sessão: revalidar e verificar, evitando reimplementação. T02/T03/T04 são slices pequenos de correção; T05/T07 são redesign limitado; T08/T09 são pesquisa/otimização condicional. Esse limite impede transformar melhorias possíveis em um loop ilimitado ou promessa de executar todas as hipóteses.

Primeiro passo concreto: realizar T00 para T02 e preparar regressões de teclado na cópia isolada. Se AssetPicker estiver reservado, seguir uma parte livre do Rastreador depois do mesmo gate; não tomar arquivo alheio nem pedir um continue para cada etapa autorizada.
