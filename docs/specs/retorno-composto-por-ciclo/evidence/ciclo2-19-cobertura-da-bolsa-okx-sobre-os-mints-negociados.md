# Ciclo 2, ticket T19: Cobertura da bolsa OKX sobre os mints negociados

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: ecossistema
Priority: 19

## Question

Qual fracao dos tokens Solana que o agente de fato negocia (mints do repo e do historico de compras, sem enderecos de carteira) tem par spot na OKX, medida pelo snapshot oficial de tickers spot e pelo mapeamento de bases, e qual fracao o feed publico cobriria?

Por que importa: O feed publico cobre 445 bases spot, mas nao se sabe se o universo negociado da carteira intersecta esse conjunto. Sem essa fracao nao se decide se a bolsa serve de sinal para a carteira ou so de regime de mercado.
Evidencia a buscar: Lista de mints negociados lida localmente em src/inonu/source-ecosystem.ts e no historico de compras (sem gravar, sem enderecos de carteira); GET publico documentado a /api/v5/market/tickers?instType=SPOT (API oficial, nao o site); docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t03-okx-exchange-ws.md.

## Answer

Cobertura por mint NAO MEDIDA: a fracao do universo negociado com par spot na OKX nao pode ser calculada com os dados locais. O universo nao e uma lista fixa; src/inonu/source-ecosystem.ts le o hot-tokens (ate 100 por rede, 4 redes) em tempo de execucao. Medido hoje: a OKX tem 1184 instrumentos spot live e 445 bases distintas (443 com quote USDT), mas nao publica endereco de contrato. No registro Jupiter (287.863 entradas), 445 bases equivalem a no maximo 0,15% das entradas, e so 55 bases (12,4%) tem simbolo unico. No historico local de execucao, 1 de 10 mints (USDC) cruza com a OKX e 9 nao estao no registro. A bolsa so serve de sinal por mint depois de uma fonte primaria de contrato; hoje serve, no maximo, de regime de mercado.

### Caminhos (Wayfinder)

- **Ponte mint para par OKX com fonte oficial de contrato**: Encontrar fonte primaria que ligue endereco Solana a simbolo OKX e medir quantas das 445 bases tem contrato confirmado. | Restricao que prende: A OKX nao publica endereco de contrato (a3) e 286.366 das 287.863 entradas do registro Jupiter sao unknown (a5) | Experimento mais proximo: Cruzar os 10 mints locais e 100 mints do hot-tokens de uma rede com a fonte escolhida e contar acertos e falhas | Ganho: Permite cobertura por mint, que hoje e indeterminada; sem numero de ganho medido | Esforco: baixo | Como medir: Fracao de mints com par OKX confirmado por endereco, por rede, em amostra de 24 horas
- **Medir cobertura em sombra no hot-tokens**: Gravar, sem decidir nada, os mints que o hot-tokens devolve nas 4 redes e cruzar com as 445 bases por simbolo e por endereco quando houver. | Restricao que prende: Cota OnchainOS sem denominador publicado e 100 linhas por rede (source-ecosystem.ts:293), sem universo completo | Experimento mais proximo: Registrar 7 dias de leituras do hot-tokens em sombra e contar mints com simbolo unico e com par OKX | Ganho: Transforma a pergunta em numero medido na propria fonte negociada; custo e leitura de cota OnchainOS dentro do teto de 15 por ciclo | Esforco: baixo a medio | Como medir: Fracao de mints gravados com par OKX e com simbolo unico no registro, por dia e por rede
- **Bolsa como regime de mercado, sem ponte por mint**: Usar a variacao mediana das bases USDT da OKX como indicador agregado de regime, sem ligar a token. | Restricao que prende: Sem ponte por mint a bolsa nao identifica o token a comprar (a3, a10) | Experimento mais proximo: Calcular em sombra a mediana de variacao das 443 bases USDT a partir do snapshot REST de tickers e comparar com a variacao do hot-tokens no mesmo intervalo | Ganho: Qualitativo: informa se o mercado esta em alta ou queda, nao qual token comprar | Esforco: baixo | Como medir: Correlacao entre o regime da bolsa e o retorno liquido por operacao dos recibos atuais
- **Ponte por simbolo unico**: Usar apenas os simbolos que aparecem uma unica vez no registro e medir o erro do cruzamento antes de qualquer sinal. | Restricao que prende: 162 de 217 simbolos com registro colidem (a6), e nome unico nao prova identidade | Experimento mais proximo: Confirmar manualmente 20 pares do cruzamento por simbolo unico contra fonte primaria de contrato | Ganho: Cobertura maxima de 55 bases (12,4%), com risco de colisao de simbolo | Esforco: baixo | Como medir: Fracao de cruzamentos confirmados e taxa de falso positivo
- **Fechar o denominador local antes de medir**: Identificar o formato dos registros de compra que guardam mint e extrair o conjunto completo de mints negociados. | Restricao que prende: Busca por chave mint em tres arquivos de data/ retornou zero (a9), formato nao identificado | Experimento mais proximo: Localizar, sem ler enderecos de carteira, o campo de mint dos recibos de compra em data/ e contar mints distintos | Ganho: Fecha a lacuna do denominador local; hoje a amostra e de 10 mints | Esforco: baixo | Como medir: Numero de mints distintos do historico e fracao com par OKX por simbolo e por endereco

### Achados

- [a1|fato|alta|VERIF=confirmado] O universo negociado nao tem lista fixa de mints no codigo: o ecossistema le hot-tokens por rede com limit 100 e signals com limit 100, em tempo de execucao, para no maximo 4 redes.
    fonte: src/inonu/source-ecosystem.ts:32 (DEFAULT_ECOSYSTEM_CHAINS), :33 (ECOSYSTEM_MAX_CHAINS=4), :293-294 (leituras /onchain/hot-tokens e /onchain/signals com limit 100), :35 (RISK_READS=6)
- [a2|calculo|alta|VERIF=confirmado] Snapshot oficial da OKX em 2026-10-17: GET /api/v5/public/instruments?instType=SPOT retorna 1184 instrumentos, todos state live, 445 baseCcy distintos; quote USDT em 443 bases, USDC 298, EUR 272, TRY 133, BRL 11.
    fonte: https://www.okx.com/api/v5/public/instruments?instType=SPOT (curl sem chave; contagem em scratchpad, stats.ts)
- [a3|fato|alta|VERIF=confirmado] Os campos de instrumentos spot da OKX (baseCcy, quoteCcy, instId, state, tickSz, lotSz etc.) e os de tickers (instId, last, askPx, bidPx, vol24h, ts etc.) nao incluem endereco de contrato Solana. A ligacao com mint so pode ser feita por simbolo.
    fonte: https://www.okx.com/api/v5/public/instruments?instType=SPOT e https://www.okx.com/api/v5/market/tickers?instType=SPOT (lista de chaves do primeiro registro de cada um)
- [a4|fato|alta|VERIF=confirmado] Tickers spot: 1184 linhas com 1184 instId distintos, code 0. Confirma a1 do T03 (a2 do T03 tambem coerente: um GET cobre todo o tipo SPOT).
    fonte: https://www.okx.com/api/v5/market/tickers?instType=SPOT; docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t03-okx-exchange-ws.md:12 e :14
- [a5|fato|alta|VERIF=confirmado] Registro publico Jupiter: 287.863 entradas; tags unknown 286.366, token-2022 8.573, community 1.042, old-registry 447, solana-fm 389, wormhole 42; nenhuma entrada com tag verified. Confirma a16 do T03.
    fonte: https://cache.jup.ag/tokens (download publico, sem endereco enviado; contagem em scratchpad)
- [a6|calculo|media|VERIF=confirmado] Simbolo nao identifica mint: 217 das 445 bases OKX aparecem como simbolo no registro (48,8%), mas 162 desses simbolos tem mais de uma entrada. Nome unico no registro: 55 de 445 bases (12,4%), sem prova de identidade.
    fonte: Calculo sobre a2 e a5 (map.ts, scratchpad); 217/445 e 55/445 = 12,4%
- [a7|calculo|alta|VERIF=confirmado] Teto estrutural: 445 bases spot divididas pelo registro de 287.863 entradas dao 0,15% do registro com possibilidade de par na OKX. E um teto de universo, nao a fracao negociada.
    fonte: 445 / 287.863 = 0,155%; a2 e a5
- [a8|fato|media|VERIF=parcial] Historico local de execucao: 11 linhas com chave mint e 10 mints distintos; 1 (USDC, um stablecoin) esta no registro e tem par USDT na OKX; 9 nao estao no registro Jupiter, portanto o simbolo nao e conhecido.
    fonte: data/decision-review/execution-audits.jsonl (contagem por chave mint; enderecos nao reproduzidos)
    >> parcial: Confere: execution-audits.jsonl tem 11 linhas JSON; 10 mints distintos somando orders.mint (9), orders.fill.mint (7), orders.cash.mint (1), roundTrips.mint (2) e roundTrips.quoteMint (1), na uniao; 1 presente no registro por endereco. USDC-USDT existe na OKX (instId USDC-USDT). A frase portanto o simbolo nao e conhecido e inferencia, nao fato: mint ausente do registro Jupiter nao prova que o simbolo e desconhecido. | correcao: Dizer: 9 dos 10 mints nao estao no registro Jupiter; nao ha simbolo verificado para eles nesta fonte. Remover a conclusao sobre o simbolo ou marca-la como inferencia.
- [a9|fato|media] O historico de compras com mints nao foi extraido: busca por chave mint ou token com endereco base58 em data/events.jsonl (425 MB), data/final-main-journal.jsonl e data/decision-review/audits.jsonl retornou zero. O formato desses registros nao foi identificado.
    fonte: data/events.jsonl, data/final-main-journal.jsonl, data/decision-review/audits.jsonl (grep, sem leitura de enderecos de carteira)
- [a10|inferencia|media] Nao ha dado para dizer que a bolsa cobre o universo negociado. A cobertura por mint e indeterminada na amostra local (1 de 10, e esse 1 e um stablecoin) e o registro de 287.863 entradas nao permite estimar fracao sem fonte primaria de contrato.
    fonte: a6, a7, a8 e a3 combinados; nao verificado: fracao do hot-tokens com par OKX

### Decisao para o Jev

Pergunta: Como a bolsa OKX entra no agente, dado que a cobertura por mint dos tokens negociados nao foi medida?
Reversivel: true

- adiar_medir_sombra (Adiar e medir a cobertura em sombra): Por 7 dias, gravar os mints do hot-tokens nas 4 redes e cruzar com os pares OKX por simbolo e por endereco quando houver. Nada entra na decisao de compra. | Evidencia: Cobertura por mint nao medida; 9 de 10 mints locais sem simbolo (a8)
- regime_de_mercado (Usar a bolsa so como regime): A mediana de variacao das 443 bases USDT indica regime agregado do mercado, sem ligar a token. Nao depende da ponte mint-simbolo. | Evidencia: 445 bases spot e 443 com USDT no snapshot (a2)
- ponte_simbolo_unico (Cruzar por simbolo de nome unico): Sinal da bolsa so para os 55 simbolos com uma unica entrada no registro. Os 162 simbolos que colidem ficam de fora. A precisao do cruzamento nao e medida. | Evidencia: 55 de 445 com nome unico; 162 colisoes (a6)
- sinal_por_mint_fonte_oficial (Sinal por mint so com fonte oficial): Antes de qualquer sinal por mint, achar fonte primaria que ligue simbolo OKX a endereco Solana. Hoje nenhuma fonte foi encontrada. | Evidencia: OKX spot sem campo de endereco de contrato (a3)

Recomendacao sem Jev: adiar_medir_sombra - E a opcao mais reversivel e de menor risco: nao muda nenhuma decisao de compra, usa so leituras publicas e a cota ja existente, e entrega o numero que falta (cobertura por mint) em 7 dias. Cruzar por simbolo hoje daria 12,4% de nomes unicos sem prova de identidade.
Cetico: decisao_ok=false; problemas: Opcao adiar_medir_sombra conflita com a restricao 3 da decisao: gravar hot-tokens nas 4 redes por 7 dias amplia leituras da OnchainOS sem decisao do dono, e pode sair da cota gratuita (assunto de servico pago, vedado ao Jev). Correcao: reescrever usando so leituras que o runtime ja faz (source-ecosystem.ts:293-294) ou submeter o limite de leituras como decisao separada. | Opcao ponte_simbolo_unico conflita com a restricao 1 se o sinal alimentar compra ou venda. Correcao: restringir a sombra, sem efeito na decisao de compra, e declarar que 55 e o resultado da correspondencia exata (58 sem distincao de maiusculas). | Fato bases_simbolo_unico (55 de 445) depende do metodo de correspondencia. A decisao deve registrar o metodo e o intervalo 55 a 58. | Os itens de desconhecidos d1, d2 e d3 estao redigidos como perguntas (campo ask), o que contraria a regra de nunca perguntar ao dono. Converter cada um em decisao estruturada ou registrar como nao verificado. d2 exige medir leituras reais da OnchainOS, o que consome cota. | Fato universo_runtime e correto, mas a decisao nao menciona que a lista de redes pode vir do saldo (source-ecosystem.ts:94-98) e que o corte de 4 redes e aplicado depois da escolha. A fracao negociada nao e medida em nenhuma opcao. | Fato de a8 sobre o simbolo desconhecido e inferencia; se for usado como fato na decisao, esta errado. | Nota de risco nao decidida: as opcoes regime_de_mercado e adiar_medir_sombra dependem de dados da OKX. Usar a API publica v5 nao e raspagem do site, mas o alerta da pesquisa sobre o OKX API Agreement 9.4 continua sem decisao do dono e deve ser citado na decisao. | A decisao nao traz opcao que nao dependa da ponte por simbolo. Falta a opcao de medir o atrito e o movimento so com pools on-chain, que trazem os dois mints do par (docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:74-79, :127), com a ressalva de IDL nao validado (:79).

### Bloqueios do dono

- Escolher fonte de contrato de token como dependencia de producao nova ou servico pago (por exemplo, API de registro paga ou biblioteca nova) e decisao do dono.
- Gravar mint ou simbolo em tabela ou journal do ledger e migracao de schema; vedado ao Jev e a esta pesquisa.
- Ampliar leituras OnchainOS para medir a cobertura de forma continua tem custo de cota e pode virar servico pago; decisao do dono.
- Raspagem do site da OKX para obter lista de pares nao foi feita e segue vedada pelo OKX API Agreement 9.4 (citado no escopo).

### Novos tickets revelados

- Fonte primaria de contrato para simbolos OKX: Existe fonte oficial (OKX, Jupiter strict, metadados Solana) que mapeie endereco Solana a simbolo spot da OKX, com identidade confirmada?
- Denominador de mints negociados: Qual formato de registro guarda o mint das compras em data/ e quantos mints distintos ha no historico completo, sem ler enderecos de carteira?
- Cobertura do registro Jupiter: O registro cache.jup.ag/tokens cobre os tokens que o agente negocia? Por que 9 dos 10 mints locais nao aparecem nele?

### Nao lido

- Historico de compras completo: data/events.jsonl (425 MB), data/final-main-journal.jsonl e data/decision-review/audits.jsonl nao tiveram o campo de mint localizado; formato nao identificado.
- Hot-tokens e signals reais da OnchainOS: nao lidos (sem credencial nem chamada nesta fase).
- Termos de uso e documentacao oficial da OKX sobre endereco de contrato: nao localizados; a API publica nao tem o campo.
- Os 9 mints nao estaveis locais nao foram resolvidos no registro; nao verificado se estao ausentes ou se o registro e parcial.
- Cota real de chamadas OnchainOS e limites por segundo: nao publicados (T02).
- Arquivo src/inonu/source-ecosystem.ts nao contem lista de mints; as leituras sao dinamicas, nao ha denominador fixo.

### Resumo do cetico

Reverifiquei as 8 afirmacoes contra o repo e contra a OKX (GET publico v5 em 2026-10-17), o registro Jupiter (cache.jup.ag/tokens) e data/decision-review/execution-audits.jsonl (so contagens; nenhum endereco reproduzido). Resultado: 7 confirmadas e 1 parcial (a8). Na decisao, a contagem de bases com simbolo no registro depende do metodo: com correspondencia exata reproduz 217/55/162 (a6), sem distincao de maiusculas da 234/58/176. A decisao nao pode ir ao Jev como esta: duas opcoes conflitam com restricoes, falta uma opcao sem ponte por simbolo, e os tres "desconhecidos" estao redigidos como perguntas ao dono.

## Comments

