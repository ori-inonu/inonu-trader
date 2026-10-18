---
title: "Integração real e piloto: documentos, parte 1"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "integracao"]
sources: ["docs/gev-wallet-pilot/CHECKPOINT.md", "docs/gev-wallet-pilot/IMPLEMENTATION-NOTES.md", "docs/gev-wallet-pilot/SPEC.md", "docs/gev-wallet-pilot/VERIFICATION.md", "docs/real-integration/CHECKPOINT-BLOCKED-CONTINUATION-2.md", "docs/real-integration/CHECKPOINT.md", "docs/real-integration/CONTRAST-SOURCE-R8.md", "docs/real-integration/CORE-IMPLEMENTATION.md", "docs/real-integration/ESTADO-ATUAL.md", "docs/real-integration/EXECUTION-SPEC.md", "docs/real-integration/EXTENSIONS-SPEC.md", "docs/real-integration/G11-METADATA-CONCLUSION.md", "docs/real-integration/G11-SOURCE-RESEARCH.md", "docs/real-integration/GUIA-LOCAL.md", "docs/real-integration/INSTRUCAO-DO-OBJETIVO.md", "docs/real-integration/INTEGRATION-SEAMS-SPEC.md", "docs/real-integration/INVENTARIO-ESPECIFICACOES.md", "docs/real-integration/MATRIZ-G01-G17.md", "docs/real-integration/PESQUISA-OKX.md", "docs/real-integration/PUBLIC-CADENCE-SPEC.md", "docs/real-integration/PUBLIC-IMPLEMENTATION.md", "docs/real-integration/REVIEW-G14-CONTINUATION-1.md", "docs/real-integration/REVIEW-R7.md", "docs/real-integration/REVIEW-R8.md", "docs/real-integration/REVIEW-RESEARCH.md", "docs/real-integration/RPC-READ-SPEC.md", "docs/real-integration/SEMANTIC-PROOF.md", "docs/real-integration/UI-IMPLEMENTATION.md", "docs/real-integration/VERIFICACAO.md", "docs/research/codex-operator-c4-research-20261011/integration-coverage-next.md", "docs/research/spec-review-20261012/implementacao-real-web-hardening.md", "docs/research/spec-review-20261012/review-real-web-hardening.md", "docs/research/spec-review-20261012/spec-review-real-pilot.md", "docs/WEB3-INTEGRATION-DELIVERY-SPEC.md", "docs/WEB3-INTEGRATION-READINESS.md", "docs/WEB3-INTEGRATION-REVIEW-CYCLE-2.md", "docs/WEB3-INTEGRATION-REVIEW-FOLLOWUP.md", "docs/WEB3-INTEGRATION-REVIEW-REMEDIATION.md"]
confidence: medium
---

# Integração real e piloto: documentos, parte 1

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[integracao-real-e-piloto]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [gev-wallet-pilot/CHECKPOINT.md](../../gev-wallet-pilot/CHECKPOINT.md) | checkpoint: Estado do piloto GEV / OKX Wallet |
| [gev-wallet-pilot/IMPLEMENTATION-NOTES.md](../../gev-wallet-pilot/IMPLEMENTATION-NOTES.md) | evidencia: Implementação e dependências |
| [gev-wallet-pilot/SPEC.md](../../gev-wallet-pilot/SPEC.md) | contrato: SPEC - Piloto integrado GEV / OKX Wallet |
| [gev-wallet-pilot/VERIFICATION.md](../../gev-wallet-pilot/VERIFICATION.md) | evidencia: Verificação do piloto GEV / OKX Wallet |
| [real-integration/CHECKPOINT-BLOCKED-CONTINUATION-2.md](../../real-integration/CHECKPOINT-BLOCKED-CONTINUATION-2.md) | checkpoint: Checkpoint de bloqueio - terceiro turno da meta G01 - G17 |
| [real-integration/CHECKPOINT.md](../../real-integration/CHECKPOINT.md) | checkpoint: Checkpoint de execução |
| [real-integration/CONTRAST-SOURCE-R8.md](../../real-integration/CONTRAST-SOURCE-R8.md) | guia: Contraste dos tokens do painel de integração |
| [real-integration/CORE-IMPLEMENTATION.md](../../real-integration/CORE-IMPLEMENTATION.md) | evidencia: Entrega do adaptador core OKX |
| [real-integration/ESTADO-ATUAL.md](../../real-integration/ESTADO-ATUAL.md) | checkpoint: Estado atual e direção do próximo objetivo |
| [real-integration/EXECUTION-SPEC.md](../../real-integration/EXECUTION-SPEC.md) | contrato: Execução da integração real OKX |
| [real-integration/EXTENSIONS-SPEC.md](../../real-integration/EXTENSIONS-SPEC.md) | contrato: G12 - extensões DeFi e Strategy em leitura |
| [real-integration/G11-METADATA-CONCLUSION.md](../../real-integration/G11-METADATA-CONCLUSION.md) | guia: Pesquisa pública adicional de G11 |
| [real-integration/G11-SOURCE-RESEARCH.md](../../real-integration/G11-SOURCE-RESEARCH.md) | pesquisa: G11: fontes oficiais de deployments e semântica de swap OKX |
| [real-integration/GUIA-LOCAL.md](../../real-integration/GUIA-LOCAL.md) | guia: Integração local e qualificação |
| [real-integration/INSTRUCAO-DO-OBJETIVO.md](../../real-integration/INSTRUCAO-DO-OBJETIVO.md) | guia: Instrução ao agente: central OKX Web3 com dados reais e operação integrada |
| [real-integration/INTEGRATION-SEAMS-SPEC.md](../../real-integration/INTEGRATION-SEAMS-SPEC.md) | contrato: Integração observada - suplemento aos critérios congelados |
| [real-integration/INVENTARIO-ESPECIFICACOES.md](../../real-integration/INVENTARIO-ESPECIFICACOES.md) | contrato: Inventário de especificações e contratos do Jev Trader |
| [real-integration/MATRIZ-G01-G17.md](../../real-integration/MATRIZ-G01-G17.md) | guia: Matriz de aceitação G01 - G17 |
| [real-integration/PESQUISA-OKX.md](../../real-integration/PESQUISA-OKX.md) | pesquisa: OKX: evidência oficial para integração em leitura/paper |
| [real-integration/PUBLIC-CADENCE-SPEC.md](../../real-integration/PUBLIC-CADENCE-SPEC.md) | contrato: Atualização pública com validade preservada |
| [real-integration/PUBLIC-IMPLEMENTATION.md](../../real-integration/PUBLIC-IMPLEMENTATION.md) | evidencia: G12 - observação pública OKX Exchange v5 |
| [real-integration/REVIEW-G14-CONTINUATION-1.md](../../real-integration/REVIEW-G14-CONTINUATION-1.md) | revisao: Parecer independente parcial - G14, continuação 1 |
| [real-integration/REVIEW-R7.md](../../real-integration/REVIEW-R7.md) | revisao: Parecer independente - candidato r7 |
| [real-integration/REVIEW-R8.md](../../real-integration/REVIEW-R8.md) | revisao: Parecer independente - candidato r8c |
| [real-integration/REVIEW-RESEARCH.md](../../real-integration/REVIEW-RESEARCH.md) | revisao: Parecer independente - pesquisa documental posterior à R8 |
| [real-integration/RPC-READ-SPEC.md](../../real-integration/RPC-READ-SPEC.md) | contrato: Read-only EVM RPC slice - frozen v1 |
| [real-integration/SEMANTIC-PROOF.md](../../real-integration/SEMANTIC-PROOF.md) | guia: Prova semântica local de proposta unsigned |
| [real-integration/UI-IMPLEMENTATION.md](../../real-integration/UI-IMPLEMENTATION.md) | evidencia: Browser wallet and real pipeline implementation |
| [real-integration/VERIFICACAO.md](../../real-integration/VERIFICACAO.md) | evidencia: Verificação do candidato integrado r8c |
| [research/codex-operator-c4-research-20261011/integration-coverage-next.md](../../research/codex-operator-c4-research-20261011/integration-coverage-next.md) | pesquisa: Integration coverage: next evidence after security |
| [research/spec-review-20261012/implementacao-real-web-hardening.md](../../research/spec-review-20261012/implementacao-real-web-hardening.md) | evidencia: Implementação dos endurecimentos da integração real, do piloto e da interface web |
| [research/spec-review-20261012/review-real-web-hardening.md](../../research/spec-review-20261012/review-real-web-hardening.md) | revisao: Revisão independente: endurecimentos de real, piloto e web (1e67f89..6a9e356) |
| [research/spec-review-20261012/spec-review-real-pilot.md](../../research/spec-review-20261012/spec-review-real-pilot.md) | revisao: Revisão de especificações: cluster real-pilot (somente leitura) |
| [WEB3-INTEGRATION-DELIVERY-SPEC.md](../../WEB3-INTEGRATION-DELIVERY-SPEC.md) | contrato: Web3 integration verification and delivery |
| [WEB3-INTEGRATION-READINESS.md](../../WEB3-INTEGRATION-READINESS.md) | guia: INONU TRADER: Web3 integration readiness |
| [WEB3-INTEGRATION-REVIEW-CYCLE-2.md](../../WEB3-INTEGRATION-REVIEW-CYCLE-2.md) | revisao: Web3 integration: second bounded follow-up repair cycle |
| [WEB3-INTEGRATION-REVIEW-FOLLOWUP.md](../../WEB3-INTEGRATION-REVIEW-FOLLOWUP.md) | revisao: Post-remediation review follow-up |
| [WEB3-INTEGRATION-REVIEW-REMEDIATION.md](../../WEB3-INTEGRATION-REVIEW-REMEDIATION.md) | revisao: Exact-snapshot review remediation |
