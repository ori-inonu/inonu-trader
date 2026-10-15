# Correção de coerência do Radar

Complemento de RADAR-SPEC-20261013.md, SHA256 3685a004b8df9f809bd9a4724ef4ddf34b2c5ef7ea09c0bcd72ad2c27ff263a1. RAD-01 a RAD-05 permanecem imutáveis. Objetivo autorizado: dados melhores para o System One e apresentação objetiva de decisões. Não certifica lucro, ML treinado ou execução financeira.

## Evidência e decisão

Consulta pública de 2026-10-14 02:42 UTC recusada por ecossistema_ordem_incoerente: um candidato skip foi ranqueado. O SDK avalia perguntas do mesmo batch contra o mesmo estado, sem acesso às respostas das outras perguntas. Revisor independente REQUEST_CHANGES: relatório privado REVIEW.md SHA256 702b03d8f58b267f71ebf184f5355e823607f9d6c4cebce39e092a3be4c350cf. Não há ID conhecido do token responsável.

Decisão técnica executada, approved_by=jev_delegated, human_response=false: recibo 107b31e3-53b5-4279-a77b-b189457c9768, Jev 1.13.0, two_stage_one_priority, confiança/probabilidade 1. Input 836/output 67 tokens, USD desconhecido null. Recibo sanitizado privado RADAR-SEQUENTIAL-DECISION-20261014.json. A decisão anterior 73ec3f7c-dbaa-42f1-8cbc-bc2ffd9c2e10 foi abstenção e não autorizou implementação. O parecer independente confirma compatibilidade semântica desta variante, condicionado aos critérios abaixo; não aprova código ainda.

## Critérios adicionais congelados

- SEQ-01: primeira avaliação escolhe postura e família observada para todos os candidatos. Perguntas de família são independentes, sem afirmar acesso à postura escolhida. Valide todas as ações/famílias oferecidas antes de iniciar outra avaliação. Não normalizar resposta inválida em decisão válida.
- SEQ-02: havendo watch/buy validado, segunda avaliação recebe o Brief e essas decisões como estado derivado, e uma única Choice entre none e IDs elegíveis reais, no máximo nove opções. O Jev escolhe uma prioridade global real. Retorne order=[choice,null,null]; preserve todas as decisões, identidades, fatos e ranks null restantes. All-skip encerra com uma avaliação. Não criar prioridade, recomendação ou desempate em código.
- SEQ-03: máximo duas avaliações neste modo, zero retries, mesmo sinal/timeout/cancelamento para ambas. Os modos restantes continuam com uma. Antes da primeira avaliação, reserve capacidade para o máximo de avaliações e estimativa das duas etapas; limites diários e por pedido nunca são contornados. Nenhuma nova fonte, leitura OnchainOS, coleta ou consulta automática.
- SEQ-04: ledger registra 0, 1 ou 2 avaliações efetivamente iniciadas. Total de chamadas soma avaliações, não linhas. Reidratação aceita ecossistema/carteira e contagens válidas; versões antigas continuam legíveis. Uso desconhecido não vira zero. Em falha parcial preserve separadamente uso conhecido, mantendo o total/custo null quando alguma avaliação iniciada não reportou uso. Cancelamento/timeout/falha da segunda etapa não apaga a primeira nem produz resultado válido. Não persistir prompts, respostas, carteira ou segredos.
- SEQ-05: interface continua ação, ativo e sinal principal; detalhes fechados. Informe de maneira curta antes do clique que uma consulta pode usar até duas avaliações. Não aumentar texto principal com detalhes técnicos. All-skip, none e leituras antigas continuam honestos, sem forçar compra.
- SEQ-06: regressões devem falhar contra o freeze antes do reparo. Verifique coerência em duas etapas, all-skip, postura/família inválida, prioridade não oferecida, cancelamento entre etapas, falha parcial/uso desconhecido, reserva diária e persistência. Revise novo freeze independentemente e conclua testes/tipos/build pertinentes. Após reparo e revisão, uma consulta pública corretiva manual no app localhost:3001, sem saldo/carteira, registra resultado e uso reais ou null; não repetir automaticamente para obter resposta favorável. Nenhuma ordem, assinatura ou nova consulta privada.

## Responsabilidade e limites

Writer architecture_audit em cópia isolada: src/inonu/jev-model.ts, jev-model.test.ts, ask.ts, ask.test.ts, ledger.ts, ledger.test.ts. Somente integrador edita arquivos compartilhados. Root: JevPicks.tsx, seu teste de render e documentação; se a contabilidade exigir campos aditivos no parser de ledger, estabelecer responsabilidade antes de alterar. Preserve baselines dirty e trabalho de Claude. Validator opportunity/ecosystem.ts não será enfraquecido. Sem dependências novas, staging, commit, push, publicação ou metas.

Riscos verificáveis: segunda etapa amplia latência e custo potencial; estimativa não é faturamento. Endpoint/modelo podem abster-se mesmo com contrato válido. Tipos/build globais podem mudar por trabalho concorrente; atribua somente com prova. Recomendação útil é resultado consultivo, não retorno financeiro comprovado.
