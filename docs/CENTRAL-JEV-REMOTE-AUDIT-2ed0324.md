# Reconciliação de branches remotas — 2026-10-11

Baseline local: `96d30cc387a6520aba23199e25d0d4ec71a7ad88`. Remotos consultados com sucesso, sem push: `origin` e `upstream`. Ambos os `main` remotos apontavam para `b587759e459ea049590102e54a0b07800864cdc3`, já contido no main local. Dois históricos adicionais foram encontrados: `codex/okx-readonly` (`ed005440ff09b46fc5b10ae1d4ed74e94f70b494`) e seu filho `codex/inonu-trader-ui` (`0620787aae1ba2ef1b0cf217cbd65670463ac48a`).

Esses commits de 9 de outubro introduzem a interface Inonu, gráfico interativo, filtros de atividade, documentação de contribuição e carteira OKX somente para leitura. As capacidades já foram integradas em `c352f82755862f4a4619d5e0d4411e2194f8d6a8` e evoluíram desde então. O merge registra os dois históricos e preserva a central Jev atual. Nenhuma alteração nos inputs de execução, teste ou build é necessária para reconciliar esses históricos.

O inventário completo tem 35 caminhos: 19 blobs remotos são idênticos aos da integração `c352f827`; 7 ainda são idênticos ao baseline local; 8 componentes antigos foram removidos pela substituição da interface em `4df9c05`. A resolução usa comparações por caminho e comportamento; a identidade global de árvores, sozinha, não demonstra cobertura das alterações de origem.

| Caminho alterado pelo remoto | Destino e justificativa no baseline local |
| --- | --- |
| `.github/PULL_REQUEST_TEMPLATE.md` | Blob remoto idêntico: preservado. |
| `CONTRIBUTING.md` | Blob remoto idêntico: preservado. |
| `README.md` | Identidade, crédito MIT e instruções preservados; documentação posterior mantém gates de execução, desconhecidos e verificações reais. A descrição antiga de execução não substitui a qualificação atual. |
| `docs/CONTRIBUICAO.md` | Blob remoto idêntico: preservado. |
| `package.json` | Nome e dependências preservados; comandos posteriores descobrem todos os testes e incluem timeout, build e typecheck. |
| `scripts/github.ps1` | Blob remoto idêntico: preservado. |
| `web/.env.example` | URL pública preservada; aviso atualizado descreve também consultas explícitas a RPCs externos e proíbe segredos nos valores públicos. |
| `web/OKX-WALLET.md` | Conexão explícita e leitura Monad preservadas; guia posterior inclui X Layer, cobertura limitada, freshness e ausência de execução. |
| `web/README.md` | Gráfico, filtros, estados de feed e wallet preservados; comandos refletem bundler nativo já verificado e suporte a X Layer. |
| `web/package.json` | Next/React e scripts preservados; descoberta de toda a suíte substitui lista fixa de três arquivos. Versão posterior do projeto permanece. |
| `web/src/app/globals.css` | Blob remoto integrado em c352f827; tokens e regras atuais são os da central, com movimento reduzido. |
| `web/src/app/layout.tsx` | Fontes e layout Next preservados; branding da central atual substitui o título antigo. |
| `web/src/app/page.module.css` | Blob remoto integrado em c352f827; grid atual acomoda os painéis Jev e adaptações de tela posteriores. |
| `web/src/app/page.tsx` | Página atual compõe Rail, JevCore, CommandCenter, KpiSurface, FlowChart, TelemetryStream e WalletPanel; inclui GrowthDeck, SystemOne, decisões e multichain. |
| `web/src/components/BrandMark/BrandMark.tsx` | Marca abstrata e atributos acessíveis preservados, com identidade atual. |
| `web/src/components/DecisionPanel/DecisionPanel.module.css` | Integrado anteriormente; componente substituído por JevCore/CommandCenter e seus estilos na central. |
| `web/src/components/DecisionPanel/DecisionPanel.tsx` | Probabilidades, ação, latência e estado informado migram para JevCore/CommandCenter, FlowChart e TelemetryStream. Não ressuscitar o painel removido. |
| `web/src/components/Feed/Feed.module.css` | Integrado anteriormente; substituído pelos estilos de TelemetryStream. |
| `web/src/components/Feed/Feed.tsx` | TelemetryStream usa os mesmos filtros de apresentação antes de limitar os resultados; mostra estado informado, simulação e recibos. |
| `web/src/components/FlowChart/FlowChart.module.css` | Integrado anteriormente; estilos posteriores preservam inspeção e controles, com melhorias de interação e movimento reduzido. |
| `web/src/components/FlowChart/FlowChart.tsx` | Janelas 32/64/128 e inspeção por teclado/pointer preservadas; valores não finitos ou desconhecidos permanecem indisponíveis em vez de serem apresentados como PnL válido. |
| `web/src/components/Header/Header.module.css` | Integrado anteriormente; substituído pelos estilos de Rail. |
| `web/src/components/Header/Header.tsx` | Rail mantém marca, modelo, estado do feed e distinção de simulação/execução; a capitalização antiga não substitui o branding atual. |
| `web/src/components/StatsRow/StatsRow.module.css` | Integrado anteriormente; substituído por KpiSurface/InstrumentRow. |
| `web/src/components/StatsRow/StatsRow.tsx` | Métricas migram para KpiSurface/InstrumentRow e helpers; custos e PnL desconhecidos permanecem explícitos. |
| `web/src/components/WalletPanel/WalletPanel.module.css` | Integrado anteriormente; superfície atual acompanha a central. |
| `web/src/components/WalletPanel/WalletPanel.tsx` | Conectar, atualizar, trocar rede explicitamente, desconectar e saldos exatos preservados; X Layer e estado temporal adicionados posteriormente. |
| `web/src/lib/okx-wallet.test.ts` | Suíte atual preserva descoberta, leitura, timeouts, rejeições, eventos e desconexão. Inclui eventos antes de confirmar a rede e invalidação de respostas antigas, além de regressões de X Layer, timestamps e respostas hostis. |
| `web/src/lib/okx-wallet.ts` | Descoberta OKX, requests de leitura, leitura no mesmo bloco e revisão de eventos preservadas; limites canônicos, X Layer, clock, tratamento de erros hostis e reconciliação de corridas posteriores permanecem. |
| `web/src/lib/presentation.test.ts` | Mesmos testes de apresentação com fixtures posteriores que distinguem gas/PnL desconhecidos de zero observado. |
| `web/src/lib/presentation.ts` | Blob remoto idêntico: preservado. |
| `web/src/lib/types.ts` | Tipos atuais ampliam os contratos remotos para custos desconhecidos, evidência de recibos e metadados; não reduzir nullable para número obrigatório. |
| `web/src/lib/useFeed.test.ts` | Blob remoto idêntico: preservado. |
| `web/src/lib/useFeed.ts` | Blob remoto idêntico: preservado. |
| `web/src/lib/useOkxWallet.ts` | Hook e ciclo de vida preservados; suporte a X Layer e horário de observação mantidos. |

Decisão técnica delegada ao Jev: recibo `d1cb3f79-6f5a-47f3-acd7-fb0d8cf63df8`, modelo `jev-1.13.0`, recomendação `reconcile`, confiança 0.84, 613 tokens de entrada/65 de saída, custo desconhecido. `approved_by=jev_delegated`; não é aprovação humana nem evidência de execução.

A integração exige revisão independente antes de atualizar main. Evidências anteriores do mesmo conteúdo: 1969 testes backend e 408 frontend aprovados, dois skips, zero falhas; análise de tipos e build Next nativo aprovados. Reutilização exige conferir hashes dos logs e identidade dos inputs com o baseline. Nenhuma ordem, credencial, push ou deploy é parte desta entrega.

A abertura do navegador foi recusada pela revisão automática, com indicação de recusa do usuário; a inicialização da prévia local foi bloqueada pela política de execução. Não foram repetidas nem contornadas. Aceite visual desktop/mobile e disponibilidade da prévia continuam pendentes; um merge de histórico não comprova esses critérios.
