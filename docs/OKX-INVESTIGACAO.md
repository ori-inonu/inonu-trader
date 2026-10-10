# OKX, integração e potencial de retorno

Verificado em 2026-10-09. Gabriel informou depósito de R$400; nenhum endereço, saldo, ativo ou rede da sua conta foi observado nesta investigação. Fontes primárias e hashes estão em [pesquisa independente](evidence/okx-research.md). A conexão implementada consulta a carteira Web3 e não habilita negociações.

## O que está configurado

A chave Jev do Windows já respondeu em simulação, com versão fixada em jev-1.13.0; [configuração e evidência](JEV-WINDOWS.md). O frontend usa porta 3001 e feed local na 3000. A extensão OKX fornece o provider documentado [window.okxwallet](https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/chains/evm/provider); o botão **Conectar OKX** solicita autorização da conta. O painel lê rede, MON e USDC sem importar segredo, persistir endereço ou encaminhar dados da carteira ao executor.

Para conferir no próprio dispositivo:

1. No terminal da pasta `web`, execute `bun run dev` e abra http://localhost:3001 no navegador com a extensão OKX Wallet.
2. Clique **Conectar OKX** e revise a solicitação da extensão. Se a rede for diferente, o botão separado solicita troca para Monad. Sem extensão desktop, o painel orienta instalação/uso de navegador compatível; aplicativo móvel sozinho não injeta esse provider.
3. Confira conta, rede e os dois saldos. Erro/timeout apresenta saldo indisponível, nunca um zero inventado. Atualizar não pede nova autorização; mudar conta/rede invalida valores antigos. Desconectar limpa a sessão local, sem revogar permissões concedidas na extensão.

A rede esperada é [Monad mainnet 143, moeda MON](https://docs.monad.xyz/developer-essentials/network-information.md). O USDC nativo tem contrato [Circle 0x754704Bc059F8C67012fEd69BC8A327a5aafb603](https://developers.circle.com/stablecoins/usdc-contract-addresses.md). MON paga gas; USDC em outra rede ou outro contrato não é o saldo esperado. Ambos são lidos na mesma altura de bloco. Nenhum valor em reais é deduzido dessas quantidades.

## Onde entram Pix e Nubank

O [Pix BRL entra na conta da corretora OKX](https://www.okx.com/pt-br/help/how-do-i-deposit-brl), sujeito à verificação e titularidade correspondente. A própria OKX explica que [corretora e carteira Web3 são administradas separadamente](https://www.okx.com/en-gb/help/understanding-the-link-between-okx-and-web3-wallets). Por isso, depósito em reais não demonstra saldo MON/USDC na carteira ou na margem Kuru. É preciso conferir a seção onde o depósito aparece no aplicativo.

O [saque BRL/Pix](https://www.okx.com/pt-br/help/how-do-i-withdraw-brl) exige conta bancária verificada com titularidade correspondente. Nubank é um destino condicional ao mesmo CPF/nome e às opções disponíveis na conta autenticada. A integração local não acessa sua conta bancária. Taxas, mínimos, redes e retenções devem ser conferidos nas telas atuais antes de qualquer movimentação.

Enviar da corretora para Web3 é uma [retirada separada](https://www.okx.com/en-br/help/withdraw-crypto-from-exchange-to-wallet). A [listagem histórica MON/USDT e Monad](https://www.okx.com/en-us/help/okx-to-list-mon-monad-for-spot-trading) não comprova retirada habilitada hoje para sua conta, nem uma rota USDC/Monad. O suporte a Monad nos [serviços Web3 OKX](https://web3.okx.com/onchainos/dev-docs/home/supported-chain) também não demonstra essas permissões. Sem essa evidência, não há uma rota de transferência qualificada nesta entrega.

## Formas de negociar e arquitetura necessária

| Rota | Situação no projeto | Requisitos antes de execução |
| --- | --- | --- |
| Kuru MON/USDC spot | Dados reais, decisões Jev e execução paper; live bloqueado | Reconciliar signatário dedicado, gas, ordens, reservas, fills, margem e patrimônio após restart |
| OKX Exchange spot multiativo | Pesquisa; sem adapter ou API privada configurados | Dados/normalização de instrumentos, regras de lote, custos, autenticação de trade e disponibilidade da conta |
| OKX demo | Possível ambiente separado; não conectado | Chave própria demo, adapter e header `x-simulated-trading: 1`; execução simulada não prova fills reais |
| OKX Web3/DEX | Leitura da carteira implementada; sem cotação/execução DEX | API autenticada no servidor, contrato/rede/liquidez por rota, slippage/gas, revisão da transação e assinatura autorizada |
| Margem/perpétuos | Pesquisa; sem empréstimo ou execução implementados | Elegibilidade individual, liquidação, funding, tamanho de contrato, limites e avaliação fora da amostra |

A [API v5](https://www.okx.com/docs-v5/en/) distingue dados públicos sem autenticação e operações privadas autenticadas. A chave Jev autoriza inferência, não ordens OKX; a conexão Web3 também não fornece uma chave Exchange. Demo exige credenciais do próprio ambiente. Nenhuma chave privada foi criada ou importada aqui.

A [API Web3/DEX](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage) usa autenticação por projeto/chave e assinatura HMAC. Segredos pertencem ao servidor. Cotação, transação preparada, assinatura e envio exigem etapas próprias. Trocar apenas o símbolo do mercado não implementa múltiplos ativos.

O contrato [Kuru MarginAccount](https://docs.kuru.io/contracts/MarginAccount.md) mantém créditos/saldos de tokens usados pelos mercados; seu nome não é evidência de empréstimo. O código atual opera inventário spot financiado. Para evoluir, a fronteira de dados deve normalizar instrumento, moeda de cotação, lote, taxas e timestamp; a avaliação paper deve usar esse contrato comum e conservar as regras específicas de cada venue. A decisão Jev fica sujeita aos mesmos limites determinísticos de inventário, custos e exposição.

## O que os backtests demonstram

A avaliação existente é replay reproduzível de journals de mercado com execução paper. Ela não é um backtest histórico amplo nem uma comparação pareada que prove melhoria do Jev. Os resultados anteriores incluem perdas em janelas mock e uma sessão real de inferência com **zero fills**; consulte [risco e backtest](RISCO-E-BACKTEST.md).

Na [sessão Jev de aproximadamente 89 segundos](evidence/jev-windows-key-20261009.backtest.json), ocorreram três decisões, zero cotações e zero fills. Um exemplo paper de US$100 terminou em US$100,00265766, incluindo marcação do inventário MON e US$0,00014234 de custo estimado de inferência. A variação de +0,00265766% não foi lucro realizado por negociação. Não equivale aos R$400 depositados nem permite estimar retorno diário/semanal. Faturamento real da API é desconhecido.

Uma avaliação capaz de orientar mudanças precisa de capturas mais longas em diferentes regimes, divisão cronológica treino/validação/teste e decisões que usem apenas informação disponível naquele instante. Custos executáveis de entrada/saída, spread, taxas, slippage, gas, cancelamentos e inferência entram no resultado líquido; derivativos acrescentam funding e regras de liquidação. Devem ser comparados Jev, não operar e referências simples nas mesmas janelas, com capital inicial comum e fills conservadores. Reportar retorno líquido, drawdown, exposição, turnover, frequência de trades, intervalos de incerteza e sensibilidade a custos. Um resultado positivo isolado ou muitas tentativas de parâmetros não libera live.

## Alavancagem e a meta de R$400 para R$4000

Essa meta exige **+900% líquido**, isto é, multiplicar o capital por dez. Distribuído em sete dias com crescimento composto constante, exigiria cerca de 38,95% ao dia. É cálculo da meta, não expectativa de retorno. Não existe configuração de IA que garanta crescimento constante da banca.

Em um exemplo matemático sem custos, exposição de 10 vezes o capital transforma uma variação favorável de 1% em aproximadamente 10% sobre a margem; a mesma variação desfavorável produz a perda correspondente. Uma variação adversa próxima de 10% consumiria a margem nesse modelo simplificado, e a liquidação pode acontecer antes por margem de manutenção, taxas ou funding. Esse exemplo não estima o preço real de liquidação e não é recomendação de alavancagem.

As [taxas OKX incidem sobre a posição](https://www.okx.com/en-gb/help/trading-fee-rules-faq), não somente sobre a margem. Nos [perpétuos, funding varia por contrato](https://www.okx.com/en-us/help/perps-funding-fee-mechanism) e pode consumir margem. Stop e teto de perda no código não garantem execução nesse preço durante gaps, atraso ou falha. Mais exposição aumenta retorno e perda potenciais; o projeto ainda não demonstrou vantagem líquida que justifique aumentá-la.

## Critério para a próxima evolução

Primeiro, observar a conexão real de leitura no seu dispositivo sem movimentar fundos. Depois, qualificar dados multiativo e avaliação pareada em paper; separar essa pesquisa de alterações no executor. Operação real continua dependente da reconciliação e revisão independente já exigidas em [READINESS-SPEC.md](READINESS-SPEC.md). Disponibilidade de conta, feed, credenciais Exchange, redes de retirada e autorização de ordens permanecem fatos/dependências separados. Esta entrega não movimenta os R$400, não habilita live e não estabelece lucro contínuo.
