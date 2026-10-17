# Origem observável dos pesos de decisão
Version: draft-v2
Phase: specification only
Owner: root-01a1362a
Decision source: jev_delegated; human_response=false
Implementation status: not started

## Resultado esperado

Adicionar futuramente uma anotação pura e separada que diferencie pesos reportados pelo provedor, fallback da escolha, fallback de segurança e origem desconhecida. Os campos e o comportamento da decisão existente permanecem intactos.

## Evidência e limite

Inventário local em 2026-10-13:

- `src/jev-read/decide.ts`, SHA-256 `3002a86e3eb67614fd0cb511306fbbffecd66e2db122a67a44af9356d19aa0b0`: ausência de `raw.probabilities` produz vetor unitário para a ação. A decisão armazena seu peso em `confidence`; respostas inválidas produzem hold com confidence null.
- `src/jev-read/types.ts`, SHA-256 `7160bed1c4a5ea1c4a798686fbad08d84c8e098359d59e68023445da696a21bc`: schema atual 1; confidence é descrita como peso, não win rate.
- `src/jev-read/public-view.ts`, SHA-256 `9d2390a1b0c29d7dfe573265113ed146ea6269a17ac75055f971db1fda553515`: projeção publica pesos/confidence sem origem.
- `src/decision-evidence` não existe na raiz no preflight. Os três arquivos acima permanecem reservados pelo SDD canônico de carteira.

Fontes primárias consultadas: [Choice](https://docs.typesafe.ai/primitives/choice) e [Confidence](https://docs.typesafe.ai/confidence), acesso 2026-10-13. Choice fornece distribuição entre opções; a estatística confidence do fornecedor deriva dessa distribuição. A anotação não calcula essa estatística nem a confunde com o campo legado ou com chance de lucro. Nenhuma calibração financeira local foi demonstrada.

Recibos consultivos reais: [prioridade e seam](decision-receipts.json). A prioridade foi probability_provenance; o seam foi additive_annotation. Isso aprova escolhas técnicas somente dentro da delegação vigente, não execução financeira.

## Vocabulário do contrato

- Peso selecionado: peso numérico da ação em uma decisão válida com status ok.
- Peso reportado selecionado: peso selecionado cujo vínculo com uma resposta contemporânea do provedor foi verificado.
- Origem desconhecida: ausência de prova contemporânea, inclusive registros históricos unitários.
- Calibração financeira: relação medida entre pesos e um resultado financeiro previamente definido. Esta entrega não estabelece essa relação.

## Interface observável proposta

Função pura `annotateDecisionWeights(decision: unknown, evidence: unknown)` em módulo novo. A decisão contém action, probabilities e status. O chamador fornece evidência explicitamente discriminada:

- `{ kind: "observed_response", raw: unknown }`: resposta observada no mesmo processamento da decisão.
- `{ kind: "observed_failure", status: "error" | "timeout" }`: falha observada nesse processamento.
- `{ kind: "historical_record" }`: não há a resposta contemporânea.

A anotação retorna somente `schemaVersion: 1`, `origin`, `selectedWeight`, `reportedSelectedWeight` e `financialCalibration: "not_established"`. Origin tem quatro valores: provider_reported, adapter_choice_fallback, adapter_safety_fallback, unknown. Decisão inválida retorna null. Não copia a decisão, payload bruto, confidence, credenciais ou texto do provedor.

A origem é uma classificação da evidência fornecida, não prova criptográfica de transporte. O chamador será responsável por fornecer a resposta contemporânea correta. Essa integração ainda não existe.

## Critérios imutáveis propostos

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

## Plano mínimo da fase posterior

1. Recuperar estado próprio; revalidar reservas e baseline; criar/renovar lease exclusiva e registrar esta aceitação com hashes.
2. Produzir teste de regressão negativo pela API nova; guardar erro real; implementar módulo puro mínimo nos dois caminhos exclusivos.
3. Exercitar todos os exemplos e fronteiras PP-1..PP-5; verificar tipos e pureza; congelar manifesto/patch sem registros internos.
4. Revisões independentes de Spec e Standards contra PP-1..PP-6; auditoria do patch exato.
5. Preparar o contrato de adoção em journal/dashboard após liberação dos caminhos reservados. Documentar que o módulo isolado ainda não altera a interface live.

## Dependências e exclusões

A fase atual entrega somente planejamento e revisão. Integração live é dependência posterior de liberação dos caminhos e inspeção dos consumidores. Calibração requer dataset real, target/custos/tempo e ensaio pareado independente; não pertence a este módulo. Não tocar carteira, fundos, prompts, modelos, configurações de risco, budgets, pacotes, cadence 300ms ou contrato Kuru. Não afirmar retorno financeiro ou ativação.

