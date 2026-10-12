# Implementação do endurecimento do operador (A-2 a A-15)

Branch work/operator-hardening em C:\Users\gabri\jev-trader-op, criada de final/consolidation e39c669. HEAD a47f5ae, 14 commits, `git status` sem entradas. Nenhum arquivo proibido foi tocado (`git diff --name-only e39c669..HEAD` sem executor.ts, risk-gate.ts, plan.ts, candidates.ts, jev-selector.ts, types.ts, web/ etc.); `operatorLiveGate` e os padrões sem env ficaram iguais. Nada foi enviado, assinado nem rodado com `--live`.

Totais de `bun --no-env-file test --timeout 60000 src/operator scripts/okx-operator.test.ts`: antes 158 pass, 0 fail, 12 arquivos; depois 210 pass, 0 fail, 17 arquivos (5 novos). `bun --no-env-file run typecheck` limpo. Suíte inteira (`bun test --parallel=1 --timeout 15000 ./src ./scripts`): 2902 pass, 2 skip, 2 fail em src/real/public-market.test.ts (react não resolve porque este worktree não tem web/node_modules; sem relação com as mudanças).

## Por tarefa (hash; teste vermelho antes; total antes -> depois)
- A-13 256f5d4. Vermelho por carga sintética (8 laços ociosos e o processo de teste fixados em 1 núcleo, prioridade Idle): arquivo antigo 1 pass, 7 fail, 4 errors em 124,8 s (filhos mortos aos 10 s, exit 143); com 45 s e 120 s, 8 pass em 315 s sob a mesma carga. Com 24 laços nem 45 s bastam (tentativa descartada), então o orçamento tem limite. 158 -> 158.
- A-11 a00dab6. "strict parse ..." estendido (dailyPlans -1: "did not throw"). 158 -> 159.
- A-4 + A-3 c2f6202 (um commit, pois a exceção do A-3 só existe com o A-4). Vermelho: 11 falhas (5 CLI, 5 reconcileLeg/parse, cli-guards sem módulo). 159 -> 171.
- A-9 7726d8a. Vermelho: 3 falhas (config "Invalid OPERATOR_EXIT_WINDOW_MS" não lançava, CLI saía 0). 171 -> 176.
- A-10 6e8b0f8. Vermelho: cli-guards.test.ts sem o export killSwitchPresent e o teste de fiação. 176 -> 179.
- A-12 881b420. Vermelho: http.token.test.ts sem o export tokenMatches. 179 -> 181.
- A-14 5a26588. Vermelho: 2 falhas (padrão undefined; CLI aceitou 30001). 181 -> 183.
- A-5 5c178a5. Vermelho: 8 falhas em cycle.persist.test.ts (arquivo novo). 183 -> 194.
- A-7 064e131. Vermelho: cli-guards.test.ts sem assertOperatorKeyIsDedicated e o teste de ordem. 194 -> 199.
- A-15 63cbe04. Vermelho: o teste da linha ativa de SOLANA_PRIVATE_KEY (os outros 2 são guardas que passam antes e depois). 199 -> 202.
- A-6 70e0302. Os 8 testes novos cobrem R03, R06, R07, R13, R16, R17/R18, R33/R34 e M29. Mutantes aplicados em cópia de rascunho: com os testes antigos 0 de 10 mortos, com os novos 10 de 10, cada um por exatamente o teste novo. 202 -> 210.
- A-8 99308a0. Runbook do lock obsoleto (tasklist, pid, apagar à mão, conferir o ledger, --reconcile). Linhas com "Operator lock present|tasklist": 0 -> 4. Hash após `--amend` só da mensagem.
- A-2 3c64902 e a47f5ae. Script de aceitação com 35 verificações (frase antiga ausente, frase corrigida presente): 35 falham antes, todas ok depois. Bytes E2 80 94, E2 80 93 e C2 B7 nas linhas adicionadas: nenhum. a47f5ae corrige só o comentário de config.ts:7 (mesma frase "20 USD e 4 planos").

## Evidência adicional
- 46 mutantes sobre o meu próprio código (A-11, A-3/A-4, A-9, A-10, A-12, A-14, A-5, A-7, A-15), aplicados numa cópia de rascunho fora do repositório (apagada): 45 mortos. O único sobrevivente é o equivalente por saída de A-12 (trocar timingSafeEqual por `===`); nenhum teste enxerga tempo de execução.
- CLI real (`cli-demo.ts`, só offline, em tmp): sem `--realized` sai 1; 42 USD sai 1; `failed -1.5` registra; repetir sai 1 ("já tem resultado"); `closed` sem valor passa e mantém -1.5.
- Scripts e saídas em scratchpad\op-hardening (under-load.ps1, mutate.py, docs-check.py, mutation-mine.txt, full-suite.txt).

## Desvios, decisões e ambiguidades
1. A-11 "notional ... fracionários": notional fracionário continua válido (o executor grava centavos; rejeitar quebraria o primeiro plano real). Contagens são inteiros >= 0, notional >= 0, planId distinto. Há teste de ida e volta com 4,37 x 2.
2. A-4 recusa QUALQUER segundo valor para o plano, igual ou diferente (a aceitação cita -1,5 duas vezes). Corrigir um valor digitado errado exige editar o ledger à mão. Pernas `failed` lançadas pelo fluxo antigo não têm `realizedUsd`: para fechá-las use `--realized 0` (o valor antigo já está nos totais). Nunca houve execução real, então não há ledger assim.
3. Módulo novo src/operator/cli-guards.ts (+ teste): parseRealizedUsd, killSwitchPresent e assertOperatorKeyIsDedicated. Fica fora do script porque importar o script o executa. O campo opcional `realizedUsd` está em OpenLeg (ledger.ts); types.ts não foi alterado. config.ts: só number()/whole(), decisionTimeoutMs em OperatorConfig (nível superior, não na policy) e um comentário.
4. A-5: `replaceFileBounded(tmp, path, options)` tem o gancho opcional `beforeAttempt`; o ledger passa a checagem de destino, o ledger.persistence.test.ts antigo passa sem mudança. persistCycle só ganhou retry e a ordem journal-antes-do-estado, sem validar o destino.
5. A-10 usa statSync (segue links, como existsSync). No Windows todo caminho estranho testado devolve ENOENT, então EACCES não é provocável pelo CLI: helper por injeção e fiação por teste de texto do fonte.
6. Três testes leem o texto de scripts/okx-operator.ts (fiação de killSwitchPresent, de decisionTimeoutMs e a ordem da checagem da chave), porque `--live` é proibido e o mock responde na hora. É o mesmo tipo do teste de ordem que já existia.
7. A-2: mantive "Tron, Sui, TON e Bitcoin ... dry run" em :51 (a substituição "até o fim da linha" o apagaria e ele é verdadeiro); :86 e :87 ganharam detalhes verdadeiros (limite do perfil quando a variável não existe, flags soltas recusadas, comparação por endereço, arquivo cli-guards.ts); :57 documenta OPERATOR_DECISION_TIMEOUT_MS e a ordem journal/estado; :26 manteve "antes de cada envio" da seção 8 embora o executor confira uma vez por plano, antes do primeiro envio; o .env.example segue em inglês, a língua do arquivo; o checkpoint do CLI-LOCK-SPEC ganhou uma linha "Histórico".
8. Ocorrências antigas de travessão que NÃO toquei (só cabeçalhos eram permitidos): VALUATION-DIAGNOSTICS-SPEC.md 13 e OPERATOR-CLI-LOCK-SPEC.md 1 (título de seção). Um grep de arquivo inteiro nesses dois os acha; nas linhas adicionadas não há nenhum.
9. Um "after" do A-13 com 24 laços falhou (calibração); os números do commit são do ensaio com 8 laços, comparando o arquivo antigo e o novo sob a mesma carga.

## O que ficou de fora
- A-16 e A-17, por instrução.
- R23 e R36 (CLI sintético com gates de env abertos), R21 (coberto pelos testes de A-4) e R32 (equivalente): fora da linha A-6 da revisão. R23/R36 seguem um bom próximo teste.
- Frase antiga "20 USD e 4 planos por dia" ainda em docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md:29, docs/POLITICA-DE-LIMITES.md:184 e src/policy/envelope.test.ts:877 (fora da lista da seção 8 e da fronteira); e a contradição da ROUNDTRIP-AMOUNT-SPEC com a correção C1.
- Nada do que a revisão classifica como B ou C.

## Pontos para o revisor olhar com atenção
- ledger.ts `reconcileLeg`: um único `persist(next)` e memória trocada só depois; recusa de perna fechada, de valor repetido e de chamada sem valor numa perna sem resultado.
- parseLedger mais estrito (planId repetido, contagens e notional negativos) fecha em falha um ledger que tenha esses dados; os dados do executor não os produzem.
- `--reconcile` sem `--realized` volta a sair 1 (reverte 4007541) e `--realized`/`--accept-history` soltos agora saem 1.
- Sete configurações passam a recusar fração já no carregamento (antes recusava a cada ciclo em validateOperatorPolicy).
- cycle.ts: o journal agora é escrito antes de trocar latest.json; em falha persistente o journal tem a linha e o estado fica antigo.
- Testes de leitura de texto do fonte (item 6) e o fato de a checagem de chave (A-7) só valer no mesmo ambiente.
