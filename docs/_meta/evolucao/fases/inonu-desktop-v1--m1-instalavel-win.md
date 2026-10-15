---
title: "M1 Instalável (WIN)"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "milestone_nativo"
stream: "inonu-desktop-v1"
---

# M1 Instalável (WIN)

Tipo original: `milestone_nativo`. Release não atribuída. Estado de cada item é uma alegação da fonte, não verificação atual.

[[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]] | [[concepts/evolucao-do-projeto]]

[Fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 34.

## Tarefas

- [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-1|T1.1: Spike A: window.okxwallet (e EIP-6963) injetado em janela msedge --app=http://127.0.0.1:PORTA com o perfil que tem a ...]] | bloqueada_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-2|T1.2: Spike B: exe bun --compile serve estático e API sem Node; Bun.secrets funciona no exe]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-3|T1.3: Next 16 exportado estático, API relativa (mesma origem); lido antes web/nodemodules/next/dist/docs/]] | parcial_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-4|T1.4: Núcleo único: estáticos, APIs, /health, conexão SSE de presença, encerramento por inatividade, loopback e Host]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-5|T1.5: Raiz de dados %LOCALAPPDATA%\InonuTrader, chdir, pasta web ao lado do exe]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-6|T1.6: Origem same-origin para todos os manipuladores (/settings, /onchain/, /jev-read, /system-one), sem editar as guardas]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-7|T1.7: Lançador: instância única, porta fixa, perfil do Edge/Chrome com a OKX Wallet habilitada, abre --app, relógio OKX sin...]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-8|T1.8: Doctor com os 8 itens, rota /doctor e tela]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-9|T1.9: Instalador NSIS por usuário e scripts/build-desktop.ts, exe sem autoload de .env e bunfig]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-10|T1.10: Fumaça do instalado: instala, roda com PATH sem Node, Python e Rust, varre segredos, desinstala]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-11|T1.11: /console fora do instalável: o núcleo responde 404 a /console e o link "Central" da barra some (arquivo quente DeskRa...]] | concluida_declarada
