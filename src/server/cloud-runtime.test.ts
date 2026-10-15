import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCloudGatewayToken, loadCloudStore, startCloudRuntime } from "./cloud-runtime";
import { createCloudStore } from "./cloud-store";

test("hosted composition serves static and real agent HTTP only through the authenticated ingress", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-cloud-synthetic-"));
  mkdirSync(join(dir, "web"));
  writeFileSync(join(dir, "web", "index.html"), "<html><body>synthetic cloud fixture</body></html>");
  const token = "c".repeat(64);
  const store = createCloudStore({ typesafeAiApiKey: "synthetic-mounted-key" });
  let calls = 0;
  const host = startCloudRuntime({
    dataDir: join(dir, "data"), webDir: join(dir, "web"), publicOrigin: "https://trader.example.com", owner: "owner", gatewayToken: token, port: 0,
    store, startAgent: false,
    fetch: Object.assign(async () => { calls++; throw new Error("external_io_forbidden"); }, { preconnect: () => {} }) as typeof fetch,
    processRunner: { run: async () => { calls++; throw new Error("cli_forbidden"); } },
  });
  try {
    const base = `http://127.0.0.1:${host.port}`;
    expect((await fetch(`${base}/agent/status`)).status).toBe(403);
    const headers = { host: "trader.example.com", "x-inonu-gateway": token, "remote-user": "owner" };
    const index = await fetch(base, { headers });
    expect(index.status).toBe(200);
    expect(index.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(index.headers.get("content-security-policy")).not.toContain("unsafe-eval");
    expect(await index.text()).toContain("synthetic cloud fixture");
    const response = await fetch(`${base}/agent/status`, { headers });
    expect(response.status).toBe(200);
    const status = await response.json() as { status: { state: { connected: boolean }; scheduler: { started: boolean } } };
    expect(status.status.state.connected).toBe(false);
    expect(status.status.scheduler.started).toBe(false);
    expect((await fetch(`${base}/agent/connect`, { method: "POST", headers, body: "{}" })).status).toBe(403);
    expect((await fetch(`${base}/__health`)).status).toBe(403);
    const health = await fetch(`${base}/__health`, { headers });
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
    const settings = await fetch(`${base}/settings`, { headers: { ...headers, "x-inonu-settings": "1" } });
    expect(settings.status).toBe(200);
    const before = await settings.json() as { readOnly?: boolean };
    expect(before.readOnly).toBe(true);
    const authorizedWrite = { ...headers, origin: "https://trader.example.com", "x-inonu-intent": "user", "x-inonu-settings": "1", "content-type": "application/json" };
    for (const mutation of [
      { path: "/settings/secrets", method: "PUT", body: JSON.stringify({ id: "typesafeAiApiKey", value: "synthetic-changed-key" }), code: "cloud_secrets_read_only" },
      { path: "/settings/secrets/typesafeAiApiKey", method: "DELETE", code: "cloud_secrets_read_only" },
      { path: "/settings/prefs", method: "PUT", body: JSON.stringify({ onchain: { capBasic: 0 } }), code: "cloud_settings_read_only" },
    ]) {
      const refused = await fetch(base + mutation.path, { method: mutation.method, headers: authorizedWrite, body: mutation.body });
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({ ok: false, code: mutation.code });
    }
    expect(store.credentials().typesafeAiApiKey).toBe("synthetic-mounted-key");
    const after = await fetch(`${base}/settings`, { headers: { ...headers, "x-inonu-settings": "1" } });
    expect(await after.json()).toEqual(before);
    expect(calls).toBe(0);
  } finally {
    await host.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the gateway credential is loaded only from its explicit mount and rejects malformed files", () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-gateway-synthetic-"));
  try {
    expect(() => loadCloudGatewayToken(dir)).toThrow("cloud_config_invalid");
    for (const value of ["short", "a".repeat(129), "a".repeat(64) + "\n\n", "a".repeat(2048)]) {
      writeFileSync(join(dir, "gateway_token"), value);
      expect(() => loadCloudGatewayToken(dir)).toThrow("cloud_config_invalid");
    }
    writeFileSync(join(dir, "gateway_token"), "a".repeat(64) + "\n");
    expect(loadCloudGatewayToken(dir)).toBe("a".repeat(64));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("mounted cloud secrets are explicit, have no workstation fallback, and status never reveals them", () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-cloud-secrets-synthetic-"));
  try {
    writeFileSync(join(dir, "model_key"), "synthetic-mount-key\n");
    const store = loadCloudStore(dir);
    expect(store.credentials().typesafeAiApiKey).toBe("synthetic-mount-key");
    expect(store.credentials().okx).toBeNull();
    expect(JSON.stringify(store.status())).not.toContain("synthetic-mount-key");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a present but malformed mount is reported as invalid provisioning instead of absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-invalid-mount-synthetic-"));
  try {
    for (const value of ["short", "invalid\nvalue", "x".repeat(2048)]) {
      writeFileSync(join(dir, "model_key"), value);
      expect(() => loadCloudStore(dir)).toThrow("cloud_secret_invalid");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
