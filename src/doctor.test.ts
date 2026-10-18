import { test, expect } from "bun:test";
import { resolve } from "node:path";

async function runDoctor(url: string) {
  const child = Bun.spawn([process.execPath, "--no-env-file", resolve(import.meta.dir, "../scripts/doctor.ts")], {
    env: { READ_RPC_URL: url, MODEL: "mock", DRY_RUN: "true", PRIVATE_KEY: "", TYPESAFE_AI_API_KEY: "" },
    stdout: "pipe", stderr: "pipe",
  });
  let killed = false;
  const deadline = setTimeout(() => { killed = true; child.kill(); }, 12_000);
  try {
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    return { stdout, stderr, exit, killed };
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null) child.kill();
    await child.exited;
  }
}

test("read-only doctor redacts provider errors from a credential-bearing endpoint", async () => {
  const canary = "SYNTHETIC_RPC_CREDENTIAL";
  const server = Bun.serve({ port: 0, async fetch(request) {
    const input = await request.json() as { id: unknown };
    return Response.json({ jsonrpc: "2.0", id: input.id, error: { code: -32000, message: canary } });
  } });
  try {
    const { stdout, stderr, exit, killed } = await runDoctor(`http://127.0.0.1:${server.port}/?key=${canary}`);
    expect(killed).toBe(false);
    expect(exit).toBe(0);
    expect(stdout + stderr).not.toContain(canary);
    const result = JSON.parse(stdout);
    expect(result.paperReady).toBe(false);
    expect(result.investmentReady).toBe(false);
    expect(result.rpcError).toBe("RPC/market check failed; verify connectivity, chain and contract locally.");
  } finally { server.stop(true); }
}, { timeout: 15_000 });

test("read-only doctor preserves SDK market fields and book economics with bounded RPC", async () => {
  const word = (value: bigint) => value.toString(16).padStart(64, "0");
  // getMarketParams ABI output: precision, assets/decimals, tick, min/max, taker/maker fees.
  const params = "0x" + [1000n, 100n, 0xb1n, 18n, 0xc1n, 6n, 10n, 1n, 100000n, 3n, 0n].map(word).join("");
  const payload = [42n, 1900n, 100n, 0n, 2100n, 100n, 0n].map(word).join("");
  const book = "0x" + word(32n) + word(BigInt(payload.length / 2)) + payload;
  const calls: Array<{ method: string; params: Array<{ from?: string; data?: string }> }> = [];
  const server = Bun.serve({ port: 0, async fetch(request) {
    const input = await request.json() as { id: unknown; method: string; params: Array<{ from?: string; data?: string }> };
    calls.push(input);
    const result = input.method === "eth_chainId" ? "0x8f"
      : input.method === "eth_gasPrice" ? "0x3b9aca00"
      : input.params[0]?.data === "0x46fdfbb1" ? book : params;
    return Response.json({ jsonrpc: "2.0", id: input.id, result });
  } });
  try {
    const { stdout, stderr, exit, killed } = await runDoctor(`http://127.0.0.1:${server.port}`);
    expect(killed).toBe(false);
    expect(exit).toBe(0);
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    expect(result.investmentReady).toBe(false);
    expect(result.rpcError).toBeUndefined();
    expect(result.market).toMatchObject({ chainId: 143, quoteToken: "0x00000000000000000000000000000000000000C1", mid: 2, minSizeMon: 0.01, makerFeeBpsRaw: 0, takerFeeBps: 3, gasPriceGwei: 1 });
    expect(result.costScreen.buy).toBeCloseTo(1.91);
    expect(result.costScreen.sell).toBeCloseTo(2.09);
    expect(calls.map((call) => call.method).toSorted()).toEqual(["eth_chainId", "eth_gasPrice", "eth_call", "eth_call"].toSorted());
    expect(calls.filter((call) => call.params[0]?.from)[0]?.params[0]?.from).toBe("0x0000000000000000000000000000000000000000");
    expect(server.pendingRequests).toBe(0);
  } finally { server.stop(true); }
}, { timeout: 15_000 });

test("read-only doctor cancels nonresponding RPC requests and exits without pending work", async () => {
  const canary = "SYNTHETIC_HANGING_RPC_CREDENTIAL";
  const methods: string[] = [];
  let active = 0;
  let aborted = 0;
  const server = Bun.serve({ port: 0, async fetch(request) {
    const input = await request.json() as { method: string };
    methods.push(input.method);
    active++;
    return new Promise<Response>((resolve) => {
      const finish = () => { active--; aborted++; resolve(new Response(null, { status: 499 })); };
      if (request.signal.aborted) finish();
      else request.signal.addEventListener("abort", finish, { once: true });
    });
  } });
  try {
    const { stdout, stderr, exit, killed } = await runDoctor(`http://127.0.0.1:${server.port}/?key=${canary}`);
    expect(killed).toBe(false);
    expect(exit).toBe(0);
    expect(stdout + stderr).not.toContain(canary);
    expect(JSON.parse(stdout)).toMatchObject({ paperReady: false, investmentReady: false, rpcError: "RPC/market check failed; verify connectivity, chain and contract locally." });
    expect(methods.toSorted()).toEqual(["eth_call", "eth_chainId", "eth_gasPrice"].toSorted());
    expect(active).toBe(0);
    expect(aborted).toBe(3);
    expect(server.pendingRequests).toBe(0);
  } finally { server.stop(true); }
}, { timeout: 15_000 });
