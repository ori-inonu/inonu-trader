# Ciclo 2, ticket T12: Universo que o ciclo de sombra observa primeiro

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: 05
Domain: dados
Priority: 12

## Question

Qual universo o ciclo de sombra observa primeiro: (a) os 1965 instrumentos vivos da bolsa OKX, (b) a interseccao dos 445 ativos-base spot com tokens Solana identificados por endereco, ou (c) somente pools Solana assinados por RPC?

Por que importa: O feed da bolsa cobre 1965 instrumentos e nenhum token Solana fora dela, mas a carteira opera tokens fora da bolsa. Sem essa escolha nao ha denominador de universo nem contagem de janelas por hora. A meta de 0,5% por ciclo exige de 32 a 126 ciclos independentes. Escolha reversivel, so sombra.
Evidencia a buscar: api-limites-e-fontes.md secoes 6 e 8; fontes-de-edge.md secao 4; contagem de janelas por hora por universo a partir de replay do feed de trades, com custo de atrito por classe de liquidez.

## Answer

Recomendo começar pelo conjunto de 54 símbolos com mint único verified e tag strict, major ou moonshot, observado só em sombra e só por janelas medidas no feed público da bolsa, com identidade por endereço como pré-requisito antes de contar qualquer janela.
O feed da bolsa cobre 1965 instrumentos (445 bases spot), mas nenhum é token que a carteira opera na Solana, então ele serve de proxy de preço, não de universo de execução.
O gargalo de decisão é o teto local de 720 consultas ao Jev por dia (30 por hora). Decidir todo minuto sobre 54 tokens geraria 3240 por hora, cerca de 108 vezes o teto, então o filtro antes do Jev decide, não a escolha do universo.
A Jupiter Free (60 requisições por janela de 60 s) absorve 54 tokens a uma consulta por minuto (90%), mas não 104 (173%), se não houver consulta em lote, o que não foi verificado.
A identidade é casamento por símbolo (premissa T05, 111 exatos, 104 únicos, 7 ambíguos, 54 com tag); nenhum mint foi confirmado pelo emissor e a OKX não traz endereço.
Nada aqui prova retorno: o atrito medido é 0,42% em ativo líquido com 6 pares, e 0 de 7 voltas do projeto foi positiva (-0,41% bruto).

### Caminhos (Wayfinder)

- **Medir janelas no feed da bolsa para os 54**: Replay de 24 h do canal de trades dos 54 símbolos (e comparação com 104 e com os 1965) no feed público, contando janelas em que o movimento absoluto supera o atrito de cada classe de liquidez. Sem decisão, sem Jev, sem chamada paga. | Restricao que prende: Preço da bolsa não é preço do pool Solana; sem identidade por endereço a janela é só proxy. | Experimento mais proximo: Replay offline de trades já gravados ou 24 h de sombra do WebSocket público só para os 54 símbolos. | Ganho: Denominador de lambda para a escada de metas; custo zero; sem número de retorno ainda. | Esforco: baixo | Como medir: Janelas por hora por classe de liquidez; retorno líquido por janela com atrito medido; fração do universo com dado fresco.
- **Confirmar identidade por endereço dos 54**: Para cada um dos 54 símbolos, comparar o mint da lista verified com fonte primária do emissor ou documentação oficial do projeto, sem raspar o site da OKX. Começar pelos de maior liquidez. | Restricao que prende: A lista verified marca símbolo, não emissor, e a OKX não traz contrato. | Experimento mais proximo: Conferir os 10 símbolos de maior liquidez e contar quantos passam com fonte primária. | Ganho: Evita medir janela sobre token errado; pré-requisito de qualquer contagem. | Esforco: médio, manual | Como medir: Fração dos 54 com mint confirmado por fonte primária; número de casos ambíguos ou com mais de um mint.
- **Medir a etapa antes de fixar o universo**: Carimbar cada etapa do ciclo (origem do dado, Brief, consulta ao Jev, cotação, envio) e a cobertura do feed sem escolher ainda o universo de execução. | Restricao que prende: Pior caso antes do modelo de 170 s pela soma dos tetos; um ciclo medido de 37,5 s; amostra de 15 ciclos que consultaram. | Experimento mais proximo: 1000 ciclos com etapas carimbadas em sombra, sem mudar nenhuma decisão. | Ganho: Libera a etapa S1 e mostra o que limita o ciclo de 1 minuto, independente do universo escolhido. | Esforco: baixo a médio | Como medir: p50, p95 e p99 por etapa; idade dos fatos usados; oportunidades expiradas no caminho.
- **Pools RPC de poucos tokens em sombra**: Ler 5 a 10 pools dos tokens mais líquidos do conjunto de 54 por RPC, decodificar e comparar com getAccountInfo e com a cotação da Jupiter. | Restricao que prende: Layouts de pool sem validação contra IDL oficial (Raydium CLMM, Orca, Meteora não lidos); RPC público não é de produção; Jupiter Free com 60 por minuto. | Experimento mais proximo: Decodificar 50 pools e medir a diferença byte a byte contra getAccountInfo. | Ganho: Preço Solana real sem depender de símbolo da bolsa; cobre tokens fora da bolsa. | Esforco: alto | Como medir: Erro absoluto do preço decodificado contra a cotação; contagem de decodificações falhas ou com tamanho divergente.

### Achados

- [A1|fato|alta|VERIF=confirmado] A API pública da OKX lista 1965 instrumentos vivos (1184 spot, 509 swap, 272 futuros), com 445 bases spot únicas e 443 cotadas em USDT.
    fonte: docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:44-45 (medido em 2026-10-17)
- [A2|fato|media|VERIF=confirmado] Uma conexão WebSocket pública, sem chave, aceitou os 1965 instrumentos no canal tickers, com 3870 a 4100 mensagens por segundo, em um único teste feito num sábado.
    fonte: docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:51 (P, uma corrida); docs/specs/retorno-composto-por-ciclo/arquitetura-e-decisao.md:82-83 (o teste mediu recebimento, não custo de processamento)
- [A3|fato|alta|VERIF=confirmado] A API de instrumentos da OKX não traz endereço de contrato, então a identidade Solana por mint não vem da bolsa, e a identidade por endereço é pré-requisito para contar janelas.
    fonte: premissa T05 do ticket (não reproduzida por mim); docs/specs/retorno-composto-por-ciclo/fontes-de-edge.md:40
- [A4|fato|media|VERIF=parcial] Premissa T05: 111 símbolos da bolsa casam exatamente com a lista verified da Jupiter; 104 têm mint único, 7 são ambíguos (AI, BABY, LUNA, MEGA, PEPE, SHIB, UNI) e 54 dos 104 têm tag strict, major ou moonshot-verified.
    fonte: resposta T05 entregue no ticket; não reproduzida por mim, porque a lista completa da Jupiter respondeu HTTP 000 nesta sessão
    >> parcial: Reproduzi com https://lite-api.jup.ag/tokens/v2/tag?query=verified (4003 tokens, lido hoje) cruzando pelo símbolo exato com as 445 bases spot da OKX: 103 casam (T05 diz 111); 97 têm mint único (T05: 104); 6 são ambíguos, AI, BABY, LUNA, MEGA, SHIB e UNI (T05: 7, com PEPE a mais; PEPE não aparece como ambíguo na minha leitura); 51 têm tag strict, major, moonshot ou moonshot-verified (T05: 54). A premissa não diz qual endpoint nem qual regra de casamento usou, e a lista completa não está no repo. | correcao: Usar 103 exatos, 97 com mint único, 6 ambíguos e 51 com tag forte como o número reproduzido, registrando endpoint, data e regra de casamento. Os números de T05 ficam não verificados até o método ser registrado.
- [A5|fato|alta|VERIF=parcial] Conflito documental: fontes-de-edge.md ainda cita 217 símbolos da bolsa no registro da Jupiter. T05 não reproduziu esse número, então o ticket usa 111, 104 e 54 e o 217 deve ser corrigido ou marcado como não verificado.
    fonte: docs/specs/retorno-composto-por-ciclo/fontes-de-edge.md:40
    >> parcial: O conflito existe: fontes-de-edge.md:40 cita 217 símbolos-base no registro da Jupiter. Na reprodução da A4 o número foi 103, então o 217 também não se sustenta com a regra simples de símbolo exato. A linha 40 também mistura símbolos-base e registro, o que pode explicar a diferença. | correcao: Marcar 217 como não verificado em fontes-de-edge.md:40 e, na decisão, substituir o 111 pelo número reproduzido, com a regra de casamento explícita.
- [A6|fato|media|VERIF=confirmado] Jupiter Free: 1 requisição por segundo e 60 por minuto, por janela deslizante de 60 s; a resposta traz x-ratelimit-reset, timestamp em segundos, para o recuo. A página não diz se uma chamada aceita vários mints.
    fonte: https://developers.jup.ag/docs/api-rate-limit (WebFetch, resumo de modelo; redireciona de dev.jup.ag)
- [A7|calculo|alta|VERIF=confirmado] Cálculo: 54 tokens consultados uma vez por minuto usam 54 de 60 requisições da janela Free (90%); 104 tokens usam 173%, o que excede o plano Free sem nenhuma outra chamada. Vale só se não houver consulta em lote.
    fonte: A6 e a contagem de tokens de A4
- [A8|fato|alta|VERIF=parcial] Teto local de 720 consultas ao Jev por dia (30 por hora) no perfil arrojado, por configuração e não por contrato; a consulta 721 é recusada.
    fonte: docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:87; src/agent/budget.ts:18 e :101; src/agent/wire.ts:310
    >> parcial: O teto de 720 confere: DEFAULT_LIMITS tem 144 (budget.ts:18); com o piloto ligado a capacidade é max(configurado, ceil(1440 / ritmo)) (wire.ts:223, budget.ts:15); no perfil arrojado o ritmo é min(intervalo, HOT_INTERVAL_MIN=2) (wire.ts:310, autopilot.ts:38), o que dá 720; a checagem recusa a partir de 720 consultas no dia (budget.ts:101). Erros: 'ou 30 por hora' não é limite no código, porque o ritmo é diário com reserva de max(2, ceil(0,05 x 720)) = 36 (budget.ts:102-107); e o 720 vale só enquanto o intervalo de 2 min estiver ativo, com ritmo de 1 min o teto sobe para 1440. | correcao: Trocar '30 por hora' por 'ritmo diário proporcional com reserva de 36' e registrar que o teto é 720 só com ritmo de 2 min (1440 com ritmo de 1 min).
- [A9|calculo|alta] Cálculo: com 54 tokens e uma decisão por token por minuto seriam 3240 decisões por hora, cerca de 108 vezes o teto de 30. O universo maior não aumenta a capacidade de decisão, só o funil antes do Jev, que já descarta 57% dos candidatos.
    fonte: A8; docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:33 (funil de 57%)
- [A10|fato|baixa] Atrito de ida e volta medido: 0,42% em média no ativo líquido (6 pares de um só ativo, n pequeno), 1,82% no intermediário (1 par) e pelo menos 2,1% no raso, só na entrada.
    fonte: docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:19; docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:8 (seção 8 sobre taxa)
- [A11|fato|baixa] Movimento de 1 minuto: mediana de 0,38%; 14% dos minutos acima de 2% em valor absoluto e 43% acima de 0,5%, em 16 tokens com amostras sobrepostas, sem direção. As velas de origem ficam fora do repositório e não foram reproduzidas, então não dá para atribuir a amostra a nenhum universo.
    fonte: docs/specs/retorno-composto-por-ciclo/matematica-da-meta.md:52; validacao-e-baseline.md:34
- [A12|calculo|baixa] Cálculo com a amostra de A11: se 14% dos minutos de 54 tokens tiverem movimento absoluto acima de 2%, seriam cerca de 454 janelas brutas por hora (54 x 60 x 0,14), cerca de 227 se a direção for tratada como moeda justa. Números de inferência, não de medida, e antes de custo.
    fonte: A11 e a contagem de A4
- [A13|fato|media] RPC público da Solana: 100 requisições por 10 s por IP e 40 por 10 s por método, com a nota de que não é para produção. A página de limites retornou 404 nesta sessão, então o número vem da leitura anterior.
    fonte: docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:64; https://solana.com/docs/rpc/rate-limits (404, não reconferido)

### Decisao para o Jev

Pergunta: Qual universo a sombra observa primeiro: os 1965 da bolsa, a interseção por mint verified (54 ou 104 símbolos), só pools Solana por RPC, ou adiar a escolha e medir etapas?
Reversivel: true

- a-bolsa-1965 (Os 1965 da bolsa, só observação em sombra): A sombra acompanha os 1965 instrumentos pelo WebSocket público para regime e fluxo. Não há token Solana e nada é executado; serve de proxy, não de universo de carteira. | Evidencia: 1965 em uma conexão, 3870 a 4100 msg/s (api-limites §2)
- b-strict-54 (54 símbolos com mint verified e tag strict): Conta só os 54 símbolos com mint único verified e tag strict, major ou moonshot. Exclui os 7 ambíguos. Identidade por símbolo, a confirmar por endereço antes de contar janelas. | Evidencia: Premissa T05: 54 de 104 únicos; 7 ambíguos fora; Jupiter Free absorve 90%
- b-verified-104 (104 símbolos com mint único verified): Amplia para os 104 mints únicos, sem exigir tag strict. Cobre mais, com identidade mais frouxa, e excede a janela Free da Jupiter a uma consulta por minuto (173%) sem lote. | Evidencia: Premissa T05; Jupiter Free 60 por minuto (173% a 1 por minuto)
- c-pools-rpc (Só pools Solana assinados por RPC, dezenas): Ignora a bolsa e lê por RPC poucos pools do conjunto negociado, com decodificadores validados contra IDL. Cobre preço Solana real, mas o decodificador ainda não é confiável. | Evidencia: RPC público 100 por 10 s, não é produção; IDL oficial não lido (api-limites §3)
- d-adiar-medir-etapas (Adiar a escolha e só carimbar etapas): Não escolhe universo agora. Mede latência por etapa, idade dos fatos e cobertura do feed, o que vale para qualquer opção. É a opção mais conservadora e não avança a meta. | Evidencia: Pior caso de 170 s antes do modelo; ciclo medido de 37,5 s (arquitetura §4)

Recomendacao sem Jev: b-strict-54 - É a opção mais reversível com avanço real: é subconjunto de 104, então ampliar depois é só remover um filtro; usa só o feed público da bolsa e a lista verified, sem compra, sem chave paga e sem nova dependência; cabe na janela Free da Jupiter a uma consulta por minuto (90%); e exclui os 7 símbolos ambíguos. Se a confirmação por endereço falhar, o plano B é d-adiar-medir-etapas, que não depende de universo.
Cetico: decisao_ok=false; problemas: Fato verified_jupiter_T05 (111, 104, 7, 54) não é reproduzido: na minha leitura de hoje a lista verified da Jupiter dá 103, 97, 6 e 51. A decisão e as opções b-strict-54 e b-verified-104 não podem ir ao Jev com esses números. | A conta 173% da opção b-verified-104 cai para 162% com 97 mints únicos, e a cota de cotações de Swap também consome o balde de 60 por minuto. Os percentuais de restrição precisam ser recalculados. | O fato teto_jev_local diz '30 por hora'. O código não tem limite horário: o ritmo é diário com reserva de 36 (budget.ts:102-107). E o 720 depende do intervalo de 2 min (wire.ts:310, autopilot.ts:38); com ritmo de 1 min o teto vira 1440 (budget.ts:15, wire.ts:223). | O fato movimento_mediano_1min diz '16 tokens' e 'sem direção'. Em validacao-e-baseline.md:34 só consta a mediana de 0,38%. Os outros dois detalhes não aparecem na spec e ficam não verificados. | A opção c-pools-rpc exige RPC de produção, que hoje é serviço pago (Helius, QuickNode, Triton, planos de US$ 49 a US$ 999 segundo api-limites §3), e decodificadores validados contra IDL ainda não lidos, o que é dependência nova. Ambos são bloqueios do dono (serviços pagos e dependências de produção), então a opção não pode ir ao Jev como alternativa. Ou se reescreve sem RPC pago e sem decodificador novo, ou ela sai da decisão e vai para bloqueios_do_dono. | As opções a-bolsa-1965, b-strict-54 e b-verified-104 dependem de uso do feed público da OKX que o próprio projeto classifica como zona de risco de termos (OKX API Agreement 9.4, api-limites §7: 'decisão de aceitar risco de termos: do dono'). Esse aceite deve ser registrado em bloqueios_do_dono, não como opção do Jev. | O desconhecido lista-jupiter-completa já é verificável agora: o endpoint https://lite-api.jup.ag/tokens/v2/tag?query=verified responde hoje com 4003 tokens. Deve virar fato reproduzido, não pergunta. Os de cota TypeSafe no console, plano da chave Jupiter e RPS da conta OKX são leituras de painel do dono e devem ir para bloqueios_do_dono, sem o campo ask. | Citação do fato ws_publico_bolsa e da A6 precisa de ajuste: a URL da Jupiter mudou para https://developers.jup.ag/docs/portal/rate-limits. A citação da A3 em fontes-de-edge.md:40 não sustenta a afirmação, como detalhado na verificação.

### Bloqueios do dono

- Plano pago da OnchainOS com WebSocket (Starter, US$ 99 por mês, cerca de 82% do capital) ou qualquer provedor RPC pago: cobrança, decisão do dono.
- Raspar qualquer página da OKX (OKX API Agreement 9.4 proíbe raspadores para Market Data): aceitar o risco de termos é decisão do dono, não deste ticket.
- Chaves, segredos e credenciais da OnchainOS, Jupiter e RPC privado: este ticket não as lê nem usa; registrar a sua ausência.
- Mudança de schema dos journals em data/ (por exemplo estender fills.jsonl para custo decomposto por pool): decisão do dono.
- Nova dependência de produção, como um decodificador de pools ou um SDK da Jupiter, ou troca de uma existente: decisão do dono.
- Capacidade acima de 720 consultas ao Jev por dia e leitura da cota real no console TypeSafe: decisão do dono.
- Dinheiro real, ordens, saques, transferências e liberação de live: fora deste ticket e vedados ao Jev.

### Novos tickets revelados

- Identidade por endereço dos 54 símbolos: Qual mint de cada um dos 54 símbolos é o do emissor, por fonte primária que não seja raspagem do site da OKX?
- Janelas por hora por universo: Quantas janelas com movimento absoluto acima do atrito por classe ocorrem por hora nos 54, nos 104 e nos 1965, num replay de 24 h do feed de trades?
- Consulta em lote na Jupiter: A Jupiter aceita vários mints numa só chamada de preço, e qual o custo em requisições da janela de 60 s?
- Corrigir o 217 em fontes-de-edge: Trocar o número 217 de fontes-de-edge.md:40 por 111, 104 e 54, ou marcá-lo como não reproduzido?
- Pools por mint dos 54: Quantos pools com liquidez existem por mint dos 54, e qual o TVL mediano de cada um?
- Limites RPC da Solana reconferidos: Quais são os limites do RPC público da Solana em página primária viva, já que a página consultada deu 404?

### Nao lido

- Replay do feed de trades para contar janelas por hora por universo: não feito. Não há dado bruto no repositório e não houve chamada à bolsa além de documentação.
- Lista verified completa da Jupiter: não reproduzida (HTTP 000 nesta sessão). A contagem 111, 104, 54 é premissa do ticket T05.
- Página de limites da Solana (solana.com/docs/rpc/rate-limits) deu 404; os números de RPC vêm da leitura anterior, não reconferidos.
- Velas de minuto que geraram 14% e 43% de movimento: cache fora do repositório, não reproduzido.
- Termos do OKX API Agreement: lidos por resumo de modelo, não como texto bruto. Não é parecer jurídico.
- Arquivos brutos em data/ (fills, decisions-meta, usage): não abertos, por regra de não ler carteira.

### Resumo do cetico

Reverifiquei as oito afirmações contra a API pública da OKX, a lista verified da Jupiter, a página oficial de limites da Jupiter e o código. A1, A2, A3, A6 e A7 se confirmam. A4 e A5 não reproduzem: na minha leitura de hoje a lista verified dá 103 símbolos exatos, 97 com mint único, 6 ambíguos e 51 com tag strict, major ou moonshot, contra 111, 104, 7 e 54 da premissa T05, e o 217 da spec também não aparece. A8 acerta o 720 para a configuração atual, mas "30 por hora" não é limite no código e o teto muda se o ritmo for de 1 minuto. A decisão não pode ir ao Jev como está: os fatos de T05 não são reproduzidos, a opção c exige RPC pago e decodificadores novos (bloqueios do dono), e faltam duas opções.

## Comments

