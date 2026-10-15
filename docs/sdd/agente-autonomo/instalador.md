# O instalador da OKX: o que ele faz e como instalar só o que o agente precisa

Lido em 2026-10-14, **sem executar nada**: `npm view` e o tarball `@okxweb3/onchainos-installer@0.0.1-beta-4af28c368a-260910124122` (licença MIT, 85 KB, 6 arquivos, sem script `postinstall`, repositório `okx/onchainos-skills`, mantenedor `npm-okx`). O tarball fica numa pasta isolada, nunca rodado.

## O que `npx -y @okxweb3/onchainos-installer install` faz

| Ação | Onde | Efeito |
| --- | --- | --- |
| Baixa o binário `onchainos` da versão mais recente em `github.com/okx/onchainos-skills/releases` e confere o SHA256 contra `checksums.txt` do mesmo release | pasta de instalação do usuário | instala o CLI |
| Baixa `workflows.tar.gz` e confere contra `workflows-checksums.txt` | pasta de dados do CLI | instala fluxos prontos |
| **Instala as 7 skills em todos os agentes que encontrar na máquina** (Claude Code, Codex e outros) | pastas globais de skills de cada agente | **altera o comportamento dos seus outros agentes** |
| **Altera o PATH do usuário** (`SetEnvironmentVariable("Path", ..., "User")`) | registro do Windows | o CLI passa a valer em qualquer terminal |
| Roda `npm install -g @okxweb3/a2a-node@latest`, reinicia o daemon e executa `okx-a2a doctor --fix --non-interactive` | npm global | instala e configura o **A2A** (mercado de agentes), que o agente **não usa** |
| Envia telemetria de duração (`a2aDurationMs` e outros campos) | rede | não é necessária |

## Recomendação

**Não rodar o instalador.** O agente precisa de **um arquivo**: o binário `onchainos` para Windows x64. O resto (skills globais, PATH, A2A, telemetria) amplia a superfície sem servir ao agente.

## Como instalar só o necessário (atos do usuário)

1. Baixar de `https://github.com/okx/onchainos-skills/releases/download/v4.6.4/`: `onchainos-x86_64-pc-windows-msvc.exe` (17.208.200 bytes) e `checksums.txt` (1.321 bytes).
2. Conferir o SHA256 do `.exe` contra a linha do `checksums.txt` (por exemplo `Get-FileHash -Algorithm SHA256 arquivo.exe`).
3. Guardar o `.exe` numa pasta fixa de sua escolha, **sem** alterar o PATH.
4. Na tela **Agente**, em Configuração, informar o caminho do arquivo e o SHA256 conferido. O app recalcula o hash **antes de cada uso**; se o arquivo mudar, não roda.
5. Entrar na conta (`wallet login`, código por e-mail) e criar a subcarteira: **atos do usuário**, com o `ONCHAINOS_HOME` do agente (pasta `agent/onchainos-home` dos dados do app), para que a sessão do agente fique separada da sua.
6. Definir a política no portal da OKX (por transação, transferência diária, trade diário, destinos) com limites **pequenos**: é a trava que nenhum código nosso desfaz.

O primeiro uso real do CLI é **só leitura e cotação, sem valor**; a primeira ordem real é sua, no menor valor possível, com você olhando a tela (A1.7 de [tasks.md](tasks.md)).
