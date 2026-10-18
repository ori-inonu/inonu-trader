/**
 * Backwards compatible facade of the chart renderer. The implementation moved to
 * `draw-chart.ts`, which generalizes the candle renderer over a bar series so other
 * series types (OHLC bars, line, area today; Heikin Ashi and Renko in phase F2) and the
 * Jev decision layer share one geometry. `drawCandleChart` keeps its name and behaviour:
 * it draws the candle series with no decision markers.
 */

import type { Ctx2DLike } from "./canvas";
import { type CandleChartInput, type ChartGeometry, drawChart } from "./draw-chart";

export {
  bodyWidth,
  candleX,
  type CandleChartInput,
  type CandleLike,
  type ChartGeometry,
  computeGeometry,
  DECISION_LANE_H,
  type HoverPoint,
  type MarkerPoint,
  MAX_SLOT,
  MIN_SLOT,
  niceTicks,
  PAD_TOP,
  type Rect,
  RIGHT_SLOTS,
  TARGET_SLOT,
  TIME_AXIS_H,
  VOLUME_GAP,
} from "./draw-chart";

export function drawCandleChart(ctx: Ctx2DLike, input: CandleChartInput): ChartGeometry {
  return drawChart(ctx, { ...input, kind: input.kind ?? "candles", markers: input.markers ?? [] });
}
