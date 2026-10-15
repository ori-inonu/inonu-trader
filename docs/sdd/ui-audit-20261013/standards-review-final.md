# Standards: revisão final independente

Revisor `/root/standards_review`, conversa `01a13671-0949-77f2-9586-03b2ff01a73a`. Não participei da implementação. Inspeção somente de leitura em cópia isolada; escrita restrita a este relatório.

**Integridade:** SPEC, 24 entradas do manifesto final e oito entradas históricas de reconciliação conferem. As 28 diferenças contra o baseline fixo estão contabilizadas. O delta desde `review-combined` contém exatamente `MesaView.tsx`, `InstrumentHeader.tsx` e os dois arquivos `market-inputs`. As outras quatro dependências concorrentes continuam idênticas à origem; CSS compartilhado também permaneceu intacto. Hashes antes/depois:

- SPEC: `e5cc175407637b903721cb8415bfe4ea89004d94c7c28f1978d40ed887706d55`.
- Árvore `web/src`, 463 arquivos: `4041749f9a3b5a865e3e0818847f515816a66547b9ea16e40832dfe0ca451108`.
- `final-manifest.json`: `aa388f0b7b0a7d23d79294d49c11ab4a6748b7d24d387c47f582c5bb523f85e9`.

**Violações documentadas: nenhuma encontrada.** Preservadas as regras de `AGENTS.md` sobre Bun, contratos Jev/Kuru/Monad, pontuação renderizada e ausência de indicadores pulsantes. Nenhuma alteração de infraestrutura, execução financeira ou animação foi acrescentada nesta correção; `web/AGENTS.md` permanece preservado.

UI-1/2: identificação ARIA e revelação dos docks permanecem nas fontes já revisadas. UI-3: CSS responsivo e rolagem não mudaram. UI-4: `market-inputs.ts:8-15` seleciona uma fonte integral, preserva `null` on-chain e elimina derivadas anteriores; `MesaView.tsx:404-490` compartilha essa seleção entre gráfico e ambos os cabeçalhos. `InstrumentHeader.tsx:19,28,51` apenas permite mensagem de espera correspondente à fonte, mantendo `role="status"`. Os testes cobrem ausência total, parcial e retorno à fonte de exchange. UI-5: preservação das cinco rotas; aparência final depende da verificação visual do coordenador. UI-6: invariantes preservados por inspeção de fontes; não certifico operação financeira.

**Heurísticas:** nenhum smell novo identificado. Permanece a sugestão opcional anterior de Duplicated Code em `MesaView.tsx:392-400`: `openConsultation` poderia chamar `revealDock` antes de `setTab`. Não é violação documentada nem impedimento.

Evidência local lida: red 1/3, green 9/0, suíte afetada final 171/0; webpack e TypeScript passaram. Não repeti a suíte completa; suas cinco falhas preexistentes estão documentadas. Esta revisão não aprova a integração no original, ainda não executada.