# SPEC - Inonu Trader v1: instalável Windows 11, OnchainOS completo e inteligência sob demanda

Estado: **revisão 3** (2026-10-13), depois do parecer independente de [evidence/revisao-independente-1.md](evidence/revisao-independente-1.md), do início da implementação e do adendo aprovado pelo usuário da [Fase 2 on-chain](../config-onchain-smartmoney/fase-2/ADENDO-REV3.md) (deltas D3-01 a D3-13, mais os ajustes D3-14 desta sessão: memória do fluxo, pressão e volume do Rastreador, filtro por opções fechadas); congelada em [FREEZE.json](FREEZE.json). Conversa/tarefa real: sessão "Windows 11 instalação e integração OKX" (c38db1), 2026-10-12. Estado da execução: [CHECKPOINT.md](CHECKPOINT.md).

Pasta SDD única desta entrega: [README.md](README.md) (índice), este SPEC, [PLAN.md](PLAN.md), [TASKS.md](TASKS.md), [OWNERSHIP.md](OWNERSHIP.md), [adr/](adr/), [flow-engine.md](flow-engine.md), [rastreador.md](rastreador.md), [info-diet.md](info-diet.md), [wallet.md](wallet.md), [onchainos-coverage.md](onchainos-coverage.md) e [onchainos-coverage.json](onchainos-coverage.json).

## 1. Objetivo observado e autoridade

Pedido (usuário, 2026-10-12: um pedido introdutório e 16 itens numerados, resumidos como U1 a U17):

| U | Pedido |
| --- | --- |
| U1 | Tornar o projeto instalável e configurável no Windows 11, escolhendo o melhor recurso, framework ou biblioteca |
| U2 | Ler a página do portal de desenvolvedores OKX já aberta no Edge |
| U3 | Verificar todas as formas de uso da API OnchainOS |
| U4 | Deixar todas as APIs necessárias pré-configuradas em Configurações junto do instalável, só nesta máquina |
| U5 | Corrigir o painel inferior (abas sem dado e sem integração), adicionar mais redes, trocar a sigla pelo ícone de cada criptomoeda |
| U6 | Corrigir o erro "Resposta fora do contrato" na busca |
| U7 | Nenhum dado simulado nesta fase: só o ecossistema OKX Wallet e OnchainOS |
| U8 | Indicadores do gráfico baseados em inteligência de rastro do dinheiro esperto, dinâmicos, que mostrem onde comprar e vender, no lugar dos clássicos |
| U9 | Manter o indicador smart money atual, mas a decisão do assistente deve aparecer no gráfico, com filtro dos sinais e opção de aceitar a sugestão |
| U10 | Tratar os dados de entrada: algoritmos transformam dados em informação estruturada, o modelo não recebe milhares de dados por segundo |
| U11 | Fatores de fluxo: Exaustão, Progressão, Imbalance, Sequencial, Volume, como no Profit Pro |
| U12 | Interface enxuta: menos informação para o humano, a informação estruturada vai para os agentes |
| U13 | Percorrer a documentação OnchainOS item a item e integrar com a OKX Wallet via extensão de navegador |
| U14 | Deixar a conexão da carteira pré-configurada no instalável |
| U15 | Rastreador inspirado no de criptomoedas do TradingView, na barra superior |
| U16 | Substituir o texto legado "System One, alavancagem em MON-USDT-SWAP: Jev nao consultado" por consulta sob demanda ao assistente |
| U17 | Criar todas as Specs (SDD) e quebrar tudo em tarefas pequenas e totalmente especificadas |

Correspondência com o texto do usuário: U1 é o pedido introdutório (sem número, instalável no Windows 11) e U2 a U17 são, nesta ordem, os itens 1 a 16 do pedido (U13 e U14 são os itens 12 e 13, U15 é o item 14, U16 é o item 15 e U17 é o item 16). Os itens 8 e 9 do pedido (decisão no gráfico e consumo do modelo) são U9 e U10.

### 1.1 Rastreabilidade: item do pedido, requisitos, aceitação e tarefas

| Item do pedido | U | Requisitos | Aceitação | Tarefas |
| --- | --- | --- | --- | --- |
| introdução (instalável no Windows 11) | U1 | WIN-1 a WIN-13 | AC-WIN-1 a AC-WIN-7 | T1.1 a T1.10 |
| 1 (portal no Edge) | U2 | API-13 | AC-API-7 | T0.3, T3.8 |
| 2 (formas de uso da API) | U3 | API-1 a API-14 | AC-API-1 a AC-API-7 | T3.1 a T3.8 |
| 3 (APIs pré-configuradas) | U4 | CFG-1 a CFG-9, WIN-2 | AC-CFG-1 a AC-CFG-4, AC-WIN-2 | T2.1 a T2.5 |
| 4 (painel inferior, redes, ícones) | U5 | DOC-1 a DOC-4, CHN-1 a CHN-3, ICO-1 a ICO-4 | AC-DOC-1, AC-DOC-2, AC-CHN-1, AC-ICO-1, AC-ICO-2 | T3.5, T3.6, T4.2 a T4.6 |
| 5 (erro de contrato) | U6 | SRC-1 a SRC-5 | AC-SRC-1 a AC-SRC-3 | T0.2, T4.1, T4.7 |
| 6 (sem dado simulado) | U7 | DAT-1 a DAT-3 | AC-DAT-1 | T10.1 a T10.3 |
| 7 (indicadores dinâmicos de rastro do dinheiro) | U8 | SMT-1 a SMT-7, FLX-9 | AC-SMT-1 a AC-SMT-3 | M6 |
| 8 (decisão no gráfico, filtros, aceitar) | U9 | ASK-7, ASK-8, ASK-14, WAL-7 | AC-ASK-4, AC-ASK-7 | T6.5, T7.5, T9.7 |
| 9 (tratar os dados de entrada) | U10 | ING-1 a ING-4, ASK-1, ASK-3, ASK-13 | AC-ING-1, AC-ING-2, AC-ASK-1, AC-ASK-2, AC-ASK-7 | M5, T7.1 |
| 10 (fatores de fluxo) | U11 | FLX-1 a FLX-12 | AC-FLX-1 a AC-FLX-5 | M5 |
| 11 (interface enxuta) | U12 | INF-1 a INF-3, DOC-4 | AC-INF-1 | T4.6, T10.4 |
| 12 (documentação e carteira OKX) | U13 | API-6, WAL-1 a WAL-9 | AC-API-5, AC-WAL-1 a AC-WAL-5 | T3.1, M9 |
| 13 (carteira pré-configurada) | U14 | WIN-4, WAL-1, WAL-3 | AC-WIN-4, AC-WAL-1, AC-WAL-2 | T1.7, T9.1, T9.3 |
| 14 (Rastreador) | U15 | RAS-1 a RAS-6 | AC-RAS-1, AC-RAS-2 | M8 |
| 15 (sob demanda, linha legada) | U16 | ASK-1 a ASK-14 | AC-ASK-1 a AC-ASK-7 | M7 |
| 16 (SDD) | U17 | todos | AC-QLT-3 | T-DOC-1 a T-DOC-10 |

### 1.2 O que é o System One neste SPEC

O usuário chama de **System One do Jev** o sistema por trás do rastreador do dinheiro esperto e da decisão (item 11). No código existem duas coisas com esse nome ou perto dele: `src/system-one` (módulo de alavancagem em MON-USDT-SWAP, fase-0, de onde vem a linha legada) e `src/jev-read` (leitura da fita). Este SPEC define: o **motor** `src/intel/**` e a rota `/inonu/ask` são o System One no sentido do usuário (a camada que transforma dados em informação estruturada e consulta o modelo); o módulo `src/system-one` atual vira uma **família de candidatos** de perpétuos dentro desse motor (T7.2) e o seu cabeçalho legado é removido (ASK-9); nenhum arquivo de `src/system-one` é renomeado nem apagado nesta fase.

### 1.3 Como "onde comprar e onde vender" (U8) é atendido

O motor mostra **zonas dinâmicas neutras** (demanda e oferta) com nota, fatores, idade, estado e invalidação, recalculadas a cada barra. A recomendação de comprar ou vender é dada **pelo modelo**, quando o usuário pede (ASK-4), e aparece no gráfico como marcador de decisão do Inonu sobre uma zona; o indicador sozinho nunca diz comprar ou vender (regra "o código descreve, o modelo decide", FLX-10 e SMT-5).

Decisões do usuário vigentes (respondidas na sessão):

- **D-U1 Nome.** Na interface o assistente é o **Inonu** ("Pedir ao Inonu"); **Jev é só o modelo** por trás da inteligência. Nomes internos de código com "jev" não são renomeados.
- **D-U2 Escopo do sob demanda.** Só a mesa OKX e o System One consultivo (`execution: "never"`). O trader Kuru não entra no instalável e não é alterado. Origem verificada: o Kuru e a "mensagem central" do `CLAUDE.md` vêm do upstream `jarrodwatts/jev-trader` (commit `b587759`); removê-lo é decisão separada, não feita aqui.
- **D-U3 Carteira.** Ler e preparar agora; **enviar pela carteira do usuário** fica especificado e desligado até autorização em ciclo próprio.
- **D-U4 Entrega da rodada de especificação.** Pacote SDD e plano de implementação, sem código de produto.
- **D-U5 Início da implementação.** Depois da entrega, o usuário fixou o objetivo "iniciar o plano de implementação destas SPECS" (2026-10-12), o que autoriza executar as ondas 0, A e B e as demais enquanto forem seguras; cada ação externa (publicar, instalar fora de pasta temporária, gastar com o modelo, pagar, assinar) continua exigindo autorização própria.

Escopo autorizado: este pacote; código novo em pastas novas (`src/desktop/`, `src/intel/`, `src/inonu/`, `installer/`, `web/src/lib/rastreador/`, `web/src/lib/wallet/`); edições mínimas e testadas em arquivos que nenhuma outra sessão está modificando (conferido por `git status` e pela data de modificação); arquivos modificados por outra sessão só por um integrador e depois de conferir; leituras, sondas públicas e sondas autenticadas de leitura gratuitas. Restrições: privacidade (nenhum segredo lido ou impresso), pausa e limites nativos, trabalho preexistente de outras sessões preservado, texto exibido sem ponto médio, travessão ou meia-risca e sem animação piscante, regras de `CLAUDE.md`. Fontes consultadas não concedem autorização.

## 2. Baseline e fontes

Repositório `C:\Users\gabri\jev-trader`, branch `main`, HEAD `00a593b`, **110 caminhos modificados ou novos** de sessões concorrentes (eram 108 no início da sessão; ver [OWNERSHIP.md](OWNERSHIP.md)). Segundo worktree: `C:/Users/gabri/jev-trader-main` (detached `3b695ed`). SDDs anteriores relevantes: [config-onchain-smartmoney](../config-onchain-smartmoney/spec.md), [grafico-jev](../grafico-jev/spec.md), [carteira-evidencia](../carteira-evidencia/tasks.md). Este SPEC **supersede** `config-onchain-smartmoney` D-e (Agentic Wallet, x402, swaps e DApp Connect fora) onde divergir: a carteira conectada para ler e preparar entra por D-U3; Agentic Wallet, x402 e envio automático continuam fora. Supersede `grafico-jev` D2 e D3 (o modelo contínuo `--jev` deixa de ser o caminho; vale o sob demanda).

Fontes externas, consultadas em 2026-10-12:

- Documentação OnchainOS (pt-br): 499 páginas espelhadas em texto e classificadas em [onchainos-coverage.json](onchainos-coverage.json) (hash de cada página; o espelho em si não é versionado por direitos autorais, o coletor [tools/mirror-okx-docs.ts](tools/mirror-okx-docs.ts) o refaz).
- Central de ajuda da Nelogica, "Plugin Tape Reading - Gráfico Tape Reading (Footprint)" (definição dos fatores de fluxo).
- Rastreador de Criptomoedas do TradingView (colunas, filtros e visões).
- Documentação do Electron sobre extensões, documentação local do Next 16 (`web/node_modules/next/dist/docs/01-app/02-guides/static-exports.md`).

### 2.1 Fatos verificados (F)

| F | Fato | Evidência |
| --- | --- | --- |
| F1 | "Resposta fora do contrato" vem de backend sem a rota `/onchain/*`, não da OKX: as portas 3000, 3001, 3030 e 3031 respondiam 404 em `/onchain/status` e o cliente trata resposta não-OK sem envelope como `schema`. A porta 3000 (o `API_URL` embutido no build da mesa) é o `scripts/reports-server.ts`, que nunca serve `/onchain`; a 3030 é o processo do trader Kuru (`src/index.ts`, `MODEL=mock`, `DRY_RUN=true`, iniciado antes das edições); `NEXT_PUBLIC_API_URL` é embutido no build, então reiniciar um backend não conserta uma interface construída para outra porta. Na mesma origem do núcleo novo as mesmas rotas respondem 200 | `web/src/lib/onchain/client.ts:343`, `web/src/lib/mesa/onchain-rows.ts:171`; `curl`; [evidence/T1-instalavel.md](evidence/T1-instalavel.md) |
| F2 | As rotas `/onchain/*` e `/settings` existem só no working tree não commitado; os processos em execução são anteriores a elas | `git status` (`src/onchain-read/`, `src/settings/` novos, `src/server.ts` modificado) |
| F3 | O relógio do Windows nunca sincronizou (fonte "Local CMOS Clock", salto 3, última sincronização não especificada); deriva medida de cerca de 77 s; tolerância da OKX é de 30 s | `w32tm /query /status`; `okx-docs/home/api-access-and-usage.txt` |
| F4 | Tauri está bloqueado: sem MSVC nem Windows SDK (`link.exe` do Git sombreia o linker). O WebView2 não reaproveita a extensão instalada no perfil do Edge do usuário (inferência: ele pode carregar extensões descompactadas, o que não é o caso; a OKX Wallet que o usuário usa vem da loja). Electron suporta só parte da API de extensões e não documenta service worker MV3 | teste de `rustc` por agente; documentação do Electron |
| F5 | OKX Wallet (MV3, id `mcohilncbfahbmgdjkbpemcciiolgcge`) está instalada e **habilitada** no Edge, perfil `Default` (`Secure Preferences`, `disable_reasons` vazio); a pasta tem as versões 4.18.1 e 4.19.0 (esta criada em 2026-10-12); os content scripts casam com `http://*/*` e `https://*/*`. O nome "OKX Wallet" vem do manifesto local; que o id coincida com o da loja é de memória | leitura de `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default` |
| F6 | NSIS 3.13, Bun 1.3.14, Node 26.9, Python 3.14, Rust 1.99, WebView2 154 e Edge 155 instalados; `bun build --compile` gera exe de 105 MB em 3,7 s; dentro do exe `import.meta.dir` vale `B:\~BUN\root`; `Bun.secrets` expõe `get`, `set`, `delete` | agente de empacotamento; `bun -e` |
| F7 | O web não tem route handlers, middleware, rotas dinâmicas, `useSearchParams` nem `next/image`; as páginas e o layout renderizam estaticamente (o layout usa `next/font/google`, baixado no build, e `next/script` antes da hidratação): a exportação estática do Next 16 é viável e foi feita (limites: otimização de imagem padrão, rewrites, headers) | `web/src/app/**`; `static-exports.md` local |
| F8 | Existe outro produto instalado nesta máquina (JevWIN, `%LOCALAPPDATA%\Programs\JevWIN`, `%LOCALAPPDATA%\JevWIN`, `com.jevwin.desktop`) | listagem de aplicativos e de pastas |
| F9 | O modelo já foi medido uma vez, no trader Kuru: `data/jev-windows-key-20261009.jsonl.summary.json` registra 90 s de mercado real em papel, 3 decisões e custo `jevUsd` de 0,000142 (cerca de US$ 0,00005 por decisão, prompt do Kuru). Na mesa OKX **nunca houve consulta**: o `jev-read` e o System One só têm `decision: null` (3413 leituras e 630 ciclos em 2026-10-12 às 22 h; os poucos ciclos não nulos são do modelo mock). Com `--jev` o `jev-read` faria cerca de 4 chamadas por minuto e já limita a 2000 leituras pagas em 24 h móveis (`--max-reads`); `JEV_USD_PER_MTOK` (padrão 0,042) permite estimar custo antes do ledger | `data/jev-windows-key-20261009.jsonl.summary.json`, `data/jev-read/reads.jsonl`, `scripts/jev-read.ts:173-193` |
| F10 | O texto "System One, alavancagem em MON-USDT-SWAP: Jev nao consultado, nenhum candidato elegivel" vem de `web/src/lib/mesa/mesa-model.ts:359-367`; o instrumento é fixo em `src/system-one/readings.ts:18` e a fase `fase-0` bloqueia todos os candidatos | leitura do código |
| F11 | Plano OnchainOS: 100 mil chamadas Basic e 100 mil Premium por mês, **sem WebSocket**; excedente de US$ 0,0001 (Basic) e US$ 0,0002 (Premium) só por x402 (USDG ou USDT na X Layer) ou assinatura (a partir de US$ 99 por mês) | `okx-docs/market/market-api-fee.txt` |
| F12 | Credenciais locais: `data/onchainos.env` com chave, segredo e passphrase definidos; `data/jev.env` inexistente; `.env` com `TYPESAFE_AI_API_KEY` e também variáveis do trader Kuru (só nomes verificados: `PRIVATE_KEY`, `LIVE_ACK`, `AUTO_DEPOSIT`, `DRY_RUN`, `MODEL`, `RPC_URL`, `JEV_USD_PER_MTOK`). Nenhum valor foi lido | verificação de nomes |
| F13 | A página do portal no Edge não pôde ser lida: captura de tela em branco e `lockapp.exe` entre as janelas ocultas (inferência: sessão bloqueada) | captura em modo leitura |
| F14 | Os fatores de fluxo da Nelogica são definidos por nível de preço dentro da vela (Imbalance, Sequencial, Progressão, Exaustão, Fator Volume de 0 a 3, Ordem Original, Alerta de Quantidade); a fonte não traz fórmula | central de ajuda da Nelogica |
| F15 | O Rastreador do TradingView tem universo, filtros (Rank, Valor de mercado, FD, Vol/val. de mercado, Endereços com saldo, Vol USD, Var. de volume, Vol. de transações, Var %, Perf %, Categoria), visões (Visão geral, Desempenho), Tech Rating, Domínio social e o botão "IA" | página ao vivo |
| F16 | O canal público `trades` da OKX traz o lado agressor de cada negócio e é gratuito; `market/trades` do OnchainOS (Basic) traz compra ou venda e valor em USD por negócio, até 500 por chamada | `okx-docs/market/market-trades.txt`; `web/src/lib/desk/okx-parse.ts:143-147` |
| F17 | O repositório é um fork: `upstream` = `jarrodwatts/jev-trader`; único commit do upstream `b587759`; 205 commits do usuário | `git log`, `git shortlog` |
| F18 | Em perpétuos da OKX o `sz` do canal `trades` é em **contratos**, não em moeda base: `BTC-USDT-SWAP` tem `ctVal` 0,01 BTC, `ctMult` 1 e `lotSz` 0,01; no spot o `sz` é em moeda base | sonda pública `public/instruments` em 2026-10-12 |
| F19 | O período de teste da Trade API vale 60 dias a partir da criação da chave (1 req/s, até 5 sob aprovação); depois passa ao plano Start-up, com divisão de receita. A data de criação da chave é desconhecida | `okx-docs/trade/api-fee.txt` |
| F20 | `Bun.secrets.get`, `set` e `delete` devolvem Promises, e o `SettingsStore` e seus chamadores são síncronos | `src/settings/store.ts:48-60`; teste `instanceof Promise` |
| F21 | Já existe código de conexão da carteira: `web/src/lib/okx-wallet.ts` descobre o provedor por EIP-6963 (linhas 959 a 966), pede contas com `eth_requestAccounts` (674) e troca de rede com `wallet_switchEthereumChain` (785); **não** existe `wallet_addEthereumChain` | `web/src/lib/okx-wallet.ts:959-966` |
| F22 | O exe de `bun build --compile` carrega `.env` e `bunfig.toml` do diretório de trabalho por padrão, e o `.env` desta máquina tem a chave privada e o `LIVE_ACK` do trader Kuru; por isso o build usa `--no-compile-autoload-dotenv` e `--no-compile-autoload-bunfig` | `bun build --help`; [evidence/T1-instalavel.md](evidence/T1-instalavel.md) |

### 2.2 Incertezas e fatos externos desconhecidos

A extensão injeta `window.okxwallet` em janela `msedge --app` e em `http://127.0.0.1` (não documentado; spike T1.1). EIP-6963 na OKX Wallet. Limite numérico de requisições por segundo do Market API. Se um lote em `POST` conta como 1 chamada ou N. Camada de cobrança de `address-tracker/trades` e de `social/*`. Se a cota gratuita é por chave, projeto ou conta. Plano real do usuário no portal (Trial?). Elegibilidade por região. Data de criação da chave (o teste da Trade API dura 60 dias, F19). Esses itens viram tarefas de medição, nunca premissas.

## 3. Requisitos

Convenção: "núcleo" é o processo local único (Bun) que serve a interface estática e as APIs; "gateway" é `src/onchain-read/**`; "motor" é `src/intel/**` (novo); "assistente" é o Inonu e "modelo" é o Jev. Todo texto exibido segue a convenção da mesa: português sem acentos, sem ponto médio, travessão ou meia-risca, sem indicador piscante ou pulsante.

### 3.1 Instalação e execução (WIN)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| WIN-1 | Quando o usuário executa `InonuTrader-Setup-<versão>.exe`, o instalador deve instalar por usuário em `%LOCALAPPDATA%\Programs\InonuTrader` sem exigir administrador, criar atalho no Menu Iniciar (e na Área de Trabalho se marcado) e registrar a desinstalação em `HKCU` | U1, F6 | instalação silenciosa em pasta temporária |
| WIN-2 | O instalador não deve conter segredo, `.env`, conteúdo de `data/` nem credencial de qualquer tipo | U4 | varredura de strings do artefato |
| WIN-3 | Quando o atalho é aberto, o lançador deve iniciar ou focar **uma única** instância do núcleo escutando só em `127.0.0.1`, na porta fixa 47321; porta ocupada por outro programa deve produzir erro nomeado com mensagem ao usuário, sem fallback silencioso; uma segunda abertura reconhece o Inonu em execução por `/health` e só abre outra janela | U1 | segundo início; porta ocupada |
| WIN-4 | O lançador deve abrir a interface em janela `--app` do Edge com o perfil que contém a extensão OKX Wallet; sem ela no Edge, usar o Chrome se ele a tiver; sem nenhum, abrir o Edge e mostrar no Doctor como instalar a extensão | U13, U14, F5 | perfis simulados em pasta temporária |
| WIN-5 | Todo dado gravável (journais, estado, cache, logos, ledger) deve ir para `%LOCALAPPDATA%\InonuTrader`; nada na pasta de instalação nem no repositório | U1, F6 | listagem de arquivos antes e depois |
| WIN-6 | Enquanto houver uma página aberta o núcleo deve continuar rodando; sem nenhuma por 60 s (120 s no início) deve encerrar sozinho. A presença é uma conexão persistente (SSE) mantida por cada página, nunca um timer da página (o navegador estrangula timers de janelas minimizadas); uma recarga não encerra; uma página de outro site não consegue mantê-lo vivo; a opção "manter em segundo plano" fica desligada por padrão e os alertas locais só existem com a página aberta ou com essa opção | U10 | testes do núcleo com conexões reais |
| WIN-7 | A desinstalação deve remover binários, atalhos e chaves de registro e preservar dados e cofre, salvo opção marcada pelo usuário | U1 | desinstalação silenciosa |
| WIN-8 | O Doctor deve mostrar, cada um com mensagem e ação: navegador, extensão OKX Wallet, desvio do relógio medido pelo cabeçalho `Date` de um endpoint gratuito, porta, estado das credenciais (nunca o valor), sonda gratuita OnchainOS, conectividade e Python opcional | U4, U14, F3 | tela e rota `/doctor` |
| WIN-9 | Instalar e iniciar não devem depender de Node, Python, Rust, MSVC nem de internet (internet só para dados) | U1, F4 | máquina sem esses itens no PATH |
| WIN-10 | O build do instalador deve ser reprodutível por um único comando e registrar o SHA-256 do artefato | U1 | `scripts/build-desktop.ts` |
| WIN-11 | O instalador não deve reutilizar nomes, AppId, pastas, chaves de registro nem atalhos do JevWIN | F8 | varredura do script do instalador |
| WIN-12 | O exe deve ser compilado com o carregamento automático de `.env` e `bunfig.toml` desligado, e o app não deve ler `PRIVATE_KEY`, `LIVE_ACK` nem qualquer variável fora da lista fixa de quatro segredos | CFG-3, F22 | flags do build; teste de varredura de leitura de ambiente |
| WIN-13 | O instalável deve conter só as rotas `/`, `/configuracoes`, `/rastreador` e `/doctor`; `/console` (fluxo do trader Kuru e relatórios antigos) fica fora e o link "Central" some da barra | D-U2, DAT-1 | teste de rotas do export e da barra |

### 3.2 Configuração e segredos (CFG)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| CFG-1 | Os segredos (`OKX_WEB3_API_KEY`, `OKX_WEB3_API_SECRET`, `OKX_WEB3_API_PASSPHRASE`, `TYPESAFE_AI_API_KEY`) devem ficar no Credential Manager do Windows via `Bun.secrets`, serviço `InonuTrader`; como o cofre é assíncrono e o store é síncrono para os chamadores, o store mantém um cache em memória com escrita através do cofre e um estado de falha explícito (nunca "configurado" sem confirmação do cofre) | U4, F20 | leitura e escrita de segredo de teste |
| CFG-2 | Quando o app inicia com o cofre vazio e há uma origem de importação conhecida, deve importar localmente **só** os quatro nomes de CFG-1 de `data/onchainos.env`, `data/jev.env` e `.env` da origem; nenhuma outra variável é lida (teste: `PRIVATE_KEY` e `LIVE_ACK` nunca são lidos nem gravados) e o relatório não mostra valores | U4, F12, F22 | estados `configured` e 4 últimos caracteres |
| CFG-3 | Valor de segredo nunca aparece em resposta HTTP, log, erro, journal, Brief ou conteúdo enviado ao modelo | U4, CFG-3 anterior | teste com valores sentinela |
| CFG-4 | Rotas de escrita só atendem loopback, `Host` de loopback, origem exatamente igual à própria origem do núcleo, cabeçalho `x-inonu-settings: 1`, `content-type: application/json`, corpo até 4 KB, esquema estrito, 20 escritas por minuto | CFG-4 anterior | testes de guarda |
| CFG-5 | Padrões não secretos (OKX v5, WebSocket público, base OnchainOS, RPCs por rede) devem estar em `providers.json` versionado; o usuário só revisa | U4 | arquivo e tela |
| CFG-6 | Apagar os arquivos de texto puro deve ser ação separada, com confirmação explícita e backup restaurável, nunca automática; a limpeza edita só as linhas dos quatro nomes e o backup guarda só esses quatro valores, nunca outras variáveis do arquivo | U4 | restauração testada |
| CFG-7 | Credencial incompleta é salva e marcada "incompleta"; nenhuma chamada autenticada é feita com ela | CFG-6 anterior | teste |
| CFG-8 | Configurações deve oferecer teste de conexão gratuito do OnchainOS (`market/supported/chain`) e mostrar orçamento e ledger | U4, U10 | tela |
| CFG-9 | Deve existir um comando de provisionamento, executado a partir do repositório nesta máquina, que lê as origens locais e grava **direto** no cofre do Windows, para o app instalado nascer configurado; o instalador carrega, no máximo, uma dica não secreta do caminho de origem | U4, F20 | comando e leitura do cofre sem `.env` |

### 3.3 Uso da API OnchainOS (API)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| API-1 | Todo acesso ao OnchainOS deve passar pelo gateway local; nenhuma credencial chega ao navegador | U3, ONC-8 anterior | varredura do bundle |
| API-2 | Todo ponto que assina requisições OKX deve estampar com o relógio corrigido pelo desvio medido contra a OKX, sem alterar o relógio do sistema: `src/okx-api.ts`, `src/okx-market/okx-api.ts`, `src/okx-market/okx-dex.ts`, `src/okx-wallet/portfolio.ts`, `src/okx-wallet/trade.ts`, `src/okx-signals/client.ts` e o transporte de `src/onchainos/http.ts` (cujo chamador injeta `okxNowMs`); o gateway já aprende o desvio por conta própria; os pontos de entrada em modo real chamam `syncOkxClock()`. O relógio assinado é sempre o corrigido (`okxNowMs()` ou o desvio aprendido pelo gateway pelo cabeçalho `Date`). O desvio **bruto** da máquina é diagnóstico e tem um único dono: o Doctor (`WIN-8`) mede e exibe o aviso "sincronize o horario do Windows". Quando o núcleo desktop injeta um `now` já corrigido, Configurações lê o desvio bruto de `okxClockStatus().offsetMs` (exposto pelo núcleo) e não de `clockOffsetMs` do gateway. Um 50102 que persiste depois da nova tentativa vira `clock_skew`, nunca "credencial recusada". | F3 | teste com desvio de 77 s; prova ao vivo |
| API-3 | O governador deve limitar por pedido (no máximo 15 chamadas), por dia e por mês e contar por camada (Free, Basic, Premium). Ao receber HTTP 402 (cota gratuita esgotada, que o gateway já trata como `provider_payment_required` bloqueando a camada por 1 h) deve servir cache marcado como antigo, informar "cota esgotada" e **nunca pagar**; ao receber 50011 (HTTP 429) é limite de taxa: recuo exponencial e `rate_limited`, sem aviso de cota esgotada | U3, U10, F11 | testes do governador |
| API-4 | Cada rota do catálogo deve ter camada, TTL mínimo, esquema de entrada e validação de saída; qualquer outro caminho é recusado antes de sair da máquina | ONC-2 anterior | testes do catálogo |
| API-5 | Normalizadores devem tratar as divergências documentadas. Tipo de carteira: `signal/list` e o canal de sinais usam 1 Smart Money, 2 KOL, 3 Baleia; `trades`, `holder` e `top-trader` usam 1 KOL, 2 Dev, 3 Smart Money, 4 Baleia, 5 carteira nova, 6 suspeita, 7 sniper, 8 phishing, 9 bundle; `leaderboard` usa 1 KOL, 2 Dev, 3 Smart Money, 4 Baleia, 5 carteira nova, 6 insider, 7 sniper, 8 suspeita de phishing, 9 bundle, 10 Pump Smart Money. Nomes de campo: `top10HolderPercent`, `top10HolderPercentage` e `top10HoldPercent`; `riskLevelControl` (hot-token) e `riskControlLevel` (advanced-info); `totalSellAmount` e `soldAmount`. Código numérico no cluster e no DeFi; status HTTP 200 com código 50038. Divergências adicionais medidas ao vivo em 2026-10-12: a chave `ClusterConcentration` (resposta real) contra `clusterConcentration` (exemplo da página); `rwa/tokens` exige `category` na prática; `market/token/toplist` exige `chains`, `sortBy` e `timeFrame` e não tem página no índice; `memepump/tokenList` identifica o token por `tokenAddress` e `tokenDetails` exige `walletAddress`; X Layer v5 usa `chainShortName=XLAYER` com `page` e `limit`, e o explorer v6 usa `chainIndex` com `cursor`; a escala dos percentuais difere por endpoint (`advanced-info.top10HoldPercent` e `memepump tags.top10HoldingsPercent` em percentual 0 a 100, `cluster/overview.top100HoldingsPercent` parece fração 0 a 1) e cada campo carrega `escala` (`pct100`, `fracao` ou `ambigua`); o rótulo de concentração do provedor é `Low`, `Medium`, `High` e o componente da trilha usa `baixa`, `media`, `alta` (adaptador explícito); `riskControlLevel` e `riskLevelControl` usam a mesma escala documentada de 0 a 5. | U13 | testes por divergência |
| API-6 | Cada uma das 499 páginas da documentação deve ter decisão registrada (integrar agora, sob demanda, especificado e desligado, depois ou fora), com requisito ou tarefa associada | U3, U13 | `onchainos-coverage.json` sem página sem decisão |
| API-7 | O adaptador de WebSocket do OnchainOS deve existir especificado e **desligado**; só liga quando o usuário confirmar plano pago que o inclua | F11 | teste de configuração |
| API-8 | O sistema deve medir (experimento controlado) se um lote em `POST` conta como 1 chamada ou N, e a camada de cobrança dos endpoints sem camada documentada; o resultado é registrado, nunca presumido. A medição segue `F2-MED-1` a `F2-MED-6` da SPEC da Fase 2: lotes de cerca de 10 chamadas somente leitura por família, com parâmetros distintos e sem cache, e o usuário lê os contadores Free, Basic e Premium do Developer Portal antes e depois de cada lote. Camada não medida continua contada como Basic (`tierSource: assumido`). | F11, 2.2 | relatório de medição |
| API-9 | Cada família de endpoint nova deve ter uma sonda real somente de leitura (plano Trial), com captura rotulada `real_probe`. Cada sonda real é arquivada em `evidence/` com forma e código, nunca valores de dados (modelo: `probe-2026-10-12.json` da Fase 2), rótulo `origin: real_probe` e o plano em uso. | U7 | capturas em `evidence/` |
| API-10 | O sistema nunca deve assinar pagamento x402 nem chamar rota de pagamento (fora na v1, ADR-6); 402 vira o estado "cota esgotada" | F11, D-U3 | teste: nenhum caminho de assinatura |
| API-11 | O limitador deve manter, por chave, no máximo 1 requisição a cada 1,1 s enquanto o limite real não for medido (`F2-MED-3` da Fase 2). O limite publicado no portal (Trade 3 req/s; Market, explorer e X Layer v5 5 req/s) é teto superior e nunca meta. Em 50011 ou HTTP 429 o limitador recua de forma exponencial (base 1,1 s, dobrando até 30 s) e responde `rate_limited`. Depois da medição o ritmo adotado é no máximo metade do ritmo seguro observado, registrado em `evidence/api-medicoes.md`. | 2.2 | teste |
| API-12 | O envelope do gateway deve acrescentar aos códigos existentes (`provider_payment_required`, `rate_limited`, `budget_exhausted`, `no_credentials` e os demais) apenas `clock_skew` (50102 que persiste depois de uma nova tentativa com o desvio de relógio aprendido), reusando os existentes para cota e taxa e nunca repassando mensagem bruta do provedor. `backend_stale` (404 sem envelope) e `origin_denied` (403) são códigos do **cliente** web e não do envelope: o gateway nunca responde em nome de uma rota que não existe. | SRC-1 | teste de contrato |
| API-13 | Quando a tela do Windows estiver desbloqueada e a página do portal estiver aberta no Edge, o sistema deve registrar em `evidence/` (captura em modo leitura, sem digitar nem clicar) o plano, a cota e os limites das chaves; até lá o item fica `bloqueado: tela do usuário` no CHECKPOINT | U2, F13 | captura ou bloqueio registrado |
| API-14 | O ticket e a escada de cotações devem tratar o fim do período de teste da Trade API (60 dias da criação da chave): estado degradado explícito e aviso de que, no plano seguinte, o ganho de slippage positivo pode ficar com a OKX | F19, WAL-5 | teste do estado |

### 3.4 Busca e contrato (SRC)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| SRC-1 | Quando uma rota local responde 404, 403 ou resposta sem envelope, a interface deve mostrar "Backend desatualizado ou fora do ar" com a ação sugerida, nunca "Resposta fora do contrato" | U6, F1 | teste do cliente |
| SRC-2 | "Resposta fora do contrato" só pode aparecer quando existe envelope válido cujo conteúdo viola o esquema, e deve registrar rota e campo no diagnóstico. Uma resposta do provedor com envelope válido e conteúdo legitimamente vazio (lista vazia, `details: []`, objeto sem dados) nunca é "fora do contrato": sai como `ok` com lista vazia ou `data: null`, entra no cache e a interface mostra uma linha neutra ("Sem sentimento para este simbolo"). "Fora do contrato" só para envelope que não é objeto, tipo errado ou linha com campo obrigatório quebrado, e registra rota e campo no diagnóstico. | U6 | teste |
| SRC-3 | No início, o núcleo deve validar todas as rotas esperadas (autoteste) e falhar de forma visível se alguma faltar; a interface mostra um banner enquanto `/onchain/status` falhar | U6, F2 | teste com rota removida |
| SRC-4 | Deve existir teste de contrato que executa o cliente web contra o servidor real do repositório, não contra um dublê | U6 | teste de integração |
| SRC-5 | A busca de token por símbolo ou endereço deve funcionar em cada rede suportada e devolver só resultados reais com idade e origem | U6, U7 | sonda real |

### 3.5 Painel inferior (DOC)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| DOC-1 | Cada aba do painel inferior deve mostrar dado real com idade, origem e orçamento, ou estado indisponível com o motivo; nenhuma aba vazia de enfeite | U5, DOC-1 anterior | testes de modelo e captura |
| DOC-2 | As abas Smart money, Traders e Holders devem ler o gateway (`signal/list`, `leaderboard/list`, `token/holder`, `token/top-trader`) e usar os TTL do catálogo | U5, U8 | sonda real |
| DOC-3 | A aba do diário deve passar a se chamar **Inonu** e refletir o ledger de pedidos; a aba Ecossistema deve ler `/onchain/status` e o orçamento, não ciclos antigos do operador | U5, U16 | teste de modelo |
| DOC-4 | O painel deve ter 5 abas (Inonu, Radar, Fluxo, Carteira, Mercado bruto), com Fita, Livro e Liquidez recolhidos na última. O destino de cada superfície on-chain atual está em [info-diet.md](info-diet.md) seção 3. Em qualquer redimensionamento da janela o estado de layout (`narrow`) segue a mudança e o foco on-chain não é perdido; teste de redimensionamento cobre os dois. | U12 | teste de `dock.ts` |

### 3.6 Redes (CHN)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| CHN-1 | A lista de redes deve vir de `market/supported/chain` (cache de 24 h), com busca e grupos, e cobrir todas as redes que o provedor listar (34 no Open API em 2026-10-12); rede não listada fica desabilitada com o motivo | U5 | teste com resposta real |
| CHN-2 | O registro de identidade de token deve reconhecer **como EVM** todas as 29 redes EVM da lista de 34 do provedor (hoje faltam 143, 4663, 5042, 999, 57073, 1672 e 9745) e normalizar o endereço EVM em minúsculas, derivando a lista do provedor e não de uma constante fixa | U5 | um teste por rede em `token-identity` |
| CHN-3 | A capacidade por família (mercado, sinal, leaderboard, portfólio, cluster, balance, explorer) deve ser descoberta pelos endpoints `supported/chain` de cada família | U13 | teste |

### 3.7 Ícones (ICO)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| ICO-1 | Cada ativo e cada rede em listas, busca e Watchlist deve exibir o ícone, com ficha de letras como reserva | U5 | captura e teste de render |
| ICO-2 | O gateway deve encaminhar só `tokenLogoUrl`, `chainLogoUrl`, `logoUrl` e `logo` sanitizados: `https`, host em `static.okx.com`, `static.oklink.com` ou `static.coinall.ltd`; qualquer outro é descartado. Esta decisão **reverte** a de `src/onchain-read/catalog.ts:9-10` (hoje o gateway remove logos). A decisão vale **só para logos** (`tokenLogoUrl`, `chainLogoUrl`, `logoUrl`, `logo`). Links de notícia, avatares de KOL, URLs de tweet e qualquer outro campo de URL continuam descartados. Os testes que antes afirmavam "sem http" passam a afirmar que todo campo de URL na saída é um logo permitido e que `cleanText` nunca carrega URL. | U5 | teste de sanitização |
| ICO-3 | O navegador nunca deve contatar host de terceiro **para imagens**: elas vêm de `/onchain/logo`, proxy local com cache em disco (a API pública `www.okx.com` e o WebSocket público continuam sendo chamados direto pelo navegador, como hoje) | U5, `catalog.ts:9-10` | varredura das requisições de imagem |
| ICO-4 | Para instrumentos da OKX sem logo no ticker, o ícone deve ser resolvido por símbolo via `token/basic-info` ou `token/search`, **só para as linhas visíveis**, preferindo o token reconhecido pela comunidade quando houver colisão de símbolo, com cache de 30 dias contado no orçamento e ficha de letras como reserva | U5 | teste |

### 3.8 Dados reais (DAT)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| DAT-1 | O bundle de produção não deve alcançar fixture, sintético ou mock (`fixtures`, `synthetic*`, `mock*`, `SYNTHETIC_*`) | U7 | teste de pureza |
| DAT-2 | Todo dado exibido deve ter `origin` (`okx_public_v5`, `onchainos`, `wallet`) e idade; sintético, atrasado ou indisponível nunca aparece como ao vivo | U7 | testes de modelo |
| DAT-3 | O núcleo desktop não deve iniciar `MODEL=mock`, `DRY_RUN` do trader Kuru nem `SYNTHETIC_DEX_REPORT` | U7, D-U2 | teste do núcleo |

### 3.9 Motor de fluxo (FLX), ver [flow-engine.md](flow-engine.md)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| FLX-1 | O motor deve construir um footprint por vela e por faixa de preço a partir do canal `trades` (lado agressor), com largura da faixa múltipla do tick | U11, F16 | vetores |
| FLX-2 | Fator **Imbalance** conforme [flow-engine.md](flow-engine.md) 2.1, parâmetros X e piso de volume, modo diagonal ou horizontal | U11, F14 | vetores |
| FLX-3 | Fator **Sequencial** (N níveis consecutivos com imbalance do mesmo lado) | U11 | vetores |
| FLX-4 | Fator **Progressão** (volume agredido crescente por X níveis consecutivos) | U11 | vetores |
| FLX-5 | Fator **Exaustão** (diferença entre compra e venda decrescente por X níveis consecutivos) | U11 | vetores |
| FLX-6 | Fator **Volume** (marca os K de 0 a 3 níveis de maior volume da vela), **Ordem original** e **Alerta de quantidade** | U11 | vetores |
| FLX-7 | Delta por vela e acumulado de sessão, absorção e perfil de volume (POC, HVN, LVN) | U11 | vetores |
| FLX-8 | Limiares devem ser adaptativos (percentis móveis), sem constante fixa de mercado | U8, U11 | teste |
| FLX-9 | Para ativos on-chain, o fluxo deve vir de `market/trades`, `price-info` e `hot-token`, rotulado como aproximação | U8, F16 | rótulo no modelo |
| FLX-10 | Os rótulos e campos do motor e do rastreador não podem usar verbos de ordem. Lista exata proibida, varrida por teste sobre palavras inteiras: comprar, compre, vender, venda, buy, sell, hold, action, signal, recommend, vote, side e a palavra sinal; a única exceção são os campos de lado agressor do negócio (`side`) e a coluna `aggressor`. Rótulos descritivos usam o valor medido (por exemplo "Agressao 60 s: +0,42"); "pressao compradora" e "pressao vendedora" descrevem o lado agressor e nunca são instrução. A interface pode dizer "sinais de carteiras rastreadas" porque é o nome do dado da OKX | grafico-jev P4 | varredura com lista exata |
| FLX-11 | Em perpétuos o volume do canal `trades` (`sz`) é em contratos: o motor deve convertê-lo para moeda base por `ctVal * ctMult` de `public/instruments` antes de somar e definir a unidade por `instType`; spot e perpétuo nunca são somados nem comparados sem conversão | F18 | vetor com `ctVal` 0,01 |
| FLX-12 | Enquanto não houver `N` velas fechadas (padrão 50) os limiares adaptativos e o CVD de sessão são `null` com motivo `aquecimento` (ou preenchidos por backfill de `history-trades` com o custo REST declarado); nenhum fator usa limiar parcial como se fosse completo. O motor pode partir da memória da execução anterior: o histórico por minuto e os tamanhos de negócio ficam em `data/flow/` (validade de 6 horas, validação estrita, só dado real do próprio instrumento) e a interface diz quantos minutos são restaurados (`restaurado`); a memória nunca guarda negócios. | flow-engine 2.8 | teste de aquecimento |

### 3.10 Zonas e trilha do dinheiro esperto (SMT), ver [flow-engine.md](flow-engine.md)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| SMT-1 | O motor deve gerar zonas de interesse por confluência de famílias independentes de evidência, com nota, fatores, lado, limites, idade, estado (ativa, testada, mitigada, expirada) e nível de invalidação | U8 | vetores |
| SMT-2 | Zonas devem ser recalculadas a cada barra coalescida fechada, com decaimento por idade | U8 | teste |
| SMT-3 | O custo médio das carteiras inteligentes e a distribuição (`soldRatioPercent`, `soldAmount`) devem entrar como família de evidência | U8, U13 | vetores |
| SMT-4 | A pontuação on-chain por token deve combinar compra líquida de carteiras rastreadas, nº de carteiras, fração vendida, qualidade da carteira, concentração e clusters, risco, liquidez e carga de taxa, fluxo e sentimento, com pesos configuráveis e registrados. Para a qualidade da carteira o gateway repassa `triggerWalletAddress` **apenas ao motor, no servidor**, nunca ao navegador; isto reverte a decisão de `src/onchain-read/catalog.ts:8-10` de não repassar endereços de carteiras | U8, U13 | vetores |
| SMT-5 | A saída do motor é descritiva: zonas e candidatos são **neutros** (id, limites, nota, fatores, idade, estado); o código nunca converte o lado de uma zona em compra ou venda | U8, U9 | teste |
| SMT-6 | A validação das zonas deve usar backtest pareado contra uma linha de base; sem medição, a documentação diz "não medido" e não afirma ganho | U8 | relatório |
| SMT-7 | O indicador smart money atual do gráfico (SMC) deve ser mantido e ligado por padrão | U9 | teste de prefs |

### 3.11 Ingestão (ING)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| ING-1 | Ticks e livro devem ser coalescidos em barras de 1 s, 5 s e 1 min por tempo do evento antes de qualquer cálculo; o modelo nunca recebe tick bruto | U10 | teste |
| ING-2 | O motor só recalcula na barra fechada; o Brief só é regerado se algum fator cruzar limiar material | U10 | teste |
| ING-3 | O sistema deve medir e exibir mensagens por segundo por fonte (hoje não medido) | U10, F9 | diagnóstico |
| ING-4 | Memória e filas devem ter limite explícito (por exemplo, 5000 negócios) com descarte contado | U10 | teste |

### 3.12 Pedir ao Inonu (ASK)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| ASK-1 | Em segundo plano, o sistema não deve chamar o modelo por padrão; o `jev-read` do núcleo roda em `--observe` | U10, U16, F9 | contador de chamadas igual a zero |
| ASK-2 | Quando o usuário clica em "Pedir ao Inonu" (gráfico, Rastreador ou linha do ativo), o núcleo deve montar o Evidence Brief só com o que mudou (hash), chamar o modelo uma única vez e devolver a resposta | U16 | teste com modelo falso |
| ASK-3 | O Evidence Brief deve ter até 2 KB por candidato, origem e idade por campo, hash, `null` com motivo para o desconhecido e nenhum dado bruto | U10 | teste de tamanho e determinismo |
| ASK-4 | O modelo responde `{action, candidateId, pesos}` com `action` em buy, sell ou hold: **é o modelo quem decide a ação**; `candidateId` deve ser um dos ids gerados por código (zonas, tokens on-chain, ativos spot e perpétuos) ou nulo em hold; resposta com id desconhecido, ação inválida ou texto livre é descartada e nunca vira instrução nem número | U9, `decide.ts`, CLAUDE.md | teste |
| ASK-5 | `POST /inonu/ask` deve ter single-flight, cooldown, teto de custo por pedido e por dia e razão registrada; ao estourar teto responde "teto atingido" sem chamar o modelo; contrato de pedido, resposta e códigos em [flow-engine.md](flow-engine.md) seção 5 | U10 | teste |
| ASK-6 | O ledger deve registrar chamadas, tokens, USD e latência **medidos**, com `null` quando desconhecido | U10, F9 | teste |
| ASK-7 | O resultado deve aparecer no gráfico como marcador de decisão do Inonu com cartão Aceitar, Ignorar e Silenciar tipo, mostrando "modelo: Jev" como proveniência | U9 | teste de render |
| ASK-8 | O gráfico deve permitir filtrar a origem dos sinais exibidos (Inonu, carteiras rastreadas, fluxo, zonas) e, para os sinais de carteiras, os parâmetros que a API oferece (`walletType`, `minAmountUsd`, `minAddressCount`), com persistência local | U9 | teste |
| ASK-9 | A linha legada "System One, alavancagem em MON-USDT-SWAP: Jev nao consultado..." deve ser substituída por um estado do pedido ("Sem pedido", "Perguntando ao Inonu", "Inonu respondeu ha N min"); a trilha de alavancagem vira família de candidatos de perpétuos | U16, F10 | testes fixados atualizados |
| ASK-10 | O assistente exibido é "Inonu"; o nome "Jev" só aparece como proveniência do modelo. Há uma tarefa de varredura e troca em todo texto exibido de `web/src/components/Desk/**`, `web/src/lib/mesa/**`, `web/src/lib/desk/**` e das telas novas, preservando nomes de código; as áreas fora do instalável (Z6) são exceção explícita. A varredura inclui as telas das rotas `ECO` (Fita, Liquidez e Holders on-chain, Ecossistema, gráfico on-chain) e os testes fixados correspondentes (feita em T7.9; `web/src/lib/inonu/naming-scan.test.ts` impede a volta). A proveniência "modelo: Jev" do cartão de decisão não muda. | D-U1 | varredura com escopo definido |
| ASK-11 | O envelope da resposta deve manter `advisory: true` e `execution: "never"` | D-U2 | teste |
| ASK-12 | O usuário deve poder pedir ao Inonu uma **descoberta** pela barra superior ("melhores entradas agora"): o núcleo coleta, só nesse momento, os dados do ecossistema (modo descoberta do ADR-6, até 15 chamadas), monta os candidatos e o modelo responde; nada disso roda sem o clique | U16 | teste com modelo falso |
| ASK-13 | Alertas de fluxo e de zona são algorítmicos e locais, sem chamada ao modelo; cada alerta oferece o botão "Pedir ao Inonu" e só ele inicia a consulta | U10, U16 | contador de chamadas em zero |
| ASK-14 | "Aceitar" tem efeito definido por família de candidato: token on-chain preenche o ticket (WAL-7); ativo da OKX (spot e perpétuo) registra a aceitação no diário local e não cria ordem (não há API de ordem da exchange no escopo); zona e hold registram a decisão e a razão; nenhum caso envia ordem | U9, D-U3 | teste por família |

### 3.13 Rastreador (RAS), ver [rastreador.md](rastreador.md)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| RAS-1 | Deve existir a rota `/rastreador`, com entrada na barra superior, atualizando a especificação e o teste da barra | U15 | teste |
| RAS-2 | O universo deve incluir spot e perpétuos da OKX (sem custo extra) e tokens on-chain por rede (`hot-token`) | U15, F15 | teste |
| RAS-3 | As colunas e visões devem ser as definidas em [rastreador.md](rastreador.md), com **Pressão de fluxo** descritiva em lugar de Tech Rating. A pressão de fluxo de cada linha da janela é medida por uma leitura REST gratuita de `market/trades` (até 500 negócios, só contam os do último minuto) a cada 60 s; a janela de tempo que a amostra cobre de fato aparece na célula e no título, e um par muito negociado enche os 500 em poucos segundos. Em perpétuos o Vol USD é contratos × `ctVal` × `ctMult` × último preço (aproximado, `~`), com o tamanho do contrato lido uma vez por sessão de `public/instruments`; sem ele o volume é `-` (FLX-11). | U15, F15 | teste |
| RAS-4 | Filtros, ordenação, telas salvas locais e colunas por visão devem funcionar sem chamada ao modelo | U15 | teste |
| RAS-5 | "Perguntar ao Inonu" deve traduzir linguagem natural em filtro estruturado validado contra o esquema, sob demanda e com teto. O modelo recebe só a frase e responde **uma opção por pergunta fechada** (mercado, volume mínimo, variação de 24 h, posição por volume, ordem, fixados), cada opção com seu significado; o código monta o filtro dessas opções (`src/inonu/screener.ts`) e nada que o modelo escreva vira campo ou número. Resposta fora das opções é descartada. | U15, U16 | teste com modelo falso |
| RAS-6 | Linhas selecionadas devem permitir "Pedir ao Inonu" para ranquear as N escolhidas, respeitando ASK-5 | U16 | teste |

### 3.14 Carteira (WAL), ver [wallet.md](wallet.md)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| WAL-1 | A conexão com a extensão deve ocorrer só por clique do usuário, em EVM e Solana, detectando `window.okxwallet` e EIP-6963 e tratando 4001, 4100, 4900, 4902 e -32002; o código existente `web/src/lib/okx-wallet.ts` (F21) é estendido e reaproveitado, não reescrito | U13, U14, F21 | testes com provider falso rotulado e conferência manual |
| WAL-2 | Trocar rede usa o `wallet_switchEthereumChain` existente; o que é novo é `wallet_addEthereumChain` em 4902, com RPCs de `providers.json`, só por clique | U13, F21 | teste |
| WAL-3 | Sem extensão, deve existir a reserva OKX Connect por QR para EVM e Solana, ou a limitação registrada se falhar no export estático | U14 | spike |
| WAL-4 | Com carteira conectada, o gateway deve ler saldo total e por token, histórico (6 meses), PnL por token, visão geral e posições DeFi do endereço, com idade e origem | U13 | dados reais |
| WAL-5 | O sistema deve montar escada de cotações (`aggregator/quote`) com impacto, rota, `isHoneyPot` e `taxRate`, no máximo 5 por ticket | U13 | teste |
| WAL-6 | O ticket de ordem deve **exibir** os dados de `/swap` e `/approve-transaction` (`minReceiveAmount`, slippage, etapa de aprovação) sem nenhum botão ou caminho de envio | D-U3 | teste: nenhum caminho para `eth_sendTransaction` |
| WAL-7 | "Aceitar" a sugestão do Inonu deve apenas preencher o ticket | U9, D-U3 | teste de fluxo |
| WAL-8 | O app nunca deve guardar chave privada, assinar sozinho, difundir transação pelo servidor, usar Agentic Wallet, `@okx-dex/okx-dex-sdk` ou DEX Widget | D-U3 | varredura de dependências e de chamadas |
| WAL-9 | O envio "Enviar pela minha carteira" deve estar especificado (tetos, cotação fresca, limite de impacto, confirmação digitada, parada) e **desligado**; implementar exige autorização do usuário em ciclo próprio | D-U3 | documento |

### 3.15 Interface enxuta (INF)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| INF-1 | Cada tela deve mostrar o que o humano precisa para decidir ou auditar o Inonu; o resto vive em gavetas, com orçamento máximo de itens por aba | U12 | teste de modelo |
| INF-2 | A tabela "manter, mover ou remover" por painel atual deve existir em [info-diet.md](info-diet.md) | U12 | documento |
| INF-3 | Um teste deve impedir painel novo sem ID de requisito | U12 | teste |

### 3.16 Qualidade (QLT)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| QLT-1 | Código novo segue teste que falha primeiro, implementação mínima e verificação real; saída guardada | protocolo do usuário | evidência por tarefa |
| QLT-2 | `bun --no-env-file run test:all`, `typecheck:all` e `next build` devem passar ao fim de cada onda | protocolo | saída |
| QLT-3 | A varredura de tipografia (ponto médio, travessão, meia-risca) deve passar nos arquivos novos e alterados, e uma **nova** varredura de animação (animação infinita, blink, pulse, keyframes repetidos) deve cobrir esses arquivos, inclusive `src/intel`, `src/inonu` e os estilos novos; a varredura atual (`web/src/lib/typography-scan.test.ts`) cobre só tipografia em `web/src` | CLAUDE.md | varredura nova |
| QLT-4 | Capturas nas larguras 1600x900, 1280x720, 1100x700 e 390x844 para as telas novas | DOC-4 anterior | capturas |
| QLT-5 | Revisão independente em cópia isolada, por agente distinto do implementador | protocolo | parecer |
| QLT-6 | O `CHECKPOINT.md` deve distinguir configuração válida, carregado em sessão nova, funcionando ao vivo e ganho medido | protocolo | documento |
| QLT-7 | Edições em arquivo modificado por outra sessão só por um integrador, após `git status --short -- <caminho>` nas duas árvores; commits só dos caminhos próprios | memória do projeto, [OWNERSHIP.md](OWNERSHIP.md) | log |
| QLT-8 | Antes de cada onda deve ser registrada a linha de base de `test:all` e `typecheck:all`, porque o working tree tem mudanças de outras sessões | protocolo | saída guardada |

## 4. Exclusões, riscos e decisões

**Exclusões:** pagamento x402 e assinatura do provedor; difusão de transação; Agentic Wallet, `@okx-dex/okx-dex-sdk`, demo `run-your-first-dapp`; DEX Widget (iframe opaco); MCP e Skills da OnchainOS em runtime; OKX.AI e A2A; trader Kuru no instalável (D-U2); remoção do Kuru e reescrita do `CLAUDE.md` (decisão separada); sincronização do relógio do Windows (exige administrador, ação do usuário); leitura do portal enquanto a tela estiver bloqueada; assinatura de código do instalador; atualização automática.

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Colisão com 110 caminhos de outras sessões | Perda de trabalho | [OWNERSHIP.md](OWNERSHIP.md), integrador único, `git status` por caminho, arquivos novos |
| Extensão não injeta em janela `--app` | WAL e U14 falham | Spike T1.1 antes do instalador; reserva OKX Connect; janela normal do Edge |
| Custo da API ou do modelo | Gasto não autorizado | Governador (API-3), tetos (ASK-5), ledger (ASK-6), sem pagamento (API-10) |
| Contratos da OKX divergem da documentação | Erro de contrato | Normalizadores com teste (API-5), sondas reais (API-9) |
| Hora do Windows fora de sincronismo | Assinaturas recusadas | Compensação (API-2), Doctor (WIN-8), pedido ao usuário |
| Next 16 fora do padrão | Retrabalho no export estático | Ler a documentação local antes (tarefa T1.3) |
| Texto de fatores da Nelogica sem fórmula | Divergência de leitura | Definição operacional própria e parametrizada ([flow-engine.md](flow-engine.md)) |
| Resposta vazia legítima lida como erro ou como sinal | Mensagem falsa ou decisão sobre dado ausente | Vazio é dado (SRC-2); `nulos` do Brief distingue vazio, não consultado e erro (`F2-DIG-3`) |
| Símbolo diferente de contrato | Sentimento ou notícia de outro token | Sentimento só com símbolo inequívoco (`F2-DIG-6`) |
| Resposta maior que o teto do gateway (2 MB) | Chamada recusada em silêncio | Teto por rota e erro explícito (`F2-MED-4`) |
| Família do provedor não habilitada para a chave | Tarefa que depende de rota inexistente | Sondagem única registrada (`F2-OCX-11`) |
| Escala de percentual ambígua | Nota da trilha errada | Campo com `escala` e vetor de ouro (`F2-DIG-2`, `F2-DIG-8`) |
| Fatores de limiar só existem depois de 50 minutos fechados | Camada de fluxo quase vazia nos primeiros minutos do primeiro uso | Memória entre execuções (FLX-12) e nota "Fluxo aquecendo n/50" no gráfico |

Alternativas reais consideradas: Tauri 2, Electron, PWA, Edge `--app` (escolhida), ver [adr/ADR-1](adr/ADR-1-instalavel.md). Recibo JEV: não consultado nesta entrega (custo desconhecido `null`); as decisões foram tomadas por evidência local. Decisão delegada não é resposta humana nem autorização externa.

## 5. Aceitação independente

Cada AC é verificável por quem não implementou. Evidência exigida é sempre execução real, leitura do alvo ou captura; "documento escrito" nunca conclui um AC de código.

| AC | Req | Resultado observável | Evidência exigida |
| --- | --- | --- | --- |
| AC-WIN-1 | WIN-1, WIN-5, WIN-7, WIN-11 | Instalação silenciosa em pasta temporária cria só binários, atalhos e chaves HKCU próprias; desinstalação os remove; nenhum nome do JevWIN | Listagem de arquivos e registro antes e depois; saída guardada |
| AC-WIN-2 | WIN-2 | Nenhuma cadeia de segredo no artefato do instalador | Varredura com valores sentinela e padrões `OKX_WEB3_*` com valor |
| AC-WIN-3 | WIN-3, WIN-6 | Segundo início foca a janela do Inonu em execução; porta ocupada por outro programa dá erro nomeado; com uma página conectada o núcleo continua vivo, sem nenhuma por 60 s ele encerra, e uma recarga não o encerra | Testes de integração com conexões reais |
| AC-WIN-4 | WIN-4 | Com a extensão no perfil do Edge, a janela `--app` usa esse perfil; sem ela, o Doctor instrui | Teste com perfis simulados e conferência manual na máquina |
| AC-WIN-5 | WIN-8 | O Doctor mostra os 8 itens com ação; o desvio do relógio é medido, não presumido | Captura da tela e resposta de `/doctor` |
| AC-WIN-6 | WIN-9, WIN-10 | Instala e inicia com PATH sem node, python, rustc; build único com SHA-256 | Saída do build e da instalação |
| AC-WIN-7 | WIN-12, WIN-13 | O exe compilado não carrega `.env` nem `bunfig.toml` do diretório de trabalho e nunca lê `PRIVATE_KEY` nem `LIVE_ACK`; o export do instalável não tem a rota `/console` e a barra não tem o link | Flags do build; teste de varredura; teste de rotas |
| AC-CFG-1 | CFG-1, CFG-2, CFG-3 | Após o primeiro início, os 4 segredos estão no cofre, relatório sem valores; sentinela não aparece em nenhuma saída | Teste sentinela; listagem do cofre sem valores |
| AC-CFG-2 | CFG-4, CFG-7, CFG-8 | Guardas aceitam só a origem própria; incompleta marca estado; teste de conexão gratuito responde `{ok, code}` | Testes de guarda e de conexão |
| AC-CFG-3 | CFG-5, CFG-6 | `providers.json` presente; apagar texto puro exige confirmação e é restaurável | Teste de restauração |
| AC-CFG-4 | CFG-1, CFG-2, CFG-9 | Depois do comando de provisionamento, o app instalado inicia com os quatro segredos no cofre e sem `.env`; só os quatro nomes são lidos | Leitura do cofre sem `.env`; teste de allowlist |
| AC-API-1 | API-1, API-4, API-12 | Bundle não contém credencial; caminho fora do catálogo é recusado; envelope inclui os 3 novos códigos | Varredura do bundle; testes do catálogo |
| AC-API-2 | API-2 | Com relógio local deslocado 77 s, chamadas assinadas funcionam em todos os clientes | Teste com `Date` falso |
| AC-API-3 | API-3, API-10, API-11 | Com 402 o gateway serve cache `stale`, informa "cota esgotada" e bloqueia a camada; com 50011 recua e responde `rate_limited` sem aviso de cota; não há caminho de assinatura de pagamento; pedido com mais de 15 chamadas é cortado | Testes do governador; varredura de dependências |
| AC-API-4 | API-5 | Cada divergência documentada tem teste que normaliza ambos os formatos | Testes |
| AC-API-5 | API-6 | `onchainos-coverage.json` lista 499 páginas e 0 sem decisão | Execução de `tools/okx-coverage.ts --check` |
| AC-API-6 | API-7, API-8, API-9 | Adaptador WebSocket desligado por padrão; relatório de medição de lote e de camadas; capturas `real_probe` por família nova | Arquivos em `evidence/` |
| AC-API-7 | API-13, API-14 | Captura em modo leitura da página do portal (plano, cota, limites) ou o bloqueio registrado; estado degradado do ticket após o período de teste da Trade API | Captura em `evidence/`; teste do estado |
| AC-SRC-1 | SRC-1, SRC-2 | Contra servidor sem a rota, a interface mostra "Backend desatualizado ou fora do ar"; só um envelope inválido mostra "fora do contrato" | Teste do cliente contra dois servidores |
| AC-SRC-2 | SRC-3, SRC-4 | Núcleo sem uma rota falha no autoteste; teste de contrato roda contra servidor real | Testes de integração |
| AC-SRC-3 | SRC-5 | Busca por `BTC`, `SOL` e um endereço em 3 redes retorna resultados reais com idade e origem | Sonda real e captura |
| AC-DOC-1 | DOC-1, DOC-2 | Abas Smart money, Traders e Holders mostram linhas reais com idade e orçamento, ou o motivo | Captura 1600x900 e 390x844 |
| AC-DOC-2 | DOC-3, DOC-4 | O painel tem 5 abas; a aba Inonu reflete o ledger; Ecossistema lê `/onchain/status` | Testes de modelo e de dock |
| AC-CHN-1 | CHN-1, CHN-2, CHN-3 | Seletor lista todas as redes do provedor, com busca; as 29 redes EVM são reconhecidas como EVM (um teste por rede); rede ausente desabilitada com motivo | Teste com resposta real; captura |
| AC-ICO-1 | ICO-1, ICO-4 | Lista, busca e Watchlist exibem ícones reais; sem logo, ficha de letras | Captura nas duas larguras |
| AC-ICO-2 | ICO-2, ICO-3 | Host fora da lista é descartado; nenhuma requisição de **imagem** do navegador a terceiro | Teste de sanitização; log de rede |
| AC-DAT-1 | DAT-1, DAT-2, DAT-3 | O teste de pureza falha se um fixture for importado; todo dado tem `origin` e idade; o núcleo não inicia mock | Teste de pureza e do núcleo |
| AC-FLX-1 | FLX-1 | Footprint de um conjunto de negócios conhecidos reproduz os volumes por nível calculados à mão | Vetores |
| AC-FLX-2 | FLX-2, FLX-3, FLX-4, FLX-5 | Os números dos exemplos da Nelogica (80 e 215 com X=2; 475, 315 e 560 com N=3; 385, 165 e 30 com X=3; 50, 190 e 290 com X=3) produzem as marcas esperadas pela **definição operacional deste SPEC**, com disposição por nível e contrapartes escolhidas por nós; isto prova consistência interna, não fidelidade ao Profit Pro, que só se compara manualmente numa plataforma real | Vetores; comparação manual opcional |
| AC-FLX-3 | FLX-6, FLX-7 | Fator Volume marca K níveis; Ordem original e Alerta de quantidade disparam no limiar; delta e CVD fecham | Vetores |
| AC-FLX-4 | FLX-8, FLX-9, FLX-10 | Nenhuma constante de mercado fixa; on-chain rotulado aproximação; varredura sem vocabulário de ordem | Testes e varredura |
| AC-FLX-5 | FLX-11, FLX-12 | Perpétuo com `ctVal` 0,01 converte contratos em moeda base; antes de `N` velas os limiares e o CVD são `null` com motivo `aquecimento` | Vetores e teste de aquecimento |
| AC-SMT-1 | SMT-1, SMT-2, SMT-5 | Zona tem os campos exigidos, muda de estado com os dados e é recalculada na barra fechada | Vetores |
| AC-SMT-2 | SMT-3, SMT-4 | Custo médio e pontuação por token reproduzem vetores calculados à mão; pesos registrados | Vetores |
| AC-SMT-3 | SMT-6, SMT-7 | Relatório de backtest pareado ou "não medido"; SMC continua ligado por padrão | Relatório; teste de prefs |
| AC-ING-1 | ING-1, ING-2, ING-4 | Entrada de N ticks produz M barras; Brief só muda com fator material; filas têm limite e descarte contado | Testes |
| AC-ING-2 | ING-3 | Mensagens por segundo por fonte aparecem no diagnóstico | Captura |
| AC-ASK-1 | ASK-1 | Com o núcleo desktop ligado por 10 min sem clique, o contador de chamadas ao modelo é 0 | Contador do ledger |
| AC-ASK-2 | ASK-2, ASK-3, ASK-4 | Um clique gera uma chamada; Brief até 2 KB, determinístico; a resposta `{action, candidateId}` com id desconhecido ou ação inválida é descartada | Teste com modelo falso |
| AC-ASK-3 | ASK-5, ASK-6 | Dois cliques simultâneos geram 1 chamada; teto estourado responde sem chamar; ledger tem valores medidos ou `null` | Testes |
| AC-ASK-4 | ASK-7, ASK-8, ASK-10 | Marcador e cartão aparecem com "modelo: Jev"; filtros persistem; texto exibido diz Inonu | Teste de render; varredura |
| AC-ASK-5 | ASK-9, ASK-11 | A linha legada não existe mais; estados do pedido aparecem; `execution: "never"` mantido | Testes fixados atualizados |
| AC-ASK-6 | ASK-2 (consulta real) | Uma consulta real autorizada, de custo pequeno, registrada com recibo | Recibo de uso e custo (só com autorização do usuário) |
| AC-ASK-7 | ASK-12, ASK-13, ASK-14 | O pedido de descoberta só roda após o clique e respeita 15 chamadas; um alerta não chama o modelo; "Aceitar" faz o efeito definido por família e nunca envia ordem | Testes com modelo falso; contador do ledger |
| AC-RAS-1 | RAS-1, RAS-2, RAS-3 | `/rastreador` abre pela barra; universo OKX e on-chain; colunas conforme a especificação | Teste da barra; captura |
| AC-RAS-2 | RAS-4, RAS-5, RAS-6 | Filtros e telas salvas funcionam sem modelo; "Perguntar ao Inonu" produz filtro validado; seleção gera pedido respeitando o teto | Testes com modelo falso |
| AC-WAL-1 | WAL-1, WAL-2 | Conexão só por clique; erros tratados; rede nova só por clique | Testes com provider falso e conferência manual |
| AC-WAL-2 | WAL-3 | OKX Connect por QR validado ou limitação registrada | Spike |
| AC-WAL-3 | WAL-4, WAL-5 | Com o endereço conectado, saldos, histórico e PnL reais aparecem com idade; escada de cotações com no máximo 5 | Capturas; teste do limitador |
| AC-WAL-4 | WAL-6, WAL-7, WAL-8 | Não existe caminho de código para `eth_sendTransaction`, `signAndSendTransaction`, broadcast no servidor, Agentic Wallet, SDK ou Widget; "Aceitar" só preenche o ticket | Varredura estática e teste de fluxo |
| AC-WAL-5 | WAL-9 | `wallet.md` descreve os portões e a opção está desligada | Documento; teste de configuração |
| AC-INF-1 | INF-1, INF-2, INF-3 | Tabela existe; cada aba respeita o orçamento; painel sem ID de requisito falha o teste | Testes |
| AC-QLT-1 | QLT-1, QLT-2, QLT-3 | Suítes, typecheck e build verdes; varreduras de tipografia e animação verdes | Saídas guardadas |
| AC-QLT-2 | QLT-4 | Capturas nas 4 larguras sem corte de texto | Capturas |
| AC-QLT-3 | QLT-5, QLT-6, QLT-7 | Parecer de revisor distinto; CHECKPOINT distingue os quatro estados; sem edição de caminho alheio | Parecer; log de `git status` |
| AC-QLT-4 | QLT-8 | A linha de base de `test:all` e `typecheck:all` está registrada antes de cada onda | Saída guardada no CHECKPOINT |

Congelamento: hash em [FREEZE.json](FREEZE.json), calculado por [tools/freeze.ts](tools/freeze.ts) depois da revisão independente. Mudança de escopo ou de critério precisa de autorização válida do usuário e de histórico explícito, nunca de ajuste para fazer checks passarem.
