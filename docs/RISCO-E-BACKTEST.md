# Risco, resultado medido e melhoria da decisão

Não foi demonstrada vantagem lucrativa. Corrigimos custos zerados, inventário sem financiamento e execução indevida de hold; acrescentamos filtro econômico antes de consumir Jev/cotar. Crescimento constante da banca continua uma hipótese, não garantia.

## Resultado observado

Captura **real-market-paper**, modelo **mock**, início do diário 2026-10-09T16:23:16.974Z, resumo concluído em 2026-10-09T16:26:17.058Z, duração observada 179571 ms. Diário evidence/readiness-20261009.jsonl, SHA-256 66ce7653c74c5d2cf0a935bf1381b162a8c6cdb7e4df6fba62d5c88d6e15576c.

| Métrica | Resultado |
|---|---:|
| Capital fictício inicial/final | US$100 / US$99,99630858 |
| Lucro líquido | **−US$0,00369142** |
| Retorno | **−0,00369142%** |
| Máximo drawdown | US$0,00828658 / 0,00828632% |
| Blocos / decisões / cotações | 194 / 6 / 3 |
| Fills | 1, venda parcial de 29,7290306887 MON |
| Giro executado | US$0,73293952 |
| Gas simulado | 0,1071 MON / US$0,00263869 |
| Maker / Jev | US$0 / US$0 |

Gas estimado por limite 350000 e preço RPC; nenhuma transação assinada. Maker bruto zero observado nesse instante; mock não usa API Jev. Os 200 MON iniciais já integram a banca e sua variação entra no resultado, inclusive sem trade. Caixa não é somado outra vez. Não há empréstimo ou venda descoberta.

```powershell
& C:/Users/gabri/.bun/bin/bun.exe run backtest --journal docs/evidence/readiness-20261009.jsonl
```

O [JSON do replay](evidence/backtest-20261009.json) e [resumo da captura](evidence/capture-20261009.json) preservam precisão. Trata-se de replay contábil do diário, não backtest de toda a história nem previsão diária/semanal. Prints atravessando preço podem contar como fill sem prioridade real na fila. Competição, seleção adversa, atrasos, slippage, conversão BRL, transferências e impostos não foram medidos: execução pode estar superestimada e custos subestimados.

A captura é **anterior ao filtro econômico** e foi preservada sem reinterpretação favorável. Testes sintéticos provam regras de software, não ganho. Railway foi observado separadamente em dry-run, carteira ausente e zero decisões/trades. Seus mil registros esparsos de holds/atrasos não sustentam histórico lucrativo.

Uma segunda captura, **após o filtro econômico**, terminou em 2026-10-09T16:53:40.632Z: 44835 ms, 49 blocos, 2 decisões, 1 cotação, nenhum fill. No [replay novo](evidence/economic-gate-backtest-20261009.json), US$100 terminaram em US$99,99321659: **−US$0,00678341 / −0,00678341%**, gas US$0,00088341 e drawdown máximo US$0,00728341. Parte da perda é marcação dos 200 MON iniciais. O [diário novo](evidence/economic-gate-20261009.jsonl) tem SHA-256 3b95e8cba0104ba1c7565fe6fd1058acec8e28505081fffc3e1cba389a7016a7. As duas janelas são curtas e diferentes; não constituem comparação causal ou ganho demonstrado do filtro. Ambos os resultados foram negativos e usam mock, não Jev real.

Após corrigir a remoção de ordens durante intervalos/blocos concorrentes e a parada imediata ao cruzar gastos, a terceira captura terminou em 2026-10-09T17:06:48.731Z. Foram 44390 ms, 46 blocos, 2 decisões, 1 cotação e **zero fills/giro**. O [replay da versão corrigida](evidence/lifecycle-final-backtest-20261009.json) marcou US$100 em US$100,01992117: **+US$0,01992117 / +0,01992117%**, gas US$0,00087883 e drawdown US$0,0029. O ganho veio exclusivamente da valorização dos 200 MON iniciais, menos gas; não houve lucro realizado por trade nem evidência de inteligência lucrativa. O [diário](evidence/lifecycle-final-20261009.jsonl) tem SHA-256 b48ce5e8c926a2eb13efea06434b32d9b92aa1df489062425a5bca823d18613c. Os três resultados foram preservados; nenhuma janela foi selecionada para prometer retorno.

## Custos da frequência

Diagnóstico 2026-10-09T16:22:41Z: MON mid US$0,0246765, gas 102 gwei, limite 350000 → 0,0357 MON ≈ US$0,00088095105/cotação. [Monad cobra sobre o limite](https://docs.monad.xyz/developer-essentials/gas-pricing). Hipoteticamente a cada 300 ms são 288000 transações/dia: **US$253,71/dia de gas** nesse preço. A cada 100 blocos seriam aproximadamente 2880/dia: **US$2,54/dia**, antes de Jev, maker e cancelamentos. São máximos aritméticos, não previsão: filtros e limites reduzem operações.

Com 200 MON e duas cotações, só gas exige spread US$0,00000880951/MON, cerca de 3,57 bps nesse mid. O filtro exige spread hipotético entre dois preços maior que dois gases, maker dos dois lados, uma provisão de inferência e MIN_NET_EDGE_USD. Presume dois fills completos no mesmo livro: não estima probabilidade de lucro. Duas inferências ou cancelamentos extras custam mais que a provisão.

## R$400 para R$4000

Exige **+900%**. Em sete dias, **+38,9495% líquido por dia composto**, sem perdas. Não há evidência desse potencial aqui. Alavancagem aumenta ganhos e perdas; a [CVM explica os riscos](https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/derivativos/riscos). O projeto é spot com ativos depositados, não futuros/perpétuos/crédito. “Margem” Kuru não significa empréstimo. Derivativos exigiriam outra integração e qualificação.

Limites de sessão são proteções de software: preço pode saltar, cobrança/gas podem cruzar teto, cancelamento falhar e posição continuar exposta. Em paper, ordens suprimidas são removidas. Live está bloqueado para não chamar essa proteção de comprovada.

## Melhoria contínua verificável

Separar sinais, decisão Jev, gates determinísticos, execução e contabilidade torna cada mudança testável. Jev pode escolher hold; scores não são calibrados. Mais raciocínio ou outro prompt não demonstra vantagem de mercado.

Próximo ciclo: congelar modelo/prompt/parâmetros e coletar janelas novas com hashes. Comparar resultado líquido com caixa, manutenção da mesma exposição inicial e maker simples; reservar períodos sem ajuste para avaliação fora da amostra. Medir retorno, drawdown, fills, custos, exposição, perdas após fills e atrasos. Rejeitar melhora restrita aos dados usados no ajuste. Testar spreads/gas/taxas piores. Só evidência independente com reconciliação sustenta ampliar exposição.

Capture permite sessões delimitadas até 3600 segundos. Nenhum agendamento ou executor após fechamento foi criado. Melhoria contínua útil mantém versões comparáveis; não aumenta lote para perseguir meta de lucro.
