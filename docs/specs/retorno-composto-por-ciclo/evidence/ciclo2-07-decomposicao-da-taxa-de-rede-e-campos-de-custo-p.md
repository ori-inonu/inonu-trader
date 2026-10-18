# Ciclo 2, ticket T07: Decomposicao da taxa de rede e campos de custo por operacao

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: custo
Priority: 7

## Question

Qual parcela das 97.859 lamports de um recibo de compra e taxa base (5.000 lamports por assinatura), qual e taxa de prioridade (preco por unidade de computacao vezes limite pedido), qual e o custo de assinaturas extras, e quais campos de src/agent/fills.ts registram taxa do pool, impacto e prioridade?

Por que importa: O recibo custa cerca de 20 vezes a taxa cotada (US$ 0,0103 contra US$ 0,0005). Sem decomposicao nao fecha o retorno liquido em USD, e a alavanca pode ser o limite de unidades pedido, nao o volume. fills.ts guarda feeLamports e cashUnits, mas nao taxa do pool nem impacto.
Evidencia a buscar: Campos de taxa e unidades por transacao nos recibos do ledger (data/, somente agregados); documentacao oficial da Solana sobre taxas (formula com limite de unidades); src/agent/fills.ts; validacao-e-baseline.md secao 1. Nada e enviado.

## Answer

A taxa do recibo de 97.859 lamports tem tres partes pela formula oficial: taxa base de 5.000 lamports por assinatura, taxa de prioridade igual a ceil(preco por CU em micro-lamports x limite de CU pedido / 1.000.000) e nenhuma taxa de pool, porque a Solana nao cobra taxa de pool. Com 1 assinatura, a prioridade seria cerca de 92.859 lamports, o que implica cerca de 464 micro-lamports por CU com o limite padrao de 200 mil CU. Com 2 assinaturas seriam 10.000 de base e 87.859 de prioridade. O repo nao decompoe isso: o recibo guarda so a taxa total (meta.fee) e a parcela da carteira, sem assinaturas, preco por CU nem limite pedido. A diferenca de cerca de 20 vezes em relacao a cotacao (US$ 0,0103 contra US$ 0,0005144) e um calculo verificado, mas nao sabemos se a cotacao cobre so a taxa base. Em US$ 121 a rede custa cerca de 0,008% por operacao e cerca de 0,016% no round trip, entao a alavanca pode ser o limite de unidades pedido e nao o volume. Fechar a decomposicao exige ler a transacao final, o que nao foi feito nesta pesquisa.

### Caminhos (Wayfinder)

- **Medir o que ja existe, sem tocar o codigo**: Agregar, por lado da ordem e por faixa de taxa, o walletFeeLamports e o nativeDeltaLamports ja gravados, em arquivo local git-ignored. Nenhuma alteracao em src nem no journal. | Restricao que prende: fills.ts nao guarda prioridade, limite de unidades nem numero de assinaturas, entao so da para medir a taxa total, nao decompor. | Experimento mais proximo: Distribuicao de taxa por operacao em todas as ordens com taxa (22 hoje) e separacao compra e venda. | Ganho: Taxa real por operacao em USD sem risco; base para qualquer decisao de custo. Cerca de 0,008% por operacao em US$ 121 (calculo). | Esforco: baixo | Como medir: Mediana, p25 e p75 de walletFeeLamports por lado, com contagem e a parcela de ordens sem taxa.
- **Decompor a taxa por assinatura, em leitura sob demanda**: Ler por RPC publico a transacao finalizada de cada ordem com taxa e separar assinaturas, taxa base e prioridade, usando as instrucoes ComputeBudget. So leitura, sem assinatura nem envio. | Restricao que prende: O repo nao le ComputeBudget e o RPC publico tem limite de 100 requisicoes por 10 segundos (pesquisa T08 e validacao-e-baseline). | Experimento mais proximo: Ler 20 transacoes finalizadas e checar se meta.fee = 5.000 x assinaturas + preco x limite / 1.000.000 fecha com residuo zero. | Ganho: Fecha a conta de custo em USD por operacao e mostra se o limite pedido e a alavanca. Sem numero novo de ganho. | Esforco: medio | Como medir: Residuo = meta.fee menos base menos prioridade calculada; esperado zero. Comparar preco por CU e limite pedidos com a cotacao.
- **Testar o limite de unidades em simulacao de sombra**: Simular a mesma transacao com limites menores (por exemplo 50 mil CU) e comparar unidades consumidas com o limite pedido. Nada e assinado nem enviado. | Restricao que prende: Simulacao nao prova inclusao nem consumo em producao; o numero de CU consumido precisa vir da simulacao e nao foi lido. | Experimento mais proximo: Simulacao da transacao com 50 mil e 200 mil CU, medindo unidades consumidas e taxa calculada pela formula. | Ganho: Se o consumo couber em 50 mil CU, a prioridade cai de cerca de 92.859 para cerca de 23.215 lamports (calculo com preco fixo, hipotese). | Esforco: medio | Como medir: Unidades consumidas contra limite pedido; taxa esperada = preco x limite / 1.000.000; comparar com a taxa do recibo.
- **Conciliar a cotacao com o recibo antes de mudar o modelo**: Para as mesmas ordens, comparar a taxa cotada (US$ 0,0005144) com meta.fee convertida, para saber se a cotacao cobre so taxa base. | Restricao que prende: A base da cotacao (fees.json e VIABILIDADE linha 47) nao foi verificada nesta pesquisa. | Experimento mais proximo: Razao cotacao por recibo em pelo menos 20 ordens com o mesmo SOL de referencia. | Ganho: Diz se o modelo de custo esta usando numero errado, sem mudar execucao. | Esforco: baixo | Como medir: Razao cotacao por recibo por ordem; se fica perto de 5.000 lamports por assinatura, a cotacao e so base.

### Achados

- [T07-A1|fato|media|VERIF=confirmado] Taxa base de 5.000 lamports por assinatura, metade queimada e metade paga ao validador. Taxa de prioridade = ceil(preco em micro-lamports por CU x limite de CU / 1.000.000) lamports, paga integralmente ao validador. Em v1 a taxa e um total absoluto no cabecalho da mensagem.
    fonte: https://solana.com/docs/core/fees (lido via WebFetch, resumo de modelo pequeno: conferir a pagina crua antes de codar)
- [T07-A2|fato|media|VERIF=confirmado] Limite de CU padrao de 200.000 por instrucao, maximo de 1.400.000 por transacao; instrucoes builtin usam 3.000 CU. A pagina nao informa um padrao para a transacao inteira.
    fonte: https://solana.com/docs/core/fees (WebFetch); docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t08-execucao-solana-custos.md:9
- [T07-A3|fato|alta|VERIF=confirmado] O recibo grava feeLamports = meta.fee (taxa total da transacao); walletFeeLamports vale a taxa total so se a carteira e o primeiro signatario, e 0 caso contrario; nativeDeltaLamports e o saldo nativo pos menos pre da carteira.
    fonte: src/server/solana-receipts.ts:52, 53, 57
- [T07-A4|fato|alta|VERIF=confirmado] fills.ts guarda feeLamports, walletFeeLamports e nativeDeltaLamports (copiados do recibo). Nao guarda taxa de pool, impacto, preco por CU, limite de unidades nem numero de assinaturas. Busca por impact, priority e pool em fills.ts sem resultado.
    fonte: src/agent/fills.ts:30-32 (campos) e :70-72 (copia); busca no arquivo
- [T07-A5|fato|media|VERIF=confirmado] No repo nao ha leitura de instrucoes ComputeBudget nem de computeUnitPrice ou computeUnitLimit em src ou scripts. A pesquisa T08 registra que a OKX DEX swap expoe computeUnitPrice e computeUnitLimit como parametros de execucao Solana, mas o repo nao os usa nos trechos buscados.
    fonte: busca em src e scripts (sem resultado); docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t08-execucao-solana-custos.md:19 (item a4)
- [T07-A6|calculo|alta|VERIF=parcial] Recibo de 97.859 lamports equivale a cerca de US$ 0,0103 a US$ 105,48 por SOL, e a cotacao tradeFee de US$ 0,0005144 fica cerca de 20 vezes abaixo (razao 20,1).
    fonte: docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:18; pesquisa-t08 linha 41 (item a10); docs/sdd/agente-autonomo/VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md:47
    >> parcial: A conta confere: 97.859 lamports x 1e-9 x US$ 105,48 = US$ 0,01032, e 0,01032 / 0,0005144 = 20,1. Mas validacao-e-baseline.md:18 diz 'cotação de US$ 0,0005' e não traz 0,0103 nem 0,0005144; o 0,0005144 está em docs/sdd/agente-autonomo/VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md:47. O preço de US$ 105,48 por SOL não está nas fontes citadas; aparece só como premissa em api-limites-e-fontes.md:102 e na pesquisa T08 (a10), sem fonte primária. A documentação do repo (docs/okx-dex-v2/OKX-DEX-QUOTE-CONTRACT-20261009.md:20) diz que tradeFee é estimativa de taxa de rede em USD, não taxa efetiva: a comparação de 20 vezes é estimativa contra medida. | correcao: Reescrever como 'US$ 0,0103 ao preço de US$ 105,48 por SOL (cálculo)'. Citar VIABILIDADE:47 para 0,0005144 e validacao-e-baseline.md:18 só para a mediana. Registrar que a diferença pode ser estimativa contra medida, não erro de custo.
- [T07-A7|calculo|alta|VERIF=confirmado] Decomposicao implicita do recibo: com 1 assinatura, base 5.000 e prioridade 92.859 lamports (preco de cerca de 464 micro-lamports por CU a 200 mil CU; cerca de 66 a 1,4 milhao). Com 2 assinaturas, base 10.000 e prioridade 87.859. O numero de assinaturas do recibo nao esta gravado no repo.
    fonte: formula de A1 aplicada a 97.859 lamports; numero de assinaturas nao verificado
- [T07-A8|hipotese|media] A prioridade cresce linearmente com o limite pedido. Mantido o mesmo preco, pedir 50 mil CU em vez de 200 mil CU reduz a prioridade de 92.859 para cerca de 23.215 lamports (menos 75%). Vale so se o consumo real couber no limite menor, o que nao foi medido.
    fonte: formula de A1 com preco implicito de A7; consumo real nao verificado
- [T07-A9|fato|media|VERIF=parcial] Estatistica do ledger (agregada, sem enderecos): 116 ordens unicas; 22 com taxa de carteira; mediana 78.724 lamports, p25 50.143, p75 108.495, minimo 13.902, maximo 397.396. O recibo de 97.859 aparece em 1 ordem. A linha de base cita mediana de 85.427 em 21 ordens, o que nao bate com 78.724 em 22: divergencia nao reconciliada.
    fonte: data/decision-review/execution-audits.jsonl (agregado sobre 11 snapshots, deduplicado por orderKey); docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:18
    >> parcial: Sobre data/decision-review/execution-audits.jsonl (11 snapshots, deduplicado por orderKey): 116 ordens únicas, confirmado. Ordens com walletFeeLamports > 0: 17, não 22, e não há zeros. Mediana 78.724, p25 50.143, mínimo 13.902 e máximo 397.396 confirmados. p75 é 168.390, não 108.495. A ocorrência de 97.859 em 1 ordem está confirmada. A mediana de 85.427 da linha de base reproduz-se exatamente sem deduplicar: 132 linhas com taxa de carteira entre os 11 snapshots, ou seja, linhas repetidas, não 21 ordens. | correcao: Trocar por: 17 ordens únicas com taxa de carteira; mediana 78.724, p25 50.143, p75 168.390. Retirar a mediana de 85.427 de validacao-e-baseline.md:18 ou marcá-la como mediana de 132 linhas com repetição entre snapshots.
- [T07-A10|inferencia|baixa] Em vendas, o saldo nativo da carteira e exatamente menos a taxa da carteira em 13 de 14 casos com dado. Em compras, em 6 de 8 casos; nas outras 2 compras ha saida extra de cerca de 1.488.440 e 1.513.840 lamports, possivelmente aluguel de conta de token.
    fonte: data/decision-review/execution-audits.jsonl (agregado); aluguel nao verificado
- [T07-A11|inferencia|baixa] A baseline usa aluguel de conta de token de cerca de 0,00204 SOL (cerca de 2.039.280 lamports), que nao bate com os cerca de 1.488.440 a 1.513.840 lamports de saida extra observados nas compras: divergencia a conciliar.
    fonte: pesquisa-t08 linha 56 (item a15); ledger agregado de A10
- [T07-A12|fato|media] Prioridade usa o limite pedido, nao o consumido, e custos nao se ajustam quando o pedido excede o usado. Fonte secundaria; o limite de bloco de 48 milhoes CU ainda conflita com 60 milhoes em outra fonte.
    fonte: pesquisa-t08 linha 12 (item a2, parcial, secundaria Helius)

### Decisao para o Jev

Pergunta: Como medir a decomposicao da taxa de 97.859 lamports antes de qualquer mudanca no limite de unidades?
Reversivel: true

- medir-sem-mudar-codigo (Adiar e so medir o que existe): Agregar a taxa ja gravada em arquivo local git-ignored, sem tocar src nem o journal. Decompor so depois. | Evidencia: fills.ts:30-32 ja guarda a taxa total e a parcela da carteira
- ler-transacao-por-assinatura (Ler a transacao final por assinatura): Reler por RPC publico, sem gravar no journal, a transacao de cada ordem com taxa e separar base, prioridade e residuo pelas instrucoes ComputeBudget. | Evidencia: solana-receipts.ts:52 le meta.fee; ComputeBudget nao e lido no repo
- simular-limite-unidades (Simular limite de unidades em sombra): Simular a mesma transacao com limites menores e comparar unidades consumidas com o limite pedido. Nada e assinado nem enviado. | Evidencia: Prioridade = preco x limite pedido, nao consumido (pesquisa-t08 a1 e a2)
- conciliar-cotacao (Conciliar cotacao com recibo): Comparar, nas mesmas ordens, a taxa cotada de US$ 0,0005144 com a taxa do recibo, para ver se a cotacao cobre so a taxa base. | Evidencia: Cotacao em VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md:47

Recomendacao sem Jev: medir-sem-mudar-codigo - Nao toca em codigo, journal ou schema, usa so dados ja gravados e e totalmente reversivel. Ela entrega a distribuicao real da taxa por operacao, que e a entrada de qualquer decisao sobre limite de unidades, e deixa a decomposicao para o passo seguinte, que exige leitura de transacao.
Cetico: decisao_ok=false; problemas: Opção 'simular-limite-unidades' tem dependência oculta: simular exige a transação com as instruções da OKX, obtidas de API autenticada com cota, o que contraria 'nenhuma chamada a serviço pago'. Reescrever como re-simulação de uma cópia da transação final lida por RPC público, sem assinatura (sigVerify false) e sem chamada à OKX, ou tirar a opção. | Restrição de RPC incompleta: a documentação (solana.com/docs/references/clusters) diz 100 requisições por 10 s por IP e 40 por 10 s por IP para um único método RPC. Com 116 leituras de getTransaction, o limite por método é o que aperta (cerca de 30 s). A página lista api.mainnet.solana.com, e o repo usa api.mainnet-beta.solana.com: a equivalência não foi verificada. | Desconhecido 'assinaturas-do-recibo' não é desconhecido: cada ordem do ledger guarda a assinatura (campo signature), e getTransaction devolve o número de assinaturas. É pendência de leitura, coberta pela opção 'ler-transacao-por-assinatura'. | Desconhecido 'aluguel-de-conta' tem hipótese que não bate: a fórmula da página oficial de contas (solana.com/docs/core/accounts, 'Minimum storage balance') dá (165 + 128) x 3.480 x 2 = 2.039.280 lamports para uma conta de token de 165 bytes, não 1,49 a 1,51 milhão. A pergunta deve ser respondida pela variação do saldo nativo por transação, separando taxa, gorjeta e aluguel. | Opção 'conciliar-cotacao' enquadra mal a pergunta: tradeFee é estimativa de taxa de rede em USD (docs do repo), não componente da taxa. 'Cobre só a taxa base?' não se aplica. Reformular como comparação de estimativa contra medida nas mesmas ordens. | Falta opção de reconciliar o ledger antes de qualquer decomposição: 17 ordens com taxa de carteira (não 22) e a mediana de 85.427 vem de linhas repetidas. O gate G0 da validação já exige conciliação. | Falta opção de aceitar a taxa medida como custo e não decompor: a pesquisa calcula a rede em cerca de 0,017% da ida e volta com US$ 121 (cálculo, não verificado no repo), contra atrito de 0,42% a 1,82% medido. A decomposição pode não mudar nenhuma decisão agora. | Requisito não coberto: nativeDeltaLamports (solana-receipts.ts:57) mistura taxa, gorjeta Jito (transferência) e aluguel. A opção de leitura por assinatura precisa separar esses componentes pelas instruções e pelos saldos pré e pós, não só pela taxa. | Na lista de afirmações, o identificador A8 não aparece (a lista pula de A7 para A9). Se havia uma A8 na fonte, ela não foi revisada. | Opção 'medir-sem-mudar-codigo' está correta: data/ é ignorado pelo git (.gitignore:6) e fills.ts já guarda a taxa total e a parcela da carteira. Não há migração de journal.

### Bloqueios do dono

- Migracao do journal ou do schema para gravar prioridade, assinaturas ou limite de unidades em fills.ts: decisao do dono.
- Qualquer mudanca no limite de unidades ou na taxa de prioridade de ordens reais, por ser alteracao de ordem e de execucao live: decisao do dono.
- Liberacao de live e uso de dinheiro real para testar a mudanca: decisao do dono.
- Servico pago de gas station (Solana Gas Station, pesquisa-t08 a24): fica fora do Jev por ser servico pago.

### Novos tickets revelados

- Reconciliar mediana de taxa 85.427 e 78.724: Por que a linha de base usa 85.427 lamports em 21 ordens e o ledger agregado mostra 78.724 em 22? Qual snapshot e a referencia?
- Medir aluguel de conta de token nas compras: O saldo extra de cerca de 1,49 milhao de lamports nas compras e aluguel de conta, e ele volta ao fechar a conta?
- Confirmar o padrao de CU da OKX DEX swap: A OKX DEX swap usa computeUnitLimit por padrao ou aceita o limite da transacao? Ler a pagina de dex-swap e o swap-args do repo.

### Nao lido

- Pagina crua de solana.com/docs/core/fees: li so o resumo do WebFetch; as frases exatas devem ser conferidas antes de codar.
- Instrucoes ComputeBudget de qualquer transacao real: nao fiz leitura de transacao nem chamada RPC nesta pesquisa.
- Numero de assinaturas, preco por CU e limite de unidades de cada recibo: nao estao no repo.
- src/okx-market/ e swap-args.ts: nao li para confirmar se o repo envia computeUnitPrice ou computeUnitLimit.
- Pagina oficial de dex-swap da OKX e fees.json da cotacao: nao verificados nesta passagem.
- data/ bruto: li apenas agregados de execution-audits.jsonl, sem enderecos, sem chaves e sem .env.

### Resumo do cetico

Reverifiquei as afirmações A1 a A7 e A9 contra a página oficial da Solana, a documentação da OKX, o código do repo e o ledger de auditoria (só agregados, sem endereços). Confirmadas: A1, A2, A3, A4, A5 e A7. Parciais: A6 (a conta confere, mas a citação e o preço de SOL estão frágeis e tradeFee é estimativa, não taxa) e A9 (22 ordens com taxa de carteira são na verdade 17; p75 é 168.390, não 108.495; a mediana de 85.427 vem de 132 linhas repetidas entre snapshots). A8 não consta da lista. A decisão não pode ir ao Jev como está: a opção 3 depende da OKX sem dizer, a restrição do RPC público está incompleta, dois desconhecidos são respondíveis por leitura e faltam duas opções importantes.

## Comments

