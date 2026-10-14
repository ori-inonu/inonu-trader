"use client";

import {
  readAgeMs,
  readFreshness,
  type JevAnalysisView,
  type JevOiRegime,
  type JevReadView,
} from "@/lib/jev-read";
import { fmtNumber } from "@/lib/desk/ui/format";
import styles from "./JevIndicators.module.css";

/**
 * "Indicadores do Inonu": the Python analytics digest of the focused instrument's latest read, as one row of
 * descriptive chips plus a disclosure with every field the Jev received. It describes the market, never a
 * decision: nothing here says buy, sell or signal. An absent analysis says so in one muted line; a stale read
 * or an old digest dims the whole strip instead of pretending to be current.
 */

const OI_WORDS: Record<JevOiRegime, string> = {
  long_buildup: "compradas entrando",
  short_buildup: "vendidas entrando",
  short_covering: "vendidas fechando",
  long_unwind: "compradas saindo",
  mixed: "misto",
};

const REGIME_WORDS = { up: "alta", down: "baixa", range: "lateral" } as const;

const signed = (v: number, digits: number): string => `${v >= 0 ? "+" : ""}${fmtNumber(v, digits)}`;
const bps = (v: number | null): string => (v === null ? "--" : fmtNumber(v, 1));

const signed2 = (v: number | null): string => (v === null ? "nulo" : `${v >= 0 ? "+" : ""}${fmtNumber(v, 2)}`);
const signedBps = (v: number | null): string => (v === null ? "nulo" : `${v >= 0 ? "+" : ""}${fmtNumber(v, 1)} bps`);
const signedPct = (v: number | null): string => (v === null ? "nulo" : `${v >= 0 ? "+" : ""}${fmtNumber(v, 1)}%`);
const numOr = (v: number | null, digits: number): string => (v === null ? "nulo" : fmtNumber(v, digits));
const intOr = (v: number | null): string => (v === null ? "nulo" : String(Math.round(v)));
const signedInt = (v: number | null): string => (v === null ? "nulo" : v > 0 ? `+${Math.round(v)}` : String(Math.round(v)));
const pctOr = (v: number | null): string => (v === null ? "nulo" : `${Math.round(v * 100)}%`);
const bpsOr = (v: number | null): string => (v === null ? "nulo" : `${fmtNumber(v, 1)} bps`);

/** Every field name as the Jev received it, with its Portuguese label for the Detalhes list. */
function detailRows(a: JevAnalysisView): { name: string; label: string; value: string }[] {
  const rows: { name: string; label: string; value: string }[] = [];
  const put = (name: string, label: string, value: string | null | undefined): void => {
    if (value === undefined) return;
    rows.push({ name, label, value: value === null ? "nulo" : value });
  };
  put("ageSec", "Idade do digest (s)", intOr(a.ageSec));
  if (a.trend !== undefined) {
    const t = a.trend;
    put("trend.regime", "Regime", REGIME_WORDS[t.regime]);
    put("trend.adx15m", "ADX 15m", numOr(t.adx15m, 1));
    put("trend.efficiency15m", "Eficiencia 15m", numOr(t.efficiency15m, 2));
    put("trend.emaStack15m", "Pilha EMA 15m", signedInt(t.emaStack15m));
    put("trend.emaStack1h", "Pilha EMA 1h", signedInt(t.emaStack1h));
    put("trend.emaStack4h", "Pilha EMA 4h", signedInt(t.emaStack4h));
    put("trend.extensionAtr15m", "Extensao ATR 15m", numOr(t.extensionAtr15m, 2));
  }
  if (a.momentum !== undefined) {
    const m = a.momentum;
    put("momentum.rsi5m", "RSI 5m", numOr(m.rsi5m, 1));
    put("momentum.rsi15m", "RSI 15m", numOr(m.rsi15m, 1));
    put("momentum.rsi1h", "RSI 1h", numOr(m.rsi1h, 1));
    put("momentum.macdHistAtr15m", "Histograma MACD em ATR 15m", numOr(m.macdHistAtr15m, 2));
  }
  if (a.volatility !== undefined) {
    const v = a.volatility;
    put("volatility.atrBps15m", "ATR 15m", bpsOr(v.atrBps15m));
    put("volatility.atrBps1h", "ATR 1h", bpsOr(v.atrBps1h));
    put("volatility.volRank24h", "Percentil de volatilidade 24h", pctOr(v.volRank24h));
    put("volatility.bbWidthRank15m", "Percentil de largura BB 15m", pctOr(v.bbWidthRank15m));
    put("volatility.bbPercentB15m", "Percentual B Bollinger 15m", numOr(v.bbPercentB15m, 2));
    put("volatility.expectedAbsMove5mBps", "Movimento esperado 5m", bpsOr(v.expectedAbsMove5mBps));
  }
  if (a.structure !== undefined) {
    const s = a.structure;
    put("structure.donchianPos1h", "Posicao Donchian 1h", numOr(s.donchianPos1h, 2));
    put("structure.supportBps", "Suporte mais proximo", bpsOr(s.supportBps));
    put("structure.supportTouches", "Toques do suporte", intOr(s.supportTouches));
    put("structure.resistanceBps", "Resistencia mais proxima", bpsOr(s.resistanceBps));
    put("structure.resistanceTouches", "Toques da resistencia", intOr(s.resistanceTouches));
    put("structure.renkoRun15m", "Sequencia Renko 15m", intOr(s.renkoRun15m));
    for (const [i, level] of s.levels.entries()) {
      put(`structure.levels[${i}]`, `Nivel ${i + 1}`, `${level.kind === "support" ? "suporte" : "resistencia"} ${fmtNumber(level.px, 2)} ${level.tf} x${level.touches}`);
    }
  }
  if (a.derivatives !== undefined) {
    const d = a.derivatives;
    put("derivatives.fundingZ", "Funding z", signed2(d.fundingZ));
    put("derivatives.fundingPctile", "Percentil de funding", pctOr(d.fundingPctile));
    put("derivatives.oiChange1hPct", "Variacao de OI 1h", signedPct(d.oiChange1hPct));
    put("derivatives.oiPriceRegime", "Regime OI x preco", d.oiPriceRegime === null ? null : OI_WORDS[d.oiPriceRegime]);
    put("derivatives.longShortRatio", "Razao comprados e vendidos", numOr(d.longShortRatio, 2));
    put("derivatives.longShortZ", "Z da razao comprados e vendidos", signed2(d.longShortZ));
    put("derivatives.takerBuyShare1h", "Compradores do taker 1h", pctOr(d.takerBuyShare1h));
  }
  if (a.crossAsset !== undefined) {
    const c = a.crossAsset;
    put("crossAsset.corrBtc48h", "Correlacao BTC 48h", signed2(c.corrBtc48h));
    put("crossAsset.betaBtc48h", "Beta BTC 48h", numOr(c.betaBtc48h, 2));
    put("crossAsset.relStrengthVsBtc24hBps", "Forca relativa vs BTC 24h", signedBps(c.relStrengthVsBtc24hBps));
  }
  if (a.cost !== undefined) {
    const c = a.cost;
    put("cost.assumedRoundTripFeeBps", "Custo ida e volta assumido", bpsOr(c.assumedRoundTripFeeBps));
    put("cost.spreadBps", "Spread", bpsOr(c.spreadBps));
    put("cost.moveToCost", "Movimento por custo", numOr(c.moveToCost, 2));
  }
  return rows;
}

function chipsOf(a: JevAnalysisView): string[] {
  const chips: string[] = [];
  if (a.trend !== undefined) chips.push(`Tendencia ${REGIME_WORDS[a.trend.regime]} ADX ${fmtNumber(a.trend.adx15m, 0)}`);
  if (a.momentum !== undefined) chips.push(`RSI 15m ${fmtNumber(a.momentum.rsi15m, 0)}`);
  if (a.volatility !== undefined) {
    chips.push(`Vol ${Math.round(a.volatility.volRank24h * 100)}%`);
    if (a.volatility.bbWidthRank15m < 0.2) chips.push("Squeeze");
  }
  if (a.structure !== undefined) chips.push(`S ${bps(a.structure.supportBps)} bps R ${bps(a.structure.resistanceBps)} bps`);
  if (a.derivatives !== undefined) {
    const d = a.derivatives;
    if (d.fundingZ !== null) chips.push(`Funding z ${signed(d.fundingZ, 1)}`);
    if (d.oiPriceRegime !== null) chips.push(`OI ${OI_WORDS[d.oiPriceRegime]}`);
    if (d.takerBuyShare1h !== null) chips.push(`Taker ${Math.round(d.takerBuyShare1h * 100)}% compra`);
  }
  if (a.crossAsset !== undefined) chips.push(`Corr BTC ${fmtNumber(a.crossAsset.corrBtc48h, 2)}`);
  if (a.cost !== undefined) chips.push(`Mov por custo ${fmtNumber(a.cost.moveToCost, 2)}`);
  return chips;
}

export interface JevIndicatorsProps {
  /** Latest read of the focused instrument, or null when the board has none. */
  read: JevReadView | null;
  /** Browser instant on the local clock. */
  nowMs: number;
  /** Exchange clock minus browser clock, or null when unknown. */
  browserSkewMs: number | null;
  /** Only a ready board can show anything; other statuses leave the line to the Jev strip. */
  boardReady: boolean;
}

export function JevIndicators({ read, nowMs, browserSkewMs, boardReady }: JevIndicatorsProps) {
  if (!boardReady) return null;
  const analysis = read?.state?.analysis;
  if (read === null || read === undefined || analysis === undefined) {
    return (
      <div className={styles.row}>
        <span className={styles.muted}>Indicadores do Inonu indisponiveis. Inicie: bun run analytics</span>
      </div>
    );
  }
  const freshness = readFreshness(readAgeMs(read, nowMs, browserSkewMs));
  const aged = freshness === "stale" || freshness === "unknown" || analysis.ageSec > 180;
  const ago = analysis.ageSec < 60 ? `ha ${analysis.ageSec} s` : `ha ${Math.round(analysis.ageSec / 60)} min`;
  const chips = chipsOf(analysis);
  return (
    <div className={styles.row} data-dim={aged || undefined}>
      <span className={styles.title}>Indicadores do Inonu</span>
      <span className={styles.age}>{ago}{aged ? ", desatualizado" : ""}</span>
      <div className={styles.chips}>
        {chips.map((chip) => (
          <span key={chip} className={styles.chip}>
            {chip}
          </span>
        ))}
      </div>
      <details className={styles.details}>
        <summary className={styles.detailsToggle}>Detalhes</summary>
        <div className={styles.detailsBody}>
          <p className={styles.detailsNote}>Digest tratado em Python sobre a API publica da OKX. Descritivo, nao e decisao.</p>
          <dl className={styles.detailsList}>
            {detailRows(analysis).map((row) => (
              <div key={row.name} className={styles.detailsItem}>
                <dt className={styles.detailsName}>{row.label}</dt>
                <dd className={styles.detailsValue}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}
