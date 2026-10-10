# Derivativos perpétuos da OKX: avaliador offline

Este avaliador compara duas modalidades de perpétuos lineares da OKX por **retorno líquido conservador, custos, margem e risco de liquidação**: o carry de funding (comprado no spot e vendido no perpétuo) e um perpétuo direcional alavancado, este último **somente como risco**. É somente leitura e determinístico: não envia ordens, não assina, não guarda chaves, não usa credenciais, não faz chamadas de rede e não lê `.env`. Alavancagem não cria vantagem econômica, e o relatório mostra o risco de liquidação com o mesmo destaque do retorno. Um veredito `eligible` não é autorização financeira nem qualificação da estratégia: significa só que a entrada passou neste filtro aritmético. Contrato completo em [`OKX-DERIVATIVES-SPEC.md`](../OKX-DERIVATIVES-SPEC.md).

## Executar

```powershell
bun --no-env-file run scripts/okx-derivatives.ts
bun --no-env-file run scripts/okx-derivatives.ts --help
```

Sem argumentos, imprime o relatório JSON de uma fixture **inteiramente sintética** com relógio fixo (`source: "synthetic"`, `externalAccessObserved: false`, `liveQualified: false`, `financiallyAuthorized: false`). Dois comandos seguidos dão a mesma saída. Depois que o integrador adicionar o script de pacote, o comando recomendado é `bun --no-env-file run okx:derivatives`, com o mesmo efeito.

Para avaliar um arquivo local (até 1 MiB, UTF-8 e JSON estritos, mesma forma da fixture):

```powershell
bun --no-env-file run scripts/okx-derivatives.ts --snapshot .\snapshot.json --now-ms 1800003600000
```

Sem `--now-ms`, o modo arquivo usa o relógio local; as capturas precisam ser recentes (limite padrão de 60 s) e nunca estar no futuro. Com `--now-ms` o resultado é reproduzível. Para começar de um modelo válido, gere o arquivo da fixture e edite os valores:

```powershell
bun --no-env-file --eval "import { syntheticInput } from './src/okx-derivatives/fixture.ts'; console.log(JSON.stringify(syntheticInput(), null, 2))" | Out-File -Encoding utf8 snapshot.json
```

Entradas malformadas são rejeitadas por inteiro, com saída 1, stdout vazio e uma linha em stderr: `okx-derivatives: <codigo>` e, quando há um campo do esquema, o caminho dele (por exemplo `okx-derivatives: invalid_snapshot snapshot.perp.ctVal`). Chaves desconhecidas, números JSON no lugar de textos decimais, livros fora de ordem, histórico fora de ordem e limites excedidos são recusados. Códigos: `invalid_arguments`, `invalid_file`, `invalid_utf8`, `invalid_json`, `invalid_input`, `invalid_snapshot`, `invalid_evaluation`, `invalid_clock`, `internal_error`. Nenhuma mensagem repete o conteúdo do arquivo.

## Como ler o relatório

Os primeiros campos respondem à pergunta principal; os blocos de referência vêm depois.

- `unknownInputs` e `notes`: o que ficou desconhecido e os limites declarados do cálculo.
- `carry.summary`: quais alavancagens ficaram `eligible`, `ineligible` e `unavailable`.
- `carry.comparison`: **o mesmo trade em várias alavancagens**. `conservativeNetQuote` é igual em todas as linhas (o lucro em cotação não depende da alavancagem); mudam o capital comprometido, o retorno sobre ele, a distância até a liquidação, quantos choques liquidam e o veredito.
- `carry.conservative`: o cenário que decide, funding do pior valor observado com alargamento adverso do basis, e `netOnNotionalPpm`, o líquido sobre o valor do perpétuo, que é a métrica do portão e **não** depende da alavancagem.
- `carry.scenarios`: nove cenários (funding recente médio, pior observado e zero, cada um com basis constante, convergindo e adverso). A convergência do basis não entra no veredito.
- `carry.leverageTable[].stress`: choques de 10% e 25% e um salto de 50% contra o vendido, com margem restante, liquidação, `hedgeBroken` e perda além da margem. Depois de uma liquidação o spot fica sem hedge e o ganho não realizado dele não é creditado.
- `carry.breakEven`: liquidações e horas de funding necessárias para cobrir os custos fixos; `null` quando o funding não paga os custos.
- `directional`: perpétuo direcional somente como risco (distância, tabela de choques e `holdingCostAtFlatPrice`, a perda determinística por execução, taxas e funding pago se o preço ficar parado). Não há lucro, retorno nem valor esperado, o funding recebido não é contado e o veredito nunca é `eligible`. `directional.comparison` mostra margem, distância e quanto da margem se perde em cada alavancagem.

Dinheiro é texto decimal exato com 6 casas na moeda de cotação (`"62.210000"`); razões são ppm inteiros (1553 ppm é 0,1553%); campos desconhecidos são `null`, nunca zero. Todo arredondamento é contra o trader: custos e capital para cima, ganhos, retornos e margem restante para baixo.

### Veredito

| Estado | Significado |
| --- | --- |
| `eligible` | Passou neste filtro aritmético sob as entradas informadas. **Não** é autorização financeira nem qualificação da estratégia. |
| `ineligible` | Um limite definitivo falhou: alavancagem acima do teto (padrão 3x), acima do máximo do instrumento, distância até a liquidação abaixo do piso (padrão 25%), líquido conservador que não supera o buffer (padrão 0,1% do valor do perpétuo) ou acesso negado. |
| `unavailable` | Falta dado ou o dado não serve: taxa, taxa de manutenção ou acesso desconhecidos, captura velha, no futuro ou dessincronizada, profundidade insuficiente, histórico de funding curto, tamanho inválido, contrato inverso. Nada é aprovado. |

Se houver um limite definitivo e também dado faltando, o veredito é `ineligible` e as razões listam as duas coisas. Cada razão é um código fixo (por exemplo `limit:leverage_above_cap`, `unknown:fee_perp_taker`, `depth:perp_open`); a lista completa está na SPEC.

### Exemplo sintético (valores inventados)

Fixture embutida: 400 contratos de 0,1 moeda (40 moedas, cerca de 40 mil na cotação), 90 liquidações de funding de 8 h (30 dias), funding histórico médio de 100 ppm por liquidação e mínimo de 70 ppm, taxas e taxa de manutenção inventadas.

| Alavancagem | Capital comprometido | Lucro conservador | Retorno conservador sobre o capital | Distância até a liquidação | Choques liquidados | Veredito |
| --- | --- | --- | --- | --- | --- | --- |
| 1x | 80087,0187 | 62,21 | 0,0776% | 99,12% | 0 de 3 | eligible |
| 2x | 60068,0187 | 62,21 | 0,1035% | 49,34% | 1 de 3 | eligible |
| 3x | 53395,0187 | 62,21 | 0,1165% | 32,75% | 1 de 3 | eligible |
| 5x | 48056,6187 | 62,21 | 0,1294% | 19,47% | 2 de 3 | ineligible |
| 10x | 44052,8187 | 62,21 | 0,1412% | 9,52% | 3 de 3 | ineligible |
| 20x | 42050,9187 | 62,21 | 0,1479% | 4,54% | 3 de 3 | ineligible |

A leitura é a lição do avaliador: o lucro em cotação é o mesmo em todas as linhas; passar de 1x para 20x reduz o capital e eleva o retorno conservador de 0,0776% para 0,1479% (menos que o dobro, porque a perna spot não é alavancada), enquanto a distância até a liquidação cai de 99,12% para 4,54%. Esses números provam aritmética, não rentabilidade, e não descrevem nenhum mercado real.

## Montar um arquivo com dados reais

O arquivo é uma **normalização feita pelo operador**, não a resposta bruta da OKX. Antes de confiar nele:

- **Funding** (`currentRate` e `history[].rate`): fração decimal por período de liquidação (`0.0001` é 0,01%), positiva quando quem está comprado paga a quem está vendido. A unidade numérica do campo da API não foi confirmada na documentação lida; confira com uma resposta real. Cada entrada do histórico leva o horário da liquidação já ocorrida.
- **Taxas** (`fees.*.makerCost` e `takerCost`): **custo** como fração (`0.0005` é 0,05%), positivo paga, negativo é rebate de maker. A API da OKX usa o sinal oposto (negativo é comissão): converta o sinal. Taxa que você não verificou deve ficar `null` ou ausente; o avaliador então declara `unavailable` em vez de supor zero.
- **Taxa de manutenção** (`maintenanceMarginRate`): a do degrau que se aplica ao seu tamanho de posição, pois a OKX define essa taxa por degraus de tamanho. Ausente é desconhecida.
- **Livros**: pares `[preço, tamanho]` em texto, melhor preço primeiro; tamanho do perpétuo em contratos e do spot em moedas (suposição de formato, não confirmada).
- **Acesso** (`access.derivatives`): `operator_confirmed` apenas se você mesmo verificou região, KYC e elegibilidade; o padrão é `unknown` e bloqueia.
- **Papéis** (`evaluation.carry.roles`): `taker` em todas as pernas por padrão. `maker` supõe execução no ponto médio, sem crédito de spread e sem risco de fila; use só com a taxa maker conhecida.

## Limites e o que não está qualificado

- Nenhuma execução, ordem, assinatura ou credencial. O resultado não autoriza operar e `liveQualified` e `financiallyAuthorized` são sempre `false`.
- A liquidação usa um **modelo simplificado de margem isolada**, que não é a fórmula exata da OKX. Ele não modela dedução de taxa e funding da margem, mudança de degrau quando o valor da posição se move, diferença entre mark e último preço nem outros modos de conta: leia a distância como estimativa otimista e mantenha folga.
- Só SWAP linear. Contrato inverso, futuros com vencimento, margem cruzada e portfólio estão fora do escopo (contrato inverso resulta em `unavailable`).
- O livro na saída é suposto igual ao atual, e o funding usa o mark e o intervalo atuais durante toda a retenção. O intervalo pode mudar e o funding pode inverter: por isso o portão usa o pior valor observado.
- A taxa de compra no spot é cobrada em ativo pela OKX; o modelo a trata como custo em cotação, sem modelar a pequena diferença de hedge.
- Chaves duplicadas em um arquivo JSON valem como a última ocorrência (comportamento padrão do `JSON.parse`) e não são detectadas.
- Taxas reais da conta, degraus de manutenção, disponibilidade regional, texto campo a campo dos endpoints públicos de funding, mark price, degraus de posição e livro de ordens (a página de referência da OKX trunca antes dessa seção na leitura usada) e o comportamento ao vivo continuam **sem confirmação**. Para qualificar a modalidade seriam necessários: um adapter separado com leitura pública revisada, taxas e degraus da própria conta, backtest e paper com separação temporal e fora da amostra, revisão independente e autorização financeira com limites explícitos.

## Verificar

```powershell
bun --no-env-file test --parallel=1 --timeout 15000 ./src ./scripts
bun --no-env-file run typecheck
```

Os testes cobrem aritmética exata e arredondamento, contrato e lotes, profundidade, taxas, funding com sinais positivo e negativo, basis, liquidação monotônica em alavancagem, choques, equilíbrio, veredito e precedência, validação estrita, forma e rejeição de arquivos malformados no CLI e a ausência de rede, ambiente, relógio e ponto flutuante no código.
