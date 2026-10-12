# Evidência de carteira OKX: relatório do GOAL 2

Data: 2026-10-11. Projeto: `C:\Users\gabri\jev-trader`, checkout principal (branch `feature/jev-command-center`). Nada foi commitado, enviado, mesclado ou publicado. Os únicos caminhos criados são `src/portfolio-evidence/` e `docs/portfolio-evidence-v1/` (zona livre do SDD `docs/sdd/carteira-evidencia`); nenhum arquivo de terceiros foi editado.

Especificação e fontes oficiais lidas: [SPEC.md](SPEC.md).

## Resultado

Camada de evidência de carteira e adaptadores **somente de leitura**, testáveis offline, com:

- identidade por rede + contrato, quantidade exata em átomos com decimais e fonte dos decimais, `fetched_at` e `source_time` separados, fonte, cobertura e filtros por seção;
- saldo ativo, histórico, custo de aquisição e PnL em tipos distintos; patrimônio soma só saldos ativos avaliados;
- estados fechados por dado (`ok`, `missing`, `omitted_by_filter`, `stale`, `future`, `divergent`, `unreconciled`, `unverified`) e cinco status derivados (válido, incompleto, vencido, divergente, não reconciliado);
- conciliação RC1 a RC6 mais observações de risco e liquidez (RK);
- coleta sob demanda com teto de chamadas, de páginas e prazo, cache e persistência atômica, e parada imediata em acesso negado, restrição regional, pagamento exigido, credencial recusada e limite de taxa.

## Módulos (todos em `src/portfolio-evidence/`)

| Arquivo | Responsabilidade |
| --- | --- |
| `types.ts` | Contrato v1 (somente tipos): identidade, quantidade, avaliação, seções, conciliação, evidência, relatório de coleta. |
| `decimal.ts` | Aritmética decimal exata em BigInt; aceita só texto decimal simples; decimais verificados pela razão `balance`/`rawBalance`, nunca adivinhados. |
| `canonical.ts` | JSON canônico e sha256. |
| `identity.ts` | Chave `rede:native` ou `rede:contract:endereço canônico`; EVM sem distinguir caixa, Solana distinguindo; símbolo só em `display`. Reusa `src/okx-wallet/chains.ts`. |
| `state.ts` | Estados, status, frescor de captura e de fonte, desvio de relógio medido. |
| `balances.ts` | Construtor da seção de saldos (rejeição de rede, contrato e conta errados; duplicatas; decimais; preço; omissão por filtro). |
| `history.ts` | Seção de histórico (direção contra a conta, janela de seis meses, sinais de entrada líquida) e a trava do custo de aquisição. |
| `address-analysis.ts` | Seção de PnL do provedor, sempre `provider_reported_unverified`. |
| `market.ts` | Preço, decimais, liquidez (limite inferior) e risco por token; dicas para o construtor de saldos. |
| `reconcile.ts` | RC1 a RC6 e RK. Diferença nunca é fechada por arredondamento. |
| `evidence.ts` | Agregado: patrimônio, conciliação, status, hash do conteúdo, verificação. |
| `store.ts` | Cache e persistência sobre a porta `CaptureFs` existente. |
| `collector.ts` | Uma atualização sob demanda sobre cliente injetado, com orçamento, prazo e disjuntor. |
| `adapters/okx-endpoints.ts`, `adapters/okx-read.ts` | Registro de endpoints de leitura e leitores (saldos, total, tokens específicos, histórico paginado, overview e PnL recente, preço, decimais, liquidez, risco). |
| `report.ts`, `demo.ts`, `fixtures.ts`, `cli.ts`, `main.ts` | Resumo em texto, demonstração offline, fixtures sintéticas, linha de comando (injetada) e a única fronteira de processo. |

### O que foi reaproveitado sem edição

Cliente HTTP assinado, limitador, contadores de cota e erros tipados (`src/onchainos/http.ts`, `errors.ts`); `collectPages` (`paging.ts`); `mergeMeta` (`read.ts`); registro de endpoints de preço e token (`endpoints.ts`); `CaptureFs` e `nodeCaptureFs` (cache e persistência); registro de redes e sintaxe de endereço (`src/okx-wallet/chains.ts`); fakes de teste (`src/onchainos/fakes.ts`, só em testes). O vocabulário de `src/okx-wallet/valuation-diagnostics.ts` (não commitado, de terceiros) foi estendido por nomes, sem importá-lo nem editá-lo. Os caminhos de saldo, histórico e portfólio ficam em `adapters/okx-endpoints.ts` porque `src/onchainos/isolation.test.ts` os proíbe dentro de `src/onchainos`. Coordenação com a sessão do catálogo OKX: não foi replicado nada de `docs/research/R6-*` nem de `src/onchainos/**`.

## Aceites

| ID | Critério | Onde é provado |
| --- | --- | --- |
| A1 | Token omitido por filtro de risco não vira saldo zero. | `acceptance.test.ts` A1 (4 testes); `collector.test.ts` (omissão pelos sinais de histórico e PnL; sonda com filtro desligado) |
| A2 | Quantidade histórica com saldo ativo zerado exige reconciliação. | A2 (5 testes): `historical_quantity_active_zero`, `_absent`, `_unknown`; preço zero com quantidade positiva |
| A3 | PnL não é somado ao patrimônio. | A3 (2 testes) e `netWorth.excludes` |
| A4 | Diferença entre total e soma é explicada ou sinalizada. | A4 (5 testes): delta exato, causas candidatas não quantificadas, `divergent` sem causa, tolerância explícita e delta visível |
| A5 | Histórico de seis meses não é custo histórico completo. | A5 (3 testes): `partial_six_months`, custo `null`, só importação local pode declarar completo e ainda assim o método não existe |
| A6 | Rede ou contrato errado, duplicidade, decimais, dados antigos, erro, resposta parcial, paginação. | A6 (16 testes); `adapters/okx-read.test.ts` (paginação, forma ambígua, erros 401, 402, 403, 429, 451, timeout, offline); `collector.test.ts` (orçamento, prazo, erro por seção) |
| A7 | Fixtures sintéticas; ausência de dado real não é mascarada. | A7; `purity.test.ts` (endereços zero-preenchidos inventados, rótulo, quem importa as fixtures); coleta offline devolve `failed` sem dado de exemplo |

## Verificação (executada nesta sessão)

| Verificação | Resultado |
| --- | --- |
| `bun --no-env-file test src/portfolio-evidence` | **184 aprovados, 0 falhas**, 704 asserções, 7 arquivos |
| `bun --no-env-file run typecheck` (projeto inteiro) | saída 0, sem erro |
| Mutações deliberadas (13 regras quebradas uma a uma, arquivo restaurado depois) | **13 de 13 detectadas** por pelo menos um teste; as 9 primeiras: A1 omissão vira zero (2 falhas), A2 sem conciliação (2), A3 PnL somado (6), A4 delta fechado (4), A5 janela parcial como completa (2), A6 sem checagem de rede (1), preço zero valorizado (2), duplicata somada (2), frescor ignorado (4); as 4 do trecho de liquidez e risco: limiar de liquidez removido (1), nível de risco ignorado (1), teto por token ignorado (1), 403 que não encerra (2) |
| Liquidez e risco ponta a ponta (coletor + cliente assinado + `fetch` roteirizado, sem rede) | 4 testes em `collector.test.ts`: uma leitura de liquidez e uma de risco por token, achados RK na evidência, teto por token com `skipped`, 403 de plano sem o endpoint encerra mantendo o já lido, nível 0 nunca vira seguro |
| `bun --no-env-file src/portfolio-evidence/main.ts demo` | saída 0; as 6 cenas (A1 a A7) conferem; nenhuma chamada de rede |
| `... main.ts refresh --address ... --chains 1` | recusa (saída 2): faltam `--live`, `--credentials-from-env`, `--allow-network` |
| Varredura de segredos e endereços | nenhum segredo; todo endereço é inventado e zero-preenchido |

Limite honesto: os testes do núcleo foram escritos **depois** do código (não vermelho antes do verde). Como compensação, as 9 mutações acima provam que os testes de aceite falham quando a regra é quebrada. Revisão por agente distinto **não foi feita** (o protocolo só delega quando autorizado, e o objetivo não autorizou).

### Demonstração offline

```bash
bun --no-env-file src/portfolio-evidence/main.ts demo          # texto
bun --no-env-file src/portfolio-evidence/main.ts demo --json   # evidências completas
bun --no-env-file src/portfolio-evidence/main.ts plan --address <endereço> --chains 1,501 --history --pnl-chains 1
```

Trecho real da saída do `demo` (primeira linha sempre rotula o dado):

```
DADO SINTETICO: valores inventados para teste, nao e captura real
[A1] Token omitido pelo filtro de risco
  confere: o token omitido tem estado omitted_by_filter e nenhuma quantidade
  confere: o patrimonio nao o conta como zero nem como valor
[A2 e A3] Quantidade historica com saldo ativo zerado, e PnL grande ao lado
  confere: exige reconciliacao: historical_quantity_active_zero
  confere: o PnL de 100000 USD nao entra no patrimonio
[A4] Total reportado 75 contra soma das posicoes 50
  Total reportado 75 contra soma 50: diferenca 25, estado unreconciled, causas candidatas scope_includes_defi_positions,risk_filter_applied_may_omit_tokens
```

## Limites, acesso e segredos

- **Timeout**: por chamada, 10 s (padrão do cliente existente, configurável até 60 s). **Retentativas**: só 429 e 5xx, padrão 2 e teto 5 (cliente existente). **Taxa**: 1 requisição por segundo (padrão do cliente).
- **Teto por atualização**: 12 chamadas (máximo 60), 3 páginas por endpoint (máximo 10), 60 s de prazo (máximo 300 s), 5 tokens para liquidez e risco, um a um (máximo 20). O que o teto cortou aparece em `collection.skipped`, nunca some em silêncio.
- **Paginação**: histórico com `limit` 20 (uma rede) ou 100 (várias), PnL recente com 100; cursor repetido, página vazia com cursor e teto de páginas viram `truncated: true` e a janela passa a `partial_truncated`.
- **Cache**: desligado por padrão (`cacheTtlMs: 0`). Com TTL, um acerto não faz nenhuma chamada, devolve a idade e mantém o hash; fora do TTL ou com `forceRefresh` há nova leitura com revisão maior. Uma revisão atrasada ou conflitante nunca sobrescreve a mais nova (RC5), e um arquivo adulterado ou ilegível é ignorado.
- **Sob demanda**: uma chamada de `collectWalletEvidence` é uma atualização. Não há agendador, laço ou temporizador (teste de pureza proíbe `setInterval`, `setImmediate`, `cron`; `setTimeout` só em `main.ts`).
- **Acesso**: 401, 402, 403, 451 e limite de taxa esgotado **encerram** a atualização; não há proxy, rota alternativa, pagamento ou segunda fonte.
- **Segredos**: a biblioteca nunca lê ambiente. O cliente assinado guarda as credenciais em closure; `cli.ts` recebe `env` injetado e só `main.ts` toca `process.env`. Nenhum segredo, assinatura ou cabeçalho aparece em erro, saída ou arquivo (testes com credenciais canário). O endereço da conta nunca é gravado: só o hash.
- **Persistência**: opt-in (`--store-dir`); o arquivo guarda contratos e quantidades, sem o endereço. Para dados de carteira no navegador vale o contrato O5/W7 do projeto; esta camada roda no backend.

## Integrações reais NÃO verificadas

Nenhuma chamada a `web3.okx.com` foi feita e nenhuma credencial foi criada ou lida. Portanto **não está verificado ao vivo**:

1. Assinatura e aceitação das credenciais nestas famílias de endpoint, e o plano (tier) que as cobre. As páginas não declaram tier, limite de taxa, códigos de erro nem restrição regional; o custo de cota é `unknown`.
2. Que `balance` está em unidades do token. Só é aceito quando coerente com `rawBalance`, com decimais fixados do nativo ou com os decimais do provedor; do contrário a posição fica `unverified` sem valor.
3. Divergências da própria documentação: caminho do saldo específico (`/token-balances-by-address` na tabela, `/token-balances` no exemplo) e posição de `excludeRiskToken` no corpo; `transactions` contra `transactionList` no histórico (as duas são lidas, as duas juntas são recusadas); forma do `data` do PnL (objeto ou lista de um grupo, ambos aceitos); marcador de fim do cursor (o exemplo mostra `"0"`).
4. Moeda do preço de mercado: não declarada, por isso só corrobora relógio e coerência e não entra no valor.
5. Comportamento do filtro de risco na prática (a OKX documenta o filtro de honeypot só em ETH, BSC, SOL e BASE).

### Menor desbloqueio

Autorização do usuário para **uma** leitura mínima real, com uma chave de API da OKX **somente leitura** que o próprio usuário forneça ao ambiente do processo (nada é criado por esta sessão) e um endereço que ele aceite enviar à OKX:

```bash
bun --no-env-file src/portfolio-evidence/main.ts plan --address <endereço> --chains 1 --no-market
bun --no-env-file src/portfolio-evidence/main.ts refresh --live --credentials-from-env --allow-network --address <endereço> --chains 1 --risk-filter 1 --max-calls 4 --json
```

Isso confirma assinatura, forma de `data`, relação `balance`/`rawBalance` e acesso regional com duas chamadas de saldo e total. Histórico, PnL, liquidez e risco são acréscimos posteriores (`--history`, `--pnl-chains`, `--liquidity`, `--risk`).

## Premissas e escopo não coberto

- Tolerância de valor padrão **0,01 USD** (decisão D5 do SDD segue aberta; configurável em `valueToleranceUsd`). Quantidades não têm tolerância.
- Token marcado como risco pelo provedor é **excluído do patrimônio** e sinalizado (RK), mesmo quando devolvido com o filtro desligado.
- Com o filtro de risco ativo, o patrimônio fica `incompleto` com a ressalva `risk_filter_applied_tokens_may_be_omitted`; `válido` só é alcançável com o filtro desligado e cobertura completa declarada.
- Não implementado: cálculo de custo de aquisição (só a trava; a janela de seis meses nunca produz custo), `dex-history`, `latest-pnl` e `supported-chain` do portfólio, adaptadores `browser_wallet`, `public_rpc` e `local_import` (o tipo e a regra de `declaredComplete` existem, o importador não), cópia do núcleo para `web/`, adaptador para o System One (DF-14), rota `/portfolio` e painel na mesa. Em pedido de PnL por várias redes, só a primeira rede com dado entra na seção e as demais ficam em `collection.skipped`.
- Posições DeFi do usuário (`defi/user/*`) não são lidas e não entram em nenhuma soma; `total-value` com escopo `all` ou `defi` só aparece como causa candidata da diferença.
- A pergunta de D2 (como o JEV vê dados da carteira) segue aberta: nada aqui envia dado de carteira ao JEV.

## Checkpoint

Resultado: camada implementada e verificada offline. Hash de cada arquivo: `MANIFEST.sha256` nesta pasta (`sha256sum -c MANIFEST.sha256` na raiz do projeto). Pendências: revisão independente por agente distinto; leitura real mínima (desbloqueio acima); decisões D2, D3 e D5; commit (o usuário não pediu). Próximo passo sugerido: revisão independente em cópia isolada e, depois, a leitura real mínima. Bloqueio: credenciais OKX e autorização de envio do endereço. Orçamento: sem chamadas pagas; nenhuma chamada externa.
