---
title: "T9.1: Estender o código existente de conexão (web/src/lib/okx-wallet.ts, EIP-6963 e ethrequestAccounts já existem) para EVM..."
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "T9.1"
namespace: "inonu-desktop-v1"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# T9.1: Estender o código existente de conexão (web/src/lib/okx-wallet.ts, EIP-6963 e ethrequestAccounts já existem) para EVM...

ID com namespace: `inonu-desktop-v1::T9.1`.

ID original: `T9.1`.

- Estado documental normalizado: `parcial_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
parcial: `errors.ts` classifica 4001, 4100, 4200, 4900, 4901, 4902, -32002, -32602, -32603, -32601 e o tempo esgotado (texto nosso, nunca a mensagem da carteira) e `chains.ts` aceita um pedido por vez por carteira, ambos testados e usados por T9.2; **falta:** a conexão EVM em si segue em `okx-wallet.ts` (não editado), que trata 4001 e 4902 e dá texto genérico para 4100, 4900 e -32002; a conferência manual espera T1.1. **Solana (2026-10-13, c3081b):** feita por clique, com os erros em texto nosso (`web/src/lib/wallet/{solana-account,solana-store}.ts`, `useSolanaAccount.ts`), um provider falso nos testes e numa página de navegador; a extensão real ainda não foi vista. [evidence/T9.1-T9.4-solana-na-carteira.md](evidence/T9.1-T9.4-solana-na-carteira.md)
```

[Abrir tarefa na fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 150. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/inonu-desktop-v1--m9-carteira-conectada-wal|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/inonu-desktop-v1--t1-1|T1.1]].
