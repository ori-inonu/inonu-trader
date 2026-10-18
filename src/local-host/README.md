# Agente local continuo

O supervisor executa um programa compilado fixo, sem watch, sem prazo de inatividade e sem precisar da pagina aberta. Verifica a porta 3000 antes de iniciar, aguarda a saida do filho que criou e tenta novamente depois de 5, 10, 20 e 40 segundos. Depois dessas quatro tentativas seguidas para e registra a falha. Um filho que permaneceu dez minutos depois do sinal privado LOCAL_READY_MESSAGE renova esse orcamento: ficar preso na inicializacao nao conta como periodo saudavel. Nao encerra programas estranhos, nao remove LOCK/STOP e nao mata um processo porque o health demorou.

Um nucleo que ja existe, inclusive um iniciado pelo Claude, e detectado mas nao fica supervisionado por este lancador. A troca de lancador precisa encerrar o anterior de forma qualificada; nao iniciar dois nucleos ou trocar a pasta de dados. A chave e a sessao permanecem nos mecanismos existentes do app e da OKX. O supervisor so herda caminhos do Windows.

Com --await-handoff, o supervisor pode ficar armado em segundo plano enquanto o Inonu existente continua operando. Ele observa somente health/porta a cada cinco segundos, nao adota nem encerra esse processo e inicia seu proprio filho somente depois da ausencia comprovada da porta. O log registra local_waiting uma vez. Uma porta ocupada por outro programa ou health desconhecido termina a espera sem substituicao. Cancelar a espera nao para o app alheio. Esse estado e "em espera", nao prova de supervisao do nucleo atual. Inicie uma unica espera e confira seu PID antes de repetir um comando cujo resultado foi desconhecido.

## Preparar e conferir

Na raiz, com Bun instalado, gere o artefato somente depois de requalificar o nucleo e a interface da mesma revisao:

```powershell
bun --no-env-file run src/local-host/build.ts --out 'C:/Users/gabri/jev-trader/dist/local-agent-20261014'
```

Isso compila src/local-host/core-entry.ts, exporta a interface estatica local e gera a lista de hashes. Exige um diretorio de saida novo, para nunca substituir um exe em uso. A exportacao usa web/out-inonu-local-<hash do output>, um diretorio novo exclusivo do pacote; nao limpa a interface servida pelo nucleo ativo. Para reutilizar uma exportacao conferida, --skip-web exige --web com caminho absoluto explicito. Nao inicia o agente. O supervisor recusa um arquivo listado cujo hash mudou. Essa lista e uma impressao digital local, nao uma assinatura do publicador nem uma protecao contra alguem com controle da mesma conta Windows. Arquivos extras nao listados nao sao certificados. Nao use o pacote de scripts/build-desktop.ts como se fosse esta entrada com IPC.

Para a verificacao sem fundos:

```powershell
bun --no-env-file test src/local-host
bun --no-env-file run typecheck
bun --no-env-file run src/local-host/check-compiled.ts --app 'C:/Users/gabri/jev-trader/dist/local-agent-20261014/app' --report 'C:/Users/gabri/jev-trader/dist/local-agent-20261014/selftest.json'
```

Os testes de processo usam scripts ficticios. check-compiled sobe o exe em --selftest --selftest-wait, home temporario novo, porta efemera, store sem descoberta Windows, rede externa e agente desativados. Confere origem, ausencia de credenciais e scheduler, envia IPC e exige saida zero. Nao abre o cofre, nao consulta modelo/provedor e nao envia ordens.

## Iniciar depois da troca qualificada

Com o lancador anterior encerrado e a autoridade inicial concluida pessoalmente pelo dono:

```powershell
bun --no-env-file run src/local-host/main.ts --background --app 'C:/Users/gabri/jev-trader/dist/local-agent-20261014/app' --home 'C:/Users/gabri/AppData/Local/Packages/Claude_pzs8sxrjxfjjc/LocalCache/Local/InonuTrader'
```

--home absoluto e obrigatorio. A pasta acima e o home real observado do Claude MSIX nesta maquina; o LOCALAPPDATA de um terminal externo aponta para outro lugar. Usar outro home perderia a continuidade de ledger, planos, sessao e LOCK. Confira o caminho na troca, sem copiar credenciais. O supervisor fica em segundo plano independente do terminal que o iniciou. A pagina em http://127.0.0.1:3000 mostra a autoridade financeira efetiva e o registro de cada ordem. O log fica em <home>/logs/local-supervisor.log. Fechar a pagina nao interrompe o supervisor. Desconectar a carteira na pagina impede novas operacoes do agente; uma transacao ja transmitida precisa de conciliacao.

Manter computador na tomada, com rede e sem suspensao. A leitura de powercfg em 2026-10-14 confirmou suspensao e hibernacao desligadas na tomada nesta maquina; nada foi alterado. Reinicio/logoff do Windows encerra estes processos: inicializacao no logon ainda precisa ser configurada e qualificada. Sessao expirada/revogada e indisponibilidade de provedor bloqueiam operacoes, nao podem ser removidas pelo supervisor.

Interromper o supervisor em primeiro plano envia `{ kind: "INONU_LOCAL_STOP_V1" }` somente pelo canal IPC privado do filho proprio e aguarda a saida. Nao ha fallback de kill: no Windows ele pode terminar sem executar o handler SIGTERM. core-entry reconhece a mensagem desde a inicializacao, drena o agente e so entao fecha servicos/socket e sai explicitamente. No timeout conserva processo/LOCK e repete o mesmo dreno a cada trinta segundos ate terminar. Falhas anteriores a existencia do servico saem explicitamente com codigo de erro: o canal IPC nao pode mante-las presas em um processo vivo. Recuperacao de crash depende do journal anterior ao envio, LOCK unico e recibos: o supervisor nao presume que uma ordem foi concluida nem resolve uma ordem incerta.

## Manutencao do supervisor em segundo plano

A partir da15, --control aceita um caminho absoluto privado para um pedido de parada. control.ts cria uma sessao exclusiva por lancamento com PID e nonce aleatorio; requestSupervisorStop exige a sessao e o PID exatos. Pedido velho ou malformado nao para outro lancamento. O pedido faz o supervisor enviar o IPC de dreno ao proprio filho e aguardar sua saida. Nao ha porta de controle nem segredo financeiro nesse mecanismo. Os arquivos ficam em pasta privada da conta local e nao devem ser publicados. Use caminho de controle novo por lancamento; nao sobrescreva sessao ou pedido que nao reconhece.

O supervisor14 antigo nao tinha receptor externo. Sua migracao15 ocorreu apos quiescencia financeira comprovada: agente ja pausado, sem planos e voos, desconexao pela API autorizada, espera do single-flight por /agent/run ate resposta desligada sem consulta/ordens, estado desconectado relido do disco, hashes da config e das linhas de ordem preservados e CIM/caminho/SHA dos processos proprios confirmados. So entao os programas ja desligados foram encerrados. Isto nao e fallback para terminar um trader ativo ou com dreno incerto. maintenance.ts prepara a prova e nunca encerra processo; a persistencia e a identidade de SO tambem devem ser verificadas antes da manutencao. Nenhum LOCK/STOP foi removido manualmente. Novas manutencoes usam o controle privado e o dreno normal.

Em22:44:27UTC a captura15 substituiu a14: supervisor29728, filho10640, no mesmo home MSIX. Captura1525arquivos, backend1734pass/7480assert, frontend121pass/671assert, typecheck e build3rotas verdes. EXE eeaf5aaf0df68210d842b096e40e4868902c78ab437e63ab868b57ca0bb60f63, seal39arquivos e selftestcompilado sem credenciais/rede/scheduler, com paradaIPC e exit0. Reconexao pela API sob o disclosure ja autorizado preservou84/720. O proprio agente registrou retomou/pausa_reavaliada e removeu a pausa antiga disjuntor_de_perda que vinha do Placar contrafactual. Observacao seguinte85/720 com nova consulta do Jev e quatro compras abertas. Esses fatos de operacao nao provam lucro ou24h decorridas.

## Evidencia desta revisao

Atualizacao16 em2026-10-14T23:05:17UTC: supervisor26660,filho15700,mesmo home MSIX,connected preservado sem reconexao e93/720consultas. O controle privado da15 pediu drenoIPC; supervisor29728/filho10640 sairam normalmente em23:05:01UTC antes da nova partida. Nenhum kill,desconexao ou alteracao manual de state/ledger/LOCK/STOP. Configuracao preservada por hash. Captura1525arquivos em3copias sem divergencia;backend1780pass/7702assert,web121pass/671assert,typecheck,Next3rotas,Bun279modulos,seal39arquivos e selftestcompilado qualified:true/IPCstop/exit0 sem rede financeira. EXE7a07a2e4e04df1e52faf2b153a838022d88221fea3ff24041e911aa59572009b em revision-16-build/local-package/app. A copia inicial de build com junction web externa falhou e foi preservada; a copia byteidentica usada no build possui dependencias web proprias do lockfile. Esta revisao corrige semantica do Brief e fatos de execucao, sem prova de lucro. O primeiro ciclo e aguardado conforme horario persistido, sem reiniciar contador ou antecipar ordem manualmente. Historico anterior abaixo.

A captura privada revision-14 de 2026-10-14 contem 1513 arquivos, sem deriva, e passou em 1707 testes de agente, desktop, servidor, lancador, auditor, oportunidade e Inonu, com 7358 asserts. A interface reutiliza os mesmos bytes conferidos das capturas12/13, com 120 testes/663 asserts, build Next verde, fontes locais e licencas. Comparacoes entre as capturas provaram que mudaram somente arquivos do backend e do lancador, sem import desses modulos pelo frontend. Novo build Bun e seal de39arquivos; exe SHA256 ea2f2b8148fa541a0fc4412ce2f2b2fb2e5650b7e817a60ceebf5979df119608. check-compiled deu qualified:true, IPC privado, exit0, sem modelo/OKX/scheduler/rede financeira. Typecheck raiz verde. A espera foi armada uma vez com --background --await-handoff, no mesmo home MSIX, e PID/log observados; o nucleo do Claude continuava ativo e ainda nao pertencia ao supervisor nessa leitura. Essa prova nao e uma janela real de24h nem promessa de retorno. Logon Windows nao configurado. A revisao independente dos fixes de dreno anteriores foi recebida no arquivo de coordenacao44A; a nova espera tem testes de cancelamento/exclusao/processo e as fontes financeiras congeladas foram verificadas por hash. Mudancas posteriores exigem qualificacao correspondente antes de trocar o artefato.

Em 21:49:29 UTC a espera iniciou seu proprio filho14; PID/parent e caminho do exe foram observados. O caminho da CLI salvo dentro do Claude era virtual e nao existia fora do MSIX. Foi criado somente um hard link do executavel fisico existente no caminho logico configurado, depois de verificar ausencia do alias e igualdade do SHA esperado, sem alterar configuracao ou copiar credenciais. O SHA dos dois caminhos permaneceu d7f8c8dfbd98f4e3eb9f4a7f2d8bd4167cc861322e28598db30ea9d7d08b5fe8. Em 21:59:56 UTC o filho supervisionado publicou carteira conectada, autoridade dinheiro, bloqueio null, LOCK proprio e75/720 consultas, com novo ciclo do Jev sem bloqueio de execucao. O contador, a sessao e o home foram preservados. Este e o estado observado apos a troca; nao e promessa de lucro nem prova de24h decorridas.
