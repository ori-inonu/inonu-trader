# Parecer independente — candidato r8c

Data: 2026-10-11. Revisor: /root/candidate_review. Conversa nativa do revisor: 01a12c1f-4fd5-7a61-93e6-15def4a2ea29; sessão raiz: 01a12b5f-ca2a-7ff1-a131-07933705d3e8.

**Decisão: correções locais R1–R6 aprovadas no recorte examinado. Nenhum novo achado P1/P2 comprovado nesse recorte. G17 integral e a meta G01–G17 não aprovados.** A fonte r8c resolve R6 e mantém as correções anteriores. Credenciais/acesso Web3, gesto/consentimento real da carteira, inferência autorizada do aplicativo, ciclos completos reais e qualificação semântica da proposta ainda faltam. Testes offline, leitura pública v5 e aprovação local não encerram esses critérios.

## Contrato e integridade

O revisor não implementou nenhuma fonte do candidato. A revisão de código ocorreu exclusivamente na cópia isolada C:/Users/gabri/.codex/tmp/okx-real-review-r8c-01a12b5f. Não houve alteração do candidato, aceites, original, worktree de integração ou dependências. A separação é por cópia e contrato somente leitura; não há sandbox somente leitura imposto pelo SO. Sol/xhigh foi configuração recebida, sem certificação independente do modelo/tier efetivo.

Reproduções, snapshots documentais e resultados privados estão em C:/Users/gabri/.codex/tmp/okx-real-review-r8-repro-01a12b5f. O primeiro delta documental fornecido pelo integrador foi copiado para documentary-delta nesse scratch após conferir seus hashes. A consolidação foi depois revisada nas cópias isoladas okx-real-docreview-r8-01a12b5f (57 arquivos) e okx-real-docreview-r8b-01a12b5f (58 arquivos). Fontes e documentação final são identificadas separadamente: os 662 arquivos do manifesto conservam os documentos históricos presentes no congelamento, enquanto a consolidação final possui hashes próprios. Não se apresenta o manifesto r8c como hash das revisões documentais posteriores.

Nenhum arquivo de ambiente, segredo, request externo, credencial real, conexão/gesto real de wallet, consulta RPC real, consumo pago, assinatura, broadcast, staging, commit, push, deploy, meta nativa ou memória de projeto foi usado/criado pelo revisor. As fixtures e callbacks de inferência usados nas reproduções são sintéticos e explicitamente identificados. As junctions de dependências fornecidas pelo integrador foram usadas somente para leitura/execução. Nenhum outro agente foi lançado nesta revisão.

Foram considerados AGENTS, codex-desktop-harness, PLAYBOOK, code-review e RTK/Headroom; os aceites, SPEC, matrizes, guia, checkpoints, inventários e pareceres anteriores foram lidos. O contexto usado é da identidade do revisor, sem importar estado de outros chats. Advice Jev não substitui evidência, autorização ou gates determinísticos.

| Item | Identidade / SHA-256 | Conferência |
| --- | --- | --- |
| REVIEW-MANIFEST.json | 0bf5458a1446a06dc6843e192682411ba6e058cbe7c0156aa7f802bf7fd867c0 | 662 arquivos, zero divergências antes e depois |
| Fonte, 447 registros fora de docs/ | 5c0949bc33e20ac9ccad02697e7ef4623ecac22a990e281c76fd7d9dea41f323 | Digest recalculado; zero diferenças com a fonte da worktree executora |
| INSTRUCAO-DO-OBJETIVO.md | cfa90cac735e9a838a0c4bc593276c83757905e7c5fedcd2414e499b1dad9e08 | Bytes imutáveis, hash confirmado |
| EXECUTION-SPEC.md | eeb6ab8d9e4adf990600a8806bceaeb7774a5eefe1ae3bbe7daba70e590290ef | Bytes imutáveis, hash confirmado |
| HEAD declarado | 055a637f27f28cbf357cfb492534f7ed33d9b68f | Baseline declarado, não substitui a árvore congelada |
| Parecer r7 | ab5e1ca80f5ed3d47e2eb8a2c31a50e7832138212242c0bff272532c59c05684 | Histórico do defeito R6 e correções R1–R5 |
| DOC-REVIEW-MANIFEST.json r8 | d4b16b5c572af69b69b01bcbb247991b03086db32f595e7fd3e25d84cc7b7a2e | 57 arquivos documentais, zero divergências |
| DOC-REVIEW-MANIFEST.json r8b final | c3b17762b9b6e679baad767df93f28daddeed563af98095d8d235c4b549df6b3 | 58 arquivos documentais, zero divergências antes/depois; critérios e sourceDigest idênticos |

hashes-before.json preserva o resultado inicial; hashes-checkpoint.json e hashes-after.json preservam a recomputação da fonte. O sourceDigest foi calculado sobre registros path/sha256 ordenados por path, excluindo docs/, com UTF-8 de json.dumps(rows, sort_keys=True, separators=(',', ':')). O manifesto inteiro e cada arquivo também foram conferidos individualmente. A revisão não pressupõe que HEAD sozinho contém as mudanças não commitadas.

## Achados anteriores e reprodução de R6

O delta de fonte r7→r8c contém cinco arquivos alterados (runtime, seu teste, RealPipeline, RealPipelineView e teste de render) e dois novos (observation-clock e teste). A implementação dos defeitos R1–R5 permaneceu idêntica à r7 revisada, e seus checks pertinentes foram repetidos na r8c.

| ID / severidade anterior | Conclusão r8c | Local e evidência |
| --- | --- | --- |
| R1 / P1 — valuation USD sem unidade qualificada | Corrigido | src/real/core.ts:69–76 conserva decimals/USD/total desconhecidos. src/real/valuation.ts:139–192 usa strings/BigInt, decimals independentes, compatibilidade de identidade/revisão/correlação e bloco; divergência/ausência não vira zero. Checks de core/valuation/RPC passaram. |
| R2 / P1 — patrimônio privado enviado ao Jev | Corrigido | src/real/jev.ts:8 usa allowlist, sem endereço, identidade, saldo, quantidade, coverage ou agregados privados. Candidatos atuais vazios/custos desconhecidos não inventam oportunidade. Regressões passaram. |
| R3 / P2 — inferência com núcleo vazio/incompleto | Corrigido | src/real/transport-proof.ts:24 verifica recibos, unidades, correlação, fontes e completude; preços/velas vazios, faltantes ou expirados bloqueiam antes da reserva/chamada. Regressões de runtime/transport-proof passaram. |
| R4 / P2 — append produz journal impossível de reabrir | Corrigido | src/real/journal.ts:7 e :51 usam o limite comum de 20.000.000 bytes; preflight antecede write e history.push. Lock, fsync, cauda e reservas continuam duráveis. Checks passaram. |
| R5 / P2 — ready de fixture/unverified promovido a resposta real | Corrigido | web/src/components/RealPipeline/RealPipelineView.tsx:69–72 mostra descrição factual e modo da fonte. Reprodução própria preservou fixture/unverified e confirmou ausência da afirmação de transporte real. |
| R6 / P2 — publicação/render revivem dados invalidados pelo relógio | Corrigido | src/real/runtime.ts:44 oculta core e bloqueia a decisão quando fresh falha; :54 aplica isso a latest/history e :113 a tick. RealPipelineView.tsx:28–29, :79, :104–113, :160 verifica janelas e oculta valores/provas inválidos. observation-clock.ts:1–11 impede recuo do clock de consumo; RealPipeline.tsx:32–37 o usa. |

R6 foi reproduzido importando a fonte fixa, com TTL sintético de 100 ms, recuo de parede de 60 s e avanço monotônico de 1 s. tick e latest frescos tiveram core como controle positivo. Após rollback, latest e histórico tiveram core:null e decisão blocked; restaurar o relógio não ressuscitou o core. O journal histórico conservou o registro original, sem publicá-lo como observação atual. Em outro caso, um callback sintético de inferência atravessou a validade: tick, latest e histórico ocultaram core, preservando called=true e uma reserva consumida. Não houve inferência real ou request de rede.

A renderização independente adicionou apenas no testcase privado marcadores de preço, valuation, RPC, proposta e semântica. O controle fresco mostrou todos e quatro badges Pronto. Rollback bruto, clock monotônico vencido, instante exato da expiração e NaN mostraram zero badges Pronto e ocultaram todos esses marcadores; nenhum TTL de 61 s foi produzido. Fixtures e unverified continuaram explícitos. Os dois scripts Bun --no-env-file terminaram com exit 0.

| Evidência privada | SHA-256 |
| --- | --- |
| runtime-repro.ts | a0641ebed3c868f46d595449c508f6e6424a77473dcb1dd1e7dcb109d1f70021 |
| runtime-evidence.json | af930cc9988c3de8c14ac82b084c59e32eca62c19c846a002ba1babdbd245be6 |
| render-repro.ts | c7adba490e08a15c7b75a74d12159ca636819ce71bd1334fcc8d1a4efb3af590 |
| render-evidence.json | c7e16b2d59f142298a6d4bdcd57fc7268de6643d6cc40cb4843f3b0bae5fe700 |

São provas sintéticas de publicação, gates e renderização. Não certificam OKX autenticada, carteira, inferência, entitlement ou proposta real. A tolerância congelada de futuro e TTLs não foram relaxados para corrigir R6.

## Comportamentos críticos e verificações

O escopo acumulado das revisões cobriu observation-integration/rpc-read/valuation/extension-integration/extensions, public-runtime/public-market, runtime/journal/transporte, wallet-store/useOkxWallet/real-pipeline, consentimento e UI. Identidade/revisão/epoch descartam respostas atrasadas; conectar não concede a consulta adicional. O escopo web3-rpc-read-v2 exige autorização nova e revela os RPCs destinatários. O journal e a quota permanecem duráveis, sem retry pago automático. RPC é somente leitura, confere chain e bloco fixo/hash final, e rejeita divergências. Valuation conserva unknown/null, cobertura parcial e aritmética exata.

Market/Balance/DEX v6, RPC público e Exchange v5 mantêm fontes e provas distintas. A calibração pública exige HTTPS, Date coerente, RTT ≤2 s, offset ≤180 s, validade ≤60 s e estabilidade monotônica; mantém timestamps originais e não altera relógio do OS ou assinatura v6. DeFi/leaderboard GET permanecem opcionais e desligados por padrão, com qualificação por endpoint/rede; documentação não inventa entitlement. O framework semantic-proof conserva blocked sem deployment/ABI/decoder real qualificado. Build/encoding/preflight ou simulação isolada não habilitam execução financeira.

G11 tem uma pendência técnica além das credenciais: semantic-proof.ts:16 define portas de leitura/decodificação, :176 aceita portas injetadas e :264–273 retorna sempre blocked/unverified, exercisedReal=false e financiallyQualified=false. A candidata contém o framework e seam de integração; não contém um adapter de produção qualificado de deployment/ABI/decoder completo. Não há como completar G11 somente fornecendo chaves ou aprovando um gesto. A ausência é explicitamente bloqueante e já reconhecida no escopo, sem bypass inseguro; a aprovação R1–R6 não aprova essa funcionalidade como completa.

| Check | Resultado | Responsabilidade / limite |
| --- | --- | --- |
| src/real, 19 arquivos | 162 pass, 0 fail, 1308 assertions, 3,27 s | Executado independentemente na r8c; backend-tests.txt/backend-metrics.json |
| wallet-store, real-pipeline, render e observation-clock | 18 pass, 0 fail, 89 assertions, 4 arquivos, 743 ms | Executado independentemente; web-tests.txt/web-metrics.json |
| Reproduções runtime/render | Exit 0; controles frescos e inválidos conforme tabela R6 | Executadas independentemente, zero calls reais |
| Backend completo | 2101 pass, 2 skip, 0 fail, 884342 assertions, 135 arquivos, 233,08 s Bun / 234,22 s job | Integrador; recibo e stdout/stderr hash-conferidos |
| Web completo final-r8b | 581 pass, 0 fail, 4138 assertions, 43 arquivos, 7,42 s Bun / 8,18 s job | Integrador; recibo e stdout/stderr hash-conferidos |
| Types backend/web | Exit 0 | Integrador; cinco recibos finais e respectivos logs conferidos |
| Build produção | Exit 0, API incorporada 4130, 15,79 s job | Integrador; recibo e logs conferidos, não repetido pelo revisor |

evidence-hashes.json registra todos os hashes dos checks, reproduções, seis recibos (incluindo a falha preservada), treze arquivos documentais/visuais e correspondências de stdout/stderr. A fonte da worktree executora foi comparada nos 447 arquivos com a cópia fixa, sem divergências. Os recibos isolados não reconstroem a árvore histórica executada; a vinculação usa o congelamento, digest, auditoria, igualdade observada e checks independentes focados. Jobs pesados não foram repetidos em concorrência.

A primeira suíte web r8 falhou: 580 pass/1 fail, exit 1, erro exato “Timed out waiting for Edge's loopback-only DevToolsActivePort; last value: null”, em web/src/lib/flow-chart-render.test.ts:180 e chamada :470. A repetição integral sem alteração de fonte passou. É uma falha de disponibilidade do navegador observada; a causa raiz não foi demonstrada. Não se afirma que o teste deixou de ter risco de flakiness. As cópias parciais r8/r8b foram descartadas; r8c é a cópia efetivamente revisada. Os dois skips receipt-safety Market/Trader, condicionados a RECEIPT_SAFETY_SOURCE, permanecem skips e não certificam integração externa.

RTK/Headroom foi usado nos checks volumosos, sem alegação de ganho de desempenho ou custo zero. A tentativa anterior de console nas portas 3010/3011 colidiu com processos alheios e foi descartada. Não se usa seu HTTP ou captura como prova final. O campo buildApiUrl=3010 em recibos que não são build é metadata do helper; o build final registra 4130.

## Console e navegador servidos

CONSOLE-LIVE-R8.json, SHA-256 fd01d35accf21e1d7fd2854e4ece862c76cefafaa3cf961847bbc6900606a164, registra duas execuções locais reais na fonte 5c0949bc…: processos distintos, HTTP 200 de health, workers ativos, restart no mesmo journal, ambas exit 0, backend/frontend fechados e lock ausente. As duas saídas de shutdown informam resourcesClosed=true, forced=false, unexpectedExit=false. Hashes dos logs stdout/stderr de ambas foram conferidos pelo revisor. Isso demonstra bootstrap/retomada/encerramento observados, não uptime 24/7 ou serviço ainda ativo.

BROWSER-EVIDENCE-R8.json, SHA-256 f7bb3b40f307674a6fb854977f6a7b61356c7efccafc8e3762a6db4e18d3ffe6, vincula o navegador servido em 4131 ao mesmo sourceDigest e registra 1440×900, 390×844 e 360×800. scrollWidth ≤ width nos registros. Foram inspecionadas três capturas: desktop final, mobile 390 e mobile 360/proveniência; os hashes das cinco capturas foram conferidos. Imagens completas longas foram reduzidas pela ferramenta de visualização; DOM/proveniência corroboram conteúdo, mas não substituem uma auditoria integral de contraste ou alvos de toque.

O DOM distingue o núcleo sem credenciais/consentimento (saldo/custo/PnL/quote desconhecidos, hold) da leitura pública v5 real (requests HTTP 200/code 0 para instrument/funding/mark). Capturas com validade vencida ocultam valores públicos; capturas posteriores mostram observação disponível sem qualificação financeira. Funding é fração por ciclo; mark é USDT por BTC em SWAP linear, com fontes/horários preservados. Não se promove isso a saldo, capital, lucro, Web3 v6 ou simulação.

Atualização, detalhes, histórico e foco foram documentados pelo integrador; o revisor inspecionou registros/capturas, sem executar uma sessão de browser própria. O JSON registra DOM/viewports, sem sequência de eventos de teclado/interação; a documentação final atribui a sequência ao relato do integrador. Foco visível na captura não prova por si só todas as interações. Toque em hardware, reduced-motion alterado em runtime, contraste integral e wallet real estão explicitamente ausentes. A matriz conserva G14 parcial e não enfraquece esses aceites. BROWSER-CONTROL-STATUS-R8.json registra somente inspeção do catálogo (visibility/viewport e pageAssets/webmcp), sem emulação de preferência/toque exposta nem nova prova de interação. Seu recibo Jev abstido permanece consultivo, com custo faturado desconhecido; não satisfaz G09 nem concede autorização.

## Cobertura G01–G17

“Verificado localmente” não encerra os componentes reais do critério. INSTRUCAO e SPEC congeladas prevalecem sobre esta tabela, opinião consultiva, matriz ou passagem de testes.

| ID | Evidência/decisão local | Cumprimento integral e dependência |
| --- | --- | --- |
| G01 | Critérios, inventário, baseline concorrente, ownership, manifesto e fonte auditáveis; hashes antes/depois iguais. Delta documental identificado separadamente. | Baseline local recuperável. Nenhuma promoção/staging/commit inferida. Auditoria de fatos externos/autorizações continua necessária; original não foi escrito pelo revisor. |
| G02 | Console R8: backend/UI/worker servidos, leitura pública automática, dois starts, shutdown limpo e restart no mesmo journal, logs correspondentes. | Comportamento de bootstrap/retomada observado na configuração sem credenciais. Não prova continuidade prolongada nem fontes dependentes de acesso. |
| G03 | Doctor/health distinguem serviços, presença, autorização, acesso, rede e TTL; diagnóstico servido sem segredos. | Parcial: três credenciais Web3 e acesso/entitlement/respostas autorizadas não demonstrados. Chave presente no baseline não prova autorização. |
| G04 | Store compartilhada, gesto/consentimento separados, revisão, races, cleanup e destinatários RPC testados. | Pendente wallet/provider/gesto e eventos de conta/rede/desconexão reais. Solana mantém capacidade própria não observada. |
| G05 | Núcleo v6 com recibos/completude, observation/RPC separados e v5 público real. | Pendente requests Market/Balance/DEX autenticados correlacionados até a UI por família/rede. V5 e RPC não substituem v6. |
| G06 | R1 corrigido: raw units exatas, decimals independentes, coverage/USD desconhecidos e divergências rejeitadas; R6 protege publicação. | Pendente inventário real comparado à mesma carteira/rede/bloco e fontes compatíveis. |
| G07 | Gates de completude/frescor e R6 aprovados: publicação e UI fail closed, modo/proveniência explícitos; público calibra conservadoramente. | Prova local forte; núcleo real depende G05/G06/G08. Fixtures nunca satisfazem a prova real. |
| G08 | Quote/build preservam raw units, custos desconhecidos, rota, slippage e validade; nenhuma confiança por flag. | Pendente quote autenticada real com contratos/decimals/preços/custos comprovados. |
| G09 | R2/R3, ID/hold, validação determinística, privacidade, quota/reserva durável e falhas testados. | Pendente inferência real correlacionada com credencial/acesso e consumo autorizado do aplicativo. Plugin consultivo não atende G09. |
| G10 | Loop/journal/histórico/retomada reais sem núcleo, mais testes de serialização/quota/outage/TTL. | Pendente ≥10 ciclos novos completos do núcleo por ≥2 TTLs, duração/cadência/frescor e inferência autorizada G09. Hold sem núcleo não conta. |
| G11 | Gates de quote→plan/build, mutações, contexto, RPC read-only e framework semântico inspecionados/testados; execução OFF. | Pendente build real, RPC/deployment/proxy/bytecode/ABI/decoder completo, fees/reserva e simulação quando qualificada. Porta framework blocked não é adapter real qualificado. |
| G12 | Capacidades honestas por rede/endpoint, GET opcionais default OFF, funding v5 público separado. | Condicionais de DeFi/sinais/leaderboard não comprovados em fonte real; documentação não demonstra entitlement. Estados indisponíveis não encerram núcleo obrigatório. |
| G13 | UI servida mostra configuração/dependências, hold/histórico, fontes, atualização e valores desconhecidos; R5/R6 aprovados. | Parcial: conexão, recusa, reconexão e consulta consentida real pendentes. Render/HTML/DOM não bastam para esses fluxos. |
| G14 | Viewports e conteúdo longo sem overflow global nos registros; captura com foco, layout inspecionado e CSS/regressões preservados. | Parcial: toque físico, reduced-motion em runtime, contraste integral e interação completa não demonstrados independentemente. |
| G15 | Suítes finais e recorte local preservam gates, permissões, limites, ledger, idempotência, kill switch, recuperação e hold; execução financeira OFF. | Aceitável localmente no recorte. Nenhum trade/assinatura/broadcast realizado; projeção/delta não viram PnL realizado. |
| G16 | Checks backend/web/types/build atuais, hashes/argv/logs, testes próprios e prova servida vinculados à fonte final. Falhas/skips preservados. | Checks locais aprovados. Não certificam integrações reais ausentes ou estabilidade universal do navegador. |
| G17 | Revisão independente sobre r8c fixa; R1–R6 fechados; guia/matriz/checkpoint/auditoria examinados. | **Não aprovado integralmente:** há critérios obrigatórios externos pendentes. Aprovação das correções locais não conclui a meta. |

## Documentação, limites e encaminhamento

A matriz, guia, verificação, checkpoint e auditoria finais mantêm fonte, configuração, proveniência, desconhecidos, consumo autorizado e dependências. GUIA-LOCAL diferencia desenvolvimento de produção/API incorporada em build, portas livres, carregamento privado explícito, destinatários da consulta, persistência da quota e encerramento observado. O revisor não carregou esse arquivo privado nem acionou consumo.

A lista resumida de R1–R5 no primeiro VERIFICACAO.md final não correspondia a todos os IDs dos pareceres anteriores; a divergência foi comunicada e corrigida na cópia documental r8b. A atribuição de teclado também foi corrigida para relato do integrador, sem reprodução independente ou aprovação integral de G14. Nenhum novo P1/P2 de código foi encontrado por essas diferenças editoriais. O delta r8→r8b altera somente VERIFICACAO.md, MATRIZ-G01-G17.md e CHECKPOINT.md e acrescenta BROWSER-CONTROL-STATUS-R8.json. CHECKPOINT registra revision 18 como observação do integrador anterior à consolidação; não é contexto importado pelo revisor.

| Documento final r8b | SHA-256 |
| --- | --- |
| VERIFICACAO.md | 6ff9f26b69e39f403b1be9a4c5f364bf79aa7314b8bbd818acc00f3bb615fd35 |
| MATRIZ-G01-G17.md | 6875da22c3805f8f25dd317e6a40dda488fe6edee63e7fb3a85f3aba655c20e0 |
| CHECKPOINT.md | dd10b45ea06d6cc987fafa6716327ad63d29a62dd0f69e8f8fca911700e284dd |
| BROWSER-CONTROL-STATUS-R8.json | 834ca5311da5adf84413fd1476d7951564c29a978646ef627a8f24afc9e0f7bb |
| AUDIT-R8.json | c44fc5f21801a96b1c4cfbe8c60d0680a9f05a1feccb6ae601e6bc9505500a3c |
| VERIFICACAO.json | ca3fc3aff4a907061af332eca488d538630ea8a13c4df42361cef8d3d329990a |
| GUIA-LOCAL.md | c0e7fc7788ec5f862c9ea5a03d6a95c4835ebd59ce4f6e2be82a3e89ccea2244 |

doc-hashes-before.json e doc-hashes-after.json registram a verificação completa das duas cópias documentais e o delta exato. Os hashes do primeiro snapshot estão em evidence-hashes.json. Uma atualização posterior de docs para referenciar este parecer deve possuir seus próprios hashes, sem reutilizar os anteriores nem atribuir a ela esta revisão de bytes.

O parecer é limitado ao escopo e evidências declarados. Não faz auditoria completa de todas as 53 mudanças preexistentes, fuzzing exaustivo, prova de segurança universal, aceitação de extensão real, performance pareada, orçamento factual ou capacidade live desconhecida. A fonte final não foi implementada pelo revisor; os testcases próprios são artefatos de verificação fora da candidata.

Próxima dependência prioritária: configurar privadamente credenciais Web3 destinadas à aplicação e exercitar provider/gesto/consentimento de consulta da OKX Wallet. Depois qualificar Market/Balance/DEX/RPC por família/rede; inferência do aplicativo apenas com acesso e consumo autorizados, ciclos G10 e build/semântica/simulação reais. Esse encaminhamento não concede gasto, consentimento, assinatura, broadcast ou alteração dos critérios. A meta deve conservar as dependências abertas.
