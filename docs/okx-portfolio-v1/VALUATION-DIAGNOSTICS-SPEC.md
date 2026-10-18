# Diagnóstico patrimonial da OKX Wallet — SPEC

Data: 2026-10-11. Baseline: `055a637f27f28cbf357cfb492534f7ed33d9b68f`. Entrega atual: especificação documental para revisão independente. O módulo foi implementado em src/okx-wallet/valuation-diagnostics.ts (testes T01 a T11); não tem consumidor em produção por desenho.

## Objetivo e resultado observável

Antes de usar o patrimônio da Wallet para dimensionar oportunidades ou reinvestir ganhos, o GEV precisa distinguir os dados recebidos das quantidades, preços e cobertura que conseguiu qualificar. A primeira entrega produzirá um diagnóstico local de uma captura de saldos: valores originais, seleção consultada, redes sem linhas, associações incertas, possíveis duplicatas e limites de frescor. Seus valores financeiros calculados permanecerão desconhecidos.

Essa entrega prepara uma integração do portfólio com a análise de liquidez, risco e retorno líquido. Meme Pump, Signals, Alpha Radar, Rewards e DeFi continuam no objetivo maior; não são implementados por este módulo. O caso narrado de US$68 para US$6.700 não é evidência de retorno reproduzível nem critério de aceitação.

## Base verificada

| Evidência | Observação e consequência |
| --- | --- |
| `src/okx-wallet/portfolio.ts`, `validateAssets()` e `request()` | O cliente existente conserva oito campos de cada token, mas retorna uma lista achatada e descarta envelope/agrupamento. Uma captura original não pode ser reconstruída a partir desse resultado. |
| Mesmo arquivo, `normalizeInventory()` | A normalização conserva `balanceText`, converte saldo/preço para `number`, perde `rawBalance`, texto de preço e endereço da linha, filtra redes não solicitadas e soma produtos representáveis. Não verifica unidade/escala nem duplicatas. |
| `src/okx-wallet/valuation.test.ts` | Casos existentes preservam subtotal zero e `valueComplete=true` para lista vazia, filtragem de rede estrangeira e nulidade do produto com overflow. Essa completude computacional não estabelece cobertura patrimonial. A nova entrega não muda esses contratos. |
| `src/okx-wallet/chains.ts` | Há registro local de redes, validação de listas e verificadores sintáticos de endereços. Formato não prova propriedade, cobertura da API ou unidade dos valores recebidos. Decimais da moeda nativa não qualificam a escala de `balance`/`rawBalance` do provedor. |
| `src/okx-defi/report.ts` | O padrão existente de relatório recebe captura declarada, mantém origem não verificada e separa frescor local da ausência de timestamp do provedor. Serve de referência de arquitetura; seus endpoints e envelopes não são intercambiáveis com Balance API. |
| `src/operator/cycle.ts` e `CAPITAL-BOUNDARY-AUDIT.md` | O ciclo mantém `realizedUsd=null` e atribuição não verificada para comparação de inventários. O diagnóstico não alimentará realizado, reservas ou reinvestimento. |

A [referência oficial de saldos](https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-all-token-balances) foi lida novamente em 2026-10-11: GET `/api/v6/dex/balance/all-token-balances-by-address`; endereço e redes, até 50 redes; filtro `excludeRiskToken` com `0` filtrando e `1` incluindo, padrão filtrado. A tabela indica strings para sete campos do token e booleano para `isRiskToken`; `tokenPrice` está em USD, e `rawBalance` pode estar vazio. A tabela e o exemplo não estabelecem relação formal entre saldo bruto, saldo exibido e decimais, clock de preço ou garantia de completude. A divergência `chains` Array/tipo versus CSV/descrição fica registrada; esta entrega não decide transporte.

O HTML público desta nova leitura foi preservado privadamente: 122.175 bytes, SHA256 `9615d02989dcd3f750a31fc6af843a5e82716ab3e873595f3a9b1abbf39038f2`, HTTP 200. Isso fixa somente aquela resposta documental, não uma revisão permanente da publicação nem comportamento da API. Não houve chamada à API de dados, autenticação ou observação da carteira. `RESEARCH.md`, `SOURCES.json` e `CONTRACT-COMPARISON.md/.json` permanecem evidência histórica de 2026-10-10, sem revisão silenciosa.

## Decisão técnica e compatibilidade

O Jev recomendou valuation para a próxima SPEC e uma captura com envelope como entrada. Os recibos e a proveniência das consultas estão preservados nas evidências privadas, com `approved_by=jev_delegated`, `human_response=false`, `authority=advisory_only`; custo faturado desconhecido. A recomendação não concede autorização financeira nem altera o gate SDD.

O módulo proposto é puro e aditivo: `buildWalletValuationDiagnostics({ capture, nowMs, maxAgeMs })`, em `src/okx-wallet/valuation-diagnostics.ts`. O chamador fornece um valor JSON já disponível; o módulo não captura tráfego, não lê arquivos/env, não cria cliente, não chama rede/modelo/carteira e não escreve estado. Capturas futuras do transporte precisam de uma entrega separada; não serão simuladas usando a lista achatada existente. O cliente, `normalizeInventory()`, o operador, o trader e seus testes mantêm comportamento e interfaces atuais.

## Contrato de entrada e limites locais

`capture` é um objeto JSON com os campos obrigatórios:

| Campo | Contrato |
| --- | --- |
| `schema` | Literal `okx_wallet_balance_capture_v1`. |
| `endpoint` | Literal `all_token_balances`; método/caminho do relatório ficam fixos na Balance API acima. |
| `sourceClaim` | `synthetic` ou `okx_api_claimed`; ambos são declarações não verificadas. |
| `capturedAtMs` | Inteiro seguro de 1 a 8.640.000.000.000.000, ou `null` para captura local sem relógio. |
| `request.address` | String aceita por `isAddressForChain()` para pelo menos uma rede solicitada; preservar o texto fornecido. Não prova propriedade. |
| `request.chains` | Lista aceita por `validateChainList()`: 1–50 redes conhecidas e únicas, com ordem preservada. |
| `request.excludeRiskToken` | String `0`, string `1`, ou `null` para parâmetro declarado ausente. Campo obrigatório; ausência do campo é erro de captura, distinta de parâmetro omitido. |
| `response` | Objeto JSON; sucesso somente com `code` numérico `0` ou string `"0"`; `data` array de objetos com `tokenAssets` array. Cada linha deve ser objeto. Arrays/grupos vazios são aceitos. |

`nowMs` usa o mesmo intervalo de inteiros positivos; `maxAgeMs` é inteiro seguro entre 1 e 3.600.000. Outros campos JSON do envelope, grupos e tokens são conservados, mas não usados para qualificar unidades, cobertura, elegibilidade ou timestamps novos. Campos adicionais do wrapper/request também não mudam a seleção contratada. Tipos ausentes ou inesperados dos oito campos de token geram diagnóstico da linha, sem descarte; falhas na estrutura de envelope/grupo/linha encerram o relatório.

Somente árvores JSON finitas, sem ciclos, acessores, símbolos, valores `undefined` ou objetos de runtime são aceitas. Limites locais: profundidade máxima 32, até 256 grupos, até 4.096 linhas no total e até 1 MiB de UTF-8 da representação `JSON.stringify(capture)`. São limites de recurso da entrega, não quotas anunciadas pela OKX. A profundidade da raiz é zero. Arrays preservam ordem e não aceitam buracos ou propriedades extras; objetos têm propriedades próprias de dados, enumeráveis, com chaves string. Todos os números JSON devem ser finitos. Não coercer entradas para fazê-las caber.

Erros públicos fechados: `WalletValuationDiagnosticsError` com `code` e mensagem iguais a `invalid_clock`, `invalid_capture`, `input_limit` ou `invalid_envelope`, sem payload bruto. Validar clocks de execução primeiro; árvores JSON/wrapper/seleção inválidos usam `invalid_capture`, limites excedidos usam `input_limit`, envelope sem sucesso/estrutura esperada usa `invalid_envelope`. Campos de token malformados são observações, não erros globais.

## Requisitos do relatório

**WVD1 — Representação e procedência.** Saída `schema=okx_wallet_valuation_diagnostics_v1`, método/caminho fixos, seleção copiada, `sourceClaim`, `verification=unverified`, relógios de entrada e cópia independente do JSON da captura. SHA256 dos bytes UTF-8 de `JSON.stringify(capture)` é `representedCaptureSha256`; usar a ordem comum de propriedades próprias do JSON e ordem dos arrays. Mudança de ordem de chaves pode mudar esse hash. Ele identifica representação local, não os bytes HTTP originais, lexemas numéricos anteriores ao parse, autenticidade ou ativos econômicos. Nenhuma referência a headers, credenciais ou carteira pessoal é criada. Cada linha tem locator JSON Pointer `/response/data/<grupo>/tokenAssets/<linha>`; a captura copiada permite verificar inclusive campos desconhecidos.

**WVD2 — Campos e unidades.** Para `chainIndex`, `tokenContractAddress`, `address`, `symbol`, `balance`, `rawBalance`, `tokenPrice`, `isRiskToken`, registrar `presence=absent|empty|present`, `jsonType=absent|string|number|boolean|null|array|object` e `rawValue`. `empty` vale somente para string de comprimento zero; `rawValue=null` para ausência é distinguido pelo estado/tipo. Não aparar, coercer ou substituir valor vazio por zero. Os campos de identidade/saldo/preço esperam strings; risco espera booleano. Tipo divergente recebe `invalid_type`; campo ausente recebe `missing_field`. Valores não textuais ficam no JSON copiado, sem interpretação financeira.

Para `balance`, `rawBalance` e `tokenPrice` textuais, registrar `syntax=empty|decimal_text|invalid_text`: `decimal_text` exige a string inteira composta de dígitos ASCII, opcionalmente ponto e pelo menos um dígito depois dele, sem sinal/espaço/expoente. Preservar zeros iniciais, zeros finais e textos grandes; não converter para `number`. `balance` e `rawBalance` têm `unit=unknown`, `scale=unknown`. `tokenPrice` recebe somente a anotação documental `documentedUnit=USD`; `decimalText` conserva o texto quando a sintaxe é decimal, caso contrário `null`. Sintaxe ou preço zero não demonstram preço executável, escala, precisão ou valor de mercado atual. Proibidos saldo×preço, divisão por decimais e qualquer soma monetária nova.

**WVD3 — Relógios.** `generatedAtMs=nowMs`. Para captura sem relógio: `localAgeMs=null`, `localFreshness=unknown`; para relógio futuro: idade `null`, frescor `future`; caso contrário idade `nowMs-capturedAtMs`, `fresh_local_capture` quando idade ≤ `maxAgeMs`, e `stale` quando maior. `providerPriceAsOfMs=null` e `providerPriceFreshness=unknown` sempre, inclusive com campos desconhecidos de timestamp no JSON. Frescor local só descreve a declaração de captura; não certifica atualização do saldo/preço.

**WVD4 — Seleção e cobertura.** Conservar todas as linhas, inclusive redes fora da seleção. Criar entrada para cada rede solicitada, na ordem solicitada: `observedRowCount` conta linhas com `chainIndex` string igual à rede; `accountMatchRowCount` conta somente as que também satisfazem WVD5. `presence=observed` quando a primeira contagem >0, senão `not_reported`. Exibir locators de linhas fora da seleção e de cadeia inválida/desconhecida. Sem linha significa ausência de observação, nunca saldo zero. Cobertura global `partial_unverified` sempre; `completePortfolioValueUsd=null`. Registrar filtro declarado: `0→filtered_claimed`, `1→unfiltered_claimed`, `null→default_filtered_claimed`; nenhum deles prova execução efetiva do filtro, segurança dos tokens ou cobertura completa. `isRiskToken` não booleano fica desconhecido.

**WVD5 — Associação e duplicatas.** Validar sintaxe do endereço solicitado e da linha por sua rede conhecida. EVM compara endereços válidos por lowercase; demais famílias usam igualdade textual dos formatos aceitos no registro local. Retornar `accountAssociation=format_match_unverified|mismatch|unknown`; não associar redes desconhecidas ou endereços inválidos. Cadeia conhecida mas fora da seleção é marcada `outside_selection`, mesmo que o endereço corresponda. Nunca associar por símbolo.

Identidade candidata somente com cadeia conhecida, endereço de linha válido e contrato válido pela mesma regra de família, ou contrato string vazio como indicação local de ativo nativo. A chave é a tupla rede/endereço de linha/contrato, com lowercase somente em EVM e marcador explícito para nativo; string vazia como nativo segue a normalização local, sem prova econômica. Para duplicatas dessa chave, inclusive entre grupos ou com diferenças de caixa EVM, marcar todas as linhas e listar seus locators. Contratos/endereços ausentes ou inválidos não recebem chave inventada. Preservar todas as linhas, `economicDeduplication=not_performed`; chave/digest/locator não certificam identidade econômica, propriedade ou ausência de dupla contagem wallet/DeFi.

**WVD6 — Limite financeiro e pureza.** `execution=not_qualified`, `eligibility=unknown`, `rowValueUsd=null` em todas as linhas e `completePortfolioValueUsd`, `netReturnUsd`, `realizedNetUsd`, `totalCostsUsd`, `executableExitLiquidityUsd`, `reinvestableUsd` todos `null`, para captura importada ou sintética. Não incluir compra/venda, ranking de lucro, taxa composta, sizing ou alteração de capital. Resultado determinístico para a mesma representação de entrada e clocks; não mutar entrada nem compartilhar referências JSON mutáveis com ela. A checagem local de representação não transforma dados declarados em dados verificados.

## Matriz de verificação e plano mínimo

Casos são planejados para a implementação futura; não foram executados nesta entrega documental.

| Caso | Entrada/condição → resultado exigido | Requisitos |
| --- | --- | --- |
| T01 | Capture sintética com dois grupos, campos extras, zeros iniciais/finais e risco booleano → copia integral, locators e descritores exatos; sem cálculos. | WVD1, WVD2, WVD6 |
| T02 | Cada campo de token ausente, vazio, `null`, tipo divergente e texto decimal/expoente/espaço/sinal → estados distintos, raw conservado, códigos pertinentes; zero textual não vira ausência. | WVD2 |
| T03 | Quantidades além do intervalo de `number`, preço zero e decimais do registro nativo → continuam texto/escala desconhecida; todos os valores derivados nulos. | WVD2, WVD6 |
| T04 | Clocks nulos, futuros, idade zero, idade igual ao limite e limite+1 → resultados WVD3; relógios fracionários/negativos/zero/fora do intervalo e maxAge fora de 1–3.600.000 → `invalid_clock`. | WVD3 |
| T05 | `data=[]`, grupos vazios, redes solicitadas sem linhas, filtro omitido/0/1, rede extra ou desconhecida → nenhuma linha descartada, matriz solicitada explícita, cobertura parcial e patrimônio total nulo. | WVD4 |
| T06 | Endereço de outra conta, formato inválido, caixa EVM, caso não EVM e rede sem formato compatível → associação correspondente, sem propriedade inferida. | WVD4, WVD5 |
| T07 | Mesmo contrato/endereço/rede em grupos distintos e caixa EVM, símbolo igual em ativos distintos, nativo versus contrato e identidade incompleta → marcar duplicatas candidatas corretas, conservar linhas, nunca somar/deduplicar economicamente. | WVD1, WVD5 |
| T08 | Código `0`/`"0"` versus erro; grupo/linha/envelope malformados; captura/schema/endpoint/seleção/filtro inválidos → aceitação/erro público exato, sem dados brutos em mensagens. | WVD1, WVD4, WVD6 |
| T09 | Limites 32/256/4.096/1 MiB e cada limite+1; ciclos, buracos, acessores, valores não JSON e números não finitos → fronteiras definidas e erros fechados. | WVD1, WVD6 |
| T10 | Mesma entrada/clocks duas vezes; mudança posterior da entrada/saída; mocks de I/O/env/modelo que falham se acessados → saída determinística, cópia sem aliasing e zero acessos proibidos. Valores numéricos/ordem de chaves só são a representação JSON já fornecida. | WVD1, WVD6 |
| T11 | Captura `okx_api_claimed`, preços válidos e hora local fresca, inclusive timestamps extras → origem ainda não verificada, clock de preço desconhecido e todos os campos financeiros nulos. | WVD1–WVD6 |

Quando um novo ciclo estiver elegível: primeiro congelar esta SPEC/aceitação e manifestos no ciclo suportado; obter regressões T01–T11 que falhem; implementar somente `src/okx-wallet/valuation-diagnostics.ts` e seu teste, com fixture sintética em arquivo exclusivo se necessário; executar os testes pertinentes e typecheck raiz; verificar contratos existentes de portfólio/valuation; revisar independentemente em cópia isolada e auditar. Não criar CLI, endpoint web, dependência ou integração automática com decisão/capital nesta primeira entrega. O integrador é o único escritor do seam público; escritores auxiliares futuros precisam de workspace e arquivos exclusivos.

## Aceitação desta SPEC e dependências

Os critérios documentais VD1–VD10 foram congelados privadamente antes da escrita: rastreabilidade, seleção/origem, representação fiel, unidades desconhecidas, clocks separados, cobertura parcial, identidade candidata, pureza/compatibilidade, testes verificáveis e respeito ao escopo/gates. A revisão deve avaliar esses critérios contra fontes fixas e comparar hashes antes/depois; aceitação documental não comprova implementação ou execução dos testes planejados. Os critérios, recibos, manifestos e pareceres permanecem nas evidências privadas da própria tarefa, fora do repositório.

EC1–EC7 e os contratos patrimoniais V/T/C anteriores permanecem intactos. O estado SDD observado continua revisão 46, `audit/completed`, `next=null`; a tentativa anterior de `begin_cycle` encontrou `stale_evidence`. A [skill do harness](C:/Users/gabri/.codex/skills/codex-desktop-harness/SKILL.md) determina: “Audit completion is terminal.” Esta SPEC é preparação de dependência; não reaproveita cobertura terminal, reabre ciclo, altera runtime/private state, substitui o pesquisador sob limite nativo ou fornece aprovação humana. Implementação aguarda continuação por mecanismo suportado do harness com evidências válidas.

Após um diagnóstico implementado e aceito, o próximo incremento poderá conectar captura real qualificada ou definir unidades/identidade/fluxos/custos para atribuição patrimonial. Preço declarado, saldo observado e subtotal computacional não são liquidez de saída nem lucro líquido reinvestível. Nenhuma evidência desta SPEC demonstra oportunidade lucrativa, retorno realizado ou crescimento composto.
