---
title: "Estado atual e documentos superados"
created: "2026-10-15"
updated: "2026-10-15"
type: "concept"
tags: ["documentacao", "governanca"]
sources: ["AGENTS.md", "README.md", "docs/_meta/currentness.md", "docs/portfolio-evidence-v1/REPORT.md", "docs/sdd/agente-autonomo/ADENDO-E-velocidade-amplitude-execucao-armada.md", "docs/sdd/agente-autonomo/ADENDO-F-pulse-no-artefato-local.md", "docs/sdd/agente-autonomo/ADENDO-G-hipoteses-em-sombra-20261015.md", "docs/sdd/agente-autonomo/ADENDO-H-alocacao-da-carteira-20261015.md", "docs/sdd/agente-autonomo/SPEC.md", "docs/sdd/agente-autonomo/tasks.md", "docs/sdd/carteira-evidencia/tasks.md", "docs/sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md", "docs/sdd/hospedagem-24h/tasks.md", "docs/sdd/inonu-desktop-v1/TASKS.md", "docs/sdd/inteligencia-decisao/TASKS.md", "web/src/app/page.tsx"]
confidence: "medium"
contested: true
contradictions: ["docs/sdd/agente-autonomo/SPEC.md", "docs/sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md"]
---

# Estado atual e documentos superados

Retrato de 15 de outubro de 2026. Inspeção estática/documental, não verificação de runtime ou de retorno financeiro.

[[concepts/evolucao-do-projeto]] | [[_meta/evolucao/catalogo/catalogo-de-fontes|Catálogo completo]]

## Produto e limites atuais

- Direção atual declarada: o agente autônomo de carteira substitui o demo Monad/Kuru, o tweet e a ordem a cada 300 ms como objetivos de produto. A prioridade declarada é operação local Windows; hospedagem paga e Vercel não foram iniciadas por esta organização. Evidência: AGENTS.md:113-121. ^[AGENTS.md] ^[docs/sdd/agente-autonomo/SPEC.md]
- Código-fonte observado: web/src/app/page.tsx:2,9-10 retorna AgentView. O README ainda descreve a Mesa/command center como raiz; esse trecho não descreve a composição atual da rota. Leitura estática não confirma qual processo/build está rodando. ^[web/src/app/page.tsx] ^[README.md] ^[docs/sdd/agente-autonomo/tasks.md]
- As fases e tarefas do agente, desktop, carteira, inteligência e demais pacotes conservam os IDs originais e o estado declarado pela própria fonte. As tarefas recentes ficam sem release atribuída; nomes como v1, rev-3 ou release24 são identificadores diferentes de uma versão semântica comprovada do produto. ^[docs/sdd/agente-autonomo/tasks.md] ^[docs/sdd/inonu-desktop-v1/TASKS.md] ^[docs/sdd/carteira-evidencia/tasks.md] ^[docs/sdd/inteligencia-decisao/TASKS.md]
- O plano da carteira diz que nada foi implementado no seu retrato original, mas já existem fontes de portfolio-evidence. A existência desses módulos não fecha automaticamente os critérios daquele plano. Não reescrever o status antigo nem tratar o inventário como aceite atual. ^[docs/sdd/carteira-evidencia/tasks.md] ^[docs/portfolio-evidence-v1/REPORT.md] ^[docs/_meta/currentness.md]
- Pulse: o adendo F é um contrato preparado e declara nada implementado para a ligação no artefato local. Não converter a existência do módulo descrito em E em evidência de pulse ligado no processo, 50 streams ativos ou ganho medido. ^[docs/sdd/agente-autonomo/ADENDO-E-velocidade-amplitude-execucao-armada.md] ^[docs/sdd/agente-autonomo/ADENDO-F-pulse-no-artefato-local.md] ^[docs/sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md]
- Pendência de reconciliação: SPEC do agente:164 relata autorização de alavancagem, enquanto AUTOEVOLUCAO:348 relata uma escolha posterior por Solana spot sem alavancagem/empréstimos/chave de exchange. São relatos documentais incompatíveis nesse ponto, não autorização financeira concedida por esta organização. A divergência foi sinalizada, não resolvida por inferência. ^[docs/sdd/agente-autonomo/SPEC.md] ^[docs/sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md]
- Memória, hipóteses em sombra e alocação: G/H apresentam limites e trabalho posterior. Um laboratório ou plano de integração não demonstra avaliador financeiro ativo, promoção produtiva nem benefício. Os estados relatados em 2026-10-14 e 2026-10-15 continuam vinculados às suas próprias capturas. ^[docs/sdd/agente-autonomo/ADENDO-G-hipoteses-em-sombra-20261015.md] ^[docs/sdd/agente-autonomo/ADENDO-H-alocacao-da-carteira-20261015.md] ^[docs/sdd/hospedagem-24h/tasks.md]

## Substituições explícitas e parciais

- [AGENTS.md](../../AGENTS.md) substitui_parcialmente [CLAUDE.md](../../CLAUDE.md): Direção de produto: demo, tweet e cadência de 300 ms deixam de ser requisitos; demais regras gerais não são descartadas. Evidência: `AGENTS.md:115`.
- [SPEC.md](../sdd/agente-autonomo/SPEC.md) substitui_parcialmente [docs/sdd/inonu-desktop-v1/adr/ADR-5-carteira.md](../sdd/inonu-desktop-v1/adr/ADR-5-carteira.md): Exclusão do Agentic Wallet e modelo só por clique; preserva limites declarados de chave, entradas e gates. Evidência: `docs/sdd/agente-autonomo/SPEC.md:9`.
- [SPEC.md](../sdd/agente-autonomo/SPEC.md) substitui_parcialmente [docs/sdd/inonu-desktop-v1/SPEC.md](../sdd/inonu-desktop-v1/SPEC.md): Fluxo e interface do produto: agente e configurações substituem Mesa/Rastreador e aprovação por ordem, sem descartar dados úteis do motor. Evidência: `docs/sdd/agente-autonomo/SPEC.md:5`.
- [AUTOEVOLUCAO-20261014.md](../sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md) precisa_escopo_de [docs/sdd/agente-autonomo/ADENDO-E-velocidade-amplitude-execucao-armada.md](../sdd/agente-autonomo/ADENDO-E-velocidade-amplitude-execucao-armada.md): Interpretação do relato, qualificação de vantagem e autorização já recebida; E0-E5 não são prova de operação. Evidência: `docs/sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md:298`.
- [ADENDO-F-pulse-no-artefato-local.md](../sdd/agente-autonomo/ADENDO-F-pulse-no-artefato-local.md) restringe_alegacao_de_integracao [docs/sdd/agente-autonomo/ADENDO-E-velocidade-amplitude-execucao-armada.md](../sdd/agente-autonomo/ADENDO-E-velocidade-amplitude-execucao-armada.md): Variável de ambiente não basta para ativar pulse no artefato local; F é contrato preparado, não implementação. Evidência: `docs/sdd/agente-autonomo/ADENDO-F-pulse-no-artefato-local.md:7`.
- [ADENDO-H-alocacao-da-carteira-20261015.md](../sdd/agente-autonomo/ADENDO-H-alocacao-da-carteira-20261015.md) complementa_com_limites [docs/sdd/agente-autonomo/ADENDO-G-hipoteses-em-sombra-20261015.md](../sdd/agente-autonomo/ADENDO-G-hipoteses-em-sombra-20261015.md): Hipóteses de alocação em sombra não são regra financeira produtiva nem segundo executor. Evidência: `docs/sdd/agente-autonomo/ADENDO-H-alocacao-da-carteira-20261015.md:3`.
- [AUTOEVOLUCAO-20261014.md](../sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md) contradiz_relato_de_autorizacao [docs/sdd/agente-autonomo/SPEC.md](../sdd/agente-autonomo/SPEC.md): Relato de Solana spot sem alavancagem diverge da atualização sobre autorização de alavancagem em SPEC:164; não resolvido. Evidência: `docs/sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md:348`.

## O que não foi resolvido artificialmente

- Release das tarefas recentes permanece não atribuída.
- As marcações "feito" e "não iniciado" das fontes não foram reescritas. Abertura de código, teste com fixture, recibo real e ganho medido são provas distintas.
- O catálogo anterior de 2026-10-13 continua histórico. Sua validação tinha falhas antes desta organização; não foi rebaselinado para aparentar sucesso.
- Uma fonte marcada como sensível só foi inventariada por caminho, sem leitura nem hash.

## Fontes da síntese

- [AGENTS.md](../../AGENTS.md)
- [README.md](../../README.md)
- [docs/_meta/currentness.md](../_meta/currentness.md)
- [docs/portfolio-evidence-v1/REPORT.md](../portfolio-evidence-v1/REPORT.md)
- [docs/sdd/agente-autonomo/ADENDO-E-velocidade-amplitude-execucao-armada.md](../sdd/agente-autonomo/ADENDO-E-velocidade-amplitude-execucao-armada.md)
- [docs/sdd/agente-autonomo/ADENDO-F-pulse-no-artefato-local.md](../sdd/agente-autonomo/ADENDO-F-pulse-no-artefato-local.md)
- [docs/sdd/agente-autonomo/ADENDO-G-hipoteses-em-sombra-20261015.md](../sdd/agente-autonomo/ADENDO-G-hipoteses-em-sombra-20261015.md)
- [docs/sdd/agente-autonomo/ADENDO-H-alocacao-da-carteira-20261015.md](../sdd/agente-autonomo/ADENDO-H-alocacao-da-carteira-20261015.md)
- [docs/sdd/agente-autonomo/SPEC.md](../sdd/agente-autonomo/SPEC.md)
- [docs/sdd/agente-autonomo/tasks.md](../sdd/agente-autonomo/tasks.md)
- [docs/sdd/carteira-evidencia/tasks.md](../sdd/carteira-evidencia/tasks.md)
- [docs/sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md](../sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md)
- [docs/sdd/hospedagem-24h/tasks.md](../sdd/hospedagem-24h/tasks.md)
- [docs/sdd/inonu-desktop-v1/TASKS.md](../sdd/inonu-desktop-v1/TASKS.md)
- [docs/sdd/inteligencia-decisao/TASKS.md](../sdd/inteligencia-decisao/TASKS.md)
- [web/src/app/page.tsx](../../web/src/app/page.tsx)
