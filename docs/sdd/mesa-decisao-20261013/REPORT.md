# Mesa de decisão e carteira

Objetivo observado: melhorar a interface para apoiar decisões de carteira com Jev, reduzir a dispersão visual e tornar verificável o que as integrações e a conexão da carteira realmente permitem. Esta entrega é local. Não enviou ordens, assinaturas, dados de uma carteira real ao modelo, nem publicou o projeto.

## Comparação com fontes primárias

| Referência | Força relevante | Limitação encontrada aqui | Resposta nesta entrega |
| --- | --- | --- | --- |
| [TradingView: layouts e interação dos gráficos](https://www.tradingview.com/support/solutions/43000692404-layouts-charts-drawings-indicators-and-their-interaction/) | O gráfico ocupa o centro da análise; layouts e ferramentas organizam a exploração | O palco inclinado e a hierarquia visual disputavam espaço com o gráfico | Mesa plana, gráfico central maior, ampliação explícita e acesso direto à consulta do ativo ou da carteira |
| [TradingView: screeners](https://www.tradingview.com/support/solutions/43000718885-tradingview-screeners-walkthrough/) | Filtros e comparação ajudam a reduzir o universo pesquisado | Mais dados não asseguram uma decisão acionável | Consulta manual com ações por ativo, fonte, idade, risco e lacunas; o rastreador existente permanece disponível |
| [Nansen: portfolio API](https://docs.nansen.ai/api/portfolio) e [produto de negociação com IA](https://nansen.ai/post/why-trade-on-nansen-trade-everything-onchain-with-ai) | Contexto de carteira e análise onchain conectados ao fluxo de decisão | Nossa leitura cobre uma lista pequena, sem patrimônio completo, custo de aquisição ou posições DeFi reconciliadas | A cobertura parcial fica explícita. Saldo desconhecido não vira zero; patrimônio total permanece indisponível |
| [Token Metrics](https://tokenmetrics.com/) | Produto apresenta pesquisa e avaliações apoiadas em IA | O projeto ainda não demonstra vantagem preditiva medida fora da amostra | Separar decisão do modelo de prova de ganho. Não acrescentar score de lucro, confiança inventada ou alavancagem automática |
| [OKX OnchainOS: produto e serviços de carteira](https://web3.okx.pro/onchainos/dev-docs/wallet/product-and-service) | APIs de carteira, mercado e negociação permitem combinar contexto e ação | Disponibilidade no catálogo do provedor não comprova credenciais, ativação ou execução no aplicativo local | Exibir leitura, cotação e operação como capacidades distintas; registrar o que permanece sem qualificação live |

A escolha de uma interface centrada na decisão é uma inferência de produto apoiada nessa comparação e no objetivo do usuário. Descrições comerciais de IA das referências não demonstram rentabilidade.

## Estado real das integrações

- OnchainOS: catálogo e adaptadores de mercado, candles, fluxo, smart money, holders, risco, liquidez, notícias e cotação já existem. O inventário identificou 25 recursos. Não houve uma chamada paga live nesta entrega; presença de código não comprova acesso a cada endpoint.
- Carteira OKX: conexão EIP-1193 e leitura parcial de Monad ou X Layer. A leitura de Monad contém dois ativos; a de X Layer contém seis ativos configurados. Não equivale a inventário de todos os ativos do endereço.
- Operação: ticket e mecanismos de preflight existem, mas esta interface não foi qualificada para assinatura e execução pela carteira conectada. A nova área declara operação indisponível e nenhuma consulta envia ordem.
- Jev: a chave foi encontrada no escopo de usuário do Windows, sem revelar seu valor ou sufixo. A resolução agora prioriza cofre local, ambiente do processo, ambiente do usuário e ambiente da máquina. Presença da chave não comprova autenticação; não foi feita uma chamada de produto para certificar isso.
- “Oxa Visuality”: o nome não pôde ser associado a uma integração identificável no repositório. Não foi interpretado como integração concluída. OnchainOS e a carteira OKX foram auditados separadamente.
- Machine learning: existem cálculo de features, laboratório e decisões do modelo, mas não foi localizada prova suficiente de um modelo treinado e avaliado que aumente capital líquido fora da amostra. Indicadores existentes continuam como contexto visual; a escolha de ação da nova consulta pertence ao Jev.

## Comportamento entregue

A mesa apresenta um gráfico maior e um modo ampliado, com ações diretas para consultar o ativo e analisar a carteira. O gráfico conserva as ferramentas existentes: seleção de ativo, período, candles, navegação e camadas disponíveis. A interface móvel prioriza o gráfico e mantém acesso aos painéis. Ampliar e restaurar funcionam também no celular, preservando os 16 estados de camadas. O menu de camadas foi corrigido para permanecer acessível dentro do painel.

A consulta da carteira exige uma leitura atual e consentimento explícito. Envia somente rede, contratos, rótulos normalizados e saldos de 2 a 6 ativos, com cobertura parcial e perfil conservador sem alavancagem. Não envia endereço da carteira nem resposta bruta do RPC. Inclui o token em foco quando sua rede e o limite permitem; esse universo limitado não pode ser descrito como os melhores ativos de todo o mercado.

Jev escolhe comprar, manter, vender ou abster-se por ativo. Venda exige saldo positivo verificável. A interface apresenta evidência e lacunas; custo desconhecido permanece desconhecido. Troca de conta, rede, leitura ou expiração de 60 segundos invalida consentimento e resultado. Cancelamento tem identificador criado pelo próprio cliente antes do POST, para impedir cancelamento de outra consulta e trabalho que chegue depois do cancelamento.

A detecção da chave acontece no servidor local; o navegador recebe apenas presença e origem. O cache do ambiente persistente do Windows tem validade de 60 segundos. Limpar uma chave do cofre local pode revelar novamente uma chave já existente no Windows; isso fica explicado em Configurações.

## Limites e próxima entrega útil

Esta entrega não implementa alavancagem, rebalanceamento executável, patrimônio integral, recomendação universal de mercado ou garantia de lucro. O fluxo Kuru/Monad por bloco de 300 ms não foi alterado. Servidores e sessões já abertas do usuário não foram reiniciados; o novo código e a presença da chave não provam carregamento universal em aplicativos abertos.

O próximo passo prioritário é qualificar uma leitura real de carteira e os acessos OnchainOS, sem ordens nem envio automático ao modelo, seguindo o contrato canônico em `docs/sdd/carteira-evidencia/`. Isso fornece identidade, cobertura, preços, taxas e tempos verificáveis antes de ampliar a seleção de oportunidades. Uma eventual avaliação de ML deve usar dados disponíveis no instante da decisão, separar treino e avaliação por tempo, incluir taxas, gás, spread e derrapagem e comparar decisões aceitas com um baseline. Essa avaliação ainda não foi realizada.

Resultados de testes, build, navegação e preservação estão em [verification.md](verification.md), com logs e scripts reproduzíveis. Os pareceres independentes finais são registrados junto a essas evidências.
