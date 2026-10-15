---
title: "Instalável Windows e Inonu: documentos, parte 1"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "desktop"]
sources: ["docs/sdd/inonu-desktop-v1/adr/ADR-1-instalavel.md", "docs/sdd/inonu-desktop-v1/adr/ADR-2-segredos.md", "docs/sdd/inonu-desktop-v1/adr/ADR-3-camadas-e-nomenclatura.md", "docs/sdd/inonu-desktop-v1/adr/ADR-4-sem-simulado.md", "docs/sdd/inonu-desktop-v1/adr/ADR-5-carteira.md", "docs/sdd/inonu-desktop-v1/adr/ADR-6-custo-e-formas-de-uso.md", "docs/sdd/inonu-desktop-v1/CHECKPOINT.md", "docs/sdd/inonu-desktop-v1/evidence/busca-real.md", "docs/sdd/inonu-desktop-v1/evidence/RAS-6-T4.5-T9.2-ranking-cauda-e-troca-de-rede.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-1.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-2.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-3.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-4.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-5.md", "docs/sdd/inonu-desktop-v1/evidence/revisao-independente-6.md", "docs/sdd/inonu-desktop-v1/evidence/T1-instalavel.md", "docs/sdd/inonu-desktop-v1/evidence/T1.8-T7.3-doctor-e-pedir-ao-inonu.md", "docs/sdd/inonu-desktop-v1/evidence/T2-cofre.md", "docs/sdd/inonu-desktop-v1/evidence/T2.3-T2.4-T7.4-provedores-limpeza-uso.md", "docs/sdd/inonu-desktop-v1/evidence/T3.12-rotas-da-carteira.md", "docs/sdd/inonu-desktop-v1/evidence/T3.2-relogio.md", "docs/sdd/inonu-desktop-v1/evidence/T4.6-painel-de-5-abas.md", "docs/sdd/inonu-desktop-v1/evidence/T5.7-T6.4-T6.5-camada-do-grafico.md", "docs/sdd/inonu-desktop-v1/evidence/T6.6-zonas-nao-medido.md", "docs/sdd/inonu-desktop-v1/evidence/T7.10-T7.11-T10.3-descoberta-alertas-aceitar.md", "docs/sdd/inonu-desktop-v1/evidence/T8-rastreador.md", "docs/sdd/inonu-desktop-v1/evidence/T8.2-T8.4-universo-onchain.md", "docs/sdd/inonu-desktop-v1/evidence/T9.5-T9.7-escada-e-ticket.md", "docs/sdd/inonu-desktop-v1/flow-engine.md", "docs/sdd/inonu-desktop-v1/info-diet.md", "docs/sdd/inonu-desktop-v1/onchainos-coverage.md", "docs/sdd/inonu-desktop-v1/OWNERSHIP.md", "docs/sdd/inonu-desktop-v1/PLAN.md", "docs/sdd/inonu-desktop-v1/rastreador.md", "docs/sdd/inonu-desktop-v1/README.md", "docs/sdd/inonu-desktop-v1/runbooks/reiniciar-backend.md", "docs/sdd/inonu-desktop-v1/SPEC.md", "docs/sdd/inonu-desktop-v1/spikes/T1.1.md", "docs/sdd/inonu-desktop-v1/spikes/T9.3.md", "docs/sdd/inonu-desktop-v1/TASKS.md", "docs/sdd/inonu-desktop-v1/wallet.md"]
confidence: medium
---

# Instalável Windows e Inonu: documentos, parte 1

Fontes no snapshot de 2026-10-13. A classificação serve à navegação e não certifica aprovação, implementação ou estado ao vivo.

Voltar a [[instalavel-e-inonu]] e [[manutencao-da-documentacao]].

| Arquivo original | Função e resumo |
| --- | --- |
| [sdd/inonu-desktop-v1/adr/ADR-1-instalavel.md](../../sdd/inonu-desktop-v1/adr/ADR-1-instalavel.md) | decisao-arquitetural: ADR-1 Instalável Windows 11: servidor local Bun, janela do Edge e instalador NSIS por usuário |
| [sdd/inonu-desktop-v1/adr/ADR-2-segredos.md](../../sdd/inonu-desktop-v1/adr/ADR-2-segredos.md) | decisao-arquitetural: ADR-2 Segredos no cofre do Windows, instalador sem chave |
| [sdd/inonu-desktop-v1/adr/ADR-3-camadas-e-nomenclatura.md](../../sdd/inonu-desktop-v1/adr/ADR-3-camadas-e-nomenclatura.md) | decisao-arquitetural: ADR-3 Camadas: coletar barato, calcular localmente, só então chamar o modelo; nomenclatura Inonu e Jev |
| [sdd/inonu-desktop-v1/adr/ADR-4-sem-simulado.md](../../sdd/inonu-desktop-v1/adr/ADR-4-sem-simulado.md) | decisao-arquitetural: ADR-4 Nenhum dado simulado no caminho de execução |
| [sdd/inonu-desktop-v1/adr/ADR-5-carteira.md](../../sdd/inonu-desktop-v1/adr/ADR-5-carteira.md) | decisao-arquitetural: ADR-5 Carteira OKX conectada pela extensão: ler e preparar, enviar depois |
| [sdd/inonu-desktop-v1/adr/ADR-6-custo-e-formas-de-uso.md](../../sdd/inonu-desktop-v1/adr/ADR-6-custo-e-formas-de-uso.md) | decisao-arquitetural: ADR-6 Custo da API e decisão por forma de uso da OnchainOS |
| [sdd/inonu-desktop-v1/CHECKPOINT.md](../../sdd/inonu-desktop-v1/CHECKPOINT.md) | checkpoint: CHECKPOINT - Inonu Trader v1 |
| [sdd/inonu-desktop-v1/evidence/busca-real.md](../../sdd/inonu-desktop-v1/evidence/busca-real.md) | evidencia: T4.7: busca real de token por símbolo e por endereço em 3 redes |
| [sdd/inonu-desktop-v1/evidence/RAS-6-T4.5-T9.2-ranking-cauda-e-troca-de-rede.md](../../sdd/inonu-desktop-v1/evidence/RAS-6-T4.5-T9.2-ranking-cauda-e-troca-de-rede.md) | evidencia: ranking, cauda do ledger e troca de rede; relato concorrente com limites de autorização explícitos |
| [sdd/inonu-desktop-v1/evidence/revisao-independente-1.md](../../sdd/inonu-desktop-v1/evidence/revisao-independente-1.md) | revisao: Revisão independente 1 (T-DOC-9): parecer e disposição dos achados |
| [sdd/inonu-desktop-v1/evidence/revisao-independente-2.md](../../sdd/inonu-desktop-v1/evidence/revisao-independente-2.md) | revisao: painel, descoberta, alertas e fonte do motor; revisão de outra sessão |
| [sdd/inonu-desktop-v1/evidence/revisao-independente-3.md](../../sdd/inonu-desktop-v1/evidence/revisao-independente-3.md) | revisao: ranking, cauda do ledger e troca de rede; revisão de outra sessão |
| [sdd/inonu-desktop-v1/evidence/revisao-independente-4.md](../../sdd/inonu-desktop-v1/evidence/revisao-independente-4.md) | revisao: revisao-independente-4 |
| [sdd/inonu-desktop-v1/evidence/revisao-independente-5.md](../../sdd/inonu-desktop-v1/evidence/revisao-independente-5.md) | revisao: revisao-independente-5 |
| [sdd/inonu-desktop-v1/evidence/revisao-independente-6.md](../../sdd/inonu-desktop-v1/evidence/revisao-independente-6.md) | revisao: revisao-independente-6 |
| [sdd/inonu-desktop-v1/evidence/T1-instalavel.md](../../sdd/inonu-desktop-v1/evidence/T1-instalavel.md) | evidencia: Evidência T1.2 a T1.10: núcleo local, lançador e instalador Windows (WIN-1 a WIN-11) |
| [sdd/inonu-desktop-v1/evidence/T1.8-T7.3-doctor-e-pedir-ao-inonu.md](../../sdd/inonu-desktop-v1/evidence/T1.8-T7.3-doctor-e-pedir-ao-inonu.md) | evidencia: Evidência T1.8 e T7.3: Doctor no navegador e "Pedir ao Inonu" pelo núcleo real |
| [sdd/inonu-desktop-v1/evidence/T2-cofre.md](../../sdd/inonu-desktop-v1/evidence/T2-cofre.md) | evidencia: Evidência T2.1, T2.2, T2.5: cofre do Windows e provisionamento local (CFG-1, CFG-2, CFG-3, CFG-9, AC-CFG-1, AC-CFG-4) |
| [sdd/inonu-desktop-v1/evidence/T2.3-T2.4-T7.4-provedores-limpeza-uso.md](../../sdd/inonu-desktop-v1/evidence/T2.3-T2.4-T7.4-provedores-limpeza-uso.md) | evidencia: T2.3, T2.4, T7.4, T5.10, T10.5: provedores, limpeza do texto puro, uso do Inonu e derivativos |
| [sdd/inonu-desktop-v1/evidence/T3.12-rotas-da-carteira.md](../../sdd/inonu-desktop-v1/evidence/T3.12-rotas-da-carteira.md) | evidencia: T3.12-rotas-da-carteira |
| [sdd/inonu-desktop-v1/evidence/T3.2-relogio.md](../../sdd/inonu-desktop-v1/evidence/T3.2-relogio.md) | evidencia: Evidência T3.2: relógio corrigido em todos os clientes assinados (API-2, AC-API-2) |
| [sdd/inonu-desktop-v1/evidence/T4.6-painel-de-5-abas.md](../../sdd/inonu-desktop-v1/evidence/T4.6-painel-de-5-abas.md) | evidencia: T4.6: painel inferior de 9 para 5 abas (DOC-4, AC-DOC-2, INF-1) |
| [sdd/inonu-desktop-v1/evidence/T5.7-T6.4-T6.5-camada-do-grafico.md](../../sdd/inonu-desktop-v1/evidence/T5.7-T6.4-T6.5-camada-do-grafico.md) | evidencia: T5.7, T6.4, T6.5, T7.5 (marcador), T7.9, T1.11 e memória do fluxo: evidência |
| [sdd/inonu-desktop-v1/evidence/T6.6-zonas-nao-medido.md](../../sdd/inonu-desktop-v1/evidence/T6.6-zonas-nao-medido.md) | evidencia: T6.6: validação das zonas por backtest pareado, **não medido** |
| [sdd/inonu-desktop-v1/evidence/T7.10-T7.11-T10.3-descoberta-alertas-aceitar.md](../../sdd/inonu-desktop-v1/evidence/T7.10-T7.11-T10.3-descoberta-alertas-aceitar.md) | evidencia: T7.10, T7.11, T10.3 e a ligação dos modos token e descoberta: descoberta, alertas do motor, "Aceitar" por família e origem em toda vista |
| [sdd/inonu-desktop-v1/evidence/T8-rastreador.md](../../sdd/inonu-desktop-v1/evidence/T8-rastreador.md) | evidencia: M8 Rastreador, T10.1, T10.2, T10.4 e a revisão r3: evidência |
| [sdd/inonu-desktop-v1/evidence/T8.2-T8.4-universo-onchain.md](../../sdd/inonu-desktop-v1/evidence/T8.2-T8.4-universo-onchain.md) | evidencia: universo on-chain do Rastreador, visões e desvios; não reproduzido nesta organização |
| [sdd/inonu-desktop-v1/evidence/T9.5-T9.7-escada-e-ticket.md](../../sdd/inonu-desktop-v1/evidence/T9.5-T9.7-escada-e-ticket.md) | evidencia: escada de cotações, ticket de leitura e Aceitar que preenche; sem envio financeiro |
| [sdd/inonu-desktop-v1/flow-engine.md](../../sdd/inonu-desktop-v1/flow-engine.md) | guia: Motor de inteligência: fluxo, zonas, trilha do dinheiro esperto e Evidence Brief |
| [sdd/inonu-desktop-v1/info-diet.md](../../sdd/inonu-desktop-v1/info-diet.md) | guia: Dieta de informação: interface enxuta para humanos, dados estruturados para o agente |
| [sdd/inonu-desktop-v1/onchainos-coverage.md](../../sdd/inonu-desktop-v1/onchainos-coverage.md) | guia: Cobertura da documentacao OnchainOS (499 paginas) |
| [sdd/inonu-desktop-v1/OWNERSHIP.md](../../sdd/inonu-desktop-v1/OWNERSHIP.md) | registro-governanca: OWNERSHIP - quem edita o quê |
| [sdd/inonu-desktop-v1/PLAN.md](../../sdd/inonu-desktop-v1/PLAN.md) | plano: PLAN - Inonu Trader v1 (plano de implementação) |
| [sdd/inonu-desktop-v1/rastreador.md](../../sdd/inonu-desktop-v1/rastreador.md) | guia: Rastreador (inspirado no Rastreador de Criptomoedas do TradingView) |
| [sdd/inonu-desktop-v1/README.md](../../sdd/inonu-desktop-v1/README.md) | guia: Inonu Trader v1: pasta SDD |
| [sdd/inonu-desktop-v1/runbooks/reiniciar-backend.md](../../sdd/inonu-desktop-v1/runbooks/reiniciar-backend.md) | guia: Runbook: reiniciar o backend sem derrubar o que é de outra sessão (T0.2, SRC-3, AC-SRC-2) |
| [sdd/inonu-desktop-v1/SPEC.md](../../sdd/inonu-desktop-v1/SPEC.md) | contrato: SPEC - Inonu Trader v1: instalável Windows 11, OnchainOS completo e inteligência sob demanda |
| [sdd/inonu-desktop-v1/spikes/T1.1.md](../../sdd/inonu-desktop-v1/spikes/T1.1.md) | evidencia: sonda inconclusiva da extensão em janela --app; histórico concorrente, não executado por esta organização |
| [sdd/inonu-desktop-v1/spikes/T9.3.md](../../sdd/inonu-desktop-v1/spikes/T9.3.md) | proposta: T9.3 |
| [sdd/inonu-desktop-v1/TASKS.md](../../sdd/inonu-desktop-v1/TASKS.md) | plano: TASKS - Inonu Trader v1 |
| [sdd/inonu-desktop-v1/wallet.md](../../sdd/inonu-desktop-v1/wallet.md) | guia: Carteira OKX conectada: ler, preparar e (desligado) enviar |
