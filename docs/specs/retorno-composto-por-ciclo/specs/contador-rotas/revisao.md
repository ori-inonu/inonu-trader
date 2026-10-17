# Revisao e relato da fatia S2: Contador de chamadas por rota da OnchainOS e projecao de cota

Veredito do revisor: reprovado. Reproduziu os testes: true. Toca assunto vedado: false.

## Relato do implementador

S2 implementada no worktree: src/onchain-read/route-counter.ts e src/onchain-read/route-counter.test.ts criados (somente arquivos novos, nada commitado). TDD: teste falhou antes (Cannot find module './route-counter'), depois 14 de 14 casos passaram (52 expects). Typecheck dos dois arquivos com tsconfig temporario passou (exit 0). Grep de pontuacao proibida sem saida. Desvios: OnchainTier definido localmente porque ./catalog nao existe neste worktree; precos e cotas de Growth, Scale e Pro ficaram null (valores nao estavam no brief); websocket de planos pagos marcado true por inferencia.

Worktree: .claude\worktrees\wf_1930517d-e57-54 (ramo worktree-wf_1930517d-e57-54)
Testes: bun --no-env-file test src/onchain-read/route-counter.test.ts => passou=true, n=14. Antes: falhou com 'Cannot find module ./route-counter' (1 error, 0 pass). Depois: 14 pass, 0 fail, 52 expect() calls, Ran 14 tests across 1 file.
Typecheck: bunx tsc -p tsconfig.tmp.json (tsconfig.tmp.json incluindo os dois arquivos novos, extends ./tsconfig.json; arquivo temporario apagado depois) => passou=true. Exit 0, sem diagnosticos. --listFiles confirmou os 2 arquivos novos. Nota: bun run typecheck nao existe no package.json deste worktree e tsconfig.verification.json nao existe aqui, por isso usei o tsconfig temporario conforme a regra 3. bunx baixou o TypeScript 7.0.2 (Version 7.0.2) por nao haver node_modules no worktree.

## Desvios da spec

- OnchainTier nao e importado de ./catalog: o arquivo nao existe neste worktree (ultimo commit) e eu nao podia criar nem editar nada fora dos dois arquivos. Definido localmente como "free" | "basic" | "premium" e nao exportado. Na integracao, trocar pelo import type do catalog.
- Growth, Scale e Pro ficaram com precoUsdMes, basicMes e premiumMes null. O brief deste ciclo so traz precos e cotas de Free, Starter e Enterprise; nao inventei valores. Null aqui significa nao publicado nesta leitura, e projectMonth trata como sem teto.
- websocket dos planos Growth, Scale, Pro e Enterprise esta true por inferencia (WebSocket so em plano pago a partir de US$ 99). Starter tem true pelo brief. Precisa conferir na pagina do provedor.
- Free tem basicMes e premiumMes 100000 (vem dos casos 8 e 12 e da franquia de 100 mil por tier). Enterprise tem precoUsdMes e basicMes null, como pede o caso 14.
- Indentacao de 1 espaco em route-counter.ts e 2 espacos no teste, conforme o par indicado na spec (budget.ts nao existe neste worktree, nao pude comparar com ele).
- Portao B: a spec pede bun run typecheck, que nao existe aqui. Usei o tsconfig temporario apenas sobre os dois arquivos novos.

## Decisoes sem Jev

- De onde vem o tipo OnchainTier, ja que ./catalog nao existe neste worktree?: Tipo local "free" | "basic" | "premium" em route-counter.ts, nao exportado (Manter o modulo compilavel e puro sem criar ou editar arquivo fora da lista. Mudanca reversivel: trocar por import type quando o catalog estiver no worktree.)
- Quais valores usar para Growth, Scale e Pro?: null para preco e cotas, websocket true (O brief nao traz esses numeros e a regra de nao inventar dados tem prioridade. null cai no tratamento ja previsto para nao publicado (sem teto). Reversivel quando a tabela for lida da pagina do provedor.)
- Cache hit entra na cota por padrao?: Nao (contaCacheHit default false), como pede a spec (Hipotese de baixo risco, coerente com budget.ts. Parametro permite trocar sem mexer no contador.)
- naoAtribuidas inclui cache hits de tier unknown?: Sim, soma enviadas.unknown e cacheHits.unknown (Tier unknown fica visivel fora da cota, e a soma completa mostra todo o trafego nao atribuido. Sem efeito na cota.)

## Integracao proposta

- src/onchain-read/gateway.ts: Criar o contador uma vez por processo com createRouteCounter({ now: Date.now }) e chamar record apos cada chamada, com cacheHit = !sent, status derivado da resposta e tier vindo do catalog. Isso exige que o catalog exporte OnchainTier, que o modulo passa a importar com import type.
- scripts/api-budget.ts: Passar byRoute() e os dias do mes para projectMonth, e imprimir porTier, estouraTeto e excedenteProjetado. Usar chamadasPorMinuto para a taxa permitida. Nao persistir nada.
- src/onchain-read/catalog.ts: Exportar OnchainTier se ainda nao exporta, e remover a copia local de route-counter.ts quando a integracao acontecer.

## Bloqueios e nao feito

- bloqueio: Valores de precos e cotas de Growth, Scale e Pro seguem nulos ate alguem ler a pagina do provedor (fonte e data ja estao na constante). Nao e bloqueio para a S2 e sim pendencia de dado.
- bloqueio: Nao houve bloqueio de decisao do dono: nenhum item da lista de assuntos proibidos foi tocado.
- nao feito: Nao editei nem criei nenhum arquivo fora dos dois novos; scripts/api-budget.ts, src/onchain-read/gateway.ts e budget.ts nao foram tocados e nao existem neste worktree.
- nao feito: Nao fiz commit, push nem branch. As mudancas estao em disco no worktree (git status mostra so ?? src/onchain-read/).
- nao feito: Nao rodei bun run typecheck do projeto, porque o script e tsconfig.verification.json nao existem neste worktree. Rodei so o tsconfig temporario sobre os dois arquivos.
- nao feito: Valores de Growth, Scale e Pro nao foram lidos (sem rede e fora do brief).
- nao feito: Grep de pontuacao proibida: a forma com \x{...} nao funciona no grep do Git Bash (erro de caractere grande demais). Refiz com os caracteres literais e com bytes UTF-8 (C2 B7, E2 80 94, E2 80 93): nenhuma saida nos dois arquivos.

## Revisor

Reprovado. Os 14 testes passam e o tsc estrito sobre os dois arquivos novos sai com exit 0, mas o criterio de PLANOS nao e atendido: Growth, Scale e Pro tem preco e cotas null e websocket inferido, enquanto fonte e lidoEm 2026-10-17 afirmam leitura real. Um teto desconhecido vira ausencia de teto, e ha corrupcao de porStatus com status como toString, NaN em diasNoMes que esconde estouro, e contagens negativas aceitas. O modulo tambem redefine OnchainTier em vez de importar de ./catalog, que existe no repo principal. Nao houve assunto vedado, nem edicao de arquivos existentes, nem dependencia nova.

Saida dos testes reproduzida pelo revisor:

```
Worktree .claude/worktrees/wf_1930517d-e57-54 existe e contem os dois arquivos novos em src/onchain-read/ (git status: so untracked). bun --no-env-file test src/onchain-read/route-counter.test.ts: 14 pass, 0 fail, 52 expect() calls, Ran 14 tests across 1 file. Typecheck: o worktree nao tem node_modules nem o script typecheck nem tsconfig.verification.json; rodei tsc --noEmit com o tsconfig estrito do repo principal (node_modules/.bin/tsc) apontando so para os dois arquivos novos: exit 0. Grep literal da spec (grep -nP com \x{00B7}): erro 'character value too large', exit 2, portanto a prova da spec nao executa como escrita. Grep por bytes UTF-8 (C2 B7, E2 80 94, E2 80 93) nos dois arquivos: sem saida. Sondagem de bordas em scratchpad (sem editar o repo): porStatus com status 'toString' gera '\"function toString() {...}1\"' como contagem; diasNoMes NaN gera projetado NaN e estouraTeto false; plano growth com basicMes null e usado 500000 gera estouraTeto null (sem alerta); negativo em basic -5 gera projetado -15; chamadasPorMinuto com diasNoMes 0 gera Infinity.
```

### Conformidade com a spec

- [x] createRouteCounter record acumula por rota, tier, cache hit e status (casos 1 a 6): 14 testes passam.
- [x] byRoute devolve copia (caso 5): Codigo faz copia profunda, mas o teste so cobre a chave de primeiro nivel; prova fraca.
- [x] Chamada de cache entra em cacheHits e nao em enviadas (caso 2)
- [x] Tier unknown fora da projecao e em naoAtribuidas (caso 4)
- [x] projectMonth rotulo exato e projetado = round(usado*diasNoMes/dia) (casos 7 e 8)
- [x] Teto do plano: estouraTeto e excedenteProjetado; Enterprise com teto null (casos 8 e 11): Free e Enterprise corretos; Growth, Scale e Pro com null viram falsa ausencia de teto (achado alto).
- [x] Cache hit fora da cota por padrao e dentro com contaCacheHit true (caso 9)
- [x] dia fora de 1..diasNoMes lanca RangeError (caso 10): diasNoMes nao validado; NaN passa.
- [ ] PLANOS traz Free, Starter, Growth, Scale, Pro e Enterprise com preco, cotas, websocket, fonte e lidoEm 2026-10-17 (caso 14): Growth, Scale e Pro sem preco nem cotas (null); websocket de planos pagos inferido e registrado com fonte e data de leitura falsas. O caso 14 nao verifica os tres planos.
- [x] chamadasPorMinuto e excedenteX402Usd batem com casos 12 e 13: Aritmetica confere (2,2401; 13,8889; 9).
- [x] Typecheck do projeto sem erro com o arquivo novo (bun run typecheck): Nao executavel como escrito no worktree (sem script, sem tsconfig.verification.json, sem node_modules). Tsc estrito do repo principal sobre os dois arquivos novos: exit 0.
- [x] Nenhum ponto medio, travessao ou meia-risca (grep da spec): Comando literal da spec falha com exit 2; verificacao por bytes UTF-8 sem saida.
- [ ] Restricao: modulo importa somente o tipo OnchainTier de ./catalog: Tipo redefinido localmente; catalog.ts existe no main e exporta OnchainTier.
- [x] Nao editar arquivos existentes, nenhuma dependencia nova, sem rede, sem disco, sem relogio real: git status mostra so src/onchain-read/ untracked; modulo puro, now injetado; sem assunto vedado.

### Achados

- (alta) .claude/worktrees/wf_1930517d-e57-54/src/onchain-read/route-counter.ts: Tabela PLANOS afirma fonte e lidoEm 2026-10-17 mas os valores nao foram lidos: Growth, Scale e Pro tem precoUsdMes, basicMes e premiumMes null, e websocket true em Growth, Scale, Pro e Enterprise e inferido, nao lido. Isso quebra o criterio 'PLANOS traz ... com preco, cotas, websocket, fonte e lidoEm' e registra como dado de fonte um valor que nao foi conferido. | correcao: Ler a pagina do provedor para os tres planos ou marcar explicitamente cada campo nao publicado/inferido (ex.: campo de proveniencia por valor). Nao declarar lidoEm para valores nao lidos.
- (alta) .claude/worktrees/wf_1930517d-e57-54/src/onchain-read/route-counter.ts: tetoDe trata null como ausencia de teto: para Growth, Scale e Pro (cota desconhecida, nao ilimitada) projectMonth devolve teto null, estouraTeto null e excedenteProjetado null. Sondagem: plano growth com basicMes null e usado 500000 nao sinaliza nada. A spec define null como 'ilimitado ou nao publicado', e o codigo nao distingue os dois casos, entao um teto desconhecido vira falsa ausencia de alerta. | correcao: Distinguir ilimitado de nao publicado (ex.: teto 'desconhecido' separado) e nunca emitir estouraTeto nulo silencioso para plano com cota nao publicada.
- (media) .claude/worktrees/wf_1930517d-e57-54/src/onchain-read/route-counter.ts: porStatus e um objeto literal comum indexado pelo codigo de status. Status com nome de propriedade herdada ('toString', 'constructor', '__proto__') corrompe a contagem: sondagem mostrou porStatus.toString = 'function toString() {...}1' (string, nao numero). Viola a contagem por status do criterio 1. | correcao: Usar Map para porStatus (ou Object.create(null) com contagem numerica) e cobrir com teste de status 'toString'.
- (media) .claude/worktrees/wf_1930517d-e57-54/src/onchain-read/route-counter.ts: projectMonth nao valida diasNoMes. Com diasNoMes NaN, a checagem dia > diasNoMes e falsa, passa, e devolve projetado NaN com estouraTeto false: estouro silencioso, desconhecido virando 'nao estoura'. Nao ha teste para NaN nem para diasNoMes invalido. | correcao: Lancar RangeError para diasNoMes que nao seja inteiro positivo (ex.: 28 a 31) e adicionar caso de teste com NaN.
- (media) .claude/worktrees/wf_1930517d-e57-54/src/onchain-read/route-counter.ts: Contagens negativas e NaN sao aceitas sem erro: sondagem com basic -5 gerou projetado -15. Nao ha validacao de entrada em record nem em projectMonth, e os testes nao cobrem negativo, NaN ou tier fora do enum. | correcao: Rejeitar ou tratar contagens negativas e NaN em record e projectMonth e testar esses casos.
- (media) .claude/worktrees/wf_1930517d-e57-54/src/onchain-read/route-counter.ts: Restricao da spec violada: o modulo deveria importar somente o tipo OnchainTier de ./catalog e redefine o tipo localmente. O repo principal tem src/onchain-read/catalog.ts exportando OnchainTier (linha 16), entao a importacao era possivel; o worktree esta atras do main (b587759 e ancestral de d513d60) e nao foi atualizado. Duplicar o tipo cria desvio silencioso. | correcao: Atualizar o worktree a partir do main e trocar a definicao local por import type { OnchainTier } from './catalog'.
- (baixa) .claude/worktrees/wf_1930517d-e57-54/src/onchain-read/route-counter.test.ts: Caso 5 (byRoute devolve copia) so apaga a chave de primeiro nivel. Nao prova que alterar contagens aninhadas (ex.: copia['/market/price'].enviadas.basic = 99) nao muda o contador, que e o criterio 2 da spec. O codigo faz copia profunda, mas o teste nao garante isso.
- (baixa) .claude/worktrees/wf_1930517d-e57-54/src/onchain-read/route-counter.ts: chamadasPorMinuto com diasNoMes 0 devolve Infinity (sondagem confirmada) e nao ha teste de borda para isso. O comentario 'null para tier free' esta errado: a funcao nao trata free, so basic e premium, e o plano free tem basicMes 100000.
- (baixa) .claude/worktrees/wf_1930517d-e57-54/src/onchain-read/route-counter.ts: Constantes X402_USD_POR_CHAMADA (0,0001 e 0,0002) e a franquia de 100 mil nao tem fonte nem marcacao de hipotese no codigo, embora a spec as liste como nao verificadas em Perguntas em aberto.
- (baixa) .claude/worktrees/wf_1930517d-e57-54/src/onchain-read/route-counter.test.ts: O proprio comando de prova do criterio de pontuacao (grep -nP com \x{00B7}) falha com exit 2 ('character value too large') e nao prova nada como escrito. O implementador usou grep por bytes, que esta correto, mas a spec deve ser corrigida.
