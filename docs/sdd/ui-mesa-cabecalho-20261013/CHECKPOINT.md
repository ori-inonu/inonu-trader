# CHECKPOINT: cabecalho do instrumento, rolagem do painel inferior e barra do grafico no celular

Sessao: Devin (Claude), 2026-10-13, trabalho local autorizado pelo usuario: "melhorar significativamente a interface, o front-end e o UX da mesa". Baseline observado: `main@00a593b` com 110 caminhos sujos de outras sessoes, preservados e nao editados (so os caminhos listados abaixo foram tocados). Nada foi commitado, publicado ou instalado. Nenhuma chamada a modelo, assinatura ou ordem.

## O que foi visto antes (diagnostico ao vivo em `next dev` 127.0.0.1:3031, OKX real)

1. A barra "Mercado em foco" ocupava a faixa mais nobre da mesa e mostrava so o nome do par e uma frase. O preco atual nao aparecia em destaque em lugar nenhum: so na lista Ativos (11 px) e na legenda OHLC do grafico (10,5 px). Quem abre a mesa, do leigo ao avancado, pergunta primeiro "quanto esta e para onde foi": a tela nao respondia de primeira.
2. As abas Inonu e Carteira do painel inferior eram mais altas que o painel (1002 px e 767 px num painel de 194 px) e o corpo tinha `overflow: hidden` sem nada rolavel: o botao "Conectar carteira para leitura", "Trocar rede" e "Ticket de ordem" ficavam inalcancaveis em 1440x900, mesmo arrastando o painel ate 55vh.
3. No celular (390 px) a metade direita da barra do grafico (Indicadores, seis tipos de grafico, variacao 24h) media 484 px num painel de 342 px e era cortada pela moldura: "Renko" e o 24h nao podiam ser tocados.

## O que mudou

| Arquivo | Estado | Mudanca |
| --- | --- | --- |
| `web/src/lib/desk/ui/instrument-header.ts` | novo | modelo puro: preco nos decimais do tick, direcao do ultimo negocio, variacao 24h (metrica da mesa, com recuo para a abertura do ticker), posicao do ultimo preco na faixa de 24h, volume (quote para spot, contratos para perpetuo), spread e funding (so do proprio instrumento). Nulo vira "Indisponivel", nunca zero |
| `web/src/lib/desk/ui/instrument-header.test.ts` | novo | 10 testes, escritos vermelhos antes do modelo (saida do vermelho: `Cannot find module './instrument-header'`) |
| `web/src/components/Desk/InstrumentHeader.tsx` e `.module.css` | novo | o cabecalho: preco hero em mono (cor pela direcao do ultimo negocio, uma transicao de cor, sem animacao), pilula 24h, faixa min/max 24h com marcador, numeros do mercado; container queries tiram decoracao antes de cortar o essencial; variante compacta para o celular; `data-stale` escurece e escreve "dado velho" |
| `web/src/lib/desk/ui/instrument-header-render.test.tsx` | novo | 5 testes de renderizacao (sem NaN, undefined, Infinity, ponto medio ou travessao; estados ao vivo, vazio, velho, perpetuo, compacto) |
| `web/src/components/Desk/MesaView.tsx` | editado, minimo | 1 import, 1 objeto `headerProps` (as mesmas fatias que o grafico desenha) e 2 elementos: um na barra de decisao, um compacto acima do grafico do celular. Arquivo em edicao por outra sessao: as edicoes foram pontuais e conferidas depois (as 4 linhas continuam presentes) |
| `web/src/components/Desk/Dock/DockPanel.module.css` | editado | `.body` vira coluna flex e `.body > *` recebe `min-height: 0; flex: 1 1 auto`: a vista interna fica presa a altura do painel e rola dentro da propria moldura |
| `web/src/components/Desk/panels/PriceChart.module.css` | editado | `@container (max-width: 480px)`: `.toolbarRight` ocupa a propria linha e rola de lado com barra fina (mesmo padrao da faixa de abas do painel) |

Hashes em [MANIFEST.sha256](MANIFEST.sha256). Capturas e logs em `docs/evidence/ui-mesa-cabecalho-20261013/` (pasta local, fora do git).

## Evidencia

| Estado | Item | Resultado |
| --- | --- | --- |
| Configuracao valida | `bun --no-env-file test ./src/lib/desk ./src/lib/mesa` + varreduras de tipografia, animacao e nomes (web) | **1017 passam, 0 falham** (56 arquivos), log `web-tests-desk-mesa-scans.log` |
| Configuracao valida | `bunx tsc --noEmit` em `web/` | **0 erros**, log `web-tsc.log` |
| Configuracao valida | `panels-registry.test.ts`, `purity-bundle.test.ts` (parte web) | passam; a unica falha vista em `purity-bundle` e "the core reaches none either" por `src/lab/source.ts: SYNTHETIC_DEFAULTS` alcancavel de `src/desktop/main.ts`, raiz de outra sessao, sem relacao com estes arquivos |
| **Funcionando ao vivo** | Cabecalho em 1440x900 contra a OKX real | preco "83.231,5" nos decimais do tick, cor pela direcao do ultimo negocio (vermelho e verde vistos alternando), pilula "24H +0,90%", faixa "81.032,8 ... 84.166,3" com marcador; cabecalho mede 443 px e nada se sobrepoe (medido no DOM); `scrollWidth` do documento = 1440 e altura = 900, sem rolagem da pagina (captura 03 e 04) |
| **Funcionando ao vivo** | Cabecalho em 1920x1080 | aparecem os rotulos Min/Max 24h, Vol 24h "530 mi USDT" e Spread "0,01 bps" (captura 05) |
| **Funcionando ao vivo** | Celular 390x844, aba Grafico | linha compacta "83.205,8  +0,85%  81.032,8 ... 84.166,3" em uma linha; `scrollWidth` do documento = 390 (captura 06) |
| **Funcionando ao vivo** | Painel inferior 1440x900 | antes: Inonu 1002 px e Carteira 767 px dentro de 194 px, nao rolaveis; depois: as duas vistas medem 194 px e rolam (`scrollTop` 400 alcancado), Radar, Fluxo e Mercado bruto inalterados em 194/194 (captura 07); no celular a aba Fontes rola dentro da moldura (captura 08) |
| **Funcionando ao vivo** | Barra do grafico no celular | `.toolbarRight` 342 px visiveis de 484 px, `overflow-x: auto`, rolou 142 px e "Renko" passou a caber (borda direita 284 < 378 px da moldura) |
| Nao visto | Estado "dado velho" do cabecalho ao vivo | so no teste de renderizacao (exige o feed da OKX calar alem da janela de frescor) |
| Nao visto | Foco on-chain no cabecalho ao vivo | o gateway local desta maquina (127.0.0.1:3030) e uma versao antiga sem `/inonu/*` e sem icones; o caminho esta coberto pelo modelo (ticker sintetizado das velas, funding nulo), nao por captura |
| Nao medido | Ganho de uso | nenhum; a melhoria e de legibilidade e alcance de controles, sem alegacao de resultado financeiro |

Regras do projeto conferidas: nenhum ponto medio, travessao ou meia-risca (varredura verde); nenhuma animacao, keyframe ou loop (o preco e o marcador usam uma unica `transition`, desligada em `prefers-reduced-motion`); nenhum numero inventado (valor desconhecido escreve "Indisponivel" e o marcador da faixa some); "Jev" nao aparece nas telas novas; os paineis continuam no registro INF-3 (o cabecalho nao e exportado por `panels/index.ts`, e um elemento da barra de decisao de `MesaView`, requisito UI-1 de `docs/sdd/mesa-decisao-20261013/SPEC.md`: prioridade ao grafico e a decisao, sem overflow em 1440x900 e 390x844).

## Pendencias e observacoes para as outras frentes (nao editadas aqui)

1. `web/src/components/Desk/MesaView.tsx` e `.module.css` estavam em edicao por outra sessao (14:01). Se essa sessao regravar o arquivo inteiro, reaplicar as 4 linhas (import, `headerProps`, dois `<InstrumentHeader>`); o `grep -n "InstrumentHeader\|headerProps"` confirma.
2. A linha "Indicadores do Inonu indisponiveis. Inicie: bun run analytics" (`panels/JevIndicators.tsx`) e jargao de operador exposto a qualquer usuario; `info-diet.md` ja prevê mover esse painel para a aba Radar. Nao alterado por ser decisao do integrador (Z8).
3. A lista Ativos perde a linha de tendencia (sparkline) a 1440 px porque a ala direita mede 274 px e `watchlistLayout` exige cerca de 300 px. Trocar `clamp(264px, 19vw, 320px)` por `21vw` em `MesaView.module.css` devolveria a sparkline a 1440 ao custo de 28 px do grafico: decisao de prioridade (UI-1) que fica com o usuario.
4. Os icones dos ativos (lista, Rastreador) aparecem como siglas porque o gateway que responde em 127.0.0.1:3030 nesta maquina e antigo; nao e defeito da interface.

## Proximos passos sugeridos (backlog de UI, por valor)

1. Rastreador: barras embutidas de volume e de pressao de fluxo nas celulas e cabecalho fixo da tabela (`RastreadorView.tsx` esta em edicao por outra sessao; esperar a entrega).
2. Estado vazio dos paineis com esqueleto estatico (sem shimmer, para respeitar a regra de nao piscar) no lugar do texto solto "Aguardando dados da OKX".
3. Preferencia de densidade (confortavel/compacta) na engrenagem, aplicada por `data-density` na raiz, como ja se faz com a paleta e o modo grafico.
