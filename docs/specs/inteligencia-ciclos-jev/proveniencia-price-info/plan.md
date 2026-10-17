# Plan: Proveniência de `price-info` no Brief

Estado: extensão pública opcional `pt` no Brief V1 implementada; smoke backend→HUD, fixtures atuais e focused concluídos. Aggregate global final concluído em três comandos; detalhes/limites em `status.md`. Não é autorização de migração, de dados D2 privados, nem de mudança de proprietário.

## Decisão proposta

Adicionar no caminho já existente de facts uma propriedade opcional de presença do timestamp provider-reportado (`HoldingFacts.priceInfoTimestampReported?: boolean`) e projetá-la no holding do Brief como `pt: 0|1`, sem alterar `ag`. A propriedade só é definida quando existe observação `price-info`: `true` se `tsMs` numérico sobreviveu à normalização; `false` se não ficou disponível naquela resposta normalizada. Sem observação (falha, candidato sem essa fonte, fallback/registro antigo), propriedade/`pt` ausente = desconhecido. Não inferir estado por `atMs`, `seenAt`, idade de cache ou `ag`.

O timestamp fonte é evidência auto-reportada pelo endpoint, não verificada independentemente. `pt` não valida horário, frescor, autenticidade, preço, risco ou saldo. `pt` muda apenas quando a observação de origem muda; com a mesma evidência não envelhece. O mapa `materialCandidateItems` retira somente idades finitas em `mo.ag`/`tm.ag`; o novo `pt` permanece material e não gera churn por passagem de tempo. Mudança real 0↔1 altera o Brief/hash como qualquer fato material já enviado.

## Compatibilidade aprovada

1. Contrato em memória: `AgentBrief.posicoes` e `ConsultRecord.brief.posicoes` são mapas extensíveis; o campo local de `HoldingFacts` e `pt` são opcionais.
2. `pt` só entra em novos Briefs quando há observação normalizada; registros antigos permanecem V1 sem reescrita.
3. `wire.ts`, `auditConsult`, `fullBriefHash`, `sourceConsultDigest` e capture-store já cobrem todos os campos de `posicoes`; não alterar seus algoritmos, versões ou serialização.
4. A aprovação do Main é autorização explícita desta extensão dentro do escopo existente, não autorização de migração nem permissão para expor dados privados D2. Nenhum novo owner-auth gate é necessário.

## Arquivos e responsabilidades (após aprovação)

| Arquivo | Mudança eventual | Compatibilidade/limite |
|---|---|---|
| `src/agent/types.ts` | Campo opcional local em `HoldingFacts` | Não guardar horário bruto, cache clock ou dado privado |
| `src/agent/live.ts` | Transportar presença de `tsMs` da resposta normalizada ao fato | Sem chamada nova; separar linha observada de ausência de observação |
| `src/agent/candidates.ts` | Passar a evidência opcional das facts à posição do Brief sem fabricar estado nos fallbacks | `priceOnlyFacts`/fonte não observada deixa o metadado ausente |
| `src/agent/model.ts` | Projetar `pt` em `posicoes` e legenda curta | `ag` intacto; omitir `pt` se desconhecido; validar orçamento |
| `src/agent/analysis.ts` | Preservar `pt` na allowlist de evidência holding | Não incluí-lo em `reviewFreshness`/origens de idade |
| `web/src/lib/hud/parse-cycle-review.ts` | Aceitar somente `pt` numérico 0/1 no item holding | Ausência antiga permanece válida/unknown |
| `web/src/components/Hud/CycleReviewPanel.tsx` | Rotular/apresentar `pt` com semântica explícita, sem inferir frescor | Renderer já é genérico; não confundir com `ag` |
| `src/agent/cycle.ts` | Sem mudança de versão; manter cópia exata do Brief enviado | A serialização/hash existente incorpora `pt` sem omitir campo |
| `src/decision-review/audit.ts` | Sem mudança | Fingerprint V1 já abrange `posicoes` inteiro |
| `src/decision-review/evolution/agent-episode.ts` | Sem mudança | `fullBriefHash` V1 já inclui `posicoes` integral; capturas antigas permanecem intactas |
| testes adjacentes existentes | Exercitar projeção, allowlists, hashing e orçamento | Localizar/reler os arquivos de teste reais antes da edição |

`web/src/lib/hud/parse-analysis.ts` delega parsing de reviews a `parse-cycle-review.ts`; `web/src/lib/hud/types.ts` já aceita número em evidência, portanto não aparenta exigir contrato novo. `src/decision-review/event-evidence.ts` usa hash completo e fatos mapeados, não deve tratar `pt` como idade; validar que não perde exatidão do Brief. Não alterar `scripts/look-staleness.ts` nem `scripts/brief-freshness.ts`.

## Orçamento, hashes e comportamento

- Apenas resposta pública já consultada; zero chamadas/cadência adicional. Não expor carteira, identidade de posição ou qualquer campo D2 além do Brief já existente.
- `pt` ocupa bytes no mesmo Brief de até 12.000 bytes; testar caso máximo já coberto pelo conjunto real de candidatos/legendas. Nenhum novo contexto em `boundedContext`; teto 32 inalterado.
- Persistir exatamente a projeção passada ao modelo e seu hash. Não suprimir campo no journal para preservar hash nem reenviar versão diferente.
- Ausência de `pt` em ConsultRecords antigos não se converte em 0. O parser pode devolver ausência sem rejeitar o registro antigo.
- Não tocar em cálculo/legenda de `ag`, nem nas fontes de idade `mo.ag`/`tm.ag`, regras de consulta/cache, shortlisting, limite de retenção ou persistência operacional.

## Verificações reportadas e aggregate final

- Smoke sintético compôs `HoldingFacts`/Brief por funções backend reais e o parser HUD real: `pt=1`/`0` preservados, ausência legacy e valor inválido omitidos; fatos `ag`/cycle permaneceram. O componente/parser/CSS também foi observado em Chromium real isolado, não em aplicação Next completa/deployed.
- Brief atual medido: fixture completa 11.989 B (8 holdings `pt=1`, 7 buys, 32 context keys), fixture mista 11.948 B nas mesmas dimensões; `LEGEND.pt` 77 B. O bound anterior 11.888 B é histórico/derivado; 12.000 B é referência do teste, não guarda ou truncamento runtime.
- Aggregate final sequencial: `typecheck:all`, `test:lab`, `test:all` exit 0; juntos executaram os cinco caminhos root/web requeridos, não cinco comandos standalone. Root `test:all` teve 7.882 pass/2 skip/0 fail; web 3.825 pass/0 fail. As duas skips root de receipt-safety não qualificam live; veja `status.md` para logs, demais contagens e escopo do monitoramento. A falha anterior e o reparo test-only permanecem como histórico, não resultado atual.
