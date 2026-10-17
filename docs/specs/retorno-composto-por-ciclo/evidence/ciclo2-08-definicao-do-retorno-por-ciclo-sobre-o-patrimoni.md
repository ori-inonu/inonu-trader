# Ciclo 2, ticket T08: Definicao do retorno por ciclo sobre o patrimonio

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: 01
Domain: capital
Priority: 8

## Question

Como medir o retorno por ciclo: (A) realizado por volta fechada, em USD, com rede, impacto e imposto; (B) variacao marcada a mercado do patrimonio total a cada ciclo; ou (C) A para a meta de juros compostos e B para a curva de patrimonio?

Por que importa: Juros compostos sobre o capital total exigem que o retorno do ciclo seja a variacao do patrimonio. A (so volta fechada) ignora posicao aberta. B mistura oscilacao de preco de posicoes abertas com retorno operacional. Escolher antes de medir evita comparar numeros de definicoes diferentes. Reversivel se tratado em sombra.
Evidencia a buscar: Como fills.jsonl e o estado de patrimonio registram as pernas (agregados); se B exige preco de SOL e de tokens em USD com idade declarada (G6 e G8 de validacao-e-baseline.md).

## Answer

Recomendo medir as duas definicoes em sombra, sem declarar retorno composto nem fixar uma base de capital ainda: a volta fechada com custos (A) para testar a hipotese de edge, e a variacao marcada a mercado do patrimonio (B) para a curva da meta, cada uma em campo proprio. Hoje nao da para calcular nenhuma das duas em USD com cobertura: fills.jsonl guarda caixa em stablecoin sem preco do token nem do SOL, netUsd e nulo em todo relatorio, e o patrimonio tem valueComplete falso (so-latest.json:25). A base de capital provisoria seria 118,17 a 118,80 (medicao de 15/10), mas nao deve sustentar o retorno composto antes da conciliacao (G0). A escolha e reversivel porque tudo fica em arquivo novo e aditivo.

### Caminhos (Wayfinder)

- **Medir a curva B em arquivo novo, com cobertura declarada**: Gravar um snapshot agregado por ciclo (patrimonio, valueComplete, idade do preco do SOL e dos tokens, fonte) em arquivo novo e aditivo, sem tocar em fills.jsonl. Nao declarar retorno enquanto valueComplete for falso. | Restricao que prende: valueComplete falso e knownValueUsd 0 no estado atual (so-latest.json:25); preco do SOL nao garantido (A11); fills.jsonl nao muda (spec.md:50) | Experimento mais proximo: 100 ciclos em sombra com o snapshot novo, medindo a fracao de ciclos com valueComplete verdadeiro e a idade maxima do preco | Ganho: Primeira curva de patrimonio com cobertura declarada, base para G8 sem alterar journals | Esforco: baixo a medio (um modulo novo com teste de fixture) | Como medir: fracao de ciclos com valueComplete verdadeiro; idade maxima por fato; divergencia do total contra a soma das pernas
- **Retorno por volta fechada com custo em USD, derivado das assinaturas**: Derivar, em arquivo novo, o custo por preenchimento: caixa em stablecoin convertido por preco de SOL e de token com idade declarada, mais taxa de rede medida, sem estender fills.jsonl. Isso fecha a parte A. | Restricao que prende: fills.jsonl nao tem preco USD nem taxa completa (A1, A2); netUsd nulo (A3); preco do SOL nao registrado por preenchimento | Experimento mais proximo: converter as 7 voltas ja registradas com precos do mesmo instante e comparar com o -0,41% bruto ja medido | Ganho: Primeiro retorno liquido em USD por volta, com custos separados; mede a hipotese de edge | Esforco: medio (conversao, teste de conciliacao da soma dos componentes) | Como medir: soma dos componentes igual ao total do preenchimento; intervalo de confianca do retorno por volta em sombra
- **Conciliar a base de capital e os preenchimentos antes de qualquer percentual**: Antes de reportar qualquer retorno percentual, reconciliar o capital (100, 118, 121, 126) e a contagem de 25 contra 26 preenchimentos, produzindo uma unica base rotulada. | Restricao que prende: divergencias documentais (A12) e contagem nao reconciliada (validacao-e-baseline.md G0) | Experimento mais proximo: reler a captura de 16/10 e comparar contagem e hash de fills com a analise de 15/10 | Ganho: Base unica para todo percentual; pre-requisito de G0 e de G8 | Esforco: baixo (relatorio de conciliacao) | Como medir: um unico capital-base; 25 e 26 reconciliados; valueComplete verdadeiro na data da base
- **Medir o efeito da cadencia no custo de inventario antes de fixar 1 minuto**: Medir quantas leituras de inventario um ciclo realmente gasta e se elas contam na cota da OnchainOS, com cadencias de 1, 2 e 5 minutos, antes de decidir a frequencia da curva B. | Restricao que prende: cota Basic acima do teto (A9) e fonte da cota do inventario nao verificada | Experimento mais proximo: contar, em 1 hora de sombra, as leituras de inventario por rota com cadencias de 2 e 5 minutos | Ganho: Evita estourar a cota ao medir a curva a cada ciclo; decide a granularidade sem plano pago | Esforco: baixo (contador por rota, que e a tarefa RC-T2) | Como medir: leituras por rota por hora; erros 50011 e 429; projecao mensal por rota
- **Adiar a meta e gravar as duas definicoes sem base fixa**: Gravar A e B em campos separados, sem percentual composto nem base de capital, e so declarar a meta depois de G0 aprovado. E a opcao mais reversivel. | Restricao que prende: ausencia de patrimonio conciliado e de base unica (A7, A12) | Experimento mais proximo: um relatorio de uma semana com as duas series lado a lado e nenhum percentual publicado | Ganho: Nenhum retorno enganoso publicado; decisao final fica para quando os dados existirem | Esforco: baixo | Como medir: as duas series existem por ciclo; nenhum percentual composto e publicado antes de G0

### Achados

- [A1|fato|alta|VERIF=confirmado] fills.jsonl registra por preenchimento o token movido (tokenMinor), o caixa em stablecoin (cashUnits, na moeda da stablecoin), walletFeeLamports e nativeDeltaLamports. Nao registra preco em USD do token nem do SOL.
    fonte: src/agent/fills.ts:13-30 (FillRecord) e :47 (fillFrom)
- [A2|fato|alta|VERIF=confirmado] roundTrips faz FIFO por token e devolve caixa da mesma stablecoin antes da taxa de rede. O proprio cabecalho diz que nao e lucro nem dolar, e posicao ainda aberta nao entra na volta.
    fonte: src/agent/fills.ts:1-8 (cabecalho) e :108 (roundTrips)
- [A3|fato|alta|VERIF=parcial] netUsd e sempre nulo no relatorio de execucao, com basis ledger_zero_before_buy. Nenhum codigo atual calcula retorno liquido em USD por volta.
    fonte: src/decision-review/executions.ts:96 e :116
    >> parcial: Confirmado no caminho do agente: executions.ts:64 e :96 (netUsd: null em ExecutionAudit) e :69 e :116 (netUsd: null e basis ledger_zero_before_buy em RoundTrip). Não se sustenta a frase geral 'nenhum código atual calcula retorno líquido em USD por volta': src/trader.ts:594 calcula totals.realizedUsd a partir de preço (módulo que src/index.ts importa; pelos campos pnlMon parece ser o demo Monad substituído, inferência não verificada). ledger.ts:208-238 aceita realizedUsd como entrada, não calcula. | correcao: Trocar por: o caminho do agente (src/agent e src/operator/executions) não calcula retorno líquido em USD por volta; src/trader.ts:594 calcula realizedUsd por preço em módulo legado, alcançabilidade não verificada.
- [A4|fato|alta|VERIF=confirmado] O inventario traz knownValueUsd, valueComplete, observedAtMs e source. O preco vem de tokenPrice em texto, e valueComplete vira falso quando qualquer ativo nao tem preco. Logo o SOL entra no total so se vier com preco na mesma resposta.
    fonte: src/okx-wallet/portfolio.ts:243-256 (tipos), :285-291 (preco), :301-312 (valueComplete)
- [A5|fato|alta|VERIF=parcial] Cada ciclo ja le o inventario uma vez antes da decisao (cycle.ts:157) e de novo apos execucao (cycle.ts:190). A serie por ciclo ja grava knownValueUsd e valueComplete. Ou seja, a curva B existe em forma parcial, sem cobertura garantida.
    fonte: src/operator/cycle.ts:157 e :190; src/operator/insights.ts:109-110
    >> parcial: A leitura antes da decisão existe (cycle.ts:157). A leitura após a execução (cycle.ts:190) só ocorre se execution.status === 'completed' e houver executor (cycle.ts:185). A série em insights.ts:109-110 usa cycle.inventory, que é a leitura pré-decisão (cycle.ts:207), não a pós-execução. Então a curva B por ciclo hoje é um snapshot pré-decisão, não uma série de patrimônio antes e depois. | correcao: A série por ciclo grava só o inventário pré-decisão (cycle.ts:157 via insights.ts:109-110). A leitura pós-execução (cycle.ts:190) é condicional e não entra na série.
- [A6|fato|alta|VERIF=confirmado] No caminho de execucao, realizedUsd e nulo, resultBasis e inventory_only e os avisos realized_result_unknown e result_attribution_unverified sao emitidos. O resultado realizado em USD nao e atribuido pelo codigo.
    fonte: src/operator/cycle.ts:187-188
- [A7|fato|media|VERIF=parcial] Patrimonio medido mais recente: US$ 118,17 a 118,80 em 15/10/2026, com caixa em stablecoin de 90 a 91 por cento. O arquivo de estado de 17/10 tem knownValueUsd 0 e capitalUsd 100 com origem configured.
    fonte: EVIDENCIA-OPERACAO-20261015.md:45 (citado em evidence/pesquisa-t12-linha-de-base.md, achado a7); data/quant/so-latest.json:24-25 (lido por agregado)
    >> parcial: so-latest.json:24-26 confirma capitalUsd 100, knownValueUsd 0 e valueComplete false. Mas o observedAtMs do inventário (linha 30, 1791913035420) equivale a 2026-10-13T17:37Z, não a 17/10. A citação EVIDENCIA-OPERACAO-20261015.md não está na raiz: está em docs/sdd/agente-autonomo/EVIDENCIA-OPERACAO-20261015.md. Essa linha 45 confirma 118,17 a 118,80 e caixa de 90% a 91% em 15/10. A origem 'configured' está em so-latest.json:29 e não foi citada. | correcao: O arquivo so-latest.json é de 13/10 (17:37 UTC). Corrigir a data no fato da decisão e o caminho da evidência para docs/sdd/agente-autonomo/EVIDENCIA-OPERACAO-20261015.md:45.
- [A8|fato|alta|VERIF=confirmado] Mudancas em journals de data/, inclusive estender fills.jsonl, sao migracao de schema e ficam bloqueadas para o dono. Medidas novas entram em arquivo novo e aditivo.
    fonte: docs/specs/retorno-composto-por-ciclo/spec.md:50
- [A9|inferencia|media] Medir B a cada ciclo de 1 minuto gera cerca de 1440 leituras de inventario por dia, o dobro do teto local de 720 consultas. Se o inventario consome a mesma cota da OnchainOS, a cota Basic ja projeta acima do teto (109,5 mil por mes em 15/10).
    fonte: src/operator/cycle.ts:157 (uma leitura por ciclo); validacao-e-baseline.md:33 (G5 e G9); evidence/pesquisa-t12-linha-de-base.md a13 e a16
- [A10|fato|alta] O gargalo G8 pede patrimonio com todas as pernas e custos, e G6 pede idade declarada por fato. Sem isso B mistura oscilacao de preco com resultado operacional, e A ignora posicao aberta.
    fonte: docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:37 (G6) e :39 (G8); ticket T08 da entrega
- [A11|hipotese|baixa] Se o SOL nao vier com preco na resposta do inventario, o patrimonio fica sem cobertura. Nao verificado se essa resposta sempre inclui o SOL com tokenPrice.
    fonte: src/okx-wallet/portfolio.ts:291-301; nao verificado na API ao vivo
- [A12|fato|alta] Divergencia de capital (100, 118, 121, 126) segue sem conciliacao. Por isso qualquer base fixa para retorno percentual e provisoria.
    fonte: validacao-e-baseline.md:14 (secao 1, linha Capital) e evidence/pesquisa-t12-linha-de-base.md a7

### Decisao para o Jev

Pergunta: Qual definicao de retorno por ciclo o registro de sombra adota para a meta de juros compostos e para a medicao da hipotese de edge: A (volta fechada com custos), B (variacao marcada a mercado do patrimonio) ou C (A para o edge e B para a curva)?
Reversivel: true

- a_realizado_volta (A: realizado por volta fechada): Retorno so de voltas fechadas, em USD, com taxa de rede, impacto e imposto. Ignora posicao aberta e nao serve de curva de patrimonio. | Evidencia: fills.ts:108 mede caixa por volta sem USD; netUsd nulo
- b_marcado_patrimonio (B: variacao marcada a mercado do patrimonio): Variacao do patrimonio total a cada ciclo. Serve a curva e a meta composta, mas mistura oscilacao de preco de posicao aberta com resultado operacional. | Evidencia: knownValueUsd e valueComplete por ciclo em insights.ts:109-110; valueComplete falso hoje
- c_hibrido_base_provisoria (C com base provisoria de 118): A para o edge e B para a curva, usando 118,17 a 118,80 como base provisoria rotulada. Risco: a base nao esta conciliada e pode enviesar o percentual. | Evidencia: medicao de 15/10 em EVIDENCIA-OPERACAO:45; capital divergente em 4 documentos
- c_hibrido_sem_base (C sem base fixa): A para o edge e B para a curva, gravados em campos separados e sem percentual composto ate valueComplete verdadeiro e base unica (G0). | Evidencia: validacao-e-baseline.md G0 e G8 exigem patrimonio completo e base unica
- adiar_so_medir (Adiar e so medir): Gravar as duas series lado a lado em arquivo novo, sem declarar retorno nem base, e decidir a definicao quando G0 estiver aprovado. Opcao conservadora e mais reversivel. | Evidencia: spec.md:50 manda medidas novas em arquivo novo e aditivo; status.md bloqueios B5

Recomendacao sem Jev: adiar_so_medir - Gravar as duas series lado a lado em arquivo novo e aditivo nao altera journals nem fixa base, e so produz percentual depois de G0. Se o dado mostrar outra definicao melhor, troca-se sem perda. Medir antes de escolher evita comparar numeros de definicoes diferentes, como pede o ticket.
Cetico: decisao_ok=false; problemas: Seção desconhecidos: os quatro itens são perguntas ao dono ('ask'), o que contraria 'Nunca faça perguntas ao dono'. capital_base é decisão de risco e deve ir a bloqueios_do_dono, não a desconhecidos. cota_inventario, sol_no_inventario e fills_contagem devem virar verificações técnicas sem pergunta. | Opção B (variação marcada a mercado) omite que o arquivo não registra depósitos e saques (EVIDENCIA-OPERACAO-20261015.md:47). Sem um registro aditivo de fluxos, B não pode ser declarada retorno. A descrição fala só de oscilação de preço. | Fatos com data e escopo errados: so-latest.json é de 13/10, não de 17/10 (ver A7). O fato 'valueComplete_atual' cita esse arquivo como estado atual. | Fato 'inventario_por_ciclo' e fato 'realizado_no_ciclo' estão incompletos: a leitura pós-execução é condicional (cycle.ts:185) e observedBalanceDeltaUsd (cycle.ts:191-192) não aparece. | Opções c_hibrido_sem_base e adiar_so_medir se sobrepõem (ambas gravam em paralelo sem percentual composto). A descrição de c_hibrido_sem_base diz 'campos separados', o que pode significar mudar linhas de journal, bloqueado por spec.md:50. Precisa dizer arquivo novo e aditivo. | A opção A cita imposto na descrição sem fonte no repo. Ou remover o imposto ou marcar como não verificado.

### Bloqueios do dono

- Estender fills.jsonl ou qualquer journal em data/ (migracao de schema), por spec.md:50 e status.md:62.
- Escolher o capital-base (100, 118, 121 ou 126) como parametro de dimensionamento ou de risco; a decisao e do dono (B5).
- Ordens reais de calibracao para medir custo (B4).
- Plano pago da OnchainOS ou de outro provedor, se a leitura de inventario por ciclo estourar a cota (B1).
- Liberacao de live e qualquer limite de risco sobre o retorno medido.

### Novos tickets revelados

- Verificar a cota do inventario por ciclo: O inventario por ciclo (okx_balance_api) consome a cota da OnchainOS ou tem limite proprio, e quantas leituras por dia um ciclo de 1 minuto gera?
- Garantir o SOL com preco no inventario: O inventario sempre traz o SOL com tokenPrice e idade declarada, e o que acontece quando o preco falta?
- Conciliar 25 e 26 preenchimentos: Qual captura de fills.jsonl esta correta, e a diferenca de um preenchimento vem de linha duplicada ou de atraso de gravacao?

### Nao lido

- fills.jsonl, decisions-meta.jsonl, audits.jsonl e usage-*.json: fora do repositorio ou de leitura proibida nesta fase; os numeros vieram dos documentos que os citam.
- Arquivo real de estado da carteira (data/quant/so-latest.json) lido apenas por agregado (capitalUsd, knownValueUsd, valueComplete); nenhum campo de endereco.
- Nenhum .env, chave ou segredo foi lido.
- Documentacao oficial da OnchainOS e da OKX sobre cota por rota nao foi reaberta; a cota veio de validacao-e-baseline.md e da pesquisa t12.
- EVIDENCIA-OPERACAO-20261015.md:45 foi conferido apenas pela citacao em evidence/pesquisa-t12-linha-de-base.md, nao diretamente.
- Nenhuma consulta ao Jev, a servico pago, a API ao vivo ou a web foi feita; o ticket e de desenho e as fontes sao o repositorio.

### Resumo do cetico

Verifiquei as 8 afirmações contra o código e os documentos. Quatro estão confirmadas (A1, A2, A4, A8) e A6 também, com nuance. A3, A5 e A7 são parciais: A7 tem a data errada (o arquivo so-latest.json é de 13/10, não de 17/10) e a citação de EVIDENCIA está em outro caminho. A decisão não pode ir ao Jev como está: a seção desconhecidos faz perguntas ao dono, a opção B ignora que o arquivo não registra depósitos e saques, e faltam duas opções reais. decisao_ok é falso.

## Comments

