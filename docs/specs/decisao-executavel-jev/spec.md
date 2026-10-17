# Spec: evidência executável no Brief do JEV

Status: verificação integrada concluída; commit pendente e atualização local bloqueada
Dono: usuário, no escopo de melhorar e configurar o software sem realizar operações

## Contexto

Esta entrega porta duas correções de informação antes da consulta ao JEV: preservar a recusa explícita da sonda gas station, distinguindo-a de impacto desconhecido, e incluir no Brief os alertas de posição já produzidos pelo ciclo. A documentação descreve somente essa fatia isolada. Não afirma que `posicoes.t` estivesse ausente do HEAD de base.

## Metas

- Uma recusa observada `gas_station_pendente` impede opções de compra para o candidato durante a validade da observação, preservando a opção skip e sua causa.
- Impacto desconhecido não é convertido em recusa nem fecha o candidato. Aplicar somente impacto finito existente.
- Recusa, falha ou desconhecido na sonda usa o TTL curto existente de 60 segundos. Uma observação com impacto numérico finito usa o TTL existente de 5 minutos; não adicionar retries nem chamadas.
- Após expiração, uma observação bem-sucedida permite nova avaliação; preservar ordenação, limites de sondagem, filtros e triggers existentes.
- `report.view` conserva a causa `gas_station_pendente` e sua marca entre as quatro marcas exibidas, mesmo quando outras quatro já estavam presentes.
- Serializar `posicoes.t` somente quando não vazio, preservando os códigos de alerta existentes e a legenda `posicoes.g`.

## Não metas

- Operar, assinar ou transmitir transações, ativar live ou realizar ações financeiras.
- Alterar limites de risco, orçamento, cadência, credenciais, schema ou triggers existentes.
- Acrescentar chamadas pagas, retries, telemetria privada ou recomendações de posição.
- Mudar a semântica de falhas históricas posteriores à execução.

## Critérios de aceitação

- [x] A recusa explícita atravessa o adapter e retira opções de compra somente do candidato afetado, mantendo skip e motivo.
- [x] Desconhecido continua distinto de recusa; recusa, falha e desconhecido usam TTL de 60 segundos, e impacto numérico finito usa TTL de 5 minutos, com recuperação por nova observação.
- [x] `report.view` informa a causa e inclui sua marca sem falsamente classificar como abaixo do mínimo e sem perder a marca por limite de quatro.
- [x] `posicoes.t` é omitido quando vazio e mantém os alertas existentes quando preenchido; `posicoes.g` continua presente.
- [x] Testes, smokes e gates integrados passaram; resultados observados constam em nos `spec-*` do grafo.
- [x] Revisão independente concluída sem findings; gates, build e selftest do artefato local estão registrados em nos `spec-*` do grafo.
- [ ] Commit e atualização local permanecem condicionados à preservação de estado e gates. A atualização está bloqueada até reconciliação das operações incertas e quiescência autorizada. Sem operações financeiras ou mudanças em live, risco, cadência, orçamento, credenciais ou schema.

## Restrições e decisões

A sondagem distingue recusa explícita, falha e desconhecido sem aumentar chamadas nem alterar a política financeira. Os alertas serializados são observações existentes, não instruções ao modelo. A base limpa já contém a legenda `posicoes.t`; esta entrega não a atribui como ausente. A fronteira de entrega é a árvore limpa definida para este port; não alterar o checkout de referência sujo.

## Plano de tasks

Plano, tarefas e estado: nos `plan-decisao-executavel-jev` e `spec-*` do grafo.

## Perguntas em aberto

- Nenhuma pergunta de produto em aberto. O commit está pendente; a atualização local permanece bloqueada até reconciliação das operações incertas e quiescência autorizada.

## Status

- Fase atual: verify concluído, aguardando commit e resolução do bloqueio de atualização
- Aprovado em: conforme decisão do usuário registrada para esta entrega
