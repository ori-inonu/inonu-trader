# Status: autoresearch real online

## Escopo aprovado pelo usuario

Somente dados reais online a partir desta mudanca. Sem operacoes financeiras, aumento de risco, novas consultas pagas ou atualizacao do processo instalado nesta tarefa.

## Fase atual

Implementacao integrada e revisao estatica independente aprovadas, sem achados restantes. Duas observacoes consecutivas do comando canonico passaram no codigo final congelado. A sequencia final dos tres gates obrigatorios concluiu com exit 0; resultados e falhas anteriores estao registrados abaixo.

O comando agora e `bash autoresearch.sh`, com `bun --no-env-file`. Consulta exclusivamente o runtime online existente e a API publica OKX. O candidato, workload, congelador e fixture sinteticos exclusivos do autoresearch foram removidos. Os laboratorios unitarios independentes do produto permanecem, mas nao produzem evidencia desta pesquisa.

## Prova real online no codigo final

As duas invocacoes tiveram exit 0, `measurement_class=real_online_observation`, 169 linhas `METRIC` finitas e `REPORT` sanitizado. Ambas usam o mesmo avaliador SHA-256 `c803a011109278502d28756ba8c3a329925e81a1ea9fa71eaaa505afa49c5729`.

| Observacao | Inicio da coleta (epoch ms) | Duracao da coleta | Conhecidos / catalogo | Desconhecidos | Evidencia SHA-256 |
|---|---:|---:|---:|---:|---|
| 1 | 1792202380339 | 1675 ms | 474 / 1140 | 666 | `0bbdac862b2fc8b30f512964b3e45ab365aea1eabe909d776d7f1be92a0d9a64` |
| 2 | 1792202382862 | 1450 ms | 474 / 1140 | 666 | `0fb75491bc6ded47c17c7ffc326ecd5e59f5e50d6b60c0e241e6501714e76e82` |

Cobertura de campos de 41,58% mede disponibilidade, nao qualidade da decisao ou retorno financeiro. O catalogo inclui campos dinamicos; nao comparar essa contagem com a baseline sintetica removida.

Fontes obrigatorias em cada invocacao:

- Runtime loopback: `/health`, `/agent/analysis` e `/agent/ledger?n=200`, Origin `http://127.0.0.1:3000`.
- Mercado publico HTTPS: `/api/v5/public/time` e `/api/v5/market/ticker?instId=SOL-USDT`.
- Timeout de 15 s por leitura, limite de 4 MiB por resposta, idade maxima de 120 s para projecao/mercado e tolerancia de relogio futuro de 30 s. Frescor tambem e conferido ao concluir a coleta.
- Hashes cobrem projecao sanitizada e metadados da captura, nao bytes brutos, autenticidade da fonte ou autoria do modelo.

Relatorios completos e historico das tentativas, sem payload privado bruto, foram salvos fora do checkout em `C:/Users/gabri/InonuTraderReleases/autoresearch-real-online-20261016/`: `observation-1.json`, `observation-2.json` e `attempts.json`.

## Pontos fracos observados

- A ultima consulta retida foi `1792175495358`, com aproximadamente 7 h 28 min nas duas observacoes. O timestamp da projecao foi `1792202380384`. As leituras reutilizaram o mesmo fato; nao comprovam duas decisoes novas nem autoria JEV.
- O ledger forneceu somente os 200 registros finais: 51 ordens e 149 ciclos. Isso nao prova cobertura global, fills completos ou conciliacao de todas as ordens.
- O agregado de ordens em `/agent/analysis` informou 4 registros `incerta` e 1392 `falhou`. Sao contagens historicas do ledger disponivel ao produtor, distintas da cauda de 200 registros; nao sao novas ordens destas coletas, transacoes confirmadas ou perdas em USD.
- O ticker SOL-USDT informou last `104.31`, bid `104.31` e ask `104.32`; idade de 3150/3350 ms. E contexto publico CEX, nao preco executado, marca da carteira ou lucro.
- Resultado liquido em USD continua `unknown`: faltam fills completos conciliados, custos em USD e conciliacao dos fluxos externos. `optimization_eligible=false`, `financially_authorized=false` e `goal_10x_24h=not_proven`.
- `asks[].p` nao entra como score observado porque o produtor substitui ausencia por zero. `hist.fresh` indica criterio `rank-v1`, nao recencia. Funil e timeline continuam janelas limitadas a 25/30 consultas.

## Falhas reais e revisao

Foram registradas 11 invocacoes canonicas durante a integracao. Tres falharam por `online_runtime_health_timeout` e uma por `online_okx_time_invalid`; nenhuma dessas quatro emitiu ASI, METRIC ou REPORT de sucesso. As demais incluem observacoes de revisoes intermediarias, que nao substituem o par final acima e nao formam um SLA.

Probes preliminares tambem observaram `origin_not_allowed` para Origin incorreto e timeout em `/agent/analysis`. Depois, essa rota voltou com HTTP 200 em 173 ms, no mesmo processo e sem reinicio. Um curl de health tambem expirou em 5 s e outro respondeu apos 3,779 s. A causa da disponibilidade intermitente nao foi estabelecida; nao houve fallback nem aumento silencioso do timeout.

A revisao independente encerrou quatro defeitos: parser do horario publico esperando envelope ja removido pelo cliente; perda de markouts brutos abaixo de cinco amostras; ausencia de contagens derivaveis do funil; e remocao indevida dos ratios anteriores ao adicionar essas contagens. Raw markouts preservam zeros observados, somente o histograma exige cinco amostras, e contagens/ratios do funil mantem guards de denominador/diferenca. Os testes de fronteira cobrem esses casos sem transformar markout em lucro.

## Verificacoes

O foco `bun test scripts/autoresearch` passou: 12 pass, 0 fail e 58 expect em tres arquivos. `bun run typecheck` passou. A primeira suite global completa teve 7850 pass, 2 skip e 1 fail em 481 arquivos: Windows recusou `renameSync` com EPERM em D21 do port de arquivo, fora do caminho alterado do autoresearch.

A inspecao causal nao encontrou handle deixado aberto ou colisao de pasta nas operacoes sincronas do teste; nenhum patch, retry, sleep, supressao ou afrouxamento foi aplicado. Um smoke real do port completou 100 substituicoes atomicas em arquivos temporarios, verificando recusa de overwrite exclusivo, append/truncate e ausencia de `.tmp`. O foco de capture passou 32 testes/175 expect e `bun run test:lab` passou 647 testes/838136 expect em 16 arquivos. A causa especifica do EPERM anterior permanece desconhecida.

Uma tentativa inicial de typecheck revelou tipo amplo de chave no fixture de teste; foi corrigido sem cast/fallback. Rodadas intermediarias de gates foram canceladas quando a revisao identificou codigo a corrigir e nao sao reportadas como aprovadas.

Gate integrado final no Bun 1.3.14: `bun run typecheck && bun run test && bun run test:lab`, exit 0. O teste D21 permaneceu inalterado e passou dentro desta suite global completa.

```text
$ tsc --noEmit -p tsconfig.verification.json

7851 pass
2 skip
0 fail
983972 expect() calls
Ran 7853 tests across 481 files. [339.82s]

647 pass
0 fail
838136 expect() calls
Ran 647 tests across 16 files. [31.66s]
```

## Limites preservados

O autoresearch nao solicitou nenhuma nova inferencia JEV nem preparou, assinou ou enviou ordens. Nenhum risco, scheduler ou credencial foi alterado. O processo instalado segue `inonu-trader` `0.0.2`, startedAt `1792077348955`; nao foi reiniciado nem atualizado. Commit local nao equivale a ativacao financeira ou instalacao de novo binario.
