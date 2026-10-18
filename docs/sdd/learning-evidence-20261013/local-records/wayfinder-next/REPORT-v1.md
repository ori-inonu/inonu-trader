Revisão independente do planejamento v1: CHANGES_REQUESTED. Dois findings P2; nenhuma implementação certificada. Reviewer: 01a13658-c294-7fc0-8b26-1e3f28c2945f; autor: root-01a1362a.

1. PP-SPEC-1, PP-2/PP-5, NEXT-SPEC:50: “Com resposta contemporânea válida, choice igual à ação e pesos normalizados iguais aos da decisão, origin é provider_reported.” Essa condição também aceita {choice:"buy"} com decisão buy/(1,0,0)/ok, mas a regra seguinte e PP-5:65 exigem adapter_choice_fallback. Também aceita hold/(0,0,1)/malformed com raw válido hold/(0,0,1), apesar de sources/decide.ts:55-62 produzir status ok. Exigir probabilities explicitamente informado e válido, decisão status ok e compatibilidade; tornar ramos mutuamente exclusivos e fixar exemplo de status divergente -> unknown. Fonte: decide.ts:37-40,55-62.

2. PP-SPEC-2, PP-2/PP-5, NEXT-SPEC:52: “peso da escolha positivo; cada valor dividido pela soma”. Falta a rejeição após divisão de sources/decide.ts:51: “!(probabilities[action] > 0)”. Raw buy com pesos {buy:Number.MIN_VALUE,sell:2,hold:0} passa os checks brutos, mas o peso normalizado vira zero; a fonte retorna malformed/hold canônico. Probe aritmético real: bun --no-env-file --eval, exit 0; peso 5e-324, soma 2, normalizado 0. Acrescentar a condição normalizada e fixture literal adapter_safety_fallback/null/null.

PP-1, PP-3, PP-4 e PP-6 têm limites observáveis e viáveis. Não há scope creep financeiro: origem desconhecida, calibração not_established, campos legados e live preservados, adoção posterior condicionada à liberação dos caminhos. Recibos têm assessed, jev_delegated, human_response=false e custo desconhecido null; não concedem autorização externa.

Cinco hashes conferidos antes/depois, iguais aos fornecidos. SPEC: f854ca3b628fbb662273cd757533f0d8ab27c848d847dbbdc5b3660769f5ba4c. Recibos: 109c6341fc595418e4eee650094dbbc6acfe422ab8f9607ba7d12d39b2c442a6. coverage-v1.json conserva fontes, excertos, casos e comando/saída.

Limites: danger-full-access; cópia isolada readonly não prova enforcement. Fontes externas citadas e preflight/reservas atuais não foram revalidados. Nenhum modelo, rede, treino, ordem ou teste do exportador executado; arquivos da revisão anterior preservados. Reavaliar a SPEC corrigida antes de aprovar o planejamento.

