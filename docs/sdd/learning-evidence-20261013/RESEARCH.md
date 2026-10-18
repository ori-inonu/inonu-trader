# Pesquisa de avaliação Jev, dados e carteira cripto

Data de acesso: 2026-10-13. Escopo: pesquisa e propostas locais para melhorar a qualidade observável das decisões e da gestão manual, sem afirmar retorno, vantagem financeira ou autorização para executar operações.

**Resultado da pesquisa:** as lacunas prioritárias são semântica das probabilidades, causalidade temporal e reconciliação de custos/cobertura. As fontes sustentam esses cuidados; não demonstram que trocar de modelo ou instalar outro bot melhora resultados financeiros neste projeto. Este documento não implementa, aprova nem certifica suas próprias propostas.

## 1. Limites e contratos do projeto

`docs/sdd/carteira-evidencia/tasks.md` foi lido primeiro. Seu plano e suas reservas de arquivos continuam canônicos; este relatório não os substitui. `requirements.md` e `design.md` foram consultados de forma delimitada. Os documentos descrevem estados do projeto no momento de sua redação, e não certificam o estado atual da implementação.

Evidência literal dos contratos locais:

- `requirements.md`, P2: "Desconhecido nunca vira zero."
- `requirements.md`, P1: "Nenhum caminho deste trabalho assina, envia, aprova, transfere, compra ou vende."
- `tasks.md`: "Produzir documento nunca conclui uma tarefa de implementação."

A gestão manual e consultiva de carteira não muda o contrato separado da demo: Jev decide buy/sell a partir do feed, há carteira real e ordens no livro Kuru em cada bloco de 300 ms. Nenhuma proposta abaixo muda essa cadência, converte o código em decisor de buy/sell ou autoriza operações de carteira.

Inventário técnico considerado na seleção desta melhoria:

- `src/lab`: comparações pareadas Newey-West, custos, baselines, `frozenAtMs` atestado e gates conservadores.
- `src/outcomes`: decisões buy/sell/hold; probabilidades atualmente nulas.
- `src/quant`: estimadores e testes de calibração.
- `src/intel/ml`: ainda não existe.
- `src/lab-jev`: trata probabilidades Choice como pesos sem calibração local demonstrada.

Consequência proposta: reutilizar o laboratório e os contratos existentes. Não há evidência nesta pesquisa para acrescentar outro framework de trading ou um módulo de ML apenas porque os concorrentes o oferecem.

## 2. Comparação das fontes primárias

| Sistema | Capacidade documentada | Limite relevante para o projeto |
| --- | --- | --- |
| OKX Onchain OS | Wallet API fornece saldos, histórico e infraestrutura de transações; Agentic Wallet é outro serviço. Classic Swap fornece dados de transação, e broadcast recebe transação já assinada. | Cotação, calldata, assinatura, broadcast e confirmação precisam de evidências distintas. Possuir uma wallet ou um endpoint não comprova acesso, ativação ou execução. [Wallet](https://web3.okx.com/onchainos/dev-docs/wallet/product-and-service), [Swap](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap), [Broadcast](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-broadcast-transaction). |
| Freqtrade/FreqAI | Retreinamento e backtest por janelas; identificadores separam modelos/predições; pode avaliar predições guardadas durante execução live. | Features são calculadas uma vez sobre o intervalo completo, mesmo quando targets são calculados por janela. A causalidade das features continua sendo responsabilidade da estratégia. [Running FreqAI](https://www.freqtrade.io/en/stable/freqai-running/). |
| Hummingbot | A versão 2.14.0 acrescentou custos de entrada/saída e separação entre PnL dos executores e das posições mantidas. | Fills de grid são inferidos por high/low de candles. Esse tipo de simulação não comprova disponibilidade de liquidez, fila de ordens ou fills no Kuru em 300 ms. [Release 2.14.0](https://hummingbot.org/release-notes/2.14.0/). |
| Zerion | PnL realizado e não realizado, FIFO, custo de aquisição, taxas, transferências e filtros por ativo/rede. | Cobertura não é universal: redes sem as capacidades necessárias podem ser omitidas; ativos sem preço são excluídos da conta. Deve ser fonte para conciliação, não substituto da evidência local. [Referência PnL](https://developers.zerion.io/api-reference/wallets/get-wallet-pnl), [Visão do endpoint](https://zerion.io/api/endpoints/wallet-pnl). |
| TypeSafe/Jev | Choice devolve uma distribuição sobre as opções declaradas, além da opção vencedora. O fornecedor apresenta RLCD e probabilidades calibradas como propriedades do produto. | `confidence` deriva da própria distribuição. As fontes consultadas não validam calibração para as perguntas, ativos, horizontes ou resultados financeiros deste projeto. [Choice](https://docs.typesafe.ai/primitives/choice), [Confidence](https://docs.typesafe.ai/confidence), [Anúncio oficial](https://typesafe.ai/blog/introducing-system-one-models-and-jev). |

### OKX: dados, execução e alavancagem

**Fonte:** `tokenUnitPrice` da cotação é uma referência recomendada e pode ser nulo; `tradeFee` é taxa de rede estimada em USD, não medição do custo confirmado. O plano trial de Trade API documenta 1 requisição/s por padrão, com ampliação sujeita a revisão. Não foram verificados plano, direitos, quota ou acesso deste projeto. [Quote](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote), [Trade API Fee](https://web3.okx.com/onchainos/dev-docs/trade/api-fee).

**Inferência delimitada:** 1 chamada por bloco de 300 ms exigiria aproximadamente 3,33 chamadas/s, antes de chamadas adicionais. Portanto, um caminho que dependa dessa quota de 1 RPS em todos os blocos seria incompatível com a cadência. Isso não prova incompatibilidade do caminho Kuru existente nem da assinatura contratada, ambos não examinados aqui.

**Fonte:** DeFi API documenta descoberta de produtos, inscrição/resgate, empréstimo/pagamento e consulta de posições. As páginas inspecionadas de Swap e DeFi não qualificam um endpoint de perpétuos com multiplicador de alavancagem, margem, funding e liquidação. [DeFi API](https://web3.okx.com/onchainos/dev-docs/wallet/defi-api-overview).

**Incerteza:** isso não demonstra que a OKX Wallet seja incapaz de acessar protocolos alavancados. Demonstra somente que conexão de wallet, empréstimo DeFi, swap spot e negociação de derivativos não devem ser tratados como a mesma capacidade. Alavancagem permanece fora destas propostas até que protocolo, rede, produto, riscos e autorização específicos sejam demonstrados. Não se recomenda aumentar exposição para compensar ausência de evidência de desempenho.

**Fonte:** a OKX também já documenta Address Analysis PnL por token, com realizado, não realizado e `isPnlSupported`. A página consultada não explica ali o método completo de custo de aquisição. Seu exemplo mostra `totalPnlUsd=1371.68`, `unrealizedPnlUsd=685.4` e `realizedPnlUsd=-685.4`, números cuja soma simples não fecha. É uma discrepância do exemplo documental, não evidência de erro numa resposta live. [Latest PnL](https://web3.okx.com/onchainos/dev-docs/market/market-portfolio-latest-pnl).

### Validação temporal e semântica das probabilidades

**Fonte:** o lookahead-analysis do Freqtrade compara execuções completas e fatiadas para detectar indicadores ou sinais dependentes de informação futura. Sinais que não dispararam não foram verificados; certas ordens limite podem produzir falsos positivos. Um resultado sem alertas não certifica ausência universal de vazamento. [Lookahead analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/).

**Fonte:** para Choice com `n > 1`, TypeSafe documenta `confidence = (p_max - 1/n) / (1 - 1/n)`. Duas distribuições distintas com mesmo `p_max` e `n` podem produzir a mesma confidence. [Confidence](https://docs.typesafe.ai/confidence).

**Inferência:** `P(opção buy correta segundo a pergunta)` não equivale automaticamente a `P(retorno líquido positivo no horizonte H)`. Isso requer que pergunta, target, custos e horizonte definam exatamente o segundo evento, além de avaliação temporal local. Nem tipo válido nem confidence elevada verificam os fatos do feed. O anúncio do fornecedor usa modelos externos como referência em workflow evals; essa evidência não é um ensaio financeiro local. [Choice](https://docs.typesafe.ai/primitives/choice), [Anúncio oficial](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

### PnL e cobertura

**Fonte:** Zerion exige rede com `supports_transactions` e `supports_positions`. Sem filtro explícito, redes que falham esse gate podem desaparecer sem erro nem indicação em `meta`. Ativos sem preço, quando filtrados, ficam fora do cálculo e constam nos campos de exclusão. Datas personalizadas também têm limite em relação aos marks pré-computados. [Referência PnL](https://developers.zerion.io/api-reference/wallets/get-wallet-pnl).

**Inferência:** soma numérica coerente é insuficiente se o escopo é incompleto. Recebimento externo, patrimônio atual, variação de inventário e ganho realizado devem conservar classes separadas; comparar fornecedores exige mesmo método, moeda, janela, redes e taxas. Isso reforça RQ-05/06/08/12 e AC-c do SDD canônico, não cria uma segunda especificação de carteira.

## 3. Três melhorias propostas de baixo risco

As prioridades abaixo são propostas de pesquisa. Cada implementação exige critérios verificáveis e avaliação independente.

### P1. Contrato de probabilidade e observação Jev

**Requisito proposto R-P1:** preservar, num artefato de avaliação local, a pergunta e as opções versionadas, hash do estado utilizado, modelo/versão, instante, distribuição original e sua procedência. Ausência continua `null`; não sintetizar one-hot a partir da opção vencedora. Reutilizar `src/outcomes`, `src/quant` e `src/lab` conforme os contratos reais desses módulos.

**Aceitação independente A-P1:** casos conhecidos devem cobrir distribuição válida, opção desconhecida, campo ausente, soma inválida, valores fora de faixa e resposta inválida/atrasada. Invalidade não produz evidência de probabilidade. Fixtures são identificadas como sintéticas. O relatório conserva a distribuição original separada de qualquer transformação local. Antes de medir calibração, declarar o evento alvo, sua regra de rotulagem e o horizonte; sem rótulos verificáveis, a calibração permanece não avaliada. Com dados elegíveis, avaliar Brier/log loss e confiabilidade em holdout temporal, com tamanho de amostra e incerteza. Isso não substitui o gate financeiro líquido já existente.

**Alternativas reais:** (a) primeiro registrar semântica/proveniência e avaliar somente o que tiver rótulo válido; menor custo e risco de interpretação; (b) aplicar recalibração local a distribuições já disponíveis; só elegível com labels e janela suficientes, podendo degradar sob mudança de regime. Não há base para iniciar (b) com probabilidades nulas ou confundir rubrica de escolha com lucro.

### P2. Auditoria de causalidade do feed e das features

**Requisito proposto R-P2:** cada informação precisa distinguir tempo do evento, tempo em que ficou disponível e momento da decisão. Features e targets devem declarar horizonte e dependências. Hashes do conjunto, parâmetros, fronteiras de treino/validação e versão do modelo vinculam os resultados ao ensaio congelado. Essa proposta precede criar `src/intel/ml`.

**Aceitação independente A-P2:** adicionar dados futuros a uma série não deve alterar features anteriores ao corte. Um caso adversarial que usa deliberadamente informação futura deve falhar na verificação. Um treino nunca recebe evento/label indisponível no instante da decisão. Separação temporal e tratamento de labels sobrepostos devem corresponder ao horizonte declarado; não escolher embargo arbitrário. Reprocessamento exige novo identificador/hash quando features mudarem. Testes sem dados live provam a regra causal dos vetores exercitados, não frescor de um feed real.

**Alternativas reais:** (a) estender a avaliação offline existente com invariância e disponibilidade temporal; aproveita baselines/gates atuais; (b) adotar FreqAI ou Hummingbot como laboratório externo; permite comparação adicional, mas acrescenta adaptadores, semântica de candles/fills e manutenção. A fonte não justifica substituir agora o laboratório local nem o caminho Jev/Kuru.

### P3. Conciliação de PnL, cobertura e custos

**Requisito proposto R-P3:** uma análise manual deve declarar identidade rede+contrato, moeda, método de custo, janela, cobertura, exclusões, taxa estimada versus taxa confirmada e vínculos com evidências. Um PnL vindo de OKX/Zerion é uma declaração de fonte que precisa ser conciliada. Priorizar tarefas elegíveis do SDD canônico sem editar caminhos reservados por outras sessões.

**Aceitação independente A-P3:** vetores devem cobrir envio/recebimento externo, rede não suportada, ativo sem preço, histórico parcial, custos ausentes, duplicata, preço vencido, delta de inventário e divergência de total. PnL histórico nunca integra patrimônio atual. Custo desconhecido bloqueia conclusão líquida dependente; não vira zero. Uma diferença entre fornecedores fica explícita, sem média que esconda discrepância. Evidência real exige origem/captura autorizada; fixtures só verificam o comportamento local. Não exigir nova API para concluir ensaios locais.

**Alternativas reais:** (a) importação local e fixtures no contrato já definido, adequada para validar invariantes sem acesso externo; (b) comparação opcional OKX/Zerion em modo leitura, condicionada a acesso, cobertura e autorização de dados verificados. A documentação não prova que qualquer assinatura ou credencial exista. Não criar essa dependência para bloquear trabalho independente possível.

## 4. Não objetivos e incertezas remanescentes

- Não instalar bots/frameworks, criar estratégia de execução, assinar/enviar transações, acrescentar alavancagem, trocar os gates, alterar a cadência de 300 ms ou estimar retorno futuro.
- Não decidir por um novo modelo usando claims de latência, preço ou calibração do fornecedor. Esses claims precisam de avaliação local pareada, com qualidade, custos, retries e observabilidade.
- A pesquisa documental não certifica implementação, eficácia financeira ou estado live do projeto.
- Acesso, plano, limites efetivos por endpoint, cobertura Monad/Kuru e elegibilidade de cada ativo permanecem desconhecidos neste relatório. Documentação geral de uma família de API não qualifica outra.
- Fills inferidos de candles, distribuição de rubrica e PnL ilustrativo não demonstram lucro executável nem estado real de carteira.

Próximo trabalho de pesquisa proposto: especificar R-P1/A-P1, conferir o contrato efetivo de `src/outcomes` e preparar um ensaio offline com revisão independente.

## 5. Registro de fontes, hashes e evidência literal

Todos os URLs abaixo foram lidos em 2026-10-13. SHA-256 corresponde aos bytes do corpo HTTP retornado por `fetch`, já descomprimido pelo cliente, antes de decodificação ou normalização. Foram GETs públicos em memória, sem chaves. Todos retornaram HTTP 200. Captura para hashes entre `2026-10-13T17:11:16.554Z` e `2026-10-13T17:11:17.087Z`. Os corpos não foram arquivados; um refetch pode mudar de hash. Os trechos literais foram conferidos no conteúdo legível da página e limitados a menos de 25 palavras por fonte.

Datas de publicação só são afirmadas quando presentes. `dateModified` é metadado da página, não data de publicação nem prova de mudança funcional. Os links `stable` do Freqtrade são móveis, por isso o hash desta captura é necessário.

| ID | Fonte primária | Data disponível | Evidência literal curta |
| --- | --- | --- | --- |
| S01 | [OKX Wallet overview](https://web3.okx.com/onchainos/dev-docs/wallet/product-and-service) | Sem data editorial observada | "Onchain OS offers two services: Agentic Wallet and Wallet API." |
| S02 | [OKX Quote](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote) | Sem data editorial observada | "This price is only a recommended price." |
| S03 | [OKX Swap](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap) | Sem data editorial observada | `data`: "Call data" |
| S04 | [OKX Broadcast](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-broadcast-transaction) | Sem data editorial observada | `signedTx`: "The transaction string after being signed" |
| S05 | [OKX Trade API Fee](https://web3.okx.com/onchainos/dev-docs/trade/api-fee) | Sem data editorial observada | "This plan provides a default rate limit of 1 request per second" |
| S06 | [OKX Latest PnL](https://web3.okx.com/onchainos/dev-docs/market/market-portfolio-latest-pnl) | Sem data editorial observada | `isPnlSupported`: "Whether PnL calculation is supported" |
| S07 | [Running FreqAI](https://www.freqtrade.io/en/stable/freqai-running/) | Sem data editorial observada | "features do not look-ahead into the future." |
| S08 | [Freqtrade lookahead-analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/) | Sem data editorial observada | "Signals that are not triggered will not have been verified." |
| S09 | [Hummingbot 2.14.0](https://hummingbot.org/release-notes/2.14.0/) | Release: 2026-04-20; não descrita aqui como versão mais recente | "fills inferred from candle high/low"; "consistent round-trip fee accounting (entry and exit)" |
| S10 | [Zerion PnL reference](https://developers.zerion.io/api-reference/wallets/get-wallet-pnl) | `dateModified`: 2026-10-08T13:40:20.688Z | "chains that fail the gate are left out of `data` silently" |
| S11 | [Zerion Wallet PnL endpoint](https://zerion.io/api/endpoints/wallet-pnl) | Sem data editorial observada | "FIFO by default" |
| S12 | [TypeSafe Choice](https://docs.typesafe.ai/primitives/choice) | `dateModified`: 2026-09-20T02:53:36.019Z | "The sum of all values is 1." |
| S13 | [TypeSafe Confidence](https://docs.typesafe.ai/confidence) | `dateModified`: 2026-10-02T05:55:34.605Z | "`confidence` is a statistic computed from the probability distribution" |
| S14 | [TypeSafe anúncio Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) | Sem data editorial observada | "All answers are accompanied with calibrated probabilities and confidence scores." |
| S15 | [OKX DeFi API](https://web3.okx.com/onchainos/dev-docs/wallet/defi-api-overview) | Sem data editorial observada | "Subscribe to or redeem investment products" |

| ID | SHA-256 do corpo HTTP | Bytes |
| --- | --- | --- |
| S01 | `cef599fd67c0c231a86a3dda7b75e5546988a933b8dfe52952646962b6609756` | 60606 |
| S02 | `35d96d61682db7b188db9e11aaf9f5660fd1ab3f48ff90f75a1598a9a4073047` | 128594 |
| S03 | `33fbe32b7bf327eda228d1081f99cb5e3d3ff71688a73c38c4012627c88c0039` | 125672 |
| S04 | `756932b0feb15bc0a752f96e309d6a422662d37bb9652f5e4758fe71e604c10c` | 66783 |
| S05 | `86701462535709a633dba65304ea150c798d7981eef7eecbb0cba8bec4d68b22` | 61373 |
| S06 | `5bb4a8ac00a67c930384835cbffc1671944230085307971f777848038c2098a2` | 69997 |
| S07 | `e3c6900c119d7e85a4818fa2b992db8e89ddc8eb5893f91c2f62eb4e437cc807` | 68292 |
| S08 | `5a4d3f52a9383fecca604c90def8867effaa6d7b9ae83e5b72bda2e584268d27` | 59718 |
| S09 | `921b9dcc9e871e2e454225a72a50dfb0ae065c5c8971f510f53e0cf908fde642` | 74027 |
| S10 | `af4032a0d4cdd474ef818c161dbf705c59c0f448de82987d933d9374e590c152` | 453070 |
| S11 | `f2dae1314602394a7b70b0e88f23792d243b16cca099ba88844780dee26ce581` | 282074 |
| S12 | `35979c118ab6786fb0ecbae14d460224ec40618c27befcc350f6069e243e9a40` | 573139 |
| S13 | `37a170671fae8d21c2b6fdcd9f07268e37db3934681e448f7c3321900f4b35a7` | 591561 |
| S14 | `41c2973ba8f5d993ac36eee7444b7fc222cbd782dbb07e3cf788d0f73e5d2665` | 271027 |
| S15 | `154685d602b28d086533bf5fb0d20ebe1ebff97e5fa92336bbdd2dcb81509925` | 58072 |
