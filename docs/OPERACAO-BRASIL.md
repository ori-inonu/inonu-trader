# Configuração e operação no Brasil

Verificado em 2026-10-09. O projeto aceita operações simuladas; dinheiro real depende da qualificação abaixo. Instalar uma carteira ou depositar na corretora não conecta o robô.

## OKX: corretora e carteira são etapas distintas

A decisão Jev 3d4ede64-b071-425a-8216-d7f3f1b8881b recomendou **rota condicional pela corretora OKX com MON/Monad e Pix**. A escolha MetaMask/Rabby foi abstenção, não seleção de carteira. Gabriel posteriormente informou instalar a OKX Wallet; essa preferência foi incorporada sem atribuí-la à decisão anterior.

O [depósito BRL/Pix](https://www.okx.com/pt-br/help/how-do-i-deposit-brl) é na conta da corretora, com verificação e mesma titularidade. O [saque Pix](https://www.okx.com/pt-br/help/how-do-i-withdraw-brl) exige banco verificado e mesmo CPF/nome. Tarifas, mínimos e limites aparecem na conta. Portanto, seu Nubank é um destino condicional à verificação da conta e às opções autenticadas. O robô não tem integração bancária direta.

Existe uma [transferência separada da corretora para OKX Wallet](https://web3.okx.com/pt-br/help/okx-to-web3-wallet-withdrawal). A [página oficial de carteira Monad](https://web3.okx.com/nl/wallet/monad) descreve envio/recebimento de MON. Suporte documentado não prova configuração de sua conta ou dispositivo. A extensão também não controla a chave que assina diretamente no servidor.

Roteiro futuro: Nubank próprio → Pix/BRL na corretora OKX → conversão/retirada de ativo pela **rede Monad**, se disponível → carteira operacional dedicada → margem Kuru qualificada. Volta: liberar saldo/ordens da margem → carteira → depósito na corretora pela mesma rede aceita → conversão BRL → Pix Nubank próprio. Listar MON não prova que retirada, depósito da rede ou USDC/Monad estão disponíveis agora. Custos de conversão, retirada, mínimos e retenções precisam ser vistos nas telas autenticadas. Nenhuma transferência foi executada por esta análise.

Confira ativo, endereço e rede nos dois lados. O [USDC nativo na Monad da Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses) tem contrato 0x754704Bc059F8C67012fEd69BC8A327a5aafb603. A [Monad](https://docs.monad.xyz/developer-essentials/network-information) usa chainId 143 e MON para gas; os contratos de mercado/margem estão na [documentação Kuru](https://docs.kuru.io/contracts/Contract-addresses). USDC em outra rede não é um depósito qualificado para este projeto.

## Configuração local

A configuração local atual usa DRY_RUN=true, MODEL=jev, AUTO_DEPOSIT=false e a chave Jev do Windows por referência, sem PRIVATE_KEY. A chamada real em paper foi verificada em [JEV-WINDOWS.md](JEV-WINDOWS.md). MODEL=mock continua disponível para testes sem inferência paga. R$400 não é automaticamente US$100: BANKROLL_USD representa apenas capital líquido reservado à estratégia, convertido pelo preço executável, descontados custos de entrada/saída e reserva de gas. Os padrões são exemplos de simulação, não recomendação para investir toda a reserva.

```powershell
Set-Location C:/Users/gabri/jev-trader
& C:/Users/gabri/.bun/bin/bun.exe run doctor
$env:JOURNAL_PATH = 'data/paper-novo-001.jsonl'
& C:/Users/gabri/.bun/bin/bun.exe run capture --seconds 180
& C:/Users/gabri/.bun/bin/bun.exe run backtest --journal data/paper-novo-001.jsonl
```

Para outra instalação, configure sua própria TYPESAFE_AI_API_KEY no .env ignorado e MODEL=jev, mantendo DRY_RUN=true. Nesta máquina essa configuração já existe; a chave do plugin não foi copiada. [Preço/modelos oficiais](https://docs.typesafe.ai/models): referência Jev 1.13, entrada US$0,042 por milhão de tokens, saída gratuita. Preço configurado é estimativa; faturamento real não foi medido. A versão local está fixada em jev-1.13.0.

O painel em http://localhost:3001 oferece **Conectar OKX** para ler conta/rede/saldos Web3 pela extensão, inclusive com o backend offline. Pode solicitar troca para Monad por um botão separado. Não assina nem envia dados da carteira ao robô; Pix na corretora não aparece como saldo Web3. O app somente móvel não fornece automaticamente um provider ao navegador desktop. Veja [integração e rotas de negociação](OKX-INVESTIGACAO.md).

Não compartilhe seed, chave privada ou API no chat. O executor ainda espera uma chave EVM operacional local, separada dessa leitura Web3. Não exporte a carteira principal para o robô. Permissões da extensão não protegem assinatura no servidor. Contas inteligentes, somente observação e hardware não foram qualificadas para esse signatário. Instalar OKX Wallet não estabelece essa compatibilidade.

## Dependências para operações reais

1. Jev da sua conta: chave e chamadas paper verificadas nesta máquina; faturamento real ainda não medido. A sessão observada teve três decisões hold e nenhum fill, sem evidência de lucro da estratégia.
2. Conta brasileira: KYC, Pix de entrada/saída, titularidade Nubank, redes e custos confirmados na conta autenticada.
3. Signatário dedicado: saldo de gas/ativos, segredo isolado e margem Kuru verificada. Nenhum saldo atual foi verificado aqui.
4. Execução: reconciliar ordens, reservas, fills, gas, nonce, cancelamentos e capital inicial após restart; testar falhas e revisar independentemente. O código bloqueia live antes de qualquer depósito/ordem porque essa qualificação falta.
5. Estratégia: sessões novas, mais longas, avaliação líquida do Jev contra referências simples e sensibilidade a custos. Um trecho positivo não libera uso real automaticamente.

LIVE_ACK não remove o bloqueio. Doctor informa investmentReady=false. As mudanças são locais e não alteram Railway. Próximo trabalho elegível: evidência nova em paper e reconciliação; disponibilidade/autoridade para dinheiro real são verificações separadas.
