---
title: "Autoresearch de decisoes: plano tecnico"
created: 2026-10-16
updated: 2026-10-16
type: summary
tags: ["jev", "pesquisa", "backtest"]
sources: ["docs/specs/autoresearch-decisoes/spec.md", "src/lab/run.ts", "src/agent/shadow/sim-portfolio.ts"]
confidence: medium
---

# Plano tecnico

Navegacao: [[inteligencia-e-resultados]] e [[laboratorio-e-paper]]. [Especificacao](spec.md), [tarefas](tasks.md) e [estado](status.md).

## Abordagem

Reutilizar o laboratorio puro existente (`src/lab/{source,policies,run,journal,outcomes,stats}.ts`) para executar decisoes e outcomes sinteticos deterministas. Nao instanciar chooser SDK nem MockJevChooser. A politica candidata comeca como adaptacao transparente de `momentumRulePolicy`; a ancestral vem diretamente do modulo existente, fora do escopo de otimizacao. A comparacao e por epoch pareado, nao por medias de coortes diferentes. Desconsiderar metrica de calibracao gerada a partir de preferencias.

Usar `src/agent/shadow/sim-portfolio.ts` para o stress de carteira. Nenhum modulo vivo e editado. O workload nao depende dos arquivos data/ nem de credenciais. Um congelador separado le capturas publicas, projecoes explicitamente permitidas e journals selecionados no home autoritativo do runtime. Esse home e resolvido pelo contrato desktop existente, ou informado explicitamente ao congelador; nao presumir que esteja no checkout. A saida e um snapshot sanitizado novo para a baseline. Metadados de origem, hashes e limites acompanham os agregados, sem caminhos pessoais. O benchmark so le esse snapshot versionado.

## Arquivos e donos de integracao

- `autoresearch.sh`, `scripts/autoresearch.ts`, `scripts/autoresearch/contracts.ts`: integracao central, saida estavel e contrato compartilhado.
- `scripts/autoresearch/{candidate,workload}.ts`: politica isolada, execucao de laboratorio e stress financeiro.
- `scripts/autoresearch/panel-metrics.ts`: inventario de todas as superficies, estados por metrica e diagnostico de fraquezas.
- `scripts/autoresearch/freeze-evidence.ts`, `scripts/autoresearch/fixtures/evidence.json`: congelamento sanitizado de agregados reais e proveniencia. O congelador nao roda em ciclos normais.
- `docs/specs/autoresearch-decisoes/` e indice documental: escopo, limites, procedimento e evidencias de verificacao.

Contrato: `runWorkload(): Promise<WorkloadResult>`, com `metrics: Record<string, number>` e `report: unknown`. `buildPanelReport(snapshot: EvidenceSnapshot)` retorna relatorio determinista. `EvidenceSnapshot` usa schemaVersion=1, fontes com id/path/hash/asOfMs/classification/limitations e medicoes com id/value/unit/status/reason/sourceId. `status` distingue observed, derived e unknown; null sempre traz motivo. Nunca incluir enderecos, texto de modelo, carteira ou segredo.

## Tradeoffs

Sem rede nao ha novas respostas do JEV. O benchmark mede mecanica, comparacao de politica transparente e diagnosticos congelados; nao comprova inteligencia do modelo, vantagem DEX ou retorno futuro. Usar retorno sintetico explicitamente nomeado evita apresentar custo proxy como custo real. Nao fabricar um score financeiro observado quando a evidencia nao o permite.

## Limites do experimento

O avaliador, fixtures, ancestral e inventario ficam off-limits na Fase 2. Escopo inicial de otimizacao: somente `scripts/autoresearch/candidate.ts`; qualquer mudanca de contrato/dados requer nova baseline, nao comparacao com a anterior. Nao liberar live nem promover por benchmark sintetico. A meta financeira permanece nao demonstrada e nao e criterio automatico de encerramento bem-sucedido.

## Revisao antes da implementacao

Especificacao e plano submetidos a revisao tecnica independente antes de implementar. Nenhuma consulta paga ao Jev foi feita ou sera alegada como aprovacao. Este plano operacionaliza contratos existentes, sem decidir novo perfil monetario ou parametro do agente vivo.

## Execucao canonica

Na raiz do repositorio, com Bun instalado:

```sh
bash autoresearch.sh
```

O script usa `bun --no-env-file`, le somente o snapshot versionado e executa o workload em memoria. Saida: `METRIC nome=valor` para numeros finitos, `ASI` para hashes e classe de medicao, e `REPORT` com JSON contendo todas as metricas do painel, lacunas e limites da meta. Falha de execucao ou ausencia de pares elegiveis deve encerrar com codigo diferente de zero.

O snapshot e historico e imutavel durante os ciclos. Portanto, sua analise e repetivel, nao um monitor de saldo vivo. Atualizar dados exige congelamento explicito e nova baseline. Ausencia da pasta local `data/` nao impede repetir uma baseline ja congelada.

O protocolo aprovado e a revisao documental nao substituem a evidencia de execucao. Resultados observados ficam em [estado e verificacao](status.md). Nao ha inferencia nova JEV, ordens reais nem qualificacao de estrategia neste comando.

## Gate antes de registrar a baseline

`init_experiment` faz commit automaticamente. Portanto, a revisao do diff e os comandos obrigatorios do AGENTS.md devem passar antes dessa chamada, inclusive quando as falhas encontradas forem anteriores ao harness. Registrar falhas conhecidas nao substitui o gate. Reparos de isolamento dos testes ficam separados de melhorias da politica e nao alteram avaliador, dados, credenciais ou risco.

## Atualizacao deliberada dos dados

O congelador e separado do benchmark. Nao execute durante uma comparacao em andamento. Para preparar outra baseline, use `bun --no-env-file run scripts/autoresearch/freeze-evidence.ts --runtime-home "<home absoluto>"`, com o home configurado no watchdog/launcher, nao o diretorio do executavel. A gravacao permitida e somente `scripts/autoresearch/fixtures/evidence.json`; os arquivos fonte sao somente leitura.

Projecoes numericas de `equity.jsonl` nao preservam classificacao de caixa/reserva. Fluxos e PnL calculados pelos projetores existentes sao inferidos a partir de mudancas de unidades, nao conciliacao externa de depositos e saques nem retorno liquido auditado. A origem dos dados e declarada pelo produtor e nao autenticada. Precos nulos/zero ambiguos e custos desconhecidos permanecem lacunas, nunca prova de 10x.

Contadores de uso distinguem custo medido de estimativa. Estado diario de budget sem configuracao nao estabelece o limite efetivo. Preferencias, mais ordens, cobertura do painel e ocupacao de caixa nao sao alvos de retorno.

Uma nova baseline requer rever os parsers, projetores e limites atuais; nao adaptar dados ou avaliador para melhorar o placar da baseline antiga. O esquema dos journals nao e migrado por este procedimento.
