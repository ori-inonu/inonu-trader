# System One: a camada rapida de decisao de alavancagem do Jev

System One e o laco curto que poe o Jev no centro das decisoes de alavancagem: le o mercado, le a carteira, aplica o envelope de risco da fase e pergunta ao Jev qual candidato de alavancagem abrir, ou se deve manter. Ele nunca assina nem envia. A execucao continua atras dos gates do operador (src/operator) e da autorizacao do dono (docs/LIVE-QUALIFICATION.md). A pesquisa que fundamenta o desenho esta em docs/research/R9-system-one-alavancagem-onchainos.md; a aritmetica de risco vem de docs/research/R3-estrategias-e-alavancagem.md secao 6 e esta implementada em src/policy/envelope.ts.

## O que ele faz em um ciclo

1. Leitura do mercado (src/system-one/readings.ts): mark price, taxa de funding e velas do perpetuo na API publica da OKX v5, sem credenciais, pelo cliente de src/onchainos/public-okx.ts. A volatilidade diaria realizada vem dos retornos logaritmicos das velas (src/system-one/volatility.ts); poucos retornos ou um fechamento invalido resultam em "desconhecido", nunca em zero.
2. Leitura da carteira: capital operacional, valor conhecido, posicao aberta e lado. Em uma execucao `--public` o capital e configurado (SYSTEM_ONE_CAPITAL_USD ou `--capital`) e a leitura diz isso em `source`; nao e um saldo.
3. Envelope (src/policy/envelope.ts): teto e cap de alavancagem da fase, piso de distancia de liquidacao, cap por ordem e de exposicao, stops. Fase 0 so observa; fase 1 permite posicao spot 1x; fase 2 permite ate 2x e no maximo 0,25 do limite inferior de Kelly, que vem do laboratorio (`--kelly`).
4. Brief (src/system-one/brief.ts): oito candidatos, comprado e vendido em 1x, 2x, 3x e 5x, cada um com margem limitada pelo cap por ordem, distancia de liquidacao, probabilidade de tocar a liquidacao no horizonte sem deriva, mediana sem vantagem (arrasto de volatilidade) e carry de funding do ponto de vista do lado. Um candidato so e elegivel quando passa em todas as regras do envelope, a sigma e conhecida, o inventario esta completo e ele nao inverte uma posicao aberta.
5. Escolha do Jev (src/system-one/decide.ts): o Jev real (`--jev`, provedor TypeSafe AI, uma pergunta de escolha por ciclo) ve um estado sem endereco, sem origem e sem timestamps, e responde uma chave que ja existe entre `hold` e os elegiveis. Qualquer outra resposta vira `hold` com status `invalid-choice` ou `malformed`. O mock (`sem --jev`) e deterministico e se anuncia como mock.
6. Registro (src/system-one/cycle.ts): o ciclo inteiro vai para data/system-one/latest.json e para o jornal data/system-one/cycles.jsonl. `execution.status` e sempre `dry_run` ou `blocked`, com os motivos.

## Como rodar

```bash
bun run system-one
```

Sem flags e um demo sintetico com o mock. `--public` le MON-USDT-SWAP na API publica da OKX; `--jev` pergunta ao Jev real; `--phase fase-2 --kelly 12` abre o cap de 2x; `--capital`, `--inst`, `--bar`, `--candles`, `--horizon` e `--loop` ajustam o resto. O backend serve o ultimo ciclo em `GET /system-one` e o dashboard mostra a faixa "Alavancagem decidida pelo Jev" logo abaixo da central: escolha, mark, funding, sigma, teto e cap, margem por ordem, execucao, e a escada de alavancagem com os candidatos elegiveis, os rejeitados e o escolhido pelo Jev.

## O que ele nao faz

- Nao executa. Nao ha caminho de assinatura em src/system-one; a unica execucao do projeto e a do operador, com dry run, kill switch, ledger e gates.
- Nao decide por codigo. O mock existe para o demo e se anuncia; a decisao que conta e a do Jev.
- Nao inventa dados. Sigma desconhecida, funding desconhecido ou inventario incompleto deixam todos os candidatos inelegiveis e o Jev nao e consultado.
- Nao sobe acima do envelope. O cap e o teto sao paredes: candidatos acima deles existem no brief so para leitura e nunca sao elegiveis.

## Proximos passos (R9, fases A a E)

Sombra com mock e jornal; Jev real com medicao de latencia e custo; janela congelada de 90 dias no laboratorio (src/lab) para medir vantagem; spot 1x so com os quatro itens da decisao D11; alavancagem 2x so com leitor de fator de saude e executor revisado. A pesquisa nao recomenda iniciar a ultima fase hoje.
