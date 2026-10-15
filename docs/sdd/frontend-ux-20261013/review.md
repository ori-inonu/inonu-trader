# Revisão independente do plano frontend/UX

Parecer final: **A1-A7 atendidos no escopo documental de análise, especificação e plano do candidato v2**. Os três achados iniciais foram resolvidos no delta. Não há achado documental pendente que impeça esta entrega. Este parecer não fecha gates de implementação, não certifica o produto nem comprova as quatro alegações operacionais do demo.

## Identidade, independência e isolamento

Revisor distinto: `/root/frontend_plan_review`. Identidade observada da própria execução: `CODEX_THREAD_ID=01a13629-826a-7ed1-b186-e676ffde965f`, `CODEX_SESSION_ID=01a135ff-9686-7e92-b4cb-b23db7525fac`. Não sou autor do candidato nem da implementação analisada. O papel foi solicitado como GPT-6.1 Sol/xhigh; não obtive evidência independente do modelo, esforço ou tier efetivamente usado pelo runtime. O contexto da minha conversa no harness estava na revisão 0, research/idle, sem objetivo iniciado. Não importei outra conversa nem alterei o estado do coordenador.

Revisei inicialmente a cópia `C:/Users/gabri/.codex/tmp/ui-audit-01a135ff/review-input/{plan,source}` e, na passagem final, somente o delta da cópia congelada `C:/Users/gabri/.codex/tmp/ui-audit-01a135ff/review-input-v2/{plan,source}` e seus manifestos. Há isolamento por cópia fornecida pelo coordenador. O runtime tem acesso de escrita amplo; não alego sandbox ou ACL read-only efetivos. Não escrevi nos inputs. Este `review.md`, fora do repositório, é a única saída escrita pelo revisor.

Li codex-desktop-harness/SKILL.md, code-review/SKILL.md e o playbook SDD. Li os AGENTS da fonte isolada e carteira-evidencia/tasks.md antes dos demais contratos canônicos da carteira. A fonte não contém .env, dependências, backend executável ou histórico Git. O baseline HEAD declarado é `00a593bcabe25dbb6d83795268533551098f645b`, com árvore dirty concorrente. A revisão usa os bytes fornecidos, não presume equivalência entre HEAD, worktree, servidor local e deploy público.

## Achados iniciais e fechamento no v2

| Achado | Severidade e problema concreto no v1 | Correção verificada no v2 | Estado |
|---|---|---|---|
| F-R01 | P2: requirements:19/design:11/tasks:70 resumiam G1 a uma altura em 1600; a fonte grafico-jev/SPEC.md:49 exige área útil >=900x420 em 1600x900 e >=680x320 em 1280x720. G9 <=120px versus config-onchain-smartmoney/SPEC.md:54, DOC-2 inicial 26%, mínimo 190px e máximo 55%, não estava no gate central. | requirements.md:19, design.md:11 e :95, tasks.md:32 e :72, audit.md:52-53 agora preservam ambos os tamanhos/viewports e tornam G9/DOC-2 conflito explícito a reconciliar em T00. DOC-3/AC-DOC-2 e 12 linhas também permanecem expostos, sem exceção silenciosa. | Resolvido documentalmente; o conflito de produto permanece gate. |
| F-R02 | P2: frontend-research.md:45 é observação histórica; design.md:71 ainda exigia novo controle de seleção onchain. Na fonte nova, OnchainBody.tsx:170-179 já tem foco, Enter/Space, preventDefault e guard locked. | audit.md:28, design.md:71, tasks.md:48 e frontend-revalidation.md distinguem correção existente de regressão futura. R08 foi preservado; nova estrutura só se verificação semântica/AT revelar lacuna. O atalho ancestral CEX ainda é objeto de T02. | Resolvido. Interação runtime não foi certificada. |
| F-R03 | Dependência de revisão: 14 adições em source-revalidation.json:183 estavam fora do input v1; não era possível revisar seus contratos/ownership. | A fonte v2 acrescenta as 14 entradas documentais e web/AGENTS.md, com manifesto complementar. Comparação independente entre manifestos confirmou 15 adições, zero alteração nos 1537 bytes/entradas originais e nenhuma remoção. Li as SPECs Mesa/Inteligência, suas reservas e o relatório Quant, confrontando os contratos críticos com docs-revalidation.md. | Resolvido no input final. |

Não identifiquei novo achado pendente no delta. Não pedi nem fiz alteração dos critérios para obter aprovação. Os IDs abreviados nos relatos antigos são preservados como histórico e corrigidos por nota em audit.md:74; o plano executável usa DOC-3/AC-DOC-2 e DOC-2 exatos.

## Julgamento por critério congelado

| Critério | Julgamento e evidência | Limite preservado |
|---|---|---|
| A1 | Atendido documentalmente. inventory.json preserva o inventário original de 1091 arquivos, 477 Markdown; sources.json e os dois relatórios de pesquisa distinguem enumeração/hash de leitura integral, seletiva e cobertura de tópicos. source-revalidation.json expõe 35 modificações e 14 adições concorrentes. Os relatórios v2 e supplemental-source-manifest.json tornam o complemento auditável, sem reescrever o histórico. Conferi os hashes das 1552 entradas da cópia e dos 24 conteúdos candidatos. | Não li semanticamente todos os 1091 documentos. Inventário não é leitura integral. Os 14 docs novos são complemento de captura posterior, não parte do inventário anterior. Hash não prova atualidade externa. |
| A2 | Atendido documentalmente. audit.md, public-observation.json, local-observation.json e cinco capturas separam Jev público e Mesa/Inonu local, com origem, horário, viewport e limites. Examinei as cinco imagens: público desktop tem BUY 6% com sell 94% e conf 0.94; mobile mostra sobreposição preço/status; local mostra estados indisponíveis, espaço vazio e badge Ao vivo ambíguo. C04-C12 distinguem visual histórico de mecanismo revalidado. | A captura pública não revela o commit do deploy; a local não comprova equivalência com produção. Capturas de 16:27 não foram refeitas após o snapshot de fonte 16:44. Não naveguei nem interagi com servidor/provedor durante a revisão. |
| A3 | Atendido como preservação de contrato e limite. requirements.md:7-9, R11-R13, design e tasks preservam Jev decidindo buy/sell a partir do feed, wallet real, Kuru e cada bloco 300ms; nenhuma cadência N é proposta. R12/T10 mantêm Accept sem envio/assinatura, evidência canônica e distinção entre sent/placed/fill. O trabalho novo está restrito à pasta documental frontend-ux-20261013; contratos canônicos não foram alterados pelo candidato. | O público observado informa dry run/mock/sim; feed e lado não demonstram trade real. Operação real continua sem comprovação nesta entrega. O scan no-send tem exclusões declaradas e não prova ausência global de execução no projeto. |
| A4 | Atendido como especificação futura. R01-R20 definem estados e interações observáveis; design cobre desktop/mobile, hierarquia, fontes, unidades, ausente versus zero, stale/simulado, foco, teclado, contraste, zoom/reflow e reduced-motion. R16/R17 e T08/T09 exigem profiling e comparação pareada antes de ganho. Inonu conserva proveniência Jev; as superfícies pública/local não são confundidas por rebranding. | Não há dados, lucro, PnL, WCAG, CWV, performance ou economia inventados. Metas são propostas/verificações futuras. Contraste/AT/teclado runtime e métricas de campo não foram medidos. |
| A5 | Atendido documentalmente. O verificador e leitura semântica conferem 20 requisitos mapeados em 12 tarefas finitas T00-T11, com prioridade, dependências, responsabilidade candidata, caminhos, interfaces e condição de conclusão. T00 gates compartilhados e reservas; T02/T07 serializam arquivos comuns; T09 pode encerrar sem alterar código; T11 distingue rotas desktop de /console web. Os paths principais de componentes/testes citados existem; teste comportamental novo é declarado quando SSR não exerce eventos. | Candidatos de ownership não transferem lease. Z1-Z8, Z2/Z8, Fase 2/onchain e Mesa/Inteligência/Quant permanecem reservas/dependências. T00 por slice precede edição. Plano não é autorização de execução financeira, commit ou publicação. |
| A6 | Atendido pelo recibo real fornecido, com limite de proveniência. decisions.json preserva receipt fbbf7687-ce63-4b89-baa2-699c32b909ec, origem MCP, modelo jev1.13.0, escolha de modos separados e confiança/a11y primeiro, uso conhecido 826 input/145 output tokens, custo null, approved_by=jev_delegated e human_response=false. Semântica e estrutura do recibo foram lidas; o arquivo é idêntico ao v1. | Não fiz chamada Jev/API/modelo. O payload sanitizado não está reconstruível pelo digest; não certifico independentemente conteúdo egressado ou faturamento. Conselho, recibo e metadados não fornecem autorização nem resposta humana. Recibos de outras sessões continuam evidência delas. |
| A7 | Atendido nesta fase. Aceitação permaneceu exatamente no hash congelado; manifesto/links/rastreabilidade e hashes foram conferidos independentemente. A revisão distinta em cópia isolada detectou e reavaliou três achados; todos estão fechados documentalmente. O relatório explicita limites e próximo passo sem iniciar objetivo, implementação ou ação externa. | Verificação documental não substitui review do código futuro. Os gates operacionais, de implementação e de ganho continuam abertos. Não certifico testes relatados por outras sessões como testes desta revisão. |

## Regressões, conflitos e fronteiras de integração

A revalidação de OnchainBody evita reimplementar uma correção concorrente. AssetPicker e o handler ancestral CEX mantêm problemas de alvo de Enter no snapshot; são regressões propostas em T02, com contagem de requests e zero consulta implícita. IDs repetidos no dock e ausência de signal no fetch onchain permanecem mecanismos concretos. InonuClient já transmite AbortSignal, logo C07 não deve ser generalizado à integração Inonu. operator-center e save A/editar B em Settings continuam tarefas de integridade a reproduzir, sem ganho presumido.

G1 inteiro, DOC-3/AC-DOC-2 versus remoção de Ecossistema, dieta universal de 12 linhas e G9/DOC-2 são conflitos preservados, não resolvidos por este parecer. Só T00 pode registrar a reconciliação pertinente antes de uma slice de geometria/compartilhados, sem enfraquecer aceitação congelada.

Mesa de decisão já reserva gráfico/carteira/Settings/ask/vault; Inteligência reserva Veredito, perfil, glossário, recorder e modo simples/avançado; Quant permanece descritivo e seu painel é futuro. PORT-2 versus tamanho/confiança foi mantido como conflito de integração. Perfil escolhido, cálculo independente, rótulo e gate aplicável precedem a exibição; nenhuma faixa ou probabilidade pode parecer lucro comprovado. O relato Quant de calibração offline não valida UI, precisão Jev/ML ou ganho no produto. Seu placeholder MUTATION_AND_COUNTS e sua revisão independente pendente são expostos pelo relatório, não tratados como checks completos.

CHECKPOINT/testes/typecheck/build vermelhos e correções concorrentes sem nova revisão são relatos de outra integração. A cópia não contém o backend necessário para certificá-los e o plano não atribui essas falhas à nova SPEC. modelConfigured=true relatado invalida a antiga hipótese sem chave, sem revelar credencial ou provar provedor funcional. Consulta por gesto explícito permanece obrigatória mesmo com modelo configurado.

## Verificação efetivamente executada

1. V1: `bun --no-env-file C:/Users/gabri/.codex/tmp/ui-audit-01a135ff/review-input/plan/verify-plan.mjs C:/Users/gabri/.codex/tmp/ui-audit-01a135ff/review-input/plan C:/Users/gabri/.codex/tmp/ui-audit-01a135ff/review-input/source` retornou exit 0, 20 requisitos, 12 tasks, 20 mapeados, 25 links, 1091 entradas inventory, 442 fontes frontend, errors=[], em 2026-10-13T16:51:24.318Z. A passagem inicial encontrou os achados apesar desse sucesso sintático.
2. V2: `bun --no-env-file C:/Users/gabri/.codex/tmp/ui-audit-01a135ff/review-input-v2/plan/verify-plan.mjs C:/Users/gabri/.codex/tmp/ui-audit-01a135ff/review-input-v2/plan C:/Users/gabri/.codex/tmp/ui-audit-01a135ff/review-input-v2/source` retornou exit 0, status passed, 20 requisitos, 12 tasks, 20 mapeados, 31 links, 1091 entradas inventory, 442 fontes frontend, hash congelado correto e errors=[], em 2026-10-13T17:01:20.600Z. Esse resultado é minha execução, distinto de verification.json produzido pelo autor às 17:00:00.971Z.
3. `Get-FileHash -Algorithm SHA256` e comparação PowerShell contra candidate-manifest/source-manifest: v1, 21 conteúdos candidatos e 1537 entradas fonte, zero divergências; v2, 24 conteúdos candidatos e 1552 entradas fonte, candidateMismatches=[] e sourceMismatches=[], exit 0. Manifests foram hasheados separadamente; candidate-manifest exclui a si próprio da lista, sem pretensão recursiva.
4. Comparação dos manifestos de fonte v1/v2 por path/sha256: 15 adições, zero modificações e zero remoções no baseline fixo. `git diff --no-index` dos documentos alterados retornou exit 1, esperado quando há diferenças; somente leitura. Leituras delimitadas com rg/Get-Content e verificação de paths sustentam a revisão semântica. Uma tentativa de ler verification.md/sources.md retornou exit 1 por nomes inexistentes; corrigi para verification.json/sources.json. Não foi falha do candidato.
5. Examinei public-1440x900.png, public-390x844.png, local-1440x900.png, local-390x844.png e local-tracker-390x844.png fornecidos. Não executei browser, servidor, produto, testes/build ou dependências.

O verificador é complementar: testa integridade documental/links/estrutura/recibo/aceitação. A conferência de todos os hashes foi independente do script. Nenhum comando acima demonstra render atual, efeitos financeiros, WCAG ou performance.

## Hashes atuais do candidato v2

Todos os hashes abaixo são SHA256 dos arquivos da cópia final conferida. Manifesto candidato: `3963945b2079a65d4c79875deff39ac2e85f8e63c9d4df6032574e6c747b4352`. Manifesto fonte v2: `b0eb6a2ad88dbb045db06e35b1d936f9682b3607bf63190c1ad244d7071b67f2`. Aceitação congelada: `96df61f77df70ada8b47f7c4cdeaabe8cb3b03709a15299f923e7aeec6e4a88f`.

AGENTS.md da fonte: `17c63ea3c3328fbbd5cf0cf3934af0dd6ee142b9e4bf6e3b5b58724277dfdc34`; web/AGENTS.md complementar: `ec1b6e023814ae1a510b02ea62229e5eb035d75e39e3335d5ea7f5ce5654d567`. A orientação Next atual foi lida; como não escrevi código nem rodei build, não há leitura de node_modules ausente ou certificação da versão instalada.

| Conteúdo candidato | SHA256 |
|---|---|
| acceptance.md | 96df61f77df70ada8b47f7c4cdeaabe8cb3b03709a15299f923e7aeec6e4a88f |
| audit.md | d01ac42693f721fef5a6a99a8f21a5a44b90c4847dc12761802d3c01ba916525 |
| decisions.json | 818183f458476c8f9144a4fde2a7b29eee46317907f878e3e7876cf0c959d82f |
| design.md | 4d43beedfa1e9520f861cda6539ded2997c11cc512b5287f1724e2103b519519 |
| docs-research.md | 53bdbfb7deed01c4eb754c733724b807ec8c79d7a489c26417ba03f22574ea40 |
| docs-revalidation.md | 6fb68b2088374f45858fa7cc754f2211f6af591f7426b432fd4a4c5a87dcea5e |
| frontend-research.md | ad1cf8cdcca8471aa257d48a389ff5d473040bc6673b0272a62a99a542eebd22 |
| frontend-revalidation.md | b5b219379c6daab239951864f4995218597da66fa51b3fdb99903afbcf16691d |
| inventory.json | e48c7a2e27373ec36a237c09810706cae47d1a43e1ab49756cd9feccb75c8f5a |
| local-1440x900.png | 2ba7afc24ca13f7a6cf0b3b6accd629b3c7f4df3acc16861b80936b1897d4320 |
| local-390x844.png | 8256427cf7dd5d803c0a1c8724a2e05ab27c329a499f391b11ef9b6632460817 |
| local-observation.json | abe6d5b06bb5bbe5aa3e9dca9167eadd8d83cabd166bc9037e80707949d0ae21 |
| local-tracker-390x844.png | 434697733c9f1b4cbecdf791866d460791476ffb692b049d2868a71b6265fe45 |
| public-1440x900.png | b1a917578a85ca1c699244f66b14dc9aa50415253406be3116db78245a08f115 |
| public-390x844.png | ad37ba4235450fec3d01fc136546c92625d07191f330d69eadbdd83e124085ef |
| public-observation.json | fc377fe53833372d63ea4caf8ff04c8571882cbb3dbed68531bf2f177ddc1f74 |
| README.md | 8e75142bb542d9ebe539b69ac4ad569001e473b5d84d27a99ca10e8ae2e042fe |
| requirements.md | aca328141bf1de9ca59bbe182c9a1c8a3be1877129cdcb1b522c6986fe1a08e2 |
| source-revalidation.json | 6e4567c0bc54efa013457442bb97a5e1f4e996e703d5d5692d3ad5ee9944ea65 |
| sources.json | 490ecb715654bce482ac18c7306e76e5eb2e1ea2c988d2c37c1e804ee1401865 |
| supplemental-source-manifest.json | f76b2c9ae0514a79e8357879391157749b2cedd39fa95c7f764f5353f1d54c9c |
| tasks.md | 3830c11eec4cf9d189475f5c3c6bf81ab6d58edf0f558b4406761b1091ec604e |
| verification.json | 30b4b9dc59656983749c0615db4842a02c782433117383fbdc2a2de1a87508f3 |
| verify-plan.mjs | 295b5df41c6e3754771a738d7810481f4929703887e4922ddf115864e8b090c9 |

## Limites e próximo passo

Não executei testes de produto, typecheck, build, regressões runtime, performance, medição de contraste, leitor de tela ou certificação WCAG. Não consultei feed, wallet, credenciais, API, Jev ou modelo; não assinei/enviei ordem, não publiquei, não iniciei servidor/dependências/objetivo e não alterei hooks Desktop. Não alego trade real, ativação Desktop, deploy equivalente, autonomia operacional ou economia de custo/tokens. As evidências privadas de harness não foram copiadas para o repositório.

Próximo passo sustentado: usar T00 para revalidar baseline/ownership e preparar a regressão de T02 em uma cópia de implementação isolada, apenas num caminho liberado. Registrar conflito/dependência quando reservado. Isso exige escopo de implementação próprio; este revisor não inicia a slice nem outra meta. Publicação, credenciais e negociação continuam fora desta entrega.
