---
title: "Mercado e dados: contratos de leitura, captura e histórico"
created: 2026-10-13
updated: 2026-10-16
type: concept
tags: ["dados", "onchainos", "integracao", "evidencia", "seguranca", "risco"]
sources: [
  "docs/_meta/project-state-20261013.json",
  "docs/PUBLIC-MARKET-CAPTURE.md",
  "docs/OKX-HISTORICAL-ARCHIVES.md",
  "docs/OKX-HISTORICAL-DATA-QUALIFICATION.md",
  "docs/okx-dex-sdk-units-v1/RESEARCH.md",
  "docs/okx-dex-units-v3/RESEARCH.md",
  "docs/okx-dex-v2/OKX-DEX-QUOTE-CONTRACT-20261009.md",
  "docs/okx-dex-v2/OKX-DEX-V2-GUIDE.md",
  "docs/okx-dex-v2/OKX-DEX-V2-PLAN.md",
  "docs/okx-dex-v2/OKX-DEX-V2-SPEC.md",
  "docs/okx-market-v1/OKX-DEX-V2-CONTRACT-AMENDMENT-DRAFT-20261009.md",
  "docs/okx-market-v1/OKX-INTEGRATION-RESEARCH-20261009.md",
  "docs/okx-market-v1/OKX-LONG-GOAL-CHECKPOINT.md",
  "docs/okx-market-v1/OKX-SCANNER-INTEGRATION-VERIFICATION.md",
  "docs/okx-market-v1/OKX-API-TDD-EVIDENCE.md",
  "docs/okx-market-v1/OKX-WEB3-INTEGRATION.md",
  "src/okx-market/okx-api.ts",
  "src/okx-market/okx-dex.ts",
  "src/okx-market/round-trip.ts",
  "src/okx-market/synthetic-round-trip.ts",
  "src/okx-market/okx-scan.ts",
  "src/okx-market/okx-opportunities.ts",
  "src/okx-market/token-identity.ts",
  "scripts/okx-market-scan.ts",
  "scripts/okx-dex-quote.ts",
  "src/okx-clock.ts",
  "src/system-one/clock.ts",
  "src/public-market-capture/plan.ts",
  "src/public-market-capture/node-adapter.ts",
  "src/public-market-capture/observations.ts",
  "src/public-market-capture/runner.ts",
  "src/onchainos/archive-discovery.ts",
  "scripts/okx-archive-discovery.ts",
  "scripts/public-market-capture.ts",
  "scripts/capture.ts",
  "web/src/lib/mesa/capture.ts",
  "package.json",
  "docs/_meta/project-state-reconciled-current-20261013.json",
  "docs/sdd/ui-audit-20261013/SPEC.md",
  "docs/sdd/ui-audit-20261013/REPORT.md",
  "docs/sdd/ui-audit-20261013/browser-matrix.md",
  "web/src/lib/mesa/market-inputs.ts",
  "web/src/components/Desk/MesaView.tsx",
  "web/src/components/Desk/InstrumentHeader.tsx"
]
confidence: medium
---

# Mercado e dados: Exchange pública, DEX, captura e histórico

Esta página separa contratos que usam nomes parecidos, mas têm origens, unidades e gates diferentes. O estado de referência geral é o código observado em 13 de outubro de 2026; a nota do leitor do mecanismo de oportunidades registra apenas a validação sintática adicionada em 16 de outubro de 2026. A auditoria é estática, sem chamada a API, WebSocket, RPC, modelo ou download de arquivo. Os links apontam para as linhas do working tree inspecionadas. ^[docs/_meta/project-state-20261013.json]

## Mapa de superfícies

| Superfície | Origem e dados | Limite principal |
| --- | --- | --- |
| Exchange pública V5 | REST `www.okx.com` e WebSocket público `ws.okx.com` (porta 443; a 8443 deixa de funcionar em 2026-10-31) | Captura exige plano, recibo factual e runtime qualificado; o adaptador atual bloqueia antes do egress. |
| Mercado Web3 | `web3.okx.com/api/v6/dex/market/*` | Dados de tokens, autenticados por HMAC; não é o WebSocket público Exchange nem uma carteira. |
| Agregador DEX | `web3.okx.com/api/v6/dex/aggregator/*` | Cobertura de rede e no máximo uma quote autenticada; unidade de saída não qualificada. |
| Histórico Exchange | REST público de metadados | Lista arquivos, mas não baixa nem valida o conteúdo. |
| Captura de gráfico | Canvas local do navegador | Exporta PNG; não é captura de mercado nem tráfego externo. |

## Fonte selecionada na Mesa

`marketInputsFor` escolhe uma única origem para cabeçalho e gráfico. Quando há seleção on-chain, valores ausentes permanecem ausentes, os derivados de exchange ficam nulos e a UI usa o rótulo "Aguardando dados on-chain"; não há fallback implícito para uma cotação OKX. `MesaView` passa as mesmas fatias selecionadas a `InstrumentHeader` e `PriceChart`, evitando que o preço principal e o desenho usem fontes diferentes. A auditoria visual relata estados vazios sem anúncio falso de dados ao vivo; isso não qualifica frescor nem disponibilidade de um feed real nesta sessão. ^[web/src/lib/mesa/market-inputs.ts] ^[web/src/components/Desk/MesaView.tsx] ^[web/src/components/Desk/InstrumentHeader.tsx] ^[docs/sdd/ui-audit-20261013/REPORT.md] ^[docs/sdd/ui-audit-20261013/browser-matrix.md]

## Exchange pública V5 e captura

O leitor do mecanismo de oportunidades (`src/opportunity/okx-daily.ts`) consome tickers e candles diários da API pública V5. Campos numéricos em texto usam a gramática estrita de `parseDecimal`; campos obrigatórios malformados fazem a linha ser contabilizada como rejeitada, enquanto métricas opcionais de ticker permanecem indisponíveis. A validação de forma não atesta frescor dos dados.

`public-market-capture` é o gravador finito de `books` e, opcionalmente, `funding-rate`; ele mantém bytes recebidos, unidades de metadados, identidades e sequência, sem reconstruir livro, estimar fills ou qualificar estratégia. O plano fixa schema e endpoints, aceita um ou dois instrumentos e no máximo três streams; os limites incluem 300.000 ms, 10.000 mensagens, 1 MiB por payload, 32 MiB persistidos e 8 MiB de ingress. [Plano e limites](../../src/public-market-capture/plan.ts#L3-L29) [observações e sequência](../../src/public-market-capture/observations.ts#L36-L50) ^[docs/PUBLIC-MARKET-CAPTURE.md]

Um recibo de acesso não basta: termos, região e autoridade precisam ser evidência factual, e as capacidades do runtime também precisam ser qualificadas. O adaptador Node declara `evidence: "unknown"`, `incrementalEncoded: false`, `aggregateHeld: false`, `interruptible: false` e `sharedDeadline: false`; `requireQualifiedRuntime()` recusa metadados e conexão. `runCapture` faz preflight antes de criar diretório ou chamar transporte. Portanto, no código atual, `--capture` não habilita egress; a recusa não certifica acesso regional ou permissão. [gate do adaptador](../../src/public-market-capture/node-adapter.ts#L11-L15) [preflight e início](../../src/public-market-capture/runner.ts#L18-L29) [CLI](../../scripts/public-market-capture.ts#L22-L35) ^[docs/PUBLIC-MARKET-CAPTURE.md]

O relógio de captura separa Unix ms local, nanosegundos monotônicos e timestamps de evento do provedor; offset e incerteza ficam `null` no relógio local. `globalAvailableAt` também fica `null`. Para books, o código verifica confirmação de inscrição, snapshot `prevSeqId=-1`, predecessor e resets; `checksum: "0"` resulta explicitamente em `checksumIntegrity: false`. Hashes verificam integridade local, não autenticidade do provedor. [relógio e relatório](../../src/public-market-capture/runner.ts#L10-L16) [parser de observações](../../src/public-market-capture/observations.ts#L81-L102) [persistência](../../src/public-market-capture/store.ts#L70-L91) ^[docs/PUBLIC-MARKET-CAPTURE.md]

A persistência em disco não observa a conclusão da própria gravação final: o manifesto mantém `finalTiming.state="unobserved"` e `outcome="failed_incomplete"`, preservando separadamente `provisionalOutcome`. O processo pode produzir um relatório mais forte após leitura de volta, mas isso não foi executado nesta auditoria. Um `--inspect` íntegro não converte esse estado em continuidade qualificada. [manifesto e readback](../../src/public-market-capture/store.ts#L70-L91) [finalização do runner](../../src/public-market-capture/runner.ts#L229-L247) ^[docs/PUBLIC-MARKET-CAPTURE.md]

## Descoberta de arquivos históricos

`scripts/okx-archive-discovery.ts` é dry-run por padrão. `--public` permite exatamente um GET não autenticado ao endpoint fixo de metadados, sem retry e sem baixar qualquer URL listada. A resposta valida grupos, limites, datas e identidade; `dateTs` e `dataTs` são aliases aceitos somente se iguais. `fileAccess`, `historicalCoverage`, `rights`, `fileSchema` e `executionAvailability` permanecem `unknown`. [CLI](../../scripts/okx-archive-discovery.ts#L13-L52) [request e parse](../../src/onchainos/archive-discovery.ts#L84-L121) [alias, URL e qualificação](../../src/onchainos/archive-discovery.ts#L176-L239) ^[docs/OKX-HISTORICAL-ARCHIVES.md]

`begin` e `end` são strings decimais de Unix ms; o adaptador usa UTC+0 para módulos 4/5/6 e UTC+8 para os demais, com até dez buckets inclusivos. `sizeMB` permanece texto decimal; o timestamp do provedor não é o relógio local da requisição nem prova quando o arquivo ficou disponível. O registro de 11 de outubro de 2026 descreve uma resposta de metadados de 511 bytes para BTC-USDT em 1 de outubro de 2026 e um arquivo declarado de 109,26 MB; nenhum byte desse arquivo foi obtido. Isso é evidência histórica de uma listagem, não cobertura atual. [política de datas](../../src/onchainos/archive-discovery.ts#L110-L121) [campos de arquivo](../../src/onchainos/archive-discovery.ts#L219-L239) [qualificação datada](../OKX-HISTORICAL-DATA-QUALIFICATION.md#L3-L20) ^[docs/OKX-HISTORICAL-ARCHIVES.md]

## Scanner de mercado Web3

`src/okx-market/okx-api.ts` fixa cinco rotas de mercado em `web3.okx.com` e assina requests com API key, secret e passphrase. A origem contém dados públicos de tokens, mas o cliente exige credenciais e HMAC; não consulta saldo, carteira ou envia ordens. Identidade é o par `chainIndex` + endereço do token; endereços só são normalizados para caixa baixa nas redes EVM listadas. [cliente e rotas](../../src/okx-market/okx-api.ts#L4-L16) [assinatura](../../src/okx-market/okx-api.ts#L165-L189) [identidade](../../src/okx-market/token-identity.ts#L1-L13) ^[docs/okx-market-v1/OKX-WEB3-INTEGRATION.md]

O alias `okx:market-scan` usa `scripts/okx-market-scan.ts`: sem flags é sintético; modo live exige `--live`, chain, stage, protocol, limit de 1 a 30 e credenciais no ambiente do processo. O scanner consulta cobertura, uma página de tokens, preços quando há identidades, e dois enriquecimentos por token; no limite de 30, o teto estático é 63 chamadas de método. Não segue cursor de paginação. O relatório continua com `externalAccessObserved: false`, `costUsd: null`, `quotaRemaining: null` e `liveQualified: false`; `research_candidate` nunca qualifica execução. [CLI](../../scripts/okx-market-scan.ts#L9-L41) [fluxo e relatório](../../src/okx-market/okx-scan.ts#L17-L72) ^[docs/okx-market-v1/OKX-SCANNER-INTEGRATION-VERIFICATION.md]

A avaliação interpreta `price.time` como `priceTimeMs` numérico e compara com o `now` fornecido; a política padrão marca preço futuro e preço com mais de 60.000 ms como bloqueio. O CLI injeta `Date.now` para observação/frescor, embora use `okxNow` para timestamp HMAC. `riskControlLevel=0` vira `riskLevel=null`, portanto não é tratado como risco baixo. Campos de preço, taxa e liquidez usados na triagem não substituem custo executável ou confirmação de venda. [normalização e política](../../src/okx-market/okx-opportunities.ts#L14-L20) [timestamp e risco](../../src/okx-market/okx-opportunities.ts#L45-L83) [clock no CLI](../../scripts/okx-market-scan.ts#L35-L41) ^[docs/okx-market-v1/OKX-API-TDD-EVIDENCE.md]

Há ainda o cliente paralelo `src/okx-api.ts` com `allowLiveRequests=false` por padrão e o script direto `scripts/okx-scan.ts`, que o habilita no modo live. Esse script tem outro contrato e retorna `dataOrigin: "unknown"`, `externalAccessObserved: false`, custo `null` e quota `unknown`. O pacote não define alias `okx:scan`; não confundir esse caminho com `okx:market-scan`. [cliente raiz](../../src/okx-api.ts#L4-L16) [gate do cliente](../../src/okx-api.ts#L221-L240) [script paralelo](../../scripts/okx-scan.ts#L80-L93) [scripts do pacote](../../package.json#L20-L49)

## Quotes DEX, unidades e tempo

O cliente DEX usa duas rotas GET fixas, intervalo mínimo de 1.100 ms e `exactIn`/`singleRouteOnly=true`. `amountAtomic` é uma string inteira positiva de entrada, até 78 dígitos. A resposta `toTokenAmount` é preservada como texto em `outputRaw`, mas `outputUnit="unknown"`; a composição autenticada consulta cobertura e no máximo uma quote, depois termina `unknown`, com `outputAtomic`, delta bruto e net nulos. Taxa em USD e estimativa de gas em unidade atômica nativa não são somadas nem convertidas; cobertura de custo permanece desconhecida. [cliente DEX](../../src/okx-market/okx-dex.ts#L4-L9) [quote fixed route](../../src/okx-market/okx-dex.ts#L317-L344) [unidade e uma quote](../../src/okx-market/round-trip.ts#L94-L110) [resultado fail-closed](../../src/okx-market/round-trip.ts#L112-L171) ^[docs/okx-dex-v2/OKX-DEX-V2-GUIDE.md]

O exemplo sintético separado demonstra duas pernas `A→B→A`: entrada 1.000.000, saída 995.000 e delta bruto -5.000 em unidades fictícias. `source="synthetic"`, custos `null`, `netAtomic=null` e `execution="not_qualified"`; não é quote observada nem evidência de lucro. A função de cenário hipotético também não recebe automaticamente dados do cliente live. [fixture sintética](../../src/okx-market/synthetic-round-trip.ts#L3-L64) ^[docs/okx-dex-v2/OKX-DEX-V2-GUIDE.md]

## Relógio, frescor e gates

`syncOkxClock()` mede até três amostras; aceita apenas RTT de até 2.500 ms e offset plausível de até uma hora. Aplica correção a partir de 10.000 ms e avança a estimativa com relógio monotônico. Se a medição falha, retorna `null` sem apagar estado anterior. Os CLIs market e DEX aguardam a função, mas não verificam o retorno antes de continuar. A assinatura usa `okxNow`; a frescura do scanner usa `Date.now`, e `quoteRoundTrip` usa `Date.now` porque o CLI não injeta `now`. O orçamento DEX de 5.000 ms começa depois da sincronização, não limita o tempo total do comando. [política compartilhada](../../src/system-one/clock.ts#L15-L21) [medição](../../src/system-one/clock.ts#L66-L90) [estado do clock](../../src/okx-clock.ts#L16-L72) [uso nos CLIs](../../scripts/okx-market-scan.ts#L35-L41) [DEX](../../scripts/okx-dex-quote.ts#L49-L67) ^[docs/okx-market-v1/OKX-WEB3-INTEGRATION.md]

O comentário de `src/okx-clock.ts` que afirma atraso local de aproximadamente 77 segundos é comentário de código, não medição feita nesta auditoria. Nenhum clock foi sincronizado. Captura Exchange usa wall clock e monotônico locais com offset/uncertainty `null`; uma quote ou listagem não herda prova de frescor de outra superfície. ^[docs/PUBLIC-MARKET-CAPTURE.md]

## Entradas chamadas "capture"

- `okx:market-scan` e `okx:dex-quote` são aliases do pacote e usam `--no-env-file`; seus modos sem argumentos são sintéticos.
- Archive discovery e `public-market-capture` são scripts diretos; o primeiro permanece dry-run sem `--public`, e o segundo permanece offline/recusado pelo gate de runtime.
- O alias `capture` do pacote aponta para `scripts/capture.ts`, que exige `DRY_RUN=true`, cria `Market`, `Trader` e `createModel`, consulta blocos via RPC e grava resumo de sessão paper. Não é o gravador WebSocket público; não foi executado.
- `web/src/lib/mesa/capture.ts` escolhe um canvas e baixa PNG local com timestamp UTC e a legenda "nada foi enviado"; é captura de tela, sem acesso à Exchange.

Referências: [manifesto](../../package.json#L20-L49), [script paper](../../scripts/capture.ts#L1-L30), [PNG local](../../web/src/lib/mesa/capture.ts#L37-L55), [gravador V5](../../scripts/public-market-capture.ts#L5-L35).

## Documentos e divergências

O guia de captura, o guia DEX V2 e a especificação de descoberta de arquivos são referências atuais que coincidem com os limites encontrados no código. Pesquisas, TDD, verificações e revisões antigas permanecem evidência histórica, não execução repetida em 13 de outubro de 2026. [guia de captura](../PUBLIC-MARKET-CAPTURE.md#L5-L22) [guia DEX](../okx-dex-v2/OKX-DEX-V2-GUIDE.md#L1-L21) [arquivos históricos](../OKX-HISTORICAL-ARCHIVES.md#L49-L65)

O checkpoint registra a SPEC DEX D1-D8 congelada com hash `b6cdb5629a1899e22d7d54f0461d75fa4d56fd4a16284ce872f271981d2f469b`, e o hash do arquivo local confere. A SPEC exige A→B→A em D2; o código atual faz uma quote e para com unidade desconhecida. Isso é divergência confirmada de contrato, embora seja um bloqueio conservador documentado pelo guia posterior. A emenda que descreve esse bloqueio continua marcada como rascunho; o registro `OKX-DEX-V2-FREEZE.json` citado no checkpoint não existe neste checkout. Não alterei a SPEC. [checkpoint](../okx-market-v1/OKX-LONG-GOAL-CHECKPOINT.md#L15) [SPEC](../okx-dex-v2/OKX-DEX-V2-SPEC.md#L3-L23) [código](../../src/okx-market/round-trip.ts#L156-L162) [emenda](../okx-market-v1/OKX-DEX-V2-CONTRACT-AMENDMENT-DRAFT-20261009.md#L3-L17) [guia posterior](../okx-dex-v2/OKX-DEX-V2-GUIDE.md#L1-L19)

`OKX-INTEGRATION-RESEARCH-20261009.md` é referência desatualizada: declara a saída DEX em unidades mínimas e diz que scanner não foi implementado. Pesquisas de unidades posteriores deixam a unidade de saída desconhecida; o cliente atual preserva `outputRaw`, e o scanner/alias já existem. Os dois documentos de derivativos foram lidos, mas o código correspondente ficou fora desta inspeção e segue `needs_review`. [pesquisa antiga](../okx-market-v1/OKX-INTEGRATION-RESEARCH-20261009.md#L67-L76) [estado antigo](../okx-market-v1/OKX-INTEGRATION-RESEARCH-20261009.md#L202) [pesquisa de unidades](../okx-dex-sdk-units-v1/RESEARCH.md) [código DEX](../../src/okx-market/round-trip.ts#L94-L110) [scanner](../../scripts/okx-market-scan.ts#L9-L41) ^[docs/okx-market-v1/OKX-INTEGRATION-RESEARCH-20261009.md] ^[docs/okx-dex-sdk-units-v1/RESEARCH.md] ^[docs/okx-dex-units-v3/RESEARCH.md]

## Verificação e relações

Nenhum comando de produto, teste, sincronização de clock, conexão, download ou captura foi executado. O recibo de auditoria registra a classificação de cada documento atribuído, caminhos de código lidos, divergências, hashes comparados e dependências não verificadas. Consulte [[governanca-e-historico]], [[seguranca-e-qualificacao]] e [[manutencao-da-documentacao]].
