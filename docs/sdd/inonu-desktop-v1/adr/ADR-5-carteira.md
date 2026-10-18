# ADR-5 Carteira OKX conectada pela extensão: ler e preparar, enviar depois

Estado: proposta. Requisitos: WAL-1 a WAL-9, U13, U14, D-U3. Detalhes e portões em [wallet.md](../wallet.md). Evidência: SPEC 2.1 F5; páginas `okx-docs/wallet/dapp-connect/*` e `okx-docs/trade/*`.

## Contexto

O usuário quer conectar a OKX Wallet dele via extensão de navegador (Chrome ou semelhante) e tomar decisões com ela, com a conexão já pré-configurada no instalável. A extensão OKX Wallet 4.18.1 está instalada no Edge desta máquina. A decisão do usuário foi: **ler e preparar agora; enviar pela carteira depois**.

## Decisão

1. **Conexão principal**: extensão, em janela do Edge no perfil que a contém (ADR-1). Provider `window.okxwallet` (EVM no padrão EIP-1193; Solana em `okxwallet.solana`); a documentação não cita EIP-6963 nem a injeção em `localhost`, então ambos entram no spike T1.1.
2. **Reserva sem extensão**: OKX Connect por QR (`@okxconnect/universal-provider`, `@okxconnect/solana-provider`), exige o app OKX 6.88 ou posterior (6.90.1 para Solana). Se falhar no export estático, a limitação fica documentada (T9.3).
3. **Escopo de redes da v1**: EVM e Solana, as redes de mercado da lista de 34 do provedor. Bitcoin, Sui, Tron, TON, Aptos, Cosmos e Starknet cobertas pela extensão e pelo app ficam registradas como "depois"; NEAR, Stacks, Cardano, Nostr e WAX só pela extensão.
4. **O que o app faz agora (ler e preparar)**: conectar por clique; saldos, histórico, PnL e posições DeFi do endereço pelo gateway; escada de cotações do agregador; **ticket de ordem** que apenas exibe `/swap` e `/approve-transaction` (`minReceiveAmount`, slippage, etapa de aprovação). "Aceitar" a sugestão do Inonu só preenche o ticket.
5. **Regra firme**: o app nunca guarda chave privada nem assina sozinho; só a janela da carteira assina, depois de clique do usuário; o servidor nunca difunde transação. O envio "Enviar pela minha carteira" está especificado e **desligado** (WAL-9).
6. **Fora**: Agentic Wallet (assina de forma autônoma por skill, fundos depositados nela), `@okx-dex/okx-dex-sdk` e a demo `run-your-first-dapp` (chave privada no `.env`), DEX Widget (iframe opaco que o app não consegue barrar), difusão pelo Gateway (lista restrita), pagamento x402.

## Alternativas

| Opção | Por que não |
| --- | --- |
| Agentic Wallet | Carteira separada, em TEE, que negocia sozinha: viola "o app nunca assina sozinho" |
| SDK de DEX da OKX | Assina com chave do `.env` |
| DEX Widget | O usuário assina, mas o app não inspeciona nem barra a operação dentro do iframe |
| Somente leitura | Não atende "tomar decisões com a carteira"; o ticket de ordem entrega o valor sem enviar |
| Envio já implementado | Recusado pelo usuário nesta rodada (D-U3) |

## Consequências

- Os endpoints de calldata (`/aggregator/swap`, `/approve-transaction`, DeFi `enter`, `exit`, `claim`, Intent Swap) devolvem dados não assinados, então servem para preparar sem executar.
- `chainId` em `eth_sendTransaction` é ignorado pela extensão e tirado da carteira; trocar de rede exige clique (`wallet_switchEthereumChain`, 4902 vira `wallet_addEthereumChain`); a tabela padrão da OKX tem 18 redes e não traz Base, Linea, zkSync nem Mantle.
- Um pedido pendente por vez (erro -32002); iOS exige que o deeplink venha direto de um clique.
- Trade API: trial de 1 requisição por segundo (até 5 sob aprovação); o gateway respeita esse limite nas cotações (WAL-5).
