# Jev Decision Lab com o Jev real: medir em sombra, com teto de custo

Data: 2026-10-11. Estado: especificação de `src/lab-jev/*`, de `scripts/jev-lab-real.ts` e da injeção de seletor em `scripts/jev-lab.ts`. Base: [laboratório de decisão](JEV-LABORATORIO-DE-DECISAO.md), [arquitetura da central de operações (decisão D11)](ARQUITETURA-CENTRAL-DE-OPERACOES.md), [política de limites](POLITICA-DE-LIMITES.md), [System One](SYSTEM-ONE.md) e [qualificação para execução real](LIVE-QUALIFICATION.md). Decimais com vírgula na prosa e nas tabelas, ponto nas fórmulas, no código e no JSON.

O dono quer alavancar capital com a inteligência do Jev. O caminho seguro é medir primeiro, sem executar nada: este documento liga o Jev real ao laboratório, em sombra e com teto de custo, e explica como a vantagem medida do Jev vira (ou não vira) alavancagem permitida, que hoje é zero.

## 0. Avisos que não mudam

1. **Somente sombra.** O Jev escolhe entre candidatos de uma captura do passado e o laboratório mede o que a escolha teria rendido. Nada é executado, assinado ou enviado, nenhum capital corre risco e não existe caminho de código daqui até o operador (`src/operator/**`), até `src/market.ts` ou até `src/trader.ts`.
2. **Custa dinheiro e usa a rede, e só quando o dono manda.** `plan` não usa rede nem chave. `run` recusa sem `--allow-paid-inference`, sem os dois tetos, com teto acima dos máximos duros, sem a chave e sem o preço.
3. **A chave nunca aparece.** Nem no stdout, nem no stderr, nem no diário, nem em mensagem de erro. Só `scripts/jev-lab-real.ts` lê o ambiente, e só para saber que a chave existe; quem a envia é o SDK.
4. **O Jev só vê números, ids opacos e enumerações.** Nenhum texto livre vindo de dados chega ao prompt.
5. **Nada aqui prova lucro e nada aqui concede permissão.** O resultado é um diagnóstico. A alavancagem permitida hoje é 0x (fase-0) e só o dono, com as quatro condições da decisão D11, pode mudar isso.
6. As quatro alegações do demo (o Jev decide comprar ou vender a partir do feed, trades reais de carteira real, uma ordem por bloco de 300 ms na Kuru, o painel ao vivo) não são tocadas.

## 1. O que é e o que não é

**É:** o `JevLabChooser`, um seletor do laboratório (`LabChooser`) que pergunta ao Jev real, uma vez por época com candidatos, qual candidato escolher ou se deve manter (`hold`); o `PlanChooser`, que estima offline o que uma execução custaria; e o `scripts/jev-lab-real.ts`, que junta tudo com recusas explícitas, pré-voo, parada antes do teto e retomada. O restante é o laboratório de sempre: candidatos só com o passado, resultado líquido de custos conservadores, Newey-West, Holm, comparação com linhas de base, contrafactual de alavancagem, portão de promoção que só recomenda a fase-0.

**Não é:** um executor, um assinante, uma recomendação de investimento, uma prova de que o Jev tem vantagem, nem um substituto do `bun run qualify:live`. Também não coleta dados: a captura vem de fora, no formato da seção 3.4 do laboratório.

## 2. Critérios de aceitação

Cada critério é um comportamento observável; os testes carregam o identificador no título (`LJ1`, `LJ2`, ...).

| ID | Comportamento observável | Verificado em |
| --- | --- | --- |
| LJ1 | `main(argv)` e `main(argv, {})` da CLI do laboratório dão os mesmos bytes, com o Mock anunciado em voz alta | `jev-lab.deps.test.ts` |
| LJ2 | Com um seletor injetado os avisos seguem `chooser.isMock`: o manifesto nomeia o seletor, o relatório diz que não é Mock e o aviso do Mock some; um Mock injetado continua gritando; `--help` diz qual Jev a execução usa | `jev-lab.deps.test.ts` |
| LJ3 | O preço e o prazo entram no manifesto; cada época consultada grava tokens e custo; sem preço o custo fica `null`, nunca zero; preço diferente na mesma pasta é outra execução e para com exit 3 | `jev-lab.deps.test.ts` |
| LJ4 | `shouldStop` encerra a execução logo depois da época gravada; o resto fica pendente e rodar de novo na mesma pasta continua sem consultar duas vezes | `jev-lab.deps.test.ts` |
| LJ5 | Todo resumo, de `run` e de `report`, diz a alavancagem que a vantagem medida do Jev justifica (zero sem limite inferior de Kelly positivo, sem dados, com o Mock ou com dados sintéticos), os critérios que faltam e que isto não concede nada | `jev-lab.deps.test.ts` |
| LJ6 | Um diário feito com seletor injetado é lido pelo `report` da CLI comum, com a linha de custo | `jev-lab.deps.test.ts` |
| LJ7 | Só números, ids opacos e vocabulários fechados chegam ao modelo; qualquer texto livre, critério fora do vocabulário ou valor que não é número é recusado antes de qualquer chamada, sem repetir o conteúdo | `jev-chooser.test.ts` |
| LJ8 | Desconhecido nunca vira zero: um critério `null` fica fora de `values` e é nomeado em `unknown`; um zero conhecido continua zero; o payload não carrega `null` | `jev-chooser.test.ts` |
| LJ9 | A instrução diz que é sombra, que nada é executado, que `hold` é válido e preferido sem evidência e que a confiança não é calibrada; `maxRetries` 0 e um `AbortSignal`; o texto é fixado por um hash e por uma versão | `jev-chooser.test.ts` |
| LJ10 | Tokens e custo só quando o uso vem válido; sem uso válido `inputTokens` é `null` e a chamada é cobrada do teto pela estimativa | `jev-chooser.test.ts` |
| LJ11 | A resposta é validada por `validateChooserAnswer`: id desconhecido, resposta malformada e probabilidades inválidas viram `hold` com status | `jev-chooser.test.ts` |
| LJ12 | Teto de chamadas e de dólares, checado antes de cada chamada com reserva das que estão em voo; ao esgotar, o seletor recusa com status `budget-exhausted` e nunca mais consulta | `jev-chooser.test.ts` |
| LJ13 | Prazo e aborto: a chamada é abortada em `abortAfterMs` e termina como timeout; com o prazo da política menor, é a política que registra o timeout | `jev-chooser.test.ts` |
| LJ14 | Um erro do provedor nunca vaza: mensagem fixa, sem causa, sem a chave | `jev-chooser.test.ts` |
| LJ15 | Três falhas seguidas abrem o disjuntor e nenhuma nova chamada é feita | `jev-chooser.test.ts` |
| LJ16 | A construção é estrita: modelo, preço, tetos e prazos inválidos são recusados, e os máximos duros são aceitos | `jev-chooser.test.ts` |
| LJ17 | O pipeline inteiro do laboratório com o seletor: vocabulário real aceito, decisões com tokens e custo, relatório de um Jev real | `jev-chooser.test.ts` |
| LJ18 | O `PlanChooser` conta as consultas e estima os tokens do que uma execução enviaria, sem rede | `jev-chooser.test.ts` |
| LJ19 | O caminho real do SDK com um `fetch` falso: o que vai no fio (endpoint, corpo só com números, cabeçalho de autorização) e o que volta | `jev-chooser.test.ts` |
| LJ20 | `plan` estima sem chave e sem rede, com o preço do ambiente ou da flag, e conta exatamente as consultas de uma execução | `jev-lab-real.test.ts` |
| LJ21 | `run` recusa antes de qualquer chamada, sem diário e sem repetir a chave, em cada caso da seção 3.3 | `jev-lab-real.test.ts` |
| LJ22 | `run` com um Jev falso: estimativa impressa antes da primeira chamada, pré-voo, relatório de um Jev real, custo por época no diário e custo total no resumo | `jev-lab-real.test.ts` |
| LJ23 | O teto para a execução ANTES de uma chamada que não caberia, nenhuma chamada recusada é gravada e a mesma pasta retoma sem consultar duas vezes (diário igual ao de uma execução única) | `jev-lab-real.test.ts` |
| LJ24 | Pré-voo que falha para com exit 3 sem gravar nada; três falhas seguidas depois do pré-voo param com exit 3; uso de tokens ausente deixa o custo desconhecido | `jev-lab-real.test.ts` |
| LJ25 | A chave nunca sai do ambiente: erros com a chave na mensagem e na causa, erro inesperado, filhos reais | `jev-lab-real.test.ts` |
| LJ26 | O script nomeia só as três variáveis de ambiente | `jev-lab-real.test.ts` |
| LJ27 | Pureza estática: o SDK só é importado em `src/lab-jev`; nenhum módulo de `src/lab` nem `scripts/jev-lab.ts` importa `src/lab-jev`; só `scripts/jev-lab-real.ts` lê o ambiente; imports permitidos por módulo | `purity.test.ts` |
| LJ28 | Nenhuma palavra de execução, assinatura ou ordem no código (fora da frase de sombra); varredura de bytes de ponto mediano, travessão, meia-risca e marcadores | `purity.test.ts` |
| LJ29 | O documento define LJ1 a LJ29, cada um com um teste de título `LJn`; as constantes do código estão no documento; o mapa de módulos só lista exportações reais | `purity.test.ts` |

## 3. Como rodar

### 3.1 O arquivo de ambiente

Crie `data/jev.env` (a pasta `data/` é ignorada pelo git) com **somente** estas três variáveis:

```
TYPESAFE_AI_API_KEY=<a sua chave>
JEV_MODEL_ID=jev-latest
JEV_USD_PER_MTOK=<preço em USD por milhão de tokens de entrada>
```

`JEV_MODEL_ID` é opcional (padrão `jev-latest`). `JEV_USD_PER_MTOK` é o preço que o provedor cobra por milhão de tokens de entrada; o laboratório não o descobre, quem informa é o dono, e sem ele o teto em dólares não pode ser aplicado. Os comandos usam `--no-env-file --env-file=data/jev.env`: o `.env` automático nunca é lido.

### 3.2 Plano (sem rede, sem chave)

```
bun --no-env-file run scripts/jev-lab-real.ts plan --capture <captura.jsonl> --usd-per-mtok 2.5
```

Lê a captura, roda o mesmo pipeline do laboratório com o `PlanChooser` no lugar do Jev e imprime, em JSON no stdout e em português no stderr: as épocas, as consultas (uma por época com candidatos), os candidatos por consulta, os tokens de entrada por consulta (típico: caracteres sobre 4; conservador: caracteres sobre 3 mais 500) e o custo estimado, típico e conservador, com o preço da flag `--usd-per-mtok` ou de `JEV_USD_PER_MTOK`. Sem preço o custo fica `null` e o resumo diz que o preço é desconhecido. O plano aceita `--seed`, `--step-ms`, `--horizon-ms`, `--bar-ms` e `--frozen-at-ms` como a CLI do laboratório e não aceita `--out`, `--max-usd`, `--max-calls`, `--timeout-ms` nem `--allow-paid-inference`: não grava nada e não consulta nada.

### 3.3 Execução (consultas pagas)

```
bun --no-env-file --env-file=data/jev.env run scripts/jev-lab-real.ts run --capture <captura.jsonl> --out <pasta> --max-usd 1 --max-calls 450 --allow-paid-inference
```

Flags: `--capture`, `--out`, `--max-usd`, `--max-calls`, `--allow-paid-inference`, `--timeout-ms` (padrão 20000 ms, de 1000 a 120000) e as do laboratório (`--seed`, `--step-ms`, `--horizon-ms`, `--bar-ms`, `--frozen-at-ms`). Só roda sobre uma captura: `--synthetic`, `--epochs` e `--planted-edge` são recusados, porque a pontuação plantada da fonte sintética entregaria a resposta ao Jev.

**Recusas (exit 2, stdout vazio, nenhuma chamada, nenhum diário):** sem `--allow-paid-inference`; sem `--max-usd` ou sem `--max-calls`; `--max-usd` acima de 5 USD (máximo duro por execução) ou `--max-calls` acima de 2000 (máximo duro); `--max-calls` abaixo de 2 (o pré-voo usa uma chamada); `--max-usd` que não cobre o pré-voo e uma consulta; números em notação científica, com vírgula ou negativos; falta de `TYPESAFE_AI_API_KEY` (ou chave vazia, curta demais ou com espaço); falta de `JEV_USD_PER_MTOK` ou preço inválido; `JEV_MODEL_ID` inválido ou que contenha a chave; janela sem nenhuma consulta; estados fora do vocabulário do Jev; captura ausente ou mal formada. Nenhuma recusa repete o valor de uma variável de ambiente.

**Ordem do que acontece:** (1) valida as flags e o ambiente; (2) roda o plano offline; (3) imprime no stderr o modelo (com a versão da instrução), o plano, o custo estimado e os tetos, e avisa se os tetos não cobrem a janela inteira; (4) faz **uma consulta de pré-voo** com o estado da primeira época: se falhar ou não devolver uma resposta válida, para com exit 3 e **nada é gravado** (uma chave errada não envenena o diário); (5) roda a CLI do laboratório com o Jev real injetado e uma parada que olha o teto antes de cada época; (6) imprime o relatório (stdout) e o resumo (stderr) com o custo total do Jev real, o orçamento usado e a alavancagem que a medida justifica.

**Códigos de saída.** 0: execução completa, ou parada pelo teto (as épocas restantes ficam pendentes e a mesma pasta continua dali). 2: uso incorreto ou recusa. 3: qualquer parada por erro: pré-voo que falhou, o Jev parou de responder (três falhas seguidas, caso em que o relatório parcial ainda sai no stdout), parada de integridade do diário, tentativa de ler o futuro ou erro inesperado (reportado só pelo nome da classe).

### 3.4 Parar e retomar

O teto vale **antes** de cada chamada: o seletor estima o tamanho da próxima consulta de forma conservadora, soma o que já gastou e o que está em voo, e a execução para antes de uma chamada que não caberia. Por isso nenhuma consulta recusada vira uma decisão gravada, e o diário fica com épocas completas e épocas pendentes, nunca com um rabo de `hold` que não foi decisão do Jev. Repetir o comando na mesma pasta, com tetos maiores, continua dali e não consulta duas vezes (o diário de uma execução interrompida e retomada é o mesmo, byte a byte, que o de uma execução única). O pré-voo roda sempre, também em uma janela já completa: nela é a única chamada que se paga. O manifesto guarda o modelo, a versão da instrução, o preço e o prazo: mudar qualquer um deles na mesma pasta é outra execução e para com exit 3. Três falhas seguidas (exceção, prazo, resposta inválida) abrem o disjuntor: as três épocas ficam gravadas como falha (`error`, `timeout`, `invalid-choice` ou `malformed`), a execução para com exit 3 e, depois de consertar a causa, repetir o comando continua a partir da época seguinte.

### 3.5 Ler o resultado

`bun --no-env-file run scripts/jev-lab.ts report --journal <pasta>` reconstrói o relatório só do diário, com as mesmas linhas de custo e de alavancagem. A leitura do relatório é a da seção 9 do laboratório.

## 4. Custo esperado

`custo = consultas x tokens de entrada por consulta x preço / 1.000.000`. As consultas são uma por época com candidatos; os tokens dependem do número de candidatos (cerca de 1,4 mil a 1,5 mil tokens típicos por consulta com 8 candidatos, e 2,5 mil conservadores). Exemplo medido pelo plano, em uma captura sintética exportada pelo próprio laboratório (30 dias, passo de 6 h, 119 consultas com 8 candidatos; 175.089 tokens típicos e 292.935 conservadores no total):

| Preço (USD por milhão de tokens) | Custo típico | Custo conservador |
| --- | --- | --- |
| 1 | 0,1751 | 0,2929 |
| 2,5 | 0,4377 | 0,7323 |
| 5 | 0,8754 | 1,4647 |
| 10 | 1,7509 | 2,9294 |

Cem dias com passo de 6 h são 400 consultas (cerca de 3,4 vezes mais). O número do seu caso sai do `plan`, com o seu preço. O provedor embrulha a pergunta em um prompt próprio e pode contar mais tokens do que a estimativa típica; o teto usa a estimativa conservadora antes de cada chamada, o uso real que o provedor informa substitui a estimativa depois, e uma chamada sem uso válido é cobrada do teto pela estimativa e fica com custo desconhecido (`null`) no diário, nunca zero. O teto é aplicado antes da chamada: a única forma de passar dele é uma chamada cujo uso real supere em muito a estimativa conservadora, e o excesso seria contado antes da chamada seguinte.

## 5. O que é medido

O mesmo que o laboratório mede para qualquer política, com o Jev real no lugar do Mock: o que o Jev escolheria em cada época (um candidato ou `hold`), o resultado líquido de custos conservadores daquela escolha, a média líquida por época com Newey-West, a correção de Holm entre as políticas, a comparação contra as linhas de base (`hold`, `random`, `buy-and-hold`, `momentum-rule`, `carry-rule`), o Sharpe com a ressalva, o contrafactual de alavancagem de 1x a 10x e o portão de promoção. Específico do Jev real: a latência (p50, p95, p99) e a fração das consultas acima de 1500 ms, o custo de inferência (subtraído da série do Jev quando todo custo é conhecido), a calibração (Brier e tabela de confiabilidade; as probabilidades são pesos de decisão, não taxas de acerto) e quantas respostas falharam e como.

## 6. O que o resultado significa, e o que não significa

- Trinta dias são pouco. O portão exige 90 dias, 30 blocos de amostra efetiva e `t >= 2` depois de Holm e contra todas as linhas de base; a seção 7.6 do laboratório mostra que mesmo uma vantagem enorme só é sinalizada em cerca de 83% das sementes com 100 dias.
- Passado não é futuro. Uma janela é uma amostra; o `frozenAtMs` (flag `--frozen-at-ms`) registra quando a configuração foi congelada, mas o laboratório não consegue provar que ninguém olhou antes.
- A origem da captura não é verificável pelo laboratório: o critério `dados-reais` nunca é atendido por ele.
- Os custos são proxies conservadores, não fills conciliados; não há impacto de mercado, fila nem capacidade.
- Falha conta como `hold`: o que se mede é o Jev junto com a infraestrutura que o consulta, e a contagem de falhas aparece no relatório.
- O Jev real não é determinístico. O diário guarda a decisão; repetir a época não consulta de novo.
- Um resultado bom em uma janela curta é o que a seleção entre muitas políticas produz sozinha. Por isso `hold` é a resposta preferida sem evidência, no prompt e na leitura.

## 7. Privacidade: o que o Jev vê

Por consulta, o Jev recebe um estado e uma pergunta de escolha. O estado tem o horizonte em horas e, para cada candidato, um id opaco (`c1`, `c2`, ...), a modalidade e o lado (vocabulários fechados do laboratório), o horizonte em horas, os critérios conhecidos como números (arredondados para cinco algarismos significativos) em `values` e os nomes dos critérios desconhecidos em `unknown`:

```json
{
  "horizonHours": 24,
  "candidates": [
    {
      "id": "c4",
      "modality": "perp-directional",
      "side": "short",
      "horizonHours": 24,
      "values": { "basisBps": -1.4199, "costBps": 13.008, "fundingNextBps": 0.64179, "retLookbackBps": 41.99, "settlementsInHorizon": 3, "spreadBps": 1.0078, "volHorizonBps": 227.37 },
      "unknown": []
    }
  ]
}
```

O vocabulário de critérios tem treze nomes, todos números: `basisBps`, `carryGrossBps`, `carryNetBps`, `costBps`, `fundingLastBps`, `fundingMeanBps`, `fundingMinBps`, `fundingNextBps`, `oiChangeBps`, `retLookbackBps`, `settlementsInHorizon`, `spreadBps` e `volHorizonBps`.

**Desconhecido nunca vira zero.** Um critério sem valor (`null` no laboratório) não é enviado como zero nem como `null`: fica fora de `values` e seu nome vai em `unknown`, e a instrução diz que um critério em `unknown` é DESCONHECIDO, não é zero e não deve ser adivinhado. Um zero conhecido continua sendo um zero em `values`.

**O que nunca vai:** nome de instrumento, ativo ou venue, endereço, chave, instante de tempo, texto livre de qualquer fonte, a pontuação plantada da fonte sintética. Qualquer coisa fora do vocabulário (modalidade, lado, nome de critério, id, valor que não é número finito) faz o estado ser recusado antes da chamada (`JevStateError`, sem repetir o conteúdo). O texto fixo da pergunta e das instruções vem do nó `p-lab-chooser` do grafo; a única parte que varia por candidato é o id, o lado, a modalidade e o horizonte, todos de vocabulário fechado. Cada candidato é descrito como "posição hipotética" e a instrução diz que é uma avaliação de sombra em que nada é executado, assinado ou enviado, que manter (`hold`) é sempre válido e é a resposta preferida sem evidência, e que as probabilidades e a confiança não são calibradas.

**Versão da instrução.** O nome do seletor é o modelo mais a versão do texto (`jev-latest@p1`). Um teste fixa um hash do texto: mudar uma palavra sem subir a versão falha, e subir a versão faz o diário antigo parar com `mismatch` em vez de misturar duas instruções.

## 8. Riscos

- **Custo.** Os tetos e os máximos duros (5 USD e 2000 chamadas por execução) existem para limitar o dano de um erro de configuração; o preço é informado pelo dono e, se estiver errado, o teto em dólares também estará.
- **Chave.** Mora no ambiente do processo (arquivo `data/jev.env`, fora do git). O SDK a lê quando faz a chamada; o código do laboratório só verifica que existe. Erros do provedor podem carregar detalhes de requisição: o seletor os descarta e lança uma mensagem fixa, sem causa.
- **Falhas que parecem decisões.** Um `hold` gravado por falha não é decisão do Jev. O relatório conta os status; o pré-voo evita que uma chave errada gere um diário inteiro de falhas; o disjuntor limita a três épocas o que uma falha no meio da execução pode gravar.
- **Serviço real não verificado.** A integração foi verificada com o código do próprio SDK sobre um `fetch` falso, seguindo o esquema do SDK; a latência, os limites de taxa, os erros e o formato real do uso de tokens do serviço não foram observados (não houve chamada real).
- **`AbortSignal.timeout` no Bun.** Esse sinal não mantém o laço de eventos vivo; o seletor usa um controlador e um temporizador próprios e limpa o temporizador ao fim de cada chamada.
- **Prazo.** O prazo da política (padrão 20000 ms) é o que grava `timeout`; o aborto da conexão vem 2000 ms depois, só para liberá-la. Uma resposta que chegue entre os dois é cobrada do teto, mas a política já registrou o `timeout`.
- **Mudança de modelo ou de instrução no meio.** É outra execução (manifesto diferente), por desenho.
- **Estimativa de tokens.** É uma regra de bolso sobre o tamanho do texto; o uso real do provedor manda depois da chamada.

## 9. Da vantagem medida à alavancagem permitida

A alavancagem que o dono quer só pode vir de uma vantagem medida, e o laboratório traduz uma em outra por uma cadeia curta e explícita:

1. **A média líquida.** O laboratório mede a média líquida por época do Jev (em bps do capital comprometido, já líquida de custos conservadores e do custo de inferência quando conhecido), com o erro-padrão de Newey-West para horizontes sobrepostos.
2. **O portfólio de tranches.** Com passo menor que o horizonte, o Jev é implementável como `K` tranches de `1/K` do patrimônio. Disso saem `mu_dia` e `sigma_dia` (seção 7.5 do laboratório).
3. **O limite inferior de Kelly.** `kellyLowerBound = max(0, mu/sigma^2 - 2/(sigma * sqrt(dias)))` (`src/policy/envelope.ts`, R3 seção 4.7). Ele é positivo se, e somente se, `t = mu * sqrt(dias) / sigma` passa de 2. Sem vantagem estatisticamente distinta de zero, ele é zero.
4. **O teto da fase 2.** `leverageCap = min(2, 0,25 * kellyLowerBound)`, arredondado para baixo a 0,0001 (`deriveLimits`, fase-2): no máximo um quarto do limite inferior de Kelly e nunca mais que 2x. Com o limite inferior em zero, o teto é 0x; sem dados (`null`), é indefinido e o resumo mostra 0x.
5. **O portão.** O critério `kelly-alavancagem` passa quando o limite inferior é positivo; os outros doze critérios (dados reais, 90 dias, amostra efetiva, resultados completos, custo conhecido, `t >= 2`, intervalo acima de zero, Holm, linhas de base, janela fora da amostra, fills reais, autorização e assinante) dizem se a medida merece ser levada a sério. O portão **só recomenda a fase-0** e nunca concede nada.
6. **O número no resumo.** Toda execução, do Mock ou do Jev real, termina o resumo com "Alavancagem que a vantagem medida do Jev justifica: Nx", seguida dos critérios que faltam e da frase de que isto é diagnóstico e não concede nada. O número é o teto da fase 2 pela fórmula; ele é zero quando o limite inferior de Kelly não é positivo, quando faltam dados e **sempre** que a medida vem do Mock ou de dados sintéticos (a fórmula bruta aparece entre parênteses, para quem quiser ver a máquina funcionar).

Exemplos com `sigma_dia = 1,2%`: uma média de 0,4% ao dia em 100 dias dá `t = 3,33`, limite inferior de Kelly 11,11 e teto de 2x; 0,3% ao dia em 100 dias dá `t = 2,5`, limite inferior 4,17 e teto de 1,04x; 0,2% ao dia em 100 dias dá `t = 1,67` e teto 0x; 0,3% ao dia em 30 dias dá `t = 1,37` e teto 0x (a mesma vantagem diária precisa de mais dias); 0,3% ao dia em 400 dias dá `t = 5` e teto de 2x.

**Hoje a alavancagem permitida é zero.** A fase é a fase-0 (`leverageCeiling` 0), nada no laboratório muda a fase e o número acima é uma pergunta ("o que a medida justificaria?"), não uma autorização. Ela só pode subir com **evidência fora da amostra**: uma janela posterior ao congelamento da configuração, em dados reais de origem verificada, com `t >= 2` depois de Holm e contra todas as linhas de base, pelo menos 90 dias e 30 blocos de amostra efetiva, custo de inferência conhecido, e depois, fora do laboratório, fills reais conciliados. O System One recebe esse limite inferior à mão (`--kelly`) apenas para mostrar o que a fase 2 abriria; o laboratório não o alimenta sozinho.

**Isto é diagnóstico.** Levantar o gate de execução real exige as quatro condições da decisão D11, nenhuma delas cumprida por este trabalho: (a) o registro de autorização do dono com limites, (b) o checklist `qualify:live` completo, (c) a revisão independente do código final e (d) um commit separado que levante o gate. O assistente nunca preenche o registro, fornece chaves nem executa uma sessão real.

## 10. Verificação

```
bun --no-env-file test --parallel=1 --timeout 15000 ./src ./scripts
bun --no-env-file run typecheck
bun --no-env-file run scripts/jev-lab-real.ts plan --capture <captura sintética exportada pelo laboratório>
bun --no-env-file run scripts/jev-lab.ts run --synthetic --epochs 400 --seed 7 --out <pasta temporária>
bun --no-env-file run scripts/jev-lab.ts report --journal <pasta temporária>/journal.jsonl
```

Nenhum teste chama o Jev real, lê um `.env` ou usa a rede: a função de avaliação é uma função falsa, e o caminho do SDK roda sobre um `fetch` falso. A chave nos testes é um texto canário que não pode aparecer em nenhuma saída, arquivo ou erro.

## 11. Mapa dos módulos

| Arquivo | Conteúdo |
| --- | --- |
| `src/lab-jev/jev-chooser.ts` | `JevLabChooser`, `buildJevLabPayload`, `estimateInputTokens`, `JevStateError`, `JevBudgetExhaustedError`, `JevCircuitOpenError`, `JevCallError`, `JEV_LAB_CRITERIA`, `JEV_LAB_PROMPT_VERSION`, `JEV_LAB_QUESTION_ID` |
| `src/lab-jev/plan-chooser.ts` | `PlanChooser` |
| `scripts/jev-lab-real.ts` | `main`, `HARD_MAX_USD`, `HARD_MAX_CALLS`, `DEFAULT_TIMEOUT_MS`, `ABORT_MARGIN_MS` |
| `scripts/jev-lab.ts` | `main`, `parse`, `prepareRun`, `UsageError`, `leverageAllowanceLines`, `inferenceLines` |

## 12. Limites e premissas conhecidas

1. O serviço real nunca foi chamado neste trabalho: latência, limites de taxa, erros, arredondamento e o formato do uso de tokens do serviço são premissas tiradas do código do SDK.
2. O teto em dólares conta só tokens de entrada, pelo preço informado; tokens de saída e qualquer outra cobrança do provedor ficam fora (o laboratório, de resto, só conhece o preço de entrada).
3. A estimativa de tokens é uma regra de bolso (conservadora para o teto, típica para o plano).
4. O vocabulário de critérios é o do laboratório (`JEV_LAB_CRITERIA`); um critério novo no laboratório faz o estado ser recusado até que a lista seja atualizada, e um teste avisa antes. Uma consulta aceita no máximo 254 candidatos (a pergunta de escolha do provedor tem no máximo 255 opções, contando o `hold`); acima disso o estado é recusado.
5. O status `budget-exhausted` existe no seletor (`JevBudgetExhaustedError.status`), mas o vocabulário de status do diário continua o do laboratório (`ok`, `invalid-choice`, `malformed`, `timeout`, `error`): uma consulta recusada pelo teto seria gravada como `error`. A execução para antes que isso aconteça.
6. Falhas isoladas ficam gravadas como `hold` com status e não são refeitas ao retomar (o diário é de anexar). O disjuntor limita o caso sistemático a três épocas.
7. Valem as premissas do laboratório (capturas não verificadas, custos proxies, preço sintético sem saltos nos testes, modelo simplificado de liquidação, sem impacto de mercado).

## 13. Fontes

- [Jev Decision Lab](JEV-LABORATORIO-DE-DECISAO.md): o contrato `LabChooser`, o diário, o relatório e o portão.
- [Arquitetura da central de operações](ARQUITETURA-CENTRAL-DE-OPERACOES.md): D1 (Jev como seletor tipado), D4 (alavancagem é botão de risco), D11 (governança).
- [Política de limites](POLITICA-DE-LIMITES.md) e `src/policy/envelope.ts`: `kellyLowerBound`, `deriveLimits`, as três fases.
- [System One](SYSTEM-ONE.md): onde o teto da fase 2 seria consumido, em dry run.
- O padrão da chamada ao Jev: `src/operator/jev-selector.ts`, `src/system-one/decide.ts`, `src/jev-read/decide.ts` e `src/model.ts`; o código do SDK em `node_modules/@ai-sdk/typesafe-ai`.

Nada neste documento prova lucro e nada neste documento concede permissão.
