# Observações DeFi offline V1

Estado: SPEC candidata, ainda sem congelamento. Objetivo autorizado: ampliar a análise OKX/Web3 do GEV com evidências de produtos, rendimento, custos e limitações. Esta entrega permite comparar capturas locais de busca e detalhe; não executa investimento nem demonstra crescimento da carteira.

## Fontes e decisões

Pesquisa aprovada: `RESEARCH.md` SHA256 `a1b3d9834417f55a862e2b03093b3dc0550b7724ffd2aadac0e5b31de1bdc4be`; catálogo `SOURCES.json` SHA256 `ebdee85ee3adef260118c332e12eeeca79ecd215ce84423b5a641528d26690c3`. Complemento factual independente `DEFI-FIELD-CONTRACT-V1.json` SHA256 `300a3090bf8a1f760a78dbe352ab4bf6a093e4b3d7c8a4fcff99968dc9cc0f68`, consultado em 2026-10-10. As tabelas e exemplos não definem todos os campos obrigatórios nem um esquema completo de erros.

- [Busca oficial](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-search): `data` objeto com `total` e `list`; página de até 20 produtos; `investmentId` String na tabela, número no exemplo; `chainIndex` String; `rate` APY como fração decimal; `tvl` USD; `feeRate` BigDecimal sem base de custo demonstrada.
- [Detalhe oficial](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-detail): `data` objeto; discrepância String/número para `investmentId`; `analysisPlatformId` String; `rate` rendimento genérico na tabela e `rateTypeDesc: APY` apenas no exemplo; unidade numérica de rate e de TVL não demonstrada. Indicadores de investimento/resgate/claim referem-se ao produto.
- Jev `13053fc4-6e47-408f-a948-8f104eecd2f1`: captura raw limitada e CLI offline. Jev `f4d034a6-5e74-4160-9828-5326e6bdf34b`: texto exato ou inteiro seguro para ID; opcionais inválidos tornam-se desconhecidos com issue finita. Jev `b2c140a5-c98d-44c6-a952-70bfa62801b4`: correlação exata produto/rede não verificada e unidade do rendimento do detalhe desconhecida. Recibos são decisões técnicas reais, `approved_by=jev_delegated`, `human_response=false`, custo faturado desconhecido null. Não concedem permissão financeira.

## D1: captura e limites estruturais

Função pública pura `buildDefiReport({search, detail, nowMs, maxAgeMs})` aceita os dois captures como `unknown`. Não lê ambiente/arquivos, não consulta rede, não muta inputs e não recebe dados pessoais. Cada captura é objeto JSON com `schema: "okx_defi_capture_v1"`, `endpoint: "search"|"detail"` correspondente ao argumento, `sourceClaim: "synthetic"|"okx_api_claimed"`, `capturedAtMs: null|number` e `response` contendo o envelope original. Campos extras nunca são exportados.

O contrato local exige `response.code === 0` numérico e `response.data` objeto não array. `msg` é ignorado. Outros códigos, tipos ou estruturas falham com erro finito; nenhum erro inclui código bruto, mensagem, campo arbitrário, conteúdo ou path. Não há afirmação de que este validador cubra todo o protocolo OKX.

Busca exige `data.total` inteiro seguro não negativo e `data.list` array de 0 a 20 objetos. `total >= list.length`, mas não se exige igualdade; resultado é sempre `partial_unverified`, nunca o mercado completo. Detalhe exige um objeto de produto. Máximo: 21 observações, na ordem da busca seguida pelo detalhe. Duplicatas da identidade exata produto/rede na busca são erro; campos opcionais e plataforma não removem essa duplicata.

`nowMs` e relógios não nulos: inteiros seguros entre 0 e 8640000000000000; `maxAgeMs`: inteiro entre 1 e 3600000. `capturedAtMs` é obrigatório como metadado (null explícito permitido); inválido não vira null silenciosamente. Limites sem inferência de defaults no modo importado.

## D2: identidade conservadora

Cada produto exige `investmentId` como texto ASCII exato de 1 a 128 caracteres `[A-Za-z0-9_.:-]`, ou número inteiro positivo seguro. Texto é preservado sem trim, normalização ou retirada de zeros; representação `text`. Número é convertido somente para sua representação decimal exata, com `representation: "safe_integer"`; float, zero, negativo e inteiro inseguro falham. String `"00123"` continua distinta de número 123; String `"123"` e número 123 têm a mesma chave textual, mantendo suas representações separadas.

`chainIndex` exige texto decimal positivo de 1 a 20 dígitos, sem zero inicial (`[1-9][0-9]{0,19}`); não usa nome de rede como substituto. A chave usa a dupla textual estruturada, sem concatenar delimitadores ambíguos. Plataforma, símbolos, nomes e tokens não fornecem identidade substituta.

Se detalhe e uma linha de busca compartilham ambos os identificadores, `association` registra `status: "identity_match_unverified"`, `searchIndex` daquela linha, e `detailIndex` igual à quantidade de linhas da busca. Caso contrário `status: "unmatched"` e `searchIndex: null`. A correspondência nunca mescla observações, escolhe uma fonte, autentica identidade ou muda execução. O índice do detalhe existe inclusive com busca vazia.

## D3: campos opcionais e unidades

Saída contém apenas os campos descritos nesta SPEC. Texto opcional preserva o valor exato, aceita Unicode, exige pelo menos um caractere não branco e ausência de controles U+0000..001F e U+007F..009F; limites: nome do produto/plataforma 160 unidades UTF-16, rede 80, plataforma ID 128, label de rendimento 32. Strings opcionais inválidas não são exportadas.

Valores financeiros opcionais aceitam apenas texto decimal de até 96 caracteres, sem expoente, percent sign, whitespace, Infinity ou NaN: `-?(0|[1-9][0-9]*)(\.[0-9]+)?`. Yield pode ser negativo; TVL e fee não aceitam sinal negativo. O texto é preservado, sem Number/parseFloat, soma, conversão para lucro ou comparação de magnitude. Números JSON, incluindo feeRate numérico, são desconhecidos por não demonstrar representação decimal exata. Zero textual é um valor observado, não custo completo.

Na busca: `productName <- name`, `platformName <- platformName`; `platformId` e `network` null; `advertisedYield: {value <- rate, label: "APY", unit: "decimal_fraction"}`; `tvl: {value <- tvl, unit: "USD"}`; `fee.value <- feeRate` somente texto decimal válido. Indicadores de capabilities são todos null, inclusive se um extra importado os fornecer.

No detalhe: `productName <- investmentName`, `platformName`, `platformId <- analysisPlatformId`, `network`; `advertisedYield.value <- rate`, `label <- rateTypeDesc` somente texto opcional válido, `unit: "unknown"` inclusive com label APY; `tvl.value <- tvl`, `unit: "unknown"`; `fee.value <- feeRate`. `capabilities` contém `isInvestable`, `isSupportRedeem`, `isSupportClaim` apenas booleanos estritos. `rateType` numérico não define enum, unidade ou label. `underlyingToken`, rateDetails, calldata, URLs, endereços e demais campos não são exportados nem enriquecidos.

Opcionais ausentes/null viram null com issue `missing_optional`; inválidos viram null com `invalid_optional`. Um issue por campo aplicável: campo de saída finito (`productName`, `platformName`, `platformId`, `network`, `advertisedYield.value`, `advertisedYield.label`, `tvl.value`, `fee.value`, `capabilities.isInvestable`, `capabilities.isSupportRedeem`, `capabilities.isSupportClaim`), sem valor bruto. Campos deliberadamente não aplicáveis à busca permanecem null sem issue. Máximo 11 issues por observação. Todas as fees têm `basis: "unknown"` e `completeCost: null`.

## D4: origem, tempo e qualificação

Cada observação preserva `source: "search"|"detail"` e `provenance: {sourceClaim, verification: "unverified", capturedAtMs, ageMs, freshness, providerTimestampMs: null, providerTtlMs: null}`. Null produz `ageMs: null`, `freshness: "unknown"`; futuro produz ageMs null e `future`; caso contrário ageMs é now-captured, `fresh_local_capture` quando age <= maxAgeMs, `stale` quando maior. Atualidade da captura declarada não demonstra atualidade ou autenticidade do provedor. Nenhum timestamp ou TTL bruto importado altera esses nulls.

Relatório: `schema: "okx_defi_report_v1"`, `generatedAtMs`, `maxAgeMs`, `mode: "synthetic"` somente quando ambas sourceClaims são synthetic, caso contrário `imported`; `searchCoverage: {claimedTotal, observedCount, status: "partial_unverified"}`; `observations`; `association`; `execution: "not_qualified"`; `netReturn: null`; `executableExit: null`; `personalEligibility: "unknown"`; `totalCosts: null`. Campos imported `qualified`, risco aprovado, status financeiro, rendimento líquido ou flags similares são ignorados.

Mesmo com APY alto, TVL alto, fee zero, relógio recente e capabilities true, execução continua not_qualified. Não há ranking, alerta de compra/venda, orçamento, reinvestimento, projeção composta ou conversão de TVL em liquidez de saída. Não são preenchidos saldos, taxas gas, tamanho de posição, disponibilidade pessoal de resgate ou retorno realizado.

## D5: CLI local e fronteira de arquivos

`scripts/okx-defi.ts` importa somente módulo puro, fixture e APIs locais necessárias. Sem flags entrega demo determinística inteiramente sintética, relógio fixo e relatório JSON newline. Fixture distingue pelo menos dois produtos da busca e um detalhe, com correspondência e desconhecidos de unidade/fee explícitos. `--help` sozinho imprime ajuda em português e não abre arquivos. Nenhum caminho/import pode disparar API autenticada, rede, .env, login ou rotina de trader.

Modo importado exige exatamente `--search <arquivo> --detail <arquivo> --max-age-ms <inteiro>`, cada flag uma vez, ordem livre. Flags desconhecidas, repetidas, argumentos faltantes, flags parciais, help misturado, sinais e formas não decimais são erro antes de qualquer leitura. Sem `--live`, URL ou fallback para o provider. Inteiro textual de max-age segue `[1-9][0-9]*` e limite D1. CLI usa relógio local atual no importado.

Cada arquivo deve ser regular local, UTF-8 estrito, JSON e no máximo 1048576 bytes, verificado por handle aberto e mesmo handle de leitura, incluindo crescimento além do limite. Rejeitar URL/scheme (exceto letra de drive absoluta), UNC, NUL, dispositivo Windows, alternate data stream, diretório e arquivo inexistente com erro finito; não incluir path bruto. Arquivos locais relativos e caminhos absolutos normais de drive são aceitos. Links resolvidos para arquivo regular local são permitidos; não inventar sandbox. Entradas criadas/sobrescritas pelo CLI: nenhuma.

Erros fatais têm código fechado: `invalid_arguments`, `invalid_file`, `invalid_utf8`, `invalid_json`, `invalid_capture`, `invalid_envelope`, `invalid_search`, `invalid_identity`, `duplicate_identity`, `invalid_clock`. CLI termina exit 1, stdout vazio e stderr contendo apenas `okx-defi: <codigo>\n`. Erros inesperados do módulo/IO também são convertidos a um destes códigos, sem mensagem/stack original. `--help` e resultados válidos terminam exit 0. A função pode lançar erro tipado com `.code` nessa união; sua mensagem contém somente o código.

## D6: integração e exclusões

Arquivos do escritor isolado: `src/okx-defi/report.ts`, `report.test.ts`, `fixture.ts`, `scripts/okx-defi.ts`, `scripts/okx-defi.test.ts`. Integrador somente: SPEC, GUIA, BASELINE.json, DECISAO-V2.json, package.json e README.md. Sem nova dependência. Adicionar `okx:defi` com `bun --no-env-file run scripts/okx-defi.ts`; documentação recomenda `bun --no-env-file run okx:defi`. Preservar demais scripts e texto preexistente; não modificar engine, supervisor, carteira, DEX, Signals ou scanner.

Baseline isolado: `BASELINE.json` SHA256 `1982b48aafae0a59f971fa50a22fbd5982e5923af99fbca52c6a987cac0b06e8`, 272 arquivos protegidos, HEAD anteriormente observado `b587759e459ea049590102e54a0b07800864cdc3`, sem nova leitura Git. Conferir hashes atuais antes/depois da integração e preservar alterações concorrentes. Não stage/commit/push, não ler .env, credenciais, carteira, dados pessoais, nem executar CLI live/trader/rewards/claim.

## D7: verificações obrigatórias

TDD: registrar falha de regressão comportamental antes de implementação, não apenas import ausente. Depois mínima implementação, testes Bun pertinentes e strict scoped sem nova instalação. Casos: envelopes numeric success e falhas finitas; busca vazia/20/21/total parcial; IDs zero inicial e safe integer/unsafe/float; redes e duplicatas; correspondência vs mismatch; opcionais ausentes/invalidos sem eco; APY busca separado de detalhe unidade unknown; fee/TVL zero não qualificam; clocks limite/futuro/null/stale; whitelist de dados extras; input preservado; argumentos inválidos antes de I/O; UTF8 inválido, JSON inválido, tamanho acima do limite, regularidade e paths rejeitados; demo/help/import real de fixture em subprocesso Bun `--no-env-file` sem segredos. Exercitar também a rota package `bun --no-env-file run okx:defi` em cópia isolada, com ambiente mínimo, timeout finito e sem arquivo .env nem segredos; conferir estaticamente a presença de `--no-env-file` no comando Bun interno.

Revisores independentes recebem esta SPEC congelada, baseline fixo, hashes do candidato e evidências reais. Um verifica D1-D7 e outro normas/efeitos colaterais. Auditoria verifica origem, hashes, cobertura e integrações. Testes sintéticos não certificam instalação, auth, feed vivo, resgate, liquidez, retorno financeiro nem performance do Desktop. Testes globais anteriores tinham falhas não pertinentes preservadas; não chamar o projeto inteiro de verde.

## D8: entrega e definição de pronto

GUIA português com execução demo/import, wrapper explícito, unidade/fee/TTL desconhecidos, distinção dados sintéticos vs origem alegada, limites de uma página e nenhuma qualificação financeira; link no README. Entrega pronta somente com D1-D8 exercitados por testes/análise apropriados, strict zero, duas revisões independentes sem achados pendentes, auditoria e hashes de integração. O objetivo de ganho da carteira permanece separado e não demonstrado; próximo passo elegível depende de evidência própria de execução/custos/saída/acesso.
