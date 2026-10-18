# Estado: SourceError

Spec e plano preparados antes do codigo. Decisao consultiva extract_compat registrada em spec.md. Branch codex/source-error-integration-20261018 sobre main 98c5ab0. Checks desta fatia ainda nao executados neste ponto; resultados posteriores serao acrescentados.

Inventario de 2026-10-18: todos os commits das branches locais estao contidos em main. Worktrees learning-evidence, executable-delivery e producao estao limpas em revisoes antigas. Os arquivos nao rastreados de decision-evidence coincidem com main por comparacao dos dois diretorios. A raiz tem conflitos antigos e outras alteracoes preservadas. A goal1 mistura reorganizacao documental, clientes autenticados, dependencias e esta extracao. Nao foi aprovada para copia integral.

A biblioteca offline foi integrada no PR 3, merge 98c5ab08fd37fb4fdf09c39eb1645b325a606fed, arvore identica ao candidato testado. Validacao local: tipos exit 0, core 8539 pass e 2 skip, lab 650 pass, foco offline 146 pass. Zero checks de CI configurados naquele PR. O checkout de producao nao foi atualizado e nenhum processo de operacao foi iniciado.

## Verificacao local concluida

SE2 e SE3 concluidas.

## focused

```text
 479 pass
 0 fail
 2641 expect() calls
Ran 479 tests across 25 files. [1.68s]
```

## typecheck

```text
exit 0
```

## test

```text
(pass) checkSettings > L20 without the out-of-sample evidence flag fase-2 fails: absent is unknown, false is a violation, anything else is invalid [0.15ms]
 8539 pass
 2 skip
 0 fail
 1165451 expect() calls
Ran 8541 tests across 541 files. [306.57s]
```

## test-lab

```text
 650 pass
 0 fail
 838159 expect() calls
Ran 650 tests across 16 files. [26.65s]
```
