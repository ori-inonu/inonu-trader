# Revisao da passagem139

Parecer: cliente ainda nao aceito. Revisao de leitura do snapshot139, anterior a qualquer correcao174. Os 13 hashes de fontes e testes iniciais/finais foram conferidos pelo revisor independente; nao houve deriva. Esta revisao nao executou testes novos nem conferiu runtime, tarefa Windows ou carteira. A passagem140 e relato do autor, posterior a leitura inicial, e nao deve ser reexecutada para produzir provas.

## Achados

1. `scripts/handover-quiesce.ts:300`: a ultima leitura end2/p3 so valida hash/quantidade de planos. Os demais invariantes foram checados no estado anterior end/p2. Reconexao, ordem nova/incerta, saude ruim ou troca de carteira/config/ledger na ultima leitura ainda permitem retorno quiescent:true. Revalidar todos os invariantes na ultima observacao e usar os fatos dessa observacao.
2. `scripts/handover-quiesce.ts:352`: o preflight de reconnectAgent nao recusa unsettledOrders/ledgerMalformed nem exige planos persistidos legiveis em todos os modos antes de POST connect. No modo de preservacao, a checagem posterior admite ordens pendentes. Recusar estado previo ilegivel ou ordem nao conciliada antes de conectar; apos conectar, distinguir novas ordens legitimas de pendencias herdadas.
3. `scripts/handover-quiesce.ts:355`: quantidade em memoria mais hash do arquivo nao prova identidade do conjunto carregado. Status fornece PositionPlan[] e disco fornece record de PositionPlan, permitindo comparacao canonica do conteudo e da identidade de cada plano antes de conectar.
4. `scripts/handover-quiesce.ts:265`: o PID capturado por prepare e descartado. As verificacoes seguintes exigem coerencia interna do executor atual, mas nao continuidade com o inicial. Manter o PID inicial e compara-lo em cada fronteira da quiescencia. Uma mudanca concorrente deve invalidar a prova, sem encerrar outro processo.

As correcoes anteriores de exatamente um core, igualdade entre LOCK/porta/core, reconhecimento de InonuTrader.exe e inventario CIM desconhecido estao presentes. Isso nao qualifica o fluxo completo. Vetores sinteticos para os quatro achados ainda sao necessarios antes de aceitar a revisao corrigida.

## Pins de runtime

| Arquivo | SHA256 |
| --- | --- |
| handover-precheck.ts | 5727779076c909e62380b9113ffe857058df3362143383891eaf20197af1d5dd |
| handover-quiesce.ts | 58619d7934bc7c51a775e631cc493c811777cd0573639a174b9b488524a5c88c |
| handover-run.ts | 17450fc664c07717bda5f39ad6bd5f53bb3eca424c8699f3c2a5d30c87b6bd7d |
| handover-release-check.ts | 368dc0f16f6a235aa489848c1b407b5bec281025e2918dda4d5bdafd35afdf2e |
| inonu-local-logon.ps1 | a4da8a7ff8248d77b57560dd9a6685427d665203558597b14e6dbf9d856cfa97 |
| watchdog-decision.ps1 | 810d6b96aa9152808efd0d98918c7b2700a31e9fd6683b0d545dd72c492fe85c |
| health-payload.ps1 | c956ead37b938dfeeeb12e5b01400f011a930f68876290495ffd7d23ce9e9f2a |

## Limites da verificacao

As duas tentativas do revisor de criar copia isolada foram recusadas pelo hook antes de executar. Nenhum teste novo ou arquivo de prova foi criado por ele; este documento root preserva o parecer recebido no chat. Os 127 testes da nota139 continuam atribuidos ao autor. Os testes root anteriores75 e tipos verdes sao de outro snapshot e nao sao reaproveitados como qualificacao139.

A tentativa root de conferir os62 arquivos do destino externo tambem foi recusada. O dono enviou a autorizacao819b1fc87114; o retry literal continuou recusado, agora com identificadorf02729dafb86. Nao ha resultado de verificacao root. A copia externa feita pelo Claude nao foi delegada por root como contorno. Nao sobrescrever esse destino nem usar uma autorizacao antiga para executar uma copia que perdeu a finalidade.
