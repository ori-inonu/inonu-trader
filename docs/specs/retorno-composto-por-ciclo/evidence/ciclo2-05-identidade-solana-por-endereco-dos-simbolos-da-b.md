# Ciclo 2, ticket T05: Identidade Solana por endereco dos simbolos da bolsa

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: dados
Priority: 5

## Question

Quantos dos 217 simbolos-base da bolsa que aparecem no registro de tokens da Jupiter mapeiam para um unico mint Solana confirmado por fonte oficial, e qual regra de desambiguacao e aceitavel para simbolos com mais de um mint?

Por que importa: Identidade por simbolo e invalida para qualquer sinal ou medida de deslocamento bolsa x DEX. E pre-requisito de T07 e T10. src/pulse/facts.ts tem identidade para fatos de CEX, nao para mint. Dado de bolsa aplicado a token sem essa prova gera erro silencioso.
Evidencia a buscar: Lista publica de instrumentos da OKX sem chave; registro de tokens da Jupiter com endereco e tags; pagina oficial do emissor quando existir; contagem de pools por mint por leitura publica (RPC ou API de pools). Sem consultar enderecos de carteira. Citar URL de cada fonte; o que nao for achado vira nao verificado.

## Answer

Dos 445 ativos-base da OKX (1184 instrumentos SPOT live, 443 com cotacao em USDT), 111 aparecem por simbolo exato no registro da Jupiter marcado como verified. Desses, 104 tem um unico mint verified e 7 sao ambiguos (AI, BABY, LUNA, MEGA, PEPE, SHIB, UNI). 54 dos 104 unicos tambem tem tag strict, major ou moonshot-verified. O numero 217 do repo nao foi reproduzido: a lista completa da Jupiter nao respondeu nesta sessao (HTTP 000). A API de instrumentos da OKX nao traz endereco de contrato, entao a identidade por mint nao vem da bolsa. Nenhum mint foi confirmado por fonte oficial do emissor nem por contagem de pools.

### Caminhos (Wayfinder)

- **Confirmar mint por emissor nos 54 candidatos**: Partir dos 54 simbolos de mint unico com tag forte e ler a pagina oficial de cada emissor ou o anuncio do projeto, gravando mint, fonte e data. Os 50 restantes de mint unico ficam fora ate ter a mesma prova. | Restricao que prende: Nenhuma pagina de emissor foi lida; a tag verified da Jupiter nao prova identidade (a7). | Experimento mais proximo: Planilha local de 54 linhas (simbolo, mint, URL oficial, data) gerada por script de leitura, sem chave e sem escrita no repo. | Ganho: Elimina erro silencioso de identidade, pre-requisito de T07 e T10. Ganho em numero de simbolos validos: ate 54, nao medido. | Esforco: Medio: leitura manual ou por fonte publica de 54 emissores. | Como medir: Fracao dos 54 com fonte oficial do emissor; meta de cobertura antes de usar qualquer sinal bolsa x DEX.
- **Contar pools por mint por leitura publica**: Para os 111 mints candidatos, contar pools Solana por mint via API publica de pools ou RPC publico, respeitando 100 requisicoes por 10 s, e gravar liquidez por pool. Mint com pool de liquidez muito baixa ou com pool duplicado vira suspeito. | Restricao que prende: Nenhuma contagem de pools foi feita nesta pesquisa; o RPC publico tem limite de 100 req por 10 s. | Experimento mais proximo: Contagem de pools para os 7 ambiguos e para 10 dos 54, em lote lento, sem consultar carteiras. | Ganho: Desambigua os 7 casos com dado on-chain, sem depender so da tag. | Esforco: Baixo a medio: script de leitura com limite de taxa. | Como medir: Numero de pools e liquidez por mint; diferenca entre mint de maior liquidez e mint verified marcado.
- **Fechar a lista completa da Jupiter para o numero 217**: Obter o registro completo por uma fonte publica alternativa e recontar simbolos da bolsa com mint unico, verified ou nao, para dizer se o 217 vem de registro nao verified. | Restricao que prende: https://token.jup.ag/all nao respondeu (HTTP 000) nesta sessao. | Experimento mais proximo: Uma consulta a fonte alternativa do registro Jupiter, gravada em arquivo de evidencia. | Ganho: Mede o tamanho real do universo de identidade; nao muda a regra. | Esforco: Baixo. | Como medir: Contagem de simbolos da bolsa casando com o registro completo, e quantos tem mint unico.
- **Sombra com identidade por mint gravada**: Medir janelas de 1 min apenas nos simbolos com identidade aceita, gravando o mint em cada evento. Nao envia ordem nem chama o Jev. | Restricao que prende: Sem identidade confirmada (a10), qualquer medida de desalinhamento bolsa x DEX pode ser de outro token. | Experimento mais proximo: Coleta em sombra de janelas de 1 min nos 54 de mint unico com tag forte, com mint e data em cada linha. | Ganho: Primeiro dado real de retorno por janela; ganho nao medido. | Esforco: Medio: coleta continua e revisao de eventos. | Como medir: Frequencia de janelas, retorno liquido por janela e contagem de janelas independentes (32 a 126 para 0,5 por cento por ciclo, segundo research.md).
- **Adiar a identidade e medir so o que nao depende de mint**: Manter a sombra apenas em metricas de bolsa sem cruzamento com DEX (frequencia de movimento, atrito de ida e volta) ate a identidade estar pronta. | Restricao que prende: A meta composta exige cruzamento; so bolsa nao mede lucro na DEX. | Experimento mais proximo: Medir movimento mediano de 1 min e atrito na bolsa com dado da OKX, sem mint. | Ganho: Nenhum ganho direto; reduz risco de erro silencioso. | Esforco: Baixo. | Como medir: Movimento mediano de 1 min (linha de base 0,38 por cento) e atrito por ativo liquido (0,42 por cento).

### Achados

- [a1|fato|alta|VERIF=confirmado] Instrumentos SPOT publicos da OKX: 1184 linhas, todas state live; 445 baseCcy unicos; 443 bases com quoteCcy USDT; 298 com USDC.
    fonte: https://www.okx.com/api/v5/public/instruments?instType=SPOT (GET sem chave, 2026-10-17); reproduz 445 citado em docs/specs/retorno-composto-por-ciclo/fontes-de-edge.md:40
- [a2|fato|alta|VERIF=confirmado] O registro de instrumentos da OKX nao tem campo de endereco de contrato ou mint; as chaves do objeto sao instId, baseCcy, quoteCcy, ctVal e afins.
    fonte: https://www.okx.com/api/v5/public/instruments?instType=SPOT (lista de chaves do primeiro registro)
- [a3|fato|alta|VERIF=parcial] Registro Jupiter com tag verified: 4003 entradas, 3901 simbolos distintos, 93 simbolos com mais de um mint verified (ex.: WBTC 2, PEPE 2, SHIB 2, UNI 2, BP 3).
    fonte: https://lite-api.jup.ag/tokens/v2/tag?query=verified (campos id, symbol, tags, decimals)
    >> parcial: 4003 entradas, todas com tag verified, e 3901 simbolos distintos com 93 simbolos de mais de um mint reproduzem somente com o simbolo normalizado em maiusculas. Sem normalizacao sao 3943 simbolos distintos e 56 com mais de um mint. O exemplo SHIB 2 esta errado: SHIB tem 3 mints verified (shib5gSo..., 5MBBsoCV... e F6qoefQq...). BP 3 confirmado. | correcao: Declarar a normalizacao de caixa. Corrigir SHIB para 3 mints verified.
- [a4|calculo|alta|VERIF=parcial] 111 dos 445 ativos-base da OKX casam por simbolo exato (maiusculas) com simbolo do registro verified da Jupiter; 109 quando a cotacao e USDT.
    fonte: Cruzamento de a1 com a3 (script de leitura em scratchpad, sem escrita no repo)
    >> parcial: 111 bases casando e 109 com USDT so se reproduzem com comparacao case-insensitive. Por simbolo exato (sem normalizar) sao 103 e 101. O texto diz casam por simbolo exato (maiusculas), o que e contraditorio com o numero. | correcao: Dizer casam por simbolo com caixa normalizada para maiusculas: 111 e 109. Com comparacao exata: 103 e 101.
- [a5|calculo|alta|VERIF=parcial] Dos 111 casos, 104 tem um unico mint verified; 7 sao ambiguos: AI, BABY, LUNA, MEGA, PEPE, SHIB, UNI.
    fonte: Cruzamento de a4 com a3; para PEPE, por exemplo, ha dois mints verified com o mesmo nome Pepe, B5WT... e 9… (enderecos omitidos)
    >> parcial: Sob caixa normalizada: 104 de mint unico e 7 ambiguos (PEPE, SHIB, AI, BABY, LUNA, MEGA, UNI) confirmados. Erro no exemplo: o segundo mint de PEPE comeca com PEPEqnuuCDbB..., nao com 9. SHIB tem 3 mints, nao 2. | correcao: Trocar o prefixo 9... por PEPEqnuu... (endereco da Jupiter verified com nome Pepe). Ajustar SHIB para 3 mints.
- [a6|calculo|media|VERIF=confirmado] Entre os 104 de mint unico, 54 tem tag strict, major ou moonshot-verified e 28 tem liquidez de pelo menos US$ 1 milhao no campo liquidity da Jupiter (filtros nao combinados).
    fonte: Campos tags e liquidity do mesmo endpoint de a3
- [a7|fato|alta|VERIF=confirmado] A tag verified da Jupiter nao garante unicidade nem confirmacao do emissor: o mesmo nome e simbolo aparecem com mais de um mint, todos marcados verified.
    fonte: https://lite-api.jup.ag/tokens/v2/tag?query=verified (ex.: SHIB com shib5gSo... e 5MBBsoCV... ambos verified)
- [a8|fato|media|VERIF=parcial] O numero 217 simbolos casando com a Jupiter nao foi reproduzido: pela tag verified o total e 111. A lista completa (https://token.jup.ag/all) nao respondeu (HTTP 000) nesta sessao, entao o 217 pode vir de registro nao verified.
    fonte: Consulta direta a https://token.jup.ag/all (codigo 000); citacao de 217 em docs/specs/retorno-composto-por-ciclo/fontes-de-edge.md:40
    >> parcial: O 217 nao foi reproduzido. O total verified com comparacao normalizada e 111, confirmado. https://token.jup.ag/all continua HTTP 000, mas https://cache.jup.ag/tokens respondeu 200 com 287.863 entradas (96.561 simbolos distintos, sem filtro de tag). Nessa lista, os simbolos casam com 234 bases da OKX, nao 217. A origem do 217 segue nao verificada; a hipotese de registro nao verified e plausivel, mas nao confirmada. | correcao: Registrar que a lista completa responde em https://cache.jup.ag/tokens (234 casamentos com caixa normalizada). Marcar 217 como nao reproduzido ate que se identifique o filtro usado.
- [a9|fato|alta] O codigo de fatos do pulso nao tem identidade de mint: os unicos matches de mint, token e contract em src/pulse/facts.ts sao comentarios que afirmam que o fato nao e mint Solana.
    fonte: src/pulse/facts.ts:2 e :6 (grep por mint, symbol, identity)
- [a10|fato|alta] Nenhuma identidade por mint foi confirmada por fonte oficial do emissor nesta pesquisa; a confirmacao por emissor e o que falta para os 104.
    fonte: Ausencia de leitura de paginas de emissor; nao verificado para nenhum dos 104
- [a11|inferencia|media] Em caso de simbolo com mais de um mint, a escolha por liquidez ou por ordem do registro nao e uma regra de identidade: escolhe o token errado sem erro visivel.
    fonte: Consequencia de a5 e a7; regra de design, nao medida

### Decisao para o Jev

Pergunta: Qual regra de identidade por mint vale para cruzar simbolos da bolsa com a DEX na medicao em sombra?
Reversivel: true

- adiar-so-medir (Adiar a identidade e medir so bolsa): Nao cruzar com DEX ate existir identidade confirmada. Medir movimento e atrito apenas na bolsa, sem mint nem sinal. | Evidencia: Atrito 0,42 por cento e movimento 0,38 por cento ja medidos (validacao-e-baseline.md).
- unico-verified-104 (Mint unico verified, 104 simbolos): Aceitar os 104 simbolos com um unico mint verified da Jupiter, excluir os 7 ambiguos, gravar mint em cada evento. Sem confirmacao de emissor. | Evidencia: Calculo a5: 104 unicos, 7 ambiguos (a5).
- unico-strict-54 (Mint unico com tag forte, 54 simbolos): Aceitar so os 54 de mint unico com tag strict, major ou moonshot-verified. Gravar mint e fonte. Reversivel por configuracao. | Evidencia: Calculo a6: 54 de 104 unicos tem tag forte.
- emissor-confirma (Mint so com fonte oficial do emissor): Aceitar somente simbolos com mint confirmado por pagina oficial do emissor ou lista curada pelo dono. Hoje o conjunto e zero. | Evidencia: Nenhuma confirmacao de emissor nesta pesquisa (a10).
- simbolo-puro (Identidade so pelo simbolo da bolsa): Usar o simbolo da OKX como identidade do token na DEX, sem mint. Vedada pelo proprio ticket. | Evidencia: Ticket T05 e fontes-de-edge.md:40 (a2, a7).

Recomendacao sem Jev: unico-strict-54 - E reversivel por configuracao e nao toca dinheiro. Reduz o erro silencioso ao excluir os 7 ambiguos e os 50 de mint unico sem tag forte, e grava mint e fonte em cada evento para auditoria. Continua sendo medicao em sombra: nao confirma identidade pelo emissor, por isso o caminho de confirmacao segue aberto. Se o dono preferir risco zero, adiar-so-medir e a alternativa.
Cetico: decisao_ok=false; problemas: Opcoes unico-verified-104 e unico-strict-54 mandam gravar mint em cada evento (ou mint e fonte). Isso pode mudar schema de eventos ou journals, assunto vedado. Reformular para tabela de medicao separada sem alterar schema, ou registrar como bloqueio do dono. | Contradicao: unico-verified-104 diz Aceitar os 104 como identidade, mas a restricao 2 diz que a tag verified nao prova identidade (a7). Mint unico no registro nao garante que o ativo da OKX seja aquele mint. A opcao deve declarar esse risco residual. | A evidencia de emissor-confirma cita (a10), que nao existe na lista de afirmacoes (so a1 a a8). Corrigir a referencia. | d1 e d2 sao perguntas ao dono (aceitar tag verified, qual fonte oficial). O CLAUDE.md global proibe perguntar ao dono; devem virar decisoes estruturadas para o Jev ou ser registradas como bloqueios. d3 (leitura on-chain de pools) e pesquisa e pode seguir sem perguntar; vedar apenas a escrita. | Os fatos de contagem (111, 109, 3901, 93, 104, 54, 28) so valem com caixa normalizada. Sem isso, 103, 101, 3943 e 56 aparecem. A decisao deve declarar a normalizacao em fatos. | O exemplo SHIB com 2 mints esta errado (sao 3), e o prefixo do mint de PEPE esta errado. Corrigir antes de usar como evidencia. | Campos fora do schema pedido (label, fatos, proibidas, desconhecidos) devem sair ou ser tratados como contexto, para a entrada do Jev ficar no formato {pergunta, opcoes, restricoes, reversivel}. | A opcao adiar-so-medir esta bem sustentada: 0,42% (validacao-e-baseline.md:19) e 0,38% (validacao-e-baseline.md:34) conferem com o repo.

### Bloqueios do dono

- Nenhum tema vedado foi decidido ou tocado: nao houve ordem, carteira, chave, saldo, saque ou migracao.
- Escolher fonte oficial de identidade que exija conta, chave ou servico pago (por exemplo RPC pago ou API paga) fica para o dono: dependencia paga e vedada ao Jev.
- Aceitar a raspagem do site da OKX continua sendo decisao do dono; esta pesquisa usou so o endpoint publico de API documentada.

### Novos tickets revelados

- T05b: lista completa Jupiter e o numero 217: Qual fonte publica alternativa entrega o registro completo, e quantos simbolos da OKX tem mint unico nele?
- T05c: desambiguar 7 simbolos ambiguos: Qual mint e o do emissor para AI, BABY, LUNA, MEGA, PEPE, SHIB e UNI, por fonte oficial e contagem de pools?
- T05d: confirmacao de emissor dos 54: Quantos dos 54 candidatos de mint unico tem pagina oficial do emissor com o mesmo mint?
- T05e: contagem de pools por mint: Quantos pools e quanta liquidez tem cada mint candidato, por leitura publica sem chave?

### Nao lido

- Lista completa do registro Jupiter: https://token.jup.ag/all nao respondeu (HTTP 000); o 217 nao foi reproduzido.
- Paginas oficiais dos emissores: nenhuma lida; nenhum mint confirmado por emissor.
- Contagem de pools por mint via RPC ou API de pools: nao consultada.
- Instrumentos OKX: cobertos so os 1184 retornados pelo endpoint publico; nenhuma chamada autenticada.
- Carteiras, saldos e enderecos de carteira: nao consultados, por regra.

### Resumo do cetico

Reverifiquei a1 a a8 contra a OKX e a Jupiter (dados baixados em 2026-10-17 para o scratchpad, sem escrita no repo). Os totais principais se reproduzem: 1184 instrumentos live, 445 bases, 443 com USDT, 298 com USDC, 4003 entradas verified e 104 mints unicos. Porem varios numeros so valem com normalizacao de caixa (simbolos da Jupiter em maiusculas), o exemplo de SHIB esta errado, e o 217 nao foi reproduzido. A decisao nao pode ir ao Jev como esta: duas opcoes mandam gravar mint em eventos (possivel mudanca de schema ou journal, vedado), uma evidencia cita um item (a10) que nao existe, e d1 e d2 sao perguntas ao dono, vedadas pelo CLAUDE.md global. Faltam opcoes que confirmem o mint on-chain ou cruzem com o registro completo da Jupiter.

## Comments

