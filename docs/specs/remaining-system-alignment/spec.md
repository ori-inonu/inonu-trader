# Alinhamento das atualizacoes pendentes

Estado: em andamento. Objetivo integral: alinhar as implementacoes e a limpeza pendentes com main, validar o sistema e observar o agente no navegador. Resultado financeiro e consulta real ao modelo ainda nao estao demonstrados.

## Evidencia inicial

- Main local e remota verificadas em 2327a2885e9d513833a91e820b17d568be2c0303. Historico das branches locais contido em main.
- O inventario inicial registrava 13 conflitos. A revalidacao desta passagem encontrou um, em scripts/jev-consensus.ts. Goal1 mantem limpeza, reorganizacao documental e consolidacao de cliente API ainda nao integradas integralmente.
- Coleta publica anterior: 90/90 respostas de dados, 29/30 snapshots utilizaveis; amostra 17 bloqueada com validade zero. Sem inferencia Jev ou agente completo medido.
- Aba http://localhost:3000/#comando observada com ERR_CONNECTION_REFUSED nesta continuacao.
- src/real/jev.ts oferece apenas hold e insufficient_evidence e envia candidates vazio. Essa interface nao prova o comportamento do agente de carteira em src/agent.

## Aceitacao integral

- Cada delta pendente deve ser classificado como integrado com prova, duplicado com prova, substituido com justificativa ou bloqueado com motivo. Arquivo produzido ou teste preparado nao conclui implementacao.
- Limpeza intencional deve ser preservada quando referencias e testes sustentarem a remocao. Nao copiar a arvore antiga sobre main nem descartar mudancas concorrentes.
- Preservar bytes dos artefatos v1 e o historico append-only do cerebro. Migracao documental nao autoriza eliminar esses artefatos.
- Typecheck, testes core e laboratorio devem passar no candidato final; mudancas web exigem tambem as verificacoes web do AGENTS.md.
- Abrir o aplicativo real no navegador e distinguir estado observado, simulacao, coleta publica, inferencia e execucao. Ausencia de processo ou dados e um bloqueio observavel.
- Medir latencia por etapa, frescor, recusas, custo desconhecido e retorno liquido conciliado quando houver evidencia elegivel. Nao inferir lucro composto a partir de latencia ou testes sinteticos.

## Primeira tarefa de codigo revisavel

Remover somente dez marcadores export de declaracoes internas em nove modulos, conforme proposta literal versionada na .scratch desta sessao. Preservar corpos, valores, imports, textos, demais exports, limites, journals e operacao.

Busca por simbolos em src, scripts e web/src nao encontrou consumidores nomeados externos dessas declaracoes; campos homonimos existem. Essa busca nao prova ausencia de consumidores dinamicos. Typecheck e testes existentes sao obrigatorios; nao inventar novos testes que apenas espelhem a retirada da palavra export.

Decisao de design consultiva: Jev tool scoped_export_cleanup, recibo 6ae7f306-dd79-4efb-b355-fbf71513f580, confianca 1. Preparacao e execucao permanecem limitadas pela autorizacao nativa.

## Fronteiras

Nao alterar Market.init(), autorizar ordens, assinar, transferir, mudar limites de risco, acessar credenciais, contratar servicos ou migrar journals nesta tarefa. O pedido financeiro do dono foi registrado; nao substitui evidencia de qualificacao nem autoriza o agente desta sessao a executar transacoes financeiras.

O caminho de preview usa o servidor Next em modo de desenvolvimento, que oferece revisao somente leitura. Se o core estiver ausente, deve mostrar indisponibilidade, sem fabricar ciclos.

## Revalidacao executada

Em main 2327a28, a nova coleta concluiu 30/30 snapshots publicos ready, com timestamps e prova de relogio por amostra. A expiracao anterior nao se repetiu; sua causa especifica continua indeterminada. Os 193 testes de src/real passaram antes da limpeza.

O painel atual foi aberto em localhost:3001 e mostrou status e analise indisponiveis. Ele consulta o agente de carteira em localhost:3000. O runtime paper independente em 3020 produziu 25 ciclos hold, sem inferencia, e coleta publica real. Seus endpoints /api/real nao atendem as rotas /agent do painel. Essa observacao nao satisfaz a inferencia completa; os processos de observacao foram encerrados e sua ausencia foi confirmada por PID.

A limpeza literal passou em tipos, 8539 testes core (2 skip, 0 fail) e 650 testes lab (0 fail). A main permanece na base. O consenso do projeto ja permite chamadas sem teto diario e por execucao por padrao. O teto separado de 20 tentativas era do Jev Engineering global; seus fontes e conector ficaram indisponiveis durante o ajuste. O instalador parou antes de escrever e o ajuste global continua pendente.
