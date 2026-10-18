# Como distinguir pesos do Jev de pesos do adaptador?

Label: wayfinder:grilling
Parent: [Evidência confiável para decisões do Inonu Trader](MAP.md)
Status: resolved
Assignee: root-01a1362a
Claim: 2026-10-13, antes da redação da especificação.
Human response: false. Grilling e decisões técnicas seguem a delegação explícita ao Jev.

## Question

Qual contrato mínimo torna observável a origem dos pesos, evitando interpretar um peso sintetizado como certeza fornecida pelo Jev e preservando os registros existentes?

## Assets

- [Recibos reais das consultas delegadas](decision-receipts.json)
- [Especificação proposta de origem dos pesos](NEXT-SPEC.md)
- [Revisão independente v2](../provenance-plan-review/REPORT-v2.md)
- [Decisão sobre fronteira de execução](execution-decision.json)

## Resolution

Resolvido em 2026-10-13: contrato PP-1..PP-6 especificado e revisado independentemente com veredito approved_planning_only, sem achados pendentes. A prioridade escolhida foi probability_provenance; a fronteira técnica escolhida foi additive_annotation. approved_by=jev_delegated; human_response=false. A fronteira de execução escolhida foi separate_local_task, com implementação posterior em worktree própria e gates SDD próprios. Os recibos consultivos não certificam execução ou desempenho.

As correções da revisão v1 exigem probabilities informado e status ok no ramo provider_reported e rejeitam peso selecionado que vira zero após normalização. NEXT-SPEC.md SHA256 6c4fcfacc34ec393daf3ab995320c1cbb7723ba83e38a29cd6003bd5ce7ef42f; REPORT-v2.md SHA256 064c9e5924f56d74b8489b8f3890d7a1757ef53eff96bb8ddd19e791bff9c726; coverage-v2.json SHA256 2bb3c914b53c21912a300bfd46fd2f1962913706fb10eddf1fecc9920b3472f4. Planejamento não é implementação, integração live ou calibração financeira.
