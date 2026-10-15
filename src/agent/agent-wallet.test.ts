import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { assetFor, CLI_RELEASE, installCli, parseAddresses, parseChecksums, parseLoginUrl, pollLogin, readAddresses, startLogin, type InstallDeps } from "./agent-wallet";
import { assertCommand, type CliResult, type CliRunner } from "./cli";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const BIN = new TextEncoder().encode("a pretend executable");
const ASSET = "onchainos-x86_64-pc-windows-msvc.exe";

function installer(over: { files?: Record<string, Uint8Array | null>; platform?: string; arch?: string; failWrite?: boolean } = {}) {
  const requested: string[] = [];
  const written: { path: string; bytes: Uint8Array }[] = [];
  const files: Record<string, Uint8Array | null> = {
    [`${CLI_RELEASE.base}/checksums.txt`]: new TextEncoder().encode(`${sha(BIN)}  ${ASSET}\n${"0".repeat(64)}  other-file\n`),
    [`${CLI_RELEASE.base}/${ASSET}`]: BIN,
    ...over.files,
  };
  const deps: InstallDeps = {
    fetch: async (url) => {
      requested.push(url);
      const body = files[url];
      return body === undefined || body === null ? new Response("nope", { status: 404 }) : new Response(body);
    },
    platform: over.platform ?? "win32",
    arch: over.arch ?? "x64",
    dir: "C:\\data\\agent\\cli",
    sha256: sha,
    write: (path, bytes) => {
      if (over.failWrite) throw new Error("disk");
      written.push({ path, bytes });
    },
    join: (dir, name) => `${dir}\\${name}`,
  };
  return { deps, requested, written };
}

describe("installing the tool of the Agentic Wallet", () => {
  test("downloads the checksums and the tool of the same release, keeps the tool only when its hash is the published one", async () => {
    const t = installer();
    const result = await installCli(t.deps);
    expect(result).toEqual({ ok: true, path: `C:\\data\\agent\\cli\\${ASSET}`, sha256: sha(BIN) });
    expect(t.requested).toEqual([`${CLI_RELEASE.base}/checksums.txt`, `${CLI_RELEASE.base}/${ASSET}`]);
    expect(t.requested.every((u) => u.startsWith("https://github.com/okx/onchainos-skills/releases/download/"))).toBe(true);
    expect(t.written).toHaveLength(1);
  });

  test("a tool whose hash is not the published one is never written", async () => {
    const t = installer({ files: { [`${CLI_RELEASE.base}/${ASSET}`]: new TextEncoder().encode("tampered") } });
    expect(await installCli(t.deps)).toEqual({ ok: false, reason: "hash_divergente" });
    expect(t.written).toHaveLength(0);
  });

  test("checksums that do not list the file, or are not there, or a tool that does not download, are refusals with a constant reason", async () => {
    expect(await installCli(installer({ files: { [`${CLI_RELEASE.base}/checksums.txt`]: new TextEncoder().encode(`${"1".repeat(64)}  something-else\n`) } }).deps)).toEqual({ ok: false, reason: "checksums_ilegivel" });
    expect(await installCli(installer({ files: { [`${CLI_RELEASE.base}/checksums.txt`]: null } }).deps)).toEqual({ ok: false, reason: "download_falhou" });
    expect(await installCli(installer({ files: { [`${CLI_RELEASE.base}/${ASSET}`]: null } }).deps)).toEqual({ ok: false, reason: "download_falhou" });
  });

  test("a machine the tool was not looked at on is said so, and nothing is downloaded", async () => {
    const t = installer({ platform: "linux", arch: "ia32" });
    expect(await installCli(t.deps)).toEqual({ ok: false, reason: "plataforma_nao_suportada" });
    expect(t.requested).toHaveLength(0);
    expect(assetFor("win32", "x64")).toBe(ASSET);
    expect(assetFor("freebsd", "x64")).toBeNull();
  });

  test("a disk that cannot take the file is a refusal", async () => {
    expect(await installCli(installer({ failWrite: true }).deps)).toEqual({ ok: false, reason: "nao_gravou" });
  });

  test("a download that is too big is refused before it is read", async () => {
    const t = installer();
    const big: InstallDeps = { ...t.deps, fetch: async (url) => (url.endsWith("checksums.txt") ? new Response(`${sha(BIN)}  ${ASSET}\n`) : new Response("x", { headers: { "content-length": "999999999" } })) };
    expect(await installCli(big)).toEqual({ ok: false, reason: "download_falhou" });
  });

  test("the checksums file is read as sha256sum writes it", () => {
    const sums = parseChecksums(`${"a".repeat(64)}  one.exe\r\n${"B".repeat(64)} *two.exe\nnot a line\n`);
    expect(sums.get("one.exe")).toBe("a".repeat(64));
    expect(sums.get("two.exe")).toBe("b".repeat(64));
    expect(sums.size).toBe(2);
  });
});

const out = (data: unknown, ok = true): CliResult => ({ exitCode: ok ? 0 : 1, stdout: JSON.stringify({ ok, data }), stderr: "", timedOut: false });
const runnerOf = (answer: (args: readonly string[]) => CliResult): CliRunner & { calls: string[][] } => {
  const calls: string[][] = [];
  return { calls, run: async (args) => (calls.push([...args]), answer(args)) };
};

describe("signing in happens on OKX's own page", () => {
  const link = "https://web3.okx.com/account/sociallogin?authSessionId=abc&tempPubKey=xyz&clientType=agent-cli";

  test("the link comes from what the tool printed, wherever it is in it, and only if it is OKX's", () => {
    expect(parseLoginUrl(JSON.stringify({ ok: true, data: { loginUrl: link } }))).toBe(link);
    expect(parseLoginUrl(JSON.stringify({ ok: true, data: { steps: ["open", { url: link }] } }))).toBe(link);
    expect(parseLoginUrl(JSON.stringify({ ok: true, data: { loginUrl: "https://evil.example/account/sociallogin" } }))).toBeNull();
    expect(parseLoginUrl(JSON.stringify({ ok: true, data: { loginUrl: "http://web3.okx.com/account/sociallogin" } }))).toBeNull();
    expect(parseLoginUrl(JSON.stringify({ ok: true, data: { loginUrl: "https://web3.okx.com.evil.example/account/x" } }))).toBeNull();
    expect(parseLoginUrl(JSON.stringify({ ok: true, data: { loginUrl: "https://web3.okx.com/not-the-account-page" } }))).toBeNull();
    expect(parseLoginUrl(JSON.stringify({ ok: false, data: { loginUrl: link } }))).toBeNull();
    expect(parseLoginUrl("garbage")).toBeNull();
  });

  test("starting the login asks the tool for its first phase and returns the page to open", async () => {
    const r = runnerOf(() => out({ loginUrl: link }));
    expect(await startLogin(r, new AbortController().signal)).toEqual({ ok: true, url: link });
    expect(r.calls).toEqual([["wallet", "login", "--phase", "init"]]);
    expect(await startLogin(runnerOf(() => out({ nothing: true })), new AbortController().signal)).toEqual({ ok: false, reason: "sem_link_de_login" });
    expect(await startLogin({ run: async () => { throw new Error("spawn"); } }, new AbortController().signal)).toEqual({ ok: false, reason: "cli_indisponivel" });
  });

  test("polling says waiting until the tool says the person has signed in", async () => {
    const wait = runnerOf(() => ({ exitCode: null, stdout: "", stderr: "", timedOut: true }));
    expect(await pollLogin(wait, new AbortController().signal)).toEqual({ ok: true, state: "aguardando" });
    expect(await pollLogin(runnerOf(() => out({ code: 10018 }, false)), new AbortController().signal)).toEqual({ ok: true, state: "aguardando" });
    const done = runnerOf(() => out({ accountId: "a1" }));
    expect(await pollLogin(done, new AbortController().signal)).toEqual({ ok: true, state: "logado" });
    expect(done.calls).toEqual([["wallet", "login", "--phase", "poll"]]);
  });
});

describe("the account's addresses", () => {
  const EVM = "0xAbCdEf0123456789abcdef0123456789ABCDEF01";
  const SOL = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

  test("are found by value wherever the tool puts them", () => {
    expect(parseAddresses({ evm: [{ address: EVM }], solana: [{ address: SOL }] })).toEqual({ evm: EVM.toLowerCase(), solana: SOL });
    expect(parseAddresses({ accounts: [{ list: [EVM] }] })).toEqual({ evm: EVM.toLowerCase(), solana: null });
  });

  test("a Solana address is taken only when exactly one string can be one", () => {
    expect(parseAddresses({ a: SOL, b: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFio" })).toEqual({ evm: null, solana: null });
    expect(parseAddresses({ id: "short-id", name: "main" })).toEqual({ evm: null, solana: null });
  });

  test("reading them asks the tool for its addresses and nothing else", async () => {
    const r = runnerOf(() => out({ evm: [{ address: EVM }] }));
    expect(await readAddresses(r, new AbortController().signal)).toEqual({ evm: EVM.toLowerCase(), solana: null });
    expect(r.calls).toEqual([["wallet", "addresses"]]);
    expect(await readAddresses(runnerOf(() => out({ nothing: 1 })), new AbortController().signal)).toBeNull();
    expect(await readAddresses(runnerOf(() => out({}, false)), new AbortController().signal)).toBeNull();
  });
});

describe("the guard lets the login through, and only the login", () => {
  test("the two phases pass, anything else of `wallet login` does not", () => {
    expect(() => assertCommand(["wallet", "login", "--phase", "init"])).not.toThrow();
    expect(() => assertCommand(["wallet", "login", "--phase", "poll"])).not.toThrow();
    for (const bad of [["wallet", "login"], ["wallet", "login", "--phase", "logout"], ["wallet", "login", "--phase", "init", "--from", "x"], ["wallet", "login", "x@y.z"], ["wallet", "login", "--phase"], ["wallet", "logout"]]) {
      expect(() => assertCommand(bad)).toThrow("comando_recusado");
    }
  });

  test("the phase flag belongs to the login and nowhere else", () => {
    expect(() => assertCommand(["swap", "execute", "--phase", "init"])).toThrow("comando_recusado");
    expect(() => assertCommand(["wallet", "status", "--phase", "init"])).toThrow("comando_recusado");
  });
});
