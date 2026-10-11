/** Layout decision of the derivatives panel from its measured box. Pure, so it can be tested without a browser. */

export interface DerivativesLayout {
  /** Below INLINE_BELOW the grid collapses to one compact run of label and value pairs. */
  readonly inline: boolean;
  readonly includeMid: boolean;
  readonly cells: number;
  readonly cols: number;
  readonly rows: number;
  /** Height available to each cell in px. */
  readonly cellH: number;
  /** True when a cell has room for its explanation line under the number. */
  readonly notes: boolean;
}

const PAD = 24;
const GAP = 8;
/** A cell needs about this much height for a label, a number and a two line note. */
export const NOTE_ROOM = 84;
/** Panel body height under which the four numbers become inline label and value pairs. */
export const INLINE_BELOW = 150;

export function derivativesLayout(width: number, height: number, hasMid: boolean): DerivativesLayout {
  if (height < INLINE_BELOW) {
    return { inline: true, includeMid: false, cells: 4, cols: 4, rows: 1, cellH: height, notes: false };
  }
  const wide = width >= 640;
  const includeMid = hasMid && (wide || height >= 300);
  const cells = includeMid ? 5 : 4;
  const cols = wide ? cells : width >= 250 ? 2 : 1;
  const rows = Math.ceil(cells / cols);
  const cellH = (height - PAD - (rows - 1) * GAP) / rows;
  return { inline: false, includeMid, cells, cols, rows, cellH, notes: cellH >= NOTE_ROOM };
}
