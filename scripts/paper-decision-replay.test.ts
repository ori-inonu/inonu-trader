import { describe, expect, test } from "bun:test";
import { PAPER_REPLAY_INPUT_LIMIT, PAPER_REPLAY_USAGE, runPaperDecisionReplay, type PaperReplayCliIo } from "./paper-decision-replay";

const asset = { chainId: "196", token: "native", decimals: 2, venue: "synthetic" };
const config = { asset, initialAtoms: "1000", maxCommittedAtoms: "2000", maxDrawdownAtoms: "1000" };
const input = (frames: unknown[] = []) => JSON.stringify({ origin: "synthetic_fixture", config, frames });

const io = (read?: (path: string) => Promise<string>) => {
  const calls = { read: [] as string[], out: [] as string[], error: [] as string[] };
  const spy: PaperReplayCliIo = {
    read: async (path) => {
      calls.read.push(path);
      return read === undefined ? input() : read(path);
    },
    out: (text) => {
      calls.out.push(text);
    },
    error: (text) => {
      calls.error.push(text);
    },
  };
  return { calls, spy };
};

describe("synthetic_fixture: paper decision replay CLI", () => {
  test("--help returns 0, emits the usage and never reads a file", async () => {
    const { calls, spy } = io();
    expect(await runPaperDecisionReplay(["--help"], spy)).toBe(0);
    expect(calls.out).toEqual([PAPER_REPLAY_USAGE]);
    expect(calls.error).toEqual([]);
    expect(calls.read).toEqual([]);
  });

  test("no args, --live, unknown flags, extra args and a missing input value each refuse with 2 and read nothing", async () => {
    for (const argv of [[], ["--live"], ["--input"], ["--wat", "x.json"], ["--input", "a.json", "extra"], ["--input", "--live"]]) {
      const { calls, spy } = io();
      expect(await runPaperDecisionReplay(argv, spy)).toBe(2);
      expect(calls.out).toEqual([]);
      expect(calls.error).toEqual([PAPER_REPLAY_USAGE]);
      expect(calls.read).toEqual([]);
    }
  });

  test("a valid synthetic_fixture input replays offline, exits 0 and reports never-executed labels", async () => {
    const { calls, spy } = io();
    expect(await runPaperDecisionReplay(["--input", "fixture.json"], spy)).toBe(0);
    expect(calls.read).toEqual(["fixture.json"]);
    expect(calls.error).toEqual([]);
    const result = JSON.parse(calls.out[0]!);
    expect(result).toMatchObject({ mode: "synthetic-paper", execution: "never", financiallyAuthorized: false, strategyQualified: false, status: "completed" });
    expect(result.capital.balanceAtoms).toBe("1000");
  });

  test("a recorded choice outside the offered candidates exits 1 with choice_invalid", async () => {
    const frame = { id: "f1", atMs: 1, model: "jev-fixture", isMock: true, candidates: [{ id: "p1", asset, inputAtoms: "100", costBudgetAtoms: "0" }], choice: "other", receipt: null };
    const { calls, spy } = io(async () => input([frame]));
    expect(await runPaperDecisionReplay(["--input", "frame.json"], spy)).toBe(1);
    expect(calls.read).toEqual(["frame.json"]);
    const result = JSON.parse(calls.out[0]!);
    expect(result).toMatchObject({ status: "blocked", reason: "choice_invalid" });
  });

  test("malformed JSON and an unreadable input both exit 2 with the constant error, echoing no sensitive marker", async () => {
    const bad = io(async () => "{not json");
    expect(await runPaperDecisionReplay(["--input", "bad.json"], bad.spy)).toBe(2);
    expect(bad.calls.out).toEqual([]);
    expect(bad.calls.error).toEqual(["Entrada invalida ou inacessivel. Nenhum servico externo foi chamado."]);

    const marker = "PRIVATE-KEY-0xDEADBEEF";
    const failing = io(async () => {
      throw new Error(`disk failure ${marker}`);
    });
    expect(await runPaperDecisionReplay(["--input", "secret.json"], failing.spy)).toBe(2);
    expect(failing.calls.out).toEqual([]);
    expect(failing.calls.error).toEqual(["Entrada invalida ou inacessivel. Nenhum servico externo foi chamado."]);
    expect(failing.calls.error.join()).not.toContain(marker);
  });

  test("an oversized body over 1MiB is refused with 2 before any JSON parsing", async () => {
    const { calls, spy } = io(async () => `${input()}${" ".repeat(PAPER_REPLAY_INPUT_LIMIT)}`);
    expect(await runPaperDecisionReplay(["--input", "big.json"], spy)).toBe(2);
    expect(calls.out).toEqual([]);
    expect(calls.error).toEqual(["Entrada invalida ou inacessivel. Nenhum servico externo foi chamado."]);
  });
});
