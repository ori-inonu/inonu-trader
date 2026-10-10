# Inonu Trader — primeira integração OKX Web3 verificável

Objetivo observado em 2026-10-09: ampliar o Inonu Trader com o JEV para pesquisar oportunidades no ecossistema OKX Wallet, avaliando liquidez, risco e retorno líquido. Crescimento composto depende de resultados líquidos realizados; não é promessa ou critério de aprovação financeira. O relato US$68 → US$6.700 não foi verificado.

Esta entrega é local e somente leitura: cliente Open API, scanner Meme Pump, triagem explicável e análise de cenários de custos. Não autoriza ordens, assinatura, transferências, pagamentos x402, instalação de carteira, publicação ou uso de credenciais de outro serviço. A conexão da extensão OKX não comprova acesso à Open API. Preservar os contratos READINESS-SPEC, PROFIT-SPEC e OKX-SPEC e todas as alterações anteriores.

## Fontes e limites

- [Acesso à API](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage): chave de desenvolvedor/projeto, passphrase, timestamp e HMAC da requisição exata; autenticação distinta da extensão.
- [Meme Pump protocolos](https://web3.okx.com/onchainos/dev-docs/market/market-memepump-get-supported-chains-and-protocols) e [lista de tokens](https://web3.okx.com/onchainos/dev-docs/market/market-memepump-get-token-list): descobrir protocolos; chainIndex e stage explícitos; até 30 tokens; não copiar IDs inconsistentes dos exemplos.
- [Price info](https://web3.okx.com/onchainos/dev-docs/market/market-token-price-info): POST com array de identidades, timestamp de mercado em milissegundos.
- [Advanced info](https://web3.okx.com/onchainos/dev-docs/market/market-token-advanced-info): campos vazios permanecem desconhecidos; createTime é criação, não observação de risco.
- [Pools](https://web3.okx.com/onchainos/dev-docs/market/market-token-top-liquidity): liquidityUsd mede pools informados; não comprova venda, profundidade executável, taxas totais ou liquidez consolidada.
- [Custos da API](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee): endpoints podem consumir quota/créditos; custo observado desconhecido permanece null.

## Aceitação imutável

E1. Cliente público somente leitura, origem fixa web3.okx.com e allowlist de cinco endpoints: protocolos/lista Meme Pump, price-info, advanced-info e top-liquidity. HMAC exato para GET/POST, parâmetros obrigatórios e limite 1–30 validados antes de fetch; timeout finito, nenhum retry automático, respostas de erro sem corpo/URL/credenciais. Schema inesperado e resposta code diferente de 0 falham explicitamente.

E2. Scanner CLI separado do trader e da carteira. Sem argumentos live executa apenas fixture local explicitamente marcada sintética; --live exige credenciais OKX completas, rede e stage explícitos antes de qualquer requisição. Descoberta/enriquecimento são finitos, até 30 itens; nenhuma busca em todos os protocolos ou chains implícita. Falta de acesso, quota e custo desconhecidos não equivalem a zero nem a funcionamento live.

E3. Identidade chainIndex + tokenContractAddress acompanha todo dado. Correspondência obrigatória nos dados de preço; EVM pode normalizar caixa, Solana preserva caixa. Campo vazio/inválido/não finito/negativo não vira zero. Price time mede idade dos preços; createTime nunca mede frescor de segurança. Pools vazios e tags ausentes permanecem desconhecidos; risco 0 é indefinido. Pool liquidityUsd e percentuais têm unidades explícitas.

E4. Triagem determinística com política explícita de idade máxima, liquidez mínima por pool, número mínimo de holders, concentração máxima e risco máximo. Honeypot conhecido, pouca liquidez, concentração excessiva, preço velho/futuro ou identidade incompatível bloqueiam a pesquisa. Dados críticos ausentes geram unknown e motivos específicos. A aprovação de filtros só produz research_candidate: execução sempre not_qualified; saída executável, segurança atual e taxas reais continuam dependências. Stage/bonding/momentum não provam oportunidade ou horário de compra/venda.

E5. Cenários econômicos opcionais e explicitamente hipotéticos calculam entrada, saída, impostos/slippage de cada perna e custos fixos de trading, rede, IA e outros. Validar cada input; retorno líquido <= margem mínima não passa. Exibir custo total e retorno de equilíbrio; nunca derivar retorno esperado de preço, sinais, concentração ou confiança do modelo. Um cenário positivo não libera execução. Testes usam exemplos independentes com valores literais e fronteiras.

E6. Nenhum segredo/carteira/endereço do usuário é copiado para o navegador, fixture, relatório ou Jev. Scanner não lê PRIVATE_KEY nem altera loop, orçamento, risk latch ou carteira do trader existente. Credenciais só em env local, exemplos vazios. Nenhum POST de trading/swap/approve/sign ou pagamento. As mudanças preexistentes devem continuar preservadas.

E7. Guia em português mapeia Meme Pump, Alpha Radar, sinais, Rewards, DEX, portfólio e crescimento composto, separando API documentada, acesso live não qualificado e próximas integrações. Explicita que recompensas têm requisitos/custos e que crescimento composto usa lucro realizado líquido; não apresenta lucro garantido, APR inventado ou o caso citado como evidência.

E8. TDD nos limites públicos do cliente, normalização/triagem/custos e execução CLI offline; teste de falta de credenciais não faz network. Testes existentes pertinentes e typecheck passam. Revisão independente em cópia isolada, baseline inicial e SPEC fixa; sem certificação live baseada em mocks. Registrar hashes, limites e evidências reais.

## Exclusões e próxima qualificação

Ainda não há prova de acesso autenticado, vendabilidade, retorno esperado, segurança onchain completa, arbitragem lucrativa ou capital disponível. A primeira próxima integração elegível é capturar cotações DEX de entrada/saída com identidade, unidades, taxas e frescor, sob gate read-only. Signals/Alpha Radar exigem avaliação fora da amostra; Rewards exigem elegibilidade oficial sem automação de assinatura. Nenhuma destas condições pode ser inferida de fixtures.

## Decisão própria desta conversa e contrato de integração

Conversa 01a1216a-c46b-72f3-b3dc-24c79470308d. Consulta real Jev Workflows d7fe122c-6c2f-43b2-9640-22f41c17e340 recomendou scanner e interfaces públicas. approved_by=jev_delegated; human_response=false. O contexto contém somente fatos mínimos sanitizados. Custo faturado desconhecido: null. A confirmação técnica substitui as perguntas técnicas HITL conforme instrução explícita do usuário; não autoriza movimentação financeira.

Endpoints exatos:
- GET /api/v6/dex/market/memepump/supported/chainsProtocol
- GET /api/v6/dex/market/memepump/tokenList (chainIndex e stage obrigatórios; stage NEW/MIGRATING/MIGRATED; protocolIdList opcional validado contra descoberta; sem walletAddress, limit ou cursor enviados)
- POST /api/v6/dex/market/price-info (array de identidades, até 30 localmente; EVM minúsculo)
- GET /api/v6/dex/market/token/advanced-info
- GET /api/v6/dex/market/token/top-liquidity

A lista retorna data como objeto {cursor, items}; os demais retornam data como array. Protocolos retornam chainIndex, chainName e protocolList. Não fixar IDs a partir de exemplos nem declarar MemePump disponível na X Layer/Monad sem resposta de cobertura correspondente. Não enviar parâmetros não documentados. Limite 1–30 é local, não parâmetro API. Schemas externos parcialmente preenchidos não podem virar aprovação: envelope inválido falha; campos opcionais ausentes seguem para normalização como desconhecidos. O cliente usa origem fixa, sem aceitar URL base arbitrária, sem redirects para outra origem e sem endpoint de execução. Erros não incluem resposta bruta ou erro externo não sanitizado.

Interfaces públicas previamente aprovadas para TDD:
- createOkxReadOnlyClient: configuração {credentials:{apiKey,secret,passphrase}, fetch?, now?, timeoutMs?}; métodos protocols(), listMemePump({chainIndex,stage,protocolIdList?,limit}), prices(identities), advanced(identity), pools(identity). Arrays limitados localmente; outputs Records de dados externos, sem inventar campos. Fetch e relógio são fronteiras injetáveis; testes não dependem de helpers privados. Validar strings de autenticação sem CR/LF e não expor configuração em erros.
- normalizeOpportunity: identidade esperada + token listado + preço + advanced + pools, todos externos; saída tipada com números nullable e motivos de dados inválidos. Resposta de preço de outra identidade não pode ser aproveitada.
- assessOpportunity: candidato normalizado + política explícita + now; status blocked/unknown/research_candidate, execution=not_qualified, motivos específicos. Nenhuma saída de análise autoriza execução.
- scenarioEconomics: inputs hipotéticos explícitos para duas pernas; taxas, imposto e slippage de cada perna aplicados sequencialmente à entrada/saída, custos fixos discriminados; retorno líquido estritamente maior que buffer. Retorno de equilíbrio em percentual. Nenhuma taxa ausente vira custo zero implicitamente.
- scanOpportunities: cliente público, rede/stage/limite explícitos, política e relógio; descobrir cobertura/protocolos antes da lista, no máximo 30 enriquecimentos finitos. Erro/ausência de cobertura não dispara fallback de rede. Por ativo, ausência/falha de enrichment gera dados desconhecidos e motivo, sem inventar aprovação; preço incompatível bloqueia. CLI default offline sintético com essa mesma saída; --live é opt-in e valida env completo e flags antes da primeira chamada.

Arquivos exclusivos: implementer src/okx-api.ts e src/okx-api.test.ts em cópia isolada. Integrador src/okx-opportunities.ts, src/okx-opportunities.test.ts, src/okx-scan.ts, src/okx-scan.test.ts, src/okx-fixture.ts, scripts/okx-scan.ts e docs desta entrega. Shared seams package.json/tsconfig.json apenas integrador; acréscimos mínimos preservando chaves atuais. Revisor executa em cópia isolada contra este documento e baseline fixo.

Política default é filtro de pesquisa explícito e conservador, não aconselhamento sobre tamanho de posição: idade máxima 60 s, pool mínimo US$100.000, holders mínimo 1.000, concentração top10 máxima 20%, risco máximo 2. Todos os valores são exibidos no relatório e podem ser substituídos por política validada. Sem evidência de segurança atual, saída vendável e custos reais, execução continua not_qualified mesmo se os filtros passarem.

Entregas seguintes dentro do objetivo ativo: cotação DEX de ida/volta somente leitura com quantidades atômicas e custos sem dupla contagem; avaliações históricas fora da amostra e cenários de perda; decisão finita JEV entre alternativas com fatos mínimos sem saldo/endereço; futuros em integração própria de simulação. Estas não são alegadas concluídas por este ciclo de scanner.