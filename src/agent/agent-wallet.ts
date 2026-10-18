/**
 * Connecting the wallet the agent trades from (AUT-29). The wallet the agent signs for is an OKX Agentic Wallet (the key lives in OKX's TEE, the agent works through the `onchainos` tool); the person's own
 * extension wallet cannot sign for an agent, so it is read and analysed but not traded. This module is the part that makes the Agentic Wallet something the person connects with a click instead of a procedure:
 * it installs the official tool (downloaded from OKX's release, checked against the checksums published beside it), starts the login (the person signs in on OKX's own page; nothing is typed here) and reads
 * the addresses of the account once it is in. Every step is a pure function over injected dependencies, so the tests run on fakes. The formats of what the tool prints are those of OKX's public reference and
 * have NOT been seen from a real run: anything that does not match is a refusal with a constant reason, never a guess.
 */
import { allStrings, parseEnvelope, type CliRunner } from "./cli";

/** The release this code was written against. The tool is downloaded from OKX's repository and from nowhere else. */
export const CLI_RELEASE = { version: "v4.6.4", base: "https://github.com/okx/onchainos-skills/releases/download/v4.6.4" } as const;
/** The tool is a single executable of about seventeen megabytes. */
const MAX_BINARY_BYTES = 80_000_000;
const MAX_TEXT_BYTES = 100_000;

/** The file of the release for this machine; null where the tool was not looked at. On Linux it is the glibc build (a Debian or Ubuntu image); a musl system (Alpine) is not covered. */
export function assetFor(platform: string, arch: string): string | null {
  if (platform === "win32" && arch === "x64") return "onchainos-x86_64-pc-windows-msvc.exe";
  if (platform === "linux" && arch === "x64") return "onchainos-x86_64-unknown-linux-gnu";
  if (platform === "linux" && arch === "arm64") return "onchainos-aarch64-unknown-linux-gnu";
  if (platform === "darwin" && arch === "x64") return "onchainos-x86_64-apple-darwin";
  if (platform === "darwin" && arch === "arm64") return "onchainos-aarch64-apple-darwin";
  return null;
}

/**
 * The SHA256 of each file of the release `CLI_RELEASE` names, read from the `checksums.txt` published beside it on 2026-10-14 (the Windows one is the hash a real download was checked against on this machine). A
 * release is not meant to change under its tag, so these are in the code: an install does not trust a hash that arrives from the same host as the file. A new release means new hashes here, on purpose.
 */
export const PINNED_SHA256: ReadonlyMap<string, string> = new Map([
  ["onchainos-x86_64-pc-windows-msvc.exe", "d7f8c8dfbd98f4e3eb9f4a7f2d8bd4167cc861322e28598db30ea9d7d08b5fe8"],
  ["onchainos-x86_64-unknown-linux-gnu", "4de08bf964590168cb7fc4f5547a8b84408fea71b5ab7ba842191f0d2dc86fa6"],
  ["onchainos-aarch64-unknown-linux-gnu", "1b955e4beae9f9e91f85b90c40277de417c7c4dd5fddb7153c39f8cd25e06ea0"],
  ["onchainos-x86_64-apple-darwin", "a635f31839549339e25657243fb4e17915637a048546884ed3aa2e87f1a60936"],
  ["onchainos-aarch64-apple-darwin", "00309a70ee4da67fa775ea4b5cbe0d0b00c9ea26496e19c84023b61338344740"],
]);

/** `<sha256>  <file>` per line, as `sha256sum` writes it. */
export function parseChecksums(text: string): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(\S+)\s*$/.exec(line.trim());
    if (m !== null) out.set(m[2]!, m[1]!.toLowerCase());
  }
  return out;
}

export type InstallResult =
  | { readonly ok: true; readonly path: string; readonly sha256: string }
  | { readonly ok: false; readonly reason: "plataforma_nao_suportada" | "download_falhou" | "checksums_ilegivel" | "hash_divergente" | "nao_gravou" };

export interface InstallDeps {
  readonly fetch: (url: string) => Promise<Response>;
  readonly platform: string;
  readonly arch: string;
  /** Where the tool is kept: a folder of the agent's own. */
  readonly dir: string;
  readonly sha256: (bytes: Uint8Array) => string;
  readonly write: (path: string, bytes: Uint8Array) => void;
  readonly join: (dir: string, name: string) => string;
  /** The hashes the install is held to. Given, they are the authority and the published `checksums.txt` is not even fetched; not given, the published one is (the tests of the plain flow). */
  readonly pinned?: ReadonlyMap<string, string>;
  /** Makes the kept file runnable (a file written on Linux or macOS is not executable by default). Called on every platform but Windows. */
  readonly makeExecutable?: (path: string) => void;
}

async function bytesOf(fetchImpl: InstallDeps["fetch"], url: string, max: number): Promise<Uint8Array | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > max) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length > 0 && bytes.length <= max ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Downloads the tool and the checksums of the same release, and keeps the tool only when its hash is the one published for that file. The hash that matched is what the agent will check before every run.
 */
export async function installCli(deps: InstallDeps): Promise<InstallResult> {
  const asset = assetFor(deps.platform, deps.arch);
  if (asset === null) return { ok: false, reason: "plataforma_nao_suportada" };
  let expected: string | undefined;
  if (deps.pinned !== undefined) {
    // the pin is the authority: nothing that arrives from the host of the file can change what is accepted
    expected = deps.pinned.get(asset);
    if (expected === undefined) return { ok: false, reason: "plataforma_nao_suportada" };
  } else {
    const sums = await bytesOf(deps.fetch, `${CLI_RELEASE.base}/checksums.txt`, MAX_TEXT_BYTES);
    if (sums === null) return { ok: false, reason: "download_falhou" };
    expected = parseChecksums(new TextDecoder().decode(sums)).get(asset);
    if (expected === undefined) return { ok: false, reason: "checksums_ilegivel" };
  }
  const binary = await bytesOf(deps.fetch, `${CLI_RELEASE.base}/${asset}`, MAX_BINARY_BYTES);
  if (binary === null) return { ok: false, reason: "download_falhou" };
  const actual = deps.sha256(binary);
  if (actual !== expected) return { ok: false, reason: "hash_divergente" };
  const path = deps.join(deps.dir, asset);
  try {
    deps.write(path, binary);
    if (deps.platform !== "win32") deps.makeExecutable?.(path);
  } catch {
    return { ok: false, reason: "nao_gravou" };
  }
  return { ok: true, path, sha256: actual };
}

/* ---------------------------------------------------------------- the login */

const LOGIN_HOST = "web3.okx.com";

/** The page where the person signs in, found in what `wallet login --phase init` printed: it is a link to OKX's own site or it is nothing. */
export function parseLoginUrl(stdout: string): string | null {
  const envelope = parseEnvelope(stdout);
  const candidates = envelope?.ok === true ? allStrings(envelope.data) : [];
  for (const text of candidates) {
    try {
      const url = new URL(text);
      if (url.protocol === "https:" && url.hostname === LOGIN_HOST && url.pathname.startsWith("/account/") && text.length <= 2000) return url.toString();
    } catch {
      // not a link
    }
  }
  return null;
}

export type LoginStart = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly reason: "sem_link_de_login" | "cli_indisponivel" };
export type LoginPoll = { readonly ok: true; readonly state: "aguardando" | "logado" } | { readonly ok: false; readonly reason: "cli_indisponivel" | "login_recusado" };

const SHORT_TIMEOUT_MS = 20_000;

export async function startLogin(runner: CliRunner, signal: AbortSignal): Promise<LoginStart> {
  try {
    const result = await runner.run(["wallet", "login", "--phase", "init"], { timeoutMs: SHORT_TIMEOUT_MS, signal });
    if (result.timedOut) return { ok: false, reason: "cli_indisponivel" };
    const url = parseLoginUrl(result.stdout);
    return url === null ? { ok: false, reason: "sem_link_de_login" } : { ok: true, url };
  } catch {
    return { ok: false, reason: "cli_indisponivel" };
  }
}

/** One look at whether the person has signed in: the tool waits a while for the answer and gives up quietly, which is "still waiting". */
export async function pollLogin(runner: CliRunner, signal: AbortSignal): Promise<LoginPoll> {
  try {
    const result = await runner.run(["wallet", "login", "--phase", "poll"], { timeoutMs: SHORT_TIMEOUT_MS, signal });
    if (result.timedOut) return { ok: true, state: "aguardando" };
    const envelope = parseEnvelope(result.stdout);
    if (envelope === null) return { ok: true, state: "aguardando" };
    return envelope.ok ? { ok: true, state: "logado" } : { ok: true, state: "aguardando" };
  } catch {
    return { ok: false, reason: "cli_indisponivel" };
  }
}

/* ---------------------------------------------------------------- the account */

const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

/** The addresses of the account from what `wallet addresses` printed. The shape is not known, so the match is by value: the first EVM address, and a Solana one only when exactly one string looks like one. */
export function parseAddresses(data: unknown): { readonly evm: string | null; readonly solana: string | null } {
  const strings = allStrings(data);
  const evm = strings.find((s) => EVM.test(s)) ?? null;
  const solana = strings.filter((s) => SOLANA.test(s) && !EVM.test(s));
  return { evm: evm === null ? null : evm.toLowerCase(), solana: new Set(solana).size === 1 ? solana[0]! : null };
}

export async function readAddresses(runner: CliRunner, signal: AbortSignal): Promise<{ readonly evm: string | null; readonly solana: string | null } | null> {
  try {
    const result = await runner.run(["wallet", "addresses"], { timeoutMs: SHORT_TIMEOUT_MS, signal });
    const envelope = result.timedOut ? null : parseEnvelope(result.stdout);
    if (envelope === null || !envelope.ok) return null;
    const found = parseAddresses(envelope.data);
    return found.evm === null && found.solana === null ? null : found;
  } catch {
    return null;
  }
}
