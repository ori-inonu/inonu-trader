---
title: "Pacote: inonu-desktop-v1"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/CHECKPOINT.md", "docs/sdd/inonu-desktop-v1/FREEZE.json", "docs/sdd/inonu-desktop-v1/OWNERSHIP.md", "docs/sdd/inonu-desktop-v1/PLAN.md", "docs/sdd/inonu-desktop-v1/README.md", "docs/sdd/inonu-desktop-v1/SPEC.md", "docs/sdd/inonu-desktop-v1/TASKS.md", "docs/sdd/inonu-desktop-v1/adr/ADR-1-instalavel.md", "docs/sdd/inonu-desktop-v1/adr/ADR-2-segredos.md", "docs/sdd/inonu-desktop-v1/adr/ADR-3-camadas-e-nomenclatura.md", "docs/sdd/inonu-desktop-v1/adr/ADR-4-sem-simulado.md", "docs/sdd/inonu-desktop-v1/adr/ADR-5-carteira.md", "docs/sdd/inonu-desktop-v1/adr/ADR-6-custo-e-formas-de-uso.md", "docs/sdd/inonu-desktop-v1/evidence/RAS-2-memepump-lancamentos.md", "docs/sdd/inonu-desktop-v1/evidence/RAS-6-T4.5-T9.2-ranking-cauda-e-troca-de-rede.md", "docs/sdd/inonu-desktop-v1/evidence/RAS-7-motor-de-oportunidades.md", "docs/sdd/inonu-desktop-v1/evidence/RAS-8-melhores-oportunidades-e-tamanho.md", "docs/sdd/inonu-desktop-v1/evidence/T1-instalavel.md", "docs/sdd/inonu-desktop-v1/evidence/T1.8-T7.3-doctor-e-pedir-ao-inonu.md", "docs/sdd/inonu-desktop-v1/evidence/T2-cofre.md", "docs/sdd/inonu-desktop-v1/evidence/T2.3-T2.4-T7.4-provedores-limpeza-uso.md", "docs/sdd/inonu-desktop-v1/evidence/T3.10-T3.11-cluster-list-e-address-tracker.md", "docs/sdd/inonu-desktop-v1/evidence/T3.12-rotas-da-carteira.md", "docs/sdd/inonu-desktop-v1/evidence/T3.2-relogio.md", "docs/sdd/inonu-desktop-v1/evidence/T4.6-painel-de-5-abas.md", "docs/sdd/inonu-desktop-v1/evidence/T5.7-T6.4-T6.5-camada-do-grafico.md", "docs/sdd/inonu-desktop-v1/evidence/T6.6-zonas-nao-medido.md", "docs/sdd/inonu-desktop-v1/evidence/T7.10-T7.11-T10.3-descoberta-alertas-aceitar.md", "docs/sdd/inonu-desktop-v1/evidence/T7.8-consulta-real-autorizada.md", "docs/sdd/inonu-desktop-v1/evidence/T8-rastreador.md", "docs/sdd/inonu-desktop-v1/evidence/T8.2-T8.4-universo-onchain.md", "docs/sdd/inonu-desktop-v1/evidence/T9.1-T9.4-solana-na-carteira.md", "docs/sdd/inonu-desktop-v1/evidence/T9.5-T9.7-escada-e-ticket.md", "docs/sdd/inonu-desktop-v1/evidence/UI-simplificacao-2026-10-13.md", "docs/sdd/inonu-desktop-v1/evidence/WAL-10-ordens-pela-carteira.md", "docs/sdd/inonu-desktop-v1/evidence/busca-real.md", "docs/sdd/inonu-desktop-v1/evidence/capturas/T4.6-fluxo-celular-390x844.jpg", "docs/sdd/inonu-desktop-v1/evidence/capturas/T4.7-busca-usdc-solana-390x844.jpg", "docs/sdd/inonu-desktop-v1/evidence/capturas/T5.7-grafico-ao-vivo-com-motor-pronto-800x450.jpg", "docs/sdd/inonu-desktop-v1/evidence/capturas/T7.10-alertas-de-corrida-ao-vivo-800x450.jpg", "docs/sdd/inonu-desktop-v1/evidence/capturas/T7.10-descobrir-e-alertas-do-motor-celular.jpg", "docs/sdd/inonu-desktop-v1/evidence/capturas/T8-rastreador-390x844.jpg", "docs/sdd/inonu-desktop-v1/evidence/capturas/ras6-ranking-375.jpg", "docs/sdd/inonu-desktop-v1/evidence/git-status-2026-10-12.txt", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-1.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-2.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-3.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-4.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-5.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-6.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-7.md", "docs/sdd/inonu-desktop-v1/flow-engine.md", "docs/sdd/inonu-desktop-v1/info-diet.md", "docs/sdd/inonu-desktop-v1/onchainos-coverage.json", "docs/sdd/inonu-desktop-v1/onchainos-coverage.md", "docs/sdd/inonu-desktop-v1/rastreador.md", "docs/sdd/inonu-desktop-v1/runbooks/reiniciar-backend.md", "docs/sdd/inonu-desktop-v1/spikes/T1.1.md", "docs/sdd/inonu-desktop-v1/spikes/T9.3.md", "docs/sdd/inonu-desktop-v1/tools/freeze.ts", "docs/sdd/inonu-desktop-v1/tools/mirror-okx-docs.ts", "docs/sdd/inonu-desktop-v1/tools/okx-coverage.ts", "docs/sdd/inonu-desktop-v1/tools/verify-citations.ts", "docs/sdd/inonu-desktop-v1/wallet.md"]
confidence: "medium"
entity_kind: "pacote"
release_assignment: "nao_atribuida"
---

# Pacote: inonu-desktop-v1

Pacote documental, não uma release comprovada. O nome `v1` de um módulo não equivale a `v0.0.1` do produto.

[[concepts/evolucao-do-projeto]] | [[_meta/evolucao/marcos/sem-release-atribuida]]

## Fases e agrupamentos originais

- [[_meta/evolucao/fases/inonu-desktop-v1--documentos-desta-rodada-t-doc|Documentos desta rodada (T-DOC)]] (secao_sem_fase_atribuida)
- [[_meta/evolucao/fases/inonu-desktop-v1--m0-linha-de-base-e-dependencias-do-usuario|M0 Linha de base e dependências do usuário]] (milestone_nativo)
- [[_meta/evolucao/fases/inonu-desktop-v1--m1-instalavel-win|M1 Instalável (WIN)]] (milestone_nativo)
- [[_meta/evolucao/fases/inonu-desktop-v1--m2-segredos-e-configuracao-cfg|M2 Segredos e configuração (CFG)]] (milestone_nativo)
- [[_meta/evolucao/fases/inonu-desktop-v1--m3-gateway-e-uso-completo-api-ico-chn|M3 Gateway e uso completo (API, ICO, CHN)]] (milestone_nativo)
- [[_meta/evolucao/fases/inonu-desktop-v1--m4-painel-inferior-busca-redes-e-icones-src-doc-chn-ico|M4 Painel inferior, busca, redes e ícones (SRC, DOC, CHN, ICO)]] (milestone_nativo)
- [[_meta/evolucao/fases/inonu-desktop-v1--m5-motor-de-fluxo-flx-ing|M5 Motor de fluxo (FLX, ING)]] (milestone_nativo)
- [[_meta/evolucao/fases/inonu-desktop-v1--m6-zonas-e-trilha-do-dinheiro-esperto-smt|M6 Zonas e trilha do dinheiro esperto (SMT)]] (milestone_nativo)
- [[_meta/evolucao/fases/inonu-desktop-v1--m7-pedir-ao-inonu-ask|M7 Pedir ao Inonu (ASK)]] (milestone_nativo)
- [[_meta/evolucao/fases/inonu-desktop-v1--m8-rastreador-ras|M8 Rastreador (RAS)]] (milestone_nativo)
- [[_meta/evolucao/fases/inonu-desktop-v1--m9-carteira-conectada-wal|M9 Carteira conectada (WAL)]] (milestone_nativo)
- [[_meta/evolucao/fases/inonu-desktop-v1--m10-dados-reais-e-interface-enxuta-dat-inf|M10 Dados reais e interface enxuta (DAT, INF)]] (milestone_nativo)
- [[_meta/evolucao/fases/inonu-desktop-v1--m11-verificacao-e-fechamento-qlt|M11 Verificação e fechamento (QLT)]] (milestone_nativo)

## Fontes do pacote

- [CHECKPOINT.md](../../../sdd/inonu-desktop-v1/CHECKPOINT.md)
- [FREEZE.json](../../../sdd/inonu-desktop-v1/FREEZE.json)
- [OWNERSHIP.md](../../../sdd/inonu-desktop-v1/OWNERSHIP.md)
- [PLAN.md](../../../sdd/inonu-desktop-v1/PLAN.md)
- [README.md](../../../sdd/inonu-desktop-v1/README.md)
- [SPEC.md](../../../sdd/inonu-desktop-v1/SPEC.md)
- [TASKS.md](../../../sdd/inonu-desktop-v1/TASKS.md)
- [ADR-1-instalavel.md](../../../sdd/inonu-desktop-v1/adr/ADR-1-instalavel.md)
- [ADR-2-segredos.md](../../../sdd/inonu-desktop-v1/adr/ADR-2-segredos.md)
- [ADR-3-camadas-e-nomenclatura.md](../../../sdd/inonu-desktop-v1/adr/ADR-3-camadas-e-nomenclatura.md)
- [ADR-4-sem-simulado.md](../../../sdd/inonu-desktop-v1/adr/ADR-4-sem-simulado.md)
- [ADR-5-carteira.md](../../../sdd/inonu-desktop-v1/adr/ADR-5-carteira.md)
- [ADR-6-custo-e-formas-de-uso.md](../../../sdd/inonu-desktop-v1/adr/ADR-6-custo-e-formas-de-uso.md)
- [RAS-2-memepump-lancamentos.md](../../../sdd/inonu-desktop-v1/evidence/RAS-2-memepump-lancamentos.md)
- [RAS-6-T4.5-T9.2-ranking-cauda-e-troca-de-rede.md](../../../sdd/inonu-desktop-v1/evidence/RAS-6-T4.5-T9.2-ranking-cauda-e-troca-de-rede.md)
- [RAS-7-motor-de-oportunidades.md](../../../sdd/inonu-desktop-v1/evidence/RAS-7-motor-de-oportunidades.md)
- [RAS-8-melhores-oportunidades-e-tamanho.md](../../../sdd/inonu-desktop-v1/evidence/RAS-8-melhores-oportunidades-e-tamanho.md)
- [T1-instalavel.md](../../../sdd/inonu-desktop-v1/evidence/T1-instalavel.md)
- [T1.8-T7.3-doctor-e-pedir-ao-inonu.md](../../../sdd/inonu-desktop-v1/evidence/T1.8-T7.3-doctor-e-pedir-ao-inonu.md)
- [T2-cofre.md](../../../sdd/inonu-desktop-v1/evidence/T2-cofre.md)
- [T2.3-T2.4-T7.4-provedores-limpeza-uso.md](../../../sdd/inonu-desktop-v1/evidence/T2.3-T2.4-T7.4-provedores-limpeza-uso.md)
- [T3.10-T3.11-cluster-list-e-address-tracker.md](../../../sdd/inonu-desktop-v1/evidence/T3.10-T3.11-cluster-list-e-address-tracker.md)
- [T3.12-rotas-da-carteira.md](../../../sdd/inonu-desktop-v1/evidence/T3.12-rotas-da-carteira.md)
- [T3.2-relogio.md](../../../sdd/inonu-desktop-v1/evidence/T3.2-relogio.md)
- [T4.6-painel-de-5-abas.md](../../../sdd/inonu-desktop-v1/evidence/T4.6-painel-de-5-abas.md)
- [T5.7-T6.4-T6.5-camada-do-grafico.md](../../../sdd/inonu-desktop-v1/evidence/T5.7-T6.4-T6.5-camada-do-grafico.md)
- [T6.6-zonas-nao-medido.md](../../../sdd/inonu-desktop-v1/evidence/T6.6-zonas-nao-medido.md)
- [T7.10-T7.11-T10.3-descoberta-alertas-aceitar.md](../../../sdd/inonu-desktop-v1/evidence/T7.10-T7.11-T10.3-descoberta-alertas-aceitar.md)
- [T7.8-consulta-real-autorizada.md](../../../sdd/inonu-desktop-v1/evidence/T7.8-consulta-real-autorizada.md)
- [T8-rastreador.md](../../../sdd/inonu-desktop-v1/evidence/T8-rastreador.md)
- [T8.2-T8.4-universo-onchain.md](../../../sdd/inonu-desktop-v1/evidence/T8.2-T8.4-universo-onchain.md)
- [T9.1-T9.4-solana-na-carteira.md](../../../sdd/inonu-desktop-v1/evidence/T9.1-T9.4-solana-na-carteira.md)
- [T9.5-T9.7-escada-e-ticket.md](../../../sdd/inonu-desktop-v1/evidence/T9.5-T9.7-escada-e-ticket.md)
- [UI-simplificacao-2026-10-13.md](../../../sdd/inonu-desktop-v1/evidence/UI-simplificacao-2026-10-13.md)
- [WAL-10-ordens-pela-carteira.md](../../../sdd/inonu-desktop-v1/evidence/WAL-10-ordens-pela-carteira.md)
- [busca-real.md](../../../sdd/inonu-desktop-v1/evidence/busca-real.md)
- [T4.6-fluxo-celular-390x844.jpg](../../../sdd/inonu-desktop-v1/evidence/capturas/T4.6-fluxo-celular-390x844.jpg)
- [T4.7-busca-usdc-solana-390x844.jpg](../../../sdd/inonu-desktop-v1/evidence/capturas/T4.7-busca-usdc-solana-390x844.jpg)
- [T5.7-grafico-ao-vivo-com-motor-pronto-800x450.jpg](../../../sdd/inonu-desktop-v1/evidence/capturas/T5.7-grafico-ao-vivo-com-motor-pronto-800x450.jpg)
- [T7.10-alertas-de-corrida-ao-vivo-800x450.jpg](../../../sdd/inonu-desktop-v1/evidence/capturas/T7.10-alertas-de-corrida-ao-vivo-800x450.jpg)

Demais fontes no [[_meta/evolucao/catalogo/catalogo-de-fontes|catálogo completo]].
