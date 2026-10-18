# OKX Web3: descoberta e triagem de oportunidades

Objetivo observado em 2026-10-09: ampliar o GEV para pesquisar oportunidades no ecossistema OKX Wallet, avaliando liquidez, risco e retorno líquido. Crescimento composto depende de resultados líquidos realizados; não é promessa ou critério de aprovação financeira. O relato US$68 → US$6.700 não foi verificado.

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
