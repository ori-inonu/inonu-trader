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

## Decisões de desenho

- O resumo repetido do ativo em foco (preço e variação) foi retirado da barra: já está no palco do Jev e no gráfico. No lugar entrou a busca global, que é o conceito mais usado da barra do TradingView.
- Zonas: marca, seções e busca à esquerda; fontes, carteira, relógio e ferramentas à direita.
- `FeedChipList` continua exportado e é a lista que a seção Fontes do celular usa; o popover reusa a mesma lista, então não há duas fontes de verdade para o estado.
- A lógica fica em funções puras (`web/src/lib/mesa/topbar-model.ts`, `preferences.ts`, `capture.ts`) e a apresentação em `DeskRail`, `TopbarPopover` e `TopbarTools`.
- As regras de largura estreita do CSS valem só para os botões da barra (`.tools button ...`), nunca para a lista dentro do popover.

## Verificação feita (2026-10-12)

- Navegador no projeto servido em `http://127.0.0.1:3031/`: `/` abre a busca com 80 linhas, as três paletas recolorem página e gráfico, a câmera gera `blob:` com o nome esperado, sem rolagem horizontal nas larguras de T12.
- Dois defeitos achados e corrigidos nessa verificação: nomes das fontes sumindo no popover em largura de celular (regra estreita ampla demais) e painel colado na borda direita (especificidade do `data-align`).
