# Pesquisa de frontend, somente leitura

Captura de fontes: 2026-10-13T16:22:52.7050497Z. HEAD local: 00a593bcabe25dbb6d83795268533551098f645b. Pesquisador: /root/frontend_evidence. Conversa nativa própria: 01a13605-1714-7453-bd4d-6593af0d61a2; sessão: 01a135ff-9686-7e92-b4cb-b23db7525fac.

Objetivo: fornecer fatos técnicos, riscos e propostas executáveis para o plano do coordenador. Nenhuma mudança de produto, staging, commit, build, teste, chamada financeira, operação de carteira ou consulta explícita a modelo foi realizada. A árvore já tinha mudanças concorrentes; não foi tratada como baseline limpo. As fontes foram lidas no worktree, não inferidas de HEAD. Contexto do próprio harness foi recuperado; sdd_state da própria conversa estava na revisão 0, pesquisa sem tarefa iniciada. Este relatório não inicia implementação, não congela nem aprova SPEC e não certifica seus próprios critérios.

## Contratos determinantes

- AGENTS.md: "Jev makes the buy/sell call (not code), from the price feed; real trades from a real wallet; an order placed on Kuru's on-chain book every 300 ms block; the demo is the live dashboard. Never decide every N blocks." Preservar todos esses requisitos. As propostas abaixo tratam da UI e do transporte das leituras, sem alterar execução/cadência do trader.
- docs/sdd/grafico-jev/spec.md:14-19: somente leituras genuínas geram marcas Jev; indicadores descritivos não decidem; ausência fica desconhecida; texto renderizado não usa middle dots/em/en dashes nem indicadores piscando/pulsando. G5:53 exige foco/hover nas marcas; G10:58 mantém teclado/mobile; G1:49 define área mínima do gráfico.
- docs/sdd/inonu-desktop-v1/info-diet.md:13-17 define uma decisão, três pesos, uma razão, até oito ativos, cinco abas inferiores e até doze linhas visíveis. Linhas 28,30,31 destinam JevIndicators ao Radar, FlowGauge ao Fluxo e DerivativesStrip ao Radar. Linha 60 exige consultas onchain por aba ativa. Linhas 66-70 exigem sincronização da matriz e registro de requisito.
- SPEC.md:300-302 liga INF-1/2/3 à dieta e a req IDs. 363 exige distinguir backend desatualizado de envelope fora de contrato. 380-384 exige filas limitadas, diagnóstico e consulta Jev apenas por gesto explícito sem clique duplicado. 386 remove o System One legado da experiência desktop. 394 mantém Aceitar sem envio/assinatura/broadcast. 396-400 exige orçamento/req IDs e verificação independente, inclusive quatro larguras.
- carteira-evidencia/tasks.md foi lido primeiro. Seus Z1-Z8 são reservas de trabalho concorrente, especialmente Z2 mobile e Z8 UI compartilhada. requirements.md RQ-01/03/04/06/07/09/15/16/20 mantém identidade de rede/ativo, fonte/idade, desconhecido explícito, real versus simulado e nenhuma execução nova. Não duplicar o plano canônico dessa pasta.
- [WCAG Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) fundamenta equivalência das funções por teclado. Trecho literal curto: "Ensure pointer actions have a keyboard equivalent."
- [W3C APG Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) fundamenta setas, foco ativo e relações tab/panel. Trecho literal curto: "Each element with role tab has the property aria-controls referring to its associated tabpanel element."
- [MDN Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#canceling_a_request) descreve que cancelamento precisa do AbortSignal no fetch. Isto sustenta a distinção entre descartar resposta e abortar transporte.

Esses links são documentação primária/técnica pública consultada em 2026-10-13. Hashes abaixo são SHA256 do corpo HTTP baixado em bytes, sem código privado enviado.

## Superfícies atuais e limites da correspondência

1. web/src/app/page.tsx:2,5-10 importa MesaView, anuncia INONU TRADER e retorna MesaView. A Mesa lê OKX, fontes onchain e carteira; não é a página Jev/Kuru que o coordenador observou no domínio público.
2. web/src/app/console/page.tsx:45-59 monta RealPipeline e PublicMarket e mantém o console legado dentro de details controlado por estado. Linhas 65-69 e 128-196 ligam o legado a useFeed/useOperatorCenter, CommandCenter, JevCore, FlowChart, DepthLadder, Telemetry, Wallet e DexReport.
3. Essa separação não prova que a versão publicada corresponde ao worktree ou a HEAD. A captura pública, identidade de build/deploy e análise de sobreposição visual são responsabilidade do coordenador. Nenhuma alegação de trade real ou de defeito financeiro deriva só desta inspeção de UI.
4. SPEC AC-WIN-7 exclui /console do export instalado. info-diet.md:41 conserva essa rota no repositório como superfície legada. Não extrapolar a exclusão do desktop para apagar a rota web sem resolver contrato de superfície.

## Achados confirmados na fonte e correções candidatas

"Confirmado na fonte" significa o mecanismo existe e permite o gatilho descrito. Não significa que o bug foi reproduzido no navegador, nem que passou avaliação WCAG completa. Critérios abaixo devem ser exercitados e julgados por um verificador independente.

### F01, P1, alta: Enter escolhe outro ativo a partir de controles internos do AssetPicker

Fonte: web/src/components/Desk/panels/AssetPicker.tsx:242-268,293,327,334-349.

Evidência literal: o dialog tem "onKeyDown={onKeyDown}". O ramo "else if (event.key === \"Enter\")" chama "event.preventDefault()" e escolhe "shown[highlighted]" ou "ocShown[highlighted]". A única exceção é Enter no campo de busca onchain. Os botões de mercado e Buscar têm seus próprios onClick. Opções recebem highlight por ArrowUp/Down ou pointer, não por foco Tab.

Gatilho: com resultados disponíveis, Tab até Perp/Spot, fonte OKX/rede, Buscar ou uma opção que não seja highlighted e pressione Enter. O handler ancestral pode impedir ativação nativa e selecionar/fechar o ativo destacado, mesmo quando a intenção é mudar o mercado ou ativar o controle focado. Também captura ArrowUp/Down de qualquer descendente, inclusive controles de seleção.

Escopo candidato: AssetPicker.tsx e testes atuais de AssetPicker/panels. Restringir atalhos de busca/resultados ao alvo adequado e preservar ativação nativa dos demais controles. Não mudar o compromisso de busca explícita onchain, nem adicionar consultas Jev.

Aceitação independente F01-A: com pelo menos dois resultados, Enter em Perp/Spot muda somente mercado; Enter em Buscar confirma a busca; Enter/Space em opção focada escolhe exatamente essa opção; fonte/rede e Escape funcionam; foco retorna ao acionador em Escape. Busca e troca não acionam modelo ou carteira.

Alternativas reais: A) controles nativos e escopo de handler local, menor mudança; B) combobox/listbox completo com aria-activedescendant e comportamento APG, maior mudança e mais superfície de teste. A escolha visual/semântica cabe à SPEC/coordenador com Jev se ainda ambígua. Não é necessário refazer o stack.

### F02, P1, alta: token onchain no Rastreador só é selecionável por clique

Fonte: web/src/components/Rastreador/OnchainBody.tsx:175-207.

Evidência literal: a tabela é um div "role=\"table\""; cada linha usa "onClick={() => ... p.onSelect(...)}" em 189. Busca em todo o arquivo não encontrou onKeyDown/tabIndex para as linhas nem botão de seleção nas células. A área de pedir ao Inonu é condicionada ao token selecionado em 206-207.

Gatilho: usuário somente com teclado tenta escolher ou desmarcar um token e alcançar a leitura/ação associada. Os filtros e botões são focáveis, mas não existe equivalente de seleção nas linhas.

Escopo candidato: OnchainBody.tsx, estilos estritamente necessários e onchain-body-render/teste de comportamento. Introduzir controle nativo nomeado para seleção em cada linha ou adotar grid com navegação coerente. Uma tabela com um botão por token é a alternativa de menor alteração; grid exige contrato maior.

Aceitação independente F02-A: selecionar/desmarcar token por teclado, abrir sua área associada, respeitar locked e anunciar seleção. Nenhuma chamada Jev acontece só pela seleção; somente o gesto explícito de Pedir pode consultar. Identidade rede+endereço deve permanecer a mesma de RQ-01.

### F03, P1, média: atalhos globais do Rastreador OKX interceptam Enter dos botões da tabela

Fonte: web/src/components/Rastreador/RastreadorView.tsx:179-184,397,403,419-431.

Evidência literal: Enter com selectedId chama "event.preventDefault(), p.onOpen(p.selectedId)" no ancestral onKeyDown. Dentro dele existem botões de ordenação, pin e checkbox de ranking, cujos handlers de clique só param propagação do evento de clique.

Gatilho: existe uma linha selecionada; usuário foca um cabeçalho de ordenação ou pin e pressiona Enter. A tecla no ancestral abre o ativo selecionado em vez de ativar esse botão. Space no botão pode continuar funcionando, portanto não declarar toda função indisponível ou falha WCAG integral sem execução.

Escopo candidato: RastreadorView.tsx e screen-render/teste de comportamento. Atalhos da tabela devem atuar apenas quando a área de navegação da tabela é o alvo; respeitar controles internos.

Aceitação independente F03-A: Enter/Space em sort/pin/checkbox não abre ativo; Enter quando foco está na área de navegação abre a seleção; setas e P funcionam no escopo documentado; busca "/" não captura input/controle indevidamente.

### F04, P1, média: IDs duplicados dos docks responsivos

Fonte: web/src/components/Desk/MesaView.tsx:514-547 e web/src/components/Desk/Dock/DockPanel.tsx:179-182,210.

Evidência literal: "id={`dock-tab-${tab.id}`}" e "id={`dock-body-${current.id}`}". A Mesa monta o DockPanel largo e dois móveis simultaneamente; CSS escolhe qual fica visível. Os grupos móveis particionam os mesmos tab IDs do dock largo. Não há prefixo por instância.

Gatilho: desktop ou mobile têm duas cópias dos IDs de tabs no DOM. aria-controls/aria-labelledby passam a apontar a nomes globais ambíguos. Impacto exato por tecnologia assistiva depende de teste.

Escopo candidato: DockPanel.tsx e dock-render.test.tsx/composite; identificador estável por instância (useId ou prefixo explícito). Não mudar política de montagem dos corpos nem orçamento de consultas.

Aceitação independente F04-A: document inteiro sem IDs duplicados de tab/panel a 1600,1280,820,390 e após resize; todo aria-controls/labelledby resolve o elemento da própria instância; setas/Home/End mantêm foco/seleção e um tabStop por tablist; painel aberto/fechado e ambos grupos móveis corretos.

### F05, P1, média: AbortController onchain não chega ao fetch

Fonte: web/src/lib/onchain/useOnchainResource.ts:92-106,122-124; useOnchainCandles.ts:149; client.ts:331-340,362-371,381+; AssetPicker.tsx:168-174.

Evidência literal: o recurso chama ".current(userInitiated, controller.signal)" e suprime resultados quando abortado. O caller de velas nomeia "_signal"; transporte FetchLike não declara signal e fetchImpl recebe só method,credentials,headers. Outros fetchers do picker nomeiam "_s".

Gatilho: troca de token/barra, unmount ou refresh enquanto consulta anterior está pendente. O resultado antigo não chega ao estado, mas requisição continua até terminar. Não confundir isso com erro de exibição confirmado ou custo faturado: cancelamento do navegador não garante que provedor não processou a chamada.

Escopo candidato: client.ts, useOnchainCandles.ts, fetchers do AssetPicker e demais callers identificados no inventário final. Propagar AbortSignal opcional no contrato de transporte e tratar AbortError como cancelamento. Preservar envelopes honestos, intent user/background, TTL, orçamento e ausência de chamadas em aba inativa.

Aceitação independente F05-A: fetch controlado registra signal; seleção A->B e unmount abortam A; só B publica resultado; abort não gera aviso de rede; fluxo visível/background mantém intent e contagem; chave null não consulta. Verificar comportamento real em navegador com atraso local controlado, sem enviar operação de carteira.

Alternativas reais: A) signal até fetch, menor mudança; B) além disso singleflight deduplicado por identidade quando medição mostrar overlap relevante. B não é pré-requisito para corrigir cancelamento e exige avaliar cache/TTL.

### F06, P1, média: polling operator permite resposta velha sobrescrever resposta nova

Fonte: web/src/lib/operator-center.ts:82-128; MesaView.tsx:104; console/page.tsx:68.

Evidência literal: "fetch(.../operator, { cache: \"no-store\" })" em 88; resultado atualiza cycleRef/state em 93-94. Intervalos em 119-120 disparam sem guard de request em andamento. Cleanup em 125 somente clearInterval. History/insights também não têm generation/abort.

Gatilho verificável: A permanece pendente por >5s, B termina com cycle mais novo, A termina depois. A sobrescreve cycle com valor antigo e lastFetchAtMs recebe hora recente. Troca de apiUrl também permite resposta do endereço anterior escrever após a troca. A idade usa completedAtMs e pode revelar a antiguidade; ainda assim, ordem regressiva e associação à origem atual não têm proteção.

Escopo candidato: operator-center.ts e operator-center.test.ts. Generation para origem/lifecycle e comparação de versão/tempo por canal; cancelamento real e singleflight/timeout conforme contrato. Não diminuir cadência de decisões Jev/Kuru, pois esse é polling de UI.

Aceitação independente F06-A: promises controladas terminam fora de ordem e a versão nova permanece; troca de URL/unmount ignora e aborta resposta antiga; erro mantém stale/unknown honesto; uma requisição ativa por canal ou política explícita que impeça regressão; retry/timeout não oculta ausência do backend.

### F07, P2, média: dieta de informação tem divergência estrutural visível no desktop local

Fonte: info-diet.md:28,30,31; MesaView.tsx:461-462,497-505; panels-registry.ts:47-49.

Evidência literal: JevIndicators é montado diretamente sob o strip; FlowGauge e DerivativesStrip ficam na wing direita permanente. A matriz manda esses detalhes para Radar/Fluxo. O registry registra req IDs desses painéis, mas não afirma sua localização.

Gatilho: Mesa desktop no modo normal mantém esses detalhes fora das abas inferiores. Esse é desvio da organização especificada; tamanho, sobrecarga percebida e clipping não foram medidos por este pesquisador.

Escopo candidato: MesaView.tsx, módulo CSS, composição de Radar/Fluxo e registry/testes de dieta, respeitando reserva Z8 e trabalho Z2. A alternativa de menor escopo é mover os detalhes existentes para suas abas, preservando as informações e dados reais. Densificar o strip sem decisão de contrato é alternativa de maior risco e pode contradizer o orçamento de INF-1.

Aceitação independente F07-A: mapping atualizado sem enfraquecer INF; desktop/mobile mostram o detalhe na aba correspondente; 5 tabs, ativos<=8 e linhas<=12 por região definida; fontes/idade continuam visíveis; captura real nos quatro widths e verificação sem clipping. Não inferir que o registry atual sozinho prova AC-INF-1.

### F08, P2, média: settings aceita ações concorrentes e pode apagar rascunho novo

Fonte: SettingsView.tsx:111-139,445-448; useSettings.ts:37,56-69,72-77.

Evidência literal: save aguarda onSave e depois chama "setDraft(\"\")". Botões dependem só de draft/configuração/callback, sem pending. Hook possui busy mas SettingsView não passa estado busy para a tela; run não bloqueia concorrência.

Gatilho verificável: salvar rascunho A pendente, editar campo para B, completar save A; B é apagado. Dois cliques ou Salvar seguido de Limpar também podem concluir fora de ordem. Não executar gravações de segredo reais durante a reprodução.

Escopo candidato: SettingsView.tsx e testes settings; pending por campo/ação, guard local e limpeza somente do rascunho ainda correspondente ao valor salvo. Se hook compartilha busy global, definir precisamente seu papel, sem bloquear observações independentes.

Aceitação independente F08-A: fake client retardado, no máximo uma mutação por campo enquanto pending; rascunho B sobrevive à conclusão de A; mensagem de falha preserva texto digitado; sem chave/código privado em logs; action Testar Jev somente gesto único e estado pending previsível.

## Desempenho: mecanismos existentes, hipóteses sem ganho medido

### H01, P2: assinatura inteira e props frescas podem aumentar recomputação do gráfico

Fontes: useDesk.ts:53 (useSyncExternalStore do snapshot completo); desk-store.ts:161-178,201 (publicação de dados em 100ms); MesaView.tsx:120 e485-491 (clock de1s e objeto jev novo); PriceChart.tsx:352-362,520-581; draw-chart.ts:1031-1032.

Confirmado: timeMarkers depende de objeto jev por identidade; ele é recriado em renders da Mesa. PriceChart calcula geometry em useMemo e drawChart recalcula geometry para desenhar. readPalette/getComputedStyle é executado em cada frame desenhado. O RAF é agendado por effect, cancelado na limpeza e não é um loop infinito. Estes fatos não provam lentidão, frame drop, ganho ou economia.

Proposta condicionada a profiling: comparar selector/snapshot de subestado, props Jev estáveis por campos realmente necessários, geometria reutilizável entre render/hit-test e draw, e leitura de tokens/font fora de cada atualização quando tema/tamanho não mudou. Escolher somente o mecanismo cujo custo se demonstrar relevante; não trocar stack nem reduzir ingestão do feed.

Escopo eventual: useDesk/desk-store se selector demonstrar ganho; MesaView/PriceChart e draw-chart para estabilidade/geometria. Dependência: fonte/horário que influem expiração de marcas não podem ser memoizados com chave incompleta.

Aceitação independente H01-A: par isolado antes/depois usando mesma fonte real e cenário, a1600/1280/390, registrar commit count, chamadas computeGeometry/drawChart, CPU/main-thread, long tasks, frame time e frescor de dados. Ingress/drop/última leitura/carteira preservados. Resultados devem publicar medida e variação, ou "ganho não medido", com gates funcionais. Replay sintético pode provar correção, nunca ganho live.

### H02, P2: trabalho de UI oculta ainda existe, benefício de pausa não medido

Fontes: MesaView.tsx:120; desk-controller.ts:81-84,309-323,387-401; desk-store.ts:178; operator-center.ts:119-124; jev-read.ts:502-511; useInonuLayer.ts:61; RastreadorView.tsx:506-517,583.

Confirmado: alguns clocks/publicações e polling de leituras locais não verificam visibility. Rastreador já pausa poll de tickers quando hidden e retoma no evento visible. OnchainResource e overlay-feed já têm guard de visibilidade, abort/generation e backoff no overlay. Não propor pausa geral do backend/executor ou mudança de Jev por bloco.

Proposta condicionada: separar UI publication/age clocks dos transportes que devem permanecer vivos, medir escondido e retomada, suspender somente trabalho visual e leituras sem obrigação de background se isso mantiver contrato de frescor. Usar o mecanismo local existente de overlay como referência, sem instalar framework.

Aceitação independente H02-A: mesmo feed/cadência/backpressure ao esconder; timers/requests de UI definidos pela política param; ao voltar mostram idade verdadeira e atualização presente, sem burst de chamadas; zero Jev chamadas novas sem gesto; ninguém interpreta ocultação como pausa de trader. Medir CPU/requests antes/depois; custos faturados desconhecidos continuam null.

## Pontos positivos e verificações ainda necessárias

- PriceChart.tsx:625-651 implementa ArrowLeft/Right, Home/End, colchetes e Escape. 918-923 oferece foco e descrição; 873-899 tem OHLCV HTML; 960 esconde canvas de AT; 977 tem resumo srOnly. Não reportar "canvas sem alternativa" como defeito confirmado. Ainda precisa verificar anúncio da vela/marca e leitura da DecisionCard com AT real, foco visível e mobile.
- useElementSize.ts:25-39 evita atualização por diferença<0.5px, arredonda, observa uma vez e disconnect no cleanup. Não há vazamento de ResizeObserver confirmado.
- desk-store tem buffers limitados e controllers cancelam timers; medir antes de refatorar.
- MesaView.tsx:298-302 só monta corpo onchain com plan.mount "montar"; evita provider call duplicada apesar de duas cópias responsivas. Preservar esse mecanismo na correção de IDs.
- OnchainResource.ts:78-79,128-136 pausa refresh hidden e exige chave/refresh explícitos; client diferencia schema/backend_stale/origin_denied em331-371. Não substituir por fallback de dados inventados.
- overlay-feed.ts:34,61-90 já pausa hidden, tem AbortController/generation e backoff até60s. useOverlayReading compartilha feed para evitar repetição por instância.
- Settings abre/atualiza budget/status por gesto e mount, sem polling (416-426). Privacidade e localização das chaves são texto explícito (399-405). Não realizar testes de credenciais reais na auditoria.
- DoctorView.tsx:63,73-85 permite somente verificação inicial/Retry, desabilita retry busy e tem alive guard. Nenhum intervalo de Doctor foi encontrado.
- O legado possui animações contínuas de mesh/dash/floor. Isso não prova blink/pulse: são animações diferentes e há reduced-motion/stale guards. O scan de produto deve avaliar as telas alteradas, não contar palavras em comentários/testes como violação. Não certificar ausência global por grep limitado.
- Nenhum profiler, teste interativo de teclado/AT, DOM real local ou build foi executado pelo pesquisador. Screenshots públicas do coordenador não certificam Mesa local.

## Ordem mínima executável sugerida ao plano

1. Slice UI teclado F01/F02/F03, arquivos exclusivos AssetPicker/Rastreador/OnchainBody. Bug regressions de eventos reais, testes de componente + navegador local com fetch controlado. Preservar os contratos ASK e identidade de ativo.
2. Slice docks F04, exclusivo DockPanel e testes; integrador toca Mesa compartilhada somente se necessário. DOM real nas quatro larguras e navegação APG.
3. Slice transporte F05/F06, exclusivo onchain client/callers e operator hook/testes. Primeiro order/cancel correctness; evitar otimização de cadência fora de contrato.
4. Slice settings F08 com cliente local controlado, sem gravar chaves nem consultar modelo/financeiro.
5. Slice dieta F07 é compartilhado Z8/Z2 e exige coordenação e capturas. Não iniciar durante reserva concorrente sem acordo de ownership.
6. H01/H02 começam como medição. Implementar só depois de localizar custo; ausência de ganho medido é resultado aceitável de pesquisa, não alegação de melhora.

Validação futura deve usar Bun e comandos pertinentes, sem executar test:all/build volumoso por reflexo em cada microedição. Depois da wave, cumprir QLT do contrato e revisão independente. Revisor deve receber estas fontes/hashes e critérios, sem inferir requisitos da implementação. Nenhuma dessas sugestões tem autorização de implementação concedida por este relatório.

## Manifesto SHA256

Hash local = bytes exatos do arquivo no worktree. Captura não elimina mudanças concorrentes anteriores e não identifica deployment. Revalidar antes de iniciar cada slice.

~~~json
{
  "files": [
    {
      "sha256": "17c63ea3c3328fbbd5cf0cf3934af0dd6ee142b9e4bf6e3b5b58724277dfdc34",
      "path": "AGENTS.md"
    },
    {
      "sha256": "ec1b6e023814ae1a510b02ea62229e5eb035d75e39e3335d5ea7f5ce5654d567",
      "path": "web/AGENTS.md"
    },
    {
      "sha256": "698cc07d663c593eb5b161f85b0e62b3166a5282bf2cd99d10e4748c4d2dcb91",
      "path": "docs/sdd/inonu-desktop-v1/info-diet.md"
    },
    {
      "sha256": "4bb65a88c573dae423dd165a30500c671216d0e0415e0d8dd1ca940f84604a75",
      "path": "docs/sdd/inonu-desktop-v1/SPEC.md"
    },
    {
      "sha256": "a222c2d468573a2b8cf236afc7d3bdb096339bb0fc396288ba81a0ae5198b94a",
      "path": "docs/sdd/grafico-jev/spec.md"
    },
    {
      "sha256": "3da5a970b7c85549c02ea33e2787bac978afa72732a55cdc0aa4c6d9e6bef0c6",
      "path": "docs/sdd/carteira-evidencia/tasks.md"
    },
    {
      "sha256": "2274abdb91408fd24715780dde2d20b97997cee913d2168793d274d71314908c",
      "path": "docs/sdd/carteira-evidencia/requirements.md"
    },
    {
      "sha256": "bebd9c954d0c3b260655c919125ee12c1034bda6b48ebcfeed5715806d5aa8dc",
      "path": "docs/sdd/carteira-evidencia/design.md"
    },
    {
      "sha256": "947d9a16e9b95b9f094bf97d09c834e68e988011bad0bdbf9e76c3e1bb7cec40",
      "path": "web/package.json"
    },
    {
      "sha256": "cf37e8f808f725293998991e352becdae9253daf176c0e0f580ac99fd96d5a48",
      "path": "web/src/app/page.tsx"
    },
    {
      "sha256": "a6405bf91a9d9313a4c2e7565ae198fb8f0db9ba3d08f60b3a261ce2396815b4",
      "path": "web/src/app/console/page.tsx"
    },
    {
      "sha256": "a2c3e787d1df0ea3f15528d95fe67c004847c974091e7c8c3a89cfa19f7de599",
      "path": "web/src/components/Desk/MesaView.tsx"
    },
    {
      "sha256": "d96183534961a5e6cfdf879e6c9d3425f36a7fef689b15a46bdd31a1783ceb7a",
      "path": "web/src/components/Desk/MesaView.module.css"
    },
    {
      "sha256": "6711c5ccc816d70d7a024ce03a70f39c6091dca58f0e5ce6ca74283b72fd06b8",
      "path": "web/src/components/Desk/panels/PriceChart.tsx"
    },
    {
      "sha256": "ac5cb46c44944ead041a26c579c626e13b6201d23e93eab70dccb105237cbe2d",
      "path": "web/src/components/Desk/panels/AssetPicker.tsx"
    },
    {
      "sha256": "e5623744b90d0390185703ffe571a941b43b1652ad518eef180692909b5ae4c5",
      "path": "web/src/components/Desk/Dock/DockPanel.tsx"
    },
    {
      "sha256": "41319d6cb5ebc2c18be1b7e2d1dcd5e7d8f4adae07cf6f6830a2d145b7168a87",
      "path": "web/src/components/Rastreador/RastreadorView.tsx"
    },
    {
      "sha256": "d793533bf8976e39d66ee1ffaac48d3d12cb7d157571c95c063c9dd2cceb9758",
      "path": "web/src/components/Rastreador/OnchainBody.tsx"
    },
    {
      "sha256": "a33445995716fa5d8fb8c6a5ab7136ef6713cefd018bf90ba656cf4147725276",
      "path": "web/src/components/Settings/SettingsView.tsx"
    },
    {
      "sha256": "bd4ebe8a12b6155b8219d2186fa5978093a8b98e9d6ba9b2a71bb6ab0494c6a5",
      "path": "web/src/components/Doctor/DoctorView.tsx"
    },
    {
      "sha256": "f46d4c33f96b92241af084b8fa3322b67b2d1f7d8874cada110eebfaa844ec32",
      "path": "web/src/lib/desk/useDesk.ts"
    },
    {
      "sha256": "2d7d5662025588246eeed4dffc2b27f40155126bd2daf9f31e2561e0e80668dc",
      "path": "web/src/lib/desk/desk-store.ts"
    },
    {
      "sha256": "65fb5eb96ab4e397da5453df9bf27ca04d90d25924dc2c223ddcc0b478accb97",
      "path": "web/src/lib/desk/desk-controller.ts"
    },
    {
      "sha256": "ca1972332f811afc38805fe37632095f29e7c5558c5b8f2a1b7e95eb29990f9e",
      "path": "web/src/lib/desk/ui/useElementSize.ts"
    },
    {
      "sha256": "f2f940c9cf629a0091541db2770ad4928dca0683bfe847e548cd744176c09f31",
      "path": "web/src/lib/desk/ui/draw-chart.ts"
    },
    {
      "sha256": "e84b1d476dc526ea2007e4864b5b43517ddb05d03cb0cbfab27fe94d30b5048c",
      "path": "web/src/lib/operator-center.ts"
    },
    {
      "sha256": "2b2ad6ec6b2981000cb0bee964757da99c378c783580f600f40f1ec0fb2a6a15",
      "path": "web/src/lib/onchain/useOnchainResource.ts"
    },
    {
      "sha256": "69b5a229c2ac26d9d125ef19de4f6b60af2e6772f3678f220419ae1f03f42fba",
      "path": "web/src/lib/onchain/useOnchainCandles.ts"
    },
    {
      "sha256": "9d6afb3ef17eb5eba76b11965540b059d62c8543162b84138b457e8a19992846",
      "path": "web/src/lib/onchain/client.ts"
    },
    {
      "sha256": "79532d5816f3b60446a75400268aff7d5dc786e583ccb7bd6550967dce5a218e",
      "path": "web/src/lib/settings/useSettings.ts"
    },
    {
      "sha256": "16cbe4ace451032075b36933b3b16600c9fed3141a603215ed26c6b0f8ccc7f1",
      "path": "web/src/lib/inonu/useInonuLayer.ts"
    },
    {
      "sha256": "950d825eff9b95dd7eddd364ca653dd4e84e0940652ffc27bdeea16a897e6b3f",
      "path": "web/src/lib/inonu/useOverlayReading.ts"
    },
    {
      "sha256": "fb5b94be26b648daf8801ce53f8d2367075569454b8faa1a2ec8b88befa01188",
      "path": "web/src/lib/inonu/overlay-feed.ts"
    },
    {
      "sha256": "4d438885fe9c0646725bc82652cec4309baed5a1a570be73c0ed2b7141399b11",
      "path": "C:/Users/gabri/.codex/skills/codex-desktop-harness/SKILL.md"
    },
    {
      "sha256": "86f7b8f22e4eb2aa352ff8d021d5d8dfad1b4ba6a56156252807bce528d5c258",
      "path": "C:/Users/gabri/.agents/sdd-multiagent/PLAYBOOK.md"
    },
    {
      "sha256": "387c01ba447457853d7d2d68e99412abc698f4d393332a9e352a57e05bc078bc",
      "path": "web/src/lib/mesa/panels-registry.ts"
    },
    {
      "sha256": "9b13e02181ad4ae17a6c2d3b707950df1f8943732732c65988a9e600274a1d98",
      "path": "web/src/lib/jev-read.ts"
    }
  ],
  "capturedAtUtc": "2026-10-13T16:22:52.7050497Z",
  "head": "00a593bcabe25dbb6d83795268533551098f645b"
}
~~~

Corpos HTTP de documentação primária:

~~~json
[
  {
    "capturedAtUtc": "2026-10-13T16:22:54.8068937Z",
    "bytes": 41883,
    "url": "https://www.w3.org/WAI/ARIA/apg/patterns/tabs/",
    "sha256": "08e9c219bc60e49e570509202a4be732b234e88d1f3f74836577d4d5d13bd0ae"
  },
  {
    "capturedAtUtc": "2026-10-13T16:22:54.8718053Z",
    "bytes": 44620,
    "url": "https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html",
    "sha256": "fb44d4faaa9fa54a49aee794e969ccc3b7738f4b09e23aa96e3a3c9d44984feb"
  },
  {
    "capturedAtUtc": "2026-10-13T16:22:55.3119331Z",
    "bytes": 184066,
    "url": "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
    "sha256": "fcb4e0583cd8c2629b948487f197b1c1fd6ca11d7e7680cc89621c12442162d5"
  }
]
~~~

