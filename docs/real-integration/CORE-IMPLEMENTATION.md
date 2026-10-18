# Entrega do adaptador core OKX

Data: 2026-10-11. Escritor: `/root/core_adapter`, cópia isolada `C:/Users/gabri/.codex/tmp/okx-real-core-01a12b5f`. Revisão independente e integração pertencem ao root. Não houve commit, assinatura financeira, broadcast, consulta autenticada real ou consumo de chaves de plugins.

Critérios preservados: G01–G17 de `INSTRUCAO-DO-OBJETIVO.md`, SHA-256 `cfa90cac735e9a838a0c4bc593276c83757905e7c5fedcd2414e499b1dad9e08`; baseline `055a637f27f28cbf357cfb492534f7ed33d9b68f`. Seam pública do transporte autenticado aprovada pelo recibo Jev `7572e239-2232-41a6-b4a9-62d35395c549`, `approved_by=jev_delegated`, `human_response=false`. TDD aplicado em fatias red→green. Nenhuma aceitação live foi substituída por fixtures.

## Manifesto exclusivo

| Arquivo | SHA-256 na entrega |
|---|---|
| `src/real/core.ts` | `d9b86ad7fc7be17499d00da99735248bf2415e8428ed5efe155ebcd2ab986569` |
| `src/real/types.ts` | `acc8a2af167e32301c4b7a89fbf1caf4cb5e4aef0bacc2ee3297d6cf1482e605` |
| `src/real/preflight.ts` | `fbb40541ae257891f678def48964a295b08410cd4e1e8460b32616d8eeb7fc35` |
| `src/real/core.test.ts` | `829e0368019903d682c98c3d25c469cab89f5e38c95734a9030c0227f4ffd870` |
| `docs/real-integration/CORE-IMPLEMENTATION.md` | Este relatório |

Nenhum cliente legado, arquivo de wallet, transporte HTTP, configuração, runtime, journal, decisão, script, package ou página foi editado por este escritor. O contrato legado de quote continua com a unidade desconhecida; O5/W7 continuam sendo conexão local. Consentimento separado é responsabilidade do integrador.

## API e evidência por família

`createRealCore({ http: OnchainosHttp, now: () => number }).read({ correlationId, chainIndex, address, revision, pair? })` retorna um `CoreSample`. A identidade é SHA-256 UTF-8 de `${chainIndex}:${address.toLowerCase()}` para hex; endereços Base58 preservam caixa. O root limita seu consentimento EVM a 196/143. O core não anuncia suporte que não foi observado separadamente na família.

Cada envelope inclui status, origem, endpoint sem query, método, chain, correlação, request/receive/source, validade, HTTP status, unidade, erro sanitizado e dados normalizados. `mode` permanece `unverified`. Todas as capacidades retornam `exercisedReal=false` e `financiallyQualified=false`, inclusive quando o transporte injetado declara ready. `HTTP.info.ready`, credenciais presentes ou fixture bem sucedida não qualificam acesso real. O root possui o registrador privado de recibos do fetch real e deve correlacionar origem, método, endpoint, chain, correlação, request/receive, HTTP status e código de provedor válido.

| Família | Suporte independente GET | Envelopes de dados e métodos necessários |
|---|---|---|
| market | `/api/v6/dex/market/supported/chain` | `prices`: POST `/api/v6/dex/market/price`; `candles`: GET `/api/v6/dex/market/candles`, por token solicitado |
| balance | `/api/v6/dex/balance/supported/chain` | `balance`: GET `/api/v6/dex/balance/all-token-balances-by-address` |
| dex | `/api/v6/dex/aggregator/supported/chain` | `quote`: GET `/api/v6/dex/aggregator/quote`; `build`: GET `/api/v6/dex/aggregator/swap` |

`Capability.endpoint` identifica a lista de suporte. Um recibo dessa lista, sozinho, não comprova dados da família. A disponibilidade final da capacidade incorpora falhas/bloqueios dos envelopes de dados. Market também bloqueia cobertura incompleta, tokens omitidos, timestamp ausente e dados vencidos. Capacidade disponível continua sem qualificação financeira.

O núcleo expõe dependências opcionais separadamente: simulation documentada mas não implementada (whitelist e divergência de método ainda pendentes); DeFi e signals têm leitores existentes mas não estão integrados a este ciclo; funding tem origem `okx-public-v5`, sem promover acesso OnchainOS e sem inferir collateral ou posição derivativa. Nenhum desses leitores opcionais é chamado pelo core.

## Quantidades, cobertura e proposta

Inteiros brutos e decimals são strings estritas; somas, valores USD e minimum output usam BigInt. Campos ausentes continuam null. Balances com `rawBalance=""` não viram zero. O saldo declara USD para preço/valor, mas market price/candle mantém moeda desconhecida; não há conversão implícita. Candle aberto é excluído. TTL: balance/market 60 s, quote/build 15 s, com fonte conservadora quando disponível. Tokens de mercado vêm do inventário observado e/ou pair explícito; no máximo quatro são consultados, e `omittedTokens` expõe o restante.

O endpoint de balance não documenta decimals nem altura de bloco: ambos permanecem null. A cobertura é `observed-tokens-only`; o total parcial conhecido não é capital completo. `completeValueUsd` é null quando qualquer token observado não tem valor USD. Proposta usa somente saldo bruto observado, token de risco explicitamente false, quantidade positiva e cobertura suficiente/fresca. Decimals do quote são `provider-reference`, seguindo a documentação que avisa que podem mudar. Nenhum desses metadados constitui prova independente de decimals.

Pair explícito usa exactIn em smallest-token-unit. Quote preserva tokens, quantidades, referências de decimals, preço recomendado USD, taxa/honeypot, impacto percentual assinado, custo de rede USD, gas bruto e rotas normalizadas limitadas; metadados arbitrários são descartados. Build faz GET swap com `approveTransaction=false`, `autoSlippage=false`, verifica wallet/chain/slippage e exige igualdade da cotação normalizada amostrada, inclusive rota. Não chama approve, simulate, sign ou broadcast.

Proposta sempre `executionEnabled=false`; a transaction é não assinada e efêmera. O preflight verifica estrutura e consistência: chain, router com forma EVM, calldata hex limitada, native value, minimum output, saldo, unsigned, validade e inteiros de gas. Ele **nunca** aprova semântica: faltam política de router/selector, ABI/decodificação, spender/allowance, prova independente de decimals, orçamento de gas, política de impacto/tax e simulação remota. `semanticChecksPassed=false`, `status=blocked` em todos os casos. Não inventa ABI para qualificar calldata. O digest da proposta vincula sessão/revisão, par, quantidades, validade e digest da transaction; consumo rejeita mutação, sessão divergente, vencimento e relógio não finito.

`sanitizeCoreSample(sample)` remove todo `build.data` e a transaction da proposta, preservando somente o hash normalizado. O calldata pode conter destinatário; nunca persista o `CoreSample` efêmero. Parsers de balance/quote/rotas removem campos arbitrários, rejeitam identidade de token igual à carteira e não devolvem `tx.from`. Falhas são códigos fixos (`onchainos-*`), sem mensagens/body do provedor, headers ou segredo.

## Evidência local TDD

Todos os comandos foram executados na cópia isolada com Bun 1.3.14 e `--no-env-file`. A fronteira fake fetch usa credenciais de teste e relógio falso: não comprova autenticação, acesso de rede, G05, G08, G10 ou G11 live. Não há custos/uso faturado observados (`null`).

Comando exato comum, substituindo somente `core-{red|green}-NN.json` pelo recibo da linha abaixo:

```powershell
& 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/venv/Scripts/python.exe' 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/adapter/adapter_cli.py' run --cwd 'C:/Users/gabri/.codex/tmp/okx-real-core-01a12b5f' --timeout 120 --profile test --rtk 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/bin/rtk.exe' --headroom-python 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/venv/Scripts/python.exe' --store 'C:/Users/gabri/.codex/rtk-headroom-data' --metrics 'C:/Users/gabri/.codex/tmp/core-{red|green}-NN.json' -- 'C:/Users/gabri/.bun/bin/bun.exe' --no-env-file test src/real/core.test.ts
```

| NN | Comportamento | RED observado (exit 1) | GREEN observado (exit 0) |
|---|---|---|---|
| 01 | Bloqueio sem credenciais e sem network | módulo inexistente, 0 pass/1 fail/1 error | 1 pass/8 expect |
| 02 | Inventário exato e suporte balance independente | balance blocked em vez de ready, 1 pass/1 fail | 2 pass/21 expect |
| 03 | Market observado/candle fechado/unidade desconhecida | prices blocked em vez de ready, 2 pass/1 fail | 3 pass/32 expect |
| 04 | Quote e build unsigned com saldo suficiente | quote blocked em vez de ready, 3 pass/1 fail | 4 pass/52 expect |
| 05 | Sanitização persistente do calldata e wallet | export ausente, 0 pass/1 fail/1 error | 5 pass/60 expect |
| 06 | Estágios opcionais explícitos | capability undefined, 5 pass/1 fail | 6 pass/86 expect |
| 07 | Build não altera quote amostrado | build ready em vez de error, 6 pass/1 fail | 7 pass/90 expect |
| 08 | Digest/par/sessão/validade imutáveis | structural true após token alterado, 7 pass/1 fail | 8 pass/98 expect |
| 09 | Disponibilidade por falhas reais da leitura | market ready após HTTP429, 8 pass/1 fail | 9 pass/108 expect |
| 10 | Método e modo explícitos do envelope | method undefined, 7 pass/2 fail | 9 pass/112 expect |
| 11 | Identidades de token inválidas ou wallet rejeitadas | balance ready para token ausente, 9 pass/1 fail | 10 pass/121 expect |
| 12 | Rotas e percentuais exatos normalizados | mainRoute ausente, 10 pass/1 fail | 11 pass/127 expect |
| 13 | Cobertura limitada explícita | omittedTokens ausente, 11 pass/1 fail | 12 pass/132 expect |
| 14 | Relógio desconhecido não estende validade | structural true com NaN, 12 pass/1 fail | 13 pass/139 expect |

Recibos exatos `C:/Users/gabri/.codex/tmp/core-red-01.json` a `core-red-14.json` e respectivos `core-green-01.json` a `core-green-14.json` registram hashes stdout/stderr. RTK entregou passthrough (`command_unsuccessful` no RED; `command_not_allowlisted` no GREEN), `archive_id=null`: não há alegação de compressão/ganho e a saída exata está nos retornos da execução desta conversa. GREEN14 stderr SHA-256 `982ead173018f69452b9568924896d068c43ef73d458343aaaeea5ed523e65cc`; stdout SHA-256 `d6684989b8dd63b37d2f1954270826fbe1bd89a8debd12bcacf03ed1c6140ef6`.

Typecheck exato: mesmo wrapper acima, `--profile build`, métricas `core-typecheck-NN.json`, comando final `'C:/Users/gabri/.bun/bin/bun.exe' --no-env-file run typecheck`. NN01 falhou com readers nullable usados como obrigatórios; NN02 e NN03 passaram (exit0, `$ tsc --noEmit -p tsconfig.verification.json`). NN03 foi executado depois do último GREEN, com todos os arquivos do manifesto atuais. Checagens amplas/backend/browser da árvore integrada e revisão independente ficam com root. A busca final identificou que `src/okx-dex` não existe (`os error 2`); o cliente legado está em `src/okx-market/okx-dex.ts`, sem edição neste slice.

## Dependências reais pendentes

Credenciais OKX Web3 não estavam disponíveis no escopo autorizado; nenhuma chamada autenticada real foi realizada. Entitlement/método/chain/ABI e qualificação econômica continuam desconhecidos quando não demonstrados. O root deve usar recibos privados de produção para distinguir observação real de testes locais, manter consentimento e sessão, e executar revisão independente. Este slice está pronto para integração; não declara G01–G17 completos nem aprova sua própria implementação.

Fontes primárias consultadas: [OKX quote](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote), [OKX swap](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap), e páginas oficiais de balance/market/simulação catalogadas em `PESQUISA-OKX.md`. A página quote foi conferida novamente em 2026-10-11 para o esquema de rota, gas bruto, taxa de rede USD e a ressalva de decimals como referência.
