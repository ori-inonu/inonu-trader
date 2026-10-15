---
title: "Gráfico e analytics: artefatos, parte 1"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "analytics"]
sources: ["docs/sdd/backend-audit-20261013/evidence/quant-portfolio.baseline.txt", "docs/sdd/backend-audit-20261013/evidence/quant-portfolio.preintegration.txt", "docs/sdd/dados-quant/evidence/calibration-latest.json", "docs/sdd/dados-quant/evidence/calibration-train30.json", "docs/sdd/dados-quant/evidence/calibration-train300bars.json", "docs/sdd/grafico-jev/evidence/fixture-1600x900-card.png", "docs/sdd/grafico-jev/evidence/fixture-390x844-card.png", "docs/sdd/grafico-jev/evidence/fixture-f2-heikin-1600x900.png", "docs/sdd/grafico-jev/evidence/fixture-f2-indicators-1280x720.png", "docs/sdd/grafico-jev/evidence/fixture-f2-indicators-1600x900.png", "docs/sdd/grafico-jev/evidence/fixture-f2-renko-1600x900.png", "docs/sdd/grafico-jev/evidence/fixture-f5-details-1280x720.png", "docs/sdd/grafico-jev/evidence/fixture-f5-details-1600x900.png", "docs/sdd/grafico-jev/evidence/fixture-f5-indicators-1600x900.png", "docs/sdd/grafico-jev/evidence/fixture-f5-noanalysis-1600x900.png", "docs/sdd/grafico-jev/evidence/live-f5-indicators-1100x700.png", "docs/sdd/grafico-jev/evidence/live-f5-indicators-1280x720.png", "docs/sdd/grafico-jev/evidence/live-f5-indicators-1600x900.png", "docs/sdd/grafico-jev/evidence/live-f5-jevtab-390x844.png", "docs/sdd/grafico-jev/evidence/live-renko-1600x900.png", "docs/sdd/grafico-jev/evidence/live-rsi-macd-1600x900.png", "docs/sdd/grafico-jev/evidence/mesa-1280x720-wings-fixed.png", "docs/sdd/grafico-jev/evidence/mesa-1280x720.png", "docs/sdd/grafico-jev/evidence/mesa-1600x900.png", "docs/sdd/grafico-jev/evidence/mesa-390x844-grafico.png", "docs/sdd/inteligencia-decisao/evidence/git-status-inicio.txt"]
confidence: medium
---

# Gráfico e analytics: artefatos, parte 1

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[grafico-e-analytics]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [sdd/backend-audit-20261013/evidence/quant-portfolio.baseline.txt](../../sdd/backend-audit-20261013/evidence/quant-portfolio.baseline.txt) | registro-textual: quant-portfolio.baseline |
| [sdd/backend-audit-20261013/evidence/quant-portfolio.preintegration.txt](../../sdd/backend-audit-20261013/evidence/quant-portfolio.preintegration.txt) | registro-textual: quant-portfolio.preintegration |
| [sdd/dados-quant/evidence/calibration-latest.json](../../sdd/dados-quant/evidence/calibration-latest.json) | evidencia-estruturada: calibration-latest |
| [sdd/dados-quant/evidence/calibration-train30.json](../../sdd/dados-quant/evidence/calibration-train30.json) | evidencia-estruturada: calibration-train30 |
| [sdd/dados-quant/evidence/calibration-train300bars.json](../../sdd/dados-quant/evidence/calibration-train300bars.json) | evidencia-estruturada: calibration-train300bars |
| [sdd/grafico-jev/evidence/fixture-1600x900-card.png](../../sdd/grafico-jev/evidence/fixture-1600x900-card.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/fixture-390x844-card.png](../../sdd/grafico-jev/evidence/fixture-390x844-card.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/fixture-f2-heikin-1600x900.png](../../sdd/grafico-jev/evidence/fixture-f2-heikin-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/fixture-f2-indicators-1280x720.png](../../sdd/grafico-jev/evidence/fixture-f2-indicators-1280x720.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/fixture-f2-indicators-1600x900.png](../../sdd/grafico-jev/evidence/fixture-f2-indicators-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/fixture-f2-renko-1600x900.png](../../sdd/grafico-jev/evidence/fixture-f2-renko-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/fixture-f5-details-1280x720.png](../../sdd/grafico-jev/evidence/fixture-f5-details-1280x720.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/fixture-f5-details-1600x900.png](../../sdd/grafico-jev/evidence/fixture-f5-details-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/fixture-f5-indicators-1600x900.png](../../sdd/grafico-jev/evidence/fixture-f5-indicators-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/fixture-f5-noanalysis-1600x900.png](../../sdd/grafico-jev/evidence/fixture-f5-noanalysis-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/live-f5-indicators-1100x700.png](../../sdd/grafico-jev/evidence/live-f5-indicators-1100x700.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/live-f5-indicators-1280x720.png](../../sdd/grafico-jev/evidence/live-f5-indicators-1280x720.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/live-f5-indicators-1600x900.png](../../sdd/grafico-jev/evidence/live-f5-indicators-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/live-f5-jevtab-390x844.png](../../sdd/grafico-jev/evidence/live-f5-jevtab-390x844.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/live-renko-1600x900.png](../../sdd/grafico-jev/evidence/live-renko-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/live-rsi-macd-1600x900.png](../../sdd/grafico-jev/evidence/live-rsi-macd-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/mesa-1280x720-wings-fixed.png](../../sdd/grafico-jev/evidence/mesa-1280x720-wings-fixed.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/mesa-1280x720.png](../../sdd/grafico-jev/evidence/mesa-1280x720.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/mesa-1600x900.png](../../sdd/grafico-jev/evidence/mesa-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/grafico-jev/evidence/mesa-390x844-grafico.png](../../sdd/grafico-jev/evidence/mesa-390x844-grafico.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/inteligencia-decisao/evidence/git-status-inicio.txt](../../sdd/inteligencia-decisao/evidence/git-status-inicio.txt) | registro-textual: git-status-inicio |
