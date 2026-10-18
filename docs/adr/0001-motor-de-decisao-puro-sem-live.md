# 0001. Motor de decisão puro, só paper e replay

Status: aceito em 2026-10-17

## Contexto

O baseline de 74,9 h do agente mostrou que a decisão local leva microssegundos, enquanto cotação (p50 1.034 ms), modelo (p50 373 ms) e o executor (84% das falhas por `gas_station_pendente`) concentram o tempo e o desperdício. Misturar decisão, rede e assinatura no mesmo código dificulta medir, testar e impedir envio indevido.

## Decisão

- A decisão fica em `src/decision`, pura: recebe dados já em memória e um relógio injetado, e devolve uma `Decision` com motivos.
- A execução entra por uma `ExecutionPort` que só existe em modo paper ou replay. Não há tipo, ramo nem string de modo live no módulo.
- Aquisição de dados e confirmação on-chain ficam fora do motor e são medidas em etapas separadas de latência.
- O custo de uma operação completa conta duas pernas. Quando o executor falha por causa persistente, um breaker para as tentativas e libera uma sonda por vez.
- Sem trilha de auditoria gravada antes do envio, não há ordem.
- A fronteira é um teste executável, não só texto.

## Consequências

- Experimentos (Auto Research) variam parâmetros e oportunidades sem tocar a produção.
- Ligar o motor ao ciclo de produção exige montar `Opportunity` com `pWin` calibrado e fica para depois da integração da sessão que edita `src/agent/cycle.ts`.
- Liberar live é decisão do dono e exige outra mudança, explícita, fora deste módulo.
- A opção escolhida (duas pernas, breaker com 3 falhas e sonda em 15 minutos) é reversível por configuração. Não houve consenso do Jev: trabalhador não faz chamada paga.
