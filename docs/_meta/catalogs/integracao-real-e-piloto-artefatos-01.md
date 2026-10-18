---
title: "Integração real e piloto: artefatos, parte 1"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "integracao"]
sources: ["docs/real-integration/ACCESS-REVALIDATION-CONTINUATION-1.json", "docs/real-integration/ACCESS-REVALIDATION-CONTINUATION-2.json", "docs/real-integration/AUDIT-CONTINUATION-1.json", "docs/real-integration/AUDIT-R8.json", "docs/real-integration/BROWSER-CAPABILITIES-CONTINUATION-1.json", "docs/real-integration/BROWSER-CONTROL-STATUS-R8.json", "docs/real-integration/BROWSER-DECISION.json", "docs/real-integration/BROWSER-EVIDENCE-R8.json", "docs/real-integration/BROWSER-G14-CONTINUATION-1.json", "docs/real-integration/BUILD-DECISIONS.json", "docs/real-integration/CLOCK-EVIDENCE.json", "docs/real-integration/concurrent-baseline.json", "docs/real-integration/CONSOLE-COLLISION-FAILED.json", "docs/real-integration/CONSOLE-G14-CONTINUATION-1.json", "docs/real-integration/CONSOLE-LIVE-R7.json", "docs/real-integration/CONSOLE-LIVE-R8.json", "docs/real-integration/CONSOLE-LIVE.json", "docs/real-integration/CONTRAST-AUDIT-DECISION.json", "docs/real-integration/CONTRAST-SOURCE-R8.json", "docs/real-integration/DECISIONS.json", "docs/real-integration/DOC-REVIEW-MANIFEST-RESEARCH.json", "docs/real-integration/DOCTOR-CONTINUATION-1.json", "docs/real-integration/EXECUTION-DECISIONS.json", "docs/real-integration/EXTENSIONS-CONFIG-DECISION.json", "docs/real-integration/EXTENSIONS-TASK-DECISION.json", "docs/real-integration/FINAL-DOC-REVIEW-DECISION.json", "docs/real-integration/FINAL-SEQUENCE-DECISION.json", "docs/real-integration/G11-IPFS-RETRIEVAL.json", "docs/real-integration/G11-METADATA-RESEARCH-DECISION.json", "docs/real-integration/G11-PROBE-STRATEGY-ABSTENTION.json", "docs/real-integration/G11-PUBLIC-METADATA-READ.json", "docs/real-integration/G11-PUBLIC-ROUTER-READ.json", "docs/real-integration/G11-RESEARCH-DECISION.json", "docs/real-integration/G11-SOURCIFY-LOOKUP.json", "docs/real-integration/G14-DECISION-CONTINUATION-1.json", "docs/real-integration/LIVE-FINAL.json", "docs/real-integration/LIVE-SERVICES.json", "docs/real-integration/NATIVE-GOAL-BLOCKED-CONTINUATION-2.json", "docs/real-integration/POST-REVIEW-DOC-DELTA-CONTINUATION-1.json", "docs/real-integration/POST-REVIEW-DOC-DELTA-R8.json", "docs/real-integration/PUBLIC-CADENCE-DECISION.json", "docs/real-integration/PUBLIC-CLOCK-DECISION.json", "docs/real-integration/R6-REGRESSION-EVIDENCE.json", "docs/real-integration/READINESS-DECISION.json", "docs/real-integration/real.env.example", "docs/real-integration/REMAINING-STRATEGY-DECISION.json", "docs/real-integration/research/fetch-okx-ipfs-g11-01a12b5f.ts", "docs/real-integration/research/fetch-okx-sourcify-g11-01a12b5f.ts", "docs/real-integration/research/probe-okx-metadata-g11-01a12b5f.ts", "docs/real-integration/research/probe-okx-router-g11-01a12b5f.ts"]
confidence: medium
---

# Integração real e piloto: artefatos, parte 1

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[integracao-real-e-piloto]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [real-integration/ACCESS-REVALIDATION-CONTINUATION-1.json](../../real-integration/ACCESS-REVALIDATION-CONTINUATION-1.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/ACCESS-REVALIDATION-CONTINUATION-2.json](../../real-integration/ACCESS-REVALIDATION-CONTINUATION-2.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/AUDIT-CONTINUATION-1.json](../../real-integration/AUDIT-CONTINUATION-1.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/AUDIT-R8.json](../../real-integration/AUDIT-R8.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/BROWSER-CAPABILITIES-CONTINUATION-1.json](../../real-integration/BROWSER-CAPABILITIES-CONTINUATION-1.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/BROWSER-CONTROL-STATUS-R8.json](../../real-integration/BROWSER-CONTROL-STATUS-R8.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/BROWSER-DECISION.json](../../real-integration/BROWSER-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/BROWSER-EVIDENCE-R8.json](../../real-integration/BROWSER-EVIDENCE-R8.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/BROWSER-G14-CONTINUATION-1.json](../../real-integration/BROWSER-G14-CONTINUATION-1.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/BUILD-DECISIONS.json](../../real-integration/BUILD-DECISIONS.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/CLOCK-EVIDENCE.json](../../real-integration/CLOCK-EVIDENCE.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/concurrent-baseline.json](../../real-integration/concurrent-baseline.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/CONSOLE-COLLISION-FAILED.json](../../real-integration/CONSOLE-COLLISION-FAILED.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/CONSOLE-G14-CONTINUATION-1.json](../../real-integration/CONSOLE-G14-CONTINUATION-1.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/CONSOLE-LIVE-R7.json](../../real-integration/CONSOLE-LIVE-R7.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/CONSOLE-LIVE-R8.json](../../real-integration/CONSOLE-LIVE-R8.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/CONSOLE-LIVE.json](../../real-integration/CONSOLE-LIVE.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/CONTRAST-AUDIT-DECISION.json](../../real-integration/CONTRAST-AUDIT-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/CONTRAST-SOURCE-R8.json](../../real-integration/CONTRAST-SOURCE-R8.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/DECISIONS.json](../../real-integration/DECISIONS.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/DOC-REVIEW-MANIFEST-RESEARCH.json](../../real-integration/DOC-REVIEW-MANIFEST-RESEARCH.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/DOCTOR-CONTINUATION-1.json](../../real-integration/DOCTOR-CONTINUATION-1.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/EXECUTION-DECISIONS.json](../../real-integration/EXECUTION-DECISIONS.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/EXTENSIONS-CONFIG-DECISION.json](../../real-integration/EXTENSIONS-CONFIG-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/EXTENSIONS-TASK-DECISION.json](../../real-integration/EXTENSIONS-TASK-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/FINAL-DOC-REVIEW-DECISION.json](../../real-integration/FINAL-DOC-REVIEW-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/FINAL-SEQUENCE-DECISION.json](../../real-integration/FINAL-SEQUENCE-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/G11-IPFS-RETRIEVAL.json](../../real-integration/G11-IPFS-RETRIEVAL.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/G11-METADATA-RESEARCH-DECISION.json](../../real-integration/G11-METADATA-RESEARCH-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/G11-PROBE-STRATEGY-ABSTENTION.json](../../real-integration/G11-PROBE-STRATEGY-ABSTENTION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/G11-PUBLIC-METADATA-READ.json](../../real-integration/G11-PUBLIC-METADATA-READ.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/G11-PUBLIC-ROUTER-READ.json](../../real-integration/G11-PUBLIC-ROUTER-READ.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/G11-RESEARCH-DECISION.json](../../real-integration/G11-RESEARCH-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/G11-SOURCIFY-LOOKUP.json](../../real-integration/G11-SOURCIFY-LOOKUP.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/G14-DECISION-CONTINUATION-1.json](../../real-integration/G14-DECISION-CONTINUATION-1.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/LIVE-FINAL.json](../../real-integration/LIVE-FINAL.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/LIVE-SERVICES.json](../../real-integration/LIVE-SERVICES.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/NATIVE-GOAL-BLOCKED-CONTINUATION-2.json](../../real-integration/NATIVE-GOAL-BLOCKED-CONTINUATION-2.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/POST-REVIEW-DOC-DELTA-CONTINUATION-1.json](../../real-integration/POST-REVIEW-DOC-DELTA-CONTINUATION-1.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/POST-REVIEW-DOC-DELTA-R8.json](../../real-integration/POST-REVIEW-DOC-DELTA-R8.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/PUBLIC-CADENCE-DECISION.json](../../real-integration/PUBLIC-CADENCE-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/PUBLIC-CLOCK-DECISION.json](../../real-integration/PUBLIC-CLOCK-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/R6-REGRESSION-EVIDENCE.json](../../real-integration/R6-REGRESSION-EVIDENCE.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/READINESS-DECISION.json](../../real-integration/READINESS-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/real.env.example](../../real-integration/real.env.example) | exemplo-configuracao: artefato de apoio preservado no caminho original |
| [real-integration/REMAINING-STRATEGY-DECISION.json](../../real-integration/REMAINING-STRATEGY-DECISION.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [real-integration/research/fetch-okx-ipfs-g11-01a12b5f.ts](../../real-integration/research/fetch-okx-ipfs-g11-01a12b5f.ts) | ferramenta: artefato de apoio preservado no caminho original |
| [real-integration/research/fetch-okx-sourcify-g11-01a12b5f.ts](../../real-integration/research/fetch-okx-sourcify-g11-01a12b5f.ts) | ferramenta: artefato de apoio preservado no caminho original |
| [real-integration/research/probe-okx-metadata-g11-01a12b5f.ts](../../real-integration/research/probe-okx-metadata-g11-01a12b5f.ts) | ferramenta: artefato de apoio preservado no caminho original |
| [real-integration/research/probe-okx-router-g11-01a12b5f.ts](../../real-integration/research/probe-okx-router-g11-01a12b5f.ts) | ferramenta: artefato de apoio preservado no caminho original |
