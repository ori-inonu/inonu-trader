# Integração concorrente do ledger — 2026-10-11

Conversa 01a12971-f91a-7b01-befa-dfa93eb04425. Objetivo autorizado: consolidar commits elegíveis no main local, concluir e verificar a central do Jev. Sem push, deploy ou execução de ordens financeiras.

## Baselines e escopo congelado

Main observado: ff37327264d904242c57c21c8acb548a05651e82, limpo, descendente de 96d30cc387a6520aba23199e25d0d4ec71a7ad88. Novo commit de origem: 703c626f246168f610f4ec50776338c3f79fb445, pai dd1ae31fe24e9ae31d2bcdcad099b07c1d46c4af. Candidato exclusivo: 714e2762ba3c1704cb00b5d8051bd0460c84ec66, limpo. Ancestral comum: 96d30cc387a6520aba23199e25d0d4ec71a7ad88.

Delta 96d30cc→ff37327: somente src/operator/ledger.ts, src/operator/ledger.persistence.test.ts e src/operator/executor.expiry.test.ts, 254 inserções/6 remoções. Não importar mudanças não commitadas de outros worktrees. Integrador edita somente seu candidato exclusivo; main será avançada somente após verificação e revisão independentes do conjunto.

Critérios originais C1–C6 em CENTRAL-JEV-ACCEPTANCE.md (SHA256 20e1558da58ceae78332020f1e4f84277eacdb694748d28b9ea599dc30808054), RI1–RI5 em CENTRAL-JEV-REMOTE-INTEGRATION-SPEC.md (f7395f11adfc236a90258f4d7a13587cbe480d84ef3b1d42980777ad1ca20cb7) e EC1–EC4 em CENTRAL-JEV-EXECUTION-COPY-SPEC.md (a3ee84663fba8307e6ed7a8cbd3d51119b4ea489894808cefb8af34fcd4c5ed3) permanecem imutáveis. Este suplemento não reduz esses critérios.

## Requisitos e verificações

- LI1 — Preservação: o candidato integrado deve conter ff37327 e 714e276 como ancestrais, preservar ambos os deltas e os históricos remotos já reconciliados. Verificar pais, diff, refs e worktrees; main limpa e sem alteração concorrente no instante do avanço.
- LI2 — Persistência: EPERM/EBUSY/EACCES de rename no Windows podem receber no máximo quatro tentativas com esperas de 10/20/40ms. Bytes publicados anteriores devem permanecer até rename bem-sucedido; erro persistente original deve propagar. Outros erros/plataformas não recebem retry. Não remover o destino para forçar publicação. Exercitar APIs públicas com arquivos temporários sintéticos.
- LI3 — Destino e execução: diretório/link reconhecido e erro de metadados devem bloquear substituição; destino deve ser revalidado entre tentativas. Se prazo ou kill switch invalidar a operação durante uma espera, nenhuma próxima aprovação/perna deve ser enviada. Os testes devem preservar recibo e hash de aprovação já enviada, sem inventar hash da perna não enviada. Nenhuma operação financeira real será executada para validar a integração.
- LI4 — Evidência conjunta: executar novamente suite backend completa e typecheck:all no candidato integrado. Os 416 testes frontend e build nativo aprovados em 714e276 podem ser reaproveitados somente após demonstrar igualdade de web, package.json, bun.lock e tsconfig.verification.json. Falhas e skips devem continuar explícitos. Não substituir Turbopack nem enfraquecer configuração para obter build verde.
- LI5 — Revisão e publicação local: obter parecer independente sobre export isolado do candidato fixo, incluindo os três arquivos novos e fechamento do P2 de descrições da central. Integrar em main local somente com achados bloqueadores resolvidos e evidências válidas. Não publicar externamente.

## Evidência anterior e limites

Build nativo em 714e276: comando Next/Turbopack padrão exit 0; Build ID fEQXi7zmqvsXIt51IEknU; copy-native-physical.log SHA256 44e584cdec2a191476462a46c60aaa27174d49be3c573bc276a91367bc9f4d9e. O runner de resumo terminou exit 1 depois da conclusão por UnicodeEncodeError ao imprimir um símbolo; exit 0, stdout/stderr e log bruto do build foram salvos antes desse erro. A preparação substituiu somente a junction de dependências do candidato por cópia física das dependências da main com mesmo lockfile, preservando a junction anterior em área privada; não alterou código/configuração do build.

O backend anterior de 1969 testes aprovados não certifica o novo delta; exige nova execução. Revisão visual/servida C3/C6 segue pendente por recusa automática do navegador e bloqueio de criação da prévia. Não repetir nem contornar ações recusadas. Não alegar interface final observada em execução.

Jev Workflows: receipt b4c2e6c6-547d-430a-a959-771ae0dda699, decisão reconcile, confiança .99, modelo jev-1.13.0, uso 622/58, custo desconhecido; approved_by=jev_delegated, human_response=false. A consulta classify_decision anterior foi skipped/unsafe_candidate_id e não foi uma avaliação. Parecer é consultivo e não concede autorização.
