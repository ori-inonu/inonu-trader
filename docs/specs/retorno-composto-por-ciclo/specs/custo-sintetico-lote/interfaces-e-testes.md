# Interfaces e testes da fatia S3: Custo de ida e volta em lote por cotacao sintetica

## Arquivos novos

- src/okx-market/rt-batch.ts: Modulo puro batchRoundTrip: cota compra e venda de cada token e tamanho pela funcao injetada, decompoe o custo em taxa do pool, impacto, rede e imposto com desconhecido por componente, classifica por liquidez e resume por classe com IC de 95%.
- src/okx-market/rt-batch.test.ts: 14 casos com quote falso cobrindo soma, campo ausente, cotacao nula, erro, numero nao finito, classe por liquidez, resumo por classe, estados de amostra e validacao de entrada.

## Interfaces

```ts
export type Desconhecido = 'desconhecido';
export type Valor = number | Desconhecido;
export type Lado = 'compra' | 'venda';
export type ClasseLiquidez = 'liquido' | 'intermediario' | 'raso' | 'desconhecida';
export type EstadoClasse = 'medido' | 'amostra insuficiente' | 'nao medido';

export const AMOSTRA_MINIMA = 30;

export interface RtItem {
  id: string;
  address: string;
}

export interface RtFaixasLiquidez {
  liquidoMinUsd: number;
  intermediarioMinUsd: number;
}

export interface RtQuoteRequest {
  lado: Lado;
  id: string;
  address: string;
  tamanhoUsd: number;
}

export interface RtQuoteReply {
  taxaPoolPct?: number | null;
  impactoPct?: number | null;
  redePct?: number | null;
  impostoPct?: number | null;
  liquidezUsd?: number | null;
}

export type RtQuote = (request: RtQuoteRequest) => Promise<RtQuoteReply | null>;

export interface RtBatchInput {
  itens: RtItem[];
  tamanhos: number[];
  quote: RtQuote;
  faixas: RtFaixasLiquidez;
}

export interface RtComponentes {
  taxaPool: Valor;
  impacto: Valor;
  rede: Valor;
  imposto: Valor;
}

export interface RtLeg {
  lado: Lado;
  componentes: RtComponentes;
  totalPct: Valor;
  liquidezUsd: Valor;
  motivos: string[];
}

export interface RtRodada {
  id: string;
  address: string;
  tamanhoUsd: number;
  classe: ClasseLiquidez;
  compra: RtLeg;
  venda: RtLeg;
  totalPct: Valor;
}

export interface RtResumoClasse {
  classe: ClasseLiquidez;
  n: number;
  desconhecidas: number;
  media: Valor;
  desvio: Valor;
  icInferiorPct: Valor;
  icSuperiorPct: Valor;
  estado: EstadoClasse;
}

export interface RtBatchResult {
  rodadas: RtRodada[];
  resumo: RtResumoClasse[];
}

export function batchRoundTrip(input: RtBatchInput): Promise<RtBatchResult>;
export function summarizeByClass(rodadas: RtRodada[]): RtResumoClasse[];

```

## Casos de teste

- 1. Soma dos quatro componentes em um tamanho: entrada itens [{id:'A', address:'0xA'}], tamanhos [10], faixas {liquidoMinUsd:500000, intermediarioMinUsd:50000}; quote devolve para compra e venda taxaPoolPct 0.25, impactoPct -0.1, redePct 0.01, impostoPct 0, liquidezUsd 2000000; saida esperada compra.totalPct e venda.totalPct valem 0.36; totalPct da rodada vale 0.72 (toBeCloseTo); compra.componentes.impacto vale 0.1 (modulo); classe 'liquido'
- 2. Campo ausente vira desconhecido, nunca zero: entrada mesmo item; quote de compra sem a chave impostoPct, venda completa; saida esperada compra.componentes.imposto 'desconhecido'; compra.totalPct 'desconhecido'; totalPct da rodada 'desconhecido'; compra.motivos contem 'campo_ausente:imposto'; resumo de 'liquido' com n 0, desconhecidas 1, estado 'nao medido'
- 3. Cotacao nula gera rodada desconhecida: entrada mesmo item; quote retorna null para os dois lados; saida esperada todos os componentes 'desconhecido'; motivos contem 'cotacao_ausente'; liquidezUsd 'desconhecido'; classe 'desconhecida'; totalPct 'desconhecido'
- 4. Erro da cotacao nao derruba o lote: entrada itens A e B, tamanhos [10]; quote lanca Error para A e devolve componentes completos para B; saida esperada rodadas com 2 elementos; rodada A com totalPct 'desconhecido' e motivo 'erro_cotacao'; rodada B com totalPct numerico igual a 0.72
- 5. Numero nao finito vira desconhecido: entrada quote com impactoPct NaN, redePct Infinity, taxaPoolPct 0.25, impostoPct 0; saida esperada impacto e rede 'desconhecido'; taxaPool 0.25; imposto 0 (zero real preservado); totalPct da perna 'desconhecido'
- 6. Classe pela faixa de liquidez: entrada tres rodadas com liquidezUsd 600000, 60000 e 10000 nas duas pernas; faixas {500000, 50000}; saida esperada classes 'liquido', 'intermediario' e 'raso' nessa ordem
- 7. Classe pela perna menos liquida e desconhecida sem liquidez: entrada compra com liquidezUsd 600000 e venda com 40000; depois compra 600000 e venda sem liquidezUsd; saida esperada primeira rodada 'raso'; segunda rodada 'desconhecida'
- 8. IC com n igual a 30: entrada 30 itens identicos, tamanhos [10], cada perna com taxaPoolPct 0.25 e demais componentes 0 e liquidez alta; saida esperada resumo 'liquido': n 30, media 0.5, desvio 0, icInferiorPct 0.5, icSuperiorPct 0.5, estado 'medido', desconhecidas 0
- 9. Amostra insuficiente com n igual a 29: entrada 29 itens identicos como no caso 8; saida esperada resumo 'liquido': n 29, media 0.5, estado 'amostra insuficiente'
- 10. Classe sem amostra vira nao medido: entrada lote so com rodadas 'liquido'; saida esperada resumo 'raso': n 0, media 'desconhecido', desvio 'desconhecido', icInferiorPct 'desconhecido', icSuperiorPct 'desconhecido', estado 'nao medido'
- 11. Desvio e IC com n igual a 1: entrada uma rodada 'liquido' com totalPct 0.5; saida esperada n 1; media 0.5; desvio 'desconhecido'; IC 'desconhecido'; estado 'amostra insuficiente'
- 12. Desvio amostral e intervalo com duas rodadas: entrada summarizeByClass com duas rodadas 'liquido' com totalPct 1 e 3; saida esperada n 2; media 2; desvio aproximadamente 1.41421 (raiz de 2); icInferiorPct aproximadamente 0.04; icSuperiorPct aproximadamente 3.96; estado 'amostra insuficiente'
- 13. Entrada invalida falha antes de chamar a cotacao: entrada tres chamadas: tamanhos [0]; itens com id repetido; faixas {liquidoMinUsd:10, intermediarioMinUsd:50}; contador de chamadas da cotacao; saida esperada cada chamada rejeita com 'Invalid round-trip batch input.'; contador de cotacao igual a 0
- 14. Duas cotacoes por rodada, na ordem certa: entrada 2 itens (A e B), tamanhos [10, 100], quote que registra chamadas; saida esperada 8 chamadas; em cada par, primeiro lado 'compra' e depois 'venda'; cada chamada traz address do item e tamanhoUsd do tamanho; rodadas na ordem item A tamanho 10, A 100, B 10, B 100

## Verificacao

- bun --no-env-file test src/okx-market/rt-batch.test.ts
- bun --no-env-file run typecheck
- bun --no-env-file test src/okx-market/round-trip.test.ts
- grep -nP "\x{00B7}|\x{2014}|\x{2013}" src/okx-market/rt-batch.ts src/okx-market/rt-batch.test.ts
- git status --short -- src/okx-market

## Riscos

- O branch tem conflitos não resolvidos (UU) em .agents/skills e arquivos staged; o typecheck pode já estar vermelho. Mitigação: registrar linha de base antes e só exigir ausência de erro novo nos dois arquivos.
- IC por aproximação normal perto de n igual a 30 é otimista para caudas pesadas de custo de cauda; mitigado pelo estado amostra insuficiente abaixo de 30, mas o IC ainda deve ser lido com cautela.
- Unidade das taxas: round-trip.ts trata taxRate como fração. Se o adaptador real errar a conversão, o módulo recebe números em unidade errada sem erro. Mitigação: campos com sufixo Pct e teste de conversão no adaptador, em fatia própria.
- Classificar pela menor liquidez pode marcar como raso um par cujo TVL do pool é baixo mas cuja profundidade a 1% é boa (ou o inverso). Mitigação: pergunta em duvidas_para_o_jev.
- Soma de ponto flutuante: comparações devem usar toBeCloseTo nos testes para não falhar por arredondamento.
- Execução sequencial das cotações é segura para o teto de RPS, mas lenta com muitos itens; fora de escopo desta fatia.

## Fora de escopo

- Adaptador real da OKX DEX, Jupiter, OnchainOS ou Solana RPC, e qualquer chamada de rede.
- Ligação com cycle.ts, wire.ts, scheduler.ts, source-ecosystem.ts ou api-budget.ts.
- Scripts em scripts/ e gravação de journals em data/.
- Patrimônio em USD, retorno composto, markout de 1, 5, 15 e 60 min.
- Raspagem do site da OKX e feed WebSocket pago.
- Qualquer alteração em src/decision-review/** ou src/decision-review/evolution/**.
- Dimensionamento de posição e limites de risco (decisão do dono).

## Integracao proposta (NAO implementada; arquivos quentes)

- src/okx-market/okx-dex.ts (ou adaptador novo ao lado): Converter a resposta de quote do cliente OKX DEX em RtQuoteReply (taxas de fração para percentual, liquidez do pool, nulos para campos ausentes). Fatia própria: consome cota da API e exige decisão de plano antes de ligar.
- src/agent/cycle.ts: Gravar em sombra o resultado de batchRoundTrip depois da etapa de cotação, sem alterar decisão nem executor. Arquivo quente: fora desta fatia.
- scripts/move-vs-friction.ts: Consumidor somente leitura do resumo por classe (n, média, IC, estado) para comparar movimento com atrito por classe de liquidez. Não criar nesta fatia.
- scripts/api-budget.ts e src/agent/budget.ts: Contar duas consultas de cotação por item por tamanho antes de ligar o lote ao ciclo, para que o teto local seja respeitado.

## Duvidas para o Jev

- Qual métrica define a faixa de liquidez: liquidezUsd do pool (TVL) ou profundidade a 1% de impacto? (opcoes: tvl, profundidade; recomendacao sem Jev: tvl, porque é reversível, usa dado já pedido na cotação e não consome cota extra.)
- Qual intervalo de confiança usar no resumo por classe? (opcoes: normal, student; recomendacao sem Jev: normal, porque é reversível, sem dependência e o piso de 30 já limita o uso de amostras pequenas.)
- O impacto de preço entra no total como módulo ou com sinal? (opcoes: modulo, sinal; recomendacao sem Jev: modulo, porque evita que uma convenção de sinal reduza o custo total.)
- Quando uma perna não tem liquidez, a rodada vai para a classe desconhecida ou usa a outra perna? (opcoes: desconhecida, perna_disponivel; recomendacao sem Jev: desconhecida, porque é o caminho conservador e reversível.)
- Os tamanhos de teste da fatia real (em USD) devem ser fixados nesta etapa? (opcoes: fixos, parametro; recomendacao sem Jev: parametro, porque o módulo não deve decidir tamanho de ordem.)

## Bloqueios do dono

- Ligar o lote a cotações reais da OKX DEX consome cota da API e pode exigir plano pago: registrado como bloqueio, decisão do dono e fora desta fatia.
- Qualquer uso de dinheiro real, ordem ou liberação de live continua fora: esta fatia não cria caminho de execução.
