# Glossário

Termos do motor de decisão e do orçamento de API. Fonte: `docs/specs/motor-decisao-onchainos/spec.md`.

- **NAO_OPERAR**: resultado explícito do motor. É o padrão; uma ordem só sai com edge líquido positivo depois dos custos. Toda recusa carrega ao menos um motivo diferente de `ok`.
- **Perna**: uma execução de compra ou de venda. Uma operação completa tem duas pernas (`legs: 2`); quem apenas fecha uma posição aberta tem uma (`legs: 1`).
- **Edge líquido**: probabilidade de acerto vezes o ganho, menos a probabilidade de erro vezes a perda, menos o custo das pernas, em pontos-base (bps) do valor negociado. 1 bp é 0,01%.
- **Reconciliação**: comparação do custo da perna de entrada que a decisão supôs com o que a execução cobrou.
- **Paper e replay**: os dois únicos modos da porta de execução. Nenhum assina, transmite ou usa carteira.
- **Pool (orçamento)**: grupo de endpoints que dividem uma mesma franquia, como o provedor conta. Exemplo: todos os endpoints Basic dividem 100 mil chamadas por mês.
- **Franquia mensal**: cota do plano do provedor, separada dos tetos por minuto, hora e dia.
- **Executor indisponível**: estado do breaker de executor depois de falhas persistentes iguais, por exemplo `gas_station_pendente`. Só uma pessoa resolve a causa; o motor para de tentar e libera uma sonda por vez.
- **Sonda**: a única tentativa permitida enquanto o breaker de executor está aberto, depois da espera. Se funciona, o breaker fecha.
- **Fronteira do motor**: contrato verificado por `src/decision/boundary.test.ts`: o motor não tem rede, disco (exceto o log), assinatura, live nem importação da produção.
