# Pesquisa independente: prova de router e custos/FX — 2026-10-11

Pesquisa/advice, sem aprovação de SPEC ou implementação. Origem somente leitura: `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader`, HEAD observado `f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c`. Única saída desta tarefa: este arquivo, na cópia ordinária exclusiva `C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011`. Identidade desta conversa: `01a12adc-473d-7381-b067-c83af7ccda31`; sessão observada: `01a12971-f941-7e42-8a42-fab6d44d4eb5`. GPT-6.1 Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Isolamento operacional, sem sandbox de leitura imposto pelo sistema. Nenhum filho, app, teste, signer, RPC, endpoint autenticado, ordem, leitura de `.env`/segredos ou alteração da origem. Documentação e arquivos públicos oficiais foram consultados; arquivos públicos foram lidos em memória, sem execução dos exemplos de API. Estado privado do harness permanece fora do repositório.

A SPEC atual tem SHA `2332ee75e55c41c31bfa59145c271595323b0cccf5baa56dc43ca3ed27dd45c2`, diferente do SHA da versão inicial recebida no ciclo anterior. Sua linha 3 diz literalmente: “not frozen acceptance or implementation approval”. A1–A6, linhas 27–37, e R1–R6, linhas 55–65, são preservados aqui como obrigações propostas, sem enfraquecimento ou autocertificação. A abstenção de arquitetura `3b7776aa-3cb2-4273-930c-aefeef962e72`, confiança 0.52, continua sem escolher quote-first/prepare-first (SPEC:71). Nenhuma consulta Jev foi iniciada por esta pesquisa.

## Prova primária encontrada e seu limite

A [página oficial de smart contracts](https://web3.okx.com/onchainos/dev-docs/trade/dex-smart-contract), seção “Contract ABI”, aponta para `okxlabs/DEX-Router-EVM-V1`, redirecionado para o repositório oficial `okxlabs/Web3-DEX-Router-EVM-V1`. Commit público observado e fixado nas leituras: `1fc1508df3caeb18a8179dfc0ea4e956099ab481`. O [ABI publicado](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/DexRouterabi/DexRouter.json) é evidência real para um decoder específico; não foi inventado um ABI ou selector.

Há uma divergência de deployment que impede qualificação live apenas por esses arquivos: a página atual lista router Ethereum `0x8feab81d36e7576107d5de0758c1b839be31b4f6`, enquanto [DEPLOYMENT.md:9](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/DEPLOYMENT.md#L9) lista `0x5E1f62Dac767b0491e3CE72469C217365D5B48cC`. As tabelas também divergem para Base/Arbitrum. A orientação oficial de usar os endereços retornados pela API não fornece permissão para aceitar um router novo automaticamente. Não houve prova de bytecode, versão efetiva, proxy/implementação ou correspondência do ABI com esses endereços atuais.

| Evidência verificável | Consequência para R6 |
|---|---|
| [IDexRouter.sol:5–18](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/interfaces/IDexRouter.sol#L5): `BaseRequest` contém `fromToken`, `toToken`, `fromTokenAmount`, `minReturnAmount`, `deadLine`; `RouterPath` contém adapters e dados internos. | Existem campos decodificáveis; a estrutura, sozinha, não prova a semântica de cada método ou adapter. |
| [DexRouter.sol:709](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/DexRouter.sol#L709) e :751: `uniswapV3SwapToWithBaseRequest` / `unxswapToWithBaseRequest`, presentes no ABI, confrontam tokens com a rota e encaminham input/minimum/receiver. Os internos :399–431 e :622–645 conferem o aumento de saldo do destinatário contra o mínimo; :39 verifica deadline em segundos de bloco. | São candidatos concretos para prova específica, condicionados à correspondência deployment/código/pools. |
| Mesmo [router:877](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/DexRouter.sol#L877): `swapWrapToWithBaseRequest` não utiliza `minReturnAmount`. :316–343, invest-with-refund substitui input pelo saldo do router. :193–201 admite soma de batches menor que input; :54–105 distribui por pesos/adapters. | Não generalizar a prova dos wrappers para wrap, invest ou qualquer smart route. Quantidade nominal não garante consumo exato nem ausência de débito adicional. |
| ABI não contém `dagSwapByOrderId`/`dagSwapTo`, embora apareçam no [Solidity:899](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/DexRouter.sol#L899). | Lacuna de versão/cobertura confirmada; não fabricar ABI DAG para declarar suporte. |
| [CommonUtils.sol:8,26–31,37–70](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/libraries/CommonUtils.sol#L8): endereço em bits baixos, flags legacy/no-transfer/invest/Permit2 e constantes dependentes da rede. Não há chainId no `BaseRequest`. | Decodificar uint completo/flags; não truncar bits e aceitar modos desconhecidos. Chain exige vínculo separado com transação, router e artefato específico da rede. |
| [CommissionLib.sol:111](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/libraries/CommissionLib.sol#L111) lê `calldataload(sub(calldatasize(), 0x20))`; :162/:227 interpretam outros sufixos/trim. :555–584 pode cobrar comissão adicional no input. | O footer inteiro participa da prova e dos custos. Omitir referral na requisição ou somente decode/reencode de argumentos não prova ausência de comissão/trim. |
| [UniswapTokenInfoHelper.sol:14–61](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/libraries/UniswapTokenInfoHelper.sol#L14) deriva tokens de pools e flags. | Métodos sem tokens explícitos exigem prova adicional da rota/pools; um nome de método ou selector permitido não basta. |

**Contrato mínimo proposto, não aprovado:** usar prova versionada para uma tupla chain/router/ABI/implementação, parser estrito de método, comprimentos, flags, receiver efetivo, input atômico, output token, minimum, deadline, value e sufixos. Comparar calldata completo e seus hashes com os ecos remotos e o plano. Registrar derivações, não `qualified=true`. Uma primeira família possível são os dois wrappers com `BaseRequest`; smartSwap legacy também é alternativa somente com prova de batches/adapters/transferência e custos. Excluir inicialmente semânticas não demonstradas, sem proibir uma rota suficientemente comprovada. Receiver zero tem semântica de remetente nos internos; a prova deve resolver essa identidade, nunca aceitar zero como um destinatário arbitrário. Provar também que nenhum caminho autorizado pode cobrar quantidade extra não modelada. A regra de footer precisa reproduzir os flags reconhecidos pelo contrato inclusive se o último word vier de dados aninhados canônicos. Memo/sufixo desconhecido, modo novo, pool/adapter opaco ou deployment sem correspondência permanece explicitamente não qualificável.

## Custos e FX: fatos disponíveis versus prova necessária

| Fonte oficial inspecionada | Fato / limite |
|---|---|
| [Quote](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote), response parameters | `fromTokenAmount` é input atômico; `toTokenAmount` é estimativa. `tradeFee` é estimativa de rede em USD; `estimateGasFee` é taxa em unidades atômicas nativas, não contagem de gas. `tokenUnitPrice` é preço USD recomendado, podendo ser null; não fornece as-of/TTL ou intervalo garantido. Não prova taxa DEX zero. |
| [Swap](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap), request/response parameters | `slippagePercent=0.5` significa 0.5%; `tx.gas` é limite estimado, com orientação de aumento de 50%; `gasPrice`/priority/value usam wei no EVM. Há `minReceiveAmount`, recipient e opção autoSlippage. A descrição não estabelece algoritmo inteiro de mínimo ou TTL da rota. Não presumir ausência de RFQ/assinatura por ter um calldata. |
| [Gas price](https://web3.okx.com/onchainos/dev-docs/trade/onchain-gateway-api-gas-price) e [gas limit](https://web3.okx.com/onchainos/dev-docs/trade/onchain-gateway-api-gas-limit) | GET `/api/v6/dex/pre-transaction/gas-price`: tiers estimados em wei/SUN; o tier max não é teto contratado. POST `/api/v6/dex/pre-transaction/gas-limit`: limite estimado para a transação informada; não demonstra cobertura de toda taxa adicional da rede. |
| [Market price](https://web3.okx.com/onchainos/dev-docs/market/market-price) e [index price](https://web3.okx.com/onchainos/dev-docs/market/index-price) | Ambos POST; price/time/chain/token, `time` Unix ms. Index agrega fontes e admite até 100 tokens; nativo usa string vazia. As descrições de `price` inspecionadas não explicitam denominação USD, limites futuros ou TTL. Não transplantar unidade de outro endpoint. |
| [Market API Fee](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee) | Index current-price é Free; market price/candles são Basic, sujeito a quota/cobrança. x402 exige assinatura de pagamento. Plano/quota/custo efetivo desta conta não foram inspecionados; não há autorização para pagamento automático. |

**Requisitos práticos sugeridos mantendo R3/R4:** ledger de evidência de custo com source, rede/token, unidade/escala, cobertura, bound superior, observação/validade e inclusão no output. Somar ambos swaps, approvals realmente planejadas e outras cobranças aplicáveis; zero requer ausência/inclusão demonstrada. Usar gasLimit realmente enviado × fee cap comprometido, inclusive approvals, com escala nativa e taxa adicional específica da chain quando aplicável. Não somar priority novamente ao maxFeePerGas nem deduzir duas vezes a mesma taxa estimada. Comissão/tax/DEX incorporada ao output exige prova dessa cobertura; input extra é débito separado. Allowance de inferência não é faturamento conhecido. Unknown permanece unknown.

FX exige identidade da fonte, denominação explícita, as-of, janela válida e limites inferior/superior com proveniência verificável. Preço pontual timestampado não se torna bound futuro por um TTL escolhido; USD sem timestamp de quote também não ganha as-of pelo horário do inventário. Se não existir fornecedor/contrato qualificado para esses limites, a qualificação fica pendente; fixtures offline explícitas podem verificar o comportamento sem declarar acesso real. Não assumir stablecoin=USD1. Comparar crédito mínimo × preço inferior contra capital × preço superior + custos superiores, com inteiros/racionais exatos; créditos arredondam para baixo, débitos para cima. Preservar igualdade em minNetUsd, sem margem arbitrária.

## Seams locais e alternativas reais

`src/okx-wallet/trade.ts:136–154` permite cliente injetado, mas retém apenas amount echo, output, números de fee/impact e receipt time local. :223–247 descarta ecos remotos; :238 copia chain da requisição, :240 mantém calldata opaco. `src/operator/executor.ts:94–108` confere allowlists/selector/value/gas/minimum metadata, sem decoder de recipient/output/input. :205 envia gas aumentado por 3/2, enquanto :105 verifica o gas bruto; o bound/cap proposto precisa cobrir o valor efetivo. Approvals usam gas 120000 (:223/:255). :294–301 aguarda network/fees e invoca `beforeSubmit` antes do handoff; :198–200 hoje verifica STOP/TTL, não toda evidência econômica. Boolean simulation (:315) não é prova R6; receipt (:309–310) não é balanço/profit atribuível.

`candidates.ts:158–162` usa output inteiro da leg1 para leg2 e infere tradingFee zero com network fee presente. `portfolio.ts:242–250,285–291` não dá as-of próprio ao preço e converte para Number. `scripts/okx-operator.ts:193` fixa slippage 0.5; manter valor comum decimal explícito em CLI/cycle/context, sem nova variável arbitrária. `endpoints.ts:34–36,60` registra preços/gas; registro não prova adapter/contrato FX qualificado.

| Alternativa ainda aberta | Obrigações e custo |
|---|---|
| Quote-first | Aplicar mínimo inteiro local R2; requotar leg2 para esse input exato; preparar e provar ambas antes da primeira approval. Se mínimo preparado divergir, reconstruir/revalidar completamente ou rejeitar. Pode exigir nova quote/preparation; não supõe algoritmo OKX. |
| Prepare-first | Provar preparação unsigned da leg1 e seu mínimo efetivo; quotar leg2 exatamente nesse mínimo, preparar leg2 e validar economia/provas completas antes de qualquer approval. Adquire dados de execução antes, mas não resolve deployment, custos/FX ou envelhecimento. |

O ABI reduz incerteza de mecanismo para ambas. A falta de rounding publicado torna relevante observar o mínimo preparado, mas não escolhe arquitetura nem autoriza chamadas. Em ambas, R5 exige validação após cada quote/model/spender/prepare/simulation/approval/receipt e preparação assíncrona do signer, imediatamente antes de cada handoff por guard síncrono local, sem rede dentro dele. Não alegar controle dos awaits internos posteriores do SDK. Após leg1, mudança adversa interrompe leg2, preservando exposição/reconciliação; mínimo previsto e receipt não provam saldo disponível realizado.

## Aceitação independente proposta e ownership

- **A1/R1/R2/R4:** fixture pública builder→gate→plan→executor com ecos completos, decimal comum `0.5`, fórmula local `floor(q*(1000000-5000)/1000000)`, BigInt grande, 6/18 decimais, zero slippage, um átomo, rota não linear, digest de toda evidência e identidade de replay estável quando timestamps são renovados.
- **A2/R3/R4:** caso anterior 1%/0.5% deve rejeitar antes da primeira approval; caso suficiente, com custos/FX/prova de execução explícitos, deve completar sinteticamente. Cobrir igualdade e um átomo abaixo, approval omitida, fee negativa/não finita/sem unidade, comissão extra, FX/custo expirado e unknown. Não usar um Boolean para fabricar suficiência.
- **A3/R5/R6:** alterar independentemente chain, router, recipient, tokens, input, mínimo, modo, flags, footer, value, deadline, pool/adapter e calldata mantendo metadata favorável deve impedir handoff. Cobrir wrap sem mínimo, invest/balance, método DAG ausente e deployment incompatível; cada rejeição tem motivo específico. Envelhecer prova após todos os awaits pertinentes; após leg1, testar estado parcial sem retry ou aumento da quantidade.
- **A4/A5/A6:** preservar todos os controles, dry-run/shadow com explicação de não qualificação, regressões públicas RED novas no baseline fixo antes de implementar, GREEN/typecheck/suite pertinente e revisão/audit independentes em hashes exatos antes de integração. Nenhum teste foi rodado por esta pesquisa; nenhuma implementação foi certificada.

Seams existentes, apenas lidos: `operator.test.ts:175,201,246,264`; cliente prepare/signer/clock injetados em `executor.expiry.test.ts:48–70,148–189`; approvals/reconciliation em `executor.approval-identity.test.ts:143,167,272,295`; awaits do signer em `executor.signer-expiry.test.ts:37–87`. Não substituir essas proteções por testes exclusivos do decoder.

Proposta de arquivos, sem reserva: conservar o set de oito arquivos da SPEC:41 (`candidates`, `types`, `plan`, `executor`, `risk-gate`, `cycle`, `trade`, CLI) e os novos `roundtrip-contract.ts/.test.ts` / `trade.roundtrip-binding.test.ts`; acrescentar um módulo puro `src/okx-wallet/router-execution-proof.ts` e seu teste somente se a prova não couber claramente no contrato existente. Evitar duplicar prova/economia. Integrador é único escritor da origem; revalidar hashes e reservar set real antes de implementar. A SPEC mudou no mesmo HEAD por refinamento documental: HEAD sozinho não fixa aceitação. Sem edits de config/endpoints/portfolio implícitos; qualquer necessidade concreta amplia set declarado, nunca autorização financeira.

## Manifesto SHA256 das leituras

Paths locais relativos à origem acima; hashes rechecados em 2026-10-11. Referências de linha se aplicam a estes bytes.

```text
docs/OPERATOR-ROUNDTRIP-AMOUNT-SPEC.md 2332ee75e55c41c31bfa59145c271595323b0cccf5baa56dc43ca3ed27dd45c2
src/operator/candidates.ts 3955e44992bba1a2a36a6382f3ad29fe50c2248300deb2646519f3c54dbdd219
src/operator/executor.ts 17db3012332584dce46ac712e0d48ebf71f59f13533ce40d8b12fa6667b6961a
src/operator/types.ts f2a0476773571945cfced68768b90fc85e88914a95755b0e44d405c918408039
src/operator/plan.ts 488159912f83980e4e0a642aac9cf3342533fc76c1eac6df3a19c0f3b4d8d9f4
src/operator/config.ts 1488d245dd30e449c8bdef7472651037ab3b68fd469ddde2f854362a2c4bc3e7
src/operator/risk-gate.ts 7b916e9246c16e68cb6f007f687009f54e6237d54ae7297ce8c7a663daffbaa1
src/operator/cycle.ts adcb20abbe449b458a1b69b80a9b9226e1919791b5ad8fa0b63de3cab644f3a2
src/okx-wallet/trade.ts 24688d48572c9062be59910ac988c67ff7e1349d910eae1a9e1b5183ff9b7e86
src/okx-wallet/portfolio.ts b07cfd5be8b74c65cadbc3c1874b9b377acf0bb568f15012423f4e5ec0dea544
src/onchainos/endpoints.ts 23158bcd606d26a710723a55d18b5c4eddd8c2c5f1273b3de88182f4b73134b5
scripts/okx-operator.ts ed937480a59c21d94deab87769ac4ae68cf10b7bdaaa743898df7039c03f5784
src/operator/operator.test.ts 525c75c72a0ea7d84d7262f3fe31fe9d5f8b09e28d996ffb3ea486eb686b196a
src/operator/executor.approval-identity.test.ts dfba6c5a6fe4102c394a6ad638e2ad9f65b4db983b22cfc6eaa50a22fa683681
src/operator/executor.expiry.test.ts 3c49424fac0a66fde0f4f224b6dfbb9af2b2f64b8634165c573e1d4e51334f1b
src/operator/executor.signer-expiry.test.ts b0c4635c430315750587d3fb95a0df8a25fd75e94b72077bc2f64cde98459ad7
```

Arquivos públicos: bytes exatos obtidos do raw GitHub no commit fixado acima, sem salvar/instalar código. Páginas HTML de documentação são mutáveis; não têm hash de snapshot aqui e não provam execução atual.

```text
DexRouterabi/DexRouter.json 96bfcc579be3a8f82d4a8ed0eb81db6dada46f23f07a08334adb2f064adaad55
contracts/8/DexRouter.sol 2f7ca3b6a87cb87e1c0fe617c320dec62b0133321e00c52a52647e45872ba470
contracts/8/interfaces/IDexRouter.sol 3e200164cd2156357d50e27d1dfd191ee354fe57721971092935f1799b3948ae
contracts/8/libraries/CommonUtils.sol ed136fec5149c7dbc2a9eb34ec55020f42bd2bd6ad7c7712137b56342d3ee40e
contracts/8/libraries/CommissionLib.sol 2bb2a79be7a3c01c717b9a38b51999e3d87f791ac419ba5ae97004e0088b2f2f
contracts/8/libraries/UniswapTokenInfoHelper.sol e49e58e6b68761aae158190dd57c2c40b1e35b34b26174acd663faf064120176
contracts/8/DagRouter.sol cfc364e6ca862540d181f8c55eaf23a9fd3c1cf8b0eccba4bc81eed56e0b88c5
DEPLOYMENT.md eb0958ebbe04d555459eae26012cbda3e4fb99f9a385203b4f7042d36adc0fc8
```

Relatório anterior `operator-roundtrip-contract-research.md` continua SHA `b20bea4a0d66713bdea596a85260fc50c36af954590d3a047ec20673ebf90e99`; relatórios CLI audit, second-leg e full-suite também foram rechecados sem alteração. Não se infere garantia de provider, preço futuro, acesso/quota, saldo realizado, profit ou conclusão do goal amplo. Próxima dependência é revisar/fixar prova de deployment/rota e proveniência/cobertura de custos/FX, então resolver sequência e congelar aceitação independente; nenhuma aprovação de implementação, fundos ou push decorre deste arquivo.
