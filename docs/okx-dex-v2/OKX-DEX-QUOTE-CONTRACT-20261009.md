# Contrato factual DEX quote — 2026-10-09

Escopo exclusivo: esclarecer três páginas primárias para uma futura proposta de cotações A→B→A, somente leitura. Nenhum endpoint autenticado foi chamado. Este arquivo especifica evidência e critérios propostos; não implementa, aprova ou certifica o sistema.

Baseline reutilizado: `docs/OKX-INTEGRATION-RESEARCH-20261009.md`, SHA-256 `C83291232EA82F0A9505F647E0CAEFF14A4A494FCE44F11392159C5EB69FDFA0`. As cinco rotas Market já investigadas não são repetidas aqui. A skill research foi relida; esta tarefa já é a pesquisa delegada de background solicitada pelo coordenador.

## 1. Evidência factual delimitada

### D1 — Get Quotes

[Contrato oficial](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote), tabelas Request/Response e exemplo JSON:

- `GET /api/v6/dex/aggregator/quote`.
- Obrigatórios string: chainIndex, amount, fromTokenAddress, toTokenAddress.
- amount usa unidades mínimas; exactIn é entrada; exactOut saída; maxIn depende de saldo. Default exactIn.
- Opcionais string: swapMode, dexIds, excludeDexIds, excludePoolAddresses, priceImpactProtectionPercent, feePercent. Boolean: forJitoBundle, directRoute, singleRouteOnly, singlePoolPerHop, assetAwareRouting.
- Filtros DEX são CSV; pools excluídos até 20. directRoute: Solana/um pool; singleRouteOnly: sem splits, permite hops; singlePoolPerHop: um pool/hop.
- Impacto percentual é assinado; pode ser null. Proteção default 90, 100 desabilita. feePercent desconta comissão da entrada; saída contempla essa comissão configurada.
- taxRate: fração 0–1; fromToken=venda, toToken=compra. Decimais são referenciais/mutáveis. tokenUnitPrice pode ser null e é preço recomendado.
- tradeFee=rede estimada USD; estimateGasFee=unidade mínima da chain. Taxas completas embutidas não são garantidas.
- Sem routerResult, TTL/timestamp, slippage, userWalletAddress na tabela. Exemplo request chain=1, resposta=130: não pareados.

Trechos literais curtos: “Estimated network fee (USD) of the quote route”; “resulting estimated amount”; “Token tax rate for selling”.

A gramática abaixo registra os identificadores funcionais e tipos da tabela/exemplo, sem ampliar os fatos nem afirmar campos obrigatórios de resposta que a página não marca.

```text
Envelope := {code:string,msg:string,data:Quote[]}
Quote := {
  chainIndex:string, swapMode:string,
  fromTokenAmount:string, toTokenAmount:string,
  fromToken:Token, toToken:Token,
  estimateGasFee:string, tradeFee:string,
  priceImpactPercent:string|null, router:string,
  dexRouterList:Hop[]
}
Token := {
  tokenContractAddress:string, tokenSymbol:string,
  tokenUnitPrice:string|null, decimal:string,
  isHoneyPot:boolean, taxRate:string
}
Hop := {
  dexProtocol:{dexName:string,percent:string},
  fromToken:Token, fromTokenIndex:string,
  toToken:Token, toTokenIndex:string
}
```

A tabela também lista dexName/dexLogo/amountOut/tradeFee em outra sequência sem hierarquia clara; o exemplo não os apresenta como campos de Hop. Não inventar um subobjeto “routerResult” ou um array “chains”. Preservar extras como dados brutos não interpretados. A forma string “null” versus JSON null não é esclarecida para preço recomendado: tratar ambas como indisponíveis, sem coerção numérica.

Inferência dimensional a congelar: interpretar os amounts de resposta na unidade atômica indicada por decimal é consistente com a entrada e os exemplos; a descrição de toTokenAmount não repete expressamente “smallest unit”. Isso não foi confirmado live. Unidade ambígua nunca permite saldo/PnL líquido.

### D2 — Get Supported Chains

[Contrato oficial](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-aggregator-supported-chains): `GET /api/v6/dex/aggregator/supported/chain`. Query opcional `chainIndex:string`. Envelope `{code:string,msg:string,data:Array<{chainIndex:string,chainName:string,dexTokenApproveAddress:string}>}`. Endpoint descreve swaps de uma chain. Não informa timestamp, TTL, rate próprio, walletAddress, saldo ou autorização assinada do usuário.

Trecho literal: “Retrieve information on chains supported for single-chain swap.”

O campo de contrato de aprovação é metadado; a página informa que pode ser vazio. A requisição não tem identidade de carteira: inferência, não é prova de allowance individual. Não usar esse campo para afirmar “carteira autorizada”. Nenhuma aprovação precisa ser executada para a pesquisa de cotações.

O exemplo JSON da página tem vírgula após o último elemento de data, inválida em JSON estrito; registrar o exemplo como documentação, não importá-lo cegamente como fixture. O schema é baseado na tabela e no envelope demonstrado, sem copiar esse erro de sintaxe.

### D3 — Trade API Fee

[Contrato oficial](https://web3.okx.com/onchainos/dev-docs/trade/api-fee): Trial exige conta no Developer Portal e email/telefone verificados; funções selecionadas, 60 dias desde criação da chave, 1 RPS padrão, até 5 após análise/aprovação. Start-up anuncia 2–50 RPS, dependentes de volume/elegibilidade. Enterprise tem contrato customizado.

Trial retém slippage positivo eventual como infraestrutura, cap de 10% do valor negociado. Start-up: revenue share de 20% sobre receita de partner fees ou retenção de slippage positivo quando sem partner fee. Não é cobrança fixa de 10% de todo swap, nem garantia de conservar ganho de execução melhor que a cotação.

Trechos literais curtos: “1 request per second (RPS)”; “60 days”; “Positive slippage only”.

A página não documenta timeout, SLA de latência, frescor da cotação, custo por leitura individual, saldo de quota atual ou rate da conta do usuário. Desconhecidos permanecem null/unknown. Nenhuma habilitação foi verificada. Não solicitar upgrade, instalar SDK, assinar contrato ou pagar neste seam.

## 2. Resolução das ambiguidades solicitadas

| Pergunta | Conclusão desta investigação | Classificação |
|---|---|---|
| Existe routerResult na resposta quote? | Não documentado na tabela/exemplo; string ausente no HTML capturado de D1. O objeto Quote é diretamente elemento de data | Fato sobre a documentação consultada; não prova de todas as versões live |
| Existe chains como identidade de rota? | Não é campo no schema documentado de quote. A chain da cotação precisa ser validada pelo campo global e pelo request | Fato + requisito proposto |
| from/to amounts são balanços reais disponíveis? | Valores do cenário de cotação; não comprovam saldo, fill, posse do ativo ou transferibilidade | Inferência limitada |
| toTokenAmount inclui taxRate, LP, hooks, sniper e infraestrutura? | Nenhuma garantia expressa completa localizada nas três páginas. A explicitação de comissão configurada não resolve os demais custos | Unknown |
| estimateGasFee é gasLimit para multiplicar por gasPrice? | O contrato o descreve em unidade mínima da chain; não fornece aqui decomposição ou regra de multiplicação | Unknown para tal conversão |
| tradeFee é somável novamente com estimateGasFee? | Ambos descrevem estimativas de rede. Não há demonstração de independência aditiva | Não somar por inferência |
| Há prazo de validade da quote? | Não documentado; recebimento local não é timestamp do preço do provedor | Unknown |
| Quote exige conexão/assinatura de Wallet? | ExactIn não lista wallet como parâmetro nem payload de autorização. Exemplos usam headers API OKX; não chamam Wallet | Interface documentada distinta; live não verificado |
| Como limitar mesma chain? | Uma chain explícita no request; confirmar igualdade no resultado. Nenhum parâmetro de destino cross-chain consta desta rota | Proposta |
| Escolher DEX/pool garante tarifa conhecida? | Filtros reduzem o universo, não demonstram custos finais nem completude da rota | Inferência |
| Impacto negativo é schema inválido? | Não: exemplo -67.53 e fórmula assinada. Não converter sinal em prova de ganho nem rejeitar todo negativo como erro de parse | Fato + limite |
| Todas as hops repetem o token externo de entrada? | Não; exemplo inclui wrapping e tokens intermediários. Não comparar cada hop diretamente ao input externo | Evidência de exemplo + requisito proposto |

Esta matriz distingue ausência documental de inexistência operacional. Nenhuma hipótese aqui foi “resolvida” por aconselhamento JEV ou chamada live.

## 3. Seam proposto para pesquisa A→B→A

Requisitos propostos abaixo são política local a congelar pelo coordenador; não claims do fornecedor.

- **Q1 — Entrada explícita:** chain única; A e B distintos; quantidade positiva inteira em unidades mínimas; decimal esperado e origem de cada metadado registrados. Modo fixo exactIn. Não usar saldo, maxIn, fee receiver ou endereço de usuário. Os contratos dos tokens de mercado são identidade pública de ativos, não endereços de carteira.
- **Q2 — Catálogo:** uma leitura de supported/chain, com chainIndex solicitado e validado. Ausência/duplicata conflitante/bad schema impede chamadas dependentes. dexTokenApproveAddress não é usado para transações nem como indicador de permissão.
- **Q3 — Cliente mínimo:** origem fixa e allowlist apenas das duas rotas desta proposta. Reutilizar assinatura API determinística do baseline; sem cookie auth. CLI padrão offline; live gated por parâmetros e credenciais próprias, sem .env dumping ou private keys.
- **Q4 — Política de rotas:** admitir apenas parâmetros documentados explicitamente configurados. Nenhuma query slippage/TTL/chains/wallet adicionada por suposição. Interações entre filtros, aceitação efetiva pelo tier e efeito de assetAwareRouting/forJitoBundle são dependências live; não afirmar que foram exercitadas. Não “corrigir” IDs sem discovery factual.
- **Q5 — Sequência:** quote entrada A→B; validar; usar exatamente a saída inteira retornada como input B→A, sem float e sem rededuzir taxas. Suprimir quote dependente se a primeira for inconsistente. Não converter casa decimal antes da segunda chamada.
- **Q6 — Identidade:** validar chain/from/to do objeto global; input efetivo precisa corresponder ao cenário exato solicitado. Seleção arbitrária do primeiro elemento de data é proibida: resultado vazio, múltiplo ou conflitante exige regra congelada ou unknown. Comparar os decimais do mesmo ativo entre as duas pernas; divergência impede interpretação econômica. Hops podem ter tokens intermediários.
- **Q7 — Tempo e volume:** registrar requestedAt, receivedAt e latência locais por perna, mais elapsed do par. Timeout finito, idade máxima local e teto de chamadas devem ser configuração congelada/testável. Nenhum timestamp local recebe rótulo “market timestamp”. Usar limitador por chave/rotas, nunca retry automático para 429/timeouts. Rate de 1 RPS é a hipótese operacional conservadora do Trial; tier real permanece desconhecido, não ganho medido.
- **Q8 — Interpretação:** impacto assinado é validado como decimal; gate de risco precisa especificar como compara magnitude/perda/limite, sem depender do default do provedor. Null/ausência/não finito não passam como zero. Limites quantitativos são decisão do coordenador/JEV dentro da autorização, não fatos inventados por esta pesquisa.
- **Q9 — Estados:** quote válido pode produzir quoted_gross_delta; nunca “arbitragem executável”. Desconhecidos críticos produzem net_not_evaluated. execution é sempre not_qualified. Dados/recomendação não habilitam signer, approval, swap, broadcast ou ordem.

Alternativas reais para a rota local: observar agregação padrão (maior cobertura, interpretação mais complexa), uma rota sem split (mais auditável, ainda aceita hops), ou pool direto onde documentado (menos cobertura). Não foi escolhida política visual/técnica pelo pesquisador; o coordenador dispõe do contrato para a consulta JEV delegada.

## 4. Ledger proposto: sem dupla contagem

Para o cenário inteiro, sejam I unidades de A na entrada e O unidades de A na saída da segunda quote. Pode-se calcular `quotedGrossDeltaAtomic = O - I`, pois é o mesmo ativo e unidade. Isso é diferença de saídas estimadas de duas consultas; não um ganho realizável.

Cada componente de custo terá `{category,leg,amount,unit,source,coverage}`, onde coverage é `included_in_quote | external_estimate | unknown`. Sem inferir cobertura a partir de nome da taxa:

| Componente | Política proposta de contabilização |
|---|---|
| Custos explicitamente comprovados dentro da saída | Registrar atribuição; não subtrair de novo |
| Tax/impostos do token, LP, hooks, sniper | Até prova da cobertura, unknown; não aplicar taxRate duas vezes nem zerar |
| Rede | Uma estimativa por perna; nunca somar USD e quantidade nativa como valores diretamente aditivos |
| Approval, wrapping adicional, rent, L1 data fee, priority/tip | Não presumir cobertura/necessidade universal; cada item exige evidência no contexto da rota |
| Slippage adverso/latência/impacto pós-quote | Cenário hipotético explícito, separado do preço cotado; não afirmar garantia de execução |
| Slippage positivo/infraestrutura | Não incluir benefício ao usuário sem termos/resultado comprovados |
| Custos JEV/infra/API | Ledger próprio com moeda, período e alocação documentados; custo desconhecido não é zero |

Se custos externos completos conhecidos forem E na mesma unidade A, então `estimatedScenarioNet = O - I - E`. Essa expressão só é elegível quando coverage e conversões são comprovadas. Enquanto permanecerem dúvidas documentais de embedding e execução, publicar valores observados/estimados e motivos de unknown, **sem concluir lucro líquido**. Conversão de USD para A exige referência/tempo/unitPrice válidos e é uma estimativa; stablecoin não é automaticamente USD com valor 1.

## 5. Critérios propostos para revisão independente

O revisor recebe este hash, SPEC final imutável e fixtures próprias explicitamente sintéticas; exemplos oficiais não pareados e JSON com trailing comma não são baseline de execução.

| ID | Verificação observável |
|---|---|
| AQ1 | Offline, credenciais faltantes ou inputs inválidos resultam em zero rede; somente duas rotas aceitas |
| AQ2 | Testes de query/assinatura preservam o caminho transmitido; nenhuma wallet permission/transaction API é acessível |
| AQ3 | IDs errados, shape objeto em vez de array, code não zero, múltiplos resultados e decimal divergente falham com razão, sem resultado líquido |
| AQ4 | Quantidade acima de Number.MAX_SAFE_INTEGER percorre duas pernas sem arredondamento; input da segunda é exatamente o output da primeira |
| AQ5 | Risco honeyPot true, impacto null e valores inválidos não são normalizados para seguros/zero; negativo válido é parseado |
| AQ6 | Um custo com duas representações de unidade não é contado duas vezes; fee unknown impede net; custo comprovado embutido não é rededuzido |
| AQ7 | Elapsed/future local clock/timeout/429 são testados com clock/transport controlados, sem loops de retry ou claim de freshness do fornecedor |
| AQ8 | Dados secretos/marcadores privados não aparecem em logs/output/JEV; resultado positivo sintético continua scenario/not_qualified |
| AQ9 | Build/typecheck/testes de regressão pertinentes e revisão independente são executados no baseline fixo; simulação não é confundida com acesso live |
| AQ10 | Qualquer futuro exercício live preserva quota/latência reais e erros originais sanitizados; não pode substituir essas evidências por fixtures |

Não objetivos: aprovação/token allowance, troca real, bridge, fundos de usuários, conta Exchange, auto upgrade, x402/pagamento, instalação, publicação ou promessa de retorno. Nenhuma dessas ações foi executada.

## 6. Capturas, evidência negativa e erros

Somente páginas públicas foram recuperadas. Todas as três capturas responderam HTTP 200, sem erro de rede neste aprofundamento. Ausências de substrings abaixo são verificações auxiliares do HTML capturado, não enumeração de capacidades de toda a API:

- D1: substrings exatas routerResult, userWalletAddress, timeout, timestamp e ttl ausentes; dexRouterList presente duas vezes. O header maiúsculo OK-ACCESS-TIMESTAMP está no curl de autenticação e não é timestamp de frescor da resposta. “slippage” aparece uma vez na explicação de exactOut, sem parâmetro de query correspondente.
- D2: timeout/timestamp/ttl ausentes; a palavra chains aparece no texto/navegação e não prova um campo “chains”.
- D3: “1 request per second” e “60 days” presentes; timeout/timestamp/ttl ausentes.

As diferenças de hash/um byte frente ao relatório anterior identificam capturas distintas; não provam mudança de contrato. Hashes são dos bytes de resposta pública obtidos com fetch, após decodificação de transporte, sem persistir HTML bruto.

| Fonte | Captura UTC | HTTP | Bytes | SHA-256 |
|---|---|---:|---:|---|
| D1 [Quote](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote) | 2026-10-09T21:32:10.955Z | 200 | 128589 | `b1ce5606874ac88bfac0a30e7c07b74fa8c8d98f4811f8ce0e7e07b8d159837e` |
| D2 [Supported chains](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-aggregator-supported-chains) | 2026-10-09T21:32:10.932Z | 200 | 63372 | `82afdb740e49f357b8f3f99bc3bb78de918816217577383a68822c72990f87c2` |
| D3 [API fee](https://web3.okx.com/onchainos/dev-docs/trade/api-fee) | 2026-10-09T21:32:10.938Z | 200 | 61367 | `08f94cbb33acef2b5fdef5ed62a3d7912c3b4acbb7b37d23e1b15516bd408800` |

Limites de evidência: tabelas planas não fixam todas as hierarquias/requiredness, exemplos não certificam live, não há teste de credenciais/tier, nenhuma cobertura completa de custos foi obtida, nem TTL documentado. A futura SPEC deve representar isso diretamente. Próximo passo elegível: coordenador congelar política/Q1–Q9 e AQ1–AQ10, preparar implementação em seam isolado e revisão por outro agente; esta pesquisa não é a aprovação.
