# ADENDO H: alocacao conjunta e decisoes por eventos

Estado: decisao de arquitetura e contrato de implementacao, em resposta ao dono em15/10/2026. Nenhum codigo funcional, pacote ou parametro do agente vivo foi alterado por este adendo. Complementa E, F e o laboratorio A/B; nao os substitui.

## 1. Objetivo do dono

O dono pediu uso ativo do capital, observacao ampla do mercado, decisoes mais rapidas que o relogio de dois minutos e crescimento do patrimonio agregado por gestao conjunta de entradas, manutencoes e saidas. Os91% de caixa e US$118,39 foram informados pelo dono; nao sao medicoes atuais independentes desta sessao.

Dez ativos deUS$10 e GTA sao exemplos, nao quantidade obrigatoria, teto por compra ou ordem sobre um token identificado. A identidade negociavel continua sendo rede e contrato/mint. Quantidade, tamanhos e alocacao sao escolhas do Jev. O pedido nao autoriza o codigo a converter automaticamente skip em compra nem a inventar probabilidade calibrada de lucro. A carteira principal fora do escopo de assinatura nao se torna negociavel porque aparece no patrimonio total.

Diretriz: buscar alocacao vantajosa do capital disponivel e justificar caixa nao alocado. Compra nao e uma metrica de sucesso. Uma carteira mais diversificada pode reduzir concentracao, mas varios tokens com o mesmo comportamento nao asseguram compensacao de perdas nem patrimonio crescente. Custos por posicao e por giro entram no resultado.

## 2. Diagnostico do codigo lido

- `model.ts` ja declara resultado financeiro liquido da carteira no GOAL. GOAL_SHORT, entretanto, pede decidir apenas para este candidato. Alinhar a pergunta curta a alocacao conjunta e ao efeito marginal de cada posicao.
- MANDATE_CRITERIA descreve reserva10/20/aproximadamente33%, concentracao pequena/media/grande e ritmo5/10/20min. A pergunta de reserva diz que o codigo nao a aplica e o ritmo quente usa2min. Corrigir significado, unidades e dados do mandato efetivo antes de atribuir o caixa observado a uma reserva de codigo. A leitura nao prova a causa dos91%.
- cycle.ts mostra no maximo7 compras, priorizando5 abertas quando ha fechadas; so3 leituras de momentum por ciclo. Isso e tamanho do conjunto examinado pelo modelo, nao prova de varredura de todo o mercado. Explicitar cobertura e selecao.
- scheduler.ts ja oferece requestCycle com single-flight e reposiciona o timer depois de um ciclo por evento. O transporte do pulse para o artefato continua pendente em F/178; nao dizer que diminuir um numero de intervalo conclui esse fluxo.
- Criterios e comentarios antigos de risco/reserva nao devem ser apresentados como limites monetarios retirados pelo dono. Validar o caminho efetivo e o que a interface/modelo recebem, preservando restricoes fisicas e do provedor.

## 3. Arquitetura escolhida

### Observacao e decisao com ritmos separados

Uma camada mantem fatos de mercado compartilhados com fonte, identidade, evento, recebimento, primeira disponibilidade, conexao/geracao e cobertura. Atualizar preco ou invalidar quote pode ser barato; isso nao exige uma consulta Jev a cada mensagem.

Descoberta amplia e rotaciona o universo observado, com paginacao e cobertura visiveis. Posicoes mantidas recebem prioridade de atualizacao. O ranking oferece candidatos ao Jev e registra quais ficaram fora e por que; nao o chama de probabilidade de alta. CEX BTC/SOL informa regime e nao substitui os dados do mint negociado na DEX.

Mudanca material de mercado, carteira, recibo ou candidato chama o mesmo scheduler por evento. Eventos repetidos sao agrupados sem renovar seu instante de origem; trabalho novo durante um ciclo aguarda a mesma cadeia, sem novo executor. Timer continua como verificacao de continuidade. Medir separadamente atraso do fato, espera, coleta, resposta do modelo, quote, envio e recibo. Dados mais rapidos nao provam execucao subsegundo.

### Escolha conjunta de carteira

O Brief mostra a carteira vigente e as alternativas de alocacao no mesmo horizonte: exposicao por ativo e grupo de comportamento, caixa livre, comprometido e disponivel por rede, ordens pendentes, custos de entrada/saida no tamanho proposto e lacunas de dados. Correlacao e concentracao desconhecidas ficam desconhecidas, sem classificacao falsa de diversificado.

As perguntas pedem ao Jev uma combinacao coerente de manter, reduzir, sair e comprar, com prioridade e tamanhos dentro do contrato Choice. A alocacao precisa informar o efeito esperado sobre a carteira inteira e o motivo de caixa nao alocado. Usar pesos relativos e dados sanitizados; nao ampliar o envio de dados privados para um novo provedor.

Antes de enviar qualquer ordem, validar o conjunto por rede em unidades minimas, com saldo fisico, compromissos pendentes e custos nativos conhecidos. Duas compras nao podem prometer gastar o mesmo caixa. Se as escolhas conjuntas forem inconsistentes, devolver o conflito ao Jev para outra escolha, com fatos/versionamento registrados. Nao reduzir tamanho silenciosamente, preencher slots por regra fixa, nem comprar no lugar de uma resposta skip.

Uma venda planejada nao e caixa disponivel ate o recibo e a conciliacao. O plano continua pela mesma autoridade, idempotencia e executor. Uma decisao valida e executavel segue imediatamente pelo fluxo normal; nenhum clique humano por operacao e introduzido.

### Gestao do capital disponivel

Perfil arrojado e busca ativa de oportunidades. Evitar caixa ocioso sem explicacao torna-se criterio explicito do modelo, junto de custo de oportunidade. Quantidade de tokens, tamanhos e ritmo sao escolhas baseadas em fatos; nao fixar dez posicoes, dez dolares, compra obrigatoria por ciclo ou ocupacao de100% como substituto de inteligencia.

Separar caixa livre de saldo nativo necessario para transacoes e de compromisso de ordem em conciliacao. Essa separacao descreve capacidade fisica, nao uma reserva conservadora inventada. Quando nao houver alocacao pedida/aplicavel, a interface registra o motivo com a mesma versao dos fatos e o responsavel: modelo, dado ausente, saldo/autoridade, quote, provedor ou execucao. Assim os91% passam a ser diagnosticaveis.

## 4. Dados em tempo real e cota: verificacao primaria

Documentacao OKX consultada em15/10/2026:

- [Advanced price channel](https://web3.okx.com/onchainos/dev-docs/market/websocket-price-info-channel): price-info oferece preco, liquidez e variacoes por rede/contrato, com frequencia maxima de um push por segundo. E capacidade anunciada, sem prometer atualizacao garantida por ativo ou latencia de execucao.
- [Websocket](https://web3.okx.com/onchainos/dev-docs/market/websocket): exige plano Market API, limita conexoes a3requisicoes/s por API key e login/subscribe/unsubscribe a480por hora por conexao. Esses limites de controle nao sao numero de ativos nem cota de mensagens push.
- [Market API Fee](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee): Free lista100K Basic e100K Premium por mes, com WebSocket nao suportado; Starter anunciaUS$99/mensais. Nao presumir entitlement da conta, pagar, assinar ou usar x402 automaticamente. O plano e os direitos reais da conta ainda precisam ser conferidos por via autorizada.

A primeira implementacao usa a infraestrutura autorizada existente e cache compartilhado, com consumo real medido. O feed publico de CEX ja composto pelo projeto e diferente do stream DEX acima. Chamadas fisicas, erros, retries e cache devem aparecer no painel SISTEMA; contador local nao prova saldo total da conta. Nao multiplicar consultas por ativo sem medir o custo real.

## 5. Provas necessarias para a proxima versao

1. Testes anteriores a implementacao: multiplas compras disputando o mesmo caixa; exposicao ja existente; dez candidatos correlacionados; sem correlacao medida; duas redes com caixa em apenas uma; compra repetida no mesmo token; quote inadequado ao tamanho; venda ainda sem recibo; evento que chega durante ciclo; e perfil arrojado sem teto monetario novo.
2. Integracao: o fato que disparou o evento aparece no Brief efetivamente enviado; resposta pedida/aplicada e alocacao por rede permanecem verificaveis; caixa sem alocacao recebe motivo. Uma consulta rapida sem esses vinculos nao conclui a integracao.
3. Comparacao A/B prospectiva: carteira B propria apos divergir, mesmos fatos disponiveis, versoes fixas e avaliador financeiro/estatistico fora de alcance do pesquisador. Comparar patrimonio/retorno liquido, custos, cobertura, concentracao, giro e latencia; mais posicoes ou caixa ocupado nao qualificam promocao.
4. Tipos, testes pertinentes, revisao independente, captura sem deriva, compilacao e selftest conforme contrato. Passagem coordenada pelo responsavel e recuperacao pelo mesmo release qualificado. Nenhuma operacao manual para testar.

Referencia conceitual: [Investor.gov sobre alocacao e diversificacao](https://www.investor.gov/introduction-investing/getting-started/asset-allocation). Diversificacao depende do conjunto de exposicoes e de como se comportam, nao de um numero universal de moedas. Nao e garantia de lucro.

## 6. Proxima etapa e ownership

Codex: terminar transporte pulseF/178 e adocao176 quando o hook permitir a execucao das provas; projetar a evidencia de alocacao/caixa e o consumidor A/B sem reimplementar o financeiro.

Claude: preservar entry-cost/cycle/wire, conferir criterios/perguntas e inventariar os motivos concretos do caixa; preparar delta congelado de alocacao conjunta e ritmo para qualificacao, sem modificar a producao atual por este documento. Os quatro achados de passagem e os do medidor seguem suas notas proprias.

O bloqueio nativo de testes/validacao desta sessao permanece. Este adendo registra uma decisao concreta de produto e integracao, nao implementacao, ativacao ou beneficio financeiro comprovado.
