# Baseline antes de editar (2026-10-13)

`bun --no-env-file test --parallel=1 --timeout 15000 ./src/intel ./src/inonu ./src/lab ./src/desktop`

```
(pass) vaultCli (the child the writer spawns) > set reads the value from stdin, stores it and prints nothing that contains it [2.89ms]
(pass) vaultCli (the child the writer spawns) > delete, and refusal of unknown commands and of names outside the allowlist [3.51ms]

 1385 pass
 0 fail
 835510 expect() calls
Ran 1385 tests across 62 files. [46.25s]
done
```

git status no início: 186 entradas (lista em git-status-inicio.txt).
