import { describe, expect, test } from "bun:test";
import { createRealPipelineClient } from "./real-pipeline";

const address = "0x2222222222222222222222222222222222222222";
const wallet = { address, chainIndex: "143" as const, revision: 7, identityKey: "0b4551e762d94e9a5a3f5b8de18ec9493e702aaf7571d7ea9e42783ebfc230fd" };
const health = { mode: "paper", executionEnabled: false, services: { onchainos: { configured: false, access: "blocked", missing: ["OKX_API_KEY"] }, jev: { credentialPresent: false, authorized: false, model: "Jev1.13.0", costUsdPerMillion: null }, worker: { running: true, intervalMs: 5000, lastCycleAtMs: null } }, walletConsent: { active: false, identityKey: null, chainIndex: null, revision: null }, dependencies: ["Configure o serviço OnchainOS."] };

describe("explicit real-source query consent", () => {
  test("connecting a local wallet sends no address until a separate grant and revocation clears it", async () => {
    const requests: { path: string; method: string; body: unknown }[] = [];
    const client = createRealPipelineClient({ fetch: async (input, init) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ path, method, body });
      return Response.json(method === "POST" ? { active: true, queryScope: 'web3-rpc-read-v2', identityKey: wallet.identityKey, chainIndex: "143", revision: 7 } : { active: false });
    } });
    client.setWallet(wallet);
    expect(requests).toEqual([]);
    await client.grantConsent();
    expect(requests).toEqual([{ path: "/api/real/consent", method: "POST", body: { address, chainIndex: "143", revision: 7, consent: true, queryScope: 'web3-rpc-read-v2' } }]);
    expect(client.getSnapshot().consent).toMatchObject({ identityKey: wallet.identityKey, revision: 7 });
    await client.revokeConsent();
    expect(requests.at(-1)).toEqual({ path: "/api/real/consent", method: "DELETE", body: null });
    expect(client.getSnapshot().consent).toBeNull();
  });

  test("an identity change queues revocation behind a delayed grant and cannot restore old consent", async () => {
    const methods: string[] = [];
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const client = createRealPipelineClient({ fetch: async (_input, init) => {
      methods.push(init?.method ?? "GET");
      return init?.method === "POST" ? pending : Response.json({ active: false });
    } });
    client.setWallet(wallet);
    const granting = client.grantConsent();
    await Promise.resolve();
    const changing = client.setWallet({ ...wallet, revision: 8 });
    finish(Response.json({ active: true, queryScope: 'web3-rpc-read-v2', identityKey: wallet.identityKey, chainIndex: "143", revision: 7 }));
    await granting;
    await changing;
    expect(methods).toEqual(["POST", "DELETE"]);
    expect(client.getSnapshot()).toMatchObject({ consent: null, latest: null, busy: false });
  });

  test("an incompatible grant response is revoked instead of leaving remote consent active", async () => {
    const methods: string[] = [];
    const client = createRealPipelineClient({ fetch: async (_input, init) => {
      methods.push(init?.method ?? "GET");
      return Response.json(init?.method === "POST" ? { active: true, queryScope: 'web3-rpc-read-v2', identityKey: "other-account", chainIndex: "143", revision: 7 } : { active: false });
    } });
    client.setWallet(wallet);
    await client.grantConsent();
    for (let turn = 0; turn < 10 && client.getSnapshot().busy; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(methods).toEqual(["POST", "DELETE"]);
    expect(client.getSnapshot().consent).toBeNull();
  });

  test("revocation reaches the backend while a refresh is still awaiting a response", async () => {
    const methods: string[] = [];
    let finish!: (response: Response) => void;
    const delayed = new Promise<Response>((resolve) => { finish = resolve; });
    const client = createRealPipelineClient({ fetch: async (input, init) => {
      methods.push(`${init?.method ?? "GET"} ${input}`);
      if (String(input).endsWith("refresh")) return delayed;
      return Response.json(init?.method === "POST" ? { active: true, queryScope: 'web3-rpc-read-v2', identityKey: wallet.identityKey, chainIndex: "143", revision: 7 } : { active: false });
    } });
    client.setWallet(wallet);
    await client.grantConsent();
    const refreshing = client.refresh();
    await Promise.resolve();
    const revoking = client.revokeConsent();
    for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
    const revokedBeforeRefreshFinished = methods.includes("DELETE /api/real/consent");
    finish(Response.json({ accepted: true }));
    await refreshing;
    await revoking;
    expect(revokedBeforeRefreshFinished).toBe(true);
    expect(client.getSnapshot().consent).toBeNull();
  });
});

describe("pipeline synchronization", () => {
  test("leaving the component aborts an in-flight refresh without restoring a sample", async () => {
    let finish!: (response: Response) => void;
    let refreshSignal: AbortSignal | null | undefined;
    const delayed = new Promise<Response>((resolve) => { finish = resolve; });
    const client = createRealPipelineClient({ fetch: async (input, init) => {
      if (String(input).endsWith("refresh")) { refreshSignal = init?.signal; return delayed; }
      return Response.json(String(input).endsWith("health") ? health : { cycle: null, history: [] });
    } });
    const stop = client.start();
    const refreshing = client.refresh();
    stop();
    const abortedAtCleanup = refreshSignal?.aborted;
    finish(Response.json({ accepted: true }));
    await refreshing;
    expect(abortedAtCleanup).toBe(true);
    expect(client.getSnapshot().latest).toBeNull();
  });

  test("polling reads local health without granting remote consent", async () => {
    const requests: string[] = [];
    const client = createRealPipelineClient({ apiBase: "http://127.0.0.1:3000", fetch: async (input) => {
      requests.push(String(input));
      return Response.json(String(input).endsWith("health") ? { ...health, walletConsent: { active: true, queryScope: 'web3-rpc-read-v2', identityKey: wallet.identityKey, chainIndex: "143", revision: 7 } } : { cycle: null, history: [] });
    } });
    await client.sync();
    expect(requests).toEqual(["http://127.0.0.1:3000/api/real/health", "http://127.0.0.1:3000/api/real/latest"]);
    expect(client.getSnapshot()).toMatchObject({ health: { mode: "paper" }, consent: null, latest: { cycle: null, history: [] } });
  });

  test("an identity change aborts polling and discards a delayed reply", async () => {
    let finish!: (response: Response) => void;
    let signal: AbortSignal | null | undefined;
    const delayed = new Promise<Response>((resolve) => { finish = resolve; });
    const client = createRealPipelineClient({ fetch: async (input, init) => {
      signal = init?.signal;
      return String(input).endsWith("health") ? delayed : Response.json({ cycle: null, history: [] });
    } });
    client.setWallet(wallet);
    const syncing = client.sync();
    await client.setWallet({ ...wallet, revision: 8 });
    expect(signal?.aborted).toBe(true);
    finish(Response.json(health));
    await syncing;
    expect(client.getSnapshot()).toMatchObject({ health: null, latest: null, syncedAtMs: null });
  });

  test("refresh reaches the real endpoint and an old sample cannot appear for the current wallet", async () => {
    const requests: string[] = [];
    const oldCore = { identityKey: wallet.identityKey, chainIndex: "143", revision: 6, envelopes: {}, capabilities: [], holdReasons: [], observedAtMs: 1, correlationId: "old", proposal: null };
    const cycle = { id: "old", sequence: 1, startedAtMs: 1, finishedAtMs: 2, mode: "paper", core: oldCore, decision: { choice: "hold", status: "blocked", model: null, latencyMs: null, inputTokens: null, costUsd: null, reasons: [] }, realizedPnlUsd: null, executionEnabled: false };
    const client = createRealPipelineClient({ fetch: async (input, init) => {
      requests.push(`${init?.method ?? "GET"} ${input}`);
      if (String(input).endsWith("consent")) return Response.json({ active: true, queryScope: 'web3-rpc-read-v2', identityKey: wallet.identityKey, chainIndex: "143", revision: 7 });
      if (String(input).endsWith("health")) return Response.json({ ...health, walletConsent: { active: true, queryScope: 'web3-rpc-read-v2', identityKey: wallet.identityKey, chainIndex: "143", revision: 7 } });
      return Response.json(String(input).endsWith("latest") ? { cycle, history: [cycle] } : { accepted: true });
    } });
    client.setWallet(wallet);
    await client.grantConsent();
    await client.refresh();
    expect(requests).toContain("POST /api/real/refresh");
    expect(client.getSnapshot().latest?.cycle?.core).toBeNull();
    expect(client.getSnapshot().latest?.history[0]?.core).toBeNull();
  });
});
