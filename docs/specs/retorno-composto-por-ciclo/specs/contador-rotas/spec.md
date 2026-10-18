# Spec: Contador de chamadas por rota da OnchainOS e projecao de cota (fatia S2)

Status: rascunho
Dono: usuario (gabriel). Decisoes de design de baixo risco ficam com o Jev via duvidas_para_o_jev; o trabalho segue pela opcao mais reversivel.

## Contexto

O plano Free da OnchainOS Market dá 100 mil chamadas Basic e 100 mil Premium por mês, sem WebSocket. Hoje `scripts/api-budget.ts` conta por tier (free, basic, premium) e não sabe de qual rota veio cada chamada, nem quantas foram servidas pelo cache. Com isso não dá para dizer qual rota consome a cota Basic nem se o ritmo atual estoura o teto antes do dia 1 do mês seguinte. A pesquisa do ciclo 1 projetou cerca de 158 mil Basic em 2026-10-17, acima do teto (research.md, linha 57), mas essa projeção veio de uma leitura sem separação por rota.

Esta fatia cria um contador puro, sem rede e sem efeito colateral, que recebe um registro por chamada e produz a contagem por rota e a projecao mensal contra o teto do plano. Ele não liga nada ao gateway nem ao orçamento existente.

## Metas

- Contar chamadas por rota, por tier (free, basic, premium, unknown), separando chamadas enviadas ao provedor de respostas servidas do cache, e por status.
- Projetar o consumo do mês por tier com projecao linear rotulada como "linear de dia parcial", comparando com o teto do plano escolhido.
- Expor a tabela de planos da OnchainOS como constante unica com fonte e data de leitura.
- Calcular chamadas por minuto permitidas por plano (cota dividida pelos minutos do mes).
- Calcular o excedente em USD por x402 como numero informativo, nunca como pagamento.

## Nao metas

- Nao editar `scripts/api-budget.ts`, `src/onchain-read/gateway.ts`, `src/onchain-read/budget.ts` nem qualquer arquivo quente. A integracao e proposta em integracao_proposta e fica para outra fatia.
- Nao pagar, nao assinar x402, nao chamar a rede, nao ler chave.
- Nao decidir se o cache hit conta na cota: fica como parametro (ver Perguntas em aberto).
- Nao persistir contagens em disco nem em journal. Nao tocar data/.
- Nao tocar `src/decision-review/**`.

## Criterios de aceitacao testaveis

- [ ] `createRouteCounter({ now })` existe e `record` acumula por rota, tier, cache hit e status. Prova: `bun --no-env-file test src/onchain-read/route-counter.test.ts` (casos 1 a 6).
- [ ] `byRoute()` devolve cópia: alterar o retorno nao altera o contador. Prova: caso 5 do mesmo arquivo de teste.
- [ ] Chamada servida do cache entra em `cacheHits`, nao em `enviadas`. Prova: caso 2.
- [ ] Tier `unknown` nunca entra na projecao de cota e aparece como `naoAtribuidas`. Prova: caso 4.
- [ ] `projectMonth` devolve rotulo exatamente "linear de dia parcial", projetado = usado * diasNoMes / dia arredondado. Prova: casos 7 e 8.
- [ ] Teto do plano comparado: estouraTeto e excedenteProjetado corretos; Enterprise com teto null. Prova: casos 8 e 11.
- [ ] Cache hit fica fora da cota por padrao e entra com `contaCacheHit: true`. Prova: caso 9.
- [ ] `dia` fora de 1..diasNoMes lanca RangeError. Prova: caso 10.
- [ ] `PLANOS` traz Free, Starter, Growth, Scale, Pro e Enterprise com preco, cotas, websocket, fonte e lidoEm "2026-10-17". Prova: caso 14.
- [ ] `chamadasPorMinuto` e `excedenteX402Usd` batem com a aritmetica dos casos 12 e 13.
- [ ] Typecheck do projeto sem erro com o arquivo novo. Prova: `bun run typecheck`.
- [ ] Nenhum ponto medio, travessao ou meia-risca no codigo, comentarios e textos. Prova: `grep -nP "\x{00B7}|\x{2014}|\x{2013}" src/onchain-read/route-counter.ts src/onchain-read/route-counter.test.ts` sem saida.

## Restricoes

- Sem recursos pagos. Sem dinheiro real. Sem segredos em arquivos. Sem chamada de rede.
- Modulo puro: importa somente o tipo `OnchainTier` de `./catalog` (import type, apagado em tempo de execucao). Nao importa o gateway nem o cliente.
- Estilo: `src/onchain-read/budget.ts` usa indentacao de 1 espaco; `budget.test.ts` usa 2 espacos e `bun:test`. A fatia segue o mesmo par.
- Plano `Free` tem cotas Basic e Premium; o tier `free` (sem cota publicada) nao tem teto.
- O x402 e informativo: `excedenteX402Usd` nao aciona pagamento e nao e lido por nenhum outro modulo.

## Perguntas em aberto

- Cache hit conta na cota? Hipotese padrao: nao conta (parametro `contaCacheHit` default false), coerente com `budget.ts` ("cache hits are free"). A confirmar com a pagina do provedor ou com dado real antes de qualquer decisao de custo.
- Franquia x402 de 100 mil por tier por mes e a mesma do Free? O calculo de excedente usa 100 mil como franquia. Hipotese, nao verificada na pagina.
- `projectMonth` recebe tambem `plano` (o contrato pedido nao o inclui, mas sem ele nao ha comparacao com o teto). Decisao de contrato registrada em duvidas.

## Status

- Fase atual: spec
- Aprovado em: pendente (rascunho do especificador)
