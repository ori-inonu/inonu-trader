---
title: "Risco quantitativo e evidência"
created: 2026-10-13
updated: 2026-10-13
type: concept
tags: ["analytics", "dados", "risco", "backtest", "evidencia"]
sources: ["docs/sdd/dados-quant/SPEC.md", "docs/sdd/dados-quant/REPORT.md", "docs/sdd/dados-quant/evidence/calibration-latest.json", "docs/sdd/dados-quant/evidence/calibration-train30.json", "docs/sdd/inteligencia-decisao/evidence/C3-pesquisa-2026-10-13.md", "docs/_meta/project-state-reconciled-current-20261013.json", "docs/SYSTEM-ONE.md", "src/quant/candles.ts", "src/quant/volatility.ts", "src/quant/tail.ts", "src/quant/garch.ts", "src/quant/touch.ts", "src/quant/calibration.ts", "src/quant/portfolio.ts", "src/quant/annex.ts", "src/system-one/cycle.ts", "scripts/system-one.ts"]
confidence: medium
---

# Risco quantitativo e evidência

## Escopo

`src/quant/` produz evidência estatística determinística para velas, volatilidade, caudas, probabilidade de tocar barreiras, calibração e risco de carteiras informadas. A SPEC proíbe rede, modelo, credenciais e execução dentro do módulo. Esta camada mede cenários declarados; não decide compra, venda, alavancagem nem elegibilidade. ^[docs/sdd/dados-quant/SPEC.md] ^[src/quant/annex.ts]

## Componentes e fronteiras

| Área | O que a implementação documenta |
| --- | --- |
| Auditoria de velas | Detecta estrutura inválida e preserva o trecho recente utilizável sem corrigir dados silenciosamente. |
| Volatilidade e cauda | Compara estimadores de faixa e fechamento, modelos de volatilidade, estatísticas de cauda, VaR e ES. |
| Toque de barreira | Modela comprado e vendido separadamente em log-preço, por forma fechada e simulação filtrada. |
| Calibração | Calcula Brier, log loss, confiabilidade e comparação pareada por janela temporal. |
| Carteira | Calcula concentração, covariância encolhida, contribuição ao risco, VaR, ES e queda máxima para posições fornecidas. |
| System One | `--quant` anexa qualidade, banda de sigma e probabilidades de toque sem alterar a escolha do Jev. |

Os requisitos e limites de cada componente estão em Q-01 a Q-09. O anexo do System One é aditivo e permanece separado do envelope de elegibilidade; sem `--quant`, a SPEC exige saída anterior byte a byte. ^[docs/sdd/dados-quant/SPEC.md] ^[src/quant/annex.ts] ^[src/system-one/cycle.ts] ^[scripts/system-one.ts]

## Resultado de calibração registrado

O relatório registra uma comparação retrospectiva com 90 dias de velas de 15 minutos de cinco perpétuos da OKX, inícios sobrepostos e treino que não vê o futuro. O ganho de log loss do FHS tem sinal positivo nos nove casos avaliados, mas o intervalo por data exclui zero em apenas seis de nove casos para log loss e cinco de nove para Brier. Os três melhores dias concentram de 47% a 84% do ganho. Na janela de 300 barras, os seis intervalos apresentados para log loss e Brier excluem zero; isso não remove a dependência entre ativos e horizontes nem as demais limitações do estudo. Esses números pertencem aos arquivos e à janela descritos, não são desempenho atual nem evidência de lucro. ^[docs/sdd/dados-quant/REPORT.md] ^[docs/sdd/dados-quant/evidence/calibration-latest.json] ^[docs/sdd/dados-quant/evidence/calibration-train30.json]

O próprio relatório limita a interpretação: cinco ativos correlacionados, um regime, horizontes sobrepostos, menos eventos independentes do que linhas na tabela, cauda profunda ainda subestimada e verdade aproximada por máxima ou mínima das velas, não por preço de marcação. As probabilidades baixas são descritas como piso, não estimativa central. ^[docs/sdd/dados-quant/REPORT.md]

A pesquisa C3 do Aprendiz é um experimento separado, com 60 dias de candles públicos de 15 minutos, horizonte de uma hora e spread assumido de 2 bps além das taxas. Seus quatro modelos tiveram resultado médio líquido negativo e nenhum foi promovido; não misturar esse resultado com a calibração de liquidação de 90 dias acima. Consulte [[inteligencia-e-resultados]] para métricas e limites da pesquisa. ^[docs/sdd/inteligencia-decisao/evidence/C3-pesquisa-2026-10-13.md]

## Integração e pendências

O relatório registra que a leitura de produção usa até 300 velas, insuficientes para reproduzir a janela maior avaliada; ampliar histórico, integrar carteira observada e obter avaliação independente continuam pendentes. A parede de elegibilidade existente não foi substituída. As contagens de testes, mutação e typecheck no relatório são evidência histórica da sessão autora, não reexecução desta atualização documental. ^[docs/sdd/dados-quant/REPORT.md] ^[docs/SYSTEM-ONE.md]

Os arquivos de calibração são dados de evidência versionados, não uma carteira real ou uma recomendação. Uma probabilidade calculada depende de modelo, janela, ativo, horizonte e qualidade do dado. O projeto ainda não demonstra vantagem econômica fora da amostra. ^[docs/sdd/dados-quant/evidence/calibration-latest.json] ^[docs/sdd/dados-quant/evidence/calibration-train30.json]

Relações: [[grafico-e-analytics]], [[inteligencia-e-resultados]] e [[seguranca-e-qualificacao]].
