# C1: o gravador funcionando ao vivo (sem chamar o modelo)

Data: 2026-10-13. Origem do dado: OKX publico real (REST e WebSocket), nenhuma chave usada, nenhuma chamada ao modelo.

## O que foi executado

`bun --no-env-file run src/desktop/main.ts --no-browser --port 47399 --idle-ms 0` com `INONU_HOME` apontando para uma pasta
temporaria (`%TEMP%\inonu-live-check`), para nao tocar nos dados reais do usuario. O nucleo seguiu 4 instrumentos
(ETH-USDT, ETH-USDT-SWAP, BTC-USDT, BTC-USDT-SWAP) e o gravador ficou ligado.

Antes de qualquer coisa, `GET /inonu/status` mostrou `modelConfigured: true` e `today.calls: 0`. Nenhum clique em
"Pedir ao Inonu" foi feito: o contador do dia permaneceu em zero.

## O que se observou

| Fato | Valor observado |
|---|---|
| Primeira passada | 4 fotos (uma por instrumento), 10.312 bytes no total |
| Tamanho de uma foto | cerca de 2,6 KB (72 atributos), bem abaixo do teto de 1 MB por hora |
| `skipped` do gravador | vazio: nenhuma leitura falhou |
| `writeErrors` | 0 |
| Atributos nulos por foto | 19 a 23 de 72, cada um com motivo (`aquecimento`, `sem_zona`, e para BTC o beta contra ele mesmo) |
| Custo de ida e volta gravado | 22,0 bps no spot, 12,0 bps no perpetuo (taxas, folga e spread cotado) |
| Primeiros rotulos (15 min) | 4 completos, 20 minutos depois da primeira foto |

Conferencia aritmetica de um rotulo gravado (ETH-USDT, horizonte de 15 min): bruto +2,65 bps, custo 22,04 bps, liquido de compra
-19,39 bps (2,65 menos 22,04) e liquido de venda -24,69 bps (menos 2,65 menos 22,04). O custo come o movimento de 15 minutos: e
exatamente isso que o Veredito vai dizer a uma pessoa leiga quando o custo for maior que o movimento tipico.

## Depois de 68 minutos

Ao fim da corrida (14:17 a 15:25, mesma pasta temporaria): 56 fotos (14 passadas de 4 instrumentos), 44 rotulos completos
(40 de 15 minutos e 4 de 1 hora, os da primeira passada), 155.934 bytes no total (cerca de 2,8 KB por foto),
`skipped` vazio, `corruptLines` 0, `writeErrors` 0, `GET /inonu/status` com `today.calls: 0` e `modelConfigured: true` do comeco ao fim.

Conta de uma hora: 12 passadas por hora e 4 instrumentos geram 48 fotos, uns 135 KB por hora ou 3,2 MB por dia.
O primeiro rotulo de 1 hora so apareceu 65 minutos depois da primeira foto (uma hora de horizonte mais o alinhamento ao candle de 5 minutos),
como o desenho diz.

## O que isto prova e o que nao prova

- Prova: o gravador liga com o feed, escreve uma foto por instrumento a cada 5 minutos alinhado ao relogio, rotula depois do
  horizonte, usa o relogio da corretora, e nao toca no modelo.
- Nao prova nada sobre lucro, acerto ou calibracao: ha minutos de dado, nao dias. O Placar continua em `nao_medido`
  ("Placar: 0 de 30 respostas medidas. Sem numero ate la.") e e assim que deve ficar.
