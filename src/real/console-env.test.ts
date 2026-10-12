import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRealConfig } from "./config";
import { BACKEND_CREDENTIAL_ENV, BACKEND_REAL_ENV, CHILD_BASE_ENV, CONSOLE_ONLY_REAL_ENV, backendChildEnv, frontendChildEnv } from "./console-env";

// D-A2. The two processes that real:console creates receive an explicit, minimal environment. The parents below look like
// what `bun run` leaves behind after auto loading a repository .env full of unrelated secrets (all values are synthetic).

const CANARY = "canary-7e41c9";
const SECRETS = {
  CANARY_FROM_DOTENV: CANARY,
  PRIVATE_KEY: "0x" + "11".repeat(32),
  OPERATOR_PRIVATE_KEY: "0x" + "22".repeat(32),
  SOLANA_PRIVATE_KEY: "solana-secret-9c1d",
  LIVE_ACK: "live-ack-5d2f",
  OPERATOR_EXECUTE: "execute-flag-6e30",
  OPERATOR_LIVE_ACK: "operator-ack-7f41",
  DRY_RUN: "dry-run-flag-8a52",
  RPC_URL: "https://rpc.example.test/key-4f2a",
  NODE_OPTIONS: "--require ./preload.js",
};
const SHELL = { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", TEMP: "C:\\Temp", TMP: "C:\\Temp", PATH: "C:\\bun;C:\\node", USERPROFILE: "C:\\Users\\someone", APPDATA: "C:\\Users\\someone\\AppData\\Roaming" };
const REAL_VALUES: Record<string, string> = {
  REAL_PORT: "3100", REAL_INTERVAL_MS: "15000", REAL_JOURNAL_PATH: "data/real/other.jsonl", REAL_JEV_MODEL: "jev-latest", REAL_JEV_CONSUMPTION_AUTHORIZED: "false",
  REAL_JEV_MAX_CALLS: "7", REAL_JEV_USD_PER_MILLION: "0.5", REAL_FROM_TOKEN: "0x" + "1".repeat(40), REAL_TO_TOKEN: "0x" + "2".repeat(40), REAL_AMOUNT: "1000000", REAL_SLIPPAGE_PERCENT: "0.5",
};
const CREDENTIALS = { OKX_WEB3_API_KEY: "web3-key-a1", OKX_WEB3_API_SECRET: "web3-secret-b2", OKX_WEB3_API_PASSPHRASE: "web3-pass-c3", TYPESAFE_AI_API_KEY: "jev-key-d4" };
const CONSOLE_ONLY = { REAL_UI_PORT: "3201", REAL_UI_MODE: "production", REAL_NODE_EXECUTABLE: "C:\\node\\node.exe", REAL_DASHBOARD_ORIGINS: "https://attacker.example" };
const PARENT = { ...SHELL, ...SECRETS, ...REAL_VALUES, ...CREDENTIALS, ...CONSOLE_ONLY };

const UI_PORT = 3201;
const BACKEND_PORT = 3100;

describe("D-A2 the environment of the console children", () => {
  test("no variable that came from a loaded .env reaches either child, whatever its name or value", () => {
    const backend = backendChildEnv(PARENT, UI_PORT);
    const frontend = frontendChildEnv(PARENT, BACKEND_PORT);
    for (const env of [backend, frontend]) {
      for (const [name, value] of Object.entries(SECRETS)) {
        expect(Object.keys(env), `${name} must not be a child variable`).not.toContain(name);
        expect(Object.values(env), `the value of ${name} must not be passed under another name`).not.toContain(value);
      }
      expect(JSON.stringify(env)).not.toContain(CANARY);
    }
  });

  test("the shell contributes only SystemRoot, WINDIR, TEMP, TMP and PATH", () => {
    expect([...CHILD_BASE_ENV]).toEqual(["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"]);
    for (const env of [backendChildEnv(PARENT, UI_PORT), frontendChildEnv(PARENT, BACKEND_PORT)]) {
      for (const name of CHILD_BASE_ENV) expect(env[name]).toBe((SHELL as Record<string, string>)[name]!);
      expect(Object.keys(env)).not.toContain("USERPROFILE");
      expect(Object.keys(env)).not.toContain("APPDATA");
    }
  });

  test("the backend gets exactly the documented REAL_ variables plus the application's own service credentials, and nothing else", () => {
    const backend = backendChildEnv(PARENT, UI_PORT);
    for (const [name, value] of Object.entries(REAL_VALUES)) expect(backend[name]).toBe(value);
    for (const [name, value] of Object.entries(CREDENTIALS)) expect(backend[name]).toBe(value);
    const expected = new Set<string>([...CHILD_BASE_ENV, ...BACKEND_REAL_ENV, ...BACKEND_CREDENTIAL_ENV, "REAL_DASHBOARD_ORIGINS"]);
    expect(Object.keys(backend).filter((name) => !expected.has(name))).toEqual([]);
  });

  test("the frontend never receives a credential or any REAL_ variable", () => {
    const frontend = frontendChildEnv(PARENT, BACKEND_PORT);
    expect(Object.keys(frontend).filter((name) => name.startsWith("REAL_"))).toEqual([]);
    for (const name of BACKEND_CREDENTIAL_ENV) expect(Object.keys(frontend)).not.toContain(name);
    expect(Object.keys(frontend).sort()).toEqual([...CHILD_BASE_ENV, "NEXT_PUBLIC_API_URL", "NEXT_TELEMETRY_DISABLED"].sort());
    expect(frontend.NEXT_PUBLIC_API_URL).toBe("http://127.0.0.1:3100");
    expect(frontend.NEXT_TELEMETRY_DISABLED).toBe("1");
  });

  test("the console's own variables are not inherited and the dashboard origins are computed from the UI port", () => {
    expect([...CONSOLE_ONLY_REAL_ENV].sort()).toEqual(["REAL_NODE_EXECUTABLE", "REAL_UI_MODE", "REAL_UI_PORT"]);
    const backend = backendChildEnv(PARENT, UI_PORT);
    for (const name of CONSOLE_ONLY_REAL_ENV) expect(Object.keys(backend)).not.toContain(name);
    expect(backend.REAL_DASHBOARD_ORIGINS).toBe("http://localhost:3201,http://127.0.0.1:3201");
  });

  test("missing variables stay missing instead of becoming empty strings", () => {
    const backend = backendChildEnv({ PATH: "C:\\bun" }, UI_PORT);
    expect(backend).toEqual({ PATH: "C:\\bun", REAL_DASHBOARD_ORIGINS: "http://localhost:3201,http://127.0.0.1:3201" });
    expect(frontendChildEnv({}, BACKEND_PORT)).toEqual({ NEXT_PUBLIC_API_URL: "http://127.0.0.1:3100", NEXT_TELEMETRY_DISABLED: "1" });
  });

  test("Windows spells the same variables with other letter cases; they are found and handed on under the canonical names", () => {
    const backend = backendChildEnv({ Path: "C:\\bun", SYSTEMROOT: "C:\\Windows", Windir: "C:\\Windows", temp: "C:\\T", Tmp: "C:\\T", real_port: "3100", Okx_Web3_Api_Key: "web3-key-a1", Secret_Thing: "x" }, UI_PORT);
    expect(backend).toMatchObject({ PATH: "C:\\bun", SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", TEMP: "C:\\T", TMP: "C:\\T", REAL_PORT: "3100", OKX_WEB3_API_KEY: "web3-key-a1" });
    expect(Object.keys(backend)).not.toContain("Secret_Thing");
    expect(Object.keys(backend)).not.toContain("Path");
  });

  test("an exact name wins over a differently cased duplicate", () => {
    expect(backendChildEnv({ path: "wrong", PATH: "right" }, UI_PORT).PATH).toBe("right");
  });

  test("the backend environment is accepted by the real loader unchanged, and the defaults hold when nothing is set", () => {
    expect(loadRealConfig(backendChildEnv(PARENT, UI_PORT)).port).toBe(3100);
    const bare = loadRealConfig(backendChildEnv({}, UI_PORT));
    expect(bare.port).toBe(3000);
    expect(bare.origins).toEqual(["http://localhost:3201", "http://127.0.0.1:3201"]);
    expect(bare.credentials).toBeUndefined();
  });

  test("the REAL_ and credential lists match what the loader reads and what real.env.example documents", () => {
    const loader = readFileSync(join(import.meta.dir, "config.ts"), "utf8");
    const read = (pattern: RegExp, text: string) => [...new Set([...text.matchAll(pattern)].map((match) => match[0]))].sort();
    const loaderReal = read(/\bREAL_[A-Z0-9_]+/g, loader).filter((name) => name !== "REAL_DASHBOARD_ORIGINS");
    expect(loaderReal).toEqual([...BACKEND_REAL_ENV].sort());
    expect(read(/\b(?:OKX_WEB3_API_(?:KEY|SECRET|PASSPHRASE)|TYPESAFE_AI_API_KEY)\b/g, loader)).toEqual([...BACKEND_CREDENTIAL_ENV].sort());
    const example = readFileSync(join(import.meta.dir, "..", "..", "docs", "real-integration", "real.env.example"), "utf8");
    const documented = read(/\bREAL_[A-Z0-9_]+/g, example);
    const known = new Set<string>([...BACKEND_REAL_ENV, ...CONSOLE_ONLY_REAL_ENV]);
    expect(documented.filter((name) => !known.has(name))).toEqual([]);
    expect(read(/\b(?:OKX_WEB3_API_(?:KEY|SECRET|PASSPHRASE)|TYPESAFE_AI_API_KEY)\b/g, example)).toEqual([...BACKEND_CREDENTIAL_ENV].sort());
  });

  test("the builders do not read the process environment themselves", () => {
    const source = readFileSync(join(import.meta.dir, "console-env.ts"), "utf8");
    expect(source).not.toMatch(/process\s*\.\s*env|Bun\s*\.\s*env|import\s*\.\s*meta\s*\.\s*env/);
  });
});
