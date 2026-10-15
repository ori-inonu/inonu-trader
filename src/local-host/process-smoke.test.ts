import { expect, test } from "bun:test";
import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { superviseLocal } from "./supervisor";
import { waitLocal } from "./main";
import { LOCAL_STOP_MESSAGE } from "./protocol";

async function until(file: string, predicate: (value: unknown) => boolean): Promise<unknown> {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    try { const value: unknown = await Bun.file(file).json(); if (predicate(value)) return value; } catch { /* fixture is being written */ }
    await Bun.sleep(30);
  }
  throw new Error("synthetic_process_timeout");
}

function cleanup(dir: string, files: readonly string[]) {
  // Only the named fixture files in our freshly created temp directory; no recursive deletion.
  for (const file of files) try { unlinkSync(join(dir, file)); } catch { /* partial fixture */ }
  try { rmdirSync(dir); } catch { /* preserve unexpected files */ }
}

test("a real detached synthetic child survives its launcher closing on this OS", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-local-detached-synthetic-"));
  const parentPath = join(dir, "parent.ts");
  const childPath = join(dir, "child.ts");
  const proofPath = join(dir, "proof.json");
  await Bun.write(childPath, `await Bun.sleep(900); await Bun.write(Bun.argv[2]!, JSON.stringify({synthetic:true, survived:true}));`);
  await Bun.write(parentPath, `const c=Bun.spawn([process.execPath,"--no-env-file",Bun.argv[2]!,Bun.argv[3]!],{detached:true,windowsHide:true,stdio:["ignore","ignore","ignore"]});c.unref();`);
  const parent = Bun.spawn([process.execPath, "--no-env-file", parentPath, childPath, proofPath], { cwd: dir, windowsHide: true, stdio: ["ignore", "ignore", "ignore"] });
  try {
    expect(await parent.exited).toBe(0);
    expect(await until(proofPath, (value) => (value as { survived?: unknown })?.survived === true)).toEqual({ synthetic: true, survived: true });
  } finally {
    if (parent.exitCode === null) { parent.kill(); await parent.exited; }
    cleanup(dir, ["parent.ts", "child.ts", "proof.json"]);
  }
}, 10_000);

test("the supervisor restarts an exited real synthetic process and stops only its own replacement", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-local-retry-synthetic-"));
  const fixture = join(dir, "child.ts");
  const report = join(dir, "count.json");
  await Bun.write(fixture, `const f=Bun.file(Bun.argv[2]!);const n=(await f.exists()?Number(await f.text()):0)+1;await Bun.write(Bun.argv[2]!,JSON.stringify(n));if(n===1)process.exit(1);process.on("message",async(m:any)=>{if(m?.kind!=="INONU_LOCAL_STOP_V1")return;await Bun.sleep(50);await Bun.write(Bun.argv[3]!,JSON.stringify({synthetic:true,drained:true}));process.exit(0)});await Bun.sleep(10000);`);
  const controller = new AbortController();
  const children: Bun.Subprocess<"ignore", "ignore", "ignore">[] = [];
  const supervision = superviseLocal({
    probe: async () => "absent",
    spawn() {
      const child = Bun.spawn([process.execPath, "--no-env-file", fixture, report, join(dir, "drained.json")], { cwd: dir, windowsHide: true, stdio: ["ignore", "ignore", "ignore"], ipc: () => {} });
      children.push(child);
      return { exited: child.exited, stop: async () => { child.send(LOCAL_STOP_MESSAGE); } };
    },
    wait: (_ms, signal) => waitLocal(40, signal), // accelerated infrastructure fixture, no core or provider
    report: () => {},
  }, controller.signal);
  try {
    await until(report, (value) => value === 2);
    expect(children).toHaveLength(2);
    expect(children[0]!.exitCode).toBe(1);
    expect(children[1]!.exitCode).toBeNull();
    controller.abort();
    expect(await supervision).toBe("stopped");
    expect(children[1]!.signalCode).toBeNull();
    expect(children[1]!.exitCode).toBe(0);
    expect(await Bun.file(join(dir, "drained.json")).json()).toEqual({ synthetic: true, drained: true });
    expect(children).toHaveLength(2);
  } finally {
    controller.abort();
    for (const child of children) if (child.exitCode === null) { child.kill(); await child.exited; }
    await supervision;
    cleanup(dir, ["child.ts", "count.json", "drained.json"]);
  }
}, 10_000);
