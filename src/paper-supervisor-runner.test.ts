import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PaperCapital, type PaperReceipt } from "./paper-capital";
import {
  PaperSupervisor,
  assertFreshIntakeCapacity,
  canonicalEnvelope,
  mandatoryGenerationBudget,
  sealEnvelope,
  validateEnvelope,
  type PaperSupervisorAdapter,
  type PaperSupervisorEnvelope,
  type PaperSupervisorStage,
} from "./paper-supervisor";
import { SqlitePaperSupervisorStore } from "./paper-supervisor-store";
import { parsePaperSupervisorArgs, PAPER_FIXTURE_ADAPTER_ID, PAPER_FIXTURE_CONFIG, PAPER_FIXTURE_PLAN, runPaperSupervisor } from "./paper-supervisor-runner";

const BUN = "C:/Users/gabri/.bun/bin/bun.exe";
const RUNNER = join(import.meta.dir, "paper-supervisor-runner.ts");
const CANDIDATE = join(import.meta.dir, "..");
const CURATED_ENV = {
  SystemRoot: "C:\\Windows",
  WINDIR: "C:\\Windows",
  TEMP: "C:\\Users\\gabri\\AppData\\Local\\Temp",
  TMP: "C:\\Users\\gabri\\AppData\\Local\\Temp",
  PATH: "C:\\Program Files\\nodejs;C:\\Users\\gabri\\.bun\\bin;C:\\Windows\\System32",
};
const roots: string[] = [];
const children: ChildProcess[] = [];
const baseArgs = (mode: "create" | "resume", stateDir: string, fixture = "gain") => [
  "--mode", mode, "--state-dir", stateDir, "--fixture", fixture,
  "--max-ticks", "3", "--max-duration-ms", "2000", "--cadence-ms", "20",
  "--adapter-timeout-ms", "250", "--drain-timeout-ms", "250",
];

type JsonLine = Record<string, unknown>;
type Controlled = {
  child: ChildProcess;
  pid: number;
  argv: string[];
  next(predicate: (line: JsonLine) => boolean, timeoutMs: number): Promise<JsonLine>;
  close(timeoutMs: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  killAndClose(timeoutMs?: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  jsonLines: number;
  stdout: string;
  stderr: string;
};

function newRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "paper-supervisor-runner-"));
  roots.push(root);
  return root;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function bounded<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(code)), timeoutMs); }),
  ]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

function spawnJson(argv: string[], cwd = CANDIDATE): Controlled {
  const child = spawn(BUN, ["--no-env-file", "--no-install", ...argv], { cwd, env: CURATED_ENV, stdio: ["pipe", "pipe", "pipe"] });
  children.push(child);
  if (!child.pid) throw new Error("child_pid_missing");
  const actualPid = child.pid;
  const actualArgv = [BUN, "--no-env-file", "--no-install", ...argv];
  const messages: JsonLine[] = [];
  const waiters: Array<{ predicate: (line: JsonLine) => boolean; resolve: (line: JsonLine) => void }> = [];
  let stdout = "";
  let stderr = "";
  let buffer = "";
  let jsonLines = 0;
  let closeResult: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
    if (Buffer.byteLength(stdout, "utf8") > 64 * 1024) { child.kill(); return; }
    buffer += chunk.toString("utf8");
    while (buffer.includes("\n")) {
      const split = buffer.indexOf("\n");
      const raw = buffer.slice(0, split).trim();
      buffer = buffer.slice(split + 1);
      if (!raw) continue;
      let parsed: JsonLine;
      try { parsed = JSON.parse(raw) as JsonLine; } catch { continue; }
      jsonLines++;
      const index = waiters.findIndex((waiter) => waiter.predicate(parsed));
      if (index >= 0) waiters.splice(index, 1)[0]!.resolve(parsed);
      else messages.push(parsed);
      if (messages.length > 32) { child.kill(); return; }
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (Buffer.byteLength(stderr, "utf8") > 64 * 1024) child.kill();
  });
  child.once("close", (code, signal) => { closeResult = { code, signal }; });
  const next = async (predicate: (line: JsonLine) => boolean, timeoutMs: number): Promise<JsonLine> => {
    const existingIndex = messages.findIndex(predicate);
    if (existingIndex >= 0) return messages.splice(existingIndex, 1)[0]!;
    try { return await bounded(new Promise<JsonLine>((resolve) => waiters.push({ predicate, resolve })), timeoutMs, "child_handshake_timeout"); }
    catch (error) { throw new Error(`${String(error)};child_pid=${actualPid};exit=${closeResult?.code ?? "running"};stdout=${stdout.slice(-2048)};stderr=${stderr.slice(-2048)}`); }
  };
  const close = (timeoutMs: number) => bounded(new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    if (closeResult) resolve(closeResult);
    else child.once("close", (code, signal) => resolve({ code, signal }));
  }), timeoutMs, "child_exit_timeout");
  const killAndClose = async (timeoutMs = 2_000) => {
    if (!closeResult) child.kill("SIGTERM");
    return close(timeoutMs);
  };
  return {
    child, pid: actualPid, argv: actualArgv,
    next, close, killAndClose,
    get jsonLines() { return jsonLines; },
    get stdout() { return stdout; }, get stderr() { return stderr; },
  };
}

function sourceForControlledChild(input: {
  args: string[];
  runId: string;
  pauseCoreStage?: PaperSupervisorStage;
  pauseFixtureStage?: "execute_entered" | "effect_committed";
  proof?: { token: string; pid: number };
  captureStages?: boolean;
  trackActivity?: boolean;
}): string {
  const moduleUrl = pathToFileURL(RUNNER).href;
  const proof = input.proof ? `recoverOwner:{expectedToken:${JSON.stringify(input.proof.token)},expectedPid:${input.proof.pid},verifyExited:(owner)=>owner.token===${JSON.stringify(input.proof.token)}&&owner.pid===${input.proof.pid}},` : "";
  const corePause = input.pauseCoreStage ? `if(stage===${JSON.stringify(input.pauseCoreStage)}) await gate({kind:"handshake",runId:${JSON.stringify(input.runId)},pid:process.pid,argv:process.argv,stage,owner:envelope.owner,generation:envelope.generation,envelopeSha256:envelope.sha256,attempts:envelope.attempts.map((item)=>({attemptId:item.attemptId,planId:item.planId,phase:item.phase})),capitalEvents:envelope.capital.events.length});` : "";
  const fixturePause = input.pauseFixtureStage ? `if(stage===${JSON.stringify(input.pauseFixtureStage)}) await gate({kind:"handshake",runId:${JSON.stringify(input.runId)},pid:process.pid,argv:process.argv,stage,attemptId:detail.attemptId,evidenceId:detail.evidenceId,effectCount:detail.effectCount});` : "";
  const captureStages = input.captureStages ? "const capturedStages=[];" : "const capturedStages=null;";
  const activityCapture = input.trackActivity ? "const fixtureActivity=[];" : "const fixtureActivity=null;";
  return `
const {runPaperSupervisor}=await import(${JSON.stringify(moduleUrl)});
const args=${JSON.stringify(input.args)};
${captureStages}
${activityCapture}
const gate=async(record)=>{process.stdout.write(JSON.stringify(record)+"\\n");await new Promise((resolve)=>process.stdin.once("data",resolve));};
const testHooks={
 onStage:async(stage,envelope)=>{if(capturedStages)capturedStages.push({stage,generation:envelope.generation,envelopeSha256:envelope.sha256,owner:envelope.owner,hold:envelope.hold,capitalEvents:envelope.capital.events.length,attempts:envelope.attempts.map((item)=>({attemptId:item.attemptId,phase:item.phase,observation:item.observation}))});${corePause}},
 onFixtureStage:async(stage,detail)=>{${fixturePause}}
};
const dependencies={${proof}testHooks,...(fixtureActivity?{onFixtureActivity:(kind,attemptId,count)=>fixtureActivity.push({kind,attemptId,count})}:{})};
const result=await runPaperSupervisor(args,dependencies);
process.stdout.write(JSON.stringify({kind:"result",runId:${JSON.stringify(input.runId)},pid:process.pid,argv:process.argv,exitCode:result.exitCode,output:result.output,stages:capturedStages,fixtureActivity})+"\\n");
process.exitCode=result.exitCode;
`;
}

function spawnControlled(input: Parameters<typeof sourceForControlledChild>[0]): Controlled {
  const generatedDir = newRoot();
  const entry = join(generatedDir, `child-${input.runId}.ts`);
  writeFileSync(entry, sourceForControlledChild(input), { encoding: "utf8", flag: "wx" });
  return spawnJson([entry], CANDIDATE);
}

function directRunner(args: string[]): Controlled {
  return spawnJson([RUNNER, ...args], CANDIDATE);
}

function isResultLine(message: JsonLine): boolean {
  return message.kind === "result" || "mode" in message || "error" in message;
}

function assertJsonResult(message: JsonLine): { output: Record<string, unknown>; exitCode: number | null } {
  if (message.kind === "result") return { output: message.output as Record<string, unknown>, exitCode: message.exitCode as number };
  return { output: message, exitCode: null };
}

function diskSnapshot(stateDir: string): { row: { generation: number; envelope: PaperSupervisorEnvelope; envelopeJson: string }; effectCount: number; effects: Array<Record<string, unknown>> } {
  const db = new Database(join(stateDir, "supervisor.sqlite"), { readonly: true });
  const row = db.query("SELECT generation,envelope_json FROM supervisor_state WHERE id=1").get() as { generation: number; envelope_json: string };
  db.close();
  let effectCount = 0;
  let effects: Array<Record<string, unknown>> = [];
  const fixturePath = join(stateDir, "fixture.sqlite");
  if (existsSync(fixturePath)) {
    const fixture = new Database(fixturePath, { readonly: true });
    effectCount = Number((fixture.query("SELECT COUNT(*) AS count FROM fixture_effects").get() as { count: number }).count);
    effects = fixture.query("SELECT attempt_id,plan_sha256,evidence_id,receipt_json FROM fixture_effects ORDER BY attempt_id").all() as Array<Record<string, unknown>>;
    fixture.close();
  }
  return { row: { generation: row.generation, envelope: JSON.parse(row.envelope_json) as PaperSupervisorEnvelope, envelopeJson: row.envelope_json }, effectCount, effects };
}

function writeEnvelope(stateDir: string, envelope: PaperSupervisorEnvelope): void {
  const db = new Database(join(stateDir, "supervisor.sqlite"));
  const result = db.query("UPDATE supervisor_state SET generation=?, envelope_json=?, owner_token=?, owner_pid=? WHERE id=1").run(
    envelope.generation,
    canonicalEnvelope(envelope),
    envelope.owner?.token ?? null,
    envelope.owner?.pid ?? null,
  );
  db.close();
  expect(result.changes).toBe(1);
}

function resealEnvelope(envelope: PaperSupervisorEnvelope, changes: Partial<Omit<PaperSupervisorEnvelope, "sha256">>): PaperSupervisorEnvelope {
  const { sha256: _oldHash, ...body } = envelope;
  return sealEnvelope({ ...body, ...changes });
}

function makeIntentEnvelope(source: PaperSupervisorEnvelope, generation: number, owner: PaperSupervisorEnvelope["owner"] = null): PaperSupervisorEnvelope {
  const capital = new PaperCapital(PAPER_FIXTURE_CONFIG);
  capital.reserve(PAPER_FIXTURE_PLAN);
  capital.start(PAPER_FIXTURE_PLAN.id);
  const prior = source.attempts[0];
  if (!prior) throw new Error("capacity_source_attempt_missing");
  return resealEnvelope(source, {
    generation,
    owner,
    capital: capital.checkpoint(),
    attempts: [{ ...prior, phase: "intent", observation: null }],
    hold: null,
  });
}

function makeObservedEnvelope(source: PaperSupervisorEnvelope, generation: number, observation: { evidenceId: string; receipt: PaperReceipt }, owner: PaperSupervisorEnvelope["owner"] = null): PaperSupervisorEnvelope {
  const capital = new PaperCapital(PAPER_FIXTURE_CONFIG);
  capital.reserve(PAPER_FIXTURE_PLAN);
  capital.start(PAPER_FIXTURE_PLAN.id);
  const prior = source.attempts[0];
  if (!prior) throw new Error("capacity_source_attempt_missing");
  return resealEnvelope(source, {
    generation,
    owner,
    capital: capital.checkpoint(),
    attempts: [{ ...prior, phase: "observed", observation }],
    hold: null,
  });
}

async function createPublicState(fixture: "gain" | "pending" | "incomplete-cost" = "pending"): Promise<{ stateDir: string; source: PaperSupervisorEnvelope; disk: ReturnType<typeof diskSnapshot> }> {
  const stateDir = join(newRoot(), `capacity-source-${fixture}`);
  const child = directRunner(baseArgs("create", stateDir, fixture));
  const message = assertJsonResult(await child.next(isResultLine, 3_000));
  const exited = await child.close(2_000);
  const disk = diskSnapshot(stateDir);
  expect(exited.code).toBe(fixture === "gain" ? 0 : 2);
  expect(child.jsonLines).toBe(1);
  expect(message.exitCode).toBeNull();
  return { stateDir, source: disk.row.envelope, disk };
}

afterEach(async () => {
  const cleanupFailures: string[] = [];
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill("SIGTERM"); } catch { /* retain test failure while attempting bounded cleanup */ }
      const exited = await Promise.race([
        new Promise<boolean>((resolve) => child.once("close", () => resolve(true))),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000)),
      ]);
      if (!exited) cleanupFailures.push(`child_exit_timeout:${child.pid ?? "unknown"}`);
    }
  }
  if (cleanupFailures.length === 0) {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  } else {
    throw new Error(cleanupFailures.join(","));
  }
});

describe("offline paper supervisor runner", () => {
  test("imports inertly in a child process without listeners or filesystem effects", async () => {
    const root = newRoot();
    const forbiddenState = join(root, "must-not-exist");
    const moduleUrl = pathToFileURL(RUNNER).href;
    const source = `
const before=[process.listenerCount("SIGINT"),process.listenerCount("SIGTERM"),process.listenerCount("uncaughtException")];
const module=await import(${JSON.stringify(moduleUrl)});
const after=[process.listenerCount("SIGINT"),process.listenerCount("SIGTERM"),process.listenerCount("uncaughtException")];
process.stdout.write(JSON.stringify({kind:"inert-import",exports:Object.keys(module).sort(),before,after,targetExists:require("node:fs").existsSync(${JSON.stringify(forbiddenState)})})+"\\n");
`;
    const child = spawnJson(["-e", source]);
    const result = await child.next((message) => message.kind === "inert-import", 3_000);
    const exited = await child.close(2_000);
    expect(exited).toEqual({ code: 0, signal: null });
    expect(child.jsonLines).toBe(1);
    expect(child.stdout.split(/\r?\n/).filter(Boolean)).toHaveLength(1);
    expect(child.stderr).toBe("");
    expect(result.exports).toContain("parsePaperSupervisorArgs");
    expect(result.exports).toContain("runPaperSupervisor");
    expect(result.after).toEqual(result.before);
    expect(result.targetExists).toBe(false);
    expect(existsSync(forbiddenState)).toBe(false);
  });

  test("each malformed public CLI invocation emits one result and makes no state files", async () => {
    const invalid = [
      [],
      ["--mode", "create", "--state-dir", "STATE", "--fixture", "gain", "--fixture", "gain"],
      ["--mode", "create", "--state-dir", "STATE", "--fixture", "gain", "--unknown", "1"],
      ["--mode", "create", "--state-dir", "STATE", "--fixture", "unknown-fixture"],
      ["--mode", "create", "--state-dir", "STATE", "--fixture", "gain", "--max-ticks", "03"],
      ["--mode", "create", "--state-dir", "STATE", "--fixture", "gain", "--max-ticks", "NaN"],
      ["--mode", "create", "--state-dir", "STATE", "--fixture", "gain", "--max-ticks", "21"],
      ["--mode", "create", "--state-dir", "relative-state", "--fixture", "gain"],
      ["--help", "extra"],
    ];
    for (let index = 0; index < invalid.length; index++) {
      const stateDir = join(newRoot(), `malformed-${index}`);
      const argv = invalid[index]!.map((value) => value === "STATE" ? stateDir : value);
      const child = directRunner(argv);
      const result = await child.next(isResultLine, 3_000);
      const exited = await child.close(2_000);
      expect(exited).toEqual({ code: 1, signal: null });
      expect(child.jsonLines).toBe(1);
      expect(child.stdout.split(/\r?\n/).filter(Boolean)).toHaveLength(1);
      expect(child.stderr).toBe("");
      expect(result).toEqual({ ok: false, error: "invalid_arguments" });
      expect(existsSync(stateDir)).toBe(false);
      expect(existsSync(join(stateDir, "supervisor.sqlite"))).toBe(false);
      expect(existsSync(join(stateDir, "fixture.sqlite"))).toBe(false);
    }
  });

  test("parses exact bounded flags and rejects malformed invocations before side effects", async () => {
    const stateDir = join(newRoot(), "must-not-exist");
    const parsed = parsePaperSupervisorArgs([
      "--mode", "create", "--state-dir", stateDir, "--fixture", "gain", "--max-ticks", "3",
      "--max-duration-ms", "2000", "--cadence-ms", "20", "--adapter-timeout-ms", "250", "--drain-timeout-ms", "250",
    ]);
    expect(parsed).toMatchObject({ kind: "run", mode: "create", fixture: "gain", limits: {
      maxTicks: 3, maxDurationMs: 2000, cadenceMs: 20, adapterTimeoutMs: 250, drainTimeoutMs: 250,
    } });
    expect(parsePaperSupervisorArgs(["--help"]).kind).toBe("help");
    for (const args of [
      ["--mode", "create", "--state-dir", stateDir, "--fixture", "gain", "--fixture", "loss"],
      ["--mode", "create", "--state-dir", stateDir, "--fixture", "gain", "--other", "1"],
      ["--mode", "create", "--state-dir", stateDir, "--fixture", "gain", "extra"],
      ["--mode", "create", "--state-dir", stateDir, "--fixture", "bad"],
      ["--mode", "resume", "--state-dir", stateDir, "--fixture", "gain", "--max-ticks", "03"],
      ["--mode", "resume", "--state-dir", stateDir, "--fixture", "gain", "--max-ticks", "-1"],
      ["--mode", "resume", "--state-dir", stateDir, "--fixture", "gain", "--max-ticks", "NaN"],
      ["--mode", "resume", "--state-dir", stateDir, "--fixture", "gain", "--adapter-timeout-ms", "2001"],
    ]) expect(() => parsePaperSupervisorArgs(args)).toThrow();
    let adapterCalls = 0;
    const invalid = await runPaperSupervisor(["--mode", "create", "--state-dir", stateDir, "--fixture", "bad"], { onFixtureActivity: () => { adapterCalls++; } });
    expect(invalid.exitCode).toBe(1);
    expect(adapterCalls).toBe(0);
    expect(existsSync(stateDir)).toBe(false);
    expect((await runPaperSupervisor(["--help"])).exitCode).toBe(0);
  });

  test("ordinary public create and resume use real child processes and preserve one fixture effect", async () => {
    const stateDir = join(newRoot(), "ordinary-state");
    const create = directRunner(baseArgs("create", stateDir));
    const createResult = assertJsonResult(await create.next(isResultLine, 3_000));
    const createExit = await create.close(2_000);
    const first = diskSnapshot(stateDir);
    expect(createExit.code).toBe(0);
    expect(create.jsonLines).toBe(1);
    expect(create.pid).toBeGreaterThan(0);
    expect(createResult.output.status).toMatchObject({ capital: { balanceAtoms: "1015", realizedNetAtoms: "15", committedAtoms: "0" }, ownerReleased: true });
    expect(first.row.envelope.owner).toBeNull();
    expect(first.row.envelope.generation).toBe(5);
    expect(first.effectCount).toBe(1);

    const resume = directRunner(baseArgs("resume", stateDir));
    const resumeResult = assertJsonResult(await resume.next(isResultLine, 3_000));
    const resumeExit = await resume.close(2_000);
    const second = diskSnapshot(stateDir);
    expect(resumeExit.code).toBe(0);
    expect(resume.jsonLines).toBe(1);
    expect(resume.pid).not.toBe(create.pid);
    expect(resumeResult.output.status).toMatchObject({ capital: { balanceAtoms: "1015", realizedNetAtoms: "15", committedAtoms: "0" } });
    expect(second.effectCount).toBe(1);
    expect(second.row.envelope.capital.events.filter((event) => event.type === "settle")).toHaveLength(1);
    console.log(`PAPER_SUPERVISOR_C7 ${JSON.stringify({ create: { pid: create.pid, argv: create.argv, exitCode: createExit.code, generation: first.row.generation, envelopeSha256: first.row.envelope.sha256 }, resume: { pid: resume.pid, argv: resume.argv, exitCode: resumeExit.code, generation: second.row.generation, envelopeSha256: second.row.envelope.sha256 }, effectCount: second.effectCount, balanceAtoms: PaperCapital.restore(second.row.envelope.capital).snapshot().balanceAtoms })}`);
  });

  test("runs fixed loss, pending, unknown, and incomplete-cost fixtures with held accounting", async () => {
    const evidence: unknown[] = [];
    for (const fixture of ["loss", "pending", "unknown", "incomplete-cost"] as const) {
      const stateDir = join(newRoot(), `fixture-${fixture}`);
      const child = directRunner(baseArgs("create", stateDir, fixture));
      const result = assertJsonResult(await child.next(isResultLine, 3_000));
      const exited = await child.close(2_000);
      const disk = diskSnapshot(stateDir);
      const snapshot = PaperCapital.restore(disk.row.envelope.capital).snapshot();
      console.log(`PAPER_SUPERVISOR_FIXTURE_DEBUG ${JSON.stringify({ fixture, pid: child.pid, argv: child.argv, message: result, exit: exited, stdout: child.stdout, stderr: child.stderr, generation: disk.row.generation, attemptPhases: disk.row.envelope.attempts.map((attempt) => attempt.phase), hold: disk.row.envelope.hold, balanceAtoms: snapshot.balanceAtoms, committedAtoms: snapshot.committedAtoms })}`);
      if (fixture === "loss") {
        expect(exited.code).toBe(0);
        expect(snapshot.balanceAtoms).toBe("985");
        expect(snapshot.realizedNetAtoms).toBe("-15");
        expect(disk.effectCount).toBe(1);
      } else {
        expect(exited.code).toBe(2);
        expect(snapshot.balanceAtoms).toBe("1000");
        expect(snapshot.committedAtoms).toBe("110");
        expect(snapshot.recoveryRequired).toBe(true);
        if (fixture === "incomplete-cost") expect(snapshot.stopReason).toBe("unknown_cost");
        if (fixture === "pending" || fixture === "unknown") expect(disk.effectCount).toBe(0);
      }
      expect(result.exitCode).toBeNull();
      expect(child.jsonLines).toBe(1);
      evidence.push({ fixture, pid: child.pid, argv: child.argv, exitCode: exited.code, generation: disk.row.generation, envelopeSha256: disk.row.envelope.sha256, effectCount: disk.effectCount, balanceAtoms: snapshot.balanceAtoms, committedAtoms: snapshot.committedAtoms, stopReason: snapshot.stopReason });
    }
    console.log(`PAPER_SUPERVISOR_FIXTURES ${JSON.stringify(evidence)}`);
  });

  test("recovers C1-C5 only after actual child exit and checks independent disk state before termination", async () => {
    const cases: Array<{ name: string; stage: PaperSupervisorStage | "effect_committed"; kind: "core" | "fixture" }> = [
      { name: "C1", stage: "reserved_saved", kind: "core" },
      { name: "C2", stage: "intent_saved", kind: "core" },
      { name: "C3", stage: "effect_committed", kind: "fixture" },
      { name: "C4", stage: "observation_saved", kind: "core" },
      { name: "C5", stage: "settled_saved", kind: "core" },
    ];
    const records: unknown[] = [];
    for (const item of cases) {
      const runId = `${item.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const stateDir = join(newRoot(), `${item.name}-state`);
      const child = spawnControlled({
        args: baseArgs("create", stateDir),
        runId,
        ...(item.kind === "core" ? { pauseCoreStage: item.stage as PaperSupervisorStage } : { pauseFixtureStage: item.stage as "effect_committed" }),
      });
      const handshake = await child.next((line) => line.kind === "handshake" && line.runId === runId, 3_000);
      const before = diskSnapshot(stateDir);
      expect(handshake.pid).toBe(child.pid);
      expect(handshake.runId).toBe(runId);
    if (item.kind === "core") {
      expect(handshake.generation).toBe(before.row.generation);
      expect(handshake.envelopeSha256).toBe(before.row.envelope.sha256);
    }
      if (item.name === "C1") {
        expect(before.row.envelope.capital.events.at(-1)?.type).toBe("reserve");
        expect(before.row.envelope.attempts).toEqual([]);
        expect(before.effectCount).toBe(0);
        expect(PaperCapital.restore(before.row.envelope.capital).snapshot()).toMatchObject({ balanceAtoms: "1000", committedAtoms: "110" });
      }
      if (item.name === "C2") {
        expect(before.row.envelope.attempts[0]?.phase).toBe("intent");
        expect(PaperCapital.restore(before.row.envelope.capital).snapshot()).toMatchObject({ balanceAtoms: "1000", committedAtoms: "110" });
        expect(before.effectCount).toBe(0);
      }
      if (item.name === "C3") {
        expect(before.row.envelope.attempts[0]?.phase).toBe("intent");
        expect(before.effectCount).toBe(1);
        if (typeof handshake.evidenceId !== "string") throw new Error("C3 handshake is missing its evidence ID");
        expect((before.effects[0]?.evidence_id as string)).toBe(handshake.evidenceId);
      }
      if (item.name === "C4") {
        expect(before.row.envelope.attempts[0]?.phase).toBe("observed");
        expect(PaperCapital.restore(before.row.envelope.capital).snapshot()).toMatchObject({ balanceAtoms: "1000", committedAtoms: "110" });
        expect(before.effectCount).toBe(1);
      }
      if (item.name === "C5") {
        expect(before.row.envelope.attempts[0]?.phase).toBe("settled");
        expect(PaperCapital.restore(before.row.envelope.capital).snapshot()).toMatchObject({ balanceAtoms: "1015", committedAtoms: "0" });
        expect(before.effectCount).toBe(1);
      }
      const firstExit = await child.killAndClose(2_000);
      expect(firstExit.code === null || typeof firstExit.code === "number").toBe(true);
      const oldOwner = before.row.envelope.owner;
      expect(oldOwner).not.toBeNull();
      const recoveryId = `${item.name}-recovery-${Date.now()}`;
      const recovery = spawnControlled({ args: baseArgs("resume", stateDir), runId: recoveryId, proof: { token: oldOwner!.token, pid: oldOwner!.pid } });
      const recoveryMessage = await recovery.next((line) => line.kind === "result", 3_000);
      const recoveryExit = await recovery.close(2_000);
      const after = diskSnapshot(stateDir);
      const result = assertJsonResult(recoveryMessage);
      if (item.name === "C3") console.log(`PAPER_SUPERVISOR_C3_DEBUG ${JSON.stringify({ message: recoveryMessage, exit: recoveryExit, stdout: recovery.stdout, stderr: recovery.stderr, afterGeneration: after.row.generation, afterEnvelope: after.row.envelope, effectCount: after.effectCount })}`);
      expect(recovery.pid).not.toBe(child.pid);
      expect(result.exitCode).toBe(recoveryExit.code);
      expect(after.row.envelope.owner).toBeNull();
      expect(after.effectCount).toBe(item.name === "C1" || item.name === "C2" ? 0 : 1);
      if (item.name === "C1") expect(PaperCapital.restore(after.row.envelope.capital).snapshot()).toMatchObject({ balanceAtoms: "1000", committedAtoms: "0", recoveryRequired: false });
      if (item.name === "C2") expect(PaperCapital.restore(after.row.envelope.capital).snapshot()).toMatchObject({ balanceAtoms: "1000", committedAtoms: "110", recoveryRequired: true });
      if (item.name === "C3" || item.name === "C4" || item.name === "C5") expect(PaperCapital.restore(after.row.envelope.capital).snapshot()).toMatchObject({ balanceAtoms: "1015", committedAtoms: "0" });
      expect(after.row.envelope.capital.events.filter((event) => event.type === "settle")).toHaveLength(item.name === "C3" || item.name === "C4" || item.name === "C5" ? 1 : 0);
      records.push({ case: item.name, first: { pid: child.pid, argv: child.argv, handshake, diskBeforeKill: { generation: before.row.generation, envelopeSha256: before.row.envelope.sha256, attemptPhases: before.row.envelope.attempts.map((attempt) => attempt.phase), effectCount: before.effectCount, balanceAtoms: PaperCapital.restore(before.row.envelope.capital).snapshot().balanceAtoms, committedAtoms: PaperCapital.restore(before.row.envelope.capital).snapshot().committedAtoms }, confirmedExit: firstExit }, recovery: { pid: recovery.pid, argv: recovery.argv, exitCode: recoveryExit.code, generation: after.row.generation, envelopeSha256: after.row.envelope.sha256, effectCount: after.effectCount, balanceAtoms: PaperCapital.restore(after.row.envelope.capital).snapshot().balanceAtoms, committedAtoms: PaperCapital.restore(after.row.envelope.capital).snapshot().committedAtoms } });
    }
    console.log(`PAPER_SUPERVISOR_C1_C5 ${JSON.stringify(records)}`);
  }, 15_000);

  test("C6 refuses a competing process while the exact owner is active, then recovers only after confirmed exit", async () => {
    const stateDir = join(newRoot(), "C6-state");
    const runId = `C6-${Date.now()}`;
    const ownerChild = spawnControlled({ args: baseArgs("create", stateDir, "pending"), runId, pauseFixtureStage: "execute_entered" });
    const handshake = await ownerChild.next((line) => line.kind === "handshake" && line.runId === runId, 3_000);
    const before = diskSnapshot(stateDir);
    expect(handshake.stage).toBe("execute_entered");
    expect(before.row.envelope.attempts[0]?.phase).toBe("intent");
    expect(before.effectCount).toBe(0);
    const competitor = directRunner(baseArgs("resume", stateDir, "pending"));
    const blocked = assertJsonResult(await competitor.next(isResultLine, 3_000));
    const competitorExit = await competitor.close(2_000);
    const unchanged = diskSnapshot(stateDir);
    expect(blocked.exitCode).toBeNull();
    expect(blocked.output.error).toBe("owner_busy");
    expect(competitorExit.code).toBe(2);
    expect(competitor.jsonLines).toBe(1);
    expect(unchanged.row.generation).toBe(before.row.generation);
    expect(unchanged.row.envelope.sha256).toBe(before.row.envelope.sha256);
    expect(unchanged.effectCount).toBe(0);
    const ownerExit = await ownerChild.killAndClose(2_000);
    const oldOwner = before.row.envelope.owner!;
    const recovery = spawnControlled({ args: baseArgs("resume", stateDir, "pending"), runId: `C6-recovery-${Date.now()}`, proof: { token: oldOwner.token, pid: oldOwner.pid } });
    const recovered = assertJsonResult(await recovery.next((line) => line.kind === "result", 3_000));
    const recoveryExit = await recovery.close(2_000);
    const after = diskSnapshot(stateDir);
    expect(recovery.pid).not.toBe(ownerChild.pid);
    expect(recovered.exitCode).toBe(2);
    expect(recoveryExit.code).toBe(2);
    expect(after.row.envelope.owner).toBeNull();
    expect(after.row.generation).toBe(before.row.generation + 2);
    console.log(`PAPER_SUPERVISOR_C6 ${JSON.stringify({ owner: { pid: ownerChild.pid, argv: ownerChild.argv, handshake, diskBeforeKill: { generation: before.row.generation, envelopeSha256: before.row.envelope.sha256, owner: before.row.envelope.owner, effectCount: before.effectCount }, confirmedExit: ownerExit }, competitor: { pid: competitor.pid, argv: competitor.argv, exitCode: competitorExit.code, result: blocked.output, unchangedGeneration: unchanged.row.generation, unchangedEnvelopeSha256: unchanged.row.envelope.sha256, effectCount: unchanged.effectCount }, recovery: { pid: recovery.pid, argv: recovery.argv, exitCode: recoveryExit.code, generation: after.row.generation, envelopeSha256: after.row.envelope.sha256, owner: after.row.envelope.owner } })}`);
  }, 12_000);

  test("C8 rejects corrupt JSON and a genuinely truncated database before creating fixture state", async () => {
    const records: unknown[] = [];
    for (const corruption of ["json", "database"] as const) {
      const stateDir = join(newRoot(), `C8-${corruption}`);
      const store = await SqlitePaperSupervisorStore.create({ stateDir, config: PAPER_FIXTURE_CONFIG, adapterId: PAPER_FIXTURE_ADAPTER_ID, owner: { token: "f".repeat(32), pid: 900 } });
      const current = await store.load();
      await store.release(current.generation);
      await store.close();
      const databasePath = join(stateDir, "supervisor.sqlite");
      if (corruption === "json") {
        const editable = new Database(databasePath);
        editable.query("UPDATE supervisor_state SET envelope_json=? WHERE id=1").run("{");
        editable.close();
      } else {
        truncateSync(databasePath, 64);
      }
      const corruptedHash = sha256File(databasePath);
      const child = directRunner(baseArgs("resume", stateDir));
      const message = assertJsonResult(await child.next(isResultLine, 3_000));
      const exited = await child.close(2_000);
      expect(message.exitCode).toBeNull();
      expect(exited.code).toBe(1);
      expect(child.jsonLines).toBe(1);
      expect(message.output.ok).toBe(false);
      expect(existsSync(join(stateDir, "fixture.sqlite"))).toBe(false);
      expect(sha256File(databasePath)).toBe(corruptedHash);
      records.push({ corruption, pid: child.pid, argv: child.argv, result: message.output, exitCode: exited.code, corruptedSupervisorSha256: corruptedHash, fixtureDbCreated: existsSync(join(stateDir, "fixture.sqlite")) });
    }
    console.log(`PAPER_SUPERVISOR_C8 ${JSON.stringify(records)}`);
  }, 8_000);

  test("executes all five near-ceiling generation oracles against real SQLite state and bounded child processes", async () => {
    const oracle1 = await createPublicState("pending");
    const pendingIntent = makeIntentEnvelope(oracle1.source, 999_990);
    validateEnvelope(pendingIntent);
    writeEnvelope(oracle1.stateDir, pendingIntent);
    const cycles: unknown[] = [];
    let attemptId = pendingIntent.attempts[0]!.attemptId;
    for (const expected of [
      { acquire: 999_991, release: 999_992 },
      { acquire: 999_993, release: 999_994 },
      { acquire: 999_995, release: 999_996 },
    ]) {
      const before = diskSnapshot(oracle1.stateDir);
      const child = spawnControlled({ args: baseArgs("resume", oracle1.stateDir, "pending"), runId: `oracle1-${expected.acquire}`, captureStages: true, trackActivity: true });
      const message = await child.next((line) => line.kind === "result", 4_000);
      const exited = await child.close(2_000);
      const after = diskSnapshot(oracle1.stateDir);
      const result = message;
      const stages = result.stages as Array<Record<string, unknown>>;
      const activity = result.fixtureActivity as Array<Record<string, unknown>>;
      expect(exited.code).toBe(2);
      expect(child.jsonLines).toBe(1);
      expect(result.exitCode).toBe(2);
      expect(child.pid).toBeGreaterThan(0);
      expect(after.row.generation).toBe(expected.release);
      expect(after.row.envelope.owner).toBeNull();
      expect(after.row.envelope.attempts[0]?.attemptId).toBe(attemptId);
      expect(after.row.envelope.attempts[0]?.phase).toBe("intent");
      expect(PaperCapital.restore(after.row.envelope.capital).snapshot()).toMatchObject({ balanceAtoms: "1000", committedAtoms: "110" });
      expect(after.effectCount).toBe(0);
      expect(stages.find((item) => item.stage === "initialized")?.generation).toBe(expected.acquire);
      expect(stages.filter((item) => item.stage === "owner_released").map((item) => item.generation)).toEqual([expected.release]);
      expect(activity.filter((item) => item.kind === "execute")).toHaveLength(0);
      expect(activity.filter((item) => item.kind === "reconcile").length).toBeGreaterThan(0);
      cycles.push({ before: { generation: before.row.generation, envelopeSha256: before.row.envelope.sha256 }, child: { pid: child.pid, argv: child.argv, exitCode: exited.code, stages, fixtureActivity: activity }, after: { generation: after.row.generation, envelopeSha256: after.row.envelope.sha256, attemptId: after.row.envelope.attempts[0]?.attemptId, balanceAtoms: PaperCapital.restore(after.row.envelope.capital).snapshot().balanceAtoms, committedAtoms: PaperCapital.restore(after.row.envelope.capital).snapshot().committedAtoms, effectCount: after.effectCount } });
    }
    attemptId = diskSnapshot(oracle1.stateDir).row.envelope.attempts[0]!.attemptId;
    const oracle1Final = diskSnapshot(oracle1.stateDir);
    expect(oracle1Final.row.generation).toBe(999_996);
    console.log(`PAPER_SUPERVISOR_ORACLE_1 ${JSON.stringify({ initial: { generation: pendingIntent.generation, envelopeSha256: pendingIntent.sha256, attemptId }, cycles, final: { generation: oracle1Final.row.generation, envelopeSha256: oracle1Final.row.envelope.sha256, attemptId: oracle1Final.row.envelope.attempts[0]?.attemptId, balanceAtoms: PaperCapital.restore(oracle1Final.row.envelope.capital).snapshot().balanceAtoms, committedAtoms: PaperCapital.restore(oracle1Final.row.envelope.capital).snapshot().committedAtoms, effectCount: oracle1Final.effectCount } })}`);

    const oracle2SupervisorHash = sha256File(join(oracle1.stateDir, "supervisor.sqlite"));
    const oracle2FixtureHash = sha256File(join(oracle1.stateDir, "fixture.sqlite"));
    const exhausted = spawnControlled({ args: baseArgs("resume", oracle1.stateDir, "pending"), runId: "oracle2-exhausted", captureStages: true, trackActivity: true });
    const exhaustedMessage = await exhausted.next((line) => line.kind === "result", 3_000);
    const exhaustedExit = await exhausted.close(2_000);
    const oracle2After = diskSnapshot(oracle1.stateDir);
    const exhaustedResult = exhaustedMessage;
    expect(exhaustedExit.code).toBe(1);
    expect(exhausted.jsonLines).toBe(1);
    expect(exhaustedResult.exitCode).toBe(1);
    expect(exhaustedResult.output).toMatchObject({ ok: false, error: "generation_capacity_exhausted" });
    expect(exhaustedResult.fixtureActivity).toEqual([]);
    expect(oracle2After.row.generation).toBe(999_996);
    expect(oracle2After.row.envelope.sha256).toBe(oracle1Final.row.envelope.sha256);
    expect(oracle2After.effectCount).toBe(0);
    expect(sha256File(join(oracle1.stateDir, "supervisor.sqlite"))).toBe(oracle2SupervisorHash);
    expect(sha256File(join(oracle1.stateDir, "fixture.sqlite"))).toBe(oracle2FixtureHash);
    console.log(`PAPER_SUPERVISOR_ORACLE_2 ${JSON.stringify({ child: { pid: exhausted.pid, argv: exhausted.argv, exitCode: exhaustedExit.code, result: exhaustedResult }, unchanged: { generation: oracle2After.row.generation, envelopeSha256: oracle2After.row.envelope.sha256, supervisorSha256: oracle2SupervisorHash, fixtureSha256: oracle2FixtureHash, fixtureActivity: exhaustedResult.fixtureActivity, effectCount: oracle2After.effectCount } })}`);

    const oracle3 = await createPublicState("gain");
    const gainIntent = makeIntentEnvelope(oracle3.source, 999_994);
    validateEnvelope(gainIntent);
    writeEnvelope(oracle3.stateDir, gainIntent);
    const successful = spawnControlled({ args: baseArgs("resume", oracle3.stateDir, "gain"), runId: "oracle3-terminal", captureStages: true, trackActivity: true });
    const successfulMessage = await successful.next((line) => line.kind === "result", 4_000);
    const successfulExit = await successful.close(2_000);
    const oracle3After = diskSnapshot(oracle3.stateDir);
    const successfulResult = successfulMessage;
    const successfulStages = successfulResult.stages as Array<Record<string, unknown>>;
    const successfulActivity = successfulResult.fixtureActivity as Array<Record<string, unknown>>;
    expect(successfulExit.code).toBe(0);
    expect(successful.jsonLines).toBe(1);
    expect(successfulResult.exitCode).toBe(0);
    expect(oracle3After.row.envelope.owner).toBeNull();
    expect(oracle3After.row.generation).toBe(999_998);
    expect(successfulStages.filter((item) => ["initialized", "observation_saved", "settled_saved", "owner_released"].includes(String(item.stage))).map((item) => [item.stage, item.generation])).toEqual([
      ["initialized", 999_995], ["observation_saved", 999_996], ["settled_saved", 999_997], ["owner_released", 999_998],
    ]);
    expect(successfulActivity.filter((item) => item.kind === "execute")).toHaveLength(0);
    expect(successfulActivity.filter((item) => item.kind === "reconcile")).toHaveLength(1);
    expect(oracle3After.row.envelope.capital.events.filter((event) => event.type === "settle")).toHaveLength(1);
    expect(PaperCapital.restore(oracle3After.row.envelope.capital).snapshot()).toMatchObject({ balanceAtoms: "1015", committedAtoms: "0" });
    expect(oracle3After.effectCount).toBe(1);
    expect(() => assertFreshIntakeCapacity(oracle3After.row.envelope)).toThrow("generation_capacity_exhausted");
    console.log(`PAPER_SUPERVISOR_ORACLE_3 ${JSON.stringify({ child: { pid: successful.pid, argv: successful.argv, exitCode: successfulExit.code, stages: successfulStages, fixtureActivity: successfulActivity }, final: { generation: oracle3After.row.generation, envelopeSha256: oracle3After.row.envelope.sha256, balanceAtoms: PaperCapital.restore(oracle3After.row.envelope.capital).snapshot().balanceAtoms, committedAtoms: PaperCapital.restore(oracle3After.row.envelope.capital).snapshot().committedAtoms, stopReason: PaperCapital.restore(oracle3After.row.envelope.capital).snapshot().stopReason, effectCount: oracle3After.effectCount, settlements: oracle3After.row.envelope.capital.events.filter((event) => event.type === "settle").length }, freshIntake: "blocked" })}`);

    const oracle4 = await createPublicState("incomplete-cost");
    const invalidCostIntent = makeIntentEnvelope(oracle4.source, 999_994);
    validateEnvelope(invalidCostIntent);
    writeEnvelope(oracle4.stateDir, invalidCostIntent);
    const oracle4Before = diskSnapshot(oracle4.stateDir);
    const oracle4ActivityHash = sha256File(join(oracle4.stateDir, "fixture.sqlite"));
    const stopped = spawnControlled({ args: baseArgs("resume", oracle4.stateDir, "incomplete-cost"), runId: "oracle4-first-stop-hold", captureStages: true, trackActivity: true });
    const stoppedMessage = await stopped.next((line) => line.kind === "result", 4_000);
    const stoppedExit = await stopped.close(2_000);
    const oracle4After = diskSnapshot(oracle4.stateDir);
    const stoppedResult = stoppedMessage;
    const stoppedStages = stoppedResult.stages as Array<Record<string, unknown>>;
    const stoppedActivity = stoppedResult.fixtureActivity as Array<Record<string, unknown>>;
    const stoppedCapital = PaperCapital.restore(oracle4After.row.envelope.capital).snapshot();
    expect(stoppedExit.code).toBe(2);
    expect(stopped.jsonLines).toBe(1);
    expect(stoppedResult.exitCode).toBe(2);
    expect(stoppedStages.filter((item) => ["initialized", "stop_saved", "adapter_pending", "owner_released"].includes(String(item.stage))).map((item) => [item.stage, item.generation])).toEqual([
      ["initialized", 999_995], ["stop_saved", 999_996], ["adapter_pending", 999_997], ["owner_released", 999_998],
    ]);
    expect(stoppedActivity.filter((item) => item.kind === "execute")).toHaveLength(0);
    expect(stoppedActivity.filter((item) => item.kind === "reconcile").length).toBeGreaterThan(0);
    expect(oracle4Before.row.generation).toBe(999_994);
    expect(oracle4After.row.generation).toBe(999_998);
    expect(oracle4After.row.envelope.attempts[0]?.phase).toBe("intent");
    expect(oracle4After.row.envelope.attempts[0]?.observation).toBeNull();
    expect(oracle4After.row.envelope.hold).toBe("adapter_contract");
    expect(stoppedCapital).toMatchObject({ balanceAtoms: "1000", committedAtoms: "110", recoveryRequired: true, stopReason: "unknown_cost" });
    expect(oracle4After.row.envelope.capital.events).toHaveLength(oracle4Before.row.envelope.capital.events.length + 1);
    expect(oracle4After.effectCount).toBe(1);
    expect(sha256File(join(oracle4.stateDir, "fixture.sqlite"))).toBe(oracle4ActivityHash);
    const oracle4SupervisorHash = sha256File(join(oracle4.stateDir, "supervisor.sqlite"));
    const oracle4FixtureHash = sha256File(join(oracle4.stateDir, "fixture.sqlite"));
    const oracle4Reopen = spawnControlled({ args: baseArgs("resume", oracle4.stateDir, "incomplete-cost"), runId: "oracle4-capacity-reopen", captureStages: true, trackActivity: true });
    const oracle4ReopenMessage = await oracle4Reopen.next((line) => line.kind === "result", 3_000);
    const oracle4ReopenExit = await oracle4Reopen.close(2_000);
    const oracle4ReopenResult = oracle4ReopenMessage;
    const oracle4ReopenedDisk = diskSnapshot(oracle4.stateDir);
    expect(oracle4ReopenExit.code).toBe(1);
    expect(oracle4Reopen.jsonLines).toBe(1);
    expect(oracle4ReopenResult.exitCode).toBe(1);
    expect(oracle4ReopenResult.output).toMatchObject({ ok: false, error: "generation_capacity_exhausted" });
    expect(oracle4ReopenResult.fixtureActivity).toEqual([]);
    expect(oracle4ReopenedDisk.row.generation).toBe(999_998);
    expect(oracle4ReopenedDisk.row.envelope.sha256).toBe(oracle4After.row.envelope.sha256);
    expect(sha256File(join(oracle4.stateDir, "supervisor.sqlite"))).toBe(oracle4SupervisorHash);
    expect(sha256File(join(oracle4.stateDir, "fixture.sqlite"))).toBe(oracle4FixtureHash);
    console.log(`PAPER_SUPERVISOR_ORACLE_4 ${JSON.stringify({ child: { pid: stopped.pid, argv: stopped.argv, exitCode: stoppedExit.code, stages: stoppedStages, fixtureActivity: stoppedActivity }, final: { generation: oracle4After.row.generation, envelopeSha256: oracle4After.row.envelope.sha256, capitalEvents: oracle4After.row.envelope.capital.events.length, balanceAtoms: stoppedCapital.balanceAtoms, committedAtoms: stoppedCapital.committedAtoms, stopReason: stoppedCapital.stopReason, hold: oracle4After.row.envelope.hold, attempt: oracle4After.row.envelope.attempts[0], effectCount: oracle4After.effectCount }, reopen: { pid: oracle4Reopen.pid, argv: oracle4Reopen.argv, exitCode: oracle4ReopenExit.code, result: oracle4ReopenResult, unchangedSupervisorSha256: oracle4SupervisorHash, unchangedFixtureSha256: oracle4FixtureHash } })}`);

    const oracle5 = await createPublicState("gain");
    const oracle5SourceReceipt = JSON.parse(String(oracle5.disk.effects[0]?.receipt_json)) as PaperReceipt;
    const oracle5EvidenceId = String(oracle5.disk.effects[0]?.evidence_id);
    const stoppedCapitalForObservation = new PaperCapital(PAPER_FIXTURE_CONFIG);
    stoppedCapitalForObservation.reserve(PAPER_FIXTURE_PLAN);
    stoppedCapitalForObservation.start(PAPER_FIXTURE_PLAN.id);
    expect(() => stoppedCapitalForObservation.settle({ ...oracle5SourceReceipt, externalCostAtoms: null, costsComplete: false })).toThrow();
    expect(stoppedCapitalForObservation.snapshot()).toMatchObject({ stopReason: "unknown_cost", balanceAtoms: "1000", committedAtoms: "110" });
    const oracle5Attempt = oracle5.source.attempts[0]!;
    const stoppedObserved = resealEnvelope(oracle5.source, {
      generation: 999_996,
      owner: null,
      capital: stoppedCapitalForObservation.checkpoint(),
      attempts: [{ ...oracle5Attempt, phase: "observed", observation: { evidenceId: oracle5EvidenceId, receipt: oracle5SourceReceipt } }],
      hold: "adapter_contract",
    });
    expect(mandatoryGenerationBudget(stoppedObserved)).toBe(1);
    validateEnvelope(stoppedObserved);
    writeEnvelope(oracle5.stateDir, stoppedObserved);
    const oracle5Before = diskSnapshot(oracle5.stateDir);
    const resumedObserved = spawnControlled({ args: baseArgs("resume", oracle5.stateDir, "gain"), runId: "oracle5-stopped-observed", captureStages: true, trackActivity: true });
    const resumedObservedMessage = await resumedObserved.next((line) => line.kind === "result", 4_000);
    const resumedObservedExit = await resumedObserved.close(2_000);
    const oracle5After = diskSnapshot(oracle5.stateDir);
    const resumedObservedResult = resumedObservedMessage;
    const oracle5Stages = resumedObservedResult.stages as Array<Record<string, unknown>>;
    const oracle5Activity = resumedObservedResult.fixtureActivity as Array<Record<string, unknown>>;
    expect(resumedObservedExit.code).toBe(2);
    expect(resumedObserved.jsonLines).toBe(1);
    expect(resumedObservedResult.exitCode).toBe(2);
    expect(oracle5Before.row.generation).toBe(999_996);
    expect(oracle5Stages.filter((item) => ["initialized", "settled_saved", "owner_released"].includes(String(item.stage))).map((item) => [item.stage, item.generation])).toEqual([
      ["initialized", 999_997], ["settled_saved", 999_998], ["owner_released", 999_999],
    ]);
    expect(oracle5Activity).toEqual([]);
    expect(oracle5After.row.generation).toBe(999_999);
    expect(oracle5After.row.envelope.owner).toBeNull();
    expect(oracle5After.row.envelope.hold).toBe("adapter_contract");
    expect(oracle5After.row.envelope.capital.events.filter((event) => event.type === "settle")).toHaveLength(1);
    expect(PaperCapital.restore(oracle5After.row.envelope.capital).snapshot()).toMatchObject({ balanceAtoms: "1015", committedAtoms: "0", stopReason: "unknown_cost" });
    expect(validateEnvelope(resealEnvelope(oracle5After.row.envelope, { generation: 1_000_000 })).generation).toBe(1_000_000);
    expect(() => assertFreshIntakeCapacity(resealEnvelope(oracle5After.row.envelope, { generation: 1_000_000 }))).toThrow("generation_capacity_exhausted");
    const oracle5AtMax = resealEnvelope(oracle5After.row.envelope, { generation: 1_000_000 });
    writeEnvelope(oracle5.stateDir, oracle5AtMax);
    const oracle5MaxHash = sha256File(join(oracle5.stateDir, "supervisor.sqlite"));
    const maxResume = spawnControlled({ args: baseArgs("resume", oracle5.stateDir, "gain"), runId: "oracle5-max-boundary", captureStages: true, trackActivity: true });
    const maxResumeMessage = await maxResume.next((line) => line.kind === "result", 3_000);
    const maxResumeExit = await maxResume.close(2_000);
    const maxResumeResult = maxResumeMessage;
    expect(maxResumeExit.code).toBe(1);
    expect(maxResume.jsonLines).toBe(1);
    expect(maxResumeResult.output).toMatchObject({ ok: false, error: "generation_capacity_exhausted" });
    expect(maxResumeResult.fixtureActivity).toEqual([]);
    expect(diskSnapshot(oracle5.stateDir).row.generation).toBe(1_000_000);
    expect(sha256File(join(oracle5.stateDir, "supervisor.sqlite"))).toBe(oracle5MaxHash);

    const ownedDir = join(newRoot(), "oracle5-imported-owned");
    const ownedToken = "e".repeat(32);
    const ownedStore = await SqlitePaperSupervisorStore.create({ stateDir: ownedDir, config: PAPER_FIXTURE_CONFIG, adapterId: PAPER_FIXTURE_ADAPTER_ID, owner: { token: ownedToken, pid: process.pid } });
    const initialOwned = await ownedStore.load();
    const ownedSource = resealEnvelope(initialOwned, { attempts: oracle5.source.attempts });
    const ownedIntent = makeIntentEnvelope(ownedSource, 999_998, { token: ownedToken, pid: process.pid });
    writeEnvelope(ownedDir, ownedIntent);
    let ownedAdapterCalls = 0;
    const ownedAdapter: PaperSupervisorAdapter = {
      async execute() { ownedAdapterCalls++; return { kind: "pending", reason: "unexpected" }; },
      async reconcile() { ownedAdapterCalls++; return { kind: "pending", reason: "unexpected" }; },
      async drain() { return { drained: true }; },
      async close() {},
    };
    await expect(PaperSupervisor.open({ store: ownedStore, adapter: ownedAdapter })).rejects.toThrow("generation_capacity_exhausted");
    expect(ownedAdapterCalls).toBe(0);
    await ownedStore.close();
    console.log(`PAPER_SUPERVISOR_ORACLE_5 ${JSON.stringify({ child: { pid: resumedObserved.pid, argv: resumedObserved.argv, exitCode: resumedObservedExit.code, stages: oracle5Stages, fixtureActivity: oracle5Activity }, final: { generation: oracle5After.row.generation, envelopeSha256: oracle5After.row.envelope.sha256, balanceAtoms: PaperCapital.restore(oracle5After.row.envelope.capital).snapshot().balanceAtoms, committedAtoms: PaperCapital.restore(oracle5After.row.envelope.capital).snapshot().committedAtoms, stopReason: PaperCapital.restore(oracle5After.row.envelope.capital).snapshot().stopReason, hold: oracle5After.row.envelope.hold, settlements: oracle5After.row.envelope.capital.events.filter((event) => event.type === "settle").length }, structuralMaximum: { generation: 1_000_000, valid: true, ownerAcquisitionExitCode: maxResumeExit.code, result: maxResumeResult.output, unchangedSupervisorSha256: oracle5MaxHash }, importedOwned: { generation: ownedIntent.generation, mandatoryBudget: mandatoryGenerationBudget(ownedIntent), owner: ownedIntent.owner, adapterCalls: ownedAdapterCalls, error: "generation_capacity_exhausted" } })}`);
  }, 30_000);
});
