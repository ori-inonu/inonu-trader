# Revisao e relato da fatia S3: Custo de ida e volta em lote por cotacao sintetica

Veredito do revisor: aprovado_com_ressalvas. Reproduziu os testes: true. Toca assunto vedado: false.

## Relato do implementador

Implementei a fatia S3 (custo de ida e volta em lote por cotacao sintetica) como modulo puro com cotacao injetada. Criei somente os dois arquivos novos: src/okx-market/rt-batch.ts e src/okx-market/rt-batch.test.ts. Os 14 casos passam (bun --no-env-file test: 14 pass, 0 fail, 81 expect). RED confirmado antes da implementacao: falha de importacao por modulo ausente. Typecheck com tsc 7.0.2 nos dois arquivos e no projeto inteiro (tsc -p tsconfig.json): exit 0, sem erros. Nenhum caractere proibido (contagem zero por bytes). git status mostra apenas ?? src/okx-market/. Nada foi commitado. Divergencia importante: o worktree esta em b587759, um estado anterior sem src/okx-market, sem round-trip.ts, sem AGENTS.md, sem script typecheck e sem node_modules; por isso a linha de base do Portao 0 nao existe no formato pedido e os comandos que dependem de round-trip.ts e de bun run typecheck nao rodaram como escritos.

Worktree: .claude\worktrees\wf_1930517d-e57-56 (ramo worktree-wf_1930517d-e57-56)
Testes: bun --no-env-file test src/okx-market/rt-batch.test.ts => passou=true, n=14. bun test v1.3.14: 14 pass, 0 fail, 81 expect() calls. RED antes da implementacao: 'Cannot find module ./rt-batch' (1 error, 0 pass).
Typecheck: printf tsconfig.tmp.json com extends ./tsconfig.json, include so os dois arquivos, noEmit; bunx tsc -p tsconfig.tmp.json (tsc 7.0.2); tsconfig.tmp.json apagado depois. Tambem bunx tsc -p tsconfig.json (projeto inteiro). bun run typecheck NAO existe neste worktree (package.json sem script typecheck). => passou=true. Dois arquivos da fatia: exit 0, sem erros; listFiles confirma os dois arquivos no programa. Projeto inteiro: exit 0, 0 linhas 'error TS', nenhuma mencao a okx-market. Nao ha linha de base pre-escrita porque o worktree nao tinha erros registrados. Sem node_modules neste worktree.

## Desvios da spec

- Estado do worktree diferente da spec: HEAD b587759 (Kuru/Monad, anterior ao ciclo). Nao existem src/okx-market/, src/okx-market/round-trip.ts, synthetic-round-trip.ts, AGENTS.md, docs/specs/retorno-composto-por-ciclo/, script typecheck em package.json, .agents/skills com conflito UU, nem node_modules. O git status do inicio estava limpo, sem UU.
- Portao 0 (linha de base antes de escrever) nao foi possivel no formato pedido, porque nao existe script typecheck. Usei tsc diretamente, com tsconfig.tmp.json, e o projeto inteiro via tsconfig.json, ambos sem erro.
- Comando de verificacao 'bun --no-env-file test src/okx-market/round-trip.test.ts' nao pode rodar: round-trip.test.ts nao existe neste worktree. Nao foi executado e nao e pre-requisito, porque o modulo nao importa round-trip.ts.
- Comando 'grep -nP "\x{00B7}|\x{2014}|\x{2013}"' falhou aqui por locale (grep -P sem suporte a \x{}). Verifiquei com a ferramenta Grep (sem ocorrencias) e com contagem por bytes UTF-8 (zero em ambos os arquivos).
- Validacao de entrada um pouco alem da spec: tamanhos vazio tambem lanca erro (a spec pede itens nao vazios, nao cita tamanhos). Valores de campo que nao sao numero (string, por exemplo) viram campo_ausente, tratados como nao finitos.
- Uma escrita de captura de saida do tsc foi feita em C:/Users/gabri/AppData/Local/Temp/claude/ (diretorio de scratchpad da sessao, fora do worktree). Nenhum arquivo do repo foi tocado fora dos dois arquivos novos.

## Decisoes sem Jev

- Metrica de liquidez: liquidezUsd (TVL) ou profundidade a 1%: liquidezUsd (TVL) vindo da cotacao injetada (Opcao mais reversivel e simples, alinhada ao campo liquidezUsd da spec; profundidade pode ser adicionada depois sem mudar a interface.)
- Intervalo de confianca: normal com 1,96 ou t de Student: Normal com 1,96 e piso AMOSTRA_MINIMA = 30 para o estado medido (Recomendacao da propria spec; sem dependencia nova. Com n de 2 a 29 o IC e calculado mas o estado fica amostra insuficiente.)
- Impacto: guardar em modulo ou com sinal: Modulo (Math.abs) em componentes.impacto (Recomendacao da spec; faz a soma do total corresponder ao caso 1 (0,36 com impacto -0,1).)
- Perna sem liquidez: classe desconhecida ou pela perna disponivel: Classe desconhecida (Recomendacao da spec e evita classificar uma rodada com dado faltante como liquida.)
- Nome do motivo para liquidez ausente: campo_ausente:liquidez (campo liquidezUsd) (Mantem o padrao campo_ausente:<nome> com nomes curtos alinhados aos componentes (taxaPool, impacto, rede, imposto).)
- Ordem de chamadas da cotacao: Sequencial com await: para cada item, para cada tamanho, compra e depois venda (Ordem deterministica exigida pelo caso 14; sem concorrencia, sem risco de ordem trocada.)

## Integracao proposta


## Bloqueios e nao feito

- bloqueio: O worktree nao tem src/okx-market/round-trip.ts nem AGENTS.md, nem o estado do ciclo de pesquisa descrito na spec. A integracao com round-trip.ts (nomes e adaptador real) nao pode ser conferida aqui e depende de a branch certa ser usada em uma fatia futura.
- bloqueio: Nenhuma ligacao a cycle.ts, wire.ts, scheduler.ts, source-ecosystem.ts ou api-budget.ts foi feita, conforme a spec.
- nao feito: Nao houve commit, push nem branch nova. As mudancas estao no worktree, como pedido.
- nao feito: Nao rodei 'bun --no-env-file run typecheck' (script inexistente) nem o teste de round-trip.ts (arquivo inexistente).
- nao feito: Nao ha integracao ao ciclo, nem journal, nem script em scripts/, nem chamada de rede. O modulo nao importa round-trip.ts nem synthetic-round-trip.ts.
- nao feito: Nao foram tocados src/decision-review/** nem arquivos existentes.

## Revisor

Revisao adversarial da fatia S3 (rt-batch.ts e rt-batch.test.ts) no worktree wf_1930517d-e57-56. Os 14 testes passam ao reproduzir (14 pass, 0 fail). O modulo e puro, sem rede, relogio ou aleatoriedade, nao altera arquivos existentes e nao contem caracteres proibidos. Oito criterios de aceitacao foram verificados. Sete estao atendidos. O criterio do typecheck nao pode ser reproduzido aqui (script ausente, sem node_modules). Ha uma ressalva estatistica media no IC para n pequeno (z=1,96 em vez de t). Os demais achados sao de baixa severidade (tamanhos duplicados, liquidez negativa, validacao de item nulo). Veredito: aprovado com ressalvas. Nao ha assunto vedado. Nenhuma edicao foi feita.

Saida dos testes reproduzida pelo revisor:

```
Worktree .claude\worktrees\wf_1930517d-e57-56 (branch worktree-wf_1930517d-e57-56, HEAD b587759, src/okx-market/ untracked com os dois arquivos). Comando: bun --no-env-file test src/okx-market/rt-batch.test.ts -> 14 pass, 0 fail, 81 expect() calls, 46 ms. Typecheck NAO reproduzido: package.json sem script typecheck, sem node_modules, sem tsc global. Grep de caracteres proibidos (middle dot, em dash, en dash) em src/okx-market: 0 ocorrencias. git status: apenas ?? src/okx-market/. Nenhum arquivo existente tocado no worktree.
```

### Conformidade com a spec

- [x] Total da rodada = soma dos quatro componentes de compra e venda; impacto em modulo (casos 1 e 5): Caso 1 reproduzido (0,36 por perna, 0,72 total). Math.abs aplicado ao impacto.
- [x] Componente ausente, cotacao nula, erro e numero nao finito viram desconhecido, nunca zero (casos 2 a 5): Verificado no codigo (lerNumero, legDesconhecida, catch) e nos testes 2 a 5, todos verdes.
- [x] Cada rodada chama a cotacao duas vezes com lado, endereco e tamanho em USD (caso 14): Chamadas sequenciais com await; ordem compra/venda verificada.
- [x] Classe pela menor liquidez entre as pernas; desconhecida se alguma perna sem liquidez (casos 6 e 7): Testes 6 e 7 verdes.
- [x] Resumo com n, media, desvio, IC 95%, desconhecidas e estado; n=0 nao medido, n de 1 a 29 amostra insuficiente (casos 8 a 12): Testes 8 a 12 verdes. Ressalva estatistica: IC com z=1,96 tambem e calculado para n de 2 a 29, onde e anti-conservador (t de Student com df=1 vale 12,7, nao 1,96). Estado fica correto, mas o IC reportado para amostra insuficiente e enganoso.
- [x] Entradas invalidas lancam erro antes de qualquer chamada a cotacao (caso 13): validar roda antes do loop; teste 13 verde. Nao cobre tamanhos duplicados, nem item nulo (vira TypeError, nao o erro de entrada).
- [ ] bun --no-env-file run typecheck sem erro novo nos dois arquivos: Nao reproduzido. O script typecheck nao existe neste worktree e nao ha node_modules. O relato do implementador diz tsc 7.0.2 sem erro, mas nao consegui confirmar sem instalar dependencias, o que nao fiz.
- [x] Nenhum ponto medio, travessao ou meia-risca nos arquivos novos: Grep da ferramenta sem ocorrencias. O comando grep -P do spec falha por locale, como o implementador relatou.

### Achados

- (media) src/okx-market/rt-batch.ts: IC de 95% calculado com z=1,96 tambem para n de 2 a 29 (amostra insuficiente), o que subestima a incerteza em amostras pequenas. | correcao: Para n menor que 30, usar t de Student com n-1 graus de liberdade (ou devolver IC desconhecido enquanto o estado for amostra insuficiente). Ajustar o teste 12, que hoje fixa 0,04 e 3,96 com z=1,96.
- (baixa) src/okx-market/rt-batch.ts: Tamanhos duplicados em input.tamanhos nao sao rejeitados; geram rodadas repetidas que inflam n e tratam medicoes correlacionadas como independentes. | correcao: Validar unicidade de tamanhos em validar() e acrescentar caso de teste no arquivo de teste.
- (baixa) src/okx-market/rt-batch.ts: Liquidez negativa ou zero em liquidezUsd e aceita como numero finito e classificada como raso, sem sinalizar dado invalido. | correcao: Tratar liquidezUsd negativa como campo_ausente (desconhecido) e cobrir com teste de borda.
- (baixa) src/okx-market/rt-batch.ts: Item nulo ou faixas ausentes geram TypeError em vez do erro de entrada invalida, e o teste 13 nao cobre esses casos. | correcao: Checar item e faixas antes de acessar campos, e incluir caso no teste 13.
- (baixa) src/okx-market/rt-batch.test.ts: Typecheck nao reproduzido: script typecheck inexistente e sem node_modules. A criterio de aceitacao do typecheck nao pode ser verificado a partir deste worktree. | correcao: Reexecutar o typecheck no worktree com dependencias instaladas, ou na branch correta que contem round-trip.ts e o script typecheck, antes de aprovar a fatia.
- (baixa) .claude/worktrees/wf_1930517d-e57-56: O worktree esta em b587759 (estado anterior ao ciclo de pesquisa), sem src/okx-market/round-trip.ts, sem AGENTS.md e sem script typecheck. Os nomes alinhados com round-trip.ts nao puderam ser conferidos. | correcao: Confirmar a branch base correta da fatia S3 antes de integrar. O codigo em si nao importa round-trip.ts, conforme a spec.
