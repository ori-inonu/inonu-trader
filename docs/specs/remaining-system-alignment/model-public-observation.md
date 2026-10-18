# Observacao real do adaptador Jev com dados publicos

Escopo: cinco consultas do adaptador de producao createJevAgentModel, sobre leituras publicas novas de BTC-USDT-SWAP. Candidato baseado em e3759fe, com a coorte literal de exports aplicada. O adaptador, o gerador de perguntas e o coletor sao os existentes; nenhum executor, assinatura, conta ou leitura de carteira foi importado pelo observador.

## Procedimento observado

As variaveis TYPESAFE_API_KEY e TYPESAFE_AI_API_KEY ja estavam presentes no processo. A verificacao de presenca nao exibiu os valores. O adaptador recebeu a credencial pelo getter existente e o SDK recebeu um fetch observador que permite somente POST em https://api.typesafe.ai/v1/systemone. Nenhum .env, vault, arquivo DPAPI ou configuracao de autenticacao foi lido ou alterado.

Cada consulta foi precedida de coleta publica real, validada como ready e ainda vigente. O Brief de producao recebeu preco de mark, funding e idade da observacao. Carteira e inventario nao foram consultados: total, valor e caixa ficaram desconhecidos, e o aviso da sonda explicou que zero entradas fornecidas nao equivale a um saldo de conta observado. Nenhum candidato de compra ou venda foi fornecido. As perguntas de postura e mandato permaneceram as de producao e seus resultados foram somente registrados, nunca aplicados.

O observador nao substituiu a avaliacao por respostas falsas. As cinco saidas vieram do SDK real e passaram pela validacao do adaptador. A instrumentacao guardou apenas destino, metodo, status, duracao, escolhas validadas, tokens reportados e dados publicos. Erros brutos e cabecalhos nao sao persistidos.

## Resultado

| Medida | Observado |
| --- | --- |
| Consultas previstas e validadas | 5 / 5 |
| Requisicoes HTTP ao provedor | 5, todas HTTP 200 |
| Postura escolhida | neutra nas cinco consultas |
| Latencia do adaptador p50 | 301,436 ms |
| Latencia p95 e maxima | 373,992 ms |
| Tokens de entrada reportados | 4311 por consulta |
| Tokens de saida reportados | 216 por consulta |
| Fallbacks admitidos | 0 |
| Modelo solicitado | jev-latest |
| Versao efetiva e custo faturado | nao disponibilizados pelo contrato observado, null |
| Configuracao, risco ou estado de carteira alterados | nenhum |

Hash dos cinco modulos observados permaneceu igual antes e depois. Evidencia local: .scratch/agent-public-model-probe-20261018/result.json, com timestamps, status HTTP e SHA-256. O script de observacao fica ignorado na .scratch do candidato; os resultados ficam na .scratch do checkout original. Foi um processo finito, encerrado normalmente.

## Alcance da evidencia

Esta passagem comprova acesso ao provedor, respostas tipadas e latencia em uma amostra pequena de contexto publico. O conector global Jev Engineering continua indisponivel, mas isso nao impediu o uso do adaptador do projeto com o ambiente existente.

Nao foi um ciclo completo da carteira, nao incluiu candidatos operacionais, escolhas de ordens, fills, custos de trading ou retorno. Cinco respostas neutras nesse contexto nao provam como o agente tratara uma oportunidade elegivel. Custo null nao significa gratuito. A implementacao e os testes de fallback continuam separados: esta amostra nao produziu fallback real.

A consulta atual das portas encontrou somente o gateway global em 18471; nao havia backend do agente em 3000/3020 ou frontend em 3001. O painel observado antes mostrava core e analise indisponiveis. A observacao no navegador do agente completo, sua inferencia com contexto operacional e a qualificacao de resultado permanecem pendentes; esta sonda nao as substitui.
