# Anotar a origem dos pesos de decisão

`annotateDecisionWeights` é uma função pura em `src/decision-evidence/weights.ts`. Ela recebe a decisão e a evidência do mesmo processamento, valida sua compatibilidade e retorna uma anotação separada. Não consulta o Jev nem altera a decisão.

```ts
import { annotateDecisionWeights } from "../../../src/decision-evidence/weights";

const annotation = annotateDecisionWeights(
  { action: "buy", status: "ok", probabilities: { buy: 0.5, sell: 0.25, hold: 0.25 } },
  { kind: "observed_response", raw: { choice: "buy", probabilities: { buy: 2, sell: 1, hold: 1 } } },
);
// { schemaVersion: 1, origin: "provider_reported", selectedWeight: 0.5,
//   reportedSelectedWeight: 0.5, financialCalibration: "not_established" }
```

As entradas acima são sintéticas. As origens têm o seguinte significado:

| origin | Evidência necessária |
| --- | --- |
| provider_reported | Resposta contemporânea com pesos explícitos válidos e compatíveis com a decisão ok |
| adapter_choice_fallback | Resposta contemporânea válida sem pesos, compatível com a escolha unitária ok |
| adapter_safety_fallback | Resposta inválida com hold canônico malformed, ou falha error/timeout com hold canônico e status correspondente |
| unknown | Registro histórico, evidência ausente, malformada ou incompatível |

Para registros históricos, forneça `{ kind: "historical_record" }`. Um peso histórico igual a 1 preserva `selectedWeight: 1`, mas não comprova origem do provedor. Falhas observadas usam `{ kind: "observed_failure", status: "error" | "timeout" }`.

Decisão inválida retorna `null`. Estados não ok têm `selectedWeight: null`. `reportedSelectedWeight` só é numérico para `provider_reported`; nos demais casos é null. A saída contém somente os cinco campos do exemplo. Campos adicionais, textos e payload bruto não são copiados.

O chamador deve vincular a resposta contemporânea correta à decisão. A função verifica compatibilidade estrutural e numérica, não autentica transporte. Ela segue o contrato observado do adaptador, incluindo tolerância absoluta de 1e-12 e ação escolhida sem exigência de argmax.

Esta entrega não conecta a anotação ao journal ou dashboard, não migra schema e não modifica prompts, modelos, risco, alavancagem, carteira, ordens ou cadência. `financialCalibration: "not_established"` significa que não foi demonstrada uma relação entre peso e resultado financeiro. O peso não é uma probabilidade de lucro.
