## Plano da fatia S1: carimbo de tempo por etapa do ciclo

Objetivo: entregar um módulo puro e testado que mede as etapas do ciclo, sem ligar a nenhum arquivo quente.

Premissas
- Só arquivos novos: `src/agent/stage-timing.ts` e `src/agent/stage-timing.test.ts`.
- Nenhuma dependência nova. Usa `bun:test` e TypeScript já presentes no repo.
- Relógio sempre injetado (`now`). Gravação sempre injetada (`append`).

Passos

1. Escrever o arquivo de teste com os 14 casos de `casos_de_teste`, usando relógio falso com variável mutável e `append` que guarda as linhas em array. Portão: `bun --no-env-file test src/agent/stage-timing.test.ts` falha porque o módulo não existe. Se passar, o teste está errado e volta ao passo 1.
2. Implementar `createStageTimer`, `start`, `end`, `record` e `snapshot`. Portão: casos 1 a 8 verdes.
3. Implementar `percentile`, `summarize`, `formatStageLine` e `recordStages`. Portão: os 14 casos verdes.
4. Revisar o texto e os comentários: nenhum ponto médio, travessão ou meia-risca; comentários esparsos. Portão: `grep` da seção de critérios vazio.
5. Rodar o typecheck do projeto. Portão: `bun run typecheck` sem erro no arquivo novo.
6. Conferir que nenhum arquivo quente foi alterado. Portão: `git status --short` dos arquivos quentes vazio.
7. Registrar `integracao_proposta` no spec. Portão: revisão humana posterior; esta fatia não liga nada.

Ordem e dependências
- 1 antes de 2; 2 antes de 3; 3 antes de 4 e 5; 5 antes de 6 e 7.

Saída da fatia
- Dois arquivos novos, testes verdes, typecheck verde, arquivos quentes intactos, ponto de integração descrito.

Fora desta fatia
- Qualquer ligação ao ciclo, gravação em disco, medição de rede, cotação, atrito, markout ou alteração de decisão, executor ou risco.
- Qualquer item da lista de bloqueios do dono.

Reversibilidade
- Tudo é aditivo. Apagar os dois arquivos novos desfaz a fatia por completo.

