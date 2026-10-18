# Ciclo 2, ticket T15: Cadencia da consulta ao Jev na sombra

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: 02
Domain: decisao
Priority: 15

## Question

Na fase de sombra, qual cadencia adotar entre (a) relogio fixo de 2 minutos, (b) evento com prova de consumo, em que o evento so conta como consumido quando seu hash entra no Brief consultado, e (c) entrada armada pelo codigo, que consulta o Jev so ao atingir a condicao de gatilho, mantido o teto de 720 consultas por dia?

Por que importa: O relogio de 2 minutos limita o ritmo hoje (wire.ts:279-297, autopilot.ts:38). 1 minuto exigiria 1440 consultas e o orcamento recusa a 721a (budget.ts:101). A escolha entre cadencias define a ingestao e nao muda o teto, que e cobranca e fica como bloqueio do dono. Piso de intervalMin (config.ts:98) e consequencia e reverte por commit.
Evidencia a buscar: arquitetura-e-decisao.md secoes 1, 4 e 5; src/agent/autopilot.ts; src/agent/wire.ts:279-310; src/intel/brief.ts:16; contrato de consumo de evento em src/pulse/facts.ts (somente leitura); src/decision-review/** somente leitura.

## Answer

Recomendo adiar a troca de cadência: manter o relógio de 2 min como conciliação e só gravar eventos em sombra, sem consultar o Jev. Em leitura, o relógio de 1 min com teto 720 gera 720 consultas e 720 recusas por ritmo_do_dia (budget.ts:101-107), o mesmo volume do relógio de 2 min. 1440 consultas por dia fica fora da faixa validada (config.ts:97, máximo 1000). A cadência por evento depende de prova de consumo que é zona do Codex (decision-review/events.ts:29-31). T02 não mediu nenhum markout, então a escolha é de custo e latência, não de edge.

### Caminhos (Wayfinder)

- **Gravador de eventos sem consulta**: Gravar em sombra os eventos do guarda e os fatos com factHash, sem chamar o Jev, mantendo o relógio de 2 min para decisão. | Restricao que prende: Sem markout mensurável (T02) e cota real desconhecida. | Experimento mais proximo: Uma semana de gravação de eventos com hash, sem nenhuma consulta extra. | Ganho: Não há ganho de lucro direto; produz o dado que falta para escolher cadência. | Esforco: baixo | Como medir: Eventos por hora, fração com hash que chegaria ao Brief no próximo relógio, latência entre origem do fato e evento.
- **Replay de eventos contra o portão de ritmo**: Reproduzir os eventos gravados contra simulateDay estendido para medir quantos seriam recusados por ritmo_do_dia. | Restricao que prende: A reserva de 5% do teto (budget.ts:105) é a única folga para rajadas. | Experimento mais proximo: Replay offline de um dia de eventos gravados, com teto 720 e reserva de 36. | Ganho: Dimensiona a reserva sem tocar no teto, que é do dono. | Esforco: baixo | Como medir: Recusas por ritmo_do_dia por hora e taxa de eventos atendidos com reserva de 36 versus 72.
- **Prova de consumo com Jev falso**: Testar o contrato de consumo por hash com um Jev falso, em cópia isolada, e verificar que nenhum sinal fora do Brief fica marcado como consumido. | Restricao que prende: A zona src/decision-review/** é do Codex; a mudança cabe a ele. | Experimento mais proximo: Teste sintético de lote com 50 instrumentos e duas versões do mesmo fato, como pede a aceitação E3. | Ganho: Torna a cadência por evento segura contra falso positivo. | Esforco: médio | Como medir: Falsos positivos de consumido em zero, e número de eventos adiados, expirados e analisados em estados separados.
- **Carimbar etapas antes de mudar cadência**: Carimbar início e fim de cada etapa do ciclo sem mudar a decisão (S1 do documento de arquitetura). | Restricao que prende: Hoje só existe durationMs do ciclo (cycle.ts:440) e a amostra tem 15 ciclos com consulta. | Experimento mais proximo: Mil ciclos com etapas carimbadas antes de qualquer p95 ser usado em decisão. | Ganho: Mostra quanto do pré-modelo de 170 s é espera real. | Esforco: médio | Como medir: p50, p95 e p99 de origem do dado até recibo, por etapa.
- **Gatilho pelo código sem ordem**: Testar o gatilho de consulta definido pelo código (opção c) com executor falso, sem enviar ordem e sem consultar o Jev em produção. | Restricao que prende: E4 exige contrato de decisão, reserva única de saldo e parada de emergência, fora deste ticket. | Experimento mais proximo: Modelo falso e executor falso em cópia isolada, contando quantos gatilhos ocorreriam por dia. | Ganho: Consultas proporcionais a eventos, não ao relógio. | Esforco: médio | Como medir: Gatilhos por dia com teto 720 e fração de gatilhos que caem na reserva.

### Achados

- [A1|fato|alta|VERIF=parcial] O intervalo quente do agente é de 2 min (HOT_INTERVAL_MIN). O perfil arrojado pode chegar a 1 min (BOLD_HOT_FLOOR_MIN), mas só enquanto sobrar capacidade de consultas no dia.
    fonte: src/agent/autopilot.ts:38 e :47-59; src/agent/wire.ts:277-297
    >> parcial: Em autopilot.ts:38, HOT_INTERVAL_MIN = 2 e autopilot.ts:47, BOLD_HOT_FLOOR_MIN = 1 estão corretos. Mas wire.ts:291-296 mostra que o intervalo quente só fica dinâmico (até 1 min, ou sem limite sem capacidade) para o perfil arrojado. Para os demais perfis, hotIntervalNow devolve 2 fixo (wire.ts:292). A frase 'o intervalo quente é de 2 min' vale só para os outros perfis. O intervalo quente só se aplica com marketHot e withinQuota (wire.ts:297). | correcao: O 2 min é o intervalo quente padrão dos perfis não arrojados. Para o perfil arrojado (OWNER_PROFILE, autopilot.ts:34) o intervalo quente é dinâmico, entre 1 min e sem limite conforme a capacidade restante (autopilot.ts:55-59, wire.ts:291-296). Em nenhum caso o ritmo base pode ser de 2 min: config.ts:98 exige intervalMin entre 5 e 240.
- [A2|fato|alta|VERIF=confirmado] O orçamento recusa a 721ª consulta (consultas_esgotadas) e antes disso aplica um portão de ritmo do dia: consultas acumuladas não passam de floor(teto x fração do dia) + reserva, com reserva max(2, ceil(5% do teto)), que dá 36 com teto 720. O cliente usa pace: true.
    fonte: src/agent/budget.ts:101-107; src/agent/wire.ts:230
- [A3|calculo|alta|VERIF=confirmado] Simulação de um dia com o portão real, sem chamada a provedor (simulateDay, leitura): relógio de 1 min com teto 720 agenda 1440, consulta 720 e recusa 720; relógio de 2 min consulta 720 e recusa 0; relógio de 1 min com teto 1440 consulta 1440; relógio de 5 min consulta 288.
    fonte: src/decision-review/cadence.ts (simulateDay), executado com bun em leitura; nenhum arquivo alterado
- [A4|fato|alta|VERIF=parcial] A validação aceita maxConsultsPerDay de 1 a 1000, então 1440 fica fora da faixa. O default de 720 não foi localizado em config.ts por busca comum (o arquivo é tratado como binário); a origem do 720 como default fica não verificada.
    fonte: src/agent/config.ts:97 (busca com grep -a)
    >> parcial: A faixa 1 a 1000 está confirmada em config.ts:97. Mas o default não é 720: config.ts:58 usa budget: DEFAULT_LIMITS, e budget.ts:18 define maxConsultsPerDay: 144. O 720 aparece só em comentário (autopilot.ts:51) e em testes. O valor vivo do dono vem da configuração persistida, que não foi lida aqui. | correcao: Default do código: 144 (budget.ts:18, config.ts:58). O teto de 720 é valor configurado, não default; sua origem na configuração real é nao_verificavel sem leitura do arquivo de configuração persistido.
- [A5|fato|media|VERIF=confirmado] Já existe despachante de eventos ligado ao ciclo: eventos do guarda (guard_book) pedem requestCycle com admissão por orçamento e intervalo mínimo de 90 s. Se está ligado em produção não foi verificado.
    fonte: src/agent/wire.ts:655-672, :71 (EVENT_MIN_GAP_MS = 90000), :75 (EVENT_TOKEN_ESTIMATE = 4000); src/agent/event-source.ts:1-12
- [A6|fato|alta|VERIF=confirmado] O agendador usa uma cadeia de timers únicos, conta o próximo ciclo a partir do fim do anterior e tem voo único para requestCycle. Isso prova que o ciclo rodou, não que o fato entrou no Brief.
    fonte: src/agent/scheduler.ts:2-3, :24, :124, :196-200
- [A7|fato|alta|VERIF=confirmado] O contrato de decisão de eventos diz que compartilhar uma revisão anterior não é consumo, e o reconhecimento é por versões exatas do lote. A zona é do Codex e não foi alterada.
    fonte: src/decision-review/events.ts:29-31 (leitura)
- [A8|fato|alta|VERIF=confirmado] O fato de origem carrega factHash, que é o hash canônico SHA-256 do fato e a referência que precisa chegar ao Brief para contar como consumido. O contexto macro casa o snapshot por factHash e só aceita reconhecimento se o ciclo foi consultado.
    fonte: src/pulse/facts.ts:78, :97, :125; src/agent/macro-context.ts:115, :191
- [A9|fato|alta] O ciclo de 1 min é inviável no pior caso: a soma pré-modelo é 170 s e o Jev 90 s (pior 260 s). No dado observado (15 ciclos com consulta) a mediana é 2,9 s e o p95 é 38 s, com intervalo mediano de 135,6 s contra 120 s nominais.
    fonte: docs/specs/retorno-composto-por-ciclo/arquitetura-e-decisao.md:55-65 (seção 4)
- [A10|fato|alta] Nenhum markout de 1, 5, 15 ou 60 min é mensurável com os registros existentes; o funil tem 717 candidatos e 57,3% fechados antes do modelo. Não há evidência de edge que escolha uma cadência sobre outra.
    fonte: resposta do ticket T02 e docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:11 e :32
- [A11|inferencia|media] O portão de ritmo do dia não distingue relógio de evento. Um evento que consome cota antes do ritmo fica sem cota nas horas seguintes, e a reserva de 36 é o único espaço para rajadas.
    fonte: src/agent/budget.ts:102-107 combinado com A3
- [A12|fato|alta] O documento de arquitetura já define a forma híbrida (E3): relógio de 2 min para conciliação e evento com prova de consumo, com aceitação em modelo falso. A integração de consumo depende de contrato do Codex.
    fonte: docs/sdd/agente-autonomo/ADENDO-E-velocidade-amplitude-execucao-armada.md (seção E3)

### Decisao para o Jev

Pergunta: Na sombra, qual cadência de consulta ao Jev adotar com o teto de 720 consultas por dia?
Reversivel: true

- so_medir (Manter relógio de 2 min e só gravar eventos): Relógio de 2 min decide. Eventos com factHash são gravados em sombra sem consultar o Jev, para medir a cadência por evento antes de ligá-la. | Evidencia: Simulação: 2 min consome 720 e recusa 0; T02 sem markout.
- relogio_2min (Relógio fixo de 2 min como única cadência): Só o relógio de 2 min consulta. Não há evento de consulta. É o comportamento atual da sombra, com volume que cabe no teto de 720. | Evidencia: budget.ts:102-107 casa com 720 por dia; autopilot.ts:38.
- evento_prova_consumo (Evento com prova de consumo e relógio de conciliação): Eventos materiais disparam consulta com admissão por orçamento, e o evento só é consumido quando o hash entra no Brief. O relógio de 2 min segue para conciliação. | Evidencia: facts.ts:97; events.ts:29-31; ADENDO-E seção E3.
- armada_pelo_codigo (Consulta só ao atingir gatilho do código): O código arma a consulta quando a condição de gatilho é atingida. A consulta acontece só então, dentro do teto de 720. Exige contrato de decisão separado. | Evidencia: E4 exige contrato de decisão e executor; fora deste ticket.
- relogio_1min (Relógio fixo de 1 min, 1440 consultas por dia): Relógio de 1 min. Com teto 720 o portão recusa metade; para atender 1440 seria preciso aumentar o teto, que é decisão do dono. | Evidencia: config.ts:97 limita a 1000; simulação: 720 consultas e 720 recusas.

Recomendacao sem Jev: so_medir - É a opção mais reversível e de menor risco: não muda o ritmo, o portão de ritmo nem o contrato do Codex, e produz o dado de eventos que falta. Sem T02 e sem cota conhecida, nenhuma cadência tem evidência de edge; a simulação mostra que 1 min não aumenta o volume diário, só recusa.
Cetico: decisao_ok=false; problemas: relogio_1min aparece em opcoes e também na lista 'proibidas'. A decisão se contradiz. Além disso, 1440 consultas fica fora da faixa de config.ts:97 (máximo 1000), e intervalMin de 1 minuto fica fora da faixa de config.ts:98 (5 a 240). A opção é inviável pela configuração atual e não só proibida por política. | A descrição de relogio_2min ('é o comportamento atual da sombra') está errada. O ritmo base não pode ser 2 min (config.ts:98 exige 5 a 240). Os 2 min valem só como intervalo quente, e para o perfil arrojado, que é o perfil do dono, o intervalo cai até 1 min (wire.ts:291-296). Opções que descrevem o estado atual precisam ser reescritas. | Restrição 'Nenhuma consulta ao Jev nesta fase' contradiz as opções: so_medir mantém o relógio de 2 min que consulta, e relogio_2min e evento_prova_consumo consultam. A restrição só vale se houver uma opção sem consulta alguma. | so_medir e relogio_2min se sobrepõem quase por completo (diferem só pela gravação de eventos), e evento_prova_consumo e armada_pelo_codigo são ambas consultas disparadas por evento. Faltam alternativas distintas para o eixo principal da decisão. | A evidência 'T02 sem markout' e a referência 'ADENDO-E seção E3' não foram verificadas nesta revisão e não estão nas afirmações A1 a A8. Ficam como nao_verificavel. | O campo 'desconhecidos' traz perguntas formuladas para o dono ('lido só pelo dono no console'). Pela regra de não perguntar ao dono, isso deveria estar em bloqueios_do_dono, não na decisão enviada ao Jev. O campo 'proibidas' também não faz parte do schema de decisão. | Escolher a cadência de consultas a um serviço pago (Jev, com cota e custo por consulta) toca a categoria 'billing ou serviços pagos', que o Jev nunca decide. Cota e custo devem ficar como bloqueio do dono, e as opções devem se limitar a consumo abaixo do teto já definido pelo dono.

### Bloqueios do dono

- Teto de consultas por dia (maxConsultsPerDay) e cota real da organização na TypeSafe: decisão de custo, só o dono lê no console.
- Ligar de fato o despachante de eventos em produção e qualquer mudança de configuração persistente da cadência.
- Entrada armada (opção c) que leve a ordem, saldo ou execução: fica sob ordens e liberação de live, vedado ao Jev.
- Custo e preço por consulta do Jev, qualquer serviço pago novo ou aumento de cota.

### Novos tickets revelados

- Reserva de ritmo para eventos: A reserva de 36 consultas (5% do teto) basta para rajadas de eventos sem recusar eventos materiais?
- Estado do despachante guard_book: O despachante de eventos do guarda (wire.ts:655-672) está ligado em produção e quantos eventos gera por dia?
- Origem do default 720: Em qual arquivo está o default de maxConsultsPerDay de 720, já que config.ts não mostra o valor por busca comum?
- Contrato de ack por hash: O Codex pode publicar o contrato de reconhecimento por hash que prova consumo, com testes de falso positivo?

### Nao lido

- data/ e os registros answers.jsonl e prices.jsonl não estão no repo (conforme T02), então nenhum eventos reais foi lido.
- Origem do default de 720 consultas: não localizada em config.ts por busca comum; o arquivo é binário para grep.
- Se o despachante guard_book está ligado na configuração de produção.
- Corpo completo de src/agent/event-source.ts e da admissão em wire.ts:640-672; lidos só o cabeçalho e as constantes.
- Cota real da organização TypeSafe e contagens do console (só o dono).
- Nenhuma chamada ao Jev, à OKX ou a outro serviço foi feita; a simulação usou só o código de cadência em leitura.

### Resumo do cetico

Reverificadas as 8 afirmações contra o código (leitura e uma execução read-only de simulateDay com bun, sem chamada a provedor e sem alterar arquivos). A2, A3, A5, A6, A7 e A8 se sustentam, com correções pontuais de linha. A1 vale só para o perfil arrojado, que é o perfil do dono (autopilot.ts:34), e A4 está parcialmente errada: o default de maxConsultsPerDay é 144, não 720 (budget.ts:18 via config.ts:58). A decisão não pode ir ao Jev como está: uma opção está listada também como proibida, o 2 min é descrito como comportamento atual quando o código dá outra coisa, falta a opção de relógio de 5 min que o config aceita, e há campos de perguntas ao dono.

## Comments

