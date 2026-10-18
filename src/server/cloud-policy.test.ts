import { expect, test } from "bun:test";
import { createCloudPolicyRunner } from "./cloud-policy";
import type { CliResult, CliRunner } from "../agent/cli";

const result = (data: unknown, ok = true): CliResult => ({ stdout: JSON.stringify({ ok, data }), stderr: "", exitCode: ok ? 0 : 1, timedOut: false });
const good = { singleTxFlag: true, singleTxLimit: "25", dailyTradeTxFlag: true, dailyTradeTxLimit: "100", dailyTransferTxFlag: true, dailyTransferTxLimit: "0" };
const options = { timeoutMs: 1000, signal: new AbortController().signal };

test("H05: missing, disabled, loose and unreadable owner policy never sends a swap", async () => {
  for (const policy of [null, {}, { ...good, singleTxFlag: false }, { ...good, singleTxLimit: "0" }, { ...good, singleTxLimit: "1000" }, { ...good, dailyTradeTxLimit: "3000" }, { ...good, dailyTransferTxFlag: false }]) {
    const calls: string[][] = [];
    const inner: CliRunner = { run: async (args) => { calls.push([...args]); return result({ loggedIn: true, policy }); } };
    const runner = createCloudPolicyRunner(inner);
    await expect(runner.run(["swap", "execute"], options)).rejects.toThrow("comando_recusado");
    expect(calls).toEqual([["wallet", "status"]]);
    expect(runner.status().allowed).toBe(false);
  }
});

test("H06: policy is read again immediately before execute, independently of a previous successful quote", async () => {
  let policy = good;
  const calls: string[][] = [];
  const runner = createCloudPolicyRunner({ run: async (args) => { calls.push([...args]); return args[0] === "wallet" ? result({ loggedIn: true, policy }) : result({ action: "ok" }); } });
  await runner.run(["swap", "quote"], options);
  policy = { ...good, dailyTradeTxFlag: false };
  await expect(runner.run(["swap", "execute"], options)).rejects.toThrow("comando_recusado");
  expect(calls).toEqual([["wallet", "status"], ["swap", "quote"], ["wallet", "status"]]);
});

test("valid policy allows the command, while read and login commands need no policy", async () => {
  const calls: string[][] = [];
  const runner = createCloudPolicyRunner({ run: async (args) => { calls.push([...args]); return result({ loggedIn: true, policy: good }); } });
  await runner.run(["wallet", "login", "--phase", "poll"], options);
  await runner.run(["swap", "execute"], options);
  expect(calls).toEqual([["wallet", "login", "--phase", "poll"], ["wallet", "status"], ["swap", "execute"]]);
  expect(runner.status().allowed).toBe(true);
});

test("cancel during the policy check cannot send the command", async () => {
  const abort = new AbortController();
  const calls: string[][] = [];
  const runner = createCloudPolicyRunner({ run: async (args) => { calls.push([...args]); abort.abort(); return result({ loggedIn: true, policy: good }); } });
  await expect(runner.run(["swap", "execute"], { ...options, signal: abort.signal })).rejects.toThrow("comando_recusado");
  expect(calls).toHaveLength(1);
});
