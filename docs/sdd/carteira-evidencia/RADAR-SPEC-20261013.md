# Radar: decisão preservada e contexto verificável

Entrega local delimitada da conversa 01a136cd-3af3-7361-bd23-c23a6aeece97. O usuário pediu melhorar a inteligência dos dados enviados ao System One, revisar a lista vazia do Inonu e reduzir texto visível. Este adendo mantém WAL-01 a WAL-06 e ABSTENTION sem enfraquecê-los. Não promete resultado financeiro nem executa ordens.

## Evidência e decisão

Sem saldo/capital elegível, o núcleo oferece apenas skip/watch, mas o ranking aceita somente buy; decisões watch desaparecem de picks. A tela apresenta lista vazia e descreve incorretamente compras sem valor. O auditor independente também encontrou idade/stale de signals e risco descartados no coletor, embora use fontes com cache de cinco minutos. Não há prova de que a resposta live observada usou dados vencidos.

Design approved_by=jev_delegated: receipt 0e7f1ca2-f345-436e-9908-e2541db0396b, rank_watch e contracts_render. Preservar decisões por candidato em campo opcional compatível; modelo pode priorizar watch ou buy. Compras continuam em picks com tetos atuais. Não inventar prioridade nem promover watch a compra. Preservar proveniência das fontes já consultadas, sem novas leituras, gates ou arquitetura paralela.

## Critérios imutáveis

- RAD-01: sem saldo, watch escolhido e priorizado pelo modelo aparece como Acompanhar, com token e sinal principal. Nenhum valor, CTA ou ticket de compra é derivado de watch/skip.
- RAD-02: resposta preserva postura por candidato e ranking real do modelo, identidade e fatos. Rank de skip, desconhecido, repetido e postura não oferecida são recusados. Picks conserva somente compras elegíveis, limites e ordens legados; respostas antigas continuam legíveis.
- RAD-03: idade, stale, origem e janela das fontes hot/signals/risco já consultadas permanecem no contexto enviado ao Jev. Ausência não vira zero, segurança, frescor ou certeza. Sem novas fontes, polling ou chamadas implícitas. Gates de famílias/liquidez/holders/honeypot e tetos de compra existentes ficam intactos.
- RAD-04: UI mostra ação, token e sinal principal por prioridade, no máximo três cards; dados completos, exclusões e explicações ficam recolhidos. All-skip continua honesto; resultado antigo sem decisões não é reclassificado. Compra vencida não habilita Preparar compra. Sem pontuação textual proibida ou animação pulsante.
- RAD-05: regressões vermelhas antes da alteração, testes afetados, tipos e build pertinentes verdes; revisão independente em cópia isolada vinculada aos hashes. Exercitar no localhost:3001 uma consulta pública ao modelo, registrando o resultado real e limitações. Não enviar saldos/endereço de carteira desconectada, assinar, operar ou publicar.

## Responsabilidades e execução

Root integrador: web/src/lib/opportunity/picks.ts, picks.test.ts, JevPicks.tsx, JevPicks.module.css e jev-picks-render.test.tsx; documentação e integração compartilhada.

architecture_audit em cópia isolada: src/opportunity/ecosystem.ts e teste; src/inonu/jev-model.ts e teste; src/inonu/source-ecosystem.ts e teste. Backend compatível decisions opcional: candidateId/chainIndex/address/symbol, stance (skip/watch/buy_*), rank (1..3|null), driver/families/marks/facts. Top3 watch e buy usam ranking global real; picks permanece buy-only com rank contíguo legado. Todos os candidatos são preservados em decisions; UI projeta somente os priorizados.

okx_research: auditoria somente leitura congelada. settings_review: revisão independente final somente leitura/cópia. Não estão sozinhos no projeto; preservar mudanças Claude/preexistentes. Hashes de baseline capturados antes de editar; divergência exige acomodação, nunca overwrite. Não criar commits, metas, dependências ou executores autônomos.
