# Parecer independente — pesquisa documental posterior à R8

Data: 2026-10-11. Revisor: /root/candidate_review. Conversa principal: 01a12b5f-ca2a-7ff1-a131-07933705d3e8; identidade própria previamente observada: CODEX_THREAD_ID 01a12c1f-4fd5-7a61-93e6-15def4a2ea29.

## Decisão e alcance

Aprovo o recorte documental delimitado: os 81 arquivos congelados do manifesto abaixo, acrescidos exclusivamente da correção editorial de G11-METADATA-CONCLUSION.md identificada neste parecer. Nenhum novo P1/P2 comprovado. A observação editorial RD1 está corrigida no delta verificado; não há achado documental material aberto neste recorte.

Esta aprovação confirma a coerência das novas conclusões com os bytes e recibos disponíveis, a aritmética dos contrastes e a preservação explícita das limitações. Não certifica novamente o código, a execução das consultas externas, todos os fatos históricos do upstream, acessibilidade completa, ABI/decoder de produção, integração autenticada ou cumprimento integral de G01–G17. G17 e o objetivo integral permanecem não aprovados.

O revisor não implementou os arquivos examinados. Não foram repetidas suítes, feitas consultas de rede, utilizadas chaves/env, carteira, UI, API Jev, assinatura/transmissão ou operações Git. Apenas este relatório foi escrito. A revisão usou cópias isoladas e um contrato de somente leitura; não houve sandbox de leitura imposto pelo SO. A configuração de papel não comprova modelo/tier efetivos. O Node efetivamente observado nos cálculos desta revisão foi v26.9.0, distinto do runtime histórico registrado em VERIFICACAO.md.

## Identidade dos insumos e integridade

Cópia documental: C:/Users/gabri/.codex/tmp/okx-real-research-docreview-01a12b5f.

| Insumo | SHA-256 |
| --- | --- |
| DOC-REVIEW-MANIFEST.json, 81 arquivos | c90ada14c2adf7a63fcce378cff992f1396800fa417ea11b0579bec546e4d5c4 |
| INSTRUCAO-DO-OBJETIVO.md | cfa90cac735e9a838a0c4bc593276c83757905e7c5fedcd2414e499b1dad9e08 |
| EXECUTION-SPEC.md | eeb6ab8d9e4adf990600a8806bceaeb7774a5eefe1ae3bbe7daba70e590290ef |
| Candidata r8c / REVIEW-MANIFEST.json, 662 arquivos | 0bf5458a1446a06dc6843e192682411ba6e058cbe7c0156aa7f802bf7fd867c0 |
| Digest canônico dos 447 arquivos de produto | 5c0949bc33e20ac9ccad02697e7ef4623ecac22a990e281c76fd7d9dea41f323 |
| Parecer independente anterior / REVIEW-R8.md | 85340b26dce722d56bb292caea6be8a3ff480f113da2b8ee1d708d9a7599b75c |
| Delta editorial G11-METADATA-CONCLUSION.md | 98945ef2773b3f6951846549ffa55c947df23adad40f8a952e4a5a8ed354ffff |

Os 81 arquivos conferiram antes e depois das leituras, sem divergências. A conferência final da candidata r8c verificou também todos os seus 662 arquivos, sem divergências; os dois manifestos conservaram seus hashes. Registro final de integridade: 2026-10-11T21:14:54.7037710Z.

Os 447 arquivos de produto catalogados foram comparados individualmente, tanto em r8c quanto na worktree executora C:/Users/gabri/.codex/worktrees/okx-real-integration/jev-trader: zero divergências. O digest foi recalculado com os registros path/sha256 ordenados por path, JSON UTF-8 com chaves ordenadas e separadores compactos, excluindo docs/. HEAD de referência: 055a637f27f28cbf357cfb492534f7ed33d9b68f. Essa conferência cobre os arquivos catalogados, não autoriza alterações nem amplia a aprovação do produto anterior.

O delta está isolado em C:/Users/gabri/.codex/tmp/okx-real-research-editorial-delta-01a12b5f/G11-METADATA-CONCLUSION.md. Comparação literal mostrou uma ocorrência da frase substituída e nenhuma outra mudança. Seu hash também coincide com o arquivo atual correspondente da worktree. Futuras referências de status, links ou consolidações posteriores a este parecer não foram revisadas.

## Achado documental e correção

RD1 — P3, precisão editorial; corrigido no delta. Em G11-METADATA-CONCLUSION.md:14, a versão congelada dizia “zero bytes observados”. G11-IPFS-RETRIEVAL.json registra bytes:null, HTTP desconhecido e ausência de corpo recuperado. Isso não mede zero tráfego nem zero bytes recebidos.

Reprodução: ler os dois rows do recibo IPFS e comparar a linha 14. A correção troca exclusivamente “Ambos expiraram com HTTP desconhecido, zero bytes observados e erro literal The operation timed out.” por “Ambos expiraram com HTTP desconhecido, nenhum corpo recuperado e erro literal The operation timed out.”. O SHA anterior é f938c5c0cd145b74629f92e14a09c17c93cdbac2a4bc71bf5075a4cee8867dcd; o delta aprovado tem o SHA indicado na tabela. Essa precisão não muda a conclusão técnica: nenhum bloco/metadata/ABI/source foi recuperado pelas tentativas documentadas.

Nenhum novo defeito de produto foi investigado ou alegado nesta revisão limitada. As dependências técnicas e de acesso já declaradas não são convertidas em novos bugs documentais.

## Verificações independentes das novas afirmações

**Runtimes e metadados.** Foram lidos offline os dois .hex arquivados, rejeitada representação inválida e recalculados byte count, SHA-256 dos arquivos e dos bytes, keccak, trailer CBOR e CIDv0. Resultados:

| Rede | Bytes | Keccak do runtime |
| --- | ---: | --- |
| X Layer / 196 | 13.322 | 0x7766cf8785ca58e8da2204bf28f5b5cb2da420e1dbad4f5b88828a7c768da885 |
| Monad / 143 | 13.322 | 0x71569b9436ca69d0e1062b15bcd025ac291f9f059172ea6bb6480d1f6e3e3148 |

Cada resultado coincide com G11-PUBLIC-ROUTER-READ.json e G11-PUBLIC-METADATA-READ.json. Ambos os trailers têm 51 bytes CBOR, multihash com prefixo 1220 e campo solc 000811, que declara 0.8.17. A decodificação local recuperou exatamente QmaMFkyRVcsTKzLjb825J2L1i7YVXW6uwf3G5T51nmWEcB e QmRSQr7vAMQJBLL6JS6zBayPgejyvUc8f3Lg5BrEo8KtU4. Esse campo não identifica sozinho o build exato do compiler, settings, bibliotecas ou ABI.

G11-METADATA-CONCLUSION.md:5–7 distingue o primeiro probe, com conferências de chainId/bloco, da segunda leitura no mesmo número de bloco e comparação de keccak. A segunda leitura não é promovida a uma nova comprovação independente do hash daquele bloco. Os endereços são candidatos documentados e não uma allowlist qualificada do produto.

**Recuperação externa relatada.** Os scripts de pesquisa foram inspecionados, sem execução. Os recibos IPFS registram uma tentativa da aplicação por CID, sem retry explícito, timeout de 15 segundos e erro literal “The operation timed out.”; HTTP, bytes e hash permanecem desconhecidos/null. Isso não prova ausência global ou falta de publicação. Os dois corpos Sourcify preservados têm 126 bytes; SHA-256, chain/address e os campos match/creationMatch/runtimeMatch null conferem exatamente com G11-SOURCIFY-LOOKUP.json. HTTP404 é o resultado das duas consultas observadas, não uma busca exaustiva por source.

G11-SOURCE-RESEARCH.md e G11-METADATA-CONCLUSION.md:18–20 preservam a diferença entre source/artifact histórico, registro atual de deployments e runtime observado. Não demonstram correspondência nem incompatibilidade do source v1.0.7 com o runtime atual; não usam nomes de funções, selectors ou formatos ERC-7730 como prova de interpretação integral. O pacote exato source/metadata/ABI, reprodução do build, vínculo ao runtime e graph de spender/proxy, decoder completo de adapters/packed paths/pools/fees/trailers e simulação continuam dependências técnicas explícitas. Credenciais por si só não encerram G11.

**Contraste.** Os hashes de globals.css e RealPipeline.module.css conferem com a fonte r8c. Os tokens e usos declarados foram conferidos na fonte. Recalculei todas as 13 razões com linearização sRGB, luminância relativa e (Lmaisclaro + 0,05)/(Lmaisescuro + 0,05). Todos passam nos limites documentados de 4,5:1 para texto e 3:1 para foco/informação visual necessária. Razão mínima: 7,158626317689399:1; diferença máxima dos números publicados: 8,881784197001252e-16, somente precisão numérica.

CONTRAST-SOURCE-R8.md:3–9 limita a conclusão aos pares de fonte examinados. Identifica corretamente 44×44 CSS px como SC 2.5.5 AAA na WCAG 2.1, preservando o requisito próprio do projeto. Não certifica AA completo, controles nativos, todas as combinações computadas/herdadas, leitor de tela, zoom 200%, toque físico ou reduced motion alterada em runtime. MATRIZ-G01-G17.md:21 mantém G14 parcial e separa teclado relatado pelo integrador de reprodução independente.

**Conclusões e auditoria.** MATRIZ-G01-G17.md:16–24, CHECKPOINT.md, VERIFICACAO.md e AUDIT-R8.json são coerentes com essas fronteiras. AUDIT registra financialExecutionEnabled=false, walletGestureExercised=false, authenticatedWeb3Exercised=false, appJevExercised=false e qualificationCompleteG01G17=false; publicContractResearch mantém abiQualified/decoderQualified/globalAbsenceProven=false; limitedContrastAudit mantém fullG14Complete=false. A aprovação histórica R1–R6 referencia a fonte e o parecer R8 corretos; não é usada para aprovar os documentos novos automaticamente ou G17 integral.

A consulta Jev cddddcd1-2e77-4e52-8982-3fed3fd54726 recomendou independent_doc_review. O recibo permanece consultivo, sem concessão de autorização ou resposta humana; custo desconhecido fica null. Não fiz consulta Jev nesta revisão. Advisories de hooks não substituíram hashes, cálculos ou julgamento independente.

## Cobertura da aceitação congelada

| Critério | Conclusão desta revisão documental |
| --- | --- |
| G01 | Baseline/escopo/identidade documentados; critérios imutáveis conferem. |
| G02 | Provas históricas de inicialização/shutdown/retomada conservadas; não reexecutadas nesta revisão. |
| G03–G04 | Contexto de credenciais, carteira, identidade/rede e gesto/consentimento reais continuam pendentes. |
| G05–G07 | Evidência pública/local não é promovida a Web3 autenticado nem núcleo completo real; unidades/proveniência/frescor continuam com os limites R8. |
| G08 | Quote e build autenticados reais continuam pendentes. |
| G09 | Plugin consultivo Jev não satisfaz consumo autorizado/correlação do aplicativo. |
| G10 | Dez ciclos de núcleo novo por ao menos duas TTLs permanecem sem comprovação; hold sem núcleo não conta. |
| G11 | Runtime/CBOR/CIDs observados e recibos coerentes; deployment/ABI/decoder completo/simulação não qualificados. |
| G12–G13 | Capacidades reais e fluxos de provider/carteira permanecem condicionados às dependências declaradas. |
| G14 | Treze pares calculados aprovados; acessibilidade integral continua parcial. |
| G15–G16 | Aprovação e suítes históricas de proteção/local mantidas no alcance anterior; não repetidas nem convertidas em prova externa. |
| G17 | Documentação nova aceita neste recorte; revisão R1–R6 local preservada; G17 e objetivo integral não aprovados enquanto faltarem provas obrigatórias. |

## Limitações e próximo requisito elegível

Os corpos JSON-RPC integrais não estão arquivados na cópia; há recibos/hashes e os runtimes .hex. A revisão verificou a consistência offline desses artefatos, sem reproduzir rede/endpoint/chainId/bloco. Bytes históricos integrais do upstream referenciado por URL/commit também não integram o pacote de 81 arquivos; contagens de ABI/source, compilação e formatos upstream são pesquisa atribuída, não recontagem ou recompilação independente feita aqui. Nenhuma identidade/proveniência externa adicional foi inferida.

As suítes e capturas servidas são evidência histórica atribuída, inclusive a colisão de portas 3010/3011 descartada e o primeiro timeout Edge preservado; esta revisão não inventa suas causas. Uma tentativa de formatação de linhas no helper de leitura do próprio revisor retornou erro PowerShell “Error formatting a string: Index (zero based) must be greater than or equal to zero and less than the size of the argument list.”; foi corrigida na leitura seguinte, sem alteração dos insumos. Os cálculos offline de runtime/contraste e as conferências de integridade terminaram exit0.

O próximo requisito técnico para G11 é obter e vincular o pacote exato ao deployment efetivamente devolvido por um build real, antes de habilitar um adapter semântico de produção. Contexto wallet/Web3 real e consumo autorizado Jev do aplicativo permanecem dependências separadas. Este parecer não inicia essas ações, não aprova efeitos externos e não reduz nenhum G01–G17.
