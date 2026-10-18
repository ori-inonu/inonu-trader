# Ciclo 2, ticket T16: Reconciliacao de ordem em voo apos queda

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: operacao
Priority: 16

## Question

Um processo que cai entre o envio de uma ordem e a gravacao do resultado consegue reconciliar a ordem em voo antes de qualquer nova compra, e o que acontece quando o ledger ficou um passo atras da carteira? Como o estado desconhecido, hoje tratado como pendente, deve ser lido?

Por que importa: Ordem com hash e identificada ate recibo SUCCESS ou ERROR (cli.ts:595, cycle.ts:42). Recibo sem resposta so e liquidado por recibo ligado a ela (wire.ts:429), com teto de 30 s (wire.ts:914 e 942). A janela entre envio e gravacao nao esta provada. Impacto: compra duplicada ou venda perdida em ciclo de 1 minuto. Somente leitura de codigo e testes.
Evidencia a buscar: src/agent/reconcile.ts; src/agent/lock.ts (UNREADABLE_STALE_AFTER_MS); src/agent/ledger.ts:200-270; src/agent/state.ts:189; testes ledger-tail.test.ts, lock.test.ts e reconcile.test.ts; leitura de pending-buys.ts.

## Answer

Ordem sem hash nunca e liquidada por recibo: a consulta retorna null sem referencia (cli.ts:326). So Solana tem recuperacao por transacao, e so quando exatamente uma transacao corresponde (wire.ts:473-479; solana-receipts.ts:208). A janela sem recibo vai do registro "enviando", gravado com fsync antes do envio (cycle.ts:724-729), ate a resposta: no maximo cerca de 120 s (quote 30 s mais execute 90 s, wire.ts:419). Compra duplicada e barrada por memoria: token em voo sai dos candidatos e caixa pendente sai do saldo (cycle.ts:555, 557; pending-buys.ts:35-57). O custo e venda presa: stop do mesmo token espera sem prazo (cycle.ts:763-767). Estado desconhecido deve ser lido como "nao sei se saiu": bloqueio ate recibo ou palavra da pessoa, nunca reenvio. Reconciliacao roda antes de cada ciclo (wire.ts:1298), mas a protecao contra compra nao depende dela. Pontos abertos: lock lido so na partida, e wire.ts e cycle.ts ainda em merge com marcadores de conflito.

### Caminhos (Wayfinder)

- **Revalidar o LOCK a cada ciclo**: Reler o arquivo LOCK antes de cada ciclo e parar se o pid gravado nao for o deste processo. Fecha o cenario de dois agentes operando a mesma carteira (A10). | Restricao que prende: lock.ts so checa na partida (lock.ts:52-96), e wire.ts esta em merge nao resolvido | Experimento mais proximo: Teste novo: com processo vivo, apagar LOCK e esperar que o proximo ciclo recuse com outra_instancia. Nao ha teste hoje (lock.test.ts) | Ganho: Elimina a duplicacao de agente por pasta compartilhada; sem numero, o risco e de baixa frequencia (inferencia) | Esforco: baixo: lock.ts e o gate canRun em wire.ts:686, depois do merge | Como medir: Teste verde; em execucao de sombra, contagem de ciclos com LOCK alterado igual a zero
- **Medir o bloqueio das ordens sem recibo em sombra**: Ler o journal em modo somente leitura e contar ordens em enviando ou incerta sem hash, a idade de cada uma e quantas foram resolvidas pela pessoa. Dimensiona o custo da venda presa (A3, A8) antes de qualquer mudanca de regra. | Restricao que prende: O journal nao guarda a causa exata da queda, e o numero real so o dono ou a leitura local revela (A3, A8) | Experimento mais proximo: Contagem por semana no journal atual: enviando ou incerta sem ref, com idade mediana e maxima | Ganho: Substitui a estimativa por numero medido; nao muda caixa nem token | Esforco: baixo: leitura de ledger.jsonl, sem escrita e sem ordem | Como medir: Numero de ordens por motivo (sem_resposta, tempo_esgotado, sem_recibo, recusa_sem_prova) e tempo em voo ate resolucao; sem valor de carteira nem endereco
- **Pesquisar recuperacao EVM sem hash**: Pesquisa somente leitura sobre se a ferramenta de carteira oferece consulta de historico por janela e rede sem --tx-hash, e como um recibo PENDING evolui no tempo. Sem implementacao neste ticket. | Restricao que prende: cli.ts:43 veda a listagem e receipt.ts:6-7 exige o hash para vincular a ordem; a documentacao nao foi lida | Experimento mais proximo: Ler a documentacao do comando wallet history e listar as flags aceitas; testar em sombra, sem ordem, se a consulta por janela existe | Ganho: Fecha o caminho sem hash para EVM; o ganho depende da existencia da flag, nao verificado | Esforco: medio: leitura da documentacao publica da ferramenta, sem conta nem chamada paga | Como medir: Fracao de ordens EVM sem hash que seriam resolvidas por recibo automatico (hoje zero, A5)
- **Concluir o merge antes de qualquer mudanca**: Resolver os marcadores de wire.ts (linhas 825, 832 e 1228) e as duplicatas de watch e before, e so depois rodar os testes de lock, ledger-tail e reconcile. Pre-requisito de todos os outros caminhos. | Restricao que prende: wire.ts e cycle.ts estao UU com marcadores; o modulo nao carrega (A6) | Experimento mais proximo: bun build de src/agent/wire.ts sem erro TS1185, seguido de bun test nos tres arquivos de teste | Ganho: Destrava a verificacao de todo o resto; sem ganho de lucro direto | Esforco: baixo a medio: resolucao manual do conflito, sem mudar regra | Como medir: Zero marcadores de conflito e testes verdes; hoje o modulo nao transpila
- **Corrigir a leitura do estado e a escrita dele**: Estado ilegivel nao deve virar FRESH sem aviso, e a escrita deve ser durable (fsync antes do rename). Preserva a pausa e evita desconexao silenciosa. | Restricao que prende: state.ts:116-122 e 185-190 (A12); efeito real no NTFS nao verificado | Experimento mais proximo: Teste com arquivo state.json vazio ou cortado: o agente deve reportar estado ilegivel, nao desconectado em silencio | Ganho: Disponibilidade e rastreio da pausa; nao afeta a regra de compra (falha ja e fechada) | Esforco: baixo: state.ts, com teste de arquivo truncado | Como medir: Teste verde; em sombra, nenhuma queda de energia simulada apaga a pausa

### Achados

- [A1|fato|alta|VERIF=confirmado] A ordem e gravada como enviando, com fsync, antes da chamada da ferramenta; se a gravacao falha, o ciclo para com ledger_nao_gravou e nada e enviado. O campo ref so e preenchido depois da resposta, entao o registro enviando nunca tem hash. mayStart existe para isso, mas nao e chamado em producao: a unicidade depende so do id do ciclo.
    fonte: cycle.ts:724-729 e 739; ledger.ts:297-301 (writeAll com fsync), ledger.ts:74-78 (mayStart), cycle.ts:693 (orderKey por ciclo); grep de mayStart( sem uso fora de ledger.ts
- [A2|fato|alta|VERIF=confirmado] Nenhum caminho real grava executada direto da ferramenta. Resposta ok com hash vira transmitida, gravada como incerta com o hash; so recibo SUCCESS (ou palavra da pessoa) torna a ordem executada. Toda ordem real passa pela reconciliacao por recibo.
    fonte: cli.ts:589-597 (transmitida); cycle.ts:738 (incerta com ref); cycle.ts:41-45 (tipo ExecResult); reconcile.ts:68 (so success vira executada)
- [A3|fato|alta|VERIF=parcial] Ha cinco caminhos em que a ordem vai a incerta sem referencia, e nenhum deles tem hash para consultar: sem_resposta quando o processo lanca (cli.ts:561), tempo_esgotado sem hash no que foi impresso (cli.ts:566), recusa_sem_prova sem hash (cli.ts:586), sem_recibo quando o ok nao traz hash (cli.ts:590), e excecao ou prazo do ciclo (cycle.ts:735, que descarta a saida parcial da ferramenta).
    fonte: cli.ts:558-590; cycle.ts:732-736
    >> parcial: Sem referência nos caminhos cli.ts:561 (sem_resposta), cli.ts:590 (sem_recibo) e cycle.ts:735 (excecao). Mas cli.ts:565-566 (tempo_esgotado) e cli.ts:584-586 (recusa_sem_prova) preservam o hash impresso pela ferramenta quando ele existe (variáveis early e kept). Logo não é verdade que nenhum dos cinco caminhos tem hash para consultar. | correcao: Dizer: três caminhos sem referência (sem_resposta, sem_recibo, excecao). Dois caminhos (tempo_esgotado e recusa_sem_prova) só ficam sem referência quando a saída impressa não traz hash. Só o caminho de excecao descarta a saída parcial da ferramenta.
- [A4|calculo|alta|VERIF=confirmado] Janela maxima sem recibo: quoteMs 30 s mais executeMs 90 s = 120 s, com teto de ciclo de 150 s. A recuperacao procura transacoes a partir de 180 s antes do registro, por isso cobre a janela inteira.
    fonte: wire.ts:419 (timeouts quote 30000, execute 90000); wire.ts:146 (orderMs 150000); wire.ts:476-477 (sinceMs = atMs menos 180000)
- [A5|fato|alta|VERIF=confirmado] A consulta de recibo nao roda para ordem sem hash: createReceiptLookup retorna null antes de chamar a ferramenta. Fora de Solana nao ha caminho de recuperacao: a ferramenta recusa listar historico sem --tx-hash, e o recibo exige o hash. Em EVM, uma ordem sem hash em enviando ou incerta fica em voo ate a pessoa resolver.
    fonte: cli.ts:326 (if order.ref === null return null); cli.ts:43-44 (HISTORY_FLAGS, lista proibida); receipt.ts:6-7; wire.ts:473-479 (recoverRef so para chainIndex 501); http.ts:149 e wire.ts:1215 (resolve da pessoa, com lock)
- [A6|fato|alta|VERIF=confirmado] A reconciliacao roda antes de cada ciclo e na guarda, com timeout de 30 s, so com lock segurado e agente conectado. O passo before tem teto de 60 s e o ciclo segue mesmo se ele falhar, entao a reconciliacao nao e condicao para comprar. Ressalva: wire.ts esta em merge com duas copias de watch e de before (linhas 911 e 1267, 942 e 1298).
    fonte: wire.ts:481 (gate lock e connected); wire.ts:914, 942, 1270, 1298 (reconcileReceipts com 30 s); scheduler.ts:82-103 (safely com 60 s, ciclo segue); git status de wire.ts = UU
- [A7|fato|alta|VERIF=confirmado] Compra duplicada e barrada pela memoria do ciclo, nao pelo recibo. Token em voo sai dos candidatos de compra, e caixa pendente sai do saldo. Uma compra pendente so se libera por saldo acima do saldo anterior ao envio, ou por resposta. Com balanceBefore nulo, so a resposta libera.
    fonte: cycle.ts:555, 804, 868 (inflightTokens e pending.tokens); cycle.ts:557 (pendingBuys); pending-buys.ts:40-49 (balanceBefore nulo e now maior que before); pending-buys.test.ts:35 e 40
- [A8|fato|alta|VERIF=parcial] Venda presa: enquanto a ordem do token esta em voo, o stop de protecao desse token nao sai, sem prazo, e nao ha reenvio. Esse e o custo de venda perdida do ticket. Ordens em voo tambem contam no teto diario de gasto, por isso uma ordem presa consome o teto ate ser resolvida.
    fonte: cycle.ts:762-767 (ordem_em_voo, sem reenvio); ledger.ts:196-207 (spentTodayUsd conta enviando e incerta); cycle.ts:302 (PENDING_SETTLE_MS = 15 min, so para compras confirmadas)
    >> parcial: Confirmado o bloqueio do stop sem reenvio (cycle.ts:762-767, motivo ordem_em_voo) e PENDING_SETTLE_MS de 15 min (cycle.ts:302). Ajuste: ledger.ts:196-207 conta enviando, executada e incerta, mas só as enviadas no mesmo dia (filtro por dayKey de sentAtMs, ledger.ts:201). Uma ordem presa deixa de contar no teto diário quando o dia muda, o que contradiz 'consome o teto até ser resolvida'. | correcao: Dizer: ordens em voo contam no teto de gasto do dia em que foram enviadas (enviando, executada e incerta, ledger.ts:200-203). Após a virada do dia, a ordem presa não consome mais esse teto.
- [A9|fato|alta] Saldo e relogio nunca liberam ordem em voo; testes provam isso. Reconciliacao por saldo nao esta ligada em producao: deps.reconcile nao e passado ao criador do ciclo, entao cycle.ts:552 sempre soma zero. Logo a unica via de liquidacao sao recibos e a pessoa.
    fonte: reconcile.test.ts:44 (saldo e relogio nao provam); pending-buys.test.ts:35 (em voo conta sem limite de idade); cycle.ts:199 e 552; grep de 'reconcile:' em wire.ts sem resultado (HEAD e main)
- [A10|inferencia|media] O lock e calculado uma vez, na partida. held() so muda no release, e o arquivo nao e relido por ciclo. Se o LOCK for apagado por fora com o processo vivo, outro processo pode adquirir a pasta e operar a mesma carteira, enquanto este continua com held verdadeiro. Esse cenario nao tem teste no nome dos testes de lock.
    fonte: lock.ts:52-96 (held e release); lock.ts:34 (UNREADABLE_STALE_AFTER_MS = 5000); wire.ts:166 (acquire uma vez) e wire.ts:686 (canRun usa held); lock.test.ts nomes (nenhum cobre remocao com processo vivo)
- [A11|inferencia|media] Queda de energia no registro de resposta pode perder o hash. O reparo do fim do arquivo move a linha cortada para .torn-<ms>; se essa linha for o registro pos-envio com hash, o ledger volta a enviando sem hash. Uma ordem EVM fica entao presa, e uma Solana so se recupera pela busca de transacao. A ordem nao e reenviada, por isso nao ha compra duplicada por essa via.
    fonte: ledger.ts:239-257 (repairTail); ledger-tail.test.ts:19-36 (linha cortada posta de lado); cycle.ts:724 e 738-739 (enviando sem ref antes do registro com ref)
- [A12|fato|alta] Estado ilegivel vira desconectado, sem ciclo, e a escrita nao tem fsync. Uma queda de energia pode desconectar o agente em silencio e apagar a pausa, em vez de preservar a pausa. Falha fechada para compra, mas afeta a disponibilidade. Efeito real no NTFS nao verificado.
    fonte: state.ts:116-122 (load falho gera FRESH, connected false); state.ts:185-190 (persist com writeFileSync e renameSync, sem fsync)

### Decisao para o Jev

Pergunta: Como ler uma ordem sem recibo (enviando ou incerta sem hash) enquanto ela esta em voo?
Reversivel: true

- adiar_so_medir (Adiar e so medir): Nenhuma mudanca no caixa, no token nem na liquidacao. Em sombra, contar ordens sem recibo, a idade delas e quantas tem hash, para dimensionar o bloqueio antes de decidir qualquer regra. | Evidencia: ledger.ts:196-207 e cycle.ts:555, 557 mostram o efeito; sem contagem medida
- ler_em_voo_com_painel (Manter em voo e mostrar no painel): A regra atual fica: sem recibo ou palavra da pessoa, token e caixa seguem bloqueados e nunca ha reenvio. Acrescenta-se so a leitura visivel de idade e contagem no status do agente. | Evidencia: cycle.ts:762-767 (sem reenvio); wire.ts:1115 (inFlight exposto ao status)
- revalidar_lock_por_ciclo (Revalidar o LOCK a cada ciclo): Hoje o lock e lido uma vez, na partida. Reler o arquivo antes de cada ciclo impede dois processos operando a mesma carteira se o LOCK for apagado com este processo vivo. Nao muda ordem nem liquidacao. | Evidencia: lock.ts:52-96 (held so na aquisicao); wire.ts:686 (canRun usa held)
- pesquisar_recibo_evm (Pesquisar recuperacao EVM sem hash): Somente pesquisa: verificar se a ferramenta de carteira consulta historico por janela e rede sem --tx-hash, e como um recibo PENDING evolui. Nada e implementado nem liquida ordem. | Evidencia: cli.ts:43 veda a lista; receipt.ts:6-7 exige hash; cli.ts:326
- resolver_merge_antes (Resolver o merge antes): Concluir a resolucao de wire.ts e cycle.ts (estado UU com marcadores) e rodar os testes de lock, ledger-tail e reconcile antes de tratar qualquer outro item deste ticket. | Evidencia: wire.ts:825, 832, 1228 com marcadores; tsc TS1185

Recomendacao sem Jev: adiar_so_medir - E a opcao mais reversivel e de menor risco: nao altera caixa, token, envio, liquidacao nem schema. A regra atual ja impede compra duplicada pela memoria do ciclo (A7). O custo, a venda presa (A8), so pode ser dimensionado com contagem real. Depende de resolver o merge antes (caminho 4), senao o modulo nao carrega.
Cetico: decisao_ok=false; problemas: O campo desconhecidos traz entradas com 'ask' redigidas como perguntas ao dono ('So o dono ou a leitura local revela'). A regra proíbe perguntar ao dono; cada item deve virar pesquisa executável ou registro como nao verificado. | A restrição 4 diz que wire.ts e cycle.ts têm marcadores de conflito. Só wire.ts tem marcadores (825, 832, 1228). cycle.ts está UU no índice sem marcador. Corrigir o texto. | A restrição 5 ('saldo e relógio nunca liberam ordem em voo') é verdadeira para a ordem, mas pending-buys.ts:48 libera o caixa reservado por saldo. Separar os dois conceitos para o Jev não confundir ordem com caixa. | Falta a opção de bloqueio global de compras enquanto houver ordem em enviando ou incerta sem recibo. Hoje o bloqueio é só por token (cycle.ts:555, 804, 868), então uma compra de outro token pode ocorrer com uma ordem presa. Antes de submeter ao Jev, confirmar que a opção não altera limites de risco, item vedado. | Falta a opção de alerta por idade: aviso visível ao dono quando uma ordem sem recibo passa de 15 min (mesmo teto de cycle.ts:302), sem mudar caixa, token ou liquidação. Distinta de ler_em_voo_com_painel, que só mostra contagem. | adiar_so_medir e ler_em_voo_com_painel se sobrepõem, pois as duas mostram contagem e idade. Diferenciar: a primeira não muda nada na tela, a segunda altera o status do agente. | A evidência de resolver_merge_antes cita tsc TS1185, que não foi verificado nesta passagem.

### Bloqueios do dono

- Liberar caixa ou token de compra pendente por prazo, sem recibo: envolve dinheiro real e ordens.
- Reenviar ou liberar um stop de venda com ordem sem recibo: envolve ordens e dinheiro real; o codigo veda o reenvio (cycle.ts:762-767).
- Gravar intencao antes do envio ou criar novo estado no journal (ORDER_STAGES, ledger.ts:29): mudanca de schema e de journal.
- Mudar limites de risco ou liberar o live: decisao exclusiva do dono.
- Trocar ou acrescentar servico pago ou dependencia de producao para consulta de historico (OKX Onchain OS, planos com RPS): billing e dependencia nova.

### Novos tickets revelados

- Revalidar o LOCK a cada ciclo: O agente deve reler o arquivo LOCK antes de cada ciclo e parar se o pid nao for o seu? Hoje held() e fixo desde a partida (lock.ts:52-96).
- Concluir o merge de wire.ts e cycle.ts: Qual lado do conflito vence em wire.ts (linhas 825, 832, 1228) e em cycle.ts, e a reconciliacao por recibo muda nela? O modulo nao transpila hoje.
- Hash preservado no corte de energia: O registro pos-envio com hash deve ser gravado de forma que um corte nao o perca? Hoje o reparo do fim do arquivo pode voltar a ordem a enviando sem hash (ledger.ts:239-257).
- Estado ilegivel e escrita sem fsync: Estado ilegivel deve mostrar aviso em vez de virar desconectado, e a escrita deve ser durable? Ver state.ts:116-122 e 185-190.
- Reconciliacao por saldo sem ligacao: deps.reconcile nunca e passado ao criador do ciclo: remover o codigo morto ou ligar a reconciliacao por saldo? Saldo nao libera ordem em voo (reconcile.test.ts:44).

### Nao lido

- Nao rodei bun test nem tsc sobre os testes: wire.ts tem marcadores de conflito e nao transpila; os testes foram lidos por nome e em trechos, nao executados.
- Corpos completos de reconcile.test.ts, lock.test.ts, ledger.test.ts e ledger-tail.test.ts: li so os nomes e trechos.
- src/server/solana-receipts.ts lido em trechos (swapFinder, linhas 169-210); nao li o codigo de withSolanaReceiptFallback.
- Documentacao da OKX (wallet history, janela de tempo, PENDING e ERROR) nao consultada: escopo do ticket era so codigo e testes. Afirmacoes sobre a ferramenta estao como nao verificado.
- Pasta docs/specs/retorno-composto-por-ciclo/ nao lida neste ticket.
- Nao li .env, chaves, enderecos de carteira nem saldos; nenhum valor de carteira aparece aqui.

### Resumo do cetico

Reverifiquei as 8 afirmações do T16 contra o código em C:/Users/gabri/jev-trader (leitura apenas, nada editado, Jev não chamado). Resultado: 6 confirmadas (A1, A2, A4, A5, A6, A7), 2 parciais (A3 e A8), nenhuma refutada e nenhuma sem fonte. A decisão não pode ir ao Jev como está (decisao_ok falso): o campo desconhecidos formula perguntas ao dono (proibido), a restrição sobre marcadores de merge vale só para wire.ts, a restrição "saldo nunca libera ordem em voo" precisa separar ordem de caixa reservado, e faltam duas opções reais. Caminhos seguros para o próximo avanço: (1) contar ordens sem recibo e sua idade em sombra (adiar_so_medir); (2) painel com alerta por idade acima de 15 min sem mudar liquidação; (3) revalidar o LOCK a cada ciclo; (4) pesquisa de recuperação EVM sem hash; (5) resolver o merge de wire.ts antes de qualquer mudança de reconciliação. Não verificado nesta passagem: tsc TS1185, tempo de PENDING na ferramenta, documentação da ferramenta de carteira para EVM, e contagem real no journal.

## Comments

