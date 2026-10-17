# Ciclo 2, ticket T20: Ping e silencio no WebSocket da OKX

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: dados
Priority: 20

## Question

O frame de texto 'ping' da OKX reinicia o timer de silencio do servidor, ou so dado de canal conta? Com essa resposta, qual par de limiares de ping e silencio vale para src/inonu/okx-ws.ts (20 s e 45 s) e para src/jev-read/feed.ts (25 s e 60 s)?

Por que importa: okx-ws.ts tolera 45 s de silencio, acima do corte documentado de 30 s, e feed.ts so reconecta apos 60 s. Em canal de baixa liquidez a queda pode ocorrer antes da reconexao do cliente. Fontes: src/inonu/okx-ws.ts:56-57, src/jev-read/feed.ts:90-91, arquitetura-e-decisao.md secao 6, risco 1.
Evidencia a buscar: Documentacao oficial OKX v5 de WebSocket (ping, pong e silencio); teste de duas horas em canal de baixa liquidez contando quedas e mensagens.

## Answer

Servidor OKX derruba conexao sem inscricao ou dado por mais de 30 s. Ping documentado (N menor que 30 s, espera pong), mas pong como dado nao e documentado. Par provisorio: ping 15 s e corte 25 s sem frame de dado. okx-ws.ts (20/45 s) e feed.ts (25/60 s) passam do limite. Urgente: porta 8443 deixa de aceitar WebSocket publico em 31/10/2026; o repo usa 8443. Teste de duas horas nao feito; resposta provisoria.

### Caminhos (Wayfinder)

- **Teste de duas horas em canal quieto**: Ping 15 s sem reconexao contra socket controle sem ping, contando quedas. | Restricao que prende: Pong nao documentado como dado. | Experimento mais proximo: Script fora do repo, canal publico, sem chave, duas horas. | Ganho: Decide entre A e D. Nao medido. | Esforco: baixo | Como medir: Quedas e segundos desde o ultimo dado.
- **Migrar para porta 443 antes de 31/10/2026**: Trocar wss com 8443 por 443 em okx-ws.ts, feed.ts e testes. | Restricao que prende: 8443 deixa de aceitar no publico. | Experimento mais proximo: Conectar 443 com 1965 inscricoes. | Ganho: Evita queda total do feed. Nao medido. | Esforco: baixo | Como medir: Confirmacoes sem erro na 443.
- **Ping 15 s e corte 25 s sem dado**: Aplicar o par provisorio com pong fora da conta de atividade. | Restricao que prende: Corte abaixo de 30 s obriga reconexao periodica em canal quieto. | Experimento mais proximo: Replay com relogio falso e socket falso. | Ganho: Remove cortes acima de 30 s. Nao medido. | Esforco: baixo | Como medir: Reconexoes por hora e lacuna por reconexao.
- **Marcar lacuna no okx-ws**: Contar perda entre reconexoes como o feed.ts faz. | Restricao que prende: Backoff sobe ate 30 s em canal quieto sem marca de lacuna. | Experimento mais proximo: Replay com silencio de 40 s. | Ganho: Trades perdidos visiveis. Nao medido. | Esforco: medio | Como medir: Lacunas marcadas contra reais.

### Achados

- [a1|fato|alta|VERIF=confirmado] Conexao cai sem inscricao ou dado por mais de 30 s (doc OKX v5, secao Connect).
    fonte: https://www.okx.com/docs-v5/en/#overview-websocket-connect
- [a2|fato|alta|VERIF=confirmado] Doc recomenda timer N menor que 30 s, envia 'ping', espera 'pong'.
    fonte: https://www.okx.com/docs-v5/en/#overview-websocket-connect
- [a3|fato|alta|VERIF=confirmado] Doc nao diz se pong renova o prazo de 30 s (100 mil caracteres lidos).
    fonte: https://www.okx.com/docs-v5/en/#overview-websocket-connect
- [a4|fato|alta|VERIF=confirmado] okx-ws.ts usa ping 20 s e silencio 45 s; linha 128 trata pong como atividade local.
    fonte: src/inonu/okx-ws.ts:56-57, 127-128
- [a5|fato|alta|VERIF=confirmado] feed.ts usa ping 25 s e reconexao 60 s; pong zera lastMessageAtMs; teste feed.test.ts:389 assume pong como atividade.
    fonte: src/jev-read/feed.ts:90-91, 520-521; feed.test.ts:389
- [a6|inferencia|media] Cortes de 45 s e 60 s so agem em socket meio aberto; queda normal reconecta pelo evento de fechamento.
    fonte: okx-ws.ts:195-200; feed.ts:476-478
- [a7|fato|alta|VERIF=confirmado] okx-ws.ts zera backoff so com trade inscrito; em canal quieto a espera sobe ate 30 s sem marcar lacuna.
    fonte: src/inonu/okx-ws.ts:116, 145, 200
- [a8|fato|alta|VERIF=parcial] Porta 8443 aparece em okx-ws.ts:13, feed.ts:81 e em testes.
    fonte: grep em src/
    >> parcial: Estao corretos okx-ws.ts:13 e feed.ts:81. Ha mais ocorrencias de producao fora do citado: src/public-market-capture/plan.ts:4 (ENDPOINTS.websocket), src/public-market-capture/node-adapter.ts:70 (port: 8443 literal) e src/settings/providers.json:15 (configuracao). Os demais sao testes em src/desktop, src/jev-read/feed.test.ts e src/public-market-capture/capture.test.ts. | correcao: Substituir 'okx-ws.ts:13, feed.ts:81 e em testes' por: okx-ws.ts:13, feed.ts:81, public-market-capture/plan.ts:4, public-market-capture/node-adapter.ts:70, settings/providers.json:15, mais testes em desktop/, jev-read/feed.test.ts e public-market-capture/capture.test.ts.
- [a9|fato|media|VERIF=confirmado] Changelog OKX: 8443 deixa de aceitar no publico em 31/10/2026; 443 funciona.
    fonte: https://www.okx.com/docs-v5/log_en/
- [a10|fato|media] Evento notice 64008 com 60 s de antecedencia (entrada 2026-06-11); repo ignora notice.
    fonte: https://www.okx.com/docs-v5/log_en/; okx-ws.ts:137-141
- [a11|calculo|media] Reconexao a cada 25 s nao esgota 480 inscricoes por conexao por hora nem 3 req/s por IP.
    fonte: https://www.okx.com/docs-v5/en/#overview-websocket-connect
- [a12|hipotese|baixa] Fonte de terceiros diverge sobre ping; nao usar como base.
    fonte: https://github.com/lhzk377/okx-websocket-api-docs

### Decisao para o Jev

Pergunta: Quais limiares de ping e de silencio sem dado adotar em okx-ws.ts e feed.ts, sabendo que o servidor fecha apos 30 s sem dado e que o pong nao esta provado como dado?
Reversivel: true

- A-ping15-corte25 (Ping 15 s e corte 25 s sem dado): Nos dois arquivos: ping apos 15 s sem dado; reconectar apos 25 s sem frame de dado, pong fora da conta. | Evidencia: Doc OKX: corte acima de 30 s; pong nao documentado
- B-so-medir (Adiar: so medir antes): Nao muda limiares agora; roda teste de duas horas e depois escolhe o par. | Evidencia: Teste ainda nao feito
- C-ping20-corte28 (Ping 20 s e corte 28 s): Menos reconexoes que A, margem de 2 s antes do corte do servidor. | Evidencia: Ping de 20 s em fonte de terceiros; corte de 30 s na doc
- D-pong-conta-40 (Pong zera silencio, corte 40 s): Assume que pong renova o prazo do servidor; so admissivel se o teste provar. | Evidencia: Pong nao documentado; feed.test.ts:389 assume
- E-status-quo (Manter 20/45 e 25/60): Nao muda nada; cortes de 45 s e 60 s passam de 30 s. | Evidencia: okx-ws.ts:56-57; feed.ts:90-91

Recomendacao sem Jev: A-ping15-corte25 - Constantes reversiveis, valem nas duas leituras da regra de 30 s e ficam dentro dos limites de inscricao. A troca de 8443 para 443 e separada e obrigatoria antes de 31/10/2026.
Cetico: decisao_ok=false; problemas: Premissa do ping nao provada: as opcoes A e C tratam o ping como protecao contra o corte de 30 s do servidor. Se pong nao renova o prazo (a3), o ping so detecta socket travado no cliente; a unica protecao contra o corte do servidor e fluxo de dados. A decisao precisa separar esses dois efeitos antes de escolher limiares. | Opcao C com evidencia errada: 'Ping de 20 s em fonte de terceiros' nao corresponde a nada externo; o 20 s e o proprio valor de src/inonu/okx-ws.ts:56. | Escopo de a8 subestimado: a troca de porta 8443 para 443 atinge pelo menos cinco arquivos de producao (plan.ts:4, node-adapter.ts:70, providers.json:15 alem de okx-ws.ts e feed.ts), nao so os dois citados. O prazo de 31/10/2026 torna essa migracao urgente e ela deveria constar como restricao com lista completa. | Escopo do silencio nao definido: a doc fala em 'dado' sem dizer se e por conexao ou por canal. Em instrumento raso sem trade por mais de 25 s, a opcao A recicla a conexao em loop, e a decisao nao diz se o criterio e por conexao. | a7 nao tratado: okx-ws.ts:145 zera o backoff so com trades de instId inscrito, enquanto feed.ts:546 zera com qualquer dado. Nenhuma opcao cobre esse desalinhamento. | Premissa de fato 'pong_como_dado: nao documentado' esta correta na secao lida, mas a leitura foi parcial (100 mil de 406 mil caracteres); a decisao deveria registrar essa ressalva.

### Bloqueios do dono

- Aceitar o risco de termos da OKX (secao 9.4): decisao do dono.
- Live ou dinheiro real: so por autorizacao do dono.

### Novos tickets revelados

- Migrar 8443 para 443: A troca de URL ocorre antes de 31/10/2026, com teste de 1965 inscricoes na 443?
- Teste de duas horas do pong: O pong renova o prazo de 30 s do servidor em canal de baixa liquidez?
- Marcar lacuna no okx-ws: okx-ws.ts deve contar a perda entre reconexoes e zerar backoff com qualquer dado?
- Tratar evento notice 64008: Reconectar ao receber notice, antes da queda?

### Nao lido

- Restante da doc OKX v5: lidos 100 mil de 406 mil caracteres.
- Changelog OKX: lidos 100 mil de 594 mil; datas por resumo do WebFetch, nao no navegador.
- Teste de duas horas e conexao real na 443: nao executados.
- Frequencia de trades por instrumento de baixa liquidez: nao medida.

### Resumo do cetico

Reverifiquei as nove afirmacoes do ticket T20 contra o codigo (arquivo:linha) e contra a doc OKX v5 e o log de mudancas. Sete estao confirmadas, uma esta parcial (a8, porta 8443 aparece em mais arquivos de producao do que o citado) e uma esta confirmada com ressalva (a3, a doc nao diz se pong renova o prazo; li 100 mil de 406 mil caracteres). A decisao nao pode ir ao Jev como esta: as opcoes A e C supoem que o ping protege contra o corte do servidor, premissa que depende de pong renovar o prazo, ainda nao provado; a opcao C cita como evidencia uma fonte de terceiros que nao existe (o 20 s vem do proprio repo, okx-ws.ts:56); e nao ha opcao para o problema de backoff de a7. Porta 8443 deixa de aceitar no publico em 31/10/2026 (colo em 16/11/2026), o que torna a migracao para 443 urgente e de escopo maior que o descrito.

## Comments

