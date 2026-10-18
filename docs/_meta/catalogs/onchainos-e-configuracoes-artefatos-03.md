---
title: "OnchainOS, gateway e configurações: artefatos, parte 3"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "onchainos"]
sources: ["docs/sdd/config-onchain-smartmoney/evidence/onchain-traders-synthetic-1600x900.png", "docs/sdd/config-onchain-smartmoney/evidence/probe-dock-columns.js", "docs/sdd/config-onchain-smartmoney/evidence/settings-1600x900.png", "docs/sdd/config-onchain-smartmoney/evidence/settings-390x844.png", "docs/sdd/config-onchain-smartmoney/evidence/settings-empty-1600x900.png", "docs/sdd/config-onchain-smartmoney/evidence/settings-usage-1600x900.png", "docs/sdd/config-onchain-smartmoney/evidence/settings-usage-390x844.png", "docs/sdd/config-onchain-smartmoney/evidence/smc-btc-15m-1600x900.png", "docs/sdd/config-onchain-smartmoney/evidence/smc-btc-1m-1600x900.png", "docs/sdd/config-onchain-smartmoney/evidence/smc-eth-1h-1600x900.png", "docs/sdd/config-onchain-smartmoney/evidence/smc-groups-popover-1600x900.png", "docs/sdd/config-onchain-smartmoney/evidence/smc-off-1600x900.png", "docs/sdd/config-onchain-smartmoney/evidence/smc-renko-1600x900.png", "docs/sdd/config-onchain-smartmoney/fase-2/evidence/baseline-hashes.json", "docs/sdd/config-onchain-smartmoney/fase-2/evidence/docs-params-2026-10-12.json", "docs/sdd/config-onchain-smartmoney/fase-2/evidence/escalas-percentuais-2026-10-12.json", "docs/sdd/config-onchain-smartmoney/fase-2/evidence/portal-endpoints-2026-10-12.json", "docs/sdd/config-onchain-smartmoney/fase-2/evidence/probe-2026-10-12.json", "docs/sdd/config-onchain-smartmoney/fase-2/evidence/tamanho-do-brief-exemplo.txt", "docs/sdd/config-onchain-smartmoney/fase-2/tools/verify.ts"]
confidence: medium
---

# OnchainOS, gateway e configurações: artefatos, parte 3

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[onchainos-e-configuracoes]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [sdd/config-onchain-smartmoney/evidence/onchain-traders-synthetic-1600x900.png](../../sdd/config-onchain-smartmoney/evidence/onchain-traders-synthetic-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/probe-dock-columns.js](../../sdd/config-onchain-smartmoney/evidence/probe-dock-columns.js) | ferramenta: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/settings-1600x900.png](../../sdd/config-onchain-smartmoney/evidence/settings-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/settings-390x844.png](../../sdd/config-onchain-smartmoney/evidence/settings-390x844.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/settings-empty-1600x900.png](../../sdd/config-onchain-smartmoney/evidence/settings-empty-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/settings-usage-1600x900.png](../../sdd/config-onchain-smartmoney/evidence/settings-usage-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/settings-usage-390x844.png](../../sdd/config-onchain-smartmoney/evidence/settings-usage-390x844.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/smc-btc-15m-1600x900.png](../../sdd/config-onchain-smartmoney/evidence/smc-btc-15m-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/smc-btc-1m-1600x900.png](../../sdd/config-onchain-smartmoney/evidence/smc-btc-1m-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/smc-eth-1h-1600x900.png](../../sdd/config-onchain-smartmoney/evidence/smc-eth-1h-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/smc-groups-popover-1600x900.png](../../sdd/config-onchain-smartmoney/evidence/smc-groups-popover-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/smc-off-1600x900.png](../../sdd/config-onchain-smartmoney/evidence/smc-off-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/evidence/smc-renko-1600x900.png](../../sdd/config-onchain-smartmoney/evidence/smc-renko-1600x900.png) | imagem: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/fase-2/evidence/baseline-hashes.json](../../sdd/config-onchain-smartmoney/fase-2/evidence/baseline-hashes.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/fase-2/evidence/docs-params-2026-10-12.json](../../sdd/config-onchain-smartmoney/fase-2/evidence/docs-params-2026-10-12.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/fase-2/evidence/escalas-percentuais-2026-10-12.json](../../sdd/config-onchain-smartmoney/fase-2/evidence/escalas-percentuais-2026-10-12.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/fase-2/evidence/portal-endpoints-2026-10-12.json](../../sdd/config-onchain-smartmoney/fase-2/evidence/portal-endpoints-2026-10-12.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/fase-2/evidence/probe-2026-10-12.json](../../sdd/config-onchain-smartmoney/fase-2/evidence/probe-2026-10-12.json) | evidencia-estruturada: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/fase-2/evidence/tamanho-do-brief-exemplo.txt](../../sdd/config-onchain-smartmoney/fase-2/evidence/tamanho-do-brief-exemplo.txt) | registro-textual: artefato de apoio preservado no caminho original |
| [sdd/config-onchain-smartmoney/fase-2/tools/verify.ts](../../sdd/config-onchain-smartmoney/fase-2/tools/verify.ts) | ferramenta: artefato de apoio preservado no caminho original |
