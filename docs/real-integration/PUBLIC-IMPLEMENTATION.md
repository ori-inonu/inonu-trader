# G12 — observação pública OKX Exchange v5

Data: 2026-10-11. Entrega isolada em `C:/Users/gabri/.codex/tmp/okx-real-ui-01a12b5f`. Decisão de escopo: `e822174b-190d-4cde-9484-63081ebc6ab3`, `isolated_leaf`. Harness revision 6. O integrador é o único responsável por runtime, worker, rotas, página, configuração e revisão independente.

## Escopo e critérios preservados

Esta entrega observa exclusivamente `BTC-USDT-SWAP` em três endpoints públicos da OKX Exchange. A origem é `okx-public-v5`. Ela contribui para a matriz G12, sem certificar G05, G10, acesso OnchainOS, carteira, saldo, inventário, oportunidade financeira ou execução.

Fontes imutáveis lidas:

| Arquivo | SHA-256 |
| --- | --- |
| `INSTRUCAO-DO-OBJETIVO.md` | `CFA90CAC735E9A838A0C4BC593276C83757905E7C5FEDCD2414E499B1DAD9E08` |
| `EXECUTION-SPEC.md` | `EEB6AB8D9E4ADF990600A8806BCEAEB7774A5EEFE1AE3BBE7DABA70E590290EF` |
| `web/AGENTS.md` | `EC1B6E023814AE1A510B02EA62229E5EB035D75E39E3335D5EA7F5CE5654D567` |

Foram consultados TDD, `web/AGENTS.md`, Next 16.3.4 (`use-client` e Server/Client Components), a SPEC local `OKX-ONCHAINOS-DADOS-SPEC.md` seção 9 e a [documentação oficial OKX v5](https://app.okx.com/docs-v5/en/). A documentação distingue `current_period`, o legado `next_period` descontinuado, `fundingTime`, `nextFundingTime` e os ciclos associados a `settState`. Mark e funding mantêm timestamps da fonte. Nenhuma taxa é convertida em APR ou retorno realizado.

## Contrato do módulo

`createPublicMarket({ http?: GetPort, now?: () => number }).read()` retorna diretamente `PublicMarketSnapshot`:

```text
source: okx-public-v5
mode: real | unverified
status: ready | blocked | error
observedAtMs, expiresAtMs
instrument: InstrumentRow | null
funding: FundingRateRow | null
mark: MarkPriceRow | null
capability: id=funding.public-btc, family=funding,
            documented, implemented, exercisedReal, integrated,
            financiallyQualified, status, reason, nextRequirement
dependencies: string[]
requests: { method: GET, endpoint, httpStatus, code,
            requestedAtMs, receivedAtMs }[]
```

O módulo reutiliza `createPublicOkxHttp` e `createPublicOkxClient` de `src/onchainos/public-okx.ts`, sem alterar esse arquivo. Defaults de produção: `globalThis.fetch`, origem OKX pública existente, network habilitada apenas para os caminhos públicos permitidos pelo cliente, timeout de 8 segundos por pedido, zero retries, um pedido por segundo, burst um e resposta limitada a 65.536 caracteres. Cada leitura solicita sequencialmente:

1. `GET /api/v5/public/instruments?instType=SWAP&instId=BTC-USDT-SWAP`
2. `GET /api/v5/public/funding-rate?instId=BTC-USDT-SWAP`
3. `GET /api/v5/public/mark-price?instType=SWAP&instId=BTC-USDT-SWAP`

Decimais são strings exatas; ausências ou dados inválidos permanecem `null`. O instrumento deve ser SWAP linear ativo, BTC como moeda do contrato e USDT como liquidação, com valor contratual conhecido. O método de funding, taxa e instante de liquidação precisam ser conhecidos. TTL é 60 segundos, limitado pelo menor timestamp de funding/mark e pela coleta local. Timestamp ausente ou mais de 5 segundos à frente do relógio local bloqueia e expira a amostra. Não há relaxamento automático por desvio de relógio.

HTTP injetado nunca estabelece `exercisedReal`, mesmo quando retorna `ready`. Em produção, três respostas públicas bem sucedidas e validadas estabelecem proveniência real independentemente de um hold por frescor/instrumento. `integrated` permanece `false` nesta camada: o integrador registra a integração efetiva. `financiallyQualified` permanece `false`. Falhas rendem dados `null`, dependências de texto fixo e receipts limitados; mensagens, URLs completas, headers e corpos brutos do provedor não entram na saída.

## Contrato da tela

`<PublicMarket apiBase={API_URL} />` lê `GET {apiBase}/api/real/public-market`. A resposta deve ser um snapshot direto ou `null` durante aquecimento do worker. Não há wrapper adicional. O endpoint e o ciclo automático pertencem ao integrador.

A tela consulta imediatamente e a cada 5 segundos, sem sobrepor pedidos. Timeout local de 8 segundos, `AbortController`, abort ao desmontar/trocar origem, cancelamento dos timers e proteção contra resposta tardia. Repetir/atualizar consulta apenas o endpoint GET local. Requests omitem credenciais do navegador e referrer. A resposta tem validação estrutural e limites antes de renderizar. Nenhuma identidade da carteira é usada ou enviada.

O componente mostra fonte pública, receipt real ou não verificado, UTC, TTL, hold e próxima dependência. Dados vencidos ficam desconhecidos. A previsão corrente de funding é separada da taxa de liquidação anterior (`settled`) ou corrente (`processing`). `nextFundingRate` é identificado como legado descontinuado. Saldo, inventário, custos da conta e PnL são desconhecidos. A matriz apresenta estados separados de documentação, implementação, exercício real, integração e elegibilidade financeira.

CSS usa grids com `minmax(0, 1fr)`, quebra de texto/decimais, uma coluna abaixo de 760 px e métricas em uma coluna abaixo de 420 px. Botões e summary têm alvo de 44 px e foco visível; motion reduzido desabilita animações/transições. Qualificação visual/teclado nas dimensões 1440×900, 390×844 e 360×800 e lifecycle no navegador depende da integração e revisão independente do root; SSR e typecheck não a certificam.

## Evidências

TDD foi realizado em ciclos verticais nos seams autorizados de leitura pública HTTP e renderização pública. Reds observados: módulo ausente; marcação indevida de dado vencido como ready; instrumento inverso/preopen aceito; `next_period` aceito; decimal/instante ausente aceito; origem OnchainOS relabelled; componente ausente. Cada comportamento recebeu implementação e execução green antes do seguinte. Regressões finais adicionais verificam falha HTTP sanitizada e valores vencidos ocultos com dependência de relógio visível.

Última verificação local, via RTK/Headroom adapter (Bun pass-through):

| Comando final | Resultado |
| --- | --- |
| `bun --no-env-file test src/real/public-market.test.ts src/onchainos/public-okx.test.ts` | 32 pass, 0 fail, 223 expect calls |
| `bun --no-env-file run typecheck` | exit 0 |
| `bun --no-env-file run typecheck` em `web` | exit 0 |

Não há claim de compressão/performance do adapter, build integrado, navegação real, cleanup real do navegador ou revisão independente nesta entrega.

Foi executada uma única coleta pública sem chave com o `globalThis.fetch` real. Os três endpoints retornaram HTTP 200 e código `0`. O instrumento era ativo/linear, decimais exatos foram preservados. `observedAtMs=1791737995097`; funding `tsMs=1791738029112` e mark `tsMs=1791738064591` ficaram aproximadamente 34 s e 69 s à frente do relógio local. Resultado: hold por incompatibilidade temporal, expiração imediata. Não houve retry, pagamento, acesso privado ou correção do relógio.

Receipt sanitizado exato: `C:/Users/gabri/.codex/tmp/public-market-live-01a12b5f.json`, SHA-256 `A5572B6D045D954655BCB428C909870D64DAEC9269FDAF0E6517FE5CC0F5F37C`. O artefato foi preservado com o stamp conservador anterior à correção que separou `exercisedReal` de `ready`. Seus receipts comprovam os três GETs públicos reais; ele não comprova uma nova execução da versão final. A versão final mantém o hold e separa proveniência de frescor. Um novo receipt de produção, se necessário, cabe ao integrador no escopo autorizado.

## Manifesto exclusivo e dependências

Somente cinco arquivos novos compõem esta entrega. Nenhum arquivo compartilhado, anterior, configuração ou pacote foi editado.

| Arquivo | SHA-256 |
| --- | --- |
| `src/real/public-market.ts` | `BD58F8894B6A0E76EC546D757A4228C3FDB1C81BE48AEAD870429B2EA2236033` |
| `src/real/public-market.test.ts` | `6211BA52A1F5411828A38C7A3EA8BEE5A3B4137E8862E6FDE087DB02E63C0C9F` |
| `web/src/components/RealPipeline/PublicMarket.tsx` | `9B8D41E5E442532B3C144D9798BFFCFE161B613F563099242C02AFA41DC6A45F` |
| `web/src/components/RealPipeline/PublicMarket.module.css` | `B7E7875826DB8BE33DCC69A822382FA3E7E9DC9D3527C4A5A56626751B4A0A88` |
| `docs/real-integration/PUBLIC-IMPLEMENTATION.md` | hash informado no handoff, sem auto-referência |

Dependências existentes: `src/onchainos/public-okx.ts` (SHA-256 `2380E0397AC7A53C9BC7D96A51039CDC487D1737CE658F030099E821197542C0`), `src/onchainos/errors.ts`, `src/onchainos/http.ts`, React 19.2.8, React DOM 19.2.8, Next 16.3.4 e Bun 1.3.14. Nada instalado. Nenhum commit. Próximo passo: root integra rota/worker/página, valida browser/lifecycle e entrega candidato para revisão independente contra os mesmos critérios.
