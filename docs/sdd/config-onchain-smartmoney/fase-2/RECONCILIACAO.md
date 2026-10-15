# Reconciliação com a SPEC do instalável (inonu-desktop-v1, revisão r2)

Para cada requisito e tarefa da [SPEC](../../inonu-desktop-v1/SPEC.md) e das [TASKS](../../inonu-desktop-v1/TASKS.md) tocados pelo trabalho já entregue em `config-onchain-smartmoney` (gateway, painel inferior, rotas ECO). Baseline: [baseline-hashes.json](evidence/baseline-hashes.json). Os estados vêm de leitura do código, dos testes e das evidências desta sessão; **não** são o estado oficial da sessão dona (c38db1), que atualiza `TASKS.md`. Os estados do instalável foram lidos de `TASKS.md` e `OWNERSHIP.md` em 2026-10-13 às 07:31 (hora local da máquina); a sessão dona continua editando esses arquivos, então reler antes de usar.

Legenda: `feito` (código e teste existem), `parcial`, `conflito` (duas decisões incompatíveis), `ajustar` (pronto, mas precisa mudar para casar), `não iniciado`, `n/a` (não é desta entrega). A coluna Delta aponta o item de [ADENDO-REV3.md](ADENDO-REV3.md) (`D3-nn`) ou o requisito de [SPEC.md](SPEC.md) (`F2-*`) que resolve.

## 1. Requisitos

| ID | Estado | O que existe (evidência) | Delta |
| --- | --- | --- | --- |
| `API-1` | parcial | Todo acesso passa por `src/onchain-read/` (22 rotas) e a sonda de vazamento ao vivo não achou credencial no texto, no HTML nem no log de rede ([INDEX.md](../evidence/INDEX.md)). Falta a varredura do bundle de produção (`AC-API-1`) | `F2-GOV-2` |
| `API-2` | ajustar | Dois mecanismos: `src/okx-clock.ts` (injetado, `T3.2` verificado) e aprendizagem pelo `Date` dentro do gateway (A-14) | `D3-03` |
| `API-3` | parcial | `src/onchain-read/budget.ts` (teto mensal por camada, ritmo diário), 402 bloqueia a camada por 1 h e 429 abre espera de 30 s (`src/onchain-read/client.ts`). Falta o teto de 15 chamadas por pedido e o corte por dia configurável (`T3.4`) | `F2-DIG-4` |
| `API-4` | feito | Lista de permissão fixa com camada, TTL, validador e normalizador por rota (`src/onchain-read/catalog.ts`, 22 rotas, 181 testes do gateway) | `F2-OCX-12` |
| `API-5` | parcial | Normalizadores existem, mas não há um teste por divergência de `API-5`; divergências novas medidas (A-04, A-17, A-18) | `D3-04`, `F2-OCX-12` |
| `API-6` | n/a | A matriz das 499 páginas é do instalável. Esta sessão tem uma matriz **complementar** dos 174 endpoints da lista do portal: [okx-portal-coverage.md](../okx-portal-coverage.md) | `D3-10` |
| `API-7` | não iniciado | Sem `src/onchain-read/ws.ts`; sem plano pago não há como verificar o canal | n/a |
| `API-8` | não iniciado | Nenhuma medição de lote nem de camada foi feita; o gateway conta `assumido` como Basic (A-07) | `D3-05`, `F2-MED-1` e `F2-MED-2` |
| `API-9` | parcial | 124 chamadas de sonda arquivadas ([probe-2026-10-12.json](evidence/probe-2026-10-12.json)), 14 chamadas na fumaça de B1 e as sessões LIVE de interface ([live-onchainos-20261012.md](../evidence/live-onchainos-20261012.md)). Falta rotular cada família com `origin: real_probe` no formato de `evidence/` do instalável | `D3-06` |
| `API-10` | feito | Nenhum caminho de pagamento; 402 vira `provider_payment_required` e bloqueia a camada (`src/onchain-read/client.ts`, testes de `client.test.ts`) | n/a |
| `API-11` | ajustar | Pacing de 1,1 s e espera de 30 s em 429. O recuo exponencial em 50011 não existe. O portal publica 3 e 5 req/s (A-03) | `D3-01`, `F2-MED-3` |
| `API-12` | parcial | Código `clock_skew` acrescentado e `unsupported_chain` mapeado de 50038. O instalável implementou os dois casos como códigos do **cliente** (`backend_stale`, `origin_denied`), não do envelope; os nomes `backend_sem_rota` e `origem_negada` de `API-12` não existem no código | `D3-02` |
| `API-13` | n/a | Leitura do portal exige a tela do usuário; nada arquivado | n/a |
| `API-14` | não iniciado | Estado degradado após os 60 dias da Trade API não existe; a cotação ainda não está no gateway | `F2-OCX-9` |
| `SRC-1` | parcial | A sessão do instalável já separa 404 e 403 de `schema` no cliente web: `backend_stale` e `origin_denied` (`web/src/lib/onchain/client.ts:354` e `web/src/lib/onchain/client.ts:355`), com texto próprio em `onchainErrorText` (`T4.1`, "parcial: erros distintos verificados"). Os nomes são do cliente, não do envelope | `D3-02` |
| `SRC-2` | parcial | Vazio válido deixou de ser `schema` (A-05); falta registrar rota e campo no diagnóstico | `D3-02` |
| `SRC-3` | não verificado | `T4.1` declara só os erros distintos; o autoteste de boot e o banner não foram confirmados | `T4.1` |
| `SRC-4` | parcial | Guarda de deriva entre normalizadores e parsers da web (`src/onchain-read/web-fixture-drift.test.ts`, `web/src/lib/test-fixtures/onchain-normalized.json`): prova a forma, **não** roda contra servidor real | `F2-GOV-4` |
| `SRC-5` | parcial | `search` e `hot-token` responderam ao vivo (fumaça de B1 e sessões LIVE); falta o teste por símbolo e endereço em 3 redes | `T4.7` |
| `DOC-1` | feito | Cada aba on-chain mostra idade, origem, camada e orçamento (`OnchainHead`) ou o motivo; capturas nos 4 tamanhos ([INDEX.md](../evidence/INDEX.md)) | n/a |
| `DOC-2` | feito | Smart money, Traders e Holders leem `signals`, `leaderboard`, `holders`, `top-traders` com os TTL do catálogo | n/a |
| `DOC-3` | conflito | A SPEC remove a aba Ecossistema; esta sessão **acrescentou** a seção "Noticias e sentimento" nela (`OnchainDeskTabs.tsx`, `EcoNewsSection`) | `D3-08` |
| `DOC-4` | ajustar | Fita, Liquidez, Holders (com o cartão Estrutura e risco) e Ecossistema do painel de 9 abas receberam superfícies on-chain; a SPEC quer 5 abas | `D3-08` |
| `CHN-1` | parcial | Redes vêm de `market/supported/chain` (54 redes ao vivo) com chips e "Mais"; faltam busca textual e grupos | `T4.2` |
| `CHN-2` | não iniciado | `143`, `4663` e `5042` ainda não estão em `token-identity.ts` | `T3.6` |
| `CHN-3` | parcial | Descoberta por família feita para `chains`, `signal-chains`, `leaderboard-chains` e `cluster-chains`; faltam portfólio, balance e explorer | `F2-OCX-8` |
| `ICO-1`, `ICO-3`, `ICO-4` | n/a (c38db1) | Ícones de moeda por símbolo já existem (`src/inonu/icons.ts`; `T3.5` e `T4.3` estão "parcial") | n/a |
| `ICO-2` | conflito | O catálogo descarta URLs e os testes afirmam "sem http" (A-24); a SPEC manda repassar logos de hosts permitidos. O proxy de ícones por símbolo existe; falta o encaminhamento de `tokenLogoUrl` e `chainLogoUrl` pelo gateway, que o próprio `T3.5` pede à sessão dona do catálogo (esta) | `D3-07` |
| `DAT-1` | parcial | Fixtures só em testes e em harness rotulado `synthetic_fixture`; não existe o teste de pureza do bundle (`T10.1`) | `F2-GOV-4` |
| `DAT-2` | parcial | Idade e origem por bloco (`meta.ageMs`, `OnchainHead`); falta `origin` por campo no modelo da interface | `F2-DIG-2` |
| `ASK-10` | conflito | Telas novas dizem "Jev" para o assistente (A-23) | `D3-09` |
| `WAL-4` | não iniciado | `balance/*`, `post-transaction/*` e `portfolio/*` responderam OK na sonda com endereço público (A-01), sem rota no gateway | `T3.12` |
| `WAL-5` | não iniciado | `aggregator/quote` responde ao vivo com os campos pedidos (A-10); sem rota no gateway | `F2-OCX-9` |

## 2. Tarefas

| Tarefa | Estado oficial (TASKS em 2026-10-13) | Estado do que esta sessão entregou | Delta |
| --- | --- | --- | --- |
| `T3.2` | verificado | gateway aprende o desvio por `Date` (A-14) | `D3-03` |
| `T3.3` | elegível | normalizadores no catálogo (22), sem teste por divergência de `API-5` nem arquivos em `normalize/` | `D3-11` |
| `T3.4` | aguarda `T3.3` | orçamento mensal e ritmo diário existem; falta o teto por pedido | `F2-DIG-4` |
| `T3.5` | parcial: ícones de moeda verificados | falta o gateway encaminhar logos de token e de rede (A-24) | `D3-07` |
| `T3.6` | aguarda `T3.3` | parcial (ver `CHN-1` a `CHN-3`) | `D3-11` |
| `T3.8` | aguarda `T3.4` | não iniciado | `F2-MED-1` a `F2-MED-6` |
| `T3.9` | aguarda `T3.3` | parcial: `search`, `hot-token`, `price-info`, `top-liquidity`; `basic-info` pronto offline em 2026-10-13 (`/onchain/token-info`), sem fumaça ao vivo | `F2-OCX-6` |
| `T3.10` | aguarda `T3.3` | parcial: `advanced-info`, `cluster/supported`, `cluster/overview`; `cluster/top-holders` pronto offline em 2026-10-13, sem fumaça ao vivo; falta `cluster/list` | `F2-OCX-5` |
| `T3.11` | aguarda `T3.3` | parcial: `signal/list`, `leaderboard/list`, `holder`, `top-trader`; falta `address-tracker/trades` (A-08); a saída interna com endereços completos existe desde 2026-10-13 (A-26) | `F2-OCX-11` |
| `T3.12` | aguarda `T3.3` | não iniciado | `D3-11` |
| `T3.13` | aguarda `T3.3` | feito, e a mais: `top-kols`, `news` e `sentiment/ranking` | `D3-11` |
| `T3.14` | aguarda `T3.3` | não iniciado | `F2-OCX-8` |
| `T3.15` | aguarda `T3.3` | feito: `trades` (agora com `tagFilter`, A-20) e `candles` | `F2-OCX-13` |
| `T4.1` | parcial: erros distintos verificados | desta sessão só `clock_skew` foi acrescentado; `backend_stale` e `origin_denied` são da sessão do instalável | `D3-02` |
| `T4.2` | observado ao vivo | seletor dinâmico por `market/supported/chain` (feito nesta sessão) | n/a |
| `T4.4` | aguarda `T3.3` | feito para Smart money, Traders e Holders; capturas LIVE | `D3-11` |
| `T4.5` | parcial | Ecossistema ganhou notícias e sentimento | `D3-08` |
| `T4.6` | aguarda `T4.4` | não iniciado | `D3-08` |
| `T4.7` | aguarda `T4.1` | busca já funciona ao vivo; falta o teste e o relatório | `D3-11` |
| `T5.6` | aguarda `T3.3` | desbloqueável: `trades`, `price-info` e `hot-token` existem no gateway | `D3-11` |
| `T6.2`, `T6.3` | verificado | consomem linhas de `signal/list` e `top-trader`; rótulo de concentração e escalas precisam de adaptador (A-18, A-19) | `F2-DIG-2`, `F2-DIG-3` |
| `T7.1`, `T7.2` | verificado | o `BriefInput` não tem chave `onchain` (A-25); o digest on-chain entra nas chaves existentes | `F2-DIG-2` |

## 3. Rotas entregues, por família do instalável

| Família (`T3.x`) | Rota local | Caminho do provedor | Camada no gateway | Tela |
| --- | --- | --- | --- | --- |
| Token (`T3.9`) | `/onchain/search`, `/onchain/hot-tokens`, `/onchain/price-info`, `/onchain/pools` | `token/search`, `token/hot-token`, `market/price-info`, `token/top-liquidity` | Basic, Basic, Premium, Basic | seletor de ativos, Liquidez |
| Risco e clusters (`T3.10`) | `/onchain/token-risk`, `/onchain/cluster-chains`, `/onchain/clusters` | `token/advanced-info`, `cluster/supported/chain`, `cluster/overview` | Premium, Free, Premium | Holders (cartão Estrutura e risco) |
| Smart money (`T3.11`) | `/onchain/signals`, `/onchain/leaderboard`, `/onchain/holders`, `/onchain/top-traders` (mais `signal-chains` e `leaderboard-chains`) | `signal/list`, `leaderboard/list`, `token/holder`, `token/top-trader` | Premium (as duas `-chains` são Free) | Smart money, Traders, Holders, marcas no gráfico |
| Social (`T3.13`) | `/onchain/sentiment`, `/onchain/vibe`, `/onchain/kols`, `/onchain/news`, `/onchain/sentiment-ranking` | `social/sentiment/symbol`, `social/vibe/timeline`, `social/vibe/top-kols`, `social/news/*`, `social/sentiment/ranking` | Basic (assumido, A-07) | Ecossistema |
| Fluxo (`T3.15`) | `/onchain/trades`, `/onchain/candles`, `/onchain/price` | `market/trades`, `market/candles`, `market/price` | Basic | Fita, gráfico on-chain |
| Redes | `/onchain/chains` | `market/supported/chain` | Free | seletor de redes |

## 4. Arquivos desta sessão em zona quente (para o integrador do instalável)

A [OWNERSHIP.md](../../inonu-desktop-v1/OWNERSHIP.md) trata `web/src/components/Desk/**`, `web/src/lib/mesa/**` e `web/src/lib/onchain/**` como zona Z8 (só integrador, de forma aditiva). Os arquivos abaixo foram criados ou alterados por esta sessão e já estão no working tree. A sessão do instalável também editou `web/src/lib/onchain/client.ts`, `web/src/lib/onchain/useOnchainResource.ts`, `web/src/lib/mesa/onchain-rows.ts`, `web/src/components/Settings/SettingsView.tsx`, `web/src/components/Desk/MesaView.tsx` e `web/src/lib/mesa/dock.ts` ([OWNERSHIP.md](../../inonu-desktop-v1/OWNERSHIP.md) seção 5); nenhuma das edições dela foi revista aqui (A-27):

| Arquivo | O que tem |
| --- | --- |
| `web/src/components/Desk/Dock/OnchainDeskTabs.tsx` (novo) | Fita on-chain, Liquidez on-chain, `EcoNewsSection` |
| `web/src/components/Desk/Dock/OnchainTabs.tsx` (novo) | Smart money, Traders, Holders, `RiskCard`, `OnchainObjBody` |
| `web/src/components/Desk/MesaView.tsx` | gating "na tela", `ocShared`, `ecoTop` |
| `web/src/components/Desk/MesaView.module.css` | `grid-row: 3` em `.graph` (A-06) |
| `web/src/lib/onchain/client.ts`, `useOnchainResource.ts` | cliente do gateway e política de chamadas (`pollIntervalMs`, `shouldPollNow`) |
| `web/src/lib/mesa/onchain-rows.ts`, `onchain-desk-rows.ts` | modelos de linha e textos de erro |
| `web/src/components/Settings/SettingsView.tsx` | linha do relógio e `TEST_TEXT.clock_skew` |
| `src/onchain-read/**`, `src/settings/**`, `scripts/make-onchain-web-fixtures.ts` | gateway, configurações, guarda de deriva |

## 5. Conflitos abertos (resumo)

| Conflito | Lado A | Lado B | Proposta |
| --- | --- | --- | --- |
| Logos | catálogo descarta URLs (A-24) | `ICO-2` repassa de hosts permitidos | seguir `ICO-2` e ajustar os testes do gateway (`D3-07`) |
| Nome do assistente | telas novas dizem "Jev" | `ASK-10` e D-U1 dizem "Inonu" | trocar na varredura de `T7.9` (`D3-09`) |
| Abas | 9 abas com superfícies on-chain | 5 abas e Ecossistema removido | mapa de realocação (`D3-08`) |
| Relógio | aprendizagem por `Date` no gateway | `okx-clock` injetado | desvio bruto e aviso no Doctor; gateway só repassa quando não injetado (`D3-03`) |
| Rótulo de concentração | gateway `Low`, `Medium`, `High` | trilha `baixa`, `media`, `alta` | adaptador explícito no digest (`F2-DIG-2`) |
| Ritmo | 1,1 s | portal 3 e 5 req/s | manter 1,1 s e medir (`D3-01`, `F2-MED-3`) |
