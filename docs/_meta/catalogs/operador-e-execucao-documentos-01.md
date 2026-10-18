---
title: "Operador e fronteiras de execução: documentos, parte 1"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "operador"]
sources: ["docs/CENTRAL-JEV-OPERATOR-INTEGRATION-SPEC.md", "docs/CENTRAL-JEV-OPERATOR-REVIEW-7bce1e8.md", "docs/CENTRAL-JEV-OPERATOR-VERIFICATION-7bce1e8.md", "docs/OKX-OPERADOR-JEV.md", "docs/OPERATOR-CLI-LOCK-CHECKPOINT-20261011.md", "docs/OPERATOR-CLI-LOCK-FINAL-AUDIT-20261011.md", "docs/OPERATOR-CLI-LOCK-FULL-VERIFICATION-20261011.md", "docs/OPERATOR-CLI-LOCK-INDEPENDENT-SPEC-REVIEW-20261011.md", "docs/OPERATOR-CLI-LOCK-INDEPENDENT-STANDARDS-REVIEW-20261011.md", "docs/OPERATOR-CLI-LOCK-INTEGRATION-CHECKPOINT-20261011.md", "docs/OPERATOR-CLI-LOCK-INTEGRATION-REVIEW-20261011.md", "docs/OPERATOR-CLI-LOCK-MAIN-CHECKPOINT-20261011.md", "docs/OPERATOR-CLI-LOCK-SPEC.md", "docs/OPERATOR-DECISION-BOUNDARY.md", "docs/OPERATOR-GETTER-RECOVERY-20261011.md", "docs/OPERATOR-MODEL-BOUNDARY-CHECKPOINT.md", "docs/OPERATOR-MODEL-BOUNDARY-SPEC.md", "docs/OPERATOR-MODEL-BOUNDARY-VERIFICATION-20261011.md", "docs/OPERATOR-MODEL-FINAL-AUDIT.md", "docs/OPERATOR-PERSISTENCE-CHECKPOINT-20261011.md", "docs/OPERATOR-PERSISTENCE-FINAL-AUDIT.md", "docs/OPERATOR-PERSISTENCE-FINAL-EVIDENCE-20261011.md", "docs/OPERATOR-PERSISTENCE-INTEGRATION-CHECKPOINT-20261011.md", "docs/OPERATOR-PERSISTENCE-MAIN-CHECKPOINT-20261011.md", "docs/OPERATOR-PERSISTENCE-REVIEW-RECOVERY-20261011.md", "docs/OPERATOR-PERSISTENCE-SCOPE-REVIEW.md", "docs/OPERATOR-PERSISTENCE-SPEC.md", "docs/OPERATOR-ROUNDTRIP-AMOUNT-SCOPE-REVIEW-20261011.md", "docs/OPERATOR-ROUNDTRIP-AMOUNT-SPEC.md", "docs/OPERATOR-ROUNDTRIP-CONTRACT-RESEARCH-20261011.md", "docs/OPERATOR-ROUTER-PROOF-RESEARCH-20261011.md", "docs/research/codex-operator-c4-research-20261011/operator-cli-lock-final-audit.md", "docs/research/codex-operator-c4-research-20261011/operator-cli-lock-reconciliation-research.md", "docs/research/codex-operator-c4-research-20261011/operator-roundtrip-contract-research.md", "docs/research/codex-operator-c4-research-20261011/operator-router-proof-research.md", "docs/research/codex-operator-c4-research-20261011/operator-second-leg-amount-research.md", "docs/research/codex-operator-c4-research-20261011/persistence-experiment.md", "docs/research/codex-operator-c4-research-20261011/persistence-production-probe.md", "docs/research/OPERATOR-CLI-LOCK-CYCLE-DRAFT-20261011.md", "docs/research/OPERATOR-CLI-LOCK-PROBE-20261011.md", "docs/research/OPERATOR-CLI-LOCK-RECONCILIATION-20261011.md", "docs/research/OPERATOR-CLI-LOCK-SCOPE-REVIEW-20261011.md", "docs/research/R10-re-revisao-operador-c1-c9-20261011.md", "docs/research/R4-revisao-seguranca-operador-20261010.md", "docs/research/R5-revisao-operador-codigo-final-20261010.md", "docs/research/R8-re-revisao-operador-f1-f8-20261011.md", "docs/research/spec-review-20261012/implementacao-operator-hardening.md", "docs/research/spec-review-20261012/review-operator-hardening.md"]
confidence: medium
---

# Operador e fronteiras de execução: documentos, parte 1

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[operador-e-execucao]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [CENTRAL-JEV-OPERATOR-INTEGRATION-SPEC.md](../../CENTRAL-JEV-OPERATOR-INTEGRATION-SPEC.md) | contrato: Integração do delta de segurança do operador - 2026-10-11 |
| [CENTRAL-JEV-OPERATOR-REVIEW-7bce1e8.md](../../CENTRAL-JEV-OPERATOR-REVIEW-7bce1e8.md) | revisao: Revisão independente - operator 7bce1e8 |
| [CENTRAL-JEV-OPERATOR-VERIFICATION-7bce1e8.md](../../CENTRAL-JEV-OPERATOR-VERIFICATION-7bce1e8.md) | evidencia: Verificação da integração do operador - 2026-10-11 |
| [OKX-OPERADOR-JEV.md](../../OKX-OPERADOR-JEV.md) | guia: Jev como operador financeiro da carteira OKX (multichain) |
| [OPERATOR-CLI-LOCK-CHECKPOINT-20261011.md](../../OPERATOR-CLI-LOCK-CHECKPOINT-20261011.md) | checkpoint: Operator CLI ownership checkpoint |
| [OPERATOR-CLI-LOCK-FINAL-AUDIT-20261011.md](../../OPERATOR-CLI-LOCK-FINAL-AUDIT-20261011.md) | revisao: Auditoria final independente da CLI lock - 2026-10-11 |
| [OPERATOR-CLI-LOCK-FULL-VERIFICATION-20261011.md](../../OPERATOR-CLI-LOCK-FULL-VERIFICATION-20261011.md) | evidencia: CLI lock full-suite verification |
| [OPERATOR-CLI-LOCK-INDEPENDENT-SPEC-REVIEW-20261011.md](../../OPERATOR-CLI-LOCK-INDEPENDENT-SPEC-REVIEW-20261011.md) | revisao: OPERATOR-CLI-LOCK-INDEPENDENT-SPEC-REVIEW-20261011 |
| [OPERATOR-CLI-LOCK-INDEPENDENT-STANDARDS-REVIEW-20261011.md](../../OPERATOR-CLI-LOCK-INDEPENDENT-STANDARDS-REVIEW-20261011.md) | revisao: Revisão independente CLI lock - STANDARDS |
| [OPERATOR-CLI-LOCK-INTEGRATION-CHECKPOINT-20261011.md](../../OPERATOR-CLI-LOCK-INTEGRATION-CHECKPOINT-20261011.md) | checkpoint: CLI lock integration checkpoint - 2026-10-11 |
| [OPERATOR-CLI-LOCK-INTEGRATION-REVIEW-20261011.md](../../OPERATOR-CLI-LOCK-INTEGRATION-REVIEW-20261011.md) | revisao: Revisão independente da integração CLI lock |
| [OPERATOR-CLI-LOCK-MAIN-CHECKPOINT-20261011.md](../../OPERATOR-CLI-LOCK-MAIN-CHECKPOINT-20261011.md) | checkpoint: CLI lock - main integration checkpoint |
| [OPERATOR-CLI-LOCK-SPEC.md](../../OPERATOR-CLI-LOCK-SPEC.md) | contrato: Proposed next operator concurrency cycle |
| [OPERATOR-DECISION-BOUNDARY.md](../../OPERATOR-DECISION-BOUNDARY.md) | contrato: INONU TRADER: contrato da decisão do operador |
| [OPERATOR-GETTER-RECOVERY-20261011.md](../../OPERATOR-GETTER-RECOVERY-20261011.md) | checkpoint: Operator model boundary recovery |
| [OPERATOR-MODEL-BOUNDARY-CHECKPOINT.md](../../OPERATOR-MODEL-BOUNDARY-CHECKPOINT.md) | checkpoint: Operator model boundary checkpoint 2026-10-11 |
| [OPERATOR-MODEL-BOUNDARY-SPEC.md](../../OPERATOR-MODEL-BOUNDARY-SPEC.md) | contrato: Operator R8 C5: decision identity at execution boundary |
| [OPERATOR-MODEL-BOUNDARY-VERIFICATION-20261011.md](../../OPERATOR-MODEL-BOUNDARY-VERIFICATION-20261011.md) | evidencia: Operator R8 C5 implementation checkpoint |
| [OPERATOR-MODEL-FINAL-AUDIT.md](../../OPERATOR-MODEL-FINAL-AUDIT.md) | revisao: Audit independente final - operator R8 C5 |
| [OPERATOR-PERSISTENCE-CHECKPOINT-20261011.md](../../OPERATOR-PERSISTENCE-CHECKPOINT-20261011.md) | checkpoint: Operator persistence checkpoint - 2026-10-11 |
| [OPERATOR-PERSISTENCE-FINAL-AUDIT.md](../../OPERATOR-PERSISTENCE-FINAL-AUDIT.md) | revisao: OPERATOR-PERSISTENCE-FINAL-AUDIT |
| [OPERATOR-PERSISTENCE-FINAL-EVIDENCE-20261011.md](../../OPERATOR-PERSISTENCE-FINAL-EVIDENCE-20261011.md) | evidencia: Persistence final evidence checkpoint |
| [OPERATOR-PERSISTENCE-INTEGRATION-CHECKPOINT-20261011.md](../../OPERATOR-PERSISTENCE-INTEGRATION-CHECKPOINT-20261011.md) | checkpoint: Persistence integration checkpoint - 2026-10-11 |
| [OPERATOR-PERSISTENCE-MAIN-CHECKPOINT-20261011.md](../../OPERATOR-PERSISTENCE-MAIN-CHECKPOINT-20261011.md) | checkpoint: Reviewed persistence integration on main |
| [OPERATOR-PERSISTENCE-REVIEW-RECOVERY-20261011.md](../../OPERATOR-PERSISTENCE-REVIEW-RECOVERY-20261011.md) | revisao: Persistence independent-review recovery |
| [OPERATOR-PERSISTENCE-SCOPE-REVIEW.md](../../OPERATOR-PERSISTENCE-SCOPE-REVIEW.md) | revisao: Re-review independente de escopo - 2026-10-11 |
| [OPERATOR-PERSISTENCE-SPEC.md](../../OPERATOR-PERSISTENCE-SPEC.md) | contrato: Operator persistence: bounded Windows atomic replacement |
| [OPERATOR-ROUNDTRIP-AMOUNT-SCOPE-REVIEW-20261011.md](../../OPERATOR-ROUNDTRIP-AMOUNT-SCOPE-REVIEW-20261011.md) | revisao: Revisão independente preparatória - round-trip amount |
| [OPERATOR-ROUNDTRIP-AMOUNT-SPEC.md](../../OPERATOR-ROUNDTRIP-AMOUNT-SPEC.md) | contrato: Round-trip quote amount binding |
| [OPERATOR-ROUNDTRIP-CONTRACT-RESEARCH-20261011.md](../../OPERATOR-ROUNDTRIP-CONTRACT-RESEARCH-20261011.md) | pesquisa: Pesquisa independente: contrato round-trip - 2026-10-11 |
| [OPERATOR-ROUTER-PROOF-RESEARCH-20261011.md](../../OPERATOR-ROUTER-PROOF-RESEARCH-20261011.md) | pesquisa: Pesquisa independente: prova de router e custos/FX - 2026-10-11 |
| [research/codex-operator-c4-research-20261011/operator-cli-lock-final-audit.md](../../research/codex-operator-c4-research-20261011/operator-cli-lock-final-audit.md) | revisao: Auditoria final independente da CLI lock - 2026-10-11 |
| [research/codex-operator-c4-research-20261011/operator-cli-lock-reconciliation-research.md](../../research/codex-operator-c4-research-20261011/operator-cli-lock-reconciliation-research.md) | pesquisa: Reconciliação do CLI com lock ocupado - pesquisa independente |
| [research/codex-operator-c4-research-20261011/operator-roundtrip-contract-research.md](../../research/codex-operator-c4-research-20261011/operator-roundtrip-contract-research.md) | pesquisa: Pesquisa independente: contrato round-trip - 2026-10-11 |
| [research/codex-operator-c4-research-20261011/operator-router-proof-research.md](../../research/codex-operator-c4-research-20261011/operator-router-proof-research.md) | pesquisa: Pesquisa independente: prova de router e custos/FX - 2026-10-11 |
| [research/codex-operator-c4-research-20261011/operator-second-leg-amount-research.md](../../research/codex-operator-c4-research-20261011/operator-second-leg-amount-research.md) | pesquisa: Pesquisa independente: valor da segunda perna |
| [research/codex-operator-c4-research-20261011/persistence-experiment.md](../../research/codex-operator-c4-research-20261011/persistence-experiment.md) | pesquisa: Independent Windows persistence experiment - 2026-10-11 |
| [research/codex-operator-c4-research-20261011/persistence-production-probe.md](../../research/codex-operator-c4-research-20261011/persistence-production-probe.md) | pesquisa: Independent production persistence probe - P4 |
| [research/OPERATOR-CLI-LOCK-CYCLE-DRAFT-20261011.md](../../research/OPERATOR-CLI-LOCK-CYCLE-DRAFT-20261011.md) | proposta: Proposed next operator concurrency cycle |
| [research/OPERATOR-CLI-LOCK-PROBE-20261011.md](../../research/OPERATOR-CLI-LOCK-PROBE-20261011.md) | pesquisa: Operator CLI lock investigation |
| [research/OPERATOR-CLI-LOCK-RECONCILIATION-20261011.md](../../research/OPERATOR-CLI-LOCK-RECONCILIATION-20261011.md) | pesquisa: Reconciliação do CLI com lock ocupado - pesquisa independente |
| [research/OPERATOR-CLI-LOCK-SCOPE-REVIEW-20261011.md](../../research/OPERATOR-CLI-LOCK-SCOPE-REVIEW-20261011.md) | revisao: Independent operator CLI lock scope review |
| [research/R10-re-revisao-operador-c1-c9-20261011.md](../../research/R10-re-revisao-operador-c1-c9-20261011.md) | revisao: R10: re-revisão independente do operador sobre main f7be047, condições C1 a C9 (2026-10-11) |
| [research/R4-revisao-seguranca-operador-20261010.md](../../research/R4-revisao-seguranca-operador-20261010.md) | revisao: R4: revisao de seguranca do executor do operador (snapshot de 2026-10-10) |
| [research/R5-revisao-operador-codigo-final-20261010.md](../../research/R5-revisao-operador-codigo-final-20261010.md) | revisao: R5: revisão independente do operador no código final (2026-10-10) |
| [research/R8-re-revisao-operador-f1-f8-20261011.md](../../research/R8-re-revisao-operador-f1-f8-20261011.md) | revisao: R8: re-revisão independente do operador sobre main 2fbe4e0, condições F1 a F8 (2026-10-11) |
| [research/spec-review-20261012/implementacao-operator-hardening.md](../../research/spec-review-20261012/implementacao-operator-hardening.md) | evidencia: Implementação do endurecimento do operador (A-2 a A-15) |
| [research/spec-review-20261012/review-operator-hardening.md](../../research/spec-review-20261012/review-operator-hardening.md) | revisao: Revisão independente do endurecimento do operador (work/operator-hardening, e39c669..a47f5ae) |
