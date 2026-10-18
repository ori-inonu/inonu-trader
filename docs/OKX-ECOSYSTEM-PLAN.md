# Plano da entrega E1–E8

SPEC fixa: OKX-ECOSYSTEM-SPEC.md. Baseline: snapshot da árvore inicial da própria conversa, incluindo alterações anteriores; não comparar toda a entrega somente ao HEAD do Git.

1. E1/E2/E3/E6: implementador isolado possui apenas src/okx-api.ts e src/okx-api.test.ts. Testes públicos de HTTP, HMAC, parâmetros, schemas, timeout e redaction antes da implementação. Cinco endpoints documentados. Não copiar credenciais nem .env.
2. E3/E4/E5: integrador possui src/okx-opportunities.ts e testes. Normalização conserva identidade/unidades/desconhecidos, triagem com critérios explícitos e execução sempre não qualificada. Cenário opcional e hipotético com cálculo independente.
3. E2/E6/E7: integrador possui scripts/okx-scan.ts, testes CLI, fixture sintética, comandos/configuração de exemplo, README e guia de ecossistema. O scanner não altera trader, carteira ou servidor. Default offline; live explícito com limite local de tokens e credenciais presentes. Sem parâmetro de paginação/limit inventado na API.
4. E8: rodar testes novos, suite existente com timeout explícito por teste e typecheck. Qualificar operação offline e preflight sem credenciais. Acesso live não executado/qualificado sem credenciais próprias e orçamento conhecido; mocks não certificam feeds.
5. Revisor independente recebe cópia isolada sem .env, baseline, SPEC e hashes; cobre E1–E8 e segurança/contratos. Integrador corrige achados, reexecuta verificações afetadas e solicita revisão da correção. Registrar cobertura e auditoria de limites e próximo passo elegível.

Decisões técnicas: Jev Workflows 83af45a0-06dd-4b25-a450-2bafe64943bd escolheu Scanner/Public/Isolated; 1080f52b-bdc0-4afb-acf0-042933b6c217 aprovou E1–E8. approved_by=jev_delegated, human_response=false. Consultas são conselho dentro do objetivo autorizado; não concedem acesso, fundos ou publicação. Custo faturado desconhecido permanece null.
