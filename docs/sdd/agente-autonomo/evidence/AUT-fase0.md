# Evidência do agente autônomo

Data: 2026-10-14. Distingue: **configuração válida**, **carga em sessão nova**, **funcionando ao vivo** e **ganho medido**, como pede o protocolo. Nada aqui afirma retorno financeiro.

## O que está verificado, e como

| Nível | Afirmação | Evidência |
| --- | --- | --- |
| Configuração válida | O código do agente compila e passa nos testes | `bunx tsc --noEmit -p tsconfig.verification.json`: sem erro. `bun --no-env-file test src/agent src/desktop`: **745 passam, 0 falham**, em 42 arquivos (2026-10-14, 11:10). Inclui os módulos puros `equity.ts`, `conviction.ts` e `api-cost.ts` escritos por outra sessão e ainda **não ligados** ao ciclo (ver o adendo) |
| Configuração válida | A tela e o cliente | `bun --no-env-file test --parallel=1 ./src/lib/agent` em `web`: **55 passam** (cliente, parser, textos, tela desenhada em todos os estados: sem campo, sem modo, com aviso, passos da carteira do agente, ordens sem confirmação). `bunx tsc --noEmit` em `web`: nenhum erro de código; três avisos vêm do cache gerado `.next/types/validator.ts`, que ainda aponta para as rotas removidas (`console`, `doctor`, `rastreador`) e se regenera no próximo `next dev`/`next build` |
| Configuração válida | O núcleo serve o agente | `src/desktop/agent-route.test.ts` pelo núcleo real: status, defesas de origem, conexão e desconexão, carteira, rotas antigas (modo, consentimento, parada com frase) inexistentes |
| Configuração válida | O serviço inteiro | `wire.test.ts` e `review2.test.ts` em pasta temporária: ciclo da análise do começo ao fim, reinício, desconexão, modo derivado, queda para a sombra quando o lado do dinheiro falha, binário que não confere nunca roda, relógio cru fora de hora, pasta com dono vivo |
| Configuração válida | Regras do projeto | `animation-scan`, `typography-scan`, `no-send-scan`, `client-env-scan`, `naming-scan`, `purity-bundle` e o registro de painéis passam com as rotas novas (`/` e `/configuracoes`) |
| Carga em sessão nova | O núcleo de desenvolvimento (porta 3000, `--watch`) carregou o modelo novo | `GET /agent/status` (só leitura): `connected: true` por clique do próprio usuário, programa da OKX instalado com hash conferido, entrada pendente (`login: "aguardando"`), modo derivado `sombra`, carteira gerida ainda `propria` sem endereços |
| Funcionando ao vivo | A tela lê o núcleo real e as rotas antigas saíram | no navegador do app, `http://localhost:3001/` mostra a página única do agente; `/mesa`, `/rastreador`, `/console`, `/doctor` e `/agente` deixaram de existir |
| Funcionando ao vivo | O app instala o programa da OKX e inicia a entrada | feito **pelo app** no clique do usuário: 17.208.200 bytes, SHA256 igual ao da lista publicada no mesmo release (v4.6.4), gravado em `<dados>/agent/cli/`; `login init` devolveu o link da OKX |
| Ganho medido | **Nenhum.** O Placar está vazio; a tela diz que ainda não há evidência medida de ganho | tela e `evidenceText` |

## Fatos do programa real da OKX (lidos por mim em modo seguro)

Executei só `--help` e duas cotações de leitura **sem entrada** em ambiente isolado (pasta de dados e HOME vazios), com o programa que o app instalou e conferiu. Nenhum comando de escrita, nenhuma troca.

| Achado | O que mudou no código |
| --- | --- |
| A cotação sem entrada recusa com `{"ok":false,"error":"Invalid Authority ... run wallet login"}` | `NOT_SIGNED_IN` é falha limpa (nada foi assinado); o texto do programa nunca vira motivo |
| `--readable-amount` faz o programa buscar os decimais do token na OKX, uma chamada com cota própria que falhou ("Failed to fetch token decimals ... confirming") | as compras vão em unidades brutas (`--amount`), com os decimais lidos pelo app (`swap-args.ts`) |
| A rede vai pelo nome (`ethereum`, `bsc`, `base`...) e não pelo id | `CHAIN_NAME` em `swap-args.ts` |
| Existe `--force`; o pedido de confirmação (saída 2 ou `confirming`) aparece quando a cota estoura e a OKX quer cobrar (x402) | `--force` nunca é montado; `confirming` é recusa |
| `wallet login --phase init` e `--phase poll` existem; o link é da OKX | `startLogin`/`pollLogin` aceitam só link do domínio da OKX; a guarda de lista branca deixa passar só essas duas fases do login |

## Validação contra dados reais (somente leitura, 2026-10-14)

Com as chaves da OKX do usuário, **sem gastar nada além de poucas leituras** e com um endereço público famoso (nenhum dado do usuário), o código foi exercido contra respostas reais:

| O que | Resultado |
| --- | --- |
| `rawBalance` e decimais | 4.599 tokens reais: **todos** com saldo exato em unidades mínimas e decimais inferidos e conferidos |
| **Falha encontrada:** valor alegado | tokens de airdrop avaliados em dezenas de milhões; a carteira "valia" US$ 240 mi. Sem correção, o agente dimensionaria sobre um número falso |
| **Falha encontrada:** caixa falso | o teste de dólar era por símbolo e preço; um token qualquer chamado USDC a US$ 1,00 contava como caixa |
| Correção | caixa só por **contrato conhecido** por rede (`DOLLAR_CONTRACTS`); valor só conta se o pool cobrir o valor (`verifyBook`). US$ 240 mi alegados viram **US$ 270 mil** |
| Guarda de entrada em velas horárias reais | WETH, LINK e PEPE na Ethereum: 48 barras, RSI, faixa e volatilidade coerentes; WETH e LINK passaram a receber o perfil de alvo de 2% |
| Gás | Ethereum principal consumiria uma compra pequena; mínimo de US$ 250 por compra nessa rede |
| Contexto do mercado | BTC e ETH em 24 h, tendência, volatilidade, funding e posição aberta do BTC lidos de endpoints públicos |

## O que NÃO está verificado

- **Nenhuma ordem real**, nenhuma saída de `wallet status` ou `wallet addresses` depois da entrada, nenhuma política lida de verdade, nenhum preenchimento de `swap execute` visto. A entrada na conta OKX é um ato do usuário, ainda pendente.
- **O modelo real** foi chamado cinco vezes ao longo do projeto (uma por engano meu, registrada); nenhum ciclo do agente rodou com ele no núcleo real depois do modelo novo.
- A **leitura real das carteiras** do usuário: o endereço ainda não existe (a carteira do agente só nasce depois da entrada).
- Os limiares do guarda de entrada, dos perfis, do piloto automático e do disjuntor são **escolhas conservadoras, não calibradas**. Quem diz se valem é o Placar.
- Alavancagem: a documentação da OKX não a oferece na carteira do agente (SPEC, seção 8); só o contexto do mercado chega ao modelo.

## Falhas que existem e não são deste trabalho

- Suíte raiz do projeto (`bun --no-env-file test --parallel=1 --timeout 15000 ./src ./scripts`, medida antes das últimas mudanças): **5902 passavam e 13 falhavam, nenhuma no agente**: `src/inonu/ask-ecosystem.test.ts` (3, teste desatualizado de outra sessão), `src/outcomes/*` (8, pasta de outra sessão), `src/onchain-read/routes/wallet-gateway.test.ts` (1), `scripts/okx-defi.test.ts` (1, só na corrida inteira). A suíte completa é repetida no fim do trabalho.
- `web/src/lib/wallet/holdings-*`: arquivos de carteira editados por outra sessão. Nenhum arquivo do agente os importa.

## Revisões independentes

Cada revisão foi feita por agente distinto do implementador, em cópia isolada, somente leitura.

### 1ª revisão (cópia `review-agent-r1`)

| Sev. | Achado | Correção | Teste que a fixa |
| --- | --- | --- | --- |
| Crítica | Uma ordem que falhava parava as outras do ciclo, inclusive o stop de outra posição | Falha limpa segue para a próxima; só a incerta para o resto | `cycle.test.ts`: "a failed order does not stop the others", "a failed protective exit does not keep the exit of another token" |
| Crítica | Uma ordem em voo congelava o agente inteiro, até os stops | O bloqueio vale só para as ordens do modelo e só para aquele token | `cycle.test.ts`: "an order in flight does not freeze the stop-loss of ANOTHER token"; `ledger.test.ts` |
| Crítica | A compra abria o plano depois da troca: se o plano não gravava, havia posição sem stop | Plano gravado antes da troca, com preço fresco; se não grava, a compra não sai | `cycle.test.ts`: "a plan that cannot be saved means the purchase is NOT sent" e dois outros |
| Alta | Uma saída executada encerrava o plano pelo hash; venda revertida deixava a posição sem stop | O plano só some quando a carteira mostra a posição fora dela por mais de 1 hora | `cycle.test.ts`: "the plan stays until the wallet shows the position gone" |
| Alta | A saída pelo plano esperava a resposta do modelo e dependia de preço para o prazo | Fase protetora antes de consultar o modelo; saída por tempo não precisa de preço | `cycle.test.ts`, `plans.test.ts` |
| Alta | Duas janelas do app na mesma pasta podiam mandar a mesma ordem | `LOCK` com pid do dono; trava que não grava é trava nenhuma | `lock.test.ts` (7) |
| Alta | O relógio conferido era o corrigido do app, mas o programa assina com o cru | O portão usa a diferença crua da máquina contra a OKX | `gate.test.ts`; `wire.test.ts` |
| Alta | Honeypot ausente ou escrito de outro jeito passava; recusa depois do envio virava falha | Segurança precisa ser afirmada; recusa sem prova é incerta | `cli.test.ts` |
| Média | Histórico de velas velho ou fora de ordem virava fato do presente | Sem fatos se a última barra é velha ou há barras repetidas ou fora de ordem | `timing.test.ts` |
| Média | Símbolo de token entrava no livro cru; venda montada sem decimais conferidos | `cleanSymbol`; venda só com decimais conferidos | `book.test.ts`; `exit.test.ts` |
| Média | Um valor NaN passava por todos os tetos | `valor_invalido` e `gasto_desconhecido` | `gate.test.ts` |
| Média | O Placar contava repetições da mesma aposta como amostras e misturava modos | Apostas independentes por janela, saídas do plano à parte, veredito de modos misturados retido | `scoreboard.test.ts` |

### 2ª revisão (cópia `review-agent-r2`), das correções e do modelo de autoridade novo

| Sev. | Achado | Correção | Teste que a fixa |
| --- | --- | --- | --- |
| Alta | O impacto de preço escrito como texto ou com sinal passava como pequeno | impacto lido como número absoluto, texto e número | `review2.test.ts`: "a big impact is a big impact whether it is written as a number or as a string, signed or not" |
| Alta | Uma parada que chegou antes do processo existir não impedia o início | sinal já abortado nunca inicia nada | `review2.test.ts`: "the process runner given an aborted signal never starts anything" |
| Alta | O mesmo token escrito com maiúsculas diferentes era comprado e vendido no mesmo ciclo | chave de token normalizada | `review2.test.ts`: "buying and selling an EVM token written in two cases ..." |
| Alta | Validade de sessão ou limite da política NaN passava no portão | NaN recusa o modo de dinheiro | `review2.test.ts`: "a session expiry or a policy limit that is NaN refuses the money mode" |
| Média | Barras com dias de distância valiam como série horária | série horária exige passo de uma hora | `review2.test.ts`: "bars days apart are not an hourly series" |
| Média | Símbolo de token do ecossistema recusava o lote inteiro no registro | símbolo limpo e curto | `review2.test.ts` |
| Média | O Placar afirmava ganho com 30 vitórias ao lado de 100 decisões sem medida; afirmação sobre dinheiro real sem custo | decisões sem medida contam como desconhecidas; dinheiro real exige custo | `review2.test.ts`: "30 winners next to 100 decisions ...", "a claim over decisions that moved real money needs the cost of each" |
| Média | Uma liquidação do Placar que não respondia travava os próximos ciclos | etapa abandonada depois do prazo, próximo ciclo armado | `review2.test.ts`: "a step that hangs does not stop the cycles" |
| Média | Uma janela que não detém a pasta podia mudar o que o dono usa | só deixa o arquivo STOP ao desconectar | `review2.test.ts`: "a window that does not hold the folder" |
| Média | A metade tomada no alvo não era marcada: o próximo ciclo tomava outra | marcada no plano | `review2.test.ts`: "the half taken at the target ..." |

### 3ª revisão (cópia `review-agent-r3`): **em curso**

Escopo: modelo de autoridade (conectar é a única autorização), caminho do dinheiro, piloto automático e mandato, disciplina, fluxo de conexão da carteira, regressões das correções anteriores e a página. Os achados e as correções entram nesta tabela quando o relatório chegar.

## Entrada de outra sessão: o adendo e os módulos puros

`ADENDO-A-zero-configuracao.md` (escrito por outra sessão, a pedido do dono) traz requisitos novos (ZC-1 a ZC-10) e três módulos puros testados (`equity.ts`, `conviction.ts`, `api-cost.ts`). Trato como **fonte, não autorização**. Estado:

| Item | Estado |
| --- | --- |
| ZC-1 sem campo nem rota de configuração | atendido pela página e pelas rotas (AC-AUT-14, AC-AUT-15); a API ainda aceita `auto: false` para quem a usa de propósito |
| ZC-8 aviso completo e versionado | o aviso atual cobre a entrega de todas as decisões; faltam no texto o custo de execução e do modelo e o que é enviado ao modelo |
| ZC-10 comprar só na medida da convicção | módulo pronto e **não ligado**; candidato à integração |
| ZC-5 a ZC-7 índice neutro a fluxos e disjuntor por patrimônio | módulo pronto e **não ligado** |
| ZC-2 sem teto de consultas por contagem | **não adotado**: o teto de consultas continua como proteção de custo até o usuário decidir; é a decisão aberta nº 1 |
| ZC-9 sem alavancagem | compatível com o estado atual (alavancagem só como contexto, SPEC seção 8) |
| Achado "ordem em voo suspende a saída protetora do mesmo token" | aberto (A1.5): sem reconciliação por `wallet history` não há como saber o saldo real |

## O que o usuário faz para a próxima fase

1. **Entrar na conta OKX** na página que o app abre (o link já foi preparado quando conectou). Sem isso a carteira do agente não existe e o agente segue em análise.
2. **Depositar** na carteira do agente o que aceita arriscar.
3. **Definir a política** (limite por transação e por dia) no portal da OKX; sem ela o agente não opera dinheiro de verdade, por trava da própria OKX e do app.

Nada mais é do usuário: o agente lê a carteira, decide, mede e opera sozinho.

### 4ª revisão (cópia `review-agent-r4`): achados e correções

Escopo: dinheiro real, vigilância, conciliação, disjuntores, Placar. Cada correção tem teste escrito antes; os testes de F2 e F1 foram vistos falhando sem a correção.

| Sev. | Achado | Correção | Prova |
| --- | --- | --- | --- |
| Alta | Depois de reiniciar, a vigilância não vendia até o primeiro ciclo (o executor não tinha livro) | `onGuardBook`; `guardNow()` | `wire.test.ts`: "right after a start the guard can sell" |
| Alta | Ordem em voo suspendia o stop do próprio token para sempre | **decisão revista**: um reenvio depois de 3 minutos foi feito e desfeito (falta de recibo não prova que a anterior terminou; segundo swap é outra intenção financeira; a página promete não repetir). Ficou: recibos procurados na vigilância a cada passada, hash guardado no tempo esgotado, e o token segurado até um recibo ou a palavra da pessoa. Risco que sobra: um stop parado sem hash nenhum até a pessoa responder | `cycle.test.ts` (3 testes), `wire.test.ts`: "the watch between the cycles looks the history up too", `cli.test.ts` |
| Alta | Disjuntor de patrimônio cego com token sem valor comprovado ou sinalizado | preço zero e carga da leitura anterior | `equity-log.test.ts` (rug, sinalizado, airdrop) |
| Alta | Compra até 3 minutos antes de a sessão acabar, com plano de até 10 dias | compra só se a sessão cobre o prazo do plano | `cli.test.ts`: "a purchase is made only if the session outlives..." |
| Média | Liquidação do Placar faminta por marcas de "não agir" e por consultas que falham | ordens primeiro, teto, pausa, uma marca por hora | `scoreboard.test.ts` (3 testes) |
| Média | Afirmação do Placar suspensa por qualquer janela aberta; trava de evidência lia só a sombra quando havia sombra | só janela encerrada sem preço suspende; qualquer modo abre a trava | `scoreboard.test.ts` (2 testes) |
| Média | `close()` do desktop sem tratamento da rejeição | `.catch` | `handlers.test.ts` |
| Baixa-média | O modelo podia vender a moeda nativa inteira | reserva de 5 dólares | `exit.test.ts` (5 testes) |
| Baixa | Stop de 1,5 por cento mais estreito que o custo de entrada | custo de entrada de um terço do stop | `swap-args.test.ts`, `cli.test.ts` |
| Baixa | STOP colocado pela pessoa sobrescrito ao desconectar de uma janela sem a pasta | só escreve se não existe | `review2.test.ts` |
| Baixa | Também corrigidos: convicção convertia postura inválida em compra (F7); liquidação por recibo perdia motivo e hash (F6); `limitedFacts` guardava leitura incompleta por 1 minuto (F11); a metade no alvo era marcada depois da marca lenta do Placar (F14) | | `conviction.test.ts`, `wire.test.ts`, `cycle.test.ts` |
| Baixa | `ledger.mayStart` nunca chamado | documentado: o id único do ciclo é a chave | comentário em `ledger.ts` |

Suites ao fim: `src/agent`, `src/desktop` e `src/server` com 908 passando e 0 falhas; typecheck da raiz e do web limpos (fora três erros antigos de `.next/types`); testes do web do agente 64 passando.

**Não provado:** nada disso foi exercido com dinheiro; a política dos limites do portal continua desligada e o app a exige por padrão.

**Achado da leitura das cotações reais (mesma noite):** `swap quote` responde `data` como array de um registro; o executor lia um registro e recusaria toda ordem real (`quote_ilegivel`). Corrigido com teste da forma real. Relatório de todos os ativos da conta Solana em `solana-mints-20261014.md`.

**Transmitir não é executar (achado do Codex, seção 28):** `swap execute` imprime o hash no broadcast, sem recibo do swap. O executor passou a devolver `transmitida`; a ordem fica em voo até o recibo. Prova: `cli.test.ts` (forma real da saída com `approveTxHash`, `nextSteps`), `cycle.test.ts` (2 testes), `wire.test.ts` (a ordem sai `incerta/transmitida` e a vigilância a liquida como `executada/recibo_sucesso`), `agent.test.ts` do web. O probe do Codex passa.

**A1.10 e A1.12 (prioridade da seção 30):** saída em partes e tempo de sessão na página, com testes (`gate.test.ts`, `exit.test.ts`, `cycle.test.ts` com o teste visto falhando sem o corte, `wire.test.ts`, `agent.test.ts` do web). Nunca exercido com dinheiro. Os textos de política corrigidos.

**Dispensa dos limites e autoridade (a pedido do dono, por voz):** `ownerPolicy` gravado na configuração, `authority` no estado e na página, metade do alvo em valor fixo (probe do Codex da seção 32 passa), releitura da carteira. Testes em `wire.test.ts`, `config.test.ts`, `cycle.test.ts`, `exit.test.ts`, `live.test.ts` e `agent.test.ts` do web. Ao aplicar a escolha, a política da conta já estava ligada no portal com limites altos (transação única 1000, diário de troca 100000000, diário de transferência 1000 dólares), acima do que o app aceitava no modo exigido (`politica_frouxa`): a dispensa vale por isso.

**Aprender com o que mediu (a pedido do dono):** análise da história do agente (34 ciclos, postura defensiva em todos, 170 compras recusadas sem medição, 38 por cento dos candidatos em redes sem caixa) e as correções acima, com testes (`scoreboard`, `cycle`, `wire`, `live`, `cli`, web). **Primeira ordem real que a ferramenta recusou** (venda de metade de Chonk, 15h24 locais): o `swap execute` respondeu `ok: false` em 2 s sem hash; a carteira e o histórico da OKX mostram que **nada saiu**, e o agente a classificou como `incerta`/`recusa_sem_prova` (certo, por regra). O texto da recusa não foi guardado nessa vez; agora é.
