---
title: "Mercado, captura e contratos de dados: documentos, parte 1"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "dados"]
sources: ["docs/OKX-DERIVATIVES-SPEC.md", "docs/okx-derivatives-v1/GUIA.md", "docs/okx-dex-sdk-units-v1/RESEARCH.md", "docs/okx-dex-units-v3/RESEARCH.md", "docs/okx-dex-v2/OKX-DEX-QUOTE-CONTRACT-20261009.md", "docs/okx-dex-v2/OKX-DEX-V2-GUIDE.md", "docs/okx-dex-v2/OKX-DEX-V2-PLAN.md", "docs/okx-dex-v2/OKX-DEX-V2-SPEC.md", "docs/okx-dex-v2/OKX-DEX-V4-INDEPENDENT-REVIEW.md", "docs/okx-dex-v2/ROOT-47-VERIFICATION.md", "docs/okx-dex-v2/ROOT-INTEGRATION.md", "docs/okx-dex-v2/SCHEMA-REGRESSION-COMPARISON.md", "docs/OKX-HISTORICAL-ARCHIVES.md", "docs/OKX-HISTORICAL-DATA-QUALIFICATION.md", "docs/okx-market-v1/OKX-API-IDENTITY-FIX.md", "docs/okx-market-v1/OKX-API-TDD-EVIDENCE.md", "docs/okx-market-v1/OKX-DEX-V2-CONTRACT-AMENDMENT-DRAFT-20261009.md", "docs/okx-market-v1/OKX-INTEGRATION-RESEARCH-20261009.md", "docs/okx-market-v1/OKX-LONG-GOAL-CHECKPOINT.md", "docs/okx-market-v1/OKX-SCANNER-INTEGRATION-VERIFICATION.md", "docs/okx-market-v1/OKX-SCANNER-LAYOUT-ADDENDUM.md", "docs/okx-market-v1/OKX-SCANNER-TDD-EVIDENCE.md", "docs/okx-market-v1/OKX-WEB3-INTEGRATION.md", "docs/okx-market-v1/REVIEW-V3.md", "docs/okx-market-v1/ROOT-INTEGRATION-REVIEW-CORRECTED.md", "docs/okx-market-v1/ROOT-INTEGRATION-REVIEW.md", "docs/PUBLIC-MARKET-CAPTURE.md", "docs/sdd/backend-audit-20261013/OKX-AUDIT.md"]
confidence: medium
---

# Mercado, captura e contratos de dados: documentos, parte 1

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[mercado-e-dados]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [OKX-DERIVATIVES-SPEC.md](../../OKX-DERIVATIVES-SPEC.md) | contrato: Avaliador offline de derivativos perpétuos OKX V1 |
| [okx-derivatives-v1/GUIA.md](../../okx-derivatives-v1/GUIA.md) | guia: Derivativos perpétuos da OKX: avaliador offline |
| [okx-dex-sdk-units-v1/RESEARCH.md](../../okx-dex-sdk-units-v1/RESEARCH.md) | pesquisa: Unidade da cotação no SDK oficial OKX |
| [okx-dex-units-v3/RESEARCH.md](../../okx-dex-units-v3/RESEARCH.md) | pesquisa: Unidade da cotação DEX OKX - 10/10/2026 |
| [okx-dex-v2/OKX-DEX-QUOTE-CONTRACT-20261009.md](../../okx-dex-v2/OKX-DEX-QUOTE-CONTRACT-20261009.md) | guia: Contrato factual DEX quote - 2026-10-09 |
| [okx-dex-v2/OKX-DEX-V2-GUIDE.md](../../okx-dex-v2/OKX-DEX-V2-GUIDE.md) | guia: Consultas DEX do Inonu Trader |
| [okx-dex-v2/OKX-DEX-V2-PLAN.md](../../okx-dex-v2/OKX-DEX-V2-PLAN.md) | plano: Plano mínimo de implementação DEX V2 |
| [okx-dex-v2/OKX-DEX-V2-SPEC.md](../../okx-dex-v2/OKX-DEX-V2-SPEC.md) | contrato: SPEC do ciclo DEX V2 - leitura de cotações |
| [okx-dex-v2/OKX-DEX-V4-INDEPENDENT-REVIEW.md](../../okx-dex-v2/OKX-DEX-V4-INDEPENDENT-REVIEW.md) | revisao: Revisão independente - OKX DEX V4 recovery |
| [okx-dex-v2/ROOT-47-VERIFICATION.md](../../okx-dex-v2/ROOT-47-VERIFICATION.md) | evidencia: Verificacao de execucao da integracao DEX |
| [okx-dex-v2/ROOT-INTEGRATION.md](../../okx-dex-v2/ROOT-INTEGRATION.md) | guia: Integração local das cotações OKX DEX - V4 |
| [okx-dex-v2/SCHEMA-REGRESSION-COMPARISON.md](../../okx-dex-v2/SCHEMA-REGRESSION-COMPARISON.md) | guia: Schema regression comparison |
| [OKX-HISTORICAL-ARCHIVES.md](../../OKX-HISTORICAL-ARCHIVES.md) | guia: OKX historical archive metadata discovery |
| [OKX-HISTORICAL-DATA-QUALIFICATION.md](../../OKX-HISTORICAL-DATA-QUALIFICATION.md) | contrato: INONU TRADER: qualificação dos históricos L2 da OKX |
| [okx-market-v1/OKX-API-IDENTITY-FIX.md](../../okx-market-v1/OKX-API-IDENTITY-FIX.md) | guia: OKX API identity mismatch fix |
| [okx-market-v1/OKX-API-TDD-EVIDENCE.md](../../okx-market-v1/OKX-API-TDD-EVIDENCE.md) | evidencia: Evidência TDD - cliente OKX somente leitura |
| [okx-market-v1/OKX-DEX-V2-CONTRACT-AMENDMENT-DRAFT-20261009.md](../../okx-market-v1/OKX-DEX-V2-CONTRACT-AMENDMENT-DRAFT-20261009.md) | proposta: Emenda candidata ao contrato DEX V2 |
| [okx-market-v1/OKX-INTEGRATION-RESEARCH-20261009.md](../../okx-market-v1/OKX-INTEGRATION-RESEARCH-20261009.md) | pesquisa: Pesquisa de integração OKX - Inonu Trader |
| [okx-market-v1/OKX-LONG-GOAL-CHECKPOINT.md](../../okx-market-v1/OKX-LONG-GOAL-CHECKPOINT.md) | checkpoint: Checkpoint da conversa - ecossistema Inonu Trader |
| [okx-market-v1/OKX-SCANNER-INTEGRATION-VERIFICATION.md](../../okx-market-v1/OKX-SCANNER-INTEGRATION-VERIFICATION.md) | evidencia: Verificação da integração do scanner |
| [okx-market-v1/OKX-SCANNER-LAYOUT-ADDENDUM.md](../../okx-market-v1/OKX-SCANNER-LAYOUT-ADDENDUM.md) | guia: Integração sem sobrescrever trabalho concorrente |
| [okx-market-v1/OKX-SCANNER-TDD-EVIDENCE.md](../../okx-market-v1/OKX-SCANNER-TDD-EVIDENCE.md) | evidencia: Evidência TDD - scanner OKX Web3 |
| [okx-market-v1/OKX-WEB3-INTEGRATION.md](../../okx-market-v1/OKX-WEB3-INTEGRATION.md) | guia: Inonu Trader - integrações OKX Web3 |
| [okx-market-v1/REVIEW-V3.md](../../okx-market-v1/REVIEW-V3.md) | revisao: Revisão independente V3 - scanner OKX Web3 |
| [okx-market-v1/ROOT-INTEGRATION-REVIEW-CORRECTED.md](../../okx-market-v1/ROOT-INTEGRATION-REVIEW-CORRECTED.md) | revisao: Revisão independente da integração no checkout principal |
| [okx-market-v1/ROOT-INTEGRATION-REVIEW.md](../../okx-market-v1/ROOT-INTEGRATION-REVIEW.md) | revisao: Revisão independente da integração no checkout principal |
| [PUBLIC-MARKET-CAPTURE.md](../../PUBLIC-MARKET-CAPTURE.md) | guia: Public market capture |
| [sdd/backend-audit-20261013/OKX-AUDIT.md](../../sdd/backend-audit-20261013/OKX-AUDIT.md) | revisao: OKX-AUDIT |
