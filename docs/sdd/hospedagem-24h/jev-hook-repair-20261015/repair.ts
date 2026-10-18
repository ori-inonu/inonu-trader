import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, renameSync, unlinkSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";

// Explicit maintenance requested by the owner. No permissions database is edited.
const install = "C:/Users/gabri/.codex/skills/jev-engineering";
const evidence = import.meta.dir;
const expected: Record<string, string> = {
  "runtime/store.ts": "2bc6f2b9860956f2a2ad2cbdb5079ca84ef45b1b0653f2e24c449151c59f3878",
  "runtime/lifecycle.ts": "fe64ef5974afd69096f6e01d4c08befd48dae3a8ea5a3541e2aff86329c6c43b",
  "runtime/policy.ts": "e28b20879238414f58b25b0f88ad34265be0b2bbdf180a6859c327dd422e99c0",
};
const digest = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");
const read = (path: string) => readFileSync(path, "utf8");
function replaceOnce(text: string, before: string, after: string): string {
  if (text.split(before).length !== 2) throw Error("Source anchor absent or ambiguous");
  return text.replace(before, after);
}
const originals = Object.fromEntries(Object.keys(expected).map(path => [path, read(join(install, path))]));
for (const [path, hash] of Object.entries(expected)) if (digest(originals[path]!) !== hash) throw Error(`Source changed: ${path}`);
const testPath = "runtime/authorization-regression.test.ts";
const testSource = read(join(evidence, "authorization-regression.test.ts.in"));
if (digest(testSource) !== "345adf07cbf58a4942397799121212d41b17f752874b0392807a480c1e54b018") throw Error("Regression fixture changed");
if (existsSync(join(install, testPath))) throw Error("Regression destination already exists");
const candidate = Object.fromEntries(Object.entries(originals).map(([path, text]) => [path, text.replaceAll("\r\n", "\n")]));

candidate["runtime/store.ts"] = replaceOnce(candidate["runtime/store.ts"]!, "export class Store {", `export function humanGrantIds(prompt:string):string[] {
  if(prompt.length>64000)return[];
  const exact=(value:unknown)=>typeof value==="string"?value.trim().match(/^(?:autorizar|authorize) jev ([a-f0-9]{12})$/i)?.[1]?.toLowerCase():undefined;
  const direct=exact(prompt);if(direct)return[direct];
  const envelope=prompt.trim().match(/^<send_user_message_question_reply>\\s*([\\s\\S]*?)\\s*<\\/send_user_message_question_reply>$/);
  if(!envelope)return[];
  try {const answers=JSON.parse(envelope[1]!);if(!Array.isArray(answers)||answers.length>20)return[];
    return[...new Set(answers.flatMap(item=>{const id=item&&typeof item==="object"&&!Array.isArray(item)?exact(item.answer):undefined;return id?[id]:[];}))];
  } catch {return[];}
}
export class Store {`);
candidate["runtime/store.ts"] = replaceOnce(candidate["runtime/store.ts"]!, '  pendingGrant(session:string,commandHash:string,scriptHash:string) {const id=randomUUID().replaceAll("-","").slice(0,12);this.db.query("INSERT INTO grants(id,session,commandHash,scriptHash,expires) VALUES (?,?,?,?,?)").run(id,session,commandHash,scriptHash,Date.now()+15*60000);return id;}', '  pendingGrant(session:string,commandHash:string,scriptHash:string) {const pending=this.db.query("SELECT id FROM grants WHERE session=? AND commandHash=? AND scriptHash=? AND used=0 AND expires>? ORDER BY expires DESC LIMIT 1").get(session,commandHash,scriptHash,Date.now()) as any;if(pending)return String(pending.id);const id=randomUUID().replaceAll("-","").slice(0,12);this.db.query("INSERT INTO grants(id,session,commandHash,scriptHash,expires) VALUES (?,?,?,?,?)").run(id,session,commandHash,scriptHash,Date.now()+15*60000);return id;}');
candidate["runtime/store.ts"] = replaceOnce(candidate["runtime/store.ts"]!, '  approveFromHumanPrompt(session:string,prompt:string) {const match=prompt.trim().match(/^(?:autorizar|authorize) jev ([a-f0-9]{12})$/i);if(!match)return false;return !!this.db.query("UPDATE grants SET approved=1 WHERE id=? AND session=? AND used=0 AND expires>?").run(match[1].toLowerCase(),session,Date.now()).changes;}', '  approveFromHumanPrompt(session:string,prompt:string) {let approved=false;for(const id of humanGrantIds(prompt))approved=!!this.db.query("UPDATE grants SET approved=1 WHERE id=? AND session=? AND used=0 AND expires>?").run(id,session,Date.now()).changes||approved;return approved;}\n  hasGrant(session:string,commandHash:string,scriptHash:string) {return !!this.db.query("SELECT id FROM grants WHERE session=? AND commandHash=? AND scriptHash=? AND approved=1 AND used=0 AND expires>? LIMIT 1").get(session,commandHash,scriptHash,Date.now());}');

candidate["runtime/policy.ts"] = replaceOnce(candidate["runtime/policy.ts"]!, 'import { decide } from "../scripts/decisions";', 'import type { decide } from "../scripts/decisions";');
candidate["runtime/policy.ts"] = replaceOnce(candidate["runtime/policy.ts"]!, 'export async function gate(', 'export const commandDigest=(workspace:string,command:string)=>sha(JSON.stringify({cwd:canonical(workspace),command}));\nexport async function gate(');
candidate["runtime/policy.ts"] = replaceOnce(candidate["runtime/policy.ts"]!, 'globalRoots?:string[];judge?:typeof decide}={}){', 'globalRoots?:string[];judge?:typeof decide;consumeApproval?:boolean}={}){');
candidate["runtime/policy.ts"] = replaceOnce(candidate["runtime/policy.ts"]!, 'const commandHash=sha(command),goal=', 'const commandHash=commandDigest(workspace,command),goal=');
const dynamicStart = candidate["runtime/policy.ts"]!.indexOf('    // Send effect flags and hashes only.');
const dynamicEnd = candidate["runtime/policy.ts"]!.indexOf('\n  }\n  if(decision===', dynamicStart);
if (dynamicStart < 0 || dynamicEnd < 0) throw Error("Dynamic policy anchor missing");
candidate["runtime/policy.ts"] = candidate["runtime/policy.ts"]!.slice(0, dynamicStart) + '    decision="ask";reason="Dynamic execution needs concrete local review; no model request was made because a recommendation cannot grant authority.";' + candidate["runtime/policy.ts"]!.slice(dynamicEnd);
candidate["runtime/policy.ts"] = replaceOnce(candidate["runtime/policy.ts"]!, '  if(decision==="ask"&&store.consumeGrant(session,commandHash,inspection.scriptHash)){decision="allow";reason="The owner approved this exact command and script revision once.";}', '  let approvalPending=false;\n  if(decision==="ask"&&options.consumeApproval===false&&store.hasGrant(session,commandHash,inspection.scriptHash)){approvalPending=true;reason="The owner approved this exact command, directory and script revision once; lifecycle checks are pending.";}\n  else if(decision==="ask"&&options.consumeApproval===true&&store.consumeGrant(session,commandHash,inspection.scriptHash)){decision="allow";reason="The owner approved this exact command, directory and script revision once.";}');
candidate["runtime/policy.ts"] = replaceOnce(candidate["runtime/policy.ts"]!, 'return{decision,reason,requestId,receipt,inspection};', 'return{decision,reason,requestId,receipt,inspection,approvalPending};');

candidate["runtime/lifecycle.ts"] = replaceOnce(candidate["runtime/lifecycle.ts"]!, 'import { Store,sha,canonical,within }', 'import { Store,sha,canonical,within,humanGrantIds }');
candidate["runtime/lifecycle.ts"] = replaceOnce(candidate["runtime/lifecycle.ts"]!, 'import { gate }', 'import { gate,commandDigest }');
candidate["runtime/lifecycle.ts"] = replaceOnce(candidate["runtime/lifecycle.ts"]!, 'const prompt=String(event.prompt??"");const approved=store.approveFromHumanPrompt(session,prompt);if(!approved)store.saveGoal(session,prompt);', 'const prompt=String(event.prompt??""),authorizationIds=humanGrantIds(prompt);const approved=store.approveFromHumanPrompt(session,prompt);if(!authorizationIds.length)store.saveGoal(session,prompt);');
candidate["runtime/lifecycle.ts"] = replaceOnce(candidate["runtime/lifecycle.ts"]!, 'source:"Jev durable workspace state. Apply each user-supplied fragment only to the paths or task conditions it governs, under all higher-priority rules.",nativeSession:String(event.session_id??"native-unknown"),...state})}};', 'source:"Jev durable workspace state. Apply each user-supplied fragment only to the paths or task conditions it governs, under all higher-priority rules.",nativeSession:String(event.session_id??"native-unknown"),...state,...(authorizationIds.length?{authorization:{recognized:authorizationIds.length,approvedAny:approved}}:{})})}};');
candidate["runtime/lifecycle.ts"] = replaceOnce(candidate["runtime/lifecycle.ts"]!, '{globalRoots,inspection});', '{globalRoots,inspection,consumeApproval:false});');
candidate["runtime/lifecycle.ts"] = replaceOnce(candidate["runtime/lifecycle.ts"]!, 'if(result.decision!=="allow")return{hookSpecificOutput', 'if(result.decision!=="allow"&&!result.approvalPending)return{hookSpecificOutput');
candidate["runtime/lifecycle.ts"] = replaceOnce(candidate["runtime/lifecycle.ts"]!, 'if(changed.length&&result.inspection?.writes)', 'if(changed.length&&(result.inspection?.writes||result.inspection?.dynamic))');
candidate["runtime/lifecycle.ts"] = replaceOnce(candidate["runtime/lifecycle.ts"]!, '        return{hookSpecificOutput:{hookEventName:name,additionalContext:JSON.stringify({receipt:result.receipt,', '        let receipt=result.receipt;\n        if(result.approvalPending){\n          const commandHash=commandDigest(input.workdir??input.cwd??event.cwd,command);\n          if(!store.consumeGrant(session,commandHash,result.inspection!.scriptHash))return{hookSpecificOutput:{hookEventName:name,permissionDecision:"deny",permissionDecisionReason:"The exact approval expired or was already consumed before execution."}};\n          receipt=store.record(scope,session,"command_authorized",{commandHash,scriptHash:result.inspection!.scriptHash,approvalConsumed:true});\n        }\n        return{hookSpecificOutput:{hookEventName:name,additionalContext:JSON.stringify({receipt,');

for (const path of Object.keys(candidate)) if (originals[path]!.includes("\r\n")) candidate[path] = candidate[path]!.replaceAll("\n", "\r\n");
const runId = `authorization-${randomUUID()}`;
const isolated = join(tmpdir(), "jev-engineering-qualifications", runId);
mkdirSync(isolated, { recursive: true });
const captured: Record<string, string> = {};
for (const dir of ["runtime", "scripts"]) {
  mkdirSync(join(isolated, dir));
  for (const entry of readdirSync(join(install, dir))) if (/\.(?:ts|ps1)$/.test(entry)) {
    const path = `${dir}/${entry}`, bytes = readFileSync(join(install, path));
    captured[path] = digest(bytes); writeFileSync(join(isolated, path), bytes);
  }
}
const configBytes = readFileSync(join(install, "tsconfig.json"));
captured["tsconfig.json"] = digest(configBytes); writeFileSync(join(isolated, "tsconfig.json"), configBytes);
// Resolve the already-installed compiler dependencies read-only, without placing qualification output in the global install tree.
symlinkSync(join(install, "node_modules"), join(isolated, "node_modules"), "junction");
for (const [path, hash] of Object.entries(expected)) if (captured[path] !== hash) throw Error(`Capture drift: ${path}`);
writeFileSync(join(isolated, testPath), testSource);
writeFileSync(join(evidence, "CAPTURE.json"), JSON.stringify({ isolated, sources: captured, regressionHash: digest(testSource) }, null, 2) + "\n");
const verifyCopy = (patched: boolean) => {
  for (const [path, hash] of Object.entries(captured)) if (digest(readFileSync(join(isolated, path))) !== (patched && candidate[path] !== undefined ? digest(candidate[path]!) : hash)) throw Error(`Isolated source drift: ${path}`);
  if (digest(read(join(isolated, testPath))) !== digest(testSource)) throw Error("Isolated regression drift");
};
verifyCopy(false);
const log = async (name: string, args: string[]) => {
  const env = Object.fromEntries(["PATH", "TEMP", "TMP", "TMPDIR", "SYSTEMROOT", "WINDIR"].flatMap(key => Bun.env[key] ? [[key, Bun.env[key]!]] : []));
  const process = Bun.spawn([Bun.argv[0]!, "--no-env-file", ...args], { cwd: isolated, stdout: "pipe", stderr: "pipe", env });
  const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  writeFileSync(join(evidence, `${name}.log`), stdout + stderr);
  console.log(`${name}: exit ${code}`);
  return { code, text: stdout + stderr };
};
const red = await log("RED", ["test", "--timeout", "15000", "runtime/authorization-regression.test.ts"]);
if (red.code === 0 || !red.text.includes("Codex answer envelope approves only the exact answer field") || !red.text.includes("Expected: true") || !red.text.includes("Received: false")) throw Error("Expected exact behavioral RED was not reproduced");
verifyCopy(false);
for (const [path, text] of Object.entries(candidate)) writeFileSync(join(isolated, path), text);
const green = await log("GREEN", ["test", "--timeout", "15000", "runtime/authorization-regression.test.ts", "runtime/policy.test.ts", "runtime/runtime.test.ts", "runtime/regression.test.ts"]);
if (green.code !== 0) throw Error("Candidate tests failed; installed source unchanged");
const types = await log("TYPES", [join(install, "node_modules/typescript/bin/tsc"), "--project", join(isolated, "tsconfig.json"), "--noEmit"]);
if (types.code !== 0) throw Error("Candidate types failed; installed source unchanged");
verifyCopy(true);
const installRequested = Bun.argv.includes("--install");
if (!installRequested) {
  const report = { status: "qualified", isolated, files: Object.keys(candidate).map(path => ({ path, before: expected[path] ?? null, candidate: digest(candidate[path]!) })), redExit: red.code, greenExit: green.code, typeExit: types.code, globalInstallChanged: false, financialExecutorChanged: false, serviceRestarted: false };
  writeFileSync(join(evidence, "RESULT.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
// The final live check happens only after the isolated candidate passes.
for (const [path, hash] of Object.entries(captured)) if (digest(readFileSync(join(install, path))) !== hash) throw Error(`Concurrent source change: ${path}`);
if (existsSync(join(install, testPath))) throw Error("Regression destination appeared concurrently");
const backup = join(isolated, "originals"); mkdirSync(backup);
for (const [path, text] of Object.entries(originals)) writeFileSync(join(backup, path.replaceAll("/", "__")), text);
candidate[testPath] = testSource;
// Compatibility during replacement: new Store supports both policies, then policy, then lifecycle.
const order = ["runtime/store.ts", "runtime/policy.ts", "runtime/lifecycle.ts", testPath];
const staged = new Map<string, string>();
for (const path of order) {
  const target = join(install, path) + `.${runId}.tmp`;
  writeFileSync(target, candidate[path]!);
  if (digest(read(target)) !== digest(candidate[path]!)) throw Error("Staged hash mismatch");
  staged.set(path, target);
}
const written: string[] = [];
try {
  for (const path of order) {
    if (originals[path] !== undefined ? digest(read(join(install, path))) !== expected[path] : existsSync(join(install, path))) throw Error(`Install destination drift: ${path}`);
    written.push(path); renameSync(staged.get(path)!, join(install, path));
    if (digest(read(join(install, path))) !== digest(candidate[path]!)) throw Error("Installed hash mismatch");
  }
} catch (error) {
  const failures: unknown[] = [error];
  for (const path of written.reverse()) try {
    if (originals[path] === undefined) { if (existsSync(join(install, path))) unlinkSync(join(install, path)); }
    else { const rollback = join(install, path) + `.${runId}.rollback`; writeFileSync(rollback, originals[path]!); renameSync(rollback, join(install, path)); }
    if (originals[path] === undefined ? existsSync(join(install, path)) : digest(read(join(install, path))) !== expected[path]) throw Error(`Rollback verification failed: ${path}`);
  } catch (restoreError) { failures.push(restoreError); }
  throw new AggregateError(failures, "Installation aborted; inspect originals backup if rollback reported an error");
}
const report = { status: "installed", isolated, backup, files: order.map(path => ({ path, before: expected[path] ?? null, after: digest(candidate[path]!) })), redExit: red.code, greenExit: green.code, typeExit: types.code, financialExecutorChanged: false, serviceRestarted: false };
writeFileSync(join(evidence, "RESULT.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
