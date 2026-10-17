---
title: "Autoresearch de decisoes: especificacao do benchmark offline"
created: 2026-10-16
updated: 2026-10-16
type: summary
tags: ["jev", "pesquisa", "evidencia", "backtest"]
sources: ["docs/sdd/agente-autonomo/ADENDO-G-hipoteses-em-sombra-20261015.md", "docs/sdd/agente-autonomo/ADENDO-H-alocacao-da-carteira-20261015.md"]
confidence: medium
---

# Autoresearch de decisoes: benchmark offline

> Historico superado: o usuario determinou autoresearch somente com dados reais online. O procedimento vigente esta em [autoresearch real online](../autoresearch-real-online/spec.md). Os resultados e contratos abaixo documentam apenas a baseline anterior, nao instrucoes atuais.

## Contexto e objetivo

O dono pediu metricas, evals e ciclos de melhoria da decisao JEV, com analise dos pontos fracos de todas as superficies do painel e foco em retorno liquido e gestao da carteira OKX Wallet/OnchainOS. US$ 118 para US$ 1.180 em menos de 24 horas corresponde a 10x e 900% liquidos. E um alvo de pesquisa, nao promessa, evidencia existente ou autorizacao financeira.

Esta entrega e a Fase 1 do autoresearch: preparar, executar e registrar uma baseline deterministica. Nao altera o agente vivo nem otimiza a politica nesta fase.
Navegacao: [[inteligencia-e-resultados]] e [[laboratorio-e-paper]]. [Plano](plan.md), [tarefas](tasks.md) e [estado e verificacao](status.md).


## Evidencia e limites

- Capturas publicas locais OKX de candles 15m contem janelas continuas maiores que 24h. Preco de mercado nao e execucao da carteira nem preco executavel DEX. A origem e declarada pelo produtor, nao autenticada independentemente.
- Projecao local do auditor: 21 fills exatos, sete round trips e zero resultados net USD conhecidos. Taxas nativas sem cambio contemporaneo nao viram custo USD zero.
- Projecao de evolucao: 840 experiencias pendentes e zero outcomes maduros. Estes agregados nao demonstram vantagem financeira.
- A avaliacao canonica nao consulta fontes mutaveis em data/, API, modelo ou relogio atual. Usa snapshot sanitizado versionado e workload sintetico com seed fixa.
- O laboratorio existente tem custos CEX proxy e contrafactuais simplificados de alavancagem. Nenhum deles qualifica swaps, margem ou liquidacao OKX Wallet/OnchainOS.
- Regras de referencia e respostas sinteticas nao sao o JEV. Repetir escolhas gravadas nao mede melhoria de um prompt novo. Nao usar pesos Choice em Brier/logloss como probabilidade de lucro.

## Metricas

Primaria de desenvolvimento: `synthetic_paired_net_return_bps`, media de diferencas pareadas de retorno liquido sobre capital, candidato menos politica ancestral fixa, nos mesmos epochs sinteticos elegiveis e com custos completos. Unidade bps; maior e melhor. A baseline reproduz a politica ancestral, sem otimizacao. Nao e lucro real nem retorno de uma carteira composta.

Secundarias separadas: retorno bruto e liquido proxy, custos, cobertura, numero de pares, drawdown, exposicao/caixa, giro, recusas, faltas de marca/custo e contrafactuais de alavancagem quando disponiveis. Nao agregar risco e retorno em nota opaca. Numeros financeiros sinteticos e observados jamais se misturam.

Um stress de carteira executa o nucleo `src/agent/shadow/sim-portfolio.ts` com cotacoes e custos sinteticos conhecidos e faltantes, incluindo saldo disputado, custo de conta, ausencia de marca e recusa. Deve manter dinheiro desconhecido como desconhecido.

Cada execucao lista o inventario dos campos do painel, unidade, origem, disponibilidade, valor ou motivo de ausencia e evidencia observada/sintetica. Campos nao observaveis no snapshot permanecem null; nao se inventa latencia, reserva, funding, exposicao, PnL ou uso de API. Pontos fracos devem ser derivados de lacunas/resultados, nao de metas arbitrarias de compra ou ocupacao de caixa.

## Ciclo e separacao temporal

1. Congelar dados, politica ancestral, avaliador, custos, seed e inventario de metricas como uma baseline identificada por hashes.
2. Executar sempre a mesma carga. Alterar apenas a politica candidata isolada durante desenvolvimento; analisar separadamente retorno, custos, risco, cobertura e regressao operacional.
3. Nao selecionar por mais ordens, capital ocupado, preferencia Choice ou retorno bruto. Nao editar fixture/avaliador para melhorar o placar.
4. Resultados repetidamente consultados sao desenvolvimento, nunca holdout. Promocao exige coleta prospectiva qualificada e holdout reservado segundo ADENDO-G/H: custos completos, carteira B propria depois da divergencia, blocos de dia, amostra e inferencia pre-registradas. Este benchmark nao concede promocao.
5. Uma mudanca no prompt exige respostas JEV novas e evidenciadas em fatos disponiveis naquele instante. Isso nao e produzido pelo replay offline nem por um modelo ficticio.

## Aceitacao

- `bash autoresearch.sh` termina com zero, executa decisoes/outcomes e carteira, e imprime uma unica linha da metrica primaria, alem das secundarias finitas.
- Duas execucoes produzem a mesma saida e hashes; nenhuma rede, chamada paga, leitura de credenciais ou escrita financeira.
- Candidato recebe somente fatos point-in-time; o avaliador conserva o futuro fora da entrada da politica.
- Dados reais, sinteticos, proxy e ausentes sao identificados em cada ciclo; todas as metricas inventariadas do painel recebem estado, inclusive as indisponiveis.
- Meta 10x/24h fica explicitamente nao demonstrada enquanto nao houver serie de carteira completa, fluxos externos conciliados, fills e custos completos contemporaneos.
- Verificacao pertinente, smoke real do comando e revisao independente antecedem `init_experiment`.

## Nao objetivos e restricoes

Sem trades reais, assinaturas, chaves, autorizacao, aumento de risco/alavancagem, deps novas, schema/migracao ou edicao manual de data/. Sem otimizacao antes da baseline. Sem promessa de rentabilidade. Sem mudancas no web/ ou no executor. Referencias: ADENDO-G, ADENDO-H, AUTOEVOLUCAO-20261014 e JEV-LABORATORIO-DE-DECISAO.
