# SPEC: inteligência de decisão do Inonu (Veredito, Gravador, Aprendiz, Smart Money v2)

Estado: **v1** (2026-10-13). Sessão de origem: "megaplan" de inteligência de decisão. Baseline: `main` em `00a593b`, árvore com centenas de caminhos sujos de outras sessões (ver [README.md](README.md), seção de coordenação). Este SPEC não concede autorização financeira, de publicação nem de gasto com o modelo.

## 1. Objetivo observado e decisões do usuário

Pedido: atuar como especialista de mercado, de dados e de aprendizado de máquina; percorrer cada página, componente e recurso; achar oportunidades de melhorar a decisão de quando comprar e vender com IA e ML, melhorar o Smart Money e a experiência para quem é leigo, entregando mais inteligência com menos informação na tela.

| ID | Decisão (respondida em 2026-10-13) |
| --- | --- |
| D-I1 | Entrega em **cortes verticais**: cada corte mostra algo na tela e já grava dados por baixo |
| D-I2 | Horizonte: **intradia, 15 min a 4 h** (etiqueta principal 1 h) |
| D-I3 | Jev **só por clique** (ASK-1 do SPEC `inonu-desktop-v1` mantida). Filtro local grátis só oferece o botão |
| D-I4 | ML **em TypeScript dentro do app**; modelo em JSON versionado; sem Python no instalável |
| D-I5 | Veredito em spot, perpétuos e tokens on-chain; **ML treina só na OKX** (rótulo grátis) |
| D-I6 | **Consultivo com plano de risco**; nada é enviado; ticket para assinar fica fora |
| D-I7 | Arquivos quentes: edições mínimas, aditivas, com conferência de `git status` e da data de modificação; commit só dos caminhos próprios |
| D-I8 | **Nenhuma chamada real ao Jev** na verificação: todo teste usa `evaluate` falso |

Regras herdadas (não quebrar): o código descreve e o **Jev decide comprar, vender ou esperar** (FLX-10, ASK-4); conta e número ficam no código; todo texto exibido em português sem acento, sem ponto médio, travessão ou meia-risca e sem indicador piscante ou pulsante; o trader Kuru, `src/portfolio-evidence`, `src/mobile-decision-report`, `src/operator` e `src/real` ficam intocados.

## 2. Fatos verificados (F) que motivam o SPEC

| F | Fato | Evidência |
| --- | --- | --- |
| F-I1 | O modelo recebe uma única pergunta Choice com `hold`, `buy:<id>` e `sell:<id>` (até 254 opções) e **as probabilidades que o SDK devolve são descartadas** | `src/inonu/jev-model.ts:70-100`; `node_modules/ai/dist/index.d.ts:7607-7623` |
| F-I2 | O campo `razao` da decisão é texto fixo do código ("modelo escolheu ... entre N candidatos"); o cartão diz "Inonu decidiu comprar a zona 3f8a1c" | `src/inonu/ask.ts:427`; `web/src/lib/inonu/view.ts:37-39` |
| F-I3 | Os candidatos de zona vêm só de footprint e perfil de volume, em velas de 1 min; o SMC mora no navegador | `src/intel/analyst.ts:119-120` (`ENGINE_FAMILIES = ["E2","E3"]`, `INTERVAL_MS = 60_000`) |
| F-I4 | O Brief do Inonu não tem tendência, volatilidade nem custo; o pacote Python tem e só alimenta o `jev-read`; o instalável não tem Python | `src/inonu/source.ts:193-207`; `python/jev_analytics/features.py` |
| F-I5 | Pesos de zona e de trilha são priors, sem comparação com resultado de preço | `docs/sdd/inonu-desktop-v1/evidence/T6.6-zonas-nao-medido.md` |
| F-I6 | Decisões do Inonu não têm resultado medido; o desfecho (bruto, 5 min) existe só para leituras do `jev-read` | `web/src/lib/inonu/decision-store.ts`; `web/src/lib/desk/chart/decisions.ts:67-89` |
| F-I7 | Há infraestrutura de estatística rigorosa e tabela de custos **não ligada** ao Inonu: Newey-West, Holm, Wilson, Brier, calibração e `COST_TABLE` | `src/lab/stats.ts`, `src/lab/outcomes.ts:55-72` |
| F-I8 | Documentação do TypeSafe (jev-1.13): perguntas atômicas, Noul e Score com probabilidade, confiança para decidir se age, viés para a primeira opção do Choice, fraqueza em números e em estado grande | `docs.typesafe.ai`, página "Jev 1.13 jaggedness" |

## 3. Requisitos observáveis

### Gravador e rotulador (REC)

| ID | Requisito |
| --- | --- |
| REC-1 | O app grava, a cada vela de 5 min fechada dos instrumentos seguidos, um snapshot com o FeatureVector v1, o preço e o custo de ida e volta; e grava um snapshot a cada pedido ao Inonu |
| REC-2 | Os snapshots são append-only em JSONL diário sob `<dados>/outcomes`, escrita atômica de rotação, teto de 200 MB, linha corrompida contada e pulada, pasta sem escrita nunca quebra o clique |
| REC-3 | Cada snapshot ganha rótulos em 15 min, 1 h e 4 h: retorno líquido (tabela `COST_TABLE`), excursões máximas a favor e contra, triple barrier (parada = invalidação da zona ou 1 ATR de 15 min, alvo = 1,5 vezes a parada, limite de 4 h) e reação na zona |
| REC-4 | Nenhum valor de um snapshot em `t` muda se as velas posteriores a `t` forem removidas (sem olhar o futuro) |
| REC-5 | Valor desconhecido é `null` com motivo, nunca zero. `INONU_RECORDER=off` não grava nada |
| REC-6 | O Placar mostra n medido, acerto líquido com intervalo de Wilson, retorno médio com Newey-West, Brier e tabela de confiabilidade. Abaixo de n = 30 diz `nao_medido` |

### Veredito (VER)

| ID | Requisito |
| --- | --- |
| VER-1 | A resposta do pedido ganha um `veredito` com selo (comprar, vender, esperar), motivos (até 3), "o que pode dar errado", plano de risco e aviso consultivo, sem quebrar o formato atual |
| VER-2 | A ação (comprar, vender, esperar) **só vem da resposta do Jev**; o código nunca a deriva de nota, zona ou score. O código só força **esperar** |
| VER-3 | Portões que forçam esperar, cada um com mensagem própria: aquecimento, dado velho, custo maior que o movimento esperado, confiança baixa, desacordo entre as duas ordens de opções, honeypot ou risco alto, sem zona, sem chave, modelo falhou |
| VER-4 | O plano de risco é calculado só em código: faixa de entrada, invalidação, alvo, ganho/risco **líquido de taxas e spread**, tamanho por % de risco do perfil. Sem perfil não mostra tamanho. É cálculo, não previsão, e o cartão diz isso |
| VER-5 | Motivos em palavras simples vêm de um dicionário fixo fator para frase; todo fator do FeatureVector tem frase |
| VER-6 | Nenhum texto exibido promete lucro. Número que depende de medição ainda não feita aparece como "nao medido" |

### Jev em perguntas pequenas (JEV)

| ID | Requisito |
| --- | --- |
| JEV-1 | Um clique = no máximo uma chamada `evaluate` com até 16 perguntas: postura (Choice), postura com opções em ordem inversa e Nouls estreitos por zona (até 3 zonas) |
| JEV-2 | A confiança do Choice usa a fórmula da documentação do TypeSafe; desacordo entre as duas ordens vira esperar |
| JEV-3 | O estado enviado usa faixas nomeadas em vez de números soltos; o texto livre do modelo nunca é copiado; `validateDecision` continua descartando id desconhecido |
| JEV-4 | As probabilidades por pergunta são gravadas com o registro da decisão (só campos documentados) |

### Aprendiz local (ML)

| ID | Requisito |
| --- | --- |
| ML-1 | Regressão logística L2, árvores de gradiente pequenas e calibração isotônica em TypeScript, treino determinístico (semente) e modelo em JSON com cartão (atributos, janela, n efetivo, métricas, hash) |
| ML-2 | Validação walk-forward com purga e embargo iguais ao horizonte e comparação pareada contra linhas de base (taxa base, momentum, regra só SMC, níveis aleatórios) com Holm |
| ML-3 | **Portão de promoção:** Holm p < 0,05 para média líquida > 0, supera a melhor linha de base e Brier skill > 0. Senão o Aprendiz fica oculto e a tela diz "sem vantagem medida" |
| ML-4 | Em 200 passeios aleatórios semeados, no máximo 5% de promoções; com sinal plantado e n = 2000, ao menos 80% de detecção |
| ML-5 | Monitor de deriva (PSI e Brier móvel) desliga o Aprendiz sozinho quando degrada |
| ML-6 | O treino e o score rodam locais, sem chamar o modelo nem a rede, fora do processo da interface quando pesados |

### Smart Money v2 (SMV)

| ID | Requisito |
| --- | --- |
| SMV-1 | Zonas em 15 min e 1 h fundem SMC (E1), perfil de sessão (E3) e VWAP ancorado (E5); `ENGINE_FAMILIES` declara o que de fato existe |
| SMV-2 | Atributos de fluxo no toque da zona: absorção, exaustão, divergência de delta, ordens grandes |
| SMV-3 | O modificador de regime (E7) nasce **desligado** e só liga se a validação do Aprendiz mostrar ganho |
| SMV-4 | Qualidade de carteira on-chain com recência, deduplicação por cluster, posição no lucro ou prejuízo e acumulação contra distribuição; endereços completos continuam só no servidor |
| SMV-5 | Um chip "Dinheiro grande" no gráfico com "por quê"; camadas avançadas escondidas por padrão |
| SMV-6 | T6.6 passa a ser medido com o footprint gravado; sem dados suficientes, o texto diz "nao medido, n = ..." |

### Experiência para leigo (UX)

| ID | Requisito |
| --- | --- |
| UX-1 | Modo simples (padrão) e avançado, em `inonu.ui.mode.v1`, com orçamento de itens por superfície em `panels-registry` |
| UX-2 | Todo rótulo técnico exibido tem explicação de uma frase (glossário) e o teste de cobertura falha se faltar |
| UX-3 | De um perfil novo ao Veredito em no máximo 3 cliques |
| UX-4 | Rastreador ganha a visão Oportunidades e telas prontas; Configurações ganha perfil de risco e cartão do Aprendiz; Doctor ganha linhas do Gravador e do Aprendiz |
| UX-5 | Sem rolagem horizontal em 1600x900, 1280x720, 1100x700 e 390x844 |

## 4. Aceitação independente

| ID | Critério |
| --- | --- |
| AC-INT-1 | Com 4 instrumentos seguidos, 1 h gera ao menos 48 snapshots e no máximo 1 MB; `INONU_RECORDER=off` grava 0 linhas; truncar velas futuras não altera nenhum atributo |
| AC-INT-2 | Rótulos batem com vetores calculados à mão; custos vêm de `COST_TABLE`; resultado incompleto é `null` com motivo |
| AC-INT-3 | 12 cenários (comprar claro, vender claro, aquecimento, dado velho, custo maior que o movimento, confiança baixa, desacordo de ordem, honeypot, sem zona, manter, sem chave, modelo falhou) produzem o cartão esperado; cada razão de esperar tem mensagem própria; todo número do plano é recalculável por script independente; a ação nunca nasce no código |
| AC-INT-4 | Um clique chama `evaluate` uma vez com até 16 perguntas; ordens discordando resultam em esperar; probabilidades por pergunta persistem; tokens por clique medidos e comparados com a linha de base de 1480 a 1550 (informação, não meta) |
| AC-INT-5 | Falso positivo e poder do ML conforme ML-4; mesma semente gera o mesmo hash; teste de purga prova ausência de vazamento |
| AC-INT-6 | Zonas de 15 min e 1 h incluem E1; carteiras irmãs contam uma vez; relatório de T6.6 sai de dados gravados |
| AC-INT-7 | Orçamento de itens do modo simples, glossário completo, 3 cliques, sem rolagem horizontal |
| AC-INT-8 | Nenhum texto exibido promete lucro; Placar diz "nao medido" abaixo de n = 30; Aprendiz diz "sem vantagem medida" enquanto o portão não passar |
| AC-INT-9 | Contador de chamadas ao modelo continua em 0 depois de 10 min ocioso com gravador e Aprendiz ligados; o único caminho segue `POST /inonu/ask` com cabeçalho de intenção |
| AC-INT-10 | Sem regressão: `bun --no-env-file run test`, `run --cwd web test`, `typecheck:all`, `desktop:smoke` 24 de 24, `verify-citations`, `freeze --check`, `okx-coverage --check` |

## 5. Fora de escopo e limites

Execução ou assinatura de ordem, ticket de ordem (T9.6), alavancagem, aprendizado por reforço online, redes sobre ticks, sentimento por texto social, remoção do Kuru e reescrita da "mensagem central" do `CLAUDE.md`. Não há vantagem demonstrada no projeto: este SPEC entrega **a máquina de medir e a clareza**, não a promessa de lucro. O estado de evidência de cada item é dito pelo protocolo do usuário: configuração válida, carga em sessão nova, funcionamento ao vivo, ganho medido (previsto: nenhum ganho medido).
