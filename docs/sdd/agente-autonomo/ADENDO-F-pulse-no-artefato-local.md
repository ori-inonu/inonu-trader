# ADENDO F: ligar o pulse no artefato local (contrato do delta, preparado em 2026-10-15, nada implementado)

Origem: nota 169 da Codex, resposta 2: "opção tipada explícita no host, no service e no core-entry, padrão desligado, selftest obrigatoriamente desligado, transporte configurado estrito; só `options.pulse` em `service.ts` não basta se ninguém o entrega, e só variável de ambiente no pai também não. Contrato de ponta a ponta em delta próprio **depois** da passagem." Este documento só fixa os pontos de mudança e os testes que precisam existir **antes** do código. Não toca em nenhum arquivo de fonte.

## 1. Por que a variável de ambiente não serve

`src/desktop/handlers.ts:208-210` decide o pulse com `options.liveFeed && (options.pulse ?? process.env.INONU_AGENT_PULSE === "1")`. O ambiente só é consultado quando `options.pulse` é `undefined`. No artefato local o filho recebe um ambiente filtrado (`src/local-host/plan.ts:3-11`), então a variável nunca chega; e `src/local-host/service.ts:34-38` não passa `pulse`. A correção segura não é abrir a variável, é entregar **uma opção tipada por argumento de linha de comando** e fazer o serviço passar **sempre um booleano explícito**, de modo que o ambiente nunca seja consultado no artefato.

## 2. Cadeia da opção (cinco pontos)

| # | Arquivo | Mudança | Padrão |
| --- | --- | --- | --- |
| 1 | `src/local-host/plan.ts` | `localCorePlan(appDir, home, env, options?: { pulse?: boolean })`. `command` = `[exe]` ou `[exe, "--pulse"]`. A lista `OS_ENV` **não muda** | desligado |
| 2 | `src/local-host/main.ts` | O supervisor lê `--pulse` do **seu próprio** argv e o passa a `localRuntime` e ao re-spawn do `--background` (hoje o re-spawn reconstrói os argumentos sem ele) | desligado |
| 3 | `src/local-host/core-entry.ts` | `pulse = args.includes("--pulse")`. Com `--selftest`, `--pulse` é **recusado** (`local_selftest_pulse_forbidden`), nunca ignorado em silêncio. Passa `pulse` a `startLocalService` | desligado |
| 4 | `src/local-host/service.ts` | Opção `pulse?: boolean`. Chama `createHandlers` **sempre** com `pulse: options.pulse === true && options.selftest !== true` (booleano explícito) | desligado |
| 5 | `src/desktop/handlers.ts` | **Sem mudança**: já respeita `options.pulse` explícito | n/a |

Transporte estrito: o pulse usa o `WebSocket` global e o endereço público padrão `OKX_PUBLIC_WS_URL` (`src/inonu/okx-ws.ts:13`, `wss://ws.okx.com:8443/ws/v5/public`). `createPulse` aceita uma opção `url` (`src/pulse/pulse.ts:39`), mas `handlers.ts` não a passa e o host **não deve expô-la**: nenhuma opção de URL ou de transporte nasce em `plan`, `main`, `core-entry` ou `service`. No selftest o pulse fica desligado, então nenhum socket é aberto.

## 3. Testes que devem falhar primeiro (RED) e depois passar

1. `plan.test.ts`: sem opção, `command` é exatamente `[exe]`; com `pulse: true`, `[exe, "--pulse"]`; `INONU_AGENT_PULSE=1` em `sourceEnv` **nunca** aparece em `env`.
2. Teste do supervisor (`main` ou `process-smoke`): `--pulse` no argv do supervisor chega ao argv do filho no modo em primeiro plano **e** no re-spawn de `--background`; sem `--pulse`, o filho não o recebe.
3. `core-entry` (ou teste de processo): `--selftest --pulse` sai com erro `local_selftest_pulse_forbidden`; `--pulse` sozinho entrega `pulse: true` ao serviço; sem a flag entrega `false` **mesmo com** `process.env.INONU_AGENT_PULSE = "1"` presente no filho.
4. `service.test.ts`: `createHandlers` recebe `pulse: false` por padrão, `true` só com a opção verdadeira e sem selftest, e `false` com selftest mesmo se a opção for verdadeira.
5. `handlers.test.ts`: com `pulse: true` o `createPulse` é chamado **sem** `url` (usa o padrão público) e com o construtor de `WebSocket` do host; com `pulse: false` explícito, nenhum socket é criado mesmo com `INONU_AGENT_PULSE=1` no ambiente.
6. Regressão do selftest compilado: continua sem socket, sem modelo, sem agente.

## 4. Como o delta entra e como sai

É uma **geração nova** (cinco fontes e seus testes): nova captura, regressão, pacote, selftest compilado e verify, tudo a cargo da Codex como em release24. A troca do release24 para a nova geração usa **o mesmo procedimento da passagem** (quiescência por API, supervisor `--await-handoff`, reconexão pelo mesmo disclosure). Para **desligar**: rearmar o supervisor **sem** `--pulse` (dreno pelo arquivo de controle, nunca kill), o que devolve exatamente o comportamento do release24.

## 5. O que a observação de 24 h do pulse mede

Além da disponibilidade e da recuperação de sempre: estado do pulse (conexão, reconexões, lacunas de barras, fatos publicados), tamanho do Brief contra o teto (hoje cerca de 11,3 KB de 12000, e o contexto do pulse acrescenta chaves), consultas ao Jev válidas e dentro do contrato, e nenhuma regressão na latência do ciclo. Não exige compras e não promete ganho; só se compara com o release24 sobre as mesmas métricas.

## 6. Memória do Brief (separada, nada aqui a liga)

`memoryHookEnabled` não tem consumidor no runtime; ligar exige o leitor e o projetor injetados no hospedeiro (porta confiável), a decisão do orçamento do Brief (o bloco de memória sozinho tem 4457 bytes), coorte madura (o observer mostra 0 resultados maduros) e o congelamento do leitor em lote. Fica em delta próprio, depois do pulse.
