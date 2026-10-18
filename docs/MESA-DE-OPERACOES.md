# Mesa de operacoes do Jev

A mesa e a tela unica do Jev: uma central de decisao em tela cheia, sem rolagem, com paineis em 2.5D e 3D ao redor do Jev, no estilo de uma mesa de tape reading. Ela mostra o mercado real da OKX, a carteira OKX Wallet e o estado do ecossistema OnchainOS, e coloca no centro a decisao do Jev.

## Dados reais, sem dado inventado

| Fonte | Uso | Credencial | Onde roda |
| --- | --- | --- | --- |
| OKX v5 WebSocket publico (`wss://ws.okx.com/ws/v5/public`) | livro (`books`), trades, tickers, funding, mark, open interest | nenhuma | navegador |
| OKX v5 WebSocket business (`/ws/v5/business`) | candles em tempo real | nenhuma | navegador |
| OKX v5 REST publico (`https://www.okx.com/api/v5/market`, `/public`) | historico de candles, instrumentos, carga inicial | nenhuma | navegador |
| Backend Jev (`/system-one`, `/operator`) | decisoes reais do Jev e ciclo do operador | so no servidor | backend Bun |
| OKX Wallet (provider injetado) | inventario observado, rede, conta | gesto explicito do usuario | navegador, local |
| OnchainOS Web3 (DEX, portfolio) | cotacoes e saldos por API | chave do projeto, so no servidor | backend, hoje bloqueado sem chave |

Regras que nao se quebram:

1. Nenhum numero mostrado e fabricado. Valor desconhecido e `null` e a tela diz "Indisponivel".
2. Cada feed tem estado proprio (`DeskFeedStatus`): vivo, velho, reconectando ou falho. Dado velho e rotulado e esmaecido, nunca apresentado como atual.
3. Fixture existe so em teste e no laboratorio de desenvolvimento. Nenhum caminho de producao usa fixture.
4. Capacidade bloqueada (por exemplo OnchainOS sem chave) aparece com o motivo e o proximo passo, nunca como dado de exemplo.
5. A mesa nao assina nem envia nada. Execucao continua atras dos gates do operador.

## Contrato

`web/src/lib/desk/types.ts` e a unica fonte dos tipos (`DeskState`, `DeskBook`, `DeskTrade`, `DeskCandle`, `DeskMetrics`, `DeskFeedStatus`). Numeros servem para exibicao e analise, nunca para saldo ou quantidade de ordem.

## Layout (1440x900, sem rolagem)

- Trilho superior: marca, saude dos feeds (OKX WS, OKX REST, Jev, Carteira, OnchainOS), relogio UTC.
- Ala esquerda inclinada para o centro (2.5D): livro de ofertas em escada com calor de profundidade e fita de negocios.
- Centro: o Jev. Anel de decisao em 3D (comprar, vender, manter), confianca, motivo; atras, a superficie de liquidez isometrica (preco, tempo, profundidade); abaixo, velas e volume.
- Ala direita inclinada para o centro: lista de ativos, fluxo agressor (compra contra venda, CVD), derivativos (funding, base, open interest).
- Doca inferior: carteira OKX Wallet, matriz de capacidades OnchainOS, diario de decisoes.
- Celular (menos de 820 px): um painel por vez com barra de abas, ainda sem rolagem da pagina.

## Regras visuais do projeto

- Portugues do Brasil. Sem ponto medio, travessao ou meia-risca em texto exibido.
- Nada pisca nem pulsa. Movimento so em rotacao e paralaxe lentas, e desligado com `prefers-reduced-motion`.
- Cores de estado ja definidas em `globals.css`: `--buy`, `--sell`, `--hold`, `--late`, `--signal`.
- Paineis ocupam 100% do contêiner pai e nunca criam rolagem da pagina.

## Como rodar

Mercado, livro, fita, velas e funding vem direto da OKX no navegador e nao precisam de nada alem de abrir a pagina. As decisoes do Jev vem de um produtor consultivo no servidor, que guarda a chave:

```bash
# 1) produtor do Jev real, lendo a fita da OKX (chave TYPESAFE_AI_API_KEY no .env, nunca copiada)
bun --env-file=.env scripts/jev-read.ts --jev --serve 3100 --interval 12000 --max-reads 2000

# 2) a mesa (Next.js) apontando para o produtor
cd web && NEXT_PUBLIC_JEV_READ_URL=http://127.0.0.1:3100 bun run dev
```

- A origem do navegador precisa estar na allowlist: `OPERATOR_DASHBOARD_ORIGINS` (padrao `http://localhost:3001,http://127.0.0.1:3001`), o mesmo contrato do `/system-one`. Token opcional em `OPERATOR_READ_TOKEN`.
- `--observe` no lugar de `--jev` registra o estado sem consultar nenhum modelo.
- O backend padrao (`bun run start`) tambem serve `GET /jev-read` a partir de `data/jev-read/latest.json`.
- O relogio local e comparado com o da OKX (`/api/v5/public/time`). Se estiver fora por mais de 5 s a mesa avisa no trilho e a idade das leituras e calculada no relogio da OKX.
