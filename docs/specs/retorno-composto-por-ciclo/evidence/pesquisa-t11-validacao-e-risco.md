# t11-validacao-e-risco: Metodologia de validacao, medicao e dimensionamento

> Saída bruta de um agente Haiku 5.5 (esforço médio) do workflow wf_31a20d79-702, em 2026-10-17, com o veredito do cético por afirmação (VERIF=...). Material de proveniência, NÃO curado: pode conter erros que o cético marcou e que eu corrigi em [../research.md](../research.md) e [../status.md](../status.md). Onde divergir, valem esses dois. Endereços e caracteres vedados foram removidos.


RESUMO: Pesquisa somente de leitura, sem edicao no repo e sem chamadas pagas. Auditoria do repo mostra que a infraestrutura de medicao (replay contabil, metricas online, backtest com custo de 0,2%) existe, mas nenhuma evidencia atual prova retorno liquido por ciclo. A meta de 0,5% a 1% por minuto composto equivale, por calculo, a cerca de 1.315x ao dia (0,5%) e cerca de 1,67 milhao de vezes ao dia (1%), o que deve ser tratado como hipotese a refutar, nao como alvo operacional. Limites de quota da OnchainOS e da API publica OKX DEX nao foram publicados nas paginas acessiveis: nao verificado. Caminho viavel de pesquisa: medir a latencia e a cobertura de dados primeiro em modo sombra, depois decidir sobre raspagem ou WebSocket, com validacao estatistica (DSR, PBO, walk-forward) antes de qualquer promocao. Limites de risco permanecem com o dono; nenhum foi decidido aqui.

## ACHADOS
- [a1|fato|alta|VERIF=parcial] O codigo de erro 50011 da OnchainOS (Swap e Market Price) retorna HTTP 429 com a mensagem 'Rate limit reached. Please refer to API documentation and throttle requests accordingly'. As paginas nao publicam o numero de requisicoes por segundo do DEX.
    fonte: https://web3.okx.com/onchainos/dev-docs-v5/dex-api/dex-error-code ; https://web3.okx.com/onchainos/dev-docs/market/market-price-error-code
    numeros: 429, 50011
    >> parcial: As paginas https://web3.okx.com/onchainos/dev-docs-v5/dex-api/dex-error-code e https://web3.okx.com/onchainos/dev-docs/market/market-price-error-code confirmam o erro 50011 com HTTP 429 e a mensagem exata 'Rate limit reached. Please refer to API documentation and throttle requests accordingly'. Porem, a pagina oficial https://web3.okx.com/onchainos/dev-docs/trade/api-fee publica limites de RPS: trial com 1 RPS padrao, elevavel a 5 RPS mediante revisao e aprovacao, validade de 60 dias. A frase 'as paginas nao publicam o numero de requisicoes por segundo do DEX' vale apenas para as paginas de erro. | correcao: Os limites oficiais do DEX estao em https://web3.okx.com/onchainos/dev-docs/trade/api-fee: trial 1 RPS (ate 5 RPS com aprovacao), Start-up faixa 2 a 50 RPS, Enterprise personalizado. A cota depende do volume de negociacao.
- [a2|fato|baixa|VERIF=refutado] Limites de quota da API DEX OKX/OnchainOS: nao verificado. Fontes secundarias citam 250 req/s global e 20 req/2s para dados publicos CEX, mas nao foram confirmadas em documentacao oficial do DEX.
    fonte: nao verificado (pesquisa retornou apenas blogs e issue do ccxt https://github.com/ccxt/ccxt/issues/13883)
    numeros: 250 req/s e 20 req/2s apenas como pista
    >> refutado: A premissa 'nao verificado' ficou desatualizada, pois a pagina oficial trade/api-fee publica os limites do DEX. As fontes atribuidas tambem estao erradas: no https://www.okx.com/docs-v5/en/ o limite de 20 requisicoes por 2 s aparece no endpoint privado 'Get instruments' (regra User ID + Instrument Type), e os dados publicos REST tem limite por IP sem numero visivel. O valor 250 req/s nao foi encontrado em nenhuma das duas paginas oficiais lidas. A busca de terceiros (ccxt, blogs) nao serve como fonte primaria. | correcao: DEX (oficial, api-fee): trial 1 RPS, ate 5 RPS com aprovacao, Start-up 2 a 50 RPS. CEX v5: 20 req/2 s somente no endpoint privado 'Get instruments'; 250 req/s nao verificado.
- [a3|fato|alta] O repo tem TokenBucket por requestsPerSecond e burst, nos clientes OnchainOS e OKX publico. Os valores concretos de configuracao nao foram lidos neste passo.
    fonte: src/onchainos/http.ts:547 e :101-102; src/onchainos/public-okx.ts:63
- [a4|fato|alta|VERIF=confirmado] Probe sintetico registrado na spec mostra que a politica de retry 50102 pode disparar um segundo fetch 17 ms apos o primeiro, sem respeitar o minIntervalMs de 1100 ms, levando a used=2 com cap=1. Evidencia local, nao prova violacao de quota oficial.
    fonte: docs/specs/inteligencia-ciclos-jev/spec.md (secao Contexto e evidencia, linha ~90)
    numeros: minIntervalMs=1100, 17 ms, used=2, cap=1
- [a5|fato|media|VERIF=refutado] O ciclo do agente e 120 000 ms por padrao no scheduler (apos cada ciclo, safely(deps.after, 120_000)); o testes de CLI usam cycleBudgetMs=120000. O dono fala em ciclo de 1 minuto ou menos, o que exige mudar cadencia e orcamento de ciclo.
    fonte: src/agent/scheduler.ts:112 ; src/agent/cli.test.ts:273
    numeros: 120 000 ms
    >> refutado: src/agent/scheduler.ts:112 chama safely(deps.after, 120_000). Pela definicao de safely (linhas 82 a 95), o segundo argumento e um limite de tempo (timeout) da etapa after, e nao a cadencia do ciclo. O intervalo entre ciclos vem de deps.config().intervalMin * 60_000 (linha 128). O literal 120 000 em src/agent/cli.test.ts:273 e cycleBudgetMs de um leitor de fatos, tambem sem relacao com a cadencia. Em src/agent/autopilot.test.ts:82 a 84, os intervalos derivados sao 5 min (rapido), 10 min (normal) e 20 min (calmo). Nenhum caminho de codigo lido mostra ciclo de 1 minuto ou menos. | correcao: Ciclo do agente = intervalMin minutos (autopilot: 5, 10 ou 20 min nos testes). 120 000 ms e o timeout da etapa after. Para um ciclo de 1 minuto, o intervalMin precisaria ser 1 ou menor, o que nao aparece nos testes lidos.
- [a6|fato|alta] Caixa e carteira: o livro separa cash so por contrato conhecido de dolar (lista DOLLAR_CONTRACTS, peg 0,97 a 1,03), tokens de risco ficam fora e contam como flagged, e precos sem prova ficam como valor desconhecido e nao zero.
    fonte: src/agent/book.ts (linhas 1-60, funcoes bookFromAssets e isDollarCoin)
- [a7|fato|alta] O replay contabil declara explicitamente evidenceKind accounting-replay-only, strategyQualified e financiallyAuthorized sempre false, e exige manifesto com holdout, custos conhecidos e baselines (cash, hold-initial-inventory, simple-maker) antes de qualquer evidencia de estrategia.
    fonte: docs/BACKTEST-EVIDENCE.md (secoes Como interpretar e Manifesto v1)
- [a8|fato|alta|VERIF=parcial] A medicao online atual grava goal initialUsd 118, targetUsd 1180, deadline 24h, status not_proven, optimizationEligible false e financiallyAuthorized false. Falta serie integral conciliada de carteira, fluxos, fills e custos USD.
    fonte: scripts/autoresearch.ts (bloco REPORT, linhas 40-60) ; docs/specs/autoresearch-real-online/spec.md
    numeros: 118 USD inicial, 1180 USD alvo, 900% retorno liquido em 24h
    >> parcial: scripts/autoresearch.ts linhas 56 a 69 (bloco REPORT) confirmam initialUsd 118, targetUsd 1180, targetMultiple 10, requiredNetReturnPct 900, deadlineExclusiveMs 86 400 000 (24 h), status not_proven e optimizationEligible false. A referencia 'linhas 40-60' cobre so parte do bloco. financiallyAuthorized=false aparece como linha de stdout ASI na linha 46, e nao como campo do bloco REPORT lido. A falta de serie conciliada esta na linha 66, que confirma a afirmacao. | correcao: Citar scripts/autoresearch.ts:56-69 para o REPORT e :46 para financially_authorized=false.
- [a9|fato|alta|VERIF=confirmado] O backtest de oportunidades usa candles diarios publicos da OKX, sinal no fechamento de t, entrada na abertura de t+1, custo de 0,2% por ida e volta, e reporta excesso sobre a media do universo no mesmo dia. Essa granularidade diaria nao serve para decisao por minuto.
    fonte: scripts/opportunity-backtest.ts (cabecalho, linhas 1-12)
    numeros: custo 0,2% por round trip, candles diarios, 91 dias de historico, liquidez minima US$ 1 mi/dia
- [a10|calculo|alta|VERIF=confirmado] Composicao: 0,5% por minuto durante 1440 minutos (um dia) resulta em (1,005)^1440, cerca de 1.315x. 1% por minuto resulta em (1,01)^1440, cerca de 1,67 milhao de vezes. Com capital de US$ 121, o primeiro produziria cerca de US$ 159 mil ao fim de um dia sem saques. Calculo puro, sem probabilidade.
    fonte: calculo aritmetico com ln(1,005)=0,0049875 e ln(1,01)=0,0099503
    numeros: 1315x/dia (0,5%); 1,67e6x/dia (1%)
- [a11|calculo|alta|VERIF=confirmado] Custo de 0,2% por ida e volta consome 40% do alvo de 0,5% por ciclo. Com custo de 0,2% por round trip e taxa de acerto necessaria, o retorno bruto por operacao precisa exceder esse custo antes de qualquer lucro.
    fonte: calculo sobre o custo declarado em scripts/opportunity-backtest.ts
    numeros: custo/alvo = 0,2/0,5 = 40%
- [a12|calculo|media|VERIF=parcial] Kelly continuo f* = mu/sigma^2. Se mu = 0,5% por minuto e sigma = 2% por minuto, f* = 12,5, ou seja 1250% do capital, o que indica que a premissa do dono nao e compativel com risco de ruina em volatilidade cripto normal. Se sigma = 0,5%, f* = 2 (200%), tambem alavancado. Fracao de Kelly 0,1 a 0,25 reduz a exposicao mas nao altera o sinal da conclusao.
    fonte: formula de Kelly continua; premissas de sigma sao hipoteses, nao medidas
    numeros: f*=12,5 com sigma 2%; f*=2 com sigma 0,5%
    >> parcial: Com decimais consistentes, mu=0,005 e sigma=0,02 dao f*=0,005/0,0004=12,5 (1 250%), o que esta correto. Para sigma=0,5% (0,005), sigma^2=0,000025 e f*=0,005/0,000025=200, ou seja 20 000% do capital. O valor 2 do texto esta errado por um fator de 100. A conclusao de que a premissa e incompativel com o risco de ruina permanece, e fracao de Kelly nao altera o sinal. | correcao: Para sigma=0,5% por minuto, f* = 200 (20 000%). Para sigma=2% por minuto, f* = 12,5 (1 250%).
- [a13|calculo|media|VERIF=parcial] Tamanho amostral: para detectar media de 0,5% por ciclo com desvio de 1% por ciclo, teste bilateral alfa 5% e poder 80%, n aproximado = ((1,96+0,84)/0,5)^2 = cerca de 32 ciclos independentes. Com autocorrelacao, o numero efetivo cai e o erro padrao sobe. Para sigma de 2%, n sobe para cerca de 127.
    fonte: formula padrao de tamanho amostral para media; sigma e premissa
    numeros: n=32 (sigma 1%), n=127 (sigma 2%)
    >> parcial: Para efeito de 0,5 e desvio de 1, n=((1,96+0,84)/0,5)^2=31,36, arredondado para 32, correto. Para sigma=2%, o efeito e 0,5/2=0,25 e n=(2,8/0,25)^2=125,44, que arredondado para cima e 126, nao 127. A ressalva sobre autocorrelacao e corretamente qualitativa. | correcao: n=126 para sigma=2% (ou n=127 se usar folga conservadora, mas isso nao vem da formula).
- [a14|fato|media] Deflated Sharpe Ratio (Bailey e Lopez de Prado, Journal of Portfolio Management 40(5), 2014, pp. 94-107) corrige o Sharpe por selecao entre muitos testes, nao normalidade e numero de tentativas. Exige estimar o numero de tentativas independentes, o que e fragil quando as tentativas sao correlacionadas.
    fonte: https://papers.ssrn.com/abstract=2460551 (abstract acessivel via busca; corpo nao lido por bloqueio 403) ; https://en.wikipedia.org/wiki/Deflated_Sharpe_ratio
- [a15|fato|media] Probability of Backtest Overfitting (Bailey, Borwein, Lopez de Prado, Zhu, Journal of Computational Finance 20(4), 2017, DOI 10.21314/jcf.2016.322) propoe CSCV para estimar PBO, e argumenta que holdout simples e pouco confiavel. Pacote R PBO disponivel no CRAN.
    fonte: https://escholarship.org/content/qt4w1110bb/qt4w1110bb.pdf ; https://www.risk.net/journal-of-computational-finance/2471206/the-probability-of-backtest-overfitting
- [a16|fato|media] getProgramAccounts em provedores Solana tem limite proprio de cerca de 3 req/s em um provedor, alem do limite total de RPC, e pode truncar ou expirar com resultados grandes. Orientacao de provedores: usar WebSocket (accountSubscribe) para monitoramento continuo em vez de polling.
    fonte: https://quicknode.com/docs/solana/getProgramAccounts ; https://docs.helius.dev/docs/rpc/guides/getprogramaccounts
    numeros: 3 req/s (um provedor, pode mudar)
- [a17|fato|baixa] WebSocket publico OKX: endpoint wss://ws.okx.com:8443/ws/v5/public, canais tickers, candles, mark price, order book sem login. Canal de ticker com push de cerca de 100 ms e open interest de cerca de 3 s, segundo SDK de terceiros.
    fonte: pista secundaria: https://www.mintlify.com/tiagosiebler/okx-api/websocket-client/public-channels e https://www.esegece.com/help/sgcWebSockets/Components/APIs/API/API_OKX.htm ; documentacao oficial nao acessada
    numeros: 100 ms ticker, 3 s open interest
- [a18|hipotese|baixa] Raspagem de paginas da OKX Wallet ou OnchainOS para obter precos em tempo real: nao verificado nesta pesquisa. Questoes de termos de uso, anti-bot e estabilidade do HTML nao foram lidas. Nao foi feita nenhuma requisicao de raspagem, conforme as regras desta fase.
    fonte: nao verificado
- [a19|fato|alta] A conta de limites da API e custo do Jev/TypeSafe nao foram levantados: a spec de ciclos afirma que limites CLI, Basic e Premium nao estao publicados nas paginas revisadas, e pede que nao se infira quota numerica.
    fonte: docs/specs/inteligencia-ciclos-jev/spec.md (Perguntas em aberto, linha ~76)

## LIMITES E QUOTAS
- [lim1] OnchainOS DEX API (Swap e Market Price): Nao publicado nas paginas lidas; erro 50011 com HTTP 429 indica throttling (plano nao verificado) | fonte: https://web3.okx.com/onchainos/dev-docs-v5/dex-api/dex-error-code
- [lim2] Cliente DEX local (repo): minIntervalMs=1100 ms; cap local Basic=1 na prova sintetica; retry 50102 pode duplicar fetch (plano configuracao local, nao quota oficial) | fonte: docs/specs/inteligencia-ciclos-jev/spec.md
- [lim3] Ciclo do agente: 120 000 ms apos cada ciclo (plano configuracao do repo) | fonte: src/agent/scheduler.ts:112
- [lim4] Solana getProgramAccounts (provedor): 3 req/s, pode mudar sem aviso (plano provedor especifico, nao Solana core) | fonte: https://quicknode.com/docs/solana/getProgramAccounts
- [lim5] OKX WebSocket publico: nao verificado oficialmente; ticker push cerca de 100 ms segundo SDK de terceiros (plano publico) | fonte: https://www.mintlify.com/tiagosiebler/okx-api/websocket-client/public-channels (secundaria)
- [lim6] OKX CEX v5 REST publico: por endpoint, sem numero confirmado; 20 req/2s citado em fonte de terceiros (plano publico) | fonte: https://www.okx.com/docs-v5/en/ (nao lido diretamente)

## OPORTUNIDADES
- Medir antes de decidir: sombra com registro de latencia e cobertura: Rodar o ciclo em modo sombra registrando, por decisao, o tempo entre dado de mercado e decisao, cobertura por token e custo. Sem ordens. Usa os dados ja previstos em equity-log e replay. | ganho: Define se o gargalo e dado, decisao ou execucao antes de qualquer mudanca de arquitetura. | esforco: baixo a medio | depende: Autorizacao do dono para ler o runtime local; sem alteracao de codigo nesta fase. | medir: Percentil 50 e 95 de latencia dado-para-decisao, fracao de tokens com preco fresco, numero de chamadas OnchainOS por ciclo.
- Separar fonte de dados e fonte de execucao: Dados de mercado por WebSocket publico OKX (sem login) e leitura do ecossistema, com OnchainOS reservado para cotacao executavel e envio. Reduz chamadas de dados que consomem a cota de decisao. | ganho: Libera cota para decisao; reduz latencia de leitura. | esforco: alto | depende: Confirmar limites oficiais do WebSocket e do DEX; hoje nao verificado. Nova dependencia ou custo exige decisao do dono e fica bloqueado para registro. | medir: Chamadas OnchainOS por ciclo antes e depois, taxa de 429 e 50011, defasagem entre preco WebSocket e cotacao executavel.
- Cota adaptativa com backoff unico: Corrigir a politica de retry 50102 para que o segundo fetch respeite o intervalo minimo, unificando o limitador. Evidencia local ja existe (a4). | ganho: Evita consumo duplicado da cota. | esforco: baixo | depende: Mudanca de codigo; fica para fase de implementacao, nao esta fase. | medir: Contagem de fetches por chamada logica em teste com clock sintetico; used nunca acima de cap.
- Protocolo de promocao em tres portoes: Portao 1: replay contabil com manifesto completo (BACKTEST-EVIDENCE). Portao 2: sombra por pelo menos N ciclos com custos conhecidos, comparada com baselines cash e hold. Portao 3: DSR e PBO sobre todas as variantes testadas, com walk-forward e holdout congelado. Promocao para real so com decisao explicita do dono. | ganho: Evita promover estrategia que so ganhou por selecao. | esforco: medio | depende: Dados historicos com custo real; hoje so candles diarios. | medir: Retorno liquido por ciclo, erro padrao com autocorrelacao, DSR, PBO, numero de variantes testadas, custo por round trip.

## RISCOS
- Custo supera o alvo: Com custo declarado de 0,2% por round trip (a9), o alvo de 0,5% por ciclo e so 2,5 vezes o custo, e custos de gas, slippage e latencia nao estao contabilizados nos numeros atuais. Com 0,5% por minuto a meta nao e ponto de partida realista sem prova.
- Selecao e overfitting: Muitas variantes testadas inflam o Sharpe aparente. Sem DSR e PBO, um resultado de sombra favoravel pode ser ruido (a14, a15).
- Ruina por alavancagem implicita: Usar capital inteiro com Kelly sugerido por premissas de media alta (a12) implica exposicao extrema. Dimensionamento e limite de risco sao decisao do dono, registradas como opcoes, nao decididas aqui.
- Raspagem e termos: Raspagem de paginas pode violar termos de uso, disparar anti-bot e quebrar sem aviso. Nao verificado. Nao contornar CAPTCHA.
- Cota compartilhada: A duplicacao de fetch observada (a4) mostra que a cota local pode ser excedida mesmo com cap configurado; pode gerar 429 e bloqueio de decisao.

## PERGUNTAS ABERTAS
- Qual a cota oficial por segundo e por dia da API DEX OKX/OnchainOS e do WebSocket publico? Verificar na pagina de rate limit do dev-docs antes de qualquer desenho.
- Qual o custo real por ciclo (gas Solana, slippage medido, taxa de pool) e quanto da meta de 0,5% sobra apos esses custos?
- Quantos tokens do ecossistema OKX Wallet e OnchainOS tem preco publico em tempo real, e qual a cobertura medida?
- Qual o retorno liquido observado em sombra por ciclo, com erro padrao corrigido por autocorrelacao?
- Limites de risco (perda diaria, drawdown, tamanho maximo) sao decisao do dono e ficam registrados como opcoes, sem valor escolhido aqui.
- Quais termos de uso da OKX regem leitura automatizada de paginas? Nao verificado.

## NAO LIDO
- Documentacao oficial de rate limit da API DEX OKX/OnchainOS (dev-docs) nao acessivel por WebFetch (404 na pagina tentada).
- Corpo completo do paper Deflated Sharpe Ratio (SSRN retornou 403).
- Documentacao oficial OKX WebSocket e limites de conexao publica (somente fontes secundarias).
- Documentacao oficial Solana sobre accountSubscribe e latencia de slot (busca nao retornou solana.com).
- Termos de uso da OKX Wallet e OnchainOS sobre raspagem.
- Arquivos de configuracao concretos de requestsPerSecond e burst (http.ts e public-okx.ts) nao foram lidos ate o fim.
- Nao foram criados arquivos de grafo ou anotacoes em docs/ do repo: a regra desta fase proibe escrita dentro de C:/Users/gabri/jev-trader. A transformacao em grafo pedida pelo dono (AGENTS.md) fica pendente para uma fase com permissao de escrita.

RESUMO DO CETICO: Reverifiquei as 10 afirmacoes contra arquivo:linha e URLs oficiais. Confirmadas por completo: a4 (spec, evidencia local sintetica), a9 (cabecalho do backtest), a10 e a11 (aritmetica, com ressalva de que o custo de 0,2% e premissa do script). Parciais: a1 (as paginas de erro nao publicam RPS, mas a pagina de taxas publica 1 RPS no trial e 5 RPS mediante aprovacao), a8 (valores conferem, porem financiallyAuthorized aparece como linha ASI na linha 46, nao no bloco REPORT 56-69), a12 (f*=12,5 correto; com sigma 0,5% o valor certo e 200, nao 2), a13 (n=32 correto; com sigma 2% o minimo e 126, nao 127). Refutadas: a2 (o limite de 20 req/2s do OKX v5 e de endpoint privado, nao de dados publicos, e 250 req/s nao foi encontrado; a cota oficial do DEX existe e e 1 RPS no trial, Start-up 2 a 50 RPS, Enterprise sob contrato) e a5 (o literal 120 000 ms e o timeout da etapa after, passado a safely; a cadencia do ciclo e config().intervalMin * 60 000, e os testes de autopilot usam 5, 10 e 20 min). Conclusao para a meta de 1 minuto: a cadencia atual nao e de 1 minuto no codigo testado, e a cota oficial publica do DEX (1 a 5 RPS no trial) e muito abaixo do que um ciclo de 1 minuto com varios pares exigiria. Nenhum arquivo foi alterado e nenhuma chamada paga ou autenticada foi feita.
