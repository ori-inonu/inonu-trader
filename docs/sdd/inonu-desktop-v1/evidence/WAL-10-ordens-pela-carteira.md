# WAL-10: ordens de compra e troca pela carteira do usuário (2026-10-13)

Parte do [SPEC](../SPEC.md) (WAL-9, AC-WAL-4, AC-WAL-5), de [wallet.md](../wallet.md) seção 4 e de [ADR-5](../adr/ADR-5-carteira.md). Tarefas: T9.9 a T9.13 em [TASKS.md](../TASKS.md). Esta entrega **implementa** o que `wallet.md` deixava "especificado e desligado".

## Autorização e o que ela supersede

O usuário pediu, em duas mensagens do dia 2026-10-13, que o projeto compre e venda pela carteira dentro do próprio app, com um clique na decisão do Inonu, e que saque e qualquer transferência fiquem a critério da carteira. `wallet.md` exigia "autorização expressa do usuário em ciclo próprio" para implementar o envio: este ciclo é essa autorização. **Supersede** AC-WAL-4 ("não existe caminho de código para `eth_sendTransaction`") e AC-WAL-5 ("só o documento e a opção desligada") **somente** nos pontos abaixo; **não** supersede WAL-8: o app nunca guarda chave, nunca assina sozinho, o servidor nunca difunde nem assina, e continuam fora Agentic Wallet, `@okx-dex/okx-dex-sdk`, DEX Widget e x402.

Desvio **D4-36**: o único caminho de envio do app é `web/src/lib/wallet/send/send.ts`, e a única rota do núcleo que devolve algo que uma carteira assina é `src/onchain-read/routes/trade.ts`. A varredura `web/src/lib/no-send-scan.test.ts` nomeia os dois como as únicas exceções (`AUDITED`), prova que cada um de fato contém o que a exceção libera, que nenhum quebra outra regra, e que **só** `components/Desk/Dock/OrderPanel.tsx` importa `send.ts`.

## Requisitos (EARS) e como cada um é atendido

| ID | Requisito | Onde |
| --- | --- | --- |
| EXE-1 | Enquanto a opção "Permitir enviar pela minha carteira" estiver desligada, que é o padrão, o app não deve oferecer campo nem botão que abra a carteira. | `settings.ts` (`DEFAULT_TRADE_SETTINGS.enabled = false`), `OrderPanel` (estado desligado), `TradeSettings` |
| EXE-2 | Sem o teto de uma ordem e o teto por dia definidos pelo usuário, nenhuma ordem é enviada; ordem acima de qualquer um dos dois é barrada. O valor em dólares vem da **moeda em dólar da própria ordem** (vale um dólar): uma compra vale o que paga; uma troca de saída vale o **maior** entre o que deve receber e o preço que o provedor dá ao token; sem moeda em dólar, a ordem é barrada. As casas decimais da ordem são as do registro ou lidas do próprio token, e as do provedor precisam ser iguais. | `gate.ts` (`sem_teto`, `sem_teto_diario`, `acima_do_teto`, `acima_do_dia`, `valor_desconhecido`, `limitBlocks`), `order.ts` (`orderUsd`, `casas_decimais`), `log.ts` (`spentLast24hUsd`) |
| EXE-3 | Quando o usuário pede a revisão, o app busca a transação e a aprovação **na hora** (sem cache) pelo gateway local; cotação com mais de 30 s é barrada. | `routes/trade.ts` (`ttlMs: 0`), `trade-client.ts`, `gate.ts` (`QUOTE_MAX_AGE_MS`) |
| EXE-4 | A transação é conferida campo a campo com a ordem: rede, valor exato, token que sai e que entra, conta, destino que não seja a própria conta, o zero, nem um dos dois tokens, valor em moeda da rede, mínimo recebido coerente, tolerância igual à confirmada; a aprovação decodificada deve liberar **exatamente** o roteador informado, **exatamente** o valor da ordem, nunca "ilimitado". Honeypot (verdadeiro ou desconhecido), taxa do token acima do limite ou desconhecida, impacto acima do limite ou desconhecido: barrados. | `order.ts` (`verifySwap`, `verifyApproval`, `decodeApprove`), `gate.ts` |
| EXE-5 | O envio exige a confirmação digitada do símbolo do token negociado e o clique; o app pergunta à carteira quem ela é e em que rede está imediatamente antes de cada pedido. | `gate.ts` (`confirmationWord`), `send.ts` (`whereIsTheWallet`) |
| EXE-6 | O envio é feito só pelo navegador, com `eth_sendTransaction` do provider da extensão; aprovação e troca são dois pedidos, cada um com o seu clique; só a permissão (`Cleared`) que o `gate` emite é aceita pelo módulo de envio, e um pedido por carteira por vez. | `send.ts` (`sendCleared`, `isCleared`, `waiting`) |
| EXE-7 | Toda tentativa vai para o log local **antes** de a carteira ser consultada (estado "pendente", já contado no teto do dia), e depois recebe o hash, a recusa ou a falha; uma resposta perdida ou desconhecida deixa a tentativa aberta e contada. Se o log não puder ser gravado de forma durável, nada é enviado. O log e as configurações são relidos do armazenamento a cada leitura (valem entre abas) e o envio refaz a checagem de parada, opção e tetos com valores relidos, no último instante antes do pedido. | `log.ts`, `settings.ts`, `send.ts` (`sendCleared`, `awaitReceipt`) |
| EXE-8 | O botão "Parar tudo" bloqueia qualquer envio até o usuário religar em Configurações; vale também para outras abas, porque fica no armazenamento local. | `settings.ts` (`kill`), `OrderPanel`, `TradeSettings` |
| EXE-9 | Saque e transferência não existem no app: os únicos `to` possíveis são o roteador devolvido pela troca (conferido) e o contrato do token que sai (aprovação). | `send.ts`, `order.ts` |
| EXE-10 | Uma troca de saída entrega uma fração (um terço, metade, dois terços, tudo) do saldo que a carteira tem **agora**, lido do próprio token (`balanceOf`, `decimals`) e calculado em unidades inteiras, arredondado para baixo. | `sell.ts` |
| EXE-12 | Uma troca só vai para um **roteador que o usuário confirmou naquela rede**, e uma aprovação só é dada a um endereço que ele confirmou; um endereço novo barra a ordem com o motivo `roteador_novo` ou `gastador_novo`, o painel mostra o endereço, a função chamada e o endereço da aprovação, e cada um é confirmado **à parte**: o painel mostra o endereço inteiro, oferece o link dele no explorador da rede (onde o nome do contrato diz de quem ele é) e só liga o botão quando o usuário **cola o endereço inteiro**. Funções de mover ou liberar token (transfer, approve, permit, mint, burn e semelhantes) nunca são uma troca. Nada é fixo no código porque os endereços da OKX variam por rede e não foram verificados todos. | `order.ts` (`verifySwap`, `verifyApproval`, `FORBIDDEN_SELECTORS`), `settings.ts` (`trust`, `untrust`), `OrderPanel.tsx`, `TradeSettings.tsx` |
| EXE-11 | O que o Inonu calculou como tamanho de uma compra (RAS-8) só **sugere** o tamanho no painel quando a moeda de pagamento é uma moeda em dólar; a pessoa confirma ou muda. | `ticket.ts` (`sugestaoUsd`), `OrderPanel` |

## Revisão independente (2026-10-13)

Um agente distinto, só leitura, numa cópia isolada (hash dos arquivos conferido), tentou quebrar o caminho de envio. Achados e o que foi feito:

| Achado | Gravidade | Resolvido em |
| --- | --- | --- |
| A conferência não distinguia uma troca de uma transferência para um terceiro contrato com os números ao redor consistentes | bloqueio | EXE-12: roteador e gastador confirmados pelo usuário, funções proibidas, endereços e função mostrados no painel |
| Valor em dólar e casas decimais vinham do provedor (decimais 36 ou preço zero furavam o teto) | alta | EXE-2: valor pela moeda em dólar da ordem, decimais do registro ou do token, preço zero é desconhecido |
| Parar tudo, opção e teto do dia não valiam entre abas; uma tela velha podia religar o envio | alta | EXE-7 e EXE-8: releitura a cada leitura, `unkill` explícito, checagem refeita antes do pedido |
| Envios sem registro, ou fora do teto do dia (resposta perdida, janela respondida tarde, armazenamento cheio) | alta | EXE-7: registro antes, tentativa aberta contada, sem registro durável não envia |
| Permissão reutilizável e sem idade | média | uma permissão serve para um envio, por no máximo 60 s |
| Estado da ordem antiga escrevendo na nova depois de uma aprovação | média | guarda pela chave da ordem em `OrderPanel` |
| Quantidades recebidas formatadas com decimais do provedor | média | decimais lidos do token |
| Impacto e mínimo só autodeclarados | média | impacto implícito pelas contas da rota, incoerência barra; o mínimo continua ligado só à promessa do provedor (limite honesto: sem outro oráculo de preço não há como provar mais) |
| Furos na varredura (comentário dentro de string, grafias, só raízes listadas, importação dinâmica) | média | varredura que entende strings, mais grafias, o app inteiro conferido, o arquivo de envio com exatamente um método |
| Ordens pequenas, relógio e detalhes | baixa | ver testes |

### Segunda passada do mesmo revisor sobre as correções

A segunda leitura confirmou as correções e achou buracos novos. O que foi feito:

| Achado | Gravidade | Resolvido em |
| --- | --- | --- |
| "Moeda em dólar" era decidida pelo símbolo, que pode vir do provedor (um token que se chama USDC valeria US$ 0,5 numa saída) | alta | `Order.dollarSide` decidido pela **estrutura** da ordem (compra paga em dólar, saída recebe em dólar; a contraparte vem do registro da rede); o nome do token nunca vem do provedor (rascunho do Inonu ou fim do endereço) |
| Confiar no primeiro roteador era um clique que treina o reflexo, sem mostrar o endereço, e confiava roteador e aprovação juntos | alta (desenho) | o painel escreve o endereço, exige colar o endereço inteiro (a terceira passada mostrou que os 6 últimos caracteres não provam nada: o rótulo os imprimia e um endereço forjado pode repeti-los), e o roteador e o endereço da aprovação têm cada um o seu aviso, o seu campo, o seu link do explorador e o seu botão; o retorno de `trust()` é tratado (lista cheia, armazenamento que não grava) |
| "Parar tudo" se perdia quando o armazenamento não gravava mas lia | média | a parada fica presa na página quando não pôde ser gravada; só um `unkill` que pôde ser gravado a tira; `set`, `trust` e `untrust` dizem `false` quando não gravaram e **não** mudam nada |
| Falha de carteira desconhecida era tratada como "nada foi enviado" (lista negra) | média | lista **branca** dos tipos que provam que nada ficou aberto (não autorizado, método não suportado, desconectado, dados recusados, pedido de outra página à espera); o resto fica "pendente" e contado, e a pessoa fecha à mão no painel depois de olhar a carteira |
| A idade da cotação não era reconferida na hora de assinar | média | `Cleared.fetchedAtMs` e uma última conferência de 30 s logo antes de pedir à carteira, depois das leituras da carteira |
| `preco_incoerente` comparava impactos com sinal (perda negativa contra positiva travava toda ordem legítima com limite acima de 1%) | média | comparação por tamanho |
| Duas abas clicando juntas passavam ambas sob o teto | baixa | conferência dos tetos e gravação da tentativa num único passo sob `navigator.locks` |
| Varredura: expressão regular que parece comentário escondia código; só strings eram entendidas | baixa | a varredura lê o código com o **analisador do TypeScript**, junta `"a" + "b"`, não lê comentários nem comentários de documentação, confere o app inteiro e exige que os dois arquivos antigos que só citam o método não chamem `.request(` |

### Terceira passada, e a conferência com a resposta real

A terceira leitura confirmou N1 a N8 e achou o que segue; tudo foi tratado:

| Achado | Resolvido em |
| --- | --- |
| Se o registro de moedas tivesse uma moeda que não é dólar (WETH), ela valeria US$ 1 por unidade e furaria o teto | teste que falha se **qualquer** moeda do registro de qualquer rede não for dólar (hoje todas são USDC, USDT e variantes); antes de acrescentar outra, é preciso um marcador no registro |
| Os 6 últimos caracteres não verificavam nada | cola-se o endereço inteiro, com link para o explorador da rede (Ethereum, Optimism, BNB, Polygon, Base, Arbitrum, X Layer) |
| Fechar uma tentativa aberta era um clique sem atrito, e a lista mostrava só as 5 últimas | dois passos, só depois de 30 s, e toda tentativa aberta aparece, por mais antiga que seja |
| "Desconectado" e "rede desconectada" estavam na lista de falhas que provam que nada foi enviado | retirados: uma carteira cujo serviço morreu depois de a pessoa assinar lê igual |
| `settle` e `resolve` do registro escreviam fora da trava entre abas | dentro da mesma trava |
| Varredura: escapes dentro de strings (`"eth_\u0073end"`), templates com string, e a guarda de `.request(` que nunca casava por causa dos espaços | strings lidas pelo valor, tokens vizinhos juntados, regex da guarda aceita espaços |
| Mensagem de salvamento dizia "valor inválido" quando a causa era o armazenamento; um erro dentro do envio deixava o painel em "enviando" | mensagem com as duas causas; `try/catch` que devolve o painel e diz que a tentativa, se foi gravada, segue aberta |

**Conferência com a resposta real, depois de todas as mudanças** (2026-10-14, 2 chamadas Basic, sem assinar, endereço fictício, US$ 5 de USDC para WETH na Base): a resposta real passa no leitor; sem confiança prévia a conferência diz `roteador_novo`; com o roteador `0x67d0...81df` e o endereço de aprovação `0x57df...114e` confirmados, `verifySwap` e `verifyApproval` não acham problema, a aprovação decodifica para exatamente 5000000, o valor é US$ 5, e a trava libera **os dois passos**. O impacto vem do provedor **com sinal negativo** (-0,04) e as contas da própria rota dão +0,042: a comparação por tamanho é a certa.

**Limites que continuam, ditos como são:**
- O calldata do roteador continua opaco: com o roteador confirmado, o destinatário final e o mínimo da troca não são lidos de dentro dele. A defesa é o roteador confirmado por você, a janela da carteira (que mostra a transação) e o teto em dólares. A perda possível numa **compra** é no máximo o valor pago (o teto da ordem).
- O valor em dólar de uma **saída** depende do preço e da quantidade que o provedor informa (uma mentira consistente nos dois passaria): o painel mostra o preço por token da ordem para você comparar com o gráfico, e o mínimo recebido é imposto pelo próprio roteador na rede.
- "Parar tudo" bloqueia o próximo pedido; não fecha uma janela da carteira que já está aberta.
- Chamadas montadas só em tempo de execução (nome de método vindo de variável) não são vistas por varredura de texto; ficam o único importador, a trava e a janela da carteira.

## Fora desta entrega, e por quê

- **Solana (rede 501) não envia.** A documentação da extensão OKX para Solana (`signAndSendTransaction`) pede um objeto `Transaction` de `@solana/web3.js`, pacote que não está no projeto e que a varredura proíbe; a documentação não diz se aceita `VersionedTransaction` nem como o `tx.data` da troca da OKX é codificado. Sem isso verificado com a carteira real, o envio Solana ficaria sem prova. O cartão diz "o app ainda nao tem uma moeda de pagamento conhecida para esta rede" e a compra na Solana continua na própria OKX Wallet. Decisão do usuário pendente: instalar `@solana/web3.js` e fazer uma ordem mínima supervisionada.
- Saque, transferência, pontes entre redes, aprovação "ilimitada", MEV protection, difusão pelo servidor, Intent Swap.
- A troca de saída da **moeda da rede** (ETH, BNB): a moeda da rede paga a taxa da ordem.

## Evidência

- Leitura real, sem assinar nada (2026-10-13, 2 chamadas Basic): `GET /onchain/swap` (USDC para WETH na Base, 1 USDC, endereço fictício) e `GET /onchain/approve`. A resposta real foi lida pelo `parseSwapAnswer`, passou em `verifySwap` sem problema e no `evaluateGate`; a aprovação real decodifica para o gastador e o valor pedidos. O formato da documentação bate com o real.
- Testes (todos com carteira falsa rotulada `synthetic_fixture`, nenhuma carteira real tocada): `src/onchain-read/routes/trade.test.ts` (13), `web/src/lib/wallet/send/*.test.ts*` (rotas, travas, envio, recibo, leitor, log, configurações, venda, painel e Configurações desenhados), varreduras de envio e de animação.
- Não feito: nenhuma ordem real, nenhum clique que envie, nenhuma conexão da carteira real pelo agente. A primeira ordem real é do usuário, com teto pequeno (ver abaixo).

## Aceitação independente (a conferir pelo revisor)

1. Com a opção desligada ou parada, nenhum controle abre a carteira (teste de render) e `sendCleared` recusa tudo que não veio do `gate`.
2. Cada razão de bloqueio do `gate` tem um caso que a produz, e só o caso sem nenhuma razão devolve permissão.
3. Nenhum arquivo além de `send.ts` contém um método que envia ou assina, só `OrderPanel.tsx` o importa, e `send.ts` nomeia exatamente `eth_sendTransaction`.
4. Uma aprovação que libere outro gastador, outro valor, ou "ilimitado", é recusada; o gastador também precisa estar confirmado pelo usuário.
5. Um destino que seja a própria conta, o zero, um dos tokens ou um contrato não confirmado é recusado, e uma função de mover ou liberar token nunca passa.
6. Uma tentativa entra no log antes de a carteira ser consultada; sem log durável nada é enviado; um envio que o usuário parou em outra aba não sai.

## Primeira ordem real, passo a passo (do usuário)

1. Configurações, "Enviar pela minha carteira": defina o teto de uma ordem em US$ 5 e o do dia em US$ 10, marque a opção e salve.
2. Conecte a OKX Wallet numa rede EVM (por exemplo Base) com um pouco de USDC e de moeda da rede para a taxa.
3. Em "Melhores" (Radar ou aba Inonu), "Preparar compra" em um token EVM; na aba Carteira, "Revisar ordem" e confira a tabela. **Na primeira ordem de cada rede** o painel para em "roteador novo": compare o endereço do roteador (e o da aprovação, se houver) com o que a OKX publica na documentação da Trade API e só então clique em "Confiar neste roteador nesta rede". Digite o símbolo; "Enviar pela minha carteira" abre a janela da carteira.
4. Se algo não bater com a tabela, recuse na carteira. "Parar tudo" bloqueia na hora.
