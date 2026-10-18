# Evidência desta entrega

Capturas de 2026-10-12 e 2026-10-13. "Ao vivo" significa dados públicos reais da OKX lidos pelo `next dev` em `127.0.0.1:3031`. "Harness" significa o gateway real de `src/onchain-read` ligado a um provedor FALSO com respostas sintéticas (nenhuma chamada ao OKX), servindo um build isolado do web; o que aparece nessas telas como sinal, trader, holder ou vela on-chain é fixture rotulada `synthetic_fixture`, não mercado. "LIVE" significa o mesmo gateway ligado às credenciais reais de `data/onchainos.env` (127.0.0.1:3055) servindo um build de produção isolado (127.0.0.1:3056), com budget temporário e contagem exata de chamadas ao provedor.

| Arquivo | Origem | O que prova |
| --- | --- | --- |
| `settings-*.png`, `settings-usage-*.png`, `final-configuracoes-*.png` | harness, valores sentinela | tela de Configurações: quatro campos, estado sem eco do valor salvo, medidor de uso por camada, teste de conexão, rede padrão; 1600x900 e 390x844 |
| `dock-*.png` | ao vivo | painel inferior com abas (Fita, Livro, Carteira, recolhido), medidas do gráfico, mobile |
| `probe-dock-columns.js` | script | sonda que mede o x de cada célula contra o cabeçalho (Livro, 15 níveis por lado, zero desalinhadas) |
| `smc-*.png` | ao vivo | smart money no gráfico (BTC 1m e 15m, ETH 1h), grupos no popover, Renko sem smart money, tudo desligado |
| `onchain-*.png` | harness | abas Smart money, Traders e Holders, sem credencial, erro 401 do provedor falso, mobile; e as novas superfícies: `onchain-fita-synthetic-*` (fita DEX fixture), `onchain-liquidez-synthetic-*` (métricas, Janelas, Pools), `onchain-holders-risco-synthetic-*` (cartão Estrutura e risco), `onchain-eco-synthetic-*` (notícias, sentimento, calor social, KOLs; 1600x900 e 390x844) |
| `chain-*.png` | harness | seletor de redes e Trending, gráfico on-chain com marcas de carteiras rastreadas e hover, lista Ativos com fixados e extras, erro no gráfico, mobile |
| `final-mesa-*.png` | ao vivo, `localStorage jev.*` limpo | estado padrão novo em 1600x900, 1280x720, 1100x700 e 390x844 (Gráfico e Livro) |
| `live-onchainos-20261012.md` | LIVE | fumaça de leitura real das 22 rotas do gateway (uma rodada), tabela com código, forma e nomes de campos nulos; compensação de relógio aprendida (clockOffsetMs ~76 s) |
| `live-fita-weth-*.png` | LIVE | aba Fita em modo on-chain: fita DEX real do WETH (Ethereum), nota "nao e a fita da OKX", em 1600x900, 1280x720, 1100x700 e 390x844 |
| `live-liquidez-weth-*.png` | LIVE | aba Liquidez on-chain: métricas do price-info, tabela Janelas (5m/1h/4h/24h) e Pools reais do WETH, nos quatro tamanhos |
| `live-holders-weth-*.png` | LIVE | aba Holders: cartão "Estrutura e risco" com token-risk e clusters reais do WETH (Nível 1 de 5, tag communityRecognized), nos quatro tamanhos |
| `live-eco-weth-*.png` | LIVE | aba Ecossistema com foco on-chain WETH: Calor social real, Top KOLs real, sentimento vazio do provedor na linha neutra "Sem sentimento para este simbolo" (details:[] e resposta valida, nao erro), notícias vazias e o aviso "Busca por simbolo, nao por contrato", nos quatro tamanhos |
| `live-holders-bonk-1600x900.png`, `live-eco-bonk-1600x900.png` | LIVE | mesmas superfícies para BONK em Solana (risco Nível 1, Suspeitos 29,6%, clusters, calor 57,5, KOLs reais) |
| `live-eco-btc-1600x900.png` | LIVE | Ecossistema com foco OKX BTC-USDT: sentimento e notícias reais do símbolo BTC, sem calor social nem KOLs |
| `live-settings-clock-*.png` | LIVE | Configurações: "Relogio do computador cerca de 77 s atrasado em relacao a OKX..." alimentado por clockOffsetMs real, 1600x900 e 390x844 |

## Medidas

| Item | Resultado |
| --- | --- |
| Gráfico em 1600x900 | 1270 x 383 px: mais largo e mais baixo que no fim da entrega anterior (1028 x 502, original cerca de 440 x 180), porque o painel inferior passou de cerca de 72 px para 234 px e a coluna esquerda deixou de existir; recolhendo o painel (barra de 34 px) o gráfico volta a passar de 580 px de altura |
| Gráfico em 1280x720 | 986 x 245 px |
| Painel inferior | 26% da janela por padrão (234 px em 900), recolhe para 34 px, redimensiona de 190 px a 55% |
| `analyzeSmc`, 300 velas, navegador | mediana 0,6 ms, máximo 1,5 ms |
| Sondas de recorte numérico e de sobreposição | zero achados em 1600x900, 1280x720, 1100x700 e 390x844 (depois de corrigir a coluna de preço da lista Ativos em 1280x720, 50 achados) |
| Chamadas ao provedor falso | abrir uma aba = 1 chamada; aba parada 20 s = 0; escolher token = 1 de velas e 1 de sinais; voltar para OKX = 0 |
| Sessão LIVE 2026-10-13 | 80 chamadas ao provedor no total (18 + 62, contadas pelo harness em `/harness/stats` e pelo log de rotas): trades 8x (poll de 30 s da Fita visível), candles 7x, news 6x, price-info 4x, signals 4x, sentiment 14x, kols 2x, vibe 2x, clusters 2x, token-risk 2x, holders 2x, pools 1x, hot-token 3x, search 2x, cluster-chains 1x, chains 2x; clockOffsetMs aprendido ~76,6 s |
| Sondas LIVE | recorte numérico: 0 achados nas superfícies novas (1 truncamento por reticências em texto descritivo do catálogo de capacidades, preexistente); sobreposição: 0 achados de texto (caixas de borda encostam em linhas fora da área visível da lista, separação de glifos maior que 14 px); console: 0 erros de código, apenas 404 ambientais de rotas do backend de trading que o harness não serve (/operator, /jev-read, /system-one); vazamento de credencial: 0 ocorrências de OK-ACCESS, chave, segredo ou passphrase em texto da página, HTML e log de rede |
| Varredura tipográfica LIVE | 0 ponto médio, travessão, meia-risca, NaN, undefined, Infinity ou [object Object] no texto visível da mesa e de /configuracoes |
| Sessão LIVE 2026-10-13 (B3, recaptura) | 54 chamadas ao provedor no total: 44 neste gateway (`/harness/stats` + log de rotas: trades 6x, candles 5x, news 4x, sentiment 4x, vibe 3x, kols 3x, signals 3x+1 supported, hot-token 3x, search 2x, token-risk 2x, clusters 2x, holders 2x, price-info 1x, pools 1x, cluster-chains 1x, chains 1x) + 10 da sonda de formatos vazios do R2; clockOffsetMs aprendido 75,9 s |
| R1 gráfico vazio (B3) | causa real: `.indicators:empty{display:none}` derrubava o item da grade e `.graph` caía na linha `auto` de 26 px; corrigido fixando `.graph` na linha `1fr` (`grid-row: 3`). Canvas medido e pintado em todas as capturas: 1270x404 px com 1546+ amostras não vazias em 1600, 986x266 em 1280, 804x223 em 1100, 366x598 em 390 |
| R3 cabeçalhos (B3) | sonda estendida a `columnheader`/`th`/`dt`/rótulos: 0 células com scrollWidth maior que clientWidth em 1600, 1280, 1100 e 390 nas abas Fita, Liquidez (Janelas + Pools), Holders (cartão) e Ecossistema (Notícias + KOLs); "Variacao %", "Transacoes" e "Importancia" inteiras em 1280x720 |

## O que NÃO foi provado (pendências)

- Efeito do smart money sobre as decisões do Jev: nenhum modelo foi consultado (consulta paga, não autorizada).
- O provedor responde `details: []` para `sentiment/symbol` de WETH e notícias vazias para WETH e BONK: resposta válida e vazia, mostrada na linha neutra (desde a revisão B3); a cobertura por símbolo varia.
