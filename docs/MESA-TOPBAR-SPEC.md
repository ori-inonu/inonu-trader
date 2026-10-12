# Topbar da Mesa: especificação

Pedido do usuário (2026-10-12): melhorar a topbar do projeto e trazer conceitos do TradingView e da OKX Wallet, mantendo a consistência visual, a identidade e o design system, otimizando os componentes e **mantendo o logotipo visível** (sem escondê-lo como o TradingView). Referências vistas: a barra superior do TradingView (busca de símbolo, ferramentas em botões de ícone, captura de imagem, tela cheia), a barra da OKX Wallet (navegação por seções, chip de conta, menu de preferências com cores de alta e baixa, atalhos e idioma).

A topbar é aplicada sobre o projeto como ele roda hoje (a árvore de trabalho principal, com o gráfico e o seletor de ativos de outra sessão), sem recuar nenhum painel. Fica fora desta etapa: intervalo e indicadores (estão no gráfico, SDD `docs/sdd/grafico-jev/`), tema claro (o design system é escuro), alertas por e-mail ou push (não há backend para isso) e qualquer controle que assine, envie ou ordene.

## Requisitos

| ID | Requisito | Aceitação |
| --- | --- | --- |
| T1 | O logotipo (`BrandMark`) e o nome INONU TRADER ficam sempre visíveis, em qualquer largura. | Teste de renderização: marca e nome presentes; o subtítulo é o único texto que some em largura estreita. |
| T2 | Navegação por seções, como a da OKX: Mesa (atual, `aria-current="page"`) e Central (`/console`). Em largura estreita o link da Central continua alcançável pelo popover das fontes. | Teste: dois links, só o da Mesa marcado; o popover tem o link da Central. |
| T3 | Busca global de ativo, como a do TradingView: o `AssetPicker` do gráfico dentro de uma moldura de busca, com a tecla `/` que o abre. A barra e o gráfico compartilham um catálogo e um comportamento. Sem seletor, não há moldura nem dica de tecla. | Renderização: moldura rotulada, `<kbd>/</kbd>`; sem seletor, ausentes. Navegador: `/` abre o seletor com foco na busca. |
| T4 | Saúde das fontes em uma única pílula ("3 de 5 ao vivo") com o pior estado na cor e em palavras para leitor de tela, e um popover com a frase completa e cada fonte (nome, estado dito em palavras, detalhe e há quanto tempo falou). A carteira não entra na contagem, tem chip próprio. Nunca só por cor. | Testes puros de `summarizeFeeds` e `feedAges`; renderização: pílula com `aria-expanded`, lista completa no popover, palavras de estado, idades (`agora`, `ha N s`, `sem mensagem`). |
| T5 | Chip da carteira como o chip de conta da OKX: extensão não encontrada, não conectada ou conectada com o endereço curto; popover que explica o estado. A barra não conecta, não assina e não envia nada. | Testes de `walletBadge` e `walletHint`; renderização sem botão de conexão na barra. |
| T6 | Relógio na hora da OKX (UTC), `--:--:--` até medir o desvio, e o desvio como selo curto, com a frase completa preservada para leitor de tela e dica. | Testes de relógio atuais e de `skewBadge`. |
| T7 | Menu de Preferências, como o da OKX: cores de alta e baixa (Padrão, Daltonismo, Invertido) que recolorem a mesa inteira, inclusive os gráficos em canvas, e ficam salvas neste navegador; atalhos de teclado; idioma, moeda de exibição e relógio como fatos fixos. A paleta é aplicada antes da pintura para não piscar. | Testes de `preferences` (opções, normalização, aplicar e limpar, falha de armazenamento tolerada, folha de estilo com as mesmas cores); navegador: trocar a paleta muda `--buy` e `--sell` e o gráfico. |
| T8 | Captura do gráfico como imagem PNG, como a câmera do TradingView, com legenda (nome, par, hora UTC, "decisao consultiva do Jev, nada foi enviado") e nome de arquivo estável. Estados falados: salvo, indisponível, falhou. | Testes de `captureFileName`; navegador: o clique gera um `blob:` com o nome esperado. |
| T9 | Tela cheia (`aria-pressed`, tecla `F`), escondida quando o navegador não suporta e em celular (largura até 400). | Renderização: botão com rótulo; navegador: tecla `F` alterna. |
| T10 | Popover acessível: abre e fecha pelo botão, fecha com Escape e com clique fora, devolve o foco ao botão, `aria-expanded` e `aria-controls`; foco visível em todo controle; em largura até 520 o painel ocupa a largura da tela com margem. | Testes de renderização dos atributos; verificação no navegador. |
| T11 | Nada pisca nem pulsa; nenhum texto com ponto mediano, travessão ou meia-risca (o teste `typography-scan` cobre as fontes); texto sobre o fundo usa `--ink`, `--ink-2` ou `--ink-3`, nunca `--ink-4`. Nenhum controle da barra executa ordem. | `typography-scan.test.ts` verde; teste de ausência de controles de ordem. |
| T12 | A barra cabe na linha de 48 px (44 px em largura estreita) sem rolagem horizontal em 1920, 1280, 1201, 1101, 820, 390 e 320 de largura, e o texto do popover nunca é cortado. | Verificação no navegador nas larguras listadas (`scrollWidth` igual a `clientWidth`). |

### Rodada 2 (2026-10-12): mais conceitos do TradingView

| ID | Requisito | Aceitação |
| --- | --- | --- |
| T13 | Alertas de preço (o sino do TradingView): o usuário informa um nível para o ativo em foco; a direção (acima ou abaixo) vem da comparação com o último preço conhecido. Preço indisponível nunca vira zero nem dispara: sem preço não se cria alerta e um preço desconhecido não avalia nada. Cada alerta dispara uma vez, fica na lista como disparado (nível, preço, hora UTC) e some pelo botão remover. O selo do sino mostra, sem animação, quantos disparos o usuário ainda não viu. Valem só com a aba aberta, nada é enviado e nenhuma ordem nasce: o painel diz isso. Ficam salvos neste navegador (máximo 20, valor corrompido é ignorado). | Testes puros de `alerts` (interpretação do nível em pt-BR, criação e recusas, disparo para cima e para baixo, uma vez só, preço nulo, normalização do armazenamento, mapa de preços); renderização do painel e do selo; navegador: criar, disparar e remover. |
| T14 | Modo gráfico (o "maximizar gráfico" do TradingView): um botão com `aria-pressed` e a tecla `G` escondem livro, fita, lista de ativos e fluxo e dão a largura toda ao Jev e ao gráfico. Só acima de 820 px (abaixo a mesa já mostra uma seção por vez). Fica salvo neste navegador e é aplicado antes da pintura. | Testes de `layout` (normalização, aplicar e limpar, armazenamento bloqueado, script de arranque, folha de estilo com a regra); navegador: os painéis somem, o gráfico ocupa a largura e o botão reflete o estado. |
| T15 | Atalhos de teclado: `A` abre os alertas, `G` alterna o modo gráfico, `?` abre as preferências com a lista de atalhos, além de `/` e `F`. Nada dispara com foco em campo de texto nem com Ctrl, Meta ou Alt. A lista de atalhos mostrada no menu é a mesma que o código atende. | Testes de `shortcutFor` e de `SHORTCUTS`; navegador: cada tecla abre ou alterna o que diz. |
| T16 | Em 1101 px e acima a barra continua sem rolagem horizontal com os dois botões novos; abaixo de 820 px o botão do modo gráfico some; o painel dos alertas cabe na tela de 320 px. | Verificação no navegador (`scrollWidth` igual a `clientWidth`). |

## Decisões de desenho

- O resumo repetido do ativo em foco (preço e variação) foi retirado da barra: já está no palco do Jev e no gráfico. No lugar entrou a busca global, que é o conceito mais usado da barra do TradingView.
- Zonas: marca, seções e busca à esquerda; fontes, carteira, relógio e ferramentas à direita.
- `FeedChipList` continua exportado e é a lista que a seção Fontes do celular usa; o popover reusa a mesma lista, então não há duas fontes de verdade para o estado.
- A lógica fica em funções puras (`web/src/lib/mesa/topbar-model.ts`, `preferences.ts`, `capture.ts`) e a apresentação em `DeskRail`, `TopbarPopover` e `TopbarTools`.
- As regras de largura estreita do CSS valem só para os botões da barra (`.tools button ...`), nunca para a lista dentro do popover.

- As preferências de exibição (paleta e modo gráfico) são aplicadas por um `next/script` com `beforeInteractive` no layout raiz, que roda a partir do primeiro HTML e antes da hidratação. Um `<script>` cru no layout fazia o React avisar no console do cliente.
- Rodada 2: o sino compara o nível com o último preço conhecido na hora de criar (a direção vem daí, não de uma escolha do usuário), avalia só preços conhecidos e guarda o estado de "visto" para o selo. Preço do ativo fora da tela (fora do foco e da lista de ativos) não avalia: a linha do alerta diz "sem preco agora".
- Rodada 2: o modo gráfico é um atributo no `html` lido por uma regra de `globals.css` sobre os `data-slot` dos painéis, sem tocar o CSS do desk; a tecla e o botão são o mesmo caminho (a tecla aperta o botão).
- Rodada 2, prioridade quando falta largura: os detalhes das pílulas somem abaixo de 1240 px, as seções somem abaixo de 1100, a tela cheia abaixo de 960, o modo gráfico abaixo de 820 (a mesa já mostra uma seção por vez) e a captura abaixo de 400.

## Verificação feita (2026-10-12)

- Navegador no projeto servido em `http://127.0.0.1:3031/`: `/` abre a busca com 80 linhas, as três paletas recolorem página e gráfico, a câmera gera `blob:` com o nome esperado, sem rolagem horizontal nas larguras de T12.
- Rodada 2, no mesmo endereço: `A` abre o sino com o campo em foco; dois alertas criados dispararam com o preço real da OKX (abaixo de 82.520 em 82.517,1 e acima de 82.540 em 82.540,7), o selo mostrou 2 até abrir o painel, os dados ficaram em `inonu:alerts` e o armazenamento foi limpo depois do teste; `G` escondeu os quatro painéis e o gráfico ocupou a largura toda; `?` abriu as preferências com as seis teclas; sem rolagem horizontal em 1280, 1241, 1201, 1101, 1100, 961, 960, 820, 520, 390 e 320 (em 820 e 961 o primeiro layout estourava e foi corrigido com as prioridades acima).
- Dois defeitos achados e corrigidos na rodada 1: nomes das fontes sumindo no popover em largura de celular (regra estreita ampla demais) e painel colado na borda direita (especificidade do `data-align`).
