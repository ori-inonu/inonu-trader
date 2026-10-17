# Verificação da anotação de pesos

Baseline: `00a593bcabe25dbb6d83795268533551098f645b`.

Comando de comportamento:

```powershell
bun --no-env-file test src/decision-evidence/weights.test.ts
```

Resultado observado: exit 0, 11 pass, 0 fail, 76 expect() calls. As fixtures sintéticas exercitam os dez exemplos dos requisitos, normalização sem argmax, pesos ausentes/null, overflow e underflow, evidência incompatível, ações/status, tolerâncias, entradas congeladas, repetibilidade e projeção de cinco campos.

Comando de tipos:

```powershell
bun --no-env-file node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --target ESNext --module Preserve --moduleResolution Bundler --types bun src/decision-evidence/weights.ts src/decision-evidence/weights.test.ts
```

Resultado observado: exit 0. O escopo inclui somente o módulo novo e seus testes; não certifica outros módulos do projeto.

O ciclo TDD iniciou com import ausente. Outros testes falharam antes de implementar a validação de decisões, a distinção entre pesos explícitos e fallback da escolha, e a identificação de fallback de segurança. Cada etapa voltou a passar antes da seguinte. Os testes adicionais verificaram as fronteiras do comportamento já implementado.

A inspeção do módulo não encontrou imports, leitura de ambiente, arquivos, rede ou consultas a modelos. Nenhum importador existente foi alterado. As fontes do adaptador usadas no contrato mantiveram os hashes registrados nos requisitos.

Não foram utilizados feed real, contas reais, inferência paga, ordens ou carteira. Esta verificação local não demonstra calibração, retorno financeiro ou funcionamento em produção.
