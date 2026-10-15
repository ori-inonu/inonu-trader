# Desenho do agente autônomo

Parte do [SPEC](SPEC.md). Descreve o que **está construído** em `src/agent/` e na página do agente (2026-10-14), e o que falta. A decisão que organiza tudo é a D-A7: **a única autorização é conectar a carteira**; não há modo, permissão, aprovação nem configuração feita por pessoa.

## 1. Quem decide o quê

| Camada | Decide | Nunca decide |
| --- | --- | --- |
| **Jev (modelo), com o System One à frente** | a postura da carteira, uma ação por candidato, um perfil de alvo e saída por compra, e o **mandato** (risco, reserva, tamanho das apostas, quando olhar de novo), sempre por id fechado | valores, quantidades, endereços, tetos |
| **Código** | os candidatos e o que é possível cumprir, **todo valor**, os tetos derivados, os stops e saídas do plano, o disjuntor, o que pode ser enviado | opinião de mercado |
| **Dono da conta OKX (portal)** | a política (limite por transação e por dia): a trava independente que nenhum código do app desfaz | o que comprar |
| **Pessoa** | conectar a carteira (lendo o aviso), entrar na conta na página da OKX, transferir ativos de outra carteira (só se houver), definir a política (exigida por padrão), desconectar | qualquer decisão do agente |

## 2. O estado: um aviso, uma conexão, e o resto decorre

`state.ts` guarda só: conectado ou não, desde quando, **a versão do aviso lido** (`DISCLOSURE`; o núcleo recusa uma conexão sob outra versão), a pausa de compras novas do próprio agente (até quando e por quê) e os últimos eventos. Estados antigos (com modos e permissão) carregam como **não conectado**.

O que o agente faz com o dinheiro **não é guardado nem escolhido**: `wire.modeNow()` o deriva a cada ciclo.

```
não conectado ........................................ desligado  (nada roda)
conectado, algo do lado do dinheiro não pronto ....... sombra    (lê, decide, registra, mede; nada sai)
conectado e tudo pronto .............................. limitado  (executa)
```

"Pronto" = programa da OKX instalado e com hash conferido, carteira gerida do tipo Agentic Wallet, chaves da OKX e do modelo presentes. O portão de cada ciclo ainda confere política do dono, sessão, endereço, relógio e binário; se **só o lado do dinheiro** falhar, o ciclo **cai para a sombra** (nota `execucao_bloqueada` + o motivo) em vez de ficar cego.

## 3. O ciclo (um passo do agente), como está no código

```
agendador (a cada intervalMin, derivado do mandato; um tick não faz nada sem carteira conectada)
  antes: sincroniza o relógio da OKX e lê o contexto do mercado (BTC, ETH, System One, funding e posição aberta do BTC)

  1. ESTADO     não conectado: nada é lido, perguntado nem gravado
  2. OBSERVA    lê as carteiras (saldos assinados: rawBalance exato) e os fatos (preço, liquidez, risco)
  3. PORTÃO     relógio cru da máquina, saldo recente, registro e planos legíveis, pasta com um só dono (LOCK), arquivo STOP;
                se vai executar: binário verificado, endereço, política, sessão (se só isso falhar: cai para a sombra)
  4. PLANOS     cada posição aberta pelo agente: stop, recuo máximo, tempo, metade no alvo  (código, sem modelo)
                AS SAÍDAS DO PLANO SAEM AQUI, antes de consultar o modelo e sem depender dele ou do orçamento
  5. CANDIDATOS compras do ecossistema (tamanho derivado) + posições da carteira gerida + manter; compra fechada por preço esticado,
                parabólico, queda livre, sem histórico fresco, sem perfil; token em voo ou saindo pelo plano não é oferecido;
                compras novas pausadas pelo disjuntor: nenhuma compra é oferecida
  6. ORÇAMENTO  consultas e tokens do dia; esgotado: "manter" sem consultar; mesmo Brief dentro do prazo: não pergunta
  7. JEV        uma consulta: postura + mandato + uma ação por candidato + um perfil por compra, tudo por id fechado
  8. VALIDA     existe, foi oferecida, respeita a postura, não compra e vende o mesmo ativo, mandato feito das opções oferecidas
  9. ORDENS     o código calcula: vendas por fração exata (BigInt), compras em dólar repartindo o caixa; tetos derivados
 10. REGISTRA   decisão e ordens no registro ANTES de agir; o Placar marca cada decisão; o mandato anda um degrau
 11. EXECUTA    (se pronto) por ordem: relê conexão e prontidão, compra: preço fresco e PLANO GRAVADO ANTES (se não grava, a compra não sai),
                grava "enviando", cota, confere, troca, grava o resultado. Falhou: segue para a próxima. Incerta: para o resto do ciclo
 12. PLANO      o plano nasce antes da troca; a venda executada NÃO o fecha (o hash não é saldo): a carteira o fecha, com a posição
                ausente por mais de 1 hora seguida
 13. DEPOIS     o Placar liquida as janelas de 15 min, 1 h, 4 h e 24 h; a disciplina avalia o disjuntor
```

Todo passo que não puder terminar bem termina em **manter**, com o motivo em código constante. A exceção é o passo 4: o plano de uma posição **sai mesmo sem o modelo**.

## 4. Mapa das peças

| Arquivo | O que faz | Requisitos |
| --- | --- | --- |
| `types.ts` | vocabulário: modos derivados, posturas, posições, candidatos, ordens | todos |
| `state.ts` | conexão, aviso lido, pausa, eventos; arquivo ilegível ou de versão anterior carrega como não conectado | AUT-1, AUT-10 |
| `autopilot.ts` | deriva tetos, risco, reserva, ritmo e redes do valor da carteira, da política do dono e do mandato; cada valor diz de onde vem; o agressivo só com vantagem medida | AUT-27 |
| `mandate.ts` | as quatro escolhas do Jev, o degrau por ciclo, o armazém em disco | AUT-28 |
| `autonomy.ts` | o disjuntor: perda do dia e medição da semana pausam as compras novas por 24 h | AUT-31 |
| `agent-wallet.ts` | instalar o programa da OKX (hash conferido antes de gravar), iniciar o login (link só da OKX), perceber que acabou, ler os endereços | AUT-29 |
| `config.ts` | identidade da carteira gerida e das só de leitura, orçamento do modelo, programa da OKX; os números de tetos só valem com `auto: false` (pela API) | AUT-3, AUT-5, AUT-27 |
| `book.ts` | saldos viram posições com `rawBalance` exato e decimais conferidos; caixa só por contrato de dólar conhecido; `verifyBook` | AUT-2, AUT-4, AUT-23 |
| `exit.ts` | quanto vender (fração em `BigInt`); a saída do plano não exige preço nem ordem mínima | AUT-2, AUT-4, AUT-20 |
| `timing.ts` | qualidade da entrada (RSI, faixa, corrida, queda, volatilidade), só com barras em ordem, sem buracos e frescas | AUT-17, AUT-26 |
| `lock.ts` | um agente por pasta de dados (criação exclusiva) | AUT-25 |
| `plans.ts`, `protection.ts` | perfis, plano por posição, gatilhos; as saídas do plano, antes do modelo; plano órfão só depois de 1 hora de ausência | AUT-18 a AUT-20 |
| `candidates.ts`, `decision.ts` | candidatos; valida a resposta e planeja as ordens | AUT-2, AUT-17 |
| `model.ts` | o Brief (percentuais e códigos, mandato, alavancagem do mercado), as perguntas fechadas, o adaptador do Jev | AUT-2, AUT-28, AUT-32 |
| `budget.ts`, `ledger.ts`, `gate.ts`, `scoreboard.ts` | orçamento; registro durável; portão e tetos; Placar (apostas independentes, só do modelo, modos não se misturam) | AUT-3, AUT-4, AUT-9, AUT-11, AUT-13 |
| `swap-args.ts`, `cli.ts` | argumentos reais da troca (unidades brutas, nome da rede), guarda de lista branca, executor, recusas pelo texto real | AUT-7, AUT-8, AUT-14, AUT-33 |
| `live.ts` | leitores reais: carteiras, fatos, histórico horário, ecossistema, contexto do mercado (inclui funding e posição aberta) | AUT-2, AUT-21, AUT-22, AUT-32 |
| `cycle.ts`, `scheduler.ts` | o ciclo acima; cadeia de temporizadores com etapas que não travam | AUT-2, AUT-9, AUT-10 |
| `service.ts`, `wire.ts`, `http.ts` | o serviço montado e a rota `/agent/*` (status, ledger, connect, disconnect, wallet, run, resolve, config) | AUT-12 |
| `web/src/components/Agent/*`, `web/src/lib/agent/*` | a página única: o aviso, os passos da carteira do agente, o que decidiu, posições, oportunidades, estratégia, prova de retorno | AUT-12, AUT-30 |

## 5. A camada de decisão (o que torna o Jev inteligente aqui)

O modelo recebe um **Brief** de percentuais e códigos (nenhum dólar do usuário, nenhum endereço de carteira), com:

- **O quadro da carteira:** parcela em caixa, parcela na carteira gerida e nas outras, número de posições.
- **Cada posição da carteira gerida:** peso, variação de 24 h, liquidez do pool, impacto de sair, carteiras rastreadas que já venderam, risco da OKX, horas em carteira, onde está entre o stop e o alvo, gatilhos.
- **Cada compra** (o que o antigo rastreador e a mesa calculavam, agora como dado): famílias de evidência (trilha de carteiras, fluxo, liquidez, distribuição, tração), marcas de cuidado, o momento da entrada (RSI, posição na faixa de 2 dias, corrida, queda), os perfis de alvo e saída oferecidos e o teto da compra.
- **O mercado ao redor:** BTC e ETH em 24 h, tendência, volatilidade, a leitura do **System One**, e a **alavancagem do mercado**: funding do perpétuo do BTC e variação de 1 hora da posição aberta.
- **O mandato em vigor** e se a medição já liberou o perfil agressivo.
- **O histórico medido** por família de evidência, quando houver amostra (canal pronto, preenchimento pendente).

O modelo responde **por id fechado**: postura, mandato (risco, reserva, tamanho das apostas, olhar), uma ação por candidato, um perfil por compra. O código recusa o que não foi oferecido.

**"Não comprar na alta" é código** (AUT-17); **operações curtas com saída planejada** (AUT-18 a AUT-20): cada compra só existe com um perfil (alvo 2%, 5%, 10% ou 20%, com stop e prazo), oferecido só se plausível para a volatilidade do token.

**Perfil agressivo, mas com inteligência:** o Jev pede o risco que quiser; o código só o **honra** quando o Placar mediu vantagem sobre manter dólares (AUT-28). Sem isso o agente opera moderado e a tela diz que pediu mais do que a medição liberou. **Composição:** o lucro realizado volta ao caixa e cada compra é recalculada sobre o capital atual.

## 6. Cadência e a cota da OnchainOS

A cota é de 100 mil chamadas Basic e 100 mil Premium por mês. O ritmo de olhar (5, 10 ou 20 minutos) é o Jev quem escolhe; o modelo só é consultado se o Brief mudou ou passou o tempo de repetição (30, 60 ou 120 minutos), e **144 consultas por dia é o teto, não a meta**. Varredura do ecossistema a cada 30 min, fatos de posição a cada 30 min, risco a cada 6 h, velas horárias a cada 10 min, preço no fim de cada janela do Placar por decisão. Funding e posição aberta vêm do endpoint público e gratuito da exchange.

## 7. O programa da OKX (`cli.ts`, `swap-args.ts`, `agent-wallet.ts`), conferido com o programa real

- **Instalação:** o app baixa `checksums.txt` e o programa do **mesmo release** em `github.com/okx/onchainos-skills` (versão fixa, v4.6.4), confere o SHA256 e só então grava em `<dados>/agent/cli/`. O hash que conferiu é o que o app confere **antes de cada execução**. Verificado de verdade: 17.208.200 bytes, hash igual ao publicado, o mesmo que a análise do instalador tinha anotado.
- **Lista branca:** `wallet status|balance|addresses|history`, `wallet login --phase init|poll`, `swap quote|execute`. Nada de `send`, `contract-call`, `strategy`, `cross-chain`, `gateway`, `mcp`, `payment`. Opções também em lista branca; **`--force` nunca**; o pedido de confirmação do programa (saída 2 ou `confirming`) é recusa (é o que impede um pagamento x402 automático por cota estourada).
- **Argumentos reais** (conferidos com a ajuda do programa): `--from --to --amount|--readable-amount --chain` (e `--wallet --max-auto-slippage` no `execute`). Toda quantidade vai em **unidades brutas**: `--readable-amount` faz o programa buscar os decimais do token na OKX, uma chamada com cota própria que falhou ("Failed to fetch token decimals ... confirming"). A rede vai pelo nome (`ethereum`, `bsc`, `base`...).
- **Recusas reais** vêm como `{"ok":false,"error":"...","notifications":[...]}`: "Invalid Authority ... run `wallet login`" (a cotação exige login) é **falha limpa** (nada foi assinado); saldo insuficiente também; qualquer outra recusa depois do início é **incerta**. O texto do programa nunca vira motivo.
- **Cotar, conferir, trocar:** recusa por `block`, `warn`, honeypot (afirmado como falso no token negociado), imposto, impacto ou impacto desconhecido; só então `swap execute`.
- **Incerto** fica **em voo**, nunca é reenviado e bloqueia só as ordens do modelo daquele token; a pessoa confere o histórico e diz na tela (`POST /agent/resolve`).
- **Ainda não visto de uma execução real:** a saída de `wallet addresses` e `wallet status` depois do login, o formato de `swap execute` com sucesso (preenchimento), `wallet history` para reconciliar sozinho as ordens em voo.

## 8. A página

Duas páginas: **Agente** e **Configurações** (as chaves de API). Na do agente a pessoa faz uma coisa: **conectar a carteira**, depois do aviso. Em seguida o app instala o programa da OKX, prepara a entrada e mostra um botão que abre a **página da própria OKX**; percebe sozinho quando a entrada acaba, lê os endereços, e o card "Carteira do agente" some quando tudo está pronto. O resto da página é o que importa para o lucro: patrimônio sob gestão, última decisão e por quê, posições com stop e alvo, oportunidades avaliadas, a estratégia escolhida pelo agente (somente leitura), prova de retorno e a saída (desconectar). Não há campo, modo nem aprovação. A mesa, o rastreador, o console e o diagnóstico deixaram de ser servidos; o código dos componentes antigos continua no repositório, sem rota.

## 9. Parada

1. **Desconectar:** imediato, relido antes de cada ordem; leva a pausa junto.
2. Arquivo `STOP` na pasta do agente: o portão bloqueia; uma janela que não detém a pasta o deixa ao desconectar.
3. Limites zerados no portal da OKX: **só o dono**, a trava que nenhum código nosso desfaz.
4. O disjuntor do próprio agente (AUT-31) pausa as compras novas; não é uma parada total, de propósito.

## 10. Medição

Cada decisão do **modelo** vira uma marca com o preço de entrada e, depois, o preço nas janelas de 15 min, 1 h, 4 h e 24 h, medido **contra não agir**. Repetições da mesma aposta contam uma vez por janela, as saídas do plano ficam à parte, os modos (análise e operação) não se misturam, uma decisão sem preço conta como desconhecida e uma afirmação sobre dinheiro real exige o custo. A tela só afirma ganho com 30 decisões medidas, independentes, de janela fechada.

## 11. O que o usuário faz, e o que o agente nunca faz

| É do usuário (inerente à OKX) | Nunca é do agente |
| --- | --- |
| Conectar a carteira, depois de ler o aviso | Executar sem a carteira conectada sob o aviso atual |
| Entrar na conta OKX na página da OKX | Digitar credenciais ou ler códigos |
| Transferir ativos de outra carteira para a da conta (só se houver) | Mover fundos entre carteiras |
| Definir a política no portal | Alterar política, tetos ou destinos |
| Desconectar quando quiser | Voltar sozinho depois de desconectado |

## 12. Testes e prova

Modelo falso, CLI falso e serviços falsos em todo teste: nenhuma chamada real ao modelo, à OKX nem ao programa. O executor de processo real é testado com `bun` como programa de teste. O serviço inteiro roda em pasta temporária. Três revisões independentes em cópia isolada; as duas primeiras estão resolvidas, com testes de regressão (`review2.test.ts`).

## 13. Entre os ciclos e depois deles (acrescentado em 2026-10-14, à tarde)

**A vigilância (`guard()`).** A cada 45 segundos, entre os ciclos do modelo, uma passada leve lê a carteira e executa só o que os **planos** das posições exigem (stop, trailing, prazo, a metade no alvo). Não consulta o modelo, não lê o ecossistema nem os fatos dos tokens, usa o preço que veio com o saldo, não deixa registro quando nada é exigido e nunca escolhe nada por conta própria. Não roda sobre um ciclo em andamento (o ciclo espera uma vigilância em curso, a vigilância pula um ciclo em curso) nem enquanto o agente só analisa. Os fatos do lado do dinheiro (conta, endereço, binário, sessão) são reaproveitados por até um minuto.

**Plano escolhido pelo Jev para o que já existia.** Uma posição que o agente não abriu (as herdadas) não tinha stop. Agora, para cada uma que será mantida, o modelo recebe os perfis de alvo e stop que cabem na volatilidade do token e escolhe um; o código abre o plano (preço do momento como entrada) e, daí em diante, executa o stop entre as consultas. O código nunca acrescenta uma compra ou venda que o modelo não escolheu.

**Convicção.** Cada compra é medida pela convicção do modelo (probabilidades que o provedor manda): forte mantém o tamanho, moderada compra menos, fraca ou malformada não compra; sem probabilidades a convicção é desconhecida e compra no máximo o menor tamanho. Confiança não é chance de lucro calibrada; só decide quanto arriscar.

**Os minutos de um token.** Barras de 5 minutos (leitor próprio, cota limitada a 3 compras abertas e 3 posições por ciclo) dão retorno de 5 e 15 minutos e de 1 hora, a faixa da hora, o ritmo do volume e a idade do dado, com as marcas `estagnado`, `disparando` e `caindo_agora`. Compra em token parado há uma hora não é oferecida; posição parada **não** é oferecida para venda por isso. O Brief leva também a janela de 5 minutos e de 1 hora do provedor e a idade dos fatos de cada posição.

**Ordem que ficou sem resposta.** Só um **recibo** do histórico da própria ferramenta a liquida (`wallet history --tx-hash` ou `--order-id`, ou uma busca por token em janela de tempo que só vale com uma única entrada): `SUCCESS` é executada, `ERROR` e `CANCELLED` são falha, `PENDING` espera. Saldo e relógio **não** liquidam nada (um depósito do mesmo valor parece compra, uma saída manual parece venda, o saldo atrasa, uma transação pode ficar horas pendente). Uma resposta que não prova nada mas traz um hash guarda a referência. O que o histórico não resolve continua em voo, e a palavra da pessoa na tela é a saída.

**Medir o que não foi feito.** Cada "manter" e cada "não comprar" entra no Placar, medido contra a alternativa que o Jev recusou, em janelas próprias (não mistura com as ordens). O custo de cada ordem vem da cotação (taxa de rede em dólares mais impacto sobre o tamanho) só quando as duas partes existem.

**Disjuntores.** Além da perda medida pelo Placar, o patrimônio real da carteira (uma leitura por ciclo em `equity.jsonl`, índice que desconta depósitos e saques) pausa as compras novas por 24 horas se cair mais de 5 por cento num dia ou mais de 12 por cento do melhor momento da semana. Saídas e stops continuam.

**Ritmo.** As consultas ao modelo se distribuem ao longo do dia UTC (o que o relógio ganhou mais uma reserva de 5 por cento): 5 minutos de ciclo deixam de gastar as 144 em 12 horas. O primeiro ciclo depois de uma partida vem em 20 segundos se o último é velho, e só no fim do intervalo se um acabou de rodar.

**Encerramento.** `close()` espera o trabalho em voo antes de soltar a pasta; no tempo esgotado com trabalho em voo rejeita com `close_timeout` e **mantém** a pasta. A política de limites da OKX é condição do modo de dinheiro por padrão; só uma escolha explícita da pessoa (`requireOwnerPolicy: false`) a relaxa.

## 14. Correções da 4ª revisão (acrescentado em 2026-10-14, à noite)

Uma cópia isolada do código foi revisada por um agente distinto do implementador; os achados reais viraram teste que falha antes e passa depois (tabela em `evidence/AUT-fase0.md`).

**A vigilância é completa sozinha.** Depois de reiniciar, o executor não tinha livro (o ciclo completo é quem o publicava) e a vigilância não vendia até o primeiro ciclo. Agora a vigilância entrega o livro que leu ao lado assinante (`onGuardBook`, nunca à página) e concilia os recibos (`reconcileReceipts`) antes de cada passada; `guardNow()` existe para teste e operação. Uma ordem em voo segura o token inteiro (o modelo e o stop), e a vigilância procura o recibo a cada passada. **Uma versão intermediária reenviava a saída total depois de 3 minutos; foi desfeita** (ver o fim desta seção): a página promete "nunca manda a mesma ordem duas vezes e não mexe nesse token até saber".

**Dinheiro que não deve acabar.** A moeda nativa paga a taxa de qualquer transação: `exit.ts` mantém `GAS_RESERVE_USD` (5 dólares) e a oferta ao modelo e o stop respeitam isso. Uma compra só paga em deslizamento e impacto um terço do stop do perfil (`buyCostCapPct`, `swap-args.ts`) e só acontece se a sessão cobre o prazo máximo do plano (`maxHoldMs`, `cli.ts`); os planos mais longos duram 10 dias, a sessão real observada dura cerca de 100.

**O disjuntor lê o que existe.** `snapshotOf` tratava qualquer token sem valor como "leitura sem valor" e a descartava: justamente quando um pool some. Agora esse token entra a preço zero e, se foi sinalizado e saiu do livro, é carregado da leitura anterior a preço zero.

**O Placar.** Ordens antes de "não agir", teto de 10 consultas de "não agir" por passada, pausa de 15 minutos depois de preço não achado, uma marca por hora do mesmo "não agir". `windowSummary` recebe o relógio: janela que ainda não terminou não é preço faltando.

**O recibo conferido com a ferramenta real.** Uma leitura somente de estrutura (chaves e tipos, nenhum valor guardado) do histórico real da conta, sem ordem, login nem segredo, confirmou: o detalhe por hash devolve um array de uma entrada; `from` e `to` são texto; `chainIndex` é texto (`"501"`, `"196"`); `direction` é um código ("5" no swap Solana, "3", "4", "8", "40" em X Layer, "IN" em recebimentos), nunca usado pelo leitor; `failReason` é nulo no sucesso. Num swap Solana antigo da própria conta `from` é o endereço do agente. O leitor estrito de `receipt.ts` bate com essa forma. **Não conferido:** `ERROR`, `CANCELLED` e `PENDING` reais, e um swap em rede EVM principal (a conta não tem nenhum).

**Encerramento do desktop.** `close()` do agente que rejeita com `close_timeout` não vira rejeição não tratada; só o servidor da nuvem (sem desligamento por inatividade) foi feito para rodar sem ninguém: fechar a janela do desktop encerra o app e, com ele, o agente.

**Revisão do Codex sobre a 4ª rodada (mesma noite).** Dois testes vermelhos viraram correção: um tempo esgotado guarda a referência que a saída parcial já trazia (`txReferenceOf` sobre o envelope parcial), e um "ok" só vale como execução com referência no formato de hash EVM (0x e 64 dígitos hexadecimais) ou de assinatura Solana; o que não tem cara de hash fica `incerta` com `sem_recibo`. A taxa de rede da cotação (`tradeFee`) é uma estimativa em dólares, não o custo medido; o custo líquido do Placar é chamado de estimado na página.

**O reenvio da saída total foi desfeito.** O achado F1 da 4ª revisão (um stop parado atrás de uma ordem sem resposta) tinha sido tratado reenviando a saída total depois de 3 minutos. O Codex mostrou, com dois testes, o defeito dessa saída: a falta de recibo (uma leitura que falha, um reinício com a memória vazia) não prova que a anterior terminou, e um segundo swap é outra transação, com taxa própria, e uma segunda intenção financeira. Além disso a página promete ao usuário que o agente nunca manda a mesma ordem duas vezes. Valeu a regra mais forte: nenhuma saída sai de novo sobre uma ordem sem desfecho, com qualquer tempo; o que liberta é um recibo (`ERROR` e `CANCELLED` libertam, `SUCCESS` liquida) ou a palavra da pessoa. O risco que sobra é um stop parado até lá; o que o reduz: o hash guardado no tempo esgotado (a maioria das ordens sem resposta tem hash e o recibo chega em minutos), os recibos procurados na vigilância a cada passada, e a página que mostra a ordem e pede a palavra da pessoa. Uma ordem sem hash nenhum só se resolve pela pessoa.

**A cotação real tem outra forma.** Uma leitura somente de leitura das cotações da conta mostrou que `swap quote` responde `data` como **array de um registro**, não como registro: o executor lia a forma errada e recusaria toda ordem real como `quote_ilegivel` (falha segura, mas o agente nunca operaria). `oneRecord` lê as duas formas (registro, ou array de exatamente um registro) na cotação, na recusa e na referência da execução. A resposta real de `swap execute` continua não vista.

**Transmitir não é executar (achado do Codex no código-fonte oficial).** O Codex leu `swap.rs` e `transfer/mod.rs` da tag v4.6.4: `swap execute` imprime `ok` e `swapTxHash` depois do **broadcast**, sem esperar o recibo do swap; só o approve e o revoke esperam a cadeia. O executor tratava `ok` mais um hash como "executada", e uma transação que falhasse na cadeia depois disso ficaria registrada como feita (e um stop poderia mandar a venda de novo sobre uma transação ainda pendente). Agora o executor devolve `transmitida` (`ExecResult`), o ciclo grava `incerta` com motivo `transmitida` e o hash, e a ordem entra no mesmo caminho de toda ordem em voo: o token fica segurado, a vigilância procura o recibo a cada passada, `SUCCESS` liquida (`recibo_sucesso`), `ERROR` e `CANCELLED` libertam (`recibo_erro`). Diferente de uma ordem sem resposta, uma ordem transmitida **não para o resto do ciclo** (a transmissão é conhecida, e o teto diário já a conta). Efeitos: a página mostra a ordem por um instante como "transmitida, esperando a confirmação"; a metade no alvo só é marcada quando o recibo prova (`settleOrder`); o Placar marca a decisão na transmissão, como já fazia com ordens incertas; um plano aberto por uma compra que falhar na cadeia vira órfão e é limpo como os outros.

**Saída em partes e sessão à vista (A1.10 e A1.12).** A política da conta OKX recusa por inteiro uma venda acima do limite por transação, e `applyCaps` nunca corta uma venda (sair é como se reduz o risco). `splitToPolicy` (gate.ts, pura) corta, depois dos tetos e antes de enviar, a venda que passa do limite para 95 por cento dele, do saldo, em unidades inteiras (`BigInt`); vale para a saída do plano e para a venda do modelo. Como a parte transmitida fica em voo, o token fica segurado até o recibo e o próximo olhar (a vigilância ou o ciclo) corta a parte seguinte do saldo que lê então; o último trecho cabe e sai inteiro. `tookHalf` (exit.ts) impede que uma parte da metade conte como a metade inteira. O estado da carteira traz `sessionLeftMs` (só o tempo que resta, vindo do arquivo de sessão da ferramenta; a chave nunca sai da pasta dela) e a página o mostra numa linha, em destaque quando restam menos de dois dias. Os textos dos motivos `politica_ausente` e `politica_frouxa` diziam "opcional" e agora dizem que o agente fica em análise até os limites serem ligados no portal.

**Autoridade honesta, dispensa dos limites e metade em partes (noite de 2026-10-14).** O pedido do dono, dito por voz: "pode operar sem os limites", e a mesa de decisões sai, tudo concentrado no painel do agente. (1) `authority` no estado (`wire.ts`, `authorityView`): `desligado`, `analise` com o primeiro motivo (a prontidão, o próximo passo da carteira, ou o que o último ciclo achou) ou `dinheiro`; antes de a conta ser lida uma vez diz `conta_nao_lida`, nunca "sem login". O modo derivado continua a dizer só o que o agente pode fazer, e a página usa `authority`. (2) `AgentConfig.ownerPolicy` (`exigida` por padrão; arquivos antigos leem como exigida): `dispensada` é a escolha explícita da pessoa, gravada em `config.json`, e os limites do portal deixam de ser exigidos (valem só os tetos do app); `requireOwnerPolicy: true` na composição da nuvem sempre vence e recusa a dispensa (`politica_exigida_pelo_servidor`). Depois da escolha um motivo `politica_*` do último ciclo deixa de aparecer como bloqueio. (3) A metade no alvo é um **valor fixo** derivado do livro de ordens (`halfProgress`, exit.ts: metade do saldo no início da primeira parte), cortada em partes pelo limite por transação, e só as partes com recibo confirmado abatem; um reinício ou um depósito não mudam o alvo. (4) `createBookReader` repete a leitura da carteira gerida até três vezes, com 2 s entre elas. (5) A página do núcleo (porta 3000) servia uma exportação estática antiga que ainda trazia a mesa; foi refeita a partir do código atual (só o agente e as configurações) e a antiga foi guardada fora do repositório. O código-fonte da mesa (`web/src/components/Desk`, Rastreador, Doctor e afins) continua no repositório, sem rota que o sirva.

**Investigação das decisões do Jev (2026-10-14, noite) e o que mudou.** O que o Jev recebe a cada ciclo (`model.ts`, `agentBrief`): a carteira em percentuais, uma entrada por posição (variação de 24 h, liquidez, impacto de saída, carteiras rastreadas que já venderam, risco e sinais da OKX, preço desde a compra, plano, barras de 5 minutos, gatilhos do código e as posturas que pode escolher), uma entrada por candidato de compra (trilha das carteiras, fluxo, liquidez, distribuição, tração, segurança, marcas de cuidado, o momento da entrada e o teto em dólares que o código calculou), o contexto do mercado (BTC e ETH, funding e interesse aberto do perpétuo, a leitura do System One) e o mandato. Nunca recebe saldo em dólares nem endereço. **O que a história do agente mostrou:** em 34 ciclos a postura foi `defensiva` 34 vezes e todas as 170 decisões de compra foram `skip`, mas isso era em boa parte estrutural: a carteira tinha **0% em dólares**, então nenhum candidato tinha tamanho à venda; e as compras recusadas nem eram medidas (um defeito: o tamanho zero as descartava), então o agente não aprendia nada com elas. 38% dos candidatos vinham de redes em que o agente não tinha caixa (Base, BNB). As vendas do modelo, medidas contra manter, ficaram abaixo (saída total em 1 hora: média de -0,51 dólar em 14 amostras; metade: -3,07 em 8), e os "manter" acima (+5,61 em 11), numa janela curta de uma só alta: amostra pequena, mas é o tipo de dado que o Jev agora lê. **Mudanças:** compras recusadas passam a ser medidas (tamanho nocional do menor pedido), o histórico medido entra no Brief, cada consulta fica registrada em `briefs.jsonl`, e o varrimento do ecossistema segue as redes com caixa. **O que não mudou, de propósito:** os limiares das famílias de evidência e a ordem dos candidatos; o backtest de 13 meses não achou vantagem em critérios de "barato", então só se ajusta isso com dados medidos do próprio agente, que agora passam a existir.


**Segunda rodada de estudo dos ciclos (2026-10-14, noite).** (a) **A compra nao existe nesta carteira por construcao:** com ~US$ 126, o teto por risco e `(risco / perda assumida) * carteira` = US$ 1,25 a 0,5% (US$ 2,5 a 1%, US$ 5 a 2%) contra a ordem minima de US$ 10; o registro de cada consulta agora guarda `cap` com `binding`, `riskPct`, `tightest` e `tightestUsd` (`tightestLimit`, `capInput`), e a tela chama isso de `abaixo_do_minimo`. A regra da perda assumida e uma decisao do dono; nao foi alterada. (b) **Saida lida pela distribuicao inteira** (`moderateSale`, conviction.ts): a mediana da escada manter, um terco, metade, tudo, nunca vendendo mais que a opcao do topo e nunca transformando manter em venda; e uma heuristica nova, a medir pelo Placar contra a decisao que o topo teria dado (o registro guarda as duas). (c) **O Brief inteiro que o modelo leu** fica em `briefs.jsonl` (so porcentagens e codigos) para reconstruir a motivacao e cruzar com o resultado medido. (d) **`gas_station_pendente`:** quando a OKX pede a configuracao inicial do Gas Station (pagar a taxa em USDC porque a carteira tem pouco SOL), a ordem falha sem envio e a tela explica que a escolha e do dono; o agente nunca responde ao pedido. (e) **Proximo, por ordem:** perguntas atomicas por candidato (documentacao da TypeSafe: uma pergunta estreita por propriedade, probabilidade sim ou nao, composicao e pesos no codigo), registradas primeiro e cruzadas com os resultados do Placar antes de qualquer uso; o degrau de venda como pergunta Score (niveis ordenados) em comparacao A/B com a mediana.

## 15. O Jev decide, o código executa e dimensiona (2026-10-14, noite)

Pedido do dono, dito por voz: o perfil dele é **arrojado**, nenhuma trava de conservadorismo, e o Jev "só decide quando vê lucro", com decisões mais rápidas que 5 minutos. A leitura dos ciclos reais mostrou que o Jev quase não era consultado: o código fechava as compras antes (preço esticado, parado, sem perfil) e, quando o Jev era consultado, a postura dele (sempre `defensiva`, 12 de 12 consultas) anulava a resposta inteira. O que mudou, com teste que falha antes e passa depois (`src/agent`, `web/src/lib/agent`):

**O que fecha uma compra é só o que o código não consegue executar.** `sem_historico` (barras horárias insuficientes para dimensionar o stop), `sem_perfil` (alvo inalcançável ou volatilidade desconhecida) e o tamanho (`abaixo_do_minimo`, `sem_tamanho`). `entrada_esticada` e `estagnado` não são mais fechamento: as marcas (`esticado`, `parabolico`, `caindo`, `estagnado`, `disparando`, `caindo_agora`) seguem no Brief como **fatos**, com os números em `tm` e `mo`. Um token tão volátil que o stop de todo perfil é ruído recebe o perfil mais largo (`alvo_20`) com a marca `volatilidade_extrema` (`wildProfile`), e o tamanho sai do stop desse perfil.

**O julgamento do topo é do Jev.** As facetas `late_entry` e `still_falling` (perguntas booleanas atômicas, na mesma chamada) decidem as entradas marcadas: probabilidade de 0,7 ou mais pula a compra; **sem resposta também pula** (`topo_sem_resposta`, `queda_sem_resposta`), porque desconhecido nunca é calmo (`CHASE_GATE`, conviction.ts, limiares escolhidos por mim e não calibrados: o Placar das compras puladas é o que vai dizer).

**A postura limita, não anula.** `validateDecision` não recusa mais a resposta inteira (as vendas e as outras compras valiam nada se uma compra passasse da postura): reduz o tamanho ao teto da postura (`defensiva` = o menor oferecido e uma compra por ciclo; `neutra` = até dois terços) e conta em `decision.limited`; se o teto cita um tamanho que o código não ofereceu (carteira pequena), vale o menor oferecido. A pergunta de postura não manda mais fechar a porta por causa de uma posição com gatilho. A distribuição da postura passa a ser gravada (`postureProbs`), e o registro da consulta guarda as posturas e os perfis **aplicados** além do que o modelo pediu (`requested`).

**A confiança exigida depende do perfil do dono.** Com `OWNER_PROFILE = "arrojado"` as barras de conviccao são `BUY_CONVICTION_BOLD = [0,2; 0,35; 0,5]` pelo **posto** do tamanho entre os oferecidos (o menor executável precisa só de uma inclinação, 60% entre comprar e pular), em vez de 0,5, 0,6, 0,7 pelo nome: uma carteira cujo teto passa pouco do mínimo recebe um único tamanho chamado `buy_full`, e a barra do orçamento inteiro de risco pedia 85% de um modelo que só respondeu sim ou não. Sem o perfil valem as barras antigas.

**O Placar mede o que o agente deixou de comprar.** Ao vivo 0 de 20 compras puladas tinham preço. Causas, medidas nos dados: 50 consultas por passada tomadas por ordens sombra repetidas, sem reserva para as decisões de não agir; vela ausente em token fino virava "sem preço"; cada janela relia as velas. Agora as ordens usam até 40 consultas e as decisões de não agir mantêm 10; o último fechamento vale por até 6 barras de 5 minutos (3 horárias) e mais que isso continua sendo buraco; as velas de um token e de uma barra são lidas uma vez e servem a todas as janelas (nunca uma leitura anterior ao fim da janela, falha nunca guardada). Atrasadas vencidas: 177 para 68 em minutos.

**O ritmo rápido respeita a cota.** Com o mercado "quente" o agente olha a cada 2 minutos, mas cada ciclo custa de 7 a 13 chamadas à OKX e o gateway recusa chamadas de fundo depois de 1,5 vez a média mensal por dia (4838 no plano gratuito). `hotWithinQuota` mantém o ritmo rápido só enquanto o uso do dia, na camada mais ocupada, está abaixo do consumo justo do dia (fração do dia UTC mais 15%); acima disso volta ao ritmo normal, e a cota dura até meia-noite. Eventos por empurrão (WebSocket) exigem plano pago: não contratado, e o despachante do Codex (`src/decision-review/events.ts`) fica sem integração até existir uma fonte que empurre.

**Primeiros ciclos reais com isso:** o Jev foi consultado com compras abertas; HOTBOT skip (0,77, 0,86, 0,96), STONK compra 0,59 a 0,60 (recusada pela barra de 0,2: 0,59 entre dois é uma moeda quase justa), W compra 0,51. Nenhuma ordem saiu, nenhum recibo, nenhum lucro afirmado.

**A pausa de compras vem do dinheiro, nunca do Placar (2026-10-14, noite).** A primeira versão do disjuntor (AUT-31) pausava as compras por 24 horas quando o efeito medido das ordens a 4 horas passava de -5% da carteira, ou quando a semana "não superava manter dólares". Esses números comparam uma decisão com uma alternativa que não aconteceu: uma venda seguida de alta aparece como perda, e uma compra que o agente já vendeu continua sendo precificada 4 horas depois da compra, então uma queda posterior à saída também aparece como perda que a carteira não teve. Num ciclo real isso pausou as compras (`disjuntor_de_perda`, efeito -7,00 sobre capital de 120) por causa de três decisões medidas. Agora `autonomy.ts` não lê o Placar: a única pausa financeira é a de `equityPause` (valor da carteira ao longo do tempo com as ordens e os fluxos ao redor). O Placar continua medindo e vai ao Jev como fato (o `historico` do Brief). As pausas que a versão antiga deixou (`disjuntor_de_perda`, `evidencia_perdida`) são reavaliadas pelo próprio agente (`lapsedPause`, `state.resume("pausa_reavaliada")`), com o evento gravado no estado; uma pausa por queda real de valor nunca é levantada por isso. Testes: `autonomy.test.ts` e cinco cenários de fio em `wire.test.ts`, incluindo a compra vendida antes da queda.

**Fatos de execução real no Brief (2026-10-14, noite).** O que o Jev lia do resultado do próprio trabalho era o Placar, que mede decisões contra alternativas que não aconteceram. Agora `fills.ts` lê, da transação final de cada ordem `executada` em Solana, o token que moveu e os dólares de stablecoin que foram para o outro lado (unidades mínimas exatas; sem stablecoin do outro lado o dólar é desconhecido, nunca zero), pareia compra e venda do mesmo token primeiro a entrar primeiro a sair, e entrega ao Brief (`execucoes`) um resumo em **percentual do que saiu**, nunca em dólares: `voltas`, `retorno`, as três últimas e `sem_entrada` (vendas de tokens que o agente nunca comprou, que não viram resultado). É fluxo de caixa antes da taxa de rede, não lucro, e o que ainda está na carteira não entra. Sobre o livro real: STONK, 16 minutos, -0,44% (-0,052724 USDC); sete vendas antigas sem entrada. A captura é uma leitura somente consulta por ordem (até duas por passada, uma tentativa a cada cinco minutos, janela de sete dias) e o arquivo é `fills.jsonl`, uma linha por ordem.

**O Brief lido por escopo, e a pergunta de compra por posto (2026-10-14, noite).** Uma revisão independente achou que a legenda do Brief definia as chaves curtas só para posições e que as compras reusavam as mesmas letras com outro significado: em 357 de 357 itens de compra gravados `v` era volume de 24 h em milhares (a legenda dizia percentual de carteiras que venderam) e em 294 `h` era detentores (a legenda dizia horas na posição). Agora `chaves` tem entradas por escopo (`posicoes.X`, `compras.X`) e as letras que divergem (`w p v m h t`) não têm mais significado global. A descrição de um tamanho de compra passa a seguir o posto entre os tamanhos oferecidos (`buyCriterion`): o único tamanho de uma carteira pequena é a menor compra que o código consegue executar e pede um caso bom, não "muito forte e nada pesa". O registro da consulta guarda `criteria: "rank-v1"` e `legend: "scoped-v1"` para comparar as respostas antes e depois; é uma comparação no tempo, não prova de que a mudança causou ou evitou compras, e a chance de uma Choice não é chance de lucro.
