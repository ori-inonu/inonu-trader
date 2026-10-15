# Inonu Trader v1: pasta SDD

Instalável Windows 11, OnchainOS completo, inteligência de rastro do dinheiro esperto e consulta sob demanda ao assistente **Inonu** (o **Jev** é o modelo por trás). Pedido do usuário de 2026-10-12, 16 itens; entrega desta rodada: **pacote SDD e plano de implementação, sem código de produto**.

Leia nesta ordem:

| Arquivo | Para quê |
| --- | --- |
| [SPEC.md](SPEC.md) | Pedido, decisões do usuário, fatos verificados, requisitos EARS com IDs e aceitação independente |
| [PLAN.md](PLAN.md) | Plano de implementação: ondas, caminho crítico, colisões, primeiro ciclo |
| [TASKS.md](TASKS.md) | Tarefas pequenas e especificadas, com requisito, arquivos exclusivos, dependências e teste que falha primeiro |
| [OWNERSHIP.md](OWNERSHIP.md) | Quem edita o quê (110 caminhos de outras sessões) |
| [adr/](adr/) | Decisões: [instalável](adr/ADR-1-instalavel.md), [segredos](adr/ADR-2-segredos.md), [camadas e nomenclatura](adr/ADR-3-camadas-e-nomenclatura.md), [sem simulado](adr/ADR-4-sem-simulado.md), [carteira](adr/ADR-5-carteira.md), [custo e formas de uso](adr/ADR-6-custo-e-formas-de-uso.md) |
| [flow-engine.md](flow-engine.md) | Fatores de fluxo (Imbalance, Sequencial, Progressão, Exaustão, Fator Volume), zonas, trilha, Evidence Brief e vetores |
| [rastreador.md](rastreador.md) | Rastreador inspirado no do TradingView |
| [wallet.md](wallet.md) | Carteira OKX conectada: ler, preparar e (desligado) enviar |
| [info-diet.md](info-diet.md) | Interface enxuta: manter, mover ou remover |
| [onchainos-coverage.md](onchainos-coverage.md) e [.json](onchainos-coverage.json) | Decisão página a página das 499 páginas da documentação OnchainOS |
| [CHECKPOINT.md](CHECKPOINT.md) | Estado, evidência, pendências e próximo passo |
| [FREEZE.json](FREEZE.json) | Hashes de congelamento |

Ferramentas (`bun --no-env-file run docs/sdd/inonu-desktop-v1/tools/<arquivo>`):

| Ferramenta | Função |
| --- | --- |
| `verify-citations.ts` | Links, citações `caminho:linha`, consistência de IDs entre SPEC, TASKS e PLAN, tipografia |
| `okx-coverage.ts --check [--mirror <dir>]` | 499 páginas, 0 sem decisão, IDs conferidos, deriva contra o espelho |
| `mirror-okx-docs.ts --out <dir>` | Refaz o espelho em texto (não versionado) |
| `freeze.ts --check` | Confere os hashes congelados (SPEC, projeto do motor, ADRs, cobertura); PLAN, TASKS e OWNERSHIP levam progresso e não são congelados |

Este pacote não concede autorização, não agenda nada e não cria metas: cada onda de [PLAN.md](PLAN.md) exige a aprovação do usuário.
