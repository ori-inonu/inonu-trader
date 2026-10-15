---
title: "Interface, Mesa e Central: artefatos, parte 3"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "interface"]
sources: ["docs/sdd/ui-audit-20261013/screenshot-manifest.json", "docs/sdd/ui-audit-20261013/screenshots/console-1024.png", "docs/sdd/ui-audit-20261013/screenshots/console-1440.png", "docs/sdd/ui-audit-20261013/screenshots/console-320-end.png", "docs/sdd/ui-audit-20261013/screenshots/console-390.png", "docs/sdd/ui-audit-20261013/screenshots/doctor-1024.png", "docs/sdd/ui-audit-20261013/screenshots/doctor-1440.png", "docs/sdd/ui-audit-20261013/screenshots/doctor-320.png", "docs/sdd/ui-audit-20261013/screenshots/doctor-390.png", "docs/sdd/ui-audit-20261013/screenshots/final-wallet-1024.png", "docs/sdd/ui-audit-20261013/screenshots/integrated-radar-320.png", "docs/sdd/ui-audit-20261013/screenshots/integrated-wallet-1024.png", "docs/sdd/ui-audit-20261013/screenshots/integrated-wallet-320-end.png", "docs/sdd/ui-audit-20261013/screenshots/rastreador-1024.png", "docs/sdd/ui-audit-20261013/screenshots/rastreador-1440-top.png", "docs/sdd/ui-audit-20261013/screenshots/rastreador-320-bottom.png", "docs/sdd/ui-audit-20261013/screenshots/rastreador-320.png", "docs/sdd/ui-audit-20261013/screenshots/rastreador-390.png", "docs/sdd/ui-audit-20261013/screenshots/responsive-chart-390.png", "docs/sdd/ui-audit-20261013/screenshots/responsive-console-320.png", "docs/sdd/ui-audit-20261013/screenshots/responsive-radar-1440.png", "docs/sdd/ui-audit-20261013/screenshots/responsive-radar-320.png", "docs/sdd/ui-audit-20261013/screenshots/responsive-wallet-1024.png", "docs/sdd/ui-audit-20261013/screenshots/responsive-wallet-320-end.png", "docs/sdd/ui-audit-20261013/screenshots/responsive-wallet-390-bottom.png", "docs/sdd/ui-audit-20261013/screenshots/responsive-wallet-390.png", "docs/sdd/ui-audit-20261013/screenshots/responsive-wallet-821.png", "docs/sdd/ui-audit-20261013/screenshots/settings-1024.png", "docs/sdd/ui-audit-20261013/screenshots/settings-1440-bottom.png", "docs/sdd/ui-audit-20261013/screenshots/settings-1440.png", "docs/sdd/ui-audit-20261013/screenshots/settings-320-bottom.png", "docs/sdd/ui-audit-20261013/screenshots/settings-320.png", "docs/sdd/ui-audit-20261013/screenshots/settings-390.png", "docs/sdd/ui-audit-20261013/tests-baseline-final.log", "docs/sdd/ui-audit-20261013/tests-complete-final.log", "docs/sdd/ui-audit-20261013/tests-integrated-original.log", "docs/sdd/ui-audit-20261013/typecheck-integrated-original.log", "docs/sdd/ui-mesa-cabecalho-20261013/MANIFEST.sha256", "docs/UI-EXECUTION-TRUTH-CYCLE-PROPOSAL.json", "docs/UI-EXECUTION-TRUTH-CYCLE-REVIEW.json", "docs/UI-EXECUTION-TRUTH-CYCLE-TEMPLATE.json"]
confidence: medium
---

# Interface, Mesa e Central: artefatos, parte 3

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[interface-e-central]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [sdd/ui-audit-20261013/screenshot-manifest.json](../../sdd/ui-audit-20261013/screenshot-manifest.json) | evidencia-estruturada: screenshot-manifest |
| [sdd/ui-audit-20261013/screenshots/console-1024.png](../../sdd/ui-audit-20261013/screenshots/console-1024.png) | imagem: console-1024 |
| [sdd/ui-audit-20261013/screenshots/console-1440.png](../../sdd/ui-audit-20261013/screenshots/console-1440.png) | imagem: console-1440 |
| [sdd/ui-audit-20261013/screenshots/console-320-end.png](../../sdd/ui-audit-20261013/screenshots/console-320-end.png) | imagem: console-320-end |
| [sdd/ui-audit-20261013/screenshots/console-390.png](../../sdd/ui-audit-20261013/screenshots/console-390.png) | imagem: console-390 |
| [sdd/ui-audit-20261013/screenshots/doctor-1024.png](../../sdd/ui-audit-20261013/screenshots/doctor-1024.png) | imagem: doctor-1024 |
| [sdd/ui-audit-20261013/screenshots/doctor-1440.png](../../sdd/ui-audit-20261013/screenshots/doctor-1440.png) | imagem: doctor-1440 |
| [sdd/ui-audit-20261013/screenshots/doctor-320.png](../../sdd/ui-audit-20261013/screenshots/doctor-320.png) | imagem: doctor-320 |
| [sdd/ui-audit-20261013/screenshots/doctor-390.png](../../sdd/ui-audit-20261013/screenshots/doctor-390.png) | imagem: doctor-390 |
| [sdd/ui-audit-20261013/screenshots/final-wallet-1024.png](../../sdd/ui-audit-20261013/screenshots/final-wallet-1024.png) | imagem: final-wallet-1024 |
| [sdd/ui-audit-20261013/screenshots/integrated-radar-320.png](../../sdd/ui-audit-20261013/screenshots/integrated-radar-320.png) | imagem: integrated-radar-320 |
| [sdd/ui-audit-20261013/screenshots/integrated-wallet-1024.png](../../sdd/ui-audit-20261013/screenshots/integrated-wallet-1024.png) | imagem: integrated-wallet-1024 |
| [sdd/ui-audit-20261013/screenshots/integrated-wallet-320-end.png](../../sdd/ui-audit-20261013/screenshots/integrated-wallet-320-end.png) | imagem: integrated-wallet-320-end |
| [sdd/ui-audit-20261013/screenshots/rastreador-1024.png](../../sdd/ui-audit-20261013/screenshots/rastreador-1024.png) | imagem: rastreador-1024 |
| [sdd/ui-audit-20261013/screenshots/rastreador-1440-top.png](../../sdd/ui-audit-20261013/screenshots/rastreador-1440-top.png) | imagem: rastreador-1440-top |
| [sdd/ui-audit-20261013/screenshots/rastreador-320-bottom.png](../../sdd/ui-audit-20261013/screenshots/rastreador-320-bottom.png) | imagem: rastreador-320-bottom |
| [sdd/ui-audit-20261013/screenshots/rastreador-320.png](../../sdd/ui-audit-20261013/screenshots/rastreador-320.png) | imagem: rastreador-320 |
| [sdd/ui-audit-20261013/screenshots/rastreador-390.png](../../sdd/ui-audit-20261013/screenshots/rastreador-390.png) | imagem: rastreador-390 |
| [sdd/ui-audit-20261013/screenshots/responsive-chart-390.png](../../sdd/ui-audit-20261013/screenshots/responsive-chart-390.png) | imagem: responsive-chart-390 |
| [sdd/ui-audit-20261013/screenshots/responsive-console-320.png](../../sdd/ui-audit-20261013/screenshots/responsive-console-320.png) | imagem: responsive-console-320 |
| [sdd/ui-audit-20261013/screenshots/responsive-radar-1440.png](../../sdd/ui-audit-20261013/screenshots/responsive-radar-1440.png) | imagem: responsive-radar-1440 |
| [sdd/ui-audit-20261013/screenshots/responsive-radar-320.png](../../sdd/ui-audit-20261013/screenshots/responsive-radar-320.png) | imagem: responsive-radar-320 |
| [sdd/ui-audit-20261013/screenshots/responsive-wallet-1024.png](../../sdd/ui-audit-20261013/screenshots/responsive-wallet-1024.png) | imagem: responsive-wallet-1024 |
| [sdd/ui-audit-20261013/screenshots/responsive-wallet-320-end.png](../../sdd/ui-audit-20261013/screenshots/responsive-wallet-320-end.png) | imagem: responsive-wallet-320-end |
| [sdd/ui-audit-20261013/screenshots/responsive-wallet-390-bottom.png](../../sdd/ui-audit-20261013/screenshots/responsive-wallet-390-bottom.png) | imagem: responsive-wallet-390-bottom |
| [sdd/ui-audit-20261013/screenshots/responsive-wallet-390.png](../../sdd/ui-audit-20261013/screenshots/responsive-wallet-390.png) | imagem: responsive-wallet-390 |
| [sdd/ui-audit-20261013/screenshots/responsive-wallet-821.png](../../sdd/ui-audit-20261013/screenshots/responsive-wallet-821.png) | imagem: responsive-wallet-821 |
| [sdd/ui-audit-20261013/screenshots/settings-1024.png](../../sdd/ui-audit-20261013/screenshots/settings-1024.png) | imagem: settings-1024 |
| [sdd/ui-audit-20261013/screenshots/settings-1440-bottom.png](../../sdd/ui-audit-20261013/screenshots/settings-1440-bottom.png) | imagem: settings-1440-bottom |
| [sdd/ui-audit-20261013/screenshots/settings-1440.png](../../sdd/ui-audit-20261013/screenshots/settings-1440.png) | imagem: settings-1440 |
| [sdd/ui-audit-20261013/screenshots/settings-320-bottom.png](../../sdd/ui-audit-20261013/screenshots/settings-320-bottom.png) | imagem: settings-320-bottom |
| [sdd/ui-audit-20261013/screenshots/settings-320.png](../../sdd/ui-audit-20261013/screenshots/settings-320.png) | imagem: settings-320 |
| [sdd/ui-audit-20261013/screenshots/settings-390.png](../../sdd/ui-audit-20261013/screenshots/settings-390.png) | imagem: settings-390 |
| [sdd/ui-audit-20261013/tests-baseline-final.log](../../sdd/ui-audit-20261013/tests-baseline-final.log) | log: tests-baseline-final |
| [sdd/ui-audit-20261013/tests-complete-final.log](../../sdd/ui-audit-20261013/tests-complete-final.log) | log: tests-complete-final |
| [sdd/ui-audit-20261013/tests-integrated-original.log](../../sdd/ui-audit-20261013/tests-integrated-original.log) | log: tests-integrated-original |
| [sdd/ui-audit-20261013/typecheck-integrated-original.log](../../sdd/ui-audit-20261013/typecheck-integrated-original.log) | log: typecheck-integrated-original |
| [sdd/ui-mesa-cabecalho-20261013/MANIFEST.sha256](../../sdd/ui-mesa-cabecalho-20261013/MANIFEST.sha256) | manifesto: MANIFEST |
| [UI-EXECUTION-TRUTH-CYCLE-PROPOSAL.json](../../UI-EXECUTION-TRUTH-CYCLE-PROPOSAL.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [UI-EXECUTION-TRUTH-CYCLE-REVIEW.json](../../UI-EXECUTION-TRUTH-CYCLE-REVIEW.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [UI-EXECUTION-TRUTH-CYCLE-TEMPLATE.json](../../UI-EXECUTION-TRUTH-CYCLE-TEMPLATE.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
