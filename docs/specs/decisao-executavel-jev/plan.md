# Plano: evidência executável no Brief do JEV

## Abordagem

Preservar a fronteira isolada da entrega em dois cortes funcionais independentes e uma integração:

1. Sonda e projeção: distinguir recusa, falha e desconhecido, todos com TTL curto existente de 60 segundos. Uma observação com impacto numérico finito usa o TTL existente de 5 minutos. Impacto só é aplicável quando finito. Após expiração, uma nova observação bem-sucedida permite reavaliar. Preservar os triggers existentes, filtros, limites e ordenação. Em `report.view`, manter causa correta e reservar uma das quatro marcas para a recusa, sem nova marcação de valor abaixo do mínimo.
2. Brief de posições: serializar `posicoes.t` apenas quando houver alertas, preservando seus códigos e a legenda `posicoes.g`. Não afirmar ausência de `t` no HEAD limpo.
3. Integração: revisar somente a fatia autorizada, rodar os testes e smokes listados em `tasks.md`, atualizar evidências, efetuar commit e atualizar o software local apenas após gates aprovados e conferência de estado. Não reiniciar, publicar ou disparar operação financeira sem autorização específica; não alterar live, risco, cadência, orçamento, credenciais ou schema.

## Arquivos e fronteira

O port documental está limitado a `docs/specs/decisao-executavel-jev/{spec,plan,tasks,status}.md` e uma ligação mínima em `docs/index.md` na árvore limpa. Nenhum código ou documento de outra sessão entra nesta entrega. A referência `C:/Users/gabri/jev-trader` não é fonte de prova para este commit e não deve ser alterada.

## Riscos e trade-offs

- Falha e desconhecido não são recusa explícita; confundi-los bloquearia indevidamente a avaliação.
- Expiração permite reavaliação, mas não comprova que falhas posteriores à execução eram detectáveis pela sonda.
- O relatório tem limite de quatro marcas; garantir a causa da recusa sem alterar o schema.
- O processo instalado reportou versão `0.0.2` e `startedAt` `1792077348955`; esses dados não identificam hash de commit nem provam que contém este port.
- Não tratar gates anteriores do checkout de referência como prova das mudanças isoladas.

## Verificação

A integração executou os testes de regressão e smokes previstos, `bun run typecheck`, `bun run test` e `bun run test:lab`; build e selftest qualificado também passaram. Resultados observados constam em `status.md`. Revisão sem findings. O commit está pendente e a atualização local permanece bloqueada até reconciliação das operações incertas e quiescência autorizada.
