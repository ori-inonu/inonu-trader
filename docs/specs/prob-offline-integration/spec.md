# Spec: biblioteca probabilistica offline

Status: implementada e verificada localmente. Publicacao pendente. Base main b37553a. Origem goal1 a4a9ef5 com arquivos nao commitados, preservados.

## Metas e criterios

Integrar somente src/prob/*.ts e scripts/prob-cycle{,.test}.ts. A biblioteca mede movimento bruto historico, sem efeito no agente.

- Modulos puros sem I/O, rede, ambiente, relogio ou aleatoriedade global; fixtures sinteticas reproduziveis.
- CLI exige pasta explicita; recusa saida dentro dos journals por caminho lexical ou canonico, inclusive junctions e nomes com dois pontos. Cria arquivo novo exclusivamente, sem sobrescrever arquivos ou hardlinks. Requer diretorios estaveis durante a execucao.
- Idade ausente ou invalida permanece desconhecida. Brief posterior exige idade conhecida nas duas pontas; outras fontes permanecem elegiveis.
- Textos descrevem medidas ou limitacoes, sem repetir conclusoes fixas de amostra antiga. Ausencia nao vira zero. Retorno bruto nao qualifica lucro, reinvestimento ou live.
- Contrato limitado: cinco journals ativos lidos (briefs, scoreboard, closings, decisions-meta, equity); answers/prices/fills so com presenca verificada; segmentos rotacionados nao lidos. Relatorio declara cobertura parcial.
- Facetas do brief e placar em [0,1]; fechamento sua.f em [0,100], com fixture do contrato atual.
- Relatorio e suite v2 por mudanca de contrato e elegibilidade de rotulos.
- Testes do CLI e biblioteca, typecheck, test e test:lab aprovados; diff delimitado e cerebro append-only verificado.

## Restricoes

Sem journals reais, mudanca de agente/cadencia/risco/live/Market.init, credenciais, auth, migracao, dependencias ou billing. Sem reorganizacao documental da goal1. Documentos antigos permanecem na origem para revisao posterior.

## Decisao pendente

Usar leitor limitado com cobertura parcial declarada ou ampliar contratos agora? Proposta: leitor limitado e backlog verificavel. Jev recomendou isolar a entrega (tool isolate_offline, recibo 029ce9c5-1679-401d-a311-fbadffc4950a, confianca 0.96). Recomendacao consultiva, sem autoridade operacional.
## Gate e revisao anterior a implementacao

Plano adotado para esta fatia: bounded_read_existing, Jev tool, recibo 4931ab3e-7644-4d31-946e-9fed89b7ba62, confianca 0.6. Recomendacao consultiva. A revisao adicional por essa confianca confirmou: caminhos novos sem colisao; mudancas somente no consumidor offline; nenhuma ampliacao de autoridade; contratos parciais explicitos; regressao e checks deterministas como condicao de integracao. As limitacoes dos rotulos historicos permanecem declaradas. Status: aprovado para implementacao no escopo autorizado pelo dono.
