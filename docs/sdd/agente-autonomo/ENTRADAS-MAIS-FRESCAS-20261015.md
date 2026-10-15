# Entradas mais frescas, dimensionadas sob a cota de dados (2026-10-15)

Origem: segundo caminho do consenso real do Jev de hoje (recibo sha256 56ee02af06c6ff131a1a4586fd824937bab09c04e330d0d27cc70525bbc413b4, nota 177S) e pedido do dono de decisoes mais rapidas e inteligentes. E um PLANO e uma medicao de leitura; nenhum codigo do caminho vivo muda, nada e ligado, carregado ou reiniciado.

## 1. O problema, com os numeros que ja temos

- Os candidatos que o Jev ve vem de um scan reutilizado por 30 minutos em tempo normal, 5 minutos enquanto o gancho `hot` esta ativo e ate 2 horas se os scans falham (`src/agent/live.ts`, ver `COBERTURA-UNIVERSO-20261015.md`).
- Em 120 olhares seguidos (`scripts/look-staleness.ts`) os candidatos foram os mesmos (similaridade 1,0) e o Jev mudou de resposta em 3 de 693 pares (0,4%). A maior parte dos campos do Brief muda em menos de 25% dos pares; so o campo de momento muda em 44%.
- Logo, dado mais fresco so ajuda se for dado que PODE mudar a decisao, e custa cota.

## 2. Folga medida (contador real do mes)

Fonte: `usage-2026-10.json` da pasta de dados da maquina (contador do gateway, leitura; faixa gratuita de 100 mil chamadas Basic e 100 mil Premium por mes citada pela Codex na nota 187).

| Dia (UTC) | Basic | Premium |
| --- | --- | --- |
| 13 | 48 | 59 |
| 14 | 1743 | 1377 |
| 15 (17,6 h decorridas) | 2531 | 697 |

- Projecao do dia 15 pelo ritmo ate agora: Basic cerca de 3458, Premium cerca de 952.
- Folga sustentavel para o resto de outubro (cap de 100 mil menos o usado e o projetado de hoje, dividido pelos 16 dias que restam): Basic cerca de 5922 por dia, ou seja, cerca de 2464 chamadas a mais por dia que o ritmo de hoje; Premium sobra muito.
- ALERTA, fora do pedido: em um mes de 31 dias, o ritmo de HOJE (3458 por dia) soma cerca de 107 mil chamadas Basic, 7% acima do cap de 100 mil. Outubro so cabe porque o contador comecou no dia 13. A guarda `hotWithinQuota` (`autopilot.ts`) freia o ritmo quente quando o uso do dia passa do consumo justo, entao ela deve segurar isso, mas a conta de um mes cheio precisa ser vigiada.

## 3. Desenho proposto (para a qualificacao, nada no caminho vivo agora)

Atualizacao DIRECIONADA e ORCADA, nao uma varredura mais frequente:

1. So para o que pode mudar a escolha: as posicoes abertas (a vigia de 45 s ja le o preco do que a carteira mantem) e ate K candidatos, os que o Jev preferiu mais nos ultimos olhares ou que tiveram um evento material. K e o orcamento diario sao parametros de teste, nao calibrados aqui.
2. Orcamento em chamadas por dia, derivado da folga acima e do `hotWithinQuota`: as leituras extras nunca passam do que a guarda ja permite, e nunca sobem o teto de 720 consultas ao Jev por dia nem o numero de olhares do modelo.
3. Cada leitura carrega sua propria idade (instante de leitura e se veio de cache), e o cache nao rejuvenesce o fato: a idade registrada e a que vale.
4. Um evento so conta como consumido quando o fato entrou no Brief realmente consultado (contrato de consumo da E3, que e da Codex em `src/decision-review/**`).
5. Fonte paga ou de terceiros em producao (por exemplo o GeckoTerminal publico, usado hoje so para MEDIR) e decisao do dono e fica fora deste plano.

## 4. Experimento de leitura que decide se vale a pena (ainda NAO feito)

Com as velas de minuto que `scripts/skip-backfill.ts` ja sabe baixar (so enderecos publicos de tokens), medir para cada olhar a diferenca entre o preco do mercado no instante do olhar e o preco da ultima leitura que o Brief carregava (fora do contador do agente, em amostra pequena). Se a defasagem tipica for menor que o atrito de entrada (cerca de 2% assumido), dado mais fresco nao muda a decisao e o plano acaba aqui; se for maior em uma fracao relevante dos olhares, o orcamento da secao 3 se justifica. O resultado entra como nota, com limites declarados.

## 5. O que este plano NAO faz

Nao liga o pulso nem o intervalo quente; nao eleva consultas por dia; nao muda `model.ts`, `cycle.ts` ou `wire.ts`; nao usa credencial; nao promete lucro. Estado: plano e medicao de uso por leitura; nada carregado, nada ao vivo, sem ganho medido.
