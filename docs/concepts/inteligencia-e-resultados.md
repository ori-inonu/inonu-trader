---
title: "Inteligência, resultados e Veredito"
created: 2026-10-13
updated: 2026-10-13
type: concept
tags: ["analytics", "jev", "relatorio", "evidencia"]
sources: ["docs/sdd/inteligencia-decisao/SPEC.md", "docs/sdd/inteligencia-decisao/TASKS.md", "docs/sdd/inteligencia-decisao/README.md", "docs/sdd/inteligencia-decisao/CHECKPOINT.md", "docs/sdd/inteligencia-decisao/evidence/baseline.md", "docs/sdd/inteligencia-decisao/evidence/C1-ao-vivo.md", "docs/sdd/inteligencia-decisao/evidence/C3-pesquisa-2026-10-13.md", "docs/sdd/backend-audit-20261013/INTELLIGENCE-AUDIT.md", "src/intel/features/types.ts", "src/intel/features/compute.ts", "src/outcomes/recorder.ts", "src/outcomes/store.ts", "src/outcomes/labeler.ts", "src/outcomes/decision-log.ts", "src/outcomes/scoreboard.ts", "src/inonu/http.ts", "src/verdict/compose.ts", "web/src/components/Veredito/VereditoBody.tsx", "web/src/components/Veredito/PlacarLine.tsx", "web/src/components/Veredito/MedicaoPanel.tsx", "web/src/lib/veredito/parse.ts", "web/src/components/Desk/InonuAsk.tsx"]
confidence: medium
contested: true
---

# Inteligência, resultados e Veredito

## O que está implementado

A geração do `FeatureVector v1` é determinística e separa cálculo puro, captura e persistência. A especificação registra 72 atributos ordenados, valores desconhecidos como `null` com motivo e exclusão de velas não fechadas, sem olhar o futuro. `src/intel/features/types.ts` mantém a lista versionada; a captura usa feed público e custos locais declarados. ^[docs/sdd/inteligencia-decisao/TASKS.md] ^[src/intel/features/types.ts] ^[src/intel/features/compute.ts] ^[src/outcomes/recorder.ts]

O gravador captura o mercado periodicamente e antes de uma pergunta, registra resultados por horizonte e mantém o armazenamento JSONL local append-only. O registro da resposta diferencia decisão nova de resposta reaproveitada. A camada é declarada consultiva: não chama o Jev para medir, não assina e não envia ordens. O baseline e os testes citados pelos documentos são evidência histórica, não verificação de runtime nesta atualização. ^[docs/sdd/inteligencia-decisao/TASKS.md] ^[docs/sdd/inteligencia-decisao/evidence/baseline.md] ^[src/outcomes/recorder.ts] ^[src/outcomes/store.ts] ^[src/outcomes/decision-log.ts]

O Veredito apresenta a ação fornecida pelo modelo, motivos e plano de risco; a SPEC determina que o código não derive comprar ou vender de um score e pode forçar esperar pelos portões definidos. O cliente valida o formato recebido. `GET /inonu/placar` é somente leitura, marcado como consultivo e com execução `never`. O cartão atual lê o texto do Placar do core e atualiza a cada 60 segundos, sem chamar o modelo. ^[docs/sdd/inteligencia-decisao/SPEC.md] ^[src/verdict/compose.ts] ^[src/inonu/http.ts] ^[web/src/lib/veredito/parse.ts] ^[web/src/components/Veredito/VereditoBody.tsx] ^[web/src/components/Veredito/PlacarLine.tsx]

## Discrepância REC-6 no Placar

A SPEC requer, além de amostra, acerto e retorno líquido com intervalos, o Brier e uma tabela de confiabilidade. `TASKS.md` marca INT-0.10 como feito, mas a implementação atual de `src/outcomes/scoreboard.ts` retorna taxa de acerto Wilson, média líquida e intervalo Newey-West, contagens, comparação de qualquer momento e texto. O tipo `Placar` não contém Brier nem tabela de confiabilidade. O componente web só renderiza `placar.texto`. A busca na implementação de `src/outcomes/` não encontrou esses campos. Assim, REC-6 e o estado “feito” de INT-0.10 estão em conflito observável e precisam de revisão, sem marcar o requisito como satisfeito. ^[docs/sdd/inteligencia-decisao/SPEC.md] ^[docs/sdd/inteligencia-decisao/TASKS.md] ^[src/outcomes/scoreboard.ts] ^[web/src/components/Veredito/PlacarLine.tsx]

`MedicaoPanel` exibe estado do gravador e medidas disponíveis, mas sua presença não demonstra que exista amostra atual. A aceitação do projeto distingue dado insuficiente, medição e promoção. Não inferir vantagem, lucro ou calibração do fato de a captura e o cartão existirem. ^[docs/sdd/inteligencia-decisao/SPEC.md] ^[docs/sdd/inteligencia-decisao/TASKS.md] ^[web/src/components/Veredito/MedicaoPanel.tsx]

## Estado de C1 a C5 e resultados

O estado registrado em `TASKS.md` e no checkpoint das 15:35 é mais avançado: C2 tem o construtor e o leitor prontos, mas a ligação ao modelo está bloqueada por ownership e custo; C3 tem logística, árvores, calibração, walk-forward, portão e backfill marcados como feitos; C4 e C5 seguem não iniciados. C1 registrou 68 minutos, 56 fotos, 44 rótulos, zero erros e zero chamadas ao modelo. Esses números são evidência daquela janela, não estado live atual. ^[docs/sdd/inteligencia-decisao/TASKS.md] ^[docs/sdd/inteligencia-decisao/CHECKPOINT.md] ^[docs/sdd/inteligencia-decisao/evidence/C1-ao-vivo.md]

A pesquisa C3 em histórico público de 60 dias, candles de 15 minutos e horizonte de uma hora assumiu 2 bps de spread além das taxas. Os quatro modelos avaliados tiveram média líquida negativa e nenhum passou o portão; nenhum modelo foi promovido e nenhuma probabilidade de ganho foi publicada. A evidência não inclui fluxo nem spread medido. O relatório `INTELLIGENCE-AUDIT.md` examina uma cópia imutável anterior que dizia não encontrar estes módulos; sua descrição de ausência não representa o working tree posterior do checkpoint. Achados daquela cópia não são declarados resolvidos sem revalidação contra seus hashes. ^[docs/sdd/inteligencia-decisao/evidence/C3-pesquisa-2026-10-13.md] ^[docs/sdd/backend-audit-20261013/INTELLIGENCE-AUDIT.md]

A evidência de calibração quantitativa pertence ao módulo separado descrito em [[risco-quantitativo]] e não fecha a lacuna REC-6 do placar de decisões. Para o papel do Jev na fita, consulte [[fita-e-decisao-jev]]. A interface e a qualificação de runtime estão em [[interface-e-central]] e [[seguranca-e-qualificacao]].
