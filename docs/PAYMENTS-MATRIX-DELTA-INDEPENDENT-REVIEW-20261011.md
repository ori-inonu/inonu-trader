# Revisão independente — delta Payments

**APPROVE: pesquisa e aceitação proposta para futura correção factual do catálogo.** Não é aprovação de implementação, ciclo, merge, operação financeira ou conclusão do objetivo.

## Identidade, escopo e método

Auditor: `01a12ada-7b55-7fd2-8a20-c940f474c1a1`, distinto do integrador `codex-inonu-system-one-safety` / `01a12971-f941-7e42-8a42-fab6d44d4eb5`. Não implementei o candidato. Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Cópia exclusiva ordinária; somente leitura da origem por instrução, sem RO imposto pelo sistema operacional.

Data: 2026-10-11. Commit fixo `14cbb7bd2878eed0a930b324b0c50610be7cdab8`; árvore `9698718595aa0c7c1b80021449f32d99eff26f92`. Leituras `git show`/`git grep`, hashes locais e consulta independente às duas páginas oficiais. Reutilizei as fontes locais antes da consulta. Harness recuperado na identidade própria: revisão 0, research/idle; metadados não conferem autoridade. Sem alteração de código/testes, execução da aplicação ou suíte, instalação, chamada financeira/inferência, assinatura ou credenciais. Única escrita: este relatório.

## Achados e cobertura

1. **PASS — correção factual necessária.** Catálogo:461–470 mantém `payments-x402`, `blocked`, `T2-A`; a frase “sem tetos descritos” (:468) generaliza incorretamente. O APP documenta `upto` com teto conhecido na assinatura. Isso não comprova enforcement da integração nem equivale a limite de exposição de trading. Delta:7,14,29 corretamente delimita a correção. [APP oficial](https://web3.okx.com/pt-br/onchainos/dev-docs/payments/app).

2. **PASS — modalidades e disponibilidade.** `charge` tem valor conhecido e liquidação imediata descrita; `session`, preço unitário conhecido e liquidação no fechamento; `upto`, liquidação após relatório do vendedor. O menu marca integração de escrow como Coming soon, embora o protocolo descreva escrow. Delta:13–16 não confunde conceito com disponibilidade executável. Nenhuma dessas descrições demonstra autorização geral, custódia específica ou funcionamento live. [APP oficial](https://web3.okx.com/pt-br/onchainos/dev-docs/payments/app).

3. **PASS — condicionalidade econômica.** A tabela Payments lista X Layer/196 e USDG, USDC, USD₮0; gás zero é oferta temporária nessa rede e nesses tokens. Delta:17–18,31 preserva a condição, sem extrapolar cobertura à Wallet/API ou zerar custos de estratégia. Oferta documentada não prova preço atual executável nem elimina outras taxas. [Redes oficiais](https://web3.okx.com/pt-br/onchainos/dev-docs/payments/supported-networks).

| Aceitação proposta (delta:29–32) | Parecer de suficiência nesta fase |
| --- | --- |
| 1: teto documentado ≠ permissão financeira | PASS; factual, verificável por comparação com APP. |
| 2: preservar bloqueio | PASS; exigir assert específico de `blocked` e `T2-A`; pesquisa não qualifica acesso. |
| 3: gás/escrow condicionais | PASS; futura descrição deve preservar rede, tokens e temporalidade, além da disponibilidade não demonstrada. |
| 4: contrato e revisão independente | PASS como requisito futuro; execução desse contrato ainda pendente. |

**Limite concreto da evidência de testes:** testes existentes :88,132–138,201 cobrem presença e restrições genéricas, mas não congelam especificamente a descrição de `upto` nem ambos os valores da linha Payments. `git grep` por `payments-x402`, `payment_pay`, `payment_session` em `src`/`web/src/lib`/`web/src/app` encontrou apenas catálogo/teste. Isso não prova isolamento global contra caminhos dinâmicos. A futura correção deve demonstrar seu diff exclusivamente descritivo e preservar os gates; não substituir essa análise por busca textual.

O escopo atende GOAL-INONU-TRADER:3,5,11 (custos conservadores, qualificação, autorização financeira explícita) e OKX-ECOSYSTEM-SPEC:5,26,28. Não amplia execução nem resolve F1–F4, economia roundtrip, integrações ou a missão ampla. Aceitação permanece proposta, não congelada (delta:34).

## Vínculo exato de hashes — SHA256

| Fonte | Hash |
| --- | --- |
| Delta lido, bytes atuais | `5922255aadc034b5e290ae0976a29656bdeb6c72e0a7e3a399d66fcd966751d4` |
| Catálogo, blob LF do commit fixo | `408262cfdd3144d5e44ef9c16d50247bc1a11378df5ec7a30aca2f8d1681a5a5` |
| Catálogo físico CRLF, hash citado pelo delta | `249a08fa3577090a73856278a808b557f1c7293bc3da9f495f3f37a8bd4f51b5` |
| ecosystem-catalog.test.ts, blob fixo | `e94607ae72753a9097a839d68c1b1c637604a42110f726344b93967831de4b13` |
| GOAL-INONU-TRADER.md, blob fixo | `968b888890679baa5b0d2d358c36d5bb7fc8ecce690e455fdcddf6da891a35fc` |
| OKX-ECOSYSTEM-SPEC.md, blob fixo | `c0c0ca088fed47c7e37d495134d53ebd1e63e7360bdaddbc2ce2f08235525946` |

A conversão LF→CRLF do blob reproduz exatamente o hash físico; normalização inversa confirma igualdade. Delta e blob foram reconferidos antes da escrita. Leituras finais: chunks `b0e2b3`, `896b46`, `a98c2f`, todos exit 0. Documentação oficial consultada em 2026-10-11 por conteúdo textual do navegador de pesquisa; não disponho de hash dos bytes HTML originais. Não auditei a afirmação histórica de main limpo, toda a aplicação, enforcement onchain ou custos reais. Conselho técnico não concede autoridade financeira.
