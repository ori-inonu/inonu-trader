# System One: exposicao total dentro do envelope

Baseline: 51edcbc5a17a6805675268ed8dd9703df2b8eebe. Esta entrega faz parte do objetivo completo da central operacional, que permanece aberto.

Fontes: docs/SYSTEM-ONE.md, itens 3 e 4 e exclusao de ultrapassar o envelope; docs/POLITICA-DE-LIMITES.md, L13 e teto de exposicao; src/system-one/types.ts define openNotionalUsd como nocional ja aberto.

## Aceite imutavel

- E1: um candidato somente e elegivel quando nocional existente mais nocional proposto cabe no exposureCapUsd, sem multiplicar o teto pela alavancagem.
- E2: candidato que ultrapassa esse teto apresenta exposure_cap_reached e nao aparece em eligibleIds. Candidatos dentro do teto continuam sujeitos aos demais gates existentes.
- E3: a verificacao usa a interface publica buildLeverageBrief, inclui fronteiras abaixo, igual e acima do teto e preserva a ausencia de execucao financeira.

Escopo: corrigir a comparacao de exposicao e seus testes. Nao alterar tamanho, modelo, fase, dados de mercado ou gates live. Revisao independente e obrigatoria antes de integrar esta entrega em main.

Seam aprovado por delegacao tecnica: buildLeverageBrief; approved_by=jev_delegated. Recibo Jev Workflows 4c1ad8d9-9d77-4262-b8ea-079921dd8f58, modelo jev-1.13.0, recomendacao public-brief, input 459 tokens, output 59 tokens, custo faturado desconhecido. A consulta anterior foi skipped por unsafe_candidate_id e nao produziu decisao.
