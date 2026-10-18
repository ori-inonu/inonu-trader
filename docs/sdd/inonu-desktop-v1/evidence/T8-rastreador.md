# M8 Rastreador, T10.1, T10.2, T10.4 e a revisão r3: evidência

Data: 2026-10-13. Sessão c38db1. Nada commitado. Estados de evidência separados.

## O que foi feito

| Item | Onde | Estado |
| --- | --- | --- |
| Rota `/rastreador` e entrada "Rastreador" na barra (nos dois builds) | `web/src/app/rastreador/page.tsx`, `DeskRail.tsx`, `docs/MESA-TOPBAR-SPEC.md` T2 | **funcionando ao vivo**: 200 no exe compilado, abre pela barra |
| Universo: pares spot em USDT e perpétuos em USDT da OKX, com Rank por volume | `web/src/lib/rastreador/model.ts` | **funcionando ao vivo**: 912 pares, 485 perpétuos (o número que a investigação inicial mediu) |
| Volume de perpétuo = contratos × tamanho do contrato × último preço, marcado `~` | `contracts.ts` (uma leitura de `public/instruments?instType=SWAP` por sessão) | **achado e corrigido pelo teste ao vivo**: a primeira versão tratava o volume de perpétuo como moeda base e mostrava "741 bi" para o BTC; a OKX o dá em contratos. Depois da correção: ETH perpétuo ~8,4 bi, BTC perpétuo ~7,4 bi |
| Pressão de fluxo por linha da janela (até 30), medida de `market/trades` (até 500 negócios, só contam os do último minuto), a cada 60 s | `flow.ts`, `measures.ts`, `cells.ts` | **funcionando ao vivo**: células como "+0,38 Pressao compradora forte" com título "464 negocios em 57 s, ha 9 s"; conferido por um cálculo independente a partir da resposta crua da OKX (mesmo sinal e ordem de grandeza; a janela anda entre uma leitura e outra) |
| Var 1 h e 4 h por velas de 1 minuto (visão Desempenho) | `performance.ts` | configuração válida (testes); não olhado ao vivo |
| Cinco visões (duas, Smart money e Risco, desligadas com o motivo), filtros (mercado, busca, Vol USD mínimo, variação mínima e máxima, rank, fixados), ordenação estável, telas salvas (`inonu.screens.v1`, até 20) e o estado em que a página ficou (`inonu.rastreador.v1`), tabela virtualizada e teclado (setas, Enter abre na mesa por `/?ativo=`, P fixa, / busca) | `screens.ts`, `RastreadorView.tsx`, `open.ts`, `MesaView.tsx` (lê `?ativo=`) | **funcionando ao vivo** para o filtro de mercado (485 de 912) e a persistência; o resto por testes de render |
| Perguntar ao Inonu: a frase vai ao modelo sozinha, ele responde opções fechadas, o código monta o filtro, a pessoa tira chips e clica em "Aplicar filtro" | `src/inonu/screener.ts`, modo `filtro` em `ask.ts` (mesmos tetos, cooldown, reuso, cancelamento e ledger), `createJevScreenerModel`, `src/lib/rastreador/ask.ts`, painel | **funcionando ao vivo até a recusa**: sem chave a tela diz "Configure a chave do modelo em Configuracoes" e nenhum modelo é chamado; **a resposta de um modelo real nunca foi vista** (T7.8) |
| T10.1: nada inventado alcança o app instalado | `web/src/lib/purity-bundle.test.ts` | configuração válida: 127 módulos das páginas e 56 do núcleo sem fixture, sintético nem mock; o scanner é testado e o console antigo (fora do instalável) prova que ele enxerga `SYNTHETIC_DEX_REPORT` |
| T10.4: nenhuma rota, aba ou painel sem requisito | `web/src/lib/mesa/panels-registry.ts` e `.test.ts` | configuração válida; a redução de 9 para 5 abas (T4.6) segue pendente |
| Revisão r3 do pacote SDD: deltas D3-01 a D3-13 do adendo aprovado pelo usuário, mais D3-14 desta sessão | SPEC, `info-diet.md`, `rastreador.md`, `flow-engine.md`, cobertura da OnchainOS (`--reclassify`, 499 páginas, 0 sem decisão: 83 integrar agora, 50 sob demanda, 23 desligadas, 94 depois, 185 fora, 64 referência) | `verify-citations.ts` e `okx-coverage.ts --check` passam; congelada em `FREEZE.json` |

## Números

- Web: `bun run --cwd web test` 2085 passam, 0 falham (inclui 126 do Rastreador); raiz `bun run test` 4286 passam, 2 ignoradas, 0 falham; `typecheck:all` limpo.
- Testes novos desta etapa: modelo 28, células 14, telas salvas 17, leitor de fluxo 10, desempenho 7, contratos 5, laço de medidas 10, tela 24, abrir na mesa 5, pergunta ao Inonu (chips) 9, `screener` 9, modo filtro do pedido 9, adaptador do Jev 5, cliente web 3, pureza 8, registro 6.

## O que não foi visto ou não foi feito

- **RAS-6, "Pedir ao Inonu" por linha (ranking de até 5 linhas escolhidas), não foi feito.** Exige um Brief por linha com os limiares ainda em aquecimento e vale pouco antes da primeira consulta real ao modelo (T7.8); fica registrado no TASKS como pendente.
- As visões **Smart money** e **Risco** e os filtros de liquidez, holders, carteiras e risco dependem do gateway e do universo on-chain (outra sessão está escrevendo as rotas em `src/onchain-read/**` e o digest em `src/intel/onchain-*`).
- A mesma tela foi vista só em 1280 e 390 px de largura; o ajuste de largura estreita (filtros em duas colunas, filtros on-chain recolhidos) foi feito depois da captura de 390 px e precisa ser visto de novo no próximo build.
- A pressão de fluxo usa leituras REST em vez de uma inscrição de WebSocket por linha (decisão D3-14, registrada em `rastreador.md`): custo de até 30 leituras gratuitas por minuto com a página visível.
