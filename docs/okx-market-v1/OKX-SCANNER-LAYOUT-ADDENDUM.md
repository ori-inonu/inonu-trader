# Integração sem sobrescrever trabalho concorrente

E1–E8 e a SPEC SHA-256 13ba216cca87b8fd139d95895cd84a30df536788602fa4679201b8307aa856cb permanecem imutáveis. A errata de advanced-info permanece separada. Este adendo altera somente caminhos de integração, não comportamento ou critérios.

Jev Workflows fd349fc5-4fb7-42f1-922b-ddc79e8ef3e3 recomendou dedicated_namespace com confiança 0.99; approved_by=jev_delegated, human_response=false. A recomendação preserva os módulos concorrentes src/okx-api.ts e src/okx-opportunities.ts.

Mapeamento: os oito arquivos próprios antes em src/okx-*.ts estão em src/okx-market/ com seus nomes originais. O script passa de scripts/okx-scan.ts para scripts/okx-market-scan.ts, comando okx:market-scan. As referências relativas foram ajustadas. Os documentos desta entrega serão copiados para docs/okx-market-v1/ no checkout principal; os bytes da SPEC e da errata serão preservados. Seams compartilhados: somente acréscimos mínimos em scripts de package.json e include de tsconfig.json, pelo integrador.

Baseline concorrente no checkout principal, antes da integração desta entrega: 33 pass, 1 fail, 144 expect, 9 arquivos. Falha em src/okx-opportunities.test.ts:69, priceUsd esperado 2.5, recebido null. Esse módulo foi criado por outro escritor e não será alterado nesta integração. A cópia isolada desta entrega, incluindo seus testes existentes pertinentes, passa; esse resultado não certifica a suíte global concorrente nem acesso live.
