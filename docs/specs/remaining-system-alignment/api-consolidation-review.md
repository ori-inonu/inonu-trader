# Revisao limitada da consolidacao OKX

Origem: jev-trader-goal1, HEAD a4a9ef5, com os deltas locais preservados. Base comparada: main 2327a28. Esta passagem nao aplica a consolidacao nem autoriza mudancas de autenticacao.

## Contratos e consumidores

Main tem dois clientes homonimos com contratos diferentes. O cliente da raiz expoe getMemePumpSupportedChains, getMemePumpTokenList, getTokenPriceInfo, getTokenAdvancedInfo e getTokenTopLiquidity. O de okx-market expoe protocols, listMemePump, prices, advanced e pools. A proposta remove o segundo arquivo e concentra a interface curta no cliente da raiz.

| Consumidor da origem | Adaptacao observada |
| --- | --- |
| scripts/okx-scan.ts | adota o contrato curto; advanced retorna lista e o CLI usa a primeira linha; valida identidades das linhas no CLI |
| scripts/okx-market-scan.ts | troca import e campo secret por secretKey; passa allowLiveRequests explicitamente |
| src/okx-market/okx-scan.ts | importa tipos, marca da fabrica e erro de identidade do cliente da raiz |
| src/okx-market/okx-fixture.ts | importa o tipo unificado; preserva marca sintetica propria |
| src/okx-opportunities.ts | importa apenas TokenIdentity; sem adaptacao de chamada |

Busca delimitada em src e scripts, arquivos TypeScript sem testes: os consumidores nomeados do cliente correspondem a essa lista. Isso nao prova ausencia de consumidores dinamicos, de uso externo ou em documentos. Os testes de scanner e relogio tambem foram adaptados na origem. A exclusao do cliente antigo so pode acompanhar a compatibilidade comprovada dos consumidores e a revisao dos documentos que o referenciam.

## Fronteira de autenticacao

A proposta nao e apenas remocao de duplicacao. Em src/okx-api.ts, readCredentials valida ASCII e copia/congela as credenciais; a fabrica passa a recusar opcoes desconhecidas; a normalizacao da identidade altera o caminho ou corpo usado na assinatura. scripts/okx-scan.ts passa a sincronizar e injetar o relogio corrigido. O prazo padrao muda de 5 para 10 segundos e a recusa por timeout passa a usar uma corrida com deadline.

Essas diferencas precisam ser avaliadas como comportamento. Alterar credenciais, autenticacao ou assinatura esta fora da decisao automatica pelo AGENTS.md. Bloqueio registrado: integrar o conjunto que modifica esses caminhos. Nao foi aplicado nenhum trecho desse conjunto no candidato, nem removido o cliente antigo. Uma futura fatia puramente estrutural exige plano e prova de equivalencia proprios; os checks abaixo nao concedem essa permissao.

## Verificacao executada na origem

Quatro suites foram executadas com --no-env-file e um preload local que recusa o fetch global. Os fetchers e relogios locais dos testes sao simulados; as substituicoes temporarias do fetch global tambem devolvem respostas simuladas. Nao houve consulta autenticada, carregamento de arquivo de ambiente, consulta Jev ou operacao financeira.

```
bun --no-env-file test --preload <guard-local> src/okx-api.test.ts scripts/okx-scan.test.ts src/okx-clock.test.ts src/okx-market/okx-scan.test.ts
89 pass
0 fail
858 expect() calls
Ran 89 tests across 4 files. [318.00ms]
```

Os nove arquivos relevantes conferidos por SHA-256 permaneceram byte-identicos antes e depois. Evidencia local: .scratch/okx-consolidation-review-20261018/result.json e logs associados. Este total cobre somente as quatro suites; nao e o definition of done de goal1, nem mede performance da API real, do agente ou do modelo.

Decisao local sem-jev: executar apenas a verificacao offline e registrar a fronteira, preservando o conjunto de origem. O conector Jev Engineering nao esta disponivel. C1 continua parcial, e a integracao do trecho de autenticacao permanece bloqueada para decisao automatica.
