# Ciclo 2, ticket T01: Patrimonio USD conciliado e capital base

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: capital
Priority: 1

## Question

Qual o patrimonio USD avaliado da carteira do agente em uma data fixa, por perna (USDC, SOL de rede, tokens marcados a preco), e qual fonte sustenta cada valor citado de US$ 100, 118, 121 e 126?

Por que importa: Sem patrimonio conciliado o retorno composto sobre o capital total nao tem denominador (knownValueUsd 0, valueComplete false, netUsd nulo, validacao-e-baseline secao 1). Todo ticket de custo e de retorno depende desta base. Medida somente com agregados, sem enderecos nem chaves.
Evidencia a buscar: Campos agregados em data/ (capitalUsd, valueComplete, knownValueUsd); diagnostico-compras-20261014.md:13; EVIDENCIA-OPERACAO-20261015.md:45; ALAVANCAGEM-VIABILIDADE-20261014.md:118; capacidades-okx.md:20; design.md:193. Nao ler .env nem enderecos de carteira.

## Answer

O patrimonio USD conciliado da carteira nao existe hoje. O ultimo valor medido foi US$ 118,17 a 118,80 em 15/10/2026 (caixa em stablecoin de 90% a 91%, um ativo real, quatro ativos sem preco). Os outros valores citados nao tem medicao propria: US$ 100 e capital configurado (so-latest.json:24), US$ 121 e uma estimativa de 14/10 (ALAVANCAGEM-VIABILIDADE-20261014.md:118) e US$ 126 e outra estimativa de 14/10 noite (design.md:193). O total conhecido de 155 em data/operator/latest.json:121 nao esta datado nem conciliado com 118, e o codigo marca valueComplete falso quando algum ativo nao tem preco, entao todo total atual e um piso. Recomendacao: usar 118,17 a 118,80 como base provisoria rotulada, ou so medir sem base fixa, ate um snapshot agregado com valueComplete verdadeiro.

### Caminhos (Wayfinder)

- **Snapshot agregado diario por perna, sem ordens**: Ler saldo de USDC, SOL e demais tokens em horario fixo, com preco de cada perna, e gravar total, knownValueUsd, valueComplete e lista de ativos sem preco. Nao enviar nenhuma ordem. | Restricao que prende: valueComplete falso sempre que ha ativo sem preco (portfolio.ts:301); 4 ativos sem preco em 15/10 e 155 USD sem data em operator/latest.json:121. | Experimento mais proximo: Tres snapshots em horarios fixos num dia, comparando cada total com o anterior e com o fluxo de fills, sem alterar nada na carteira. | Ganho: Um denominador conciliado para o retorno composto; sem ele nenhum ciclo tem retorno em USD (validacao-e-baseline secao 1). | Esforco: baixo: leitura de saldo e preco, sem mudar codigo de execucao. | Como medir: Diferenca entre snapshots consecutivos explicada por fills registrados; fracao de snapshots com valueComplete verdadeiro; numero de ativos sem preco por dia.
- **Base provisoria rotulada de 118,17 a 118,80**: Usar a faixa medida em 15/10 como denominador provisorio, com rotulo explicito de provisorio em todo relatorio de retorno, ate a conciliacao. | Restricao que prende: A faixa vem de uma unica leitura de 15/10 e o numero de 126 e 121 nao foi conciliado (api-limites-e-fontes.md:151). | Experimento mais proximo: Recalcular o retorno de cada janela de 1 minuto com essa base fixa e reportar a faixa de erro (0,4% de amplitude da faixa) junto do numero. | Ganho: Permite iniciar a medicao de retorno ja em sombra, sem esperar a conciliacao completa. | Esforco: baixo: constante de configuracao e rotulo no relatorio. | Como medir: Retorno por janela com intervalo de incerteza igual a largura da faixa; comparacao com a base do snapshot agregado quando existir.
- **Denominador vivo pelo agentUsd do ultimo livro**: Trocar o capital fixo por agentUsd lido a cada ciclo, sem usar valores configurados. Sem livro, o retorno fica indefinido e o ciclo e marcado como sem base. | Restricao que prende: agentUsd e nulo sem o ultimo livro (wire.ts:302), e a conciliacao de valueComplete ainda nao existe. | Experimento mais proximo: Registrar agentUsd por ciclo em sombra por um dia, sem alterar a decisao, e medir quantos ciclos tem base. | Ganho: Denominador que acompanha a carteira real, sem valor digitado a mao. | Esforco: medio: ligacao de leitura por ciclo, sem tocar ordens. | Como medir: Fracao de ciclos com agentUsd nao nulo; variacao de agentUsd entre ciclos sem operacao.
- **Adiar a base e so medir**: Nao fixar denominador. Registrar apenas os agregados (snapshots, valueComplete, custos medidos) e decidir a base depois da conciliacao. | Restricao que prende: Sem base conciliada, nenhum retorno composto pode ser reportado como resultado, o que atrasa a decisao de capital. | Experimento mais proximo: Uma semana de snapshots agregados, sem nenhuma comparacao de retorno, para ver a estabilidade do total. | Ganho: Zero risco de reportar base errada; o custo e o atraso da medicao. | Esforco: minimo. | Como medir: Estabilidade do total entre snapshots, sem oscilacao causada por ativos sem preco.

### Achados

- [A1|fato|alta|VERIF=parcial] O capital da fase de sombra em data/quant/so-latest.json e configurado (capitalUsd 100, source configured) e o valor de carteira vem zerado: knownValueUsd 0 e valueComplete false.
    fonte: data/quant/so-latest.json:24-26
    >> parcial: so-latest.json linha 24 (capitalUsd 100), linha 25 (knownValueUsd 0) e linha 26 (valueComplete false) conferem. O campo source "configured" esta na linha 29, fora do intervalo citado 24-26. | correcao: Citar data/quant/so-latest.json:24-26 para capital e valor, e :29 para source configured. Tambem o bloco esta dentro de brief.wallet, nao no topo do arquivo.
- [A2|fato|media|VERIF=refutado] O total conhecido em data/operator/latest.json e 155 USD com valueComplete false e riskTokensExcluded true. Uma cadeia tem 62,5 completo e outra tem 7,5 incompleto. A data do snapshot nao foi verificada, por isso nao e comparavel com 118.
    fonte: data/operator/latest.json:117-122
    >> refutado: Em operator/latest.json as chaves 121 (knownValueUsd 155) e 122 (valueComplete false) conferem, mas a descricao esta errada: sao tres cadeias, nao duas. Monad 62,5 completo (linha 47-48), X Layer 85 completo (linhas 82-83, omitido no texto), Solana 7,5 incompleto (linhas 117-118). Pior: o arquivo tem "source": "synthetic" (linha 8) e endereco "0x0000...0001" (linha 6). O epoch 1791670217 converte para 2026-10-10 22:10 UTC. O codigo marca esse caso como dado de demonstracao: portfolio.ts:318 diz "Deterministic offline example used by CLI demos and tests; never a real wallet". | correcao: O total de 155 USD nao e patrimonio da carteira. Deve ser removido da lista de fatos como base de patrimonio, ou marcado como fixture sintetica de 2026-10-10. A data nao precisa mais ser verificada: e 2026-10-10 22:10 UTC e a fonte e sintetica.
- [A3|fato|alta|VERIF=confirmado] O codigo de valoracao marca valueComplete falso quando um ativo tem valueUsd nulo, e soma apenas valores conhecidos. Por isso o total e um piso, e nao um patrimonio fechado.
    fonte: src/okx-wallet/portfolio.ts:301-312
- [A4|fato|alta|VERIF=confirmado] O capital que o autopiloto recebe vem do agentUsd do ultimo livro. Sem livro, o valor e nulo, nao 100 nem 118.
    fonte: src/agent/wire.ts:302
- [A5|fato|alta|VERIF=confirmado] O script de medicao usa initialUsd 118 como constante, com status not_proven e a razao de que nao existe serie integral conciliada de carteira, fluxos, fills e custos em USD.
    fonte: scripts/autoresearch.ts:60 e :66
- [A6|fato|alta|VERIF=confirmado] Em 15/10 o patrimonio foi lido entre US$ 118,17 e US$ 118,80, com caixa de 90% a 91%, uma posicao real (EMBER, 10% do total), quatro ativos sem preco (poeira) e janela de 0,61 h.
    fonte: docs/sdd/agente-autonomo/EVIDENCIA-OPERACAO-20261015.md:45
- [A7|fato|media|VERIF=parcial] A nota de viabilidade de alavancagem de 14/10 cita capital de cerca de US$ 121, com USDC parado de cerca de US$ 85 na Solana e SOL de cerca de US$ 1. Essa e uma leitura estimada no documento, nao uma medicao reproduzivel no repositorio.
    fonte: docs/sdd/agente-autonomo/ALAVANCAGEM-VIABILIDADE-20261014.md:118
    >> parcial: ALAVANCAGEM-VIABILIDADE-20261014.md:118 diz "[V] Capital ~US$ 121; USDC parado ~US$ 85 na Solana; SOL ~US$ 1" e cita capacidades-okx.md. Nao e rotulado como estimativa; esta marcado como verificado e aproximado. Alem disso, SOL ~US$ 1 conflita com priceUsd 150 do SOL em operator/latest.json:98-99, que e um dado sintetico, e a nota diz USDC parado de 85 na Solana enquanto o inventario sintetico mostra 30 USDC na Solana sem preco. | correcao: Reclassificar como citacao de capacidades-okx.md (nao verificada aqui) com aproximacao, nao medicao. Registrar o conflito de preco do SOL (1 contra 150) como pendencia, sem usar nenhum dos dois como base.
- [A8|fato|media|VERIF=refutado] A segunda rodada de estudo de 14/10 a noite cita carteira de cerca de US$ 126 e calcula o teto por ordem a partir dessa base.
    fonte: docs/sdd/carteira-evidencia/design.md:193
    >> refutado: docs/sdd/carteira-evidencia/design.md:193 e um paragrafo sobre o Laboratorio (replay, custos, estatistica) e nao contem a cifra de US$ 126 nem calculo de teto por ordem. Busca em docs/sdd/carteira-evidencia/ por "126" retorna apenas hashes SHA-256 e um numero de imagem. Nao achei a base de 126 em nenhum arquivo deste diretorio. | correcao: Remover "carteira de cerca de US$ 126" como fato. Se a cifra existe, esta em outra fonte ainda nao localizada, e o campo citado_14_10 da decisao deve ser marcado como nao verificado. A pergunta d3 segue aberta.
- [A9|fato|alta] O diagnostico de compras de 14/10 usa carteira de aproximadamente US$ 118 para calcular que o risco de 2% limita a entrada a cerca de US$ 2,36, abaixo do minimo de US$ 10 do codigo. O caminho real do arquivo e docs/sdd/hospedagem-24h/, nao docs/ na raiz como indicava o ticket.
    fonte: docs/sdd/hospedagem-24h/diagnostico-compras-20261014.md:13
- [A10|fato|alta] A base documentada de retorno pendente de conciliacao e 118,17 a 118,80, medida em 15/10, ate que os valores de US$ 100, 118, 121 e 126 sejam conciliados.
    fonte: docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:151 e validacao-e-baseline.md secao 1
- [A11|calculo|media] A diferenca entre 126 e 118 e de 6,3%, e entre 121 e 118 e de 2,5%. A sequencia temporal (126 em 14/10 a noite, 118 em 15/10) sugere queda de base, mas as perdas medidas nas 7 voltas somam so cerca de -0,32 USDC, insuficiente para explicar a diferenca.
    fonte: calculo sobre design.md:193, EVIDENCIA-OPERACAO-20261015.md:45 e validacao-e-baseline.md secao 1
- [A12|hipotese|baixa] Causa da diferenca entre 126, 121 e 118 nao verificada: pode ser data de leitura, escopo (com ou sem SOL de rede ou ativos sem preco) ou erro de estimativa.
    fonte: inferencia sobre os achados A6 a A11; nao verificado no console da OKX

### Decisao para o Jev

Pergunta: Qual base de capital (denominador do retorno composto) o sistema usa nesta fase de sombra?
Reversivel: true

- medir-sem-base (So medir, sem base fixa): Conservadora. Gravar snapshots agregados por perna com valueComplete e knownValueUsd, sem reportar retorno em USD ate a conciliacao. | Evidencia: so-latest.json:26 valueComplete false; portfolio.ts:301
- base-118-provisoria (Base provisoria de 118): Usar 118,17 a 118,80 como denominador provisorio, com rotulo explicito de provisorio e faixa de erro em todo relatorio, ate conciliar. | Evidencia: EVIDENCIA-OPERACAO-20261015.md:45; api-limites-e-fontes.md:151
- base-agentusd (Base viva pelo agentUsd): Denominador recalculado a cada ciclo a partir do agentUsd do ultimo livro. Ciclos sem livro ficam sem base e nao entram no retorno. | Evidencia: wire.ts:302 agentUsd nulo sem livro
- base-configurada-100 (Base configurada de 100): Usar o capitalUsd configurado de 100. Nao e medido e nao bate com as medicoes de 14 e 15/10, por isso so serve como teste de sensibilidade. | Evidencia: so-latest.json:24 source configured

Recomendacao sem Jev: medir-sem-base - E a opcao mais reversivel e de menor risco: nao fixa nenhum numero de capital, nao muda limite nem dimensionamento e nao envia ordem. Ela gera o snapshot agregado que falta para conciliar 118, 121, 126 e 155, e pode ser trocada por base-118-provisoria depois, sem perda de dado.
Cetico: decisao_ok=false; problemas: Fato knownValueUsd_operator (155) e tratado como saldo da carteira com a ressalva 'sem data verificada', mas a fonte e sintetica (operator/latest.json:8, endereco de exemplo, data 2026-10-10 22:10 UTC). Pode levar o Jev a escolher base em um numero fake. | Fato citado_14_10 traz 'cerca de US$ 126' de design.md:193, que nao existe nesse ponto (ver A8). A fato tambem e fraco em ALAVANCAGEM:118 (ver A7). | Fato capital_configurado cita so-latest.json:24 para source configured, mas o source esta na linha 29. | As opcoes base-agentusd e base-118-provisoria alimentam o capital que deriveSettings e deriveLimits usam (wire.ts:302, autopilot.ts:94, envelope.ts:361-452). Trocar o denominador muda caixa maximo, teto por ordem e exposicao. A propria restricao 2 diz que isso e decisao do dono, entao essas opcoes ferem o item 'limites de risco' da lista vedada ao Jev, e 'reversivel: true' esta errado para elas. | A pergunta mistura dois usos que sao coisas diferentes: base de medicao do retorno (reporting) e base de dimensionamento de risco (limites). A decisao deve separar as duas, ou o Jev responde sobre limite sem saber disso. | medir-sem-base e base-agentusd tem o mesmo efeito de ciclos sem base, o que reduz a distincao entre elas. base-configurada-100 e so teste de sensibilidade e nao deveria ser opcao de decisao, e sim nota. | Faltam opcoes e restricoes sobre o status de conciliacao: a decisao nao diz que sem valueComplete true em todas as pernas o retorno nao deve ser reportado em USD, nem que ativos sem preco ficam a parte (EVIDENCIA-OPERACAO-20261015.md:40).

### Bloqueios do dono

- Limites de risco e dimensionamento derivados do capital (deriveLimits, teto por ordem e paradas): a escolha da base muda esses limites e e decisao do dono.
- Qualquer liberacao de operacao com o capital escolhido, incluindo sair da sombra: decisao do dono por escrito.
- Valor real do patrimonio e saldos individuais: a pesquisa usou so agregados de arquivos e nao leu a carteira ao vivo.

### Novos tickets revelados

- Conciliar o total de 155 com os 118 medidos: O total de 155 em data/operator/latest.json tem data e escopo iguais aos da medicao de 15/10, ou e outra base?
- Piso de ordem contra patrimonio de 118: O minimo de US$ 10 de sizing (diagnostico-compras-20261014.md:13) e necessario? Qual o custo medido por tamanho de entrada?
- Ativos sem preco (poeira) no patrimonio: Quais ativos sem preco entram no denominador, e como excluir ou precificar poeira sem mudar o valueComplete?
- Origem de 121 e 126 nas notas de 14/10: Os valores de 121 e 126 foram lidos de saldo ou estimados? Qual a data e a fonte de cada um?

### Nao lido

- Campos brutos de data/audits.jsonl, fills.jsonl, execution-latest.json e usage: nao abertos alem dos agregados citados.
- Saldo ao vivo da carteira e a OKX: nao consultados; nenhuma leitura de rede feita nesta pesquisa.
- .env, chaves e enderecos de carteira: nao lidos, por regra.
- docs/sdd/agente-autonomo/capacidades-okx.md:20: a linha contem 121 ou 126, mas o corte do terminal impediu confirmar qual numero e o trecho exato.
- Caminho do ticket: diagnostico-compras, EVIDENCIA-OPERACAO, ALAVANCAGEM e capacidades-okx ficam em docs/sdd/..., nao em docs/ na raiz; a linha 13 do diagnostico mede o piso de ordem, nao um saldo de capital.
- Fontes primarias de rede (OKX, Solana) sobre precificacao de tokens: nao verificadas, nao foram necessarias para este ticket.

### Resumo do cetico

Revisao cetica do ticket T01 (patrimonio USD e capital base). Duas afirmacoes centrais sairam erradas: o total de 155 USD em data/operator/latest.json vem de um inventario sintetico (source "synthetic", endereco de exemplo 0x0000...0001, snapshot de 2026-10-10 22:10 UTC), nao de uma leitura de carteira; e a citacao de "cerca de US$ 126" em design.md:193 nao existe no arquivo citado nem em outro ponto de docs/sdd/carteira-evidencia. As afirmacoes sobre valueComplete, agentUsd e o 118 fixo do script estao corretas. A decisao nao pode ir ao Jev como esta: duas das quatro opcoes mudam o capital que alimenta limites de ordem, e a base de 155 e de 126 esta contaminada. Nenhuma ordem, leitura de carteira ou chamada ao Jev foi feita; a verificacao foi so de leitura de arquivos e de datas.

## Comments

