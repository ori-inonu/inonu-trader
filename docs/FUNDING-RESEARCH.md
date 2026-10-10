# jev-trader - carteira, Pix e circuito de entrada/saída

Pesquisa primária em 09/10/2026, capturas principais às 16:20-22 UTC e revisão textual às 16:26 UTC. Autor: pesquisa independente de fontes públicas. Modelo e tier efetivos: não expostos/ desconhecidos. Este relatório não implementa, certifica ou autoriza transferências, ordens, cadastro ou configuração de credenciais. O pesquisador não alterou código; este relatório foi integrado pelo coordenador.

## Conclusões documentais

Existe uma rota documental plausível entre Pix em reais e uma carteira na Monad: **conta bancária própria → corretora com Pix → compra de MON → saque de MON pela rede Monad → carteira própria → Kuru**. O retorno usa o circuito inverso, após cancelar ordens, retirar saldos depositados e converter o ativo para aquele que a corretora efetivamente recebe nessa rede. **Não foi demonstrado que nenhuma conta específica esteja apta hoje**, com os limites, taxas, rede de depósito/saque e KYC necessários. Uma wallet EVM não recebe Pix por si só.

OKX e Bybit são candidatas documentais; ambas descrevem BRL/Pix e possuem evidência oficial de MON/Monad. Binance descreve Pix, mas nesta pesquisa sua página regional de MON diz que o ativo não está listado para negociação/serviço na plataforma. Isso não prova ausência global; a rota direta Binance-Monad permanece não demonstrada. NuCripto é uma camada distinta da conta bancária Nubank: seus termos exigem suporte ao **ativo e à rede**, e não foi encontrada prova oficial de suporte a Monad para MON ou USDC. Não enviar USDC da Monad à NuCripto somente porque o aplicativo negocia USDC.

O mercado Kuru examinado é spot. O nome `MarginAccount` identifica o contrato de saldo e liquidação; sua documentação descreve depósito, débito limitado ao saldo, crédito e retirada. **Não comprova empréstimo, posições alavancadas ou liquidação de derivativos.** Transformar R$400 em R$4.000 exige +900% líquido; não há fonte ou backtest nesta pesquisa que sustente esse retorno em um dia/semana, crescimento permanente ou ausência de perdas.

## Carteiras e assinatura

| Candidata | Evidência de Monad | Chave privada e limitação operacional |
|---|---|---|
| MetaMask | Monad aparece na documentação oficial de redes suportadas; redes populares e RPC customizado são configuráveis. | A documentação oficial permite exportar a chave de uma conta de software e importá-la em software compatível. Isso não significa que uma conta de hardware ou conta somente de leitura forneça uma chave exportável. [Redes](https://support.metamask.io/configure/networks/how-to-add-a-custom-network-rpc/), [exportação de conta](https://support.metamask.io/configure/accounts/how-to-export-an-accounts-private-key/). |
| Rabby | Código público oficial, fixado no commit `7794bfb54e9cf26a72738d3bd8c2058961663d0c`, contém Monad `community_id=143`, símbolo MON, `is_disabled=false`. | Keyring oficial implementa `importPrivateKey` e `exportAccount` para contas de software; keyrings de hardware são distintos. [Lista de redes](https://raw.githubusercontent.com/RabbyHub/Rabby/7794bfb54e9cf26a72738d3bd8c2058961663d0c/src/constant/default-support-chains.json), [keyring](https://raw.githubusercontent.com/RabbyHub/Rabby/7794bfb54e9cf26a72738d3bd8c2058961663d0c/src/background/service/keyring/index.ts). |

Inferência operacional: se o servidor assinar diretamente com uma chave EOA, as simulações e aprovações visuais da extensão não mediarão cada assinatura do servidor. Escolher Rabby ou MetaMask não resolve esse risco de custódia. A exigência apropriada é uma conta operacional separada, saldo limitado, assinatura local e segredos fora de logs, relatório, Jev e repositório. Não exportar a carteira principal ao agente. A arquitetura de assinatura real do projeto deve ser examinada pelo coordenador antes de escolher o fluxo.

## Corretoras e reais

| Serviço | Pix documentado | MON/Monad documentado | O que ainda falta confirmar |
|---|---|---|---|
| OKX | Depósito e saque BRL/Pix para clientes brasileiros; mínimo documental R$5 em ambos; titularidade/CPF compatível com a conta verificada. Depósito atualizado 11/09/2026, saque 02/09/2026. | Anúncio de 23/03/2026 lista MON/USDT e **Token Network: Monad**, com abertura de depósitos e saques em horários distintos. | Status atual da rede na conta brasileira; KYC, taxa cripto, quantidade mínima, conversões, eventuais retenções e dados da conta Nubank. [Depósito](https://www.okx.com/pt-br/help/how-do-i-deposit-brl), [saque](https://www.okx.com/pt-br/help/how-do-i-withdraw-brl), [MON](https://www.okx.com/en-us/help/okx-to-list-mon-monad-for-spot-trading). |
| Bybit | Depósito BRL/Pix com KYC e conta sob o mesmo CPF/CNPJ; tarifas e processamento apresentados por método. Saque BRL/Pix documentado, com titularidade compatível. Depósito atualizado 28/08/2026; saque 14/06/2026. | Anúncio de 23/07/2026 informa suspensão temporária de depósitos/saques **via Monad (MON)** para upgrade. Comprova suporte histórico à rede, não reabertura hoje. | Tela atual deve confirmar rede aberta em ambos os sentidos, região/KYC, mínimos, tarifas, retenções e Pix disponível à conta. [Depósito](https://www.bybit.com/en/help-center/article/How-to-Deposit-Fiat-Currencies-on-Bybit), [saque](https://www.bybit.com/en/help-center/article/How-to-Withdraw-Fiat-Currencies-on-Bybit), [upgrade](https://announcements.bybit.com/en/article/bybit-to-support-monad-mon-v0-15-1-network-upgrade--art15d2bdc77012/). |
| Binance | Depósito BRL/Pix exige nome e CPF/CNPJ da conta; saque por Pix exige conta do mesmo titular. A página de saque, atualizada 09/12/2025, informa processamento em horário bancário/ próximo dia útil fora dele. | Não demonstrado nesta pesquisa. Página `en-AE/how-to-buy/monad` diz “not listed”; não extrapolar isso para todos os países/contas. | Não escolher como circuito direto Monad sem rede exata confirmada. [Depósito](https://www.binance.com/pt-BR/support/faq/detail/53636607eebc42dbb513863b49bba98f), [saque](https://www.binance.com/pt/support/faq/detail/08722a3b5ad7465e8c74ddc0240cec4c), [MON regional](https://www.binance.com/en-AE/how-to-buy/monad). |
| Nubank/NuCripto | A conta bancária própria pode ser destino pretendido do saque em reais, sujeito à aceitação/validação do banco pela corretora. Nenhum fluxo foi executado. | Os termos não enumeram uma rede Monad disponível. A rede aplicável é informada pelo aplicativo; envio por rede não suportada pode perder o ativo. | NuCripto não está qualificada como rampa direta Monad. Retirada BRL/Pix via uma corretora e recebimento on-chain na NuCripto são operações diferentes. [Termos, seção 5](https://nubank.com.br/contratos/termos-e-condicoes-criptomoedas). |

**USDC negociável não equivale a USDC sacável pela Monad.** Não se demonstrou USDC/Monad disponível nas contas de OKX, Bybit, Binance ou NuCripto. A [Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses) confirma o contrato USDC nativo na Monad mainnet `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`; isso não cria suporte em uma corretora nem elegibilidade pessoal ao Circle Mint. Uma ponte acrescenta outra rede, taxa, liquidez, disponibilidade e operação; nenhuma ponte foi qualificada aqui como circuito completo de varejo/Pix.

## Rede, contratos e custo real

Monad mainnet usa chain ID **143**, MON para gas e RPCs oficiais com limites específicos; não misturar testnet. A documentação vigente usa blocos **300 ms** e finalização após dois blocos, aproximadamente **600 ms**. A verificação de execução é uma etapa posterior; confirmação financeira externa deve considerar esse estado, sem interpretar a inclusão especulativa como execução confirmada. O metadado Rabby `block_interval=1.0` serve como evidência de suporte à rede, não como autoridade sobre a velocidade atual. [Rede](https://docs.monad.xyz/developer-essentials/network-information), [resumo vigente](https://docs.monad.xyz/developer-essentials/summary).

A Monad cobra o **gas limit enviado**, não somente o gas consumido. Preço efetivo EIP-1559: `min(base_fee + priority_fee, max_fee)`; piso documentado de base fee: 100 MON-gwei. Por cálculo próprio, 21.000 unidades no piso/sem prioridade custam 0,0021 MON e 200.000 custam 0,02 MON. Isso não é custo atual em BRL nem prova do gas de uma operação Kuru. Reverts também custam; gas limit excessivo e estimativa que falha precisam abortar ou limitar a operação. [Gas](https://docs.monad.xyz/developer-essentials/gas-pricing).

A regra de reserve balance usa **10 MON**, com exceções para EOA não delegada/“emptying transaction”; contas delegadas EIP-7702 têm regra diferente. Não afirmar que todo usuário precisa deixar 10 MON permanentemente intocáveis. A configuração deverá verificar o tipo da conta e seu comportamento observado. [Reserva](https://docs.monad.xyz/developer-essentials/reserve-balance).

[Endereços Kuru mainnet](https://docs.kuru.io/contracts/Contract-addresses):

- `MarginAccount`: `0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5`.
- Mercado `MON-USDC`: `0x065C9d28E428A0db40191a54d33d5b7c71a9C394`.
- USDC: contrato Circle acima; WMON: `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A`.

A [MarginAccount](https://docs.kuru.io/contracts/MarginAccount) retira fundos do saldo do remetente, suporta `withdraw`/retirada em lote e rejeita débito com saldo insuficiente. A [OrderBook](https://docs.kuru.io/contracts/OrderBook) tem ordens limitadas/mercado, `minOut`, FOK e parâmetro que escolhe saldo depositado. Para saída financeira, ordens abertas, preenchimentos, saldos depositados e tokens livres precisam ser conciliados; não se deve tratar saldo depositado como saldo disponível na wallet.

[How fees work](https://docs.kuru.io/liquidity/how-fees-work) explica remuneração de LP por spread, que depende de volume, preço e inventário. O [SDK deploy-market](https://docs.kuru.io/sdk/deploy-market) também documenta `takerFeeBps` e `makerFeeBps` por mercado. Exemplos de criação não demonstram os parâmetros do MON-USDC já implantado. Exigir leitura/quote dos parâmetros atuais, e distinguir fee de negociação, spread de LP e slippage. Não assumir taxa zero, rebate certo nem renda diária garantida.

Para R$400, custos fixos importam: **exemplo hipotético**, custo total R$10 consome 2,5% da banca e R$20 consome 5%, antes do resultado de trading. Os custos reais da corretora, conversões BRL/USDT/MON, spread, retirada cripto, aprovações, depósito Kuru, negociação, cancelamento, retirada, volta à corretora e Pix devem ser medidos. Retorno em MON/USDC também inclui exposição cambial quando expresso em reais. A análise econômica deverá usar lucro líquido realizado e bancável, além de valor marcado a mercado.

## Requisitos e aceitação independente proposta

Estes critérios são requisitos de pesquisa para a especificação do coordenador; não foram executados/certificados aqui.

| ID | Condição → comportamento exigido | Evidência de aceitação independente |
|---|---|---|
| FUND-01 | Rota Pix proposta → exigir titularidade própria/KYC compatível e método efetivamente habilitado. | Conferência em conta autenticada, sem coletar CPF, chave Pix ou dados bancários para Jev/log público. Não considerar documentação genérica como disponibilidade pessoal. |
| FUND-02 | Transferência on-chain proposta → validar ativo, rede, chain ID, endereço, mínimo, taxa e status em ambos os sentidos. | Telas/consulta exata atuais de depósito e saque e allowlist de chain 143; rejeitar homônimo/rede diferente. Sem isso, permanecer paper/read-only. |
| FUND-03 | Banca R$400 → estimar custo completo de entrada e saída, além do capital destinado a gas. | Quote atual com timestamp; resultado bruto, líquido e em BRL separados; não preencher taxa desconhecida como zero. |
| KEY-01 | Assinatura automática → conta operacional separada, chave exclusivamente local e saldo limitado. | Revisão independente do signer/configuração e testes de ausência de segredos nos logs, respostas e payloads Jev; browser wallet não prova mediação do signer do servidor. |
| NET-01 | Transação Monad → gas limit limitado, custo previsto registrado e estimativa inválida bloqueia execução. | Teste local que reflita cobrança pelo limite, falha/revert e regra da conta/reserva; confirmação pela semântica vigente da rede. |
| KURU-01 | Operação MON-USDC → contratos mainnet/tokens exatos e fees atuais do mercado/quote verificados. | Verificação read-only do código/endereço e parâmetros atuais; não usar exemplos SDK como configuração observada. |
| EXIT-01 | Pedido de retirar → cancelar/conciliar ordens, identificar saldos depositados, executar retirada autorizada e calcular disponibilidade real. | Cenários de preenchimento parcial, saldo insuficiente, minOut e indisponibilidade; integração read-only ou simulação local antes de quaisquer fundos. |
| CLAIM-01 | Promessa de ganho ou alavancagem → rejeitar crescimento certo/+900% garantido e crédito inexistente. | Avaliação independente deve identificar spot; backtest/mock rotulado e separado de histórico real fora da amostra e execução live. |

Não objetivos: selecionar investimento pessoal com retorno garantido; inventar KYC/acesso/taxa; habilitar alavancagem inexistente; configurar/exportar chaves reais; enviar fundos, pagar, criar contas ou executar ordens; provar qualidade do backtest ou runtime do projeto sem suas fontes e execução. Jev pode aconselhar alternativa técnica dentro do escopo, nunca autorizar essas ações externas.

## Alternativas finitas para consulta Jev do coordenador

**Decisão de carteira**, depois de inspecionar o signer: `metamask_operational_eoa` ou `rabby_operational_eoa`, ambas com suporte documental e conta operacional separada; `defer_signer_selection` se a implementação exigir mecanismo incompatível ou arquitetura não verificada. Consequências: tutorial direto oficial no MetaMask; suporte confirmado por código e UI de verificação no Rabby; proteções visuais não protegem assinaturas diretas do servidor. Não afirmar que uma tem menor custo/rentabilidade por marca.

**Decisão de circuito de financiamento para especificar**, sem executá-lo: `okx_mon_monad_pix_conditional`, `bybit_mon_monad_pix_conditional`, `paper_until_ramp_qualified`. OKX tem anúncio explícito de rede e mínimos Pix; Bybit tem suporte histórico exato e Pix, mas suspensão/reabertura atual pendente. Paper mantém a análise e não exige contas/chaves. Preferência só pode selecionar uma candidata para futura qualificação, não marcá-la live-ready. Critérios: número de conversões, custo completo cotado para R$400, disponibilidade em ambos os sentidos, CPF/KYC e retorno BRL/Pix à conta própria. Binance direto, NuCripto direto e pontes sem circuito demonstrado não devem aparecer como opções qualificadas.

Consulta real realizada para a estratégia de pesquisa: `Choice`, domínio `strategy`, opções `official_network_matrix` / `official_asset_announcements`; recomendação `official_network_matrix`, confiança 0,98, modelo declarado Jev `jev-1.13.0`, rubric `decision-2026-09-26.2`, receipt `6b218c88-343b-445a-93cc-ba6c2cfa0bb9`, input digest `8b51570f3d560f5fc88826f85d6503a4908c4c624b65d57b822c317a62190b5c`, 748 tokens de entrada/53 de saída, persistência confirmada. Custo faturado desconhecido/null. Não é aprovação humana. Nenhum segredo/transcrição/projeto privado foi enviado; fingerprints de credenciais foram omitidos deste relatório.

## Registro literal e hashes das fontes

Todos os acessos: 09/10/2026. HTTP 200 abaixo: SHA-256 dos **bytes exatos da resposta** obtida por HttpClient, às 16:20:17-18 UTC; HTML dinâmico pode variar em outro acesso. `.md` é o endpoint oficial da mesma documentação, não uma cópia local. Trechos literais são curtos e não excedem 25 palavras por fonte; os hashes identificam a captura, não provam execução de contrato ou elegibilidade de conta.

| Fonte exata | Trecho literal | SHA-256 HTTP 200 |
|---|---|---|
| [Monad rede .md](https://docs.monad.xyz/developer-essentials/network-information.md) | `Chain ID`; `143` | `8fb2d1eb21aa7f6a3313edb0dd6d17be17d3f87ce14c97aed59b2a64340aeeb9` |
| [Monad gas .md](https://docs.monad.xyz/developer-essentials/gas-pricing.md) | “The gas charged for a transaction is the gas limit.” | `c8d594bf85f243c1ba9b9a0e525f161212466c6e79db2d34a31750101423019c` |
| [Monad resumo .md](https://docs.monad.xyz/developer-essentials/summary.md) | `Block frequency`; `300 ms` | `a5b6449e22395a5d511bd6134f24732b0f717bdf8944ea0cd50a8bcc07dc0cf5` |
| [Monad reserva .md](https://docs.monad.xyz/developer-essentials/reserve-balance.md) | `emptying transaction` | `da561b6a2db0542bf3f61fa84d411060c10bb81685f5c8e7bd5e75fae998d357` |
| [MetaMask redes](https://support.metamask.io/configure/networks/how-to-add-a-custom-network-rpc/) | `Monad` | `d309e25d7be6ffbcec3a5f716a9f57012641005a994366dafc62ee2308903a23` |
| [MetaMask exportação](https://support.metamask.io/configure/accounts/how-to-export-an-accounts-private-key/) | “An account's private key can be used to import it into any compatible wallet software.” | `483efedef5b3b5fecc1b085e29842d136f829aa2f50393ddab980152aef38456` |
| [Rabby lista no commit](https://raw.githubusercontent.com/RabbyHub/Rabby/7794bfb54e9cf26a72738d3bd8c2058961663d0c/src/constant/default-support-chains.json) | `"community_id": 143`; `"symbol": "MON"` | `7fc5a93eddcea82a5306c29f0249a4712142d5ea620f8ef68a4c7d03c9e5311f` |
| [Rabby keyring no commit](https://raw.githubusercontent.com/RabbyHub/Rabby/7794bfb54e9cf26a72738d3bd8c2058961663d0c/src/background/service/keyring/index.ts) | `importPrivateKey(privateKey: string): Promise<any>` | `656e8c1131ac4f9e4782abdff82b1c9726d5f43df464b44f9bea069bff929dec` |
| [OKX MON](https://www.okx.com/en-us/help/okx-to-list-mon-monad-for-spot-trading) | “Token Network: Monad” | `bd2cac4e947656822689061df43b596741ccb17979a185bad688a30b031ea8a1` |
| [OKX depósito](https://www.okx.com/pt-br/help/how-do-i-deposit-brl) | “O depósito mínimo para transferência de PIX em BRL é de R$5.” | `e6ab4db7003a78f6039d1ec320a66ca2e924561e2b7e30ec1da95a0ba1ba4584` |
| [OKX saque](https://www.okx.com/pt-br/help/how-do-i-withdraw-brl) | “O valor mínimo do saque para transferências via Pix em BRL é R$ 5.” | `b759760a2395e0e7c6e68d7efc9be94b33c8cf8cfa771fc791dfb75838350d2f` |
| [Bybit depósito](https://www.bybit.com/en/help-center/article/How-to-Deposit-Fiat-Currencies-on-Bybit) | “Identity Verification is required for fiat deposits.” | `7fe3f9e36dd2fa4c4be5de10ef1f6c80e4a627a7f71d74b6d2932f8b1d7a1323` |
| [Bybit saque](https://www.bybit.com/en/help-center/article/How-to-Withdraw-Fiat-Currencies-on-Bybit) | “Please ensure your withdrawal account information matches the details you provided during Bybit identity verification.” | `ef9b04e040ae64ce44fce5d2824dc8e80735c732f97e691e2c9f40193a1ae79c` |
| [Bybit Monad](https://announcements.bybit.com/en/article/bybit-to-support-monad-mon-v0-15-1-network-upgrade--art15d2bdc77012/) | “deposits and withdrawals via Monad (MON) will be temporarily suspended” | `e9bc8df6ae997d7169edebdc7f3f6331ab7f76dcb1e86f7f233a18244656f2f5` |
| [Circle USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses) | `Monad`; `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | `6837de8af99cff3cab61228f5e18be2f23c8fffc8f8c85ebc4f982a1486ac394` |
| [Kuru endereços .md](https://docs.kuru.io/contracts/Contract-addresses.md) | `Monad Mainnet`; `0x065C9d28E428A0db40191a54d33d5b7c71a9C394` | `042b9a43b36e8c33f13c72c15e17c3fd7fdc24b7390fd479e43be8c075783ff1` |
| [Kuru MarginAccount .md](https://docs.kuru.io/contracts/MarginAccount.md) | “Withdraws tokens from sender's balance.”; “Reverts if insufficient balance.” | `2fab338fe3e9a58ea3b3e2722c005acf4081ab494b389c78c0793c61ed94d13d` |
| [Kuru OrderBook .md](https://docs.kuru.io/contracts/OrderBook.md) | `minOut`; `getMarketParams` | `0796cb9f0c8b43d8b51b187c0b52078a7bd6ffcd0f3e79e804583946ab100b99` |
| [Kuru spread LP .md](https://docs.kuru.io/liquidity/how-fees-work.md) | “your fee is the spread between your buy and sell orders.” | `b09b84a9ebd473a9a9526d4c1ecefc95811c6d48d106c441e79235f81a27508c` |
| [Kuru deployment .md](https://docs.kuru.io/sdk/deploy-market.md) | `const takerFeeBps = 30; // 0.3%`; `const makerFeeBps = 10; // -0.1% (rebate)` | `f79d1b64ebe89df5ffe60c7a91aa65e9b3a50484f5729c03cd42c54cea097a58` |

Limites de captura: HTTP direto da Binance retornou **202, 0 bytes** nas três URLs; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` identifica corpo vazio, não a página. HTTP Nubank retornou **403, 919 bytes**; SHA-256 `f7c5520b65681e5501c29e000b6f4ce0bfa20110e297b710beaaa128fe24d6a7` identifica a resposta de bloqueio, não os termos. Leitura textual pelo web foi possível. Para essas fontes, seguem hashes da representação textual **extraída pelo web**, não dos bytes HTML oficiais; data 09/10/2026, 16:21:37-55 UTC. O relatório não substitui esses limites por uma captura inventada.

| Fonte | Evidência literal lida | SHA-256 da extração textual UTF-8 |
|---|---|---|
| [Binance depósito](https://www.binance.com/pt-BR/support/faq/detail/53636607eebc42dbb513863b49bba98f) | “Somente serão aceitos depósitos de uma conta bancária vinculada ao seu CPF/CNPJ.” | `de18c5066eeb89f2b6c1c1c761d0cf94c5413218abc073b5db1319876bd8e23d` (10.631 bytes; resposta open) |
| [Binance saque](https://www.binance.com/pt/support/faq/detail/08722a3b5ad7465e8c74ddc0240cec4c) | “the bank account receiving the withdrawal must be owned by the same person as your Binance account.” | `52e6186ea8354e8c72a464f0a04b711bb5cf4ff49f6f45239117822410625220` (10.287 bytes; resposta open) |
| [Binance MON regional](https://www.binance.com/en-AE/how-to-buy/monad) | “This coin is not listed on Binance for trade and service.” | `391eee40ad3a322c9e55c6ccaa27a2e740f3d1fe5b58f71693e81b96b921e444` (7.892 bytes; resposta open) |
| [NuCripto termos](https://nubank.com.br/contratos/termos-e-condicoes-criptomoedas) | “quando a função estiver disponível para o ativo e a rede suportados.” | `f76e7bd23533abb686dd5931828a9e1a76f736b410a5eb819db7db456e7dfdbc` (5.358 bytes; extração find, linhas 110-158) |

Pendências efetivas: arquitetura signer/projeto; rede habilitada e cotação completa por conta; KYC e titularidade; taxas/rede USDC; parâmetros on-chain do mercado; liquidez; circuito de saída real; backtest histórico real. Fontes documentais não encerram essas pendências. Nenhuma transação ou ordem foi feita.
