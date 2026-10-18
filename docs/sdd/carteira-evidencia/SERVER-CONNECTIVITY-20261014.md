# Conexao local, 2026-10-14

Conversa: `01a136cd-3af3-7361-bd23-c23a6aeece97`.
Pedido vigente: "o servidor nao esta conectado" em `http://localhost:3001/`.

## Resultado observado

A conexao voltou no runtime atual e no navegador. A causa do encerramento anterior permanece desconhecida.

- Inicialmente, a porta 3001 estava escutando com PID 19036 e a porta 3000 nao tinha listener. Os processos antigos 47321 e 47322 foram preservados.
- Durante o diagnostico apareceu watcher Bun PID 20844, criado em 2026-10-14 07:40:30.880251 -03:00, e filho PID 17016, criado em 07:40:31.041892. Comando observado: `bun.exe --no-env-file --watch run src/desktop/dev.ts --no-browser --idle-ms 0 --port 3000`.
- O agente principal nao iniciou nem reiniciou esse processo. Nao ha evidencia que identifique quem o iniciou ou por que o processo anterior encerrou.
- Em 10:45:26.6092623 UTC, `GET http://127.0.0.1:3000/health` retornou 200, `ok: true`, app `inonu-trader`, versao `0.0.2`, `startedAt: 1791974432219`, `uptimeMs: 294353`.
- A porta 3000 estava escutando em `127.0.0.1`, PID 17016; a porta 3001 permanecia em `127.0.0.1`, PID 19036.
- `GET /inonu/ledger`, com `Origin: http://localhost:3001`, retornou 200, JSON valido, `Vary: Origin` e `Access-Control-Allow-Origin: http://localhost:3001`.
- No navegador, sem recarregar, o painel Fontes mostrou "5 ao vivo": OKX tempo real, velas e REST ao vivo; Inonu pronto; OnchainOS pronto. A recuperacao da interface foi automatica.

## Limites e verificacao independente

O auxiliar `architecture_audit` inspecionou o bootstrap somente em leitura. Confirmou `src/desktop/dev.ts` como entrada da API para o frontend 3001; `--no-browser` evita abrir UI e `--idle-ms 0` desativa encerramento por inatividade. O bootstrap mantem feed publico e sincronizacao do relogio OKX, mas nao dispara por si uma inferencia Jev ou o operador. Isso nao certifica zero trafego externo.

Parecer independente privado: `C:/Users/gabri/.codex/tmp/server-connectivity-01a136cd/diagnostic-backend.md`, SHA256 `a84258553691ec1708e41dfd255e6c1ed50a2349aa4088e095d5a07a63766f90`. O auxiliar tambem verificou `/inonu/status` com CORS e explicou que `/health` nao passa pelos headers do handler. `bun run dev` do package.json inicia outro fluxo com Trader, portanto nao substitui a entrada `src/desktop/dev.ts` nessa recuperacao.

Nao houve alteracao de codigo, novo teste de inferencia, consulta privada da carteira, assinatura ou ordem neste diagnostico. A carteira estava desconectada na observacao; leitura de saldos nao foi exercitada. Nao se declara corrigida a causa da interrupcao nem estabilidade futura comprovada.

Screenshot privado: `C:/Users/gabri/.codex/tmp/server-connectivity-01a136cd/server-connected.png`.
SHA256 do screenshot: `f74a0f7ea7b60a76b9a3204bc87926c7799281245f33f04129af8f61ca95332b`.

Consulta tecnica Jev: recibo `db653e8a-2920-47a2-aec3-c111ac127a54`, `unavailable/provider_unavailable`. Nenhuma recomendacao obtida; custo desconhecido. A verificacao reversivel do navegador seguiu o requisito inalterado de validar a conexao, sem retry pago.

## Proximo passo elegivel

Investigar a durabilidade do processo de desenvolvimento e preservar evidencia de encerramento para uma proxima ocorrencia, usando o mecanismo existente e sem adicionar servicos, polling ou reinicializacoes concorrentes. A conexao atual ja esta verificada; a falta de historico impede atribuir a causa anterior.
