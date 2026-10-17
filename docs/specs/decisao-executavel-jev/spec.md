# Spec: evidência executável no Brief do JEV

Status: aprovada para implementação
Dono: usuário, no escopo de melhorar e configurar o software sem realizar operações

## Contexto

A investigação encontrou duas perdas de informação antes da consulta ao modelo. A sonda de compra identifica `gas_station_pendente`, mas a adaptação para impacto numérico converte essa recusa em ausência de cotação. Os candidatos de posição já possuem alertas gerados pelo código, mas o serializer não os inclui no Brief, embora a legenda `posicoes.t` exista.

## Metas

- Impedir que uma compra explicitamente recusada pela sonda por gas station seja oferecida ao modelo como executável durante a validade dessa observação.
- Entregar ao JEV os alertas de posição já produzidos pelo ciclo, sem inventar recomendações ou dados de carteira adicionais.
- Preservar distinção entre recusa observada e cotação indisponível.

## Não metas

- Operar, assinar, transmitir transações ou ativar live.
- Alterar limites de risco, orçamento, intervalos, credenciais, schemas ou journals.
- Acrescentar chamadas pagas, nova telemetria privada ou garantia de lucro.
- Tratar uma falha histórica posterior à execução como se fosse necessariamente detectável na sonda.
- Prometer ciclos lucrativos a cada minuto ou multiplicação do capital.

## Critérios de aceitação

- [x] A recusa explícita `gas_station_pendente` atravessa o adapter da sonda e retira as opções de compra do candidato; permanece a opção skip e o motivo observado.
- [x] A mesma observação usa a validade curta de falha existente e uma cotação bem-sucedida após expiração permite nova avaliação. Não há novo retry nem aumento de chamadas.
- [x] Cotação desconhecida continua desconhecida, sem fechar artificialmente o candidato. A filtragem por impacto e as proteções existentes continuam funcionando.
- [x] O Brief inclui `posicoes.t` somente quando há alertas, preserva os códigos produzidos, não acrescenta dados privados e respeita 12.000 bytes nos cenários de referência existentes.
- [x] O relatório de candidatos mantém `closed: "gas_station_pendente"` e a marca observada entre as quatro marcas disponíveis, inclusive quando já há outras quatro. O painel não deve apresentar essa recusa como valor abaixo do mínimo; os consumidores existentes usam o código e seu fallback textual, sem novo campo ou schema.
- [x] Replay offline e sem ordens demonstra os caminhos alterados. `bun run typecheck`, `bun run test` e `bun run test:lab` passam.

## Restrições e decisões

A API interna da sonda passa de número opcional para observação explícita `{ impactPct: number | null; refusal: "gas_station_pendente" | null }`. Todos os consumidores serão migrados, sem alias legado. A política de TTL, os limites de sondas e as guardas de execução permanecem. Os alertas são observações do código, não instruções ao modelo. Não há pergunta de design em aberto: são correções dos contratos existentes.

O checkout possui alterações concorrentes. Preservar o conteúdo não relacionado. Não implantar nem reiniciar o processo instalado durante esta tarefa.
