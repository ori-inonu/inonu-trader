# Ciclo 2, ticket T06: Regime de janela que entra primeiro em sombra

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: edge
Priority: 6

## Question

Entre (a) deslocamento de preco bolsa x DEX nos tokens da interseccao, (b) migracao e graduacao do pump.fun via subscribeMigration e (c) momentum de 5 a 15 min nos tokens da interseccao, qual regime e medido primeiro em sombra?

Por que importa: A ordem define o custo do primeiro experimento. Nao ha regime com evidencia primaria em Solana: (a) so tem evidencia em Ethereum, (b) tem taxa de graduacao de 1,4% a 6,7% sem retorno primario, (c) deu zero no backtest diario RAS-7 e nao superou a media dos pares. A escolha e reversivel porque e so sombra.
Evidencia a buscar: docs/specs/retorno-composto-por-ciclo/fontes-de-edge.md; backtest RAS-7 em evidence/; documentacao oficial do PumpPortal para subscribeMigration; registro de graduacao publicado pelo emissor.

## Answer

Primeiro em sombra: (c) momentum de 5 a 15 min na interseção, medido com o feed público da OKX (sem chave, sem custo, sem capital), com markout de 1, 5 e 15 min e atrito de 0,42% ida e volta descontado.
Restrição que decide: o movimento mediano é 0,38% em 1 min, 0,63% em 5 min e 1,03% em 15 min. Com alvo de 0,5% líquido, a conta exige acerto de cerca de 95% em 15 min e é impossível em 5 min com movimento mediano (cálculo, a9).
(b) migração pump.fun é gratuita para receber o evento, mas a taxa de graduação vai de 0,63% a 6,7% conforme a janela, o único modelo preditivo testado não generalizou (AUROC 0,464 na validação) e não há retorno pós-graduação de fonte primária.
(a) não tem estudo CEX-DEX primário em Solana, e o desvio médio bolsa x DEX em BTC, ETH e SOL (0,06% a 0,08%) fica abaixo do atrito.
Nenhum regime tem lucro comprovado. A meta composta continua hipótese a medir, sem promessa.

### Caminhos (Wayfinder)

- **Momentum de 5 a 15 min em sombra no feed OKX**: Sinal de momentum nos ativos da interseção com preço do feed público da OKX, sem ordem, com markout de 1, 5 e 15 min e atrito de 0,42% descontado. Custo de dado zero e sem chave. | Restricao que prende: Atrito de 0,42% ida e volta contra mediana de 0,38% em 1 min. Em 5 min o acerto exigido é impossível e em 15 min cerca de 95% (cálculo a9). RAS-7 foi nulo só em candle diário. | Experimento mais proximo: Gravar sinais e preços do feed público OKX para os símbolos da interseção com contrato identificado, em sombra, sem ordem, por janelas de 1, 5 e 15 min. | Ganho: Não medido. Só movimento acima do atrito soma; o retorno líquido por janela é a métrica que decide. | Esforco: baixo | Como medir: Retorno líquido por janela com atrito descontado, taxa de acerto e número de janelas independentes (a meta de 0,5% pede de 32 a 126 ciclos independentes, segundo o estado do ticket).
- **Migração pump.fun em sombra com subscribeMigration**: Registrar eventos de migração sem comprar e, depois, simular compra minutos após a migração com custo de sanduíche e tip. | Restricao que prende: Taxa de graduação de 0,63% a 6,7% conforme janela; preditor sem poder fora da amostra (AUROC 0,464); retorno pós-graduação sem fonte primária; schema e chave do evento não confirmados. | Experimento mais proximo: Gravar eventos subscribeMigration por uma semana, sem compra, medindo latência de criação até evento e número de migrações por dia. | Ganho: Cauda pós-migração não quantificada. BOOST compra 20% da liquidez nos 5 minutos seguintes, evento mecânico sem prova de retorno. | Esforco: médio, depende de confirmar a chave PumpPortal (decisão do dono) | Como medir: Latência de evento, migrações por dia, liquidez sobrevivente medida pelo próprio coletor e retorno líquido simulado por token com sanduíche e tip.
- **Deslocamento bolsa x DEX só em majors com identidade por endereço**: Mapear os 217 símbolos da interseção para o endereço do contrato e medir spread executável em sombra só nos pares com profundidade, em duas pernas. | Restricao que prende: Desvio médio de 0,06% a 0,08% abaixo do atrito de 0,42%; SOL lidera na DEX; nenhum estudo CEX-DEX primário em Solana; símbolo não prova identidade. | Experimento mais proximo: Tabela de identidade por endereço dos 217 símbolos, com marca de quais têm pool com profundidade, sem medir retorno. | Ganho: Pequeno nos majors; cauda em tokens menores não medida. | Esforco: alto (leitura de pools e identidade) | Como medir: Frequência de desvios acima do custo de duas pernas com bid e ask executáveis, por classe E0 do ADENDO-E.
- **Adiar e só coletar dados brutos**: Não escolher regime ainda: gravar feed público OKX e eventos PumpPortal por duas semanas, sem sinal de decisão, para medir cobertura, latência e taxa antes de escolher. | Restricao que prende: Sem identidade por endereço, sem dado de minuto de memecoin com licença no repo e sem medição do custo de sanduíche. | Experimento mais proximo: Gravador de eventos com timestamp, sem sinal, por duas semanas. | Ganho: Zero retorno direto; reduz o risco de escolher regime por intuição. | Esforco: baixo | Como medir: Cobertura, lacunas, latência e contagem de eventos por hora antes de decidir.

### Achados

- [a1|fato|alta|VERIF=parcial] Graduação do pump.fun é automática e irreversível: a curva fecha ao atingir o limiar de market cap e o pool inteiro migra de forma atômica para a PumpSwap, sem etapa humana. O doc oficial não fixa o valor; fontes secundárias dizem cerca de 85 SOL (cerca de US$ 69 mil), e uma diz 80 SOL.
    fonte: https://pump.fun/docs/bonding-curve (lido via WebFetch em 2026-10-17); limiar em fontes secundárias
    >> parcial: pump.fun/docs/bonding-curve confirma: graduacao automatica e irreversivel, pool migra atomicamente, sem etapa humana. O doc nao fixa valor de limiar, como a afirmacao diz. Os 85 SOL e 80 SOL vem de fontes secundarias nao reabertas aqui. | correcao: Trocar 'cerca de 85 SOL (cerca de US$ 69 mil)' por 'limiar de market cap nao fixado no doc oficial; fontes secundarias citam cerca de 85 SOL ou 80 SOL'. US$ 69 mil e market cap, nao o valor de 85 SOL (85 SOL a US$ 105,48 e cerca de US$ 9 mil), por isso a equivalencia esta errada.
- [a2|fato|alta|VERIF=confirmado] PumpPortal: subscribeNewToken e subscribeMigration são gratuitos quanto aos dados recebidos; subscribeTokenTrade cobra 0,01 SOL a cada 10.000 trades; dados de trade exigem chave de API desde 2026-05-01.
    fonte: https://pumpportal.fun/fees/ (lido via WebFetch em 2026-10-17); docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t04-fontes-solana-dex.md linha 23
- [a3|fato|media|VERIF=confirmado] A página de tempo real do PumpPortal não documenta os campos do evento de migração (mint, pool, assinatura) e não diz se subscribeMigration exige chave. A mesma página diz que chave e carteira com 0,02 SOL são exigidas para inscrever tokens ou contas. Só um teste ao vivo resolve.
    fonte: https://pumpportal.fun/data-api/real-time/ (lido via WebFetch em 2026-10-17)
- [a4|fato|media|VERIF=parcial] Taxa de graduação depende da janela e do método: 0,63% (655.770 tokens, set e out de 2025, 4.338 graduados, Marino et al. 2026); cerca de 1,41% (1 em 71, de 17/06 a 15/07/2026, contador independente); pico de 6,7% em um dia e média de 4,7% nos quatro dias seguintes ao BOOST, contra 2,5% na semana anterior (The Block, artigo de 29/07/2026). Não há registro publicado pelo próprio emissor.
    fonte: Busca web (Marino et al. 2026; Dune via Solana Compass, secundário); https://www.theblock.co/post/409815/pump-fun-token-graduation-rate-jumps-boost-changes-launch-incentives (lido via WebFetch); registro do emissor: nao verificado
    >> parcial: The Block (29/07/2026) confirma pico de 6,7% em um dia, media de 4,7% nos quatro dias apos BOOST e 2,5% na semana anterior. Porem a conta do Marino et al. nao fecha: 4.338 graduados / 655.770 tokens = 0,66%, nao 0,63%. Os valores de 1 em 71 (1,41%) e do registro independente nao foram verificados aqui; sem registro do emissor, como a propria afirmacao diz. | correcao: Corrigir 0,63% para 0,66% (calculo 4338/655770) ou citar a fonte que traz 0,63% com outro denominador. Marcar '1 em 71' e 'Marino et al.' como nao verificados ate o artigo primario ser lido.
- [a5|fato|alta|VERIF=confirmado] Modelo preditivo de graduação do pump.fun: AUROC 0,859 no desenvolvimento e 0,464 na validação (IC95% 0,411 a 0,520), calibração ruim (inclinação 0,013). O próprio paper diz que não generaliza para a coorte de validação. Coorte primária de 749.816 mints, de 12/05 a 10/06/2026.
    fonte: https://arxiv.org/abs/2607.02823 (resumo da v4, setembro de 2026, lido via WebFetch)
- [a6|fato|media|VERIF=parcial] Mecanismo BOOST: cerca de 20% da liquidez de migração vai para compras automáticas na PumpSwap nos primeiros cinco minutos após a migração, e os tokens comprados são queimados. O mecanismo só roda após a curva fechar, então não aumenta por si a fração de graduados. A imprensa descreve correlação, não efeito sustentado comprovado.
    fonte: https://www.theblock.co/post/409815/pump-fun-token-graduation-rate-jumps-boost-changes-launch-incentives (lido via WebFetch); data do pico inferida pela data do artigo
    >> parcial: The Block confirma 20% da liquidez de migracao (antes presa no pool), compras automaticas nos primeiros 5 minutos e queima dos tokens comprados, e que BOOST age depois que o token gradua. Porem o artigo diz que o BOOST 'encourages traders to bid up bonding tokens', ou seja, atribui um mecanismo, nao apenas correlacao. Descrever tudo como correlacao subestima a afirmacao da fonte. | correcao: Escrever: a imprensa descreve um mecanismo que incentiva compras de tokens em bonding, mas sem medicao independente do efeito sobre a taxa de graduacao.
- [a7|fato|alta|VERIF=parcial] Motor de oportunidades do repo, medido em candles diários: 27.263 pares-dia, 170 pares líquidos, de 2025-08-31 a 2026-10-10. Momentum de 7 dias (quintil superior): +0,47% no olhar e -0,47% na confirmação. Nenhum dos 18 grupos passou nas duas partes. Aprendiz logístico com AUC de 0,518 a 7 dias. Não mede minuto.
    fonte: docs/sdd/inonu-desktop-v1/evidence/RAS-7-motor-de-oportunidades.md, seções 'Segunda rodada' e 'Um aprendiz' (linhas 41 a 58)
    >> parcial: Os numeros conferem com RAS-7: momentum 7 dias no quintil superior +0,47% olhar e -0,47% confirmacao (linha 45); nenhum grupo passa nas duas partes e 18 grupos testados (linha 54); aprendiz com AUC 0,518 a 7 dias (linha 58). Mas os 170 pares e 27.263 pares-dia estao na linha 24, fora do intervalo 41 a 58 citado. Os candles sao diarios (linha 24), entao 'nao mede minuto' e correto. | correcao: Citar RAS-7 linhas 24 (universo) e 41 a 58 (resultados).
- [a8|fato|media|VERIF=parcial] Movimento absoluto mediano de 0,38% em 1 min, 0,63% em 5 min, 1,03% em 15 min e 2,23% em 60 min (16 tokens, amostras sobrepostas, sem direção). Atrito de ida e volta medido em ativo líquido: média de 0,42% (6 pares de um ativo, n pequeno); 1,82% a 2,14% em ativo raso.
    fonte: docs/specs/retorno-composto-por-ciclo/research.md linhas 26 e 29; fontes-de-edge.md linha 14; evidence/pesquisa-t07-velocidade-de-decisao.md linha 51
    >> parcial: Medianas de movimento 0,38%, 0,63%, 1,03% e 2,23% conferem com research.md linha 29 e t07 linha 51. O atrito de 0,42% (0,17% a 0,56%, 6 pares) e o de 1,82% vem de fills.jsonl, que nao existe em data/ (checado). A propria pesquisa t07 linha 44 e 47 marca esses valores como VERIF=parcial, nao verificados. O intervalo 2,09% a 2,14% e de um candidato com cerca de US$ 37 mil de liquidez, apenas na entrada, nao de 'ativo raso' em geral. | correcao: Rotular 0,42% e 1,82% como medidos sem fonte primaria no repo (nao verificados ate localizar o registro de execucoes). Separar: 1,82% (1 par) e 2,09% a 2,14% (candidato de US$ 37 mil, so entrada).
- [a9|calculo|media] Cálculo de acerto necessário: p >= (1 + m/s)/2, com m = 0,92% (alvo de 0,5% mais atrito de 0,42%) e s o movimento mediano. Em 1 min (s = 0,38%) é impossível; em 5 min (s = 0,63%) p = 1,23, impossível; em 15 min (s = 1,03%) p >= 0,95. Assim, a janela de 15 min precisa acertar cerca de 95% do lado para pagar o alvo com movimento mediano.
    fonte: Cálculo sobre research.md linhas 26 e 29; fórmula em docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t08-execucao-solana-custos.md (a17, linha 62)
- [a10|fato|media] Deslocamento bolsa x DEX: correlação de 0,98 a 0,99 e desvio médio absoluto de 0,06% a 0,08% para BTC, ETH e SOL. Liderança da CEX só em BTC; ETH e SOL lideram na DEX (working paper não revisado, Zenodo 17084252, dados de 1 min de 4 a 5/9/2025). Não há estudo CEX-DEX primário em Solana. Na Ethereum, a extração CEX-DEX foi de US$ 233,8 milhões por 19 searchers em 19 meses (AFT 2025).
    fonte: docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t10-edge-estrutural.md linhas 27 a 33 (a6, a7, com refutação parcial); https://arxiv.org/html/2507.13023 (lido em busca); Zenodo 17084252 nao lido direto
- [a11|fato|media] Ambiente adverso: 76.469 de 100.063 tokens em Orca, Raydium e Meteora rotulados como rug pull (arXiv 2603.24625; falso positivo estimado de 0,26% em 382 rótulos auditados). Em out/25 a out/26, 6.850.144 sanduíches e US$ 29,7 milhões brutos (fornecedor Bitquery); em uma amostra, 68% do lucro ficou com bots.
    fonte: docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t09-edge-on-chain.md linhas 34 a 46 (a8, a11); https://arxiv.org/pdf/2603.24625 (primário, preprint)
- [a12|fato|media] Não foi encontrado estudo primário de retorno após a graduação do pump.fun (preço, retorno ou drawdown por token). O resumo do arXiv 2607.02823 v4 não traz esses números, e a busca não trouxe fonte primária com eles.
    fonte: https://arxiv.org/abs/2607.02823 (resumo); busca web sem resultado primário

### Decisao para o Jev

Pergunta: Qual regime de janela entra primeiro em sombra: deslocamento bolsa x DEX, migração pump.fun, momentum de 5 a 15 min, ou adiar e só coletar dados?
Reversivel: true

- c-momentum-minuto-sombra (Momentum de 5 a 15 min em sombra (c)): Sinal de momentum na interseção com feed público OKX, sem ordem, com markout de 1, 5 e 15 min e atrito de 0,42% descontado. Custo de dado zero e sem chave. | Evidencia: Atrito 0,42% contra mediana de 0,38% em 1 min; 15 min exige acerto de ~95%
- b-migracao-pumpfun-sombra (Migração pump.fun em sombra (b)): Registrar eventos subscribeMigration sem comprar, medindo latência e taxa diária, depois retorno líquido simulado com sanduíche e tip. Exige confirmar chave e schema. | Evidencia: Taxa de 0,63% a 6,7% por janela; preditor AUROC 0,464 fora da amostra
- a-desloc-bolsa-dex-majors (Deslocamento bolsa x DEX em majors (a)): Mapear identidade por endereço dos 217 símbolos e medir spread executável em sombra só nos pares com profundidade, em duas pernas. | Evidencia: Desvio 0,06% a 0,08% abaixo do atrito 0,42%; SOL lidera na DEX; sem estudo CEX-DEX em Solana
- adiar-so-coletar (Adiar e só coletar dados brutos): Não escolher regime: gravar feed público OKX e eventos PumpPortal por duas semanas, sem sinal, para medir cobertura, latência e taxa antes de decidir. | Evidencia: Sem identidade por endereço e sem dado de minuto de memecoin com licença no repo

Recomendacao sem Jev: c-momentum-minuto-sombra - É a opção mais reversível e de menor risco: não usa chave, SOL, capital nem dado pago, e mede a métrica que decide (retorno líquido após atrito) na escala de 1 a 15 min, com dado público já lido pelo repo. Adiar tem risco zero, mas não gera evidência; a opção c gera evidência sem risco de capital e pode ser desligada sem custo.
Cetico: decisao_ok=false; problemas: Opcao c (momentum em sombra) usa o feed publico OKX 'custo zero e sem chave', mas o API Agreement da OKX, secao 9.4, cobre expressamente dados de mercado em terminais publicos (resumo WebFetch do texto, nao o texto integral): a extracao automatizada e limitada ao razoavel para trading pessoal e proibida em escala excessiva. A decisao nao cita isso. O risco de termos e decisao do dono (pesquisa-lacuna-g5 e api-limites-e-fontes.md linhas 116 e 132), entao a opcao precisa de bloqueio_do_dono antes de ir ao Jev. | Opcao b exige 'confirmar chave e schema' do PumpPortal. Chave de API e carteira com 0,02 SOL tocam o assunto vedado de segredos, chaves e credenciais e de carteira. Ela deve ser marcada como bloqueio do dono, nao como opcao de decisao, e 'proibidas' esta vazio apesar disso. | O atrito de 0,42% (fato na decisao e restricao 4) nao tem fonte primaria no repo: data/fills.jsonl nao existe, e a pesquisa t07 marca os valores como nao verificados. Tratar 0,42% como fato em todas as opcoes contradiz a propria disciplina de fonte primaria. | Opcao c diz '15 min exige acerto de ~95%'. Nao ha calculo no repo (busca por '95%' nas specs sem resultado). Com pagamento simetrico de 1,03% e atrito de 0,42%, o ponto de equilibrio do acerto e cerca de 70% ((1 + 0,42/1,03)/2), nao 95%. O numero esta errado ou precisa de premissa explicita. | A fato 'mapd_bolsa_dex' (0,06% a 0,08%) vem de um working paper nao revisado, dois dias de dados, sem URL no repo (fontes-de-edge.md linha 22). A opcao a compara esse desvio medio com o atrito ida e volta de 0,42%, que sao grandezas diferentes. A frase 'em BTC, ETH e SOL' tambem nao esta na fonte, que da o desvio agregado. | Fato 'graduacao_pumpfun' mistura 0,63% (com conta que da 0,66%) e 1,41%; a faixa de 0,63% a 6,7% nao tem registro do emissor, o que a decisao reconhece, mas a janela de cada numero deveria acompanhar a faixa. | A decisao nao registra que as opcoes a e c dependem de identidade por endereço (217 simbolos) so para pares bolsa x Solana; a opcao c nao exige isso, mas o texto diz 'na interseccao com feed publico OKX', que e o universo de bolsa e nao o universo de tokens Solana que a carteira opera (research.md linha 12).

### Bloqueios do dono

- Chave de API e saldo de SOL na conta PumpPortal: credencial e custo recorrente, decisão do dono.
- Compra de memecoin ou qualquer ordem: dinheiro real e ordens, fora deste ticket.
- Raspagem de OKX Wallet ou OnchainOS: termos de uso não lidos; anti-bot não se contorna; decisão do dono.
- Planos pagos de dados (Helius Developer a US$ 49 por mês, OnchainOS Starter a US$ 99 por mês, WebSocket OnchainOS a partir de US$ 99 por mês): serviço pago.
- Nova dependência de produção, como decodificador de pools ou IDL de DEX: decisão do dono.
- Liberação de live e limites de risco: nenhum achado aqui autoriza.

### Novos tickets revelados

- Identidade por endereço da interseção: Quantos dos 217 símbolos da bolsa têm o mesmo contrato Solana nos dois lados, verificado por endereço?
- Schema real do evento de migração: Qual o schema do evento subscribeMigration e a chave exigida, em sombra e sem custo?
- Retorno pós-graduação com fonte primária: Existe medição primária de preço após a migração do pump.fun? Ler o corpo do arXiv 2607.02823 e o estudo de Marino et al.
- Custo de sanduíche em compra pequena: Quanto custam sanduíche e tip numa compra de US$ 10 a US$ 30 de memecoin, medido em sombra?
- Janelas de 1 a 15 min na interseção: Qual a taxa de acerto e o retorno líquido após atrito por janela de 1, 5 e 15 min no feed OKX?

### Nao lido

- Corpo do arXiv 2607.02823: só o resumo da v4, sem taxa de graduação nem retorno pós-graduação.
- Estudo de Marino et al. 2026 e o número de 0,198% (versão anterior do arXiv): só busca, não lido. A v4 traz 749.816 mints, não 832.941.
- Registro oficial de graduação do pump.fun: busca sem resultado; não verificado.
- Zenodo 17084252 (working paper): só via resumo de pesquisa-t10, não lido diretamente.
- Código do programa pump.fun e limiar exato (85 SOL ou 80 SOL): não lido.
- scripts/opportunity-backtest.ts: não lido linha a linha; RAS-7 lido pelo relatório.
- O backtest RAS-7 não está em docs/specs/retorno-composto-por-ciclo/evidence/; está em docs/sdd/inonu-desktop-v1/evidence/RAS-7-motor-de-oportunidades.md.
- Data do pico de 6,7%: inferida pela data do artigo (29/07/2026), não confirmada no texto.
- Nenhum serviço pago, Jev, carteira, .env ou conta foi acessado, conforme as regras.

### Resumo do cetico

Revisao cetica do ticket T06 (regime de janela para sombra). Das 8 afirmacoes, 2 confirmadas, 4 parciais, 0 refutadas e 2 nao verificaveis (fontes de terceiros fora do alcance desta revisao). A decisao nao pode ir ao Jev como esta: a opcao c depende de um feed publico OKX que a clausula 9.4 da API Agreement cobre expressamente (o texto nao aparece na decisao), a opcao b exige chave PumpPortal e possivelmente carteira com 0,02 SOL (assunto vedado), e o atrito de 0,42%, usado como fato em todas as opcoes, nao tem a fonte primaria no repo (data/fills.jsonl nao existe e a propria pesquisa t07 marcou como nao verificado). Faltam duas opcoes: validar o atrito com fonte primaria antes de escolher regime, e um regime so com Solana (pools por RPC e Jupiter), que nao toca o feed OKX.

## Comments

