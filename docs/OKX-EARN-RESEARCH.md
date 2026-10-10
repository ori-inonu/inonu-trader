# OKX Earn, On-chain Earn e DeFi Earn — pesquisa para SDD

**Verificado em:** 2026-10-09 (fontes públicas OKX; páginas e campanhas podem mudar).  
**Escopo:** catálogo documental de produtos, termos, riscos, requisitos e pontos pendentes. Pesquisa somente: nenhuma conta, saldo, wallet, elegibilidade, API privada ou tela autenticada foi verificada; nenhuma subscrição, staking, empréstimo, ordem, assinatura, depósito, retirada, transferência ou movimentação de capital foi feita. Sem recomendação de produto.

## Síntese executiva

- **Não há rendimento certo demonstrado para esta conta.** APR/APY estimados ou históricos, taxas fixas até o vencimento, campanhas e tokens de recompensa não equivalem a principal protegido, ganho líquido em USD/BRL ou retorno garantido. As fontes oficiais distinguem produtos sem proteção de principal; quando aparece uma alegação de proteção, é preciso ler o contrato daquela entidade e daquela ordem.
- **Exchange Earn e Wallet/DeFi são superfícies diferentes.** Exchange Earn é uma posição dentro da conta OKX (com risco de contraparte/plataforma e, conforme o produto, protocolo); Wallet DeFi é uma interface autocustodial que encaminha transações do usuário para contratos/protocolos externos. O mesmo ticker ou nome “staking/Earn” não torna termos, saldo, custódia ou resgate equivalentes.
- **Disponibilidade individual continua unknown.** Região/entidade contratante, residência, nível e tipo de conta, KYC, status de investidor, ativo/rede, mínimos, limites e cards de produto não foram observados. Uma página pública ou um APR visível não prova que a opção esteja habilitada para o usuário.
- Não registrei taxas/APRs promocionais do dia como cotação: são variáveis, regionais, dependentes do ativo e podem mudar antes da subscrição.

## Comparação dos mecanismos

| Mecanismo | Origem / variabilidade | Requisitos e liquidez | Riscos e classificação |
|---|---|---|---|
| **Simple Earn Flexible** | Exchange empresta ativos a tomadores por um pool associado à demanda; retornos são calculados pelas regras do pool e não são prometidos. | Termo flexível; resgate pode ser atrasado ou limitado por liquidez/limites. No acordo publicado em pt-BR, taxa de serviço indicada é 15% dos retornos da modalidade flexível; fixed não paga essa taxa. A entidade contratante ainda precisa ser confirmada. | O acordo diz expressamente que Simple Earn não protege principal e permite perda parcial/total. Custódia/contraparte, liquidez, fila de resgate e preço do ativo em USD/BRL. Taxa/termo são regionais; confirme o acordo aplicável. |
| **Simple Earn Fixed** | Empréstimo combinado a ordens de tomadores. A APR pode fixar após match; **taxa fixa não garante principal nem pagamento integral**. | Ativo bloqueado até vencimento; termos permitem extensão de até 14 dias se o tomador não repagar no prazo, com condições específicas para retorno estendido. | O mesmo acordo declara risco de perda de principal, inclusive parcial/total; default do tomador e liquidação dos ativos do borrower podem não cobrir principal e retorno. |
| **On-chain Earn (Exchange)** | OKX oferece staking PoS, liquid staking e DeFi de terceiros. APR é recente/estimada, varia por protocolo/validador e não é garantida. | Mínimo, ativo/rede, distribuição e resgate variam por oferta. Resgate padrão pode levar dias/semanas; fast redemption depende de liquidez e não é garantido. Auto-Earn exige opt-in nos termos consultados; conferir configuração. | Slashing/validator, falha de contrato/protocolo, LST/descolamento, congestionamento, baixa liquidez, atraso de resgate, preço do ativo/recompensa, custódia e operação da exchange. Página de início pt-BR diz elegível a investidores credenciados e institucionais; confirmar na conta concreta. |
| **OKX Wallet DeFi Earn / staking / pools / vaults** | Interface autocustodial para protocolos externos: single-token pode usar lending/staking; multi-token pode ser liquidity mining; vault agrega estratégias. Retorno e termos vêm do terceiro e variam. | Exige wallet/rede/ativo compatível, gas e autorização/assinatura do usuário. Resgate depende do protocolo. | OKX declara não custodiar e não responder por perdas. Riscos: smart contract/exploit, mercado, governança/upgrades, liquidez/settlement, impermanent loss em pools multi-token, erro de rede e transação irreversível. Tensão documental: guia atualizado em 05-08-2026 diz que protocolos passaram por auditorias; acordo da interface (atualizado em 18-09-2025) chama o serviço de versão inicial ainda não totalmente auditada. Auditoria não garante segurança. |
| **BTC Yield+** | Produto BTC para certos níveis VIP; paga em BTC. FAQ atualizada em 03-09-2026 informa histórico backtestado de 1–3% como mera referência, sem garantir retorno futuro. | FAQ indica VIP 1–8; resgate geralmente em 1–2 dias, até 7 dias; saldo em resgate não rende. Confirmar mínimo, taxa e acesso na conta. | O anúncio de lançamento chamou-o de “principal protection”; porém o acordo (última atualização indicada: 31-07-2025) diz que não garante yield e, sem yield positivo, usuário pode receber menos que depositou devido a taxas. **Não classificar como proteção incondicional** sem o contrato vigente da ordem. Há risco de contraparte/tecnologia/mercado e risco de queda do BTC em USD/BRL. |
| **Stable Rewards (ex.: USDG)** | Página OKX Brasil apresenta recompensa por saldo elegível, taxa estimada de 7 dias e pagamento periódico; taxa dinâmica não é promessa de retorno futuro. Lastro do emissor da stablecoin não é garantia de rendimento da OKX. | Página apresenta mínimo de 1 USDG e diz que Rewards liga por padrão para saldo elegível; cadência, limites e elegibilidade dependem da entidade e produto vigentes. | Risco de emissor/paridade, custódia/Exchange, alteração/encerramento do programa e câmbio; valor da recompensa é cripto, não BRL garantido. |
| **Flash Earn (Stake to Earn / Trade to Earn)** | Campanhas limitadas: staking para airdrop ou tarefas/volume para dividir pool de recompensas. Não é renda recorrente nem retorno garantido. | Período, opt-in, ativos, KYC, limites e elegibilidade definidos em cada campanha; OKX avisa que a regra pode não se aplicar a todos. | Tokens recebidos podem perder valor. Fazer trades para aumentar peso pode gerar taxas/perdas superiores à recompensa; stake pode sujeitar o ativo a regras de lock/redemption da campanha. |
| **Dual Investment** | Produto estruturado ligado a preço/strike; taxa da ordem não elimina risco de settlement/conversão. Termos atuais consultados (16-07-2026) classificam o produto como **não principal-protegido**. | Vencimento e settlement constam do term sheet/ordem. Não presumir resgate antecipado; unwind depende das condições e pode depender de aprovação da OKX. | A liquidação pode ocorrer em outra moeda e valer menos que o aporte. Termos permitem, em certas terminações extraordinárias, retorno do principal a valor mark-to-market inferior ao investimento. |
| **OKX Loan / Flexible Loan / VIP Loan** | **É empréstimo tomado pelo usuário, não uma fonte passiva de rendimento.** Simple Earn pode fornecer a oferta; o borrower paga juros. Flexible Loan tem taxa variável horária em termos consultados. | Colateral, LTV/MR, juros e elegibilidade variam por ativo, valor, conta e ordem. | Desvalorização do colateral ou custo do empréstimo pode gerar margin call e liquidação forçada. “Borrow to earn” adiciona alavancagem e não garante spread positivo. |

## Garantia de principal vs. retorno garantido

1. **Taxa fixa não protege capital.** Simple Earn Fixed e Dual Investment têm termos de não proteção do principal; no Fixed, a taxa pode ficar fixa após match, mas permanecem prazo/default; em Dual, a liquidação pode ocorrer em outra moeda.
2. **“Principal protection” é específico e exige leitura do contrato.** BTC Yield+ é o exemplo encontrado de alegação de proteção, mas o próprio acordo diz que o retorno pode ser zero e o valor recebido inferior ao depósito por taxas; FAQ e acordo têm escopos/datas diferentes. Tratar como inconclusivo até o termo vigente exibido antes de uma ordem.
3. **Nenhuma fonte consultada demonstra garantia de capital em BRL, seguro de depósito ou retorno positivo líquido para esta conta.** Stablecoin, token de recompensa e ativo de staking têm risco próprio de preço/paridade; fees, gas, slippage e períodos sem rendimento também afetam o líquido.
4. Proteção contratual específica no vencimento (se oferecida à região) não garante rentabilidade, saída antecipada, liquidez, paridade cambial ou solvência da contraparte. Não foi observada oferta individual de Shark Fin/Fixed Coupon; não classifico esses produtos como disponíveis.

## Disponibilidade e unknowns

- **Conta/território:** residência, entidade OKX, KYC, nível VIP, acreditação/institucional, restrições locais e termos aplicáveis não observados. A página de início On-chain Earn em pt-BR limita elegibilidade a Investidores Credenciados e Institucionais; a conta precisa confirmar se essa regra se aplica.
- **Produto/ordem:** ativos e redes habilitados, mínimos/máximos, APR/APY naquele instante, taxa efetiva, prazo, fila de resgate, unbonding, reward token, settlement currency, limites e condições de default são específicos e devem ser lidos no preview/termo da ordem.
- **Wallet:** wallet/chain, protocolo/vault, contrato, permissões, gas, lock e janela de resgate não examinados. “OKX Wallet” não significa custódia ou garantia da OKX.
- **Retorno líquido:** não calculado. Faltam preços de entrada/saída, taxas de negociação/conversão, spread, gas, transferência, tributos, câmbio e valor de mercado do reward token. Não converter APR em previsão pessoal.
- **API/SDD:** nenhuma API privada, integração Earn ou endpoint de subscrição foi validado; acesso à carteira, API e produto financeiro são autorizações separadas. Não inferir API de subscrição a partir de páginas de catálogo.

## Decisão Jev / limite do SDD

Pergunta enviada ao Jev foi **somente técnica e não financeira**: qual caminho documental/read-only cabe no pedido atual entre catálogo manual de fontes, futuro catálogo Exchange, futuro catálogo Wallet/DeFi, ou adiar até conhecer escopo/região. Resultado CLI Jev `jev-1.13.0`: `manual_source_catalog_only` (confiança 0,69; probabilidade 0,77; advisory-only; execução autorizada=false). O custo cobrado não foi informado. A ferramenta OMH de workflow com recibo persistente não foi invocada neste runtime; este resultado é avaliação Jev CLI, não evidência de aprovação humana nem autorização de integração.

**Decisão desta pesquisa:** manter catálogo de fontes; sem nova integração, alteração do executor, implementação de endpoint ou seleção de produto. Uma SDD de integração só deve começar com necessidade técnica explícita e escopo de dados/conta definido. A recomendação Jev não escolhe investimento nem autoriza ação.

## Fontes primárias OKX consultadas

Páginas públicas verificadas em 2026-10-09. Termos variam por entidade/localidade; links regionais aplicam-se ao escopo descrito na própria página.

1. [Simple Earn User Agreement — OKX Brasil; atualizado 27 ago. 2026](https://www.okx.com/pt-br/help/simple-earn-user-agreement) — flexível/fixo, principal, fee e resgate.
2. [How do I subscribe to Simple Earn Fixed? — OKX](https://okx.com/help/how-do-i-use-simple-earn-fixed) — matching e juros após funding; disponibilidade por moeda/conta.
3. [On-chain Earn User Agreement — OKX Brasil](https://www.okx.com/pt-br/help/on-chain-earn-user-agreement) — estimativas, riscos, resgate, Auto-Earn.
4. [On-chain Earn — catálogo/FAQ OKX Brasil](https://www.okx.com/en-br/earn/onchain-earn) — APR estimado, slashing, liquidez e resgate.
5. [How do I get started with On-chain Earn? — OKX Brasil](https://www.okx.com/pt-br/help/how-to-start-with-on-chain-earn) — elegibilidade e fluxo/preview.
6. [How to deposit into liquidity pools on Web3 Earn — OKX Wallet; atualizado 5 ago. 2026](https://web3.okx.com/help/how-to-deposit-into-liquidity-pools-on-web3-earn) — produtos, terceiros, impermanent loss e riscos.
7. [OKX DeFi Protocol Interface User Agreement — atualizado 18 set. 2025](https://web3.okx.com/help/okx-web3-yield-farming-tool-user-agreement) — autocustódia, transações do usuário, protocolos terceiros e aviso de produto não totalmente auditado.
8. [OKX Dual Investment Product Terms — atualizado 16 jul. 2026](https://www.okx.com/en-us/help/dual-investment-product-service-terms) — não principal-protegido e regras de settlement/early termination.
9. [BTC Yield+ FAQ — OKX Brasil; atualizado 3 set. 2026](https://www.okx.com/en-br/help/btc-yield-faq); [anúncio](https://okx.com/en-br/help/btc-yield-announcement); [User Agreement — atualizado 31 jul. 2025](https://www.okx.com/en-br/help/btc-yield-user-agreement) — VIP, backtest sem garantia, resgate e conflito de proteção/taxas.
10. [Stable Rewards — página OKX Brasil](https://www.okx.com/en-br/earn/stable-rewards) — USDG, mínimo, cadência e taxa dinâmica. Não é oferta pessoal.
11. [Flash Earn: Stake to Earn & Trade to Earn — OKX Brasil, 3 jul. 2026](https://www.okx.com/en-br/help/flash-earn-just-got-bigger-introducing-stake-to-earn-trade-to-earn) — campanhas, pool/multiplicadores e elegibilidade.
12. [Flexible Crypto Loan Service Terms — OKX](https://www.okx.com/help/flexible-crypto-loan-service-terms); [What’s an OKX Flexible Loan?](https://www.okx.com/help/whats-an-okx-loan) — empréstimo, colateral, taxa/LTV e liquidação.

## Registro de execução

- Arquivo criado: `docs/OKX-EARN-RESEARCH.md`.
- Nenhum arquivo existente, código ou configuração foi alterado; nenhuma ação de Exchange/Wallet foi executada.
- Preservado o estado pré-existente não commitado do repositório; este relatório é novo e não substitui as especificações OKX existentes.
- Sem cotação autenticada ou verificação de conta, elegibilidade individual permanece **unknown**.
