import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EVM_CHAINS, publicEvmRpcOverrides, readMultichainBalances, type EvmRpcFetch } from "./evm-multichain";

// C-A10. NEXT_PUBLIC_EVM_RPC_<chainIndex> never reached the browser because the panel passed the whole process.env object
// (see client-env-scan.test.ts). publicEvmRpcOverrides reads each documented variable with its own literal access.

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const NAMES = EVM_CHAINS.map((chain) => `NEXT_PUBLIC_EVM_RPC_${chain.chainIndex}`);

const saved = new Map<string, string | undefined>();
function setEnv(name: string, value: string | undefined) {
  if (!saved.has(name)) saved.set(name, process.env[name]);
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
}
afterEach(() => {
  for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  saved.clear();
});

describe("C-A10 publicEvmRpcOverrides", () => {
  test("has one entry for every network of the multichain table, undefined while nothing is set", () => {
    for (const name of NAMES) setEnv(name, undefined);
    const overrides = publicEvmRpcOverrides();
    expect(Object.keys(overrides).sort()).toEqual([...NAMES].sort());
    for (const name of NAMES) expect(overrides[name], name).toBeUndefined();
  });

  test("returns the value of each variable under its own name", () => {
    NAMES.forEach((name, index) => setEnv(name, `https://rpc-${index}.example.test/path`));
    const overrides = publicEvmRpcOverrides();
    NAMES.forEach((name, index) => expect(overrides[name], name).toBe(`https://rpc-${index}.example.test/path`));
  });

  test("carries nothing else from the environment, whatever its name or value", () => {
    setEnv("SECRET_CANARY_TOKEN", "canary-5b2e");
    setEnv("PRIVATE_KEY", "0x" + "11".repeat(32));
    setEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:3999");
    setEnv("NEXT_PUBLIC_EVM_RPC_999999", "https://not-a-table-chain.example.test");
    setEnv("NEXT_PUBLIC_EVM_RPC_196", "https://override.example.test/xlayer");
    const overrides = publicEvmRpcOverrides();
    expect(Object.keys(overrides)).not.toContain("SECRET_CANARY_TOKEN");
    expect(Object.keys(overrides)).not.toContain("PRIVATE_KEY");
    expect(Object.keys(overrides)).not.toContain("NEXT_PUBLIC_API_URL");
    expect(Object.keys(overrides)).not.toContain("NEXT_PUBLIC_EVM_RPC_999999");
    expect(JSON.stringify(overrides)).not.toContain("canary-5b2e");
    expect(JSON.stringify(overrides)).not.toContain("0x" + "11".repeat(32));
    expect(overrides.NEXT_PUBLIC_EVM_RPC_196).toBe("https://override.example.test/xlayer");
  });

  test("reaches the read path: the configured RPC is the one the balances are read from, and the others keep their public default", async () => {
    setEnv("NEXT_PUBLIC_EVM_RPC_196", "https://override.example.test/xlayer");
    const urls: string[] = [];
    const rpc: EvmRpcFetch = async (url) => { urls.push(url); throw new Error("offline"); };
    const snapshot = await readMultichainBalances(ACCOUNT, rpc, { chains: EVM_CHAINS.filter((chain) => ["196", "143"].includes(chain.chainIndex)), overrides: publicEvmRpcOverrides() });
    expect(snapshot.chains.map((chain) => chain.rpcHost).sort()).toEqual(["override.example.test", "rpc.monad.xyz"]);
    expect(urls.sort()).toEqual(["https://override.example.test/xlayer", "https://rpc.monad.xyz"]);
  });

  test("survives the way Next builds the browser bundle: each literal access is replaced by its value and process.env is empty", () => {
    const text = readFileSync(join(import.meta.dir, "evm-multichain.ts"), "utf8").replaceAll("\r\n", "\n");
    const start = text.indexOf("export function publicEvmRpcOverrides");
    const body = text.slice(start, text.indexOf("\n}\n", start) + 3).replace("export function", "function");
    const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(body);
    const inlined = { NEXT_PUBLIC_EVM_RPC_196: "https://bundle.example.test/xlayer", NEXT_PUBLIC_EVM_RPC_8453: "https://bundle.example.test/base" } as Record<string, string>;
    // What the bundler does: replace process.env.NEXT_PUBLIC_NAME by the build-time value, and nothing else.
    const built = javascript.replace(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g, (_match, variable: string) => (inlined[variable] === undefined ? "undefined" : JSON.stringify(inlined[variable])));
    const browserProcess = { env: {} as Record<string, string> };
    const overrides = new Function("process", `${built}\nreturn publicEvmRpcOverrides();`)(browserProcess) as Record<string, string | undefined>;
    expect(overrides.NEXT_PUBLIC_EVM_RPC_196).toBe("https://bundle.example.test/xlayer");
    expect(overrides.NEXT_PUBLIC_EVM_RPC_8453).toBe("https://bundle.example.test/base");
    expect(overrides.NEXT_PUBLIC_EVM_RPC_143).toBeUndefined();
    // The control: the old call, process.env handed over whole, is an empty object once the bundler has run.
    const wholeObject = new Function("process", "return process.env;")(browserProcess) as Record<string, string | undefined>;
    expect(wholeObject.NEXT_PUBLIC_EVM_RPC_196).toBeUndefined();
  });

  test("web/.env.example documents exactly these variables, so a network added to the table has to be documented and read", () => {
    const example = readFileSync(join(import.meta.dir, "..", "..", ".env.example"), "utf8");
    const documented = [...new Set([...example.matchAll(/^#?\s*(NEXT_PUBLIC_EVM_RPC_\d+)=/gm)].map((match) => match[1]!))].sort();
    expect(documented).toEqual([...NAMES].sort());
    // The example values are the public defaults of the table, as the file says.
    for (const match of example.matchAll(/^#?\s*NEXT_PUBLIC_EVM_RPC_(\d+)=(\S+)/gm)) expect(match[2], `chain ${match[1]}`).toBe(EVM_CHAINS.find((chain) => chain.chainIndex === match[1])?.rpcUrl);
  });
});
