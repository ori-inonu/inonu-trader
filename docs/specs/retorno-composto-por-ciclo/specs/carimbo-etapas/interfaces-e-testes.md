# Interfaces e testes da fatia S1: Carimbo de tempo por etapa do ciclo

## Arquivos novos

- src/agent/stage-timing.ts: Cronômetro de etapas do ciclo com relógio injetado, resumo por percentil de posto mais próximo, formatação JSONL e gravador com append injetado. Puro, sem disco.
- src/agent/stage-timing.test.ts: Testes com relógio falso: etapas aninhadas, etapa sem fim, duração negativa, reinício de etapa, percentis de amostra pequena, formatação da linha, falha de append e etapa desconhecida.

## Interfaces

```ts
export const STAGES = ["livro", "fatos", "ecossistema", "timing_candidatos", "timing_posicoes", "momentum", "modelo", "ordem", "fechamento"] as const;

export type Stage = (typeof STAGES)[number];

export interface StageSample {
  readonly etapa: Stage;
  /** Duração em ms. Null quando o relógio voltou (duração negativa) ou o valor não é finito. */
  readonly ms: number | null;
}

export interface StageSnapshot {
  /** Amostras na ordem em que as etapas terminaram. */
  readonly amostras: readonly StageSample[];
  /** Etapas com início e sem fim no momento do snapshot. Não geram amostra. */
  readonly abertas: readonly Stage[];
}

export interface StageTimer {
  /** Abre a etapa. Se ela já estiver aberta, substitui o instante anterior. Etapa desconhecida lança TypeError. */
  start(etapa: Stage): void;
  /** Fecha a etapa e grava a amostra. Devolve a duração, ou null se não havia início ou se a duração é negativa. */
  end(etapa: Stage): number | null;
  /** Grava uma duração já medida. Valor negativo ou não finito vira amostra com ms null. */
  record(etapa: Stage, ms: number): void;
  /** Leitura sem limpar o estado. */
  snapshot(): StageSnapshot;
}

export interface StageTimerDeps {
  /** Relógio injetado, em milissegundos. */
  readonly now: () => number;
}

export function createStageTimer(deps: StageTimerDeps): StageTimer;

export interface StageSummary {
  readonly etapa: Stage;
  /** Amostras com ms finito. */
  readonly n: number;
  /** Amostras com ms null. */
  readonly nulas: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly p99: number | null;
  readonly max: number | null;
}

/** Posto mais próximo: índice ceil(p * n / 100), limitado a [1, n]. Lista vazia devolve null. p fora de (0, 100] lança RangeError. */
export function percentile(ordenados: readonly number[], p: number): number | null;

/** Um resumo por etapa presente, na ordem de STAGES. */
export function summarize(amostras: readonly StageSample[]): StageSummary[];

export interface StageLine {
  /** Milissegundos desde a época. */
  readonly ts: number;
  readonly ciclo: string;
  readonly etapa: Stage;
  readonly ms: number | null;
  readonly consultou: boolean;
}

/** JSON com ordem de chaves ts, ciclo, etapa, ms, consultou, seguido de quebra de linha. */
export function formatStageLine(linha: StageLine): string;

export interface RecordStagesInput {
  readonly timer: StageTimer;
  readonly ts: number;
  readonly ciclo: string;
  readonly consultou: boolean;
  /** Recebe uma linha por amostra. Exceções são contadas em falhas. */
  readonly append: (linha: string) => void;
}

export interface RecordStagesResult {
  readonly gravadas: number;
  readonly falhas: number;
}

/** Grava as amostras do snapshot atual, uma linha por amostra, e devolve a contagem. */
export function recordStages(input: RecordStagesInput): RecordStagesResult;
```

## Casos de teste

- start e end medem a duração com relógio falso: entrada relógio em 1000; start('livro'); relógio em 1250; end('livro'); saida esperada end devolve 250; snapshot.amostras é [{etapa: 'livro', ms: 250}]; abertas é []
- etapas aninhadas têm duração própria: entrada relógio 0: start('modelo'); relógio 10: start('ordem'); relógio 30: end('ordem'); relógio 50: end('modelo'); saida esperada amostras em ordem de término: [{ordem, 20}, {modelo, 50}]
- etapa sem fim não gera amostra: entrada relógio 0: start('fatos'); nunca chama end; snapshot no relógio 500; saida esperada amostras é []; abertas é ['fatos']
- end sem start não grava nada: entrada end('momentum') sem nenhum start anterior; saida esperada devolve null; amostras é []
- duração negativa vira amostra nula e é contada: entrada relógio 500: start('ordem'); relógio 400: end('ordem'); saida esperada end devolve null; amostras é [{etapa: 'ordem', ms: null}]; summarize dá n 0, nulas 1, p50 null, max null para 'ordem'
- record com valor negativo ou não finito vira nulo e não entra nos percentis: entrada record('livro', 120); record('livro', -5); record('livro', NaN); summarize; saida esperada amostras com ms [120, null, null]; summarize para 'livro' dá n 1, nulas 2, p50 120, p95 120, p99 120, max 120
- reinício de etapa aberta substitui o início: entrada relógio 0: start('livro'); relógio 100: start('livro'); relógio 130: end('livro'); saida esperada end devolve 30; amostras tem uma única entrada {livro, 30}
- percentil de posto mais próximo com 21 valores: entrada percentile([1..21], 50), percentile([1..21], 95), percentile([1..21], 99), percentile([1..21], 100); saida esperada 11, 20, 21, 21
- percentil de amostra de um valor e de lista vazia: entrada percentile([7], 50); percentile([7], 99); percentile([], 50); percentile([1,2], 0); saida esperada 7; 7; null; lança RangeError
- summarize segue a ordem de STAGES e não inventa etapas: entrada amostras: [{ordem, 5}, {livro, 3}, {ordem, 9}]; saida esperada resumos na ordem ['livro', 'ordem']; 'ordem' tem n 2, p50 5, max 9; nenhuma outra etapa aparece
- formatStageLine gera a chave na ordem fixa e quebra de linha: entrada formatStageLine({ts: 1000, ciclo: 'c1', etapa: 'livro', ms: 250, consultou: true}); saida esperada string igual a '{"ts":1000,"ciclo":"c1","etapa":"livro","ms":250,"consultou":true}\n'
- formatStageLine com ms nulo: entrada formatStageLine({ts: 2000, ciclo: 'c2', etapa: 'ordem', ms: null, consultou: false}); saida esperada string contém '"ms":null' e termina em quebra de linha
- recordStages grava uma linha por amostra e conta falhas: entrada timer com três amostras; append que lança exceção na segunda chamada e guarda as outras; saida esperada devolve {gravadas: 2, falhas: 1}; append recebeu três chamadas e as linhas têm o ciclo e o consultou informados
- etapa desconhecida lança TypeError: entrada timer.start('desconhecida' as Stage) ou timer.record('desconhecida' as Stage, 5); saida esperada lança TypeError; nenhuma amostra é gravada

## Verificacao

- bun --no-env-file test src/agent/stage-timing.test.ts
- bun run typecheck
- grep -nP "[\x{00B7}\x{2013}\x{2014}]" src/agent/stage-timing.ts src/agent/stage-timing.test.ts
- git status --short src/agent/cycle.ts src/agent/wire.ts src/agent/scheduler.ts src/intel/source-ecosystem.ts src/agent/api-budget.ts

## Riscos

- Relógio de produção pode voltar (NTP) e gerar amostras nulas; por isso a contagem de nulas é obrigatória e a análise deve reportar a fração nula.
- Amostra pequena (menos de 1000 ciclos) deixa p99 instável; a meta de 1000 ciclos da fase F1 precisa de 7 dias de coleta, não de um dia.
- Etapas aninhadas são medidas de forma independente; quem somar as etapas para comparar com durationMs precisa lembrar que aninhamento conta tempo duas vezes.
- Se a integração em cycle.ts for feita sem o cronômetro ser criado por ciclo, amostras de ciclos diferentes se misturam; o timer deve nascer em cada chamada de cycle.
- Percentil pelo posto mais próximo não interpola; com n pequeno, p95 e p99 podem ser o mesmo valor. Isso é esperado e documentado.
- Arquivo de etapas em .scratch cresce a cada ciclo; a rotação fica para a fatia de integração.

## Fora de escopo

- Ligar o módulo a src/agent/cycle.ts, src/agent/wire.ts, src/agent/scheduler.ts, src/intel/source-ecosystem.ts ou src/agent/api-budget.ts.
- Gravar em disco, criar diretórios, ler arquivos ou tocar em data/ e journals.
- Medir cotação, atrito, markout, latência de rede ou taxa de transação.
- Contador de chamadas por rota da OnchainOS (fatia RC-T2).
- Qualquer alteração em src/decision-review/** (zona do Codex) e em src/decision-review/evolution/**.
- Mudança de decisão, executor, risco, cadência ou consulta ao Jev.
- Qualquer ordem, transação, carteira, saque ou dinheiro real.

## Integracao proposta (NAO implementada; arquivos quentes)

- src/agent/cycle.ts (função cycle, início em linha 421 com const t0 = deps.now()): Criar createStageTimer({ now: deps.now }) ao lado de t0 e envolver com start e end as etapas livro, fatos (leitura de bookAgeMs), ecossistema, timing_candidatos, timing_posicoes, momentum, modelo (entre askedAtMs e answeredAtMs, linhas 1004 e 1016), ordem e fechamento (função report, linha 440). Campo etapas opcional no relatório, só leitura.
- src/agent/wire.ts (gravação do relatório do ciclo): Chamar recordStages com append que escreve em .scratch/stage-timing/etapas.jsonl (git-ignored, evidência local). Não usar data/ nem journals.
- src/agent/scheduler.ts e src/agent/api-budget.ts: Nenhuma mudança nesta fatia. A contagem de chamadas por rota fica para a fatia RC-T2.

## Duvidas para o Jev

- Onde gravar o arquivo de etapas quando a integração for feita? (opcoes: A, B; recomendacao sem Jev: A, por ser reversível, local e fora de data/.)
- Etapa desconhecida deve lançar TypeError ou ser ignorada em silêncio? (opcoes: A, B; recomendacao sem Jev: A, porque o nome é tipado e a exceção só ocorre em erro de programação.)
- Segundo start em etapa já aberta: substituir o início ou contar a primeira abertura como sem fim? (opcoes: A, B; recomendacao sem Jev: A, mais simples e sem efeito no resumo.)
- Formato do campo ts na linha JSONL (opcoes: A, B; recomendacao sem Jev: A, por coincidir com o relógio injetado e evitar conversão na escrita.)

## Bloqueios do dono

- Dinheiro real, carteira, ordens, saques e transferências: fora desta fatia e não decididos pelo Jev.
- Segredos, chaves e credenciais: nenhum usado ou lido.
- Limites de risco e liberação de live: fora desta fatia.
- Migrações de dados ou de schema, inclusive os journals em data/: fora desta fatia; a integração proposta evita data/ de propósito.
- Dependências de produção novas ou trocadas: nenhuma nesta fatia.
- Billing, contratos e serviços pagos (plano pago do OnchainOS, WebSocket pago): fora desta fatia.
- Raspagem do site da OKX: vedada pela decisão do dono e não usada aqui.
