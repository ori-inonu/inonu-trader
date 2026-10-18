# Mapa das APIs do OnchainOS: o que o agente usa, o que sobra e onde pôr dado novo para o Jev (2026-10-15)

Pedido do dono no chat: aproveitar ao máximo os recursos de API que o plano gratuito comporta (por dia e por mês) no ecossistema do OnchainOS e da OKX Wallet, para melhorar a inteligência dos dados que chegam ao Jev. Este mapa é um PLANO feito por leitura do código e da documentação; nenhuma chamada nova foi feita, nenhum código do caminho vivo mudou, nada foi ligado ou reiniciado e nenhum ganho foi medido. Cotas e folgas: `VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md` (Basic quase no teto, Premium com cerca de 5100 chamadas por dia de folga).

## 1. O que o agente chama hoje (por leitura do código)

| Rota | Faixa | Quem chama | Para quê |
| --- | --- | --- | --- |
| `hot-tokens` | Basic | scan do ecossistema (`source-ecosystem.ts`) | lista quente de até 100 por rede |
| `signals` | Premium | scan do ecossistema | compras das carteiras rastreadas |
| `token-risk` | Premium | scan do ecossistema e `live.ts` | risco, detentores, desenvolvedor, bundle |
| `candles` (5m e 1H) | Basic | `live.ts` | momento e esticamento da entrada |
| `price` | Basic | `wire.ts` | preço do que a carteira mantém |
| `price-info` | Premium | `live.ts` | informações de preço multi-janela |

As demais rotas do catálogo só aparecem no plano do clique "Pedir ao Inonu" (`onchain-plan.ts`, até 15 chamadas por clique) ou em nenhum lugar do agente.

## 2. O que existe no gateway e o agente ainda não usa (todas já normalizadas, com cache mínimo no catálogo)

| Rota | Faixa | Cache mínimo | O que a documentação do provedor diz que traz (página de custos e catálogo) | Valor possível para o Jev |
| --- | --- | --- | --- | --- |
| `top-traders` | Premium | n/d | Portfolio: top trader | quem lucrou nesse token e se segue segurando |
| `holders` | Premium | n/d | Market: token holders | distribuição e comportamento dos detentores |
| `clusters` | Premium | 15 min | BubbleMap: cluster overview e list | concentração por grupos de carteiras ligadas |
| `cluster-top-holders` | Premium | 15 min | BubbleMap: top holders | maiores detentores dentro dos clusters |
| `leaderboard` | Premium | 30 min | Leaderboard: list | carteiras de melhor desempenho |
| `pools` | Basic | 10 min | Market: top liquidity | profundidade de liquidez por pool |
| `trades` | Basic | 15 s | Market: trades | fluxo recente comprador e vendedor |
| `sentiment`, `vibe`, `kols`, `news` | Basic | 5 a 10 min | social e notícias | pouco ligado à decisão de preço; o dono já não quer notícias no produto |

Premium sem uso ainda no agente: 5 rotas. A faixa Basic está perto do teto (ver o documento de cotas), então rotas Basic novas só entram trocando outras ou com cache mais longo.

## 3. Conta de custo (plano, não medida)

Premium tem cerca de 5100 chamadas por dia de folga no resto de outubro. Para K candidatos atualizados no ritmo de cache de cada rota (chamadas por dia = K × 86400 / cache em segundos):

| Rota Premium | Cache assumido | K = 3 | K = 5 |
| --- | --- | --- | --- |
| `clusters` | 15 min | 288 | 480 |
| `cluster-top-holders` | 15 min | 288 | 480 |
| `top-traders` | 15 min (assumido, n/d no catálogo) | 288 | 480 |
| `holders` | 15 min (assumido) | 288 | 480 |
| `price-info` a cada 5 min (hoje já usada) | 5 min | 864 | 1440 |
| Soma das quatro novas | | 1152 | 1920 |

Com K = 5 as quatro rotas novas somam 1920 por dia. Somadas ao uso Premium de hoje (cerca de 972 por dia) dão 2892 por dia, ou cerca de 89,7 mil por mês, abaixo do teto de 100 mil. Acrescentar também o `price-info` a cada 5 minutos para 5 candidatos (mais 1440 por dia) leva a 4332 por dia: cabe no resto de outubro (folga de 6100 por dia), mas num mês cheio dá cerca de 134 mil e estoura o teto. Os caches de 15 minutos de `top-traders` e `holders` são suposição minha.

## 4. Desenho proposto (para qualificação, nada no caminho vivo agora)

1. Enriquecimento DIRECIONADO: só para as posições abertas e até K candidatos (os que o Jev preferiu mais nos últimos olhares ou que tiveram evento material), nunca para os 100 do scan.
2. Só Premium nesta etapa; Basic fica plano. Cada leitura carrega idade e origem (cache ou rede) no Brief; cache não rejuvenesce o fato.
3. Um orçamento diário por rota, derivado da folga e da guarda `hotWithinQuota`; esgotado, o dado fica `null` com motivo, nunca zero.
4. Como os novos fatos entram no Brief muda o `questionsDigest` e a versão da decisão: é uma geração nova (Codex), só depois de um contador de uso por rota e da leitura da cota real do modelo.
5. Teste em sombra primeiro: medir se algum novo fato muda a resposta do Jev ou separa as compras que subiram das que caíram, antes de pagar o custo de tokens extra por Brief maior.

## 5. O que este mapa NÃO faz

Não chama a API, não usa credencial, não eleva consultas por dia, não liga o pulso, não promete lucro. Os campos que o provedor entrega em cada rota não foram verificados chamando a rota: o valor possível da coluna da tabela vem dos títulos da documentação, não de uma resposta real. Estado: plano por leitura; nada carregado, nada ao vivo, ganho medido nenhum.
