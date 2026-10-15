# Mesa de decisão e consulta de carteira

Conversa: 01a135ff-362e-7cf0-ac4f-ef678d322188. Baseline observado: 00a593bcabe25dbb6d83795268533551098f645b, com mudanças concorrentes preexistentes. Objetivo: melhorar significativamente a interface e a gestão consultiva de carteira com Jev, sem ampliar ruído ou prometer retorno.

Decisões técnicas e seams: approved_by=jev_delegated. Recibo real c2e60c81-7da3-41bd-b3ef-40dbd2581fcf, modelo jev-1.13.0, evaluate; decision_desk 0.95, extend_ask 0.96, server_fallback 0.96. Uso conhecido 1311 input / 201 output tokens, custo monetário desconhecido. A recomendação não concede autorização financeira.

## Aceitação imutável

- UI-1: a mesa dá prioridade ao gráfico e à decisão, sem perspectiva/parallax. Controle visível de ampliar/restaurar gráfico, preservando intervalos, estilos, camadas e seleção de ativo existentes. Em 1440x900 e 390x844 não há overflow horizontal; controles essenciais têm nome acessível e foco visível. Sem texto renderizado com middle dot, em dash ou en dash e sem pulso/pisca.
- UI-2: carteira mostra leitura parcial, rede, idade/validade da observação e estados distintos de leitura, cotação e execução. Nenhuma conexão ou recomendação concede autorização para operar. Não chama modelo em mount, refresh ou connect.
- KEY-1: servidor descobre TYPESAFE_AI_API_KEY e alias TYPESAFE_API_KEY do ambiente do processo e Windows quando disponíveis; configuração local/cofre prevalece. Somente origem e presença aparecem no status. Chave nunca no navegador, logs, exceções ou payload de decisão. Ausência/indisponibilidade não vira validação do provedor. Remover configuração local não altera ambiente Windows e fallback fica explícito.
- PORT-1: consulta manual aceita composição mínima sem endereço da wallet, saldos por identidade de ativo/rede, cobertura parcial, observação válida e perfil conservador sem alavancagem automática. Carteira vazia significa apenas os ativos observados vazios; permite pesquisar oportunidades num conjunto delimitado de candidatos, não alegar varredura de todo mercado. Dados desconhecidos permanecem null, sem equiparar stablecoin a USD nem inventar patrimônio/PnL.
- PORT-2: modo carteira no /inonu/ask usa o ciclo existente de single-flight, cooldown, cancelamento, teto e ledger. Em uma chamada Jev escolhe comprar, manter, vender ou abster-se para cada candidato; código valida escolha/identidade e nunca escolhe direção por score. Proíbe vender posição ausente e não aceita instrumentos alavancados. Evidência de mercado tem origem, idade e lacunas. Não recomenda tamanho, retorno, probabilidade ou confiança numérica sem medição.
- PORT-3: resultado por ativo mostra ação Jev, evidência/lacunas, cobertura, perfil, custo conhecido ou desconhecido e que é consultivo. Mudança de conta/rede ou dados vencidos invalida consulta/resultado pendente. Compartilhamento mínimo ocorre apenas após ação manual com aviso do que será enviado. Sem endereço, private key, API key, raw RPC ou transação. Nenhuma chamada real de modelo, assinatura ou ordem será exercitada pelo agente nesta tarefa.
- SYS-1: preservar contratos do trader Jev/Kuru/Monad a cada bloco 300ms, nunca a cada N blocos, e todas as integrações/edições preexistentes. Não alterar collector de carteira para egress automático, publish, push, pagamento ou servidor em uso.
- EVID-1: relatório de comparação e integrações distingue produto documentado, código implementado e operação live verificada. OKX Visuality é nome não confirmado; OnchainOS e OKX Wallet são analisados pelas fronteiras reais. ML/modelo/aprendizado adaptativo não recebe alegação de ganho sem avaliação real separada.

## Fontes e observação

TradingView: https://www.tradingview.com/support/solutions/43000718885-tradingview-screeners-walkthrough/ e https://www.tradingview.com/support/solutions/43000692404-layouts-charts-drawings-indicators-and-their-interaction/ sustentam seleção, layouts e controles de gráfico. Nansen: https://nansen.ai/post/why-trade-on-nansen-trade-everything-onchain-with-ai e https://docs.nansen.ai/api/portfolio sustentam pesquisa e carteira contextual. Token Metrics: https://tokenmetrics.com/ apresenta análise AI e portfólio; marketing não comprova lucro. OKX: https://web3.okx.pro/onchainos/dev-docs/wallet/product-and-service descreve capacidades, não certifica integração local.

Código inspecionado: MesaView/PriceChart/DeskRail, src/settings/store.ts, src/desktop/vault.ts e handlers.ts, src/inonu/ask.ts/jev-model.ts/source.ts/http.ts, web/src/lib/okx-wallet.ts e wallet/ticket.ts. Inventário e evidência canônicos continuam em docs/sdd/carteira-evidencia; este documento não os substitui.

## Entregas e responsabilidade

1. Descoberta de credencial, testes públicos de SettingsStore/vault com doubles, sem alterar Windows. Escritor isolado exclusivo src/settings/runtime-key.ts, store.ts, testes correspondentes, src/desktop/vault.ts e testes correspondentes. Root integra após comparar hashes.
2. Contrato carteira e fonte/modelo: escritor isolado exclusivo src/inonu/ask.ts, jev-model.ts e testes, novos portfolio.ts/portfolio.test.ts. Testes públicos asker, BriefSource e model boundary, uma regressão vermelha antes de implementação. Root integra handlers.ts e HTTP se necessário. Sem duplicar caps/ledger.
3. Root: UI nova de carteira, adaptador local e client com testes de privacidade/invalidação; ajustes mínimos em MesaView/DockWalletTab/SettingsView; CSS e controles do gráfico. Só root edita arquivos compartilhados.
4. Verificação Bun dirigida, typecheck e build separado; capturas e inspeção de desktop/mobile em preview próprio. Revisão independente em cópia isolada, com critérios acima, baseline fixo e diff desta tarefa. Auditoria/checkpoint com limitações live explícitas.

Não há commit, publicação, execução financeira nem instalação nova autorizada por esta SPEC. Autorização de trabalho local e consulta Jev Workflows vem do usuário; não inferir respostas humanas.
