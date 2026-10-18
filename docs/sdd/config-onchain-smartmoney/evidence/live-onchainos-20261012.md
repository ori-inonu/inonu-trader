# Live OnchainOS smoke: novas rotas (2026-10-12)

Uma única execução, somente leitura, do gateway real (`src/onchain-read`) com credenciais do Dev Portal, diretório de orçamento temporário e ritmo de 1,1 s do cliente. Registram-se apenas rota, código, forma da resposta (linhas ou objeto), camada e os NOMES dos campos nulos, nunca valores.

O relógio da máquina estava cerca de 76 s atrasado (confirmado contra OKX, Google e Cloudflare). O cliente aprendeu o desvio pelo cabeçalho `Date` da primeira resposta (`clockOffsetMs` final = 76445 ms) e passou a assinar com ele: endpoints das famílias Wallet/Balance que devolviam HTTP 401 `50102` sem a correção responderam normalmente no teste de conexão. Resultados de uma única execução.

## Tabela

| Chamada | Resultado | Forma | Camada | Campos nulos (nomes) |
| --- | --- | --- | --- | --- |
| `/onchain/price-info` chainIndex=1, WETH | ok | 1 linha | premium | (nenhum) |
| `/onchain/token-risk` chainIndex=1, WETH | ok | objeto | premium | bundleHoldPct, createdMs, devCreateCount, devRugCount, lpBurnedPct, progressPct, sniperHoldPct, suspiciousHoldPct |
| `/onchain/token-risk` chainIndex=501, BONK | ok | objeto | premium | createdMs, lpBurnedPct, progressPct, sniperHoldPct |
| `/onchain/pools` chainIndex=1, WETH | ok | 5 linhas | basic | feePct |
| `/onchain/cluster-chains` | ok | 5 linhas | free | symbol |
| `/onchain/clusters` chainIndex=1, USDC | ok | objeto | premium | newAddressPct, rugPullPct, sameFundSourcePct |
| `/onchain/clusters` chainIndex=501, BONK | ok | objeto | premium | (nenhum) |
| `/onchain/trades` chainIndex=1, WETH, limit=10 | ok | 10 linhas | basic | (nenhum) |
| `/onchain/news` limit=5 | ok | objeto | basic | (nenhum) |
| `/onchain/news` symbol=BTC, limit=5 | ok | objeto | basic | (nenhum) |
| `/onchain/sentiment` symbol=BTC | ok | objeto | basic | (nenhum) |
| `/onchain/sentiment-ranking` limit=5 | ok | 3 linhas | basic | (nenhum) |
| `/onchain/vibe` chainIndex=501, BONK | ok | objeto | basic | (nenhum) |
| `/onchain/kols` chainIndex=501, BONK, limit=5 | ok | 5 linhas | basic | (nenhum) |
| teste de conexão (2 famílias: market + balance supported/chain) | ok | - | free | - |
| segunda chamada gratuita após a correção do relógio (a contagem de linhas não foi registrada nesta execução) | ok | - | free | - |

## Notas

- `sentiment-ranking` limit=5 devolveu 3 linhas: o provedor enviou só 3 `details` válidos para o pedido.
- Os campos nulos listados são campos ausentes ou vazios na resposta do provedor para aquele token naquele momento (por exemplo `lpBurnedPct` e `progressPct` em token maduro, `createdMs` em WETH/BONK), não falha do normalizador.
- Endpoints cuja camada o portal não declara contam como `basic` no orçamento (regra conservadora documentada no gateway doc).
- Fixtures em `src/onchain-read/fixtures/` com `origin: "real_probe_2026-10-12"` foram aparadas das respostas reais desta data (endereços substituídos por placeholders, sem logos nem URLs); as demais são `synthetic_fixture`.

## Sessão LIVE da interface (2026-10-13)

Mesmo gateway real (`.scratch/b2/serve-onchain.ts` sem `--fake`, 127.0.0.1:3055) servindo o build de produção isolado do web em 127.0.0.1:3056 com `NEXT_PUBLIC_API_URL=http://127.0.0.1:3055`. O backend de trading não foi iniciado; o harness responde 404 às rotas dele (`/operator`, `/jev-read`, `/system-one`), o que aparece no console do navegador como erros ambientais de recurso 404, nenhum de código da aplicação.

- Chamadas ao provedor contadas pelo harness (`/harness/stats` + log de rotas): **80 no total** (18 antes do reinício do harness + 62 depois), limite da sessão era 80.
- Distribuição na segunda metade (62): sentiment/symbol 14, trades 8 (poll de 30 s com a aba Fita visível), candles 7, news 6, price-info 4, signals 4, hot-token 3, search 2, holders 2, clusters 2, token-risk 2, vibe 2, kols 2, pools 1, cluster-chains 1, chains 2.
- `clockOffsetMs` aprendido ao vivo: 76583 depois 76645 ms (o Windows continua ~76,6 s atrasado; Configurações mostra a linha do relógio, capturas `live-settings-clock-*.png`).
- `sentiment/symbol` de WETH respondeu fora do contrato (sem `details`) e `news` de WETH/BONK voltou vazio: a interface mostra "Resposta fora do contrato, descartada" e "Sem noticias para este simbolo agora", comportamento honesto do provedor real.
- Cache reutilizado na navegação (labels "ha N min/s" nos blocos revisitados).
- Sondas: 0 recortes numéricos nas superfícies novas, 0 sobreposições de texto, 0 ocorrências de OK-ACCESS/chave/segredo/passphrase em texto da página, HTML e log de rede; o único parâmetro `token=` nas URLs é o endereço público do contrato.

## Revisão B3 (2026-10-13): correção do gráfico vazio e vazio != violação de contrato

Rodada de retrabalho após revisão das capturas da sessão anterior.

### R1: gráfico vazio em todas as capturas

Diagnóstico com sonda DOM/canvas: o canvas existia (CSS ~1270 px de largura) mas com altura 0 e buffer 300x150 padrão sem nenhum pixel; as velas CHEGAVAM normalmente (rede `/onchain/candles` e okx.com ok, OHLC no DOM). Causa real: a regra `.indicators:empty { display:none }` retira o item da grade `minmax(0,96px) auto minmax(0,1fr)` de `.center`; sem `/jev-read` no harness isolado a linha `auto` colapsava e o auto-posicionamento colocava `.graph` na linha de 26 px em vez da linha `1fr`. Regressão latente de layout, não de dados. Correção: `.graph` fixado na linha do gráfico (`grid-row: 3`) em `MesaView.module.css`. Verificado: `grid-template-rows` computado "96px 0px 478px", canvas 1270x404 CSS / 1252x398 buffer com 1546+ amostras não vazias.

### R2: resposta vazia válida não é violação de contrato

`sentiment/symbol` para WETH/BONK devolve envelope válido com `details: []` e era descartado como "schema". Corrigido: `details` vazio => `ok:true, data:null`, cacheável; apenas `details` não-array ou envelope inválido vira schema. O mesmo tratamento para `vibe` (objeto sem `summary`/`timeline` => null). A sonda de formatos reais usou 10 chamadas (cluster supported chains, hot-tokens Solana, vibe, top-kols, advanced-info, top-liquidity, trades, price-info, sentiment, cluster overview) e confirmou que os demais normalizadores já tratam arrays/objetos vazios como dados (trades [], pools [], price-info [], news {articles:[]}, kols {kols:[]}, clusters objeto com campos nulos). UI: "Sem sentimento para este simbolo" e estados neutros equivalentes, chip de feed em estado vazio normal. Capturado ao vivo: `live-eco-weth-*.png` mostra a linha neutra em vez do falso erro.

### R3: cabeçalhos truncados

Larguras das grades das novas tabelas ajustadas (Janelas, Pools, Notícias, KOLs, fita on-chain). Sonda estendida a `columnheader`, `th`, `dt` e rótulos: **0 células com scrollWidth > clientWidth** em 1600x900, 1280x720, 1100x700 e 390x844. "Variacao %", "Transacoes" e "Importancia" aparecem inteiras em 1280x720 onde antes truncavam.

### R4: honestidade de casamento por símbolo

"Busca por simbolo, nao por contrato: outros tokens podem usar o mesmo simbolo" visível nas capturas com foco on-chain (`live-eco-weth-*`, `live-eco-bonk-*`) e corretamente ausente em `live-eco-btc-1600x900.png` (foco OKX).

### Recaptura e verificação

- 21 capturas LIVE + 5 sintéticas refeitas com a sonda de canvas não-vazio antes de gravar cada arquivo; canvas pintado em todas (amostras não vazias: 1546 WETH 1600, 1282 BONK, 929 BTC-USDT OKX, 627 mobile 390).
- Sondas: 0 recortes de cabeçalho/rótulo, 0 sobreposições de texto, 0 vazamento de credencial (OK-ACCESS/chave/segredo/passphrase ausentes de texto, HTML e rede); console apenas 404 ambientais das rotas do backend de trading não servidas pelo harness; 1 aviso Canvas2D `willReadFrequently` provocado pela própria sonda de pixels, não pela aplicação.
- Chamadas ao provedor nesta rodada: **54 no total** (44 neste gateway + 10 da sonda R2), dentro do limite de 70. `clockOffsetMs` reaprendido: 75914 ms.
- `bun --no-env-file test src/onchain-read src/settings`: 181 pass / 0 fail (748 expects, 12 arquivos). Guarda de deriva `onchain-normalized.json`: ok. Suíte web `bun --no-env-file run --cwd web test`: 1776 pass / 0 fail (40419 expects, 104 arquivos; uma falha intermitente de timeout em `wallet-transaction-preflight` na primeira execução, passa isolada e na reexecução completa). `bun --no-env-file run typecheck:all`: limpo (raiz + web). Build isolado `next build --webpack`: ok (o build que serviu as capturas continha o CSS corrigido, verificado no bundle).
