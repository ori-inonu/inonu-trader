# Evidência de carteira OKX: relatório do GOAL 2

Data: 2026-10-11, revisado em 2026-10-12. Projeto: `C:\Users\gabri\jev-trader`. Os únicos caminhos criados ou editados são `src/portfolio-evidence/` e `docs/portfolio-evidence-v1/` (zona livre do SDD `docs/sdd/carteira-evidencia`); nenhum arquivo de terceiros foi editado. A primeira versão foi commitada na `main` pela sessão de consolidação (commit `8786fd6`); nada foi enviado (push) nem publicado. Houve **duas** revisões independentes: a da sessão "Completar branches e objetivos SDD" (`docs/research/spec-review-20261012/spec-review-portfolio-evidence.md`: APPROVE_WITH_NOTES, sem P1, 5 P2, 15 P3) e a re-revisão das correções por um subagente somente leitura, em cópia isolada, autorizado pelo usuário (APPROVE_WITH_NOTES, sem P1, 4 P2, 7 P3). As correções das duas estão na seção "Revisão independente e correções". Depois delas, completei a família Address Analysis (seção própria abaixo) e uma **terceira** revisão independente (subagente somente leitura, cópia isolada, autorizada pelo usuário) a examinou junto com as correções das duas primeiras: APPROVE_WITH_NOTES, sem P1, 4 P2 e 6 P3 no código novo, sem regressão nas correções anteriores. Os achados foram corrigidos (seção "Terceira revisão"); **essas últimas correções não foram re-revisadas**. Nada disso está commitado.

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
| `state.ts` | Estados, status, frescor de captura e de fonte. Aplica um desvio de relógio quando o chamador o informa; nada neste módulo o mede. |
| `balances.ts` | Construtor da seção de saldos (rejeição de rede, contrato e conta errados; duplicatas; decimais; preço; omissão por filtro). |
| `history.ts` | Seção de histórico (direção contra a conta, janela de seis meses, sinais de entrada líquida) e a trava do custo de aquisição. |
| `address-analysis.ts` | Família Address Analysis: PnL (overview, recente, último de um token, com a checagem do total do provedor contra as partes), negociações DEX da janela, somas observadas por ativo (não são custo) e lista de redes suportadas. Tudo `provider_reported_unverified`. |
| `market.ts` | Preço, decimais, liquidez (limite inferior) e risco por token; dicas para o construtor de saldos. |
| `reconcile.ts` | RC1 a RC6 e RK. Diferença nunca é fechada por arredondamento. |
| `evidence.ts` | Agregado: patrimônio, conciliação, status, hash do conteúdo, verificação. |
| `store.ts` | Cache e persistência sobre a porta `CaptureFs` existente. |
| `collector.ts` | Uma atualização sob demanda sobre cliente injetado, com orçamento, prazo e disjuntor. |
| `adapters/okx-endpoints.ts`, `adapters/okx-read.ts` | Registro de 9 endpoints de leitura (8 GET e 1 POST) e leitores: saldos, total, tokens específicos, histórico paginado, overview, PnL recente, PnL do último token, histórico de negociações DEX paginado, redes suportadas, mais preço, decimais, liquidez e risco do registro existente. |
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
| `bun --no-env-file test src/portfolio-evidence` | **379 aprovados, 0 falhas**, 1425 asserções, 11 arquivos (184 antes das revisões; os demais são as regressões das três revisões, os testes da família Address Analysis, os testes dos mutantes sobreviventes e a sensibilidade do scanner de pureza) |
| `bun --no-env-file run typecheck` (projeto inteiro) | **0 erros** no projeto inteiro nesta verificação. (Numa verificação intermediária o projeto tinha 4 erros em `src/settings/store.ts`, arquivo não rastreado de outra sessão, que não toquei; nenhum erro foi, em momento algum, de `src/portfolio-evidence`.) |
| Mutações deliberadas (quebrar uma regra de cada vez, restaurar o arquivo, rodar a suíte) | Quatro campanhas, sempre com scripts fora do repositório. (1) 62 regras do núcleo, dos módulos e das correções das duas primeiras revisões: **61 detectadas, 1 equivalente** (remover o termo `stoppedBy` da checagem de coleta limpa não muda nada, porque toda parada deixa `errors` ou `skipped` não vazios), além da mutação A3 original (somar PnL ao patrimônio, 6 falhas). (2) 33 mutações da família Address Analysis: 32 detectadas, 1 só de tipo (sem efeito em execução); 5 sobreviveram na primeira rodada e ganharam teste. (3) **O conjunto do revisor independente**, 147 mutantes sobre o código novo e as correções: 13 deixaram de se aplicar porque o código foi reescrito pelas correções; dos 134 aplicáveis, **133 detectados e 1 equivalente** (`:0xabc` já é recusado pela checagem do número da rede, então afrouxar `colon < 1` não muda nada); na medição do revisor eram 55 detectados e 83 sobreviventes; depois das correções do código e dos testes da terceira rodada, 83 e 51; com os testes dos sobreviventes, 133 e 1. (4) 35 mutações minhas sobre o código que os mutantes do revisor não alcançam mais (identidade da negociação, posição líquida, tabela de tipos, teto de 1000, cursor, status do patrimônio, corte pelo instante da leitura): 34 detectadas, 1 equivalente (um ramo de tempo nulo que não é alcançável, porque negociação sem tempo já é não lida). As 9 originais da primeira rodada: A1 omissão vira zero (2 falhas), A2 sem conciliação (2), A3 PnL somado (6), A4 delta fechado (4), A5 janela parcial como completa (2), A6 sem checagem de rede (1), preço zero valorizado (2), duplicata somada (2), frescor ignorado (4) |
| Liquidez e risco ponta a ponta (coletor + cliente assinado + `fetch` roteirizado, sem rede) | 4 testes em `collector.test.ts`: uma leitura de liquidez e uma de risco por token, achados RK na evidência, teto por token com `skipped`, 403 de plano sem o endpoint encerra mantendo o já lido, nível 0 nunca vira seguro |
| `bun --no-env-file src/portfolio-evidence/main.ts demo` | saída 0; as 6 cenas (A1 a A7) conferem; nenhuma chamada de rede |
| `... main.ts refresh --address ... --chains 1` | recusa (saída 2): faltam `--live`, `--credentials-from-env`, `--allow-network` |
| Varredura de segredos e endereços | nenhum segredo; todo endereço é inventado e zero-preenchido |

Limite honesto: os testes do **núcleo original** foram escritos depois do código (não vermelho antes do verde); a compensação foram as mutações e as três revisões. Os testes das **correções** foram escritos antes: os de `review-fixes.test.ts` (32 testes) falharam em 24 contra o código revisado, medido pelo revisor independente (os outros 8 cobrem comportamento já correto e matam os mutantes sobreviventes); os de `rereview-fixes.test.ts` falharam todos de início (o arquivo nem carregava, faltava `EvidenceIntegrityError`); e os da terceira rodada tiveram 20 testes que falharam contra o código sem as correções (os demais descrevem comportamento que já estava certo e matam mutantes). Os testes da própria família Address Analysis também vieram antes (o arquivo não carregava, faltavam os leitores). **As correções da terceira rodada ainda não foram re-revisadas**; a quarta rodada não foi pedida.

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

## Consulta à documentação oficial

Consultei as páginas em duas datas (2026-10-11: saldos, histórico e portfólio; 2026-10-12: mercado, tabelas de erro e autenticação). A página de introdução do Market (`market-api-introduction`) é só navegação (cartões para Price, Index, Token, Strategy, Onchain Core Data, Address Analysis, Social, Balance e Transaction history, sem caminho, limite ou unidade): todos os fatos vêm das **páginas de referência ligadas a ela**, que li uma a uma.

| Página | O que diz, e o que não diz | Efeito no código |
| --- | --- | --- |
| `market-price` | `POST /api/v6/dex/market/price`, corpo = lista de `{chainIndex, tokenContractAddress}`; resposta com `time` (texto, ms Unix) e `price` (texto, **sem moeda**); "para redes EVM use endereços em minúsculas"; **não declara máximo de itens** (o 100 vem do registro do projeto); o exemplo pede `chainIndex` 66 e a resposta traz 1, sem explicação | contratos EVM vão em minúsculas na rede (canônico da identidade); preço de mercado continua sem moeda e só corrobora relógio |
| `market-token-basic-info` | `POST`, lista como acima, resposta com `decimal` (texto); sem máximo de itens | lê `decimal` como texto de inteiro 0 a 36 |
| `market-token-top-liquidity` | `GET`, até 5 pools, `data` é lista; `liquidityUsd` texto **sem unidade declarada**; o exemplo traz campos fora da tabela e `hookFeePercent: null` | soma exata, rotulada limite inferior; unidade lida como USD por premissa; campos extras ignorados |
| `market-token-advanced-info` | `GET`, `data` é objeto; `riskControlLevel` texto de 0 a 5 (0 indefinido, 5 alto configurado à mão); `tokenTags` lista; **nenhuma nota de plano** nesta página | nível 0 nunca é "seguro"; o tier premium vem do registro do projeto, não desta página |
| `onchaindata-error-code`, `market-price-error-code` | `50011` HTTP 429 limite de taxa; `50103` a `50107` e `50111` a `50114` HTTP 401 autenticação; **`50125` HTTP 401 "sua chave de API ou região não tem acesso ao serviço"**; **`50038` HTTP 200 "rede não suportada"**; `50014`, `50036`, `51000` HTTP 400 parâmetro; `50026` HTTP 500; `50404` HTTP 404. A página de preço descreve também um modo de **pagamento por chamada** (cabeçalho `PAYMENT-SIGNATURE` ou `X-PAYMENT`) | o classificador usa o código oficial além do status: `50125` encerra como acesso negado ou região, `50103` a `50114` como credencial recusada, `50038` é um erro tipado da seção que não encerra; um 402 encerra e **nunca se paga** |
| `api-access-and-usage` (autenticação) | cabeçalhos `OK-ACCESS-KEY`, `-SIGN`, `-TIMESTAMP`, `-PASSPHRASE`; assinatura HMAC SHA256 em Base64; o carimbo não pode diferir mais de 30 s do relógio do servidor; **não traz limites, planos nem regiões** | nada novo no código; o risco de relógio fica na lista de não verificados |
| Limites por endpoint, planos e regiões | nenhuma página que li publica taxa por endpoint nem tabela de planos. Uma busca restrita ao domínio oficial achou só `50011`, `50030` (X Layer, "sem permissão, melhore o plano"), `50047` (X Layer, região) e avisos gerais do portal e do FAQ sobre regiões restritas; **não abri essas páginas**, então tratei como pista | nada foi inventado: custo de cota segue desconhecido, e acesso negado encerra a atualização sem contorno |

Duas correções saíram dessa consulta e têm teste (`docs-conformance.test.ts`): endereço EVM em minúsculas nos quatro endpoints de mercado, e classificação por código oficial de erro.

## Limites, acesso e segredos

- **Timeout**: por chamada, 10 s (padrão do cliente existente, configurável até 60 s). **Retentativas**: só 429 e 5xx, padrão 2 e teto 5 (cliente existente). **Taxa**: 1 requisição por segundo (padrão do cliente).
- **Teto por atualização**: 12 chamadas **lógicas** (máximo 60), 3 páginas por endpoint (máximo 10), 60 s de prazo (máximo 300 s), 5 tokens por tipo de leitura um a um, a saber liquidez, risco e PnL do último token (máximo 20). As retentativas do cliente não entram nesse teto (um HTTP 500 permanente com 2 retentativas gera 3 requisições por chamada lógica): o `refresh` imprime o total de requisições HTTP. O que o teto cortou aparece em `collection.skipped`, nunca some em silêncio. O timeout por chamada é configurável só na biblioteca; a CLI usa o padrão de 10 s.
- **Paginação**: histórico on-chain com `limit` 20 (uma rede) ou 100 (várias), PnL recente e negociações DEX com 100 por página. Cursor repetido, página vazia com cursor, teto de páginas e **chegar ao teto de 1000 registros do provedor** (PnL recente e negociações DEX, mesmo com o último cursor vazio) viram `truncated: true`; a janela do histórico on-chain passa a `partial_truncated`. Um cursor que não é texto nem vazio é erro de esquema (ler como "sem mais páginas" faria uma leitura cortada parecer completa).
- **Cache**: desligado por padrão (`cacheTtlMs: 0`). O TTL efetivo é `min(cacheTtlMs, maxAgeMs)`: uma evidência em cache congela o frescor com que foi construída, então nunca é servida além do próprio limite de frescor. A impressão digital do pedido inclui `maxAgeMs` e `valueToleranceUsd`. Com TTL, um acerto não faz nenhuma chamada, devolve a idade e mantém o hash; fora do TTL ou com `forceRefresh` há nova leitura com revisão maior. Uma revisão atrasada ou conflitante nunca sobrescreve a mais nova (RC5), e um arquivo adulterado ou ilegível é ignorado.
- **Sob demanda**: uma chamada de `collectWalletEvidence` é uma atualização. Não há agendador, laço ou temporizador (teste de pureza proíbe `setInterval`, `setImmediate`, `cron`; `setTimeout` só em `main.ts`).
- **Acesso**: 401, 402, 403, 451 e limite de taxa esgotado **encerram** a atualização; não há proxy, rota alternativa, pagamento ou segunda fonte.
- **Segredos**: a biblioteca nunca lê ambiente. O cliente assinado guarda as credenciais em closure; `cli.ts` recebe `env` injetado e só `main.ts` toca `process.env`. Nenhum segredo, assinatura ou cabeçalho aparece em erro, saída ou arquivo (testes com credenciais canário). O endereço da conta nunca é gravado: só o hash.
- **Persistência**: opt-in (`--store-dir`), sem diretório padrão: escolha um que não seja versionado (`data/` é ignorado pelo git). O arquivo guarda contratos e quantidades, sem o endereço; com `--history` guarda também hashes de transação, que ligam o arquivo ao endereço na cadeia. A leitura só serve um arquivo cujo `accountRef` bate com o nome. Falha de gravação não derruba a evidência: volta em `persisted.error`. Para dados de carteira no navegador vale o contrato O5/W7 do projeto; esta camada roda no backend.

## Integrações reais NÃO verificadas

Nenhuma chamada a `web3.okx.com` foi feita e nenhuma credencial foi criada ou lida. Portanto **não está verificado ao vivo**:

1. Assinatura e aceitação das credenciais nestas famílias de endpoint, e o plano (tier) que as cobre. As páginas de saldo, histórico e portfólio não declaram tier, limite de taxa, códigos de erro nem restrição regional (custo de cota `unknown`). Os endpoints de mercado têm tier no registro do projeto (`basic` para preço, decimais e liquidez; `premium` para risco), e a seção de mercado o grava; o `plan` os lista.
2. Que `balance` está em unidades do token. Só é aceito quando coerente com `rawBalance`, com decimais fixados do nativo ou com os decimais do provedor; do contrário a posição fica `unverified` sem valor.
3. Divergências da própria documentação: caminho do saldo específico (`/token-balances-by-address` na tabela, `/token-balances` no exemplo) e posição de `excludeRiskToken` no corpo; `transactions` contra `transactionList` no histórico (as duas são lidas, as duas juntas são recusadas); forma do `data` do PnL (objeto ou lista de um grupo, ambos aceitos); marcador de fim do cursor (o exemplo mostra `"0"`).
4. Moeda do preço de mercado: não declarada, por isso só corrobora relógio e coerência e não entra no valor.
5. Comportamento do filtro de risco na prática (a OKX documenta o filtro de honeypot só em ETH, BSC, SOL e BASE).
6. Relógio e unidade: a página de autenticação diz que o carimbo de tempo da assinatura "não pode diferir mais de 30 segundos" do relógio do servidor (erro `50112`); o cliente existente assina com o relógio local e nada aqui o mede. `liquidityUsd` do `top-liquidity` não tem unidade declarada ("o nome sugere USD"): é lido como USD por premissa.
7. Família Address Analysis: unidade de `amount` e de `price` das negociações DEX (não declarada), se `isPnlSupported` falso vem com os demais campos, se a lista de redes suportadas é completa (o exemplo mostra duas), a janela máxima aceita por `begin` e `end` e o marcador de fim do cursor. O exemplo publicado de `latest-pnl` **não fecha** (total 1371.68 contra realizado -685.4 e não realizado 685.4), por isso o total do provedor é conferido contra as partes e a divergência é um achado `PN`, não um número confiável. Uma resposta de `latest-pnl` não traz o token, então a identidade vem do pedido; um `isPnlSupported` que não é booleano deixa o token `unverified`.

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
- Não implementado: cálculo de **custo de aquisição** (só a trava; nem a janela de seis meses nem o histórico de negociações DEX produzem custo: as somas da seção Address Analysis são observadas numa janela e nunca são chamadas de custo), `address-tracker` (negociações de vários endereços, outro propósito), adaptadores `browser_wallet`, `public_rpc` e `local_import` (o tipo e a regra de `declaredComplete` existem, o importador não), cópia do núcleo para `web/`, adaptador para o System One (DF-14), rota `/portfolio` e painel na mesa. Em pedido de PnL por várias redes, só a primeira rede com dado entra na seção e as demais ficam em `collection.skipped`.
- Posições DeFi do usuário (`defi/user/*`) não são lidas e não entram em nenhuma soma; `total-value` com escopo `all` ou `defi` só aparece como causa candidata da diferença.
- A pergunta de D2 (como o JEV vê dados da carteira) segue aberta: nada aqui envia dado de carteira ao JEV.

## Checkpoint

Resultado: camada implementada, revisada de forma independente três vezes e corrigida; verificada offline. Hash de cada arquivo: `MANIFEST.sha256` nesta pasta, calculado sobre o conteúdo com fim de linha LF (o checkout do Windows converte para CRLF) e regenerado por último, depois da última edição de qualquer arquivo listado. Verificação, na raiz do projeto: `while read -r h f; do f=${f#\*}; [ "$(tr -d '\r' < "$f" | sha256sum | cut -d' ' -f1)" = "$h" ] && echo "OK $f" || echo "FALHOU $f"; done < <(tr -d '\r' < docs/portfolio-evidence-v1/MANIFEST.sha256)`. **Decisão do usuário (2026-10-12, resposta direta):** dar o objetivo como entregue assim; a leitura real mínima, uma quarta revisão independente e o commit ficam como pendências dele, não deste objetivo. Pendências: commit de tudo o que veio depois do commit 8786fd6 (o usuário não pediu; a consolidação da `main` decide); re-revisão das correções da terceira rodada e das duas da consulta à documentação (não pedida); leitura real mínima (desbloqueio acima); decisões D2, D3 e D5. Bloqueio: credenciais OKX e autorização de envio do endereço. Orçamento: sem chamadas pagas; nenhuma chamada externa.

## Revisão independente e correções

Revisão: sessão "Completar branches e objetivos SDD", cópia de `git archive` fora do repositório, 184 testes reproduzidos, 108 mutações em memória (97 mortas, 11 sobreviventes), fuzz de 80 mil casos sem exceção. Achados tratados aqui, cada um com teste escrito antes em `review-fixes.test.ts`:

| Achado | Correção | Mutação que o teste detecta |
| --- | --- | --- |
| F1 P2 cache servia evidência além do próprio `maxAge` | TTL efetivo `min(ttl, maxAge)`; impressão digital inclui `maxAgeMs` e tolerância | 2 de 2 |
| F2 P2 relógio do preço nunca avaliado; segundos e microssegundos aceitos como ms | relógio do preço velho ou futuro dá `stale` ou `future` e o valor não conta; leitor só aceita 13 dígitos simples, sem zero à esquerda, até o ano 2100 (a regex **não** é redundante: sem ela `Number()` aceitaria `1.75999999e12`, `0x19a4f8c3a00` e `1759999990000.5`) | 3 de 3 |
| F3 P2 `isRiskToken` ou `address` ilegíveis falhavam abertos | `unverified` (`risk_flag_unreadable`, `account_unverified`) e a posição não conta; texto que não é a conta continua rejeitado | 2 de 2 |
| F4 P2 `sumIncluded` descartava em silêncio valor fora dos limites | valor que a camada não consegue reler vira `unverified` (`value_exceeds_precision_limits`) e não conta | 1 de 1 |
| F5 P2 sobreviventes M08, M35, M63, M64, M84, M71 | um teste para cada (M64 exigiu um teste com o hash recalculado, porque só alterar o schema era pego pelo hash) | os seis mortos |
| F6 eco de argumento desconhecido | a mensagem não ecoa o valor | 1 de 1 |
| F7 saída 0 com todas as seções falhas | saída 1 se houve erro, parada ou nenhum saldo | 1 de 1 |
| F8 `--help` na 1ª posição; linha extra após o JSON | `--help` sai 0; com `--json` as notas vão para stderr | 2 de 2 |
| F9 retentativas fora do teto | documentado; `refresh` imprime o total de requisições HTTP e se o custo de cota é conhecido | documental |
| F10 `plan` sem os endpoints de mercado | `plan` os lista com o tier do registro | documental |
| F12 texto do provedor sem limite no arquivo | `rawBalance` só `^\d{1,80}$`; `chainIndex` só até 12 dígitos; saldo ilegível não guarda o texto | 2 de 2 |
| F13 alias nativo `0xeee...eee` somava duas vezes | vira o marcador nativo (`rede:native`) | 1 de 1 |
| F14 `store.latest` não conferia a conta do arquivo | confere `accountRef` contra o nome | 1 de 1 |
| F15 resposta vazia saía `valid` | seção `incomplete` (`no_rows_returned`) | 1 de 1 |
| F16 total menor que a soma recebia causas que só o aumentam | só causas que podem diminuir o total; sem elas, `divergent` | 1 de 1 |
| F17 scanner de pureza cego a `import()`, `Bun.spawn`, `Bun.$`, `globalThis[...]` | padrões acrescentados e teste de sensibilidade de cada regra | 12 + 10 amostras |
| F19 falha do store depois das leituras jogava a evidência fora | a evidência volta e `persisted.error` informa | 1 de 1 |

Não corrigidos, por decisão (as duas revisões): **F11** a origem (`okx_web3_api` ou `synthetic_fixture`) é afirmada pelo chamador, então um `fetch` falso marcado como real sai como "DADO REAL" (a CLI só usa `okx_web3_api` com cliente de verdade; testes devem usar `synthetic_fixture`); **F18** faltam bloco ou slot (RQ-04), RC2 não compara positivo com positivo nem trata preço ausente como pendência, e a tolerância de preço usa piso; **F20** a privacidade do `--history` está documentada acima, sem guarda contra `--store-dir` em pasta versionada; **RQ-04** `clockOffsetMs` só é aplicado, nunca medido, então a fonte da via OKX é sempre `unknown`.

### Segunda revisão (re-revisão das correções, subagente somente leitura em cópia isolada)

O revisor reproduziu 241 testes, mediu o que as correções fazem contra o código anterior, rodou 58 mutantes e achou uma regressão **introduzida pela correção F2**. Todos os achados foram tratados (R11 e parte de R10 por decisão, explicada na tabela), cada um com teste escrito antes (`rereview-fixes.test.ts`):

| Achado | Problema | Correção |
| --- | --- | --- |
| R1 P2 | O relógio do preço era comparado com o horário da leitura de saldos, mas o preço é lido depois do total, do histórico e do PnL (a 1 requisição por segundo): com `--history --pnl-chains 1,56` a diferença passava de 5 s e o valor virava `price_time_in_future`. | `PriceEvidence.fetchedAtMs` registra quando o preço foi lido e é a referência; sem ele, cai no horário dos saldos. Limites exatos testados (maxAge e 5 s de tolerância). Um relógio local mais de 5 s atrás do da OKX continua sendo `future` (sem desvio medido, é o comportamento seguro). |
| R2 P2 | O cache contava a idade desde `generatedAtMs`, não desde a leitura mais antiga: uma coleta de 3 s servia um dado com 63 s num limite de 60 s, e o REPORT dizia "nunca". | Idade desde a leitura mais antiga da evidência (`oldestCaptureMs`); acerto exatamente em `maxAge`, falha 1 ms depois e com relógio que andou para trás. |
| R3 P2 | Evidência de uma atualização que falhou (ou pulou partes) era guardada e servida do cache, e a CLI saía com 0 num acerto. | Só evidência limpa é servida (`isCleanCollection`: sem erro, sem parada, nada pulado, com saldos); a CLI usa a mesma regra; a impressão digital inclui `maxCalls`, páginas, prazo e teto por token. |
| R4 P2 | O `MANIFEST.sha256` era idêntico ao da versão anterior e 18 de 30 hashes falhavam com o comando do REPORT; não listava o teste novo. | Regenerado por último, sobre conteúdo LF, com os arquivos novos; o comando do REPORT foi executado e confere. |
| R5 P3 | `0XEEEE...` virava nativo e `0X` com outro endereço era inválido. | O alias só vale com `0x` minúsculo exato. |
| R6 P3 | A assinatura de duplicata tratava qualquer `isRiskToken` que não fosse `true` como `false`. | A assinatura usa o valor cru; duplicata com flag diferente, lixo ou ausente é conflito. |
| R7 P3 | Falha de gravação no `--store-dir` saía com 0; o `catch` escondia o erro de integridade como falha de disco; saída 0 ignorava `skipped`. | `EvidenceIntegrityError` é relançado; a CLI sai 1 com `persisted.error` ou com algo pulado. |
| R8 P3 | A CLI não tinha `--max-age-ms` e o TTL acima de 60 s era limitado em silêncio. | Opção `--max-age-ms` e aviso quando o TTL é limitado. |
| R9 P3 | O scanner não via `globalThis?.["fetch"]`, `Bun["spawn"]`, `import { $ } from "bun"`, `const { spawn } = Bun`. | Padrões ampliados, com amostras positivas e negativas. O scanner continua sintático: é uma rede de segurança, não uma prova. |
| R10 P3 | O dono do arquivo era conferido só pelos 16 primeiros hex do hash da conta. | Compara o hash inteiro. A conferência de `origin` (citada em F14) não foi feita: ela já entra na impressão digital do pedido. |
| R11 P3 | Pequenos deltas negativos viram `divergent`, o pior status. | Mantido, por ser a escolha segura e consistente; um preço que oscila entre as duas chamadas pode produzir esse estado. |

Sobreviventes da campanha do revisor que ganharam teste: limites do relógio do preço, faixa de épocas, `every` do grupo de duplicatas, `displayText` ilegível, `boundedChainIndex` em ativos esperados, histórico e Address Analysis, causas de delta negativo, M64, `-h`, roteamento das notas com `--json`, aviso de quota, lista de mercado do `plan` e o tier da seção de mercado.

## Família Address Analysis completa (código novo, sem revisão independente ainda)

Pedido do objetivo: cobrir Address Analysis "quando existente". Antes só havia overview e PnL recente; agora a família inteira da página do provedor, exceto o rastreador de vários endereços, tem leitor, construtor, conciliação, coletor, CLI e teste:

| Endpoint | Leitor | O que a evidência faz com ele |
| --- | --- | --- |
| `GET portfolio/token/latest-pnl` | `readLatestPnl` (um token por chamada, teto `perTokenCap`) | declarações de PnL do token; confere o **total do provedor contra realizado + não realizado** (tolerância 0,01 USD, exata no texto). Divergência vira `pnl_total_differs_from_parts` e um achado `PN`. `isPnlSupported` falso deixa os números nulos. |
| `GET portfolio/dex-history` | `readDexHistory` (janela `begin` e `end` obrigatória, 100 por página, teto de páginas, tipos 1 a 4) | negociações com tipo, identidade e texto exatos; duplicata colapsa; fora da janela pedida, rede ou contrato errados, valor ou quantidade ilegíveis não são confiados. Sinal novo de conciliação: **compra líquida na janela com saldo ativo zerado** exige reconciliação (`dex_history_window_net_buy`). |
| `GET portfolio/supported/chain` | `readPortfolioSupportedChains` (opt-in `supportCheck`) | registra se a rede pedida está na lista; com o opt-in, rede fora da lista é **pulada e dita** (`chain_not_listed_as_supported`), nunca lida como prova de que não há dados (a lista do exemplo pode ser parcial). |

Somas observadas (`acquisitions`): por ativo, contagem e soma de compras, vendas e transferências **da janela**. Rótulo fixo `partial_window` e estado `observed_window_only`; sem divisão, sem preço médio, sem custo. `costBasis` nunca tem valor: sem histórico on-chain fica vazio, e com ele traz uma declaração por ativo com `basisText: null` e o motivo. O limite é duplo: a janela pedida e os 1000 registros do provedor. Cada ativo informa quantas negociações ficaram **fora** das somas (`excludedTradeCount`), e duplicatas idênticas colapsadas tornam a seção `incomplete` (podem ser preenchimentos reais). Nada disso entra no **valor** do patrimônio (teste A3 também para esta família) nem no **status** dele: achados do PnL do provedor, linhas rejeitadas desta família e observações de risco degradam o status geral da evidência, não o `netWorth.status`, que só olha achados dos saldos ativos (`reconciliation.balanceStatus`). O sinal `dex_history_window_net_buy` só conta negociações até o instante em que os saldos foram lidos e só quando **todas** as negociações do ativo na janela foram lidas sem problema (um perna ilegível torna a posição líquida desconhecida).

CLI: `--pnl-tokens rede:contrato,...`, `--dex-history`, `--dex-days N` (1 a 365, padrão 30) e `--support-check`, todos exigem `--pnl-chains`. Um achado de teste desta etapa: uma opção posta como `undefined` na requisição quebrava a impressão digital do cache; agora é equivalente a omitida (teste de regressão).

### Terceira revisão (código novo da família e correções das duas primeiras)

O revisor rodou 138 mutantes sobre o código novo e as correções (55 mortos na primeira medição), inventou entradas hostis e conferiu as afirmações deste relatório. Nas camadas 1 e 2 (correções anteriores) **não achou regressão**. No código novo achou:

| Achado | Problema | Correção |
| --- | --- | --- |
| F1 P2 | Um `type` de negociação como `"constructor"`, `"toString"` ou `"__proto__"` era lido como função ou objeto, a negociação ficava `ok` e a evidência não podia ser montada (`CanonicalError`). | Tabela de tipos é um `Map`; qualquer outro valor é tipo desconhecido. |
| F2 P2 | O hash de identidade de negociação e de movimento on-chain usava valores crus do provedor: um `1e999` (Infinity) ou um aninhamento profundo derrubava o construtor depois que as leituras já tinham sido feitas. | `safeScalar` reduz o valor a texto, booleano ou número finito antes de entrar no hash; o campo ilegível vira estado, não exceção. |
| F3 P2 | Achados `PN` e linhas rejeitadas da família entravam no status do patrimônio, contradizendo "PnL nunca toca o patrimônio". | `reconciliation.balanceStatus` (RC1, RC2, RC3, RC5, RC6 e RC4 dos saldos) alimenta `netWorth.status`; o status geral continua levando tudo. |
| F4 P2 | Chegar ao teto de 1000 registros com o último cursor vazio dava `exhausted` e seção `valid`, e as somas pareciam de uma janela completa. | O leitor marca `provider_record_ceiling` e `truncated`. |
| F5 P3 | Cursor numérico ou objeto era lido como "sem mais páginas". | Erro de esquema nos três leitores paginados. |
| F6 P3 | `dex_history_window_net_buy` dava falso positivo com uma perna ilegível, com negociação posterior à leitura dos saldos e com movimento on-chain posterior. | Ativo com qualquer negociação não lida tem posição desconhecida; ambos os sinais só contam até o instante da leitura dos saldos. A unidade comum de `amount` entre os quatro tipos continua sendo uma premissa não verificada. |
| F7 P3 | Preenchimentos idênticos colapsados sem aviso e negociações excluídas sem contagem. | Aviso `dex_trades_collapsed`, seção `incomplete` e `excludedTradeCount`. |
| F8 P3 | `--pnl-tokens` repetido virava "falha do provedor"; token fora de `--pnl-chains` sumia; `--dex-days` sem `--dex-history` era ignorado. | Deduplicação do pedido, `skipped: token_chain_not_in_pnl_chains` e erro de uso. As redes além da primeira com dados continuam sendo lidas por inteiro e descartadas da seção (dito em `skipped`). |
| F9 P3 | Seção sem nenhum dado era `valid`. | `incomplete` com `nothing_returned`. |
| F10 P3 | O nome do esquema não mudou ao acrescentar campos obrigatórios. | `wallet_evidence_v2`. |

Os mutantes sobreviventes mostraram lógica nova sem teste (checagem simétrica do PN, números negativos, limites da janela, composição do identificador da negociação, ordenação, cobertura, relógio das seções, impressão digital do pedido, mapeamento das opções da CLI, e o teste do `plan`, que era vazio porque o `plan` sempre listava os nove endpoints). Vários testes das correções de leitores também estavam fracos: rejeitavam com um erro de rede mascarado em vez do erro de requisição inválida; agora conferem o tipo do erro e que nenhuma chamada saiu. Todos os sobreviventes ganharam teste; o placar final está na tabela de verificação.

### Nomes do contrato: SDD e código

| SDD (`design.md` §4) | Código |
| --- | --- |
| `portfolio_evidence_snapshot_v1` | `wallet_evidence_v2` (era `v1` no commit 8786fd6; o nome subiu porque campos obrigatórios foram acrescentados e uma evidência antiga não é mais aceita pela verificação) |
| `capturedAtMs`, `sourceTimeMs` | `fetchedAtMs`, `sourceTimeMs` (por seção, em `timing`) |
| `snapshotId` | `evidenceId` (16 primeiros hex de `contentSha256`) |
| chave `${chainIndex}:${native\|endereço}` | `${chainIndex}:native` e `${chainIndex}:contract:${endereço canônico}` |
| `EvidenceSnapshot` | `WalletEvidence` com as seções `balances`, `history`, `market`, `addressAnalysis` |
| vetores compartilhados da T1.1 e cópia web da T2.1 | não feitos |
