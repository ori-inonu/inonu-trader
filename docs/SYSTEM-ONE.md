# System One: a camada rapida de decisao de alavancagem do Jev

System One e o laco curto que poe o Jev no centro das decisoes de alavancagem: le o mercado, le a carteira, aplica o envelope de risco da fase e pergunta ao Jev qual candidato de alavancagem abrir, ou se deve manter. Ele nunca assina nem envia. A execucao continua atras dos gates do operador (src/operator) e da autorizacao do dono (docs/LIVE-QUALIFICATION.md). A pesquisa que fundamenta o desenho esta em docs/research/R9-system-one-alavancagem-onchainos.md; a aritmetica de risco vem de docs/research/R3-estrategias-e-alavancagem.md secao 6 e esta implementada em src/policy/envelope.ts.

## O que ele faz em um ciclo

1. Leitura do mercado (src/system-one/readings.ts): mark price, taxa de funding e velas do perpetuo na API publica da OKX v5, sem credenciais, pelo cliente de src/onchainos/public-okx.ts. A volatilidade diaria realizada vem dos retornos logaritmicos das velas (src/system-one/volatility.ts); poucos retornos ou um fechamento invalido resultam em "desconhecido", nunca em zero.
2. Leitura da carteira: capital operacional, valor conhecido, posicao aberta e lado. Em uma execucao `--public` o capital e configurado (SYSTEM_ONE_CAPITAL_USD ou `--capital`); nao e um saldo. Esse inventario permanece incompleto e bloqueia escolhas ate existir um leitor de carteira qualificado.
3. Envelope (src/policy/envelope.ts): teto e cap de alavancagem da fase, piso de distancia de liquidacao, cap por ordem e de exposicao, stops. Fase 0 so observa; fase 1 permite apenas spot e rejeita todos os candidatos perpetuos deste modulo, inclusive 1x. Fase 2 permite ate 2x e no maximo 0,25 do limite inferior de Kelly, que vem do laboratorio (`--kelly`).
4. Brief (src/system-one/brief.ts): oito candidatos, comprado e vendido em 1x, 2x, 3x e 5x, cada um com margem limitada pelo cap por ordem, distancia de liquidacao, probabilidade de tocar a liquidacao no horizonte sem deriva, mediana sem vantagem (arrasto de volatilidade) e carry de funding do ponto de vista do lado. Um candidato so e elegivel quando passa em todas as regras do envelope, a sigma e conhecida, o inventario esta completo e ele nao inverte uma posicao aberta.
5. Escolha do Jev (src/system-one/decide.ts): o Jev real (`--jev`, provedor TypeSafe AI, uma pergunta de escolha por ciclo) ve um estado sem endereco, sem origem e sem timestamps, e responde uma chave que ja existe entre `hold` e os elegiveis. Qualquer outra resposta vira `hold` com status `invalid-choice` ou `malformed`. O mock (`sem --jev`) e deterministico e se anuncia como mock.
6. Registro (src/system-one/cycle.ts): o ciclo inteiro vai para data/system-one/latest.json e para o jornal data/system-one/cycles.jsonl. `execution.status` e sempre `dry_run` ou `blocked`, com os motivos.

## Como rodar

```bash
bun run system-one
```

Sem flags e um demo sintetico com o mock. `--public` le MON-USDT-SWAP na API publica da OKX; `--jev` pergunta ao Jev real; `--phase fase-2 --kelly 12` abre o cap de 2x; `--capital`, `--inst`, `--bar`, `--candles`, `--horizon` e `--loop` ajustam o resto. O backend serve o ultimo ciclo em `GET /system-one` e o dashboard mostra a faixa "Alavancagem decidida pelo Jev" logo abaixo da central: escolha, mark, funding, sigma, teto e cap, margem por ordem, execucao, e a escada de alavancagem com os candidatos elegiveis, os rejeitados e o escolhido pelo Jev.

## Contratos de leitura e publicacao

Somente velas confirmadas, consecutivas e recentes contribuem para a volatilidade. Mark, funding e inventario precisam de timestamps validos dentro de 120 segundos, um limite conservador local. Funding sem intervalo conhecido tambem bloqueia. A [documentacao OKX v5](https://www.okx.com/docs-v5/en/) define o timestamp da vela como abertura e `confirm=1` como encerrada.

Cada chamada ao modelo tem prazo local de 10 segundos e recebe copias do envelope. A validacao usa o envelope independente; erro, cancelamento ou prazo excedido bloqueiam. Pesos de decisao nao representam probabilidades calibradas de lucro, e carry de funding nao e retorno liquido previsto.

O loop aguarda o ciclo terminar antes de contar o proximo intervalo. `latest.json` e substituido por rename de um arquivo temporario no mesmo diretorio; o jornal e separado, sem promessa de transacao atomica entre ambos. O comando `bun run system-one` nao carrega `.env` automaticamente: configuracao externa deve ser explicitamente fornecida ao processo.

`GET /system-one` publica somente campos permitidos, limita a leitura a 2 MB e rejeita schemas desconhecidos. Reutiliza `OPERATOR_DASHBOARD_ORIGINS` e o token opcional `OPERATOR_READ_TOKEN`. As origens padrao sao `http://localhost:3001` e `http://127.0.0.1:3001`; origem ausente ou diferente e rejeitada. CORS e uma restricao do navegador, nao autenticacao de rede. O dashboard nao armazena tokens: se habilitado, o token deve ser inserido por um proxy local autenticado; sem ele, a leitura retorna 401. Nao publicar esse backend diretamente na Internet.

## Limites operacionais

- Nao executa. Nao ha caminho de assinatura em src/system-one; a unica execucao do projeto e a do operador, com dry run, kill switch, ledger e gates.
- Nao decide por codigo. O mock existe para o demo e se anuncia; a decisao que conta e a do Jev.
- Nao inventa dados. Sigma desconhecida, funding desconhecido ou inventario incompleto deixam todos os candidatos inelegiveis e o Jev nao e consultado.
- Nao sobe acima do envelope. O cap e o teto sao paredes: candidatos acima deles existem no brief so para leitura e nunca sao elegiveis.

## Anexo quantitativo (`--quant`)

`bun run system-one --public --quant` anexa ao brief a evidencia numerica de `src/quant` (SPEC em docs/sdd/dados-quant/SPEC.md, medicao em docs/sdd/dados-quant/REPORT.md). Fica desligado por padrao e, sem a opcao, o ciclo, o jornal e o texto enviado ao Jev sao identicos aos de antes. Com a opcao, o envelope continua lendo as mesmas velas de antes (96 por padrao, ou `--candles`) e produz os mesmos numeros: o anexo faz leituras publicas proprias e mantem em memoria um historico de `--quant-days` dias (7 por padrao, de 1 a 30, no maximo 3000 barras), paginando o historico da OKX so na primeira leitura e depois de um buraco. Uma falha do anexo (leitura, orcamento de calculo) vira aviso e o ciclo segue sem ele; uma simulacao acima do orcamento cai para a forma fechada e o motivo fica registrado.

O Jev passa a ver, alem do `touchProbability` do envelope, um bloco `quant` com a nota dos dados (A limpo, B marcas, C velas perdidas; ausente quando velhos ou poucos), a faixa de sigma diaria (estimadores de faixa, EWMA e MAD), a forma da cauda e, por candidato elegivel, `sideAwareTouch` (forma fechada com a barreira em log-preco do lado), `simulatedTouch` (simulacao com cauda pesada e agrupamento de volatilidade) e seu erro padrao, alem do numero de caminhos simulados. O texto de instrucoes diz que um simulado de zero e menos de 1 acerto nos caminhos, que valores baixos sao piso (a simulacao subestimou a cauda em 90 dias de dados reais) e que a calibracao cobriu barreiras de 1 a 4 sigmas do horizonte. O anexo descreve o risco; nao muda elegibilidade, envelope nem escolha, e nunca carrega ordem, compra, venda ou recomendacao (testes fixam as chaves exatas e o texto).

`GET /system-one` publica o bloco por lista de permissao (nota, faixa de sigma, forma da cauda, caminhos simulados e as tres probabilidades por candidato; agrupamento, semente e detalhes de qualidade ficam privados) e o painel do console mostra a tabela "Risco medido de liquidacao" com as colunas Envelope, Por lado e Simulado.

Dois fatos medidos que o leitor deve conhecer: o `touchProbability` do envelope usa a distancia linear 1/L para os dois lados (para um vendido a barreira em log-preco e mais proxima, para um comprado e mais distante), e as probabilidades gaussianas subestimam a cauda de cripto. As probabilidades do anexo continuam sendo pesos de decisao sob um modelo declarado, sem deriva, e a calibracao da cauda profunda ainda e otimista (veja o REPORT).

## Proximos passos (R9, fases A a E)

Sombra com mock e jornal; Jev real com medicao de latencia e custo; janela congelada de 90 dias no laboratorio (src/lab) para medir vantagem; spot 1x so com os quatro itens da decisao D11; alavancagem 2x so com leitor de fator de saude e executor revisado. A pesquisa nao recomenda iniciar a ultima fase hoje.
