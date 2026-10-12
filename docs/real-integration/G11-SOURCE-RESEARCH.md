# G11: fontes oficiais de deployments e semântica de swap OKX

Pesquisa delimitada em 2026-10-11, aproximadamente 20:37–20:49 UTC, incluindo fechamento e correção de referências. Pesquisador `/root/okx_official`; identidade própria CODEX_THREAD_ID `01a12b61-af3a-76d3-aed6-bba7f750c192`, CODEX_SESSION_ID `01a12b5f-ca2a-7ff1-a131-07933705d3e8`. Este relatório é evidência e proposta, não aprovação, implementação, revisão independente ou certificação de G11.

## Resultado

Há uma fatia concretamente implementável sem credenciais, build de swap ou gesto da wallet: um leitor público de evidência de deployment, com candidatos oficiais por rede, bloco fixado e runtime observado, preservando desconhecido quando não houver vínculo verificável entre código, versão, ABI e semântica. Isso reduz uma dependência de G11, mas não fornece hoje um adapter de produção com decoder integral.

Os routers atuais documentados e registrados oficialmente são de **v1.0.10-rfq-anti-arbitrage**. O repositório EVM ligado pela documentação publica código de **v1.0.7-multi-commission**; sua ABI não inclui todas as funções presentes no próprio source commit. Não foi encontrado, nesta janela, vínculo verificável completo entre source/ABI v1.0.10 e runtime dos routers atuais em X Layer 196 e Monad 143. Nenhum bytecode ou codehash de produção foi inventado ou derivado de fixture.

## Contratos locais congelados

Workspace lido: `C:/Users/gabri/.codex/worktrees/okx-real-integration/jev-trader`. Hashes SHA-256 observados:

| Fonte local | SHA-256 |
|---|---|
| docs/real-integration/INSTRUCAO-DO-OBJETIVO.md | cfa90cac735e9a838a0c4bc593276c83757905e7c5fedcd2414e499b1dad9e08 |
| docs/real-integration/EXECUTION-SPEC.md | eeb6ab8d9e4adf990600a8806bceaeb7774a5eefe1ae3bbe7daba70e590290ef |
| src/real/semantic-proof.ts | DBEF9C46E21BBB1E2911746B5D6E518222A1C08724980E5EE2A46C5EB1B123DB |
| src/real/semantic-integration.ts | 9B01DF3CD7ACB0881D89AA3D7853769E3A70456F3E14B2814479C67F1C7B19D5 |
| src/real/observation-integration.ts | B629680D46810D9EB5BEDFA6140EA581D7EBB1408A457BD1342E3CB2D97EE70C |

O adapter atual de observation fornece `deployment:null`, `allowance:null`, `fees:null` e `decode:async()=>null`. O framework exige ABI JSON completa congelada, selectors e hashes de semântica, runtime e spender observados, igualdade de contexto e bloco, reencoding byte a byte e ausência de caminhos não interpretados. Não basta preencher esses campos com metadados de documentação. Os holds de produção, simulação e política econômica permanecem independentes da conclusão local. `rpc-read.ts` já restringe redes a 196/143 e métodos a chainId/bloco/balance/code/call; não possui leitura de storage de proxy.

O harness foi consultado somente com a própria identidade; contexto revision 0, phase research, status idle. Harness e playbook orientam o processo; não concedem autorização. Nenhuma meta nativa foi criada. Não houve implementação, testes ou alegação de conclusão.

## Deployments oficiais: fatos e limites

[Documento oficial de contratos DEX](https://web3.okx.com/onchainos/dev-docs/trade/dex-smart-contract), acesso 2026-10-11, publica:

| Rede | chainId | Router candidato documentado | Approval address candidato documentado |
|---|---:|---|---|
| X Layer | 196 | 0x7c5bee2a8091c3ef39072f64f18fac913060aeaf | 0x8b773D83bc66Be128c60e07E17C8901f7a64F000 |
| Monad | 143 | 0xc1c76e784db8d68585fb608ce68fc5dcff14000e | 0xf534A8a1CAD0543Cd6438f7534CA3486c01998d4 |

Evidência literal do documento: “Documentation and API responses may be updated at different times.” e “Do not hardcode addresses from the documentation.” Portanto são candidatos para pesquisa, não allowlist permanente, prova de spender efetivo ou confirmação do router retornado por uma API concreta. Nenhuma API de swap autenticada foi chamada.

[Segurança oficial dos contratos](https://web3.okx.com/onchainos/dev-docs/trade/smart-contract-safety) liga o repositório EVM, atualmente [Web3-DEX-Router-EVM-V1](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1). Evidência literal: “We have open-sourced our smart contract codes on github”. O link histórico `https://github.com/okx/Web3-DEX` retornou 404 nesta investigação e não deve fundamentar o deployment atual.

O [DEPLOYMENT.md congelado](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/DEPLOYMENT.md) declara X Layer 196 router `0x0efa3a01eb0708f9e40b661c6cd7c56c83b9f45a` e Monad **13107** router `0x6088d94C5a40CEcd3ae2D4e0710cA687b91c61d0`. Lista TokenApproveProxy `0x70cBb871E8f30Fc8Ce23609E9E0Ea87B6b222F58`. A frase “These addresses are final and used on-chain.” não resolve o descompasso de rede e versão. [Histórico de deployments](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/history-deployment-address.md) também contém endereços históricos; não é um atestado do runtime atual.

## Registro oficial mais novo: correspondência encontrada

[Registro clear signing do OKX Labs](https://github.com/okxlabs/clear-signing-erc7730-registry), commit fixado `3d60345850337de3507c172db8d25b25052e6966` de 2026-08-24, contém três versões:

| Registro | Monad 143 | X Layer 196 | deploymentDate no metadado |
|---|---|---|---|
| [v1.0.7](https://github.com/okxlabs/clear-signing-erc7730-registry/blob/3d60345850337de3507c172db8d25b25052e6966/registry/okx/calldata-OkxDexRouterV1.0.7-multi-commission.json) | 0x6088d94C5a40CEcd3ae2D4e0710cA687b91c61d0 | 0xD1b8997AaC08c619d40Be2e4284c9C72cAB33954 | 2025-11-28T02:08:59Z |
| [v1.0.8](https://github.com/okxlabs/clear-signing-erc7730-registry/blob/3d60345850337de3507c172db8d25b25052e6966/registry/okx/calldata-OkxDexRouterV1.0.8-suffix-compat.json) | 0x7A7AD9aa93cd0A2D0255326E5Fb145CEc14997FF | 0xbec6d0E341102732e4FD62EC50E2F0a9D1bd1D33 | 2026-03-20T03:24:35Z |
| [v1.0.10](https://github.com/okxlabs/clear-signing-erc7730-registry/blob/3d60345850337de3507c172db8d25b25052e6966/registry/okx/calldata-OkxDexRouterV1.0.10-rfq-anti-arbitrage.json) | 0xc1c76e784db8d68585fb608ce68fc5dcff14000e | 0x7c5bee2a8091c3ef39072f64f18fac913060aeaf | 2026-07-27T08:48:28Z |

O último registro corresponde exatamente aos routers atuais na documentação. Contudo, seu objeto possui `$schema`, metadata, context e display; não publica runtime, ABI completa, compiler inputs ou implementation/proxy evidence. Oferece 11 formatos de exibição, inclusive dagSwap. Em paths, batches e pools consta literalmente `"visible": "never"`. `extraData` e componentes internos não recebem interpretação integral. Inferência fundamentada: clear signing de campos escolhidos não satisfaz `uninterpretedPaths=[]` para calldata inteira.

## ABI e código publicados: incompatibilidade e complexidade real

Source commit EVM: `1fc1508df3caeb18a8179dfc0ea4e956099ab481`, committer 2025-12-02T08:25:49Z, tree `90959de495c021a131efc93a6026e8f0c417123a` não truncada. A data recente da organização/repositório não promove esse commit a código v1.0.10.

[DexRouter.json](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/DexRouterabi/DexRouter.json) é um artifact com ABI, bytecode, deployedBytecode, methodIdentifiers e metadata. A ABI tem 24 entradas e 18 funções; **não contém dagSwapByOrderId ou dagSwapTo**, presentes em [DexRouter.sol](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/DexRouter.sol), linhas 899–923. Source declara v1.0.7-multi-commission. Compiler do artifact: 0.8.17+commit.8df45f5f, optimizer desabilitado, runs200, EVM london. Bytecode object tem 64866 caracteres hex; deployedBytecode object 64800. São artefatos compilados sem vínculo observado com os deployments atuais. Hash SHA-256 do arquivo não é keccak do runtime on-chain.

Selectors do artifact antigo, apenas referências de pesquisa: smartSwapByOrderId `0xb80c2f09`; smartSwapTo `0x03b87e5f`; unxswapByOrderId `0x9871efa4`; unxswapTo `0x08298b5a`; uniswapV3SwapTo `0x0d5f0e3b`. Não estão qualificados para permitir o deployment v1.0.10.

No código v1.0.7, RouterPath contém arrays de adapters, destinatários, palavras compactadas e bytes específicos. Smart swaps percorrem batches e hops; DAG acrescenta índices de entrada/saída e transfer modes. [CommonUtils](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/libraries/CommonUtils.sol) e [DagRouter](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/DagRouter.sol) definem máscaras; o peso é extraído acima dos 160 bits de endereço, índices DAG em 184/176. Decodificar só a tupla externa não interpreta pool, reverse, peso, transfer mode e destinos efetivos.

[CommissionLib](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/libraries/CommissionLib.sol) lê palavras do fim de calldata, por assembly, para comissão/trim. Trailers podem existir fora do payload ABI ordinário. Reencoding canônico pode rejeitar um trailer por divergência, mas não o explica. Um decoder estrito deve interpretar a versão exata ou rejeitar explicitamente toda extensão desconhecida.

[UniV3Adapter](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/adapter/UniV3Adapter.sol) decodifica bytes internos, usa saldo do adapter e callback/payer. [PMMLib](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/libraries/PMMLib.sol) mantém extension em bytes. Cada adapter e pool relevante precisa de código/versão/token pairing qualificados. A documentação oficial também liga [Web3-DEX-EVM-PMM](https://github.com/okxlabs/Web3-DEX-EVM-PMM), com atualizações posteriores e campos RFQ packed, assinatura, permit e caller authorization. Isso é mais uma razão para não transportar automaticamente a interpretação v1.0.7 para v1.0.10.

## Spender e proxy

[TokenApprove](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/TokenApprove.sol) é quem chama transferFrom nesse source. [TokenApproveProxy](https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/blob/1fc1508df3caeb18a8179dfc0ea4e956099ab481/contracts/8/TokenApproveProxy.sol) encaminha a operação ao tokenApprove configurado, tem allowedApprove e atualização de tokenApprove. Logo, approval address, router e TokenApproveProxy não são sinônimos.

Os nomes Proxy e OwnableUpgradeable não provam deployment através de EIP-1967, beacon, clone ou ausência desses mecanismos. `_APPROVE_PROXY()`, `tokenApprove()` e `allowedApprove(router)` seriam leituras úteis após qualificar a ABI da versão real. Também seriam necessárias implementação e storage de upgrade se o runtime efetivo usar proxy. Não se deve decidir o mecanismo pelo nome ou aplicar slots padrão sem evidência da arquitetura.

## Explorer e runtime: o que foi realmente obtido

[Informação oficial de X Layer](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information) liga o explorer OKX e RPC público. [Informação oficial de Monad](https://docs.monad.xyz/developer-essentials/network-information) liga MonadScan/MonadVision e descreve limites de RPC público. Serviços públicos não garantem ausência de limite nem desempenho da aplicação.

GET de [router Monad no MonadScan](https://monadscan.com/address/0xc1c76e784db8d68585fb608ce68fc5dcff14000e#code) retornou HTTP200. HTML observado identifica literalmente `Contract: Unverified`. Não contém os identificadores `_APPROVE_PROXY`, `dagSwapByOrderId`, `DexRouter` ou `v1.0.10`. Isso é estado observado no explorer, não prova de inexistência de source em todas as plataformas. GET de [router X Layer no explorer OKX](https://www.okx.com/web3/explorer/xlayer/address/0x7c5bee2a8091c3ef39072f64f18fac913060aeaf) retornou HTTP200 com shell HTML, sem ABI/source/runtime verificáveis recuperados. O navegador de pesquisa não conseguiu abrir ambas as páginas; GET direto tornou explícita essa limitação.

Nesta coleta não houve chamada JSON-RPC, observação eth_getCode, hash keccak de runtime, leitura de implementation/storage, build real, wallet ou API autenticada. O integrador informou posteriormente ter recebido code de 13.322 bytes para cada router e hashes keccak distintos em G11-PUBLIC-ROUTER-READ.json, com chainId/bloco/hash conferidos. Este pesquisador não leu nem auditou esse recibo. A informação acrescenta runtime observado pelo integrador, sem comprovar ABI, proxy, spender ou semântica.

## Fatia proposta: leitor público de qualificação, independente do preflight

Requisitos propostos, a revisar independentemente antes de implementação:

1. **DEP01, fontes congeladas.** Catálogo de candidatos somente para redes 196 e143, com URL, commit, SHA-256 e versão por fonte. Discordância entre fontes é dado observável. Registro/documentação não gera allowlist de execução.
2. **DEP02, observação pública.** Mediante autorização da próxima fatia para RPC read-only, obter chainId, bloco number/hash e code dos routers/approval candidatos usando blockTag fixo. Preservar bytes exatos e calcular keccak do runtime observado. Sem endereço de usuário, saldo pessoal, build, credentials ou wallet provider. Limites de requests e timeout explícitos; falhas sem retries automáticos.
3. **DEP03, procedência.** Relacionar chainId/address/block/code a fonte e data. Ausência de code, rede incorreta, fork/stale block, falha parcial e artefato incompatível produzem estado bloqueado/desconhecido. Não retornar SemanticDeployment qualificado com artifact antigo apenas porque selector existe.
4. **DEP04, ABI/source.** Confirmar source verificado completo v1.0.10 e compiler/settings/libraries/constructor/immutables; obter ABI integral, provar reprodução do runtime ou vínculo verificado equivalente. ABI faltante ou mismatch impede decoder e aprovação de selector. Este requisito é dependência externa ainda não resolvida.
5. **DEP05, graph/proxy.** Após DEP04, ler graph router→approve proxy→transferFrom spender e permissões sob o mesmo bloco. Identificar mecanismo de proxy/implementation/admin/beacon somente com evidência. RPC storage adicional exige ampliar a allowlist local de métodos em SPEC própria e revisão.
6. **DEP06, estado honesto.** Expor separadamente documentado, artifact obtido, código observado, deployment qualificado, decoder implementado, integração exercitada real e financeiro. A fatia pode alcançar apenas os primeiros três; não remove holds de G11.

Aceitação independente mínima: zero requests para rede fora do catálogo; ausência de wallet/credentials irrelevante para leitura pública; nenhuma ação financeira possível; bloco/chain/address/codehash rastreáveis; fonte mismatch e code ausente mantêm bloqueio; fixture nunca promove exercisedReal; artifact ABI incompleta é rejeitado; estados parciais não são convertidos em validade de deployment. A verificação real da fatia deve observar contratos públicos em RPC autorizado e guardar recibo sanitizado. Este relatório não realizou essa verificação.

## Dependência precisa para decoder integral e alternativas

Falta um pacote por deployment atual com ABI **completa**, source e metadata v1.0.10, runtime fixado em bloco, relação de proxy/implementation e graph de approvals. Depois, cada selector autorizado exige interpretar todas as palavras compactadas, batches/hops/DAG, adapters extraData, pools, native wrap/unwrap, spender, receiver/refund, amounts/minReturn/deadline e trailers comissão/trim/RFQ; campos desconhecidos bloqueiam. Nenhuma igualdade de reencoding substitui a interpretação dos efeitos internos.

Alternativa A, recomendada para trabalho imediato: leitor DEP01–DEP03/DEP06. Produz evidência real útil sem exigir swap ou gesto de wallet, mas preserva a dependência DEP04–DEP05. Alternativa B: parser offline estrito da versão v1.0.7 apenas como ferramenta de pesquisa; não qualifica os routers atuais e tem menor prioridade. Alternativa C: obter e verificar source/ABI dos deployments v1.0.10 por explorer oficial ou publicação verificável do OKX antes do adapter semântico. Isso resolve a dependência de maior impacto; não pede ao Jev que invente source, licença ou acesso. A escolha técnica pode ser delegada no escopo vigente, mas o resultado do Jev não concede autorização.

## Registro de artefatos públicos e integridade

SHA-256 sobre bytes brutos recebidos por GET, sem autenticação. Acesso 2026-10-11. Para arquivos EVM, base raw é `https://raw.githubusercontent.com/okxlabs/Web3-DEX-Router-EVM-V1/1fc1508df3caeb18a8179dfc0ea4e956099ab481/`; para registry, base raw é `https://raw.githubusercontent.com/okxlabs/clear-signing-erc7730-registry/3d60345850337de3507c172db8d25b25052e6966/registry/okx/`. Hash de HTML dinâmico registra a resposta daquela coleta e não atesta estabilidade futura.

| Artifact relativo / URL | Bytes | SHA-256 |
|---|---:|---|
| DEPLOYMENT.md | 7695 | EB0958EBBE04D555459EAE26012CBDA3E4FB99F9A385203B4F7042D36ADC0FC8 |
| history-deployment-address.md | 19922 | 2BDB982295D6B36ABC85C4F8D31D2020D0FD7EBB2B9853703EF918AB13A0A5C6 |
| DexRouterabi/DexRouter.json | 298124 | 96BFCC579BE3A8F82D4A8ED0EB81DB6DADA46F23F07A08334ADB2F064ADAAD55 |
| DexRouterabi/TokenApproveProxy.json | 44113 | 350B6DBE1F7B7E68C5C20447279E587D43CEAF795A484C4DA83F2D8DE2EDC540 |
| contracts/8/DexRouter.sol | 38043 | 2F7CA3B6A87CB87E1C0FE617C320DEC62B0133321E00C52A52647E45872BA470 |
| contracts/8/TokenApprove.sol | 2898 | 2F101EE120974591034D93E0D27C3100E94AB707CE77F0D59F4D06B3ED749412 |
| contracts/8/TokenApproveProxy.sol | 4557 | CBD0CDB7F0FA3274E57FF8FF3C84743380FDCC112D8AD2A6E895520FFCCBC84E |
| contracts/8/libraries/CommissionLib.sol | 42072 | 2BB2A79BE7A3C01C717B9A38B51999E3D87F791AC419BA5AE97004E0088B2F2F |
| contracts/8/UnxswapRouter.sol | 19898 | 86AE408A93E5564D3C75F2DF5BD21B2DF6A0949134B6E04DAB750310F35194C5 |
| contracts/8/UnxswapV3Router.sol | 17045 | A08A07473FF992E41AF2741993C8546C851BBB78472826BACFE0918CDE43908D |
| contracts/8/adapter/UniV3Adapter.sol | 4728 | 0F6D3167ED1B5CC0B771210CFAD3FC9AAB0297A450A15C5BAE94B2CED5EF6649 |
| contracts/8/libraries/PMMLib.sol | 1120 | 8E05F3F78B9144741BEC2D9678D33B659A8D73C53604EF881D76ABA900CF51BB |
| contracts/8/libraries/CommonUtils.sol | 5359 | ED136FEC5149C7DBC2A9EB34EC55020F42BD2BD6AD7C7712137B56342D3EE40E |
| contracts/8/DagRouter.sol | 7505 | CFC364E6CA862540D181F8C55EAF23A9FD3C1CF8B0ECCBA4BC81EED56E0B88C5 |
| calldata-OkxDexRouterV1.0.7-multi-commission.json | 17389 | 0620806D6BBF78A0ADB63F41BA7A9F0DFCA5E9286B7ABFF346A8395B38D2CE51 |
| calldata-OkxDexRouterV1.0.8-suffix-compat.json | 17383 | CF12019B2694DBE97192450B1C14542A1C23608685E5A84DFAF4F38FE8D3E678 |
| calldata-OkxDexRouterV1.0.10-rfq-anti-arbitrage.json | 14159 | 72F9F183B7DD3FEA7D6713D93DF1806F3F907970D0A5B0FF641FDE9A576C7C21 |
| dex-smart-contract HTML, 20:43:45 UTC | 64729 | 16D7F56EA7CE4A4E5550B6DCC0076492F9F58739C2F604D62168316B57604CA0 |
| smart-contract-safety HTML, 20:43:45 UTC | 58046 | CF06F5010B7953455570BE5E9092D0C11BAA85EC2107C7BD3E942113C929F1C9 |
| MonadScan router HTML, 20:44:14 UTC | 630973 | CC2268FE3F8A8BE609ECBFA379EDEADBD6DB7ACD2D1EE064130AB66119187F9D |
| OKX X Layer router HTML, 20:44:15 UTC | 44697 | 7B2511777EE53AD944EC9FDE42B47A32C7F09899C6D1081AF7BE764A418447D6 |

Arquivos EVM foram recebidos entre 20:39:17–20:39:21 UTC; CommonUtils/DagRouter e registro entre 20:43:04–20:43:45 UTC. Artefatos foram processados em memória; nenhum source externo ou estado privado foi copiado para o repositório. Escrita exclusiva: este relatório. Uma extração PowerShell de ranges inicialmente falhou com `Argument types do not match`; leituras posteriores por Select-String/JSON tiveram sucesso, sem alteração do repositório. Searches irrelevantes e fontes secundárias não foram usadas para fundamentar conclusões.

## Limitação exata sobre compilação e comparação

A incompatibilidade demonstrada é entre o conteúdo da ABI artifact publicada e funções no source do mesmo commit. Não foi demonstrada incompatibilidade de bytecode entre o source v1.0.7 e os deployments atuais: nenhuma compilação/reprodução ou comparação de runtime foi executada nesta pesquisa. O repositório e metadata fornecem material para uma tentativa local de compilar o source antigo e gerar sua ABI completa. Isso não estabelece que esse source, compiler/settings, dependências, bibliotecas, constructor e immutables reproduzam o router v1.0.10 anunciado no registro. O artifact possui bytecode/sourceMap/linkReferences, mas não publicou neste objeto um mapa immutableReferences. A ABI gerada do source antigo deve ser chamada ABI daquele source até que o vínculo de deployment seja provado. Mudança de rótulo de versão é indício de escopo distinto, não prova criptográfica de runtime diferente. É possível especificar uma comparação reproduzível futura; não é legítimo afirmar impossibilidade de correspondência nem correspondência verificada agora.

O encerramento excedeu a janela aproximada de dez minutos para salvar e corrigir o nome exato do histórico e esta distinção solicitada pelo integrador. Não houve ampliação para implementação ou fontes autenticadas.
