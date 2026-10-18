# Lacuna g4: E possivel ler o estado de pools Solana (Raydium CP e CLMM, Orca Whirlpool, Meteora) por RPC WebSocket com decodificador validado contra o IDL oficial, e quantos pools por segundo cabem num plano pago de Helius, Triton ou QuickNode, a que custo mensal?

> Saída bruta de um agente Haiku 5.5 (esforço médio) do workflow wf_31a20d79-702, em 2026-10-17, com o veredito do cético por afirmação (VERIF=...). Material de proveniência, NÃO curado: pode conter erros que o cético marcou e que eu corrigi em [../research.md](../research.md) e [../status.md](../status.md). Onde divergir, valem esses dois. Endereços e caracteres vedados foram removidos.

# g4: E possivel ler o estado de pools Solana (Raydium CP e CLMM, Orca Whirlpool, Meteora) por RPC WebSocket com decodificador validado contra o IDL oficial, e quantos pools por segundo cabem num plano pago de Helius, Triton ou QuickNode, a que custo mensal?

RESUMO: Dá para ler o estado de pools Solana por WebSocket (programSubscribe/accountSubscribe) com decodificador próprio, e o custo mensal ficou medido por fonte primária da Helius e por cálculo para Triton e QuickNode. O gargalo de cobrança não é o binding: por plano, a capacidade sustentada é de centenas a milhares de atualizações por segundo com contas de cerca de 1,5 KB. Não foi possível confirmar em fonte primária os limites de conexão da Triton, a cobrança de WebSocket da QuickNode na página oficial, nem os IDLs oficiais de Raydium CLMM, Orca e Meteora. Os cálculos assumem payload de 1.544 bytes por atualização, mês de 30 dias e 1 slot de 400 ms; overhead de protocolo gRPC não foi medido. Nenhuma chamada paga ou ordem foi feita.

## ACHADOS
- [a1|fato|alta|VERIF=confirmado] Helius planos: Free US$0 (1M créditos, 10 req/s); Developer US$49 (10M, 50 req/s); Business US$499 (100M, 200 req/s); Professional US$999 (200M, 500 req/s). LaserStream mainnet só em Business e Professional. A tabela da página conflita com o FAQ da add-on de dados de 5 TB (US$400 na tabela, US$500 no FAQ).
    fonte: https://www.helius.dev/docs/billing/plans
    numeros: Developer 10M cr / US$49; Business 100M / US$499; Professional 200M / US$999
- [a2|fato|media|VERIF=confirmado] Helius cobra excedente de US$5 por milhão de créditos. Vem de snippet de busca, não da página de preços aberta diretamente.
    fonte: https://www.helius.dev/pricing (via WebSearch, não verificado na página)
    numeros: US$5 por milhão de créditos
- [a3|fato|alta|VERIF=parcial] Helius custo em créditos: getProgramAccounts 10 créditos por chamada; getProgramAccountsV2 1 crédito; accountSubscribe e programSubscribe (WSS padrão) cobrados por volume a 2 créditos por 0,1 MB, disponíveis em todos os planos; LaserStream gRPC 2 créditos por 0,1 MB.
    fonte: https://www.helius.dev/docs/billing/credits
    numeros: getProgramAccounts 10; V2 1; WSS 2 cr/0,1 MB
    >> parcial: Confirmados: getProgramAccounts 10 creditos por chamada e getProgramAccountsV2 1 credito (versao paginada). WSS padrao 2 creditos por 0,1 MB de dado (descomprimido) em todos os planos, e LaserStream gRPC 2 creditos por 0,1 MB, com mainnet exigindo Business ou Professional. A pagina de creditos nao cita accountSubscribe ou programSubscribe pelo nome, entao a aplicacao desses metodos e inferencia a partir da categoria 'metodos padrao'. | correcao: Trocar 'accountSubscribe e programSubscribe cobrados a 2 creditos por 0,1 MB' por 'metodos padrao via WSS, 2 creditos por 0,1 MB (inferido que inclui accountSubscribe e programSubscribe)'.
- [a4|fato|alta] Helius não lista limite de conexões WebSocket nem limite de subscrições por plano, nem contagem de conexões LaserStream. O único limite numérico listado é de req/s de RPC.
    fonte: https://www.helius.dev/docs/billing/plans e https://www.helius.dev/docs/billing/credits
    numeros: nao listado
- [a5|fato|alta|VERIF=confirmado] Triton One: pay-as-you-go, depósito mínimo de US$125 prepago, não reembolsável, validade de 12 meses. Tarifas: RPC padrão, gRPC unário, contas e ledger US$10 por milhão de chamadas mais US$0,08 por GB; streaming e Titan Prime só US$0,08 por GB. A página não nomeia Dragon's Mouth nem Yellowstone.
    fonte: https://triton.one/pricing
    numeros: US$125 depósito; US$0,08/GB streaming; US$10/milhão chamadas
- [a6|fato|baixa] Triton não publica números de limite de conexão ou de requisições por segundo na página de preços ('Flexible rate and connection limits', sem valor). Fontes de terceiros divergem (DappAtlas e RPC Fast dizem pay-as-you-go; Chainstack de maio de 2026 diz preço sob consulta).
    fonte: https://triton.one/pricing; agregadores via WebSearch
    numeros: nao verificado
- [a7|fato|alta|VERIF=confirmado] QuickNode planos oficiais: Free trial 10M créditos, 15 req/s; Build US$49 (80M, 50 req/s); Accelerate US$249 (450M, 125 req/s); Scale US$499 (950M, 250 req/s); Business US$999 (2B, 500 req/s). Créditos extras de US$0,62 a US$0,50 por milhão conforme plano.
    fonte: https://www.quicknode.com/pricing
    numeros: Build 80M/US$49; Accelerate 450M/US$249; Scale 950M/US$499; Business 2B/US$999
- [a8|fato|media|VERIF=confirmado] QuickNode gRPC Solana: add-on de US$499 por mês em Build e Accelerate; incluído em Scale (10 streams concorrentes, 10 contas por stream) e Business (25 streams concorrentes, 50 contas por stream). Contagem de streams ativos conflita (5 na tabela de features, 10 na descrição do Scale).
    fonte: https://www.quicknode.com/pricing (extração via WebFetch)
    numeros: Scale 10 streams x 10 contas = 100 contas; Business 25 x 50 = 1.250 contas
- [a9|fato|media|VERIF=parcial] QuickNode: a página de preços não menciona cobrança de WebSocket. Post oficial no X anuncia cobrança por dado entregue a partir de 1 de maio de 2026, a 15 créditos por 0,1 MB. Outra fonte diz julho de 2026. Os dados são de post e busca, não da documentação.
    fonte: https://x.com/Quicknode/status/2050189983114297429 (via WebSearch, não aberto)
    numeros: 15 cr por 0,1 MB
    >> parcial: A pagina de precos nao menciona cobranca de WebSocket, confirmado. A documentacao oficial de logsSubscribe (aberta) diz que desde 1 de maio de 2026 o metodo e cobrado por dado medido, 0,1 MB = 15 creditos de API. A busca indica 1 de maio para logsSubscribe e voteSubscribe e 1 de julho de 2026 para blockSubscribe, por metodo, nao por plano. O post no X retornou HTTP 402 e nao foi lido. Hyperliquid cobra 10 creditos por 0,1 MB, entao a taxa muda por cadeia. | correcao: Substituir 'post no X anuncia 1 de maio' por: a doc Solana da QuickNode diz 15 creditos por 0,1 MB, com inicio em 1 de maio de 2026 para logsSubscribe e voteSubscribe e em 1 de julho de 2026 para blockSubscribe. A cobranca vale para WebSockets Blazar do Solana, nao para todo WebSocket.
- [a10|fato|alta|VERIF=parcial] Raydium CLMM: program ID declarado em declare_id!. Mainnet <endereco-omitido>; devnet <endereco-omitido> (feature devnet). Structs de conta visíveis: CreatePool, OpenPosition, SwapSingle etc.; PoolState não está nesse arquivo.
    fonte: https://github.com/raydium-io/raydium-clmm/blob/master/programs/amm/src/lib.rs
    numeros: <endereco-omitido>
    >> parcial: Confirmado: declare_id! mainnet <endereco-omitido> e devnet <endereco-omitido> sob #[cfg(feature = "devnet")]. Errado: lib.rs nao define nenhuma struct de conta. CreatePool, OpenPosition e SwapSingle nao estao no arquivo; ele importa tipos de instructions e states (ex.: CreateAmmConfig e SwapSingleV2). PoolState esta em states/pool.rs, como a11 afirma. | correcao: Trocar 'Structs de conta visiveis: CreatePool, OpenPosition, SwapSingle etc.' por: lib.rs define o modulo do programa e importa os tipos de conta (ex.: CreateAmmConfig, SwapSingleV2) de instructions e states.
- [a11|calculo|media|VERIF=confirmado] Raydium CLMM PoolState em programs/amm/src/states/pool.rs, #[repr(C, packed)]. Soma dos campos derivada dos tipos: 1.536 bytes, mais 8 do discriminador Anchor = 1.544 bytes. Cálculo a partir do código, não verificado contra conta real na mainnet. O IDL JSON oficial não foi lido.
    fonte: https://github.com/raydium-io/raydium-clmm/blob/master/programs/amm/src/states/pool.rs
    numeros: 1.544 bytes; RewardInfo 169 bytes
- [a12|fato|alta|VERIF=parcial] Orca Whirlpool: program ID <endereco-omitido> declarado em programs/whirlpool/src/lib.rs. Só 1.000 de 1.329 linhas visíveis; a struct Whirlpool não foi confirmada no trecho lido (provável em state/).
    fonte: https://github.com/orca-so/whirlpools/blob/main/programs/whirlpool/src/lib.rs
    numeros: <endereco-omitido>
    >> parcial: Confirmado: declare_id!("<endereco-omitido>") em programs/whirlpool/src/lib.rs, e struct Whirlpool nao esta definida nesse arquivo (ha pub mod whirlpool e importacao de WhirlpoolBumps). Nao verificavel: a contagem 1.000 de 1.329 linhas, porque a extracao nao traz numeracao de linha. | correcao: Manter o program ID. Remover ou marcar como nao verificada a contagem de linhas.
- [a13|fato|media] Meteora DLMM: o repositório dlmm-sdk tem pasta idls com um arquivo visível, dlmm.json. Program ID não obtido. Conteúdo do JSON e sua origem oficial não lidos.
    fonte: https://github.com/MeteoraAg/dlmm-sdk/tree/main/idls
- [a14|fato|alta] Solana programSubscribe: até 4 filtros; dataSlice com offset e length; encoding base58 e binary falham acima de 128 bytes após slicing (recomenda base64 para contas maiores); uma notificação por conta; não há limite de taxa documentado nesta página.
    fonte: https://solana.com/docs/rpc/websocket/programsubscribe
    numeros: 4 filtros; 128 bytes em base58
- [a15|fato|alta] Solana getProgramAccounts: até 4 filtros (memcmp, dataSize, tokenAccountState), dataSlice, withContext sem efeito em PubSub. A página não traz aviso de limite de taxa nem sobre índice customizado em RPC público.
    fonte: https://solana.com/docs/rpc/http/getprogramaccounts
- [a16|calculo|media] Capacidade sustentada em 30 dias, por plano, com 1.544 bytes por atualização de pool (1 atualização por segundo = 2,592 M por mês): Helius Developer (10M cr) ~125 atualizações/s; Business (100M) ~1.249/s; Professional (200M) ~2.499/s. QuickNode, se valer 15 cr por 0,1 MB: Build (80M) ~133/s; Scale (950M) ~1.582/s; Business (2B) ~3.332/s.
    fonte: Cálculo sobre a1, a3, a7, a9 e a11
    numeros: Helius: 0,03088 cr por atualização; QuickNode: 0,2316 cr por atualização
- [a17|calculo|media] Custo por atualização na Triton (US$0,08 por GB) é de cerca de US$ 1,24e-7 para 1.544 bytes. US$999 por mês equivalem a ~3.120 atualizações/s de capacidade financeira. Isso é teto de custo, não de limite técnico, já que o limite de conexão não foi publicado.
    fonte: Cálculo sobre a5 e a11
    numeros: US$1,24e-7 por atualização
- [a18|calculo|media] Carga de referência de 1.000 pools: a 1 Hz, Helius consome ~80 M créditos por mês (cabe no Business de 100M, US$499). A 2,5 Hz (uma atualização por slot de 400 ms, premissa não verificada nesta pesquisa), Helius consome ~200 M (acima do Business, custo ~US$1.000 com excedente, ou o Professional de 200M no limite). Triton a 1 Hz custa ~US$320 por mês e a 2,5 Hz ~US$800, mais o depósito de US$125. QuickNode a 2,5 Hz ~1,5 B créditos (cabe no Business de 2B, US$999), mas exige gRPC com 1.000 contas, o que só fecha no Business (1.250 contas).
    fonte: Cálculo sobre a1, a3, a5, a7, a8, a11
    numeros: Helius 80M/200M cr; Triton US$320/US$800; QN 1,5B cr
- [a19|calculo|media] getProgramAccounts a 10 créditos por chamada: Developer (10M) dá ~1M chamadas por mês (~0,39/s); Business (100M) ~10M (~3,9/s). O custo não varia com o tamanho da resposta segundo a página de créditos, o que não foi verificado com medição.
    fonte: Cálculo sobre a3
    numeros: 0,39/s e 3,9/s
- [a20|inferencia|media] Inferência: com a cobrança de WebSocket por volume, o custo de dados por pool é pequeno (~0,03 cr por atualização na Helius). O limite prático tende a ser req/s, conexões, latência e fan-out de decodificação, não o preço. Isso precisa de medição, não de prova.
    fonte: a3, a14, a16, a18
- [a21|calculo|alta] Inferência: a meta de 0,5% a 1% por minuto sobre o capital inteiro, composto, exige ganho líquido que nenhuma fonte desta pesquisa suporta. Cálculo: 1,005^60 ≈ 1,35 por hora; 1,005^1440 ≈ 1.300 por dia; 1,01^1440 ≈ 1,7 milhão por dia. Assim, a decisão dos dados está limitada pela liquidez, taxas e slippage, que não foram medidos aqui.
    fonte: Cálculo puro sobre a meta do dono
- [a22|fato|alta] Os tópicos t04 e t08 da pesquisa de origem não foram encontrados no repositório. Busca por t04, t08 e t09 em docs/ achou só docs/_meta/evolucao/tarefas/frontend-ux-20261013--t09.md, que é outra fase (otimização de frontend), não pesquisa de dados.
    fonte: Grep em docs

## LIMITES E QUOTAS
- [lim1] Helius RPC req/s: Free 10; Developer 50; Business 200; Professional 500 (plano Helius planos) | fonte: https://www.helius.dev/docs/billing/plans
- [lim2] Helius créditos mensais: Free 1M; Developer 10M; Business 100M; Professional 200M; excedente US$5 por milhão (snippet) | fonte: https://www.helius.dev/docs/billing/plans; https://www.helius.dev/pricing (snippet)
- [lim3] Helius WebSocket (accountSubscribe/programSubscribe): 2 créditos por 0,1 MB; conexões e subscrições não listadas | fonte: https://www.helius.dev/docs/billing/credits
- [lim4] Helius getProgramAccounts: 10 créditos por chamada | fonte: https://www.helius.dev/docs/billing/credits
- [lim5] Triton pay-as-you-go: Depósito mínimo US$125 prepago por 12 meses; US$0,08/GB; US$10 por milhão de chamadas unárias; conexões e req/s não publicados | fonte: https://triton.one/pricing
- [lim6] QuickNode req/s: Free 15; Build 50; Accelerate 125; Scale 250; Business 500 | fonte: https://www.quicknode.com/pricing
- [lim7] QuickNode créditos mensais: Free 10M; Build 80M (US$49); Accelerate 450M (US$249); Scale 950M (US$499); Business 2B (US$999); excedente US$0,62 a US$0,50 por milhão | fonte: https://www.quicknode.com/pricing
- [lim8] QuickNode gRPC Solana: Build e Accelerate: add-on US$499; Scale: 10 streams x 10 contas; Business: 25 streams x 50 contas | fonte: https://www.quicknode.com/pricing (extração)
- [lim9] Solana programSubscribe: Até 4 filtros; base58 falha acima de 128 bytes após slicing; sem limite de taxa documentado | fonte: https://solana.com/docs/rpc/websocket/programsubscribe

## OPORTUNIDADES
- Assinatura por conta de pool com decodificador próprio: Assinar accountSubscribe por pool (Raydium CLMM, Orca Whirlpool, Meteora DLMM) ou programSubscribe por programa com filtro por discriminador e dataSlice. Decodificar com layout validado contra IDL oficial (ainda não lido) e contra fixtures reais. | ganho: n/d | esforco: n/d | depende: n/d | medir: Comparar byte a byte o decode com getAccountInfo em amostra de 50 pools; medir atraso por slot entre notificação e estado; medir créditos gastos por hora no painel do provedor.
- Gateway gRPC com filtro por programa: Assinatura gRPC (Yellowstone/Dragon's Mouth da Triton, ou add-on QuickNode) com filtro por owner, no lugar de muitas contas. Cobrança da Triton é só por GB. | ganho: n/d | esforco: n/d | depende: n/d | medir: Custo de GB por hora com 1.000 pools; medir perda de atualizações por reconexão; confirmar limite de conexões com a Triton antes de contratar.
- Reduzir chamadas à OnchainOS para decisão e execução: Usar feed próprio para cotações e a OnchainOS só para cotação final e execução, conforme a meta do dono. Hipótese a validar, não promessa. | ganho: n/d | esforco: n/d | depende: n/d | medir: Contar chamadas à OnchainOS por ciclo antes e depois; medir desvio entre cotação do feed e cotação final.
- Raspagem do ecossistema OKX Wallet e OnchainOS: Avaliar raspagem de páginas públicas como fonte de dados. Antes de qualquer uso, revisar termos de uso e robots.txt. Não contornar CAPTCHA nem anti-bot. | ganho: n/d | esforco: n/d | depende: n/d | medir: Não medido. Levantar termos e robots.txt; medir só com páginas públicas sem autenticação.

## RISCOS
- Decodificador desalinhado com a versão on-chain: Um upgrade de programa muda o layout e o decode passa a gerar valores errados sem erro. Mitigação: checar tamanho (1.544 bytes no Raydium CLMM) e discriminador antes de decodificar, e alertar em divergência.
- Limites de conexão não publicados: Helius e Triton não listam limite de conexões WebSocket ou de subscrições. Um plano que parece barato pode bater um teto não documentado. Mitigação: teste de carga em conta gratuita antes de contratar.
- Cobrança de WebSocket da QuickNode não confirmada: A cobrança por dado entregue vem de post no X, não da página de preços, e as datas conflitam. Mitigação: confirmar na documentação antes de orçar.
- Raspagem pode violar termos ou ser bloqueada: Raspar OKX Wallet ou OnchainOS pode violar termos e disparar anti-bot. Mitigação: não usar como fonte de decisão sem revisão jurídica e de termos.
- Taxas e slippage podem anular o ganho: Com meta de 0,5% a 1% por minuto, taxas de rede, prioridade, slippage e impacto de preço consomem o ganho bruto. Não medido nesta pesquisa.

## PERGUNTAS ABERTAS
- Qual é o limite real de conexões WebSocket e de subscrições por conta na Helius, Triton e QuickNode? Não está publicado; exige teste em plano gratuito ou contato comercial.
- Qual é o tamanho real medido das contas de pool na mainnet (Raydium CLMM 1.544 bytes é cálculo, não medição)?
- Os IDLs oficiais de Raydium CLMM, Orca Whirlpool e Meteora DLMM (dlmm.json) batem com o layout usado no decodificador?
- Quantos pools Solana existem nas três DEX e quantos têm liquidez suficiente para a meta? Não verificado.
- A cobrança de WebSocket da QuickNode é mesmo por dado entregue (15 cr por 0,1 MB)? Verificar na documentação oficial.
- Qual é o custo real de getProgramAccounts por tamanho de resposta na Helius? A página diz 10 créditos fixos, sem medição.

## NAO LIDO
- Página de preços oficial da Helius (helius.dev/pricing), só via snippet de busca
- Post oficial da QuickNode (x.com/Quicknode/status/2050189983114297429), só via snippet de busca
- Documentação de limites da Triton (conexões, req/s) e de Dragon's Mouth ou Yellowstone; a página de preços não traz números
- IDL JSON oficiais de Raydium CLMM, Orca Whirlpool e conteúdo de dlmm.json da Meteora
- Restante de programs/whirlpool/src/lib.rs (linhas 1001 a 1329) e de state/ da Orca
- Program ID da Meteora DLMM (não obtido)
- Documentação de limites de RPC público da Solana (solana.com/docs/rpc/rate-limits), não lida
- Arquivos t04 e t08 da pesquisa de origem: não encontrados no repositório
- Medição real de payload e de latência: não feita, sem chamadas pagas nem leituras de rede ao vivo

RESUMO DO CETICO: Reverificacao da Lacuna 4 contra fontes primarias (paginas oficiais, codigo-fonte no GitHub, docs da QuickNode). Confirmados: precos e limites da Helius (a1), overage de US$5 por milhao de creditos (a2, agora lido na pagina), custos de credito da Helius (a3 parcial, por o nome accountSubscribe nao aparecer na pagina), Triton (a5), QuickNode planos e extras (a7), gRPC QuickNode (a8), program IDs Raydium e Orca (a10, a12). Corrigidos: a9 (15 cr/0,1 MB confirmado na doc, mas datas variam por metodo e cadeia, post no X nao lido), a10 (structs de conta nao estao em lib.rs, sao importadas; SwapSingle e SwapSingleV2). O tamanho de 1.544 bytes do PoolState (a11) confere pela soma dos campos do codigo, com DynamicFeeInfo de 80 bytes em states/pool_fee.rs; nao foi conferido contra conta real na mainnet. Limitacao: as extracoes de pagina passaram por modelo pequeno de resumo, nao por leitura integral; a linha de contagem do arquivo Orca (a12) nao foi verificada.
