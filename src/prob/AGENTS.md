# Biblioteca probabilistica offline

Spec, plano e tasks vigentes: ../../docs/specs/prob-offline-integration/. A fonte goal1 e seus documentos antigos permanecem preservados.

Biblioteca pura e deterministica. Sem disco, rede, agente, ambiente, relogio global ou aleatoriedade global. Imports apenas internos. Ausencia e null, nunca zero inventado. Retornos sao brutos de custo e nao qualificam operacao real. Preservar purga temporal e referencia de taxa-base no treino.

Somente scripts/prob-cycle.ts faz I/O. Nao executar contra journals reais nesta tarefa. Nao remover leaksIn nem a fronteira de pureza. Sem ponto medio, travessao ou meia-risca em texto. Alteracoes em parametros/rotulos exigem versao da suite; contrato de relatorio exige versao do relatorio.

Verificar: bun --no-env-file test src/prob scripts/prob-cycle.test.ts; typecheck, test e test:lab conforme AGENTS.md raiz.