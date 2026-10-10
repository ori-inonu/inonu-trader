# OKX Wallet: rede e saldos

O painel consulta a conta confirmada pela extensão OKX Web3 na rede selecionada. Uma conta pode possuir ativos em várias redes: o USDT na X Layer não aparece em uma consulta à Monad. A conexão Web3 também não concede acesso ao saldo da conta Exchange.

## Consultar USDT na X Layer

1. Clique em **Conectar OKX Wallet** e confirme a conexão na extensão.
2. Se o painel indicar Monad, clique em **Trocar para X Layer** e confirme a mudança de rede na extensão. Se a extensão recusar, selecione X Layer manualmente e atualize.
3. Clique em **Atualizar saldo**. Confira a rede, o bloco consultado e a linha do ativo correspondente ao depósito.

A mudança de rede e a leitura de saldo não transferem tokens. O painel não solicita assinatura nem aprovação de gastos. Após **Desconectar**, permanece desconectado até uma nova conexão explícita, mesmo que a extensão emita eventos.

## Cobertura

| Rede | Ativos consultados |
| --- | --- |
| Monad — 143 | MON e USDC |
| X Layer — 196 | OKB, USDT, USDT0, USDC nativo, USDC_Bridged e USDC.e |

Cada variante usa seu próprio contrato. As quantidades são lidas no mesmo bloco e exibidas com precisão decimal, sem somar moedas diferentes. O painel não apresenta patrimônio consolidado nem conversão USD. Tokens fora dessa lista, NFTs, outras redes, posições DeFi e conta Exchange não estão incluídos.

Uma resposta inválida, timeout ou falha de qualquer ativo deixa o lote indisponível; isso não significa saldo zero. A atualização limpa os dados da conta ou rede anterior. Redes não suportadas não recebem consultas de saldo.

O gas da X Layer usa **OKB**. A ausência de OKB não impede a leitura de saldo, mas deve ser considerada para qualquer execução futura. Conectar a carteira não ativa trading, swaps, futuros ou execução automática.

## Fontes e verificação

- [Rede X Layer](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information).
- [Contratos X Layer](https://web3.okx.com/pt/onchainos/dev-docs/xlayer/developer/build-on-xlayer/contracts).
- [Circle: USDC nativo na X Layer](https://www.circle.com/blog/now-available-native-usdc-cctp-on-x-layer).
- [Provider EVM OKX](https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/chains/evm/provider).

Os testes de provider e as capturas com dados sintéticos verificam o comportamento da aplicação. Eles não confirmam um depósito real nem o funcionamento de uma extensão específica. A arquitetura de oportunidades está em [OPPORTUNITY-ARCHITECTURE.md](../docs/OPPORTUNITY-ARCHITECTURE.md).
