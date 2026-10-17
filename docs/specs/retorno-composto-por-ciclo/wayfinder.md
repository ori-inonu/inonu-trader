# Ciclo 2: mapa Wayfinder, decisões do Jev, fatias em sombra e entrada do planejamento

Data: 2026-10-17. Workflow `wayfinder-lucro-por-ciclo` (run `wf_1930517d-e57`, Haiku 5.5 em esforço médio). Planejamento local, sem publicar issues no GitHub (precedente: `.scratch/xlayer-readonly`); o mapa e os tickets vivem em `.scratch/retorno-composto-por-ciclo/` (git-ignorado) e a versão durável é esta página mais [evidence/](evidence/) (arquivos `ciclo2-*`). A skill `/wayfinder` só pode ser invocada pelo usuário; li o contrato dela e o segui.

Destino do mapa: decisões travadas e um plano (spec, plan, tasks) para o agente gerar lucro líquido a cada ciclo de 1 minuto, composto sobre o capital total, **começando em sombra**. A meta de 0,5% a 1% por ciclo segue como hipótese a medir; nada aqui promete lucro nem autoriza operação.

## 1. Números do ciclo

- 59 agentes concluídos, 0 erros, cerca de 4,85 milhões de tokens: 8 cartógrafos, 1 fusão, 20 tickets resolvidos por pesquisador e reverificados por um cético (40 agentes), 1 planejador, e as fases de especificar e implementar para 3 fatias (9 agentes). O teto de 50 do dono valia para a pesquisa; as fases Especificar e Implementar foram pedidas depois e ficaram limitadas a 3 fatias.
- Verificação (o cético reconferiu até 10 afirmações por ticket): 176 verificadas, **108 confirmadas, 57 parciais, 8 refutadas, 3 não verificáveis**; 242 achados. Nenhum ticket saiu com `decisao_ok` verdadeiro; o planejador corrigiu as premissas erradas e as opções que tocavam assuntos vedados antes de consolidar.
- O Jev foi usado **sem teto diário** (decisão do dono, 2026-10-17): 12 decisões, cerca de 130 chamadas, 0 falhas.

## 2. Tickets resolvidos

| Id | Ticket | Domínio | Depende de | Achados | Verificadas | Ok | Parcial | Refutadas | Não verif. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | Patrimônio USD conciliado e capital base | capital | nenhum | 12 | 8 | 4 | 2 | 2 | 0 |
| T02 | Markout dos grupos de decisão em 1, 5, 15 e 60 min | edge | nenhum | 12 | 8 | 5 | 3 | 0 | 0 |
| T03 | Regra de promoção E1 escrita antes da coleta | medição | nenhum | 12 | 8 | 5 | 3 | 0 | 0 |
| T04 | Motivo dos 57% de candidatos fechados antes do Jev | decisão | nenhum | 11 | 15 | 8 | 6 | 1 | 0 |
| T05 | Identidade Solana por endereço dos símbolos da bolsa | dados | nenhum | 11 | 8 | 4 | 4 | 0 | 0 |
| T06 | Regime de janela que entra primeiro em sombra | edge | nenhum | 12 | 8 | 3 | 5 | 0 | 0 |
| T07 | Decomposição da taxa de rede e campos de custo por operação | custo | nenhum | 12 | 8 | 6 | 2 | 0 | 0 |
| T08 | Definição do retorno por ciclo sobre o patrimônio | capital | T01 | 12 | 11 | 7 | 4 | 0 | 0 |
| T09 | Atrito de ida e volta por classe de liquidez | custo | T05 | 15 | 8 | 6 | 0 | 1 | 1 |
| T10 | Custo total e impacto por tamanho de ordem em SOL | custo | nenhum | 13 | 8 | 4 | 3 | 1 | 0 |
| T11 | Limiar lambda x R por classe de liquidez e horizonte | edge | T06 | 12 | 8 | 4 | 2 | 2 | 0 |
| T12 | Universo que o ciclo de sombra observa primeiro | dados | T05 | 13 | 8 | 5 | 3 | 0 | 0 |
| T13 | Carimbo de etapa e p95 do ciclo | operação | nenhum | 13 | 8 | 5 | 2 | 1 | 0 |
| T14 | Latência real do dado da bolsa sem offset de relógio | dados | nenhum | 12 | 8 | 4 | 4 | 0 | 0 |
| T15 | Cadência da consulta ao Jev na sombra | decisão | T02 | 12 | 8 | 6 | 2 | 0 | 0 |
| T16 | Reconciliação de ordem em voo após queda | operação | nenhum | 12 | 13 | 7 | 4 | 0 | 2 |
| T17 | Orçamento de RPS por rota num ciclo de 60 s | operação | T13 | 12 | 8 | 5 | 3 | 0 | 0 |
| T18 | Limite real do OnchainOS Market e código de cota esgotada | ecossistema | nenhum | 12 | 9 | 6 | 3 | 0 | 0 |
| T19 | Cobertura da bolsa OKX sobre os mints negociados | ecossistema | nenhum | 10 | 8 | 7 | 1 | 0 | 0 |
| T20 | Ping e silêncio no WebSocket da OKX | dados | nenhum | 12 | 8 | 7 | 1 | 0 | 0 |

## 3. Decisões levadas ao Jev (sem teto diário)

Cada decisão foi consolidada pelo planejador a partir de um ou mais tickets, validada com o `parseSpec` do projeto e enviada com `createJevJudge` e `decide` (mesmo motor do MCP). Especificações em [decisoes-jev/](decisoes-jev/) e recibos em [decisoes-jev/recibos/](decisoes-jev/recibos/); nós `jev-rc-dec-*` no grafo. Recomendação do Jev não autoriza nada.

| Decisão | Pergunta (resumo) | Resultado | Escolha | Média |
| --- | --- | --- | --- | --- |
| D1 | Base de capital e definição de retorno na sombra | **consenso** | `medir-sem-base`: agregados por perna, sem percentual composto até conciliar 100, 118, 121, 126 e 155 | 0,54 |
| D2 | Regra de promoção E1 antes da coleta | **consenso** | `calibrar-antes`: log de sombra de 48 h mede sigma, rho e cadência antes de fixar H e N | 0,86 |
| D3 | Fonte e horizonte do markout | sem consenso | adotado por regra `placar-existente` (15 min, 1 h, 4 h e 24 h já gravados, sem coleta nova) | 0,41 (líder), 0,47 de risco em adiar |
| D4 | Causa dos 411 fechados antes do Jev | **consenso** | `contador-em-memoria`: contador por causa em janela de auditoria, sem gravar journal | 0,69 |
| D5 | Universo e identidade por mint | **consenso** | `adiar-identidade`: medir só dado da bolsa, sem cruzar mint; a contagem de 54 símbolos não foi reproduzida | 0,83 |
| D6 | Regime e limiar de janela | sem consenso (nenhuma opção serve, `noneFits` 0,49) | adotado por regra `medir-sem-limiar`: rotular janelas de 1, 5 e 15 min com markout, sem gate | 0,24 e 0,27 |
| D7 | Atrito e custo por tamanho de ordem | **consenso** | `medir-sem-mudar-codigo`: distribuição da taxa de rede nas ordens com taxa já gravada | 0,59 |
| D8 | Carimbo de etapas do ciclo | **consenso** (acordo 0,67) | `campo-relatorio-memoria`: campo opcional de etapas no `CycleReport`, em memória, sem tocar o journal | 0,54 |
| D9 | Cadência do Jev na sombra | sem consenso (empate) | adotado por regra o status quo `manter-relogio-2min` | 0,48 contra 0,49 |
| D10 | Ordem sem recibo em voo | **consenso** | `adiar-so-medir`: contar por semana, com idade mediana e máxima, sem mudar tela nem fluxo | 0,79 |
| D11 | Códigos 402 e 50011 do cliente OnchainOS | **consenso** | `medir-codigos-sombra`: relatório diário de status dos eventos já emitidos; `apiCode` só com aprovação | 0,89 |
| D12 | Ping e silêncio do WebSocket da bolsa | **consenso** | `teste-2h-canal-quieto`: medir se o pong renova o prazo antes de qualquer constante nova | 0,72 |

Mais a decisão `rc-primeira-etapa` (ciclo 1): consenso em `medir_primeiro` (média 0,95). As três sem consenso seguem a regra do projeto: opção mais reversível e de menor risco, registradas como `sem-jev` no grafo. D6 sinaliza que a pergunta está prematura: o Jev disse que nenhuma das opções serve; vale refazê-la depois de D2 (calibração) e do markout de D3.

Leitura conjunta: **o Jev escolheu medir, conciliar e não mudar nada em todas as 9 decisões com consenso.** Isso é coerente com a linha de base (0 de 7 voltas positivas) e com a regra "sombra primeiro".

## 4. Fases propostas pelo planejador (F0 a F5)

| Fase | Objetivo | Tickets | Critério de saída |
| --- | --- | --- | --- |
| F0 | Base conciliada e merge limpo | T01, T07, T16 | `wire.ts` e `cycle.ts` sem marcadores de conflito e carregáveis; snapshot agregado por perna em 3 horários por 3 dias; ordens com taxa reconciliadas com o ledger |
| F1 | Instrumentação de sombra | T13, T14, T17, T18, T20 | 1000 ciclos com etapas carimbadas (p50, p95, p99); 24 h de idade por canal com relógio corrigido; teste de 2 h em canal quieto; 7 dias de status e `apiCode`; teste de conexão na 443 com 1965 inscrições |
| F2 | Medição de edge, custo e funil | T02, T04, T06, T07, T09, T10, T11, T12, T19 | 411 fechamentos classificados por causa ou "desconhecido"; markout por token com N efetivo; atrito por classe; 20 transações decompostas; cobertura de mint declarada como proxy |
| F3 | Calibração e congelamento da regra E1 | T03, T11 | sigma, rho e cadência medidos em 48 h; regra gravada em commit antes da coleta final |
| F4 | Coleta de sombra e veredito | T03, T06, T11 | N efetivo no mínimo fixado; 3 janelas de mercado distintas; holdout avaliado uma vez; veredito PASSA, REPROVA ou INCONCLUSIVO, sem liberar dinheiro |
| F5 | Decisão do dono sobre capital e saída da sombra | nenhum | decisão escrita do dono, ou registro de que a sombra continua |

## 5. Descobertas novas que mudam o plano

1. **A porta 8443 do WebSocket público da OKX deixa de aceitar conexões em 2026-10-31** (changelog oficial, atualizado em 2026-10-16; a 443 já funciona e eu a testei). O repositório usava 8443 em `src/inonu/okx-ws.ts`, `src/jev-read/feed.ts`, `src/public-market-capture/node-adapter.ts` e `plan.ts`. O ciclo 1 tinha recomendado exatamente esse feed. **Migrei o feed vivo** (os dois primeiros), com teste vermelho e verde num worktree limpo da `main` (147 testes verdes). `src/public-market-capture/*` usa recibos de autoridade com a URL exata e **não foi tocado**: precisa de decisão de quem o mantém.
2. **`src/generated/prompts` não existe neste checkout**, então `feed.test.ts`, `decide.ts`, `jev-model.ts` e o CLI `scripts/jev-consensus.ts` não carregam; os testes de `desktop` falham pelos marcadores do merge em andamento. Qualquer validação precisa de um worktree limpo da `main` e comparação com a base.
3. **O markout já existe em parte**: `scoreboard.jsonl` mede 15 min, 1 h, 4 h e 24 h. A lacuna real é 1 e 5 minutos (o ticket T02 partia da premissa errada).
4. O capital de **US$ 155** em `data/operator/latest.json` é fixture sintética, não base de medição. Bases possíveis: 100, 118 (medida em 15/10), 121 e 126.
5. A contagem de mints "verified" não reproduz entre leituras (111, 104, 7 e 54 contra 103, 97, 6 e 51): normalizar caixa antes de qualquer uso; o 217 do ciclo 1 também não foi reproduzido.
6. A cota Basic projeta 4.700 a 4.900 chamadas por dia contra cerca de 5.953 sustentáveis e 160 mil por mês contra o teto de 100 mil (projeção linear, não medida de mês).
7. Há ordem enviada sem recibo que pode gerar compra duplicada entre ciclos (o LOCK é lido só na partida) ou venda presa sem prazo (`cycle.ts:763-767`); a decisão D10 foi só medir.
8. Acerto direcional de equilíbrio: 70,4% em 15 min e 83,3% em 5 min para atrito de 0,42%, em vez dos 90% e 95% citados antes.

## 6. Fatias de código em sombra (fases Especificar e Implementar)

Autorizadas pelo consenso `medir_primeiro`: módulos puros, injetáveis e **não ligados** a nada. Cada fatia teve especificação SDD, implementador TDD em worktree isolado e revisor adversarial. Especificações em [specs/](specs/).

| Fatia | Módulo | Testes do implementador | Revisor |
| --- | --- | --- | --- |
| S1 | `src/agent/stage-timing.ts` | 14 passam | aprovada com ressalvas (percentil pede lista ordenada sem validar; `end` com etapa desconhecida sem teste) |
| S2 | `src/onchain-read/route-counter.ts` | 14 passam | **reprovada**: Growth, Scale e Pro com preço e cota nulos mas rotulados "lidos em 2026-10-17"; `null` tratado como "sem teto"; `porStatus` corrompido por chaves como `toString`; `diasNoMes` NaN e contagens negativas aceitos |
| S3 | `src/okx-market/rt-batch.ts` | 14 passam | aprovada com ressalvas (IC com z=1,96 também para n entre 2 e 29; tamanhos duplicados; liquidez negativa) |

Ressalva estrutural: os implementadores rodaram sobre um commit antigo (`b587759`, era Kuru e Monad), sem `AGENTS.md`, sem `src/okx-market`, sem `src/agent` e sem `package.json` com `typecheck`. O código é puro, mas só vale depois de **montado na `main` e validado contra a base** (fase Validar). S4 e S5 não foram executadas. S2 precisa ser refeita com a tabela de planos que eu verifiquei e os achados do revisor.

## 7. Bloqueios do dono (nada decidido)

Planos pagos (OnchainOS Starter, Growth, Pro, x402, RPC, agregadores); aceitar o risco de termos da OKX (cláusula 9.4) para qualquer raspagem ou uso do feed público em escala; ler a cota real da TypeSafe e o RPS da conta na OKX; ordens, assinaturas ou transferências, inclusive para calibrar custo; estender journals (`fills.jsonl`, `audits.jsonl`, `decisions-meta`) ou gravar markout novo; base de dimensionamento, limites de risco e capital-base; liberar live ou promover sombra para real (portão G4); reiniciar ou trocar o agente vivo, release de produção e mudar `intervalMin`, `TIMEOUTS` e as esperas internas; dependência de produção nova; mensagens a terceiros (suporte da OKX); migração da porta 8443 do `public-market-capture` (recibos).

## 8. Nevoeiro e riscos

Nevoeiro: custo real de sanduíche e gorjeta por compra de US$ 10 a 30; latência de descoberta via PumpPortal; se a OKX conta tentativas com erro (retry 50102 pode duplicar um `fetch` 17 ms depois); Alpenglow (noticiada para 2026-10-21, fonte secundária) e slot de 300 ou 400 ms; pools concentrados fora do produto constante; aluguel de conta de token; se SOL mantido para rede entra no patrimônio; impacto de 2,1% no pool raso (custo fixo ou impacto); precisão direcional do Jev acima do acaso; unidade do RPS (chave, IP, conta); conciliação de 25 contra 26 preenchimentos; limites de Birdeye, GeckoTerminal, Bitquery e DexScreener; semântica do campo `ts` dos tickers da OKX; se `trades-all`, `bbo-tbt` e `candle1s` exigem VIP.

Riscos principais: termos da OKX (9.4); **porta 8443 em 14 dias**; cota Basic acima do teto; ordem sem recibo; `wire.ts` com marcadores de merge (linhas 825, 832 e 1228); amostra enviesada (38 tokens, 8 pedidos, janelas sobrepostas); dados legados de 14 e 15/10 que não representam o código atual; sigma, rho e cadência são premissas não medidas; multiplicidade E1 a E5 sem correção; preço de bolsa não é preço de pool Solana; atrito medido em 6 pares de um único ativo.

## 9. Leitura crítica

- Qualidade: 33% das afirmações verificadas saíram parciais ou refutadas, e o planejador (Haiku) fez a consolidação final. Tratar este documento como **entrada do planejamento**, não como verdade; os números marcados como cálculo ou premissa continuam assim.
- O cético e o planejador acharam erros em ambos os lados do processo (opções que tocavam assuntos vedados, premissas erradas de T02, T04, T06 e T16). Isso é um bom sinal do desenho, não um atestado de correção.
- Itens que dependem de arquivos fora do repositório (`fills.jsonl`, `decisions-meta.jsonl`, `audits.jsonl`, `scoreboard.jsonl`, `usage-*.json`) vêm de agregados lidos pelos agentes; não os reabri.

## 10. Próximos passos

1. Validar S1 e S3 contra a base `c67b39e` (typecheck, `test:lab`, suíte por blocos com comparação com a base, auditoria de regras, reprodução independente) e só então aplicar ao projeto: workflow em andamento (fases Validar e Atualizar).
2. Refazer a S2 corrigindo os achados do revisor.
3. Executar F0: resolver o merge em andamento (decisão do dono; o ensaio de resolução está no workflow `revisao-branches-worktrees`).
4. Reenviar D6 ao Jev depois de D2 e D3.
5. Migrar `public-market-capture` para a porta 443 antes de 2026-10-31, com novos recibos (dono).
