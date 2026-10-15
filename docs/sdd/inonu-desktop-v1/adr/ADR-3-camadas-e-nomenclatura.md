# ADR-3 Camadas: coletar barato, calcular localmente, só então chamar o modelo; nomenclatura Inonu e Jev

Estado: proposta. Requisitos: ING-1 a ING-4, FLX-*, SMT-*, ASK-1 a ASK-11, D-U1, D-U2, U10, U11, U12, U16. Evidência: SPEC 2.1 F9, F10, F16.

## Contexto

Hoje o `jev-read --jev` chamaria o modelo cerca de 4 vezes por minuto (`scripts/jev-read.ts:173-193`, com teto de 2000 leituras pagas em 24 h), o `System One` roda a cada 60 s e a taxa de mensagens de WebSocket não é medida. Na mesa OKX nunca houve leitura com decisão (3413 leituras e 630 ciclos com `decision: null`); o custo do modelo foi medido uma só vez, no trader Kuru: 3 decisões por US$ 0,000142 (cerca de US$ 0,00005 cada, prompt do Kuru). O usuário não quer o modelo "aberto" recebendo milhares de dados por segundo; quer algoritmos que transformem dados em informação estruturada e uma consulta **sob demanda** (D-U2, escopo só da mesa OKX).

## Decisão

```
L0 Coletores      OKX v5 público (WebSocket gratuito) + OnchainOS REST (governador de orçamento) + carteira conectada (leitura)
L1 Motor TS       funções puras e vetorizadas: fluxo (footprint), zonas, trilha do dinheiro esperto, regime
L2 Evidence Brief JSON compacto (até 2 KB por instrumento ou token), origem e idade por campo, hash; só muda quando algo material muda
L3 Pedir ao Inonu ÚNICA porta para o modelo: POST /inonu/ask (single-flight, cooldown, teto por pedido e por dia, razão registrada); o modelo responde {action, candidateId}
L4 Apresentação   marcadores de decisão no gráfico, zonas, filtros de sinal, Rastreador, alertas locais (sem modelo)
```

Regras:

- O modelo nunca recebe tick bruto (ING-1). Ticks e livro viram barras de 1 s, 5 s e 1 min por tempo do evento; o motor só recalcula na barra fechada; o Brief só é regerado se algum fator cruzar limiar material (ING-2).
- Em segundo plano **nenhuma** chamada ao modelo por padrão (ASK-1). O núcleo inicia `jev-read` apenas em `--observe`. Alertas de fluxo são algorítmicos e só oferecem o botão "Pedir ao Inonu".
- Os candidatos são **neutros** (id, limites, nota, fatores, idade, estado; sem lado de ordem) e gerados por código (zonas, tokens on-chain, spot, perpétuos). **É o modelo quem decide a ação** (buy, sell ou hold) e escolhe um `candidateId` desse conjunto (ASK-4); o código nunca converte o lado de uma zona em ação (regra do `CLAUDE.md`: é o modelo, e não o código, quem decide buy ou sell). Resposta fora dos ids é descartada; texto livre nunca vira instrução nem número.
- Todo valor desconhecido é `null` com motivo; sintético, atrasado ou indisponível nunca aparece como ao vivo.
- O envelope da resposta mantém `advisory: true` e `execution: "never"` (ASK-11).
- O motor é TypeScript novo em `src/intel/**`. O pacote Python (`python/jev_analytics`) permanece opcional e passa a ser o oráculo de vetores dos indicadores que ele já cobre; o motor novo não depende de Python (WIN-9).
- Ledger real de chamadas, tokens, USD e latência (ASK-6): é a única forma de afirmar redução de consumo.

**Nomenclatura (decisão do usuário, D-U1).** Na interface o assistente é o **Inonu**: "Pedir ao Inonu", "Perguntar ao Inonu", "Inonu respondeu ha 2 min". **Jev é apenas o modelo** atrás da inteligência e aparece só como proveniência ("modelo: Jev" no cartão e no ledger). Nomes internos de código com "jev" (`src/jev-read`, `JEV_*`, `jev-read`) **não são renomeados**, para não colidir com sessões concorrentes nem quebrar contratos com `schemaVersion`. A rota nova é `/inonu/ask`. Isso não muda a regra do `CLAUDE.md` de que é o modelo, e não o código, que decide.

A linha legada "System One, alavancagem em MON-USDT-SWAP: Jev nao consultado, nenhum candidato elegivel" (`web/src/lib/mesa/mesa-model.ts:359-367`; instrumento fixo em `src/system-one/readings.ts:18`) é substituída por um estado do pedido; a trilha de alavancagem passa a ser uma **família de candidatos de perpétuos**, não o cabeçalho.

## Alternativas

| Opção | Por que não |
| --- | --- |
| Manter o `jev-read --jev` contínuo | 240 chamadas por hora sem decisão do usuário; custo desconhecido; contraria U10 |
| Dar ao modelo os dados brutos para "aprender" o fluxo | Milhares de eventos por segundo; sem controle de custo; resposta não reproduzível |
| Alertas que chamam o modelo | Cria consumo em segundo plano; os alertas são locais e só oferecem o botão |
| Reescrever tudo em Python | Dependência de Python no destino (WIN-9) |

## Consequências

- O motor é testável por vetores e determinístico; o modelo é a última camada.
- Aplicar o sob demanda ao trader Kuru **não** faz parte desta decisão (D-U2). Esse trader, a "mensagem central" do `CLAUDE.md` e o commit `b587759` vêm do upstream `jarrodwatts/jev-trader`; removê-los é decisão separada.
- A taxa de WebSocket da OKX é medida pela primeira vez em T5.1; o dimensionamento atual é uma estimativa de 3,4 mensagens por segundo "necessárias" (`docs/research/spec-review-20261012/spec-review-feed-bounded-recovery.md:43`), não uma medição.
