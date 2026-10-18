# Arquitetura de dados em tempo real, velocidade de decisão e execução

Data: 2026-10-17. Pesquisa; nada aqui foi implementado. Contratos que seguem valendo: o Jev decide, o código valida e executa planos que o modelo abriu; o código nunca converte um `skip` do Jev em compra; um broadcast não é execução confirmada; ordens pendentes não se duplicam; a zona `src/decision-review/**` é do Codex e `src/decision-review/evolution/**` não se toca. Fontes: [evidence/](evidence/) (tópicos t06, t07, t08 e lacuna g3) e [ADENDO-E](../../sdd/agente-autonomo/ADENDO-E-velocidade-amplitude-execucao-armada.md).

## 1. Camadas

1. **Ingestão.** (a) WebSocket público da bolsa OKX: tickers, trades, books5 (e `bbo-tbt` e `trades-all`, a validar sem VIP). (b) Estado de pools Solana por RPC para o conjunto negociado. (c) OnchainOS REST só para decisão e execução: cotação final, `swap`, risco do candidato escolhido e enriquecimento Premium de poucos candidatos.
2. **Normalização com identidade.** Cada fato diz venue, instrumento, tipo de mercado, fonte, unidades, instante de origem (relógio da bolsa, não o da máquina), instante de recebimento local, geração da conexão, qualidade da série e hash. Já existe em `src/pulse/facts.ts`; um ticker de CEX não é um token Solana e não tem cadeia nem endereço. Reler o fato não o rejuvenesce.
3. **Estado em memória.** Anéis de barras por ativo (1 s e 1 min), último preço, volume, fluxo do agressor, desequilíbrio do book, liquidez. Estimativa (não medida): 120 barras de 1 s x 6 campos de 8 bytes = 5,8 KB mais 60 barras de 1 min = 2,9 KB, cerca de 8,6 KB por ativo, ou cerca de 43 MB para 5 mil ativos e cerca de 430 MB para 50 mil.
4. **Motor de materialidade.** Evento quando o movimento de 5 min passa de K vezes a volatilidade normal do próprio mercado (K=3 por padrão), uma vez por direção dentro de um cooldown de 5 min (`createMateriality` em `facts.ts`). Cada evento aponta o hash do fato de origem; o evento só conta como **consumido** quando esse hash entrou no Brief realmente consultado.
5. **Montagem do Brief.** Snapshot de base mais eventos materiais, top N por candidato, com idade de cada fato. O padrão do Brief é de 2048 bytes por objeto (`src/intel/brief.ts:16`, sobrescrevível); o prompt inteiro é maior (cerca de 11 KB e 13,8 a 15,6 mil tokens nos registros).
6. **Decisão.** Jev por relógio (base de conciliação) e por evento; no futuro, perguntas curtas em paralelo (E5), só depois de medir ganho por token.
7. **Execução.** Um único executor (limites de impacto, imposto, taxa, saldo de taxa, compras pendentes, ledger idempotente). Entradas armadas (E4) usam a mesma esteira.

## 2. O que o repositório já tem e o que falta

| Peça | Existe | Falta |
| --- | --- | --- |
| Feed WS da bolsa com reconexão e perda contada | `src/inonu/okx-ws.ts` (backoff 1 a 30 s), `src/jev-read/feed.ts` | cobrir os 1965 instrumentos (hoje trades de BTC e SOL no pulso); ping mais cedo (ver risco 1 na seção 6) |
| Barras por evento, fila de trades | `src/intel/ingest.ts` (fila de 5000, descarta o mais antigo e conta) | estado por ativo para milhares de ativos |
| Pulso (regime de 1 e 5 min, fluxo, volatilidade) | `src/pulse/regime.ts`, `pulse.ts` (desligado; `INONU_AGENT_PULSE=1`) | ligação ao ciclo e prova de consumo (zona do Codex) |
| Fatos com identidade e materialidade | `src/pulse/facts.ts` | despachante de eventos sem fonte (`src/decision-review/events.ts`) |
| Cota por tier | `scripts/api-budget.ts`, contadores por tier `free/basic/premium` | contador **por rota** e cache hit |
| Universo de compra | `src/inonu/source-ecosystem.ts`: até 4 redes, 100 linhas por lista, 15 chamadas OnchainOS por pedido | denominador do universo; universo de observação separado do negociável (E2) |
| Cotação sintética de ida e volta | `src/okx-market/round-trip.ts`, `synthetic-round-trip.ts`, `scripts/move-vs-friction.ts` | execução em lote por token e classe de liquidez |
| Registro de preenchimentos | `src/agent/fills.ts`: `feeLamports`, `walletFeeLamports`, `nativeDeltaLamports`, `tokenMinor`, `cashUnits` | pool, rota, preço cotado e executado, impacto, prioridade e gorjeta em campos próprios |
| Carimbo de tempo por etapa | só `durationMs` do ciclo (`cycle.ts:440`) | início e fim de cada etapa, tamanho do Brief, status HTTP |

## 3. Candidatos de arquitetura

| | A. Hub único em memória | B. Workers por conexão e escritor SQLite | C. Híbrido com OnchainOS seletiva | D. Estado de pools Solana por RPC |
| --- | --- | --- | --- | --- |
| Ideia | um processo Bun com o feed da bolsa, estado por ativo, materialidade e Brief por delta | cada Worker mantém uma conexão com um fragmento de ativos e envia lotes compactos; escritor SQLite WAL em outro Worker | bolsa por WS grátis; tokens Solana pela OnchainOS só para top N candidatos e posições, com cache e idade | `accountSubscribe` por pool (ou `programSubscribe` com filtro), decodificação local, cotação local confirmada pela OnchainOS na execução |
| Cobre | só bolsa | só bolsa | bolsa + amostra Solana | tokens Solana do conjunto assinado |
| Reaproveita | `pulse`, `ingest`, `facts` | A mais Workers | A | A mais decodificadores novos |
| Esforço | médio | alto | baixo a médio | alto |
| Risco | uma só event loop; carga de parse com milhares de ativos não medida | custo do `postMessage`; `SharedArrayBuffer` entre Workers não aparece na doc lida | cota do Basic continua apertada | decodificador desalinhado após upgrade do programa; IDLs oficiais não lidos |
| Como medir | staleness p50 e p99, mensagens por segundo, descarte da fila, CPU e memória com 5 mil e 50 mil ativos simulados por replay | latência por estágio, mensagens perdidas, `postMessage` com lotes de 100, 1000 e 10000 | custo mensal por cenário (1, 5 e 20 candidatos), diferença de decisão entre dado de 1 min e de 10 s em replay | diferença byte a byte do decode contra `getAccountInfo` em 50 pools; erro médio absoluto contra a cotação OnchainOS; créditos por hora |

**Recomendação (ordem):** A em sombra primeiro (prova que o feed sustenta 1965 instrumentos e dá o conjunto interseção bolsa x Solana), com C como política de uso da OnchainOS desde já; D como teste de carga em plano gratuito para o conjunto negociado; B só se a medição de A mostrar que o parse atrapalha a decisão. Fatos de plataforma verificados na documentação do Bun: `Bun.serve` WebSocket devolve -1 de `send()` sob backpressure e 0 se descartou, `backpressureLimit` padrão de 16 MB e `idleTimeout` de 120 s; `bun:sqlite` recomenda WAL, com `synchronous=NORMAL` perdendo no máximo os últimos commits sem corromper; `db.transaction()` é síncrona (trabalho com `await` fica fora dela).

## 4. Orçamento de tempo do ciclo

Medido ou estimado. Os tetos vêm do código e são o pior caso, não a mediana.

| Etapa | Teto no código | Medido |
| --- | --- | --- |
| Antes do ciclo (`safely`) | 60 s (`scheduler.ts:103`) | N |
| Leitura do livro | 25 s (`cycle.ts:479`, `wire.ts:146`) | N |
| Fatos das posições | 30 s mais 15 s de graça (`cycle.ts:505`) | N |
| Ecossistema | 25 s (`cycle.ts:793`) | N |
| Timing de candidatos | 25 s, em paralelo dentro do grupo (`cycle.ts:800`) | N |
| Timing de posições | 25 s (`cycle.ts:813`) | N |
| Momentum | 25 s (`cycle.ts:837`) | N |
| **Soma antes do modelo** | **170 s**: os grupos são **sequenciais**, com paralelismo só dentro de cada um | cálculo, não medida |
| Modelo (Jev) | 90 s (`wire.ts:146`) | **mediana 0,371 s**, p99 1,57 s, máx 8,95 s (120 consultas; arquivo bruto ausente) |
| Ordem | 150 s | N |
| Fase de fechamento | até 20 s (`CLOSING_PHASE_MS`) | N |
| Depois do ciclo | 120 s (`scheduler.ts:112`; é timeout da etapa, não cadência) | N |
| Guarda de posições | a cada 45 s, fora do ciclo | N |
| Ciclo inteiro | | 37,5 s (um ciclo); mediana de 2,9 s nos 15 ciclos que consultaram; 5 de 9 ciclos sem consulta duraram de 33,5 a 33,65 s (indício de espera de leitura, inferência); intervalo mediano de 135,6 s contra 120 s nominais (raw ausente) |

O agendador arma o próximo ciclo depois do término do trabalho, então o intervalo real é o nominal mais a duração; existe `requestCycle` (evento), com voo único, que não prova que o fato entrou no Brief. As esperas internas (retomada de venda 30 min, liquidação pendente 15 min, corte 60 min, backoff de impacto 30 min; `cycle.ts:300-305`, `entry-cost.ts:29`) são maiores que o ciclo e travam decisões mesmo com ciclo de 1 minuto; revisá-las com dado medido, sem reduzir proteção de risco sem o dono.

Medição que falta para decidir: a cadeia completa com p50, p95 e p99 por etapa (origem do dado, recebimento, evento, Brief, resposta do Jev, cotação, assinatura, envio, recibo) e as oportunidades que expiraram no caminho. O pior caso de 260 s com consulta (170 s mais 90 s do modelo) torna um ciclo de 1 minuto impossível **no pior caso**; o p95 observado em 15 ciclos (38 s) já passa de meio minuto sem contar a ordem. Amostra mínima: 1000 ciclos com etapas carimbadas antes de usar p95 em decisão.

## 5. Velocidade de decisão, em degraus

| Degrau | O que muda | Exige | Efeito esperado (hipótese) |
| --- | --- | --- | --- |
| S0 | hoje: relógio de 2 min quente, 5 min frio; teto de 720 consultas por dia | nada | linha de base |
| S1 | carimbar cada etapa; paralelizar os grupos pré-modelo; cache por idade | instrumentação sem mudar a decisão | pior caso pré-modelo de 170 s para o maior grupo (cerca de 45 a 60 s); intervalo efetivo mais perto do nominal |
| S2 | **ciclo por evento (E3)** com prova de consumo; relógio como conciliação | integração do pulso ao ciclo e contrato de consumo em `src/decision-review/**` (Codex) | decisão em segundos após o movimento, dentro do teto de consultas |
| S3 | **microjulgamentos paralelos (E5)**: perguntas curtas por candidato (entrada tardia? fluxo sustentado?) em vez de um Brief grande | medir custo e latência por pergunta | só se a medição mostrar ganho por token |
| S4 | **entradas armadas (E4)**: o Jev arma gatilho, validade, tamanho e fatos de origem; o vigia dispara pelo mesmo executor | contrato de decisão, testes com executor falso, reserva única de saldo, parada de emergência | execução sem esperar o próximo ciclo |

Custo do modelo: a US$ 0,042 por milhão de entrada, 1440 consultas por dia custam entre cerca de US$ 0,44 e US$ 0,94 por dia (7,2 a 15,6 mil tokens). Não é o limite. O limite é o teto local (720) e a cota real da organização, que **só o dono lê no console da TypeSafe**. Em S2, o número de consultas por dia depende do número de eventos, não do relógio, e pode ficar abaixo de 720. Um ciclo de 1 minuto puro por relógio exigiria 1440 e mudar o dimensionamento de `wire.ts:309`, que é mudança de contrato de configuração.

## 6. Riscos de arquitetura

1. **Janela de keep-alive.** O servidor derruba a conexão após 30 s sem dado; `okx-ws.ts` tolera 45 s de silêncio e pinga em 20 s. Se o pong não contar como dado, canais de baixa liquidez podem cair antes da reconexão do cliente. Mitigação a validar em teste: ping em 15 a 20 s e reconexão por silêncio acima de 25 s.
2. **Orçamento de inscrições.** 480 subscribe/unsubscribe/login por conexão por hora. Não se sabe se uma mensagem com 100 argumentos conta como uma ou 100. O teste de hoje usou 100 argumentos por requisição (20 requisições por canal para 1965 instrumentos) sem erro. Contar inscrições por hora e evitar tempestade de reconexões.
3. **Carga.** 4 mil mensagens por segundo de tickers: o teste mediu recebimento e confirmação, **não o custo de processamento**. Agregar por janela de 100 ms e medir perda e atraso de fila antes de ligar ao Jev.
4. **Dado velho como se fosse novo.** Tickers e books5 só mudam com evento. Gravar idade por campo e tratar idade acima do limite como indisponível, nunca como zero (o livro e o frescor do repo já seguem essa regra).
5. **Universo da bolsa não é o universo da carteira.** Declarar a cobertura por fonte; nunca chamar o feed da bolsa de "todos os ativos".
6. **Pool decodificado com layout errado.** Checar tamanho e discriminador antes de decodificar e alertar em divergência.
7. **Cadência por evento sem consumo provado** gera o falso positivo de "consultado" (já documentado no ADENDO-E).

## 7. Execução: custo, vazão e proteções

- **Custos fixos por ida e volta (cálculo)**: rede de 2 transações a US$ 0,0103 = US$ 0,0206, ou 0,017% de US$ 121, 0,0021% de US$ 1 mil e 0,0002% de US$ 10 mil; aluguel de uma conta de token nova (cerca de 0,00204 SOL, não verificado) é cerca de 0,18% de US$ 121, recuperável ao fechar a conta. Acima de alguns milhares de dólares o custo fixo não decide; o percentual de pool, imposto e impacto decide.
- **Atrito medido** em [validacao-e-baseline.md](validacao-e-baseline.md).
- **Vazão**: cliente com intervalo mínimo de 1,1 s (54,5 chamadas por minuto, `okx-dex.ts:8`); uma tentativa de troca usa pelo menos cotação e execução (a confirmar no caminho de execução), então no máximo cerca de 27 tentativas por minuto, antes da latência de assinatura TEE (não medida). Teto de 4 vendas e 2 compras por ciclo (`decision.ts:13-14`).
- **Proteções existentes**: ordem em voo com hash até recibo SUCCESS ou ERROR (`cli.ts:595`, `cycle.ts:42`), impacto nulo tratado como bloqueio (`round-trip.ts:107`), teto de slippage de 2% na compra e 3% na venda (`swap-args.ts:49,120`), janela de 15 s de frescor da cotação, recibos só com `finalized` (`solana-receipts.ts`).
- **Oportunidades de execução**: pré-criar contas de token dos mints mais usados e fechar ao zerar a posição; reconciliar a ordem em voo antes de nova tentativa e medir o histograma de broadcast, confirmado e finalizado; calibrar compute units e preço da unidade (um exemplo hipotético de 1,4 milhão de CU a 1.000.000 micro-lamports por CU custaria cerca de US$ 0,148, ou 0,59% de uma compra de US$ 25: medir o preço realmente usado); bundles Jito com `forJitoBundle` em tokens rasos, com gorjeta mínima de 1000 lamports (o mínimo do campo `tips` da OKX diverge do da Jito: testar antes). Valor de qualquer um deles: **não medido**.
- **Ambiente**: sanduíche é custo mensurável para compradores de memecoin em Solana (fontes de fornecedor: 6,85 milhões de sanduíches e US$ 29,7 milhões brutos de out/2025 a out/2026; estudo IMC com 521.903 sanduíches e mais de US$ 7,7 milhões de perda de usuários no início de 2025, limite inferior). Mitigação por bundle reduz mas não zera (fonte secundária). Custo de execução deve ser **medido**, não suposto.
