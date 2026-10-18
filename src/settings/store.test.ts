import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore as createAmbientSettingsStore, validateSecretValue, type SecretId } from "./store";
const createSettingsStore = (dir: string) => createAmbientSettingsStore(dir, { runtimeKey: () => null });

/**
 * Every test runs against a fresh directory under the OS temp dir; the real data/ files are never read or
 * written. The roundtrip tests load the written file with the REAL Bun env loader in a spawned process, which
 * is the exact reader the producer uses.
 */

const dirs: string[] = [];
function tempDir(): string {
 const dir = mkdtempSync(join(tmpdir(), "jev-settings-"));
 dirs.push(dir);
 return dir;
}
afterEach(() => {
 while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function bunRead(file: string, key: string): string | undefined {
 const env: Record<string, string> = {};
 for (const name of ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "Path"]) {
  const value = process.env[name];
  if (value !== undefined) env[name] = value;
 }
 const out = Bun.spawnSync(
  [process.execPath, "--no-env-file", `--env-file=${file}`, "-e", `console.log(JSON.stringify(process.env.${key} ?? null))`],
  { env, stdout: "pipe", stderr: "pipe" },
 );
 expect(out.exitCode).toBe(0);
 const parsed = JSON.parse(out.stdout.toString().trim() || "null");
 return parsed === null ? undefined : parsed;
}

describe("validateSecretValue", () => {
 test.each([
  ["too short", "abc", "value_too_short"],
  ["not a string", 42 as unknown as string, "value_not_string"],
  ["single quote", "abcd'efghij", "value_invalid_chars"],
  ["backslash with dollar", "a\\b$cdefgh", "value_invalid_chars"],
  ["trailing backslash", "abcabcabc\\", "value_invalid_chars"],
  ["control char", "abcdefg\u0007hij", "value_invalid_chars"],
  ["non ascii", "abcdefgh\u00e9ij", "value_invalid_chars"],
 ])("rejects %s", (_name, value, code) => {
  const result = validateSecretValue(value);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe(code);
 });

 test("accepts printable ASCII with hash, quotes, backslash, space and equals", () => {
  for (const value of ["abcd#efg hij", 'key"with"quotes!', "back\\slash value", "a=b c#d e", "  spaces  ok  ", "has$dollar0", "$VAR and ${X}", "ends$with$"]) {
   expect(validateSecretValue(value).ok).toBe(true);
  }
 });

 test("rejects values longer than 256 characters", () => {
  expect(validateSecretValue("x".repeat(257)).ok).toBe(false);
  expect(validateSecretValue("x".repeat(256)).ok).toBe(true);
 });
});

describe("settings store", () => {
 test("discovers an ambient Jev credential without exposing any key characters", () => {
  const store = createAmbientSettingsStore(tempDir(), {
   runtimeKey: () => ({ value: "ambient-secret-1234", origin: "process_environment" }),
  });
  expect(store.status().secrets.typesafeAiApiKey).toMatchObject({
   configured: true, origin: "process_environment", last4: null, updatedAtMs: null,
  });
  expect(store.credentials().typesafeAiApiKey).toBe("ambient-secret-1234");
  expect(JSON.stringify(store.status())).not.toContain("1234");
 });

 test("local Jev configuration wins and clearing it reveals ambient origin without changing the ambient value", () => {
  const ambient = { value: "ambient-key-9876", origin: "windows_user" as const };
  const store = createAmbientSettingsStore(tempDir(), { runtimeKey: () => ambient });
  store.set("typesafeAiApiKey", "local-model-key-1234");
  expect(store.credentials().typesafeAiApiKey).toBe("local-model-key-1234");
  expect(store.status().secrets.typesafeAiApiKey).toMatchObject({ configured: true, origin: "local", last4: null });
  store.clear("typesafeAiApiKey");
  expect(store.credentials().typesafeAiApiKey).toBe("ambient-key-9876");
  expect(store.status().secrets.typesafeAiApiKey).toMatchObject({ configured: true, origin: "windows_user", last4: null, updatedAtMs: null });
  expect(ambient.value).toBe("ambient-key-9876");
 });

 test("a failed discovery exposes neither a credential nor its exception", () => {
  const store = createAmbientSettingsStore(tempDir(), { runtimeKey: () => { throw new Error("secret-not-for-status"); } });
  expect(store.status().secrets.typesafeAiApiKey).toMatchObject({ configured: false, origin: null, last4: null });
  expect(store.credentials().typesafeAiApiKey).toBeNull();
 });

 test("roundtrips tricky values through the real Bun env loader", () => {
  const dir = tempDir();
  const store = createSettingsStore(dir);
  const values: Record<string, string> = {
   typesafeAiApiKey: 'TSK ab#c"d\\e=f ghij',
   okxWeb3ApiKey: "OKK#12 34=56\"78\\90ab",
   okxWeb3ApiSecret: "SEC ret #9\"8\\7=6xyz",
   okxWeb3ApiPassphrase: "pass phrase #1\"2\\3=4",
  };
  for (const [id, value] of Object.entries(values)) store.set(id as SecretId, value);
  expect(bunRead(join(dir, "jev.env"), "TYPESAFE_AI_API_KEY")).toBe(values.typesafeAiApiKey);
  for (const key of ["OKX_WEB3_API_KEY", "OKX_WEB3_API_SECRET", "OKX_WEB3_API_PASSPHRASE"] as const) {
   const id = key === "OKX_WEB3_API_KEY" ? "okxWeb3ApiKey" : key === "OKX_WEB3_API_SECRET" ? "okxWeb3ApiSecret" : "okxWeb3ApiPassphrase";
   expect(bunRead(join(dir, "onchainos.env"), key)).toBe(values[id]);
  }
 });

 test.each([
  "dollar$inside",
  "$leadingDollar",
  "trailingDollar$",
  "double$$dollar",
  "not$VARiable",
  "braced${HOME}x",
  "mix$ of#hash=and space",
  "!\"%&()*+,-./0123456789:;<=>?@A[]^_`a{|}~z$",
 ])("bun reads back %j with the dollar escape undone", (value) => {
  const dir = tempDir();
  const store = createSettingsStore(dir);
  store.set("typesafeAiApiKey", value);
  expect(bunRead(join(dir, "jev.env"), "TYPESAFE_AI_API_KEY")).toBe(value);
  // our own reader agrees with the loader
  expect(store.credentials().typesafeAiApiKey).toBe(value);
 });

 test("every printable ASCII value the validator accepts roundtrips exactly", () => {
  const dir = tempDir();
  const store = createSettingsStore(dir);
  const alphabet = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i))
   .filter((ch) => ch !== "'" && ch !== "\\")
   .join("");
  store.set("typesafeAiApiKey", `AA${alphabet}ZZ`);
  expect(bunRead(join(dir, "jev.env"), "TYPESAFE_AI_API_KEY")).toBe(`AA${alphabet}ZZ`);
  expect(store.credentials().typesafeAiApiKey).toBe(`AA${alphabet}ZZ`);
 });

 test("backslash without dollar roundtrips literally", () => {
  const dir = tempDir();
  const store = createSettingsStore(dir);
  store.set("typesafeAiApiKey", "a\\b\\cdefgh");
  expect(bunRead(join(dir, "jev.env"), "TYPESAFE_AI_API_KEY")).toBe("a\\b\\cdefgh");
  expect(store.credentials().typesafeAiApiKey).toBe("a\\b\\cdefgh");
 });

 test("preserves other lines and comments when updating one key", () => {
  const dir = tempDir();
  const path = join(dir, "onchainos.env");
  writeFileSync(path, "# comentario do usuario\nOKX_WEB3_API_KEY=oldvalue\nOTHER_LINE='untouched 42'\n\nOKX_WEB3_API_SECRET=oldsecret\n");
  const store = createSettingsStore(dir);
  store.set("okxWeb3ApiKey", "newkey-9999-aaaa");
  const text = readFileSync(path, "utf8");
  expect(text).toContain("# comentario do usuario");
  expect(text).toContain("OTHER_LINE='untouched 42'");
  expect(text).toContain("OKX_WEB3_API_SECRET=oldsecret");
  expect(text).toContain("OKX_WEB3_API_KEY='newkey-9999-aaaa'");
  expect(text).not.toContain("oldvalue");
  expect(bunRead(path, "OTHER_LINE")).toBe("untouched 42");
  expect(bunRead(path, "OKX_WEB3_API_SECRET")).toBe("oldsecret");
 });

 test("leaves no temporary files behind after a write", () => {
  const dir = tempDir();
  const store = createSettingsStore(dir);
  store.set("typesafeAiApiKey", "abcdefghij");
  for (const entry of readdirSync(dir)) expect(entry).not.toContain(".tmp-");
  store.setPrefs({ onchain: { capBasic: 1000 } });
  for (const entry of readdirSync(join(dir, "settings"))) expect(entry).not.toContain(".tmp-");
 });

 test("status reports configured, last4 only where allowed, and okx state", () => {
  const dir = tempDir();
  const store = createSettingsStore(dir);
  let status = store.status();
  expect(status.okx.state).toBe("absent");
  for (const s of Object.values(status.secrets)) {
   expect(s.configured).toBe(false);
   expect(s.last4).toBeNull();
   expect(s.updatedAtMs).toBeNull();
  }
  store.set("okxWeb3ApiKey", "kkkkkkkkkk1234");
  status = store.status();
  expect(status.okx.state).toBe("incomplete");
  expect(status.secrets.okxWeb3ApiKey.last4).toBe("1234");
  store.set("okxWeb3ApiSecret", "ssssssssss5678");
  store.set("okxWeb3ApiPassphrase", "pppppppppp ab");
  status = store.status();
  expect(status.okx.state).toBe("complete");
  expect(status.secrets.okxWeb3ApiSecret.last4).toBeNull();
  expect(status.secrets.okxWeb3ApiPassphrase.last4).toBeNull();
  expect(status.secrets.okxWeb3ApiSecret.updatedAtMs).toBeGreaterThan(0);
 });

 test("clear removes only that key and drops the configured flag", () => {
  const dir = tempDir();
  const store = createSettingsStore(dir);
  store.set("typesafeAiApiKey", "typedevkey1");
  store.set("okxWeb3ApiKey", "okxkey999999");
  store.clear("typesafeAiApiKey");
  const status = store.status();
  expect(status.secrets.typesafeAiApiKey.configured).toBe(false);
  expect(status.secrets.typesafeAiApiKey.updatedAtMs).toBeNull();
  expect(status.secrets.okxWeb3ApiKey.configured).toBe(true);
  expect(bunRead(join(dir, "jev.env"), "TYPESAFE_AI_API_KEY")).toBeUndefined();
  expect(readFileSync(join(dir, "jev.env"), "utf8")).not.toContain("TYPESAFE");
  store.clear("typesafeAiApiKey"); // clearing an absent key is a no-op
 });

 test("set rejects invalid values and never writes them", () => {
  const dir = tempDir();
  const store = createSettingsStore(dir);
  expect(() => store.set("typesafeAiApiKey", "short")).toThrowError();
  expect(() => store.set("typesafeAiApiKey", "a\\b$dollar")).toThrowError();
  expect(() => store.set("typesafeAiApiKey", "has'quote00")).toThrowError();
  expect(() => store.set("typesafeAiApiKey", "trailing\\")).toThrowError();
  expect(existsSync(join(dir, "jev.env"))).toBe(false);
 });

 test("credentials exposes okx only when the triple is complete", () => {
  const dir = tempDir();
  const store = createSettingsStore(dir);
  store.set("typesafeAiApiKey", "aikey-abcdef");
  store.set("okxWeb3ApiKey", "key-abcdefgh");
  expect(store.credentials().okx).toBeNull();
  store.set("okxWeb3ApiSecret", "sec-abcdefgh");
  store.set("okxWeb3ApiPassphrase", "pass abcdefg");
  const credentials = store.credentials();
  expect(credentials.typesafeAiApiKey).toBe("aikey-abcdef");
  expect(credentials.okx).toEqual({ apiKey: "key-abcdefgh", secret: "sec-abcdefgh", passphrase: "pass abcdefg" });
 });

 test("reads a pre-existing unquoted env file", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "jev.env"), "TYPESAFE_AI_API_KEY=plainvalue123\n");
  const store = createSettingsStore(dir);
  expect(store.credentials().typesafeAiApiKey).toBe("plainvalue123");
  expect(store.status().secrets.typesafeAiApiKey.last4).toBeNull();
  expect(store.status().secrets.typesafeAiApiKey.origin).toBe("local");
 });

 test("prefs defaults when absent, roundtrips, and validates field by field", () => {
  const dir = tempDir();
  const store = createSettingsStore(dir);
  expect(store.prefs()).toEqual({ version: 1, onchain: { capBasic: 50_000, capPremium: 50_000, background: false, defaultChainIndex: null } });
  const prefs = store.setPrefs({ onchain: { capBasic: 1234, defaultChainIndex: "196" } });
  expect(prefs.onchain).toEqual({ capBasic: 1234, capPremium: 50_000, background: false, defaultChainIndex: "196" });
  expect(createSettingsStore(dir).prefs()).toEqual(prefs);
  for (const patch of [
   { onchain: { capBasic: -1 } },
   { onchain: { capBasic: 100_001 } },
   { onchain: { capBasic: 1.5 } },
   { onchain: { background: "yes" } },
   { onchain: { defaultChainIndex: "abc" } },
   { onchain: { defaultChainIndex: "1".repeat(13) } },
   { onchain: "x" },
   "x",
  ] as const) {
   expect(() => store.setPrefs(patch as never)).toThrowError();
  }
 });

 test("an invalid prefs file falls back to defaults", () => {
  const dir = tempDir();
  mkdirSync(join(dir, "settings"), { recursive: true });
  writeFileSync(join(dir, "settings", "user.json"), "{not json");
  expect(createSettingsStore(dir).prefs().onchain.capBasic).toBe(50_000);
  writeFileSync(join(dir, "settings", "user.json"), JSON.stringify({ version: 1, onchain: { capBasic: 999 } }));
  const prefs = createSettingsStore(dir).prefs();
  expect(prefs.onchain.capBasic).toBe(999);
  expect(prefs.onchain.capPremium).toBe(50_000);
 });
});
