---
title: "Gráfico e analytics"
created: 2026-10-13
updated: 2026-10-13
type: concept
tags: ["analytics", "jev", "interface", "dados", "risco"]
sources: [
  "docs/sdd/grafico-jev/spec.md",
  "docs/sdd/grafico-jev/evidencia-vetores.md",
  "docs/sdd/dados-quant/SPEC.md",
  "docs/sdd/dados-quant/REPORT.md",
  "docs/sdd/inteligencia-decisao/SPEC.md",
  "docs/sdd/inteligencia-decisao/TASKS.md",
  "docs/sdd/inteligencia-decisao/CHECKPOINT.md",
  "docs/sdd/inteligencia-decisao/evidence/C1-ao-vivo.md",
  "docs/sdd/inteligencia-decisao/evidence/C3-pesquisa-2026-10-13.md",
  "docs/sdd/backend-audit-20261013/INTELLIGENCE-AUDIT.md",
  "docs/_meta/project-state-reconciled-current-20261013.json",
  "python/jev_analytics/__main__.py",
  "python/jev_analytics/features.py",
  "python/jev_analytics/pack.py",
  "python/jev_analytics/smc.py",
  "scripts/jev-analytics.ts",
  "scripts/jev-read.ts",
  "src/jev-read/analytics.ts",
  "src/jev-read/loop.ts",
  "src/jev-read/decide.ts",
  "src/intel/analyst.ts",
  "src/intel/candidates.ts",
  "src/intel/thresholds.ts",
  "src/intel/features/types.ts",
  "src/intel/features/compute.ts",
  "src/quant/annex.ts",
  "src/quant/touch.ts",
  "src/quant/calibration.ts",
  "src/quant/types.ts",
  "src/quant/candles.ts",
  "src/quant/volatility.ts",
  "src/quant/tail.ts",
  "src/quant/garch.ts",
  "src/quant/portfolio.ts",
  "src/outcomes/recorder.ts",
  "src/outcomes/store.ts",
  "src/outcomes/labeler.ts",
  "src/outcomes/decision-log.ts",
  "src/outcomes/scoreboard.ts",
  "src/verdict/compose.ts",
  "src/verdict/risk-plan.ts",
  "src/inonu/source.ts",
  "src/inonu/overlay.ts",
  "src/inonu/ask.ts",
  "src/inonu/http.ts",
  "src/inonu/collector.ts",
  "src/inonu/flow-memory.ts",
  "src/inonu/okx-ws.ts",
  "src/desktop/handlers.ts",
  "web/src/lib/inonu/useInonuLayer.ts",
  "web/src/lib/desk/chart/decisions.ts",
  "web/src/lib/desk/chart/smc.ts",
  "web/src/lib/desk/chart/vectors.test.ts",
  "web/src/lib/desk/ui/draw-chart.ts",
  "web/src/lib/desk/ui/draw-candles.ts",
  "web/src/components/Desk/panels/PriceChart.tsx",
  "web/src/components/Veredito/VereditoBody.tsx",
  "web/src/components/Veredito/PlacarLine.tsx",
  "web/src/components/Veredito/MedicaoPanel.tsx",
  "docs/sdd/ui-audit-20261013/REPORT.md",
  "docs/sdd/ui-audit-20261013/browser-matrix.md",
  "web/src/lib/mesa/market-inputs.ts",
  "web/src/components/Desk/MesaView.tsx"
]
confidence: medium
---

# Gráfico e analytics

Proveniência do contrato e dos vetores: a SPEC e a evidência pertencem a suas próprias janelas de observação; intenção de teste não é execução nova. ^[docs/sdd/grafico-jev/spec.md] ^[docs/sdd/grafico-jev/evidencia-vetores.md]

## Definição e mapa

O tema reúne três caminhos relacionados na interface, mas não um único motor: o pacote descritivo de analytics em Python, os indicadores e estruturas calculados no gráfico TypeScript, e o fluxo de trades e inteligência do Inonu. A leitura Jev consome o pacote Python como entrada opcional; os marcadores de decisão, por sua vez, dependem de uma leitura Jev real, não de um indicador. [`features.py`](../../python/jev_analytics/features.py):324-382; [`analytics.ts`](../../src/jev-read/analytics.ts):341-399; [`PriceChart.tsx`](../../web/src/components/Desk/panels/PriceChart.tsx):295-300,415-449.

## Caminhos de dados observados

| Caminho | Papel no working tree observado |
| --- | --- |
| Analytics Python | `python -m jev_analytics once` ou `loop` coleta a API pública e grava `data/jev-analytics/latest.json`; não chama modelo nem envia ordens. O pacote descreve tendência, momento, volatilidade, estrutura, derivativos, relação com BTC e custo assumido. Campos ausentes ficam indisponíveis, e a seção on-chain é nula por falta de credenciais. [`__main__.py`](../../python/jev_analytics/__main__.py):1-4,27-32,35-76; [`features.py`](../../python/jev_analytics/features.py):1-5,20-31,324-382; [`pack.py`](../../python/jev_analytics/pack.py):14-16,42-75,78-94. |
| Entrada opcional do Jev | `scripts/jev-read.ts` abre o pack por `FileAnalyticsSource`; `readRound` anexa `analysis` somente quando a leitura passa validação e idade máxima de 120 segundos. Ausência, erro, conteúdo malformado ou dado velho não bloqueia a leitura Jev sem analytics. [`scripts/jev-read.ts`](../../scripts/jev-read.ts):74-83,173-178; [`analytics.ts`](../../src/jev-read/analytics.ts):2-20,341-399; [`loop.ts`](../../src/jev-read/loop.ts):90-126. |
| Gráfico TypeScript | O renderizador calcula EMA, Bollinger, Supertrend, RSI e MACD localmente. Heikin Ashi e Renko transformam a série desenhada; o SMC do gráfico é calculado sobre velas confirmadas. [`draw-chart.ts`](../../web/src/lib/desk/ui/draw-chart.ts):92-126; [`PriceChart.tsx`](../../web/src/components/Desk/panels/PriceChart.tsx):365-407,415-449,535-559. |
| Fluxo e overlay Inonu | Trades públicos alimentam footprint, limiares adaptativos, fatores e zonas. `source.overlay()` constrói dados em espaço de preço para a camada visual; isso não é uma decisão do modelo. [`okx-ws.ts`](../../src/inonu/okx-ws.ts):1-7,126-156; [`analyst.ts`](../../src/intel/analyst.ts):5-12,118-120,138-160,173-228,251-281; [`source.ts`](../../src/inonu/source.ts):2-12,96-148,206-209; [`overlay.ts`](../../src/inonu/overlay.ts):1-8,91-170. |

Na Mesa, `marketInputsFor` escolhe uma fonte para o cabeçalho e para o gráfico; ao selecionar on-chain, a ausência continua nula em vez de cair silenciosamente para dados de exchange. A auditoria responsiva também registra correção de sobreposição do preço em 1024 px e rolagem móvel de Carteira e Radar. São evidências de código e da sessão de browser documentada, não validação atual de feed ou backend. Veja [[mercado-e-dados]] para origem dos valores e [[interface-e-central]] para a matriz de telas. ^[web/src/lib/mesa/market-inputs.ts] ^[web/src/components/Desk/MesaView.tsx] ^[docs/sdd/ui-audit-20261013/REPORT.md] ^[docs/sdd/ui-audit-20261013/browser-matrix.md]

## Entradas e arquivos principais

- [`__main__.py`](../../python/jev_analytics/__main__.py) e [`jev-analytics.ts`](../../scripts/jev-analytics.ts): modos de coleta Python.
- [`scripts/jev-read.ts`](../../scripts/jev-read.ts): composição do produtor com o leitor opcional de analytics.
- [`PriceChart.tsx`](../../web/src/components/Desk/panels/PriceChart.tsx): composição visual de indicadores, SMC, decisões e camada Inonu.
- [`handlers.ts`](../../src/desktop/handlers.ts): composição do collector, feed de trades e fonte do overlay Inonu.
- [`http.ts`](../../src/inonu/http.ts): rota de leitura do overlay e rota separada de pedido ao modelo.

## Indicadores, SMC e limites de interpretação

O código Python filtra velas confirmadas e compõe seções descritivas; chaves de decisão como `buy`, `sell`, `hold`, `action` e `signal` invalidam o pacote. Limites e enums são revalidados no leitor TypeScript. Portanto, um valor de tendência, um nível, BOS/CHoCH, FVG, liquidez ou razão movimento/custo não é voto nem ordem. [`features.py`](../../python/jev_analytics/features.py):1-5,324-382; [`pack.py`](../../python/jev_analytics/pack.py):14-16,42-52; [`analytics.ts`](../../src/jev-read/analytics.ts):19-20,146-151,323-368; [`decide.ts`](../../src/jev-read/decide.ts):95-107.

Há implementações SMC separadas para o resumo Python que pode chegar ao Jev e para o desenho TypeScript. A tela passa apenas velas confirmadas a `analyzeSmc`; no modo Heikin, os indicadores usam velas reais, e no Renko a série de indicadores usa os tijolos. [`features.py`](../../python/jev_analytics/features.py):164-172; [`PriceChart.tsx`](../../web/src/components/Desk/panels/PriceChart.tsx):365-407,415-448; [`smc.ts`](../../web/src/lib/desk/chart/smc.ts):1-8.

O fluxo do Inonu é outra superfície. O collector pode usar trades ao vivo quando há janela suficiente ou recorrer à leitura REST; o analista constrói footprint de um minuto e aprende `minVol`, `q` e `t` de históricos próprios. Até completar o aquecimento, fatores que dependem desses limites ficam nulos com motivo. O estado de memória em disco só ajuda se houver arquivo recente e válido; esta leitura não verificou conteúdo de execução ou memória local. [`source.ts`](../../src/inonu/source.ts):96-148; [`collector.ts`](../../src/inonu/collector.ts):79-125,163-190; [`thresholds.ts`](../../src/intel/thresholds.ts):20-24,61-96; [`flow-memory.ts`](../../src/inonu/flow-memory.ts):15-20,55-89.

A rota `/inonu/engine` fornece o overlay ao gráfico. Já `Pedir ao Inonu` é um pedido separado e explícito: coleta o Brief, chama o modelo e valida a resposta contra candidatos produzidos pelo código. O envelope continua consultivo e declara `execution: "never"`. Não confundir a camada de fluxo com os marcadores Jev, nem com uma ação executável. [`http.ts`](../../src/inonu/http.ts):105-110,153-159; [`ask.ts`](../../src/inonu/ask.ts):2-19,319-418,419-449; [`candidates.ts`](../../src/intel/candidates.ts):4-7,83-103; [`useInonuLayer.ts`](../../web/src/lib/inonu/useInonuLayer.ts):53-72.

Os marcadores Jev são filtrados em `decisionMarkers`: instrumento em foco, estado utilizável e `decision.status === "ok"`; sem decisão real não há marcador. No modo on-chain, `PriceChart` zera os marcadores Jev. [`decisions.ts`](../../web/src/lib/desk/chart/decisions.ts):91-123; [`PriceChart.tsx`](../../web/src/components/Desk/panels/PriceChart.tsx):409-413.

## Quantificação e calibração

`src/quant/` é um caminho distinto dos indicadores desenhados no gráfico e do Gravador de respostas. Seu anexo `--quant` acrescenta controles estatísticos sem substituir a decisão do Jev. A SPEC proíbe rede e operação no módulo; o relatório documenta uma avaliação de 90 dias sobre cinco perpétuos da OKX, com inícios de janelas sobrepostos, e limita expressamente a generalização, a independência dos eventos e a leitura de cauda. Os números medem apenas o conjunto e a janela descritos, não lucro nem desempenho atual. ^[docs/sdd/dados-quant/SPEC.md] ^[docs/sdd/dados-quant/REPORT.md] ^[src/quant/annex.ts]

O módulo também separa probabilidade de toque e calibração de carteira consultiva. Não equiparar sua tabela Brier/confiabilidade às métricas do Placar de respostas: o estado observado do Placar e a diferença entre REC-6 e INT-0.10 estão descritos em [[inteligencia-e-resultados]]. A pesquisa C3 do Aprendiz usa outro conjunto de dados e não promoveu modelo. O mapa ampliado está em [[risco-quantitativo]]. ^[docs/sdd/dados-quant/REPORT.md] ^[docs/sdd/inteligencia-decisao/SPEC.md] ^[docs/sdd/inteligencia-decisao/TASKS.md] ^[docs/sdd/inteligencia-decisao/evidence/C3-pesquisa-2026-10-13.md]

## Vetores e evidência

Os testes TypeScript carregam vetores versionados e comparam séries numéricas a tolerâncias declaradas. A evidência Python registra comparação de indicadores com TA-Lib e implementações independentes sobre uma série sintética. Isso sustenta reprodução aritmética dos casos cobertos, não comportamento do mercado, feed vivo, resultado de uma decisão ou rentabilidade. [`vectors.test.ts`](../../web/src/lib/desk/chart/vectors.test.ts):6-23,41-46; [`evidencia-vetores.md`](../sdd/grafico-jev/evidencia-vetores.md):7-17,69-73.

## Documentos atribuídos e divergências

Leitura recomendada: consultar a SPEC para critérios, tratar a evidência como registro histórico e conferir as implementações citadas antes de associar um indicador a uma decisão.
[`spec.md`](../sdd/grafico-jev/spec.md):12-18,149-159; [`evidencia-vetores.md`](../sdd/grafico-jev/evidencia-vetores.md):69-73.

- [`spec.md`](../sdd/grafico-jev/spec.md), contrato congelado aprovado para implementação em fases, preserva requisitos de aceitação. Seu estado anterior à entrega e as métricas de 2026-10-12 são registros daquele snapshot, não reexecução atual.
- [`evidencia-vetores.md`](../sdd/grafico-jev/evidencia-vetores.md), evidência histórica datada de 2026-10-12, informa resultados em dados sintéticos. A linha 73 ainda diz que a reprodução TypeScript dos vetores estava pendente; a SPEC declara F2 concluída e 43 de 43 casos em 7.2 e 8. A presença atual de [`vectors.test.ts`](../../web/src/lib/desk/chart/vectors.test.ts):44-46 confirma que há testes parametrizados, mas não que passaram nesta auditoria.
- A SPEC descreve `draw-chart.ts` como construído sobre `draw-candles.ts` em 7.1. O código atual diz o inverso: `draw-candles.ts` é a fachada compatível e delega a `draw-chart.ts`. Tratar essa frase da SPEC como referência arquitetural antiga, sem alterar o contrato. [`spec.md`](../sdd/grafico-jev/spec.md):92-97; [`draw-candles.ts`](../../web/src/lib/desk/ui/draw-candles.ts):1-6,33-35; [`draw-chart.ts`](../../web/src/lib/desk/ui/draw-chart.ts):1-5.

## Verificação, manutenção e relações

Escopo desta página: inspeção estática de fontes e documentos. O recibo da frente registrou `tests_run` vazio. A verificação de agora executou somente os testes sintéticos das ferramentas da wiki, não testes de produto. Runtime, conteúdo atual do pack e da memória, chamadas reais, decisões reais, custos e resultados de mercado permanecem desconhecidos.

Antes de atualizar esta síntese, cotejar a SPEC e a evidência com as implementações e testes atuais, preservando os contratos congelados e registrando divergências. O arquivo `src/intel/thresholds.ts` consta no manifesto de deriva concorrente e foi relido; o recibo registra hash, data de observação e limite de atribuição. Linhas e hash descrevem uma observação local, não autoria de mudanças concorrentes.

Relações: [[fita-e-decisao-jev]], [[instalavel-e-inonu]] e [[manutencao-da-documentacao]].
