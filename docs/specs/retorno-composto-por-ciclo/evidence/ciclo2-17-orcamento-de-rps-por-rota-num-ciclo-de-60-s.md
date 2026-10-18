# Ciclo 2, ticket T17: Orcamento de RPS por rota num ciclo de 60 s

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: 13
Domain: operacao
Priority: 17

## Question

Quantas chamadas por rota cabem num ciclo de 60 s dentro dos limites publicados (OnchainOS Trade de 1 RPS no trial e 2 a 50 no Start-up; RPC publico da Solana de 100 requisicoes por 10 s; Jupiter Free de 60 por minuto; cliente OKX com intervalo de 1,1 s), e qual rota estoura primeiro?

Por que importa: Ciclo de 1 minuto multiplica a chamada por ciclo. O RPS do Market da OnchainOS nao esta publicado (nao verificado). Ha risco de o retry 50102 disparar um segundo fetch 17 ms depois sem respeitar o intervalo minimo (validacao-e-baseline.md secao 5). A conta por rota decide quantos candidatos cabem e se a cadencia precisa de cache.
Evidencia a buscar: docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md com URL de origem por limite; src/okx-market/okx-dex.ts:8; retry e 429 em src/agent/ e src/okx-market/; scripts/api-budget.ts; testes http.test.ts.

## Answer

Nenhuma rota de RPS estoura num ciclo de 60 s dentro do que o codigo permite: o Trade tem piso de 1100 ms (55 inicios por janela de 60 s, contra 60 por minuto do trial) e o Market tem 1 RPS local com burst 1. A cota mensal estoura antes: 100 mil Basic e 100 mil Premium no Free dao 2,24 chamadas por tier por ciclo, e se o provedor contar tentativas de retry, cerca de 0,75 chamada logica por ciclo. Depois vem o teto diario de consultas ao Jev (144 default ou 720 na capacidade do autopilot, 1 a cada 2 a 10 min). O risco de 17 ms no retry 50102 nao vale no codigo lido hoje, que espera desde o ultimo envio, mas nao ha teste de espacamento. O RPS do Market e a unidade do limite seguem nao verificados, e nao existe contador por rota.

### Caminhos (Wayfinder)

- **Medir por rota antes de mudar qualquer limite**: Envolver as chamadas Market e Trade em um wrapper de dependencias que grava, em arquivo novo fora do journal, rota, minuto, status HTTP, numero da tentativa e se a resposta veio de retry. Os dados dizem qual rota gasta cota e se 429, 50011 e 402 consomem a mensal. | Restricao que prende: usage-YYYY-MM.json guarda so totais por tier (scripts/api-budget.ts:3); sem isso nao ha numero por rota. | Experimento mais proximo: Em sombra, 24 h de ciclos com o wrapper ligado, sem mudar cadencia nem cache. | Ganho: Fecha as duas perguntas nao verificadas (RPS real e unidade do limite) sem risco de cota. | Esforco: baixo | Como medir: Chamadas por rota por minuto; tentativas por chamada logica; contagem de 429 e 402 frente ao painel da OKX no mesmo dia.
- **Cache de Market por TTL dentro do candidato**: Reaproveitar preco e token de Market por 60 s a 3 min para o mesmo candidato, mantendo o piso de 1 RPS. Reduz as chamadas Basic e Premium por ciclo. | Restricao que prende: 2,24 chamadas Basic por tier por ciclo (A8); o repo ja cita cache de 15 s a 30 min em api-limites-e-fontes.md:110. | Experimento mais proximo: Cache de 180 s para preco em sombra e comparar com o total de chamadas do ciclo sem cache. | Ganho: Com TTL de 180 s, uma chamada a cada 3 ciclos: a cota mensal cabe com folga para uma chamada Basic e uma Premium por ciclo (calculo). | Esforco: medio | Como medir: Chamadas Market por ciclo com e sem cache; taxa de acerto; diferenca de preco entre leitura em cache e leitura nova.
- **Teto local por rota com recusa antes do envio**: Criar um teto por rota e por minuto que recusa a chamada antes do fetch, usando o gate admitDispatch que ja existe no cliente de leitura (motivo pace_limited). Market no maximo 2 chamadas por tier por ciclo; Trade no maximo 55 inicios por minuto. | Restricao que prende: O gate ja existe no cliente de leitura (src/onchain-read/client.ts admitDispatch), mas nao no cliente OnchainOS de http.ts nem no DEX de Trade. | Experimento mais proximo: Teste sintetico com relogio falso de 60 s e 3 candidatos, verificando que a chamada 3 e recusada antes do fetch. | Ganho: Evita que a cota mensal acabe no dia 20 e bloqueie o tier pelo resto do mes (A7). | Esforco: medio | Como medir: Zero chamadas acima do teto em 1000 ciclos sinteticos; nenhum 402 em simulacao de 30 dias.
- **Cadencia de 60 s so para leitura; Jev so quando candidato passa o filtro**: O ciclo de 60 s atualiza estado e gera candidatos, mas consulta o Jev so quando um candidato passa o filtro e ha consulta disponivel no dia. | Restricao que prende: 720 consultas por dia equivalem a 1 a cada 2 min (A9); a cadencia de 1 min precisa de 1440. | Experimento mais proximo: Contar, em sombra, quantos candidatos passam o filtro por hora e quantos chegam ao Jev hoje (57% fecham antes, segundo a baseline). | Ganho: Concentra o teto diario nos candidatos que valem a consulta, sem subir o teto. | Esforco: baixo | Como medir: Consultas por dia; candidatos que passam o filtro por hora; ciclos sem consulta (7 de 21 no T13).
- **Levantar do painel do dono o RPS real e a unidade do limite**: Ler no painel do portal OKX a faixa da conta (trial ou Start-up), o RPS vigente e se o limite vale por chave, IP ou conta. Registrar sem segredos. Esta leitura e do dono, nao do Jev. | Restricao que prende: RPS do Market nao publicado e faixa da conta so visivel no painel (api-limites-e-fontes.md:34). | Experimento mais proximo: Uma captura de tela do painel com dados da faixa e do RPS, sem chave. | Ganho: Transforma a faixa N em C e define se o piso de 1 RPS e o gargalo real. | Esforco: baixo | Como medir: Valor de RPS e unidade anotados na spec, com data; comparacao com o contador por rota do caminho 1.

### Achados

- [A1|fato|alta|VERIF=confirmado] Trade trial: 1 RPS por padrao, ate 5 sob aprovacao, valido por 60 dias a partir da criacao da chave; Start-up de 2 a 50 RPS; 'RPS adjustment is correlated to trading volume'.
    fonte: https://web3.okx.com/pt-br/onchainos/dev-docs/trade/api-fee (lido no navegador em 2026-10-17)
- [A2|fato|media|VERIF=parcial] Market nao publica RPS nem limite por minuto ou dia; so cotas mensais de 100 mil Basic e 100 mil Premium no Free, reiniciadas no dia 1. Codigo de erro de limite 50011 com HTTP 429 vem da spec, nao da pagina de tarifas.
    fonte: https://web3.okx.com/onchainos/dev-docs/market/market-api-fee (WebFetch, resumo de modelo); docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:20-22
    >> parcial: Confere que a pagina do Market nao publica RPS, limite por minuto ou por dia; so cota mensal de 100.000 Basic e Premium no Free, reinicio no dia 1, e 'RPS adjustments' remetendo a dexapi@okx.com e Discord (WebFetch). O codigo 50011 com HTTP 429 nao aparece nessa pagina; no codigo ele e tratado como RATE_CODES (src/onchain-read/client.ts:55) e 429 vira rate_limited (src/onchainos/http.ts:438). A pagina de codigos de erro nao foi aberta aqui. | correcao: Dizer que 50011 vem do codigo e da pagina de codigos de erro (nao verificada nesta rodada), e nao da pagina de tarifas.
- [A3|fato|alta|VERIF=confirmado] Piso local do Market: requestsPerSecond 1, burst 1, maxRetries 2, backoff base 1000 ms e teto 8000 ms. Cada tentativa, inclusive o retry de 429 ou 5xx, passa por limiter.acquire antes do envio, entao o retry respeita o piso de 1 RPS.
    fonte: src/onchainos/http.ts:508 (DEFAULTS); src/onchainos/http.ts:411 (limiter.acquire dentro do laco de tentativas); src/onchainos/http.ts:425-432 (retry)
- [A4|fato|alta|VERIF=confirmado] Cliente DEX de Trade (quote) tem intervalo minimo de 1100 ms entre inicios, fila reserveStart, e nao tem retry nem tratamento de 429 ou 50011. Com 1100 ms, a janela de 60 s comporta 55 inicios (0 a 59,4 s), 0,909 RPS, margem de 9% sobre o trial de 1 RPS.
    fonte: src/okx-market/okx-dex.ts:6 (QUOTE_PATH), :8 (DEFAULT_MIN_REQUEST_INTERVAL_MS = 1_100), :196-224 (reserveStart); grep sem ocorrencia de 429 ou 50011 em okx-dex.ts
- [A5|fato|media|VERIF=confirmado] O cliente DEX de Trade nao e chamado pelo ciclo do agente: so por scripts/okx-dex-quote.ts e pelo probe src/okx-market/round-trip.ts (supportedChain mais quote, 2 chamadas por round trip). A rota de Trade no ciclo real nao foi achada.
    fonte: grep de imports em src e scripts: src/okx-market/round-trip.ts:146,157; scripts/okx-dex-quote.ts
- [A6|fato|media|VERIF=parcial] Premissa corrigida: o retry 50102 do cliente de leitura OnchainOS/OKX recalcula a espera desde o ultimo envio antes de cada tentativa (attempt > 0), e grava lastSentMs antes do fetch. O relato de 17 ms em validacao-e-baseline.md:72 e na spec de inteligencia descreve uma versao que esperava uma vez so. Os testes do 50102 (client.test.ts:268-300) cobrem abort, nao espacamento.
    fonte: src/onchain-read/client.ts:146-151 (espera do retry), :180 (lastSentMs antes de dispatch); docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:72; src/onchain-read/client.test.ts:268-300
    >> parcial: Codigo confirmado: src/onchain-read/client.ts:146-151 recalcula wait = lastSentMs + minIntervalMs - now antes de cada tentativa com attempt > 0, e lastSentMs e gravado em :180 antes do dispatch. client.test.ts:267-301 testa abort e deadline, nao espacamento, como afirmado. Mas validacao-e-baseline.md:72 nao diz que a versao antiga 'esperava uma vez so': diz que a politica 'pode disparar' um segundo fetch 17 ms depois, em evidencia sintetica da spec de inteligencia (inteligencia-ciclos-jev/spec.md), e 'nao prova violacao'. A versao antiga e inferencia, nao verificada no historico git. | correcao: Trocar 'descreve uma versao que esperava uma vez so' por 'e evidencia sintetica, sem medicao; o codigo atual respeita o intervalo'. O risco de 17 ms deixa de ser premissa valida para o codigo atual.
- [A7|fato|alta|VERIF=parcial] Um 402 bloqueia o tier inteiro ate o proximo mes UTC (paymentBlockedUntil), mesmo que o 402 signifique cota esgotada. A pagina nao diz qual codigo a cota esgotada devolve; a spec marca isso como nao verificado. Em onchain-read/client.ts o mesmo bloqueio existe por tierBlockedUntil.
    fonte: src/onchainos/http.ts:345, :427 (paymentBlockedUntil = proximo mes UTC); src/onchain-read/client.ts (tierBlockedUntil, PAYMENT_BLOCK_MS); docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:26
    >> parcial: Em src/onchainos/http.ts:344-345 e :406, 427 o 402 bloqueia ate nextUtcMonthMs: confirmado para o cliente Market. Em src/onchain-read/client.ts:56 PAYMENT_BLOCK_MS = 3_600_000 (1 hora), aplicado em :299 quando o erro e provider_payment_required, e checado em :279-280. Portanto o bloqueio do onchain-read dura 1 hora, nao ate o proximo mes; 'o mesmo bloqueio' e falso. A citacao docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:26 esta errada: a linha 26 e o cabecalho da pagina do Trade. O trecho 'cota esgotada nao informada (N)' esta na linha 22. | correcao: Separar os dois clientes: Market bloqueia ate o reset mensal (http.ts:427); onchain-read bloqueia 1 hora (client.ts:56). Corrigir a referencia para :22. Tambem vale notar que a spec onchainos-coverage.md:33 ja foi marcada como a corrigir, pelo proprio api-limites.md:24.
- [A8|calculo|alta|VERIF=confirmado] Cota mensal do Market em chamadas por ciclo de 60 s: 100000 / 31 dias / 1440 min = 2,24 chamadas por tier. Com 3 tentativas por chamada logica (maxRetries 2), se cada tentativa conta, 0,75 chamada logica por ciclo.
    fonte: Calculo sobre A2 e A3 (31 dias; retry contado por tentativa, premissa nao verificada)
- [A9|fato|alta] Consultas ao modelo: DEFAULT_LIMITS e 144 por dia (1 a cada 10 min); a capacidade do autopilot e 720 por dia (1 a cada 2 min). A cadencia de 1 minuto precisa de 1440 e nao cabe em nenhum dos dois.
    fonte: src/agent/budget.ts:18 (DEFAULT_LIMITS 144); src/agent/autopilot.ts:51 (capacidade 720); docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:36 (G5)
- [A10|fato|alta] Contador por rota nao existe: o arquivo de uso mensal guarda totais por tier, nao por rota, e o script de orcamento declara que nao mede a divisao entre leituras que crescem com o tempo e leituras por tempo.
    fonte: scripts/api-budget.ts:3 e :81; docs/specs/retorno-composto-por-ciclo/research.md:104-111
- [A11|fato|baixa] RPC publico da Solana: a spec lista 100 req por 10 s por IP e 40 por 10 s por metodo, marcado C com fonte de pesquisa anterior. Nesta leitura, o WebFetch de solana.com/docs/rpc/http nao exibiu nenhuma regra de limite. O codigo chama api.mainnet-beta.solana.com sem limitador local visto nas linhas lidas.
    fonte: docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:64 e evidence/pesquisa-t04-fontes-solana-dex.md; https://solana.com/docs/rpc/http (WebFetch, sem regra encontrada); src/server/solana-receipts.ts:84, :172
- [A12|inferencia|media] T13 nao muda a conta de RPS: o limite e por minuto e por mes, nao pela duracao do ciclo (p50 4,1 s, p95 34,6 s). Muda o diagnostico, porque o carimbo por etapa e o contador por rota sao o mesmo ponto de instrumentacao (wrapper nas dependencias).
    fonte: Ticket T13 (premissa) combinado com A3, A4, A10

### Decisao para o Jev

Pergunta: Como o ciclo de 60 s deve limitar as chamadas por rota antes de a cota real ser medida?
Reversivel: true

- medir_primeiro (Medir por rota antes de mudar): Gravar rota, minuto, status e tentativa em arquivo novo, em sombra, sem mudar cadencia nem cache. Opcao conservadora. | Evidencia: Uso guarda so totais por tier (scripts/api-budget.ts:3)
- cache_market_ttl (Cache de Market de 60 s a 3 min): Reaproveitar preco e token por candidato dentro do TTL, mantendo 1 RPS. Reduz chamadas Basic por ciclo. | Evidencia: 2,24 Basic por ciclo (calculo); cache de 15 s a 30 min citado no repo
- teto_por_rota_minuto (Teto local por rota antes do envio): Recusar a chamada antes do fetch: Market no maximo 2 por tier por ciclo; Trade no maximo 55 por minuto. | Evidencia: admitDispatch e pace_limited ja existem em onchain-read/client.ts
- cadencia_por_evento (Jev so quando candidato passa o filtro): Ciclo de 60 s le estado e consulta o Jev so para candidato que passa o filtro e tem consulta no dia. | Evidencia: 720 por dia (autopilot.ts:51) equivale a 1 a cada 2 min
- manter_como_esta (Manter a cadencia atual): Nao mudar chamadas nem limites; aceitar o risco de cota mensal e de 402 ate ter medicao. | Evidencia: Sem medicao por rota (A10); risco de 402 em A7

Recomendacao sem Jev: medir_primeiro - E a opcao mais reversivel e de menor risco: nao muda cadencia, cache nem limite, nao gasta cota extra e responde as duas perguntas que faltam (RPS real e se 429 ou 402 consomem a mensal). Grava em arquivo novo, sem migrar o formato do journal de uso.
Cetico: decisao_ok=false; problemas: Os 'desconhecidos' estao escritos como perguntas ao dono ('Qual o RPS vigente...?', 'Em que faixa esta a conta...?', 'Quantas chamadas... foram consumidas...?'). Isso viola a regra de nunca perguntar ao dono. Devem virar bloqueios_do_dono ou decisoes estruturadas, nunca perguntas. | Os desconhecidos 'faixa_conta' e 'unidade_limite' mandam confirmar com dexapi@okx.com. Enviar mensagem a OKX em nome do dono exige permissao explicita dele, e a decisao nao deve sugerir esse contato como acao. | A fact A7 esta errada: o bloqueio do onchain-read dura 1 hora (client.ts:56), nao ate o mes. A restricao '402 bloqueia o tier ate o proximo mes UTC' deve ser separada por cliente. | A opcao 'teto_por_rota_minuto' limita chamadas de API, nao operacoes de trade, mas o dono ja decidiu 'sem tetos de codigo por operacao' (ADENDO-B, docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:70). Deve ser declarado explicitamente que e cota de API e nao teto por operacao, para nao ser lido como violacao. | A opcao 'medir_primeiro' grava em arquivo novo. Isso nao e migracao de journal nem de schema, mas deve dizer que nao altera o formato do arquivo de uso existente (scripts/api-budget.ts:3), para ficar claro que nao toca o item vedado. | O campo 'proibidas' esta vazio, mas 'cache_market_ttl' e 'teto_por_rota_minuto' mexem em caminhos de leitura de preco que alimentam decisao de compra; a decisao deve dizer que nenhuma opcao muda ordens, carteira ou liberacao de live (hoje esta implicito).

### Bloqueios do dono

- Contratar plano pago da OnchainOS (Starter a Pro, ou WebSocket a partir de US$ 99 por mes): cobranca, vedado ao Jev.
- Pedir RPS maior ou o RPS vigente a dexapi@okx.com ou ao suporte: contato com a OKX em nome do dono.
- Chave, segredo e passphrase da OKX e da OnchainOS: segredos, nao lidos nem citados aqui.
- Mudar o formato de onchain/usage-YYYY-MM.json para guardar rota: migracao de journal, vedada ao Jev.
- Aceitar o risco de termos da raspagem do site OKX (API Agreement 9.4): decisao do dono.
- Liberar live ou mudar limites de risco por causa do teto de consultas: decisao do dono.

### Novos tickets revelados

- Carimbo de cota por rota e status HTTP: Os status 429, 50011 e 402 consomem a cota mensal do Market, e quantas tentativas por chamada logica ocorrem em 24 h?
- Teste de espacamento do retry 50102: O teste de client.test.ts prova que a segunda tentativa do 50102 espera 1100 ms desde o ultimo envio, ou so prova o abort?
- Limitador local no RPC Solana: As chamadas a api.mainnet-beta.solana.com em solana-receipts.ts:84 e :172 tem algum limitador de 40 por 10 s por metodo?
- Teto diario: 144 ou 720: Qual valor de maxConsultsPerDay esta efetivo na configuracao (budget.ts:18 diz 144, autopilot.ts:51 planeja 720)?
- Consumidor do cliente DEX de Trade no ciclo: O cliente DEX de Trade (okx-dex.ts) entra no ciclo do agente ou so em scripts e probe? Sem consumidor, a rota de Trade nao entra na conta de RPS.
- Divergencia de planos em api-budget: PAID_PLANS em scripts/api-budget.ts:17-20 nao lista Scale, Pro e Enterprise; corrigir antes de usar a conta?

### Nao lido

- Texto bruto da pagina de Market da OnchainOS (so WebFetch com resumo de modelo, que nao trouxe RPS), e a pagina de codigos de erro com a cota esgotada.
- Texto bruto da OKX API Agreement e dos termos de uso (lido por resumo na spec).
- Painel do portal de desenvolvedor do dono: faixa da conta, RPS vigente e unidade do limite. Acesso proibido a este agente, so o dono.
- Docs Solana com a regra de 100 por 10 s: WebFetch redirecionou e a pagina nao trouxe regra; a cifra vem so da spec (evidence/pesquisa-t04).
- Documentacao Jupiter nao relida hoje; nao ha chamada a Jupiter no codigo lido.
- Evidencias da pasta docs/specs/retorno-composto-por-ciclo/evidence/ lidas so por busca, nao por inteiro.
- Nao rodei testes nem scripts: a leitura de codigo foi estatica (grep e trechos).

### Resumo do cetico

Reverifiquei A1 a A8 contra o codigo (arquivo:linha) e contra a pagina oficial do Trade e do Market (WebFetch, 2026-10-17). A1 e A3 conferem. A2 confere no que diz respeito a RPS (nao publicado), mas o codigo 50011 nao esta na pagina de tarifas. A4 e A5 conferem. A6 e A7 tem correcoes: o bloqueio de 402 e de 1 hora no onchain-read, nao ate o proximo mes, e a espera do retry ja respeita o intervalo minimo no codigo atual. A decisao nao pode ir ao Jev como esta: contem perguntas ao dono (vedado pela regra "nunca perguntar ao dono"), sugere contato por e-mail com a OKX sem permissao, e A7 esta errada em um ponto. Cabe a correcao da decisao antes de levar ao Jev.

## Comments

