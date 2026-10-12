# Conferência de propostas na sessão OKX Web3

`validateWalletTransactionProposal(input, nowMs)` confere a forma, os limites numéricos e a validade temporal de uma proposta. `WalletSession.preflightTransaction(input)` acrescenta observações da conta e da rede no provider já associado à sessão. Ambas retornam `ready_for_review` ou `blocked`, sempre com `executionQualified: false`.

Esta conferência prepara uma proposta para revisão. Não autentica plano ou cotação, consulta capacidade financeira, simula gas, assina ou envia transações, nem estabelece execução, PnL ou lucro. Conta e rede são observações temporais: uma futura integração de envio terá de conferir novamente essas condições. Nenhum método de envio foi acrescentado nesta entrega.

## Proposta versão 1

A entrada deve ser um objeto simples, com protótipo `Object.prototype` ou `null`, contendo exatamente os seguintes campos próprios de dados. Accessors, símbolos, campos extras e campos ausentes bloqueiam a proposta; getters não são invocados. Falhas de reflexão de proxies também são bloqueadas.

O conjunto de chaves da captura dos descritores precisa coincidir com a enumeração preliminar. Um campo extra revelado pela segunda captura bloqueia a proposta. Essa conferência não detecta universalmente proxies que ocultam propriedades de forma consistente.

| Campo | Contrato |
| --- | --- |
| `version` | Número literal `1` |
| `planId`, `quoteHash` | Strings não vazias, até 128 caracteres; são rótulos de correlação |
| `chainId` | String canônica `0x8f` (Monad) ou `0xc4` (X Layer) |
| `from`, `to` | Endereços EVM completos de 40 dígitos hexadecimais, prefixo `0x`, diferentes do endereço zero |
| `data` | Prefixo `0x` e bytes hexadecimais completos, até 65.536 bytes; `0x` é aceito |
| `valueAtomic` | String decimal canônica uint256, inclusive zero |
| `gasLimitAtomic`, `maxFeePerGasAtomic` | Strings decimais canônicas uint256, estritamente positivas |
| `maxPriorityFeePerGasAtomic` | String decimal canônica uint256, entre zero e `maxFeePerGasAtomic` |
| `createdAtMs`, `expiresAtMs` | Inteiros seguros não negativos, com `createdAtMs < expiresAtMs` |

Decimais canônicos não incluem sinal, espaços, fração, expoente ou zeros à esquerda. O máximo uint256 é `115792089237316195423570985008687907853269984665640564039457584007913129639935`. Valores são tratados com `BigInt`: tanto `gasLimitAtomic * maxFeePerGasAtomic` quanto sua soma com `valueAtomic` precisam caber nesse limite.

A validade inclui a criação e exclui o vencimento: `createdAtMs <= nowMs < expiresAtMs`. A consulta não renova o prazo. Somente a caixa de endereços e de `data` é normalizada para minúsculas; rótulos, rede, valores e timestamps são preservados. O resultado aceito contém uma cópia independente e congelada da proposta, além de `observedAtMs`.

## Conferência na sessão

O chamador deve ter conectado explicitamente a sessão. A conta e a rede atuais precisam corresponder a `from` e `chainId`; sessões desconectadas, descartadas, em conexão/leitura ou na rede errada são bloqueadas sem solicitar permissões.

Cada chamada usa o mesmo provider da sessão e executa exatamente quatro leituras sequenciais, interrompendo na primeira falha:

1. `eth_accounts`, comparando a primeira conta autorizada com `from`.
2. `eth_chainId`, comparando a rede observada com `chainId`.
3. `eth_accounts`, repetindo a conferência da primeira conta.
4. `eth_chainId`, repetindo a conferência da rede.

As respostas de contas são arrays com `length` e cada posição requerida em descritores próprios de dados. Todas as contas são validadas; posições ausentes, herdadas ou accessors bloqueiam a resposta. A leitura não executa métodos ou getters fornecidos no array. Falhas de reflexão são tratadas como resposta inválida; arrays vazios preservam o comportamento existente de nenhuma conta autorizada.

O relógio e a revisão da sessão são conferidos antes e depois de cada leitura e ao final. Qualquer invalidação por `accountsChanged`, `chainChanged`, `disconnect`, troca de rede, `refresh`, reconexão, desconexão local ou `dispose` impede o retorno aceito, inclusive se a identidade voltar ao valor original. A entrada já foi copiada antes da primeira espera.

Cada leitura possui timeout próprio. Uma opção `timeoutMs` positiva e finita é usada com teto de 8.000 ms; valores inválidos usam 8.000 ms. A conferência não faz retries ou polling. Rejeição, synchronous throw e timeout são sanitizados; mensagens arbitrárias do provider não aparecem no resultado. Respostas tardias são ignoradas.

A chamada de preflight não publica snapshots, saldos ou notificações, não pede contas e não troca redes. Eventos da sessão preservam a atualização de saldos existente; essas operações permanecem separadas da conferência.

## Resultado

```ts
const result = await session.preflightTransaction(proposal);
if (result.status === "ready_for_review") {
  // Cópia congelada e identidade observada; nenhuma autorização de execução.
  review(result.proposal, result.observedAtMs);
} else {
  showBlockedReason(result.reason);
}
```

Motivos estáveis de bloqueio:

| Motivo | Condição |
| --- | --- |
| `invalid_proposal` | Forma, campo, faixa numérica ou intervalo temporal inválido |
| `invalid_clock` | Relógio lança erro ou não retorna inteiro seguro não negativo |
| `not_yet_valid` | Momento anterior à criação |
| `expired` | Momento igual ou posterior ao vencimento |
| `clock_regressed` | Relógio retrocede durante as leituras |
| `session_unavailable` | Sessão sem estado conectado utilizável |
| `session_changed` | Revisão/ciclo de vida invalidado durante a conferência |
| `identity_mismatch` | Conta ou rede diferente da proposta |
| `invalid_provider_response` | Resposta de identidade inválida ou nenhuma conta autorizada |
| `provider_timeout` | Uma leitura não respondeu dentro do limite |
| `provider_error` | Falha sanitizada do provider ou da conferência |

Os testes públicos usam provider e relógio controlados, com oráculos literais para limites, identidade e corridas. Esses testes não qualificam a extensão nativa, a confiabilidade de contratos, a viabilidade econômica ou o desempenho financeiro. A integração depende das duas revisões independentes e da verificação do integrador previstas na SPEC congelada.
