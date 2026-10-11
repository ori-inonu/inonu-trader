# Camada de dados do OKX Onchain OS: clientes somente leitura e gravador de captura

Data: 2026-10-11. Estado: especificação dos módulos `src/onchainos/*.ts`, da CLI `scripts/onchainos-capture.ts` e dos testes `src/onchainos/*.test.ts` e `scripts/onchainos-capture.test.ts`. Base: [R1](research/R1-onchain-os-capacidades.md) (tabela de capacidades e mapa de unidades), [R6](research/R6-onchain-os-inventario.md) e o catálogo [R6-onchain-os-catalogo.json](research/R6-onchain-os-catalogo.json), [JEV-DECISAO-ONCHAIN-OS.md](JEV-DECISAO-ONCHAIN-OS.md) e [JEV-LABORATORIO-DE-DECISAO.md](JEV-LABORATORIO-DE-DECISAO.md) (formato de captura, seção 3.4). Este texto descreve engenharia de dados: não é recomendação de investimento, não promete retorno e não autoriza execução.

Os identificadores D1 a D27 deste documento são critérios de aceitação desta entrega. Não se confundem com as decisões D1 a D11 da arquitetura da central de operações.

## 0. Avisos que não mudam

1. **Somente leitura.** Nada aqui assina, monta dados de transação, envia ordem, aprova, deposita, saca ou move fundos. Nenhum endpoint de Trade, de execução, de pagamento ou de carteira é chamado. O custo por chamada (x402) nunca é pago: uma resposta HTTP 402 vira erro.
2. **Rede desligada por padrão.** Um cliente só envia se tiver credenciais válidas **e** `allowNetwork: true`. Nenhum arquivo da biblioteca lê `process.env`, usa o `fetch` global, abre WebSocket ou escreve em disco (a escrita fica só em `capture.ts`). A rede entra por uma função `fetch` injetada.
3. **Fixtures provam leitura, nunca lucro.** Os exemplos de resposta vêm de três origens rotuladas: `doc-example` (reconstruídos a partir das páginas oficiais), `live-keyless` (respostas reais da API pública da OKX Exchange, sem chave, em 2026-10-11) e `synthetic` (inventados para casos de borda). Nenhum deles descreve mercado nem prova vantagem.
4. **Desconhecido nunca vira zero.** Valor ausente, vazio, "--", "null", texto não numérico, `NaN` ou infinito vira `null`. Só o texto que realmente diz "0" vira 0.
5. **Texto livre de terceiros não entra no resultado.** Nomes, símbolos devolvidos, descrições, URLs, logotipos, apelidos e perfis são descartados pelos parsers. O resultado carrega números, enumerações fechadas, booleanos e identificadores validados por padrão estrito. É a defesa contra injeção de comando por metadados de token (R1, seção f).
6. **Nada aqui prova lucro e nada aqui concede permissão.** Taxa anunciada de rendimento não é retorno líquido. Fluxo de carteiras observado não é vantagem. A decisão do Jev continua limitada a escolher entre candidatos elegíveis ou `hold`, e nenhuma destas chamadas entra no laço de 300 ms da Kuru.
7. As quatro alegações do demo (o Jev decide comprar ou vender a partir do feed, trades reais de carteira real, uma ordem por bloco de 300 ms na Kuru, o painel ao vivo) não são tocadas. Esta camada não altera cadência, modelo, carteira nem painel.

## 1. O que é e o que não é

**É:** a camada de leitura que faltava para o Jev decidir sobre o ecossistema Onchain OS. Cobre as famílias de maior valor para decisão (preço, índice, candles e trades; token, holders, liquidez e clusters; sinais e leaderboard; sentimento social; gás do Gateway; rendimento DeFi) mais um cliente sem chave da API pública da OKX Exchange v5 (instrumentos, funding, mark, ticker, candles, livro, interesse em aberto). Acrescenta um gravador que escreve o que foi lido no formato de captura do Laboratório de Decisão do Jev, para que o laboratório reproduza dados reais.

**Não é (não objetivos):**

- Não executa, não assina, não gera calldata, não prepara ordem, não aprova, não faz ponte, não deposita e não usa Agentic Wallet, MCP, CLI da OKX, skills nem pagamentos x402.
- Não implementa endpoints de segurança cuja página REST não foi localizada (seção 8).
- Não grava, lê ou imprime chave, segredo, frase-senha ou assinatura. Credenciais só existem em memória dentro do cliente.
- Não usa WebSocket (exige plano pago; fora do escopo).
- Não decide nada: não há regra de compra ou venda, nem escolha de candidato. O Jev escolhe, a partir de números.
- Não estima custo líquido nem retorno líquido. Taxa anunciada é rotulada como anunciada.
- Não cobre o laço de 300 ms: o limite realista é de 1 chamada por segundo por padrão.

## 2. Critérios de aceitação

Cada critério é um comportamento observável. Os testes carregam o identificador no início do título (`D1:`, `D2:` ...). O teste `spec.test.ts` verifica que este documento define D1 a D27 e que cada um é exercitado.

| ID | Comportamento observável | Verificado em |
| --- | --- | --- |
| D1 | Assinatura K4: HMAC SHA256 em Base64 sobre `timestamp + MÉTODO + requestPath + corpo`; vetores de resposta conhecida calculados de forma independente (openssl e Python); GET inclui a query em `requestPath`; POST inclui o corpo cru; cabeçalhos `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`, `OK-ACCESS-PASSPHRASE` com timestamp ISO 8601 em milissegundos vindo do relógio injetado | `http.test.ts` |
| D2 | Offline por padrão: sem credenciais, ou sem `allowNetwork: true`, o cliente recusa com erro `offline` antes de qualquer envio e sem consumir cota nem limitador; credenciais malformadas são recusadas na construção; o `fetch` global nunca é usado | `http.test.ts` |
| D3 | Limitador de taxa token bucket com relógio e `sleep` injetados: 1 requisição por segundo por padrão, configurável, temporização exata, reposição limitada ao tamanho da rajada, chamadas concorrentes serializadas | `http.test.ts` |
| D4 | Retentativas limitadas com recuo exponencial só para HTTP 429 e 5xx; cada tentativa consome um token e reassina com timestamp novo; sem retentativa para 4xx, rede, tempo esgotado e código de envelope; HTTP 402 nunca vira pagamento | `http.test.ts` |
| D5 | Tempo limite por chamada com `AbortSignal`, inclusive quando o `fetch` injetado ignora o sinal | `http.test.ts` |
| D6 | Envelope `{code, msg, data}`: `"0"` é sucesso (o `0` numérico dos exemplos da documentação também); qualquer outro código vira erro tipado `api` sem credenciais; JSON inválido, tipos errados e corpo grande demais viram `schema` ou `too_large` | `http.test.ts` |
| D7 | Segredos nunca vazam: chave, segredo, frase-senha e assinaturas canário não aparecem em nenhuma mensagem de erro, JSON de erro, inspeção, evento de chamada, objeto cliente nem saída da CLI; a mensagem do provedor é higienizada e redigida | `errors.test.ts`, `http.test.ts`, `onchainos-capture.test.ts` |
| D8 | Contadores de cota por tier (chamadas lógicas e tentativas enviadas); o custo só é "conhecido" quando nenhuma tentativa foi feita em tier desconhecido | `http.test.ts` |
| D9 | Desconhecido nunca vira zero: vazio, ausente, "--", "null", texto, `NaN` e infinito viram `null` em todos os leitores; "0" continua 0; texto livre nunca é copiado para o resultado | `values.test.ts`, `capture-sources.test.ts`, `defi-read.test.ts`, `gateway.test.ts`, `market-price.test.ts`, `market-token.test.ts`, `public-okx.test.ts`, `signals.test.ts`, `social.test.ts` |
| D10 | Unidades rotuladas nos tipos: percentual como documentado (`holdPercent` em percentual), razões de sentimento em fração, taxa DeFi da busca em fração decimal, tempo em milissegundos; campo de unidade não declarada ou de escala ambígua tem tipo próprio; `toTokenAmount` e `minReceiveAmount` não aparecem em lugar nenhum | `values.test.ts`, `gateway.test.ts`, `market-price.test.ts`, `market-token.test.ts`, `spec.test.ts` |
| D11 | Preço em lote, índice atual e histórico, candles (histórico e recente) e trades: parsers estritos, linha malformada rejeitada com o índice da linha, flag `confirm`, teto de 299 velas e de 500 trades, identidade da resposta conferida com o pedido | `market-price.test.ts` |
| D12 | Token: busca, basic-info, price-info, advanced-info, holders, top-liquidity, hot-token, clusters (visão geral, lista, top holders, cadeias) e top-trader; percentuais como documentados; endereços de carteiras e texto livre descartados | `market-token.test.ts` |
| D13 | Sinais e leaderboard: corpo em array (REST) ou objeto (CLI) escolhido por opção explícita; `walletType` com o significado REST de cada endpoint, sem confundir com o da CLI | `signals.test.ts` |
| D14 | Social só com números: sentimento por símbolo e variantes por cadeia e contrato; nenhum texto livre alcança o resultado, nem com campos de texto hostis | `social.test.ts` |
| D15 | Gateway: preço de gás (nomes divergentes da documentação aceitos; EVM, Tron e Solana por forma) e lista de cadeias suportadas | `gateway.test.ts` |
| D16 | DeFi leitura: busca em páginas de 20, detalhe, séries de APY, TVL e profundidade; `rate` é fração decimal na busca; o resultado se chama taxa anunciada e nunca retorno líquido | `defi-read.test.ts` |
| D17 | Cliente público da OKX Exchange v5 sem chave: instrumentos (SWAP e SPOT), funding e histórico, mark, ticker, candles e histórico de candles, livro, interesse em aberto; parsers estritos de decimais; mesma regra de `fetch` injetado e de offline por padrão | `public-okx.test.ts` |
| D18 | A saída do cliente público alimenta o avaliador de derivativos: a entrada montada passa por `parseDerivativesInput`; taxas, margem de manutenção e acesso continuam desconhecidos e o avaliador devolve "indisponível" por causa deles | `public-okx.test.ts` |
| D19 | Paginação limitada: tetos de páginas e de linhas, parada em página vazia, cursor repetido ou sem progresso, indicação de truncamento | `paging.test.ts`, `defi-read.test.ts`, `market-price.test.ts`, `public-okx.test.ts` |
| D20 | O gravador escreve exatamente o formato de captura do laboratório (aceito por `parseCaptureText` e por `ReplaySource`): `t` é o recebimento local, vela só fechada (e fechada também pelo relógio local), sem duplicata, `t` não decrescente | `capture.test.ts`, `capture-sources.test.ts` |
| D21 | O gravador é limitado (épocas e duração), retomável, idempotente (a mesma época nunca é gravada duas vezes), com anexos atômicos e recuperação de cauda não confirmada; para com erro claro em registro malformado ou pasta inconsistente; nunca grava segredo | `capture.test.ts`, `capture-sources.test.ts` |
| D22 | CLI: `plan` sem rede e com custo de cota; `run` exige `--allow-network` e, na fonte `onchainos`, credenciais explícitas por flag; `--help`; JSON no stdout e resumo curto em português no stderr; saída 0 para relatório completo, 2 para uso incorreto, 3 para parada | `onchainos-capture.test.ts`, `capture-sources.test.ts` |
| D23 | Pureza estática: nenhum acesso a `process.env`, `fetch` global, WebSocket, relógio ou aleatoriedade do sistema, escrita em disco fora de `capture.ts`, assinatura de transação, `ethers` ou caminho de negociação, calldata ou pagamento | `isolation.test.ts` |
| D24 | Varredura de bytes: nenhum travessão, meia-risca, ponto mediano, sinal de menos tipográfico ou marcador no documento, nos módulos, na CLI, nos testes e nas saídas da CLI | `isolation.test.ts`, `onchainos-capture.test.ts` |
| D25 | O registro de endpoints (`endpoints.ts`), as tabelas deste documento e o catálogo R6 coincidem em caminho, método e tier; todo item do catálogo com cobertura aponta para arquivo existente | `spec.test.ts` |
| D26 | Toda fixture declara proveniência (`doc-example`, `live-keyless` ou `synthetic`), fonte e nota; nenhuma afirma lucro, retorno ou vantagem | `spec.test.ts` |
| D27 | Este documento define D1 a D27 e cada um é exercitado por um teste cujo título começa com o identificador | `spec.test.ts` |

## 3. Arquitetura e mapa de módulos

```text
fetch injetado -> http.ts (assinatura K4, limitador, retentativas, tempo limite, envelope, cotas)
                    |
   +----------------+----------------+-------------+------------+
   |                |                |             |            |
market-price.ts  market-token.ts  signals.ts    social.ts   gateway.ts   defi-read.ts
   |   parsers tipados (null para ausente, nunca zero; texto livre descartado)
   v
capture-sources.ts -> capture.ts -> capture.jsonl (formato do laboratorio) + ledger + manifesto
                         ^
public-okx.ts (Exchange v5 sem chave, mesmo transporte, sem assinatura) ---+
scripts/onchainos-capture.ts (plan, run, --help) usa capture.ts e as fontes
```

| Arquivo | Conteúdo |
| --- | --- |
| `src/onchainos/errors.ts` | `OnchainosError`, tipos de erro, redação e higienização |
| `src/onchainos/read.ts` | `Read<T>` (valor mais proveniência), `readGet`, `readPost`: localizam o endpoint no erro de um parser |
| `src/onchainos/values.ts` | rótulos de unidade, leitores estritos (decimal, contagem, tempo, percentual, enumeração, identidade) |
| `src/onchainos/paging.ts` | `collectPages`: paginação com tetos |
| `src/onchainos/http.ts` | assinatura, `TokenBucket`, `QuotaCounters`, transporte, `createOnchainosHttp` |
| `src/onchainos/endpoints.ts` | registro dos endpoints implementados (id do catálogo, método, caminho, tier, página) |
| `src/onchainos/market-price.ts` | preço em lote, índice, candles, trades |
| `src/onchainos/market-token.ts` | busca, metadados, métricas, holders, liquidez, hot, clusters, top-trader |
| `src/onchainos/signals.ts` | sinais e leaderboard |
| `src/onchainos/social.ts` | sentimento e variantes por cadeia e contrato |
| `src/onchainos/gateway.ts` | preço de gás e cadeias |
| `src/onchainos/defi-read.ts` | busca, detalhe e séries de produtos DeFi |
| `src/onchainos/public-okx.ts` | cliente da OKX Exchange v5 pública e ponte para o avaliador de derivativos |
| `src/onchainos/capture-types.ts` | tipos da captura (`CaptureSource`, `CaptureFs`, `CaptureError`) |
| `src/onchainos/capture-sources.ts` | conversão das leituras em registros de captura, por fonte |
| `src/onchainos/capture.ts` | gravador limitado, retomável e idempotente (único arquivo que escreve em disco) |
| `src/onchainos/fixtures.ts` | exemplos de resposta com proveniência |
| `src/onchainos/fakes.ts` | relógio, `fetch` e arquivo falsos usados só pelos testes |
| `scripts/onchainos-capture.ts` | CLI: `plan`, `run`, `--help` |

## 4. Transporte autenticado (`http.ts`)

### 4.1 Assinatura K4

Fonte: página `home/api-access-and-usage` (2026-10-11). Cabeçalhos exigidos: `OK-ACCESS-KEY`, `OK-ACCESS-TIMESTAMP`, `OK-ACCESS-PASSPHRASE`, `OK-ACCESS-SIGN`. A assinatura é `Base64(HMAC-SHA256(segredo, timestamp + MÉTODO + requestPath + corpo))`, com timestamp em UTC no formato ISO 8601 (`2020-12-08T09:08:57.715Z`) e tolerância de 30 s em relação ao servidor. Para GET o corpo é vazio. A prosa da página **não diz** se a query entra em `requestPath`; os exemplos em JavaScript e Postman a incluem (`'?' + querystring`, `getPathWithQuery()`), e é isso que este código faz: `requestPath` é exatamente a string enviada, com query. A página não traz vetor de teste; os vetores dos testes foram calculados de forma independente com openssl e Python e não são vetores documentados. Não se envia `OK-ACCESS-PROJECT` (ausente nos exemplos v6).

### 4.2 Offline por padrão (D2)

`createOnchainosHttp({ fetch, now, sleep, credentials?, allowNetwork? })`. Sem `credentials` válidas **ou** sem `allowNetwork: true`, toda chamada lança `OnchainosError` com `kind: "offline"` antes de tocar o limitador, os contadores ou o `fetch`. As credenciais são validadas na construção (texto ASCII imprimível, sem espaço, de 1 a 512 caracteres) e guardadas só em fechamentos, nunca em propriedades do objeto.

### 4.3 Limitador de taxa (D3)

Token bucket com relógio e `sleep` injetados. Padrão: 1 requisição por segundo, rajada de 1. Configurável por `requestsPerSecond` (de 0,1 a 10 no cliente autenticado; de 0,1 a 5 no público) e `burst` (de 1 a 10). Cada tentativa, inclusive retentativa, consome um token. As chamadas passam por uma fila: duas chamadas simultâneas nunca furam o limite.

### 4.4 Retentativas, tempo limite e envelope (D4 a D6)

- Retentativas só para HTTP 429 e HTTP 5xx, no máximo `maxRetries` (padrão 2, teto 5), com recuo `min(backoffMaxMs, backoffBaseMs * 2^n)` (padrão 1000 ms base e 8000 ms teto, sem aleatoriedade). Cada tentativa reassina com o timestamp novo. O cabeçalho `Retry-After` não é documentado pela OKX e não é usado.
- Nenhuma retentativa para outros 4xx (inclusive 402 "pagamento exigido"), erro de rede, tempo esgotado ou código de envelope diferente de sucesso.
- Tempo limite por chamada (`timeoutMs`, padrão 10 000, teto 60 000) com `AbortController`; se o `fetch` ignorar o sinal, uma corrida contra o prazo encerra a espera e a chamada falha com `timeout`.
- Resposta: texto de até `maxResponseChars` (padrão 2 000 000), JSON estrito, envelope `{code, msg, data}` com `data` obrigatório. Sucesso é `code` igual a `"0"`; os exemplos de índice, clusters e DeFi mostram `0` numérico, e o código aceita os dois. Os demais códigos viram `OnchainosError` com `kind: "api"`, `apiCode` e a mensagem do provedor higienizada.
- O corpo de uma resposta HTTP não 2xx é lido só para extrair `code`; nunca é copiado inteiro para o erro.

### 4.5 Erros e segredos (D7)

`OnchainosError` tem `kind` em `offline`, `invalid_request`, `timeout`, `network`, `http`, `rate_limited`, `api`, `schema`, `too_large`, além de `httpStatus`, `apiCode`, `endpoint` (somente o caminho, sem query), `attempts`, `rowIndex` e `providerMessage`. A mensagem é montada só com esses campos. A exceção original do `fetch` nunca é anexada como `cause`. `providerMessage` é texto não confiável de terceiros: no máximo 200 caracteres, sem caracteres de controle e com qualquer ocorrência de chave, segredo, frase-senha ou assinatura da chamada trocada por `[omitido]`. Existe um gancho opcional `onCall` com `{endpoint, tier, attempt, status, elapsedMs, outcome}` e nada mais; uma exceção dentro do gancho nunca interrompe a leitura.

## 5. Política de taxa e cota

**Planos (fonte: `market/market-api-fee`, 2026-10-11).** Free: US$ 0, 100 mil chamadas Basic e 100 mil Premium por mês, sem WebSocket. Starter US$ 99 (2 milhões Basic e 600 mil Premium), Growth US$ 199 (5 milhões e 2 milhões), Scale US$ 399 (20 milhões e 10 milhões), Pro US$ 599 (50 milhões e 20 milhões), Enterprise sob contrato. Excedente por chamada via x402: US$ 0,0001 (Basic) e US$ 0,0002 (Premium), em USDG ou USDT na X Layer. As cotas zeram no dia 1 de cada mês. Endpoints do tier Free não consomem cota. **Trade API Trial** (R1, página `trade/api-fee`): 60 dias, 1 RPS (até 5 após aprovação). O RPS dos endpoints REST de Market **não é documentado** (NAO CONFIRMADO).

**Política deste código.**

- Padrão de 1 requisição por segundo, configurável; é um piso conservador, não um limite medido.
- Cada **tentativa enviada** (inclusive retentativa e chamada que volta com erro) conta como uma chamada consumida do tier do endpoint. A OKX não documenta se chamadas com erro consomem cota; contar é a hipótese conservadora.
- `QuotaCounters.snapshot()` devolve, por tier (`free`, `basic`, `premium`, `unknown`, `public`), as chamadas lógicas e as tentativas enviadas, mais o total de retentativas. `costKnown` é falso se houve tentativa em tier `unknown`.
- Tiers por endpoint vêm da tabela de planos da página `market-api-fee`. Gateway, DeFi, Social e Security não estão nessa tabela: ficam em `unknown` e o custo delas é declarado desconhecido, nunca zero.
- O comando `plan` projeta chamadas e custo por tier antes de qualquer rede e compara com as franquias mensais gratuitas (100 mil Basic e 100 mil Premium).
- Pagamento por chamada (x402) **nunca** é feito. Uma resposta 402 é erro `http`, sem retentativa, com a nota de que nenhum pagamento é feito por esta biblioteca.
- API pública da Exchange (`www.okx.com`): limites documentados por 2 segundos (tabela da seção 9) são menores que o padrão de 1 requisição por segundo deste cliente; chamadas públicas contam no tier `public` e não consomem cota do Onchain OS.

## 6. Proveniência e a regra do desconhecido

Toda leitura devolve `{ value, meta }` com `meta`:

| Campo | Significado |
| --- | --- |
| `source` | `onchainos-rest-v6` ou `okx-public-v5` |
| `endpoint` | caminho, sem query |
| `tier` | `free`, `basic`, `premium`, `unknown` ou `public` |
| `httpStatus` | status da resposta que foi aceita |
| `attempts` | tentativas enviadas para esta leitura |
| `requestedAtMs` | relógio local antes do primeiro envio |
| `receivedAtMs` | relógio local depois de ler o corpo: o instante em que o dado se tornou conhecível (campo `t` da captura) |

Regras dos leitores (`values.ts`):

- Decimal: número JSON finito ou texto com gramática estrita (`-` opcional, sem `+`, sem espaço, sem zeros à esquerda, fração e expoente opcionais). Qualquer outra coisa é `null`. O expoente existe porque a própria documentação mostra `"1.61022025886108E8"`.
- Marcadores de ausência (`""`, `"--"`, `"null"`) são `null`.
- Contagem: inteiro seguro não negativo. Tempo: inteiro seguro em milissegundos entre 0 e o ano 2100; tempo de unidade não declarada só é aceito se parecer milissegundos (13 dígitos plausíveis), senão `null`.
- Razão: de 0 a 1 inclusive; fora disso `null`. Percentual aceita `%` final; percentual com sinal aceita `+` inicial (a documentação mostra `"+15.3"`).
- Enumeração fechada: valor fora do conjunto documentado é `null`, nunca "o mais próximo".
- Identidade (`chainIndex`, endereço de token): padrão estrito; endereço EVM em minúsculas; outro formato é `null`.
- Linha estruturalmente quebrada (não é objeto, número de colunas errado, identidade ou chave de ordenação ilegível) **rejeita a linha com o índice dela**; campo de medida ruim vira `null` e a linha permanece.
- Medida ausente em lote não vira linha de zeros: o identificador pedido simplesmente não aparece no resultado e é listado em `missing`.

## 7. Endpoints implementados

Colunas: `id` do catálogo R6; método e caminho; autenticação; tier (página de planos, ou `unknown` quando a página não o declara); parâmetros; unidades; o que é desconhecido. Todos os endpoints do Onchain OS usam K4. Páginas em `https://web3.okx.com/onchainos/dev-docs/` (a variante `.md` devolve o Markdown). As páginas foram lidas por uma ferramenta que resume o texto: reconferir números e unidades antes de usar.

### 7.1 Preço, índice, candles e trades (`market-price.ts`)

| id | método e caminho | tier | parâmetros | unidades | desconhecido |
| --- | --- | --- | --- | --- | --- |
| `market.price.supported-chains` | GET `/api/v6/dex/market/supported/chain` | free | `chainIndex` opcional | nenhuma numérica | 143 e 196 não aparecem no exemplo |
| `market.price.price` | POST `/api/v6/dex/market/price` | basic | corpo: lista de `{chainIndex, tokenContractAddress}`; teto do cliente 100 | `time` em ms (declarado); `price` sem moeda declarada | máximo por chamada; moeda do preço; RPS |
| `market.index.current-price` | POST `/api/v6/dex/index/current-price` | free | lista de `{chainIndex, tokenContractAddress}`; endereço vazio é o token nativo; máximo 100 (declarado) | `time` em ms; `price` sem moeda declarada | moeda; o exemplo tem JSON inválido e `code` numérico |
| `market.price.candles` | GET `/api/v6/dex/market/candles` | basic | `chainIndex`, `tokenContractAddress`, `bar` (padrão `1m`), `after`, `before`, `limit` (padrão 100, máximo 299) | `ts` em ms; `o h l c` sem moeda; `vol` em unidade base do token; `volUsd` em USD; `confirm` 0 ou 1 | ordem das linhas; moeda; o exemplo repete o mesmo `ts` |
| `market.price.historical-candles` | GET `/api/v6/dex/market/historical-candles` | premium | os mesmos | os mesmos | profundidade histórica; a página diz excluir velas abertas mas admite `confirm` 0 |
| `market.price.trades` | GET `/api/v6/dex/market/trades` | basic | `chainIndex`, `tokenContractAddress`, `after` (id), `limit` (padrão 100, máximo 500), `tagFilter` de 1 a 9 | `volume` em USD; `time` em ms; `price` e `amount` sem unidade declarada | formato e inclusividade de `after`; `walletAddressFilter` não implementado |
| `market.index.historical-price` | GET `/api/v6/dex/index/historical-price` | free | `chainIndex`, `tokenContractAddress` opcional, `limit` (padrão 50, máximo 200), `cursor`, `begin`, `end`, `period` (`1m`, `5m`, `30m`, `1h`, `1d`) | `time` em ms; `price` com 18 casas, moeda não declarada | o exemplo cita `/api/v5/wallet/token/historical-price`, divergente do caminho declarado |

Regras: `bar` fixo (`1s` a `1W`) tem duração conhecida; `1M` e `3M` não (`barMs` nulo). A identidade de cada linha da resposta (cadeia e endereço) precisa estar entre as pedidas, senão o resultado é rejeitado: o exemplo da página de preço mostra `chainIndex` 66 no pedido e 1 na resposta, e esse desencontro é recusado de propósito. Vela com `confirm` 0 está em formação.

### 7.2 Token (`market-token.ts`)

| id | método e caminho | tier | parâmetros | unidades | desconhecido |
| --- | --- | --- | --- | --- | --- |
| `market.token.search` | GET `/api/v6/dex/market/token/search` | basic | `chains` (lista), `search`, `cursor`, `limit` (máximo 100) | `holders` contagem; `liquidity`, `marketCap`, `price`, `change` sem unidade declarada | moeda; escala de `change` |
| `market.token.basic-info` | POST `/api/v6/dex/market/token/basic-info` | basic | lista de `{chainIndex, tokenContractAddress}`; teto do cliente 100 | `decimal` é a precisão do token | máximo por chamada; o exemplo traz `tokenContractAddress` fora da tabela |
| `market.token.price-info` | POST `/api/v6/dex/market/price-info` | premium | lista; máximo 100 (declarado) | `time` em ms; `priceChange*` em percentual por exemplo (`0.22`), escala não declarada; `txs*` contagem; `volume*`, `liquidity`, `marketCap`, `price` sem moeda declarada | moeda de todos os valores monetários |
| `market.token.advanced-info` | GET `/api/v6/dex/market/token/advanced-info` | premium | `chainIndex`, `tokenContractAddress` | `riskControlLevel` código 0 a 5 (0 é indefinido, não seguro); `*Percent` com escala só por exemplo; contagens | escala dos percentuais; unidade de `createTime`; `totalFee` |
| `market.token.holder` | GET `/api/v6/dex/market/token/holder` | premium | `chainIndex`, `tokenContractAddress`, `tagFilter` (1 a 9), `cursor`, `limit` (máximo 100) | `holdPercent` em percentual (76,75 é 76,75%); PnL em USD | unidade de quantidades e preços médios; paginação além de 100 |
| `market.token.top-liquidity` | GET `/api/v6/dex/market/token/top-liquidity` | basic | `chainIndex`, `tokenContractAddress` | `liquidityUsd` em USD; taxas percentuais com sufixo `%` | exemplo traz campos fora da tabela (`poolBasicFeePercent`, `sniperTaxInfo`) |
| `market.token.hot-token` | GET `/api/v6/dex/market/token/hot-token` | basic | `rankingType` (4 ou 5), `chainIndex`, `rankBy`, `rankingTimeFrame`, filtros, `limit` (máximo 100), `cursor` | `volume` e `liquidity` em USD; `*HoldPercent` escala não declarada | `cursor` aparece como número no exemplo; parâmetro `category` fora da tabela |
| `market.token.top-trader` | GET `/api/v6/dex/market/token/top-trader` | premium | como o de holders | PnL em USD; `holdPercent` escala não declarada | unidades de quantidade e preço |
| `market.token.cluster.supported-chain` | GET `/api/v6/dex/market/token/cluster/supported/chain` | free | nenhum | nenhuma | cobertura de 143 e 196 |
| `market.token.cluster.overview` | GET `/api/v6/dex/market/token/cluster/overview` | premium | `chainIndex`, `tokenContractAddress` | `*Percent` documentados como percentual, exemplos parecem fração (escala ambígua) | escala; `--` e `"null"` aparecem como marcadores |
| `market.token.cluster.list` | GET `/api/v6/dex/market/token/cluster/list` | premium | `chainIndex`, `tokenContractAddress` | `holdingValueUsd` em USD; `holdingPercent` escala ambígua | unidade de períodos e tempos; exemplo truncado na página |
| `market.token.cluster.top-holders` | GET `/api/v6/dex/market/token/cluster/top-holders` | premium | `chainIndex`, `tokenContractAddress`, `rangeFilter` (1 a 3) | PnL e preços em USD; `holdingPercent` escala ambígua | valores de `clusterTrendType`; `averageHoldingPeriod` parece instante |

### 7.3 Sinais e leaderboard (`signals.ts`)

| id | método e caminho | tier | parâmetros | unidades | desconhecido |
| --- | --- | --- | --- | --- | --- |
| `market.signal.supported-chain` | GET `/api/v6/dex/market/signal/supported/chain` | free | nenhum | nenhuma | 143 não aparece no exemplo (1, 196, 501, 8453, 56) |
| `market.signal.list` | POST `/api/v6/dex/market/signal/list` | premium | `chainIndex`, `walletType` (1 smart money, 2 KOL, 3 baleias; lista separada por vírgula), `minAmountUsd`, `maxAmountUsd`, `minAddressCount`, `maxAddressCount`, `tokenAddress`, `minMarketCapUsd`, `maxMarketCapUsd`, `minLiquidityUsd`, `maxLiquidityUsd`, `cursor`, `limit` (máximo 100) | `amountUsd`, `marketCapUsd`, `price` em USD; `soldRatioPercent` em percentual; `top10HolderPercent` percentual implícito | forma do corpo (seção abaixo); unidade de `timestamp`; janela temporal do sinal |
| `market.leaderboard.supported-chain` | GET `/api/v6/dex/market/leaderboard/supported/chain` | free | nenhum | nenhuma | cobertura de 143 |
| `market.leaderboard.list` | GET `/api/v6/dex/market/leaderboard/list` | premium | `chainIndex`, `timeFrame` (1 a 5), `sortBy` (1 a 5), `walletType` (1 a 10), mínimos e máximos | PnL e volume em USD; `winRatePercent` e `realizedPnlPercent` em percentual; `txs` contagem | máximo de 20 registros não é parâmetro; unidade de `lastActiveTimestamp` |

**Corpo do POST de sinais.** A tabela da página não diz se o corpo é array ou objeto; o exemplo da página é um **array com um objeto** de valores em texto; a CLI oficial envia um **objeto** de textos (R1). O cliente aceita `bodyShape: "array"` (padrão, o que a página exemplifica) ou `"object"` (o que a CLI envia). Qual deles o servidor aceita **não foi verificado** (exige chamada autorizada).

**Significado de `walletType` (usa-se o significado REST e isso é dito aqui).** Sinais, REST: 1 smart money, 2 KOL ou influenciador, 3 baleias. Leaderboard, REST: 1 KOL, 2 desenvolvedor, 3 smart money, 4 baleia, 5 carteira nova, 6 insider, 7 sniper, 8 suspeita de phishing, 9 trader em pacote, 10 smart money de pump. A CLI oficial usa outra numeração no leaderboard (smartMoney=1, sniper=3, R6). Os dois enums têm tipos separados e nenhum converte o outro.

### 7.4 Social, somente números (`social.ts`)

| id | método e caminho | tier | parâmetros | unidades | desconhecido |
| --- | --- | --- | --- | --- | --- |
| `market.social.sentiment-symbol` | GET `/api/v6/dex/market/social/sentiment/symbol` | unknown | `tokenSymbols` (até 20), `timeFrame` (1 hora, 2 quatro horas, 3 vinte e quatro horas), `trendPoints` | razões em fração de 0 a 1; contagens; `ts` em ms | tier; atualização; consulta por símbolo, sem contrato |
| `market.social.vibe-timeline` | GET `/api/v6/dex/market/social/vibe/timeline` | unknown | `chainIndex`, `tokenAddress`, `timeFrame` (1 a 4) | `score` inteiro de 0 a 100; variações em percentual com sinal (presumido); `ts` em ms | tier; `mentionCount` descrito como número de KOLs |
| `market.social.vibe-top-kols` | GET `/api/v6/dex/market/social/vibe/top-kols` | unknown | `chainIndex`, `tokenAddress`, `sortBy` (1 a 3), `timeFrame` (1 a 4), `limit` (máximo 50) | contagens; `firstMention.time` em ms | tier |

A consulta por símbolo viola a identidade cadeia mais contrato (R1): baixa confiança. O símbolo devolvido só é aceito se for um dos pedidos. Perfis, apelidos, avatares, URLs e identificadores de posts são descartados.

### 7.5 Gateway (`gateway.ts`)

| id | método e caminho | tier | parâmetros | unidades | desconhecido |
| --- | --- | --- | --- | --- | --- |
| `gateway.supported-chains` | GET `/api/v6/dex/pre-transaction/supported/chain` | unknown | nenhum | nenhuma | tier |
| `gateway.gas-price` | GET `/api/v6/dex/pre-transaction/gas-price` | unknown | `chainIndex` | wei (EVM), SUN (Tron), microlamports (Solana); sem gwei | tier; frequência de atualização; o exemplo tem comentários (JSON inválido), `supportEip1559` no lugar de `supporteip1559` e `eip1599Protocol` no lugar de `eip1559Protocol` |

### 7.6 DeFi, leitura (`defi-read.ts`)

| id | método e caminho | tier | parâmetros | unidades | desconhecido |
| --- | --- | --- | --- | --- | --- |
| `defi.product.supported-chains` | GET `/api/v6/defi/product/supported-chains` | unknown | nenhum | nenhuma | tier |
| `defi.product.supported-platforms` | GET `/api/v6/defi/product/supported-platforms` | unknown | nenhum | contagem de produtos | tier |
| `defi.product.search` | POST `/api/v6/defi/product/search` | unknown | corpo objeto: `tokenKeywordList`, `platformKeywordList`, `pageNum`, `chainIndex`, `productGroup` (`SINGLE_EARN`, `DEX_POOL`, `LENDING`); página fixa de 20 | `rate` em fração decimal (`"0.02140"` é 2,14%); `tvl` em USD | base de `feeRate`; tier; cobertura de 143 e 196 |
| `defi.product.detail` | GET `/api/v6/defi/product/detail` | unknown | `investmentId` | `rate`, `tvl`, `utilizationRate` sem unidade declarada (o exemplo repete a escala da busca) | unidade de cada campo; prazo, fila e liquidez de resgate |
| `defi.product.rate-chart` | GET `/api/v6/defi/product/rate/chart` | unknown | `investmentId`, `timeRange` (`WEEK`, `MONTH`, `SEASON`, `YEAR`) | `timestamp` em ms; taxas sem unidade declarada | fração ou percentual |
| `defi.product.tvl-chart` | GET `/api/v6/defi/product/tvl/chart` | unknown | `investmentId`, `timeRange` | `tvl` em USD; `timestamp` em ms | `timestamp` aparece como texto e como número no exemplo |
| `defi.product.depth-price-chart` | GET `/api/v6/defi/product/depth-price/chart` | unknown | `investmentId`, `chartType` (`DEPTH`, `PRICE`), `timeRange` (`DAY`, `WEEK`) | `timestamp` em ms; preços e liquidez sem unidade declarada | só para produtos de pool V3 (erro 84032 nos demais) |

`rate` é APY **anunciado**. O resultado se chama `advertisedRate...` e nenhum campo, função ou texto deste código afirma retorno líquido, ganho ou rendimento realizado.

### 7.7 Divergências da documentação que o código trata

1. Preço e índice: o exemplo pede `chainIndex` 66 e a resposta traz 1 (recusado pela conferência de identidade). O exemplo do índice tem `code` numérico e JSON inválido (vírgulas sobrando ou faltando).
2. Vários exemplos têm JSON inválido: comentários `--` e `//`, vírgula final, vírgula faltando. As fixtures `doc-example` são reconstruções válidas e a nota de cada uma diz o que foi reparado.
3. Candles: o exemplo repete o mesmo `ts` nas duas velas; a ordem das linhas não é declarada.
4. Gás: nomes `supporteip1559` e `eip1559Protocol` na tabela contra `supportEip1559` e `eip1599Protocol` no exemplo; o parser aceita as duas grafias.
5. Sinais: corpo em array contra objeto; `walletType` na resposta aparece como enumeração textual (`SMART_MONEY`, `WHALE`, `INFLUENCER`) na tabela e como número no exemplo; `cursor` está dentro de cada item.
6. Hot-token: `cursor` é número no exemplo e texto na tabela.
7. Clusters: `ClusterConcentration` (tabela) contra `clusterConcentration` (exemplo); `code` numérico; marcadores `--` e `"null"`; escala dos percentuais ambígua.
8. DeFi: `investmentId` é texto na tabela e número no exemplo; `code` numérico; `timestamp` texto ou número; `trendType` nulo.
9. Histórico do índice: o exemplo usa `/api/v5/wallet/token/historical-price`.
10. A página de planos escreve `/api/v6/dex/market//portfolio/dex-history` (barra dupla); não é usado aqui.

## 8. Endpoints não implementados e bloqueados

**Bloqueados (segurança).** Os seis caminhos `/api/v6/security/*` (`token-scan`, `dapp-scan`, `transaction-scan/evm`, `transaction-scan/sol`, `approval-mng`, `sign-message-check`) só aparecem no código do CLI oficial; as páginas REST não foram localizadas (R1 e R6; as tentativas de `wallet/security-introduction` e `wallet/security-token-scan` deram 404). Autenticação REST, tier, método de cálculo de `riskLevel` e semântica de "sem ação" não estão confirmados. Um veredito de segurança construído sobre um contrato não verificado é pior que nenhum, porque vira falsa segurança. Permanecem bloqueados até haver página oficial ou leitura autorizada.

**Não implementados, com motivo.**

| id ou grupo | motivo |
| --- | --- |
| `market.social.news-*` | texto livre de terceiros; não vira campo tipado |
| `market.social.sentiment-ranking` | o símbolo devolvido é texto escolhido pelo provedor, não identidade |
| `market.portfolio.*`, `market.tracker.trades`, `balance.*`, `history.*`, `defi.user.*` | recebem endereço de carteira (privacidade); `balance.*` já tem cliente em `src/okx-wallet/portfolio.ts`; tracker com tier desconhecido |
| `market.trenches.*` | `chainsProtocol` e `tokenList` já têm cliente em `src/okx-api.ts`; o restante só foi listado |
| `market.token.rwa-tokens`, `market.token.ranking` | prioridade P3; a página de ranking dá 404 |
| `market.ws.*` | WebSocket exige plano pago; fora do escopo |
| `gateway.gas-limit`, `gateway.simulate`, `gateway.broadcast`, `gateway.orders` | exigem dados de transação, whitelist ou enviam transação assinada |
| `defi.product.prepare`, `defi.calculator.*`, `defi.transaction.*` | preparam dados para assinar |
| `trade.*` | cotação, swap, aprovação, ponte e intent: execução e unidade de `toTokenAmount` não declarada |
| `onchaindata.*`, `xlayer.*` | fora das famílias pedidas; páginas só listadas |
| `agentic.*`, `payments.*`, `mcp.*`, `cli.*`, `skill.*`, `sdk.*` | movem fundos, assinam ou pagam (x402); não são leitura REST de dados |
| `exchange.kit.*` | ferramentas MCP e CLI do kit; a leitura de dados públicos da Exchange é feita por `public-okx.ts` |

## 9. Cliente público da OKX Exchange v5 (`public-okx.ts`)

Sem chave, sem assinatura, mesma regra de `fetch` injetado e de offline por padrão (`allowNetwork: true` é exigido). Origem `https://www.okx.com`. Fontes: o espelho Markdown oficial `okx/ai-builder-openapi-md` (`api/rest/public/*.md` e `api/rest/market/*.md`) e respostas reais obtidas sem chave em 2026-10-11 (fixtures `live-keyless`).

| id | método e caminho | limite documentado | parâmetros | observações |
| --- | --- | --- | --- | --- |
| `public.instruments` | GET `/api/v5/public/instruments` | 20 por 2 s (IP e tipo) | `instType` (`SPOT` ou `SWAP`), `instId` | `ctVal`, `ctMult`, `ctValCcy`, `ctType`, `lotSz`, `minSz`, `tickSz`, `lever`, `state`; em derivativos `lotSz` e `minSz` são em contratos |
| `public.funding-rate` | GET `/api/v5/public/funding-rate` | 10 por 2 s (IP e instrumento) | `instId` | `fundingRate` é previsão para a liquidação em `fundingTime`; intervalo é `nextFundingTime - fundingTime` (1, 2, 4 ou 8 horas); `nextFundingRate` vem vazio; a resposta real traz também `prevFundingTime` |
| `public.funding-rate-history` | GET `/api/v5/public/funding-rate-history` | 10 por 2 s (IP e instrumento) | `instId`, `before`, `after`, `limit` (máximo 400 documentado) | `realizedRate` é a taxa aplicada; mais recente primeiro (observado, não declarado); até 3 meses |
| `public.mark-price` | GET `/api/v5/public/mark-price` | 10 por 2 s (IP e instrumento) | `instType`, `instId` | `markPx` |
| `public.ticker` | GET `/api/v5/market/ticker` | 20 por 2 s (IP) | `instId` | `bidPx`, `askPx`, `last`, tamanhos; `vol24h` em contratos (derivativos) ou base (spot) |
| `public.candles` | GET `/api/v5/market/candles` | 40 por 2 s (IP) | `instId`, `bar`, `after`, `before`, `limit` (padrão 100, máximo 300) | nove colunas `[ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]`; mais recente primeiro (observado); `confirm` 1 é vela fechada |
| `public.history-candles` | GET `/api/v5/market/history-candles` | 20 por 2 s (IP) | os mesmos | `1s` só nos últimos 3 meses |
| `public.books` | GET `/api/v5/market/books` | 40 por 2 s (IP) | `instId`, `sz` (padrão 1, máximo 400) | nível `[preço, tamanho, "0", ordens]`; tamanho em contratos (derivativos) ou base (spot) |
| `public.open-interest` | GET `/api/v5/public/open-interest` | 20 por 2 s (IP e instrumento) | `instType`, `instId` | `oi` em contratos, `oiCcy` em moeda base, `oiUsd` em USD |

Parsers: todo valor numérico é mantido como **texto decimal validado** pela mesma gramática estrita do avaliador de derivativos (`parseDecimal` de `src/okx-derivatives/decimal.ts`) e também como número, quando a captura precisa. Texto que não passa na gramática é `null`. Livro com níveis fora de ordem, repetidos ou não numéricos é rejeitado com o índice do nível. A paginação de histórico (`fundingRateHistoryBackwards`, `historyCandlesBackwards`) tem teto de páginas e de linhas e para em página vazia, sem progresso ou cursor repetido. Limite de taxa deste cliente: 1 requisição por segundo por padrão, no máximo 5 (o menor limite documentado é 10 por 2 s).

**Ponte para o avaliador de derivativos (D18).** `buildDerivativesSnapshot(...)` monta o objeto `snapshot` do esquema `okx_derivatives_input_v1` (`spot`, `perp`, `books`, `mark`, `funding` com histórico do mais antigo ao mais novo usando `realizedRate`) a partir de leituras do cliente. Não preenche `fees`, `maintenanceMarginRate` nem `access`: ficam desconhecidos, e o avaliador responde "indisponível" por causa deles. `buildDerivativesInput(snapshot, evaluation)` junta o `evaluation` fornecido pelo operador (contratos, alavancagens, liquidações) e marca `sourceClaim: "operator_claimed"`. O teste passa o resultado por `parseDerivativesInput` e `createFixtureAdapter`.

## 10. Gravador de captura (`capture.ts`, `capture-sources.ts`)

### 10.1 Formato

O gravador escreve `capture.jsonl` no formato do laboratório (seção 3.4 de `JEV-LABORATORIO-DE-DECISAO.md`), linhas canônicas de `serializeCaptureRecord`, e valida cada linha com `parseCaptureLine` antes de gravar. `t` é o recebimento local (`receivedAtMs` da leitura), nunca um carimbo do provedor; é não decrescente no arquivo inteiro, inclusive depois de uma retomada.

### 10.2 Mapeamento por fonte

| Espécie | Fonte `public-okx` | Fonte `onchainos` |
| --- | --- | --- |
| `ticker` | `market/ticker` (`bidPx`, `askPx`, `last`, `bidSz`, `askSz`, `vol24h`) | sem equivalente (agregador DEX não tem bid e ask) |
| `funding` | anúncio de `funding-rate` (`t` antes de `settleMs`) e valor liquidado de `funding-rate-history` (`realizedRate`, `t` depois de `settleMs`); intervalo derivado dos tempos | sem equivalente |
| `mark` | `mark-price` (`markPx`) | `price` do agregador em `price` e `index/current-price` em `index` |
| `candle` | `candles` fechadas (`confirm` 1), `volume` igual à coluna `vol` | `candles` fechadas (`confirm` 1), `volume` igual à coluna `vol` |
| `book` | `books` (até `bookDepth` níveis, no máximo 50) | sem equivalente |
| `oi` | `open-interest` (`oi` e `oiUsd`) | sem equivalente |

`mark` da fonte `onchainos` **não é** preço de marcação de bolsa: carrega o preço agregado da Onchain OS (moeda de cotação não declarada) e o índice. O `inst` de cada token é um apelido escolhido por quem opera (`ALIAS=chainIndex:endereco`), no padrão do formato; a identidade real fica no manifesto. Uma moeda de cotação não declarada é registrada no manifesto como `priceQuote: "unknown"`.

### 10.3 Épocas, idempotência e retomada (D21)

- Uma **época** é uma rodada de leituras alinhada a uma grade de `epochMs` (padrão 60 000 ms): o id é `e<instante da grade>`. Uma época já confirmada nunca é gravada de novo; células de grade perdidas porque a época anterior demorou não são recuperadas.
- **Limites:** `maxEpochs` é o total alvo na pasta (retomar com o mesmo valor completa o que falta); `maxDurationMs` vale por invocação e é repassado às fontes como prazo: passou do prazo, a época em curso é abandonada sem gravar nada.
- **Arquivos na pasta de saída:** `capture.jsonl` (registros), `capture-ledger.jsonl` (uma linha por época confirmada: id, instante da grade, `t` inicial e final, contagens, `bytesEnd`), `capture-manifest.json` (configuração e proveniência, escrito por arquivo temporário e renomeação).
- **Anexo atômico:** o bloco de linhas de uma época é montado e validado inteiro na memória e anexado em **uma** chamada; só depois a linha do ledger é anexada. A época vale quando o ledger a registra.
- **Retomada:** o manifesto precisa coincidir com a configuração pedida; o arquivo de dados é lido e validado de ponta a ponta; bytes depois do último `bytesEnd` (época não confirmada ou escrita pela metade) são truncados e a época é refeita; arquivo menor que o ledger, ledger corrompido no meio, configuração diferente ou `t` regredindo **param** a execução com erro claro. Cursor de velas e de liquidações vem do próprio arquivo de dados, que é a única fonte de verdade.
- **Velas:** só `confirm` 1 e só quando `startMs + barMs + margem` já passou também no relógio local (margem de 2000 ms por padrão); nunca duplicar `(inst, barMs, startMs)`. Na primeira época, a história devolvida é gravada com `t` igual ao instante real de recebimento (seção 3.4 do laboratório); um buraco maior que uma vela é apontado em `notes` do relatório ("lacuna de N vela(s)"), sem preenchimento. Vela confirmada pelo provedor mas ainda aberta pelo relógio local fica em `skipped`, com o motivo, e entra numa época posterior. Duas velas com o mesmo início e conteúdo diferente na mesma resposta (o exemplo da documentação tem esse defeito) são erro, não escolha silenciosa.
- **Funding:** anúncio só enquanto `t < settleMs`; passou da liquidação, o anúncio é pulado e contado. Valor liquidado só para liquidações já ocorridas e ainda não gravadas; o intervalo de cada uma vem da diferença para a liquidação anterior da mesma página. Fora de 1, 2, 4 ou 8 horas (a OKX admite 6 h em alguns perpétuos, que o formato do laboratório não carrega), a liquidação é pulada com o motivo em `skipped`, nunca inventada; a liquidação mais antiga da página não tem anterior e fica sem gravar. O histórico só é pedido quando ainda não há liquidação gravada ou quando `prevFundingTime` indica uma liquidação nova.
- **Para com erro claro** em: número malformado ou ilegível numa espécie obrigatória, ticker ou livro cruzado, vela incoerente ou repetida, funding fora da faixa, `t` que regride, resposta do provedor fora do formato, erro HTTP depois das retentativas, pasta inconsistente. Nenhuma gravação parcial de época. Valor desconhecido que o provedor admite (preço sem cotação, taxa realizada ausente) não para a execução: o registro não é escrito e o motivo vai para `skipped`.
- **Retomada:** o arquivo de dados é relido inteiro e validado; acima de 64 MiB a retomada recusa (erro `io`) e pede outra pasta.
- **Nunca grava** chave, segredo, frase-senha, assinatura, cabeçalho, URL com query nem texto do provedor. O manifesto traz apenas fonte, apelidos, identidades públicas de token, espécies e parâmetros.
- Um processo por pasta de saída; não há trava de arquivo. Dados reais capturados continuam sendo evidência de uma janela, não garantia.

## 11. CLI (`scripts/onchainos-capture.ts`)

```text
bun --no-env-file run scripts/onchainos-capture.ts plan [--source public-okx|onchainos] [--inst ID,ID] [--token ALIAS=cadeia:endereco,...] [--kinds a,b] [--bar 1m] [--max-epochs N] [--epoch-ms ms] [--rps n]
bun --no-env-file run scripts/onchainos-capture.ts run --out <pasta> --max-epochs N --source public-okx|onchainos --allow-network [--credentials-from-env] [--max-duration-ms ms] [--inst ...] [--token ...] [--kinds ...] [--bar ...] [--epoch-ms ms] [--rps n] [--book-depth n] [--candles-limit n]
bun --no-env-file run scripts/onchainos-capture.ts --help
```

- `plan` imprime as chamadas que `run` faria e o custo de cota por tier, **sem rede**. Sem `--source`, usa `public-okx` com `BTC-USDT` e `BTC-USDT-SWAP`; sem `--max-epochs`, projeta 60 épocas. Mostra o mínimo e o máximo de chamadas, o tier de cada uma, o percentual da franquia mensal gratuita que a captura sozinha usaria e avisos (por exemplo, época mais longa que a grade).
- `run` exige `--source`, `--out`, `--max-epochs` e `--allow-network`; `--max-duration-ms` vale 300000 por padrão, `--epoch-ms` 60000 e `--rps` 1 (no máximo 5 em `public-okx` e 10 em `onchainos`). Nunca toca a rede sem `--allow-network`. A fonte `onchainos` exige também `--credentials-from-env`, que lê `OKX_WEB3_API_KEY`, `OKX_WEB3_API_SECRET` e `OKX_WEB3_API_PASSPHRASE` do ambiente; sem as três variáveis o comando para com erro de uso que nomeia as variáveis ausentes (nunca os valores). Rode com `bun run` **sem** `--no-env-file` só quando o dono escolher carregar o `.env`. Os testes nunca leem o ambiente real: a CLI recebe `env` por injeção.
- Saída: relatório JSON no stdout, resumo curto em português no stderr, sempre com o aviso final de que nada prova lucro e nada concede permissão. Códigos de saída: 0 relatório completo (inclui parada por limite de duração); 2 uso incorreto; 3 parada por erro (registro malformado, falha do provedor, pasta inconsistente).
- Nunca escreve fora de `--out`.

## 12. Mapa de unidades (armadilhas)

| Campo | Convenção | Situação |
| --- | --- | --- |
| `time`, `ts`, `timestamp`, `begin`, `end` | milissegundos Unix | declarado nas páginas de preço, candles, trades, índice, token, social e DeFi; em `signal/list`, `createTime`, `lastActiveTimestamp` e `firstTradeTime` a unidade não é declarada (13 dígitos nos exemplos) |
| `price`, `o h l c`, `maxPrice`, `minPrice` | moeda de cotação | **NAO declarada** (tipo `PriceQuoteUnknown`) |
| `volUsd`, `volume` de trades e do hot-token, `liquidityUsd`, `amountUsd`, PnL `*Usd` | USD | declarado |
| `vol` de candles | unidade base do token | declarado como "unidade base" sem dizer decimais |
| `volume5M`, `liquidity`, `marketCap` do price-info | moeda | **NAO declarada** |
| `holdPercent` (holders) | percentual (76,75 é 76,75%) | declarado |
| `winRatePercent`, `soldRatioPercent`, `realizedPnlPercent` | percentual | declarado |
| `priceChange5M` a `24H` | percentual sem o sinal `%` (`0.22`) | por exemplo; escala NAO declarada (tipo `PercentByExample`) |
| `top10HoldPercent`, `lpBurnedPercent` e similares do advanced-info | percentual por exemplo | nome e exemplos sugerem percentual, página não declara |
| `*Percent` de clusters | percentual na tabela, parece fração no exemplo | escala ambígua (tipo `AmbiguousScale`) |
| razões de sentimento | fração de 0 a 1 | declarado |
| `rate` da busca DeFi | fração decimal (`0.0214` é 2,14%) | declarado |
| `rate` do detalhe e dos gráficos DeFi | sem unidade declarada | tipo próprio, sem conversão |
| `tvl` da busca e do gráfico DeFi | USD | declarado |
| preço de gás | wei (EVM), SUN (Tron), microlamports (Solana) | declarado |
| `riskControlLevel` e `riskLevelControl` | código 0 a 5; 0 é indefinido, não seguro | declarado |
| `toTokenAmount`, `minReceiveAmount` | sem declaração | **não aparecem** neste código |

## 13. Fixtures e proveniência

`fixtures.ts` guarda cada exemplo como `{ provenance, source, note, body }`. `doc-example`: reconstruído a partir da página citada em `source`, **lida por uma ferramenta que resume texto** (os valores foram transcritos da extração e podem ter erro; o JSON foi reparado quando o original é inválido, e a nota diz como). `live-keyless`: corpo real devolvido pela API pública da OKX Exchange sem chave em 2026-10-11 (BTC-USDT e BTC-USDT-SWAP), cortado a poucas linhas; os números são dados de mercado daquele instante e só provam leitura. `synthetic`: inventado para casos de borda. As fixtures não afirmam lucro, retorno ou vantagem.

## 14. Limites conhecidos e o que não foi verificado

1. Nenhuma chamada autenticada foi feita: o envelope, a assinatura aceita pelo servidor, o RPS real, os tiers de Gateway, DeFi e Social, a cobertura de Monad por endpoint, a forma do corpo de sinais e a disponibilidade no Brasil **não foram verificados**.
2. As páginas foram resumidas por ferramenta: valores de exemplo e nomes de campo precisam de reconferência.
3. Para tokens, a unidade de preço, de volume e de liquidez em moeda é desconhecida; a captura da fonte `onchainos` não deve ser misturada com séries em outra moeda sem checagem.
4. A ordem das linhas de candles e trades da Onchain OS não é declarada; o gravador ordena por `ts` e recusa duplicatas.
5. O gravador não preenche buracos de velas nem usa `history-candles` para recuperar histórico longo.
6. A margem de 2000 ms para considerar uma vela fechada no relógio local é uma suposição de projeto; relógio local muito errado faz velas demorarem a entrar.
7. Dados capturados têm direitos e termos de uso que não foram avaliados.
8. O modelo de custo da cota (cada tentativa conta) é conservador e não verificado.

## 15. Verificação

```text
bun --no-env-file install --frozen-lockfile
bun --no-env-file test --parallel=1 --timeout 15000 ./src ./scripts
bun --no-env-file run typecheck
bun --no-env-file run scripts/onchainos-capture.ts plan
bun --no-env-file run scripts/onchainos-capture.ts run --source public-okx --out <pasta temporária> --max-epochs 1 --kinds ticker,funding,mark --inst BTC-USDT-SWAP --allow-network
```

Linhas sugeridas para o `package.json` (o mantenedor liga; este trabalho não o altera):

```text
"onchainos:capture": "bun --no-env-file run scripts/onchainos-capture.ts",
"onchainos:capture:env": "bun run scripts/onchainos-capture.ts"
```

A segunda carrega o `.env` (use só com `--credentials-from-env`, por decisão do dono).

## 16. Fontes (acessadas em 2026-10-11)

- Docs Onchain OS, prefixo `https://web3.okx.com/onchainos/dev-docs/` (sufixo `.md` devolve Markdown): `home/api-access-and-usage`, `market/market-api-fee`, `market/market-price`, `market/market-price-chains`, `market/market-candlesticks`, `market/market-candlesticks-history`, `market/market-trades`, `market/index-price`, `market/historical-index-price`, `market/market-token-search`, `market/market-token-basic-info`, `market/market-token-price-info`, `market/market-token-advanced-info`, `market/market-token-holder`, `market/market-token-top-liquidity`, `market/market-token-hot-token`, `market/market-token-top-trader`, `market/market-token-cluster-overview`, `market/market-token-cluster-list`, `market/market-token-cluster-top-holders`, `market/market-token-cluster-supported-chain`, `market/market-signal-list`, `market/market-signal-chains`, `market/market-signal-leaderboard-list`, `market/market-signal-leaderboard-supported-chain`, `market/market-social-sentiment-symbol`, `market/market-social-sentiment-ranking`, `market/market-social-vibe-timeline`, `market/market-social-vibe-top-kols`, `wallet/onchain-gateway-api-gas-price`, `wallet/onchain-gateway-api-chains`, `wallet/defi-product-search`, `wallet/defi-product-detail`, `wallet/defi-product-rate-chart`, `wallet/defi-product-tvl-chart`, `wallet/defi-product-depth-price-chart`, `wallet/defi-product-supported-chains`, `wallet/defi-product-supported-platforms`.
- OKX Exchange v5 (espelho Markdown oficial `okx/ai-builder-openapi-md`, `skills/okx-v5-api/docs/okex/en/api/rest/`): `public/instruments.md`, `public/fundingRate.md`, `public/fundingRateHistory.md`, `public/markPrice.md`, `public/openInterest.md`, `market/ticker.md`, `market/candles.md`, `market/historyCandles.md`, `market/books.md`; e respostas reais sem chave de `https://www.okx.com/api/v5/public/...` e `/market/...` em 2026-10-11.
- Pesquisas do repositório: R1, R6 (inventário e catálogo), `JEV-DECISAO-ONCHAIN-OS.md`, `JEV-LABORATORIO-DE-DECISAO.md`.

Nada neste documento prova lucro e nada neste documento concede permissão.
