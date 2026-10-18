/**
 * Regressão logística regularizada (L2) com padronização e indicadores de dado ausente.
 *
 * Por que assim: o conjunto é pequeno, ruidoso e cheio de buracos (o campo de momento do brief falta em mais da
 * metade dos candidatos). Cada coluna é padronizada com média e desvio do TREINO; valor ausente vira a média do
 * treino (zero depois de padronizar) E ganha uma coluna 0/1 de "ausente", para o modelo poder aprender que estar
 * ausente carrega (ou não) informação. Coluna constante no treino é descartada e o motivo é registrado. Valores
 * padronizados são limitados a +-5 para um outlier de teste não explodir a previsão. A crista L2 age nos pesos e nunca
 * no viés. Ajuste por Newton com busca em linha; determinístico, sem aleatoriedade. Puro.
 */

export interface LogisticOptions {
  /** Força da crista sobre os pesos padronizados. Padrão 1. */
  readonly lambda?: number;
  readonly maxIter?: number;
  /** Menos linhas que isto: sem modelo. Padrão 30. */
  readonly minRows?: number;
  /** Cria indicador de ausente para colunas com algum valor ausente no treino. Padrão true. */
  readonly missingIndicators?: boolean;
  /** Limite do valor padronizado. Padrão 5. */
  readonly clip?: number;
}

export interface DroppedColumn {
  readonly column: string;
  readonly reason: "constante" | "sem_dado";
}

export interface LogisticModel {
  /** Nomes das colunas do modelo final (valores e indicadores), na ordem dos pesos. */
  readonly features: readonly string[];
  readonly dropped: readonly DroppedColumn[];
  readonly weights: readonly number[];
  readonly bias: number;
  readonly n: number;
  readonly iterations: number;
  readonly converged: boolean;
  /** Probabilidade para uma linha de valores brutos (null = ausente), na ordem das colunas de entrada. */
  predict(row: ReadonlyArray<number | null>): number;
  /** Pesos padronizados ordenados por magnitude, para o relatório. */
  coefficients(): Array<{ feature: string; weight: number }>;
}

const sigmoid = (z: number): number => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

interface ColumnPlan {
  readonly source: number;
  readonly kind: "valor" | "ausente";
  readonly name: string;
  readonly mean: number;
  readonly sd: number;
  /** Média da coluna de valores no treino, usada para imputar. */
  readonly impute: number;
}

const isValue = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Resolve (A + diag) x = b por eliminação de Gauss com pivô parcial. null se singular. */
function solve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i] as number]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs((a[r] as number[])[col] as number) > Math.abs((a[pivot] as number[])[col] as number)) pivot = r;
    if (Math.abs((a[pivot] as number[])[col] as number) < 1e-14) return null;
    if (pivot !== col) [a[pivot], a[col]] = [a[col] as number[], a[pivot] as number[]];
    const pr = a[col] as number[];
    for (let r = col + 1; r < n; r += 1) {
      const row = a[r] as number[];
      const f = (row[col] as number) / (pr[col] as number);
      if (f === 0) continue;
      for (let c = col; c <= n; c += 1) row[c] = (row[c] as number) - f * (pr[c] as number);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    const row = a[r] as number[];
    let sum = row[n] as number;
    for (let c = r + 1; c < n; c += 1) sum -= (row[c] as number) * (x[c] as number);
    x[r] = sum / (row[r] as number);
  }
  return x;
}

export function fitLogistic(
  rows: ReadonlyArray<ReadonlyArray<number | null>>,
  y: readonly number[],
  names: readonly string[],
  options: LogisticOptions = {},
): LogisticModel | null {
  if (rows.length !== y.length) throw new RangeError("linhas e y devem ter o mesmo tamanho");
  const lambda = options.lambda ?? 1;
  const maxIter = options.maxIter ?? 60;
  const minRows = options.minRows ?? 30;
  const indicators = options.missingIndicators ?? true;
  const clip = options.clip ?? 5;
  const n = rows.length;
  const width = names.length;
  for (const row of rows) if (row.length !== width) throw new RangeError("toda linha deve ter uma entrada por coluna");
  let positives = 0;
  for (const v of y) {
    if (v !== 0 && v !== 1) throw new RangeError("desfecho deve ser 0 ou 1");
    positives += v;
  }
  if (n < minRows || positives === 0 || positives === n) return null;

  const plans: ColumnPlan[] = [];
  const dropped: DroppedColumn[] = [];
  for (let c = 0; c < width; c += 1) {
    const values: number[] = [];
    for (const row of rows) {
      const v = row[c];
      if (isValue(v)) values.push(v);
    }
    const name = names[c] as string;
    if (values.length < 2) {
      dropped.push({ column: name, reason: "sem_dado" });
      continue;
    }
    const m = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - m) * (v - m), 0) / (values.length - 1);
    const sd = Math.sqrt(variance);
    if (!(sd > 1e-12)) dropped.push({ column: name, reason: "constante" });
    else plans.push({ source: c, kind: "valor", name, mean: m, sd, impute: m });
    const missing = n - values.length;
    if (indicators && missing > 0 && missing < n) {
      const share = missing / n;
      const isd = Math.sqrt((share * (1 - share) * n) / (n - 1));
      if (isd > 1e-12) plans.push({ source: c, kind: "ausente", name: `${name}__ausente`, mean: share, sd: isd, impute: 0 });
    }
  }

  const transform = (row: ReadonlyArray<number | null>): number[] =>
    plans.map((plan) => {
      const v = row[plan.source];
      const raw = plan.kind === "valor" ? (isValue(v) ? v : plan.impute) : isValue(v) ? 0 : 1;
      const z = (raw - plan.mean) / plan.sd;
      return Math.max(-clip, Math.min(clip, z));
    });

  const p = plans.length;
  const features = plans.map((plan) => plan.name);
  if (p === 0) {
    const bias = Math.log(positives / (n - positives));
    return { features, dropped, weights: [], bias, n, iterations: 0, converged: true, predict: () => sigmoid(bias), coefficients: () => [] };
  }
  const x = rows.map(transform);
  let w = new Array<number>(p).fill(0);
  let b = Math.log(positives / (n - positives));

  const lossOf = (ww: readonly number[], bb: number): number => {
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      let z = bb;
      const xi = x[i] as number[];
      for (let j = 0; j < p; j += 1) z += (ww[j] as number) * (xi[j] as number);
      sum += Math.max(z, 0) - z * (y[i] as number) + Math.log1p(Math.exp(-Math.abs(z)));
    }
    let pen = 0;
    for (const v of ww) pen += v * v;
    return sum + 0.5 * lambda * pen;
  };

  let current = lossOf(w, b);
  let iterations = 0;
  let converged = false;
  for (let iter = 0; iter < maxIter; iter += 1) {
    iterations = iter + 1;
    const grad = new Array<number>(p + 1).fill(0);
    const hess: number[][] = Array.from({ length: p + 1 }, () => new Array<number>(p + 1).fill(0));
    for (let i = 0; i < n; i += 1) {
      const xi = x[i] as number[];
      let z = b;
      for (let j = 0; j < p; j += 1) z += (w[j] as number) * (xi[j] as number);
      const prob = sigmoid(z);
      const r = prob - (y[i] as number);
      const wt = Math.max(prob * (1 - prob), 1e-10);
      grad[p] = (grad[p] as number) + r;
      (hess[p] as number[])[p] = ((hess[p] as number[])[p] as number) + wt;
      for (let j = 0; j < p; j += 1) {
        const xj = xi[j] as number;
        grad[j] = (grad[j] as number) + r * xj;
        (hess[j] as number[])[p] = ((hess[j] as number[])[p] as number) + wt * xj;
        (hess[p] as number[])[j] = ((hess[p] as number[])[j] as number) + wt * xj;
        const hj = hess[j] as number[];
        for (let k = j; k < p; k += 1) {
          const add = wt * xj * (xi[k] as number);
          hj[k] = (hj[k] as number) + add;
          if (k !== j) (hess[k] as number[])[j] = ((hess[k] as number[])[j] as number) + add;
        }
      }
    }
    for (let j = 0; j < p; j += 1) {
      grad[j] = (grad[j] as number) + lambda * (w[j] as number);
      (hess[j] as number[])[j] = ((hess[j] as number[])[j] as number) + lambda;
    }
    (hess[p] as number[])[p] = ((hess[p] as number[])[p] as number) + 1e-8;
    const delta = solve(hess, grad);
    if (delta === null) break;
    let step = 1;
    let accepted = false;
    for (let h = 0; h < 30; h += 1) {
      const wn = w.map((v, j) => v - step * (delta[j] as number));
      const bn = b - step * (delta[p] as number);
      const candidate = lossOf(wn, bn);
      if (candidate <= current + 1e-12) {
        const gain = current - candidate;
        w = wn;
        b = bn;
        current = candidate;
        accepted = true;
        if (gain < 1e-10 || Math.max(...delta.map(Math.abs)) * step < 1e-8) converged = true;
        break;
      }
      step /= 2;
    }
    if (!accepted) {
      converged = true;
      break;
    }
    if (converged) break;
  }

  const weights = [...w];
  return {
    features,
    dropped,
    weights,
    bias: b,
    n,
    iterations,
    converged,
    predict(row) {
      if (row.length !== width) throw new RangeError("a linha deve ter uma entrada por coluna");
      const xi = transform(row);
      let z = b;
      for (let j = 0; j < p; j += 1) z += (weights[j] as number) * (xi[j] as number);
      return sigmoid(z);
    },
    coefficients: () => features.map((feature, j) => ({ feature, weight: weights[j] as number })).sort((a, c) => Math.abs(c.weight) - Math.abs(a.weight)),
  };
}

/** log1p com sinal: comprime as caudas pesadas dos retornos e volumes sem perder o sinal. */
export function signedLog1p(x: number): number {
  return Math.sign(x) * Math.log1p(Math.abs(x));
}
