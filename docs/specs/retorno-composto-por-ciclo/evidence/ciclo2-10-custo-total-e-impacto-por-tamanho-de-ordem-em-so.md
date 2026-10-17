# Ciclo 2, ticket T10: Custo total e impacto por tamanho de ordem em SOL

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: custo
Priority: 10

## Question

Qual o custo total em porcentagem de compra e venda (rede, prioridade, impacto, imposto, conta de token) para tamanhos de 2, 5, 10, 12 e 25 USD, e o impacto medido por par confere com a aproximacao 2 x tamanho / TVL?

Por que importa: CALCULO: custo fixo de US$ 0,0206 por ida e volta vale 1,0% em US$ 2, 0,17% em US$ 12 e 0,017% em US$ 121. Isso mostra o tamanho minimo economico, informacao que o dono precisa para decidir o piso. A aproximacao 2 x tamanho / TVL vale para produto constante e define quando o crescimento composto vira linear. Esta ticket mede; nao fixa limite.
Evidencia a buscar: Recibos agregados de execucao (mediana de 85.427 lamports em 21 ordens, sem carteira); src/okx-market/round-trip.ts; scripts/move-vs-friction.ts; cotacoes sinteticas de 2, 5 e 10 USDC em pool de cerca de US$ 37 mil, sem enviar ordem; TVL por pool vindo de dado de pool.

## Answer

Rede por ida e volta (2 transacoes): US$ 0,0206 pelo recibo (97.859 lamports) ou US$ 0,0180 pela mediana (85.427 lamports, 21 ordens). Em % do tamanho (recibo / mediana): US$ 2 = 1,03% / 0,90%; US$ 5 = 0,41% / 0,36%; US$ 10 = 0,21% / 0,18%; US$ 12 = 0,17% / 0,15%; US$ 25 = 0,08% / 0,07%. Prioridade, gorjeta Jito, taxa de pool, imposto de token e impacto NAO estao separados em nenhum registro do repo, entao o custo total por tamanho nao esta medido. No par raso de cerca de US$ 37 mil, o custo medido foi -2,09% a -2,14% em 2, 5 e 10 USDC, quase igual entre tamanhos. A formula 2 x tamanho / TVL preve 0,011% a 0,054% nesses tamanhos, entao NAO confere; o custo parece percentual fixo (taxa de pool ou imposto), o que e inferencia. Aluguel de conta de token (0,00204 SOL, cerca de US$ 0,215, nao verificado) pesaria 10,8% em US$ 2 se nao for recuperado. O codigo nao calcula custo: round-trip.ts:162 sempre encerra em unknown; cotacoes sinteticas nao foram geradas.

### Caminhos (Wayfinder)

- **Decompor o custo por fill em arquivo novo**: Derivar, a partir das assinaturas ja gravadas, taxa base, prioridade (compute unit price e limite), gorjeta Jito e transferencias, sem mudar o schema de fills.jsonl. | Restricao que prende: fills.ts:30-32 guarda so o total; o registro nao separa componentes (a9). | Experimento mais proximo: Leitura de 30 execucoes por classe de liquidez (liquido, intermediario, raso) em arquivo novo, com soma de componentes igual ao total. | Ganho: Explica se os 2,1% do raso sao taxa fixa, prioridade ou pool; valor nao medido. | Esforco: medio | Como medir: Soma dos componentes igual ao total de cada fill, com media, mediana e dispersao por componente.
- **Cotacao sintetica em lote, sem ordem**: Cotar 2, 5, 10, 12 e 25 USDC nos pares testados, com unidade de saida confirmada, para montar a curva custo por tamanho. | Restricao que prende: round-trip.ts:162 bloqueia sempre; a unidade de saida do provedor nao e verificada; exige cliente OKX DEX autenticado, cuja chave e do dono. | Experimento mais proximo: Teste com cliente falso e fixture de resposta conhecida, validando unidade e identidade antes de qualquer chamada real. | Ganho: Permite ver se o custo muda com o tamanho; sem numero ainda. | Esforco: baixo | Como medir: Custo percentual por tamanho com intervalo, por par; comparar com a7.
- **Reconciliar o modelo de impacto no raso**: Verificar se o custo fixo de cerca de 2% vem de taxa do pool ou imposto, lendo tipo de pool e taxas publicas do mesmo par, sem ordem. | Restricao que prende: A formula 2 x tamanho / TVL nao confere com o medido (a7), e o tipo de pool nao foi identificado. | Experimento mais proximo: Cotar o mesmo par em dois tamanhos e comparar com a taxa publica do pool e com o TVL lido por RPC publico. | Ganho: Define se o raso tem custo estrutural que nenhum tamanho resolve; valor nao medido. | Esforco: baixo | Como medir: Regressao de custo contra tamanho; inclinacao proxima de zero indica custo fixo, nao impacto.
- **Custo fixo de conta de token**: Verificar se as contas de token dos mints usados ja existem e qual o aluguel exato, por leitura de RPC, sem enviar nada. | Restricao que prende: O aluguel de 0,00204 SOL e nao verificado (a11); pesa 10,8% em US$ 2 se nao recuperado. | Experimento mais proximo: Consulta de getMinimumBalanceForRentExemption e de existencia de conta, em leitura. | Ganho: Remove ate 10,8% do custo em US$ 2 se a conta for pre-criada e recuperada ao fechar. | Esforco: baixo | Como medir: Aluguel em lamports e percentual por tamanho, com e sem conta pre-criada.
- **Gate de custo que so subtrai**: Subtrair o custo medido antes da decisao do Jev, sem alterar o tamanho da ordem nem criar compra. | Restricao que prende: Depende de a1 a a5 estarem medidos; o gate nao pode criar compra e o piso de tamanho e limite de risco do dono. | Experimento mais proximo: Teste de que o gate nunca cria compra, com custo fixo de US$ 0,0206 como entrada. | Ganho: Evita entradas com custo maior que a margem; nao melhora o retorno por si. | Esforco: medio | Como medir: Taxa de candidatos que passam o gate, comparada com a taxa que fecha o trade no sombra.

### Achados

- [a1|fato|alta|VERIF=confirmado] Taxa base Solana de 5.000 lamports por assinatura, metade queimada e metade ao validador. Prioridade = ceil(preco_por_CU_em_micro-lamports x limite_CU / 1.000.000) lamports, 100% ao validador. Limite padrao 200.000 CU por instrucao, maximo 1.400.000 por transacao.
    fonte: https://solana.com/docs/core/fees (verificado hoje); docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:94-95
- [a2|fato|media|VERIF=parcial] Recibo medido: 97.859 lamports de taxa de rede, cerca de US$ 0,0103 a US$ 105,48 por SOL, contra tradeFee cotado de US$ 0,0005211, cerca de 20 vezes menor.
    fonte: docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t08-execucao-solana-custos.md:41; evidence/pesquisa-t12-linha-de-base.md:32
    >> parcial: O recibo de 97.859 lamports e o calculo de US$ 0,0103 a 105,48 por SOL conferem (0,000097859 x 105,48 = 0,01032). Mas a cotacao esta inconsistente: pesquisa-t08-execucao-solana-custos.md:41 e api-limites-e-fontes.md:102 dizem 0,0005144; pesquisa-t12-linha-de-base.md:32 e pesquisa-lacuna-g2.md:23 dizem 0,0005211. A fonte citada em t08:41 traz 0,0005144, nao 0,0005211. | correcao: Citar 0,0005144 com t08:41 e api-limites:102, e registrar o conflito com 0,0005211 (t12:32, lacuna-g2:23). A razao de cerca de 20 vezes vale nos dois casos (20,1 e 19,8).
- [a3|fato|media|VERIF=refutado] Mediana de taxa de rede de 85.427 lamports em 21 ordens executadas (min 13.902, max 397.396). Os dados brutos nao estao no repo; so o valor agregado foi lido nos documentos.
    fonte: docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t12-linha-de-base.md:32
    >> refutado: O arquivo data/decision-review/execution-latest.json existe localmente, com 29 valores nao nulos de walletFeeLamports (94 nulos, 123 ocorrencias). Minimo 13.902 confere. Maximo 466.118 (doc diz 397.396). Mediana 102.084 (doc diz 85.427). A contagem de 21 ordens nao aparece diretamente; nao identifiquei o subconjunto que daria 85.427. | correcao: Recalcular com filtro explicito das ordens executadas e citar o criterio. Ate la, usar mediana nao verificada e min 13.902 como unico valor confirmado. Confirmar tambem se o arquivo esta versionado ou so local.
- [a4|calculo|alta|VERIF=confirmado] Custo fixo de rede por ida e volta (2 transacoes): US$ 0,0206 com recibo e US$ 0,0180 com mediana. Em % de US$ 2, 5, 10, 12 e 25: recibo 1,03, 0,41, 0,21, 0,17, 0,08; mediana 0,90, 0,36, 0,18, 0,15, 0,07.
    fonte: calculo sobre a2 e a3 com preco de SOL de US$ 105,48 (valor do doc, nao reconferido)
- [a5|fato|alta|VERIF=confirmado] O codigo nao mede custo: quoteRoundTrip sempre para em stop('unknown','provider_output_unit_unverified'), netStatus fica net_not_evaluated e costUsd e null.
    fonte: src/okx-market/round-trip.ts:162, 37-38, 133-134
- [a6|fato|alta|VERIF=parcial] O script de atrito usa friccao de 2% como premissa padrao, nao medida, e a propria nota diz que nao prova ganho.
    fonte: scripts/move-vs-friction.ts:2-3, 27, 43
    >> parcial: O padrao de friccao 2 esta em scripts/move-vs-friction.ts:27. A nota de que a friccao e premissa esta na linha 4 (The friction is an ASSUMPTION) e a de que nao prova ganho na linha 43. A linha 2-3 nao contem essas frases. | correcao: Citar move-vs-friction.ts:4, 27 e 43.
- [a7|calculo|media|VERIF=parcial] Formula de impacto em produto constante: impacto medio de cerca de 2 x tamanho / TVL. Para pool de US$ 37 mil, prediz 0,011% (2 USDC), 0,027% (5), 0,054% (10), 0,065% (12) e 0,135% (25). O medido foi -2,09% a -2,14% em 2, 5 e 10 USDC: nao confere, e o custo quase nao muda com o tamanho.
    fonte: docs/specs/retorno-composto-por-ciclo/matematica-da-meta.md secao 5 (observacao sobre o raso); research.md:45; pesquisa-t07-velocidade-de-decisao.md:44
    >> parcial: A formula de impacto 2 s / L conferir: matematica-da-meta.md:69 e 81 e research.md:45. Os valores da tabela sao calculo correto: 2 x 2 / 37.000 = 0,0108%, 5 = 0,027%, 10 = 0,054%, 12 = 0,065%, 25 = 0,135%. O valor medido de -2,09% a -2,14% vem de pesquisa-t07-velocidade-de-decisao.md:44, que se apoia em fills.jsonl. Glob por **/fills.jsonl nao achou nada no repo. | correcao: Marcar o atrito medido de -2,09% a -2,14% como nao verificavel no repo. A conclusao de que o custo nao escala com o tamanho depende desse dado. Manter a formula como calculo e o desvio como inferencia.
- [a8|inferencia|baixa] A inferencia do custo fixo: como o custo nao cresce com o tamanho, o componente dominante em ordens pequenas e provavelmente taxa percentual do pool ou imposto de token, e nao impacto. Pool concentrado (CLMM/DLMM) pode se comportar diferente da formula, o que nao foi testado.
    fonte: derivado de a7; matematica-da-meta.md secao 5
- [a9|fato|alta|VERIF=confirmado] O registro de fills guarda so o total de taxa (feeLamports), a taxa da carteira e o delta nativo. Prioridade, gorjeta Jito e taxa de pool nao sao separados.
    fonte: src/agent/fills.ts:30-32
- [a10|fato|baixa] O atrito medio de ida e volta em ativo liquido, 0,42% (n=6, 0,17% a 0,56%), e o unico numero de custo total por operacao. Nao esta verificado no repo: fills.jsonl nao foi localizado, e o relatorio t07 marca o valor como nao verificado.
    fonte: pesquisa-lacuna-g2.md:7; pesquisa-t07-velocidade-de-decisao.md:44 e 47
- [a11|calculo|media] Aluguel de conta de token: cerca de 0,00204 SOL (165 bytes), cerca de US$ 0,215; recuperavel ao fechar a conta. Pesa 10,8% em US$ 2, 4,3% em US$ 5, 2,2% em US$ 10, 1,8% em US$ 12 e 0,9% em US$ 25, se nao for recuperado. Valor nao verificado nesta pesquisa.
    fonte: docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md (tabela secao 5); pesquisa-t08-execucao-solana-custos.md:56; verificar com getMinimumBalanceForRentExemption
- [a12|calculo|media] Prioridade de exemplo: 1.400.000 CU a 1.000.000 micro-lamports por CU = 1,4 milhao lamports, cerca de US$ 0,148, que e 7,4% de US$ 2 e 0,59% de US$ 25. O preco por CU e hipotetico, sem valor medido.
    fonte: pesquisa-lacuna-g2.md:29; arquitetura-e-decisao.md:95
- [a13|fato|media] Gorjeta minima Jito de 1.000 lamports por bundle (cerca de US$ 0,000105). O minimo da OKX para tips e de 0,0000000001 SOL e conflita com esse valor; nao testado.
    fonte: https://docs.jito.wtf/lowlatencytxnsend/ (lido na pesquisa-t08, nao reverificado hoje); pesquisa-t08-execucao-solana-custos.md:19 e 22

### Decisao para o Jev

Pergunta: Antes de fixar um piso de tamanho ou um gate de custo, qual medicao de custo por tamanho o sistema deve fazer?
Reversivel: true

- so_medir (So medir, sem piso nem gate): Adiar qualquer piso. Medir custo por tamanho e componente em sombra, sem alterar decisao nem tamanho de ordem. | Evidencia: Custo do raso nao explicado pela formula (a7); round-trip.ts:162 bloqueia calculo.
- decompor_fill (Decompor fills antes): Criar arquivo novo com componentes por fill (base, prioridade, gorjeta, pool) antes de qualquer decisao de tamanho. | Evidencia: fills.ts:30-32 guarda so o total de taxa (a9).
- cotacao_lote (Cotacao sintetica em lote): Cotar 2, 5, 10, 12 e 25 USDC sem ordem, com unidade de saida validada por fixture antes de qualquer chamada real. | Evidencia: Unidade de saida nao verificada; exige chave do dono (round-trip.ts:162).
- gate_subtrai (Gate de custo que so subtrai): Subtrair custo medido antes do Jev, sem criar compra e sem mudar tamanho. Piso fica para o dono. | Evidencia: RC-T11 pede teste que prove que o gate nunca cria compra.

Recomendacao sem Jev: so_medir - E a opcao mais reversivel e de menor risco: nao altera tamanho, decisao nem codigo de execucao, e so acrescenta medicao. Os numeros disponiveis sao inconsistentes entre si (a7, a10), entao qualquer piso fixado agora seria chute. Medir antes preserva todas as outras opcoes.
Cetico: decisao_ok=false; problemas: Opcao cotacao_lote exige chave OKX do proprio dono (credencial). Isso toca o assunto vedado de segredos, chaves e credenciais, e nao pode ser decidido pelo Jev. Deve ir como bloqueio do dono, nao como opcao. | Desconhecido chave_okx esta em desconhecidos com ask. Pela regra do dono, segredo e bloqueio registrado, nao pergunta ao Jev. Mover para bloqueios_do_dono. | Opcao decompor_fill cria campos por fill. Se isso alterar o registro gravado em fills.ts ou o journal, e migracao de schema ou de journal, vedado. So e aceitavel como arquivo novo derivado, que nao escreve no journal. A descricao precisa dizer isso. | Opcao gate_subtrai atua no caminho de decisao antes do Jev. Mesmo sem criar compra, muda quais ordens existem, o que e controle de limite de risco, decisao do dono. Deve sair do conjunto do Jev ou ganhar a restricao explicita de que nao altera tamanho nem criacao de ordem, com teste de prova. | Fato mediana_rede (85427 em 21 ordens) nao reproduz a partir do arquivo local (ver a3). Corrigir antes de levar ao Jev. | Fato raso_medido e liquido_medido (0,42%) dependem de fills.jsonl, inexistente no repo. Devem ser marcados como nao verificados, nao como fatos. | Em so_medir, a evidencia cita round-trip.ts:162, que e verdadeira, mas a medicao por componente depende de dado que so pode vir de transacao individual. Sem a opcao de RPC abaixo, so_medir nao tem como medir componente.

### Bloqueios do dono

- Piso ou teto de tamanho de ordem: limite de risco, decisao do dono.
- Dimensionar tamanho pela profundidade do pool (2 x tamanho / TVL) como regra: toca limite de risco.
- Liberar live com custo medido ou autorizar qualquer ordem, sintetica ou real, em carteira.
- Chave ou credencial da OKX DEX para cotacao autenticada: segredo, nao usado nesta pesquisa.
- Aceitar o risco de termos da OKX para qualquer raspagem: decisao do dono (fora deste ticket).

### Novos tickets revelados

- Natureza do custo fixo de 2% no raso: O custo de -2,1% em 2, 5 e 10 USDC e taxa de pool, imposto de token ou impacto de pool concentrado?
- Unidade de saida da cotacao OKX DEX: Qual a unidade de toAmount e como validar a cotacao sem chave real, com fixture?
- Aluguel e existencia de conta de token: Quanto custa a conta de token de cada mint usado e ela ja existe na carteira?
- TVL real por pool por RPC publico: Qual TVL por pool dos pares testados, lido por RPC publico, sem chave?

### Nao lido

- Cotacoes sinteticas de 2, 5 e 10 USDC nao geradas: exigem cliente OKX DEX autenticado (chave do dono).
- fills.jsonl nao foi localizado no repo; .scratch nao foi lido (dados de execucao locais).
- Recibos e mediana de 21 ordens lidos apenas pelos documentos; dados brutos fora do repo.
- Documentacao da Jito e da OKX DEX nao reverificadas hoje; so solana.com/docs/core/fees foi verificada.
- Aluguel de conta de token e TVL por pool nao consultados (RPC nao usado).
- Nenhum dado de carteira, endereco ou saldo foi lido, por regra.

### Resumo do cetico

Reverifiquei as oito afirmacoes contra o repo e a documentacao oficial da Solana. A formula de taxa, a taxa base, o limite de CU e a ausencia de medicao de custo no codigo confirmam. Tres pontos nao se sustentam como escritos: a cotacao de taxa aparece com dois valores diferentes nos documentos, a mediana de 85.427 lamports em 21 ordens nao reproduz a partir de data/decision-review/execution-latest.json, e o atrito medido e o raso dependem de fills.jsonl, que nao existe no repo. A decisao nao pode ir ao Jev como esta: uma opcao exige chave do dono, outra pode mexer no journal de fills e a terceira e um gate de risco no caminho da ordem. Falta uma opcao sem chave, somente leitura, que decompoe a taxa das ordens ja executadas via RPC.

## Comments

