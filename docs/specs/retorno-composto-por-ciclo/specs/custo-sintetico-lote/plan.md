Plano da fatia S3: custo de ida e volta em lote por cotação sintética (somente arquivos novos, sem rede).

Portão 0 (linha de base). Rodar bun --no-env-file run typecheck antes de escrever qualquer arquivo e anotar os erros existentes. A branch tem conflitos não resolvidos em .agents/skills; esses erros não são desta fatia. Saída: lista de erros pré-existentes.

Passo 1 (RED). Escrever src/okx-market/rt-batch.test.ts com os 14 casos de casos_de_teste, usando quote falso e relógio fixo. Rodar bun --no-env-file test src/okx-market/rt-batch.test.ts e confirmar falha por módulo ausente. Portão: a falha é de importação, não de asserção mal escrita.

Passo 2 (tipos e validação). Criar src/okx-market/rt-batch.ts com os tipos exportados, AMOSTRA_MINIMA = 30 e validação de entrada que lança Error('Invalid round-trip batch input.') antes de qualquer chamada à cotação: itens não vazios, ids e endereços não vazios e sem espaço, ids únicos, tamanhos finitos e maiores que zero, faixas finitas com liquidoMinUsd maior que intermediarioMinUsd e intermediarioMinUsd maior ou igual a zero, cotação função. Portão: casos 13 verdes.

Passo 3 (perna e desconhecido). Implementar a chamada da cotação dentro de try/catch: exceção vira motivo erro_cotacao, retorno nulo vira cotacao_ausente, campo ausente ou não finito vira desconhecido com motivo campo_ausente:<nome>. Impacto em módulo. Total da perna é soma só se os quatro componentes forem conhecidos. Total da rodada é soma das pernas só se ambas forem conhecidas. Ordem determinística: itens na ordem recebida, tamanhos na ordem recebida, compra antes de venda. Portão: casos 1 a 5 e 14 verdes.

Passo 4 (classe por liquidez). Classe da rodada = faixa do menor liquidezUsd entre as duas pernas; se qualquer perna não tiver liquidez, classe desconhecida. Portão: casos 6 e 7 verdes.

Passo 5 (resumo). summarizeByClass agrupa só rodadas com totalPct conhecido para n, média, desvio amostral (n menos 1 no denominador), IC 95% = média mais ou menos 1,96 vezes desvio sobre raiz de n. Quatro classes sempre presentes, nesta ordem: liquido, intermediario, raso, desconhecida. Estado: n igual a 0 gera nao medido; n de 1 a 29 gera amostra insuficiente; 30 ou mais gera medido. Desvio e IC viram desconhecido com n menor que 2. desconhecidas conta rodadas da classe com total desconhecido. Portão: casos 8 a 12 verdes.

Passo 6 (verificação). Rodar bun --no-env-file test src/okx-market/rt-batch.test.ts, bun --no-env-file run typecheck (comparar com a linha de base do Portão 0; nenhum erro novo nos dois arquivos), o grep de caracteres proibidos (saída vazia) e git status (somente os dois arquivos novos). Portão final: nenhum arquivo quente foi tocado e nenhum import de rede aparece no módulo.

Parada: se o typecheck do Passo 6 mostrar erro novo nos dois arquivos, corrigir antes de avançar. Não ligar ao ciclo nesta fatia.
