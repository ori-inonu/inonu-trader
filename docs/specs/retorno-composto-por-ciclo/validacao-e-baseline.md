# Linha de base, gargalos e protocolo de validação

Data: 2026-10-17. Fontes: [evidence/pesquisa-t12-linha-de-base.md](evidence/pesquisa-t12-linha-de-base.md), [evidence/pesquisa-t11-validacao-e-risco.md](evidence/pesquisa-t11-validacao-e-risco.md), lacunas g2 e g3. Os arquivos brutos (`audits.jsonl`, `execution-latest.json`, `fills.jsonl`, `decisions-meta.jsonl`, `usage-*.json`) vivem em `data/` ou fora do repositório e foram lidos pelos agentes só como agregados, sem campos de carteira; não os reabri. Nenhum endereço ou hash completo é citado aqui.

## 1. Linha de base numérica

| Item | Valor | Estado |
| --- | --- | --- |
| Janela auditada | 2026-10-14 19:13 UTC a 2026-10-15 00:52 UTC (cerca de 5,6 h); 280 linhas, 262 decididas, 17 mantidas, 1 bloqueada | medido |
| Motivos de não decidir | `nada_a_decidir` 11, `sem_candidatos` 6, `carteira_antiga` 1 | medido |
| Funil de compra (103 consultas retidas) | 717 candidatos; 411 fechados antes da escolha do modelo (57,3%); 268 pulados pelo modelo (37%); 38 compras pedidas; 10 mantidas; 28 trocadas para `skip` pelo código | medido |
| Escolha do modelo em linhas de candidato | 14 `buy_full` em 752 linhas de `model_choice` (1,86%); 0,77% se contadas todas as 1822 linhas, que incluem 1023 fechadas antes da escolha e 47 ajustadas pelo código | medido, com rótulo corrigido pelo cético |
| Ordens reais | 116 no ledger: 7 compras com sucesso, 2 falhadas, 14 vendas com sucesso, 3 falhadas, 1 desconhecida, 89 vendas preparadas sem estado final | medido |
| Voltas completas | 7 (STONK 6, HOTBOT 1); todas negativas na perna de caixa antes do SOL; soma de -0,316407 USDC sobre cerca de US$ 77 a 78 (-0,41%; cerca de -0,62% com a rede em SOL); 0 de 7 positivas | medido |
| Preenchimentos | 25 (análise de 15/10) ou 26 (captura de 16/10), hashes iguais: a diferença não foi reconciliada | divergente |
| Patrimônio e retorno não realizado | não avaliados: `knownValueUsd` 0, `valueComplete` false, `netUsd` nulo | medido |
| Capital | US$ 100 (`capitalUsd`, origem configurada), 118 (diagnóstico e medição de 15/10: 118,17 a 118,80), 121 (`capacidades-okx.md`, `ALAVANCAGEM-VIABILIDADE`), 126 (`design.md`) | a conciliar |
| Custo de rede | mediana de 85.427 lamports (cerca de US$ 0,009) em 21 ordens; recibo de 97.859 lamports; cotação de US$ 0,0005 | medido, 20 vezes de diferença |
| Atrito por classe | líquido 0,17% a 0,56% (média 0,42%, 6 pares de um ativo); intermediário 1,82% (1 par); raso pelo menos 2,1% só na entrada | medido, n mínimo |
| Cota Free | Basic projeta acima do teto (109,5 mil em 15/10; cerca de 158 mil em 17/10, linear de dia parcial); Premium cerca de 30% do teto em 15/10 | alerta, não medida |
| Ciclo | 120 s nominais quentes, 300 s frios; 37,5 s num ciclo; intervalo mediano 135,6 s | amostra mínima |
| Simulação de papel MON | 607.748 linhas entre 9 e 17/10, 3456 compras, 784 vendas, 0 preenchimentos; o campo `totals` da última linha é inconsistente com acumulado | **não confiável** |

Observação de rigor: três defeitos de dado já reproduzidos por teste (cache de momentum congelando a idade, imposto como fração comparado com teto numérico, revisão de fechamento com 3 falhas) foram corrigidos ou estão em trabalho, segundo `diagnostico-compras-20261014.md`.

## 2. Os 10 maiores gargalos entre a linha de base e a meta

Ordenados por impacto, com condição para fechar e medida.

| # | Gargalo | Condição para fechar | Medida |
| --- | --- | --- | --- |
| G1 | 57% dos candidatos fecham antes de chegar ao Jev; o modelo escolhe compra em 1,86% das linhas de escolha | todo candidato com dado suficiente chega ao Jev em cada janela, ou os fechados têm markout pior que os escolhidos | parcela de candidatos fechados antes da escolha por motivo; markout dos fechados contra os escolhidos |
| G2 | edge não comprovado: 0 de 7 voltas positivas | retorno líquido positivo em amostra fora da janela de seleção, com custo medido | retorno por volta com intervalo de confiança, em sombra |
| G3 | atrito acima do movimento em ativos rasos; mediana de movimento de 1 min de 0,38% | operar só onde o movimento esperado supera o atrito medido com margem | fração de movimentos acima do atrito por classe de liquidez e janela |
| G4 | precisão direcional necessária de cerca de 90% em 5 min (atrito de 0,5%); 74% em 15 min; 61% em 60 min; sem solução com atrito de 1% em 5 min | medir a precisão direcional do Jev contra o movimento futuro | acerto por janela com intervalo de confiança |
| G5 | cadência: 1440 consultas por dia é o dobro do teto local de 720; agendador espera depois do trabalho | decisão por evento dentro do teto e cota real da organização conhecida | consultas por dia, intervalo real entre decisões, tokens por consulta |
| G6 | dados com até 30 min de idade (reuso do scan de 30 min, 5 min com gancho quente, até 2 h se falhar); em 33% a 39% dos pares o Brief diverge do mercado em mais de 2 pontos | idade máxima por fato e recusa de fato vencido | idade de cada fato usado na decisão; divergência contra velas públicas |
| G7 | capital pequeno e piso de ordem: risco de 2% por ordem dá cerca de US$ 2, abaixo do piso de US$ 10 citado no código; há divergência de datas sobre se o piso foi removido; as cotações aceitaram 2, 5 e 10 USDC | decidir o piso com custo medido por tamanho | custo total em % por tamanho de entrada e taxa de execução por tamanho |
| G8 | custos não precificados e patrimônio não avaliado (rede 20 vezes abaixo da medida, conta de token fora do líquido, SOL não precificado) | patrimônio avaliado com todas as pernas e custos | retorno líquido em USD por ciclo, com cobertura declarada |
| G9 | cota de API: Basic acima do teto, RPS do Market não publicado, WebSocket só em plano pago | contador por rota e limite confirmado com o suporte | consultas por rota por dia; erros 50011 e 429 |
| G10 | divergências documentais: capital de US$ 100, 118, 121 e 126; alavancagem autorizada em um documento e fora em outro (ADENDO-B seção 8 contra `capacidades-okx.md`, que registra a decisão mais recente de 2026-10-15: spot, Solana) | uma base de capital conciliada e uma fonte única da decisão de alavancagem | capital conciliado com a carteira em cada ciclo |

## 3. Protocolo de validação em portões

O repositório já tem a base: o replay contábil declara `evidenceKind accounting-replay-only`, `strategyQualified` e `financiallyAuthorized` sempre falsos e exige manifesto com holdout, custos conhecidos e baselines (`cash`, `hold-initial-inventory`, `simple-maker`) (`docs/BACKTEST-EVIDENCE.md`); o backtest de oportunidades usa candles diários e custo de 0,2% por volta (`scripts/opportunity-backtest.ts`); a medição online registra `initialUsd 118`, `targetUsd 1180`, prazo de 24 h, `status not_proven`, `optimizationEligible false` e `financiallyAuthorized false` e admite que falta série integral conciliada (`scripts/autoresearch.ts:56-69`).

| Portão | O que prova | Critério mínimo |
| --- | --- | --- |
| G0 Auditoria de dados | os insumos existem e conciliam | capital conciliado; 25 e 26 preenchimentos reconciliados; arquivos brutos localizados; patrimônio com `valueComplete` verdadeiro |
| G1 Replay contábil | custo e execução reproduzíveis | manifesto v1 com holdout e custos conhecidos; sem promoção |
| G2 Sombra com custo real | retorno líquido por ciclo e por janela | amostra por efeito a detectar (800 a 3200 ciclos para 0,1%; menos para efeitos maiores); custo decomposto; amostras não sobrepostas; por classe de liquidez |
| G3 Correção de seleção | o resultado não é ruído de busca | Deflated Sharpe (Bailey e López de Prado, 2014), probabilidade de overfitting do backtest (Bailey, Borwein, López de Prado e Zhu, 2017), walk-forward e holdout congelado; contar **todas** as variantes testadas |
| G4 Dono | autorização de qualquer mudança no vivo | decisão explícita e por escrito do dono; nada em G0 a G3 autoriza operação |

O DSR exige estimar o número de tentativas independentes, o que é frágil quando as tentativas são correlacionadas: registrar cada variante testada desde o início. A literatura aponta que um holdout simples é pouco confiável (PBO); preferir validação cruzada combinatória quando houver dados.

## 4. Métricas mínimas por ciclo

1. Retorno líquido em USD e em % do patrimônio avaliado, com cobertura declarada.
2. Componentes de custo por operação: taxa do pool, impacto, rede, prioridade, gorjeta, aluguel de conta.
3. Latência por etapa: origem do dado, recebimento, fechamento de barra, Brief, resposta do Jev, cotação, assinatura, envio, recibo (p50, p95, p99).
4. Idade de cada fato usado na decisão; fração do universo com dado fresco.
5. Precisão direcional por janela (1, 5, 15 min) com intervalo de confiança; markout de 1, 5 e 15 min das escolhidas e das fechadas antes da escolha.
6. Consultas ao Jev por dia, tokens por consulta, chamadas à OnchainOS por rota, erros 50011 e 429, hit de cache.
7. Frequência de janelas capturadas (lambda) e retorno líquido por janela (R).
8. Oportunidades expiradas no caminho e ordens recusadas por impacto (hoje invisíveis; 8 de 13 num dia).

## 5. Dimensionamento e risco (apenas opções)

Limites de risco e dimensionamento são **decisão do dono** e o dono removeu tetos de código em 2026-10-14 (ADENDO-B). Opções registradas, nenhuma adotada: Kelly fracionado (0,1 a 0,25) sobre um mu encolhido, teto por trade em fração da profundidade da pool, parada por drawdown, abstenção quando a expectativa líquida estimada é negativa. Ver a leitura de Kelly em [matematica-da-meta.md](matematica-da-meta.md), seção 8.

Risco de duplicação de cota local (evidência sintética em `docs/specs/inteligencia-ciclos-jev/spec.md`): a política de retry do código 50102 pode disparar um segundo `fetch` 17 ms depois do primeiro, sem respeitar o `minIntervalMs` de 1100 ms, e levar a `used` 2 com `cap` 1. Não prova violação da cota oficial.
