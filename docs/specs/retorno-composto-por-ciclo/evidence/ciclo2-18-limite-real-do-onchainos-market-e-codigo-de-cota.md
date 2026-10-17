# Ciclo 2, ticket T18: Limite real do OnchainOS Market e codigo de cota esgotada

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: ecossistema
Priority: 18

## Question

Qual a unidade (por chave, IP ou conta) e o valor do limite por segundo do OnchainOS Market no plano Free, e qual codigo HTTP e de erro a API devolve ao esgotar a cota mensal: 402, ou 50011 com 429?

Por que importa: O piso de 1 requisicao por segundo do cliente e configuracao local, nao limite medido, entao o governador de cota nao pode ser dimensionado. Tambem resolve a divergencia entre src/onchainos/http.ts:427-439 (402 bloqueia ate o reset) e docs/sdd/inonu-desktop-v1/onchainos-coverage.md:33 (402 vira cota esgotada).
Evidencia a buscar: Paginas market-api-fee e de codigos de erro do Market lidas como texto integral no navegador, nao por resumo. Nao ler nem expor a chave de API. Contato de suporte so se o dono decidir enviar.

## Answer

O OnchainOS Market não publica limite por segundo (por chave, IP ou conta: não verificado). O piso de 1 RPS é configuração local (src/onchainos/http.ts:508). O código de limite de taxa é 50011 com HTTP 429, "Rate limit reached" (páginas de erro Market, Token, Balance e Onchain Core Data). A página de tarifas diz que, esgotada a cota, é preciso pagar, e o guia x402 começa no HTTP 402; nenhuma página lida dá código específico para cota esgotada. Logo, 402 é pagamento exigido e 50011 é limite de taxa. A linha de onchainos-coverage.md:33 ("402 vira cota esgotada") está errada e deve ser corrigida. O código atual (http.ts:427) bloqueia chamadas até o reset UTC do mês.

### Caminhos (Wayfinder)

- **Corrigir o documento de cobertura ao código e à página oficial**: Trocar em onchainos-coverage.md:33 '402 vira cota esgotada' por '402 = pagamento exigido (x402, fora da v1)' e registrar 50011 como limite de taxa. Sem mudança de código. | Restricao que prende: Código de cota esgotada não está publicado (A5). | Experimento mais proximo: Diff de uma linha no documento e busca por 'cota esgotada' em docs/sdd. | Ganho: Qualitativo: evita desenhar o governador de cota sobre uma premissa errada. | Esforco: Baixo, minutos. | Como medir: Busca sem ocorrências da frase errada e revisão cruzada com http.ts:427-439.
- **Observar os códigos reais em sombra, sem chamadas extras**: Agregar por rota e por dia os eventos de status e apiCode que o cliente já emite (http.ts:419-467): contar 429, 50011 e 402 reais. | Restricao que prende: A cota Basic projeta acima do teto (research.md:14), mas não se sabe quando o 402 aparece nem qual código o acompanha. | Experimento mais proximo: Relatório diário de status e apiCode nos eventos já emitidos, durante 7 dias. | Ganho: Confirma em conta real o código que volta com a cota no fim, sem gastar cota a mais. | Esforco: Baixo a médio. | Como medir: Contagem por status, apiCode e rota; comparar com o contador de cota de scripts/api-budget.ts.
- **Medir o RPS com endpoints Free, a proposta a ser executada depois**: Rajada de cerca de 20 chamadas a 1 RPS e outra a 2 RPS em um endpoint listado como gratuito (por exemplo /api/v6/dex/market/supported/chain), contando 50011 e 429. | Restricao que prende: Não se sabe se endpoints Free contam no limite de taxa nem na cota (A1, nao verificado); o teste usa a chave do dono. | Experimento mais proximo: Duas rajadas curtas de 20 chamadas, sem chamadas Basic ou Premium. | Ganho: Número medido de RPS para dimensionar o governador, em vez do piso de 1 RPS. | Esforco: Baixo, mas exige aprovação do dono antes de rodar. | Como medir: Taxa de 429 e 50011 por rajada; se a rajada gratuita não bater no limite, o teto não se mede por esse caminho.
- **Perguntar ao BD da OKX por escrito sobre RPS e código de cota**: Pedir ao BD (dexapi@okx.com) o RPS da conta, a unidade (chave, IP ou conta), o fuso do reset e o código de cota esgotada. | Restricao que prende: Só o dono pode enviar mensagem a terceiros; o prazo de resposta não é conhecido. | Experimento mais proximo: Mensagem ao BD com as quatro perguntas, enviada pelo dono. | Ganho: Resposta oficial que fecha a divergência de A10 e o RPS. | Esforco: Baixo para o dono. | Como medir: Resposta registrada na spec, com data e fonte.
- **Governador de cota por rota com cache, dimensionado depois da medição**: Contador de chamadas por rota (RC-T2) e cache por idade para caber mais ciclos no Free, com RPS e cota ajustados pelos dados das etapas anteriores. | Restricao que prende: Sem RPS medido o governador usa 1 RPS fixo (A11), e o código de cota é desconhecido (A5). | Experimento mais proximo: Contador por rota em sombra e taxa de acerto de cache em replay, sem mudar o comportamento de 402. | Ganho: Reduz chamadas Basic e atrasa o 402 do mês; número a medir. | Esforco: Médio. | Como medir: Projeção mensal por rota com Basic e Premium separados, e chamadas evitadas pelo cache.

### Achados

- [A1|fato|alta|VERIF=confirmado] O Market não publica limite por segundo, minuto ou dia. A página cita só 'RPS adjustments' e manda procurar o Discord ou o BD (dexapi@okx.com).
    fonte: https://web3.okx.com/pt-br/onchainos/dev-docs/market/market-api-fee (lida como texto integral no navegador)
- [A2|fato|alta|VERIF=parcial] Código 50011, HTTP 429, mensagem 'Rate limit reached. Please refer to API documentation and throttle requests accordingly'. Aparece nas páginas de erro Market Price, Token, Balance e Onchain Core Data. Não há cabeçalho de limite restante documentado.
    fonte: https://web3.okx.com/pt-br/onchainos/dev-docs/market/market-price-error-code; .../market-token-error-code; .../balance-error-code; .../onchaindata-error-code
    >> parcial: Confirmado na página market-price-error-code: 50011, HTTP 429, 'Rate limit reached. Please refer to API documentation and throttle requests accordingly'. As páginas token, balance e onchaindata não foram lidas, então a afirmação sobre elas é nao_verificavel. Também não há cabeçalho de limite restante na página lida. | correcao: Restringir a afirmação à página Market Price, ou ler as outras três páginas antes de citá-las.
- [A3|fato|alta|VERIF=confirmado] A página de tarifas diz que, esgotado o gratuito, é preciso pagar para continuar e que o fluxo de cobrança começa com a resposta 402. Não informa código de cota esgotada nem o HTTP de cota na assinatura.
    fonte: https://web3.okx.com/pt-br/onchainos/dev-docs/market/market-api-fee (seções Overview e Charging Flow)
- [A4|fato|alta|VERIF=parcial] O guia de pagamento x402 define o 402 como sinal de pagamento exigido em endpoint pago do Market, com reenvio de PAYMENT-SIGNATURE. Os códigos de pagamento (nonce_used, insufficient_balance etc.) vêm no corpo, sem código de cota.
    fonte: https://web3.okx.com/pt-br/onchainos/dev-docs/market/how-to-finish-api-payment; tabela 'Payment error handling' em .../market/market-token-error-code
    >> parcial: O guia how-to-finish-api-payment confirma 402 como sinal de pagamento exigido (HTTP 402 Payment Required) e o reenvio com PAYMENT-SIGNATURE. Não há código de cota. 'nonce_used' aparece só como exemplo de falha ('invalid signature, nonce_used'). 'insufficient_balance' não aparece nesse guia; aparece na tabela de erros de pagamento da página market-price-error-code. | correcao: Citar o guia para o 402 e o PAYMENT-SIGNATURE, e a tabela de pagamento da página market-price-error-code para insufficient_balance.
- [A5|inferencia|media] Na cobrança por chamada (x402), esgotar a cota leva a resposta 402. Para a cota mensal da assinatura ou do Free, a página não diz qual código volta.
    fonte: Combinação de A3 e A4; nenhuma página lida cita o código de cota esgotada
- [A6|fato|alta|VERIF=parcial] Nenhuma tabela de erro do Market lida (Market Price, Token, Index Price, Balance, Onchain Core Data) lista 402 ou código de cota.
    fonte: Páginas .../market/*-error-code lidas nesta sessão
    >> parcial: Nas páginas Market Price (tabela de erros e tabela de erros de pagamento) não há 402 nem código de cota. Token, Index Price, Balance e Onchain Core Data não foram lidas nesta verificação. | correcao: Limitar a afirmação às páginas lidas, ou ler as demais antes de dizer 'nenhuma'.
- [A7|fato|alta|VERIF=confirmado] Trade (não Market): Trial com 1 RPS por padrão, até 5 sob aprovação, 60 dias. Start-up 2 a 50 RPS. 'RPS adjustment is correlated to trading volume'. Não diz se o RPS vale por chave, IP ou conta.
    fonte: https://web3.okx.com/pt-br/onchainos/dev-docs/trade/api-fee
- [A8|fato|alta|VERIF=confirmado] O cliente trata 402 como pagamento exigido: grava paymentBlockedUntil até o próximo mês UTC e bloqueia todas as chamadas depois (sem pagamento). Mensagem em http.ts:406 e 439.
    fonte: src/onchainos/http.ts:332, 345, 406, 427, 439
- [A9|fato|alta|VERIF=confirmado] Retry só para 429 e 5xx (até maxRetries, backoff). Um corpo com code diferente de '0' em HTTP 200 vira erro kind 'api' sem retry, então 50011 com HTTP 200 não é retentado. A documentação só cita 429.
    fonte: src/onchainos/http.ts:425, 429-434, 462-466
- [A10|fato|alta] A linha mkt-x402 de onchainos-coverage.md diz '402 vira cota esgotada', em contradição com o código (A8) e com a página de cobrança (A3). A correção do documento não depende de código novo.
    fonte: docs/sdd/inonu-desktop-v1/onchainos-coverage.md:33; docs/specs/retorno-composto-por-ciclo/api-limites-e-fontes.md:24
- [A11|fato|alta] Piso local: requestsPerSecond 1 e burst 1 por padrão; limite do ajuste entre RATE_LIMITS.min e max. Valor de configuração, não medido.
    fonte: src/onchainos/http.ts:156-157, 508, 515-516
- [A12|calculo|alta] Com 1 chamada por segundo, as 100 mil chamadas Basic do mês se esgotam em cerca de 27,8 horas de uso contínuo (100000 / 3600). A média diária que a cota comporta é cerca de 3.333 chamadas (100000 / 30).
    fonte: Cota de market-api-fee (A3) e piso local (A11)

### Decisao para o Jev

Pergunta: Como o cliente do OnchainOS Market deve tratar HTTP 402 e 50011 enquanto o código de cota esgotada não for medido?
Reversivel: true

- manter_bloqueio_402 (Manter o código: 402 bloqueia até o reset UTC): Sem mudança em http.ts. 402 segue como pagamento exigido com bloqueio até o próximo mês; 429 e 50011 seguem com retry limitado. Só o documento muda. | Evidencia: http.ts:427, 406; market-api-fee: 'After receiving 402 response'
- alinhar_doc_e_medir (Corrigir o documento e medir códigos em sombra): Código igual. onchainos-coverage.md:33 passa a dizer 402 = pagamento exigido. Conta status e apiCode por rota a partir dos eventos já emitidos, para ver o código de cota real antes de mudar o cliente. | Evidencia: coverage.md:33 contradiz http.ts:438-439; eventos em http.ts:419-467
- governador_rps_medido (Ajustar RPS e burst só depois de medir): Antes de mudar o código, medir 50011 com endpoints Free em 1 e 2 RPS. Só então ajustar burst e RPS. Nenhum valor novo é gravado sem medição. | Evidencia: Trade: Trial 1 RPS (trade/api-fee); Market não publicado (market-api-fee)
- 402_transitorio (Tratar 402 como erro transitório com retry): Retentar 402 com backoff, como 429, até maxRetries, em vez de bloquear até o reset. Pode gastar tentativas sem resultado. Reversível em um commit. | Evidencia: http.ts:425 retenta só 429 e 5xx; sem código de cota publicado
- adiar_so_medir (Adiar: nenhuma mudança até o BD ou o console responder): Não altera documento nem código. Espera a resposta do BD (dexapi@okx.com) ou o painel da conta sobre RPS, unidade e código de cota. Opção conservadora. | Evidencia: RPS e unidade não publicados (market-api-fee, A1)

Recomendacao sem Jev: alinhar_doc_e_medir - Não muda código, não gasta cota e não cria dependência nem pagamento. É reversível em um commit. Usa eventos que o cliente já emite (http.ts:419-467) para ver o código real quando a cota acabar. Não decide o RPS, que depende de medição.
Cetico: decisao_ok=false; problemas: Opção manter_bloqueio_402: '429 e 50011 seguem com retry limitado' está errada para 50011 em HTTP 200, que não é retentado (http.ts:462-466). Corrigir para: 429 (inclusive com 50011) é retentado; 50011 em HTTP 200 não é. | Opção alinhar_doc_e_medir: a evidência 'eventos já emitidos' com apiCode está errada. Os eventos emitidos em http.ts:419-467 trazem endpoint, tier, attempt, status, elapsedMs e outcome, sem apiCode. O apiCode só existe no OnchainosError lançado (http.ts:439, 465). Medir apiCode por rota exige incluir o campo no evento, o que é mudança de código e contradiz 'código igual'. | Opção 402_transitorio: o próprio guia x402 define 402 como pagamento exigido. Retentar 402 com backoff não tem como resolver a cobrança, então a opção deve dizer que as tentativas são gastas sem chance de sucesso, não só 'podem gastar'. | Opção governador_rps_medido: 'medir 50011 com endpoints Free em 1 e 2 RPS' são chamadas reais que consomem a cota gratuita. Deve constar que consome cota e exige chave de API do dono, sem pagamento. | Restrição 'O reset de cota cai no dia 1 sem fuso informado' está correta (market-api-fee: 'quotas reset on the 1st of each month'). Manter como desconhecido, sem opção que dependa do fuso. | A numeração das afirmações pula de A4 para A6 (sem A5). Sem impacto nas opções, mas convém registrar.

### Bloqueios do dono

- Pagamento x402 em USDG ou USDT na X Layer e qualquer assinatura de pagamento: envolve dinheiro e carteira.
- Assinatura Starter (US$ 99 por mês) ou qualquer upgrade de plano: cobrança e serviço pago.
- Envio de mensagem ao BD (dexapi@okx.com) ou ao Discord: só o dono decide enviar.
- Chave de API, segredo e passphrase do portal: não lidos nem expostos.
- Raspagem para contornar cota: vedada pelos termos e decisão de risco do dono (docs/specs/retorno-composto-por-ciclo/spec.md:20).

### Novos tickets revelados

- T18b: endpoints Free contam no RPS e na cota?: Um endpoint Free (supported/chain) responde 50011 acima de 1 RPS e consome a cota Basic ou Premium?
- T18c: código de cota esgotada: Qual código a API devolve com a cota mensal zerada? Medir na conta do dono, se ele autorizar.
- T18d: fuso do reset mensal: O reset das cotas do Market ocorre à meia-noite UTC ou no fuso do provedor? Não publicado.

### Nao lido

- Páginas de referência por endpoint do Market (cabeçalhos de limite e exemplos de resposta de erro).
- Página de introdução do Market: a URL tentada devolveu 404.
- Portal de desenvolvedor e painel da conta: exigem login, não acessados.
- Página de assinatura com código de cota, não localizada.
- Páginas de código de erro de Portfolio, History, Social e Scan Chain: não lidas.
- Discord e BD: nenhum contato feito, nenhum envio.
- Chave de API: não lida nem exibida.

### Resumo do cetico

Verifiquei as oito afirmações contra as páginas oficiais do OnchainOS (lidas nesta sessão) e contra o código em src/onchainos/http.ts e errors.ts. Seis estão confirmadas ou confirmadas com ressalva. A2 e A6 são parciais porque só a página Market Price foi lida, e A4 é parcial. A decisão tem dois erros de texto que a levariam ao Jev com fato errado: a opção manter_bloqueio_402 diz que 50011 segue com retry, mas 50011 em HTTP 200 não é retentado, e a opção alinhar_doc_e_medir diz que os eventos emitidos trazem apiCode, o que o código não faz. Por isso decisao_ok é falso até essas correções. Nenhuma opção toca assunto vedado, e pagar x402 segue fora das opções.

## Comments

