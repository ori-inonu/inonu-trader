// origin: synthetic_fixture, tests only. The shape the command centre takes for a window: which of the stage, the board and the column, the number of columns of the board, and what each shape promises about the size of its smallest label.
import { describe, expect, test } from "bun:test";
import { BOARD_MAX_COLUMNS, BOARD_MIN_FONT, BOARD_MIN_WIDTH, board, boardWidth, COLUMN, layoutKey, legacyLayout, pickLayout, PANEL_W, smallestLabelPx, STAGE, STAGE_MIN_FONT, STAGE_MIN_SCALE, stageScale, stageSize, stickyOffset, TALL_BELOW } from "./draw/layout";

const shape = (w: number, h: number): string => layoutKey(pickLayout(w, h));

describe("the stage is whatever window is wide enough: the whole screen is seen at once, with no scrolling", () => {
  test("every desktop and laptop window gets the stage, from a full screen of 1920 x 1080 down to 960 x 540", () => {
    for (const [w, h] of [[1920, 1080], [2560, 1440], [3840, 2160], [2560, 1080], [3440, 1440], [1920, 1200], [1914, 942], [1914, 1080], [1536, 864], [1440, 900], [1366, 768], [1280, 720], [1280, 1024], [1024, 768], [1024, 640], [960, 540], [1680, 1050], [1920, 945], [2560, 900]] as const) {
      expect(shape(w, h)).toBe("stage");
      expect(stageScale(w, h)).toBeGreaterThanOrEqual(STAGE_MIN_SCALE);
    }
    expect(stageScale(1920, 1080)).toBe(1);
    expect(STAGE_MIN_SCALE).toBe(0.5);
  });

  test("the window of a normal browser with its tab bar (1914 x 942, scale 0.87) fits whole, as the owner expects", () => {
    expect(pickLayout(1914, 942)).toEqual(STAGE);
    expect(stageScale(1914, 942)).toBeCloseTo(0.872, 2);
  });

  test("the stage is fitted by the smaller of the two ratios, centred, and what it promises about its type is its own 9 px times that scale", () => {
    expect(stageScale(1366, 768)).toBeCloseTo(1366 / 1920, 5);
    expect(stageScale(1024, 640)).toBeCloseTo(1024 / 1920, 5);
    expect(smallestLabelPx(STAGE, 1914, 942)).toBeCloseTo(STAGE_MIN_FONT * stageScale(1914, 942), 5);
    expect(smallestLabelPx(STAGE, 960, 540)).toBeCloseTo(4.5, 5);
  });

  test("the size of the stage still grows to the shape of the screen and stays 1920 by 1080 at 16:9", () => {
    expect(stageSize(16 / 9)).toEqual({ w: 1920, h: 1080 });
    expect(stageSize(2.6).w).toBeGreaterThan(1920);
    expect(stageSize(1.33).h).toBeGreaterThan(1080);
    expect(stageSize(5).w).toBe(2600);
  });
});

describe("the board is for what the stage cannot hold: a window that is not wide, or one the stage would shrink below half", () => {
  test("an upright or nearly square window gets the board, with the columns that its width allows", () => {
    expect(shape(1000, 1000)).toBe("board2");
    expect(shape(1080, 1920)).toBe("board2");
    expect(shape(1366, 1366)).toBe("board2");
    expect(shape(1920, 1920)).toBe("board3");
    expect(shape(2560, 2560)).toBe("board4");
    expect(shape(1100, 1000)).toBe("board2");
  });

  test("a very flat window (the stage would be shrunk below half) gets the board too, if it is wide enough for it", () => {
    for (const [w, h] of [[1500, 400], [2000, 300], [1200, 380]] as const) {
      expect(stageScale(w, h)).toBeLessThan(STAGE_MIN_SCALE);
      expect(pickLayout(w, h).kind).toBe("board");
    }
  });

  test("the number of columns of a board stays between two and four whatever the width", () => {
    for (let w = BOARD_MIN_WIDTH; w <= 3000; w += 13) {
      const l = pickLayout(w, w);
      expect(l.kind).toBe("board");
      if (l.kind === "board") {
        expect(l.columns).toBeGreaterThanOrEqual(2);
        expect(l.columns).toBeLessThanOrEqual(BOARD_MAX_COLUMNS);
      }
    }
  });

  test("the board canvas is made of whole panels: n columns of 480, the gaps and the margins", () => {
    expect(boardWidth(2)).toBe(2 * PANEL_W + 28 + 48);
    expect(boardWidth(3) - boardWidth(2)).toBe(PANEL_W + 28);
    expect(board(9)).toEqual({ kind: "board", columns: BOARD_MAX_COLUMNS });
    expect(board(1)).toEqual({ kind: "board", columns: 2 });
  });

  test("every window that gets a board shows its smallest label at about 10 px or more", () => {
    for (let w = BOARD_MIN_WIDTH; w <= 3200; w += 7) {
      const l = pickLayout(w, w);
      expect(l.kind).toBe("board");
      expect(smallestLabelPx(l, w, w)).toBeGreaterThanOrEqual(BOARD_MIN_FONT * 0.95);
    }
  });
});

describe("the column is for narrow windows", () => {
  test("a phone, a tablet held upright and a window too narrow for the stage at half size get it", () => {
    for (const [w, h] of [[390, 844], [820, 1180], [768, 1024], [900, 600], [360, 640], [900, 400]] as const) expect(pickLayout(w, h)).toEqual(COLUMN);
  });

  test("a window under 1000 wide that the stage can still show at half size gets the stage, not the column", () => {
    expect(shape(960, 540)).toBe("stage");
    expect(shape(999, 700)).toBe("stage");
  });
});

describe("a size that cannot be used", () => {
  test("a server render, a hidden pane or a zero-sized window gets the stage, as the screen always did", () => {
    for (const [w, h] of [[Number.NaN, Number.NaN], [0, 0], [-5, 700], [1000, 0], [Number.POSITIVE_INFINITY, 700]] as const) expect(pickLayout(w, h)).toEqual(STAGE);
  });

  test("a caller that knows only the ratio gets the old rule, and the name of a shape changes only with the shape or the number of columns", () => {
    expect(legacyLayout(16 / 9)).toEqual(STAGE);
    expect(legacyLayout(TALL_BELOW - 0.01)).toEqual(COLUMN);
    expect(legacyLayout(TALL_BELOW)).toEqual(STAGE);
    expect(layoutKey(pickLayout(1366, 1366))).toBe(layoutKey(pickLayout(1500, 1500)));
    expect(layoutKey(pickLayout(1366, 1366))).not.toBe(layoutKey(pickLayout(1920, 1920)));
    // the stage does not change name as the window shrinks or grows: it is drawn again only when its shape does
    expect(layoutKey(pickLayout(1914, 942))).toBe(layoutKey(pickLayout(1280, 720)));
  });
});

describe("the tabs that follow the person down the page", () => {
  test("they stay where they are until the page has gone past them, then they keep to the top of the window", () => {
    // the plate of the tabs starts 98 canvas units down; a unit is 1.3 pixels on screen
    expect(stickyOffset(0, 1.3, 98)).toBe(0);
    expect(stickyOffset(100, 1.3, 98)).toBe(0);
    expect(stickyOffset(130, 1.3, 98)).toBeCloseTo(2, 5);
    expect(stickyOffset(1300, 1.3, 98)).toBeCloseTo(902, 5);
  });

  test("a size or a position that cannot be used moves nothing", () => {
    expect(stickyOffset(500, 0, 98)).toBe(0);
    expect(stickyOffset(Number.NaN, 1.3, 98)).toBe(0);
    expect(stickyOffset(500, 1.3, Number.NaN)).toBe(0);
    expect(stickyOffset(-40, 1.3, 98)).toBe(0);
  });
});
