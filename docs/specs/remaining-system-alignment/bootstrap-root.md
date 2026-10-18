# Recuperacao do checkout original

O ultimo conflito de indice era scripts/jev-consensus.ts. A versao fisica ainda exigia os limites antigos e importava JEV_JUDGE_HARD_MAX_CALLS, ja removido do seletor. As tres versoes do merge e a versao atual de main foram lidas. A resolucao usa o blob de main, com teto opcional e contabilidade de uso. O arquivo anterior foi preservado em .scratch/reconcile-root-consensus-20261018/working-before.ts.txt.

O typecheck anterior tambem comprovou imports ausentes no wire. Foram repostos exclusivamente arquivos ja versionados em main: dez arquivos de observacao shadow, guarda do executor, medicao da CLI e prompts; depois, os 25 arquivos de src/decision exigidos transitivamente. Nao houve geracao ou alteracao do texto dos prompts. Seus testes de hashes passaram.

A validacao MCP foi alinhada com main para recusar um max_calls informado mas invalido. A fixture de autoresearch recebeu os dois campos vazios do contrato atual de revisao. O export locked do ledger foi reposto porque src/decision/log.ts e consumidor comprovado. Corpo, valor Infinity e contagem permaneceram os de main.

Tres checagens incrementais falharam, identificando as dependencias faltantes e depois o export compartilhado. O diagnostico foi escalado para revisao direta do contrato de main, sem troca de modelo nem recomendacao Jev inventada. A verificacao final passou:

```
bun --no-env-file run typecheck
exit 0

bun --no-env-file run test
8160 pass
2 skip
0 fail
985637 expect() calls
Ran 8162 tests across 498 files. [327.05s]

bun --no-env-file run test:lab
650 pass
0 fail
838159 expect() calls
Ran 650 tests across 16 files. [31.54s]

bun --no-env-file run --cwd web typecheck
exit 0

bun --no-env-file run --cwd web test
3821 pass
0 fail
59679 expect() calls
Ran 3821 tests across 252 files. [27.43s]
```

Os skips sao os dois testes condicionais de receipt-safety. Estes totais pertencem a raiz no HEAD antigo com trabalho local, e nao substituem os 8539 testes do candidato deste PR. O teste executa a arvore de trabalho; ainda ha diferencas entre indice e WIP que exigem revisao antes de concluir o merge local.

O verificador final protegeu hashes de 40 caminhos desta coorte e preservou as demais entradas do indice. Os caminhos verificados foram estagiados de forma explicita. Depois dos checks, foi removida uma unica linha vazia final em scripts/autoresearch/online-source.test.ts; a saida do transpiler foi comparada antes/depois e permaneceu igual. Git diff --cached --check passou.

Nenhum conflito de indice permanece. O merge original continua aberto, sem novo commit: HEAD d513d60, MERGE_HEAD c67b39e. Main permanece 2327a28. O cerebro da raiz passa em seq=1074 e seus oito artefatos v1 permanecem validos. Nao sincronizar cadeias documentais por substituicao: conferir prefixos e preservar os eventos existentes.

Evidencias locais: .scratch/verify-root-alignment-20261018/result.json, os logs nessa pasta e .scratch/root-dependency-contract-escalation-20261018.md. Nenhum processo operacional foi iniciado, nenhuma credencial foi lida e nenhuma chamada paga ocorreu nessa recuperacao.
