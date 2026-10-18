---
title: "Interface, Mesa e Central: documentos, parte 1"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "interface"]
sources: ["docs/CENTRAL-JEV-ACCEPTANCE.md", "docs/CENTRAL-JEV-BLOCKED-AUDIT-20261011.md", "docs/CENTRAL-JEV-CHECKPOINT.md", "docs/CENTRAL-JEV-CLOSURE-REVIEW-32fbaf8.md", "docs/CENTRAL-JEV-COMBINED-VERIFICATION-16eb1ed.md", "docs/CENTRAL-JEV-CONCLUSION-32fbaf8.md", "docs/CENTRAL-JEV-CONCURRENT-UI-SPEC.md", "docs/CENTRAL-JEV-COPY-REVIEW-714e276.md", "docs/CENTRAL-JEV-EXECUTION-COPY-SPEC.md", "docs/CENTRAL-JEV-FINAL-VERIFICATION-16eb1ed.md", "docs/CENTRAL-JEV-FINAL-VERIFICATION-32fbaf8.md", "docs/CENTRAL-JEV-FINANCIAL-REVIEW.md", "docs/CENTRAL-JEV-INTEGRATION-78ae090.md", "docs/CENTRAL-JEV-LEDGER-INTEGRATION-SPEC.md", "docs/CENTRAL-JEV-LEDGER-REVIEW-16eb1ed.md", "docs/CENTRAL-JEV-MOBILE-FIX-SPEC.md", "docs/CENTRAL-JEV-MOBILE-REVIEW-51cfa77.md", "docs/CENTRAL-JEV-PREVIEW-PROVENANCE-20261011.md", "docs/CENTRAL-JEV-REMOTE-AUDIT-2ed0324.md", "docs/CENTRAL-JEV-REMOTE-INTEGRATION-SPEC.md", "docs/CENTRAL-JEV-REMOTE-REVIEW-2ed0324.md", "docs/CENTRAL-JEV-REMOTE-VERIFICATION-2ed0324.md", "docs/CENTRAL-JEV-REVIEW-1c50fdf.md", "docs/CENTRAL-JEV-REVIEW-32fbaf8.md", "docs/CENTRAL-JEV-REVIEW-FIX-SPEC.md", "docs/CENTRAL-JEV-REVIEW.md", "docs/CENTRAL-JEV-VERIFICATION-1c50fdf.md", "docs/CENTRAL-JEV-ZERO-CEILING-REGRESSION.md", "docs/INONU-DESIGN-SPEC.md", "docs/INONU-PROPOSAL.md", "docs/MESA-DE-OPERACOES.md", "docs/MESA-TOPBAR-SPEC.md", "docs/research/spec-review-20261012/spec-review-central-ui.md", "docs/research/UI-EXECUTION-CLAIMS-20261011.md", "docs/sdd/frontend-ux-20261013/acceptance.md", "docs/sdd/frontend-ux-20261013/audit.md", "docs/sdd/frontend-ux-20261013/design.md", "docs/sdd/frontend-ux-20261013/docs-research.md", "docs/sdd/frontend-ux-20261013/docs-revalidation.md", "docs/sdd/frontend-ux-20261013/frontend-research.md", "docs/sdd/frontend-ux-20261013/frontend-revalidation.md", "docs/sdd/frontend-ux-20261013/README.md", "docs/sdd/frontend-ux-20261013/requirements.md", "docs/sdd/frontend-ux-20261013/review.md", "docs/sdd/frontend-ux-20261013/tasks.md", "docs/sdd/mesa-decisao-20261013/credential-evidence.md", "docs/sdd/mesa-decisao-20261013/REPORT.md", "docs/sdd/mesa-decisao-20261013/review-spec.md", "docs/sdd/mesa-decisao-20261013/review-standards.md", "docs/sdd/mesa-decisao-20261013/SPEC.md"]
confidence: medium
---

# Interface, Mesa e Central: documentos, parte 1

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[interface-e-central]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [CENTRAL-JEV-ACCEPTANCE.md](../../CENTRAL-JEV-ACCEPTANCE.md) | contrato: Central Jev: aceite da integração |
| [CENTRAL-JEV-BLOCKED-AUDIT-20261011.md](../../CENTRAL-JEV-BLOCKED-AUDIT-20261011.md) | revisao: Auditoria do bloqueio - 2026-10-11 |
| [CENTRAL-JEV-CHECKPOINT.md](../../CENTRAL-JEV-CHECKPOINT.md) | checkpoint: Checkpoint final da própria tarefa - 2026-10-11 |
| [CENTRAL-JEV-CLOSURE-REVIEW-32fbaf8.md](../../CENTRAL-JEV-CLOSURE-REVIEW-32fbaf8.md) | revisao: CENTRAL-JEV-CLOSURE-REVIEW-32fbaf8 |
| [CENTRAL-JEV-COMBINED-VERIFICATION-16eb1ed.md](../../CENTRAL-JEV-COMBINED-VERIFICATION-16eb1ed.md) | evidencia: Verificação conjunta da central e ledger - 2026-10-11 |
| [CENTRAL-JEV-CONCLUSION-32fbaf8.md](../../CENTRAL-JEV-CONCLUSION-32fbaf8.md) | guia: Conclusão local da central Jev - 32fbaf8 |
| [CENTRAL-JEV-CONCURRENT-UI-SPEC.md](../../CENTRAL-JEV-CONCURRENT-UI-SPEC.md) | contrato: Reconciliação final da interface |
| [CENTRAL-JEV-COPY-REVIEW-714e276.md](../../CENTRAL-JEV-COPY-REVIEW-714e276.md) | revisao: Acompanhamento independente EC1 - EC4 |
| [CENTRAL-JEV-EXECUTION-COPY-SPEC.md](../../CENTRAL-JEV-EXECUTION-COPY-SPEC.md) | contrato: Veracidade das descrições da central Jev |
| [CENTRAL-JEV-FINAL-VERIFICATION-16eb1ed.md](../../CENTRAL-JEV-FINAL-VERIFICATION-16eb1ed.md) | evidencia: Central Jev - verificação final da integração local |
| [CENTRAL-JEV-FINAL-VERIFICATION-32fbaf8.md](../../CENTRAL-JEV-FINAL-VERIFICATION-32fbaf8.md) | evidencia: Verificação final da central Jev - 32fbaf8 |
| [CENTRAL-JEV-FINANCIAL-REVIEW.md](../../CENTRAL-JEV-FINANCIAL-REVIEW.md) | revisao: CENTRAL-JEV-FINANCIAL-REVIEW |
| [CENTRAL-JEV-INTEGRATION-78ae090.md](../../CENTRAL-JEV-INTEGRATION-78ae090.md) | guia: Verificação da integração 78ae090 - 2026-10-11 |
| [CENTRAL-JEV-LEDGER-INTEGRATION-SPEC.md](../../CENTRAL-JEV-LEDGER-INTEGRATION-SPEC.md) | contrato: Integração concorrente do ledger - 2026-10-11 |
| [CENTRAL-JEV-LEDGER-REVIEW-16eb1ed.md](../../CENTRAL-JEV-LEDGER-REVIEW-16eb1ed.md) | revisao: CENTRAL-JEV-LEDGER-REVIEW-16eb1ed |
| [CENTRAL-JEV-MOBILE-FIX-SPEC.md](../../CENTRAL-JEV-MOBILE-FIX-SPEC.md) | contrato: Correção mobile da central Jev |
| [CENTRAL-JEV-MOBILE-REVIEW-51cfa77.md](../../CENTRAL-JEV-MOBILE-REVIEW-51cfa77.md) | revisao: CENTRAL-JEV-MOBILE-REVIEW-51cfa77 |
| [CENTRAL-JEV-PREVIEW-PROVENANCE-20261011.md](../../CENTRAL-JEV-PREVIEW-PROVENANCE-20261011.md) | revisao: Proveniência da prévia observada - 2026-10-11 |
| [CENTRAL-JEV-REMOTE-AUDIT-2ed0324.md](../../CENTRAL-JEV-REMOTE-AUDIT-2ed0324.md) | revisao: Reconciliação de branches remotas - 2026-10-11 |
| [CENTRAL-JEV-REMOTE-INTEGRATION-SPEC.md](../../CENTRAL-JEV-REMOTE-INTEGRATION-SPEC.md) | contrato: Integração dos remotos: Central Jev |
| [CENTRAL-JEV-REMOTE-REVIEW-2ed0324.md](../../CENTRAL-JEV-REMOTE-REVIEW-2ed0324.md) | revisao: Revisão independente - reconciliação remota |
| [CENTRAL-JEV-REMOTE-VERIFICATION-2ed0324.md](../../CENTRAL-JEV-REMOTE-VERIFICATION-2ed0324.md) | evidencia: Verificação do candidato remoto 2ed0324 |
| [CENTRAL-JEV-REVIEW-1c50fdf.md](../../CENTRAL-JEV-REVIEW-1c50fdf.md) | revisao: CENTRAL-JEV-REVIEW-1c50fdf |
| [CENTRAL-JEV-REVIEW-32fbaf8.md](../../CENTRAL-JEV-REVIEW-32fbaf8.md) | revisao: CENTRAL-JEV-REVIEW-32fbaf8 |
| [CENTRAL-JEV-REVIEW-FIX-SPEC.md](../../CENTRAL-JEV-REVIEW-FIX-SPEC.md) | revisao: Correções da revisão independente da Central Jev |
| [CENTRAL-JEV-REVIEW.md](../../CENTRAL-JEV-REVIEW.md) | revisao: Parecer independente - GrowthDeck e ajuste de testes CLI |
| [CENTRAL-JEV-VERIFICATION-1c50fdf.md](../../CENTRAL-JEV-VERIFICATION-1c50fdf.md) | evidencia: Verificação do candidato final da Central Jev |
| [CENTRAL-JEV-ZERO-CEILING-REGRESSION.md](../../CENTRAL-JEV-ZERO-CEILING-REGRESSION.md) | guia: Regressão de leitura da fase de observação |
| [INONU-DESIGN-SPEC.md](../../INONU-DESIGN-SPEC.md) | contrato: Inonu Trader: especificação visual e de interação |
| [INONU-PROPOSAL.md](../../INONU-PROPOSAL.md) | proposta: Inonu Trader: identidade e contribuição |
| [MESA-DE-OPERACOES.md](../../MESA-DE-OPERACOES.md) | guia: Mesa de operacoes do Jev |
| [MESA-TOPBAR-SPEC.md](../../MESA-TOPBAR-SPEC.md) | contrato: Topbar da Mesa: especificação |
| [research/spec-review-20261012/spec-review-central-ui.md](../../research/spec-review-20261012/spec-review-central-ui.md) | revisao: central-ui: revisão das especificações da interface e do painel (somente leitura) |
| [research/UI-EXECUTION-CLAIMS-20261011.md](../../research/UI-EXECUTION-CLAIMS-20261011.md) | pesquisa: Execution claims versus observed runtime |
| [sdd/frontend-ux-20261013/acceptance.md](../../sdd/frontend-ux-20261013/acceptance.md) | contrato: acceptance |
| [sdd/frontend-ux-20261013/audit.md](../../sdd/frontend-ux-20261013/audit.md) | revisao: audit |
| [sdd/frontend-ux-20261013/design.md](../../sdd/frontend-ux-20261013/design.md) | contrato: design |
| [sdd/frontend-ux-20261013/docs-research.md](../../sdd/frontend-ux-20261013/docs-research.md) | evidencia: docs-research |
| [sdd/frontend-ux-20261013/docs-revalidation.md](../../sdd/frontend-ux-20261013/docs-revalidation.md) | revisao: docs-revalidation |
| [sdd/frontend-ux-20261013/frontend-research.md](../../sdd/frontend-ux-20261013/frontend-research.md) | evidencia: frontend-research |
| [sdd/frontend-ux-20261013/frontend-revalidation.md](../../sdd/frontend-ux-20261013/frontend-revalidation.md) | revisao: frontend-revalidation |
| [sdd/frontend-ux-20261013/README.md](../../sdd/frontend-ux-20261013/README.md) | evidencia: README |
| [sdd/frontend-ux-20261013/requirements.md](../../sdd/frontend-ux-20261013/requirements.md) | contrato: requirements |
| [sdd/frontend-ux-20261013/review.md](../../sdd/frontend-ux-20261013/review.md) | revisao: review |
| [sdd/frontend-ux-20261013/tasks.md](../../sdd/frontend-ux-20261013/tasks.md) | plano: tasks |
| [sdd/mesa-decisao-20261013/credential-evidence.md](../../sdd/mesa-decisao-20261013/credential-evidence.md) | evidencia: credential-evidence |
| [sdd/mesa-decisao-20261013/REPORT.md](../../sdd/mesa-decisao-20261013/REPORT.md) | evidencia: REPORT |
| [sdd/mesa-decisao-20261013/review-spec.md](../../sdd/mesa-decisao-20261013/review-spec.md) | contrato: review-spec |
| [sdd/mesa-decisao-20261013/review-standards.md](../../sdd/mesa-decisao-20261013/review-standards.md) | revisao: review-standards |
| [sdd/mesa-decisao-20261013/SPEC.md](../../sdd/mesa-decisao-20261013/SPEC.md) | contrato: SPEC |
