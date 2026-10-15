# Dados necessários para decisões financeiras verificáveis

Este diagnóstico complementa a entrega de interface [CONNECTIVITY-SPEC-20261013.md](CONNECTIVITY-SPEC-20261013.md). Não autoriza ordens, novos envios de dados, alterações em zonas concorrentes ou alegações de ganho. O objetivo observado é gestão de carteira com poucas informações úteis e resultado financeiro mensurável.

## O que a inteligência recebe hoje

`src/inonu/portfolio.ts` prepara a identidade por rede e contrato e, por ativo, símbolo, saldo, fluxo comprador, risco, idade, lacunas e origem. O Jev remoto escolhe comprar, manter, vender ou abster. A validação protege identidade, formato e venda sem posição. A resposta é consultiva e declara `execution: never`.

O patrimônio exibido no navegador não entra nessa avaliação: a preparação declara patrimônio e custo de aquisição desconhecidos. Candles e preços coletados não entram no Brief de carteira. Também não entram tamanho de ordem, gás, spread, impacto ou slippage. Portanto a resposta atual não representa uma otimização de alocação nem uma estimativa de lucro líquido.

| Lacuna observada | Consequência | Menor melhoria verificável |
| --- | --- | --- |
| Plano genérico divide até 15 chamadas entre tokens; risco vem depois de preço, candles e fluxo | Em carteiras com vários tokens, fontes essenciais podem ficar fora do orçamento enquanto dados não utilizados são coletados | Planejador específico que priorize apenas evidências consumidas de fluxo e risco, com contagem real de saídas |
| Idade e estado stale por fonte se perdem na projeção resumida | A janela recente do saldo não comprova que o mercado usado também seja recente | Preservar origem, idade, stale e ausência por campo; dados essenciais inválidos tornam a decisão não utilizável com motivo |
| Fluxo comprador é uma proporção observada | Pode ser confundido com confiança preditiva | Rotular como dado de fluxo, sem probabilidade inventada; calibrar somente com resultados futuros observados |
| A carteira não registra custo de aquisição e custos completos de operação | Não é possível calcular PnL realizado ou retorno líquido da recomendação | Registrar base de custo com cobertura declarada e custos conhecidos/desconhecidos separadamente |
| O diário de resultados atual recebe a decisão de ativo, não a resposta de carteira | Falta acompanhamento longitudinal para comparar as decisões da carteira com manter as posições | Diário local versionado de snapshot, evidências, decisão e resultado posterior; avaliação sem ordens reais |
| Não há treinamento local e avaliação fora da amostra nesse caminho | A integração Jev não comprova vantagem de um modelo preditivo local | Avaliar uma hipótese finita em dados temporais reais, separando treino e avaliação, com baseline, taxas e drawdown |
| Preços de tokens da API podem estar ausentes | Custo USD do modelo pode permanecer desconhecido | Manter `null` visível; somente calcular custo com usage e preços verificáveis |

## Sequência técnica proposta, sem execução adicional

Primeiro fechar a consulta real já autorizada na versão atual. Depois qualificar a evidência efetivamente consumida e registrar decisões localmente para medir resultados líquidos frente a manter a carteira, incluindo perdas e drawdown. Usar esses resultados para aceitar ou rejeitar uma hipótese de ML. Operação autônoma depende de contratos próprios de exposição, limites e execução; uma resposta de análise não ativa o operador.

Nenhuma evidência desta entrega demonstra que uma compra ou venda específica fará o capital crescer. Preservar a abstenção quando a informação não sustenta uma decisão e medir o resultado é parte do objetivo financeiro, não um resultado financeiro já obtido.

## Proveniência e versões

Auditoria somente leitura do auxiliar `okx_research`: `C:/Users/gabri/.codex/tmp/okx-research-01a136cd/PORTFOLIO-DECISION.md`, SHA-256 `9c5072ada2c0db65dfd08503edb11a9dcb69dc30d3c3cd44cff6133243c8adae`. Referências de código no diagnóstico: `src/inonu/portfolio.ts`, `src/inonu/ask.ts`, `src/inonu/jev-model.ts`, `src/desktop/handlers.ts` e o plano/cache OnchainOS. A auditoria não editou esses módulos reservados.

Hashes de backend examinados: `portfolio.ts` `d5b4dd1d355062089a5889cb287b0588153a04a2af6c4abab4c5a079eeb5d4e2`; `ask.ts` `27961fcd5b6ec54c7198520d5509aaea7a7c6d7bd17369df55202e40cf070cc5`; `jev-model.ts` `aad8f78c59cadb0b03bde61c74c08ee602e77ecb70e589b656554331e9509602`.

Conclusões antigas do auxiliar sobre duas consultas de carteira na doca, ausência de encaminhamento do radar, texto de lacuna e ausência de contagem de excluídos foram superadas pela implementação de interface atual. O restante é um diagnóstico do backend observado; revalidar hashes antes de uma implementação posterior.
