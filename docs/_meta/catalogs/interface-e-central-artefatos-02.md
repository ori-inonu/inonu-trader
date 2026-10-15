---
title: "Interface, Mesa e Central: artefatos, parte 2"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "interface"]
sources: ["docs/sdd/mesa-decisao-20261013/evidence/final-purity-tests.log", "docs/sdd/mesa-decisao-20261013/evidence/final-typecheck-concurrent.log", "docs/sdd/mesa-decisao-20261013/evidence/final-typecheck-mobile.log", "docs/sdd/mesa-decisao-20261013/evidence/final-typecheck-root-qualified.log", "docs/sdd/mesa-decisao-20261013/evidence/final-web-mobile.log", "docs/sdd/mesa-decisao-20261013/evidence/review-spec-concurrent.log", "docs/sdd/mesa-decisao-20261013/evidence/review-spec-integrity.json", "docs/sdd/mesa-decisao-20261013/evidence/review-spec-mobile.log", "docs/sdd/mesa-decisao-20261013/evidence/review-standards-acceptance.json", "docs/sdd/mesa-decisao-20261013/evidence/review-standards-close.json", "docs/sdd/mesa-decisao-20261013/evidence/review-standards-evidence-hashes.json", "docs/sdd/mesa-decisao-20261013/evidence/review-standards-integrity.json", "docs/sdd/mesa-decisao-20261013/evidence/verify-chart-ui.mjs", "docs/sdd/mesa-decisao-20261013/evidence/verify-wallet-ui.mjs", "docs/sdd/mesa-decisao-20261013/evidence/visual-results.json", "docs/sdd/mesa-decisao-20261013/evidence/wallet-desktop.png", "docs/sdd/mesa-decisao-20261013/evidence/wallet-mobile.png", "docs/sdd/mesa-decisao-20261013/evidence/wallet-ui-results.json", "docs/sdd/mesa-decisao-20261013/final-backend-metrics.json", "docs/sdd/mesa-decisao-20261013/final-web-metrics.json", "docs/sdd/mesa-decisao-20261013/integrity-final.json", "docs/sdd/mesa-decisao-20261013/jev-cancellation-receipt.json", "docs/sdd/mesa-decisao-20261013/jev-mobile-receipts.json", "docs/sdd/mesa-decisao-20261013/jev-purity-receipt.json", "docs/sdd/mesa-decisao-20261013/jev-receipt.json", "docs/sdd/mesa-decisao-20261013/portfolio-evidence.json", "docs/sdd/mesa-decisao-20261013/purity-final.log", "docs/sdd/mesa-decisao-20261013/typecheck-root.log", "docs/sdd/mesa-decisao-20261013/typecheck-web.log", "docs/sdd/mesa-decisao-20261013/ui-client-red.log", "docs/sdd/mesa-decisao-20261013/ui-red.log", "docs/sdd/mesa-decisao-20261013/web-targeted-final.log", "docs/sdd/mesa-decisao-20261013/web-targeted-metrics.json", "docs/sdd/mesa-decisao-20261013/web-targeted.log", "docs/sdd/mesa-decisao-20261013/web-tests-metrics.json", "docs/sdd/mesa-decisao-20261013/web-tests.log", "docs/sdd/ui-audit-20261013/baseline-hashes.json", "docs/sdd/ui-audit-20261013/baseline-status.txt", "docs/sdd/ui-audit-20261013/build-responsive.log", "docs/sdd/ui-audit-20261013/copy-green.log", "docs/sdd/ui-audit-20261013/copy-red.log", "docs/sdd/ui-audit-20261013/evidence-references.json", "docs/sdd/ui-audit-20261013/final-manifest.json", "docs/sdd/ui-audit-20261013/integration-manifest.json", "docs/sdd/ui-audit-20261013/jev-integration-receipt.json", "docs/sdd/ui-audit-20261013/jev-responsive-receipt.json", "docs/sdd/ui-audit-20261013/jev-source-repair-receipt.json", "docs/sdd/ui-audit-20261013/market-inputs-green.log", "docs/sdd/ui-audit-20261013/market-inputs-red.log", "docs/sdd/ui-audit-20261013/reconciliation-manifest.json"]
confidence: medium
---

# Interface, Mesa e Central: artefatos, parte 2

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[interface-e-central]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [sdd/mesa-decisao-20261013/evidence/final-purity-tests.log](../../sdd/mesa-decisao-20261013/evidence/final-purity-tests.log) | log: final-purity-tests |
| [sdd/mesa-decisao-20261013/evidence/final-typecheck-concurrent.log](../../sdd/mesa-decisao-20261013/evidence/final-typecheck-concurrent.log) | log: final-typecheck-concurrent |
| [sdd/mesa-decisao-20261013/evidence/final-typecheck-mobile.log](../../sdd/mesa-decisao-20261013/evidence/final-typecheck-mobile.log) | log: final-typecheck-mobile |
| [sdd/mesa-decisao-20261013/evidence/final-typecheck-root-qualified.log](../../sdd/mesa-decisao-20261013/evidence/final-typecheck-root-qualified.log) | log: final-typecheck-root-qualified |
| [sdd/mesa-decisao-20261013/evidence/final-web-mobile.log](../../sdd/mesa-decisao-20261013/evidence/final-web-mobile.log) | log: final-web-mobile |
| [sdd/mesa-decisao-20261013/evidence/review-spec-concurrent.log](../../sdd/mesa-decisao-20261013/evidence/review-spec-concurrent.log) | log: review-spec-concurrent |
| [sdd/mesa-decisao-20261013/evidence/review-spec-integrity.json](../../sdd/mesa-decisao-20261013/evidence/review-spec-integrity.json) | evidencia-estruturada: review-spec-integrity |
| [sdd/mesa-decisao-20261013/evidence/review-spec-mobile.log](../../sdd/mesa-decisao-20261013/evidence/review-spec-mobile.log) | log: review-spec-mobile |
| [sdd/mesa-decisao-20261013/evidence/review-standards-acceptance.json](../../sdd/mesa-decisao-20261013/evidence/review-standards-acceptance.json) | evidencia-estruturada: review-standards-acceptance |
| [sdd/mesa-decisao-20261013/evidence/review-standards-close.json](../../sdd/mesa-decisao-20261013/evidence/review-standards-close.json) | evidencia-estruturada: review-standards-close |
| [sdd/mesa-decisao-20261013/evidence/review-standards-evidence-hashes.json](../../sdd/mesa-decisao-20261013/evidence/review-standards-evidence-hashes.json) | evidencia-estruturada: review-standards-evidence-hashes |
| [sdd/mesa-decisao-20261013/evidence/review-standards-integrity.json](../../sdd/mesa-decisao-20261013/evidence/review-standards-integrity.json) | evidencia-estruturada: review-standards-integrity |
| [sdd/mesa-decisao-20261013/evidence/verify-chart-ui.mjs](../../sdd/mesa-decisao-20261013/evidence/verify-chart-ui.mjs) | ferramenta: verify-chart-ui |
| [sdd/mesa-decisao-20261013/evidence/verify-wallet-ui.mjs](../../sdd/mesa-decisao-20261013/evidence/verify-wallet-ui.mjs) | ferramenta: verify-wallet-ui |
| [sdd/mesa-decisao-20261013/evidence/visual-results.json](../../sdd/mesa-decisao-20261013/evidence/visual-results.json) | evidencia-estruturada: visual-results |
| [sdd/mesa-decisao-20261013/evidence/wallet-desktop.png](../../sdd/mesa-decisao-20261013/evidence/wallet-desktop.png) | imagem: wallet-desktop |
| [sdd/mesa-decisao-20261013/evidence/wallet-mobile.png](../../sdd/mesa-decisao-20261013/evidence/wallet-mobile.png) | imagem: wallet-mobile |
| [sdd/mesa-decisao-20261013/evidence/wallet-ui-results.json](../../sdd/mesa-decisao-20261013/evidence/wallet-ui-results.json) | evidencia-estruturada: wallet-ui-results |
| [sdd/mesa-decisao-20261013/final-backend-metrics.json](../../sdd/mesa-decisao-20261013/final-backend-metrics.json) | evidencia-estruturada: final-backend-metrics |
| [sdd/mesa-decisao-20261013/final-web-metrics.json](../../sdd/mesa-decisao-20261013/final-web-metrics.json) | evidencia-estruturada: final-web-metrics |
| [sdd/mesa-decisao-20261013/integrity-final.json](../../sdd/mesa-decisao-20261013/integrity-final.json) | evidencia-estruturada: integrity-final |
| [sdd/mesa-decisao-20261013/jev-cancellation-receipt.json](../../sdd/mesa-decisao-20261013/jev-cancellation-receipt.json) | evidencia-estruturada: jev-cancellation-receipt |
| [sdd/mesa-decisao-20261013/jev-mobile-receipts.json](../../sdd/mesa-decisao-20261013/jev-mobile-receipts.json) | evidencia-estruturada: jev-mobile-receipts |
| [sdd/mesa-decisao-20261013/jev-purity-receipt.json](../../sdd/mesa-decisao-20261013/jev-purity-receipt.json) | evidencia-estruturada: jev-purity-receipt |
| [sdd/mesa-decisao-20261013/jev-receipt.json](../../sdd/mesa-decisao-20261013/jev-receipt.json) | evidencia-estruturada: jev-receipt |
| [sdd/mesa-decisao-20261013/portfolio-evidence.json](../../sdd/mesa-decisao-20261013/portfolio-evidence.json) | evidencia-estruturada: portfolio-evidence |
| [sdd/mesa-decisao-20261013/purity-final.log](../../sdd/mesa-decisao-20261013/purity-final.log) | log: purity-final |
| [sdd/mesa-decisao-20261013/typecheck-root.log](../../sdd/mesa-decisao-20261013/typecheck-root.log) | log: typecheck-root |
| [sdd/mesa-decisao-20261013/typecheck-web.log](../../sdd/mesa-decisao-20261013/typecheck-web.log) | log: typecheck-web |
| [sdd/mesa-decisao-20261013/ui-client-red.log](../../sdd/mesa-decisao-20261013/ui-client-red.log) | log: ui-client-red |
| [sdd/mesa-decisao-20261013/ui-red.log](../../sdd/mesa-decisao-20261013/ui-red.log) | log: ui-red |
| [sdd/mesa-decisao-20261013/web-targeted-final.log](../../sdd/mesa-decisao-20261013/web-targeted-final.log) | log: web-targeted-final |
| [sdd/mesa-decisao-20261013/web-targeted-metrics.json](../../sdd/mesa-decisao-20261013/web-targeted-metrics.json) | evidencia-estruturada: web-targeted-metrics |
| [sdd/mesa-decisao-20261013/web-targeted.log](../../sdd/mesa-decisao-20261013/web-targeted.log) | log: web-targeted |
| [sdd/mesa-decisao-20261013/web-tests-metrics.json](../../sdd/mesa-decisao-20261013/web-tests-metrics.json) | evidencia-estruturada: web-tests-metrics |
| [sdd/mesa-decisao-20261013/web-tests.log](../../sdd/mesa-decisao-20261013/web-tests.log) | log: web-tests |
| [sdd/ui-audit-20261013/baseline-hashes.json](../../sdd/ui-audit-20261013/baseline-hashes.json) | evidencia-estruturada: baseline-hashes |
| [sdd/ui-audit-20261013/baseline-status.txt](../../sdd/ui-audit-20261013/baseline-status.txt) | registro-textual: baseline-status |
| [sdd/ui-audit-20261013/build-responsive.log](../../sdd/ui-audit-20261013/build-responsive.log) | log: build-responsive |
| [sdd/ui-audit-20261013/copy-green.log](../../sdd/ui-audit-20261013/copy-green.log) | log: copy-green |
| [sdd/ui-audit-20261013/copy-red.log](../../sdd/ui-audit-20261013/copy-red.log) | log: copy-red |
| [sdd/ui-audit-20261013/evidence-references.json](../../sdd/ui-audit-20261013/evidence-references.json) | evidencia-estruturada: evidence-references |
| [sdd/ui-audit-20261013/final-manifest.json](../../sdd/ui-audit-20261013/final-manifest.json) | evidencia-estruturada: final-manifest |
| [sdd/ui-audit-20261013/integration-manifest.json](../../sdd/ui-audit-20261013/integration-manifest.json) | evidencia-estruturada: integration-manifest |
| [sdd/ui-audit-20261013/jev-integration-receipt.json](../../sdd/ui-audit-20261013/jev-integration-receipt.json) | evidencia-estruturada: jev-integration-receipt |
| [sdd/ui-audit-20261013/jev-responsive-receipt.json](../../sdd/ui-audit-20261013/jev-responsive-receipt.json) | evidencia-estruturada: jev-responsive-receipt |
| [sdd/ui-audit-20261013/jev-source-repair-receipt.json](../../sdd/ui-audit-20261013/jev-source-repair-receipt.json) | evidencia-estruturada: jev-source-repair-receipt |
| [sdd/ui-audit-20261013/market-inputs-green.log](../../sdd/ui-audit-20261013/market-inputs-green.log) | log: market-inputs-green |
| [sdd/ui-audit-20261013/market-inputs-red.log](../../sdd/ui-audit-20261013/market-inputs-red.log) | log: market-inputs-red |
| [sdd/ui-audit-20261013/reconciliation-manifest.json](../../sdd/ui-audit-20261013/reconciliation-manifest.json) | evidencia-estruturada: reconciliation-manifest |
