/**
 * Which shape the command centre takes for a window, and the arithmetic of each shape. Pure: the window size comes in, a choice comes out; nothing here touches the document.
 *
 * Three shapes, one rule (the owner's: the whole screen is seen at once, and a window that has to be scrolled is the exception):
 *  - the STAGE is the 1920 x 1080 drawing (it grows to the shape of the screen) fitted to the window with no scrolling, centred. It is used for every window that is at least as wide as it is tall by 1.2 and where the
 *    fit scale (the smaller of width / 1920 and height / 1080) is STAGE_MIN_SCALE (one half) or more: a 960 x 540 window and up at 16:9. The type is smaller the smaller the window (its 9 px at one half is 4.5 px),
 *    which the owner accepts: fitting comes first;
 *  - the BOARD is for what the stage cannot hold: a window that is not wide (a tablet held upright, a nearly square one) or one the stage would shrink below one half. It lays the panels that are 480 wide in the
 *    compact drawing in 2 to 4 columns (each short panel under the shortest column), with the core on top, and it scrolls down. Its labels are never smaller than BOARD_MIN_FONT in its own units, and a column is added
 *    only while the window still shows the board at BOARD_MIN_SCALE or more;
 *  - the COLUMN is one narrow canvas that scrolls down: a phone, or a window under BOARD_MIN_WIDTH that the stage cannot hold.
 */

/** Below this width-to-height ratio the old rule drew a column and above it the stage; it is kept as the rule of a caller that knows only the ratio. */
export const TALL_BELOW = 1.2;

export const STAGE_W = 1920;
export const STAGE_H = 1080;
/** The stage is used while the window shows it at this scale or more (1920 x 1080 shows it at 1; 1914 x 942 at 0.87; 960 x 540 at 0.5). */
export const STAGE_MIN_SCALE = 0.5;
/** The stage's smallest label in its own units. */
export const STAGE_MIN_FONT = 9;

export const PANEL_W = 480;
export const BOARD_GAP = 28;
export const BOARD_MARGIN = 24;
export const BOARD_MAX_COLUMNS = 4;
/** Narrower windows than this (that the stage cannot hold) get the column: two 480 wide panels side by side would be drawn smaller than they can be read. */
export const BOARD_MIN_WIDTH = 1000;
/** Another column is added only while the window still shows the board at this scale or more. */
export const BOARD_MIN_SCALE = 1.15;
/** The smallest label of a panel in the board and in the column, in the units of the panel (the compact drawing is 480 wide). */
export const BOARD_MIN_FONT = 10.5;
export const COLUMN_MIN_FONT = 10.5;

export type LayoutKind = "stage" | "board" | "column";
export type Layout = { readonly kind: "stage" } | { readonly kind: "board"; readonly columns: number } | { readonly kind: "column" };

export const STAGE: Layout = { kind: "stage" };
export const COLUMN: Layout = { kind: "column" };
export const board = (columns: number): Layout => ({ kind: "board", columns: Math.max(2, Math.min(BOARD_MAX_COLUMNS, Math.round(columns))) });

/** The wide stage is 1920 x 1080; on a wider or taller screen it is centred in a bigger canvas. */
export function stageSize(aspect: number): { w: number; h: number } {
  return { w: aspect > 1.78 ? Math.min(2600, 1080 * aspect) : STAGE_W, h: aspect < 1.78 ? STAGE_W / aspect : STAGE_H };
}

/** The canvas width of a board with that many columns of panels. */
export const boardWidth = (columns: number): number => columns * PANEL_W + (columns - 1) * BOARD_GAP + 2 * BOARD_MARGIN;

/** How much the stage is scaled when it is fitted to the window (1 is its own size). */
export function stageScale(width: number, height: number): number {
  const s = stageSize(width / height);
  return Math.min(width / s.w, height / s.h);
}

const usable = (n: number): boolean => Number.isFinite(n) && n > 0;

/** The shape for a window of this size in CSS pixels. A size that cannot be used (a server render, a hidden pane) gets the stage, as the screen always did. */
export function pickLayout(width: number, height: number): Layout {
  if (!usable(width) || !usable(height)) return STAGE;
  if (width / height >= TALL_BELOW && stageScale(width, height) >= STAGE_MIN_SCALE) return STAGE;
  if (width < BOARD_MIN_WIDTH) return COLUMN;
  let columns = 2;
  while (columns < BOARD_MAX_COLUMNS && width / boardWidth(columns + 1) >= BOARD_MIN_SCALE) columns++;
  return board(columns);
}

/** The shape a caller that knows only the ratio gets: the stage for a wide window, the column for a tall one. */
export const legacyLayout = (aspect: number): Layout => (aspect < TALL_BELOW ? COLUMN : STAGE);

/** A name that changes when the page has to be drawn again from scratch (another shape or another number of columns), and not when the window only grows or shrinks inside the same shape. */
export const layoutKey = (l: Layout): string => (l.kind === "board" ? `board${l.columns}` : l.kind);

/**
 * How far the tabs of a scene that scrolls are moved down so that they keep to the top of the window: the page has gone `scrollTop` pixels, a canvas unit is `unit` pixels on screen, and `top` is where the plate
 * of the tabs starts in the canvas. Zero until the tabs would leave the window.
 */
export function stickyOffset(scrollTop: number, unit: number, top: number): number {
  if (!(unit > 0) || !Number.isFinite(scrollTop) || !Number.isFinite(top)) return 0;
  return Math.max(0, scrollTop / unit - top);
}

/** The size, on screen, of the smallest label a layout draws, for a window of that size (what `pickLayout` promises to keep readable). */
export function smallestLabelPx(layout: Layout, width: number, height: number): number {
  if (layout.kind === "stage") return STAGE_MIN_FONT * stageScale(width, height);
  if (layout.kind === "board") return BOARD_MIN_FONT * (width / boardWidth(layout.columns));
  return COLUMN_MIN_FONT * (640 / PANEL_W) * (width / 720);
}
