# ADR-1 Instalável Windows 11: servidor local Bun, janela do Edge e instalador NSIS por usuário

Estado: **implementado e verificado** (T1.2 a T1.10; falta T1.1). Requisitos: WIN-1 a WIN-13, WAL-1, U1, U13, U14. Evidência: [SPEC 2.1](../SPEC.md) F4 a F8, F22 e [evidence/T1-instalavel.md](../evidence/T1-instalavel.md).

## Contexto

O usuário quer o app instalável e configurável no Windows 11 e a OKX Wallet conectada por extensão de navegador (U13, U14). O projeto é Bun (backend) mais Next 16 (web). Esta máquina tem NSIS 3.13, Bun 1.3.14, Node 26.9, Python 3.14, Rust 1.99, WebView2 154, Edge 155 e Chrome; **não** tem MSVC nem Windows SDK; já tem outro produto instalado (JevWIN).

## Decisão

1. **Lançador** `InonuTrader.exe`, compilado com `bun build --compile --target=bun-windows-x64 --windows-hide-console --no-compile-autoload-dotenv --no-compile-autoload-bunfig` (ícone, título, versão por flags). O exe carrega `.env` e `bunfig.toml` do diretório de trabalho por padrão e o `.env` desta máquina tem a chave privada do trader Kuru; por isso o autoload fica desligado (WIN-12). Responsabilidades: instância única; raiz de dados `%LOCALAPPDATA%\InonuTrader` com `chdir`; subir o núcleo; achar o perfil do navegador com a extensão **habilitada**; abrir `msedge.exe --app=http://127.0.0.1:47321/ --profile-directory=<perfil>`; cair para o Chrome; sem navegador, avisar e continuar servindo.
2. **Núcleo** em um único processo, `127.0.0.1:47321`, **com o próprio `Bun.serve`** (o `startServer` de `src/server.ts` não é composável: um `Bun.serve` fixo, sem `hostname` fora do preview, sem rota estática e com `require("./config")` do trader Kuru), montando os mesmos manipuladores (`/onchain/*`, `/settings`, `/jev-read`, `/system-one`) por `src/desktop/handlers.ts`, e servindo o Next exportado estaticamente (`output: 'export'`, ativado por `INONU_EXPORT=1`, `distDir` próprio para não tocar o `.next` do `next dev`). Mesma origem, sem CORS. Guarda de loopback (peer e Host) em **toda** rota; o ajuste de origem same-origin vale para todos os manipuladores e só quando o navegador declara `Sec-Fetch-Site: same-origin` (as guardas deles ficam intactas).
3. **Presença por conexão, não por timer.** Cada página mantém uma conexão SSE com `/__inonu/live`; o núcleo encerra sozinho 60 s depois da última fechar (120 s de carência no início). Um timer de página minimizada é estrangulado pelo navegador e derrubaria o núcleo com a interface aberta; uma conexão mantida não é.
4. **Arquivos estáticos** ficam na pasta `web/` ao lado do exe, localizada por `process.execPath` (dentro do exe `import.meta.dir` é o virtual `B:\~BUN\root`). O mapeamento `/rota` para `rota.html` cobre as rotas sem barra final. O log do lançador vai para `<home>/logs/launcher.log` e erros fatais para uma caixa de mensagem (o exe não tem console).
5. **Instalador NSIS** por usuário: `%LOCALAPPDATA%\Programs\InonuTrader`, AppId `InonuTrader.App`, chaves `HKCU\Software\InonuTrader.App` e `HKCU\...\Uninstall\InonuTrader.App`, atalho `Inonu Trader` no Menu Iniciar, desinstalação por arquivos explícitos, dados mantidos salvo escolha ou `/DELETEDATA`. Sem assinatura de código (o SmartScreen avisará; uso local).
6. **Instância única:** a porta é fixa; ocupada, `/health` decide: responde `app: "inonu-trader"` e o segundo início só abre outra janela; qualquer outro programa vira erro nomeado com mensagem. Porta fixa porque o `localStorage` é por origem.
7. **Spikes**: T1.2 (exe e `Bun.secrets`) **feito**; T1.1 (a extensão injeta `window.okxwallet` em janela `--app`) **pendente da tela do usuário**.

## Alternativas

| Opção | Por que não |
| --- | --- |
| Tauri 2 (Rust e WebView2) | Não linka aqui (sem MSVC e Windows SDK; o `link.exe` do Git sombreia o linker). O WebView2 sozinho não reaproveita a extensão instalada no perfil do Edge do usuário (inferência, não testada) |
| Electron | Documenta só um subconjunto da API de extensões do Chrome e não confirma service worker MV3 (a OKX Wallet é MV3 com `sidePanel` e `offscreen`); acrescenta mais de 100 MB e um runtime Node |
| PWA instalada pelo Edge | Não inicia nem encerra o backend, não tem instalador nem desinstalador |
| Servir com `next start` em Node | Exige Node no destino e uma segunda porta; a exportação estática remove as duas dependências |
| Janela do Edge sem `--app` | Funciona, mas mostra a barra de endereço; mantida como reserva |

## Consequências

- A extensão real da OKX Wallet deve funcionar porque a janela é do próprio Edge, no perfil do usuário (os content scripts casam com `http://*/*`); **ainda não provado em janela `--app`** (T1.1). A detecção exige a extensão habilitada, lida em `Secure Preferences`; a pasta tem as versões 4.18.1 e 4.19.0.
- Sem Node, Python, Rust ou MSVC no destino (WIN-9): provado pela fumaça com um PATH sem esses programas.
- O export do Next vai com `NEXT_PUBLIC_API_URL` vazio (relativo, mesma origem). O `/console` (fluxo do trader Kuru) sai do instalável por T1.11.
- O `next build` de verificação de cada onda reescreve o `.next` que processos `next start` de outras sessões usam; o build do desktop usa `distDir` próprio, mas o `next build` normal continua sendo um risco para essas sessões e deve ser avisado.
- Ancoragens em `import.meta.dir` ainda existem em `src/server.ts:24`, `src/operator/config.ts:31`, `src/paper-supervisor-store.ts:97` e nos scripts: o núcleo não usa nenhuma delas.

## Evidência

Exe de 98 MB gerado em segundos; `Bun.secrets` e o servidor funcionam dentro dele; fumaça do instalador 15 de 15 nas duas variantes; a mesa servida pelo núcleo abriu num navegador real com chamadas `/onchain/*` em 200 e dados reais; ver [evidence/T1-instalavel.md](../evidence/T1-instalavel.md).
