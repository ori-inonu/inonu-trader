import { test, expect } from "bun:test";
import { resolve } from "node:path";

test("read-only doctor redacts provider errors from a credential-bearing endpoint", async () => {
  const canary = "SYNTHETIC_RPC_CREDENTIAL";
  const server = Bun.serve({ port: 0, async fetch(request) {
    const input = await request.json() as { id: unknown };
    return Response.json({ jsonrpc: "2.0", id: input.id, error: { code: -32000, message: canary } });
  } });
  try {
    const child = Bun.spawn([process.execPath, resolve(import.meta.dir, "../scripts/doctor.ts")], {
      env: { ...process.env, READ_RPC_URL: `http://127.0.0.1:${server.port}/?key=${canary}`, MODEL: "mock", DRY_RUN: "true", PRIVATE_KEY: "", TYPESAFE_AI_API_KEY: "" },
      stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(exit).toBe(0);
    expect(stdout + stderr).not.toContain(canary);
    const result = JSON.parse(stdout);
    expect(result.paperReady).toBe(false);
    expect(result.investmentReady).toBe(false);
    expect(result.rpcError).toBe("RPC/market check failed; verify connectivity, chain and contract locally.");
  } finally { server.stop(true); }
}, { timeout: 15_000 });
