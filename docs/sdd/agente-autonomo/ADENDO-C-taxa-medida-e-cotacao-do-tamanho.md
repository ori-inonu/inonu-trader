# Adendo C: taxa de rede medida e cotacao no tamanho escolhido (2026-10-15)

Pedido do Codex (secao 98 da coordenacao, repetido pelo dono): o dono ja delegou reserva, risco e tamanho ao Jev; o valor fixo de US$ 5 de reserva do coin nativo e escolha do codigo e deve virar taxa medida por rede, com fonte e idade. Este adendo fixa o contrato ANTES de implementar. Nada daqui esta implantado, e qualquer mudanca no backend congelado publica manifesto novo.

## 1. O que existe hoje (verificado no codigo)

| Fato | Onde |
| --- | --- |
| A reserva do coin nativo e `GAS_RESERVE_USD = 5`, arredondada para cima em unidades; saldo nativo de valor desconhecido ou menor ou igual a 5 nunca e vendido | `src/agent/exit.ts` |
| A cotacao do tool ja traz `tradeFee` (taxa de rede estimada em USD) e `estimateGasFee` (unidade minima do coin nativo, nunca somar a dolares) | `src/agent/quote-facts.ts` linhas 5 a 24 |
| A cotacao e lida antes de toda ordem e a taxa vai para `costUsd`, mas nada guarda a taxa por rede nem a mostra ao Jev | `src/agent/cli.ts` (`onQuote`, `asNumber(q.tradeFee)`) |
| Falha por falta de taxa: `gas_station_pendente` (venda cujo caminho pede mais SOL do que a carteira tem) | `src/agent/cli.ts`, `capacidades-okx.md` item 5 |
| Vetos de custo no executor, escolha do codigo: impacto 3, 5 e 10 por cento, imposto 5 por cento, derrapagem 2, 3 e 8 por cento | `cli.ts` linhas 375 a 377, `swap-args.ts` |

## 2. Requisitos

| ID | Requisito | Aceite independente |
| --- | --- | --- |
| FEE-1 | O agente guarda, por rede, a ULTIMA taxa de rede cotada: `tradeFeeUsd` e `estimateGasFeeMinor` (strings de inteiros), `observedAtMs` e `source` (`cotacao_de_compra`, `cotacao_de_venda`, `cotacao_de_fechamento`). Uma taxa sem data de leitura nao existe. Persiste no diretorio do agente e sobrevive a reinicio | teste: duas cotacoes em redes diferentes dao duas entradas; a mais nova da mesma rede substitui a velha; reinicio le de volta; entrada sem `observedAtMs` e rejeitada |
| FEE-2 | A reserva do coin nativo deixa de ser um numero em dolares do codigo. E a taxa necessaria para SAIR de todas as posicoes abertas do agente na rede (uma taxa por posicao, mais uma) lida de FEE-1, convertida em unidades do coin nativo pelo preco do proprio saldo. Sem taxa medida na rede, o coin nativo NAO e oferecido para venda e o motivo e nomeado (`sem_taxa_medida`): nao se inventa numero | testes: `sellPlan` com taxa conhecida de US$ 0,02 e tres posicoes reserva US$ 0,08; sem taxa, a venda do nativo e nula com motivo; saldo menor que a reserva e nunca vendido; o `protectiveSellPlan` nao toma a reserva |
| FEE-3 | O Brief entrega ao Jev, por rede em que ha candidato ou posicao, `taxa` (USD por troca) e `idade` (minutos), e `nativo` (valor em USD do coin nativo da carteira na rede). Desconhecido e `null`, nunca zero | teste do Brief: chaves presentes quando medidas, `null` quando nao, legenda explicando; tamanho do Brief ainda abaixo de `BRIEF_MAX_BYTES` |
| FEE-4 | Na execucao, antes de enviar, o saldo do coin nativo precisa cobrir o `estimateGasFee` da cotacao daquela ordem; se nao cobre, a ordem falha limpa antes de assinar com `taxa_sem_saldo` (nao `gas_station_pendente`, que e a recusa da OKX) | teste do executor com cotacao falsa: saldo nativo menor que o gas da cotacao nao chega ao `swap execute` |
| FEE-5 | A tela de Sistema mostra a taxa medida por rede com idade e origem, e diz `SEM TAXA MEDIDA` quando nao ha | teste do modelo e da cena da HUD |

## 3. Fatia D: cotacao no tamanho escolhido (SEM ativar)

Hoje o Jev escolhe o tamanho sem saber o impacto que ele vai cotar e o executor pode vetar depois (ADENDO-B secao 9, correcao). A fatia D le a cotacao NO TAMANHO ESCOLHIDO e entrega ao Jev impacto, taxa, imposto e derrapagem como fatos, mantendo no codigo so o que o provedor ja bloqueia (honeypot, acao `block`, simulacao que falha, saldo insuficiente). Ela reaproveita a fase de fechamento (`closing-phase.ts`), que hoje roda so em `shadow`. Condicoes antes de ligar `decide`:

1. a fase de fechamento ter rodado em `shadow` no ar com o pacote qualificado, gerando `closings.jsonl` real (hoje nao existe nenhum registro);
2. o auditor do Codex (`closing-audit`) sem achado sobre esses registros;
3. decisao explicita do dono de ligar, depois de ver a medicao.

Ate la os tres tetos de custo do executor continuam e a lacuna esta dita na tela e no ADENDO-B. FEE-1 a FEE-5 nao dependem da fatia D e podem entrar antes.

## 4. Ordem das tarefas

| ID | Tarefa | Caminhos | Depende |
| --- | --- | --- | --- |
| C1 | Memoria de taxa por rede (`fees.ts`) com persistencia e testes | `src/agent/fees.ts` (novo) | nada |
| C2 | Ligar `onQuote` a memoria e propagar a taxa para o ciclo | `cli.ts`, `wire.ts`, `cycle.ts` | C1 |
| C3 | Reserva nativa por taxa medida em `sellPlan` e `protectiveSellPlan` | `exit.ts` | C1 |
| C4 | Fatos de taxa no Brief e na legenda | `model.ts`, `types.ts`, `candidates.ts` | C2 |
| C5 | Recusa limpa antes de assinar por saldo nativo menor que o gas cotado | `cli.ts` | C2 |
| C6 | Tela de Sistema com taxa por rede | `web/src/lib/hud/**` | C4 |

## 5. Riscos ditos sem eufemismo

- A taxa estimada na cotacao e uma previsao: a taxa real pode ser maior (Solana com prioridade, EVM em congestionamento). FEE-4 valida contra a cotacao da propria ordem, e a reserva por posicao tem uma taxa de folga so em numero de posicoes, nao em multiplicador.
- Sem taxa medida o nativo fica preso: com a carteira atual (cerca de US$ 1 de SOL) isso nao muda nada na pratica, e e mais seguro que vender nativo sem saber.
- Mudar `exit.ts`, `cli.ts`, `cycle.ts`, `model.ts` e `wire.ts` quebra o freeze de 2026-10-14: novo manifesto e nova qualificacao do Codex.
