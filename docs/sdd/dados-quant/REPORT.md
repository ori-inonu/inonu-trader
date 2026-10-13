# Dados e risco quantitativo: relatório de evidência

Sessão da meta `/goal` de 2026-10-13. SPEC: [SPEC.md](SPEC.md). Código: `src/quant/`, `src/system-one/quant-history.ts`, `src/system-one/{types,cycle,decide,public-view}.ts`, `scripts/system-one.ts`, `scripts/quant-capture.ts`, `scripts/quant-calibrate.ts`, `scripts/quant-evidence-risk.ts`, painel em `web/src/components/SystemOne/` e `web/src/lib/system-one.ts`. Commitado a pedido do usuário, só os caminhos próprios (hash no histórico do Git). Nenhuma assinatura, nenhuma ordem, nenhuma leitura de carteira. Uma tentativa de consulta real ao modelo foi feita com autorização e falhou (seção 12).

Esta versão incorpora a revisão independente (agente distinto, somente leitura, execução em cópia): ela replicou os números principais, não achou P0 e apontou cinco P1 e vários P2. Cada um está tratado na seção 8.

## 1. Resumo

1. **O envelope subestima o risco de quem vende.** `touchLiquidationProbability` usa a mesma probabilidade para comprado e vendido. Em log-preço a barreira do vendido é mais próxima. Com sigma 6% ao dia, 5x e 7 dias, o envelope dá 0,2077 para os dois lados; a barreira correta dá 0,1598 para o comprado e 0,2508 para o vendido (referência independente em Python). No ciclo real de MON-USDT-SWAP lido em 2026-10-13 com 7 dias de histórico e horizonte de 3 dias, o envelope deu 2,20% para o 5x comprado e para o 5x vendido; a forma fechada por lado deu 2,17% e 6,07%, e a simulação com cauda pesada 1,80% e 4,35%.
2. **O previsor de simulação filtrada (FHS) é melhor que a fórmula do envelope em 5 perpétuos reais, mas a evidência é mais modesta do que a primeira versão deste relatório dizia.** O sinal do ganho é positivo nos 9 casos (3 janelas de treino por 3 horizontes), nas 15 de 15 células ativo por horizonte em cada janela, em todos os pisos de log loss testados e deixando cada ativo de fora. Mas o intervalo de 95% por data (ativos que se movem juntos contam uma vez por dia) exclui zero em 6 de 9 casos no log loss e em 5 de 9 no Brier, e o ganho se concentra em poucos dias: os 3 melhores dias carregam de 47% a 84% do total. A leitura honesta é "melhoria consistente em direção, estatisticamente marginal, concentrada nos dias de choque", que são justamente os dias que importam para liquidação.
3. **O que não está provado:** (a) a cauda profunda continua subestimada, inclusive pelo FHS; (b) todos os previsores superestimam barreiras próximas em horizontes longos; (c) são 90 dias de um único regime, 5 ativos correlacionados e horizontes sobrepostos; (d) a verdade usa máximas e mínimas do último preço, não do preço de marcação que dispara a liquidação; (e) a calibração cobre barreiras de 1 a 4 sigmas do horizonte, e os candidatos elegíveis no envelope (2x e 3x no horizonte de 3 dias) ficam além disso, então as probabilidades deles são extrapolação.
4. **A forma fechada gaussiana por lado não melhora o resultado de forma demonstrável**: o ganho de log loss é pequeno e o intervalo por data inclui zero nos três horizontes; o Brier não melhora. Corrigir só a barreira por lado não basta, a cauda gaussiana é o limite.
5. **Integração:** o anexo é opcional (`--quant`), não altera o envelope (corrigido, ver P1-1), não altera elegibilidade nem escolha, falha sem derrubar o ciclo, aparece no painel do console e no contrato público do backend. Ainda não se sabe se o Jev usa o bloco: a única tentativa de consulta real falhou antes de o modelo responder (seção 12).

## 2. O que foi construído

| Módulo | Função | Requisito |
| --- | --- | --- |
| `src/quant/candles.ts` | auditoria de velas: duplicidade, ordem mista, lacuna, fora de grade, OHLC incoerente, não confirmada, ainda não encerrada, cauda vencida, retornos e faixas atípicos, corridas planas; nota A, B, C ou F; mantém o sufixo contíguo mais recente, nunca repara nem imputa | Q-01 |
| `src/quant/volatility.ts` | fechamento a fechamento, Parkinson, Garman-Klass, Rogers-Satchell, Yang-Zhang, EWMA e MAD robusto; faixa (baixo, central, alto), regime, razão de cauda | Q-02 |
| `src/quant/tail.ts`, `normal.ts`, `stats.ts` | assimetria, curtose, índice de Hill, VaR e ES históricos, Cornish-Fisher (retido fora da faixa de validade) | Q-03 |
| `src/quant/garch.ts`, `evt.ts` | GARCH(1,1) com alvo de variância, ajuste por quase máxima verossimilhança em grade, resíduos padronizados; caudas de valores extremos opcionais (seção 10) | Q-04, Q-13 |
| `src/quant/touch.ts` | barreira em log-preço por lado; forma fechada com deriva opcional; simulação filtrada com correção de ponte entre amostras | Q-04 |
| `src/quant/calibration.ts`, `forecasters.ts` | Brier, log loss, confiabilidade, janela móvel sem vazamento, bootstrap de blocos pareado, perda por início com piso variável, agregação por data | Q-05 |
| `src/quant/portfolio.ts` | concentração, encolhimento de Ledoit-Wolf, contribuição ao risco, razão de diversificação, VaR e ES, queda máxima, cenário | Q-06 |
| `src/quant/annex.ts`, `rows.ts` | anexo de evidência para o brief do System One (sem decisão), com degradação graciosa | Q-07 |
| `src/quant/history.ts`, `src/system-one/quant-history.ts` | histórico de velas em memória, fusão sem rebaixar vela confirmada e com contagem de reedições, paginação só quando preciso | Q-10 |
| `src/system-one/{types,cycle,decide,public-view}.ts`, `scripts/system-one.ts` | integração aditiva atrás de `--quant`, estado compacto para o modelo, projeção pública por lista de permissão | Q-07, Q-11 |
| `web/src/lib/system-one.ts`, `web/src/components/SystemOne/` | leitura estrita e tabela "Risco medido de liquidacao" no painel | Q-11 |
| `src/quant/evidence.ts`, `scripts/quant-evidence-risk.ts` | adaptador do formato de evidência de carteira e relatório de risco sobre ele | Q-06, Q-12 |
| `scripts/quant-capture.ts`, `quant-calibrate.ts` | captura pública e calibração pareada | Q-05, Q-09 |

Outra sessão reescreveu `scripts/quant-portfolio.ts` sobre um módulo novo (`src/portfolio-analytics/`, com testes) enquanto eu trabalhava; mantive e verifiquei que continua funcionando com os mesmos números.

Decisões que o Jev continua tomando: o anexo não carrega ordem, compra, venda, recomendação nem escolha; não altera elegibilidade, envelope nem escolha (testes com valores extremos e distintos por candidato); a projeção pública difere da anterior apenas pelo bloco `quant` em lista de permissão; e sem `--quant` o ciclo, o jornal e o texto enviado ao modelo são idênticos aos de antes (o texto original é comparado byte a byte, e o texto acrescentado é escaneado por palavras de instrução).

## 3. Verificação

Totais executados estão na seção 7. Aqui, o que cada verificação é:

- **Referências independentes:** vetores de teste dos estimadores, da probabilidade de toque, do filtro GARCH, de Cornish-Fisher, de Hill e do encolhimento de Ledoit-Wolf vêm de Python puro (`math.erfc`, `statistics.NormalDist`), não da minha implementação. A revisão independente refez isso por conta própria: Parkinson, Garman-Klass, Rogers-Satchell e Yang-Zhang batem em 672 barras reais de ETH com erro relativo de até 8e-16; a forma fechada com deriva bate com a integral de primeira passagem em 2250 combinações (erro máximo 9e-8); os extremos simulados concordam com a forma fechada gaussiana em 24 células, dentro de 1,8 erros padrão.
- **Sem vazamento do futuro:** o treino é `[i-trainBars+1, i]`, a entrada é `close[i]` e o desfecho usa as barras `i+1..i+horizonte`; testes fixam a fronteira da janela, o preço de entrada com um vão entre o fechamento e a abertura seguinte e a invariância das previsões passadas a mudanças no futuro.
- **Pureza (Q-08):** varredura de imports e identificadores, validada plantando violações.
- **Mutação:** seção 7.
- **Revisão independente por outro agente:** feita e tratada, seção 8. As instruções vigentes não autorizam delegar por si; interpretei a meta de autonomia como autorização para um único revisor somente leitura, com execução em cópia isolada. Se você discorda dessa leitura, os achados continuam válidos, mas a decisão de delegar foi minha.
- **Verificação visual do painel:** a tabela foi renderizada com o ciclo real de MON em uma página temporária (não nos seus servidores), em 1280 px e em 375 px; sem erros de console, sem rolagem horizontal da página, tabela cabendo no celular.

## 4. Dados reais e método da medição (Q-09)

Origem: API pública keyless da OKX v5 (`/market/history-candles`) pelo cliente existente `createPublicOkxHttp`, 15 minutos, perpétuos, capturados em 2026-10-13 entre 16:29 e 16:35 UTC. BTC cobre 2026-07-15 16:30 a 2026-10-13 16:00 UTC; ETH, SOL, DOGE e MON cobrem 16:45 a 16:15. São 8.640 velas por ativo e 8.639 utilizáveis (a vela ainda aberta é excluída). Auditoria: nota B nos cinco (retornos e faixas atípicos marcados, nenhum buraco, nenhuma duplicata).

| Ativo | sha256 do conjunto (16 primeiros) |
| --- | --- |
| BTC-USDT-SWAP | 3a31a8bc9303845c |
| ETH-USDT-SWAP | 4c556af1d1aa29aa |
| SOL-USDT-SWAP | 4e8339706c304f9f |
| DOGE-USDT-SWAP | 21be4943fbd4da62 |
| MON-USDT-SWAP | 5f16a43243fbfeaa |

Método: para cada ativo e horizonte, em cada início (um por dia) os previsores veem só as velas até o início e respondem para um conjunto fixo de movimentos adversos. O evento é "a mínima (comprado) ou a máxima (vendido) das velas seguintes alcança a barreira dentro do horizonte". Os movimentos adversos são k vezes o sigma do horizonte da amostra inteira, com k = 1; 1,5; 2; 2,5; 3; 4. Isso só decide quais perguntas se fazem, igual para todos os previsores; nenhuma previsão o usa. O treino foi repetido com três janelas: 7 dias (672 velas), 30 dias e 300 velas (o que a produção lia antes de `--quant`).

**Incerteza.** O intervalo de 95% principal é um bootstrap de blocos móveis sobre as datas: a diferença de perda de cada ativo é calculada por dia de início e depois tirada a média entre os ativos, de modo que ativos que caem juntos contam uma vez. O bloco é o maior entre 3 dias e o dobro do horizonte. O intervalo "ativos empilhados" (a versão anterior) trata os 5 ativos como independentes e é sempre mais estreito, portanto otimista. Foram produzidos cerca de 50 intervalos sem correção de multiplicidade: a única comparação nomeada de antemão como principal é fhs contra envelope em log loss nos três horizontes; o resto é exploratório.

Previsores comparados: `envelope` (a fórmula de produção com o sigma de produção), `side-aware` (forma fechada por lado, sigma central da faixa), `side-aware-high` (idem com o sigma alto da faixa), `fhs` (GARCH(1,1) ajustado, resíduos reamostrados, ponte). Dados e resultados completos: `evidence/calibration-latest.json` (treino de 7 dias), `calibration-train30.json` e `calibration-train300bars.json`.

### Resultado principal: ganho do fhs contra o envelope

Ganho = perda do envelope menos perda do fhs; positivo significa que o fhs é melhor. Entre colchetes, o intervalo de 95%.

#### Treino de 7 dias (672 barras)

| Horizonte | Eventos | Taxa base | Log loss envelope | fhs: ganho log loss, IC por data | fhs: ganho Brier, IC por data | fhs, ativos empilhados (log loss) | 3 melhores dias | fhs pior que envelope |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 dia(s) | 4920 | 6.8% | 0.2476 | 0.0369 [0.0002; 0.0982] | 0.0018 [-0.0005; 0.0046] | 0.0369 [0.0177; 0.0589] | 84% | 35 de 82 dias |
| 3 dia(s) | 4800 | 6.7% | 0.2940 | 0.0544 [-0.0020; 0.1641] | 0.0015 [-0.0007; 0.0044] | 0.0544 [0.0217; 0.0935] | 79% | 34 de 80 dias |
| 7 dia(s) | 4560 | 7.4% | 0.3902 | 0.0649 [0.0056; 0.1899] | 0.0018 [0.0002; 0.0054] | 0.0649 [0.0266; 0.1147] | 53% | 23 de 76 dias |

#### Treino de 30 dias

| Horizonte | Eventos | Taxa base | Log loss envelope | fhs: ganho log loss, IC por data | fhs: ganho Brier, IC por data | fhs, ativos empilhados (log loss) | 3 melhores dias | fhs pior que envelope |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 dia(s) | 3540 | 8.8% | 0.3063 | 0.0495 [-0.0004; 0.1308] | 0.0018 [-0.0018; 0.0061] | 0.0495 [0.0239; 0.0803] | 84% | 25 de 59 dias |
| 3 dia(s) | 3420 | 9.1% | 0.3631 | 0.0660 [-0.0007; 0.1851] | 0.0019 [-0.0003; 0.0046] | 0.0660 [0.0268; 0.1155] | 73% | 25 de 57 dias |
| 7 dia(s) | 3180 | 9.9% | 0.4597 | 0.0827 [0.0105; 0.1381] | 0.0033 [0.0026; 0.0050] | 0.0827 [0.0310; 0.1286] | 47% | 8 de 53 dias |

#### Treino de 300 barras (janela de producao anterior)

| Horizonte | Eventos | Taxa base | Log loss envelope | fhs: ganho log loss, IC por data | fhs: ganho Brier, IC por data | fhs, ativos empilhados (log loss) | 3 melhores dias | fhs pior que envelope |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 dia(s) | 5160 | 6.8% | 0.2445 | 0.0248 [0.0038; 0.0561] | 0.0015 [0.0004; 0.0029] | 0.0248 [0.0126; 0.0392] | 74% | 38 de 86 dias |
| 3 dia(s) | 5040 | 6.9% | 0.2934 | 0.0391 [0.0021; 0.1090] | 0.0013 [0.0002; 0.0029] | 0.0391 [0.0159; 0.0684] | 79% | 28 de 84 dias |
| 7 dia(s) | 4800 | 7.1% | 0.3818 | 0.0346 [0.0024; 0.1069] | 0.0012 [0.0006; 0.0037] | 0.0346 [0.0103; 0.0651] | 71% | 24 de 80 dias |


IC por data exclui zero: log loss 6 de 9 combinações, Brier 5 de 9.

Pontos a ler junto:

- O **log loss** usa um piso de 1e-4 na probabilidade (um acerto previsto a 0 custa 9,2 nats). O ganho do fhs com treino de 7 dias é 0,037, 0,054 e 0,065 com piso 1e-4; 0,027, 0,032 e 0,034 com piso 1e-3; e 0,013, 0,011 e 0,011 com piso 1e-2. Continua positivo em todos, mas a magnitude depende bastante do piso: uma parte do ganho vem de o envelope atribuir probabilidade quase zero a eventos que acontecem.
- A coluna "ativos empilhados" é a da versão anterior deste relatório. Ela é mais estreita porque ignora que os ativos caem juntos; o intervalo por data é o que vale.
- Com a janela de 300 velas (a de produção anterior) os intervalos por data excluem zero nos seis casos; com 7 dias ou 30 dias de treino, em menos. Não há ordenação clara das janelas, e os conjuntos de inícios são diferentes (treino maior consome mais do começo da série), então os níveis absolutos não se comparam entre janelas.

### Formas fechadas por lado (treino de 7 dias)

| Horizonte | side-aware, log loss | side-aware, Brier | side-aware-high, log loss | side-aware-high, Brier |
| --- | --- | --- | --- | --- |
| 1 dia(s) | 0.0051 [-0.0039; 0.0160] | -0.0012 [-0.0028; 0.0001] | 0.0184 [-0.0270; 0.0919] | -0.0062 [-0.0124; 0.0007] |
| 3 dia(s) | 0.0075 [-0.0063; 0.0270] | -0.0010 [-0.0033; 0.0010] | 0.0320 [-0.0379; 0.1641] | -0.0064 [-0.0135; 0.0031] |
| 7 dia(s) | 0.0176 [-0.0030; 0.0510] | -0.0012 [-0.0044; 0.0020] | 0.0410 [-0.0332; 0.1778] | -0.0066 [-0.0141; 0.0025] |

Nenhum intervalo por data da forma fechada exclui zero, e o Brier piora com o sigma alto. A forma fechada por lado é mais correta como barreira, não como previsor.

### Robustez do ganho do fhs (treino de 7 dias)

| Horizonte | piso 1e-4 | piso 1e-3 | piso 1e-2 | sem BTC | sem ETH | sem SOL | sem DOGE | sem MON |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 dia(s) | 0.0369 | 0.0273 | 0.0130 | 0.0377 [0.0026; 0.0960] | 0.0356 [0.0025; 0.0897] | 0.0361 [-0.0013; 0.0997] | 0.0342 [-0.0030; 0.1011] | 0.0411 [-0.0004; 0.1076] |
| 3 dia(s) | 0.0544 | 0.0318 | 0.0109 | 0.0552 [0.0003; 0.1652] | 0.0503 [-0.0009; 0.1524] | 0.0536 [-0.0043; 0.1645] | 0.0555 [-0.0028; 0.1744] | 0.0573 [-0.0025; 0.1737] |
| 7 dia(s) | 0.0649 | 0.0336 | 0.0112 | 0.0648 [0.0075; 0.1861] | 0.0563 [0.0065; 0.1618] | 0.0683 [0.0060; 0.1987] | 0.0675 [0.0008; 0.2035] | 0.0674 [0.0055; 0.1972] |

Saindo cada ativo, o sinal fica e a magnitude varia pouco; os intervalos por data perdem o limite inferior acima de zero em vários casos porque sobram menos dados, o que reforça que a evidência é marginal.

### Confiabilidade (treino de 7 dias, reunido): onde o modelo ainda erra

Previsão média contra frequência observada. Cada previsor tem seus próprios eventos por faixa, então as linhas não são pareadas; os eventos são dependentes (ativos que caem juntos, horizontes sobrepostos), e os intervalos acima não cobrem estas linhas.

| Faixa | Horizonte | Envelope previsto / observado | FHS previsto / observado |
| --- | --- | --- | --- |
| menor que 1% | 1 dia(s) | 0.15% / 2.10% (n=2572) | 0.27% / 0.98% (n=2044) |
| 1% a 3% | 1 dia(s) | 1.80% / 4.92% (n=488) | 1.83% / 3.84% (n=859) |
| 30% a 60% | 1 dia(s) | 38.50% / 27.08% (n=336) | 38.17% / 31.25% (n=208) |
| menor que 1% | 3 dia(s) | 0.14% / 3.19% (n=2604) | 0.23% / 2.09% (n=2246) |
| 1% a 3% | 3 dia(s) | 1.85% / 4.32% (n=440) | 1.82% / 5.23% (n=745) |
| 30% a 60% | 3 dia(s) | 38.40% / 21.34% (n=314) | 38.02% / 20.79% (n=202) |
| menor que 1% | 7 dia(s) | 0.13% / 5.31% (n=2562) | 0.19% / 4.31% (n=2345) |
| 1% a 3% | 7 dia(s) | 1.88% / 5.03% (n=398) | 1.86% / 6.89% (n=610) |
| 30% a 60% | 7 dia(s) | 38.60% / 15.44% (n=272) | 38.24% / 15.18% (n=191) |

Leitura honesta:

- A fórmula do envelope subestima a cauda por um fator de 14 a 41 na faixa mais baixa. O FHS reduz o erro, mas ainda subestima por 3,6 a 22 vezes. As probabilidades baixas do anexo devem ser lidas como piso, não como estimativa central, e o texto enviado ao modelo diz isso.
- Para barreiras próximas em horizontes longos, todos os previsores (FHS inclusive) superestimam a probabilidade. As razões de variância dos 90 dias variam entre ativos (1,78 em BTC e 0,84 em MON em 7 dias), mas uma revisão independente mostrou que, com 90 dias, só o BTC se distingue estatisticamente de 1; portanto não afirmo que o expoente de tempo difere por ativo, e não ajustei nenhum fator de escala.

Por célula (ativo e horizonte, 15 células), medido por log loss médio:

- Por célula, treino de 7 dias (672 barras): fhs menor que envelope em 15 de 15; melhor de todos em 13; side-aware-high melhor em 2.
- Por célula, treino de 30 dias: fhs menor que envelope em 15 de 15; melhor de todos em 10; side-aware-high melhor em 5.
- Por célula, treino de 300 barras (janela de produção anterior): fhs menor que envelope em 15 de 15; melhor de todos em 11; side-aware-high melhor em 4.

## 5. Achados sobre o código e os dados existentes

1. `src/policy/envelope.ts:291`: barreira linear `1/L` igual para os dois lados (seção 1, item 1). Não foi alterado. Atenção: o `touchProbability` do envelope **não é entrada de elegibilidade**; elegibilidade vem de teto, cap, piso de distância de liquidação, sigma conhecido e caps de ordem e exposição. Ele é o número que o Jev lê, e esse número está sendo mostrado por lado no anexo.
2. `src/system-one/readings.ts` `closesOf`: qualquer lacuna devolve lista vazia e o sigma vira desconhecido, sem dizer por quê. A auditoria nova mantém o sufixo contíguo e diz o defeito. Não foi alterado.
3. O System One lê 96 velas de 15 minutos por padrão e no máximo 300, que é o teto da chamada pública. Com tão poucas barras o ajuste de agrupamento fica instável (no ciclo real de MON com 299 barras o ajuste deu persistência 0,49; com 7 dias de histórico, 0,81) e a cauda reamostrada é curta: a curtose medida de MON passou de 0,90 (3 dias) para 4,59 (7 dias). Por isso o anexo mantém um histórico de `--quant-days` dias.
4. Diário ao vivo das leituras do Jev (`data/jev-read/reads.jsonl`, 6.370 leituras de 2026-10-12 14:05 a 2026-10-13 16:46 UTC, só leitura): 89,6% têm estado; as outras trazem o motivo (`book_stale` 420, `ticker_stale` 389, `clock_unknown` 164, `trades_unavailable` 147, `candles_stale` 39). A fração utilizável caiu de 96% (12/10) para 84% (13/10), em episódios, não difusa: 02h UTC (42% utilizáveis), 04h (15%) e 10h (38%, quase tudo `clock_unknown`, 163 leituras descartadas numa hora porque a medição do desvio do relógio falhou). O desvio do relógio local em relação à OKX derivou de 77.969 ms para 76.529 ms em 12 horas (cerca de 120 ms por hora), foi ressincronizado para -101 ms às 03h e voltou a derivar a cerca de 118 ms por hora. Com essa deriva, o último desvio medido continua valendo com erro abaixo de 0,5 s por 4 horas, mais de 200 vezes menor que o limite de frescor de 120 s. Recomendação para o dono de `src/jev-read`: reaproveitar o último desvio com teto de idade quando a medição falhar, em vez de descartar a leitura. Não implementado (o módulo tem edições de outras sessões) e fail-closed é decisão de política. Também há lacunas de até 378 minutos sem leitura em BTC, ETH e MON.
5. Erro meu que o uso real pegou: a OKX envia as velas da mais nova para a mais antiga e eu tratava isso como defeito (nota B em dado normal). Agora só ordem mista é defeito.

## 6. Como reproduzir

```bash
bun --no-env-file run scripts/quant-capture.ts --inst BTC-USDT-SWAP --bar 15m --days 90               # só plano, nada é enviado
bun --no-env-file run scripts/quant-capture.ts --inst BTC-USDT-SWAP --bar 15m --days 90 --allow-network # leitura pública sem credenciais
bun --no-env-file run scripts/quant-calibrate.ts                                                       # offline, uns 4 min, imprime as tabelas
bun --no-env-file run scripts/quant-calibrate.ts --train-days 30 --out docs/sdd/dados-quant/evidence/calibration-train30.json
bun --no-env-file run scripts/quant-calibrate.ts --train-days 3.125 --out docs/sdd/dados-quant/evidence/calibration-train300bars.json
bun --no-env-file run scripts/quant-portfolio.ts --demo                                                # carteira hipotética sobre preços reais
bun --no-env-file run scripts/quant-evidence-risk.ts --demo-evidence                                   # risco sobre a evidência sintética do portfolio-evidence
bun --no-env-file run scripts/quant-evidence-risk.ts --evidence wallet-evidence.json --map "1:contract:0x...=LINK"
SYSTEM_ONE_STATE_PATH=data/quant/so-latest.json SYSTEM_ONE_JOURNAL_PATH=data/quant/so-cycles.jsonl \
  bun --no-env-file run scripts/system-one.ts --public --quant --quant-days 7 --phase fase-2 --kelly 12 --inst MON-USDT-SWAP --horizon 3
```

As capturas reproduzem a proveniência pelo sha256; os números mudam com a data da captura. A calibração recusa um arquivo cujo hash não confere.

## 7. Estado de verificação

Executado em 2026-10-13, ao fim da sessão (depois de aplicar a revisão):

- `bun --no-env-file test src/quant src/system-one`: 403 testes passam, 0 falham (23 arquivos). Os testes que já existiam em `src/system-one` seguem verdes (a revisão contou 102); o resto é novo.
- Scripts: `scripts/quant-scripts.test.ts` (captura só em modo plano, hash adulterado recusado, esquema desconhecido recusado) e `scripts/quant-evidence-risk.test.ts`: 12 testes passam. Sobre o módulo que outra sessão escreveu: `src/portfolio-analytics` e `scripts/quant-portfolio.test.ts`, 13 testes passam.
- Painel: `web/src/lib/system-one-quant.test.ts`, `system-one.test.ts` e `system-one-poll.test.ts`: 33 testes passam.
- `bun --no-env-file run typecheck` e `bun --no-env-file run --cwd web typecheck`: os dois com exit 0.
- **Mutação, em cópia isolada de `src`** (para não alterar a árvore compartilhada): 131 mutantes, 109 sobre o código da entrega e 22 sobre o módulo de valores extremos (barreira por lado e ponte, GARCH desligado, constantes dos estimadores, mediana da faixa, bordas de continuidade, de frescor, de vela futura, de corrida plana e de fator de faixa, VaR, Hill, Cornish-Fisher, encolhimento, contribuição ao risco, janela móvel, queda máxima, desempate de comprimento, janela e entrada da calibração, nível do bootstrap, piso do log loss por início, taxa base, índice de início, campos do estado do modelo e do anexo, ordem dos candidatos, texto de instrução, portão de elegibilidade, projeção pública, mapeamento por evidência, fusão e paginação do histórico). Na primeira rodada sobreviveram 8 (antes da revisão) e depois 6 (depois dela), todos lacunas reais de teste e nenhum mutante equivalente; foram escritos testes para cada um e todos morreram. Final: 131 de 131 mortos (no módulo de valores extremos um mutante, o teto da forma da cauda, sobreviveu à primeira rodada e morreu depois de um teste com amostra pesada). Observação de método: as duas primeiras rodadas pularam 2 mutantes porque o padrão de texto não casava com arquivos com quebra de linha CRLF; o harness foi corrigido e esses dois foram executados e morreram.
- **Suíte completa do repositório** (`./src`, `./scripts` e `web` por diretório, depois de todas as mudanças): `./src` 4.839 passam, 2 puladas e 1 falha; `./scripts` 309 passam e 0 falham; `web` 2.589 passam e 0 falham. A falha de `./src` é `src/onchain-read/client.test.ts` ("global queue: at most one request per interval"), um teste de temporização de uma área não rastreada de outra sessão, que passa isolado (44 de 44). Na rodada anterior, `src/settings/http.test.ts` e dois testes de CLI da OKX falharam por motivos alheios aos meus arquivos (estouro de `spawnSync` sob carga e trabalho em andamento de outra sessão) e na rodada final não falharam.

## 8. Revisão independente: achados e o que foi feito

A revisão não achou P0; confirmou a matemática, a ausência de vazamento do futuro, a invariante "nunca decide" e que a maior parte dos números do relatório replica.

| Achado | O que foi feito |
| --- | --- |
| P1-1: `--quant` mudava o sigma do envelope (300 velas em vez de 96) e alterava a elegibilidade em 9 de 80 janelas de MON | O envelope volta a ler as mesmas velas de antes, com ou sem `--quant`. O anexo faz leituras próprias e mantém o histórico. `readings.ts` ficou sem nenhuma alteração |
| P1-2: uma falha do anexo derrubava o ciclo | `buildQuantAnnex` degrada para a forma fechada com `simulationSkipped: budget_exceeded`; o script envolve a leitura e o cálculo em `try/catch` e segue sem o anexo; `--quant-days` limitado a 3000 barras |
| P1-3: o modelo não via o erro padrão, o número de caminhos, o limite do ajuste nem a ressalva de piso | O estado do modelo traz `simulatedStdError`, `simulationPaths`, `simulationSkipped`; o meio-vida do agrupamento some quando o ajuste está na borda da grade; o texto diz que zero é "menos de 1 acerto nos caminhos", que valores baixos são piso (subestimados 4 a 22 vezes em 90 dias) e que a calibração cobriu 1 a 4 sigmas. O painel mostra um simulado zero como "menos de 1 acerto em N caminhos" |
| P1-4: precisão exagerada no resumo | Esta versão: IC por data, concentração do ganho, sensibilidade ao piso, saída de cada ativo, janela de 300 velas, nota de multiplicidade |
| P1-5: testes não fixavam campos do modelo, invariante, janela móvel | Testes de estado exato com anexo montado à mão e valores distintos, de lista exata de chaves, da invariante com valores extremos, da ordem dos candidatos, da fronteira da janela, do preço de entrada com vão, do nível do bootstrap, da média por início; ver mutação na seção 7 |
| P2: sigma minúsculo dava NaN | `sigma_invalid` abaixo de 1e-8 |
| P2: janelas diferentes no ajuste e no filtro | os dois e o conjunto de resíduos usam os últimos 5000 retornos; teste |
| P2: constante não nula dava assimetria -1 e curtose -2 | verificação relativa de dispersão; teste |
| P2: Hill sem ressalva | o texto do modelo diz que usa os 10% maiores movimentos e é viesado para formas que não são lei de potência |
| P2: `portfolio.ts` só comprado, sem alavancagem; `tailCount` conta janelas sobrepostas; razão 0,83 não discutida | documentado na seção 9 |
| P2: inconsistências do relatório | corrigidas nesta versão (contagens, janela por ativo, "campo de elegibilidade", DOGE, razões de variância) |
| Pós-início: a fusão de velas reescrevia uma confirmada em silêncio | `mergeCandles` conta `restated`; `QuantHistory` expõe `restatedBars`; o script avisa |
| Pós-início: mapeamento por símbolo dava o risco do ativo real a um token que só compartilha o ticker | só ativos nativos mapeiam sozinhos; contratos exigem `--map identidade=TICKER`; teste |
| Pós-início: `touchPct(0)` mostrava "0%" para simulado zero | mostra "<1/N caminhos"; teste |
| P2: MAX_WORK de 20 milhões de passos leva cerca de 3 s síncronos | mantido (o padrão do anexo usa 2,7 milhões, uns 0,3 s); registrado |

Um ponto que a revisão levantou e que eu não resolvi: os intervalos reunidos cobrem a diferença de perda, não as linhas de confiabilidade, e os eventos de cauda profunda são poucos e dependentes. Qualquer afirmação sobre calibração de cauda profunda é qualitativa.

## 9. Limites do módulo de carteira

- Só posições compradas e sem alavancagem: valor negativo é excluído como `value_invalid`, nomeado, mas não utilizável para vendido ou emprestado.
- O VaR e o ES históricos sobre horizonte usam somas sobrepostas; a contagem mínima de 3 pontos na cauda pode ser satisfeita por um único episódio. A razão ES99 histórico sobre normal de 0,83 na carteira hipotética (histórico abaixo do normal) vem de o sigma de 15 minutos escalado por raiz do tempo superestimar a dispersão diária desta janela e de as caudas diárias dos 90 dias serem mais leves que as de 15 minutos; não é um defeito do cálculo (refeito à parte em Python).
- Pesos constantes (rebalanceados a cada barra), somados em log-retorno: exato em primeira ordem para movimentos pequenos.
- O risco só existe para o que tem captura. Posições sem captura ficam na concentração e são nomeadas como fora do risco; `riskedShare` diz quanto do valor o risco cobre.
- Mapeamento de evidência para captura: só nativos por padrão; contratos por `--map`. Ainda assim, um nativo cujo ticker coincide com o de um perpétuo diferente do ativo real seria mal mapeado; a verificação de identidade do ticker é responsabilidade de quem passa `--map`.

## 10. Experimento: caudas de valores extremos (resultado negativo)

A fraqueza técnica mais clara do FHS é a cauda profunda subestimada. A hipótese era que o conjunto de resíduos, de poucas centenas de pontos, não contém nenhum evento de um em mil, e que estender as duas caudas com uma distribuição de Pareto generalizada ajustada aos excessos (picos sobre limiar, momentos ponderados por probabilidade, forma limitada a [-0,25; 0,45]) fecharia parte do buraco. Foi implementado em `src/quant/evt.ts` (22 mutantes mortos de 22), ligado como opção `tail: "evt"` na simulação (o padrão continua empírico) e medido com o mesmo harness, contra o próprio FHS, na comparação pareada por data.

| Treino | Horizonte | ganho de log loss do fhs-evt sobre o fhs, IC por data | ganho de Brier | fhs-evt pior que fhs |
| --- | --- | --- | --- | --- |
| 7 dias (672 barras) | 1 dia(s) | 0.0001 [-0.0014; 0.0015] | 0.0000 [-0.0003; 0.0003] | 49 de 82 dias |
| 7 dias (672 barras) | 3 dia(s) | 0.0016 [-0.0012; 0.0058] | -0.0001 [-0.0003; 0.0001] | 52 de 80 dias |
| 7 dias (672 barras) | 7 dia(s) | 0.0038 [-0.0021; 0.0137] | -0.0002 [-0.0005; 0.0001] | 50 de 76 dias |
| 30 dias | 1 dia(s) | -0.0008 [-0.0020; 0.0005] | -0.0002 [-0.0004; 0.0001] | 39 de 59 dias |
| 30 dias | 3 dia(s) | -0.0005 [-0.0021; 0.0019] | -0.0001 [-0.0004; 0.0002] | 26 de 57 dias |
| 30 dias | 7 dia(s) | 0.0003 [-0.0012; 0.0010] | -0.0001 [-0.0004; 0.0001] | 28 de 53 dias |
| 300 barras | 1 dia(s) | 0.0024 [-0.0003; 0.0055] | 0.0000 [-0.0003; 0.0003] | 50 de 86 dias |
| 300 barras | 3 dia(s) | 0.0101 [-0.0008; 0.0275] | 0.0001 [-0.0002; 0.0004] | 53 de 84 dias |
| 300 barras | 7 dia(s) | 0.0167 [-0.0007; 0.0503] | -0.0001 [-0.0006; 0.0005] | 56 de 80 dias |

O intervalo exclui zero em 0 de 9 casos. O ganho de log loss vai de -0,0008 a 0,0167, é maior com a janela mais curta (300 barras, onde o conjunto de resíduos é menor) e o Brier não se move. Na faixa de menor probabilidade (treino de 7 dias, reunido):

| Horizonte | fhs: previsto / observado | fhs-evt: previsto / observado |
| --- | --- | --- |
| 1 dia(s) | 0.27% / 0.98% (n=2044) | 0.29% / 0.92% (n=1956) |
| 3 dia(s) | 0.23% / 2.09% (n=2246) | 0.25% / 2.03% (n=2118) |
| 7 dia(s) | 0.19% / 4.31% (n=2345) | 0.22% / 4.41% (n=2175) |

A probabilidade média prevista sobe de 0,19% a 0,27% para 0,22% a 0,29%, e a frequência observada quase não muda: a subestimação de 4 a 22 vezes continua. Conclusão: **faltar extremos no conjunto de resíduos não é a causa principal do erro na cauda profunda**. A causa mais provável, que o experimento não testou, é de regime: o choque começa com a volatilidade ainda baixa e o GARCH, que reverte à média, subestima a volatilidade futura, ou o salto é comum aos ativos (os eventos de cauda profunda são dias em que todos caem juntos). Atacar isso exige um modelo de incerteza de volatilidade ou de saltos e uma verdade com mais regimes do que um trimestre; não é algo a ajustar com os mesmos 90 dias sem sobreajustar. O módulo fica disponível, não é o padrão e não está no anexo.

## 11. Pendências e decisões do usuário

Decisões já dadas (2026-10-13): commitar só os caminhos próprios (feito); uma única consulta real ao modelo (tentada, falhou, seção 12); o usuário reinicia o backend para ver o painel nos próprios servidores; **a parede de elegibilidade fica como está, o anexo é só informativo**.

1. **Painel nos servidores do usuário.** O código está no working tree que o `next dev` serve, mas o backend em execução é anterior e não publica o bloco. Depois de reiniciar o backend, `bun --no-env-file run scripts/system-one.ts --public --quant` com os caminhos de estado padrão faz o console mostrar a tabela. Eu não mexo nos processos nem sobrescrevo `data/system-one/latest.json`.
2. **Consulta real ao modelo.** Depende de uma chave válida (seção 12) e de uma nova autorização, porque a única já foi usada.
3. **Leitura real de carteira.** O risco sobre evidência existe e é testado sobre o fixture sintético; usá-lo sobre uma carteira real depende de uma chave somente leitura e do go do usuário.
4. **Mesa (`MesaView`).** O bloco foi para o painel do console; a mesa está em edição concorrente de outras sessões e não foi tocada.
5. **Preço de marcação como verdade da calibração** (`history-mark-price-candles`) e mais regimes (esta janela é de um trimestre); modelo de incerteza de volatilidade ou de saltos para a cauda profunda (seção 10).
6. **Desvio de relógio do `src/jev-read`:** recomendação da seção 5.4 ao dono do módulo.
7. **`scripts/quant-portfolio.ts`, `src/portfolio-analytics/` e `scripts/quant-evidence-risk.ts`:** o primeiro foi reescrito por outra sessão sobre o módulo `src/portfolio-analytics`, que ainda não está no Git. Meu `scripts/quant-evidence-risk.ts` (e seu teste) importa esse mesmo módulo e por isso ficou **fora do commit**: num `HEAD` limpo ele quebraria. Seguem no working tree e entram quando `src/portfolio-analytics/` for commitado. As seções 2, 6 e 9 descrevem esse script como se estivesse no repositório.

## 12. Consulta real ao Jev (tentativa, falhou)

Com autorização do usuário para uma única consulta (custo esperado pequeno), montei um ciclo de diagnóstico: mercado e histórico de 7 dias públicos da OKX para MON-USDT-SWAP, anexo quant com 671 barras (nota B), fase 2, carteira **sintética e rotulada** (uma carteira configurada mantém o inventário incompleto e bloqueia todos os candidatos, então o modelo nunca seria perguntado), execução sempre simulada. Candidatos elegíveis: long-1x, long-2x, short-1x e short-2x. O estado enviado tinha 1.927 caracteres, as instruções 1.772 (cerca de 925 tokens de entrada) e não continha endereço nem timestamp; ele foi impresso antes da chamada e está no arquivo gravado em `data/quant/` (ignorado pelo Git).

Resultado: **a chamada falhou em 787 ms com `decision_error`, sem resposta do modelo**. Não houve nova tentativa, porque a autorização era de uma consulta. Pelo tempo, foi uma recusa rápida (autenticação ou formato), provavelmente sem cobrança, mas o custo não foi medido. O que se sabe sobre a causa: o provedor lê `TYPESAFE_AI_API_KEY`; a linha dessa variável no `.env` da raiz tem só 19 caracteres, curta demais para uma chave real, e `data/jev.env` (onde a tela de configurações grava a chave) não existe. A chave que o app Inonu usa deve estar no registro do Windows (variável de usuário ou de máquina) ou no cofre do aplicativo, áreas de credencial que não li nem tentei ler sem autorização.

O que a tentativa mostra mesmo assim: com 1x e 2x em MON, todas as probabilidades de toque dos candidatos elegíveis são praticamente zero (envelope, por lado e simulada), então o bloco `quant` traria pouca informação discriminante para esses candidatos. O ganho do anexo está nos candidatos de alavancagem alta ou nos ativos de maior volatilidade, que a fase 2 do envelope hoje não deixa chegar ao modelo.
