# Runbook: reiniciar o backend sem derrubar o que é de outra sessão (T0.2, SRC-3, AC-SRC-2)

Data: 2026-10-13. Sessão c38db1. Este arquivo é um registro de leitura: descreve o estado visto nesta máquina e o jeito certo de reiniciar. Não reinicia nada.

## O que está em cada porta (visto em 2026-10-13, leitura apenas)

| Porta | Quem | De quem é |
| --- | --- | --- |
| 3000 | `bun` do `reports-server` (servidor de relatórios do repositório, em pasta temporária da sessão do Codex) | outra sessão |
| 3001 | `next start -p 3001` (a interface em build de produção do `web/`) | outra sessão |
| 3030 | `bun src/index.ts` com `data/final-main.env`: **o trader Kuru** | outra sessão; fora do instalável |
| 3031 | `next` em `start-server.js` (a mesa servida do working tree) | do usuário |
| 47321 | `InonuTrader.exe` do `dist/desktop/app`, iniciado por esta sessão para as provas ao vivo (`--no-browser --idle-ms 0`) | desta sessão |

Nada nas portas 3000, 3001, 3030 e 3031 foi tocado, e nenhuma foi reiniciada: são de outras sessões ou do usuário.

## Por que "Resposta fora do contrato" aparecia (F1, F2)

Os backends que estavam no ar eram anteriores às rotas `/onchain/*` e `/settings`, que existem só no working tree. O cliente converte uma resposta 404 sem envelope em erro de esquema. Desde T4.1 a interface distingue `backend_sem_rota` e `origem_negada` e mostra "backend desatualizado", e o núcleo do app instalável **já serve essas rotas por construção**, então o instalável não precisa deste reinício.

## Reiniciar o app instalado ou o de desenvolvimento

1. **App instalado ou `dist/desktop/app`:** feche a janela (o núcleo encerra sozinho quando a interface para de enviar batimento) e abra de novo pelo atalho. Se foi iniciado com `--idle-ms 0` para teste, pare **só o processo pelo número** (`Stop-Process -Id <PID>`), nunca pelo nome da imagem: outras sessões podem ter `bun.exe` e `node.exe`.
2. **Mesa servida do working tree (3031):** é do usuário. O build novo vem de `bun run --cwd web build`; reiniciar o servidor é decisão dele.
3. **Antes de reiniciar qualquer coisa:** confira o dono do processo pela linha de comando (`Get-CimInstance Win32_Process -Filter "ProcessId=<PID>"`), não pela porta; o `NEXT_PUBLIC_API_URL` é **embutido no build** da interface, então trocar a porta do backend exige novo build.
4. **Prova de que subiu:** `GET /onchain/status` responde 200 com `credential` e `clockOffsetMs`; no instalável, `GET /health`.

## O que este runbook não faz

Não reinicia as portas 3000, 3001, 3030 e 3031, não mexe em worktrees de outras sessões e não apaga nenhum `.env`.
