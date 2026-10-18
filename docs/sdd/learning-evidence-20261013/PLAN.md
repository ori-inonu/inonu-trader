# Plano e posse
Baseline: 00a593bcabe25dbb6d83795268533551098f645b.
Worktree: C:/Users/gabri/.codex/worktrees/learning-evidence/jev-trader.
Integrator exclusivo: root-01a1362a. Árvore principal teve claim recusado por overlapping_lease; nenhum lease alheio alterado.

1. SPEC e recibo técnico congelados; contratos copiados verificáveis.
2. TDD vertical na API buildLearningDataset (LE-2 a LE-6), depois CLI com arquivos reais (LE-1/7).
3. Verificar testes focados e typecheck, registrar evidência real e limites.
4. Revisores separados Standards e Spec somente leitura, mesmo baseline e hashes finais. Corrigir achados e revalidar.
5. Auditar escopo, salvar checkpoint local da conversa; deixar patch sem commit/staging/publicação.

Seams aprovados via Jev: API pública e CLI Bun com JSONL temporário. Nenhum mock do armazenamento ou dos algoritmos internos.
Paths exclusivos novos: src/learning-evidence/**; scripts/learning-dataset.ts; scripts/learning-dataset.test.ts; docs/sdd/learning-evidence-20261013/**.
Dependências copiadas (não são entregas autorais):
src/intel/features/types.ts sha256 583208c64c99f60aa761e5742bf7a5139d885e6963859006196e892669101bb6
src/outcomes/types.ts sha256 67627fb1928b49ce02f63eb9dd4bb332aca9501d17b7e8fb983661a5bc20dd2a
src/outcomes/store.ts sha256 bb43ef4877a33db9cbae1649ee70c232447c6b484bdeba60909a2c95dbbc328c
node_modules é junction para as dependências já instaladas. Sem instalação ou mudança de dependências.
