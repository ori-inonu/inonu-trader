# Gráfico hero do Jev e indicadores tratados em Python

Estado: especificação aprovada para implementação em fases. Data: 2026-10-12. Esta pasta é a fonte única deste trabalho; `docs/sdd/carteira-evidencia/` é outro trabalho e não é tocado.

## 1. Pedido (resumo fiel)

1. O gráfico é pequeno. As decisões do Jev devem aparecer **no próprio gráfico** (onde comprar, onde vender), ampliadas, e não numa área curta separada.
2. Mais recursos no gráfico: Renko, outros tipos de gráfico, outros ativos, indicadores.
3. Otimizar o espaço dos outros componentes para ampliar o gráfico.
4. Consultar o que a OKX (Wallet, OnchainOS, API pública) permite coletar e tratar em Python (cálculo e análise de dados), para que o Jev receba **dados tratados e estruturados**, não uma enxurrada de dados em tempo real nem muito consumo de API.

## 2. Fronteiras que não mudam (valem para toda tarefa)

- **O Jev decide.** Nenhum código escolhe comprar ou vender. Marcadores de compra e venda no gráfico são **somente** leituras reais do Jev (`read.decision` com `status === "ok"`). Indicadores, níveis e o pacote Python **descrevem**; nunca carregam ação, voto ou sinal de compra e venda.
- **Consultivo.** A leitura do Jev é `advisory: true` e `execution: "never"`. A UI nunca chama um marcador de "ordem", "trade" ou "execução". O texto fixo é "decisão consultiva do Jev, nada foi enviado".
- **Desconhecido nunca vira número.** Dado ausente, velho ou não calculável é `null` com motivo, nunca zero nem valor plausível. Nada de marcador inventado: sem decisão real, sem marcador (fixtures só em testes e capturas rotuladas).
- **Tipografia e estilo da mesa:** sem ponto mediano, travessão ou meia-risca em texto renderizado (varredura `web/src/lib/typography-scan.test.ts`); sem elemento piscando ou pulsando; texto da UI em português **sem acentos**, como o resto da mesa ("Grafico", "Indisponivel").
- **Bun primeiro** no TypeScript (`bun test`, `bun run`). Python só onde o pedido o exige (camada de análise), apenas biblioteca padrão, sem instalar pacotes.
- Sem segredo em lugar nenhum: a camada Python usa só a API pública da OKX sem chave. Nada aqui assina, envia ordem ou move fundos.

## 3. Estado real encontrado (antes desta entrega)

- `web/src/app/page.tsx` renderiza `MesaView` (`web/src/components/Desk/MesaView.tsx`): grade fixa sem rolagem, asas laterais inclinadas em 3D (`rotateY(9deg)`), centro com `JevStage` (1,4 fr, rosca animada) acima de `PriceChart` + `LiquiditySurface` (1 fr), doca inferior de 150 a 196 px. O gráfico ocupa cerca de 440 por 230 px em 1600 por 900.
- `PriceChart` desenha só velas de tempo (canvas, `web/src/lib/desk/ui/draw-candles.ts`), com volume e VWAP, 6 intervalos (1m a 1D), até 300 velas carregadas de `GET /api/v5/market/candles` mais o canal `candle{bar}`.
- Os ativos vêm de `DESK_DEFAULT_WATCHLIST` (BTC, ETH, SOL, OKB, MON, todos `-USDT`); o foco aceita qualquer `instId` e o controlador já trata `-SWAP`.
- O Jev lê a fita (`src/jev-read/*`): 1 leitura por instrumento em rodízio (`scripts/jev-read.ts`, padrão 15 s entre leituras), estado `TapeState` com velas de 1 minuto, livro, fluxo e funding, e pergunta de escolha única (`decide.ts`). O quadro (`GET /jev-read`) traz `reads[instId]` e `recent` (até 40, máximo 60), cada leitura com `atMs`, `state.mid` e `decision`.
- O diário atual (`data/jev-read/reads.jsonl`) tem 128 leituras e **nenhuma decisão do modelo** (produtor em modo `--observe`). Portanto não existem marcadores reais ainda; eles aparecem quando o produtor rodar com `--jev` (consulta paga ao modelo, decisão do usuário).
- Credenciais da API autenticada do OnchainOS (`OK-ACCESS-KEY` e outras): **ausentes** no ambiente. A camada TypeScript `src/onchainos/*` já tem os clientes (assinatura, limite, parsers), desligados sem credencial.

## 4. O que dá para coletar (verificado em 2026-10-12, sem chave)

| Fonte (OKX API pública v5) | Para quê | Granularidade e limite |
| --- | --- | --- |
| `market/candles`, `market/history-candles` | velas 5m, 15m, 1H, 4H para tendência, momento, volatilidade, estrutura | 300 por chamada, 40 req por 2 s |
| `market/tickers?instType=SPOT` (uma chamada, todos os pares) | spread, variação 24h, escolha de ativos por volume | 1 chamada para todos |
| `public/funding-rate`, `public/funding-rate-history` | funding atual e distribuição (z-score, percentil) | liquidação de 8 h, 100 por chamada |
| `public/open-interest` | interesse em aberto do perpétuo | 20 req por 2 s |
| `rubik/stat/contracts/open-interest-volume` | série de interesse em aberto e volume (USD), 5m | **5 req por 2 s**, por moeda |
| `rubik/stat/contracts/long-short-account-ratio` | razão contas compradas por vendidas, 5m | 5 req por 2 s |
| `rubik/stat/taker-volume` (`[ts, sellVol, buyVol]`) | participação do agressor comprador | 5 req por 2 s |
| `rubik/stat/trading-data/support-coin` | quais moedas têm dados de derivativos e spot | cache de 24 h |

O que **exige credencial** e fica fora desta entrega (seção 9): OnchainOS sinais (carteiras inteligentes, baleias), preço e holders do token, top traders, clusters, sentimento social, e o portfólio da OKX Wallet. A camada Python deixa uma seção `onchain` explícita como `unavailable: no_credentials`.

## 5. Requisitos observáveis

### Gráfico e mesa (G)

- **G1** O gráfico é o elemento dominante da mesa: em 1600 por 900 a área de plotagem do preço tem pelo menos 900 px de largura e 420 px de altura (hoje cerca de 440 por 180), e em 1280 por 720 pelo menos 680 por 320.
- **G2** O `JevStage` vira uma faixa compacta (no máximo 96 px de altura) acima do gráfico: par, preço, variação, decisão (COMPRAR, VENDER, MANTER) com peso, três barras de pesos, idade da leitura, modelo e latência. Os estados vazios existentes continuam ditos em palavras.
- **G3** Tipos de gráfico: velas, Heikin Ashi, barras OHLC, linha, área e **Renko** (tijolo por ATR(14) ou por percentual, arredondado a passo "bonito", seletor de tamanho). A escolha persiste (localStorage, chave `jev.chart.prefs.v1`, lida só depois da montagem para não quebrar a hidratação).
- **G4** Indicadores sobrepostos: EMA 9, 21, 50 e 200; Bandas de Bollinger (20, 2); VWAP (já existe); Supertrend (10, 3). Subpainéis: Volume (já existe), RSI(14), MACD(12, 26, 9). Cada indicador liga e desliga, e a legenda mostra o valor sob o cursor ou o último.
- **G5** Decisões do Jev no gráfico: cada leitura com decisão real do instrumento em foco vira um marcador ancorado no tempo da leitura e no preço `state.mid` (triângulo para cima em compra, para baixo em venda, losango pequeno em manter), com a decisão mais recente destacada por uma etiqueta ("COMPRAR 63%"). Passar o cursor ou focar abre um cartão: horário, ação, pesos, modelo, latência, preço na decisão e resultado (G6). No Renko o marcador ancora no tijolo vigente no instante da leitura.
- **G6** Resultado de cada decisão de compra ou venda, medido e rotulado como bruto: `side * (P(T+H) / P(T) - 1) * 10000` em bps, com `side = +1` compra e `-1` venda, `H` o horizonte da leitura (`state.horizonMinutes`, 5), `P(T)` o `state.mid` da leitura e `P(T+H)` o fechamento da última vela **confirmada** que termina em ou antes de `T+H`. Só nas escalas 1m e 5m; nas demais, "resultado nao medido nesta escala". Antes de `T+H`, "em andamento". Manter nunca tem resultado. O cabeçalho do gráfico mostra o placar honesto: "Jev neste ativo: X de N decisoes no sentido certo apos 5 min (bruto, sem custos)", sem percentual quando N < 10.
- **G7** Faixa de decisões (linha do tempo) logo abaixo do preço, alinhada às velas, com um glifo por decisão, para ver o ritmo do Jev de relance.
- **G8** Ativos: seletor com busca, abas Spot e Perpétuos, lista por volume em 24 h (de `market/tickers`, uma chamada, atualizada a cada 5 minutos), com a marca "Jev le" nos instrumentos que têm leitura no quadro. Foco em instrumento sem leitura do Jev mostra o gráfico normalmente e diz "O Jev nao le este mercado" no lugar dos marcadores.
- **G9** Espaço: colunas laterais estreitas e densas (Ativos, Livro, Fita, Fluxo, Derivativos), superfície de liquidez movida para uma aba ou para um recolhível, doca inferior reduzida (cabeçalho de 28 px por módulo, no máximo 120 px). A inclinação 3D das asas, se mantida, fica em no máximo 4 graus.
- **G10** Responsivo: as abas do celular (Jev, Grafico, Livro, Fluxo, Fontes) continuam; em 390 por 844 o gráfico ocupa a largura toda sem rolagem horizontal. Teclado: setas movem o cursor; `Escape` fecha cartões e menus.
- **G11** Sem regressão: testes existentes passam ou são atualizados com justificativa; `typecheck` e `build` verdes; console do navegador sem erro.

### Pacote Python e Jev (P)

- **P1** Uma camada Python (`python/jev_analytics`, biblioteca padrão) coleta da API pública, trata e escreve um pacote versionado por instrumento em `data/jev-analytics/latest.json` (gravação atômica), com seções independentes (`ok` ou indisponível com motivo) e proveniência (`generatedAtMs`, idade das fontes).
- **P2** Consumo de API sob controle e **medido**: cache com TTL por fonte (seção 7.3), um único `tickers` para todos os pares, o BTC de referência compartilhado, limitador de taxa conforme a seção 4 e contador de chamadas por endpoint publicado no próprio pacote (`budget`).
- **P3** Indicadores matematicamente corretos: os mesmos números de uma biblioteca independente (TA-Lib) nos vetores de referência, tolerância `|a-b| <= 1e-9 * max(1, |b|)` (seção 6). Exceção documentada: o MACD de TA-Lib semeia a EMA12 no início da EMA26, o repositório semeia cada EMA no próprio início (convenção do TradingView); os dois concordam só depois do transitório, e o RSI de Wilder foi conferido também contra o exemplo publicado.
- **P4** O pacote não contém ação, voto nem sinal. Um teste de varredura recusa chaves `buy`, `sell`, `hold`, `action`, `signal`, `recommend`.
- **P5** O produtor do Jev (`src/jev-read`) lê o pacote como entrada **opcional**: pacote ausente, inválido, de versão desconhecida ou com mais de 120 s vira `analysis` ausente no estado (o Jev continua a decidir como hoje). Quando presente, vai para o estado do Jev (sem `levels`) e para a visão pública.
- **P6** A UI mostra o que o Jev recebeu: painel "Indicadores do Jev" (regime, força da tendência, momento, volatilidade, estrutura, derivativos, relação com o BTC, relação movimento por custo) a partir de `read.state.analysis`, e desenha os níveis (suportes e resistências) no gráfico como zonas rotuladas "nivel calculado", não como decisão.
- **P7** A pergunta do Jev descreve cada campo do `analysis`, diz que ele pode faltar e que continua sem ser um voto. Autoria do texto: lead, não delegada.
- **P8** Ganho **medido, não alegado**: relatório de chamadas por minuto da camada Python e de `inputTokens` antes e depois (quando houver leituras reais do modelo). Sem número medido, a documentação diz "nao medido".

## 6. Formulas de referencia (exatas; a implementacao Python e a TypeScript concordam com TA-Lib)

Séries mais antigas primeiro. `null` onde a janela não está completa.

- `sma(x, n)`: média simples dos últimos n; primeiro valor no índice n-1.
- `ema(x, n)`: `a = 2/(n+1)`; semente = SMA dos primeiros n no índice n-1; depois `e[i] = a*x[i] + (1-a)*e[i-1]`.
- `rsi(x, n=14)` (Wilder): variações `d[i] = x[i]-x[i-1]`; primeira média de ganho e de perda = média simples das n primeiras variações (no índice n); depois `m = (m_ant*(n-1) + atual)/n`; `RSI = 100 - 100/(1+G/P)`; perda 0 e ganho > 0 dá 100; ambos 0 dá 50. Primeiro valor no índice n.
- `macd(x, 12, 26, 9)`: `macd = ema12 - ema26` (do índice 25); `signal = ema(macd, 9)` com semente SMA dos 9 primeiros macd (do índice 33); `hist = macd - signal`.
- `atr(h, l, c, n=14)` (Wilder, como TA-Lib): `TR[i] = max(h-l, |h-c_ant|, |l-c_ant|)` para i >= 1; primeira ATR no índice n = média de TR[1..n]; depois `(ant*(n-1) + TR)/n`.
- `bollinger(x, 20, 2)`: meio = SMA; desvio **populacional** (divisor n); `%B = (x-inf)/(sup-inf)`; `largura = (sup-inf)/meio`.
- `adx(h, l, c, 14)` (Wilder, semente como TA-Lib): `+DM`, `-DM` e `TR` de i = 1; as somas suavizadas começam como a soma dos n-1 primeiros valores (índices 1 a n-1) e o primeiro passo `s = s - s/n + atual` já consome o índice n (o livro de Wilder semeia com a soma de n valores; a diferença só existe no transitório); `+DI = 100*sDM+/sTR`; `DX = 100*|+DI - -DI|/(+DI + -DI)`; primeira ADX no índice 2n-1 = média dos n primeiros DX, depois `(ant*(n-1) + DX)/n`. Só existe em Python.
- `supertrend(h, l, c, 10, 3)`: `ATR` de Wilder acima; `hl2 = (h+l)/2`; bandas básicas `hl2 +- 3*ATR`; banda final superior só desce (ou recomeça se o fechamento anterior passou dela), banda final inferior só sobe (ou recomeça se o fechamento anterior caiu abaixo dela); direção +1 (alta, linha = banda inferior) começa em +1 e muda para -1 quando o fechamento fica abaixo da banda inferior final, e volta a +1 quando fica acima da superior final.
- `heikinAshi`: `C = (o+h+l+c)/4`; `O[0] = (o0+c0)/2`, `O[i] = (O[i-1]+C[i-1])/2`; `H = max(h, O, C)`; `L = min(l, O, C)`.
- `renko(closes, B)`: âncora `ref = floor(c0/B)*B`. Sem tijolo: sobe se `c >= ref+B` (tijolo `[ref, ref+B]`), desce se `c <= ref-B`. Após tijolo de alta de abertura `o` e fechamento `q = o+B`: novo de alta se `c >= q+B`; reversão para baixa se `c <= o-B` (tijolo `[o, o-B]`); simetricamente após baixa. Uma vela pode gerar vários tijolos; cada tijolo leva o `tsMs` da vela que o completou. Tamanho: `B = passoBonito(ATR14 da ultima vela confirmada)` ou `passoBonito(pct * ultimo fechamento confirmado)`; `passoBonito` arredonda ao valor mais próximo, em escala logarítmica, de `{1, 2, 2.5, 5} * 10^k`, para que o histórico não se redesenhe a cada tique.
- Estruturas só em Python: pivôs (máxima estritamente acima das 3 velas da esquerda e pelo menos igual às 3 da direita; mínima simétrica; um topo plano gera um único pivô, o da primeira vela), agrupados com tolerância `0,5*ATR14` (nível = média do grupo, `touches` = número de pivôs), `corr` e `beta` de Pearson sobre retornos logarítmicos alinhados, `zscore` com desvio amostral, `rank` percentual `#(x <= atual)/N`, eficiência de Kaufman `|c[-1]-c[-1-n]| / soma(|dc|)`.

Os vetores de referência vivem em `python/tests/vectors/` e `web/src/lib/desk/chart/vectors/chart-vectors.v1.json`, gerados pela implementação Python e **conferidos contra TA-Lib** fora do repositório (relatório em `docs/sdd/grafico-jev/evidencia-vetores.md`). A implementação TypeScript é aceita só quando reproduz o arquivo com `|a-b| <= abs + rel*|b|` usando `tolerance.abs` e `tolerance.rel` do próprio arquivo (1e-9 cada), e `null` onde o arquivo tem `null`.

## 7. Projeto

### 7.1 Web (`web/src`)

- `lib/desk/chart/`: `types.ts`, `indicators.ts`, `transforms.ts` (Heikin Ashi, Renko), `decisions.ts` (marcadores e placar), `prefs.ts`, `vectors/`.
- `lib/desk/ui/draw-chart.ts`: desenhista genérico sobre o atual `draw-candles.ts` (geometria, eixos, cursor, escala de tempo compartilhada); `draw-candles.ts` continua exportando o que os testes atuais usam, ou os testes são migrados com justificativa.
- `components/Desk/panels/PriceChart.tsx` (barra de ferramentas: ativo, intervalo, tipo, indicadores, Renko), `AssetPicker.tsx`, `DecisionCard.tsx`, `JevStage.tsx` compacto, `JevIndicators.tsx` (painel P6).
- `MesaView.tsx` e seu CSS: nova grade (seção 5, G1, G9).

### 7.2 Pacote Python (`python/jev_analytics`)

`indicators.py`, `transforms.py`, `structure.py`, `stats.py`, `features.py` (função pura que recebe séries e devolve o bloco de recursos), `okx_public.py` (cliente sem chave: `get_json` injetado, limitador por rota, contador), `cache.py`, `pack.py` (montagem, validação, escrita atômica), `__main__.py` (`once`, `loop`, `selftest`). Testes com `python -m unittest` (biblioteca padrão).

Esquema `data/jev-analytics/latest.json` (`schemaVersion: 1`, `kind: "jev-analytics"`):

```text
{ schemaVersion, kind, engine: {name, version}, generatedAtMs, source: "okx-public-v5",
  budget: { windowSec, calls, byEndpoint: {path: n} },
  instruments: { "<instId>": { instId, asOfMs, completeness, features, unavailable: {secao: motivo} } } }

features = {
  trend:       { regime: "up"|"down"|"range", adx15m, efficiency15m, emaStack15m, emaStack1h, emaStack4h, extensionAtr15m } | null,
  momentum:    { rsi5m, rsi15m, rsi1h, macdHistAtr15m } | null,
  volatility:  { atrBps15m, atrBps1h, volRank24h, bbWidthRank15m, bbPercentB15m, expectedAbsMove5mBps } | null,
  structure:   { donchianPos1h, supportBps|null, supportTouches|null, resistanceBps|null, resistanceTouches|null,
                 renkoRun15m, levels: [{px, kind: "support"|"resistance", touches, tf: "15m"|"1h"}] } | null,
  derivatives: { fundingZ|null, fundingPctile|null, oiChange1hPct|null,
                 oiPriceRegime: "long_buildup"|"short_buildup"|"short_covering"|"long_unwind"|"mixed"|null,
                 longShortRatio|null, longShortZ|null, takerBuyShare1h|null } | null,
  crossAsset:  { corrBtc48h, betaBtc48h, relStrengthVsBtc24hBps } | null,
  cost:        { assumedRoundTripFeeBps: 20, spreadBps, moveToCost } | null,
  onchain:     null   // sempre null nesta versao; motivo "no_credentials" em unavailable
}
```

`completeness` = campos esperados calculados dividido pelos esperados (32 campos: trend 7, momentum 4, volatility 6, structure 2 sem suporte e resistência, derivatives 7, crossAsset 3 e cost 3; o BTC não tem crossAsset). Todos os recursos de velas usam **somente velas fechadas**; valores relativos ao preço usam o `last` do ticker. A resposta real de `support-coin` traz `data` como um objeto (a documentação espelhada mostra uma lista com esse objeto): o cliente aceita as duas formas.

Definições: `emaStack` = +1 se `close > EMA20 > EMA50`, -1 se `close < EMA20 < EMA50`, senão 0 (descritivo, não é voto). `regime`: `adx15m >= 25` e `+DI > -DI` é `up`, `adx15m >= 25` e `-DI > +DI` é `down`, senão `range`. `volRank24h`: rank percentual do desvio das últimas 12 velas de 5m entre todas as janelas de 12 das últimas 288. `bbWidthRank15m`: rank da largura de Bollinger atual entre as últimas 100. `expectedAbsMove5mBps = desvio amostral dos 48 últimos retornos log de 5m * 10000 * sqrt(2/pi)`. `moveToCost = expectedAbsMove5mBps / (assumedRoundTripFeeBps + spreadBps)`. `oiPriceRegime` usa a variação em 1 h do interesse em aberto e do preço com zona morta de 10 bps (OI) e 5 bps (preço). `fundingZ` com pelo menos 20 liquidações. `corrBtc48h` e `betaBtc48h` sobre 48 retornos de 1H (ausente para o BTC). `takerBuyShare1h = soma(buyVol) / soma(buyVol + sellVol)` das últimas 12 amostras de 5m.

### 7.3 Orçamento de API (TTL do cache)

| Fonte | TTL | Observação |
| --- | --- | --- |
| tickers spot (1 chamada) | 30 s | todos os pares |
| candles 5m (300) | 60 s | por instrumento |
| candles 15m (300) | 120 s | por instrumento |
| candles 1H (200) | 300 s | inclui o BTC, uma vez |
| candles 4H (120) | 900 s | por instrumento |
| funding atual | 60 s | só com perpétuo |
| funding histórico (100) | 3600 s | só com perpétuo |
| rubik OI, razão longo/curto, taker (5m) | 300 s | 1 req a cada 500 ms no mínimo; só moedas de `support-coin` |
| `support-coin` | 86400 s | decide disponibilidade |

Falha de uma fonte usa o cache antigo até 2 vezes o TTL e depois marca a seção indisponível (motivo `stale` ou `fetch_failed`), sem repetição agressiva (recuo exponencial por rota).

### 7.4 Integração TypeScript

`src/jev-read/analytics.ts` lê e valida o pacote (lista de permissão estrita, números finitos, enumerações fechadas, versão 1, no máximo 120 s), `TapeInput.analysis` opcional, `TapeState.analysis` presente **somente** quando válido (a chave não existe caso contrário, para não quebrar os testes atuais), `compactTapeState` retira `analysis.levels`, `public-view.ts` e `web/src/lib/jev-read.ts` projetam o mesmo contrato.

## 8. Entregas e estado

| Fase | Entrega | Responsável | Estado |
| --- | --- | --- | --- |
| F0 | Esta especificação | lead | feito |
| F1 | Layout hero, faixa do Jev, seletor de ativos, marcadores e placar (G1, G2, G5 a G10) com velas, linha, área, barras | sidekick | feito (evidência em `evidence/`) |
| F2 | Indicadores e Renko em TypeScript contra os vetores; sobreposições e subpainéis (G3, G4) | sidekick, vetores do lead | feito, 43 de 43 casos dos vetores reproduzidos |
| F3 | Python: indicadores, transformações, vetores e conferência contra TA-Lib (P3) | lead | feito ([evidencia-vetores.md](evidencia-vetores.md)) |
| F4 | Python: coletor, cache, pacote, testes (P1, P2, P4) | lead | feito, 116 testes; execução real conferida |
| F5 | Integração TypeScript, painel e níveis (P5, P6), texto da pergunta do Jev (P7) | sidekick; texto do lead | feito |
| F6 | Verificação final, medição de chamadas (P8), relatório | sidekick executa; lead confere | feito; tokens do Jev: **não medido** (não há leitura real do modelo no diário) |

## 9. Decisões e dependências do usuário

- **D1 Credenciais do OnchainOS** (`OKX_API_KEY`, `OKX_API_SECRET`, `OKX_API_PASSPHRASE`): sem elas a seção `onchain` fica indisponível. Com elas, uma fase posterior liga sinais de carteiras inteligentes, holders e sentimento por token (exige mapa `instId` para cadeia e contrato).
- **D2 Produtor do Jev em modo real** (`bun run jev-read --jev`, consulta paga ao modelo): é o que faz os marcadores aparecerem. Esta entrega não liga o modelo por conta própria.
- **D3 Ativos que o Jev lê**: o padrão continua 5 pares (`--insts`, máximo 12); cada par a mais aumenta o custo de consultas. O seletor mostra todos os pares, mas só marca decisões dos que o Jev lê.

## 10. Resultados verificados (2026-10-12)

| Item | Resultado |
| --- | --- |
| Testes do web | 1470 passam, 0 falham (84 arquivos); `typecheck:all` limpo |
| Testes do produtor do Jev (`src/jev-read`) | 222 passam, 0 falham |
| Suíte raiz completa | 3018 passam, 2 pulados (já eram pulados), 0 falham |
| Testes Python | 116 passam; conferência contra TA-Lib em [evidencia-vetores.md](evidencia-vetores.md) |
| Vetores TypeScript | 43 de 43 casos reproduzidos |
| Área do gráfico (G1) | 1600 por 900: 1028 por 502; 1280 por 720: 815 por 322; 390 por 844: 366 por 570 |
| Build de produção | em cópia isolada (a pasta `web/.next` serve a porta 3001 e não foi tocada): `next build --webpack` ok, 3 rotas; o Turbopack recusa o junction de `node_modules` da cópia, o que não é falha do código |
| Consumo de API do Python (P8) | `python/tools/measure_budget.py`, 10 min, 5 instrumentos, API real: primeiro ciclo 47 requisições em cerca de 19 s, depois 12,8 por minuto, no máximo 4 requisições rubik em 2 s (limite documentado 5) |
| Efeito nos tokens do Jev (P8) | **não medido**: o diário tem leituras só do modo `--observe` |
| E2E real do pacote | `analytics:once` com a API real, produtor privado em `--observe` serviu `state.analysis` com seções reais; com `--no-analytics` a chave não existe; com pacote de 10 min o Jev lê sem `analysis` |

Limites declarados: os marcadores só aparecem com decisões reais do modelo (`--jev`, consulta paga, não ligado por esta entrega); as capturas com marcadores usam dados **sintéticos rotulados**; a seção on-chain do pacote é sempre nula até haver credenciais do OnchainOS (D1); os produtores `jev-read` que já estavam rodando usam o código antigo e só passam a ler o pacote depois de reiniciados.
