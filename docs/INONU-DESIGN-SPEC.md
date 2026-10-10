# Inonu Trader: especificação visual e de interação

Status: proposta preparada para implementação e revisão independentes. Nenhum código do produto foi alterado e esta especificação não certifica acessibilidade, comportamento em navegador ou desempenho. Pesquisa em 2026-10-09; baseline Git observado: b587759e459ea049590102e54a0b07800864cdc3. As mudanças locais preexistentes fazem parte do snapshot; os hashes atuais, e não apenas HEAD, delimitam a evidência.

## Objetivo autorizado e limites

Reformular o frontend como Inonu Trader, inspirado na personagem digital autoral Ori Inonu: azul profundo, ciano, dourado, inteligência, serenidade e conexões. Produzir marca nova e uma interface visualmente marcante, legível e interativa em desktop e mobile. Preservar carteira somente leitura, stream e funções existentes.

Não alterar executor, parâmetros financeiros, cálculo de preços/PnL, assinatura, ordens, conexão wallet, protocolo de eventos ou regras de risco. Não prometer ganho, lucro, segurança de investimento ou latência constante. Não adicionar dependências, fotos, retrato integral da personagem, símbolos religiosos, espiritualidade explícita, glifos ritualísticos, estrelas astrológicas ou referências de culto. Não publicar, fazer commit/push ou copiar estado privado para o repositório.

A imagem foi vista como referência visual. Seu hash consta em sources.json. Azul escuro, luz ciano, detalhes dourados e linhas de conexão são abstrações utilizáveis; a autorização recebida não é presumida como licença para publicar a personagem inteira.

## Pesquisa e decisão

A fonte primária universitária Yorùbá Yé Mi rotula a cabeça com “orí” no diagrama da página impressa 195 e registra “inú igbó inside the bush/forest” na página 190. Isso sustenta vocabulário parcial, sem validar a grafia ou tradução da expressão completa “Ori Inonu”. A forma exata não foi validada nas fontes primárias consultadas. Manter **Ori Inonu como nome autoral**, sem identificá-la como entidade tradicional ou exibir uma tradução inventada. [University of Texas at Austin, capítulo 8](https://coerll.utexas.edu/yemi/pdfs/yy_ch8.pdf).

A direção recomendada pelo JEV é quiet_observatory, recibo bfddb5dc-1b9c-4e6d-b7b5-1b5a2547affb, confiança 0,99, modelo jev-1.13.0. A seam recomendada é pure_helper, recibo bac599e6-bcd5-4aab-96e7-b8b114cf9f76, confiança 0,60. Registro approved_by=jev_delegated, decision_source=jev e human_response=false. Advice é consultivo; não concede autorização ou certificação. Uso conhecido: 620/61 e 565/59 tokens de entrada/saída. Custo faturado permanece null. Recibos reais sanitizados estão em jev-receipts.json; nenhum fingerprint foi preservado nesse artefato.

Alternativas reais avaliadas: paper_console, com painéis claros e chrome navy, favorecia leitura mas exigia duas linguagens de superfície e seguia menos a referência; spectral_grid, com translucidez e mais glow, aumentava expressão, riscos de contraste e renderização. A direção escolhida admite uma luz ciano estática discreta no hero, mas evita blur e ornamentação contínua. Para os testes, derivação local nos componentes tinha menos arquivos e menos cobertura isolada; reducer central ampliava a abstração sem benefício proporcional. O helper puro permite verificar casos observáveis com Bun já disponível.

A primeira chamada visual foi recusada localmente com status=skipped, reasonCode=unsafe_candidate_id: o ID reservado de abstenção fora incluído manualmente. O pacote foi corrigido removendo esse ID; a resposta válida inclui a abstenção do serviço. Não houve tentativa repetida de obter resposta favorável. Recusa local e resposta válida foram preservadas.

## Contratos observados

Stack: Next 16.3.4, React 19.2.8, CSS Modules, TypeScript e Bun 1.3.14. Inter e Geist Mono já são fornecidas por next/font. FlowChart usa SVG próprio, ResizeObserver e smooth.ts; não há Recharts ou biblioteca de motion instalada. Manter as fontes e mecanismos existentes. A documentação instalada do Next orienta escopo local para CSS Modules e otimização via next/font.

Meta atual: model, wallet, dryRun, market e startedAt. ConnectionState tem connecting, live e reconnecting. parseMeta usa Boolean(raw.dryRun) e não encaminha mode/dataSource. O backend do snapshot também não os envia. Extensões opcionais de tipos são permitidas, mas não criam dados disponíveis. O frontend nunca deve alegar leitura de mode/dataSource que a normalização descartou.

Conectar OKX já declara: “Somente leitura. Conectar não habilita o executor.” Preservar essa semântica, os estados de rede e os handlers. CLAUDE.md proíbe middle dots, em/en dashes em texto renderizado e indicadores piscantes/pulsantes. A animação infinita halo do gráfico atual deve ser removida. MIT e copyright 2026 Jarrod Watts permanecem preservados.

## Direção visual concreta

Criar uma console de observação com shell navy e quatro planos legíveis: canvas, painel, superfície de interação e texto. Header com marca de 48 px, wordmark “Inonu Trader”, descrição curta “Inteligência de mercado. Estado visível.” e badges operacionais separados. Hero compacto, de aproximadamente 80 a 112 px em desktop, sem ocupar uma tela de apresentação. Uma linha de circuito estática pode terminar em um único nó dourado no hero. Não usar retrato, olhos, auréola ou símbolos da referência.

A marca em logo-proposal.svg é uma proposta abstrata de circuito em N, com duas hastes, ligação diagonal e terminais ciano/dourado. Ela tem desenho limpo em 24, 32 e 48 px; o terminal dourado representa conexão visual, não sinal de alerta. Na interface, usar BrandMark com SVG inline, sem filtros, fonte externa ou imagem remota. Ao lado do wordmark, SVG é decorativo com aria-hidden; sozinho, fornecer nome acessível “Inonu Trader”. O arquivo é proposta para revisão, não pacote de marca certificado.

Desktop: shell max-width 1440 px, padding 24 px; header/hero, faixa de métricas em cinco células, depois duas colunas. Coluna principal flexível com gráfico dominante e carteira abaixo; coluna de 420 px com decisão e atividade. Cards têm raio 18 px, shell 24 px, borda decorativa discreta e cabeçalhos alinhados. Chart min-height 300 px no desktop, 240 px no mobile. Saldo/PnL têm tipografia mono de 28 a 36 px, labels pequenos porém legíveis. A hierarquia vem de tamanho, espaços, superfícies e bordas, além das cores.

Abaixo de 900 px: empilhar hero, métricas, gráfico, decisão, carteira e atividade. Métricas viram grade de duas colunas; carteira pode ter seus saldos em duas colunas. Abaixo de 380 px, reduzir padding para 12 px e permitir todos os grupos de controles quebrarem linha. O documento tem rolagem vertical normal. Não fixar altura de body/shell de forma que o conteúdo seja perdido em tela curta, 200% de zoom ou 320 px de largura. Endereços truncados têm valor completo disponível em título/nome acessível e ação de cópia; números longos cabem no card sem overflow global.

## Tokens, tipografia e contraste

tokens.json é a proposta de valores; contrast.json contém o cálculo sRGB sem arredondamento antes dos thresholds.

| Função | Valor |
|---|---|
| Canvas | #07111F |
| Painel | #0C1D31 |
| Superfície elevada/hover | #122941 |
| Texto principal | #F3F7FC |
| Texto secundário | #C7D8E8 |
| Texto discreto informativo | #93AEC4 |
| Ciano funcional | #5FE1F5 |
| Dourado | #E9C677 |
| Compra | #67E6B1 |
| Venda | #FF9C98 |
| Borda de controle essencial | #5C7D98 |
| Divisória decorativa | #25435E |

Inter 400/500/600 para leitura, mono existente 400/500/600 com tabular-nums para endereços, blocos, tempo e valores. Corpo 14 px; label compacto mínimo 12 px. Botão primário ciano com texto canvas, nunca branco sobre ciano/dourado. Texto principal na superfície elevada: 13,7546:1; texto discreto nessa superfície: 6,4064:1; borda essencial: 3,4117:1. Todas as combinações opacas informativas propostas passam 4,5:1 para texto, e bordas essenciais passam 3:1. Transparência, imagem, gradient ou opacity no texto exigem novo cálculo do fundo final.

A referência normativa é WCAG 2.2: contraste 1.4.3/1.4.11, uso de cor 1.4.1, reflow 1.4.10, teclado 2.1.1, foco 2.4.7/2.4.11, target 2.5.8 e status 4.1.3. Meta ergonômica de 44 px excede o mínimo de 24 px de 2.5.8. Redução de motion é também requisito do produto; não apresentar um cálculo de tokens como certificação WCAG da página. [W3C WCAG 2.2, versão 2024-12-12](https://www.w3.org/TR/2024/REC-WCAG22-20241212/).

## Estados e comportamento observável

Separar execução, transporte de dados, origem e carteira:

| Evidência | Apresentação |
|---|---|
| Meta ausente | Execução não verificada; fonte não informada |
| dryRun=true, sem conflito explícito | Simulação |
| dryRun=false sem mode confiável | Execução não verificada |
| mode desconhecido ou contraditório com dryRun | Execução não verificada |
| mode opcional explícito e consistente | Pode descrever apenas o modo declarado, nunca certificar ordens reais |
| connection=live | Feed conectado |
| connecting | Conectando ao feed |
| reconnecting | Feed desconectado. Reconectando |
| dataSource ausente | Fonte não informada |
| OKX conectada | Carteira conectada para consulta; somente leitura |

Modelo é o valor de meta.model quando disponível, sem rebranding do provedor nem afirmar JEV quando outro modelo estiver informado. Mercado vem de meta.market. Não usar wallet existente ou SSE conectado como evidência de execução real. Dados históricos permanecem visíveis na desconexão com contexto textual, sem inventar atualizações. Nenhuma curva demo substitui feed vazio. Empty states: “Aguardando dados do feed” e “Nenhum evento para estes filtros”.

DecisionPanel distingue BUY/Compra, SELL/Venda, HOLD/Manter, LATE/Resposta tardia e ausência/Aguardando decisão. HOLD válido nunca aparece como LATE. A ação e probabilidades são informadas pelo feed; não garantir preenchimento por bloco ou eliminar abstenção no texto. Probabilidades inválidas/ausentes têm indisponível, sem zeros inventados. PnL continua vindo do feed, com rótulo “PnL informado”, moeda/unidade e sinal; verde/vermelho têm texto explícito. Fill.simulated e quote.status=sim são rotulados “Simulado”; pending/sent, placed, reverted e lost não são convertidos em execução confirmada.

Interações pequenas e reais:

1. Feed tem lado Todos/Compra/Venda/Manter e tipo Todos/Ordens/Execuções. Filtrar antes de recorte/capacidade, preservar ordem temporal e não mutar dados. Para Ordens, lado corresponde a quote.side; para Execuções, fill.side; em Todos, lado pode corresponder ao decision.action ou a um registro quote/fill daquele bloco. Manter requer decision.action=hold e não satisfaz filtros exclusivos de ordem/fill. Contagem visível se refere ao resultado do filtro; nenhum evento encontrado recebe empty state. Seleções são controles nativos, com label e estado acessível.
2. Detalhes de estratégia usam details/summary nativos, recolhidos por padrão, contendo explicação factual do que o painel observa e de suas limitações. Abrir/fechar funciona por teclado/toque; não altera configuração, stream ou executor.
3. Gráfico oferece 32/64/128 blocos como janelas, default 64. Cada opção muda o subconjunto real exibido, preservando eventos, cálculo de preço e PnL. Se houver menos eventos, dizer “12 de 64 blocos disponíveis”; nunca converter contagem em intervalo de tempo fictício. Largura e STEP podem adaptar o espaço visual; smooth.ts permanece intacto.
4. Inspeção de bloco funciona em mouse e touch, e tem equivalente por teclado via controles Anterior/Próximo e resumo visível do bloco inspecionado. Não depender apenas de hover em SVG aria-hidden. Mudança de janela limita seleção a um bloco ainda existente.
5. Cópia de endereço mostra “Copiado” somente após writeText resolver; indisponibilidade/rejeição mostra falha honesta em status acessível. Preservar conectar, trocar para Monad, atualizar saldo e desconectar com seus handlers/condições existentes.

Foco: outline ciano 2 px com offset 3 px, sem clipping por overflow. Botões/links/summary e controles têm região de ação mínima 44x44 px; rows não interativas podem ser menores. Linha desktop alvo 36 px, mobile 48 px, atualizando qualquer cálculo ROW_H correspondente. Não anunciar cada bloco em aria-live; reservar live region para conexão/modo, cópia e erros. Movimento: hover 160 ms, painel 180 ms, evento pontual máximo 240 ms, sem blink/pulse/infinite. prefers-reduced-motion remove animações/transições e mantém mudanças informativas instantâneas. Não animar altura de details, piscar preço ou reiniciar animação por bloco.

## Aceitação independente congelável

| ID | Critério imutável | Evidência exigida do implementador/revisor |
|---|---|---|
| D1 | Marca Inonu Trader visível e SVG abstrato reconhecível em 24/32/48 px; nenhum símbolo religioso/ritualístico ou retrato integral; MIT e crédito Jarrod Watts preservados. | Inspeção dos SVG, metadados, screenshot e LICENSE/diff. |
| D2 | Tokens opacos, tipografia existente e contrastes mínimos 4,5:1 texto/3:1 limites essenciais em estados normal/hover/foco; nenhum texto informativo com opacity atenuado nem dependência nova. | Cálculo de cores finais, CSS/diff e package lock sem adição. |
| D3 | Hero compacto e hierarquia de quatro painéis; 1440x900, 1024x768, 390x844 e 320x568 sem overflow horizontal global, perda de função ou clipping; 200% de zoom mantém acesso por rolagem. | Screenshots reais desktop/mobile e inspeção de overflow/zoom. |
| D4 | Simulação, execução não verificada, fonte e feed têm rótulos distintos e conservadores; live/wallet nunca provam ordens reais; HOLD não é LATE; sim/revert/lost/pending permanecem honestos. | Casos de helper em Bun mais navegador com feed real/ausente/desconectado e fixtures explicitamente rotuladas na verificação. |
| D5 | Filtros lado/tipo produzem conjunto correto antes do recorte; details abre/fecha; 32/64/128 altera somente janela real; cópia tem sucesso/falha reais; ações wallet/stream preservadas. | Casos puros independentes e exercício por mouse, teclado e touch. |
| D6 | Controles 44 px, nomes e estado acessíveis, foco visível/não oculto, inspeção de gráfico por teclado/touch, reduced motion sem animação, nenhuma pulsação infinita ou live-announcement por bloco. | Navegação completa por teclado, emulação reduced motion, inspeção DOM/CSS e mobile. |
| D7 | Nenhuma lógica executora/financeira/wallet/protocol alterada; não há promessa de lucro, live real inferido, probabilidade/dado demo fabricado, alteração de valor/unidade ou middle dots/em/en dashes renderizados. | Diff de ownership/protected files, revisão de cópias e comparação de valores dos mesmos eventos. |
| D8 | Typecheck, build, testes wallet existentes e novos testes do helper passam; ausência/erro de feed continua utilizável; revisão independente contra D1-D8 e hashes fixos, sem aprovação do autor da SPEC. | Outputs reais com commit/diff/hash candidato e decisão do revisor independente. |

D1-D8 não podem ser enfraquecidos para acomodar implementação. Critérios congelados delimitam verificação independente; a escolha JEV não os certifica.

## Ownership e plano mínimo

Um único implementador frontend, em workspace isolado, tem ownership exclusivo de:

- web/src/app/globals.css, page.tsx, page.module.css e layout.tsx.
- web/src/components/Header/Header.tsx e Header.module.css.
- web/src/components/StatsRow/StatsRow.tsx e StatsRow.module.css.
- web/src/components/DecisionPanel/DecisionPanel.tsx e DecisionPanel.module.css.
- web/src/components/Feed/Feed.tsx e Feed.module.css.
- web/src/components/FlowChart/FlowChart.tsx e FlowChart.module.css.
- web/src/components/WalletPanel/WalletPanel.tsx e WalletPanel.module.css para apresentação, cópia e classes, preservando todos os handlers.
- Novos web/src/components/BrandMark/BrandMark.tsx e BrandMark.module.css se necessário.
- Novos web/src/lib/presentation.ts e presentation.test.ts; web/src/lib/types.ts somente extensões opcionais compatíveis de apresentação.

Root integra e mantém docs/scripts. Não há writer concorrente nesses arquivos frontend; alterações wallet de outro agente devem terminar e ter novo snapshot antes de iniciar o writer. Proteger src/**, web/src/lib/useFeed.ts, useOkxWallet.ts, okx-wallet.ts, okx-wallet.test.ts, format.ts, useUptime.ts, FlowChart/smooth.ts, package files e LICENSE. Uma necessidade de encaminhar metadados novos é dependência de integração do root; não autoriza o frontend a reescrever o hook/protocolo.

Sequência: obter snapshot pós-integração wallet; red tests do helper para dryRun/conflito/HOLD/filtros; marca/tokens/estrutura; estados e interações reais; verificação de typecheck/build/testes e navegador; revisão independente com baseline/SPEC/hash. Comandos existentes no web: bun run typecheck, bun run build, bun test src/lib/okx-wallet.test.ts; executar também bun test src/lib/presentation.test.ts quando criado. Nenhum teste de screenshot que apenas espelhe CSS é necessário.

## Evidência e handoff

source-hashes.json registra hashes SHA-256 dos contratos e componentes observados. sources.json registra fontes primárias, snapshots públicos, hashes da imagem/skills, trechos literais e limites de recuperação. tokens.json, contrast.json e logo-proposal.svg são propostas. jev-receipts.json preserva a decisão real sem fingerprint e com custo desconhecido null.

Apenas o cálculo de contraste da proposta foi exercitado nesta pesquisa. Build, browser, responsividade, acessibilidade e preservação runtime aguardam implementação e revisão independente. Se o baseline mudar, registrar hashes novos e checar mudanças relevantes antes de implementação, sem invalidar silenciosamente D1-D8.

