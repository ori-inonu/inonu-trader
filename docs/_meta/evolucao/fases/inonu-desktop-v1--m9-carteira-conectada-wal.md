---
title: "M9 Carteira conectada (WAL)"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "milestone_nativo"
stream: "inonu-desktop-v1"
---

# M9 Carteira conectada (WAL)

Tipo original: `milestone_nativo`. Release não atribuída. Estado de cada item é uma alegação da fonte, não verificação atual.

[[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]] | [[concepts/evolucao-do-projeto]]

[Fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 146.

## Tarefas

- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-1|T9.1: Estender o código existente de conexão (web/src/lib/okx-wallet.ts, EIP-6963 e ethrequestAccounts já existem) para EVM...]] | parcial_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-2|T9.2: walletaddEthereumChain em 4902 (o único método novo; a troca já existe), com RPCs de providers.json]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-3|T9.3: Reserva sem extensão: OKX Connect por QR (EVM e Solana) ou limitação registrada]] | planejada_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-4|T9.4: Dados do endereço conectado, só leitura, pelo gateway; aba Carteira]] | planejada_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-5|T9.5: Escada de cotações (no máximo 5 por ticket) com o estado degradado quando o teste de 60 dias da Trade API acabar]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-6|T9.6: Ticket de ordem que só exibe /swap e /approve-transaction]] | parcial_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-7|T9.7: "Aceitar" a sugestão só preenche o ticket]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-8|T9.8: Envio pela carteira especificado e desligado]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-9|T9.9: Rotas do gateway que devolvem a transação de troca e a aprovação, sem cache: /onchain/swap e /onchain/approve]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-10|T9.10: Núcleo puro do envio: configuração com opção desligada por padrão, tetos e parada, log local, conferência da transaçã...]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-11|T9.11: Único arquivo que pede à carteira para enviar, com leitura de conta e rede imediatamente antes, um pedido por vez, re...]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-12|T9.12: Painel "Ordem pela minha carteira" na aba Carteira e seção "Enviar pela minha carteira" em Configurações; "Preparar c...]] | concluida_declarada
- [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-13|T9.13: Troca de saída: entregar uma fração do saldo lido do próprio token por uma moeda em dólar da rede]] | planejada_declarada
