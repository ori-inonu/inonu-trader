# Spec: motor de decisão local e orçamento de API do OnchainOS (GOAL 1)

Status: em implementação (incrementos 1 a 4 entregues na branch `goal1/motor-decisao-onchainos`; integração ao ciclo de produção pendente)
Dono: a aprovação de qualquer envio de ordem real é do dono. Este módulo não envia.

## Contexto

O agente autônomo decide a cada ciclo com o Jev e executa pela carteira. O baseline medido sobre 74,9 h de journal real (2026-10-14 a 2026-10-17) mostra onde o tempo e as chamadas vão:

- 2.335 ciclos, 1.531 ordens preparadas, 27 executadas (1,8%).
- Desde 2026-10-15 18:38 UTC toda tentativa de ordem, de compra e de venda, falha com `gas_station_pendente` (1.187 falhas, 84% de todas as falhas) e nenhuma execução ocorreu depois. A causa é de configuração da carteira e só o dono a resolve.
- Latências: modelo p50 373 ms (p95 507, p99 905); cotação p50 1.034 ms (p95 1.854, p99 2.238); intervalo entre ciclos p50 49,7 s. A decisão local pura leva microssegundos e não é o gargalo.
- API: Basic 14.763 de 100.000 no mês, ritmo de 3.810 por dia (cabe em outubro, estoura em mês cheio); Premium 6.292 de 100.000. O journal não registra erros HTTP por rota nem uso por endpoint.

## Metas

- Decidir em memória, sem I/O, com `NAO_OPERAR` como resultado explícito e com o motivo de cada recusa.
- Contar o custo de uma operação completa (duas pernas) antes de qualquer ordem.
- Orçar as chamadas de API por pool, com persistência entre processos, sem nunca pagar nem rotacionar chave.
- Parar de insistir quando o executor está indisponível por motivo que só uma pessoa resolve.
- Medir latência por etapa separadamente e reconciliar custo esperado contra custo cobrado.

## Não metas

- Enviar ordens reais, assinar, transmitir ou liberar live. O modo live não existe no módulo.
- Provar lucro. Nenhum número desta spec é lucro; as execuções reais são poucas e a janela é curta.
- Mexer em `src/agent/*` enquanto a sessão Auto Research edita `cycle.ts`, `model.ts`, `wire.ts` e `entry-cost.ts`.

## Contratos

### Fronteira entre motor, produção e experimentação

| Lado | Pode | Não pode |
|---|---|---|
| `src/decision/*` (motor) | Receber `Opportunity`, `Portfolio`, `Limits`, relógio injetado; devolver `Decision`; falar com uma `ExecutionPort` paper ou replay | Rede, disco (exceto `log.ts`), variável de ambiente, assinatura, modo live, importar `src/agent`, conectores OKX ou carteira |
| Produção (`src/agent`, `src/onchain-read`) | Chamar o motor com oportunidades montadas dos seus dados; usar `ExecutorHealth` e o orçamento de API | Mudar o motor por dentro |
| Experimentação (Auto Research) | Variar `Limits`, `Costs`, `HealthConfig` e as oportunidades de entrada; rodar em worktree próprio | Importar estado de produção, escrever no ledger real, ligar a porta a algo que não seja paper ou replay |

O teste `src/decision/boundary.test.ts` verifica a fronteira no código-fonte: importações permitidas, ausência de rede, de processo filho, de ambiente, de caminho de assinatura ou transmissão, de `"live"` em código e de relógio de parede fora do runner.

### Peças

- `src/decision/pipeline.ts`: filtro (dado inválido, executor, risco, cotação velha, liquidez, slippage, gas, saldo de gas, correlação), edge líquido, tamanho por Kelly fracionado, controles de portfólio. Para na primeira etapa com motivo. Oportunidade, carteira ou limites com número não finito ou fora do domínio são recusados com `bad_data` antes de qualquer conta. Quem fecha uma posição (venda com `legs: 1`) é redução de risco: sai por inteiro até o teto de liquidez, sem os limites de exposição, perda do dia, drawdown nem correlação, mas continua sujeito a risco do token, cotação válida, saldo de gas e executor disponível.
- `src/decision/edge.ts`: custo por perna pago `legs` vezes (padrão 2), spread cheio uma vez, saída uma vez; `requiredPWin` resolve a probabilidade mínima para o alvo.
- `src/decision/runner.ts`: decide, admite (breaker, idempotência, limites), pede autorização ao executor, grava a decisão antes de enviar (o log é obrigatório e, sem trilha de auditoria, não há ordem), serializa os passos para o nonce e o portfólio não intercalarem, envia, atualiza breakers e reconcilia o custo da perna de entrada.
- `src/decision/paper-port.ts`: porta paper e replay que nunca lança: idempotente por id, nonce sequencial consumido por qualquer desfecho em sequência (preenchida, recusada ou falha), preço-limite, PnL realizado líquido de taxa e gas.
- `src/decision/executor-health.ts`: abre após 3 falhas persistentes iguais, libera uma sonda por vez depois de 15 min, dobrando até 4 h.
- `src/decision/telemetry.ts`: latência por etapa (`dados`, `decisao_local`, `cotacao`, `submissao`, `assinatura`, `inclusao`, `finalizacao`); etapa sem amostra aparece como não medida, nunca como zero.
- `src/api-budget/*`: registry por módulo, endpoint, chave (nome da variável), cadeia, pool; tetos por minuto, hora e dia separados da franquia mensal; reserva de 20% para execução e segurança; cache com TTL e invalidação; coalescing; backoff com jitter e Retry-After no 429; bloqueio até o mês seguinte no 402; pacing adaptativo; contagem por endpoint; batcher (desligado até o limite de lote ser conhecido).

## Limites verificados (fonte primária, lida em 2026-10-17)

| Item | Valor | Fonte |
|---|---|---|
| Market, plano Free | 100 mil chamadas Basic e 100 mil Premium por mês, sem WebSocket | `web3.okx.com/onchainos/dev-docs/market/market-api-fee` |
| Cotas dos planos pagos | Starter 2M e 600K, Growth 5M e 2M, Scale 20M e 10M, Pro 50M e 20M | mesma página |
| Reset das cotas | dia 1 de cada mês | mesma página |
| Market, RPS e RPM | não publicados | mesma página |
| 429 | não descrito na página | mesma página |
| 402 | existe no fluxo de pagamento por chamada (x402), que o app nunca assina | mesma página |
| Trade, Trial | 1 RPS, até 5 sob aprovação, 60 dias da criação da chave | `web3.okx.com/onchainos/dev-docs/trade/api-fee` |
| Preço em lote | corpo em lista, sem declarar vários tokens nem o máximo | `.../market/market-price` |
| Plano real da chave do dono | não verificado: o portal exige login | bloqueio do dono |

## Medidas antes e depois

| Medida | Antes (real ou parcial) | Depois |
|---|---|---|
| Decisão local p95 | 0,003 ms (dimensionamento anterior, parcial, não equivalente) | 0,005 ms no pipeline completo, 398 mil por segundo; 0,068 ms com controles no runner (alvo: 80 ms) |
| Tentativas de ordem no bloqueio de ambiente | 1.438 em 70,5 h | 57 (10 sondas) na simulação sobre o ledger real: 96% evitadas, 0 execuções bem-sucedidas barradas |
| Chamadas por endpoint | só total por faixa | contagem por endpoint, dia e mês, no ledger compartilhado |
| 402 e 429 | em memória, perdidos no reinício | persistidos no ledger, com jitter e Retry-After |
| Custo de uma operação | uma perna somada uma vez | duas pernas, spread uma vez, saída uma vez |
| Dado inválido | passava a conta | recusado com `bad_data` |

O "antes" da decisão local mede só o dimensionamento antigo (`src/opportunity/sizing.ts`); o ciclo completo faz I/O e não é isolável. A comparação não é de equivalência funcional.

## A hipótese de 0,3% líquido por operação

Resultado de `bun --no-env-file scripts/edge-hypothesis.ts` sobre o baseline:

- Cadência de 80 a 100 ms: inviável no plano atual. Exige 11,1 requisições por segundo e 960 mil por dia; o teto de trade é 1 por segundo e a franquia Basic comporta 3.226 por dia (298 vezes menos). Cotação mais modelo levam 1.407 ms por decisão.
- 0,3% líquido por operação seletiva: não demonstrado. O impacto de preço cotado na entrada tem mediana de 0,23% por perna (46 bps em duas pernas, contra o alvo de 30 bps, antes de taxa do DEX, gas e MEV); só 37% das cotações cabem em até 0,15% por perna. Das 7 vendas reais pareadas, nenhuma teve ganho (retorno agregado de -0,41% sobre US$ 78, antes da taxa de rede). As 12 compras do modelo tiveram retorno médio de -122 bps em 15 minutos.
- Com custo de duas pernas de 46 bps e movimentos simétricos de 100 bps, a taxa de acerto exigida para 30 bps líquidos é de 88%.

Conclusão operacional: o padrão correto do motor é `NAO_OPERAR`, e uma operação só passa com edge líquido positivo comprovado depois dos custos.

## Critérios de aceitação

- [x] `bun run typecheck` limpo.
- [x] `bun run test` sem falhas (ver o relatório de verificação no fim do trabalho).
- [x] `bun --no-env-file test src/decision/boundary.test.ts`: o motor não tem rede, assinatura nem live.
- [x] `bun --no-env-file scripts/baseline-audit.ts` gera `data/bench/baseline-audit.json` sem mint, assinatura, endereço nem id de ciclo.
- [x] `bun --no-env-file scripts/simulate-executor-health.ts` mostra 0 sucessos barrados.
- [x] `bun run api:budget` lista tetos, franquia e consumo por pool.
- [ ] Integração do `ExecutorHealth` e do motor ao ciclo de produção (`src/agent/cycle.ts`), depois que a sessão Auto Research integrar o seu trabalho.

## Restrições

- Sem dinheiro real, sem segredos em arquivos, sem chamada paga ao Jev por trabalhador. Nenhum consenso do Jev foi executado: a decisão de design (duas pernas e breaker com 3 falhas) foi planejada (13 chamadas, cerca de 11 mil tokens de entrada) e escolhida como a opção mais reversível, tudo por configuração.
- O ledger de api-budget fica em `<dados do app>/onchain/api-budget-ledger.json` nos três pontos de produção (desktop, nuvem e servidor local); fora deles, o padrão é o diretório git comum, com `data/` do diretório atual quando não há git. Nos testes ele é isolado por processo (`JEV_API_BUDGET_LEDGER`). Ledger corrompido é posto de lado em `.corrupt` e o orçamento recomeça.

## Bloqueios que dependem do dono

- Concluir o setup do Gas Station da carteira: sem isso nenhuma ordem, de compra ou de venda, sai.
- Conferir no portal o plano real das chaves Trade e Market e a data de criação da chave Trade. Com `JEV_OKX_PLAN` e `JEV_OKX_KEY_CREATED_AT` o registry passa a usar esses valores. Se a chave Trade já saiu do Trial, não defina `JEV_OKX_KEY_CREATED_AT`: passados 60 dias o registry nega as cotações como pagamento exigido.
- Qualquer elevação de plano, uso de pagamento por chamada ou ligação do live.

## Revisão independente

Um revisor sem acesso à minha conclusão leu o código crítico e achou defeitos reais, todos corrigidos com teste: nonce da porta e do runner que se desalinhavam para sempre depois de uma recusa; carteira ou limites com `NaN` que desligavam limites e davam tamanho `NaN`; posição acima do limite que não podia ser fechada; pacer que contava falha devolvida como sucesso; `readLedger` que perdia a contagem por endpoint; erro de leitura que apagava o ledger; corridas na trava do ledger; status das compras que ignorava os dados; projeção que ignorava dias sem chamada; bloqueio 402 global. Aceito sem correção: uma chamada sem credencial ainda ocupa um slot do orçamento (impacto desprezível).

## Próximas ações

1. Montar `Opportunity` a partir de candidato e cotação reais, calibrando `pWin` com o histórico do scoreboard antes de alimentar o motor.
2. Ligar `ExecutorHealth.peek` e `allow` ao ciclo, quando `cycle.ts` estiver livre.
3. Medir o limite de lote do endpoint de preço com uma sonda e só então subir `maxSize` do batcher.
4. Reunir pelo menos 30 vendas pareadas antes de qualquer conclusão sobre retorno realizado.

## Status

- Fase atual: implement
- Verificação: ver o relatório final da sessão.
