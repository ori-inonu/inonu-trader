# G12 — extensões DeFi e Strategy em leitura

Data: 2026-10-11. Estado: SPEC preparada por pesquisador, sem implementação, execução dos testes ou revisão independente. Este documento registra evidência e contrato proposto; não concede acesso, consumo pago, transmissão de endereço ou autorização financeira.

## Objetivo e contrato preservado

Integrar leituras existentes de DeFi e leaderboard ao contrato comum de fontes e capacidades do pipeline real, de forma opt-in, sem endereço e com limite de três GETs seriais por invocação. A oferta documentada de um endpoint deve permanecer distinta de suporte da rede, entitlement da chave, dados obtidos em transporte real e qualificação financeira.

Aceitação superior congelada, literal de INSTRUCAO-DO-OBJETIVO.md, G12:

> DeFi, sinais/leaderboard e funding/derivativos usam o contrato comum de capacidades; oferta da API não é confundida com entitlement, inventário ou qualificação financeira.

Evidência exigida por G12:

> Matriz por módulo/rede/endpoint com estados documentado, implementado, exercitado real, integrado e financeiramente qualificado. Leituras existentes acessíveis na UI e pipeline quando aplicáveis; bloqueios condicionais descritos e verificáveis.

G07 permanece: dados usados para decisão possuem origem, modo, identidade relevante, instante de fonte/coleta, validade e erro; stale/incompleto bloqueia ações dependentes; fixture não satisfaz aceitação real. G15 mantém execução financeira desabilitada. A presente fatia não demonstra a conclusão de G12 inteiro: integração de runtime/UI e receipts reais pertencem ao integrador; revisão e prova real são independentes.

## Escopo e ownership

Arquivos candidatos exclusivos do implementer: src/real/extensions.ts, src/real/extensions.test.ts e docs/real-integration/EXTENSIONS-SPEC.md. Os três estavam ausentes no worktree de integração observado. Esta versão foi escrita em diretório scratch isolado para entrega ao integrador; não houve alteração do repositório ou de arquivos compartilhados.

Reutilizar createDefiReadClient, createSignalsClient e OnchainosHttp, com SourceEnvelope e Capability existentes. Não modificar clientes, registry, types comuns, config, core, runtime, HTTP server, journal ou UI. O integrador é o responsável por essas superfícies e pela avaliação da provenance real. Funding Exchange v5 já integrado não será repetido.

Exclusões: nenhum envio de endereço de wallet; nenhuma consulta de posições; nenhum acesso a env/segredos; nenhuma rede de negócios nesta implementação/teste; nenhum sign/broadcast/borrow/deposit/withdraw; nenhuma aprovação de gasto ou plano; nenhum Agentic Wallet; nenhuma busca paginada; nenhum retry; nenhuma promessa de APY realizado, retorno, custo zero, acesso Premium ou latência.

## Evidência primária e implicações

| Fonte oficial, acessada em 2026-10-11 | Contrato relevante | Implicação para a fatia |
| --- | --- | --- |
| [DeFi supported chains](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-supported-chains) | GET /api/v6/defi/product/supported-chains, sem parâmetros; chainIndex/network; catálogo dos produtos atualmente listados, normalmente atualizado a cada hora | Lista específica de DeFi; não atesta entitlement, produto específico, saldo ou atualidade da taxa |
| [DeFi product detail](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-detail) | GET /api/v6/defi/product/detail, investmentId obrigatório; chainIndex, rate, tvl, feeRate e disponibilidade de operações | rate/tvl/feeRate não possuem unidade declarada nessa tabela. Não importar a unidade da busca nem chamar rate de retorno realizado |
| [Signal chains](https://web3.okx.com/onchainos/dev-docs/market/market-signal-chains) | GET /api/v6/dex/market/signal/supported/chain; exemplo inclui 196/X Layer | Exemplo não prova cobertura atual nem cobertura do leaderboard |
| [Leaderboard chains](https://web3.okx.com/onchainos/dev-docs/market/market-signal-leaderboard-supported-chain) | GET /api/v6/dex/market/leaderboard/supported/chain; catálogo separado | Qualificar leaderboard independentemente de Signal, Market, DEX e DeFi |
| [Leaderboard list](https://web3.okx.com/onchainos/dev-docs/market/market-signal-leaderboard-list) | GET /api/v6/dex/market/leaderboard/list; chainIndex/timeFrame/sortBy obrigatórios; máximo 20 registros; PnL/volume USD, percentuais e contagem | walletAddress recebido deve ser descartado pelo parser existente. lastActiveTimestamp é atividade de carteira, não instante do snapshot; sua unidade não é declarada |
| [Latest signals](https://web3.okx.com/onchainos/dev-docs/market/market-signal-list) | POST /api/v6/dex/market/signal/list | Fora do perfil GET desta fatia; jamais converter para GET nem declarar lista de sinais integrada por meio do leaderboard |
| [API access](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage) | Credenciais Web3 e HMAC HTTP próprios, separados da conexão da wallet | Leitura não é autenticação anônima. ready do transporte é requisito, não prova de entitlement ou real access |

Evidência literal curta: DeFi chains usa “No request parameters.”; leaderboard lista declara “Limit: Maximum 20 records per request”; product detail descreve rate como “Yield rate” e tvl como “TVL”; essas palavras não estabelecem escala ou moeda. A pesquisa não fez chamadas de negócio para resolver essas incógnitas.

Os nomes locais corretos são DefiReadClient.supportedChains()/detail() e SignalsClient.signalChains()/leaderboardChains()/leaderboard(). SignalsClient.signals() e DefiReadClient.search() chamam readPost. A lista de três GETs abaixo não chama os métodos POST, nem precisa de signalChains ou leaderboardChains no ciclo. Qualificação da rede é uma entrada anterior e separada, com evidência por família/endpoint; indisponibilidade dessa evidência bloqueia a família antes de qualquer request.

OnchainosHttp.get não recebe AbortSignal e o transporte possui maxRetries=2 por padrão. Portanto, a fatia exige configuração maxRetries=0 antes de chamar qualquer cliente. O sinal pode impedir chamadas ainda não iniciadas e descartar resultados tardios; a API atual não permite afirmar cancelamento físico do GET em voo. Nenhuma alteração silenciosa da configuração shared é permitida nesta fatia.

## Contrato mínimo proposto para integração

API: createRealExtensions({http, now}).read(input, signal).

Entradas obrigatórias: correlationId, chainIndex, revision. Não aceitar nem construir campo address. enabledFamilies é uma lista opcional apenas de defi/signals, omitida ou vazia por padrão. Config de cada família é explícita e não é inferida de env ou de outra família.

Config mínima de DeFi: qualifiedChainIndexes, ttlMs, investmentId opcional. Config mínima de signals: qualifiedChainIndexes, ttlMs e leaderboardQuery com timeFrame/sortBy explícitos, walletType opcional. A consulta usa a chainIndex da invocação; o caller não pode substituir essa identidade por uma query de outra rede.

qualifiedChainIndexes representa somente redes previamente qualificadas para o endpoint daquela família. O integrador preserva a evidência de qualificação com método/endpoint/data/receipt e expiração. Uma flag arbitrária ou exemplo de docs não substitui essa evidência. Esta fatia consegue validar pertencimento à lista recebida; não consegue certificar a origem real dessa lista. O default é desconhecido e bloqueado. Para signals, a qualificação deve se referir especificamente a leaderboard/list e ao catálogo leaderboard/supported/chain, nunca ao catálogo signal/supported/chain.

Saída: {correlationId, chainIndex, revision, envelopes, capabilities}. envelopes usa chaves estáveis defiChains, defiDetail e leaderboard, com SourceEnvelope existente; capabilities usa linhas Capability distintas por endpoint, com extensão local method: GET ou POST sem alterar o tipo comum. revision pertence ao container da saída, pois SourceEnvelope não possui esse campo. Campos opcionais de dados nunca se tornam zero. blocked/error têm data=null. Envelopes de dados que não serão tentados ainda identificam o endpoint GET planejado e seu motivo sanitizado. A lista de sinais POST recebe uma linha de capacidade bloqueada própria, sem request.

SourceEnvelope.mode é sempre unverified no adapter injetável. Mesmo um fixture que devolva metadata com source=onchainos-rest-v6, HTTP 200 e timestamps plausíveis nunca promove mode ou exercisedReal. Runtime do integrador envolve as invocações e registra receipts reais separadamente; esses receipts não são inventados nesta camada.

## Requisitos verificáveis

| ID | Evento/condição → comportamento esperado |
| --- | --- |
| EX01 | enabledFamilies ausente/vazia ou família sem config explícita → bloquear essa família com motivo estável; zero GETs/POSTs para ela |
| EX02 | Transporte info.ready=false, source incompatível, ou info.maxRetries diferente de zero → bloquear antes de qualquer request; não ler credenciais nem repetir chamadas |
| EX03 | chainIndex não pertence à qualifiedChainIndexes da família, ou a qualificação recebida está desconhecida → bloquear a família com zero requests, sem auto-discovery no ciclo |
| EX04 | Invocação elegível → ordem fixa serial: DeFi supportedChains, DeFi detail quando investmentId explícito e rede confirmada pelo catálogo, leaderboard. Máximo de três GETs; zero POSTs; zero retries; sem pagination |
| EX05 | DeFi catálogo válido exclui a rede → envelope catálogo pode registrar a resposta observada; detail fica bloqueado e não é chamado. Não promover a rede ou o produto por documentação genérica |
| EX06 | Um GET falha → somente o envelope/capacidade dependente falha; não reutilizar dado antigo nem fabricar lista vazia. Família independente elegível pode continuar dentro do orçamento; detail depende de catálogo DeFi válido |
| EX07 | Sinal abortado antes da leitura → zero requests. Aborto durante um GET → descartar resultado tardio e impedir todos os GETs seguintes, sem alegar que o transporte em voo foi abortado |
| EX08 | Envelope recebido → endpoint/método/source vêm de constantes do registry/ReadMeta compatível, chain/corr vêm da invocação, revision permanece no container; instantes de coleta são honestos; HTTP status ausente fica null; não aceitar metadata de endpoint/source incompatível |
| EX09 | Fonte não declara instante do snapshot → sourceAtMs=null; expiresAtMs=receivedAtMs+ttlMs expressa TTL local de coleta, não frescor comprovado na fonte. Nunca usar lastActiveTimestamp como sourceAtMs |
| EX10 | DeFi detail → preservar advertisedRate/tvl/feeRate/utilizationRate como unidade desconhecida; envelope unit=null. Nome advertised permanece; valores desconhecidos não viram taxa/retorno/USD conhecido |
| EX11 | Leaderboard → preservar valores normalizados de USD/percent/count dos campos declarados; envelope unit=null por unidade mista. Campo lastActiveTimestampMs por exemplo não estabelece epoch-ms declarado nem frescor do snapshot |
| EX12 | Resposta/provider error contém endereço, símbolo, URL, chave ou texto arbitrário → saída contém apenas campos allowlisted e erro categórico estável; não copiar error.message, providerMessage ou payload bruto |
| EX13 | Capability → documentado/implementado/integrado/exercisedReal/financeiramenteQualificado são dimensões distintas. Adapter nunca marca exercisedReal=true ou financiallyQualified=true; integração decorre do wiring verificado, não de disponibilidade de API |
| EX14 | signal/list solicitado indiretamente → capability bloqueada com método/endpoint POST reconhecidos e próximo requisito claro; nenhum POST feito. Funding v5 não recebe request nem falsa identidade OnchainOS |
| EX15 | Invocações com revisões/correlações diferentes → nenhuma mistura de envelopes ou cache de identidade. A fatia não agenda ciclos nem persiste dados privados |

Validação de input deve ser determinística e anteceder requests: chainIndex decimal válido, revision inteiro não negativo, correlationId sanitizado/limitado conforme contrato comum; ttlMs finito positivo; enabledFamilies sem valores desconhecidos; investmentId conforme parser local; query enums conforme cliente existente. Config inválida bloqueia de modo sanitizado e não causa chamada parcial dessa família. Os limites numéricos concretos de TTL/correlationId devem seguir o contrato comum congelado; não inventar uma rota de autorização por meio da config.

Dados de detail devem corresponder a investmentId e chainIndex esperados. O parser existente confirma investmentId, mas chainIndex pode ser null ou diferente; neste caso detail não qualifica a rede e deve ficar blocked/error, com data=null para consumidores dependentes. Não exportar nomes, logos, URLs, texto de protocolo, endereços de carteiras ou mensagens de provider. Endereços de token já normalizados podem permanecer somente nos campos de identidade permitidos pelo contrato comum, sem entrar em prompts automaticamente.

## Capacidade e estados

Linhas sugeridas: defi.catalog, defi.detail, signals.leaderboard e signals.latest. IDs podem seguir os IDs do registry para evitar aliases divergentes. Cada linha inclui família, chainIndex, endpoint, source, status, reason e nextRequirement, além das cinco dimensões de G12.

documented=true afirma somente contrato encontrado em fonte oficial. implemented=true afirma código existente para o endpoint; signal/list pode ter cliente implementado e integração dessa fatia bloqueada. integrated=true exige wiring da fatia confirmado por teste de contrato/runtime; não significa entitlement. exercisedReal=false é invariável desta camada injetada; somente o integrador com receipt externo verificável pode apresentar evidência separada. financiallyQualified=false é invariável deste objetivo leitura/paper. HTTP 200 não altera esses dois últimos estados. Erro 401/403/402/429 não se transforma em entitlement conhecido, quota conhecida ou autorização para pagar.

## Aceitação e TDD independente

Antes do código, implementer deve registrar baseline/hash desta SPEC e produzir RED observável por comportamento faltante, usando fixtures injetados e bun --no-env-file. Depois, GREEN para os mesmos critérios, sem reduzir sua exigência. Não acessar rede de negócios ou env. A presente preparação não executou testes e não certifica os futuros resultados.

| Caso independente | Arranjo e evidência exigida | Requisitos |
| --- | --- | --- |
| Default OFF | Transport recorder pronto; input sem famílias/config; nenhuma chamada, razões estáveis nas linhas bloqueadas | EX01 |
| Credential absence | info.ready=false e recorder que falha caso get/post seja usado; invocação habilitada retorna bloqueio e zero requests | EX02 |
| Retry misconfiguration | info.maxRetries=2 com configuração elegível; nenhuma chamada antes do bloqueio | EX02 |
| Family chain unsupported | DeFi qualificado em 1 e leaderboard em 501, input 196; contador zero para ambas; não aceitar lista Market como prova | EX03 |
| Serial budget | Promises controladas manualmente; segundo GET só começa depois do primeiro resolver; no máximo três GETs totais; spy POST permanece zero | EX04 |
| DeFi chain revoked | Pré-qualificação recebida inclui 196; catálogo GET retorna somente 1; detail não é chamado; se leaderboard independente for elegível, somente seu GET continua | EX05/EX06 |
| Partial failure | Catálogo DeFi falha 403 com mensagem sentinela privada; detail não chamado; leaderboard elegível pode responder; envelope de falha não contém sentinela e não recebe HTTP 200 do outro endpoint | EX06/EX12 |
| Abort boundaries | Já abortado: zero chamadas. Aborto após primeiro GET em voo: resultado tardio descartado e segundo/terceiro nunca iniciados | EX07 |
| Metadata fixture | HTTP 200 com instantes e source plausíveis: corr/chain/revision/endpoints corretos, TTL exato, sourceAtMs=null, mode unverified e exercisedReal/financial=false | EX08/EX09/EX13/EX15 |
| Units honest | rate/tvl de detail não rotulados USD/fração; lastActiveTimestamp de leaderboard não usado como snapshot; null distinto de zero válido | EX09/EX10/EX11 |
| Wrong detail identity | investmentId esperado correto porém chainIndex diferente/null → envelope detail bloqueado e sem dado elegível | EX08/EX10 |
| Excluded POST | enable signals só pode chamar leaderboard GET; latest signal capability bloqueada identifica POST; nenhuma busca DeFi ou operação financeira | EX14 |

Comandos previstos no workspace do implementer: bun --no-env-file test --parallel=1 --timeout 15000 ./src/real/extensions.test.ts; typecheck existente com tsconfig.verification.json. Resultado RED/GREEN/typecheck deve registrar comando, exit code, hash dos arquivos e erro literal caso exista. Testes de wiring e typecheck final do integrador, mais review independente com árvore/hash fixos, continuam necessários. Não promover um teste injected a teste real.

## Alternativas reais e limite da escolha

A opção mínima GET acima reutiliza clients e cabe no orçamento, mas exige pré-qualificação independente e investmentId conhecido para detalhe. Um perfil somente catálogos (DeFi chains + Signal chains + leaderboard chains) também usa três GETs e evita acesso ao leaderboard Premium; ele comprova descoberta de capacidades, não integração de APY/leaderboard. Um perfil com POST signal/list ou DeFi search traz dados diferentes e precisa fatia/contrato separados para método, budgets e entitlement; não é fallback silencioso. Uma rotina independente de qualificação pode obter catálogos fora do ciclo, com consumo autorizado e receipts próprios, mas não pertence a esta implementação.

Essas alternativas registram consequências para o integrador. A proposta mínima não aprova spending, não cria fatos de entitlement e não substitui decisão consultiva real quando existir ambiguidade delegada. Falta de acesso/qualificação mantém bloco verificável enquanto trabalho independente segue.

## Fontes locais fixadas

SHA256 observados em 2026-10-11, relativos ao worktree de integração. Mudança concorrente exige revalidar somente o contrato afetado antes de integrar.

| Arquivo | SHA256 |
| --- | --- |
| docs/real-integration/INSTRUCAO-DO-OBJETIVO.md | CFA90CAC735E9A838A0C4BC593276C83757905E7C5FEDCD2414E499B1DAD9E08 |
| docs/real-integration/EXECUTION-SPEC.md | EEB6AB8D9E4ADF990600A8806BCEAEB7774A5EEFE1AE3BBE7DABA70E590290EF |
| src/onchainos/endpoints.ts | 23158BCD606D26A710723A55D18B5C4EDDD8C2C5F1273B3DE88182F4B73134B5 |
| src/onchainos/signals.ts | 677B855882D6C70A2E2DBD11422138EBBA544D2F97BDB5EE5FDA1351C315C756 |
| src/onchainos/defi-read.ts | 23B50CC9BA14B28932601B4B6CE17E2D5731C20728DB681ED598D607F5AF6432 |
| src/onchainos/http.ts | 24CEB40932010EDAF189A228313FECA214AFAC3FAAE13FFD2D435A3B0E23B3F4 |
| src/onchainos/read.ts | CC7D8A73B2B9EBACB5EC2298C2CC929D4ACDB0262E7567B465B7AE3A6EBA6B15 |
| src/real/types.ts | D616006998EB39B08E42FE10100ADEABBC07D67DC58BE40782E3DE630BCA5ED9 |

## Fontes oficiais fixadas nesta fatia

Hashes dos bytes HTTP de documentação pública obtidos sem autenticação. Não são hashes de respostas das APIs de negócio. Páginas são mutáveis; um hash permite detectar mudança, mas não prova disponibilidade de serviço.

| Fonte | Acesso UTC | Bytes | SHA256 |
| --- | --- | --- | --- |
| DeFi supported chains | 2026-10-11T19:05:07.7112385Z | 64420 | BCFC63324FC9073B50F77C6E0046BAC90FC5A6E6F7F356CC4BA13AE495745ED0 |
| Signal chains | 2026-10-11T19:05:08.2126689Z | 70982 | 9F35FA3A3147514B427B381B855F2A67EF8C4E1D0C2C198C44F3D9BA58C6BE2D |
| Leaderboard chains | 2026-10-11T19:05:08.5693863Z | 68877 | 4605679F622E86E2DA3C0261E0C519CE5AE5C972A3E1B034DF249B5351F23255 |
| Leaderboard list | 2026-10-11T19:05:08.9460072Z | 75354 | E9AB6598AFA86BE5C4B464C5E432263B00095569CDFF77D05B372D9D41146121 |
| DeFi detail | 2026-10-11T19:05:09.3232266Z | 71143 | C2D9B0EE033D427506D80CF12A8D9F652FA2903AB823727B943595DB43919F56 |

Fontes API access/latest signals foram consultadas na pesquisa oficial anterior de 2026-10-11; hashes: B7E5EFA6AC23132A6063C43E92FF08726A734527010BCB1E5C0760647B47F60E e 7994EFE642030E7DC9DD562C6CA524839096C2E8845C3197F999B217814F3166, respectivamente. Nenhuma fonte concede autorização de operação.
