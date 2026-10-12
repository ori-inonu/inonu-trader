# DeFi discovery — contratos concretos antes de G1–G8

2026-10-11. **Pesquisa/advice; não é SPEC congelada, implementação ou aprovação.** Objetivo: preparar contratos verificáveis para ligar descoberta DeFi à central e à pesquisa tipada JEV. O objetivo completo JEV/OKX continua incompleto.

## Identidade, fontes e limites desta entrega

Pesquisador desta conversa: `01a12adc-473d-7381-b067-c83af7ccda31`, distinto do integrador e do revisor de escopo. GPT-6.1 Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Harness e skill research aplicados proporcionalmente; contexto próprio recuperado, metadados antigos não concedem autorização.

Origem por instrução somente leitura: `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader`. Código lido como blobs do commit **1f08e6edd589449a82eeb70638987a09572a3bd2**, tree **15b1fe6b2ac58c5821b9ab77723610d0afe780aa**, sem seguir HEAD concorrente. Inspeção estática feita a partir da pasta exclusiva ordinária; não afirmo sandbox OSRO, cópia executada ou testes passados. Nenhum app, teste, feed, provider, wallet, signer, RPC, instalação, Git mutation ou consulta própria JEV. Não li ambiente/.env/segredos. Avisos consultivos automáticos não congelam critérios nem concedem autorização. Só este relatório é escrito; artefatos anteriores preservados.

Documentos físicos atuais conferidos, separados dos hashes de blobs Git/LF:

- Draft `docs/DEFI-DISCOVERY-INTEGRATION-SPEC-DRAFT-20261011.md`: **24af94526888a57f734a3c8df2d8ad8f3f858b3a7d9a14117b53ce98a3f01cc3**.
- Revisão `docs/DEFI-DISCOVERY-SCOPE-REVIEW-20261011.md`: **cd4c822289c72d796e714c51146168c1ae45f6687e26cfd3951314655c8934c4**. PASS limitado ao escopo (L1); L16 exige API/schema, posse, limites e matriz RED/GREEN antes de congelar.
- Pesquisa anterior exclusiva: **45f38a31dd56c021d5a837d2af0805fc3cf688ff73e2def9dfd0fd6315106b39**, inalterada. Reutilizei documentação oficial já verificada nela em 2026-10-11; nenhuma nova consulta web. Não alego hash dos bytes HTTP nem nova validação de disponibilidade.

## Fatos que o contrato precisa acomodar

`src/onchainos/defi-read.ts:348–418` já expõe os sete reads e `searchPages`; registro `endpoints.ts:61–67`, tier unknown. O transporte público devolve `{data:unknown,meta:ReadMeta}` (`http.ts:55–93`). Entretanto, `parseDefiDetail:193–198` aceita ID omitido e devolve o solicitado; `:215–219` perde chainIndex dos underlying tokens. `read.ts:18–20/39–44` perde dados brutos e agrega metadados sem vetor por página. `values.ts:68–71` converte decimal em Number. Portanto, apenas os objetos finais atuais não conseguem provar G2–G4.

Evidência literal do legado, `src/operator/candidates.ts:272/278/281`:

> complete: product.subscribeFeeUsd !== null  
> priceImpactPercent: 0, costs, quoteAgeMs: 0,  
> researchOnly: false,

O builder público `:269–279` não compara identidade devolvida e calcula net com rendimento linear anunciado menos entrada/inferência. `src/okx-wallet/defi.ts:25–35` tolera rede ausente/não string e preenche rede/token do pedido. `risk-gate.ts:40/72–80` já rejeita pesquisa e economia/idade desconhecidas; não enfraquecer. `plan.ts:50–62` pode produzir qualified_dry_run para DeFi não marcado researchOnly, embora somente dex_round_trip receba live; `executor.ts:143–159` bloqueia os demais kinds.

D9 (`docs/OKX-ONCHAINOS-DADOS-SPEC.md:45`) diz literalmente **“texto livre nunca é copiado para o resultado”**. D16/D19/D23/D25 (:52/55/59/61), I1/I3–I7 e P1–P6 continuam cumulativos. Nomes/descrições remotos não devem entrar na nova projeção, JEV ou UI só porque passaram por safeText.

## API proposta, sem concessão de posse ou freeze

Assinaturas contratuais propostas, não implementadas:

- `createDefiDiscoveryReader({http:OnchainosHttp, now:()=>number, origin, policy}).read(request):Promise<DefiDiscoverySnapshot>`.
- `publicDefiDiscoveryView(input:unknown, nowMs:number):DefiDiscoveryPublicView|null`: allowlist e invariantes na fronteira; rejeição inválida distinguida de snapshot ausente pelo handler.
- `buildDefiResearchInput(view:DefiDiscoveryPublicView):DefiResearchInput`: puro, sem inferência, candidatos executáveis ou acesso à carteira.

A fábrica deve envolver **o mesmo transporte injetado** com observador de campos permitidos e chamar `createDefiReadClient`, sem outro cliente HTTP/parser substituto. O observador conserva presença remota, strings decimais e metadados antes do parser; uma falha de schema conserva evidência limitada/erro, nunca converte payload rejeitado em produto validado. Buffer por operação, sem estado global ou mistura entre leituras concorrentes. D23 exige clock injetado; nada de ambiente, fetch global ou persistência automática.

Alternativa real: ampliar tipos/parsers de `defi-read.ts` para carregar essa evidência publicamente. Evita observador, mas altera API compartilhada e exige posse explícita do integrador, compatibilidade, novos testes e revisão. O observador é recomendação de menor superfície; sua correção ainda precisa de prova. `capture.ts` é laboratório de gravação em disco, não seam genérico autorizado aqui.

### Request, limites e chamadas

| Campo proposto | Contrato |
|---|---|
| search | tokenKeywords obrigatório, 1–10; platformKeywords opcional, validação existente; grupos explicitamente SINGLE_EARN/DEX_POOL/LENDING; requestedChainIndex opcional. Mapeia tokenKeywordList/platformKeywordList/chainIndex/productGroup sem campos adicionais. |
| bindingTarget | Opcional `{chainIndex,tokenContractAddress}`, sem endereço pessoal. É intenção local de associação, não parâmetro suportado por Search nem prova de posse. |
| selectedInvestmentId | Opcional; somente este ID recebe detail e séries. Detail/charts pedem investmentId, **não chainIndex/token**; o alvo local permanece separado. |
| séries | Rate/TVL: WEEK/MONTH/SEASON/YEAR. Depth: DEPTH ou PRICE; DAY/WEEK somente PRICE. Sem detalhe/seleção, estado not_requested explícito; cobertura completa dos métodos é demonstrada nos testes com seleção válida. |
| policy | Limites de páginas/linhas e maxLocalAgeMs obrigatórios, explícitos; sem nova configuração de negociação. |

Tetos existentes: 20 rows/page, keywords 10, pageNum 10000, séries 5000, listas 1000 (`defi-read.ts:44–48`); coletor máximo 50 páginas/100000 rows (`paging.ts:29`). **Perfil inicial aconselhado, ainda não aceito:** até 3 páginas/60 linhas por grupo, um detalhe e uma chamada de cada série: máximo 15 operações HTTP lógicas (2 listas + 9 buscas + 1 detalhe + 3 séries), sem fanout por produto, loop ou refresh automático. `searchPages` já exercita Search; teste direto de Search não acrescenta chamada redundante ao runtime. Retries/attempts continuam contabilizados separadamente; 15 não é teto garantido de requests físicos nem custo faturado.

MaxLocalAgeMs exige valor antes do freeze. O relatório offline aceita 1–3600000 ms (`report.ts:137–139`); reutilizar esse intervalo seria decisão local explícita, não SLA OKX. Não importar silenciosamente TTL de plano, maxQuoteAgeMs ou os 120000 ms de System One. Serialização pública precisa de teto explícito; **2_000_000 bytes** tem precedente em `system-one/http.ts:30–40`, mas seu uso aqui continua proposta. Truncamento deve declarar motivo e omissões, nunca apagar dados silenciosamente.

### Schema de saída mínimo

Envelope concreto proposto: `{schema,generatedAtMs,request,policy,chains,platforms,searches,selected,evidence,contentHash,issues,qualification}`. `searches` tem uma entrada explícita por grupo solicitado, cada uma com `{group,status,rows,paging,evidenceIds,issues}`; `selected` tem `{requestedInvestmentId,detail,rateChart,tvlChart,depthPriceChart}`, cada read com status/value/evidenceIds/issues, ou not_requested com value=null. Arrays vazios representam resposta válida vazia; falta/erro usa value=null, não zero observações fabricado. Cada row contém occurrenceId, reported identity, association, decimais/tempo/economics e pageEvidenceIds. `qualification` é invariável `{eligible:false,execution:"not_qualified",advisoryOnly:true}`; decoder público rejeita promoção enviada pelo payload.

Input de pesquisa proposto: `{schema:"okx_defi_research_input_v1",advisoryOnly:true,execution:"never",discovery:validatedPublicView,limits,uncertainties,discoveryEligibleIds:[],defaultChoice:"hold"}`. Esses campos não substituem elegibilidade de outras estratégias válidas, nem Choice/OperatorState existentes. `publicDefiDiscoveryView` retorna null para payload inválido; callback null permite ao handler distinguir ausência de erro de schema.

Versão própria proposta `okx_defi_discovery_v1`; preservar `okx_defi_report_v1`, cujo contrato é offline Search/Detail, até 20 rows e partial_unverified (`report.ts:41–54/137–167`).

| Bloco | Campos/invariantes indispensáveis |
|---|---|
| identity | requested: filtros/alvo/ID; reported: investmentId, chainIndex, platformId, productGroup, underlyingTokens[{chainIndex,address,precision}] com null para omissão; association: matched_reported_identity / unknown / mismatch / ambiguous e motivos. |
| evidence[] | Endpoint ID/método/path, parâmetros canônicos permitidos, origin synthetic/imported/provider-observed, página, HTTP status/attempts, requestedAtMs/receivedAtMs locais, parseStatus e issue codes. Sem headers, credenciais, wallet, mensagens de erro livres ou payload completo. |
| decimal | availableText:string|null, unit:decimal_fraction/USD/unknown, representation:source_string/json_number/unavailable, numericApproximation opcional explicitamente aproximada. Não inventar texto original de número JSON já parseado. |
| time | localAgeMs:null ou now-received válido; localFreshness unknown/future/stale/fresh_local_capture/invalid_clock; datumTimestampMs da série separado; providerTimestampMs/providerTtlMs null enquanto não comprovados. |
| paging por grupo | maxPages/maxRows, pagesObserved, rowsObserved/retained/omitted, claimedTotal por página, collectorStopReason, anomalyReasons, coverage bounded_exhausted_unverified/partial/error; pageEvidenceIds por linha. |
| economics | advertisedRate e unidade por endpoint; TVL separado; costComponents com amountText/unidade/base/identidade/sourceEvidenceId/time/knownness, costCoverage unknown/incomplete; totalCosts/netReturn/executableExit:null, personalEligibility:unknown. |
| status | Seções not_requested/absent/error/partial/observed distintas; execution:not_qualified, eligible:false, advisoryOnly:true. Não promover observação a qualificação. |
| coverage | implemented e registered derivados da fonte fixa; called com fase synthetic/imported/provider-observed/not_observed; tested com referência/hash e execução observada ou desconhecida; liveQualified:unknown. Labels não são prova. |

Associação exige comparação de **campos efetivamente reportados**: ID ecoado, rede do produto e par rede/endereço do token subjacente pertinente. Ausência de qualquer elemento necessário deixa unknown; divergência explícita impede associação e não é sobrescrita pelo pedido. Correspondência Search↔Detail também é distinta da correspondência ao alvo. InvestmentId retornado pelo parser atual não conta como eco remoto. Platform/group também ficam requested/reported separados. Rede/token solicitados não podem preencher reported.

Usar famílias da rede conhecida (`okx-wallet/chains.ts:9/23–46/63–81`): EVM válido admite comparação sem distinção de caixa; Solana/Tron preservam caixa. Não aplicar lowercase global; outras canonicalizações/famílias e representações nativas precisam de contrato demonstrado, senão unknown. Formato de endereço não prova posse. `matched_reported_identity` significa apenas comparação local de evidência; não autenticação da alegação do provedor, wallet binding ou elegibilidade pessoal.

Hash proposto: SHA-256 sobre projeção permitida canônica UTF-8 (keys ordenadas, arrays preservadas, missing normalizado para null, decimais textuais preservados), versão do schema e parâmetros. Hash por página/componente; hash de conjunto inclui ordem, limites, stops e issues. Hash de evidência imutável não deve mudar só porque localAge foi recalculada; derivação de apresentação fica separada. Não chamar isso hash dos bytes originais HTTP, assinatura remota ou prova de verdade. Erros usam códigos enumerados. Labels de UI vêm de registro local ou IDs; texto livre remoto é excluído.

### Tempo, paginação e economia

Validar clock e sequência requested≤received≤now após cada await e novamente ao publicar/ler, sem resetar idade. Entrada sem relógio ou 24h antiga não passa como fresca; futuro e clock rollback ficam explícitos. Recibo HTTP mede captura local; timestamp de série mede o ponto histórico. Atualização aproximadamente horária de Chains não estabelece validade de produto. Um snapshot recente pode continuar com freshness remota desconhecida.

`searchPages:386–399` usa quantidade acumulada/total/página curta; `collectPages:49–57` pode devolver exhausted antes de detectar vazio contraditório. Preservar stop original e adicionar anomalias: identidade repetida, página repetida sem avanço, total mutante, short_page_contradicts_total, erro após páginas válidas, rows cap. Não deduplicar silenciosamente; conservar ocorrências com page/row IDs e contagem única separada. Se falhar a página seguinte, o observador pode conservar páginas **já validadas** como partial; nunca afirmar resultado final do coletor que lançou erro. Repeated_cursor exige teste do coletor genérico; para Search numérico, testar conteúdo repetido mesmo com pageNum crescente. Exaustão limitada não garante snapshot estável ou inventário completo.

Search rate é fração anunciada/TVL USD; Detail e rate/depth chart conservam unidades não demonstradas. TVL chart declara USD. Strings decimais permitem aritmética decimal exata futura; Number ou unidades desconhecidas não sustentam cálculo econômico exato. APY anunciado não implica APR linear, rendimento futuro, saída ou lucro. Cada custo requer componente, unidade/base, fonte/hash e tempo; entrada isolada não cobre resgate, rede/protocolo e outros custos pertinentes. Conversão só com FX verificável da mesma identidade/unidade e tempo compatível; não há FX/custo total nesse conjunto de sete reads. Ausência permanece unknown, nunca zero. Flags isInvestable/isSupportRedeem/isSupportClaim não provam execução, resgate imediato ou saldo realizado.

## Contratos oficiais já verificados

Todos os paths abaixo começam em `/api/v6/defi`; links são documentação primária reutilizada, não chamadas executadas.

| Método/path | Evidência e limite |
|---|---|
| GET /product/supported-chains — [Chains](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-supported-chains) | Produtos ativos; atualização aproximadamente horária; sem paginação declarada. |
| GET /product/supported-platforms — [Platforms](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-supported-platforms) | Protocolos/contagens; sem paginação declarada. Nome remoto não será label público. |
| POST /product/search — [Search](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-search) | 20/page, três grupos, rate fracionário/TVL USD; keywords não provam token exato. |
| GET /product/detail — [Detail](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-detail) | ID, rede/tokens/precisão/flags; escala/base dos campos econômicos não estabelecida na descrição inspecionada. |
| GET /product/rate/chart — [Rate](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-rate-chart) | Timestamp ms; escala de rate/bonusRate/totalReward desconhecida. |
| GET /product/tvl/chart — [TVL](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-tvl-chart) | Timestamp ms e TVL USD. |
| GET /product/depth-price/chart — [Depth/price](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-depth-price-chart) | Pools V3; DEPTH/PRICE; não OHLC nem saída executável; unidades de preço/liquidez não demonstradas. |

A [visão geral](https://web3.okx.com/onchainos/dev-docs/wallet/defi-api-overview) separa discovery, preparação/transações e posições. Plano, acesso, quota, custo, TTL, ordering e consistência entre páginas permanecem desconhecidos. Sem paginação declarada não significa lista ilimitada. Preparação/calculator/posições/enter/exit/claim continuam excluídos.

## Conexão real, legados e alternativas

`cycle.ts:159–171` passa ao modelo somente candidatos elegíveis; `jev-selector.ts:13–60` não tem campo de pesquisa. Proponho **entrada de pesquisa separada**, validada e advisoryOnly/execution:never, sem novas choice keys, quantidades de capital ou chamada de inferência forçada. Se o integrador adicionar research opcional ao estado do modelo, preservar validação hold/eligible (:74–95) e não converter discovery em eligible. Build/test do input é suficiente para este contrato; não prova uso live JEV.

No legado, estender o resultado de DefiSource para carregar evidência/identidade reportada ou inserir adaptação validada; respostas antigas sem evidência permanecem desconhecidas. G6 exige retirar dados fabricados na fronteira pública do builder: sem idade/impacto zero inventados, complete por entrada isolada, net linear ou hash sem identidade/tempo/custos. Descobertas seguem researchOnly. Testar também builder→gate→plan e chamada direta ao plano para impedir qualified_dry_run/live DeFi no contrato de descoberta; decisão sobre endurecimento por kind em plan.ts deve ser explícita, não só label de UI. Preservar controle válido dex_round_trip e seus gates. Executor financeiro não precisa ser ampliado.

**Alternativas de publicação antes do freeze:**

1. Recomendada: novo GET **/defi/discovery**, handler com callback `readSnapshot():unknown|null`, clock/origin/token injetados e allowlist. GET lê snapshot já produzido/importado: **nunca chama provider, coleta ou inicia loop**. Ausente 404, inválido erro de schema, partial válido 200 com razões; contratos de método/origin/token preservados. Producer futuro separado, rede desligada por padrão e sem carteira. Esta recomendação ainda requer decisão de integração.
2. Campo opcional tipado em /operator: reutiliza polling, mas toca OperatorCycle/backend/frontend e acopla descoberta ao ciclo de inventário. Só é viável com snapshot injetado independente; exigir execução do operador para produzir descoberta não satisfaz a separação readonly.
3. Só mostrar buildDefiReport offline: preserva honestidade e serve controles, mas **não encerra G1/G7** (sete métodos/central); não aceitar como substituto do draft.

`server.ts:57–59` hoje não tem rota DeFi. `operator/http.ts:60–69` serve estado bruto; `web/src/lib/operator-feed.ts:54–56` faz cast raso. Não repetir esse padrão para dados DeFi. P1–P6 continuam imutáveis; novo GET/preview não pode importar/coletar mercado/modelo/wallet/executor.

A central principal é `web/src/app/page.tsx:9–10`→`Desk/MesaView.tsx`, não apenas /console. MesaView:39–43 já conecta feeds/hooks de outras superfícies; este relatório **não autoriza seu startup**. Painel novo precisa ser ligado ao caminho visível definido, com fixtures/transportes públicos isolados na futura verificação. Distinguir absent/error/partial/unknown; se conservar último snapshot após erro, marcar retido e recalcular idade. Não colocar discovery no ranking de net/oportunidade (`operator-center.ts:53–68`), inventar posições ou chamar mock/importado live. Catálogo manual (:223–243) deve acompanhar evidência, não promovê-la.

## Posse exclusiva proposta para um ciclo futuro

Os novos paths abaixo não existem na árvore fixa; **não houve atribuição de escrita nesta pesquisa**. Papéis são mapa futuro, sem agentes criados.

| Responsável futuro | Arquivos exclusivos / integração |
|---|---|
| Escritor backend isolado | Novos `src/okx-defi/discovery-types.ts`, `discovery.ts`, `discovery.test.ts`; se rota própria escolhida, `discovery-http.ts` e `discovery-http.test.ts`. Schema, observador/projeção/paging/economia/input de pesquisa e handler público. Nenhuma edição do cliente compartilhado. |
| Escritor UI isolado | Novos `web/src/lib/defi-discovery.ts`, `defi-discovery.test.ts`, `web/src/components/DefiDiscoveryPanel/DefiDiscoveryPanel.tsx`, `DefiDiscoveryPanel.module.css` e `DefiDiscoveryPanel.test.tsx` no mesmo diretório. Consome somente schema público; não assume posse de páginas/hooks existentes. |
| Integrador exclusivamente | `src/okx-wallet/defi.ts`, `src/operator/candidates.ts`, seus testes, `types.ts/cycle.ts/jev-selector.ts/plan.ts` apenas conforme contrato fechado; `scripts/okx-operator.ts` para remover/desligar caminho paralelo inseguro; `src/server.ts`, entrypoints/preview/package se necessários; `MesaView.tsx`, eventual /console, `central/ecosystem-catalog.ts` e documentos. `defi-read.ts/read.ts` e seus testes só se alternativa de extensão for escolhida. Alterações compartilhadas serializadas pelo integrador. |
| Revisor distinto | Relatório exclusivo; candidato/hash fixo, critérios originais, RED/GREEN e evidência UI/HTTP. Sem aprovar a própria SPEC ou implementação. |

UI/backend devem fechar schema e compatibilidade de importação/decoder no frontend antes de escrita; nenhum import de backend com Node/crypto ou provider deve entrar no bundle web. Qualquer mudança posterior de fields/enums/hash exige atualização conjunta/revisão. Preview ativo tem sua própria posse (P1–P6:22); separar lane documentalmente ou concluir seus gates, sem disputa de server/package/páginas. F5/F6 seguem prioritários. Não há autorização de main, push ou fundos.

## Matriz para aceitação independente — IDs originais preservados

Não declaro PASS/GREEN. Esta é proposta de evidência mínima para os **G1–G8 literais do draft:27–34**, adicional às aceitações originais.

| ID | Seam público / RED e controle GREEN a obter |
|---|---|
| G1 | Reader real sobre createDefiReadClient+transporte falso: método/path/body/query dos sete reads, três grupos e selection/charts válidos; demonstrar que central consome snapshot, não fixture desconectada. |
| G2 | requested/reported/association: wrong_chain/token/ID, omission, token-chain mismatch, ID copiado e case sensitivity; controle com ID/rede/token reportados compatíveis continua observação válida, sempre não executável. |
| G3 | Hash reproduzível/per-page, clock inválido/futuro/rollback, missing stamp, 24h stale e boundary maxAge; fresh_local_capture válido nunca vira TTL/provider freshness. Provar rechecagem por await/publicação. |
| G4 | Decimal string exata vs Number, Search fraction vs unidades unknown, zero reportado vs ausência, fee de entrada isolada, FX ausente/unidades incompatíveis: net/totalCosts null; não fabricar net mesmo com rate positivo. |
| G5 | Limites/rows omitidas, duplicated rows/pages, total mutante, short-page contraditória, erro intermediário, no_progress e repeated_cursor; preservar páginas/razões e controle de busca limitada consistente sem alegar ecossistema completo. |
| G6 | Input de pesquisa allowlisted sem texto remoto/endereços pessoais; builder legado não inventa identidade/age/cost/hash; gate hold e plano DeFi not_qualified inclusive chamada direta. Controle Dex válido preservado; zero inferência real. |
| G7 | Handler+hook+painel+entrypoint visível: absent/error/partial/unknown/observado, origem/unidades/idade/TTL/custos/capabilities separados; empty preview sem posições/oportunidades. SSR sozinho não prova UI visível integrada. |
| G8 | Executar RED/GREEN apenas depois de candidato/ownership autorizado, isolamento sem env/providers; suites/tipos/build afetados, HTTP real isolado e UI visível controlada; reviewer distinto verifica logs/hashes. Testes existentes lidos não são execução desta pesquisa. |

Seams já existentes para reutilização: `defi-read.test.ts:17/97–111/147–150/169–255` (transportes/mocks; omissão de ID aceita hoje); `report.test.ts:18–28/76–86/164–172` (unknown/futuro/stale/imutabilidade); `operator.test.ts:1–11/88–99` (builders/gate/plan/cycle públicos com dependências falsas); `operator/http.test.ts:13–38/49–53` (origin/método/ausência); `command-center-render.test.tsx:26–34` (SSR vazio). São pontos de partida; não evidenciam novos Gs passados.

## Pendências para freeze

Fixar alternativa de publicação/producer separado, contrato de observação vs extensão do cliente, política numérica local/limites/bytes e tokens/famílias comprováveis; registrar owners/arquivos exatos e controles legacy→gate→plan. Resolver preview ou separação elegível explicitamente (draft:47). TTL, plan/access/cost e guarantees de ordenação não se resolvem por decisão: permanecem unknown até prova primária/runtime autorizada. Custos totais/FX/saída/posições exigem futuros contratos separados, sem bloqueá-los ficticiamente como “implementados”.

Revisão de escopo PASS e recibo consultivo do draft não aprovam estes contratos concretos. Não aceitar preview, não enfraquecer G1–G8 e não certificar pesquisa como qualificação/profit. Próximo passo elegível é o integrador fechar requisitos/posse e obter aceitação independente, mantendo os demais gates do objetivo amplo.

## SHA-256: bytes dos blobs Git fixos

Hashes físicos CRLF do draft/revisão não devem ser comparados diretamente aos blobs LF abaixo.

```text
491e629c515cf69267528de649f19bcb0b3f4425a133d070487d7d4647d402f6  CONTRIBUTING.md
2d86832b576554954ba77fab444aa69bb4cc44174f1dc6a59e0759ae5ae277e4  docs/OKX-ONCHAINOS-DADOS-SPEC.md
dce6610f5fdaffbe98cadd2de35f1bf84cd8a274566657e3a5d163a1d9431515  docs/WEB3-INTEGRATION-DELIVERY-SPEC.md
e32244822c49fe6b248eccd15da9c9addff18a1fa6c8abd97004861de7a42d2c  docs/HTTP-PREVIEW-SPEC-20261011.md
3b9e10d3f1f53510710a8912d54ffe20e3e5cf5e6f8b62eabf656782fd992226  src/onchainos/endpoints.ts
fade562867add24b8c01d771e73e96499d1a3179470de0a5576d3617e83e7389  src/onchainos/defi-read.ts
f3867dd9d8d926f2e17274ab570f0e0ab5f182a1c8b0b5186e76cdf17458fd96  src/onchainos/defi-read.test.ts
1a1806406d0d9c5218d4954abca6725a61be2e5835a282dfe9942661aee7e1a5  src/onchainos/http.ts
58b69017735e2ac88df086f0c6b8df2fe3404cd354b13930574e52a28ccaef4f  src/onchainos/read.ts
9c8d3197d9e7eb01a136bb96ab1ff3dffe8a47f12b5377e29a52098e3d4831f4  src/onchainos/paging.ts
7dd37caea9e1c534bea5e2d77f60e86b08acef464cab412b76aa0b887eb9999e  src/onchainos/values.ts
6651c5568b90d2538d01504a10cc1bfac3f2a476d279f5b80681847504ba8ac9  src/onchainos/capture.ts
f92b23c2522f4868bf6997c9b17938382f905ff5424f91c755db155c61bbcf1f  src/okx-wallet/chains.ts
28532158e98aee74c05decedfc96e669caa77e2bdaa2d1c152c640a9f52c7b63  src/okx-wallet/defi.ts
8794362f0100b2a2942e316c328e9defa65a503f0f0bb6c8354844c3a8301ed0  src/okx-defi/report.ts
81f95dc634a03aba9ed1e07ba9ad8ec145065d537f7ae21b2d4b50d3485237a5  src/okx-defi/report.test.ts
6edfa00c5ca891bf0bc86c0cffcfdc7759902b587e878a2ddeab26ad9767efa7  src/operator/candidates.ts
0be6bb6275b4b13bfce4714fe59bf15703d03dc9204b8a9fde9a798aa5ce97cb  src/operator/types.ts
1143378a6d5d8a46077ab6ca6b86f9832162e172d772f792b99d572cf1467cc7  src/operator/risk-gate.ts
f97aa1f2ef77ff9d2099865914c7960674984b5e2e4662d34704aec784b6e5a9  src/operator/plan.ts
4b413799c101eed60512376f6b02a84875f3a9d5b523e5090244a09cb1e819ef  src/operator/executor.ts
77916ac342254494764d2402f73e692e13a5fb5a464926538908e436e49584bb  src/operator/cycle.ts
f48e2ddda8c6a47ae1c97b86c85da7dbbd6d4094536c564e84125cdbef694c8d  src/operator/jev-selector.ts
e7ca3a0e975c864057e97934287745a7b7e48f752eedee7e225ecb87e94813da  src/operator/operator.test.ts
bd734bcc39fa7d8283250928ff3941a68b9a26a0ce7d4cc09a5edc064d825b9c  src/operator/http.ts
c9192d73074169556a631b83d8322b6a0993715283e7c6a65f94dc4aa7b84320  src/operator/http.test.ts
1154ced129923e419d49830179c5b21ada9c245c4af6bd622b2abfb57537fc37  src/server.ts
3548cbe15116debfea81cc78b599d363a245da0cf36fc42b3afed6fc06f59723  src/system-one/http.ts
c2f57b6eade19559f36c8f7a0ebaf53d35f691e13f40761bafebea507d4f8a1b  src/system-one/types.ts
4be6328b584ac1655c764af4c822dbf178e1bf5d8a01d65939d2866d51598257  scripts/okx-operator.ts
4ea35f1cb7664ae9bfda27e934a37258545a2d99ba3449469095a0a617d53e36  web/src/lib/operator-feed.ts
e84b1d476dc526ea2007e4864b5b43517ddb05d03cb0cbfab27fe94d30b5048c  web/src/lib/operator-center.ts
408262cfdd3144d5e44ef9c16d50247bc1a11378df5ec7a30aca2f8d1681a5a5  web/src/lib/central/ecosystem-catalog.ts
11ebf399459b9337f975d6fed804976954967c513ddcf4ba7a389626ca764546  web/src/app/page.tsx
5e87b5d7644ebe093c2e186d33e72d617716999341bfb67a3129a89c3cbc1ac3  web/src/components/Desk/MesaView.tsx
03d447ae4d8ac7fb0c72c6871cf067e08156fb9f3755d475dc0152dd7a19e143  web/src/lib/command-center-render.test.tsx
```

