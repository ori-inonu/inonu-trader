# Ciclo 2, ticket T04: Motivo dos 57% de candidatos fechados antes do Jev

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: decisao
Priority: 4

## Question

Para os 411 candidatos fechados antes da escolha do modelo, qual a parcela por motivo de fechamento (dado insuficiente, idade do fato acima do limite, liquidez, cooldown, teto de compra ou outro), e quantos teriam passado se usassem o dado da janela corrente?

Por que importa: E o maior gargalo de decisao da linha de base. Se o fechamento for filtro util, o Jev deve ver menos candidatos. Se for dado atrasado (brief-freshness mostra diferenca mediana de 0,89 ponto em 5 minutos), a correcao e de frescor, nao de velocidade do modelo.
Evidencia a buscar: src/agent/candidates.ts, src/agent/gate.ts e src/agent/conviction.ts (motivos de fechamento); contagem agregada em decisions-meta.jsonl; campos dataAgeMin e ag em src/agent/model.ts:221.

## Answer

411 chaves únicas (ciclo, candidato) de compra fecharam antes da escolha do Jev em data/decision-review/audits.jsonl (262 consultas, 1822 linhas de compra, 1023 linhas fechadas). Marcas entre os 411: minimo 387 (94,2%), sem_historico 97 (23,6%), entrada_esticada 22 (5,4%), sem marca de bloqueio 4 (1,0%). Não há fechamento de compra por idade do dado: a única regra de tempo é a janela de velas acima de 3 h, que cai em sem_historico. Quantos passariam com dado corrente: não dá para afirmar com o registro atual; o limite inferior é 20 (fechados só por sem_historico ou entrada_esticada), e os 387 com marca minimo dependem de caixa por rede, que o registro não guarda. O total de 411 também aparece na janela de 103 consultas de latest.json, e isso não foi conciliado.

### Caminhos (Wayfinder)

- **Medir a causa exata em sombra, sem mudar regra**: Reconciliar os 411 fechamentos em uma tabela de causa exclusiva (caixa zero, dado de timing curto, defasado ou timeout, custo de entrada, minimo legado), por leitura do mesmo recorte. | Restricao que prende: O registro não guarda cap, caixa por rede nem idade do timing (A10), e a marca minimo pode não ser a causa (A5). | Experimento mais proximo: Script de leitura sobre data/decision-review/audits.jsonl e o estado de caixa por rede do mesmo horário, sem alterar fechamento nem journal. | Ganho: Decide se o gargalo é filtro útil ou dado atrasado. Base: 411 fechados, 1023 linhas (A1, A2). | Esforco: baixo | Como medir: Tabela de causa exclusiva somando 411, com zero sem explicação; conferir se minimo coincide com caixa zero na mesma rede.
- **Buscar velas mais novas antes de marcar sem_historico**: Se a causa predominante de sem_historico for janela acima de 3 h ou timeout, o correto é tentar nova leitura de velas antes de fechar, e não acelerar o modelo. | Restricao que prende: O limite de 3 h (MAX_STALE_MS) e o prazo de leitura (readMs) não foram medidos contra a velocidade real do provedor (A6). | Experimento mais proximo: Contador por causa dentro de timingFacts e do catch de cycle.ts:800, em modo sombra, durante uma janela de auditoria. | Ganho: Até 97 dos 411 fechados (23,6%) por janela, se a causa for atraso ou timeout (A2). Qualitativo, sem número de lucro. | Esforco: medio | Como medir: Parcela de cada causa dentro de sem_historico; se atraso ou timeout passar de 50%, abrir o caminho de frescor.
- **Markout dos fechados comparado com os escolhidos**: Registrar, em sombra e sem ordem, o preço de 1, 5 e 15 min depois de cada fechamento por sem_historico e entrada_esticada, e comparar com os escolhidos pelo Jev. | Restricao que prende: Não há markout medido no repo para candidatos fechados (A10). Para 0,5% por ciclo são precisos de 32 a 126 ciclos independentes (matematica-da-meta.md). | Experimento mais proximo: Registro de markout sem ordem para 97 sem_historico e 22 entrada_esticada, respeitando a cota local de 720 consultas por dia. | Ganho: Diz se fechar custa oportunidade. Não promete lucro. Número de amostra vem de matematica-da-meta.md. | Esforco: medio | Como medir: Média e mediana do markout dos fechados comparada com a dos escolhidos, por janela independente.
- **Confirmar a origem da marca minimo antes de tocar na regra**: Rastrear no ciclo de onde vem a marca minimo na lista de candidatos e se ela corresponde a caixa zero ou ao mínimo legado de US$ 10. | Restricao que prende: candidates.ts:34 zera o mínimo, e o rótulo minimo vem do cap legado de ecosystem.ts (A5). Corrigir a regra errada não move o funil. | Experimento mais proximo: Leitura do caminho de view em cycle.ts e do caixa por rede no mesmo recorte, sem editar código. | Ganho: Evita trocar a regra errada. Afeta até 387 dos 411 fechados (94,2%) como rótulo. | Esforco: baixo | Como medir: Para os 387 casos, a caixa da rede é zero na mesma hora? Se sim, minimo é rótulo e a causa é caixa.
- **Adiar: manter o funil atual até medir**: Não mudar o funil de compra neste ciclo. Os caminhos 1 e 4 vão primeiro, e os demais dependem do resultado deles. | Restricao que prende: Sem a causa exata, qualquer mudança pode fechar o filtro errado ou liberar candidatos sem caixa. | Experimento mais proximo: Nenhum; só manter o estado e registrar o que foi medido. | Ganho: Nenhum imediato. Sem risco novo. | Esforco: baixo | Como medir: Sem medição nova, o gargalo continua descrito só como 57% de fechados.

### Achados

- [A1|calculo|alta|VERIF=confirmado] Em audits.jsonl há 262 consultas com candidatos, 1822 linhas de compra, 1023 linhas com source closed_before_choice e 411 chaves únicas (cycleId|id). A contagem foi feita por script de leitura, sem IDs nem endereços no resultado.
    fonte: data/decision-review/audits.jsonl (agregado); src/decision-review/audit.ts:110-117
- [A2|calculo|alta|VERIF=confirmado] Entre os 411 fechados, marcas de bloqueio: minimo em 387 (94,2%), sem_historico em 97 (23,6%), entrada_esticada em 22 (5,4%), sem marca de bloqueio em 4 (1,0%). Partição exclusiva: minimo só 288; sem_historico+minimo 87; entrada_esticada+minimo 12; sem_historico só 10; entrada_esticada só 10; sem marca 4.
    fonte: data/decision-review/audits.jsonl (agregado); conjunto CLOSING em src/decision-review/audit.ts:45
- [A3|fato|alta|VERIF=parcial] Uma compra é marcada como fechada antes da escolha quando suas stances são só [skip]. Isso ocorre quando buyCandidates não gera nenhum tamanho (sizesFor retorna vazio), ou quando a fonte de ecossistema não está fresca (retorno []).
    fonte: src/decision-review/audit.ts:110; src/agent/candidates.ts:229 e :246; src/opportunity/ecosystem.ts:222 (isEcoSourceFresh)
    >> parcial: Fechada = compra com só skip (audit.ts:110). Teto zero que zera os tamanhos (sizing-agent.ts:45-47) e fonte velha (candidates.ts:229) são caminhos reais. | correcao: Fonte velha não gera linha fechada: cycle.ts:797 passa [] e nenhuma compra é montada. Caminho omitido: narrowBuysByEntryCost (cycle.ts:870; entry-cost.ts:57) fecha compra antes do modelo com custo_de_entrada_alto (entry-cost.ts:20), que não está em CLOSING (audit.ts:45) e por isso cai como sem marca.
- [A4|fato|alta|VERIF=confirmado] O teto de compra de cada candidato é executableCeiling: caixa da rede (binding caixa), limite da conta de 95% do limite por transação (limite_da_conta), caixa zero (sem_saldo) ou caixa desconhecida (sem_dado). O mínimo por rede está zerado: minBuyUsd retorna 0, com comentário de decisão do dono de 2026-10-14.
    fonte: src/agent/sizing-agent.ts:35-41 (executableCeiling), :24 (PROVIDER_LIMIT_SHARE 0.95); src/agent/candidates.ts:34 (minBuyUsd = 0)
- [A5|inferencia|media] A marca minimo vem do módulo legado de dimensionamento: minOrderUsd de US$ 10 e capFor retorna binding minimo quando o máximo é menor que o mínimo. Esse cap é calculado em ecosystem.ts e não é o cap usado por buyCandidates. Logo, o rótulo minimo nos 387 casos pode não ser a causa do fechamento: a causa pode ser caixa zero da rede. Contradição não resolvida.
    fonte: src/opportunity/sizing.ts:19 e :140; src/opportunity/ecosystem.ts:227-229; src/agent/candidates.ts:242 e :34
- [A6|fato|alta|VERIF=parcial] sem_historico pode ter quatro causas que o registro não separa: menos de minBars velas; buraco maior que 3 h entre velas; última vela com mais de 3 h (MAX_STALE_MS), ou seja, dado defasado; e timeout ou erro de leitura, que vira null pelo catch. Quem decide o limite é timingFacts.
    fonte: src/agent/timing.ts:88 (MAX_STALE_MS = 3 h), :90 (MAX_GAP_MS), :96-97 (timingFacts); src/agent/cycle.ts:800 (.catch(() => null))
    >> parcial: Confirmados: MAX_STALE_MS 3 h (timing.ts:88), MAX_GAP_MS (:90), checagens em :96-97, catch que vira null (cycle.ts:800). live.ts:282 passa readAtMs, então a regra de defasagem vale no caminho real. | correcao: Faltam causas: velas inválidas ou fora de ordem (timing.ts:95-96) e leitura de velas nula (live.ts:282). A lista tem quatro causas; há pelo menos cinco.
- [A7|fato|alta|VERIF=parcial] Não há regra de fechamento de compra por idade do dado. Os facts de candidato de compra são null, e o campo ag (dataAgeMin) só entra no Brief de posições. A idade de fato de compra só é tratada indiretamente, pela janela de velas de A6.
    fonte: src/agent/candidates.ts (construção de buy, facts: null); src/agent/model.ts:221 (ag só em posicoes); src/agent/live.ts:451 (dataAgeMin de posições)
    >> parcial: Confirmado que facts é null nas compras (candidates.ts:266). Refutado que ag só entre no Brief de posições: timingBrief leva ag para tm (model.ts:189) e tm é montado para compras (model.ts:256); cycle.test.ts:555 testa tm.ag no item de compras. | correcao: A idade da última vela entra no brief da compra (tm.ag) e não fecha compra. Fechamento por idade só ocorre indiretamente, pela janela de 3 h (timing.ts:97).
- [A8|fato|media|VERIF=parcial] Os fechamentos de teto diário (teto_diario) ocorrem depois do modelo, em gate.ts, e não antes da escolha. Os cooldowns de venda (TRIM_COOLDOWN, SELL_RETRY_BACKOFF) valem só para posições. Tokens em voo, pendentes ou em saída são retirados antes da lista de auditoria (cycle.ts:868), então não entram nos 411.
    fonte: src/agent/gate.ts:184 e :199; src/agent/cycle.ts:836-848 (cooled) e :868 (filtro de buysFound)
    >> parcial: Confirmados gate.ts:184 e :199 (teto_diario). Cooldowns valem só para posição (cycle.ts:857 e :861). Filtro de buysFound confirmado em cycle.ts:868 (tokens em voo, pendentes e em saída saem antes da lista). | correcao: Linhas erradas: cooled está em cycle.ts:855-864, não em 836-848 (que são as leituras de momentum e lastSaleAt). Que gate.ts roda depois do modelo não foi verificado nesta passada.
- [A9|hipotese|baixa] O fechamento por custo de entrada (custo_de_entrada_alto, ENTRY_COST_CLOSED) acontece antes do Jev, mas esse rótulo não está no conjunto CLOSING. Se ocorreu, cairia no grupo sem marca de bloqueio (4 casos). Não verificado.
    fonte: src/agent/entry-cost.ts:20 e :57; src/decision-review/audit.ts:45
- [A10|calculo|alta|VERIF=confirmado] O registro de auditoria não guarda cap, caixa por rede, idade do timing nem motivo exato. As chaves das linhas de candidato são: id, kind, selected, offered, selectableAlternative, source, observedBlocks, missingBasis, choiceConcentration, requested, facets e gate. Por isso não é possível recalcular com o dado corrente sem novo recorte.
    fonte: data/decision-review/audits.jsonl (contagem de chaves, 411 linhas fechadas); src/decision-review/audit.ts:117
- [A11|inferencia|baixa] O total de 411 fechados e 717 candidatos aparece em docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t12-linha-de-base.md (a2), vindo de data/decision-review/latest.json (janela de 103 consultas). A contagem de audits.jsonl, com 262 consultas, também dá 411 chaves únicas. Não consegui confirmar se os dois recortes têm os mesmos candidatos.
    fonte: docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t12-linha-de-base.md:12; data/decision-review/latest.json (não lido em detalhe)

### Decisao para o Jev

Pergunta: Antes de mudar o funil de compra, qual caminho o ciclo deve executar primeiro para os 411 candidatos fechados antes da escolha do Jev?
Reversivel: true

- so_medir_causa_exata (Só medir a causa exata, sem mudar regra): Reconciliar os 411 fechamentos em tabela de causa exclusiva, por leitura. Nenhuma regra de fechamento muda antes do resultado. | Evidencia: 387 de 411 com marca minimo; 97 sem_historico; audits sem caixa nem cap (A2, A10)
- frescor_timing_antes_de_fechar (Buscar velas mais novas antes de fechar sem_historico): Se a causa for janela acima de 3 h ou timeout, tentar nova leitura de velas antes de marcar sem_historico. Não altera o limiar de 3 h sem medir. | Evidencia: timing.ts:88 MAX_STALE_MS 3 h; cycle.ts:800 catch vira null (A6)
- markout_sem_historico_sombra (Medir markout dos fechados por sem_historico, em sombra): Levar ao Jev, só em sombra e sem ordem, os fechados por sem_historico para medir markout contra os escolhidos, dentro da cota local. | Evidencia: 97 candidatos; cota local 720 por dia (config); Jev responde em 0,37 s (research.md)
- retirar_marca_minimo_legada (Retirar a marca minimo legada do fluxo de compra): Se a causa confirmada for o mínimo legado de US$ 10 e não caixa zero, tirar a marca do fluxo de compra. Só depois de confirmar a causa. | Evidencia: sizing.ts:19 e :140 minOrderUsd 10; candidates.ts:34 minBuyUsd 0 (A5)
- adiar_sem_mudanca (Adiar: não mudar o funil neste ciclo): Manter o funil atual até a causa exata estar medida. Conservador: sem ganho imediato, sem risco de liberar candidato sem caixa. | Evidencia: Linha de base: 0 de 7 voltas positivas, -0,41% bruto (pesquisa-t12 a5)

Recomendacao sem Jev: so_medir_causa_exata - É a opção mais reversível e de menor risco: não muda nenhuma regra, nenhum journal nem caixa. O registro atual não separa caixa zero, mínimo legado e defasagem (A10, A5), então qualquer mudança agora pode fechar o filtro errado. Medir a causa exata é o pré-requisito dos demais caminhos.
Cetico: decisao_ok=false; problemas: Dados legados tratados como funil atual: as 1023 linhas fechadas vêm de 262 linhas de 14/10 19:20 a 15/10 00:52 UTC (103 ciclos), e não há linha depois disso. O código atual não produz minimo nem entrada_esticada; buyCandidates usa executableCeiling e marca esticado (timing.ts:140). A decisão não diz que os dados são de uma versão anterior. | Premissa de fechamento errada: sem_historico não fecha compra no código atual (candidates.ts:273 só marca; testes candidates.test.ts:476 e model.test.ts:311). As opções 'frescor_timing_antes_de_fechar' e 'markout_sem_historico_sombra' miram um fechamento que não ocorre hoje. | Marca não é causa: a partição mostra marcas co-ocorrentes (87 linhas com minimo e sem_historico), mas nenhuma regra prova qual caminho fechou a compra. Os registros gravados não têm cap, caixa nem idade do timing, então a causa exata não está nos dados. | A opção 'so_medir_causa_exata' exige campos novos em audits.jsonl (cap, caixa por rede, idade do timing). Isso é mudança de esquema de journal, vedada pela própria decisão. A opção fica contraditória com a restrição. | A opção 'retirar_marca_minimo_legada' já está feita no código: candidates.ts:34 zera o mínimo e buyCandidates não usa capFor. Se a mudança for no dimensionamento, toca limite por operação (ADENDO-B), que é decisão do dono. Registrar como bloqueio do dono, não como opção. | A cota de 720 por dia é configuração arrojada; o padrão do código é 144 (budget.ts:18). A decisão deve dizer isso. | Entrada cara (custo_de_entrada_alto, entry-cost.ts:20) fecha compra antes do modelo, mas não está em CLOSING (audit.ts:45). Esses casos caem como 'sem marca' e a classificação de bloqueio está incompleta. Mudar src/decision-review/** é zona do Codex (docs/specs/retorno-composto-por-ciclo/spec.md:51). | Os 'desconhecidos' estão escritos como perguntas ao dono (campo ask), o que contraria a regra de nunca perguntar ao dono. Devem virar lacunas de medição, sem forma de pergunta. | A decisão cita A5 e A9 sem que o texto esteja na lista; A5 aponta para opportunity/sizing.ts, que não é o caminho de compra atual. | Registrar como bloqueio do dono, fora das opções: qualquer mudança de esquema do audits.jsonl (campos cap, caixa, idade do timing).

### Bloqueios do dono

- Alterar o esquema do journal data/decision-review/audits.jsonl (campos novos de cap, caixa e idade): assunto de migração de journal, vedado ao Jev.
- Qualquer mudança de caixa, capital ou limite: o capital segue não conciliado (US$ 100, 118, 121 e 126 nos documentos), e a decisão é do dono.
- Limites de risco e liberação de live: fora do alcance desta decisão e do Jev.
- Teto por operação e tetos de código: já decididos pelo dono (ADENDO-B), não são reabertos aqui.

### Novos tickets revelados

- Conciliar a janela dos 411 fechados: O total de 411 de latest.json (103 consultas) e o de audits.jsonl (262 consultas) são o mesmo conjunto de candidatos?
- Origem real da marca minimo nas compras: A marca minimo (cap legado de US$ 10, sizing.ts:140) fecha candidato ou é só rótulo? Para os 387 casos, a caixa da rede era zero?
- Separar sem_historico em quatro causas: Quantos sem_historico são janela curta, buraco de velas, defasagem acima de 3 h ou timeout de leitura (timing.ts:88-97; cycle.ts:800)?

### Nao lido

- docs/_meta/... e data/decision-review/latest.json: não li o detalhe por motivo, só o que a pesquisa-t12 citou.
- decisions-meta.jsonl: o arquivo citado no ticket não foi encontrado no repo nem em data/. A contagem foi feita sobre data/decision-review/audits.jsonl.
- src/agent/gate.ts e conviction.ts: li só as razões de fechamento; não tracei o caminho completo da marca minimo até a lista do ciclo (cycle.ts, view).
- Velas de minuto e cache de brief-freshness: fora do repo, não acessados.
- Nenhuma chamada ao Jev, nenhum serviço pago, nenhuma escrita no repo. Não li .env nem endereços de carteira; a contagem foi agregada e sem IDs.

### Resumo do cetico

Reverifiquei A1 a A10 e a decisão contra o código, os testes, as docs e o audits.jsonl (só agregados, sem IDs). Os números de A1, A2 e A10 batem exatamente: 262 linhas com consulta, 1822 compras, 1023 fechadas, 411 chaves únicas; minimo 387, sem_historico 97, entrada_esticada 22, sem marca 4. Mas a decisão não se sustenta em três pontos: (1) as 411 vêm de uma sessão antiga, de 14/10 19:20 a 15/10 00:52 UTC, com marcas (minimo, entrada_esticada) que o código atual não produz; (2) sem_historico não fecha compra no código atual, então as opções que buscam velas antes de fechar parte de premissa falsa; (3) a opção de medir a causa exata exige campos novos no journal, o que a própria decisão veda. Não pode ir ao Jev como está.

## Comments

