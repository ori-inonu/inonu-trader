import { strict as assert } from "node:assert";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createCloudIngress } from "../src/server/cloud-ingress";
import { renderDeployment } from "./render";

/** Opt-in native Caddy verification with loopback-only synthetic services. No agent, credentials or wallet is constructed. */
export async function verifyProxy(binary: string, artifactDirectory: string) {
  const artifactDir = resolve(artifactDirectory);
  mkdirSync(artifactDir, { recursive: true });
  const versionProcess = Bun.spawn([resolve(binary), "version"], { stdout: "pipe", stderr: "pipe" });
  const version = (await new Response(versionProcess.stdout).text()).trim();
  if (await versionProcess.exited !== 0 || !version.startsWith("v2.11.7 ")) throw new Error("proxy_validator_version_mismatch");

  const credentialPath = join(artifactDir, "synthetic_gateway_token").replaceAll("\\", "/");
  const credential = "b".repeat(64);
  await Bun.write(credentialPath, credential);
  const origin = "https://trader.example.com";
  let calls = 0;
  const authRequests: { remoteUser: string | null; gateway: string | null }[] = [];
  const ingress = createCloudIngress({
    publicOrigin: origin, internalOrigin: "http://127.0.0.1:1", gatewayToken: credential, owner: "owner",
    handle: async (request) => { calls++; return Response.json({ synthetic: true, path: new URL(request.url).pathname, body: request.method === "POST" ? await request.text() : null }); },
  });
  const app = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: ingress });
  const auth = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => {
    authRequests.push({ remoteUser: request.headers.get("remote-user"), gateway: request.headers.get("x-inonu-gateway") });
    if (new URL(request.url).pathname !== "/api/authz/forward-auth") return new Response("synthetic", { status: 404 });
    const session = request.headers.get("x-synthetic-session");
    return session === "owner" || session === "other"
      ? new Response(null, { status: 204, headers: { "Remote-User": session === "owner" ? "owner" : "other" } })
      : new Response("synthetic authentication required", { status: 401 });
  } });
  const reserve = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = reserve.port;
  reserve.stop(true);
  const config = renderDeployment("example.com", "owner").caddy
    .replace("auth.example.com {", `http://auth.example.com:${port} {\n  bind 127.0.0.1`)
    .replace("trader.example.com {", `http://trader.example.com:${port} {\n  bind 127.0.0.1`)
    .replaceAll("auth:9091", `127.0.0.1:${auth.port}`)
    .replaceAll("app:8080", `127.0.0.1:${app.port}`)
    .replace("{file./run/secrets/gateway_token}", `{file.${credentialPath}}`);
  const configPath = join(artifactDir, "Caddyfile.synthetic");
  await Bun.write(configPath, config);
  const child = Bun.spawn([resolve(binary), "run", "--config", configPath, "--adapter", "caddyfile"], { stdout: "pipe", stderr: "pipe" });
  const logs = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const check = (path: string, headers: Record<string, string> = {}, method = "GET", body?: string) => fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { host: "trader.example.com", ...headers }, signal: AbortSignal.timeout(3000), ...(body === undefined ? {} : { body }),
  });
  let passed = 0;
  try {
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      try { ready = (await check("/")).status === 401; } catch { /* process is still starting */ }
      if (!ready) await Bun.sleep(50);
    }
    assert.ok(ready, "synthetic proxy did not become ready");
    for (const path of ["/", "/_next/static/synthetic.js", "/agent/status", "/__health"]) {
      assert.equal((await check(path, { "remote-user": "owner", "x-inonu-gateway": credential })).status, 401);
      passed++;
    }
    assert.equal(calls, 0);
    const session = { "x-synthetic-session": "owner" };
    assert.equal((await check("/agent/status", { ...session, "remote-user": "intruder", "x-inonu-gateway": "forged" })).status, 200);
    assert.ok(authRequests.every((request) => request.remoteUser === null && request.gateway === null));
    passed++;
    const beforeRejected = calls;
    assert.equal((await check("/agent/status", { "x-synthetic-session": "other" })).status, 403);
    assert.equal((await check("/agent/status", { ...session, origin: "https://foreign.example" })).status, 403);
    assert.equal((await check("/agent/connect", session, "POST", "{}" )).status, 403);
    assert.equal(calls, beforeRejected);
    passed += 3;
    const write = await check("/agent/connect", { ...session, origin, "x-inonu-intent": "user", "content-type": "application/json" }, "POST", '{"synthetic":true}');
    assert.equal(write.status, 200);
    assert.deepEqual(await write.json(), { synthetic: true, path: "/agent/connect", body: '{"synthetic":true}' });
    passed++;
    assert.equal((await fetch(`http://127.0.0.1:${app.port}/agent/status`, { headers: { host: "trader.example.com", "remote-user": "owner" } })).status, 403);
    passed++;
    const report = { synthetic: true, passed, version, loopbackOnly: true, tlsValidated: false, autheliaValidated: false, realAgentConstructed: false };
    await Bun.write(join(artifactDir, "REPORT.json"), JSON.stringify(report, null, 2));
    return report;
  } finally {
    child.kill();
    await child.exited;
    const [stdout, stderr] = await logs;
    await Bun.write(join(artifactDir, "caddy-runtime.log"), `${stdout}\n${stderr}`);
    auth.stop(true);
    app.stop(true);
  }
}

if (import.meta.main) {
  try {
    if (Bun.argv.length !== 4) throw new Error("proxy_validator_arguments_required");
    console.info(JSON.stringify(await verifyProxy(Bun.argv[2]!, Bun.argv[3]!)));
  } catch { console.error("synthetic_proxy_verification_failed"); process.exit(1); }
}
