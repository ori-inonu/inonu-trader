# Pesquisa: APIs e inteligência por ciclo do JEV System One

Data da auditoria: 2026-10-16. Escopo da fase inicial: estado de código/docs, APIs e lacunas de quota; sem autenticação externa, assinatura, transmissão, trade ou leitura de segredo. GETs loopback seguros foram verificados separadamente e sanitizados em [inventory.md](inventory.md). Esta delimitação não abrange todo o trabalho posterior: houve uma tentativa local posterior de `POST /agent/wallet` com erro de rede, sem determinar se o serviço recebeu a requisição ou se houve mudança de estado; o registro histórico está em [status.md](status.md) e [observations.md](observations.md). Inventário detalhado de superfícies: nesse arquivo.

## Conclusão executiva

`web/src/app/page.tsx` seleciona a raiz AgentView conforme inspeção do código; a cadeia `AgentView` → `HudView`/`HudGate` e o uso de `readOnly` em development são inferidos da inspeção, não de confirmação do usuário. Isso não prova build/deploy. Não classificar AgentScreen/Deck/Mesa como ativos sem import chain desde a raiz.

Oportunidade demonstrada: deixar inteligíveis os dados que já entram no ciclo, preservando proveniência/frescor existentes e distinguindo stale/ausente de zero; priorizar cache já implementado antes de novas APIs. Não há evidência nesta auditoria que justifique novo enrichment, telemetria ou circuit breakers.

### Achados prioritários e evidência

1. **Cotas e uso do agente não são medidos**: `docs/sdd/agente-autonomo/MAPA-DE-APIS-20261015.md` descreve hot-tokens/signals/token-risk/candles/price/price-info e estima Basic “quase no teto” e Premium “~5.1k chamadas/dia de folga” no restante do mês. O próprio documento identifica cache 15m para holders/top-traders como hipótese e apresenta contas projetadas. **Não é telemetria, quota oficial, nem prova do plano real.**
2. **Transporte local tem proteções, mas não equivalem a quota contratada**: `src/onchainos/http.ts` usa credenciais HMAC, rede opt-in, token bucket configurável (padrão 1 req/s, burst 1), contadores por tier e retry limitado em 429/5xx. Precisa separar throttling do cliente de limites OKX endpoint/account. Não há evidência de consumo, 429 ou latência observados.
3. **Frescor dos dados é a oportunidade demonstrada**: `src/agent/live.ts` injeta contexto, saldo e candles no ciclo; saldo managed permite até três tentativas com espera de 2s. Cache e metadados de gateway já existem. Melhoria aderente ao pedido é priorizar dados existentes com proveniência/idade e distinguir stale/ausente de zero; não se recomenda ampliar chamadas, telemetry ou circuit breakers sem gap de runtime demonstrado.
4. **SaaS, wallet SDK e Agentic Wallet não são intercambiáveis**: API REST usa API key/secret/passphrase e assinatura; Agentic Wallet usa sessão local/CLI e TEE (conforme docs OKX), enquanto SDK/browser wallet é assinatura pelo provider do usuário. Código presente em `src/agent/cli.ts`, `agent-wallet.ts`, `src/okx-wallet/*`, `src/onchainos/*` prova rotas de implementação, não que estejam rodando. Nenhum trade foi usado para prova.
5. **Limite oficial é endpoint/tier específico**: documentação oficial [API access and usage](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage), consultada 2026-10-16, descreve assinatura e separa Agentic Wallet de Open API, mas não publica teto universal para cada rota/CLI. Fonte oficial DEX [Trade API fee / tiers](https://web3.okx.com/es-es/onchainos/dev-docs/trade/api-fee), aberta diretamente 2026-10-16: Trial 1 RPS padrão, até 5 após revisão; Start-up 2-50 RPS; Enterprise custom. Aplicabilidade restrita a DEX/API e tier descritos; não generalizar a wallet CLI, cada endpoint, Basic/Premium ou RPC. Cotas exatas de Agentic Wallet/`/priapi`: desconhecidas.
6. **Provedores externos**: fontes efetivas e docs consultados constam em `inventory.md`; TypeSafe model RPM/quota e Kuru SDK/API quota permanecem desconhecidos. RPC público Monad `rpc.monad.xyz`: 25 RPS e lote máximo 100; X Layer `rpc.xlayer.tech`: 100 req/s/IP (documentação oficial, URLs e data em `inventory.md`). Nenhuma conta/tier real ou consumo medido foi consultado.

## Superfícies e escopo

A tabela completa em `inventory.md` discrimina entrypoints e consumidores. `AgentView` é raiz UI identificada em código; outras superfícies (real console, reports, desktop, standalone System One/analytics, CLI) são entrypoints/utilitários separados e não devem ser chamados de UI/agente ativo. Snapshot diagnóstico inicial: GET 3001 respondeu 200 com título sanitizado; serviço 3000 não foi observado disponível e o status da API era desconhecido nesse momento. Esse resultado não descreve o trabalho posterior: `observations.md` e `status.md` registram handler GET, Chromium real em escopo isolado e leituras read-only, sem evidência de aplicação Next completa implantada, deploy ou estado live.


## Registros de rota: contagens distintas

Leitura do source atual: `src/onchain-read/catalog.ts` e `EXTRA_ENDPOINTS` compõem 37 rotas catalogadas no gateway local. `src/onchain-read/http.ts` recebe GET (além de OPTIONS preflight) para as 37 rotas; na chamada upstream, são 33 GET e 4 POST. `/onchain/status` e `/onchain/budget` são endpoints locais adicionais e não entram nessa contagem.

O `LIST` importado de `src/onchainos/endpoints.ts` contém 44 registros (35 OnchainOS +9 public V5), distribuídos em 38 GET e 6 POST. Famílias registradas: market-price 7, market-token 12, signals 4, social 3, gateway 2, defi 7, public-okx 9. Comparação por caminho exato: 14 das 37 rotas locais não têm match neste registry; isso não indica ausência de documentação oficial em outras fontes.

Os números representam inventários distintos; não somar 37+44 nem descrever nenhum deles como total de APIs do projeto/ecossistema. Presença em registry não prova caller/uso ativo.

## Matriz de autenticação e capacidades OKX

| Caminho | Leitura | Gestão/assinatura | Estado JEV / limitação |
|---|---|---|---|
| Open API OnchainOS REST | market, token, signals e demais endpoints do catálogo | API key, secret, passphrase; HMAC-SHA256/Base64; chamada assinada do servidor | transporte e gateway existem em código; integração por endpoint conforme callsites; limite por endpoint/plano real não comprovado |
| OKX public v5 | dados públicos de derivativos/mercado conforme cliente `public-okx.ts` | sem assinatura onde API pública | módulo existe; não confundir com execução exchange |
| Agentic Wallet | status/saldo e leituras encaminhadas via ferramenta | CLI local com login/sessão; TEE protege chave de acordo com documentação; `swap execute` é caminho sensível | suporte em código; sem runtime observado; nenhum teste externo nesta auditoria |
| Wallet SDK/browser extension | leitura e assinatura com permissão/provider do usuário, conforme SDK | assinatura interativa separada | não presumir que o CLI/REST implementa esse SDK |
| OKX wallet-family DEX REST adapter | `src/okx-wallet/trade.ts` chama Web3 DEX para quote/build/approve/cross-chain/DeFi, assina apenas requisições HTTP, não transações nem ordens CEX | transação construída precisa assinatura externa/CLI em superfície distinta | nenhuma execução; Agentic CLI `swap execute` é caminho separado |

Documentos do projeto que detalham as funções do Agentic Wallet/CLI: `docs/sdd/agente-autonomo/SPEC.md` (histórico e requisitos; seus estados não equivalem a runtime presente), `MAPA-DE-APIS-20261015.md`, `VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md`, `capacidades-okx.md`. Usa-se aqui apenas o necessário; não se reitera conteúdo histórico como prova.

## Prioridades comprovadas, sem novas chamadas

1. Usar o dado que já foi lido no ciclo: preservar sua fonte/origem e frescor, sem converter `null`, stale ou falha em zero.
2. Reaproveitar cache/coalescing e orçamento local já implementados em `src/onchain-read/gateway.ts`, sem rejuvenescimento do timestamp. Não adicionar enrichment Premium sem benefício/uso medido; não há dado nesta auditoria que justifique novas telemetrias, circuit breakers ou política de carga.
3. O mapa `MAPA-DE-APIS-20261015.md` é apenas pressão documental histórica: valores de Basic/Premium e cadências hipotéticas não são observação runtime, cota contratada nem limites oficiais.


## Método, proveniência e limites

- **Confirmado em código**: arquivos e comportamentos citados no inventário lidos nesta auditoria.
- **Documentado externamente**: páginas oficiais OKX ligadas abaixo; vigência consultada na data acima.
- **Documentado internamente**: SDD/mapas históricos; útil para requisitos/propostas, não estado runtime.
**Runtime do snapshot diagnóstico inicial**: web loopback 3001 respondeu HTTP 200 e mostrou título; status loopback 3000 sem resposta utilizável. `/agent/status` e `/onchain/budget` não foram consultados porque os handlers podem, respectivamente, iniciar refresh CLI e persistir rolagem de mês. Isso é evidência daquela fase, não estado global posterior: [observations.md](observations.md) e [status.md](status.md) registram handler GET, Chromium real em escopo isolado e leituras read-only posteriores. Nenhuma prova demonstra Next completo implantado, deploy ou estado live.

## Evidência de superfície Agentic Wallet (code vs official product), 2026-10-16

- **Confirmado em código**: `src/agent/agent-wallet.ts` pins OnchainOS CLI v4.6.4 release and SHA256 assets, performs install/login/address parsing through injected CLI runner; comments state output formats not observed in a real run. `src/agent/cli.ts` allowlists `wallet status|balance|addresses|history|login`, `swap quote`, `swap execute`; blocks all other commands, and treats requested confirmation as refusal. Thus the product integration is not absent: there is code for a narrow Agentic Wallet subset. It is not evidence a binary is installed, wallet connected, runtime works, or transaction occurred.
- **Confirmado em código**: `swap execute` exists in the command allowlist and source comments identify it as the way agent can move funds. Code describes quote-first risk checks, bounded args, verified binary, minimal child environment and no-confirmation refusal. This must not be described as read-only or “no trade capability”; audit did not invoke it. External CLI may have its own interaction semantics; never infer actual sends without runtime evidence.
- **Documentado externamente**: official [Install Agentic Wallet](https://web3.okx.com/fi/onchainos/dev-docs/home/install-your-agentic-wallet) says wallet generated/keys stored within TEE and supports email/Google/Apple login; official [Agentic Wallet skills](https://web3.okx.com/pt/onchainos/dev-docs/wallet/agentic-wallet-skills) enumerates wallet login/management, portfolio, security scans, transfer, transaction history and composite workflows. That upstream feature breadth is not the app’s exposed CLI allowlist.
- **Não verificado**: no API-specific RPS documented on those official wallet skills/install pages; no wallet runtime, user login, signing, transaction transmission or live trade performed.

## Rate limit reconciliation and recommendation

`src/onchainos/http.ts` local pacing (1 req/s, burst 1) and retry behavior are application policy, not official provider entitlement. Catalog Free/Basic/Premium is an endpoint access/tier label, not a published universal RPS. Official [DEX API fee tiers](https://web3.okx.com/es-es/onchainos/dev-docs/trade/api-fee) was opened directly: Trial has default 1 RPS, review may allow 5, 60-day term; Start-up 2-50 RPS and Enterprise customized. These are partner DEX tiers and cannot be applied to wallet API, public market API, Basic/Premium catalog, or CLI. Public market endpoint limits are separate official V5 per-path limits cited in `inventory.md`.

Priority justified by current implementation: the agent already reads sources; do not add premium enrichment merely for “intelligence”. When presenting existing facts, retain source identity, source timestamp/freshness and cache age/null/unavailable status, and consolidate repeated reads using existing gateway cache. This prioritizes trustworthy and fast evidence without assuming vendor quotas or adding calls. Historical MAPA pressures are estimates only, not measured use or official rate limits. No new telemetry/circuit-breaker work is recommended absent a demonstrated runtime failure/latency gap.

### Fontes externas oficiais

- OKX OnchainOS: [API access and usage](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage): autenticação Agentic Wallet vs Open API, headers, HMAC, assinatura timestamp, timestamp no máximo 30s divergente conforme página. A página não promete quota universal de endpoint. Consultada 2026-10-16.
- OKX OnchainOS: [Trade API fee / tiers](https://web3.okx.com/es-es/onchainos/dev-docs/trade/api-fee): tiers/RPS Trial/Start-up/Enterprise no escopo DEX; não extrapolar a outros produtos. Aberta diretamente 2026-10-16; conta real não verificada.

