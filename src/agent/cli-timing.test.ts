import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliResult, CliRunner } from "./cli";
import { commandName, jsonlTimingSink, withCliTiming, type CliTimingRecord } from "./cli-timing";

const NL = String.fromCharCode(10);
const ok: CliResult = { exitCode: 0, stdout: "saida-secreta", stderr: "", timedOut: false };

function setup(inner: CliRunner["run"], extra: { enabled?: () => boolean } = {}) {
  const records: CliTimingRecord[] = [];
  let t = 0;
  const hr = () => (t += 7);
  const runner = withCliTiming({ run: inner }, { now: () => 1000, hr, sink: (r) => void records.push(r), ...extra });
  return { runner, records };
}

describe("withCliTiming", () => {
  test("mede cada comando à parte e grava só o nome do comando e a duração", async () => {
    const { runner, records } = setup(async () => ok);
    const result = await runner.run(["swap", "execute", "--from", "ENDERECO-SECRETO", "--readable-amount", "12.5"], { timeoutMs: 1000 } as never);
    expect(result).toBe(ok);
    expect(records).toEqual([{ atMs: 1000, command: "swap execute", ms: 7, exitCode: 0, timedOut: false }]);
    const text = JSON.stringify(records);
    expect(text).not.toContain("ENDERECO-SECRETO");
    expect(text).not.toContain("12.5");
    expect(text).not.toContain("saida-secreta");
  });

  test("registra falha e tempo esgotado, e relança a exceção da CLI", async () => {
    const timedOut = setup(async () => ({ exitCode: 1, stdout: "", stderr: "", timedOut: true }));
    await timedOut.runner.run(["swap", "quote"], {} as never);
    expect(timedOut.records[0]).toMatchObject({ command: "swap quote", exitCode: 1, timedOut: true });

    const boom = setup(async () => { throw new Error("binario sumiu"); });
    await expect(boom.runner.run(["wallet", "history"], {} as never)).rejects.toThrow("binario sumiu");
    expect(boom.records[0]).toMatchObject({ command: "wallet history", exitCode: null, timedOut: false });
  });

  test("desligado, passa direto sem medir; sink que lança não muda o resultado", async () => {
    const off = setup(async () => ok, { enabled: () => false });
    expect(await off.runner.run(["swap", "quote"], {} as never)).toBe(ok);
    expect(off.records).toEqual([]);
    const broken = withCliTiming({ run: async () => ok }, { now: () => 1, sink: () => { throw new Error("disco cheio"); } });
    expect(await broken.run(["swap", "quote"], {} as never)).toBe(ok);
  });

  test("commandName guarda no máximo os dois primeiros argumentos", () => {
    expect(commandName(["wallet", "history", "--tx-hash", "0xabc"])).toBe("wallet history");
    expect(commandName(["wallet"])).toBe("wallet");
    expect(commandName([])).toBe("");
  });
});

describe("jsonlTimingSink", () => {
  test("uma linha por comando e, ao passar do limite, guarda só a metade final", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-timing-"));
    try {
      const path = join(dir, "sub", "cli-timing.jsonl");
      const sink = jsonlTimingSink(path, 400);
      for (let i = 0; i < 4; i++) sink({ atMs: i, command: "swap quote", ms: 1, exitCode: 0, timedOut: false });
      expect(readFileSync(path, "utf8").trim().split(NL)).toHaveLength(4);
      for (let i = 4; i < 12; i++) sink({ atMs: i, command: "swap quote", ms: 1, exitCode: 0, timedOut: false });
      const lines = readFileSync(path, "utf8").trim().split(NL).map((l) => JSON.parse(l) as CliTimingRecord);
      expect(lines.at(-1)!.atMs).toBe(11);
      expect(lines[0]!.atMs).toBeGreaterThan(0);
      expect(statSync(path).size).toBeLessThan(900);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
