/** Places panels of equal width into columns, each one under the column that is shortest at that moment (a masonry). Pure: sizes in, positions out. */

export interface PackItem {
  readonly name: string;
  readonly h: number;
}

export interface Placed {
  readonly name: string;
  /** The column, counted from the left. */
  readonly col: number;
  /** The top of the panel, from the top of the board. */
  readonly y: number;
  readonly h: number;
}

/**
 * The panels are placed in the order given (the first ones are the ones that matter most, so they land at the top); a tie goes to the leftmost column. `top` is where the columns start and `gap` the space left
 * under each panel. `bottom` is the lowest edge of any panel (without the last gap).
 */
export function pack(items: readonly PackItem[], columns: number, top: number, gap: number): { placed: Placed[]; bottom: number } {
  const n = Math.max(1, Math.floor(columns));
  const ends = new Array<number>(n).fill(top);
  const placed: Placed[] = [];
  for (const it of items) {
    let col = 0;
    for (let c = 1; c < n; c++) if (ends[c]! < ends[col]!) col = c;
    placed.push({ name: it.name, col, y: ends[col]!, h: it.h });
    ends[col] = ends[col]! + it.h + gap;
  }
  const bottom = placed.length === 0 ? top : Math.max(...placed.map((p) => p.y + p.h));
  return { placed, bottom };
}
