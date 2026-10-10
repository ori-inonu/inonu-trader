import { describe, expect, test } from "bun:test";
import {
  fmtConf, fmtInt, fmtMon, fmtMs, fmtPct, fmtPrice, fmtSigned,
  fmtSignedMon, fmtSignedPct, fmtUsd, hhmmss, shortAddr, shortTx, txUrl, uptime,
} from "./format";

describe("unchanged demo formatter contracts", () => {
  test("keeps full block numbers and six-decimal book prices", () => {
    expect(fmtInt(105416201)).toBe("105,416,201");
    expect(fmtPrice(0.0222354)).toBe("0.022235");
  });

  test("preserves losses and native-asset units instead of hiding signs", () => {
    expect(fmtUsd(0.0045)).toBe("$0.0045");
    expect(fmtUsd(-0.0045)).toBe("-$0.0045");
    expect(fmtMon(0.0213)).toBe("0.021 MON");
    expect(fmtSigned(0.003, 3)).toBe("+0.003");
    expect(fmtSignedMon(-0.0012)).toBe("-0.001 MON");
    expect(fmtSignedPct(0.0012)).toBe("+0.12%");
  });

  test("formats probability and confidence without changing their numeric meaning", () => {
    expect(fmtPct(0.62)).toBe("62%");
    expect(fmtConf(0.62)).toBe("0.62");
    expect(fmtMs(107)).toBe("107 ms");
  });

  test("supports both timestamp units with an injected clock", () => {
    const seconds = 1_700_000_000;
    const milliseconds = seconds * 1000;
    const now = milliseconds + 1000;
    expect(uptime(seconds, now)).toBe("00:00:01");
    expect(uptime(milliseconds, now)).toBe("00:00:01");
    expect(uptime(milliseconds, milliseconds - 1000)).toBe("00:00:00");
  });

  test("does not wrap the elapsed hour counter at a day boundary", () => {
    expect(hhmmss(25 * 60 * 60 * 1000)).toBe("25:00:00");
    expect(hhmmss(-1000)).toBe("00:00:00");
  });

  test("keeps transaction links distinct from shortened display labels", () => {
    expect(shortAddr("0x1234567890abcdef")).toBe("0x1234…cdef");
    expect(shortTx("0x1234567890abcdef")).toBe("0x1234…");
    expect(txUrl("0x1234567890abcdef")).toBe("https://monadvision.com/tx/0x1234567890abcdef");
    expect(shortAddr("0x1234")).toBe("0x1234");
  });
});
