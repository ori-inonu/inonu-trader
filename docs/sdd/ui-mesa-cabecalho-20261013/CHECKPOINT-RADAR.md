# CHECKPOINT: radar de oportunidades na aba Inonu

> **Atualizacao (2026-10-14, commit 778bfd0).** Este checkpoint descreve o radar como ele era na aba Inonu. Outra frente o substituiu: a aba Inonu agora abre com `JevPicks` (melhores oportunidades do ecossistema) e o radar de pares virou a vista **Pares OKX** do Radar, em `EngineRadar`, que le o historico de cada par e usa o meu `OpportunityRadar` so como lista de reserva (por volume) quando o motor nao le nada. O modelo (`opportunity-radar.ts`) e o componente continuam em uso. A secao "Se a MesaView for regravada" abaixo ficou obsoleta: o `MesaView` inteiro, e tudo o que ele importa de `web/src`, esta commitado no `778bfd0`, entao o `git` e a fonte de verdade.

Sessao: Devin (Claude), 2026-10-13. Pedido do usuario: a aba Inonu do painel inferior deve ser um rastreador de oportunidades (nao so do ativo do grafico), com visual mais sofisticado. Continuacao de [CHECKPOINT.md](CHECKPOINT.md). Nada foi publicado, nenhuma chamada a modelo, assinatura ou ordem.

## O que a tela faz e o que ela se recusa a fazer

- **Radar de oportunidades** (faixa de cartoes no topo da aba): onde olhar primeiro entre os pares a vista em USDT da OKX, em tres lentes (mais negociados, maiores altas, maiores quedas), com preco, variacao 24h e volume em barra. Dados da lista de tickers que a mesa ja le (gratuita, a cada 5 min).
- **A ordem e um fato medido, nunca uma previsao**, e a tela diz isso. A direcao (comprar, esperar, vender) continua sendo so do modelo, ao clique. Nao ha pontuacao de "chance de lucro": nao existe medicao honesta dela neste repositorio (o Placar mede o acerto das respostas depois, e o ganho nao foi medido), e o requisito central do projeto proibe o codigo de escolher a direcao.
- **Filtro de liquidez**: so pares com ao menos 1 mi de volume em 24 h e sem pares entre moedas estaveis. Sem isso, "maiores altas" lista pares de poucos milhares de dolares (visto ao vivo: ha pares com +27% que passam; os que nao passam nem aparecem).
- **Ranking**: um cartao abre o par no grafico; o controle redondo marca de 2 a 5 pares e aparece "Pedir ao Inonu: ranquear as N escolhidas" (modo `ranking` que ja existia e que o Rastreador usa). A escolha trava enquanto o pedido roda.
- **Ecossistema on-chain**: a leitura e a pergunta ao modelo sobre uma rede inteira ja vivem em Radar > Onde comprar (e no menu Descobrir). O radar tem so uma **porta** ("Abrir Onde comprar"), para nao criar uma terceira forma de gastar as mesmas leituras. Uma primeira versao minha tinha o botao de pedir dentro do cartao; removi ao ver que outra frente ja tinha a vista (`e501c4a`).
- Aba reorganizada em duas zonas: radar a esquerda, "Ativo em foco" (pre-leitura e o botao de pedir de sempre) a direita, separadas por um fio; abaixo de 1000 px empilham.

## Arquivos

| Arquivo | Estado no git | Nota |
| --- | --- | --- |
| `web/src/lib/desk/ui/opportunity-radar.ts` e `.test.ts` | commitado (`b8ddc29`) | modelo puro, 12 testes, vermelhos antes |
| `web/src/components/Desk/Dock/OpportunityRadar.tsx` e `.module.css` | commitado (`c56fcf5`, `e501c4a`) | visao pura e estado |
| `web/src/lib/desk/ui/opportunity-radar-render.test.tsx` | commitado | 15 testes de renderizacao |
| `web/src/components/Desk/Dock/DockInonu.tsx` e `.module.css` | **so no disco** (pasta `Dock/` toda sem versionamento, de outras frentes) | prop `radar`, duas zonas, titulo "Ativo em foco" |
| `web/src/components/Desk/MesaView.tsx` | **so no disco** (diff de 520 linhas de varias sessoes) | ver reaplicacao abaixo |
| `web/src/components/Desk/Dock/DockPanel.module.css` | **so no disco** | `scrollbar-color` da faixa de abas (tentado; outra sessao regravou o arquivo) |

Hashes em [MANIFEST-radar.sha256](MANIFEST-radar.sha256). Capturas em `docs/evidence/ui-mesa-cabecalho-20261013/09` a `12` (pasta local, fora do git).

## Se a MesaView for regravada de novo (aconteceu uma vez, 21:35)

Tres pontos, todos em `MesaView.tsx`: (1) `import OpportunityRadar from "./Dock/OpportunityRadar";`, (2) a prop `radar={<OpportunityRadar catalog={assetCatalog} focus={focus} onOpen={(id) => { selectOkx(id); if (narrow === true) setTab("grafico"); }} network={{ chainName: <nome da rede>, onOpen: () => { dock.select("radar"); dock.selectSub("radar", "smart"); } }} />}` em `<DockInonu>`, (3) `assetCatalog` nas duas listas de dependencias dos `useMemo` das abas (senao o radar fica em "Lendo a lista"). Conferencia: `grep -c OpportunityRadar` da 2 e `grep -c 'selectSub("radar", "smart")'` da 1.

## Evidencia

| Estado | Item | Resultado |
| --- | --- | --- |
| Configuracao valida | 27 testes novos (12 modelo, 15 renderizacao) | verdes; escritos vermelhos antes (modulo inexistente) |
| Configuracao valida | `tsc --noEmit` do web | 0 erros (apos reaplicar a porta na MesaView) |
| Configuracao valida | `./src/lib/inonu ./src/lib/desk/ui ./src/lib/mesa` + varreduras de tipografia, animacao, "nao envia ordem", pureza | **987 passam, 4 falham**; as 4 sao de outra frente: `ask-render` (a folha `InonuAsk.module.css`, regravada as 21:31 com `transition`, e o teste a proibe) e tres de `dock-subviews`/`DockComposite` (a vista "Lancamentos" entrou as 21:35 e os testes foram atualizados as 21:35:50, ainda em curso). Nenhum desses arquivos e meu |
| **Funcionando ao vivo** | radar em 1440x900 contra a OKX real, dev server 3001 | 8 cartoes com dados reais e icones; lentes trocam (altas: BAT +27,69%, SD, OP, INJ; quedas: W, BLUR, DOS); escolher BTC e ETH da "2 de 5 linhas escolhidas" e o botao "Pedir ao Inonu: ranquear as 2 escolhidas" (**nao acionado**, nenhuma chamada ao modelo); a porta leva ao Radar, vista Onde comprar, com o botao de pedir visivel e tambem nao acionado |
| **Funcionando ao vivo** | celular 390x844 | radar na secao Fontes, cartoes rolam de lado, sem rolagem horizontal da pagina (`scrollWidth` 390) |
| Nao visto | resposta real do modelo ao ranking | exige clique do usuario e gasta uma consulta |
| Nao visto | radar com foco on-chain e estado de erro da lista ao vivo | cobertos por teste de renderizacao, nao por captura |
| Nao medido | se "mais negociados" ou "maiores altas" leva a lucro | nenhuma alegacao; o Placar da aba mede o acerto das respostas do modelo |

## Pendencias que ficam com o usuario ou com outras frentes

1. Commitar o desk como um todo (pasta `Dock/`, `MesaView`, `DockInonu`): hoje esses arquivos so existem no disco e a aba nao entra em nenhum commit sem eles.
2. Tres falhas de teste de outras frentes (acima), que passam a bloquear `bun run test` do web ate serem resolvidas.
3. Decisao de produto: o filtro de liquidez (1 mi) e a lista de moedas estaveis sao constantes em `opportunity-radar.ts`; ajustar la.
