# Evidência T1.2 a T1.10: núcleo local, lançador e instalador Windows (WIN-1 a WIN-11)

Data: 2026-10-12. Estados de evidência: **configuração válida** (testes e typecheck), **carregado em sessão nova** (instalação limpa em pasta temporária, exe rodando com PATH sem Node, Python e Rust), **funcionando ao vivo** (interface num navegador real servida pelo núcleo, com dados reais da OnchainOS). **Não feito:** T1.1 (extensão em janela `--app`), que exige a tela do usuário desbloqueada (a captura continua em branco e `lockapp.exe` aparece entre as janelas ocultas).

## O que foi construído

| Arquivo | Papel |
| --- | --- |
| `src/desktop/core.ts` | Núcleo único em `127.0.0.1:47321`: serve o export estático e as APIs na mesma origem; guarda de loopback (peer e Host); sintetiza a origem própria só quando o navegador declara `Sec-Fetch-Site: same-origin` (vale para `/settings`, `/onchain/*`, `/jev-read`, `/system-one`, sem editar as guardas desses arquivos); `/health` com `app: "inonu-trader"`; conexão SSE `/__inonu/live` por página (o núcleo encerra sozinho 60 s depois da última página fechar, 120 s de carência no início); porta ocupada é erro nomeado (`PortInUseError`) |
| `src/desktop/handlers.ts` | Monta os manipuladores reais (settings, gateway OnchainOS, jev-read, system-one) a partir de uma pasta de dados, sem o trader Kuru |
| `src/desktop/paths.ts` | Raiz de dados `%LOCALAPPDATA%\InonuTrader` (`INONU_HOME` sobrescreve), `chdir` para ela, pasta web ao lado do exe; nada ancorado em `import.meta.dir` |
| `src/desktop/browser.ts` | Escolhe o perfil do Edge (depois Chrome) que tem a OKX Wallet **habilitada** (pasta mais `disable_reasons` vazio em `Secure Preferences`); monta o comando `--app` como lista de argumentos |
| `src/desktop/launcher.ts`, `main.ts` | Instância única (segundo início acha o Inonu por `/health` e só abre outra janela), erro nomeado para porta ocupada por outro programa, relógio OKX sincronizado no início e a cada 10 min, `--no-browser`, `--selftest [--report arquivo]` |
| `scripts/build-desktop.ts` | Build reprodutível: export do Next, `bun build --compile` (sem console, sem autoload de `.env` nem de `bunfig`), NSIS, SHA-256 |
| `installer/inonu.nsi` | Instalador por usuário (sem administrador), AppId `InonuTrader.App`, chaves HKCU próprias, desinstalação por arquivos explícitos, dados mantidos salvo escolha ou `/DELETEDATA` |
| `scripts/desktop-smoke.ts` | Fumaça: instala, roda, varre segredos, desinstala |
| `web/next.config.ts` | `INONU_EXPORT=1` liga `output: 'export'` com `distDir` próprio (não toca o `.next` do `next dev` de outra sessão); sem a variável nada muda |

## Testes (primeiro vermelhos, depois verdes)

`src/desktop/*.test.ts`: **67 testes**, 0 falhas (núcleo 28, manipuladores 8, paths 11, navegador 12, lançador 8); `scripts/build-desktop.test.ts`: **10**; `bun --no-env-file run typecheck` limpo. Os testes de SSE foram escritos antes da troca do batimento por `setInterval` (achado 32 da revisão: um timer de página minimizada é estrangulado pelo navegador); 7 deles falhavam e passaram depois da troca.

## Spike B (T1.2): `bun build --compile` no Windows

Exe de 98 MB gerado em 0,7 s. Executado: serve estático e JSON em loopback; `Bun.secrets` `set`, `get` e `delete` funcionam dentro do exe (Credential Manager; a entrada de teste foi apagada); arquivos localizados por `process.execPath`; `import.meta.dir` dentro do exe é `B:\~BUN\root` (confirmado).

## Build e instalação reais

```
bun --no-env-file run scripts/build-desktop.ts   (export do Next 16 em 2,1 MB: /, /console, /configuracoes, 404; nenhum 127.0.0.1:3000 embutido; fontes embutidas, nenhum host externo no HTML)
  app/InonuTrader.exe   98 MB
  InonuTrader-Setup-0.0.2.exe   27 MB (NSIS, lzma sólido)
  SHA256SUMS.txt registrado em dist/desktop (pasta ignorada pelo git)

bun --no-env-file run scripts/desktop-smoke.ts                    -> 15/15 passam
bun --no-env-file run scripts/desktop-smoke.ts --with-shortcuts   -> 15/15 passam
```

Os 15 itens: nenhum valor de credencial desta máquina (4 valores, 58 arquivos) aparece no instalador, no exe nem na pasta web; instalação silenciosa em pasta temporária sai 0 sem administrador; a pasta tem só `InonuTrader.exe`, `Uninstall.exe`, `version.txt`, `web`; chaves HKCU próprias criadas; o exe instalado passa no autoteste com um PATH sem Node, Python e Rust; é o exe compilado, saudável, serve a mesa e `/onchain/status` na mesma origem (200) e nega a mesma rota sem o cabeçalho same-origin (403); tudo que escreveu foi para a pasta de dados e nada para a pasta de instalação; desinstalação silenciosa sai 0, a pasta, as duas chaves do registro e o atalho do Menu Iniciar somem, e a pasta de dados fica intacta.

## Ao vivo, em um navegador real (navegador embutido, sem extensão)

Núcleo iniciado com `main.ts --no-browser --port 47321` numa pasta de dados temporária e a mesa aberta em `http://127.0.0.1:47321/`:

- A interface carregou do núcleo; as chamadas pela mesma origem (`/settings`, `/onchain/chains`, `/onchain/signal-chains`, `/onchain/signals`, `/onchain/leaderboard...`) responderam **200**; o único host externo foi a API pública `www.okx.com`.
- Sem credenciais, a aba **Smart money** mostrou o estado honesto "Configure a chave do OnchainOS" com atalho para Configurações. O texto "Resposta fora do contrato" não aparece em lugar nenhum da página.
- Com o arquivo `onchainos.env` copiado (como arquivo, sem leitura de valores) para a pasta de dados temporária, **Smart money** listou sinais reais de carteiras rastreadas na Solana (token, nº de carteiras, tipo KOL, Baleia ou Smart money, valor em USD, fração vendida, valor de mercado, idade) e **Traders** listou o ranking real do leaderboard (PnL, % de acerto, volume, transações), com o orçamento visível ("uso este mes 2 de 50000"). A cópia das credenciais e o núcleo de teste foram apagados e encerrados.
- Lacunas vistas: a coluna "Principais tokens" mostra "Indisponivel" (campo do leaderboard não mapeado, T4.4); a pílula de fontes ainda diz "OnchainOS sem ciclo do operador, fora do ar" e a aba Ecossistema lista itens "bloqueados" por depender do ciclo antigo do operador (T4.5); o texto da faixa ainda diz "Jev decide" e "Rodar bun run jev-read" (T7.5, T7.6, rename).

## Pendências desta trilha

T1.1 (extensão em `--app`, tela desbloqueada), T1.3 parcial (rotas `/rastreador` e `/doctor` ainda não existem; `/console` está no export e deve ser retirado do instalável, achado 37), T1.6 (feito no núcleo, sem tocar nas guardas), T1.8 (Doctor), cofre e provisionamento (M2), ícone de produto próprio (hoje o favicon do web).
