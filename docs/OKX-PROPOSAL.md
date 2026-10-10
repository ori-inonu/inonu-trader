# Proposta de integração OKX, 2026-10-09

## Objetivo observado e limite desta entrega

Gabriel informou que criou a conta/carteira OKX e depositou R$400. Pediu investigação mais profunda, integração com prioridade para Web3 e evolução dos testes e decisões do Jev. Depósito informado não demonstra ativo, endereço, rede ou saldo Web3. Não há autorização nesta entrega para ordens, assinaturas, conversões, retiradas ou transferências.

Implementar conexão de leitura da extensão OKX no painel local: conta EVM, rede e saldos MON/USDC na Monad. Diferenciar carteira conectada, conta da corretora, executor e resultado simulado. Investigar rotas para vários ativos e alavancagem usando documentação primária. Preservar as proteções de execução e os backtests existentes; lucro contínuo e crescimento de 10 vezes não são critérios que possam ser garantidos.

## Evidência atual

- `web/src/app/page.tsx` usa por padrão um feed Railway remoto, não o executor local do usuário; falta conexão com provider de carteira.
- O painel é Next 16.3.4/React 19.2.8. Não precisa de SDK custodial para leitura EIP-1193. As instruções Next locais exigem consulta aos guias distribuídos com essa versão.
- `src/config.ts` fixa Monad 143; `src/market.ts` bloqueia execução real antes de depósitos/ordens enquanto reconciliação permanece incompleta. A extensão no navegador não substitui o signatário do backend.
- `docs/JEV-WINDOWS.md` e seu relatório independente demonstram três respostas Jev em paper, sem fills. O ganho marcado de US$0,00265766 não demonstra ganho de estratégia.
- [OKX Pix](https://www.okx.com/en-br/help/how-do-i-deposit-brl), [saque BRL](https://www.okx.com/en-br/help/how-do-i-withdraw-brl) e [transferência corretora para carteira](https://www.okx.com/en-br/help/withdraw-crypto-from-exchange-to-wallet) são operações distintas. A disponibilidade autenticada da conta não foi consultada.
- [Monad](https://docs.monad.xyz/developer-essentials/network-information), [USDC Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses) e [OKX API](https://www.okx.com/docs-v5/en/) orientam rede, contratos e rotas de negociação; documentação global não prova elegibilidade individual.

## Escopo proposto

Uma sessão de carteira com interface pequena e testável no limite do provider; componente/hook cliente sem persistência de endereço; leitura com prazo limitado, resultados exatos e invalidação por eventos. Sem dependência nova, importação de chave ou envio de endereço ao robô. Rede incompatível impede leitura de contrato de saldo. Ações de consentimento ficam em cliques explícitos do usuário.

O integrador é responsável por ligação no painel, URL local do feed, comandos locais e documentação. Implementador isolado é responsável somente pelos novos arquivos de carteira e seus testes. Revisor independente recebe SPEC congelada, hashes do candidato e cópia isolada sem segredos. Verificação inclui TDD dos comportamentos públicos, typecheck/build do painel, regressões do backend e estados visuais desktop/mobile quando a superfície de navegador estiver disponível.

## Exclusões e próxima dependência

Não implementar trading real, margem emprestada, derivativos, ponte, exchange API privada, WalletConnect remoto, assinaturas, retirada Pix ou operador persistente. O primeiro passo identifica a carteira sem expor segredo; execução futura exige contrato de reconciliação, estratégia qualificada e autorização própria. Métodos de negociação e crescimento pretendido serão documentados com limites observáveis e custos.

Esta proposta pertence ao objetivo existente de prontidão e avaliação de risco/retorno. Aprovação técnica delegada ao Jev não autoriza movimentação de dinheiro. Revisão independente de escopo é necessária para abrir o ciclo SDD, sem criar objetivo nativo.
