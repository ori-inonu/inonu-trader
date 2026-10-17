# Plan: cutover real online do autoresearch

Status: implementado e revisado, gate real online e verificacao obrigatoria aprovados

## Abordagem e contratos

O caminho canonico passa a ser coletor/avaliador observacional. A fonte das escolhas e o processo existente, nao uma politica local de substituicao. Nao instanciar wire, Market, scheduler, executor ou cliente JEV para realizar a coleta.

1. Coletar por GET o health e os agregados/registro de ordens passivos do runtime local. Usar Origin/Host ja permitidos, sem mudar guards ou autenticar de outra forma. A leitura de ledger e limitada e nunca prova completude global.
2. Consultar o provedor publico OKX existente para relogio e mercado real. Preco CEX e contexto de mercado, nao preco executavel de swaps nem avaliacao de tokens diferentes. Validar esquema, horario do provedor, resposta, timeout e redirecionamento; falha nao substitui dados reais por fixture.
3. Construir em memoria `EvidenceSnapshot` a partir de campos numericos/booleanos explicitamente permitidos. A fonte preserva hash/instantes e limita o que afirma. Atributos privados/textos livres nao entram no report.
4. Reutilizar `buildPanelReport` e o catalogo existente para mostrar cobertura, lacunas e pontos fracos de todas as superficies. Adaptar linguagem que presume snapshot congelado; nao ampliar semanticas financeiras. Dado ausente ou fato sem instante verificavel permanece unknown.
5. Cada invocacao do CLI registra uma observacao real. Invocacoes consecutivas nao implicam decisoes novas; o instante da ultima consulta registrada aparece separado. Nao criar daemon nem alterar a cadencia do agente. Resultados operacionais nao substituem primaria financeira: sem resultado liquido conciliado nao ha score de promocao.
6. Remover do caminho de autoresearch o workload/candidato artificiais, a fixture versionada e o congelador exclusivo dessa baseline, migrando seus consumidores pertinentes. Preservar historico documental como historico superado, nao como instrucoes de execucao atual. Nao remover os laboratorios independentes do produto.

## Fatias e ownership

- Integrador: este SDD, CLI `scripts/autoresearch.ts`, wrapper `autoresearch.sh`, contrato compartilhado, cutover de paths legados e documentacao canonica.
- Coletor: modulo de leitura online independente em `scripts/autoresearch/`; validacao das fontes, erros constantes e proveniencia sanitizada; nenhum import financeiro com side effect.
- Projetor: modulo de projecao real em `scripts/autoresearch/`, `panel-metrics.ts` e consumidores de testes afetados; relatorio de observacoes, lacunas e metricas sem inventar resultado.

Antes de edicoes paralelas, o integrador fixa as interfaces concretas compartilhadas no contrato. Cada fatia altera apenas seus arquivos. Referencias LSP foram tentadas para exports legados; referencias incompletas do servidor exigem tambem verificacao textual dos consumidores conhecidos. Sem build/lint/tests/formatters intermediarios pelos agentes; a verificacao integrada ocorre uma vez apos a composicao.

## Tradeoffs e riscos

- Online nao e deterministico: cada rodada e nova observacao e fica identificada por horario/hash. Nao comparar sua nota com a baseline sintetica.
- Um endpoint online pode retornar uma janela historica ou cache. Preservar o instante original e reportar atraso/ausencia de decisao nova, nao contar polling como inteligencia nova.
- Ledger limitado, analise por simbolo e markouts da UI nao sao reconciliacao integral. Round trips/variacao bruta/custos nativos permanecem separados de PnL USD liquido.
- O funil local cobre as ultimas 25 consultas e a timeline as ultimas 30. `hist.fresh` classifica o criterio `rank-v1`, nao recencia temporal. A projecao pode estar em cache por cinco segundos; somente timestamps dos fatos servem para avaliar idade das decisoes.
- A rota de analise substitui `pBuy` ausente por zero em `asks[].p`. Esse campo e ambiguo e nao prova score Choice zero; a projecao conserva a lacuna, sem inferir dado faltante. Preferencia tambem nao e probabilidade de lucro.
- Atribuir uma decisao ao JEV exige evidencia de `CycleRecord.modelo` e vinculo univoco; timestamp ou nome do processo nao bastam. A cauda limitada do ledger nao permite presumir esse vinculo para todo o historico da analise.
- O processo instalado pode ter uma versao anterior ao codigo. Identificar o processo observado e nao alegar que melhorias nao instaladas ja estao em uso.
- Coleta indisponivel deve terminar com erro, sem imprimir dados financeiros substitutos. Nao tentar corrigir credenciais, risco, sessao ou ordens como efeito lateral.
- Limites de coleta: timeout de 15 segundos, ate 4 MiB por resposta, ate 120 segundos de atraso para projecao local e cotacao publica e tolerancia de relogio futuro de 30 segundos. `health.startedAt` identifica o processo e nunca rejuvenesce os fatos de decisao.

## Execucao canonica

Na raiz do repositorio, com o processo local ja em execucao e acesso HTTPS publico a OKX:

```sh
bash autoresearch.sh
```

O wrapper usa `bun --no-env-file` e o CLI faz uma coleta por invocacao. Nao le fixtures, `.env` ou journals locais como fonte alternativa. Apenas GET de `/health`, `/agent/analysis`, `/agent/ledger?n=200` e do relogio/ticker publico OKX. O Origin permitido acompanha a origem loopback ja existente.

Saida bem-sucedida: `ASI measurement_class=real_online_observation`, numeros finitos em `METRIC` e JSON sanitizado em `REPORT`. Sem primaria financeira conciliada, `optimization_eligible=false`; cobertura operacional nao e score de promocao. Falha de fonte requerida encerra com erro constante e codigo nao zero, sem REPORT de sucesso nem fallback. Invocar novamente coleta outra observacao, nao necessariamente outra decisao.


## Gates e aprovacao

A revisao independente deste spec/plan e dos contratos concretos antecede implementacao. Nenhuma consulta paga nova ao JEV e autorizada por este plano. A revisao de codigo, a execucao real online e os gates do AGENTS antecedem a integracao final. O smoke financeiro e somente leitura, sem transacao.
