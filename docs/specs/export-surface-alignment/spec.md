# Spec: superficie interna restante

Fatia do objetivo remaining-system-alignment. Base e3759fe, main 2327a28. A primeira remocao de dez exports ja esta publicada no PR 5. Esta continuacao trata somente a coorte literal identificada em cohort.json, sem copiar corpos da origem goal1.

## Aceitacao

- E1: retirar somente a palavra export de 133 declaracoes em 68 arquivos, mantendo byte a byte o restante de cada arquivo do candidato.
- E2: a coorte deriva das propostas de goal1, com hashes conferidos, runtime-base igual a main e busca atual em 1798 fontes. Nenhum identificador selecionado foi encontrado fora de seu modulo nessa busca. Imports de namespace, imports dinamicos literais, require e reexports estrela conhecidos ficam fora da coorte. Caminhos computados e consumidores externos continuam sendo um limite da prova.
- E3: preservar os casos nao resolvidos: oito declaracoes ja privadas ou mudadas, 28 dependentes de revisao das atualizacoes de main, quatro com consumidores indiretos, 13 com ocorrencias externas, 33 em areas reservadas ou de autenticacao/carteira, e duas no contrato documental do laboratorio. Esses numeros classificam simbolos, nao arquivos.
- E4: tipos, core e laboratorio passam. Conferir tambem tipos e testes web, pela amplitude da superficie compartilhada. Nao criar testes que apenas repitam a retirada da palavra export.
- E5: diff coincide exatamente com a coorte; valores, limites de risco, assinaturas, credenciais, dependencias, journals e gates operacionais nao mudam. Cerebro permanece append-only e os oito artefatos v1 ficam intactos. Revisar e publicar no PR 5 em rascunho, mantendo o gate de main e do agente completo.

## Decisao limitada e autorizacao

Pergunta: quais propostas restantes de export podem entrar sem substituir corpos atuais nem modificar caminhos financeiros ou de autenticacao? Alternativas: coorte literal apos busca atual de consumidores; copiar a limpeza completa antiga. Restricoes: E1 a E5, fontes preservadas e nenhuma operacao financeira. Reversivel: sim.

O conector Jev Engineering esta indisponivel. Decisao local sem-jev: aplicar apenas a coorte literal, preservar os demais casos com motivo e executar os verificadores deterministas. A autoridade vem do pedido de alinhamento e do fallback do AGENTS.md; nenhuma nova consulta Jev foi afirmada. scripts/goal.ts nao existe neste checkout. Fonte do inventario e recibo local: .scratch/export-surface-closure-20261018/proposal.json.
