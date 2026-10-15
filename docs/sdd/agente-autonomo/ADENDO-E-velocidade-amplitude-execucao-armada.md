# ADENDO E: velocidade, amplitude e execucao armada (2026-10-15)

Precedencia (conciliada em 2026-10-15 a pedido da coordenacao 129): nos pontos de interpretacao do relato, de qualificacao de vantagem e de autorizacao ja recebida, prevalecem as precisoes da coordenacao 127 e da secao "Decisao complementar: mercado continuo, consulta por evento e aprendizado" de `docs/sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md`. Este adendo foi ajustado a elas; onde algum trecho ainda divergir, vale aquela secao.

Origem: o dono colou um relato de rede social (estudante de 19 anos, bot de Claude Code, US$ 68 viraram US$ 750 mil, 50+ mercados, BTC da Binance a cada segundo, "erros de preco", 24/7) e pediu que o raciocinio dele melhore as decisoes de arquitetura do Inonu com o System One do Jev. Este adendo separa o que o relato ensina do que ele nao prova, mede o sistema como ele e hoje e fixa decisoes com criterio de aceitacao. Nao promete lucro.

## 1. Leitura honesta do relato

- Os numeros (US$ 68 para US$ 750 mil, lucro da primeira noite) nao sao verificaveis aqui: nao ha carteira, nem mercado, nem periodo, nem custo. Relatos assim sofrem de vies de sobrevivencia. Nada neste adendo depende de que sejam verdadeiros.
- O relato NAO identifica venues, ativos, ordens, duas pernas nem recibos. Arbitragem de latencia entre uma referencia rapida (BTC na Binance) e mercados que reagem devagar e uma HIPOTESE a investigar, nao uma estrategia verificada nem um fato desse caso. Se fosse isso, a vantagem existiria so enquanto a distorcao durasse segundos e so para quem tem custo de execucao menor que a distorcao, e encolheria quando outros fizessem o mesmo.
- O que se transfere para o Inonu e a ARQUITETURA, em tres ideias: (a) camada rapida e barata que olha muitos mercados o tempo todo, sem modelo no meio; (b) o modelo entra quando algo material muda, nao por relogio; (c) a execucao e decidida antes e disparada por gatilho, sem hesitar no instante.
- O que NAO se transfere (hipotese de trabalho, a confirmar nas medicoes abaixo): competir em latencia em DEX de baixa liquidez. Em Solana os blocos duram cerca de 400 ms e a disputa por distorcao e de bots dedicados; um computador local com ciclo de 2 minutos e ordens de poucos dolares nao ganha essa corrida, e os custos medidos aqui (imposto do token de ate 5%, impacto de ate 10% aceito pelo executor, taxa de rede) engolem qualquer distorcao de segundos.

## 2. O sistema hoje, medido (nao estimado)

| Fato | Valor | Fonte |
| --- | --- | --- |
| Resposta do Jev por consulta | mediana 0,4 s, p90 0,5 s, maximo 1,4 s (34 consultas, Brief de cerca de 11,3 KB) | `decisions-meta.jsonl` (asked/answered) |
| Cadencia do agente | 2 min quente, 5 min frio | scheduler |
| Teto de consultas por dia | 720 (igual a 1 a cada 2 min): configuracao local observada, nao limite contratual do provedor comprovado | `/agent/status` budget |
| Tokens por consulta | cerca de 13,8 mil (1,19 M em 86 consultas) | budget do dia |
| Universo de compra | ate 4 redes (so onde ha caixa), 100 linhas da lista quente por rede, 12 candidatos, 5 a 7 mostrados ao Jev | `source-ecosystem.ts`, `cycle.ts` |
| Hoje o caixa esta em | uma rede (Solana); os candidatos eram pools de US$ 63 a 5.800 de liquidez, todos marcados parabolicos ou de volatilidade extrema | Brief do ciclo das 06:33 |
| Camada rapida existente, FORA do agente | WebSocket publico da OKX (tickers, trades com lado agressor, books5), 1 min de velas, footprint, zonas, fatores de fluxo | `src/jev-read/feed.ts`, `src/inonu/okx-ws.ts`, `src/intel/*` |
| Saidas por plano | o codigo executa stop, alvo e tempo entre as consultas sem perguntar ao modelo; vigia a cada 45 s | `plans.ts`, `exit.ts`, `guard()` |

Conclusao dos fatos: o modelo NAO e o gargalo de velocidade (0,4 s). O gargalo e (1) o teto LOCAL de 720 consultas por dia, que fixa o ritmo em 2 minutos (e uma configuracao, nao um limite do Jev), (2) o ritmo por relogio em vez de por evento, (3) o universo estreito (so a rede com caixa e so a lista quente) e (4) a camada rapida que ja existe nao alimenta o agente.

## 3. Decisoes de arquitetura

Regra mantida: o Jev decide; o codigo valida autoridade, identidade, frescor, valores, risco e recibos, e EXECUTA planos que o modelo abriu. Nenhuma decisao abaixo faz o codigo comprar por conta propria.

### E0. Medir antes de gastar (sombra de distorcoes)
Registrar, sem dinheiro, o que cada tipo de distorcao parece oferecer e o que aconteceu depois, mantendo TRES CLASSES SEPARADAS, porque medem coisas diferentes e nao podem compartilhar uma metrica:
1. Impulso ou defasagem de um ativo contra BTC ou SOL: sinal DIRECIONAL, com possibilidade de perda; correlacao nao e arbitragem. Evidencia: relacao historica, regime, liquidez e trajetoria posterior.
2. Preco atual contra o preco de entrada de carteiras rastreadas (`sp`): REFERENCIA historica; nao garante que aquela carteira possa sair no preco exibido. Evidencia: identidade e data da entrada, cobertura e custos.
3. Diferenca entre venues do MESMO ativo: spread estimado. Evidencia: bid/ask executaveis para a quantidade, unidades compativeis, profundidade, capital e autoridade nas duas pontas. `vantagemLiquidaEstimada(q) = recebimentoExecutavelDaVenda(q) - custoExecutavelDaCompra(q) - custosAindaNaoIncluidos`; nao descontar spread, impacto ou taxa de novo se ja estao nos valores executaveis; custo desconhecido permanece desconhecido. So recibos das duas pernas demonstram execucao e resultado; uma perna preenchida e outra falha cria exposicao, nao lucro garantido. O executor Solana atual nao implementa arbitragem atomica entre CEX e DEX.
Para cada observacao: `{t0, classe, ativo, referencia, gapBruto, custos conhecidos (com os desconhecidos marcados), edge estimado}` e a variacao observada em +5 s, +30 s e +2 min. Variacao de preco nessas janelas e DIAGNOSTICO, nao lucro liquido executado.
Aceitacao: relatorio por classe com contagem, cobertura e lacunas. Mediana positiva isolada NAO qualifica vantagem nem promocao: a avaliacao fixa considera profundidade, custos, falhas, dependencia temporal (amostras sobrepostas no tempo nao sao independentes), janela de validacao separada (holdout) e testes repetidos. Sem amostra declarada o texto diz "nao medido".

### E1. Pulso de mercado (camada rapida alimentando o agente)
Um servico unico, com uma conexao ao WebSocket publico da OKX (gratuito, sem chave), que mantem barras de 1 s em memoria para BTC, ETH, SOL e os N ativos mais negociados e calcula regime: retorno 1 min e 5 min, volatilidade realizada, desequilibrio de fluxo agressor. Entra no `contexto` do Brief como numeros e codigos curtos, e alimenta o gatilho da E3. Reaproveita `src/inonu/okx-ws.ts` e `src/intel/ingest.ts`; nao cria segunda conexao por consumidor.
Aceitacao: teste com socket falso (reconexao, lacuna, relogio); no ao vivo, atraso medido e exibido; consumo de cota do provedor de dados on-chain: zero adicional.
Estado (2026-10-15): IMPLEMENTADA e DESLIGADA por padrao. `src/pulse/regime.ts` (puro: retorno de 1 e 5 min, equilibrio de fluxo agressor em 5 min, volatilidade realizada em 15 min, a partir de barras de 1 min fechadas; lacuna ou serie vencida e nulo, nunca calmo), `src/pulse/pulse.ts` (uma conexao propria ao feed publico, tempo de EVENTO e nao o relogio da maquina, minuto quieto fechado por temporizador), chaves `btc_1m btc_5m btc_fl btc_rv sol_1m sol_5m sol_fl sol_rv` no `contexto` do Brief. Liga com `INONU_AGENT_PULSE=1` (ou a opcao `pulse` do host) e so com o feed ao vivo ligado. O `contexto` aceitava 12 chaves e descartava TODO o contexto acima disso; com os dois alvos horarios ja somados eram 11, entao o limite subiu para 24 (`boundedContext` em `model.ts`). Mudar a legenda do `contexto` muda o `questionsDigest` e portanto o `decisionVersion` no proximo reinicio. Fatos com identidade e eventos (lado produtor de E1 e E3, `src/pulse/facts.ts`): cada fato diz venue, instrumento, tipo de mercado, fonte, unidades, instante de ORIGEM da ultima negociacao usada (relogio da bolsa, nao o da maquina), instante local de recebimento, geracao da conexao (cresce a cada reconexao, entao a lacuna fica visivel), qualidade da serie (barras e minutos faltando nos ultimos 15) e um hash do conjunto; nao tem cadeia nem endereco (um ticker de CEX nao e um token). Reler o fato nao o rejuvenesce: a mesma negociacao da o mesmo hash. `createMateriality` transforma fatos em EVENTOS: movimento de 5 min de pelo menos K vezes a volatilidade normal de 5 min do proprio mercado (K e parametro da avaliacao, padrao 3), contado uma vez por direcao dentro de um cooldown; cada evento aponta o hash do fato de origem, que e a referencia que precisa chegar ao Brief para contar como consumido. A prova de consumo e o contrato de evidencia ficam em `src/decision-review/**` (Codex); nada disso esta ligado ao despachante nem ao ciclo.
Nao ha evidencia ainda de que o Jev use essas chaves a favor do resultado: ganho nao medido.

### E2. Universo de observacao separado do universo negociavel
Observar candidatos de qualquer rede suportada, mesmo sem caixa nela; marcar `negociavel: false` com motivo `sem_caixa_na_rede`. O Jev nao recebe acao de compra para esses, mas o painel mostra ao dono "oportunidades fora das redes com caixa", que e a informacao para decidir financiar outra rede (o agente nunca faz ponte entre redes sozinho).
Aceitacao: teste de fonte com duas redes e caixa em uma; Brief e painel distinguem as duas listas; nenhuma ordem sai para rede sem caixa.

### E3. Consulta por evento, com prova de consumo
Um vigia barato (1 a 5 s, sem modelo) calcula "materialidade": o preco de um candidato ou posicao cruza uma zona, o fluxo muda de sinal acima de limiar adaptativo, o regime do BTC muda, um plano chega perto de stop ou alvo. Materialidade gera um EVENTO com referencia imutavel ao fato (identidade: venue, instrumento, tipo de mercado, unidades, fonte, instante de origem quando fornecido, recebimento local, geracao da conexao, qualidade e hash); o relogio de 2 min continua para conciliacao e recuperacao.
Prioridade da integracao: nao basta chamar o ciclo mais cedo. A descoberta pode devolver cache de 5 a 30 min; um evento so conta como CONSUMIDO quando o fato (pelo hash) entrou no Brief realmente consultado. `consulted=true` sozinho nao prova isso; evento adiado, expirado, invalido e analisado sao estados diferentes, e nao se confirma o lote inteiro se so parte entrou. Contexto macro (BTC) tem identidade propria: um ticker de CEX nao e um token Solana. O contrato de evidencia e consumo em `src/decision-review/**` e da Codex; o lado produtor (pulse, fatos com identidade) e meu.
Aceitacao (modelo falso): um evento sintetico gera consulta em no maximo X s (X fixado no plano de teste); 50 instrumentos em rajada nao geram voos financeiros paralelos; duas versoes do fato entram no Brief correspondente; sinal nao incluido nao e marcado consumido; cache nao rejuvenesce; gap e reconexao ficam visiveis; stop e revogacao continuam eficazes; o dedupe por hash (`sem_mudanca`) continua valendo.
Ritmo: o teto de 720 consultas por dia e uma configuracao local observada, nao um limite contratual do Jev. Reorganizar ritmo e contexto nao exige novo portao humano; a ativacao segue qualificacao, ownership, autoridade real e recursos ja autorizados. Novo servico pago, nova autoridade ou credencial pessoal continuam sendo decisoes distintas.

### E4. Entradas armadas (execucao sem hesitar)
O Jev, na consulta, pode armar uma entrada: `{ativo, gatilho (preco ou zona), validade, tamanho, perfil de alvo e stop, fatos de origem}`. Um vigia a executa quando o gatilho ocorre, pela MESMA esteira do executor (limites de impacto, imposto, taxa, saldo de taxa, compras pendentes, ledger idempotente); nao existe segundo executor. A entrada armada e um plano versionado do modelo, como o plano de saida que ja existe; o codigo apenas dispara.
Uma entrada armada EXPIRA, ou pede nova avaliacao, quando os fatos de origem mudam; uma oportunidade vencida exige nova avaliacao. Todos os planos armados reservam a MESMA disponibilidade fisica de saldo: numero de observadores ou de planos nao multiplica o caixa.
Aceitacao (executor falso): dispara uma vez e nunca duas; vencida nunca dispara; fato de origem alterado leva a reavaliacao; recusa do executor e respeitada e registrada; sobrevive a reinicio (persistida); cancelavel pela parada de emergencia existente; nenhuma entrada armada maior que o caixa executavel no instante do disparo, contado junto com os demais planos.

### E5. Microjulgamentos em paralelo (so depois de medir)
O System One foi feito para varias perguntas pequenas e independentes em paralelo. Em vez de um Brief grande por ciclo, perguntas curtas por candidato da lista final (entrada tardia? fluxo sustentado?) com custo e latencia medidos. So entra se a medicao de E0/E3 mostrar ganho por token.

## 4. Ordem de entrega e caminhos

1. E0 e E1 primeiro (nao movem dinheiro, nao tocam o executor): `src/pulse/**` e `src/agent/dislocation-*.ts` novos.
2. E2 e E3 depois, aditivos em `source-ecosystem.ts` e `scheduler.ts`/`cycle.ts` (arquivos quentes: um integrador por vez, com `git status` antes).
3. E4 por ultimo, atras de chave desligada, com revisao independente em copia isolada.
Cada etapa: teste que falha primeiro, implementacao minima, verificacao real, evidencia no checkpoint, diferenciando configuracao valida, carga em sessao nova, funcionamento ao vivo e ganho medido.

## 5. O que nao fazer

- Nao perseguir arbitragem de latencia on-chain em pools rasos.
- Nao fazer o codigo decidir compra por gatilho proprio: o gatilho e do plano que o Jev armou.
- Nao afirmar ganho sem E0 e sem a avaliacao fixa (mediana positiva isolada nao basta).
- Nao abrir uma segunda conexao WebSocket por consumidor nem gastar cota paga do provedor sem decisao do dono.
- Nao mexer em `src/decision-review/evolution/**` (zona da Codex).

## 6. Pendencias do dono

Nao ha portao humano novo para preparar E0, E1, E3 e E4 com executor e modelo falsos, dentro da autonomia ja concedida. Continuam sendo decisoes do dono: financiar caixa em outra rede (a E2 mostra o valor), qualquer servico pago novo, qualquer nova autoridade ou credencial pessoal, e ligar de fato (producao) o que estiver pronto e qualificado. Nada aqui promete lucro.
