# Carteira com evidência verificável: plano de execução

Parte da pasta SDD [carteira-evidencia](requirements.md). Este plano é **finito**: 9 objetivos (O0 a O8), 52 tarefas, cada uma com módulos-alvo, dependências, testes, evidência e condição de término. Nada aqui foi implementado: a única entrega concluída é o Objetivo 0 (mapa e contratos). Nenhuma tarefa de código está marcada como iniciada.

## Como ler

- **Responsável proposto** significa uma sugestão que o usuário precisa aceitar (decisão D1). Sessões do Codex não podem ser instruídas por esta sessão; o plano delimita o trabalho de modo que cada objetivo grave só em **zona livre** (design §2.4) e dependa dos demais por contrato, nunca por edição de arquivo alheio.
- **Estado:** `feito` (com evidência), `não iniciado`, `bloqueado` (com o motivo) ou `pendente` (depende de decisão).
- **Evidência mínima de qualquer tarefa de código** (RQ-21): teste que falhou antes (saída guardada), `bun --no-env-file test <caminho>` e `bun --no-env-file run typecheck` verdes, varredura de pureza do módulo, e revisão independente em cópia isolada antes de declarar o objetivo concluído. Produzir documento nunca conclui uma tarefa de implementação.
- **Portões de decisão:** D1 (aceitar este plano), D2 (como o JEV vê dados da carteira), D3 (fonte de histórico, preço e custo), D4 (dono do `valuation-diagnostics`), D5 (moeda e tolerância). Ver [requirements.md §8](requirements.md#8-decisões-que-pertencem-ao-usuário).

## Mapa de responsabilidade e colisões

| Objetivo | Responsável proposto | Grava em (zona livre) | Só lê (zona reservada) | Depende de |
| --- | --- | --- | --- | --- |
| O0 Mapa e contratos | esta sessão (Claude Sonnet 5.5, `xhigh`) | `docs/sdd/carteira-evidencia/**` | todas | nada (concluído) |
| O1 Núcleo puro de evidência | Claude, sessão nova ou esta | `src/portfolio-evidence/**` | Z4 `valuation-diagnostics.ts`, `src/okx-wallet/chains.ts` | D1, D4 |
| O2 Coleta autorizada | Claude | `src/portfolio-evidence/adapters/**`, `web/src/lib/portfolio-evidence/**` | Z3 `okx-wallet.ts`, `evm-multichain.ts`, `okx-solana.ts` | O1, D2, D3 (só a via de API) |
| O3 Preço, histórico, custo | Claude, com o dono do catálogo (Z5) consultado | `src/portfolio-evidence/history/**` | Z5 `src/onchainos/**`, `docs/research/**` | O1, D3 |
| O4 Conciliação e persistência | Claude | `src/portfolio-evidence/store/**`, `src/portfolio-evidence/reconcile*.ts` | Z7 `src/operator/**` | O1, O2 |
| O5 Avaliação líquida de custos | `01a1216a` (custos e fills) e `01a121f0` (replay) como donos naturais; Claude entrega só a taxonomia | `src/portfolio-review/cost/**` | Z6, Z7, laboratório | O1; dados reais dependem do replay |
| O6 Análise do JEV | Claude | `src/portfolio-review/jev/**` | Z1 `src/jev-read/**` | O1, O4, D2, autorização de chamada paga |
| O7 Relatório acionável | `01a12b5f` (relatório móvel) é dono do esquema HTML/JSON; Claude entrega a projeção da carteira | `src/portfolio-report/**` | Z2 `src/mobile-decision-report/**` | O1, O4, entrega de `01a12b5f` |
| O8 Integração e correções | `01a12971` (integração) para `src/server.ts` e `web/src/app/page.tsx`; Claude para Z8 | Z8; documentos citados em T-DOC-1 | Z1, Z3 | O1 a O7 |

Regra de colisão: antes de editar qualquer arquivo fora de zona livre, repetir a verificação de design §2.3. Se aparecer modificado em outra árvore, criar arquivo novo ou registrar o pedido ao dono.

## Objetivo 0: mapear o estado real e dividir responsabilidades

| ID | Tarefa | Módulos-alvo | Depende de | Testes | Evidência e condição de término | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| T-O0-1 | Conferir raiz, remotos, branch, commit, alterações, worktrees, instruções locais, modelo e sessões | n/a | nada | n/a | design §1 e §2: cada linha cita o comando; sessão de 4 Codex revalidada por horário de escrita, `cwd` e processos | **feito** |
| T-O0-2 | Inventário dos módulos reais de carteira, dados, JEV, risco, avaliação, relatórios e persistência, com arquivo e linha por conclusão | `main@14cbb7b`, só leitura | T-O0-1 | n/a | design §3: seis inventários paralelos somente leitura; as afirmações de maior impacto foram reconferidas no código (design §8) | **feito** |
| T-O0-3 | Organizar a pasta SDD única e o contrato inicial de evidência | `docs/sdd/carteira-evidencia/**` | T-O0-2 | n/a | três arquivos; contrato em design §4; requisitos e aceitação em requirements | **feito** |
| T-DOC-VERIFY | Conferir que cada caminho e faixa de linha citada existe | `docs/sdd/carteira-evidencia/verify-citations.ts` | T-O0-3 | n/a | resultado registrado na seção "Verificação do SDD" abaixo | **feito** (ver abaixo) |
| T-REVIEW-0 | Revisão independente destes três documentos contra o código | `docs/sdd/carteira-evidencia/**` | T-DOC-VERIFY | n/a | parecer de um revisor que não escreveu o texto; achados resolvidos | **não iniciado** (recomendado antes do O1) |
| T-O0-4 | Entregar o pacote ao usuário e obter D1 a D5 | n/a | T-O0-3 | n/a | respostas registradas em requirements §8 | **pendente** (usuário) |

## Objetivo 1: núcleo puro de evidência de carteira (RQ-01 a RQ-10, AC-a a AC-f)

Módulo novo e sem E/S. Estende o vocabulário de `valuation-diagnostics.ts` sem editá-lo. Não toca rede, arquivos, ambiente nem credenciais.

| ID | Tarefa | Módulos-alvo | Depende de | Testes | Evidência e condição de término | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| T1.1 | Vetores e testes **vermelhos** para AC-a a AC-f e RC1 a RC6, com fixtures `origin: synthetic_fixture` | `src/portfolio-evidence/vectors/*.json`, `*.test.ts` | D1 | um teste por caso da tabela de aceitação; vetores consumíveis pela cópia web | saída dos testes falhando guardada; cada AC tem pelo menos um caso positivo e um negativo | não iniciado |
| T1.2 | Identidade: chave canônica determinística (EVM sem caixa, Solana com caixa, marcador nativo), duplicata reportada | `src/portfolio-evidence/identity.ts` | T1.1 | grafias diferentes do mesmo contrato, nativo, Solana, símbolo repetido com contratos diferentes, mesma chave com decimais diferentes | AC-e (duplicidade, decimais) verde; reutiliza `src/okx-wallet/chains.ts:64-82` sem editá-lo | não iniciado |
| T1.3 | Dinheiro exato: parse e formatação de texto decimal, escala por `decimals`, arredondamento declarado | `src/portfolio-evidence/money.ts` | T1.1 | inteiros muito grandes, 6 e 18 decimais, preço `"0"`, entrada inválida, ausência de `Number` no caminho | nenhum `number` no cálculo de valor (teste de varredura); RQ-02, RQ-03, RQ-10 | não iniciado |
| T1.4 | Estados, envelope do snapshot, frescor e hash canônico | `src/portfolio-evidence/state.ts`, `snapshot.ts` | T1.2, T1.3 | tempos desconhecido, futuro, vencido, fronteira do TTL; hash estável; extra fields rejeitados; entrada inválida falha com erro constante | RQ-04, RQ-05, RQ-07; mesmo hash para a mesma entrada em duas execuções | não iniciado |
| T1.5 | Conciliação RC1 a RC6 | `src/portfolio-evidence/reconcile.ts` | T1.4 | AC-a a AC-d completos; total contra soma com cada explicação candidata e com `unresolved`; ordem temporal | AC-a, AC-b, AC-c, AC-d verdes; nenhuma diferença é "fechada" por arredondamento | não iniciado |
| T1.6 | Pureza e ausência de regras alheias | `src/portfolio-evidence/purity.test.ts` | T1.1 | varredura de imports (sem signer, ethers, executor, `fetch`, `node:fs`, `process.env`) e de identificadores WIN, BRL, WDO, MON/USDC | RQ-10, RQ-15, P1 e P5 provados por teste | não iniciado |
| T1.7 | Fixtures sintéticas rotuladas e teste de rótulo | `src/portfolio-evidence/fixtures.ts` | T1.4 | nenhuma fixture sem `origin: synthetic_fixture`; endereços de teste identificados como fictícios | AC-f verde; RQ-09 | não iniciado |
| T1.8 | Verificação e revisão do objetivo | `src/portfolio-evidence/**` | T1.1 a T1.7 | `bun --no-env-file test src/portfolio-evidence`; `bun --no-env-file run typecheck` | revisão independente em cópia isolada; manifesto de arquivos e hashes; achados resolvidos; **condição de término do O1** | não iniciado |

## Objetivo 2: coleta autorizada para o contrato (RQ-11, RQ-12)

| ID | Tarefa | Módulos-alvo | Depende de | Testes | Evidência e condição de término | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| T2.1 | Cópia pura do núcleo para o navegador, validada pelos mesmos vetores | `web/src/lib/portfolio-evidence/**` | T1.8 | os vetores do O1 rodando na suíte web; teste de deriva (hash dos arquivos espelhados) | web e raiz produzem o mesmo hash para o mesmo vetor | não iniciado |
| T2.2 | Adaptador `browser_wallet`: saldo da sessão EIP-1193 para `EvidenceSnapshot`, só no navegador, com gesto explícito | `web/src/lib/portfolio-evidence/adapters/browser-wallet.ts` | T2.1, D2 | rede errada, recusa, troca de conta, resposta atrasada, decimais declarados como `registry_pinned` | nenhum dado sai do navegador (teste de rede ausente); não edita `okx-wallet.ts` (Z3) | não iniciado |
| T2.3 | Adaptador `public_rpc`: saldos multichain e Solana para o contrato | `web/src/lib/portfolio-evidence/adapters/public-rpc.ts` | T2.1 | `chainId` divergente, falha de RPC vira estado (nunca zero), decimais divergentes (o guard hoje nunca exercitado), ordem dos blocos | cobertura marcada `allowlist`, nunca "completa" | não iniciado |
| T2.4 | Adaptador `local_import`: arquivo JSON do usuário com schema e limite de tamanho | `src/portfolio-evidence/adapters/local-import.ts` | T1.8 | limite de bytes, schema errado, campos extras, injeção em strings | falha com erro constante, sem ecoar o conteúdo | não iniciado |
| T2.5 | Adaptador `okx_web3_api` sobre o envelope `okx_wallet_balance_capture_v1` do diagnóstico existente | `src/portfolio-evidence/adapters/okx-balance-capture.ts` | T1.8, D3, D4 | **só sobre fixtures sintéticas rotuladas**; `filters.riskToken` desconhecido vira `unknown` | executa offline; a captura real fica **bloqueada** até haver credenciais autorizadas | bloqueado (credenciais ausentes) |
| T2.6 | Estado honesto na mesa: cobertura e estado do snapshot na doca, sem valores inventados | `web/src/components/Desk/**` (Z8) | T2.2 | teste de renderização: "Indisponivel" sem snapshot, cobertura parcial visível, nada de USD sem preço | não promete patrimônio total | não iniciado |

## Objetivo 3: preço, histórico e custo de aquisição (RQ-03, RQ-06)

| ID | Tarefa | Módulos-alvo | Depende de | Testes | Evidência e condição de término | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| T3.1 | Entradas de histórico e janela com completude declarada | `src/portfolio-evidence/history/entry.ts`, `window.ts` | T1.8, D3 | janela incompleta, entrada duplicada, fora de ordem, tipos desconhecidos | `complete: "unknown"` por padrão; nada de saldo inferido | não iniciado |
| T3.2 | Importador local de histórico (CSV e JSON do usuário) | `src/portfolio-evidence/history/import.ts` | T3.1 | formatos, limites, injeção, fuso horário | fonte `local_import`, sem credenciais | não iniciado |
| T3.3 | Custo de aquisição por FIFO e por média, em aritmética exata | `src/portfolio-evidence/history/cost-basis.ts` | T3.1 | taxas na base, janela parcial (cobertura `partial_window`), decimais mistos | custo nunca calculado sobre janela incompleta sem a marca | não iniciado |
| T3.4 | Evidência de preço com instante e fonte; `"0"` sem corroboração é `unverified` | `src/portfolio-evidence/price.ts` | T1.8 | preço sem horário, preço zero, moeda ausente | AC-b depende desta tarefa em dados reais | não iniciado |
| T3.5 | Declarações de PnL por classe, sem soma ao patrimônio | `src/portfolio-evidence/pnl.ts` | T3.3, T3.4 | realizado só com janela completa; projetado e simulado rotulados; AC-c com histórico | `PnlStatement` nunca entra na soma de `BalancePosition` | não iniciado |
| T3.6 | Endpoints de histórico, PnL e posições DeFi da API Web3: levantamento, sem chamada | só leitura de `docs/research/R6-onchain-os-catalogo.json` | D3 | n/a | tabela de endpoints e do que exigem; **nenhuma chamada** | pendente |

## Objetivo 4: conciliação operacional e persistência (RQ-08, RQ-13)

| ID | Tarefa | Módulos-alvo | Depende de | Testes | Evidência e condição de término | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| T4.1 | Armazenamento versionado de snapshots: arquivo de estado atômico, journal com rotação | `src/portfolio-evidence/store/**` | T1.8 | escrita atômica, rotação, schema errado, symlink, concorrência | segue o padrão de `src/jev-read/store.ts` por leitura, sem importá-lo | não iniciado |
| T4.2 | Séries de snapshots: revisão, diferença e ordem temporal (RC5) | `src/portfolio-evidence/store/series.ts` | T4.1 | revisão atrasada não sobrescreve; relógio desviado | `sourceTimeMs` decrescente é sinalizado | não iniciado |
| T4.3 | Conciliação sobre dados reais coletados (RC1 a RC4, RC6) | `src/portfolio-evidence/reconcile-run.ts` | T2.2 ou T2.3, T3.x | casos reais anonimizados e sintéticos rotulados | pendências aparecem com explicação ou como não resolvidas | não iniciado |
| T4.4 | Correlação entre captura, análise e relatório | `src/portfolio-evidence/correlation.ts` | T4.1 | `correlationId` estável, ligação por hash | RQ-13 | não iniciado |
| T4.5 | Registrar DF-06 e DF-07 para o dono do operador (Z7), sem editar | `docs/sdd/carteira-evidencia/**` | T4.3 | n/a | pedido registrado e referenciado | não iniciado |

## Objetivo 5: avaliação líquida de custos (RQ-16, RQ-17)

| ID | Tarefa | Módulos-alvo | Depende de | Testes | Evidência e condição de término | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| T5.1 | Taxonomia `realized`, `projected`, `simulated`, `inventory_delta` com custo conhecido ou desconhecido | `src/portfolio-review/cost/taxonomy.ts` | T1.8 | custo desconhecido bloqueia o líquido; `inventory_delta` não alimenta realizado | RQ-16 | não iniciado |
| T5.2 | Modelo de custo de ações manuais (taxa, gás, derrapagem, spread) com desconhecido distinto de zero | `src/portfolio-review/cost/model.ts` | T5.1 | gás nulo não vira zero (corrige o padrão de DF-09 sem editar Z7) | usa fórmulas por leitura de `okx-derivatives/book.ts` e dos candidatos | não iniciado |
| T5.3 | Avaliação do que teria acontecido em séries de snapshots, com o laboratório | `src/portfolio-review/cost/replay.ts` | T4.2, T5.2 | só sintético até haver capturas; semente e hash registrados | rotula `synthetic`; sem alegação de vantagem | bloqueado (sem série real de carteira) |
| T5.4 | Pedido de correção de DF-07, DF-08, DF-09 e DF-13 aos donos | documentos | T5.1 | n/a | itens entregues a `01a1216a` e ao dono de Z7 | não iniciado |

## Objetivo 6: análise do JEV sobre a carteira, consultiva (RQ-13, RQ-14, RQ-15)

Só inicia com D2 respondido e autorização explícita para chamadas pagas. Os testes nunca chamam modelo.

| ID | Tarefa | Módulos-alvo | Depende de | Testes | Evidência e condição de término | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| T6.1 | Projeção sanitizada do snapshot, vinculada ao hash | `src/portfolio-review/jev/state.ts` | T1.8, D2 | sem endereço completo nem credencial; o que sai depende da opção de D2 | teste de vazamento de campos | pendente |
| T6.2 | Achados determinísticos (concentração, posição sem valor, dado vencido, pendência de conciliação, custo desconhecido) e pergunta de revisão sobre eles | `src/portfolio-review/jev/findings.ts`, `question.ts` | T4.3, T6.1 | cada achado com caso positivo e negativo | o JEV só escolhe entre ids de achados existentes; texto livre nunca vira instrução | pendente |
| T6.3 | Validação, registro e correlação | `src/portfolio-review/jev/decide.ts`, `journal.ts` | T6.2, T4.4 | resposta inválida, atrasada ou cancelada não decide; modelo falso nos testes | registro `advisory`, `execution: never`, hash do snapshot | pendente |
| T6.4 | Adaptador `EvidenceSnapshot` para `WalletReading` do System One (DF-14), em módulo novo | `src/portfolio-evidence/adapters/system-one.ts` | T1.8 | `valueComplete` só quando a cobertura permite | System One passa a receber evidência real **sem editá-lo** | pendente |
| T6.5 | Uma consulta real autorizada, de custo conhecido e pequeno | execução manual | T6.3, autorização | n/a | recibo de uso e custo registrados; sem isso o objetivo não é declarado cumprido | pendente |

## Objetivo 7: relatório acionável (RQ-18)

| ID | Tarefa | Módulos-alvo | Depende de | Testes | Evidência e condição de término | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| T7.1 | Projeção da carteira em JSON por allowlist | `src/portfolio-report/project.ts` | T1.8, T4.3 | alocação só de posições avaliadas; cobertura e estados; pendências; custos conhecidos e desconhecidos | RQ-18; sem promessa de lucro | não iniciado |
| T7.2 | Exportação HTML estática offline, sem script, formulário nem recurso externo | `src/portfolio-report/html.ts` | T7.1 | injeção em strings, CSP restritiva, legível em 360 e 390 px | inspeção em navegador nas duas larguras, limitações registradas | não iniciado |
| T7.3 | Achados do JEV no relatório, marcados "consultivo" | `src/portfolio-report/jev.ts` | T6.3 | ausente significa `not_evaluated`; contexto fornecido é `provided_unverified` | segue as convenções M04 do relatório móvel | pendente |
| T7.4 | Adaptador para o esquema do relatório móvel, depois que `01a12b5f` entregar | `src/portfolio-report/mobile-adapter.ts` | T7.1, entrega de Z2 | n/a | sem editar `src/mobile-decision-report/**` | bloqueado (Z2 em desenvolvimento) |

## Objetivo 8: integração, correções e fechamento

| ID | Tarefa | Módulos-alvo | Depende de | Testes | Evidência e condição de término | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| T-FIX-1 | DF-01: a mesa não pode mostrar como "ao vivo" um ciclo do System One sintético ou `mock` | `web/src/lib/mesa/mesa-model.ts`, `mesa-model.test.ts` (Z8) | nada | casos: `dry_run` com fonte sintética, com modelo `mock`, e real | teste vermelho primeiro; chip e linha de palco rotulam a origem | não iniciado |
| T-FIX-2 | DF-02: o cliente web envia `Authorization` quando houver token, ou a documentação deixa de anunciar o token | `web/src/lib/jev-read.ts`, `system-one.ts`, `operator-center.ts`, `docs/MESA-DE-OPERACOES.md` | nada | requisição com e sem token | decisão entre código e documento registrada | não iniciado |
| T-VERIFY-1 | DF-12: reproduzir se `NEXT_PUBLIC_EVM_RPC_*` funciona no navegador antes de afirmar defeito | `web/src/components/MultichainPanel`, `web/src/lib/evm-multichain.ts` | nada | build de produção com a variável definida | resultado documentado (confirma ou descarta) | não iniciado |
| T-DOC-1 | DF-11: corrigir ou marcar como histórico os documentos que afirmam o que o código não faz | `docs/OKX-OPERADOR-JEV.md`, `docs/AUDITORIA-OBJETIVOS.md`, `docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md`, `docs/OPPORTUNITY-ARCHITECTURE.md`, `docs/JEV-LABORATORIO-DE-DECISAO.md` | T-REVIEW-0 | n/a | históricos preservados com aviso; nenhuma remoção | pendente (os documentos estão em zonas de terceiros) |
| T8.1 | Rota somente leitura `/portfolio` com a projeção pública, pelo integrador | `src/server.ts` (Z1) | O4 | origem permitida, token opcional, 404 sem dado, 405 em escrita | pedido ao integrador; **não editado por quem implementa os objetivos** | pendente |
| T8.2 | Painel da carteira na mesa com os estados do contrato | `web/src/components/Desk/**` (Z8) | T2.6, T4.3 | renderização e estados | sem valor sem preço; sem rótulo de lucro | não iniciado |
| T8.3 | Cópia financeira restante (DF-03, DF-10) | Z6 | n/a | teste de cópia | repassada a `01a1216a`; esta pasta só acompanha | pendente |
| T8.4 | Verificação final: raiz e web (typecheck e testes), build de produção, varredura de pureza, revisão independente, manifesto | tudo que foi criado | O1 a O7 | suítes completas | saídas reais guardadas; matriz RQ para prova atualizada | não iniciado |

## Ordem e caminho crítico

`T-REVIEW-0` e `D1 a D5` primeiro, depois `O1` (`T1.1` a `T1.8`). A partir de `T1.8` podem andar em paralelo, sem colisão: `O2` (adaptadores web e importação), `O3` (histórico por importação), `O5` (taxonomia) e `T-FIX-1`, `T-FIX-2`, `T-VERIFY-1`. `O4` depende de `O2`; `O6` depende de `O4` e de `D2`; `O7` depende de `O4` e da entrega do relatório móvel; `O8` fecha. Bloqueios externos que **não** são removidos por este plano: credenciais da API Web3 (D3), consentimento (D2), captura de série real de carteira, entrega de `01a12b5f`.

## Verificação do SDD (T-DOC-VERIFY)

Comando (somente leitura, reproduzível por qualquer pessoa):

```bash
bun --no-env-file docs/sdd/carteira-evidencia/verify-citations.ts main
```

Resultado em 2026-10-11 contra `main@14cbb7b`: **509 referências conferidas, 0 problemas** (código de saída 0).

| Classe | Quantidade | Significado |
| --- | --- | --- |
| `arquivo_e_linha_ok` | 281 | o arquivo existe no commit e a faixa de linhas cabe no arquivo |
| `arquivo_ok` | 140 | o arquivo existe no commit |
| `planejado` | 40 | caminhos de módulos que **ainda não existem** (zonas livres dos objetivos O1 a O7) |
| `gerado_em_data` | 11 | arquivos de execução em `data/`, ignorados pelo git |
| `fora_do_commit` | 12 | só existem em árvores não commitadas (`valuation-diagnostics`, relatório móvel, `src/real`), por lista explícita |
| `declarado_inexistente_no_commit` | 7 | documentados como ausentes (por exemplo `docs/OKX-HISTORICAL-ARCHIVES.md`, `src/opportunities`) |
| demais | 18 | diretórios, arquivos irmãos da pasta, tokens que não são arquivos |

**Resolução de abreviações.** O verificador resolve um nome de arquivo ambíguo pelo diretório citado na mesma linha. Isso encontrou 55 citações abreviadas que valiam em mais de um módulo; todas foram trocadas por caminho completo. Resta um resíduo de continuações de linha escritas só com o número, logo após um arquivo já citado, que o verificador não confere.

**Erros reais que a verificação pegou e foram corrigidos antes da entrega:** (1) uma citação de okx-opportunities na linha 239 apontada para o arquivo de 106 linhas do diretório okx-market, quando a linha é do arquivo legado `src/okx-opportunities.ts`; (2) uma citação de capture.ts nas linhas 29 a 43, que eram imports, para sustentar "épocas atômicas e retomáveis", cujo trecho certo são as linhas 18 a 21; (3) duas abreviações erradas de diretório (uma de central/phases e uma de dex-report-import).

**Reconferência semântica por amostragem.** Existir a linha não prova que ela diz o que o texto afirma. Foram sorteadas 14 citações com faixa de linha (semente fixa) e comparadas com a afirmação: 13 coincidem exatamente e 1 estava mal posicionada (a de capture.ts, corrigida). Além disso, 12 afirmações de maior impacto foram reconferidas no código durante o inventário: fonte live com `riskTokensExcluded: true` e conciliação que exige `false`; `normalizeInventory` empilhando duplicatas; preço `"0"` tratado como conhecido e completo; texto "cobertura completa" ignorando o filtro; ausência de chamador de produção de `recordRealized`; ausência de mapeamento de inventário para o System One; o gate pulando checagens para o mandato Kuru; registro de endpoints sem nenhuma entrada de saldo; teste de isolamento proibindo `/dex/balance`; `source` de sinais informado pelo chamador; ausência de `OKX-HISTORICAL-ARCHIVES.md` e de `src/opportunities` em `main`; e a ausência de `Authorization` nos clientes web.

**O que continua sem prova independente.** As demais afirmações vêm de inventários de agentes somente leitura que citaram arquivo e linha e que foram conferidas por amostragem, não uma a uma. Nenhum teste foi executado para produzir o inventário. O parecer de revisor independente (T-REVIEW-0) ainda não existe.

