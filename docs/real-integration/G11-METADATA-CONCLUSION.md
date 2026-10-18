# Pesquisa pública adicional de G11

Esta pesquisa do integrador complementa G11-SOURCE-RESEARCH.md; não é prova de qualificação de deployment, ABI, decoder ou execução. O código do produto permanece na fonte r8c, digest 5c0949bc33e20ac9ccad02697e7ef4623ecac22a990e281c76fd7d9dea41f323. Meta G01–G17 pendente; execução financeira OFF.

G11-PUBLIC-ROUTER-READ.json registra consultas reais, sem credenciais nem endereço de usuário, nos RPCs públicos de X Layer e Monad. Em cada rede o integrador conferiu chainId, fixou bloco, leu código e conferiu novamente hash de bloco/chainId. Ambos retornaram 13.322 bytes. Addresses são candidatos documentados, não allowlist do produto: futuras respostas da API podem apontar outros deployments. Os dois hashes de runtime observados são distintos e estão nos recibos.

G11-PUBLIC-METADATA-READ.json registra uma nova leitura no mesmo número de bloco, conferindo exatamente o keccak anterior e arquivando o código em router-runtime-196.hex e router-runtime-143.hex. O trailer de ambos tem CBOR de 51 bytes e versão solc 0.8.17 (000811). Uma leitura limitada de map/text/bytes recuperou o multihash sha2-256 e sua representação CIDv0:

- X Layer: QmaMFkyRVcsTKzLjb825J2L1i7YVXW6uwf3G5T51nmWEcB.
- Monad: QmRSQr7vAMQJBLL6JS6zBayPgejyvUc8f3Lg5BrEo8KtU4.

O formato segue a [documentação primária de metadata Solidity](https://docs.soliditylang.org/en/v0.8.20/metadata.html). Um CID no bytecode não comprova que seu conteúdo esteja publicado ou acessível; o hash IPFS não é simplesmente o SHA-256 do arquivo JSON.

G11-IPFS-RETRIEVAL.json registra exatamente um GET por CID em ipfs.io, com Accept application/vnd.ipld.raw, format=raw, timeout de 15 segundos e sem retry. A intenção era verificar bytes do bloco contra o multihash antes de interpretar metadata, conforme a [referência primária IPFS Gateway](https://docs.ipfs.tech/reference/http/gateway/#trustless-verifiable-retrieval). Ambos expiraram com HTTP desconhecido, nenhum corpo recuperado e erro literal The operation timed out. Não houve bloco, metadata, ABI ou source recuperados. Timeout não demonstra ausência global nem falta de publicação.

G11-SOURCIFY-LOOKUP.json registra um GET público por deployment, fields=all, sem envio de source e sem retry. Os dois retornaram HTTP404; os bodies preservados em router-sourcify-196.json e router-sourcify-143.json têm match, creationMatch e runtimeMatch null e identidade de rede/endereço correta. Isso limita a afirmação à consulta observada. O endpoint é descrito na [documentação primária Sourcify APIv2](https://docs.sourcify.dev/blog/apiv2-lookup-endpoints/).

Não foi demonstrada uma incompatibilidade entre source v1.0.7 e runtime atual. Também não foi demonstrada correspondência. A ABI incompleta do artifact histórico não pode qualificar os deployments atuais; nem formatos ERC-7730 que ocultam componentes internos comprovam interpretação integral de calldata. Nenhum decoder foi habilitado por selector ou nome de função.

Dependência técnica: recuperar um pacote de source/metadata/ABI completa, reproduzir compiler/settings/dependências e comprovar vínculo ao runtime e graph de spender/proxy do deployment efetivamente retornado pelo build real. Depois implementar interpretação integral de adapters, palavras compactadas, paths, pools, fees e trailers, com testes de adulteração. O contexto de carteira e quote/build autenticados permanece outra dependência. Credenciais sozinhas não encerram G11.

Proveniência da decisão de pesquisa em G11-METADATA-RESEARCH-DECISION.json: Jev consultivo, approved_by=jev_delegated, human_response=false, custo desconhecido null. G11-PROBE-STRATEGY-ABSTENTION.json conserva a abstenção anterior sobre estratégia de implementação; a etapa dependente não foi executada. Os quatro scripts reproduzíveis estão em research/, com paths do ambiente observado. Sua execução externa é somente leitura pública e não altera o código do produto.
