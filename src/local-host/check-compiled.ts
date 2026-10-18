import { mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { absoluteArg } from "./args";
import { localCorePlan } from "./plan";
import { parseLocalArtifact, verifyLocalArtifact } from "./manifest";
import { LOCAL_READY_MESSAGE, LOCAL_STOP_MESSAGE } from "./protocol";

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  const app = absoluteArg(args, "--app");
  const reportPath = absoluteArg(args, "--report");
  if (app === null || reportPath === null) throw new Error("local_check_paths_required");
  const artifact = parseLocalArtifact(await Bun.file(join(app, "local-artifact.json")).json());
  if (artifact === null) throw new Error("local_artifact_invalid");
  await verifyLocalArtifact(app, artifact);
  const fixture = mkdtempSync(join(tmpdir(), "inonu-compiled-isolated-"));
  const env = localCorePlan(app, fixture, process.env).env;
  const exe = join(app, "InonuTrader.exe");
  // This checker only launches selftests, whose store/network/scheduler are disabled in the compiled entry.
  let ready!: () => void;
  const readyPromise = new Promise<void>(r => { ready = r; });
  const selfReport = join(fixture, "selftest.json");
  const child = Bun.spawn([exe, "--selftest", "--selftest-wait", "--selftest-home", join(fixture, "home"), "--report", selfReport], {
    cwd: fixture, env: { ...env, TYPESAFE_AI_API_KEY: "synthetic-do-not-discover" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    ipc: (raw) => { if (raw && typeof raw === "object" && (raw as { kind?: string }).kind === LOCAL_READY_MESSAGE.kind) ready(); },
  });
  // The kill here belongs solely to the isolated selftest, never a financial process.
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 15_000);
  const beforeStop = await Promise.race([readyPromise.then(() => "ready" as const), child.exited.then(() => "early_exit" as const)]);
  let requested = false;
  if (beforeStop === "ready") { child.send(LOCAL_STOP_MESSAGE); requested = true; }
  const exit = await child.exited; clearTimeout(timer);
  await new Response(child.stdout).text(); await new Response(child.stderr).text();
  const report = existsSync(selfReport) ? await Bun.file(selfReport).json() as Record<string, unknown> : null;
  const qualified = requested && !timedOut && exit === 0 && report?.compiled === true && report.index === 200 && report.originDenied === 403
    && report.modelConfigured === false && report.okx === "absent" && report.agentStarted === false && report.connected === false;
  const result = { qualified, privateIpcStop: requested, exitCode: exit, timedOut, selftest: report, financialExecution: false,
    exeSha256: artifact.files.find(f => f.path === "InonuTrader.exe")!.sha256 };
  await Bun.write(reportPath, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
  if (!qualified) process.exitCode = 1;
}

if (import.meta.main) await main();
