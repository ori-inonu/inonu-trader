---
title: "OnchainOS, gateway e configurações: documentos, parte 1"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "onchainos"]
sources: ["docs/JEV-DECISAO-ONCHAIN-OS.md", "docs/OKX-INVESTIGACAO.md", "docs/OKX-ONCHAINOS-DADOS-SPEC.md", "docs/OKX-PAYMENTS-MATRIX-DELTA-20261011.md", "docs/OKX-PROPOSAL.md", "docs/OKX-SPEC.md", "docs/ONCHAIN-INTEGRATION-GAP-RESEARCH-20261011.md", "docs/PAYMENTS-MATRIX-DELTA-INDEPENDENT-REVIEW-20261011.md", "docs/research/OKX-RESOURCE-MATRIX-REFRESH-20261011.md", "docs/research/ONCHAIN-CAPTURE-DECISION-GAP-20261011.md", "docs/research/ONCHAIN-OS-RECHECK-20261011.md", "docs/research/ONCHAIN-PRICE-TIME-QUALIFICATION-20261011.md", "docs/research/R1-onchain-os-capacidades.md", "docs/research/R6-onchain-os-inventario.md", "docs/sdd/backend-audit-20261013/ONCHAIN-INTERVAL-DIAGNOSIS.md", "docs/sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-AUDIT.md", "docs/sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-LIVE-VERIFICATION.md", "docs/sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-SPEC-REVIEW.md", "docs/sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-STANDARDS-REVIEW.md", "docs/sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-VERIFICATION.md", "docs/sdd/backend-audit-20261013/ONCHAIN-INTERVAL-SPEC-REVIEW.md", "docs/sdd/backend-audit-20261013/ONCHAIN-INTERVAL-STANDARDS-REVIEW.md", "docs/sdd/backend-audit-20261013/ONCHAIN-INTERVAL-VERIFICATION.md", "docs/sdd/backend-audit-20261013/ONCHAIN-SPEC-PREFLIGHT.md", "docs/sdd/backend-audit-20261013/ONCHAIN-SPEC-REVIEW.md", "docs/sdd/backend-audit-20261013/ONCHAIN-SPEC.md", "docs/sdd/backend-audit-20261013/ONCHAIN-STANDARDS-REVIEW.md", "docs/sdd/backend-audit-20261013/ONCHAIN-VERIFICATION.md", "docs/sdd/config-onchain-smartmoney/evidence/INDEX.md", "docs/sdd/config-onchain-smartmoney/evidence/live-onchainos-20261012.md", "docs/sdd/config-onchain-smartmoney/fase-2/ACHADOS.md", "docs/sdd/config-onchain-smartmoney/fase-2/ADENDO-REV3.md", "docs/sdd/config-onchain-smartmoney/fase-2/evidence/revisao-independente-1.md", "docs/sdd/config-onchain-smartmoney/fase-2/README.md", "docs/sdd/config-onchain-smartmoney/fase-2/RECONCILIACAO.md", "docs/sdd/config-onchain-smartmoney/fase-2/SPEC.md", "docs/sdd/config-onchain-smartmoney/fase-2/TASKS.md", "docs/sdd/config-onchain-smartmoney/okx-portal-coverage.md", "docs/sdd/config-onchain-smartmoney/onchainos-gateway.md", "docs/sdd/config-onchain-smartmoney/spec.md", "docs/superpowers/plans/2026-10-09-okx-readonly.md"]
confidence: medium
---

# OnchainOS, gateway e configurações: documentos, parte 1

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[onchainos-e-configuracoes]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [JEV-DECISAO-ONCHAIN-OS.md](../../JEV-DECISAO-ONCHAIN-OS.md) | guia: Tomada de decisão do Jev sobre o Onchain OS: como construir |
| [OKX-INVESTIGACAO.md](../../OKX-INVESTIGACAO.md) | guia: OKX, integração e potencial de retorno |
| [OKX-ONCHAINOS-DADOS-SPEC.md](../../OKX-ONCHAINOS-DADOS-SPEC.md) | contrato: Camada de dados do OKX Onchain OS: clientes somente leitura e gravador de captura |
| [OKX-PAYMENTS-MATRIX-DELTA-20261011.md](../../OKX-PAYMENTS-MATRIX-DELTA-20261011.md) | guia: Delta de pesquisa - pagamentos e integração econômica |
| [OKX-PROPOSAL.md](../../OKX-PROPOSAL.md) | proposta: Proposta de integração OKX, 2026-10-09 |
| [OKX-SPEC.md](../../OKX-SPEC.md) | contrato: OKX Web3: conexão local de leitura |
| [ONCHAIN-INTEGRATION-GAP-RESEARCH-20261011.md](../../ONCHAIN-INTEGRATION-GAP-RESEARCH-20261011.md) | pesquisa: ONCHAIN-INTEGRATION-GAP-RESEARCH-20261011 |
| [PAYMENTS-MATRIX-DELTA-INDEPENDENT-REVIEW-20261011.md](../../PAYMENTS-MATRIX-DELTA-INDEPENDENT-REVIEW-20261011.md) | revisao: Revisão independente - delta Payments |
| [research/OKX-RESOURCE-MATRIX-REFRESH-20261011.md](../../research/OKX-RESOURCE-MATRIX-REFRESH-20261011.md) | pesquisa: Onchain OS: atualização da matriz de recursos |
| [research/ONCHAIN-CAPTURE-DECISION-GAP-20261011.md](../../research/ONCHAIN-CAPTURE-DECISION-GAP-20261011.md) | pesquisa: Capture to decision evidence gap |
| [research/ONCHAIN-OS-RECHECK-20261011.md](../../research/ONCHAIN-OS-RECHECK-20261011.md) | pesquisa: Official Onchain OS recheck, 2026-10-11 |
| [research/ONCHAIN-PRICE-TIME-QUALIFICATION-20261011.md](../../research/ONCHAIN-PRICE-TIME-QUALIFICATION-20261011.md) | contrato: Price observation time qualification |
| [research/R1-onchain-os-capacidades.md](../../research/R1-onchain-os-capacidades.md) | pesquisa: R1: Capacidades do OKX Onchain OS (OKX DEX API e Web3 API) para descobrir oportunidades e agir em carteira |
| [research/R6-onchain-os-inventario.md](../../research/R6-onchain-os-inventario.md) | pesquisa: R6: inventário de páginas e endpoints do OKX Onchain OS (nível de página) |
| [sdd/backend-audit-20261013/ONCHAIN-INTERVAL-DIAGNOSIS.md](../../sdd/backend-audit-20261013/ONCHAIN-INTERVAL-DIAGNOSIS.md) | revisao: ONCHAIN-INTERVAL-DIAGNOSIS |
| [sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-AUDIT.md](../../sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-AUDIT.md) | revisao: ONCHAIN-INTERVAL-FINAL-AUDIT |
| [sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-LIVE-VERIFICATION.md](../../sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-LIVE-VERIFICATION.md) | revisao: ONCHAIN-INTERVAL-FINAL-LIVE-VERIFICATION |
| [sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-SPEC-REVIEW.md](../../sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-SPEC-REVIEW.md) | revisao: ONCHAIN-INTERVAL-FINAL-SPEC-REVIEW |
| [sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-STANDARDS-REVIEW.md](../../sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-STANDARDS-REVIEW.md) | revisao: ONCHAIN-INTERVAL-FINAL-STANDARDS-REVIEW |
| [sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-VERIFICATION.md](../../sdd/backend-audit-20261013/ONCHAIN-INTERVAL-FINAL-VERIFICATION.md) | revisao: ONCHAIN-INTERVAL-FINAL-VERIFICATION |
| [sdd/backend-audit-20261013/ONCHAIN-INTERVAL-SPEC-REVIEW.md](../../sdd/backend-audit-20261013/ONCHAIN-INTERVAL-SPEC-REVIEW.md) | revisao: ONCHAIN-INTERVAL-SPEC-REVIEW |
| [sdd/backend-audit-20261013/ONCHAIN-INTERVAL-STANDARDS-REVIEW.md](../../sdd/backend-audit-20261013/ONCHAIN-INTERVAL-STANDARDS-REVIEW.md) | revisao: ONCHAIN-INTERVAL-STANDARDS-REVIEW |
| [sdd/backend-audit-20261013/ONCHAIN-INTERVAL-VERIFICATION.md](../../sdd/backend-audit-20261013/ONCHAIN-INTERVAL-VERIFICATION.md) | revisao: ONCHAIN-INTERVAL-VERIFICATION |
| [sdd/backend-audit-20261013/ONCHAIN-SPEC-PREFLIGHT.md](../../sdd/backend-audit-20261013/ONCHAIN-SPEC-PREFLIGHT.md) | revisao: ONCHAIN-SPEC-PREFLIGHT |
| [sdd/backend-audit-20261013/ONCHAIN-SPEC-REVIEW.md](../../sdd/backend-audit-20261013/ONCHAIN-SPEC-REVIEW.md) | revisao: ONCHAIN-SPEC-REVIEW |
| [sdd/backend-audit-20261013/ONCHAIN-SPEC.md](../../sdd/backend-audit-20261013/ONCHAIN-SPEC.md) | contrato: ONCHAIN-SPEC |
| [sdd/backend-audit-20261013/ONCHAIN-STANDARDS-REVIEW.md](../../sdd/backend-audit-20261013/ONCHAIN-STANDARDS-REVIEW.md) | revisao: ONCHAIN-STANDARDS-REVIEW |
| [sdd/backend-audit-20261013/ONCHAIN-VERIFICATION.md](../../sdd/backend-audit-20261013/ONCHAIN-VERIFICATION.md) | revisao: ONCHAIN-VERIFICATION |
| [sdd/config-onchain-smartmoney/evidence/INDEX.md](../../sdd/config-onchain-smartmoney/evidence/INDEX.md) | evidencia: Evidência desta entrega |
| [sdd/config-onchain-smartmoney/evidence/live-onchainos-20261012.md](../../sdd/config-onchain-smartmoney/evidence/live-onchainos-20261012.md) | evidencia: Live OnchainOS smoke: novas rotas (2026-10-12) |
| [sdd/config-onchain-smartmoney/fase-2/ACHADOS.md](../../sdd/config-onchain-smartmoney/fase-2/ACHADOS.md) | pesquisa: Registro de achados (2026-10-12 e 2026-10-13) |
| [sdd/config-onchain-smartmoney/fase-2/ADENDO-REV3.md](../../sdd/config-onchain-smartmoney/fase-2/ADENDO-REV3.md) | proposta: Adendo: proposta de revisão 3 da SPEC do instalável |
| [sdd/config-onchain-smartmoney/fase-2/evidence/revisao-independente-1.md](../../sdd/config-onchain-smartmoney/fase-2/evidence/revisao-independente-1.md) | revisao: Parecer de revisão independente 1 (somente leitura) |
| [sdd/config-onchain-smartmoney/fase-2/README.md](../../sdd/config-onchain-smartmoney/fase-2/README.md) | guia: Fase 2 on-chain: achados medidos, adendo rev-3 e SPEC |
| [sdd/config-onchain-smartmoney/fase-2/RECONCILIACAO.md](../../sdd/config-onchain-smartmoney/fase-2/RECONCILIACAO.md) | registro-governanca: Reconciliação com a SPEC do instalável (inonu-desktop-v1, revisão r2) |
| [sdd/config-onchain-smartmoney/fase-2/SPEC.md](../../sdd/config-onchain-smartmoney/fase-2/SPEC.md) | contrato: SPEC da Fase 2 on-chain: digest para o Inonu, medição, rotas novas e superfícies |
| [sdd/config-onchain-smartmoney/fase-2/TASKS.md](../../sdd/config-onchain-smartmoney/fase-2/TASKS.md) | plano: TASKS da Fase 2 on-chain |
| [sdd/config-onchain-smartmoney/okx-portal-coverage.md](../../sdd/config-onchain-smartmoney/okx-portal-coverage.md) | guia: Cobertura dos endpoints do Dev Portal (projeto Inonu Trader) |
| [sdd/config-onchain-smartmoney/onchainos-gateway.md](../../sdd/config-onchain-smartmoney/onchainos-gateway.md) | guia: Gateway OnchainOS: catálogo, custo e decisões por área da documentação |
| [sdd/config-onchain-smartmoney/spec.md](../../sdd/config-onchain-smartmoney/spec.md) | contrato: Configurações, OnchainOS, painel inferior e smart money no gráfico |
| [superpowers/plans/2026-10-09-okx-readonly.md](../../superpowers/plans/2026-10-09-okx-readonly.md) | guia: OKX Read-only Integration Implementation Plan |
