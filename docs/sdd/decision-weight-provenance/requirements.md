# Evidência da origem dos pesos de decisão

Este contrato define uma anotação pura para distinguir pesos reportados pelo provedor, fallback da escolha, fallback de segurança e origem desconhecida. Preserva os campos da decisão existente e não estabelece probabilidade de lucro.

A API proposta é `annotateDecisionWeights(decision: unknown, evidence: unknown)`. Evidências: `{kind: "observed_response", raw: unknown}`, `{kind: "observed_failure", status: "error" | "timeout"}` ou `{kind: "historical_record"}`. A saída tem somente schemaVersion, origin, selectedWeight, reportedSelectedWeight e financialCalibration.

## Aceitação

### PP-1: anotação isolada e invariância
A função retorna somente os cinco campos listados, sem alterar entradas, decisão, ação, pesos, status ou campos legados. Não lê ambiente/arquivos, não usa rede, não consulta modelos e não decide buy/sell. Entradas congeladas e comparação antes/depois devem comprovar ausência de mutação.

### PP-2: origem exige evidência compatível
Com decisão de status ok, resposta contemporânea válida com raw.probabilities informado como objeto válido, choice igual à ação e pesos normalizados iguais aos da decisão, origin é provider_reported. Ausência de raw.probabilities em uma resposta válida gera adapter_choice_fallback somente quando a decisão tem status ok e é o vetor unitário correspondente. Resposta inválida com a decisão canônica malformed/hold, ou falha error/timeout com hold canônico e status correspondente, gera adapter_safety_fallback. Resposta válida exige decisão de status ok; divergência de status gera unknown. Evidência ausente, histórica, malformada ou incompatível gera unknown. Nunca inferir origem apenas pelo vetor.

O contrato de normalização observado é: buy/sell/hold; choice válida; probabilities ausente significa fallback; objeto informado usa peso ausente ou null como zero; pesos finitos não negativos; soma finita positiva; peso bruto da escolha positivo; cada valor dividido pela soma; todos os pesos normalizados finitos e peso normalizado da escolha positivo. Objeto null/array, peso negativo/não finito, soma inválida ou escolha de peso zero antes ou após normalização são respostas inválidas. Não exigir que a ação seja argmax. Comparações de vetores normalizados usam tolerância absoluta de 1e-12 por componente; nenhuma diferença maior é reparada.

### PP-3: números e estados conservadores
Decisão válida tem action buy/sell/hold, status ok/error/timeout/malformed, três pesos finitos em [0,1] e soma dentro de 1e-12 de 1. Status ok exige peso selecionado positivo; outro status exige action hold. selectedWeight é o peso da ação apenas para status ok; caso contrário é null. reportedSelectedWeight só é numérico para provider_reported com status ok; todas as outras origens recebem null. financialCalibration é sempre not_established. Texto ou número desconhecido nunca vira zero nem certeza.

### PP-4: compatibilidade histórica e sanitização
Registro histórico válido continua anotável sem resposta original: origin unknown, selectedWeight preservado para status ok, reportedSelectedWeight null. Provedor pode reportar um vetor unitário legítimo: esse caso recebe provider_reported somente com prova contemporânea compatível. Campos extras e texto livre nunca atravessam a projeção de saída. Não migrar schema/journal/public-view/dashboard, nem adicionar thresholds ou usar a anotação para ordens.

### PP-5: exemplos literais e TDD
Executar fixtures sintéticas explícitas pela API pública nova, com resultados literais:

| Decisão e evidência | Origem | selectedWeight | reportedSelectedWeight |
| --- | --- | --- | --- |
| buy, (1,0,0), ok; response choice buy sem probabilities | adapter_choice_fallback | 1 | null |
| buy, (1,0,0), ok; response choice buy com (1,0,0) | provider_reported | 1 | 1 |
| buy, (0.5,0.25,0.25), ok; response choice buy com (2,1,1) | provider_reported | 0.5 | 0.5 |
| buy, (0.2,0.8,0), ok; response choice buy com (1,4,0) | provider_reported | 0.2 | 0.2 |
| buy, (1,0,0), ok; historical_record | unknown | 1 | null |
| hold, (0,0,1), malformed; response choice buy com pesos todos zero | adapter_safety_fallback | null | null |
| hold, (0,0,1), malformed; response choice buy com (Number.MIN_VALUE,2,0), cujo peso buy normalizado vira zero | adapter_safety_fallback | null | null |
| hold, (0,0,1), malformed; response válida choice hold com (0,0,1) | unknown | null | null |
| hold, (0,0,1), timeout; observed_failure timeout | adapter_safety_fallback | null | null |
| buy, (1,0,0), ok; response choice sell com (0,1,0) | unknown | 1 | null |

Também comprovar decisão inválida -> null; evidence inválida -> unknown; error/timeout/status divergente -> unknown; probabilities null/array e pesos negativos/NaN/infinito; todos os tipos de ação/status; limites da tolerância; repetibilidade; entradas imutáveis; saída allowlist sem payload bruto; null no peso selecionado para status não ok. Testes não chamam APIs nem usam contas reais.

### PP-6: arquivos, verificação e revisão
Entrega futura exclusiva: `src/decision-evidence/weights.ts`, `src/decision-evidence/weights.test.ts` e documentação pública própria. Nenhum importador runtime existente será modificado. Revalidar arquivos livres, hashes de fontes e estado da própria conversa antes de implementar. TDD com Bun sem .env, typecheck focado e revisão independente em cópia isolada com hashes. A aprovação desta especificação não certifica implementação.

## Fontes e limites

[Choice](https://docs.typesafe.ai/primitives/choice) e [Confidence](https://docs.typesafe.ai/confidence) descrevem os resultados do provedor. Esta anotação não calcula a estatística confidence do fornecedor nem a confunde com chance de lucro.

Nenhum importador runtime, journal, dashboard, carteira, prompt, modelo, ordem ou cadência Kuru/Monad será modificado por esta entrega. Registros históricos permanecem de origem desconhecida. O vínculo contemporâneo é responsabilidade do chamador, não autenticação criptográfica de transporte.
