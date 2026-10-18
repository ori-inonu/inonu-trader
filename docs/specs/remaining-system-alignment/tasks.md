# Tarefas e dependencias

| ID | Tarefa | Depende de | Evidencia de termino | Estado |
| --- | --- | --- | --- | --- |
| A1 | Revalidar main, worktrees, conflitos e aba do sistema | nada | Git atual e navegador | feito: main local/remota 2327a28; raiz agora sem conflitos de indice; painel observado |
| A2 | Inventario deterministico completo de deltas nao commitados | A1 | result.json do audit, hashes e classificacoes | feito no escopo src/scripts/web e caminhos documentais; 53 runtime/import, 113 exports, 59 comentarios/tipos; limites no relatorio |
| B1 | Conferir consumidores dos dez exports selecionados | A1 | busca e leitura de declaracoes atuais e diff goal1 | feito com limite explicito para consumidores dinamicos |
| B2 | Aplicar proposta literal em candidato isolado | B1 | nove arquivos alterados, dez palavras export retiradas | feito em codex/remaining-alignment-20261018; corpos e valores conferidos |
| B3 | Verificar tipos e testes | B2 | typecheck, test e test:lab com saida real; teste focado | feito: tipos exit 0; core 8539 pass / 2 skip / 0 fail; lab 650 pass / 0 fail; antes da mudanca, 193 testes real passaram |
| B4 | Revisar e integrar o diff validado | B3 | review-diff, ship-pr e prova do conteudo final em main | PR 5 aberto em rascunho; integracao em main retida pelo gate do agente completo |
| C1 | Revisar consolidacao de cliente API e seus testes | A2 | todos os consumidores, compatibilidade e isolamento | parcial: contratos e consumidores nomeados conferidos; 89 testes offline passaram na origem; conjunto altera autenticacao, integracao bloqueada para decisao automatica; api-consolidation-review.md |
| C2 | Revisar migracao documental e regras locais | A2 | referencias resolvidas e preservacao dos artefatos congelados | parcial: C2a publicada e verificada, legados intactos; auditoria de 611 Markdown contra 694 destinos encontrou 15 corpos integrais, tres anteriores a main, 299 rotulos de fonte apontando ao proprio arquivo e 98 links locais ausentes; folder-document-provenance-review.md e ../lab-annex-alignment/tasks.md |
| C3 | Reconciliar conflitos antigos e deltas exclusivos | B4, C1, C2 | nenhuma perda de WIP; conflitos resolvidos com prova | parcial: zero conflitos na raiz, dependencia transitiva reposta, tipos/core/lab/web passam; merge local ainda aberto e restante WIP preservado, conforme bootstrap-root.md |
| D1 | Abrir interface local e observar estado | A1 | navegador com aplicativo renderizado e estado verificado | feito para observacao: painel renderizado, core e analise indisponiveis; nao prova agente ativo |
| D2 | Diagnosticar frescor com timestamps por fonte | A1 | origem da expiracao provada e reamostragem real | parcial: 30/30 snapshots reais prontos na reamostragem; falha anterior nao reproduzida |
| D3 | Medir agente completo e inferencia Jev | C3, D1, D2 | ciclos, latencias, recusas e custos observados | pendente |
| D4 | Avaliar resultado liquido e criterio de producao | D3 | evidencia conciliada, cobertura e limitacoes | pendente |

```mermaid
graph TD
  A1 --> A2
  A1 --> B1 --> B2 --> B3 --> B4
  A2 --> C1
  A2 --> C2
  B4 --> C3
  C1 --> C3
  C2 --> C3
  A1 --> D1
  A1 --> D2
  C3 --> D3
  D1 --> D3
  D2 --> D3
  D3 --> D4
```

Transacoes, ordens, assinaturas, segredos, mudancas de risco, dependencias de producao, billing e migracoes nao recebem decisao automatica. Registrar bloqueio e seguir com tarefas elegiveis. Esta tabela nao reduz o objetivo integral a B2 ou ao preview.
