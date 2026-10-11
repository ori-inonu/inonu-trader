# Regressão de leitura da fase de observação

Candidato anterior: 66dad45c1d70d0767600306f9bf6f7a64c4e99df. A suíte completa encontrou 1962 pass, 2 skip e 1 fail: GET /system-one retornava 500 para o ciclo válido de fase-0 produzido por runSystemOneCycle no teste src/system-one/http.test.ts.

Fonte do contrato: src/policy/envelope.ts PHASES e deriveLimits definem leverageCeiling=0 para fase-0; fases 1 e 2 usam tetos 1 e 2. src/system-one/brief.ts bloqueia todos os oito candidatos na fase-0. Zero conhecido não é ausência de dado.

Correção: projeção HTTP e parser aceitam teto zero na fase-0, mantendo valores obrigatórios finitos e não negativos. Nas demais fases o teto segue positivo. Leverage e distância de liquidação de cada candidato permanecem positivos. Valores ausentes, não finitos ou negativos continuam rejeitados; nenhum critério congelado C1–C6/S1–S5 foi alterado.

Jev Workflows classify_decision em evaluate recomendou phase_specific_zero, confiança 0.72, recibo 51a4d71a-830d-40e7-a08b-8ce78f8f1150, approved_by=jev_delegated técnico. Uso conhecido 917 input/60 output tokens; custo desconhecido. Conselho não concede autorização.

Verificação prevista: regressão HTTP existente e regressão do parser (16 testes: red com 15 pass/1 fail), oito candidatos bloqueados, ausência de escolha, valores inválidos preservados; suítes finais, tipos/build e revisão independente do delta antes de main.
