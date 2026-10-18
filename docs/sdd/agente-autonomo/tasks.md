# Tarefas do agente autônomo

Cada tarefa é pequena, com teste que falha primeiro e arquivos próprios. Depende de [SPEC](SPEC.md) e [design](design.md). Estado em 2026-10-14: **o agente é o produto e a única autorização é conectar a carteira** (D-A7). Código, testes e a página única estão prontos; duas revisões independentes feitas e corrigidas, a terceira em curso (ver [evidência](evidence/AUT-fase0.md)). Nenhuma ordem real foi enviada, o modelo real foi chamado só pelo teste do usuário e o programa da OKX foi instalado pelo app, no clique de conectar, e exercido em leitura.

## Fase 0: o agente, sem dinheiro de verdade

| ID | Req | Resultado | Arquivos | Estado |
| --- | --- | --- | --- | --- |
| A0.1 | AUT-1, AUT-10 | Estado v3: conectado ou não, aviso lido, pausa; modo derivado, nunca guardado; arquivos antigos carregam como não conectado | `src/agent/state.ts` | feito, 16 testes |
| A0.2 | AUT-2, AUT-4 | Candidatos: compras do ecossistema com tamanho, saídas por fração exata (`BigInt`), manter; só da carteira gerida | `candidates.ts`, `exit.ts`, `book.ts` | feito |
| A0.3 | AUT-2, AUT-28, AUT-32 | Perguntas fechadas (postura, mandato, ação, perfil), Brief com alavancagem do mercado, validação da resposta | `decision.ts`, `model.ts` | feito (modelo falso) |
| A0.4 | AUT-3 | Orçamento por dia, contado antes da chamada | `budget.ts` | feito |
| A0.5 | AUT-4, AUT-13 | Portão que falha fechado e tetos | `gate.ts` | feito |
| A0.6 | AUT-9 | Registro durável: antes de agir, ordem em voo, reinício não repete | `ledger.ts` | feito |
| A0.7 | AUT-11 | Placar: janelas, apostas independentes, saídas do plano à parte, modos não se misturam | `scoreboard.ts` | feito |
| A0.8 | AUT-2, AUT-9, AUT-25 | Ciclo: saída do plano antes do modelo, plano antes da troca, falha não para as outras, queda para a sombra se o lado do dinheiro falha | `cycle.ts`, `scheduler.ts`, `lock.ts` | feito |
| A0.9 | AUT-12, AUT-30 | Duas páginas (Agente e Configurações), o aviso, o fluxo da carteira do agente; mesa, rastreador, console e diagnóstico fora do ar | `web/src/components/Agent/*`, `web/src/lib/agent/*`, `Settings/*` | feito, 55 testes da tela |
| A0.10 | todos | 1ª revisão independente | evidência | feita e corrigida |
| A0.15 | todos | 2ª revisão, das correções da 1ª e do novo modelo | cópia isolada | feita e corrigida (`review2.test.ts`) |
| A0.16 | todos | 3ª revisão: modelo de autoridade, caminho do dinheiro, piloto, disciplina, fluxo da carteira, regressões | `scratchpad/review-agent-r3` | **em curso** |
| A0.11 | AUT-17, AUT-26 | Guarda de entrada: não comprar na alta, só com histórico fresco | `timing.ts` | feito |
| A0.12 | AUT-18 a AUT-20 | Perfis, plano por posição, saídas pelo código, plano órfão só depois de 1 hora de ausência | `plans.ts`, `protection.ts` | feito |
| A0.13 | AUT-21, AUT-22, AUT-32 | Leitores reais com cache; contexto do mercado, System One, funding e posição aberta | `live.ts` | feito (fakes e leituras públicas) |
| A0.14 | AUT-7, AUT-8, AUT-14, AUT-33 | Lista branca, hash do binário, argumentos reais (unidades brutas, rede por nome), recusas pelo texto real | `cli.ts`, `swap-args.ts` | feito |
| A0.17 | AUT-27 | Piloto automático: tetos, risco, reserva, ritmo e redes derivados; nenhum campo para digitar | `autopilot.ts` | feito, 17 testes |
| A0.18 | AUT-28 | Mandato escolhido pelo Jev, um degrau por ciclo, agressivo só com vantagem medida | `mandate.ts` | feito |
| A0.19 | AUT-29 | Conectar a carteira do agente: instalar o programa da OKX (hash conferido), iniciar a entrada, ler os endereços | `agent-wallet.ts`, `wire.ts` | feito, 15 testes; **exercido de verdade** (instalação e início da entrada, pelo clique do usuário) |
| A0.20 | AUT-31 | Disjuntor: perda do dia ou medição da semana pausa só as compras novas por 24 h | `autonomy.ts` | feito |

## Fase 1: atos do usuário e o que só se vê com a carteira do agente pronta

Os atos do usuário são só quatro: conectar a carteira (feito, pelo próprio clique), entrar na conta na página da OKX, transferir ativos de outra carteira (só se houver; a carteira da conta OKX do usuário é a mesma que o agente gere) e definir a política no portal (exigida por padrão). O resto é do app.

| ID | Req | Resultado | Depende de | Estado |
| --- | --- | --- | --- | --- |
| A1.1 | AUT-14 | Ler o instalador e decidir o que instalar | nada | feito ([instalador.md](instalador.md)); o app instala só o programa, conferido por SHA256 |
| A1.2 | AUT-7 | Adaptador do programa da OKX | A0.14 | feito e testado com programa falso; **instalado de verdade** (17.208.200 bytes, hash igual ao publicado) |
| A1.3 | AUT-5, AUT-6 | Leitura da sessão, dos endereços e da política depois da entrada | entrada do usuário | escrito; **falta ver a saída real** de `wallet status` e `wallet addresses` |
| A1.4 | AUT-8 | Cota e conferência antes de cada troca | entrada do usuário | escrito; a cotação sem entrada recusa com "Invalid Authority", tratado como falha limpa |
| A1.5 | AUT-9 | Reconciliação **automática** por recibo de `wallet history` (`txHash`, `orderId`) das ordens em voo | primeiro recibo real | **feita e testada com fixtures**: `receipt.ts`, `reconcile.ts`, `createReceiptLookup`; falta ver o formato real da resposta; sem referência e sem entrada única a ordem continua em voo e a pessoa resolve na tela |
| A1.6 | AUT-6 | **Medir** onde a política é aplicada e a disponibilidade no Brasil | entrada e valor mínimo | aberta |
| A1.7 | AUT-7 | Primeira ordem real, o menor valor | A1.3 a A1.6 e depósito | aberta |
| A1.8 | AUT-20 | **Proteção no servidor**: `strategy create-limit` de Stop Loss e Take Profit no TEE, para o plano sobreviver ao app fechado; medir antes se executa com o app offline | A1.7 | aberta |
| A1.9 | AUT-9 | Preço de preenchimento de `swap execute` (formato de sucesso real) para o plano abrir com o preço real | A1.7 | aberta; hoje usa o preço da decisão. A forma real da **cotação** já foi vista (array de um registro, corrigido); a de `swap execute` está no código-fonte da ferramenta (`swapTxHash`, `fromAmount`, `toAmount`, `priceImpact`, `gasUsed`, `nextSteps`) e só se vê com a primeira ordem real. O preço de preenchimento sairá de `fromAmount` e `toAmount` **depois do recibo**; `routerResult` e `estimateGasFee` da cotação são estimativas e nunca são preço de preenchimento nem custo efetivo |
| A1.10 | AUT-33, AUT-48 | Dividir saídas grandes quando a política tem limite por transação | A1.3 | **feita (teste)**: parte de 95 por cento do limite, esperando o recibo entre partes; nunca exercida com dinheiro |
| A1.11 | AUT-27 | **Rendimento do caixa parado** por `defi` (buscar, investir, resgatar) | A1.7 e medição | aberta; hoje o caixa fica em dólar |
| A1.12 | AUT-44 | Mostrar na pagina o tempo que resta da sessao (hoje so aparece o aviso quando esta acabando) | A1.3 | aberta |

## Fase 2: depois de medição

| ID | Resultado | Condição |
| --- | --- | --- |
| A2.1 | Subir capital e tetos (HARD_CAPS 100, 500, 2000 são tetos do app, não metas) | retorno líquido medido acima de manter em dólar, por período |
| A2.2 | Auditoria cruzada (`audit.jsonl` do programa com o registro por `orderId` e `txHash`) e alertas | A1.5 |
| A2.3 | **Resultado de cada plano** no Placar: alvo, stop ou prazo, o que tocou primeiro nas velas depois da entrada | independe do programa da OKX |
| A2.4 | Histórico medido por família de evidência no Brief | amostra por família |
| A2.5 | Rotação e compactação do registro e do Placar (os arquivos só crescem hoje) | fazer antes de semanas de uso |
| A2.6 | Reduzir o ritmo de consulta do modelo quando o Brief não muda e o mercado está calmo, medindo o custo por decisão | ledger de tokens |

## Fase 3: alavancagem

O dono autorizou a alavancagem (2026-10-14); a atualização de 2026-10-15 da seção 8 do SPEC troca os portões do código por fatos lidos pelo Jev. A API DeFi do OnchainOS documenta depositar e tomar emprestado, não uma alavancagem pronta; o contexto de funding e posição aberta já chega ao modelo. As tarefas são as fatias F0 a F6 de `ALAVANCAGEM-VIABILIDADE-20261014.md` (F0 a F2, sem dinheiro real: leitura, fatos do Brief e sombra; o resto depende de documentação que falta e de atos que só o dono faz).

## Removidas por D-A7

Modos e subida por frase digitada, parada pegajosa com frase de religar, formulário de configuração, aprovação de ordem, "modo assistido". O que as substitui está no design: modo derivado, desconectar imediato, piloto automático e disjuntor.
