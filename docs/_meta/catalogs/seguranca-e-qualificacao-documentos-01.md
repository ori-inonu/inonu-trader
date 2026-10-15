---
title: "Segurança, risco e qualificação: documentos, parte 1"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "seguranca"]
sources: ["docs/BRANCH-READINESS-CHECKPOINT.md", "docs/BRANCH-READINESS-REVIEW.md", "docs/HTTP-PREVIEW-DIAGNOSIS-CHECKPOINT-20261011.md", "docs/HTTP-PREVIEW-IMPLEMENTATION-CHECKPOINT-20261011.md", "docs/HTTP-PREVIEW-INTEGRATED-RUNTIME-CHECKPOINT-20261011.md", "docs/HTTP-PREVIEW-MAIN-1F08E6E-CHECKPOINT-20261011.md", "docs/HTTP-PREVIEW-MAIN-1F08E6E-INDEPENDENT-AUDIT-20261011.md", "docs/HTTP-PREVIEW-SCOPE-REVIEW-20261011.md", "docs/HTTP-PREVIEW-SPEC-20261011.md", "docs/HTTP-PREVIEW-VISUAL-CAPABILITY-RECHECK-20261011.md", "docs/HTTP-PREVIEW-VISUAL-FOLLOWUP-20261011.md", "docs/JEV-OKX-SDD-THREAT-MODEL-20261009.md", "docs/LIVE-QUALIFICATION.md", "docs/LOCALHOST-INTEGRATION-DIAGNOSIS-20261010.md", "docs/LOCALHOST-MAIN-STARTUP-RESEARCH-20261011.md", "docs/LOCALHOST-ORIGIN-DIAGNOSIS-20261011.md", "docs/okx-market-v1/OKX-CONFIGURATION-READINESS.md", "docs/OKX-SESSION-READINESS-20261011.md", "docs/OKX-WALLET-AUTHORITY-RESEARCH-20261011.md", "docs/POLITICA-DE-LIMITES.md", "docs/PROFIT-SPEC.md", "docs/READINESS-SPEC.md", "docs/research/OKX-AUTH-CUSTODY-MATRIX-20261011.md", "docs/research/R2-carteira-permissoes-delegacao.md", "docs/research/R3-estrategias-e-alavancagem.md", "docs/research/R9-system-one-alavancagem-onchainos.md", "docs/RISCO-E-BACKTEST.md", "docs/SYSTEM-ONE-EXPOSURE-CHECKPOINT.md", "docs/SYSTEM-ONE-EXPOSURE-DECIMAL-CHECKPOINT.md", "docs/SYSTEM-ONE-EXPOSURE-DECIMAL-VERIFICATION.md", "docs/SYSTEM-ONE-EXPOSURE-FINAL-AUDIT.md", "docs/SYSTEM-ONE-EXPOSURE-REVIEW-AUDIT.md", "docs/SYSTEM-ONE-EXPOSURE-SPEC.md", "docs/SYSTEM-ONE.md", "docs/WALLET-TRANSACTION-PREFLIGHT.md"]
confidence: medium
---

# Segurança, risco e qualificação: documentos, parte 1

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[seguranca-e-qualificacao]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [BRANCH-READINESS-CHECKPOINT.md](../../BRANCH-READINESS-CHECKPOINT.md) | checkpoint: Checkpoint da revisao |
| [BRANCH-READINESS-REVIEW.md](../../BRANCH-READINESS-REVIEW.md) | revisao: Revisão para merge: contrato e evidências |
| [HTTP-PREVIEW-DIAGNOSIS-CHECKPOINT-20261011.md](../../HTTP-PREVIEW-DIAGNOSIS-CHECKPOINT-20261011.md) | revisao: Preview diagnosis and concurrent review checkpoint |
| [HTTP-PREVIEW-IMPLEMENTATION-CHECKPOINT-20261011.md](../../HTTP-PREVIEW-IMPLEMENTATION-CHECKPOINT-20261011.md) | revisao: HTTP preview implementation checkpoint |
| [HTTP-PREVIEW-INTEGRATED-RUNTIME-CHECKPOINT-20261011.md](../../HTTP-PREVIEW-INTEGRATED-RUNTIME-CHECKPOINT-20261011.md) | revisao: Integrated preview runtime checkpoint |
| [HTTP-PREVIEW-MAIN-1F08E6E-CHECKPOINT-20261011.md](../../HTTP-PREVIEW-MAIN-1F08E6E-CHECKPOINT-20261011.md) | revisao: Current integrated preview and next correction checkpoint |
| [HTTP-PREVIEW-MAIN-1F08E6E-INDEPENDENT-AUDIT-20261011.md](../../HTTP-PREVIEW-MAIN-1F08E6E-INDEPENDENT-AUDIT-20261011.md) | revisao: HTTP-PREVIEW-MAIN-1F08E6E-INDEPENDENT-AUDIT-20261011 |
| [HTTP-PREVIEW-SCOPE-REVIEW-20261011.md](../../HTTP-PREVIEW-SCOPE-REVIEW-20261011.md) | revisao: Revisão independente de escopo HTTP preview |
| [HTTP-PREVIEW-SPEC-20261011.md](../../HTTP-PREVIEW-SPEC-20261011.md) | revisao: HTTP preview - specification and cycle proposal |
| [HTTP-PREVIEW-VISUAL-CAPABILITY-RECHECK-20261011.md](../../HTTP-PREVIEW-VISUAL-CAPABILITY-RECHECK-20261011.md) | revisao: HTTP preview: rechecagem independente de capacidade visual |
| [HTTP-PREVIEW-VISUAL-FOLLOWUP-20261011.md](../../HTTP-PREVIEW-VISUAL-FOLLOWUP-20261011.md) | revisao: HTTP-PREVIEW-VISUAL-FOLLOWUP-20261011 |
| [JEV-OKX-SDD-THREAT-MODEL-20261009.md](../../JEV-OKX-SDD-THREAT-MODEL-20261009.md) | guia: SDD / Threat Model - JEV + OKX |
| [LIVE-QUALIFICATION.md](../../LIVE-QUALIFICATION.md) | contrato: Qualificação para execução real em Kuru/Monad |
| [LOCALHOST-INTEGRATION-DIAGNOSIS-20261010.md](../../LOCALHOST-INTEGRATION-DIAGNOSIS-20261010.md) | guia: Diagnóstico da integração local |
| [LOCALHOST-MAIN-STARTUP-RESEARCH-20261011.md](../../LOCALHOST-MAIN-STARTUP-RESEARCH-20261011.md) | pesquisa: Pesquisa independente: prévia localhost do main |
| [LOCALHOST-ORIGIN-DIAGNOSIS-20261011.md](../../LOCALHOST-ORIGIN-DIAGNOSIS-20261011.md) | guia: Localhost origin diagnosis - 2026-10-11 |
| [okx-market-v1/OKX-CONFIGURATION-READINESS.md](../../okx-market-v1/OKX-CONFIGURATION-READINESS.md) | guia: Configuração observada - 9 de outubro de 2026 |
| [OKX-SESSION-READINESS-20261011.md](../../OKX-SESSION-READINESS-20261011.md) | guia: Prontidão da integração OKX - 11 de outubro de 2026 |
| [OKX-WALLET-AUTHORITY-RESEARCH-20261011.md](../../OKX-WALLET-AUTHORITY-RESEARCH-20261011.md) | pesquisa: OKX wallet authority - research checkpoint |
| [POLITICA-DE-LIMITES.md](../../POLITICA-DE-LIMITES.md) | contrato: Política de limites por fase: o envelope de risco como código |
| [PROFIT-SPEC.md](../../PROFIT-SPEC.md) | contrato: Economic qualification addendum |
| [READINESS-SPEC.md](../../READINESS-SPEC.md) | contrato: Trading readiness and evidence specification |
| [research/OKX-AUTH-CUSTODY-MATRIX-20261011.md](../../research/OKX-AUTH-CUSTODY-MATRIX-20261011.md) | pesquisa: Authentication, custody and execution: current evidence |
| [research/R2-carteira-permissoes-delegacao.md](../../research/R2-carteira-permissoes-delegacao.md) | pesquisa: R2: carteira, permissões e delegação para um assinador guiado por IA |
| [research/R3-estrategias-e-alavancagem.md](../../research/R3-estrategias-e-alavancagem.md) | pesquisa: R3: Modalidades alcançáveis a partir do ecossistema OKX e a matemática da alavancagem |
| [research/R9-system-one-alavancagem-onchainos.md](../../research/R9-system-one-alavancagem-onchainos.md) | pesquisa: R9: System One do Jev: camada rapida de decisao de alavancagem sobre o ecossistema OKX Onchain OS |
| [RISCO-E-BACKTEST.md](../../RISCO-E-BACKTEST.md) | guia: Risco, resultado medido e melhoria da decisão |
| [SYSTEM-ONE-EXPOSURE-CHECKPOINT.md](../../SYSTEM-ONE-EXPOSURE-CHECKPOINT.md) | checkpoint: Local verification checkpoint - 2026-10-11 |
| [SYSTEM-ONE-EXPOSURE-DECIMAL-CHECKPOINT.md](../../SYSTEM-ONE-EXPOSURE-DECIMAL-CHECKPOINT.md) | checkpoint: Exposure checkpoint addendum 2026-10-11T12:27Z |
| [SYSTEM-ONE-EXPOSURE-DECIMAL-VERIFICATION.md](../../SYSTEM-ONE-EXPOSURE-DECIMAL-VERIFICATION.md) | evidencia: Exposure decimal verification 2026-10-11T12:31Z |
| [SYSTEM-ONE-EXPOSURE-FINAL-AUDIT.md](../../SYSTEM-ONE-EXPOSURE-FINAL-AUDIT.md) | revisao: Independent bounded exposure audit |
| [SYSTEM-ONE-EXPOSURE-REVIEW-AUDIT.md](../../SYSTEM-ONE-EXPOSURE-REVIEW-AUDIT.md) | revisao: Exposure E1-E3 independent review checkpoint |
| [SYSTEM-ONE-EXPOSURE-SPEC.md](../../SYSTEM-ONE-EXPOSURE-SPEC.md) | contrato: System One: exposicao total dentro do envelope |
| [SYSTEM-ONE.md](../../SYSTEM-ONE.md) | guia: System One: a camada rapida de decisao de alavancagem do Jev |
| [WALLET-TRANSACTION-PREFLIGHT.md](../../WALLET-TRANSACTION-PREFLIGHT.md) | guia: Conferência de propostas na sessão OKX Web3 |
