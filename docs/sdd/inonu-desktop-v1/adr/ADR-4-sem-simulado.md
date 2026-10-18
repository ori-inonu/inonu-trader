# ADR-4 Nenhum dado simulado no caminho de execução

Estado: proposta. Requisitos: DAT-1 a DAT-3, U7. Evidência: levantamento do caminho de execução por agente (2026-10-12).

## Contexto

O usuário determinou que, nesta fase, nenhum dado mockado entra: só o ecossistema OKX Wallet e OnchainOS (U7). Caminhos não reais que hoje podem alcançar a interface ou o núcleo:

| Caminho | Onde | Risco |
| --- | --- | --- |
| `MODEL=mock` e `DRY_RUN=true` no backend da porta 3030 (`data/final-main.env`) | `src/config.ts:14-18` | A raiz `/` e o snapshot do trader mostram dado simulado do Kuru |
| `SYNTHETIC_DEX_REPORT` | `web/src/lib/dex-report-example.ts`, importado por `web/src/components/DexReportPanel/DexReportPanel.tsx` | Relatório DEX de exemplo na rota `/console` |
| `syntheticReadings` | `src/system-one/readings.ts:61` | Leituras determinísticas de demonstração do System One |
| `--observe` do `jev-read` | `scripts/jev-read.ts` | Sem decisão; a aba do diário mostra "Sem decisao" |
| Fixtures de teste e capturas `harness` | `src/onchain-read/fixtures/*`, `src/onchainos/fixtures.ts`, `web/src/lib/test-fixtures`, `chart-decisions-fixture*.tsx` | Não são importadas no caminho de execução (verificado por agente), mas nada impede |

## Decisão

1. Teste de pureza do **bundle de produção** (T10.1): varre o grafo de imports de `web/out/` e do núcleo e falha se `fixtures`, `synthetic*`, `mock*` ou `SYNTHETIC_*` forem alcançáveis.
2. Todo dado exibido tem `origin` (`okx_public_v5`, `onchainos`, `wallet`) e idade; o que não tem fonte vira "Indisponivel" com o motivo (DAT-2).
3. O núcleo desktop não inicia `MODEL=mock`, o trader Kuru nem `SYNTHETIC_DEX_REPORT` (DAT-3, T10.2).
4. Fixtures continuam existindo **só em testes** e em capturas rotuladas `synthetic_fixture` ou `real_probe`; testes de contrato usam o servidor real do repositório (SRC-4).

## Alternativas

Manter fixtures importáveis com um selo na interface: rejeitado, porque o selo some e a fonte volta a parecer real. Apagar os fixtures: rejeitado, porque os testes e as sondas rotuladas precisam deles.

## Consequências

Alguns painéis ficam "Indisponivel" até a credencial e o orçamento existirem; isso é o comportamento desejado. O `/console` e o trader Kuru ficam fora do instalável (D-U2); remover o código do Kuru é decisão separada do usuário.
