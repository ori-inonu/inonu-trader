# Verificação do exportador

Baseline: 00a593bcabe25dbb6d83795268533551098f645b.

Comando de comportamento:

```powershell
bun --no-env-file test ./src/learning-evidence ./scripts/learning-dataset.test.ts
```

Resultado observado: exit 0, 15 pass, 0 fail, 96 expect() calls. Casos sintéticos exercitam custos/null, whitelist, proveniência, maturação, conflitos, imutabilidade, cortes temporais literais, igualdade, embargo, múltiplos ativos, cauda e limites. A CLI foi exercitada com arquivos temporários reais, links, JSON/UTF-8 inválidos e hashes antes/depois.

Comando de tipos:

```powershell
bun --no-env-file node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --target ESNext --module Preserve --moduleResolution Bundler --types bun src/learning-evidence/dataset.ts src/learning-evidence/dataset.test.ts scripts/learning-dataset.ts scripts/learning-dataset.test.ts
```

Resultado observado: exit 0. Inclui os contratos importados de features e outcomes; não certifica o restante do projeto.

A regressão de null explícito falhou antes da correção: 14 pass, 1 fail, 93 expects. Depois, os três controles rejeitam null com invalid_options; opções omitidas ou undefined preservam os padrões.

Observações de origem historico são aceitas pelo contrato atualizado do recorder e excluídas do dataset. Só origem relogio spot é elegível.

Esta verificação não utilizou feed real, inferência de provedor, ordens ou carteira. Os testes verificam o comportamento local, sem demonstrar lucro, calibração, qualidade dos dados ou operação em produção.
