# Passagem coordenada para o artefato qualificado (preparada em 2026-10-15, nada executado)

Pedido: nota 167 da Codex (instrução do dono); respostas e correções: nota 169. Este documento só descreve e mede. Não reinicia, não edita estado financeiro, não liga flag, não altera a tarefa agendada.

**Dono do preparo e da execução futura da passagem:** a sessão Claude `a645aa24-a0d6-487a-bc12-0ed706e0c859` (autora das notas 131 a 134), por designação da Codex na nota 169. A autora da nota 130 fica somente leitura neste procedimento. A Codex coordena as provas e confere a troca; ninguém inicia outro supervisor ou núcleo por esta nota.

## 1. Peças preparadas (todas fora do manifesto v20, nenhuma executada contra o núcleo vivo)

| Peça | O que faz | Prova |
| --- | --- | --- |
| `scripts/handover-precheck.ts` | Observação somente leitura. Sete gates de **pré-condição**: `/health` é do app (`ok` e `app` = `inonu-trader`), executor único (o LOCK nomeia o processo que **detém a porta** e há no máximo um núcleo), nenhuma ordem `enviando` ou `incerta`, ledger legível (linha malformada reprova, não some), nenhum plano aberto (`plans.json` sem o formato esperado é "ilegível", nunca "vazio"), agente saudável, janela ociosa (tempos finitos). Com `--compare`: repete os gates vivos e compara por **significado** (config e plans idênticos por hash; estado com mesma versão, mesmo disclosure e mesmo `connected`, eventos só crescem; ledger só cresce). Um desconectar e reconectar legítimo reescreve `connectedAtMs` e `changedAtMs` e não reprova. | 22 testes; medido no núcleo vivo (LOCK = dono da porta = PID 25532, 1 núcleo) |
| `scripts/handover-quiesce.ts` | Cliente de quiescência para o agente **vivo e não pausado** (o `quiescePausedAgent` existente só aceita agente já pausado e não se falsifica o pausado). Só lógica e adaptadores, sem linha de comando e sem executar. Passos e invariantes na seção 3. | 38 testes com um mundo simulado; teste de mutação: 8 quebras deliberadas, todas pegas |
| `scripts/autostart/inonu-local-logon.ps1` | Watchdog de logon do artefato (P1/P7). Um único supervisor, `--control` novo por lançamento, `-App` e `-Repo` obrigatórios, sem `-Port`, caminhos com espaço citados. Não registrado. | `-DryRun` em sete casos (inclui detecção de supervisor vivo sem confundir o lançador `--background`) |

**Os gates do portão não são prova de dreno** (Codex 169). Um verde momentâneo não impede o scheduler de iniciar um ciclo um segundo depois. A prova de dreno é a quiescência por API do `handover-quiesce.ts`.

## 1b. Caminhos FÍSICOS do release (achado de 2026-10-15, verificado em leitura)

A nota 171 entrega o release em `C:/Users/gabri/AppData/Local/InonuTraderReleases/release24-6dce963a`. Esse caminho só existe **para processos do pacote do Codex**: o `AppData\Local` de um processo empacotado é redirecionado para o `LocalCache\Local` do próprio pacote (a mesma razão pela qual o home do agente tem de ser escrito pelo caminho físico do pacote do Claude). Visto de fora, o release está em:

`C:\Users\gabri\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\InonuTraderReleases\release24-6dce963a`

Conferido por leitura: 62 arquivos; `app\InonuTrader.exe` (99.763.200 bytes) com SHA256 `6dce963a635865dfcfcb5c59348e1f1373c404da6cf07614ff04d30b9c04d60f`, igual ao declarado; `launcher\src\local-host` com os oito TS (`args`, `control`, `main`, `manifest`, `plan`, `probe`, `protocol`, `supervisor`); `launcher\qualification.bunfig.toml` (39 bytes, um comentário). A tarefa agendada do Windows e o pacote do Claude **não** resolvem o caminho virtual; usam o físico. Duas consequências: (a) o P1 e o P7 recebem o caminho físico em `-App` e `-Repo` (o `-DryRun` do P1 foi rodado contra esses caminhos e aceitou as entradas); (b) a pasta vive dentro do pacote de outro aplicativo, e uma atualização, reinstalação ou reset desse aplicativo a apaga: para uma tarefa de logon permanente convém uma segunda cópia por hash fora de qualquer pasta de pacote (o home do agente tem o mesmo risco hoje, no pacote do Claude).

## 2. Estado medido (leitura, 2026-10-15)

Executor único PID 25532 (LOCK = dono da porta 3000), `bun run src/desktop/main.ts` da árvore, iniciado pelo watchdog de logon, home do MSIX `C:\Users\gabri\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\InonuTrader`. De 125 ordens distintas: 24 `executada`, 12 `falhou`, 89 só `preparada` (registro); 0 em voo. `plans.json` vazio. Disclosure `2026-10-14.1`, conectado, sem pausa, `modelConfigured` verdadeiro. Ciclo a cada 2 min.

## 3. Quiescência por API (P4): o que o cliente faz e garante

1. **Preflight sem efeito:** conectado, saudável, ligado a carteira `agentica` com endereço Solana válido, estado em disco igual ao do processo, ledger sem linha malformada, LOCK = dono da porta. Qualquer falha encerra **antes** de qualquer chamada que mude algo.
2. **Esperar assentar, sem matar:** leituras repetidas (3 seguidas, a cada 2 s, no máximo 10 min) sem plano e sem ordem em voo, tanto pela API quanto pelo ledger. Se não assentar: `unsettled_order`, nada foi mutado, o agente segue rodando.
3. **`POST /agent/disconnect`:** a primeira e única chamada que muda algo antes da prova.
4. **O desconectado precisa estar em disco:** `state.json` com `connected: false`, com poucas repetições para uma escrita atrasada; senão `disconnect_not_persisted` e **nada mais é chamado**.
5. **Prova de dreno:** `POST /agent/run` **só depois** do desconectar, até uma resposta `desligado`, sem consulta e sem ordens (no máximo 3 passagens). Se uma passagem mostra consulta ou ordem num ciclo compartilhado, espera a conciliação real e prova de novo. Não usa o `/agent/run` para forçar operação.
6. **Verificação final:** status e disco concordam (desconectado, saudável, sem plano nem voo), mesma carteira, mesma config por hash, linhas de ordem só acrescentadas.
7. **Dono do processo:** o LOCK nomeia o processo vivo que detém a porta e é o único núcleo.

Devolve os fatos de um processo financeiramente quiescente. **Encerrar esse processo é um ato posterior e separado.** Todo erro carrega `agentDisconnected`: se verdadeiro, o agente está no estado seguro desconectado e **não se mata por timeout**. A volta é `reconnectAgent`: o MESMO disclosure e a MESMA carteira, pela API, sem editar JSON, STOP ou LOCK e sem nova autorização humana.

## 4. Sequência proposta

| # | Passo | Dono do passo | Evidência de saída |
| --- | --- | --- | --- |
| P0 | Pacote, selftest compilado e drift final qualificados. **Feito em 169:** selftest e verify com saída 0; falta o fechamento do revisor independente. Não reexecutar build nem testes qualificados | Codex | pacote, exe e provenance da nota 168 |
| P1 | `inonu-local-logon.ps1` lido pela Codex; **não registrado** | Claude preparou, Codex lê | parecer da Codex |
| P2 | Antes da janela: `handover-precheck --save <fora do home>/before.json` verde e a janela ociosa aberta | Claude | JSON salvo |
| P3 | Parar o watchdog sem parar o núcleo (`Stop-ScheduledTask` mata só o watchdog; observado em 2026-10-15 05:30) e desabilitar a tarefa. Em seguida armar **um** supervisor, **uma única vez**, com `--await-handoff` e `--control` absoluto novo por lançamento (resultado de spawn desconhecido: localizar PID e sessão antes de repetir; nada de retry duplicador) (ele só observa `/health`, não adota nem encerra o núcleo existente) | Claude executa, Codex confere | processo do watchdog ausente, PID 25532 vivo, `local_waiting` no log do supervisor, caminho do `--control` anotado |
| P4 | `quiesceLiveAgent` (seção 3). Só com `quiescent: true` e com a Codex a observar: confirmar de novo PID, caminho e LOCK e encerrar **aquele** processo já quiescente | Claude | fatos devolvidos, PID, config hash |
| P5 | O supervisor inicia o filho do artefato depois da ausência comprovada da porta. O novo núcleo sobe com o agente **desconectado** (foi o que ficou em disco) | Codex (supervisor) | LOCK com o PID do filho novo; caminho e SHA do exe conferidos; nenhum `bun run src/desktop/main.ts` vivo |
| P6 | `reconnectAgent` com o disclosure e a carteira guardados em P4, depois `handover-precheck --compare before.json` verde e **o primeiro ciclo** com saída `decidido` e nenhuma ordem `incerta` | Claude mede, Codex confere | JSON do `--compare`, `agent/status`, linha do ciclo |
| P7 | Só com P6 válido, **sem esperar as 24 h**: registrar a nova tarefa de logon apontando para o launcher e as dependências **fixos, qualificados e imutáveis** (`-Repo` = a cópia qualificada que a Codex indicar) e para o artefato imutável, **nunca** o `main.ts` mutável da árvore de trabalho. Guardar por escrito a ação antiga. **Imediatamente antes**, revalidar o release: `bun --no-env-file run scripts/handover-release-check.ts --dir <release físico> --verify docs/sdd/agente-autonomo/RELEASE24-OBSERVED-SHA256.txt` (somente leitura; 62 arquivos, sem faltar, sobrar nem mudar) e conferir o recibo `STAGED-RELEASE.json` da Codex, que é a autoridade sobre "igual ao qualificado" | Claude, com a Codex a ler | `Get-ScheduledTask` com a ação nova e a antiga guardada |
| 24 h | A observação das 24 h começa depois do P7 | Claude mede | seção 6 |
| Reversão | Se o filho novo não responder `/health` em 60 s ou algum passo falhar: **não matar**. Pedir a parada do supervisor pelo arquivo de controle (dreno por IPC), esperar a saída do supervisor **e** do filho, conferir que ninguém detém a porta, e só então **rearmar o supervisor do MESMO release** (uma vez, com `--await-handoff` e `--control` novo; se o resultado do spawn for desconhecido, localizar PID e sessão antes de repetir). **Nunca** o `main.ts` da árvore de trabalho nem o watchdog antigo para recuperar (Codex 171); o watchdog antigo fica desabilitado desde o P3. Reconectar com `reconnectAgent` se preciso. Ledger, planos e LOCK são do home, não do processo | Claude, com a Codex | porta livre antes de reativar; `/health` 200 com um único dono |

## 5. Flags (sem pergunta ao dono)

1. **Na passagem, flags desligadas.** O comportamento do artefato é o de hoje; assim o P6 compara o mesmo agente.
2. **Pulse:** `src/local-host/plan.ts:3-11` entrega ao filho só variáveis do Windows mais `INONU_HOME/WEB_DIR/NO_DIALOG`, e `src/local-host/service.ts:34-38` não passa `pulse`. Para ligar, a Codex definiu: uma **opção tipada explícita** no host, no service e no core-entry, **padrão desligado** e **desligada à força no selftest**, com transporte configurado estrito. Só `options.pulse` no service não basta se ninguém o entrega, e só variável de ambiente no pai também não. O contrato de ponta a ponta fecha em um delta próprio **depois** desta passagem.
3. **Memória:** binding, orçamento do Brief (cerca de 11,3 KB de 12000; o bloco de memória tem 4457 bytes) e maturação são separados. Nenhuma flag funcional é prometida nesta geração: `memoryHookEnabled` não tem consumidor no runtime e o observer mostra 0 resultados maduros.

## 6. O que a observação de 24 h mede

Disponibilidade (`/health` 200, reinícios, tempo fora), recuperação (volta sozinha depois de queda de energia ou de reinício do Windows, sem ordem duplicada e sem ordem `incerta` esquecida), qualidade de dados (idade das fontes, relógio, falhas de provedor), qualidade das decisões (consultas válidas, respostas dentro do contrato, postura, vereditos) e dos recibos (toda ordem `enviando` termina em `executada` ou `falhou` com prova). Não exige compras artificiais nem lucro: compra é decisão do Jev diante de oportunidade e saldo reais.

## 7. T1.1 (Edge), origem e critério exatos

`docs/sdd/inonu-desktop-v1/TASKS.md:38`, requisitos WIN-4, WAL-1, AC-WIN-4: provar que `window.okxwallet` e a descoberta EIP-6963 são injetados numa janela `msedge --app=http://127.0.0.1:PORTA` do perfil que tem a extensão. É verificação visual e de console da extensão do navegador, sem autoridade nem autenticação (a sonda anterior nem chamou `eth_requestAccounts`; `spikes/T1.1.md`). Decide o ADR-1 e libera M9 (carteira conectada por clique). O agente autônomo opera pela carteira Agentic via `onchainos` e **não depende** dele; não bloqueia pacote, selftest, passagem nem observação de 24 h. Preserva-se como pendência específica: precisa do perfil e da tela do dono, e a tentativa automática com perfil descartável não se repete (sincronizou a conta).

## 8. Antes de qualquer chamada que mude algo

**Superado pela seção 9** (a passagem foi executada em 2026-10-15). O invólucro `scripts/handover-run.ts` existe, exige `--execute`, a sessão dona e um arquivo de fatos fora do home, e foi usado contra o núcleo vivo.

## 9. Execução real (2026-10-15, sessão `a645aa24`, dona da passagem por decisão do dono)

Quatro níveis, separados:

| Nível | Estado | Evidência |
| --- | --- | --- |
| Configuração válida | sim | release24 no caminho durável confere 62/62 contra `RELEASE24-OBSERVED-SHA256.txt` (`handover-release-check --verify`, `missing/extra/changed` vazios); `typecheck` limpo; 127 testes verdes nos seis arquivos de passagem e autostart |
| Executor novo carregado | sim, sob o Agendador de Tarefas | `InonuTrader.exe` PID 35524, filho do supervisor 37080 (caminho durável `C:\Users\gabri\InonuTraderReleases\release24-6dce963a`), lançado pelo watchdog PowerShell 30644 da tarefa `InonuTrader-Local-Logon`; SHA256 da imagem `6dce963a...04d60f`; LOCK = dono da porta 3000 = 35524; nenhum `src/desktop/main.ts` vivo; os três processos estão fora do job desta sessão |
| Agente funcionando ao vivo | sim, por ciclos medidos | primeira troca: ciclo 11:20:55 `decidido`; segunda troca (para o Agendador): ciclo 11:29:12 `decidido` no PID 35524, postura neutra; linhas de ordem 247 antes e depois das duas trocas, nenhuma `enviando` ou `incerta` pendente |
| Ganho medido | não | nenhuma medição de ganho; a observação de 24 h mede disponibilidade, recuperação e qualidade, não lucro |

Sequência executada (cada passo só depois do anterior provado):

1. `handover-run --step plan --allow-open-plans`: leitura apenas, `ready: true`, PID 25532, disclosure `2026-10-14.1`, carteira agêntica, modo `limitado`.
2. `--step quiesce --allow-open-plans --execute`: desconectou, drenou por `/agent/run` até resposta `desligado` sem consulta e sem ordem, estado `connected:false` em disco; fatos gravados fora do home (hash do `plans.json` `db52e7e1...b2cf`, 1 plano aberto, EMBER `alvo_10`).
3. Parada do PID 25532 (já quiescente; comando e processo conferidos antes de parar). O supervisor 42272, armado com `--await-handoff`, subiu o filho compilado sozinho, 8 s depois.
4. `--step reconnect --execute`: mesma disclosure, mesma carteira, mesma config por hash, mesmo `plans.json` por hash e mesma quantidade de planos antes do `connect`.
5. `handover-precheck --compare`: `config_unchanged`, `plans_unchanged`, `state_same_meaning`, `state_events_append_only` (5 para 7), `ledger_append_only` (593 para 594), executor único, saúde e ausência de ordem em voo, todos verdes. O único vermelho é `no_open_plan`, esperado: o modo `--allow-open-plans` preserva de propósito o plano de uma posição em carteira.

Custo medido da troca: o agente ficou desconectado cerca de 59 s (11:19:55 a 11:20:54); as saídas do plano EMBER ficaram suspensas nesse intervalo. Nenhuma ordem nova foi enviada pela passagem.

**Por que `--allow-open-plans`:** o agente comprou EMBER às 11:12 durante a preparação, e o modo estrito (`no_open_plan`) poderia nunca assentar com uma posição aberta. O modo é opt-in, exige plano parado por leituras repetidas, relê o conjunto após a prova de dreno (`plans_changed`) e exige o mesmo conjunto na reconexão.

**Cópia durável (P7 pronto, sem esperar 24 h):**

- `C:\Users\gabri\InonuTraderReleases\release24-6dce963a`: cópia fora de qualquer pacote MSIX, 62 arquivos idênticos ao baseline.
- `C:\Users\gabri\InonuTraderReleases\watchdog-p7-20261015`: `inonu-local-logon.ps1`, `health-payload.ps1`, `watchdog-decision.ps1` e `keep-awake.ps1`, somente leitura, byte a byte iguais aos do repositório (SHA256 conferido).
- Tarefa `InonuTrader-Local-Logon` (gatilho de logon do usuário, `Limited`, sem limite de tempo, instância única) registrada com `-App` e `-Repo` apontando para a cópia durável e **iniciada uma vez com `Start-ScheduledTask`** na segunda troca (seção 9.1). A cadeia real de lançamento (tarefa, watchdog, supervisor, filho) foi observada; o gatilho de logon em si não.
- `InonuTrader-Agent-Logon` (a antiga) segue **desabilitada**; definição anterior em `ONLOGON-TASK-ANTES-20261015.xml`. Recuperação: **não** é habilitar a antiga (Codex 175: ela inicia o `main.ts` da árvore mutável, que não é o artefato qualificado). A recuperação é a da linha Reversão da tabela da seção 4: parar o supervisor pelo arquivo de controle, esperar a saída dele e do filho, conferir a porta livre e rearmar o supervisor do MESMO release, uma vez, com `--control` novo. A tarefa antiga fica desabilitada e documentada, não é caminho de volta.

**Ainda não provado:** sobrevivência a reinício do Windows e o gatilho de logon real. A cadeia de lançamento foi provada por `Start-ScheduledTask`, que não é um logon. Não se afirma que o agente volta sozinho depois de um reinício até o primeiro logon real.

**Achado de execução:** `Start-Process -Wait` espera o supervisor destacado (que vive indefinidamente) e travou o primeiro comando de armar; o P1 e a tarefa não usam `-Wait`.

### 9.1 Segunda troca: hospedagem sob o Agendador (achados do revisor, 2026-10-15 11:27 a 11:29)

**Por que:** depois da primeira troca, o supervisor 42272 e o filho 22788 estavam no **mesmo job** que o shell de ferramentas desta sessão (`QueryInformationJobObject` classe 3 listou os dois PIDs; `LimitFlags=0x0`, sem `KILL_ON_JOB_CLOSE` neste nível, mas um job externo aninhado não pôde ser descartado). Além disso, o watchdog registrado não enxergava o 42272: a checagem de supervisor único é por caminho `-App`, e o 42272 foi armado com o caminho físico do pacote da Codex, não com o durável (o `-DryRun` já mostrava "none"). Sem a segunda troca não haveria watchdog até o próximo logon e a continuidade ficaria presa à vida desta sessão.

**Sequência:** (1) `--step quiesce --allow-open-plans` de novo (mesmo `plans.json`, 247 linhas de ordem); (2) parada do supervisor 42272 pelo arquivo de controle (`requestSupervisorStop`, dreno por IPC, sem `Stop-Process`): `local_stopped` 11:27:23, porta 3000 livre em 8 s; (3) `Start-ScheduledTask InonuTrader-Local-Logon`: o watchdog subiu o supervisor 37080 e o filho 35524, `/health` 200 em cerca de 11 s; (4) verificação: imagem com o SHA esperado, LOCK = porta = 35524, três processos fora do job desta sessão; (5) `handover-precheck --compare` contra o instantâneo anterior: config, plans, estado, eventos 7 para 9, ledger 597 para 599, executor único, saúde, sem ordem em voo, todos verdes (só `no_open_plan` vermelho, esperado).

**Achado sem dono conhecido:** o estado registrou `conectou` às 11:27:09, oito segundos depois do meu `desconectou` das 11:27:01 e antes do dreno, e o núcleo antigo rodou um ciclo `decidido` às 11:27:10, sem ordem nova (247 linhas de ordem antes e depois). A chamada tinha origem permitida e cabeçalho de intenção de usuário; a rota é chamada pelo painel (`web/src/lib/agent/client.ts`, por ação do usuário em `AgentView`) e o serviço de rede do app Claude mantém conexões abertas com a porta 3000. Não consegui atribuir o autor. Consequência: o núcleo novo subiu já conectado, com a mesma disclosure e o mesmo conjunto de planos, e o `--step reconnect` recusou corretamente (`reconnect_precondition`, nada mudou). Lição para qualquer troca futura: a quiescência é uma foto, não um bloqueio; um clique externo a desfaz, e só o dreno por IPC depois de reler o estado fecha a janela.

**Tempo parado da segunda troca:** o agente ficou desconectado cerca de 8 s (11:27:01 a 11:27:09) e o núcleo ficou fora do ar cerca de 30 s (11:27:23 a 11:27:53); as saídas do plano EMBER ficaram suspensas nesses intervalos. O primeiro ciclo do núcleo novo foi às 11:29:12.

**Evidência reproduzível:** os instantâneos `precheck-before-pass*.json` e os arquivos de fatos ficaram no scratchpad da sessão (não versionados); os hashes citados acima são os que valem.

### 9.2 Correções do cliente de passagem após a revisão da Codex (notas 174 e 175, revisão `REVIEW-HANDOVER139-20261015.md`)

Valem para **futuras** passagens. Nenhuma passagem foi repetida para testá-las e o agente vivo não foi tocado: tudo foi provado com fakes, mais uma leitura somente leitura do leitor de planos contra o agente real (status e `plans.json` com o mesmo conjunto, 1 plano, digests iguais).

| Achado | Correção em `scripts/handover-quiesce.ts` | Teste que falhava antes |
| --- | --- | --- |
| 1. A última leitura só validava planos | a prova final roda duas observações completas (status, disco, carteira, config, ordens, executor), com 500 ms entre elas, e os fatos devolvidos vêm da última. Um agente reconectado na última leitura sai como `running`, nunca como `quiescent` | nove casos na última leitura (reconectou, ordem em voo, saúde ruim, outra carteira, ordem não conciliada, linha malformada, config, linha de ordem reescrita, outro processo) mais "os fatos são da última observação" |
| 2. O preflight do reconectar não recusava ordem pendente nem ledger ilegível | em todos os modos, antes do `POST /agent/connect`: arquivo de planos legível, ledger sem linha malformada e nenhuma ordem não conciliada; no modo estrito, também nenhum plano em disco. Depois de conectar, as linhas de ordem anteriores têm de seguir intactas (`orders_rewritten`); uma ordem NOVA do agente retomado é legítima quando os planos foram preservados | recusas antes do connect nos dois modos, plano ilegível, linha reescrita depois do connect, ordem nova aceita |
| 3. Quantidade mais hash não prova o conjunto | o conjunto que o status mostra tem de ser, registro por registro, o que `plans.json` guarda (`planSetDigest`: conteúdo canônico de cada plano, ordem ignorada). O `quiesce` devolve `plansDigest`, o arquivo de fatos o guarda e o reconectar o confere quando presente | mesma contagem e mesmo hash com conteúdo diferente, ordem diferente aceita, digest errado recusado |
| 4. O PID inicial era descartado | o PID do começo da passagem é comparado em cada fronteira (depois do desconectar e nas duas observações finais) e, no reconectar, antes e depois do connect. Outro executor, mesmo consistente, invalida a prova (`owner_mismatch` ou `reconnect_not_proven`) sem parar ninguém | executor trocado depois do desconectar, trocado na última leitura e trocado depois do connect |

**Limite que continua valendo:** a igualdade é entre o que o status mostra e o que o disco guarda no momento da leitura, em estado quieto (desconectado, sem ordem em voo). Um campo que o agente atualize sozinho com ele conectado, como o pico de preço de um plano, muda o hash do arquivo entre uma passagem e outra; por isso o `plansHash` e o `plansDigest` são lidos depois do desconectar e comparados só nessa janela.

Verificação: 92 testes em `handover-quiesce.test.ts` (70 anteriores, 22 novos dos quais 19 falhavam antes da correção), 171 nos oito arquivos de passagem, medidor e autostart, `typecheck` sem erro fora de `src/local-host` (que é do pulse em andamento da Codex).

### 9.3 Como a prova de reinício será lida (aberta até acontecer)

O que falta provar é o gatilho de logon e a volta sozinha. Não reinicio a máquina por conta própria (derrubaria as sessões abertas do dono). O medidor passou a reconhecer a prova sozinho, venha ela de um reinício do dono ou de uma atualização do Windows:

- `scripts/observe-24h.ts` agora devolve `recovery.chains` e `recovery.logonProven`. Uma cadeia liga: um início de núcleo que ninguém pediu (sem linha `stopped` antes: queda, corte de energia ou reinício), um início **novo** do watchdog nos 3 minutos anteriores (a tarefa `InonuTrader-Local-Logon` rodando de novo, lido de `autostart-local.log`) e um ciclo `decidido` depois. Um reinício limpo aparece como cadeia, nunca como prova.
- Hoje: `logonProven: false`, com uma cadeia limpa (a segunda troca, 11:27:53, watchdog 11:27:46, primeiro ciclo decidido 11:29:12, 79 s). Isso é a tarefa iniciada à mão, não um logon.
- Para o dono produzir a prova de propósito: no Windows, **Iniciar, Reiniciar** (não "Desligar", que com a Inicialização Rápida mantém o kernel), entrar como `gabri` e esperar cerca de 3 minutos sem abrir nada. Depois rodar `bun --no-env-file run scripts/observe-24h.ts --home <home do agente>`: esperado `recovery.logonProven: true`, `unclean_restart` nos achados (esperado, é o próprio reinício), nenhuma ordem não resolvida, um único núcleo na porta 3000 e a imagem do executável no caminho durável.
- Limites: a leitura vê arquivos, não o Agendador; uma cadeia igual também nasceria de matar o núcleo e rodar a tarefa à mão. Por isso a leitura vale com um reinício real do Windows, e o `unclean_restart` sozinho não prova nada.

**Resíduos da nota 182, também corrigidos (futuras passagens):** (a) logo antes do `POST /agent/disconnect`, depois da espera de até 10 min, o executor tem de ser o mesmo PID do início e o agente continuar conectado e quieto (releitura de status e disco); se não, `owner_mismatch` ou `unsettled_order` com `running` e nada enviado. (b) Antes de CADA `POST /agent/run` do dreno, a identidade e o estado desconectado são reconfirmados em status e disco; se o agente foi reconectado (como no evento da nota 141) ou a leitura falhou, a passagem aborta sem rodar e sem parar nada (`drain_unproven` com `running`, ou `mutation_outcome_unknown`). Isso estreita a janela, **não é exclusão atômica**: leitura e POST continuam separados; uma barreira no servidor seria um delta financeiro próprio, qualificado, e não foi improvisada. 5 testes novos (4 falhavam antes); 97 em `handover-quiesce.test.ts`.

**O que a prova de logon NÃO cobre (achado de 2026-10-15, do log de eventos do Windows).** A tarefa `InonuTrader-Local-Logon` é de **logon**: roda quando alguém entra na conta, não quando a máquina liga. Ontem houve exatamente a falha que importa: desligamento inesperado (Kernel-Power 41) às 22:59:53, nova partida às 23:05:30, a máquina suspendeu de 23:49 a 04:04 e o agente ficou parado cerca de 6 h, até voltar por volta de 05:10. **Correção:** o usuário entrou na conta às 23:06 (`query user`) e o agente não voltou porque ainda não existia início automático (a tarefa de logon só foi registrada em 15/10). Hoje existe, e ela já teria religado o agente às 23:06. O que ela não cobre é o caso em que ninguém entra na conta depois da queda: com a máquina sozinha, ela fica na tela de login e a tarefa de logon não roda. Também medido: na tomada o plano de energia nunca suspende; na bateria suspende após 10 min parados e hiberna após 3 h; enquanto o watchdog roda ele pede à máquina para ficar acordada, mas isso não foi verificável sem administrador (`powercfg /requests`). Quem decide e executa isto é o dono, porque são ajustes de sistema que eu não faço: (1) **entrada automática na conta**, que faz a tarefa de logon rodar sozinha depois de qualquer reinício, ao custo de segurança física (quem ligar a máquina entra na conta). Nesta máquina a política "só Windows Hello" está ligada (`DevicePasswordLessBuildVersion = 2`), então o `netplwiz` não mostra a caixa de senha: primeiro desligar, em Configurações, Contas, Opções de entrada, "Para maior segurança, permitir apenas a entrada com o Windows Hello", e só então usar o `netplwiz`; (2) manter o carregador ligado; (3) nada, e então o agente só volta quando o dono entrar. O medidor agora nomeia esse tipo de buraco (`host_down` com causa `power loss` ou `machine sleep`).

### 9.4 Resultado do teste de reinício (15/10, 12:14), a pedido do dono e com ele na frente do PC

`shutdown /r /t 60` sem `/f`, com o agente saudável, nenhuma ordem em voo e a posição EMBER (`alvo_10`) aberta; instantâneo anterior em `evidence-reboot/precheck-before-reboot-20261015.json`. Linha do tempo medida:

| Hora (local) | Fato |
| --- | --- |
| 12:13:19 | último ciclo antes do reinício |
| 12:14:12 | Windows começa a reiniciar (os processos do agente morrem sem linha `stopped`) |
| 12:14:41 | nova partida do Windows |
| 12:15 | o dono entra na conta (o `query user` mostra o horário do logon, não o tipo de credencial) |
| 12:15:13 | a tarefa `InonuTrader-Local-Logon` dispara sozinha (`LastRunTime`) |
| 12:15:35 | início novo do watchdog (`autostart-local.log`) |
| 12:15:47 / 12:15:48 | supervisor (bun, PID 18792) e núcleo `InonuTrader.exe` (PID 19084) |
| 12:16:11 | primeiro ciclo `decidido`, 22 s depois do núcleo |

**O que ficou provado:** o gatilho de logon dispara depois de um reinício real do Windows; o supervisor e o núcleo sobem do caminho durável (`C:\Users\gabri\InonuTraderReleases\release24-6dce963a`, imagem com o mesmo SHA256 `6DCE963A...`); o agente volta **conectado, sem nenhuma chamada de `connect`** (o estado persistido `connected: true` basta; `state.json` com 9 eventos antes e depois); `config.json` e `plans.json` com o mesmo hash, ou seja a posição EMBER continuou idêntica; ledger só acrescentado (617 para 619 linhas, só ciclos), nenhuma ordem enviada nem pendente; um único núcleo (LOCK, porta 3000 e processo são o 19084), nenhum processo de `src/desktop/main.ts`, a tarefa antiga segue desabilitada; `recovery.logonProven: true` no medidor, com o único achado `unclean_restart` (esperado, é o próprio reinício). Do último ciclo antes ao primeiro depois passaram 2 min 52 s, contra cerca de 2 min 15 s normais.

**O que NÃO ficou provado:** (1) a volta sem ninguém para entrar na conta: o dono entrou na conta (login manual) e a entrada automática continua desligada, então uma queda de energia com a casa vazia deixa a máquina na tela de login; (2) uma queda de energia real: foi um reinício pelo Windows, que encerra os processos mas deixa o disco em ordem; um corte brusco pode deixar arquivos incompletos, e a recuperação disso só é conhecida pelo desenho (recibos, ordens incertas), não por este teste; (3) a recuperação de uma ordem em voo, porque nenhuma estava em voo; (4) ganho: nenhum medido.

**Efeitos colaterais do reinício, e como ler o medidor daqui para frente.** (a) O reinício parou tudo que estava de pé na máquina: depois dele só a porta 3000 escuta (o núcleo empacotado, que serve o painel `INONU TRADER, agente autonomo` com HTTP 200). Os servidores de desenvolvimento e prévia que existiam antes (web em 3001, prévias em 3030 e 3031) **não voltaram** e não foram relançados por mim; o painel do produto não depende deles. Os processos da Codex em `~/.codex/skills/jev-engineering` reapareceram por conta própria às 12:16. (b) Este reinício é um achado **reconhecido**: o `unclean_restart` dele fica na janela padrão de 24 h para sempre. Para a pergunta "há algo novo?" use `--since 1792077350000` (logo depois do início do núcleo pós-reinício, 12:15:49.337); o relatório completo das 24 h segue com a janela padrão e leva esse achado marcado como esperado.

