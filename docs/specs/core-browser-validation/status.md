# Estado

Fase: build, HTTP e observacao visual concluidos com perfil vazio. Objetivo integral de alinhamento e qualificacao do agente continua aberto.

A porta desktop correta e 47321. O processo finito usou launch/createDesktopHandlers/createAgentService de producao, export estatico atual, home novo e createSettingsStore com runtimeKey explicitamente nulo. Nenhum vault, .env, conta ou perfil pessoal foi carregado. agent=false desliga o agendador, mas nao e uma barreira universal para runNow manual; esta observacao enviou somente GET e nao acionou controles da UI.

Build Next 16.3.4 com webpack: exit 0, seis paginas estaticas e 46 arquivos de saida. A guarda do wrapper parou depois do build porque o Next gerou imports .next/types em next-env.d.ts, diferentes da previsao inicial. O diff foi inspecionado e somente esses imports foram restaurados, byte a byte, sem repetir o build. tsconfig.json permaneceu identico. A checagem web posterior retornou exit 0.

GETs de health, status, dev-status, analise, inonu/status, inicio e configuracoes retornaram 200. A rota aposentada /console retornou 404. Status sem origem e com origem externa retornou 403. O status antes e depois manteve modo desligado, connected=false, modelo/credenciais/CLI ausentes, scheduler.started=false, zero consultas, ledger e inFlight vazios, last=null e enderecos geridos nulos. O primeiro status levou 10,748 ms e a primeira analise 7,479 ms; isso mede handlers locais sem ciclo do agente.

A nova aba IAB mostrou a chamada para conectar carteira na pagina inicial. Configuracoes mostrou Nucleo local Respondendo, Modelo Sem chave e Credenciais OnchainOS Ausente. Nenhum controle de chave, carteira, configuracao ou consulta foi acionado. Zero avisos/erros foram capturados pelo console da aba. Capturas browser-initial.png e browser-settings.png preservadas localmente; a captura textual posterior de configuracoes e apenas um diff sem mudancas, e nao uma arvore completa.

O filho encerrou com exit 0 em 47,897 s apos o marcador de parada; os PIDs e a porta foram conferidos ausentes. A aba de diagnostico foi fechada. Nenhum dos 2536 arquivos rastreados de src/scripts/web e evolucao mudou. O perfil novo conservou somente quatro arquivos de memoria de fluxo publico. A aba pessoal antiga e o gateway global permaneceram alheios a esta verificacao.

Evidencia local no checkout original: .scratch/core-browser-validation-20261018/, incluindo build.json, runtime.json, http-before-browser.json, http-after-browser.json, validation.json, logs, hashes e capturas. Os arquivos de perfil e evidencia nao sao publicados no PR.

O export documental antigo fato-como-rodar ainda descreve start/3000. package.json start realmente aponta ao entrypoint legado src/index.ts; o desktop usa launcher/core e 47321. Um fato complementar ligado ao ID canonico registra a diferenca, sem apagar o historico, trocar o comando de inicializacao ou iniciar o agente.

As suites integrais da coorte de codigo 7dc4574 continuam aplicaveis por igualdade exata de fontes: tipos core/web exit 0; core 8544 pass, 2 skip, 0 fail; lab 650 pass, 0 fail; web 3821 pass, 0 fail. Nesta fatia tambem passaram build e nova checagem de tipos web. Nenhuma fonte do produto mudou.

O consenso do projeto ja esta sem teto diario em origin/main 2327a28. A regressao focada passou: 3 pass, 0 fail, 10 expect() calls, incluindo reserva de 1200 consultas e contagem preservada. O ajuste global separado continua inaplicado por ausencia da instalacao ativa. Ver ../remaining-system-alignment/decision-limit-status.md para os escopos distintos.

Limite de evidencia: a integracao com perfil vazio funciona e exibe as ausencias reais. Nao houve ciclo operacional, inferencia pelo painel, candidato de ordem, assinatura, fill, resultado financeiro ou qualificacao de producao. As cinco consultas publicas anteriores do adaptador permanecem evidencia separada.
