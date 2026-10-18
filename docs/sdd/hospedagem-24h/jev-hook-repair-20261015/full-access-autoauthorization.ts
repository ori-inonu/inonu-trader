import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";

// One-time owner-requested global Jev policy change. Native sandboxing remains in force.
const install = "C:/Users/gabri/.codex/skills/jev-engineering";
const codexRoot = "C:/Users/gabri/.codex";
const evidence = import.meta.dir;
const expected: Record<string, string> = {
  "runtime/policy.ts": "e28b20879238414f58b25b0f88ad34265be0b2bbdf180a6859c327dd422e99c0",
  "runtime/lifecycle.ts": "fe64ef5974afd69096f6e01d4c08befd48dae3a8ea5a3541e2aff86329c6c43b",
  "runtime/policy.test.ts": "35e8948f5f117e933348d5cbac8a59adc88de379cb20f49e6dd2ecd5070fb2f0",
  "SKILL.md": "6294eb53f7e440ceae3d13ad87a40ed755b32ade6666b919e09cf23155ab0fce",
};
const globalAgents = join(codexRoot, "AGENTS.md");
const globalAgentsHash = "caa91672b3d983c3637f4df2b8bf8e1dcecf21100f5ed5ddb6d1e9132a7b15e3";
const testPath = "runtime/full-access-autoauthorization.test.ts";
const fixturePath = join(evidence, "full-access-autoauthorization.test.ts");
const digest = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");
const read = (path: string) => readFileSync(path, "utf8");
const replaceOnce = (source: string, before: string, after: string) => {
  if (source.split(before).length !== 2) throw Error("Source anchor absent or ambiguous");
  return source.replace(before, after);
};

const originals: Record<string, string> = {};
for (const path of Object.keys(expected)) {
  originals[path] = read(join(install, path));
  if (digest(originals[path]!) !== expected[path]) throw Error("Pinned source changed: " + path);
}
originals["AGENTS.md"] = read(globalAgents);
if (digest(originals["AGENTS.md"]!) !== globalAgentsHash) throw Error("Global AGENTS.md changed");
if (existsSync(join(install, testPath))) throw Error("Autoauthorization regression test already exists");
const fixture = read(fixturePath);

const candidate: Record<string, string> = Object.fromEntries(Object.entries(originals).map(([path, text]) => [path, text.replaceAll("\r\n", "\n")]));
candidate["runtime/policy.ts"] = replaceOnce(candidate["runtime/policy.ts"]!, "globalRoots?:string[];judge?:typeof decide}={}){", "globalRoots?:string[];judge?:typeof decide;permissionMode?:string}={}){");
const dynamicStart = candidate["runtime/policy.ts"]!.indexOf("    // Send effect flags and hashes only.");
const dynamicEnd = candidate["runtime/policy.ts"]!.indexOf("\n  }\n  if(decision===", dynamicStart);
if (dynamicStart < 0 || dynamicEnd < 0) throw Error("Dynamic policy anchor missing");
const dynamicBlock = [
  "    try{",
  '      const answer=await(options.judge??decide)({kind:"permission",sensitivity:"public",summary:"Classify an inspected command. Dynamic execution: true. Network effects: "+inspection.network+". External destination: "+inspection.unapprovedNetwork+". Writes: "+inspection.writes+". Destructive: "+inspection.destructive+". Recorded task permits networking: "+explicitNetwork+". Recorded task permits destructive operations: "+explicitDestruction+". No script source, user text or credential value is supplied.",candidates:[{id:"allow",description:"Inspected effects fall within the already delegated task."},{id:"ask",description:"Authority or static inspection is insufficient."},{id:"deny",description:"Effects violate policy."}]},{session,root:store.root});',
  '      if(answer.choice==="allow"&&options.permissionMode==="bypassPermissions"){decision="allow";reason="Jev allowed this inspected command under the owner-requested bypassPermissions policy; deterministic checks passed."; }',
  '      else if(answer.choice==="deny"){decision="deny";reason="Jev denied this dynamic command.";}',
  '      else {decision="ask";reason=options.permissionMode==="bypassPermissions"?"Jev did not authorize this command.":"Jev recommends "+answer.choice+", but automatic authorization is disabled outside bypassPermissions mode."; }',
  '    }catch{decision="ask";reason="Dynamic execution could not be validated; no fabricated approval was substituted."; }',
].join("\n");
candidate["runtime/policy.ts"] = candidate["runtime/policy.ts"]!.slice(0, dynamicStart) + dynamicBlock + candidate["runtime/policy.ts"]!.slice(dynamicEnd);

candidate["runtime/lifecycle.ts"] = replaceOnce(candidate["runtime/lifecycle.ts"]!, "const globalTaskAuthorized=(goal:string)=>/(?:apliqu|configur|instal|implement|atualiz|update|install|configure|apply).{0,160}(?:global\\w*.{0,80}\\bcodex\\b|\\bcodex\\b.{0,80}global\\w*)/i.test(goal);", 'const globalTaskAuthorized=(goal:string)=>/(?:apliqu|configur|instal|implement|atualiz|update|install|configure|apply).{0,160}(?:global\\w*.{0,80}\\bcodex\\b|\\bcodex\\b.{0,80}global\\w*)/i.test(goal)||/(?:autoriza|authoriz|configurar|configure).{0,120}jev.{0,160}(?:acesso completo|full.?access|bypasspermissions)/i.test(goal);');
candidate["runtime/lifecycle.ts"] = replaceOnce(candidate["runtime/lifecycle.ts"]!, "{globalRoots,inspection});", '{globalRoots,inspection,permissionMode:String(event.permission_mode??"")});');
candidate["SKILL.md"] = replaceOnce(candidate["SKILL.md"]!, "Recommendations never expand authorization, select the active model, spawn agents, execute commands or override native policy. Automatic model changes are disabled. Restricted work stays on the selected first-party path.", "Recommendations do not grant command authority by default. The owner may explicitly configure a conditional autoauthorization rule that honors Jev allow only when the native hook reports permission_mode=bypassPermissions and all deterministic checks pass. This never overrides credential denials, task scope or the native sandbox. Jev cannot select the active model, spawn agents or change native settings. Automatic model changes are disabled. Restricted work stays on the selected first-party path.");
candidate["AGENTS.md"] = replaceOnce(candidate["AGENTS.md"]!, "Its choice and confidence are advisory.", "Its choice and confidence are advisory by default. Under the owner's explicit policy, only a permission=allow recommendation may authorize dynamic commands when the native hook reports permission_mode=bypassPermissions and deterministic checks pass; native sandboxing, task scope and credential denials remain binding.");

const runId = "full-access-" + randomUUID();
const isolated = join(install, "qualifications", runId);
mkdirSync(isolated, { recursive: true });
const captured: Record<string, string> = {};
for (const dir of ["runtime", "scripts"]) {
  mkdirSync(join(isolated, dir));
  for (const entry of readdirSync(join(install, dir))) if (/\.(?:ts|ps1)$/.test(entry)) {
    const path = dir + "/" + entry;
    const bytes = readFileSync(join(install, path));
    captured[path] = digest(bytes);
    writeFileSync(join(isolated, path), bytes);
  }
}
const tsconfig = readFileSync(join(install, "tsconfig.json"));
captured["tsconfig.json"] = digest(tsconfig);
writeFileSync(join(isolated, "tsconfig.json"), tsconfig);
for (const [path, hash] of Object.entries(expected)) if (captured[path] !== hash) throw Error("Capture drift: " + path);
writeFileSync(join(isolated, testPath), fixture);
writeFileSync(join(evidence, "FULL-ACCESS-CAPTURE.json"), JSON.stringify({ isolated, sources: captured, testHash: digest(fixture) }, null, 2) + "\n");

const log = async (name: string, args: string[]) => {
  const env = Object.fromEntries(["PATH", "TEMP", "TMP", "TMPDIR", "SYSTEMROOT", "WINDIR"].flatMap(key => Bun.env[key] ? [[key, Bun.env[key]!]] : []));
  const process = Bun.spawn([Bun.argv[0]!, "--no-env-file", ...args], { cwd: isolated, stdout: "pipe", stderr: "pipe", env });
  const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  writeFileSync(join(evidence, name + ".log"), stdout + stderr);
  console.log(name + ": exit " + code);
  return { code, text: stdout + stderr };
};
const red = await log("FULL-ACCESS-RED", ["test", "--timeout", "15000", "runtime/full-access-autoauthorization.test.ts"]);
if (red.code === 0 || !red.text.includes("Jev allow is automatic only in bypassPermissions mode")) throw Error("Expected pre-change behavioral failure was not reproduced");

for (const path of ["runtime/policy.ts", "runtime/lifecycle.ts", "SKILL.md", "AGENTS.md"]) {
  if (originals[path]!.includes("\r\n")) candidate[path] = candidate[path]!.replaceAll("\n", "\r\n");
}
const green = await log("FULL-ACCESS-GREEN", ["test", "--timeout", "15000", "runtime/full-access-autoauthorization.test.ts", "runtime/policy.test.ts", "runtime/runtime.test.ts", "runtime/regression.test.ts"]);
if (green.code !== 0) throw Error("Candidate tests failed; installed files remain unchanged");
const types = await log("FULL-ACCESS-TYPES", [join(install, "node_modules/typescript/bin/tsc"), "--project", join(isolated, "tsconfig.json"), "--noEmit"]);
if (types.code !== 0) throw Error("Candidate typecheck failed; installed files remain unchanged");
for (const [path, hash] of Object.entries(captured)) if (digest(readFileSync(join(isolated, path))) !== hash && path !== "runtime/policy.ts" && path !== "runtime/lifecycle.ts") throw Error("Unexpected isolated source drift: " + path);

for (const [path, hash] of Object.entries(expected)) if (digest(read(join(install, path))) !== hash) throw Error("Concurrent source change: " + path);
if (digest(read(globalAgents)) !== globalAgentsHash) throw Error("Global AGENTS.md changed during qualification");
if (existsSync(join(install, testPath))) throw Error("Regression destination appeared concurrently");
const backup = join(isolated, "originals");
mkdirSync(backup);
for (const [path, text] of Object.entries(originals)) writeFileSync(join(backup, path.replaceAll("/", "__")), text);
candidate[testPath] = fixture;
const order = ["runtime/policy.ts", "runtime/lifecycle.ts", "SKILL.md", "AGENTS.md", testPath];
const staged = new Map<string, string>();
for (const path of order) {
  const target = join(install, path);
  const tempPath = join(dirname(target), basename(target) + "." + runId + ".tmp");
  writeFileSync(tempPath, candidate[path]!);
  if (digest(read(tempPath)) !== digest(candidate[path]!)) throw Error("Staged hash mismatch: " + path);
  staged.set(path, tempPath);
}
const written: string[] = [];
try {
  for (const path of order) {
    const target = join(install, path);
    const original = originals[path];
    if (original !== undefined && digest(read(target)) !== digest(original)) throw Error("Install destination drift: " + path);
    if (original === undefined && existsSync(target)) throw Error("Install destination appeared: " + path);
    written.push(path);
    renameSync(staged.get(path)!, target);
    if (digest(read(target)) !== digest(candidate[path]!)) throw Error("Installed hash mismatch: " + path);
  }
} catch (error) {
  const failures: unknown[] = [error];
  for (const path of written.reverse()) try {
    const target = join(install, path);
    const original = originals[path];
    if (original === undefined) { if (existsSync(target)) unlinkSync(target); }
    else { const rollback = target + "." + runId + ".rollback"; writeFileSync(rollback, original); renameSync(rollback, target); }
    if (original === undefined ? existsSync(target) : digest(read(target)) !== digest(original)) throw Error("Rollback verification failed: " + path);
  } catch (restoreError) { failures.push(restoreError); }
  throw new AggregateError(failures, "Installation aborted; inspect the isolated backup if rollback failed");
}
const report = {
  status: "installed",
  isolated,
  backup,
  files: order.map(path => ({ path, before: originals[path] === undefined ? null : digest(originals[path]!), after: digest(candidate[path]!) })),
  redExit: red.code,
  greenExit: green.code,
  typeExit: types.code,
  automaticPermissionMode: "bypassPermissions only",
  deterministicCredentialAndScopeChecks: "retained",
  financialExecutorChanged: false,
  walletChanged: false,
};
writeFileSync(join(evidence, "FULL-ACCESS-RESULT.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
