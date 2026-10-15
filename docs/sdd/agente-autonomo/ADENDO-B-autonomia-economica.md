# Adendo B: autonomia economica do Jev (2026-10-14)

Estado: especificacao e plano, implementacao em fatias na fonte (nao ligada ao runtime 17 vivo; quem qualifica e troca e o Codex, com o dono).

## 1. Instrucao do dono

Relatada pelo Codex nas secoes 87 e 88 de `docs/sdd/carteira-evidencia/COORDENACAO-CLAUDE-20261013.md` (nao li a mensagem original, so o texto citado):

- "o agente nao precisa ter limite diarios de compra ou venda [...] sem limites de operacoes diarias, e sem limite de dos 10 dolares, ao inves disso deixar o Agente (JEV System One) decidir qual e o melhor gerenciamento e risco para trazer a melhor relacao risco/retorno";
- "ao inves de colocar limites devemos melhorar a inteligencia do jev para ele poder tomar todas as decisoes no sistema".

Isto SUBSTITUI a premissa anterior de manter o piso de US$ 10, os tetos diarios e o risco programatico (`riskPct`, concentracao, reserva, postura, barra de conviccao). Nao autoriza margem, emprestimo, transferencia, nem trade manual para testar. Lucro nao e garantido: as seis voltas fechadas ate agora foram todas negativas antes da taxa em SOL.

## 2. O que o codigo continua dono (propriedades de execucao, nao julgamento economico)

| Id | Requisito observavel |
| --- | --- |
| AEC-1 | Autoridade e modo: sem autorizacao vigente, carteira parada, arquivo de stop, ledger ou planos ilegiveis, relogio fora, leitura da carteira velha, conta ou binario divergente: nada sai (gate.ts, inalterado). |
| AEC-2 | Identidade exata do token e da rede (EVM em minusculas, Solana sensivel a caixa), nunca por simbolo. |
| AEC-3 | Solvencia fisica: nunca ordem de compra acima do caixa da carteira do agente NA REDE do candidato; nunca venda acima do saldo lido. Uma escolha que nao cabe e recusada com motivo nomeado, nunca redimensionada em silencio. |
| AEC-4 | Representabilidade: a quantidade final e positiva e representavel na precisao do ativo (decimais reais do coin e do token), por truncamento para baixo, sem piso em dolar e sem arredondar para centavo. |
| AEC-5 | Idempotencia e recibo: a mesma ordem nao sai duas vezes; hash transmitido nao e execucao confirmada; ordem incerta bloqueia duplicata; recibo conferido na cadeia. |
| AEC-6 | Restricao do provedor: os limites da carteira ligados no portal da OKX (por transacao, diario) nao sao contornados. Eles entram como FATO e delimitam as alternativas EXECUTAVEIS oferecidas ao Jev; uma venda maior que o limite por transacao continua dividida em partes (splitToPolicy) porque a conta a recusaria inteira. |
| AEC-7 | Valor finito, nao negativo, representado de forma explicita e serializavel. "Sem teto" e o valor `null` em `AgentCaps`, nunca `Infinity` que o JSON transformaria em `null` por acidente em outro lugar. |

## 3. O que sai do codigo (decisao economica programatica)

| Id | Requisito observavel |
| --- | --- |
| AEC-10 | Sem teto diario de compra, sem teto diario de venda, sem teto por compra. `applyCaps` com os tetos padrao devolve as ordens como vieram (teste independente do Codex, `autonomy-review.test.ts`). Um teto numerico so existe se uma pessoa o escreveu de proposito na configuracao manual. |
| AEC-11 | Sem piso de US$ 10 e sem piso inteiro em dolar: `SIZING.minOrderUsd`, `Math.floor` em dolares e os pisos por rede (US$ 250 na Ethereum) deixam de decidir. O custo de rede vira fato com o desconhecido dito (AEC-23). |
| AEC-12 | Sem barra de conviccao: a escolha do Jev entre as alternativas oferecidas E a decisao. A preferencia da Choice continua gravada (nao e probabilidade calibrada de lucro), mas nenhum limiar do codigo a converte em `skip` ou em tamanho menor. |
| AEC-13 | Sem juizo de postura: a postura declarada pelo Jev e registrada, nao limita tamanho nem quantidade de compras. |
| AEC-14 | Sem fechamento por `sem_historico` ou `sem_perfil`: historico curto ou ausente e volatilidade extrema sao fatos e marcas; o Jev decide. Sem historico, todos os perfis de alvo e stop ficam oferecidos. |
| AEC-15 | Sem teto de risco por operacao, de concentracao, de reserva, de liquidez ou de volume a escolher o tamanho: `riskPct`, `maxPositionShare`, `reserveShare`, `liquidityShare`, `volumeShare` e `chainSpendShare` deixam de limitar. O Jev le liquidez, volume, posicao resultante e custo como fatos. |
| AEC-16 | Sem "poeira": posicao pequena entra como candidata se tem valor e saldo conhecidos; o Jev pesa o custo. |

## 4. Contrato da escolha de tamanho e risco

- Alternativas por candidato de compra: `skip` e fracoes do MAXIMO EXECUTAVEL (caixa da rede do candidato, e no maximo o limite por transacao da conta quando ele existe). Sao as opcoes de uma Choice da API: o modelo nao escreve numero livre. Fracoes: `buy_tenth` (10%), `buy_third` (1/3), `buy_two_thirds` (2/3), `buy_full` (100%).
- Perfil de alvo e stop: escolha estruturada separada, como hoje (`alvo_2`, `alvo_5`, `alvo_10`, `alvo_20`). O perfil e o plano de saida da posicao; a guarda que o executa e execucao, nao julgamento.
- Fatos por alternativa no Brief, sem veto: `usd`, `pctCaixa`, `pctCarteira` da posicao resultante, `pctLiquidez`, `pctVolume24h`, `custoRedeUsd` (ou `null` com motivo), `idadeDados`. Desconhecido e `null`, nunca zero.
- Combinacao que nao cabe: duas compras no mesmo ciclo que juntas passam do caixa da rede. A que vem primeiro na ordem do modelo fica inteira, a outra e recusada com `caixa_insuficiente` e registrada em `dropped`; no olhar seguinte as alternativas sao recalculadas com o caixa novo e reoferecidas ao Jev. Nenhum corte silencioso.
- Cotacao ligada ao tamanho: a cotacao e lida para o tamanho EFETIVAMENTE escolhido (fase de fechamento, `closing.ts`), com impacto, taxa de rede e imposto; o desconhecido fica dito.
- Rastro: o registro da decisao diz o que o modelo escolheu (estancia, perfil, preferencia), o que o codigo fez (ordem, recusa nomeada) e qual parte foi propriedade de execucao.

## 5. Aceite independente (antes de implementar)

1. `src/decision-review/autonomy-review.test.ts` (Codex): giro diario alto nao bloqueia compra 3,25 nem venda 2,125; 37,125 nao vira 25; 0,125 USDC chega a cotacao e a execucao como 125000 unidades minimas.
2. Meus testes: precisao por truncamento em varios decimais; `applyCaps` com teto numerico explicito corta sem piso; `null` passa; duas compras juntas acima do caixa da rede: a segunda e recusada nomeada, nunca reduzida; candidato sem historico oferece todos os perfis e as fracoes; nenhuma barra de conviccao nem limite de postura altera a estancia; tela mostra `SEM TETO FIXO`.
3. Suite do agente e da web verdes, tipos verdes.
4. Nenhuma ordem real, nenhuma assinatura, nenhuma troca do runtime vivo por mim.

## 6. Fatias

| Fatia | Conteudo | Caminhos |
| --- | --- | --- |
| A | Tetos nulos e explicitos, `applyCaps` sem piso, precisao do CLI, config e autopilot sem tetos, tela | `gate.ts`, `config.ts`, `autopilot.ts`, `swap-args.ts`, `exit.ts`, web `lib/agent`, `lib/hud` |
| B | Sem conviccao, sem postura, sem `sem_historico`, sem reserva e risco no tamanho | `conviction.ts`, `decision.ts`, `cycle.ts`, `candidates.ts`, `opportunity/sizing.ts` |
| C | Alternativas por fracao do maximo executavel, fatos por alternativa no Brief, limite do provedor como fato, combinacao que nao cabe | `candidates.ts`, `model.ts`, `decision.ts`, `types.ts` |
| D | Cotacao do tamanho escolhido e reoferta (fase de decisao do fechamento) | depende da qualificacao do pacote integrado; nao ativar `decide` aqui |

## 7. Riscos ditos sem eufemismo

- Sem tetos, uma escolha `buy_full` coloca todo o caixa da rede em um token. A perda maxima de uma ordem passa a ser o caixa. O que limita e o plano de saida (stop) e o julgamento do Jev, nao o codigo.
- Sem a barra de conviccao, o agente passa a comprar mais vezes. As seis voltas fechadas foram negativas; nada aqui prova que comprar mais melhora.
- Custo de rede desconhecido em redes sem leitura de taxa: o Jev decide sem esse fato ate a cotacao do tamanho escolhido.
- O backstop independente continua sendo o limite ligado no portal da OKX, que este aplicativo nao desfaz.

## 8. Alavancagem financeira: autorizada pelo dono, sem instrumento ainda

- **Autorizacao (fato novo, mensagem direta do dono em 2026-10-14):** "eu quero que o sistema tenha autorizacao de operar a alavancagem financeira tambem [...] isso foi uma decisao do agente, nao foi minha". A tela e este SDD diziam "desligada, decisao do dono": era texto do proprio agente e estava errado. Corrigido em `autopilot.ts` (`OWNER_AUTHORIZATIONS`), no status do nucleo (`autopilot.authorizations`), na tela (`leverageText`) e na instrucao do modelo.
- **Isto substitui** a frase "nao ha autorizacao nova para margem/emprestimo" das secoes 87 e 88 da coordenacao, que era de antes desta mensagem. Continua valendo: nenhuma transferencia, nenhum trade manual para testar, nenhuma troca do runtime vivo sem qualificacao do Codex.
- **O que a autorizacao nao e:** nao e um instrumento. Hoje `instruments: []`: o codigo nao tem caminho de emprestimo, margem nem perpetuo. A tela diz "autorizada, sem instrumento ligado", nunca "ligada".
- **Proximo passo:** o estudo `ALAVANCAGEM-VIABILIDADE-20261014.md` (leitura de documentos locais, sem rede e sem carteira) diz quais instrumentos existem, o que cada um exige, o risco de liquidacao e a ordem em que podem ser ligados. A decisao de qual construir primeiro e de engenharia e de risco; a de usar e do Jev, dentro do que o dono autorizou.

## 9. Estado em 2026-10-14, noite (fonte no working tree, NAO implantado)

- **Fatias A, B e C estao implementadas na fonte** e verdes: `src/agent` 1053 testes, 0 falhas; `src/onchain-read` e `src/desktop` verdes; typecheck da raiz limpo exceto os arquivos em andamento de `src/decision-review/evolution/` (zona do Codex); web 3635 testes e typecheck limpos. Nada disto roda no runtime vivo: o nucleo aberto agora e `--watch-only` (a cadencia do agente NAO inicia, nenhuma ordem sai).
- **O que o Jev passa a ver e escolher:** compras em fracoes do maximo executavel (`buy_tenth`, `buy_third`, `buy_two_thirds`, `buy_full`), os quatro perfis de alvo e stop sempre oferecidos, e as marcas (`esticado`, `parabolico`, `caindo`, `estagnado`, `sem_historico`, `volatilidade_extrema`, `sem_perfil_que_caiba`) como FATOS, nunca como fechamento. A postura e o mandato de risco, reserva e concentracao passam a ser intencao registrada e mostrada: nao dimensionam nem fecham nada. Apenas `olhar` ainda muda a cadencia.
- **O que continua fisico no codigo (e por que):** o caixa da rede do candidato (nao se paga sem saldo); o limite por transacao ligado no portal da OKX, usando 95% dele (a conta recusa a ordem exatamente no limite); a reserva do coin nativo para taxa (`GAS_RESERVE_USD`, US$ 5): sem ela uma saida total deixaria a carteira sem poder mover nada naquela rede. **Esta ultima e um numero escolhido por mim, nao medido**: em redes de taxa baixa (Solana) e maior que o necessario. E a unica barreira numerica que sobrou e esta aqui dita para o dono decidir se vira fato lido por rede.
- **Correcao desta lista (2026-10-15): ainda ha vetos de CUSTO no executor, e eles sao escolhas do codigo, nao fisica.** `cli.ts` recusa depois da cotacao: impacto de preco acima de 3% (compra), 5% (venda) e 10% (protecao), e para compras acima de um terco do stop do perfil (`buyCostCapPct`: um perfil de stop de 1,5% aceita no maximo 0,5% de impacto, o que recusa tamanhos grandes em pools finos); imposto do token acima de 5% (`MAX_TAX_PCT`); e `swap-args.ts` passa `--max-auto-slippage` de 2% (compra), 3% (venda) e 8% (protecao). Sao protecoes contra execucao catastrofica, mas o Jev escolhe o tamanho SEM saber o impacto que aquele tamanho vai cotar e o codigo pode vetar depois (a tela mostra "O CODIGO BLOQUEOU: impacto alto"). Isso contradiz "cotacao atrelada ao tamanho escolhido, sem redimensionamento silencioso" e e o trabalho da fatia D: ler a cotacao no tamanho escolhido, entregar impacto, taxa, imposto e derrapagem ao Jev como fatos, e deixar no codigo apenas o que o provedor ja bloqueia (honeypot, acao `block`, simulacao que falha, saldo insuficiente). Ate la estes tres tetos continuam valendo e NAO foram removidos: remove-los antes de a fatia D existir deixaria o agente comprar com impacto desconhecido.
- **A venda segue o inteiro enviado:** o valor em dolares de uma venda parcial acompanha a quantidade bruta realmente enviada (um terco de 5 unidades e 1 unidade, um quinto da posicao), nao a fracao nominal.
- **Contagem fisica de chamadas a OnchainOS:** o cliente informa `extraDispatches` quando a retentativa por 50102 faz uma segunda requisicao, e o gateway registra cada uma no orcamento. Antes eram 2 requisicoes para 1 registro.
- **Fatia D continua desligada:** cotacao do tamanho escolhido e reoferta dependem do modo `decide` da fase de fechamento, que so liga depois da qualificacao do pacote integrado pelo Codex.
- **Perguntas de mandato:** as quatro perguntas (`mandate_risk`, `mandate_reserve`, `mandate_concentration`, `mandate_look`) ainda sao feitas ao modelo, mas tres delas nao movem nada. Remove-las economiza tokens; fica para a fatia D para nao mudar o esquema de perguntas sem qualificacao.
- **Correcao ao vivo (2026-10-15, 05h30): o impacto de preco da cotacao e COM SINAL.** Uma perda e negativa (as vendas confirmadas tiveram -0,68, -0,32, -0,16) e um ganho e positivo. O executor comparava o valor absoluto com o teto, entao recusou `exit_all` de CARDBACK (US$ 8,56) a cada olhar porque a cotacao pagava 9,68 POR CENTO A MAIS que o valor da posicao (`impacto_alto` falso). Agora venda e protecao so sao recusadas quando a PERDA por impacto passa do teto (5 e 10 por cento) e um ganho de qualquer tamanho passa; a compra mantem a regra simetrica (cotacao que da muito mais que o devido e padrao de armadilha). Teste: `cli.test.ts`, bloco "the price impact of a quote is SIGNED".
- **Quatro invariantes de execucao corrigidas apos a revisao do Codex (2026-10-15, secoes 109, 113, 114 e 115 da coordenacao):** (1) a compra enviada e ainda nao refletida e descontada do caixa em UNIDADES do coin que paga, exatamente o que a ordem envia (dolares cortados para seis casas do coin), e nao em dolares arredondados ao centavo: com 400 e um terco ja enviado (133333333 unidades) a oferta seguinte nunca passa das 266666667 que restam (`pending-buys.ts`, `executableCashByChain`); (2) toda escrita no ledger e completada ate o ultimo byte e so entao ha `fsync`; escrita curta que falha tira a metade escrita do arquivo (segundo handle `r+`, o handle de append nao encurta no Windows) e lanca `ledger_nao_gravou`, e uma cauda rasgada deixada em execucao e posta de lado antes do proximo append (`ledger.ts`, `LedgerFs` para teste); (3) uma cadeia decimal de centenas de digitos que vira infinito NAO e impacto: `impacto_desconhecido`, nunca ganho ilimitado; (4) o custo da ordem (`costUsd`) e a taxa mais a parte ADVERSA do efeito de preco, nunca um ganho favoravel contado como custo (o efeito assinado continua em `quote.impactPct`). Tambem corrigido o pedido de nao suspender do watchdog: bandeiras `uint32` explicitas (`0x80000001` em PowerShell e o Int32 negativo e nao liga ao parametro) e resposta lida com cuidado (`keep-awake=yes|no|failed`), em `scripts/autostart/keep-awake.ps1` com teste por stub e uma chamada real em processo descartavel.
- **Decisoes do dono em 2026-10-15 (resposta no chat):** (a) reserva de gas: manter o piso fixo de US$ 5 por enquanto (FEE-2 fechado); (b) rendimento do caixa em emprestimo: descartado, e a razao e o proposito do agente: "um agente para tomada de decisoes rapidas ... se o agente encontrar uma oportunidade para trazer 100% ou ate 900% de retorno, enquanto o emprestimo esta rendendo 4% ao ano, nao faz sentido ter o agente". O proposito agora faz parte do que o Jev le (`GOAL` em `model.ts`): cacar chances rapidas de retorno grande e assimetrico, operacoes curtas que saem no ganho, caixa parado como municao, com a ressalva de que e proposito e nao promessa, que a maioria das chances falha e que um movimento que ja correu nao e chance. A linha RENDIMENTO DO CAIXA saiu da HUD.
