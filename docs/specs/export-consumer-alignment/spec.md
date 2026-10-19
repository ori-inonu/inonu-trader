# Spec: exports apos revisao dos consumidores

Fatia de remaining-system-alignment. Base 4fa7282, main 2327a28. A auditoria sintatica das 1798 fontes rastreadas com o parser Babel ja instalado encontrou 16 candidatos entre os 17 casos lexicais/indiretos antes preservados. assertByteEventCapacity continua importado por paper-supervisor-store.ts e permanece exportado.

## Aceitacao

- C1: remover somente a palavra export das 16 declaracoes em cohort.json. Manter corpos, valores, imports, dependencias, configuracoes e dados intactos. Conferir ancora unica, hashes atuais e inversao byte a byte.
- C2: preservar assertByteEventCapacity e seu consumidor real. Namespace de eventos le somente os dispatchers; namespace de archive le cliente e parser; import dinamico de model desestrutura JevModel; o caso import de paper-supervisor no teste e tipo, sem acesso aos helpers candidatos.
- C3: separar nomes iguais em modulos distintos e propriedades de registros de consumidores dos exports. Ocorrencia lexical sozinha nao demonstra importacao. O parser e uma prova sintatica dos caminhos literais, nao um resolvedor completo de tipos, aliases computados, eval ou consumidores externos.
- C4: tipos core/web, core, laboratorio e testes web passam. Nenhum teste novo que apenas replique a retirada da palavra export. Revisar diff, preservar os oito arquivos v1 e acrescentar iteracao ao cerebro.
- C5: publicar no mesmo PR 5 em rascunho. Main e qualificacao operacional continuam pendentes. Os 28 casos de runtime alterado, 33 de areas reservadas e dois contratos documentais permanecem separados.

Decisao limitada sem-jev: aplicar somente as 16 remocoes revisadas, com inversao e checks completos. O conector global nao esta disponivel; nenhuma chamada Jev ocorreu. O pedido de limpeza/alinhamento e o fallback local autorizam esta alteracao reversivel de codigo. Nenhuma decisao financeira, de autenticacao, risco, billing ou migracao foi tomada. scripts/goal.ts esta ausente.
