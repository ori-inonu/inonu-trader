import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore } from "../settings/store";
import { createBudget } from "./budget";
import { createOnchainCache } from "./cache";
import { createOnchainClient } from "./client";
import { createOnchainGateway } from "./gateway";
import { createOnchainHandler } from "./http";

/**
 * Sentinel sweep: real store + real gateway + fake provider. Unique sentinel credentials are stored through
 * the real path; every HTTP response, the console output and every file written under the temp dir are then
 * scanned for the sentinels. They must appear only inside the two env files.
 */
const SENT_KEY = "SNT-KEY-zz11";
const SENT_SECRET = "SNT-SECRET-ww22";
const SENT_PASS = "SNT PASS vv33";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jev-onchain-leak-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

describe("sentinel credential sweep", () => {
  test("secrets never reach responses, console output or non-env files", async () => {
    const dir = tempDir();
    const store = createSettingsStore(dir, { runtimeKey: () => null });
    store.set("okxWeb3ApiKey", SENT_KEY);
    store.set("okxWeb3ApiSecret", SENT_SECRET);
    store.set("okxWeb3ApiPassphrase", SENT_PASS);

    const fetchLog: string[] = [];
    const client = createOnchainClient({
      credentials: () => store.credentials().okx,
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        // the provider side legitimately receives the signed headers; record only that they exist
        const h = init?.headers as Record<string, string>;
        fetchLog.push(`${url} ${h["OK-ACCESS-KEY"] ? "signed" : "unsigned"}`);
        return new Response(JSON.stringify({ code: "0", data: [{ chainIndex: "1", chainName: "Eth", chainSymbol: "ETH" }], msg: "" }), { status: 200 });
      }) as typeof fetch,
      now: () => 1_000_000,
      minIntervalMs: 0,
    });
    const gateway = createOnchainGateway({
      client,
      cache: createOnchainCache(() => 1_000_000),
      budget: createBudget({ dir, now: () => 1_000_000, caps: () => ({ basic: 100, premium: 100 }) }),
      credentialsState: () => store.status().okx.state,
      now: () => 1_000_000,
    });
    const handler = createOnchainHandler({ gateway, origins: ["http://localhost:1"] });

    const hits: string[] = [];
    for (const path of ["/onchain/chains", "/onchain/budget", "/onchain/status", "/onchain/nope", "/onchain/hot-tokens?chainIndex=bad"]) {
      const req = new Request(`http://localhost:1${path}`, { headers: { origin: "http://localhost:1", host: "localhost:1" } });
      const res = await handler(req, "127.0.0.1");
      hits.push(await res.text(), JSON.stringify(Object.fromEntries(res.headers)));
    }
    for (const p of walk(dir)) {
      const content = readFileSync(p, "utf8");
      const isEnv = p.endsWith("onchainos.env") || p.endsWith("jev.env");
      if (!isEnv) hits.push(content);
    }
    const hay = hits.join("\n") + "\n" + fetchLog.join("\n");
    expect(hay).not.toContain(SENT_SECRET);
    expect(hay).not.toContain(SENT_PASS);
    // the api key is a header the provider legitimately sees; it must not appear in responses or files
    expect(hits.join("\n")).not.toContain(SENT_KEY);
  });
});
