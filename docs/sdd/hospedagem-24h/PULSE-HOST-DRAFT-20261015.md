# Pulse no host local: testes preparados, execucao bloqueada

Escopo: transporte tipado descrito em ADENDO-F-pulse-no-artefato-local.md. Nao liga feed, modelo ou executor. O pacote24 e as tarefas instaladas permanecem fora deste delta.

## Estado verificavel

Os quatro runtimes continuam exatamente como antes: plan08980875592d8ed88b9ed9055689c07a5409463aa4ea34b08750462c2048d1f4; main07d2b07a607249f0df4e4b08e814002403cac6f5f6827ab347a6d9ef157a8899; core-entry72ea917009147d58edec46527e7f30b6ed893f5986c179d4f6c5602b996bf21a; service510e0b7d04447bb15300f5d04d570744b68a0505445242a7b5db6c8a46fad086.

Foram escritos testes novos, sem implementar as funcoes ainda:

- adapter.test.ts: pulse explicito chega ao argv do filho, ambiente nao o habilita nem transporta URL.
- pulse-options.test.ts: rejeicao selftest/pulse e preservacao da flag, handoff e controle no comando do supervisor destacado.
- service.test.ts: o handler recebe sempre booleano explicito; selftest o desliga.
- desktop/handlers.test.ts: pulse false vence ambiente1 e sockets falsos usam somente o endereco publico existente.

Pins dos testes: adapterd759d61b207ae070eb66b4fdfa5127453fdaafa8f7c2555d651b7a775dcc185b; pulse-options0d9b027a0bb1e54e065167c27c4f0e07fe103c2d08fae1014ac647377eb8fd50; service0ffae7add968abb065613b60f1676eb4147c4a295a743d87c4a561aa62910a22; handlers107b5449b9782b2d9c7fb052213172bc0f68dbde10097a789a57faee75bd1b77.

O comando abaixo foi recusado pelo hook ANTES de executar. Nao existe log RED nem resultado de testes. As funcoes localPulseOption/localSupervisorPlan ainda nao existem e o overload localCorePlan ainda nao aceita opcoes; estes sao testes WIP deliberadamente anteriores a implementacao, nao fonte qualificada para novo release ou linha de base de tipos verde.

```powershell
bun --no-env-file test --parallel=1 --timeout 15000 src/local-host/adapter.test.ts src/local-host/pulse-options.test.ts src/local-host/service.test.ts 2>&1 | Tee-Object -FilePath docs/sdd/hospedagem-24h/PULSE-HOST-RED-20261015.log
```

Bloqueio concreto: `dynamic execution still needs concrete local review`, apesar da recomendacao advisory allow. Identificador271c2a158626, expiracao15min conforme skill; uma autorizacao antiga nao substitui uma nova nem prova execucao. Nao executar por outro agente, ferramenta ou variante para contornar a negativa.

## Proxima implementacao apos RED autorizado

1. localCorePlan recebe opcoes opcionais e adiciona somente --pulse ao comando do exe. A allowlist de ambiente nao muda.
2. localSupervisorPlan constroi o comando destacado preservando --pulse, --await-handoff e --control. main usa esse comando e passa pulse tambem ao localRuntime em primeiro plano. Isso cobre os dois percursos sem nova opcao de URL.
3. localPulseOption recusa --selftest junto de --pulse antes de qualquer home/vault/servico. core-entry entrega o booleano e publica somente o codigo seguro dessa falha.
4. startLocalService passa sempre pulse: options.pulse === true && options.selftest !== true.
5. Testes pertinentes e tipos, revisao independente em copia sem deriva, nova captura e selftest compilado permanecem obrigatorios. O teste compilado deve comprovar que o selftest nao cria socket/modelo/agente. Somente depois, coordena-se uma futura passagem; nenhuma ativacao e implicita pela existencia destes testes.

Este delta e um transporte para o pulse de regime de minutos ja existente. Nao prova50mercados simultaneos, deteccao subsegundo de arbitragem, retorno, B ativo, memoria madura ou promocao automatica.
