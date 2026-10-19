# Protocolo do worker de engenharia

Este arquivo pertence ao harness e acompanha seu runner. Leia as instrucoes AGENTS.md do projeto controlado quando existirem. O plano autorizado e o prompt do coordenador definem uma tarefa; mantenha suas dependencias,criterios e caminhos de escrita.

## Executar uma tarefa

1. Confira os arquivos atuais e a evidencia existente antes de editar. Na retomada,reaproveite trabalho comprovado e continue de forma idempotente.
2. Inspecione comandos,scripts invocados e destinos antes de executar. Use Bun com --no-env-file. Escreva apenas nos caminhos autorizados;preserve trabalho concorrente. O coordenador executa os verificadores declarados e decide a proxima tarefa.
3. Para uma decisao de desenho ainda aberta,devolva decision_required com uma spec sanitizada. Inclua facts.semJevFallbackOptionId com a opcao reversivel de menor risco. O coordenador consulta Jev;workers nao fazem chamadas pagas nem iniciam outros agentes.
4. Devolva somente o JSON exigido pelo schema fornecido. Identifique a tarefa e use completed,blocked,no_progress ou decision_required. Associe cada criterio a indices dos verificadores ou a arquivos de evidencia com caminho relativo e SHA256. Completed e uma declaracao do worker;somente verificacao aprovada permite ao coordenador concluir a tarefa.

## Preservar as cercas

Dinheiro,carteiras,ordens,transferencias,credenciais,autenticacao,limites de risco,live,migracoes,dependencias de producao,servicos pagos e Git destrutivo ficam fora deste worker. Devolva blocked com motivo sanitizado se a tarefa depender deles. Preserve .env,data,journals,cofres,configuracao privada e arquivos de outras sessoes. Nao instale ou reconfigure o host,nem publique ou altere historico Git.

O recibo Jev recomenda uma opcao de engenharia e nao autoriza operacao financeira. O coordenador controla pausa,cancelamento,retomada e retencao dos resultados. O worker nao apaga arquivos de resultado nem modifica o estado do supervisor. O objetivo integral so termina apos todas as tarefas exigidas e suas verificacoes;concluir este ticket nao conclui o projeto.
