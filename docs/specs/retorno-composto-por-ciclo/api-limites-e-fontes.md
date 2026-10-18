# Limites de API, fontes de dados e raspagem

Data de leitura: 2026-10-17. Estado de cada linha: **C** confirmado em fonte primária (página oficial ou código), **P** parcial (confere em parte, ou só por resumo de busca ou de modelo), **N** não verificado. As leituras de página passaram pelo WebFetch, que devolve um resumo feito por modelo pequeno, não o texto bruto; a numeração de seções pode divergir entre leituras. Antes de qualquer decisão de custo ou de termos, reabrir a página no navegador. Proveniência por afirmação em [evidence/](evidence/).

## 1. OKX OnchainOS

Página de tarifas do Market: `web3.okx.com/onchainos/dev-docs/market/market-api-fee` (reconferida por mim hoje).

| Plano | Preço por mês | Basic por mês | Premium por mês | WebSocket | Estado |
| --- | --- | --- | --- | --- | --- |
| Free | US$ 0 | 100 mil | 100 mil | não | C |
| Starter | US$ 99 | 2 milhões | 600 mil | sim | C |
| Growth | US$ 199 | 5 milhões | 2 milhões | sim | C |
| Scale | US$ 399 | 20 milhões | 10 milhões | sim | C |
| Pro | US$ 599 | 50 milhões | 20 milhões | sim | C |
| Enterprise | sob consulta | ilimitado | ilimitado | sim | C |
| Pagamento por chamada (x402) | sem mensalidade | 100 mil grátis, depois US$ 0,0001 | 100 mil grátis, depois US$ 0,0002 | não citado | C |

- Cotas reiniciam no dia 1. Pagamento em USDG ou USDT na X Layer. Exige assinatura de pagamento por requisição; o projeto marcou x402 como fora (o app não assina sozinho).
- Limite por segundo, minuto ou dia do **Market**: **não publicado**. A página só cita "RPS adjustments" e manda procurar o Discord ou a BD (`dexapi@okx.com`). O piso de 1 requisição por segundo do cliente do projeto é configuração local, não limite medido (P).
- Código de erro de limite: `50011` com HTTP 429 e mensagem "Rate limit reached..." (C, páginas de códigos de erro do Market e do DEX). Nenhum cabeçalho de limite restante é documentado. Os cabeçalhos `x-ratelimit-*` que aparecem em `docs/okx-dex-sdk-units-v1/SOURCES.json` são da API do GitHub, não da OKX.
- Cota esgotada no plano: a página não informa o código de erro (N).
- Em `scripts/api-budget.ts:17-20` o `PAID_PLANS` lista só Starter e Growth; faltam Scale, Pro e Enterprise (divergência real).
- Em `docs/sdd/inonu-desktop-v1/onchainos-coverage.md:33` está "402 vira cota esgotada"; o código (`src/onchainos/http.ts:438-439`) trata 402 como pagamento exigido e grava `paymentBlockedUntil` (`http.ts:427`). O documento deve ser corrigido.

Página do Trade: `web3.okx.com/onchainos/dev-docs/trade/api-fee` (reconferida por mim hoje).

| Faixa | RPS | Duração | Estado |
| --- | --- | --- | --- |
| Trial | 1 por padrão, até 5 sob análise e aprovação | 60 dias a partir da criação da chave | C |
| Start-up | 2 a 50 | não informada | C |
| Enterprise | customizado | não informada | C |

"RPS adjustment is correlated to trading volume." Não está publicado se o RPS vale por chave, por IP, por conta ou por rota (N), nem em qual faixa está a conta do dono (N, exige o painel do portal). Aritmética: 1 RPS equivale a 60 chamadas por minuto; 500 tokens consultados uma vez por minuto exigem cerca de 8,3 RPS sustentados.

WebSocket da OnchainOS (`.../market/websocket`): exige plano pago; "Connection limit: 3 requests per second (based on API KEY)"; no máximo 480 subscribe/unsubscribe/login por conexão por hora; ping com N menor que 30 s; cai se não houver inscrição ou dado por mais de 30 s; evento `notice` (código 64008) cerca de 30 s antes de uma atualização derrubar a conexão (C, com a ressalva de que a página não diz se os 3 por segundo valem só na abertura). O registro local ("3 conexões por segundo") está impreciso. Catálogo de canais, cobertura por token e latência de push **não são publicados** na página lida (C). O canal de candles empurra no máximo 1 atualização por segundo (P, resumo de busca).

Lotes por chamada documentados (repo): `price-info` até 100 tokens, `index current-price` até 100, candles até 299 (e 1440 recentes), trades até 500, `signal/list` até 100, `hot-token` até 100 com cursor raso (C).

## 2. Bolsa OKX, API pública v5 (sem chave)

| Item | Valor | Estado |
| --- | --- | --- |
| Instrumentos vivos | 1965 (spot 1184, swap 509, futuros 272); bases spot únicas 445 | C, medido em 2026-10-17 |
| Moedas de cotação em spot | EUR 272, USDT 443, USDC 298, TRY 133, BRL 11, outras menos de 10 cada | C |
| Snapshot REST | `GET /api/v5/market/tickers?instType=SPOT` devolve as 1184 linhas (cerca de 369 KB); idade mediana medida de 1,9 a 2,0 s com relógio local não corrigido | C (tamanho); P (idade) |
| WebSocket, conexão | 3 requisições por segundo por IP | C |
| WebSocket, inscrição | 480 subscribe/unsubscribe/login por conexão por hora; 64 KB no total por requisição | C |
| WebSocket, silêncio | queda após 30 s sem inscrição ou dado; ping em menos de 30 s | C |
| Canais por conexão | a doc v5 não publica limite para canais públicos; o limite de 30 conexões por canal vale para canais **privados**; fontes de terceiros citam 50, 100, 240 (conflitantes, não aceitas) | C (ausência); N |
| Teste de carga | uma conexão, 1965 instrumentos no canal tickers: 1965 confirmações, 0 erros, 3870 a 4100 mensagens por segundo; trades: 54,7 por s; books5: 1311 por s | P, uma corrida cada, num sábado |
| Cadência por canal | tickers até 1 por 100 ms; books5 a cada 100 ms com mudança; bbo-tbt 10 ms (1 nível); books tick-by-tick de 50 e 400 níveis só VIP4 ou acima (erro 64003); candle1s e trades-all no caminho `business`; mark-price 200 ms; open interest 3 s; funding 30 a 90 s | C (doc) |
| Latência medida | trades: mediana de cerca de 121 ms entre o carimbo da OKX e a chegada; tickers e books5 mostraram 1,3 a 1,6 s, mistura de snapshot de inscrição com offset de relógio | P, não é latência isolada |
| REST por endpoint | tickers 20 por 2 s por IP, trades 100 por 2 s, books 40 por 2 s, candles 40 por 2 s etc. | **N**: a seção Market Data não foi alcançada na página de 406 mil caracteres; o 20 por 2 s de `Get instruments` está na regra "User ID + Instrument Type" |
| Erro de limite | código 50011; a doc não cita HTTP 429 nem cabeçalho | P |
| Acesso a trades-all, bbo-tbt e candle1s sem VIP | não testado | N |

O repositório já usa esse caminho: `src/inonu/okx-ws.ts` (canal de trades; ping em 20 s e silêncio de 45 s, acima do limiar de 30 s do servidor, risco de janela), `src/jev-read/feed.ts` (trades, books5 e tickers; ping em 25 s, reconexão em 60 s), `src/pulse/pulse.ts` (BTC-USDT e SOL-USDT, barras de 1 min, desligado por padrão).

## 3. Solana e agregadores

| Fonte | Limites e preço (leitura oficial) | Estado |
| --- | --- | --- |
| RPC público Solana | 100 requisições por 10 s por IP, 40 por 10 s por método, 40 conexões simultâneas, 40 novas conexões por 10 s, 100 MB por 30 s; "não para produção" | C |
| Helius | Free: 10 req/s RPC, 2 req/s DAS, 1 milhão de créditos; Developer US$ 49: 10 milhões, 50 req/s; Business US$ 499: 100 milhões, 200 req/s; Professional US$ 999: 200 milhões, 500 req/s; excedente US$ 5 por milhão. WSS padrão cobrado a 2 créditos por 0,1 MB; LaserStream mainnet só em Business e Professional. Limites de conexões e inscrições WebSocket não listados | C (planos, limites); P (créditos de WSS) |
| QuickNode | Free 10 milhões de créditos, 15 req/s; Build US$ 49 (80 milhões, 50 req/s); Accelerate US$ 249; Scale US$ 499; Business US$ 999. gRPC Solana: add-on US$ 499 em Build e Accelerate, incluído em Scale e Business. WebSocket cobrado por dado (15 créditos por 0,1 MB, início em 1 de maio de 2026 para `logsSubscribe`) | C (planos); P (cobrança WS) |
| Triton One | pré-pago, depósito mínimo US$ 125; streaming a US$ 0,08 por GB; chamadas a US$ 10 por milhão; limites de conexão e req/s não publicados | C (preço); N (limites) |
| Jupiter (api.jup.ag) | por organização, janela de 60 s: sem chave 30/min, Free 60/min, Developer 600/min, Launch 3000/min, Pro 9000/min; `/swap/v2/execute` com balde separado (20, 50 e 100 req/s); 429 com `x-ratelimit-reset`. Preços dos planos não lidos | C (limites); N (preços) |
| DexScreener | 60 por minuto em token-profiles, community-takeovers, ads e metas; limites de pares e tokens não localizados | P |
| PumpPortal | novos tokens e migrações grátis; trades por token ou conta: 0,01 SOL a cada 10 mil trades, com chave de API desde 2026-05-01 | C |
| Birdeye | página de preços retornou 403; planos e CUs divergem entre trechos de busca | N |
| GeckoTerminal, Bitquery | não alcançados (DNS e 404) | N |

Leitura de estado de pool por RPC (relevante para o conjunto negociado):

- `programSubscribe` aceita até 4 filtros, `dataSlice`, e `base58` falha acima de 128 bytes após o corte (usar `base64`). `logsSubscribe` com `mentions` aceita um só endereço, então N pools exigem N inscrições. `accountSubscribe`: uma conta por inscrição (inferência a partir da doc).
- A conta `PoolState` do Raydium CLMM soma 1544 bytes (1536 mais 8 de discriminador, por cálculo a partir do código, não medido em conta real).
- Custo (cálculo): com 0,031 crédito por atualização de 1544 bytes na Helius, Developer sustenta cerca de 125 atualizações por segundo; Business, cerca de 1250; Professional, cerca de 2500. O plano Free (1 milhão de créditos) sustentaria cerca de 12 por segundo. Para 1000 pools a 1 Hz: cerca de 80 milhões de créditos por mês (cabe no Business de US$ 499). A premissa de um update por pool por slot (cerca de 2,5 Hz) levaria o consumo a 200 milhões. O limite prático tende a ser conexões, req/s e decodificação, não preço (inferência).
- IDLs oficiais de Raydium CLMM, Orca Whirlpool e Meteora DLMM **não foram lidos**; os layouts vêm de bibliotecas comunitárias (N). Decodificar sem validar contra o IDL é risco de valores errados silenciosos após um upgrade de programa.

## 4. Jev (TypeSafe)

Fonte: `docs.typesafe.ai/models` e `typesafe.ai` (lidas em 2026-10-17).

- Preço: US$ 0,042 por milhão de tokens de entrada; saída gratuita (C). Contexto: 64 mil por requisição, 32 mil por pergunta; 262 mil com o cabeçalho `TypeSafe-Danger-Zone-Long-Context`, com menos acurácia (C).
- Limites: por segundo (tokens e requisições), definidos por organização no console; 429 ao exceder. **Nenhuma cota diária ou mensal publicada** e nenhum plano com nome e preço (C). O ADENDO-A cita 100 mil tokens por segundo e 80 requisições por segundo; a página atual não traz números (N). Fontes de terceiros citam 250 mil tokens por segundo e 1200 por minuto (baixa confiança, não aceitas).
- Teto local: 144 consultas por dia por padrão (`src/agent/budget.ts:18`); configurável de 1 a 1000 (`config.ts:97`); com o piloto automático, o máximo entre o configurado e `ceil(1440 / intervalo)` (`budget.ts:15`, `wire.ts:221-223`). No perfil arrojado o ritmo é `min(intervalo, 2)` (`wire.ts:310`), logo a capacidade fica em 720 e a consulta 721 é recusada (`budget.ts:101`). Um ciclo de 1 minuto precisaria de 1440. **É configuração local, não contrato.** O ritmo é espalhado pelo horário UTC (`budget.ts:102-107`).
- Custo: 13,8 mil a 15,6 mil tokens por consulta nos orçamentos; uma consulta real registrada teve 7239 de entrada e 560 de saída. A 1440 consultas por dia: entre cerca de US$ 0,44 e US$ 0,94 por dia só de entrada (P).

## 5. Solana, execução

| Item | Valor | Estado |
| --- | --- | --- |
| Taxa base | 5000 lamports por assinatura (50% queimados, 50% ao validador) | C (`solana.com/docs/core/fees`) |
| Taxa de prioridade | `ceil(preço_CU em micro-lamports x limite_CU / 1.000.000)` lamports, 100% ao validador; 200 mil CU por instrução por padrão, 1,4 milhão por transação | C |
| Jito | gorjeta mínima 1000 lamports por bundle, até 5 transações, atômico, 1 req/s por IP por região no envio padrão, `getTipAccounts` com 8 contas, endpoint `tip_floor` | C (`docs.jito.wtf/lowlatencytxnsend`) |
| OKX DEX swap | `slippagePercent` obrigatório (em Solana, menor que 100); `priceImpactProtectionPercent` padrão 90 (100 desliga; se o impacto não for calculável, vem `null` e a proteção é pulada); `forJitoBundle`, `directRoute`, `tips` em SOL; `feePercent` de parceiro até 10% em Solana | C |
| Tempo de slot | 300 ms no repositório (`LIVE-QUALIFICATION.md:285`), 400 ms no ADENDO-E; nenhuma fonte primária lida traz o número | N, medir no RPC usado |
| Alpenglow | imprensa de 14 a 16 de outubro de 2026 fala em ativação em 21 de outubro (finalidade alvo de cerca de 150 ms contra cerca de 12,8 s). Fonte secundária, não confirmada em documentação primária | N; acompanhar, muda o risco de execução armada |
| Aluguel de conta de token | cerca de 0,00204 SOL (165 bytes), valor usual | N, chamar `getMinimumBalanceForRentExemption` |

Custo medido por operação: taxa de rede de 97.859 lamports num recibo (cerca de US$ 0,0103 a US$ 105,48 por SOL) contra US$ 0,0005144 da cotação, cerca de 20 vezes; mediana de 85.427 lamports em 21 ordens (C no cálculo, P na base). Decompor em taxa base, prioridade e assinaturas extras está pendente. No capital de US$ 121 a rede é desprezível (cerca de 0,017% da ida e volta); o aluguel de uma conta nova (cerca de 0,18%) e, sobretudo, o atrito percentual decidem.

## 6. Matriz de fontes de dados para "todos os criptoativos"

| Fonte | Cobertura | Frescor | Limite | Custo | Termos | Papel sugerido |
| --- | --- | --- | --- | --- | --- | --- |
| WebSocket público da bolsa OKX | 1965 instrumentos (só bolsa) | push de 100 ms (tickers) | 3/s conexão, 480/h inscrição | grátis | API pública documentada; 9.4 limita extração automatizada "razoável para uso pessoal" | universo da bolsa, regime, fluxo; **não** é o universo Solana |
| REST snapshot de tickers da bolsa | idem, por tipo | cerca de 2 s | por IP (N) | grátis | idem | redundância e filtro |
| OnchainOS REST (Free) | on-chain multi-rede (amostra de popularidade, 100 por lista) | cache de 15 s a 30 min no repo | 100 mil/mês cada, RPS N | grátis | API oficial | **decisão e execução**, enriquecimento de poucos candidatos |
| OnchainOS WebSocket | N (não publicado) | N | 3/s, 480/h | US$ 99 por mês ou mais | API oficial | **bloqueado (cobrança)** |
| Estado de pools por RPC WS | só pools assinados | slot a slot (latência N) | depende do provedor | grátis no plano Free; US$ 49 a US$ 499 em planos | RPC é infraestrutura | conjunto negociado (dezenas a centenas de pools) |
| Jupiter | tokens Solana roteáveis | por consulta | 60/min no Free | grátis no Free | API oficial | cotação de execução, segunda opinião |
| DexScreener | pares multi-rede | por consulta | 60/min em perfis | grátis | N | descoberta (N) |
| PumpPortal | pump.fun | evento | grátis em novos e migrações | SOL por trades | com chave | descoberta de lançamentos |
| Raspagem do site OKX | N | N | sem limite documentado | grátis | **9.4 proíbe raspadores** | **não recomendado; bloqueado (termos)** |

## 7. Raspagem: matriz de decisão

| Opção | Custo | Risco de termos | Latência | Cobertura | Fragilidade | Observação |
| --- | --- | --- | --- | --- | --- | --- |
| Raspagem HTTP de endpoints internos do site | baixo | **alto** (9.4; Build 5.3 sobre acesso não autorizado e engenharia reversa) | possivelmente baixa, N | N | alta | repo já exclui endpoints internos; ninguém inspecionou a rede |
| Navegador sem tela (headless) | alto em CPU e memória | **alto**, mais anti-bot | alta por página | N | alta | não recomendado para ciclo de 1 min; contornar anti-bot é proibido |
| API oficial REST (Free) | grátis até a cota | baixo | cache | amostra | baixa | já em uso; cota projeta acima do teto |
| API oficial WebSocket | US$ 99 por mês ou mais | baixo | push | N | baixa | **bloqueado (cobrança)** |
| WebSocket público da bolsa | grátis | baixo (uso pessoal, volume razoável) | push de 100 ms | só bolsa | baixa | testado hoje |
| RPC próprio ou de provedor | grátis a US$ 999 por mês | baixo | slot | pools assinados | média (decodificação) | único que cobre Solana fora da bolsa |
| Terceiros licenciados | mensalidade | baixo (contrato) | N | N | baixa | **bloqueado (cobrança)**; não pesquisado preço |

Texto relevante, com a ressalva de leitura por resumo de modelo:

- OKX API Agreement (`web3.okx.com/help/okx-api-agreement`, atualizado em 2026-07-28), seção 9.4 "Automated Scraping and Circumvention": "You must not use automated scripts, bots, web scrapers, or any other automated means to extract Market Data". Resumo da página: uso limitado a trading pessoal não comercial; sem revenda, sem produto de dados concorrente, sem treinar modelos comerciais; vale para endpoints públicos sem autenticação; extração automatizada limitada ao razoável para uso pessoal; acesso de alto volume exige licença à parte; proibido contornar medidas técnicas. Seção 4.4: a OKX pode limitar, suspender, modificar ou encerrar o acesso a qualquer momento (seção 14). Seção 1.4 define "Authorized AI Agent" (LLM, sistema de trading algorítmico, script de automação), e 3.3 e 3.4 permitem configurar um agente autorizado e conectar um LLM próprio.
- Build API Terms (data de 18 de março de 2026): seção 4.10 "Use of AI Agents"; sem cláusula sobre scraping, crawling ou bots; 5.3 proíbe acesso não autorizado, interferência e engenharia reversa; 1.1 e 3.3 vedam redistribuição. A versão en-br tem o mesmo texto aparente (a alegação de escopo mais restrito foi refutada).
- A seção 4.10 existe também no Wallet Software User Agreement com outro tema ("Automated Pre-signed Transactions Risk"). Citar sempre documento, data e seção.
- Os termos de uso integrais não foram lidos como texto bruto. A "escala excessiva" da 9.4 não é definida numericamente.

Leitura: o uso do feed público documentado para decisão interna do dono é o caso mais próximo do permitido; raspar páginas do OKX Wallet ou da OnchainOS é o mais próximo do vedado. **Decisão de aceitar risco de termos: do dono.** Isto não é parecer jurídico.

## 8. Conflitos entre tópicos, resolvidos ou pendentes

| Conflito | Resolução |
| --- | --- |
| "Sem RPS publicado" (t02, t03, t08) contra "1 RPS no trial, 2 a 50 no Start-up" (t11, g1) | Ambos certos: Market não publica RPS; Trade publica. Persistem N: unidade (chave, IP, conta) e a faixa da conta do dono |
| 20 req por 2 s para tickers (t09, t10) contra "só em endpoint privado" (t11) | Pendente: reler a seção Market Data da v5. Nada de REST de tickers deve ser codado com esse número |
| 3 por segundo por API key (OnchainOS) contra 3 por segundo por IP (bolsa) | Provedores diferentes; ambos C |
| 144, 288, 720 ou 1440 consultas por dia | Todos são configuração local; sob o perfil arrojado, 720 |
| Consumo de Basic projetado: 109,5 mil (15/10) e cerca de 158 mil (17/10) | Snapshots lineares de dia parcial; não são medidas de mês; falta contador por rota |
| Premium a 1 minuto sem excedente (t02, resumo) contra 133 mil por mês | O cético corrigiu: passa do teto em cerca de 33 mil |
| Taxa de rede cotada contra recibo (20 vezes) | Pendente: decomposição |
| Slot de 300 ms contra 400 ms | Pendente: medir |
| Capital de US$ 100, 118, 121 ou 126 | Pendente: usar 118,17 a 118,80 (medido em 15/10) como base até conciliar |
| Tamanho do Brief: 2048 bytes por objeto (`src/intel/brief.ts:16`, sobrescrevível por `maxBytes`) contra cerca de 11 KB (ADENDO-E) | Provavelmente o prompt inteiro; o valor de 11 KB não aparece no código |
