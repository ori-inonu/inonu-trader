# Dados e risco quantitativo: SPEC

Objetivo da sessão (meta `/goal` de 2026-10-13): melhorar o tratamento e a qualidade dos dados e a inteligência estatística que alimenta a decisão do Jev sobre carteira e alavancagem. Esta SPEC cobre um módulo novo, `src/quant/`, puro e testável offline. Escopo proporcional: sem E/S, sem rede, sem modelo, sem credencial, sem execução.

## Por que (achados verificados no código de `main`)

1. `src/system-one/volatility.ts`: sigma só por desvio padrão de fechamento a fechamento. Ignora a máxima e a mínima de cada vela (estimadores de faixa são de 5 a 8 vezes mais eficientes), não pondera o presente (agrupamento de volatilidade) e uma única vela corrompida pode dominar o resultado.
2. `src/system-one/readings.ts` `closesOf`: qualquer lacuna ou fechamento inválido devolve lista vazia e o sigma vira desconhecido. Segurança correta, mas sem dizer qual defeito houve nem aproveitar o trecho contíguo e limpo mais recente.
3. `src/policy/envelope.ts:291` `touchLiquidationProbability` usa a distância linear `1/L` como barreira e a mesma probabilidade para comprado e vendido. Em log-preço a barreira do comprado é `ln(1 - 1/L)` e a do vendido é `ln(1 + 1/L)`. Em 2x o comprado tem barreira 0,693 e o vendido 0,405: o cálculo atual superestima o risco do comprado e subestima o do vendido, e o brief mostra o mesmo número aos dois lados. Além disso a hipótese é gaussiana, e cripto tem caudas pesadas.
4. Nada no repositório mede cauda (curtose, índice de Hill, VaR/ES) nem calibração (Brier, log loss) das probabilidades que o Jev lê, e não existe análise de risco de carteira (concentração, correlação, contribuição ao risco).

`src/policy/envelope.ts` não é alterado: ele define as paredes da fase e tem 1063 linhas de teste. O módulo novo calcula ao lado, e a diferença fica visível e medida.

## Princípios que não mudam

- O Jev decide. O módulo só produz evidência numérica rotulada. Nenhuma saída contém ordem, compra, venda, recomendação ou escolha de candidato.
- Desconhecido nunca vira zero. Dado insuficiente devolve `null` com motivo.
- Determinismo: mesma entrada, mesma saída. Aleatoriedade só por semente explícita (`mulberry32`). Sem `Date.now`, sem `Math.random`.
- Nenhum `fetch`, `node:fs`, `process.env`, importação de assinante, executor ou modelo dentro de `src/quant/` (teste de varredura de pureza).
- Probabilidade é peso de decisão sobre um modelo declarado, não taxa de acerto. A medição real de calibração fica no relatório de evidência, com a origem dos dados.

## Requisitos (EARS)

| ID | Requisito | Aceitação independente |
| --- | --- | --- |
| Q-01 | Quando velas OHLC forem auditadas, o sistema deve reportar duplicidade, desordem, fora de grade, lacunas, OHLC incoerente, não finito ou não positivo, vela não confirmada, cauda vencida, retorno atípico (mediana e MAD) e corridas de velas planas, sem reparar nada em silêncio. | Um caso positivo e um negativo por defeito; `usable` só contém o sufixo contíguo, confirmado e estruturalmente válido mais recente; velas atípicas permanecem na série e são marcadas. |
| Q-02 | Quando houver velas utilizáveis suficientes, o sistema deve estimar sigma diário por fechamento a fechamento, Parkinson, Garman-Klass, Rogers-Satchell, Yang-Zhang, EWMA e MAD robusto, e compor uma faixa (baixo, central, alto, dispersão, regime). | Cada estimador contra valor calculado à mão em vetor pequeno; em passeio gaussiano de sigma conhecido os estimadores recuperam sigma dentro de tolerância declarada; estimador de faixa tem variância menor que o de fechamento na mesma amostra sintética; poucos retornos, vela inválida ou sigma zero dão `null` com motivo. |
| Q-03 | Quando houver retornos, o sistema deve medir assimetria, curtose em excesso, índice de cauda de Hill, VaR e ES históricos e VaR de Cornish-Fisher. | Vetores calculados à mão; amostra t de Student de 3 graus dá curtose alta e Hill próximo de 3; amostra gaussiana dá curtose próxima de 0. |
| Q-04 | Quando o risco de liquidação de um candidato for pedido, o sistema deve calcular a probabilidade de tocar a liquidação no horizonte por lado, com barreira em log-preço, de duas formas: analítica gaussiana com deriva declarada e simulação de reamostragem filtrada (FHS) com correção de ponte entre amostras. | Analítica contra simulação gaussiana concordam dentro de tolerância; comprado e vendido diferem na mesma alavancagem e um comprado a 3x coincide com um vendido a 2x (mesma barreira em log-preço); um comprado a 1x não pode ser liquidado; semente igual dá resultado idêntico; mais alavancagem nunca reduz a probabilidade; amostra de cauda pesada com mesma variância dá probabilidade maior que a gaussiana em barreira distante; entrada inválida falha com erro constante. |
| Q-05 | Quando previsões de probabilidade e desfechos forem dados, o sistema deve calcular Brier, log loss, tabela de confiabilidade e uma avaliação pareada em janela móvel (walk-forward) sem olhar o futuro. | Valores à mão; vazamento do futuro provado por teste (alterar velas futuras não muda a previsão do passado); comparação pareada usa os mesmos eventos para os dois métodos. |
| Q-06 | Quando posições avaliadas forem dadas, o sistema deve calcular peso, concentração (HHI, N efetivo, maior fatia), cobertura de valor, covariância com encolhimento, volatilidade, VaR e ES paramétricos, contribuição ao risco, razão de diversificação e perda máxima. | Vetores à mão; contribuições somam o risco total; posição sem valor sai do cálculo e a cobertura cai, nunca vira zero; sem retornos suficientes o risco é `null`. |
| Q-07 | Onde o System One for chamado com a opção `quant`, o sistema deve anexar ao brief um anexo aditivo (nota dos dados, faixa de sigma, forma da cauda, probabilidade de toque por lado em duas formas, erro padrão e caminhos simulados) sem alterar elegibilidade, envelope, escolha nem as velas que o envelope lê, e uma falha do anexo não deve suprimir o ciclo. | Testes existentes do System One verdes; sem a opção a saída e o texto ao modelo são idênticos byte a byte; com valores extremos no anexo, elegibilidade, escolha, probabilidades e execução não mudam; o anexo tem exatamente as chaves permitidas e nunca contém ordem, compra, venda, recomendação ou escolha; simulação acima do orçamento degrada para a forma fechada. |
| Q-08 | O módulo deve ser puro e determinístico. | Teste de varredura de imports e identificadores proibidos; duas execuções com a mesma entrada geram o mesmo hash. |
| Q-09 | Quando a medição pareada for feita com velas reais públicas da OKX, o relatório deve registrar origem, janela, hash do conjunto, métrica e limites, e rotular qualquer dado sintético como tal. | `docs/sdd/dados-quant/REPORT.md` com números reproduzíveis por comando; nenhum ganho afirmado sem a medição. |
| Q-10 | Onde o anexo for pedido, o sistema deve manter um histórico de velas de vários dias em memória, lendo o histórico paginado só quando a sequência contígua mais recente é menor que o alvo, sem rebaixar vela confirmada e contando reedições de velas fechadas. | Porta falsa com exchange sintética: primeira leitura pagina até o alvo, as seguintes só leem a janela recente, um buraco é curado paginando, falha de leitura devolve o que havia e marca incompleto, reedição de vela fechada é contada. |
| Q-11 | O contrato público `GET /system-one` e o painel do console devem expor o anexo por lista de permissão, mostrando as três probabilidades por candidato, a nota dos dados e o que significa um simulado zero. | Chaves exatas em cada nível, entrada hostil neutralizada, projeção idêntica à anterior exceto pelo bloco `quant`; painel renderizado com e sem anexo, sem pontuação proibida, tabela cabendo em 375 px sem rolagem lateral da página. |
| Q-12 | Quando uma evidência de carteira (`portfolio-evidence`) for dada, o sistema deve convertê-la em posições avaliadas sem tratar valor desconhecido como zero e casar posição com captura de mercado só por ativo nativo de símbolo único, ou por mapeamento explícito do usuário. | Posição fora do patrimônio, sem valor em USD ou ilegível vira desconhecida com motivo; contrato que apenas compartilha ticker não é casado sozinho; roda sobre o fixture sintético da própria camada de evidência. |
| Q-13 | Onde a simulação filtrada for pedida com `tail: "evt"`, o sistema deve estender as duas caudas do conjunto de resíduos com distribuições de Pareto generalizadas ajustadas aos excessos, caindo para o conjunto empírico quando não houver excessos suficientes e dizendo qual modelo rodou; o padrão não muda. | Ajuste contra referência independente e recuperação em amostra simulada; centro empírico e participação das caudas preservados; sorteios além do maior resíduo observado; determinismo por semente; medição pareada contra o FHS comum com resultado reportado mesmo se nulo (REPORT, seção 10). |

## Fora de escopo

Execução, assinatura, ordens, chamadas pagas ao modelo, credenciais, edição de `src/policy/**`, `src/onchainos/**`, `src/operator/**`, `src/portfolio-evidence/**`, `src/jev-read/**`, a mesa (`MesaView`). Previsão de preço por aprendizado supervisionado: sem série longa e sem edge demonstrado, o honesto é medir risco e calibração, não prometer retorno.

## Riscos

- Sessões concorrentes alteram a árvore: arquivos novos em `src/quant/`, `scripts/quant-*.ts`, `docs/sdd/dados-quant/`, `src/system-one/quant-history.ts`; edições aditivas em `src/system-one/{types,cycle,decide,public-view}.ts`, `scripts/system-one.ts`, `web/src/lib/system-one.ts` e `web/src/components/SystemOne/` (nenhum deles tinha edição concorrente quando foram alterados).
- Simulação custa CPU: número de caminhos limitado por parâmetro com teto.
- Estimadores de faixa assumem cobertura contínua; o relatório declara que a barreira é verificada por ponte gaussiana entre amostras, não por tique a tique.

## Estado da aceitação (2026-10-13)

Q-01 a Q-13 têm teste ou medição correspondente; números, método, limites, os achados da revisão independente e as pendências em [REPORT.md](REPORT.md). Não feito: commit e sua aceitação, leitura real de carteira, consulta ao modelo real, o bloco na mesa (área com edição concorrente).
