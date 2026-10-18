# SPEC do ciclo DEX V2 — leitura de cotações

Preparada para congelamento; implementação depende da auditoria E1–E8, parecer independente do escopo e transição SDD válida. Este texto ainda não é evidência de congelamento. Fontes: OKX-DEX-QUOTE-CONTRACT-20261009.md (4ce9b26ed0dd15e6cb52bd8057f0a6f9186a2ad7f8c970e81a984817febe87cb), OKX-DEX-NEXT-PROPOSAL.md e recibo Jev Workflows 75588b2a-1468-472d-8956-6c9082c75baf. A escolha técnica foi single_route/new_dex_client_and_pair; human_response=false, approved_by=jev_delegated. Nenhuma autorização financeira decorre dela.

## Seams públicos acordados

Novo src/okx-market/okx-dex.ts, sem alterar a allowlist de cinco endpoints do cliente Market. createOkxDexReadOnlyClient({credentials:{apiKey,secret,passphrase},fetch?,now?:()=>Date,timeoutMs?,minRequestIntervalMs?,wait?:async(ms)=>void}) retorna supportedChain(chainIndex) e quote({chainIndex,fromTokenAddress,toTokenAddress,amount,priceImpactProtectionPercent}). Ambos retornam Promise<Record<string, unknown>[]> extraindo data do envelope validado; a orquestração valida identidade, unidades, cobertura e riscos nesses registros. Somente GET fixed-origin /api/v6/dex/aggregator/supported/chain e /api/v6/dex/aggregator/quote. exactIn e singleRouteOnly=true fixos. Não aceitar arbitrary URL, path ou wallet. Intervalo padrão 1.100 ms entre início de chamadas, sem retry; não garante tier/RPS real. Testes usam wait/clock controlados, não sleeping real.

quoteRoundTrip({client,chainIndex,tokenA:{address,decimals,metadataSource},tokenB:{address,decimals,metadataSource},amountAtomic,policy:{maxElapsedMs,maxImpactMagnitudePercent},now?:()=>number,source:'synthetic'|'okx_authenticated'}) é orquestração pública. Cliente injetado é fronteira. Revalida parâmetros antes de supportedChain e interpreta respostas brutas. Executa uma cobertura e no máximo duas quotes sequenciais. maxElapsedMs padrão CLI 5.000 ms, impacto magnitude 1%, proteção enviada 1; parâmetros explícitos no relatório, política local não recomendação de investimento. Endereços são contratos de ativos públicos, nunca carteiras do usuário. Decimais esperados obrigatórios, 0–255 inteiros, metadados com origem explícita. amountAtomic string positiva sem zeros iniciais, até 78 dígitos; comparações e delta com BigInt. Chain ^[1-9]\d*$; EVM compara caixa, Solana 501 preserva caixa. Tokens distintos.

Saída: source, chainIndex, token identities/decimals, input/output strings, quotedGrossDeltaAtomic string nullable, tempos locais request/receive/elapsed, price impact e token tax fractions observados, network estimates nas unidades originais, status quoted_gross_delta/blocked/unknown, razões. execution=not_qualified; liveQualified=false; netAtomic=null, netStatus=net_not_evaluated, costsCoverage=unknown. Nenhum cenário pode converter um par de quotes em lucro líquido observado: cobertura total de custos e atomic output são dependências não qualificadas. O delta é inferência dimensional de quantidade cotada, não PnL.

Uma função separada hypotheticalRoundTripEconomics({inputAtomic,outputAtomic,externalCostsAtomic,bufferAtomic}) calcula valores BigInt apenas com hipóteses declaradas e completas em A. Resultado hypothetical=true, execution=not_qualified, netAtomic string, eligible somente se net>buffer. Custos já inclusos na output não são subtraídos novamente; esta função não converte fees USD/gas nem assume que custos externos arbitrários sejam completos. Campos omitidos/negativos/não inteiros falham. Exibe a suposição de cobertura completa como fornecida pelo chamador, nunca comprovada pelo provedor. Não recebe dados brutos live automaticamente.

Script novo scripts/okx-dex-quote.ts, comando okx:dex-quote com bun --no-env-file. Sem flags: fixture sintética pareada, zero fetch. --live exige todos parâmetros e três credenciais OKX Web3 completas, sem ler .env ou PRIVATE_KEY; nenhuma invocação live nesta entrega. Flags explícitas: chain, token-a/token-b, decimals-a/decimals-b, metadata-source-a/metadata-source-b, amount-atomic. Não capturar saldo/endereço real ou enviar quotes ao JEV. Erros sanitizados, sem body/URL/input secrets.

## Aceitação imutável após congelamento — D1–D8

D1. Duas rotas GET somente leitura, HMAC exato, query determinística apenas documentada, redirect error, validação antes de fetch, intervalo e timeout para HTTP+JSON, erros sanitizados e zero retry. Nunca usar swap/approval/broadcast/private key.

D2. Rede/token/decimais/input de cada perna validados, exatamente uma quote por resposta, A→B→A na mesma rede, segunda entrada exatamente primeira saída, amounts sem Number. Catálogo ausente/duplicado/mismatch bloqueia dependentes. Hops intermediárias não são erroneamente comparadas ao token externo. Decimais divergentes e IDs errados não geram delta.

D3. Tempos locais positivos inteiros, monotônicos, maxElapsed explícito; clock futuro/regressivo/velho e timeout rejeitam. Não rotular auth timestamp como freshness do mercado. Impacto decimal assinado válido inclusive negativo, magnitude <= política; null/inválido/honeypot true ou unknown impede interpretação dependente. taxRate fração [0,1] ou desconhecida, jamais zero implícito.

D4. Delta bruto cotado e hipotético separados de retorno líquido. Quotes reais/sintéticas de provedor têm netAtomic=null e motivos de cobertura de taxas/unidade não qualificada. tradeFee USD e estimateGasFee nativo não são somados, tax/LP/hook/infra não são rededuzidos por suposição. Cenário manual hipotético usa custos externos explícitos em A e compara net estritamente com buffer, sem afirmar completude real.

D5. CLI sintética default, flags e credenciais completas antes da rede, sequência finita <=3 chamadas e sem polling/retry. Quota/custo live desconhecidos null; método/host/dados não indicam conta habilitada.

D6. Preservar os oito módulos Market revisados e todos arquivos concorrentes; somente novos módulos/CLI e seams mínimos do integrador. Zero egress de segredo/carteira/saldo/JEV automático, nenhum endpoint ou proposta financeira executável.

D7. TDD público RED/GREEN documentado; queries/HMAC, overflow atomic, mismatches, decimais, signed impact, unknown tax/honeypot, cobertura, clocks, erro/timeout/429 e CLI zero rede. Suíte pertinente e typecheck, revisão independente isolada com manifest antes/depois. Nunca certificar live com fixtures.

D8. Guia português com fontes, limites de unidade/custo/cobertura/quote/execução e próximos passos de histórico fora da amostra/futuros demo/propostas assináveis como pendências separadas. Relato US$68→US$6700 continua não verificado. Nenhuma promessa de crescimento/retorno ou garantia de venda.

Responsabilidade de implementação: implementador isolado só okx-dex.ts/okx-dex.test.ts e log TDD; integrador owns round-trip.ts/tests/fixture/CLI/seams/docs. Revisor cópia isolada somente parecer. Sem staging/push/publicação neste ciclo.

## Estados e tempos observáveis

Input inválido do chamador é rejeitado antes de qualquer método do cliente. Uma chain descoberta ausente bloqueia consultas dependentes. Catálogo ou envelopes ambíguos/malformados deixam estado unknown; identidade/decimais/quantidade incompatíveis ou honeypot true bloqueiam a interpretação. Honeypot ausente/inválido e impacto ausente/inválido deixam unknown. Magnitude acima do limite bloqueia. Nenhum desses estados produz delta ou solicita uma perna que dependa do dado inválido. Um par válido pode produzir quoted_gross_delta, incluindo delta negativo. Não se seleciona silenciosamente o primeiro item.

Os instantes são capturados pelo relógio local injetável em começo, request/receive por perna e término. Cada instante é inteiro positivo; a sequência não pode regredir, e nenhum receive pode ficar no futuro em relação ao término. O elapsed do cenário inteiro inclui descoberta de cobertura. Antes de iniciar uma perna dependente e ao terminar, conferir maxElapsedMs. Esses controles limitam duração local; não provam idade do preço do mercado nem TTL do fornecedor.

Metadados explícitos do chamador e os decimais do token retornado são comparados em cada perna. O campo decimal de resposta documentado é string de inteiro; os amounts permanecem strings inteiras positivas até 78 dígitos e só entram em BigInt. Impostos desconhecidos não viram zero; estimativas de rede podem ser null e são registradas com unidade, sem conversão ou soma. Relatório não inclui headers, objetos de credencial, raw errors ou endereço/saldo de carteira. Endereços públicos de contratos são a identidade dos ativos do cenário.

## Verificação e limites

Executar testes públicos em ciclos verticais; marcar RED comportamental apenas quando observado. CLI subprocess é executado com diretório temporário e ambiente reduzido, fetch bloqueado e credenciais fictícias. Testar pipeline cliente real com fetch injetado e orquestrador para conferir os schemas juntos. Verificar todos os módulos Market anteriores por hash. Revisão independente recebe manifesto do snapshot e D1–D8; só o parecer pode ser escrito. A contagem de testes não certifica lucro, qualidade financeira do JEV, RPS, custos cobrados, fundos ou extensão conectada.
