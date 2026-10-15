# Procedência dos valores exibidos na carteira

Auditoria somente de leitura por `/root/okx_research`, conversa `01a136cd-3af3-7361-bd23-c23a6aeece97`, observação de processo em 2026-10-13 às 21:31 BRT. Nenhuma consulta de rede, leitura de credenciais ou alteração de código foi feita. Este resultado qualifica o código observado, não os bytes já carregados no processo nem as respostas reais de cada atualização.

## Caminho observado

`src/onchain-read/routes/wallet.ts:130` preserva `first.totalValue` da resposta de total. Nas linhas 150 a 159, o saldo vem de `balance`, o preço de `tokenPrice` e o valor de cada linha é calculado como `balance * price`. Não há conversão adicional por decimais ou lamports. As unidades das respostas reais não foram verificadas nesta auditoria.

`web/src/lib/wallet/holdings.ts:155` valida e preserva os campos. `HoldingsPanel.tsx:345` mostra o total independente e, na tabela, preços e valores das linhas. Não há conciliação entre o total do provedor e a soma dos ativos com preço. A legenda atual diz que preço e valor vêm do provedor; com maior precisão, o preço vem do provedor e o valor da linha é calculado com esse preço.

A busca delimitada no caminho de produção não encontrou preço aleatório, mock ou testmode. O inventário sintético encontrado pertence ao CLI `scripts/okx-operator.ts`, separado do Desktop observado. `src/desktop/handlers.ts:90` usa `options.fetch ?? fetch`; `src/onchain-read/client.ts:44` aponta para `https://web3.okx.com`. Isso não certifica toda a configuração efetiva do processo.

## Tempo e cobertura

Total e saldos têm endpoints e caches independentes, com TTL de 60 e 30 segundos. O gateway pode devolver cache antigo após falha do provedor ou bloqueio de orçamento, por até 12 minutos para total e 6 minutos para saldos. `ageMs` mede a idade no cache local, sem provar a idade do preço de mercado. Leituras paralelas não constituem um snapshot atômico.

“14 de 14” conta linhas normalizadas válidas daquela resposta. Registros inválidos são descartados e a saída é limitada a 200 linhas. O normalizador de saldos não expõe `excludeRiskToken`; o endpoint de total aceita `assetType`, mas o leitor atual não envia esse filtro. A cobertura dos dois valores pode diferir.

## Limite da conclusão

Foram observados totais de US$245,08 e US$203,30 em atualizações distintas, além do par anterior US$800,61 e US$217,57. Sem respostas pareadas com identidade, quantidade, preço e metadados de cada atualização, a causa permanece indeterminada. Arredondar 14 valores comuns a centavos não explica diferenças dessas magnitudes. Não é possível classificar a diferença como perda de capital, valorização real ou erro do provedor com essa evidência.

A dependência mais curta é tornar visíveis total do provedor, subtotal dos ativos com preço, diferença, idade e estado de cada leitura, com valor tratado como indicativo. A conciliação precisa respeitar a cobertura e os contratos canônicos; não pode inventar ativos ausentes. Este documento apenas registra a dependência, sem implementar ou ampliar o escopo congelado ABSTENTION.

## Identidade das fontes

HEAD observado: `c56fcf55286f81fdb5c837e78a09da14e2277980`. Processo 47322: PID 28592, `bun.exe`, `src/desktop/main.ts`, criado 18:35:24 BRT, `--no-env-file --no-browser`, sem `--selftest`, `--hot`, `--watch` ou flags sintéticas observadas. O ambiente herdado e os valores do cofre não foram lidos.

| Fonte | SHA256 observado |
| --- | --- |
| `src/desktop/main.ts` | `23f8a81c6528f27d73ece8dd32bb683b39416a08a0cd60d7e1376483c89a678d` |
| `src/desktop/handlers.ts` | `bf4b9b0457c2733ca896d2b5e54630ee36272d917ad50a7a8062d37694d885d1` |
| `src/onchain-read/client.ts` | `35b8862b67d448e4eb104fb5353825d95839e311c62d92e127ac17367aa08e93` |
| `src/onchain-read/routes/wallet.ts` | `5b6fe4c9d8615ed8a2d6c21b161f919ea97b34b12ffe4986742a107fca1ba26d` |
| `src/onchain-read/gateway.ts` | `62b3a8110719f4896d7b08a8da86e6f71080c25fa76e26b0451db7c62f59be42` |
| `src/onchain-read/cache.ts` | `cb08989f26ff4f1ee9d4eb8cd29c556bc8e680af3ed205775f95823a5fd0b6d0` |
| `web/src/lib/wallet/holdings.ts` | `de3c573b615baac06fcb8153d00858697384f71d32a5e5080f0a444c211207d8` |
| `web/src/components/Desk/Dock/HoldingsPanel.tsx` | `4f67d7e6a20aad50c54fbfe777702058d59f71f4645f0f564d7900dcde7b38c5` |
