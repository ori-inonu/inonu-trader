import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BriefSource, BuiltBrief } from "../inonu/ask";
import type { InternalGatewayResult } from "../onchain-read/gateway";
import { candidateOf, type EcoFacts } from "../opportunity/ecosystem";
import type { RawTokenAsset } from "../okx-wallet/portfolio";
import type { SettingsStore } from "../settings/store";
import type { CliResult, CliRunner } from "./cli";
import { resetOkxClockForTests } from "../okx-clock";
import { createAgentService, STOP_MARK } from "./wire";
import type { AgentModel } from "./model";
import { DISCLOSURE } from "./state";

const WALLET = "0x1111111111111111111111111111111111111111";
const A = "0xabcdef0123456789abcdef0123456789abcdef01";
const B = "0x2222222222222222222222222222222222222222";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const HOUR = 3_600_000;
const SHA = "a".repeat(64);

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agent-wire-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const store = (over: { okx?: boolean; key?: boolean } = {}): SettingsStore =>
  ({ credentials: () => ({ okx: over.okx === false ? null : { apiKey: "k", secret: "s", passphrase: "p" }, typesafeAiApiKey: over.key === false ? null : "model-key" }) }) as unknown as SettingsStore;

const ok = (data: unknown): InternalGatewayResult => ({ ok: true, data, meta: { tier: "basic", cachedAtMs: 0, ageMs: 0, stale: false, budget: { tier: "basic", used: 1, cap: null } }, sent: true });
const now = Date.now();
const calmRows = () => Array.from({ length: 60 }, (_, i) => { const close = 100 * (i % 2 === 0 ? 1 : 1.02); return { ts: now - (60 - i) * HOUR, open: close, high: close * 1.004, low: close * 0.996, close, volume: 1, volumeUsd: 1, confirmed: true }; });
const gateway = { callInternal: async (route: string) => (route === "/onchain/candles" ? ok(calmRows()) : route === "/onchain/price-info" ? ok([{ price: 4, liquidityUsd: 800_000, change: { h24: 1 }, volume: { h24: 500_000 } }]) : ok({ riskLevel: 1, tags: [] })) } as never;

const asset = (over: Partial<RawTokenAsset>): RawTokenAsset => ({ chainIndex: "1", tokenContractAddress: A, address: WALLET, symbol: "AAA", balance: "2.5", rawBalance: "2500000000000000000", tokenPrice: "4", isRiskToken: false, ...over });
const balances = { balances: async () => [asset({}), asset({ tokenContractAddress: USDC, symbol: "USDC", balance: "1000", rawBalance: "1000000000", tokenPrice: "1" })] };

const eco: EcoFacts = { candidateId: `token:1:${B}`, chainIndex: "1", address: B, symbol: "BBB", nota: 70, priceUsd: 0.5, changePct: 12, volumeUsd: 2e6, liquidityUsd: 5e6, marketCapUsd: 5e7, holders: 5000, buyShare: 0.6, txs: 800, top10Pct: 30, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 9000, soldPct: 10 };
const source: BriefSource = { build: async (): Promise<BuiltBrief> => ({ brief: {} as never, candidates: [], onchainosCalls: 3, ecosystem: { observedAtMs: now, saldo: null, candidates: [candidateOf(eco, null)], excluded: {} } }) };

/** A model that buys the first purchase it is offered, one third, with the first profile. */
const buyer = (calls: { n: number } = { n: 0 }): AgentModel => ({
  name: "fake-jev",
  estimateTokens: () => 1000,
  async choose({ candidates }) {
    calls.n++;
    return {
      raw: {
        posture: "ofensiva",
        stances: Object.fromEntries(candidates.map((c) => [c.id, c.kind === "holding" ? "hold" : c.stances.includes("buy_third") ? "buy_third" : "skip"])),
        profiles: Object.fromEntries(candidates.filter((c) => c.kind === "buy" && c.stances.includes("buy_third")).map((c) => [c.id, c.profiles.includes("alvo_5") ? "alvo_5" : c.profiles[0]!])),
      },
      usage: { inputTokens: 1000, outputTokens: 100 },
    };
  },
});

const cliOut = (data: unknown, ok = true): CliResult => ({ exitCode: ok ? 0 : 1, stdout: JSON.stringify({ ok, data }), stderr: "", timedOut: false });
const policy = { singleTxLimit: "50", singleTxFlag: 1, dailyTransferTxLimit: "100", dailyTransferTxFlag: 1, dailyTradeTxLimit: "200", dailyTradeTxFlag: 1 };
const cliCalls: string[][] = [];
const fakeCli: CliRunner = {
  run: async (args) => {
    cliCalls.push([...args]);
    const key = `${args[0]} ${args[1]}`;
    if (key === "wallet status") return cliOut({ loggedIn: true, currentAccountId: "a1", policy });
    if (key === "wallet addresses") return cliOut({ evm: [{ address: WALLET }] });
    // (the real tool answers a quote as an ARRAY of one record, and `swap execute` prints the hash at the BROADCAST; the receipt is in the history)
    if (key === "swap quote") return cliOut([{ action: "ok", priceImpactPercent: "0.3", fromToken: { isHoneyPot: false, taxRate: "0" }, toToken: { isHoneyPot: false, taxRate: "0" } }]);
    if (key === "swap execute") return cliOut({ swapTxHash: "0x" + "6".repeat(64) });
    if (key === "wallet history") return cliOut([{ txHash: "0x" + "6".repeat(64), txStatus: "SUCCESS", chainIndex: "1", from: WALLET }]);
    throw new Error("unexpected command");
  },
};

const make = (over: Partial<Parameters<typeof createAgentService>[0]> = {}) =>
  createAgentService({
    dataDir: dir,
    store: store(),
    gateway,
    source,
    now: () => Date.now(),
    model: buyer(),
    balances,
    publicCandles: async () => null, publicDerivatives: { funding: async () => null, openInterestUsd: async () => null },
    processRunner: fakeCli,
    sha256File: async () => SHA,
    syncClock: async () => null,
    clockSkewMs: () => 0,
    localSkewMs: () => 0,
    minBuyUsd: () => 10,
    // offline by default: a public-chain lookup of a receipt or of a swap answers "nothing known" instead of reaching a real RPC; the tests that exercise the lookups replace these through `over`
    solanaReceipts: (async () => null) as never,
    solanaSwaps: (async () => null) as never,
    ...over,
  });

const configure = (svc: ReturnType<typeof make>, kind: "propria" | "agentica" = "propria") => {
  expect(svc.updateConfig({ auto: false, managed: { kind, evm: WALLET, solana: null }, riskPct: 0.1 })).toMatchObject({ ok: true });
};
const connect = (svc: ReturnType<typeof make>) => {
  expect(svc.connect({ disclosure: DISCLOSURE })).toMatchObject({ ok: true });
};

describe("a fresh agent", () => {
  test("is not connected, says what each thing it does still needs, and wrote nothing yet", () => {
    const svc = make({ store: store({ okx: false, key: false }), model: null, ownerProfile: "livre" });
    const s = svc.status();
    expect(s.state).toMatchObject({ connected: false });
    expect(s.mode).toBe("desligado");
    expect(s.readiness.sombra).toEqual(["carteira_gerida", "credenciais_okx", "chave_do_modelo"]);
    // the model key is needed to ANALYSE, not to protect: the stops of what is held do not wait for it
    expect(s.readiness.limitado).toEqual(["carteira_gerida", "credenciais_okx", "cli_instalado", "carteira_agentica"]);
    expect(s.book).toBeNull();
    expect(s.scheduler).toMatchObject({ started: false, intervalMin: 10 });
    expect(existsSync(join(dir, "agent", "ledger.jsonl"))).toBe(false);
  });

  test("cannot be connected without the keys it works with, nor under a notice that is not the current one", () => {
    expect(make({ store: store({ okx: false }) }).connect({ disclosure: DISCLOSURE })).toEqual({ ok: false, reason: "requisitos_pendentes" });
    expect(make({ store: store({ key: false }), model: null }).connect({ disclosure: DISCLOSURE })).toEqual({ ok: false, reason: "requisitos_pendentes" });
    const svc = make();
    configure(svc);
    expect(svc.connect({ disclosure: "1999-01-01" })).toEqual({ ok: false, reason: "aviso_desatualizado" });
    expect(svc.status().state.connected).toBe(false);
    expect(svc.connect({ disclosure: DISCLOSURE })).toMatchObject({ ok: true });
    expect(svc.status()).toMatchObject({ mode: "sombra", state: { connected: true } });
  });

  test("connecting does not need a wallet yet: the agent's own comes with the sign-in that follows, and until then it waits", async () => {
    const svc = make();
    expect(svc.connect({ disclosure: DISCLOSURE })).toMatchObject({ ok: true });
    expect(svc.status()).toMatchObject({ mode: "sombra", state: { connected: true } });
    expect(svc.status().readiness.sombra).toEqual(["carteira_gerida"]);
    const report = await svc.runNow();
    expect(report.outcome).toBe("bloqueado");
    expect(report.orders).toHaveLength(0);
  });

  test("connecting a wallet in the same step sets it as the one managed, and a wallet that is not an address is refused", () => {
    const svc = make();
    expect(svc.connect({ disclosure: DISCLOSURE, managed: { kind: "propria", evm: "not-an-address", solana: null } })).toEqual({ ok: false, reason: "carteira_invalida" });
    expect(svc.status().state.connected).toBe(false);
    expect(svc.connect({ disclosure: DISCLOSURE, managed: { kind: "propria", evm: WALLET, solana: null } })).toMatchObject({ ok: true });
    expect(svc.status().config.managed.evm).toBe(WALLET);
  });

  test("with a wallet that is only the person's own, the agent analyses and measures, and the money side says what it lacks", () => {
    const svc = make();
    configure(svc);
    connect(svc);
    expect(svc.status().mode).toBe("sombra");
    expect(svc.status().readiness.limitado).toEqual(["cli_instalado", "carteira_agentica"]);
  });
});

describe("the metadata of each consultation for the study of the agent (ADENDO-D, V2-4)", () => {
  test("a consultation leaves its record in briefs.jsonl and, in a journal of its own, the envelope of the contract: the hash of that exact line, the full hash of the Brief and the real clocks", async () => {
    const svc = make();
    configure(svc);
    connect(svc);
    await svc.runNow();
    const briefs = readFileSync(join(dir, "agent", "briefs.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "");
    const metaLines = readFileSync(join(dir, "agent", "decisions-meta.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "");
    expect(briefs).toHaveLength(1);
    expect(metaLines).toHaveLength(1);
    const record = JSON.parse(briefs[0]!) as { cycleId: string; atMs: number; briefHash: string };
    const entry = JSON.parse(metaLines[0]!) as { cycleId: string; atMs: number; metadata: Record<string, unknown> };
    expect(entry).toMatchObject({ cycleId: record.cycleId, atMs: record.atMs });
    expect(Object.keys(entry.metadata).sort()).toEqual(["answeredAtMs", "arm", "askedAtMs", "decisionVersion", "evaluatorHash", "factAvailableAtMs", "recordedAtMs", "schemaVersion", "snapshotHash", "sourceRecordHash"]);
    const hex = /^[0-9a-f]{64}$/;
    for (const k of ["sourceRecordHash", "snapshotHash", "decisionVersion", "evaluatorHash"]) expect(String(entry.metadata[k])).toMatch(hex);
    expect(entry.metadata.sourceRecordHash).toBe(createHash("sha256").update(briefs[0]!).digest("hex"));
    expect(String(entry.metadata.snapshotHash).slice(0, 16)).toBe(record.briefHash);
    const m = entry.metadata as { factAvailableAtMs: number; askedAtMs: number; answeredAtMs: number; recordedAtMs: number; arm: string; schemaVersion: number };
    expect(m.factAvailableAtMs).toBeLessThanOrEqual(m.askedAtMs);
    expect(m.askedAtMs).toBeLessThanOrEqual(m.answeredAtMs);
    expect(m.answeredAtMs).toBeLessThanOrEqual(m.recordedAtMs);
    expect(m).toMatchObject({ arm: "A", schemaVersion: 1 });
  });
});

describe("the guards of the execution in the status", () => {
  test("the autopilot says what the code still refuses after the quote, read from the constants the executor uses", () => {
    const g = make().status().autopilot.guards;
    expect(g).toEqual({ impactPct: { buy: 3, sell: 5, protecao: 10 }, taxPct: 5, slippagePct: { buy: 2, sell: 3, protecao: 8 }, buyCostShareOfStop: 1 / 3, nativeReserve: { kind: "fixa", usd: 5 } });
  });
});

describe("the quota of the data provider in the status (SISTEMA)", () => {
  const counters = { month: new Date().toISOString().slice(0, 7), restartedFromCorruptFile: false, tiers: { free: { used: 3, cap: null, today: 1, projection: 6 }, basic: { used: 700, cap: 100_000, today: 20, projection: 1400 }, premium: { used: 90, cap: 100_000, today: 5, projection: 180 } } };

  test("the status carries the projection computed by the core from the counters of the gateway, with the hour it was observed", () => {
    const svc = make({ gateway: Object.assign({}, gateway as object, { budget: () => counters }) as never });
    const resources = svc.status().resources;
    expect(resources).not.toBeNull();
    expect(resources!.tiers.basic.local).toMatchObject({ scope: "local_gateway", status: "valid", used: 700, monthlyCap: 100_000, capEvidence: "local_configuration" });
    expect(resources!.tiers.basic.account.status).toBe("unreported");
    expect(resources!.tiers.basic.local.observedAtMs).toBe(resources!.asOfMs);
  });

  test("a gateway that does not count has no projection: null, not an empty quota", () => {
    expect(make().status().resources).toBeNull();
  });
});

describe("shadow mode, end to end", () => {
  test("a cycle reads the wallet, asks the model, decides, records, measures, and moves nothing", async () => {
    const calls = { n: 0 };
    const svc = make({ model: buyer(calls) });
    configure(svc);
    connect(svc);
    const report = await svc.runNow();
    expect(report).toMatchObject({ outcome: "decidido", consulted: true, modelo: "fake-jev", posture: "ofensiva" });
    expect(report.orders).toHaveLength(1);
    expect(report.orders[0]).toMatchObject({ stage: "preparada", order: { side: "buy", symbol: "BBB", profile: "alvo_5", source: "modelo", wallet: "agente" } });
    expect(calls.n).toBe(1);
    expect(cliCalls.length).toBe(0);

    const s = svc.status();
    expect(s.last?.cycleId).toBe(report.cycleId);
    expect(s.budget).toMatchObject({ consults: 1, measuredTokens: 1100 });
    expect(s.scoreboard.decisions).toBe(1);
    expect(s.book).toMatchObject({ managedOk: true, agentUsd: 1010, cashUsd: 1000 });
    expect(s.book!.positions.map((p) => p.symbol).sort()).toEqual(["AAA", "USDC"]);
    expect(s.ledger.map((r) => r.kind)).toEqual(["cycle", "order"]);
    // the files are on disk
    for (const f of ["ledger.jsonl", "scoreboard.jsonl", "state.json", "config.json", "budget.json"]) expect(existsSync(join(dir, "agent", f))).toBe(true);
  });

  test("the same picture is not asked about again", async () => {
    const calls = { n: 0 };
    const svc = make({ model: buyer(calls) });
    configure(svc);
    connect(svc);
    await svc.runNow();
    const again = await svc.runNow();
    expect(again).toMatchObject({ outcome: "mantido", reason: "sem_mudanca" });
    expect(calls.n).toBe(1);
  });

  test("a restart finds the state, the ledger and the budget where they were", async () => {
    const first = make();
    configure(first);
    connect(first);
    await first.runNow();
    const second = make();
    const s = second.status();
    expect(s.state.connected).toBe(true);
    expect(s.mode).toBe("sombra");
    expect(s.budget.consults).toBe(1);
    expect(s.ledger).toHaveLength(2);
    expect(s.config.managed.evm).toBe(WALLET);
  });
});

describe("disconnecting", () => {
  test("is felt at once, survives a restart, and the way back is to connect again", async () => {
    const svc = make();
    configure(svc);
    connect(svc);
    svc.disconnect();
    expect(svc.status()).toMatchObject({ mode: "desligado", state: { connected: false } });
    expect(await svc.runNow()).toMatchObject({ outcome: "bloqueado", reason: "desligado" });
    const restarted = make();
    expect(restarted.status().state.connected).toBe(false);
    expect(restarted.connect({ disclosure: DISCLOSURE })).toMatchObject({ ok: true });
    expect(restarted.status().mode).toBe("sombra");
  });

  test("a STOP file placed by the person blocks a cycle and is not removed by raising the mode", async () => {
    const svc = make();
    configure(svc);
    connect(svc);
    mkdirSync(join(dir, "agent"), { recursive: true });
    writeFileSync(join(dir, "agent", "STOP"), "x");
    expect(await svc.runNow()).toMatchObject({ outcome: "bloqueado", reason: "arquivo_stop" });
    expect(svc.status().stopFile).toBe(true);
  });
});

describe("connecting the wallet the agent trades from", () => {
  const SESSION_URL = "https://web3.okx.com/account/sociallogin?authSessionId=abc&tempPubKey=xyz&clientType=agent-cli";
  const walletCli = (state: { loggedIn: boolean; polls: number }): CliRunner => ({
    run: async (args) => {
      cliCalls.push([...args]);
      const key = args.slice(0, 2).join(" ");
      if (key === "wallet login" && args[3] === "init") return cliOut({ loginUrl: SESSION_URL });
      if (key === "wallet login" && args[3] === "poll") {
        state.polls++;
        if (state.polls < 2) return { exitCode: null, stdout: "", stderr: "", timedOut: true };
        state.loggedIn = true;
        return cliOut({ accountId: "a1" });
      }
      if (key === "wallet status") return cliOut({ loggedIn: state.loggedIn, currentAccountId: "a1", policy: state.loggedIn ? policy : null });
      if (key === "wallet addresses") return cliOut({ evm: [{ address: B }] });
      throw new Error("unexpected command");
    },
  });

  test("install, sign in on OKX's page, read the account: the Agentic Wallet becomes the one managed and the person's own stays in the picture", async () => {
    cliCalls.length = 0;
    const state = { loggedIn: false, polls: 0 };
    const svc = make({ processRunner: walletCli(state), installCli: async () => ({ ok: true, path: "C:\\agent\\onchainos.exe", sha256: SHA }) });
    configure(svc);
    connect(svc);
    expect(svc.status().wallet).toMatchObject({ cli: "ausente", agentic: false, next: "instalar" });
    expect(svc.status().mode).toBe("sombra");

    expect(await svc.wallet("install")).toMatchObject({ ok: true, wallet: { cli: "instalado", next: "entrar" } });
    expect(svc.status().config.cli).toEqual({ path: "C:\\agent\\onchainos.exe", sha256: SHA });

    expect(await svc.wallet("login")).toMatchObject({ ok: true, wallet: { login: "aguardando", loginUrl: SESSION_URL } });
    // the first look: the person has not finished
    expect(await svc.wallet("poll")).toMatchObject({ ok: true, wallet: { login: "aguardando" } });
    expect(svc.status().config.managed.kind).toBe("propria");
    // the second: signed in
    const done = await svc.wallet("poll");
    expect(done).toMatchObject({ ok: true, wallet: { agentic: true, address: B } });
    const config = svc.status().config;
    expect(config.managed).toEqual({ kind: "agentica", evm: B, solana: null });
    expect(config.watch.evm).toBe(WALLET);
    // the money side now only lacks what the person puts in: it is trading as soon as the requirements are all there
    expect(svc.status().readiness.limitado).toEqual([]);
    expect(svc.status().mode).toBe("limitado");
    // only the allowed commands ran
    expect(new Set(cliCalls.map((c) => c.slice(0, 2).join(" ")))).toEqual(new Set(["wallet login", "wallet addresses", "wallet status"]));
  });

  test("the steps refuse what cannot be done yet, with a constant reason", async () => {
    const svc = make({ installCli: async () => ({ ok: false, reason: "hash_divergente" }) });
    configure(svc);
    connect(svc);
    expect(await svc.wallet("login")).toEqual({ ok: false, reason: "cli_ausente" });
    expect(await svc.wallet("poll")).toEqual({ ok: false, reason: "cli_ausente" });
    expect(await svc.wallet("install")).toEqual({ ok: false, reason: "hash_divergente" });
    expect(svc.status().wallet.cli).toBe("ausente");
  });

  test("a login that gives no link, or an account with no address, is a refusal and changes nothing", async () => {
    const noLink: CliRunner = { run: async () => cliOut({ nothing: true }) };
    const svc = make({ processRunner: noLink, installCli: async () => ({ ok: true, path: "C:\\agent\\onchainos.exe", sha256: SHA }) });
    configure(svc);
    connect(svc);
    await svc.wallet("install");
    expect(await svc.wallet("login")).toEqual({ ok: false, reason: "sem_link_de_login" });
    expect(svc.status().wallet.login).not.toBe("aguardando");
    const noAddress: CliRunner = { run: async (args) => (args[2] === "--phase" ? cliOut({ ok: 1 }) : cliOut({ nothing: true })) };
    const other = make({ processRunner: noAddress, installCli: async () => ({ ok: true, path: "C:\\agent\\onchainos.exe", sha256: SHA }) });
    configure(other);
    connect(other);
    await other.wallet("install");
    expect(await other.wallet("poll")).toEqual({ ok: false, reason: "sem_enderecos" });
    expect(other.status().config.managed.kind).toBe("propria");
  });

  test("the Solana address of the Agentic Wallet is read and shown, so Solana assets are not sent to the EVM one", async () => {
    const SOL = "38xPrzDyePKyg4ghstcLWTHBm7jG6ti2Q495yady3pYV";
    const state = { loggedIn: true, polls: 5 };
    const inner = walletCli(state);
    const withSolana: CliRunner = { run: async (args, opts) => (args.slice(0, 2).join(" ") === "wallet addresses" ? cliOut({ evm: [{ address: B }], solana: [{ address: SOL }] }) : inner.run(args, opts)) };
    const svc = make({ processRunner: withSolana, installCli: async () => ({ ok: true, path: "C:\\agent\\onchainos.exe", sha256: SHA }), balances: { balances: async () => [] } });
    configure(svc);
    connect(svc);
    await svc.wallet("install");
    await svc.wallet("poll");
    const w = svc.status().wallet;
    expect(w.agentic).toBe(true);
    expect(w.address).toBe(B);
    expect(w.solanaAddress).toBe(SOL);
    expect(svc.status().config.managed).toMatchObject({ kind: "agentica", evm: B, solana: SOL });
  });

  test("the next step is the person's: deposit, then the policy in the portal, then it trades", async () => {
    const state = { loggedIn: true, polls: 5 };
    const noPolicy: CliRunner = { run: async (args) => (args[1] === "status" ? cliOut({ loggedIn: true, currentAccountId: "a1", policy: null }) : walletCli(state).run(args, { timeoutMs: 1, signal: new AbortController().signal })) };
    const svc = make({ processRunner: noPolicy, installCli: async () => ({ ok: true, path: "C:\\agent\\onchainos.exe", sha256: SHA }), balances: { balances: async () => [] } });
    configure(svc);
    connect(svc);
    await svc.wallet("install");
    await svc.wallet("poll");
    await svc.runNow();
    await Bun.sleep(50);
    await svc.runNow();
    const w = svc.status().wallet;
    expect(w.agentic).toBe(true);
    // the portal's policy is never a step of its own: a wallet with no money asks for money, one with money trades
    expect(w.next).toBe(w.fundsUsd === null || w.fundsUsd < 10 ? "depositar" : "operando");
    expect(w.policy).toBe("ausente");
  });
});

describe("reconnecting, consent, and the stop file", () => {
  const CLI = { path: "C:\\agent\\onchainos.exe", sha256: SHA };

  test("a notice that is not the current one changes nothing, not even the wallet it came with", () => {
    const svc = make();
    configure(svc, "agentica");
    expect(svc.connect({ disclosure: "1999-01-01", managed: { kind: "propria", evm: B, solana: null } })).toEqual({ ok: false, reason: "aviso_desatualizado" });
    expect(svc.status().config.managed).toMatchObject({ kind: "agentica", evm: WALLET });
    expect(svc.status().state.connected).toBe(false);
  });

  test("connecting again never replaces the Agentic Wallet (its positions keep their stops): the browser's wallet goes to the ones only read", () => {
    const svc = make();
    configure(svc, "agentica");
    connect(svc);
    svc.disconnect();
    expect(svc.connect({ disclosure: DISCLOSURE, managed: { kind: "propria", evm: B, solana: null } })).toMatchObject({ ok: true });
    const c = svc.status().config;
    expect(c.managed).toMatchObject({ kind: "agentica", evm: WALLET });
    expect(c.watch).toMatchObject({ evm: B });
  });

  test("install, sign-in and poll need the wallet to be connected: nothing is downloaded or run for a person who has not accepted", async () => {
    let installs = 0;
    const svc = make({ installCli: async () => (installs++, { ok: true, path: CLI.path, sha256: CLI.sha256 }) });
    for (const action of ["install", "login", "poll"] as const) expect(await svc.wallet(action)).toEqual({ ok: false, reason: "nao_conectado" });
    expect(installs).toBe(0);
    expect(svc.status().config.cli.path).toBeNull();
  });

  test("signed in on OKX's page but never polled (the person was faster than the page, or the app restarted): the agent adopts the wallet by itself", async () => {
    const found: CliRunner = { run: async (args, o) => (`${args[0]} ${args[1]}` === "wallet addresses" ? cliOut({ evm: [{ address: B }] }) : fakeCli.run(args, o)) };
    const svc = make({ processRunner: found });
    expect(svc.updateConfig({ managed: { kind: "propria", evm: WALLET, solana: null }, cli: CLI })).toMatchObject({ ok: true });
    connect(svc);
    svc.status();
    for (let i = 0; i < 40 && svc.status().config.managed.kind !== "agentica"; i++) await Bun.sleep(10);
    expect(svc.status().config.managed).toMatchObject({ kind: "agentica", evm: B });
    // and the person's own wallet stays in the picture, only read
    expect(svc.status().config.watch).toMatchObject({ evm: WALLET });
  });

  test("a stop file the person placed is theirs: connecting does not delete it; the one this app wrote when it disconnected is not needed any more", () => {
    const stop = join(dir, "agent", "STOP");
    mkdirSync(join(dir, "agent"), { recursive: true });
    const svc = make();
    configure(svc);
    writeFileSync(stop, "emergency, by hand\n");
    connect(svc);
    expect(existsSync(stop)).toBe(true);
    expect(svc.status().stopFile).toBe(true);
    // the app's own mark goes when the person connects again
    svc.disconnect();
    writeFileSync(stop, `${STOP_MARK}\n`);
    connect(svc);
    expect(existsSync(stop)).toBe(false);
    // already connected: a second click from another tab never touches a stop file
    writeFileSync(stop, `${STOP_MARK}\n`);
    connect(svc);
    expect(existsSync(stop)).toBe(true);
  });

  test("a disk that cannot write the disconnection leaves the stop file, so a restart does not trade again", () => {
    const svc = make();
    configure(svc);
    connect(svc);
    const file = join(dir, "agent", "state.json");
    rmSync(file, { force: true });
    mkdirSync(file); // a directory where the file goes: every write fails
    svc.disconnect();
    expect(svc.status().state.connected).toBe(false);
    expect(readFileSync(join(dir, "agent", "STOP"), "utf8")).toContain(STOP_MARK);
  });
});

describe("the money mode, end to end", () => {
  const live = async (svc: ReturnType<typeof make>) => {
    expect(svc.updateConfig({ auto: false, managed: { kind: "agentica", evm: WALLET, solana: null }, riskPct: 0.1, cli: { path: "C:\\agent\\onchainos.exe", sha256: SHA } })).toMatchObject({ ok: true });
    connect(svc);
    expect(svc.status().mode).toBe("limitado");
    mkdirSync(join(dir, "agent", "onchainos-home"), { recursive: true });
    writeFileSync(join(dir, "agent", "onchainos-home", "session.json"), JSON.stringify({ sessionKeyExpireAt: Date.now() + 100 * 24 * HOUR }));
  };

  test("the time left of the session of the account is on the status, in milliseconds, and unknown when the tool has no session (A1.12)", async () => {
    const svc = make();
    await live(svc);
    const left = svc.status().wallet.sessionLeftMs;
    // `live` writes a session that ends in 100 days
    expect(left).not.toBeNull();
    expect(left!).toBeGreaterThan(99 * 24 * HOUR);
    expect(left!).toBeLessThanOrEqual(100 * 24 * HOUR);
    rmSync(join(dir, "agent", "onchainos-home", "session.json"), { force: true });
    expect(svc.status().wallet.sessionLeftMs).toBeNull();
  });

  test("the fee of the quote of an order is kept for its network, with the hour it was read and where it came from, in a file that outlives the process", async () => {
    const withFee: CliRunner = { run: async (args, o) => (`${args[0]} ${args[1]}` === "swap quote" ? cliOut([{ action: "ok", priceImpactPercent: "0.3", tradeFee: "0.02", estimateGasFee: "5000", fromToken: { isHoneyPot: false, taxRate: "0" }, toToken: { isHoneyPot: false, taxRate: "0" } }]) : fakeCli.run(args, o)) };
    const svc = make({ processRunner: withFee });
    await live(svc);
    await svc.runNow();
    const saved = JSON.parse(readFileSync(join(dir, "agent", "fees.json"), "utf8")) as { version: number; fees: Record<string, Record<string, unknown>> };
    expect(saved.version).toBe(1);
    expect(saved.fees["1"]).toMatchObject({ chainIndex: "1", tradeFeeUsd: 0.02, gasEstimate: 5000, source: "cotacao_de_compra" });
    expect(typeof saved.fees["1"]!.observedAtMs).toBe("number");
  });
  test("the read-only entry probe closes a purchase only for an explicit gas-station refusal", async () => {
    const skip: AgentModel = {
      ...buyer(),
      async choose({ candidates }) {
        return {
          raw: { posture: "neutra", stances: Object.fromEntries(candidates.map((c) => [c.id, c.kind === "holding" ? "hold" : "skip"])), profiles: {} },
          usage: { inputTokens: 1000, outputTokens: 100 },
        };
      },
    };
    const quoteFailure = (kind: "gas" | "generic"): CliRunner => ({
      run: async (args, options) => {
        if (`${args[0]} ${args[1]}` === "swap quote") {
          cliCalls.push([...args]);
          return kind === "gas"
            ? { exitCode: 2, stdout: "Gas station required", stderr: "", timedOut: false }
            : { exitCode: 1, stdout: JSON.stringify({ ok: false, error: "ordinary quote failure" }), stderr: "", timedOut: false };
        }
        return fakeCli.run(args, options);
      },
    });

    cliCalls.length = 0;
    const gasService = make({ model: skip, processRunner: quoteFailure("gas") });
    await live(gasService);
    const gasReport = await gasService.runNow();
    const gasCandidate = gasReport.view?.find((candidate) => candidate.kind === "buy");
    expect(gasCandidate).toMatchObject({ closed: "gas_station_pendente", marks: expect.arrayContaining(["gas_station_pendente"]) });
    expect(gasReport.orders).toHaveLength(0);
    expect(cliCalls.filter((args) => args[0] === "swap" && args[1] === "quote")).toHaveLength(1);
    expect(cliCalls.filter((args) => args[0] === "swap" && args[1] === "execute")).toHaveLength(0);
    await gasService.close();

    cliCalls.length = 0;
    const unknownService = make({ model: skip, processRunner: quoteFailure("generic") });
    await live(unknownService);
    const unknownReport = await unknownService.runNow();
    const unknownCandidate = unknownReport.view?.find((candidate) => candidate.kind === "buy");
    expect(unknownCandidate?.closed).toBeNull();
    expect(unknownCandidate?.marks).not.toContain("gas_station_pendente");
    expect(unknownReport.orders).toHaveLength(0);
    expect(cliCalls.filter((args) => args[0] === "swap" && args[1] === "quote")).toHaveLength(1);
    expect(cliCalls.filter((args) => args[0] === "swap" && args[1] === "execute")).toHaveLength(0);
    await unknownService.close();
  });

  test("a purchase is quoted, executed, recorded before and after, and its plan opened", async () => {
    cliCalls.length = 0;
    const svc = make();
    await live(svc);
    const report = await svc.runNow();
    expect(report).toMatchObject({ outcome: "decidido", reason: null });
    // the tool printed a hash at the broadcast: that is a transmitted order, held in flight, not an executed one
    expect(report.orders.map((o) => [o.stage, o.reason])).toEqual([["incerta", "transmitida"]]);
    expect(report.orders[0]!.ref).toBe("0x" + "6".repeat(64));
    expect(svc.status().inFlight).toHaveLength(1);
    // (the status of the account is also asked in the background for the screen: the order of first appearance is what is checked)
    expect([...new Set(cliCalls.map((c) => `${c[0]} ${c[1]}`))]).toEqual(["wallet status", "wallet addresses", "swap quote", "swap execute"]);
    expect(cliCalls.flat()).not.toContain("--force");

    const s = svc.status();
    expect(s.plans).toHaveLength(1);
    expect(s.plans[0]).toMatchObject({ symbol: "BBB", profile: "alvo_5", entryPriceUsd: 0.5, targetHit: false });
    const lines = readFileSync(join(dir, "agent", "ledger.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.filter((l) => l.kind === "order").map((l) => l.stage)).toEqual(["preparada", "enviando", "incerta"]);
    expect(existsSync(join(dir, "agent", "plans.json"))).toBe(true);
    // the receipt in the tool's own history settles it, found by the watch with nobody asked
    await svc.guardNow();
    expect(svc.status().inFlight).toEqual([]);
    const settled = readFileSync(join(dir, "agent", "ledger.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((l) => l.kind === "order");
    expect(settled.map((l) => l.stage)).toEqual(["preparada", "enviando", "incerta", "executada"]);
    expect(settled.at(-1)).toMatchObject({ reason: "recibo_sucesso", ref: "0x" + "6".repeat(64) });
    // the quote the order was made under is on the record from the answer of the executor on, and it stays through the receipt: what the quote carried (the impact) is there, what it did not (the fee) is ABSENT, not zero
    expect(settled.map((l) => "quote" in l)).toEqual([false, false, true, true]);
    expect(settled.at(-1).quote).toMatchObject({ action: "ok", impactPct: 0.3, tradeFee: null, feeUnit: "usd", gasUnit: "native_minor", present: ["impact", "taxFrom", "taxTo"] });
  });

  test("a look leaves what the Jev answered and the prices the cycle read in journals of their own, apart from the ledger", async () => {
    cliCalls.length = 0;
    const svc = make();
    await live(svc);
    await svc.runNow();
    const answers = readFileSync(join(dir, "agent", "answers.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const item = answers[0].items.find((i: { id: string }) => i.id.startsWith("buy:"));
    expect([answers.length, item.requested, item.applied]).toEqual([1, "buy_third", "buy_third"]);
    await svc.close();
  });

  test("the price path holds the price of the candidate the look read, with the time of the read and no claim of when it was observed", async () => {
    cliCalls.length = 0;
    const svc = make();
    await live(svc);
    await svc.runNow();
    const rows = readFileSync(join(dir, "agent", "prices.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const eco = rows.find((r: { src: string }) => r.src === "eco");
    expect([Object.values(eco.prices), eco.obsAtMs, typeof eco.atMs]).toEqual([[0.5], null, "number"]);
    await svc.close();
  });

  test("with the recording off the agent writes neither journal", async () => {
    cliCalls.length = 0;
    const svc = make({ recording: false });
    await live(svc);
    await svc.runNow();
    expect([existsSync(join(dir, "agent", "answers.jsonl")), existsSync(join(dir, "agent", "prices.jsonl"))]).toEqual([false, false]);
    await svc.close();
  });

  test("the closing of the purchase the model made leaves its record in closings.jsonl, coded when the quote of the tool cannot be bound to the request, and the order goes out as before", async () => {
    cliCalls.length = 0;
    const svc = make();
    await live(svc);
    const report = await svc.runNow();
    expect(report.orders.map((o) => [o.stage, o.reason])).toEqual([["incerta", "transmitida"]]);
    const lines = readFileSync(join(dir, "agent", "closings.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    // the quote this fake tool answers has no identity of the pair, so it does not bind: a code, no question to the model, nothing guessed
    expect(lines[0]).toMatchObject({ phase: "closing", mode: "shadow", criteria: "closing-v1", quote: null, brief: null, answer: null, would: null, applied: "buy_third" });
    expect(typeof lines[0].quoteFailure).toBe("string");
    // three quotes of the tool were asked (the read-only one before the model is asked, for the entry cost; the read-only one of the closing; then the executor's own), never an execute before the executor
    expect(cliCalls.filter((c) => c[0] === "swap").map((c) => c[1])).toEqual(["quote", "quote", "quote", "execute"]);
    await svc.close();
  });

  test("with the closing off nothing is quoted ahead of the executor and no file is written", async () => {
    cliCalls.length = 0;
    const svc = make({ closing: false });
    await live(svc);
    await svc.runNow();
    expect(existsSync(join(dir, "agent", "closings.jsonl"))).toBe(false);
    expect(cliCalls.filter((c) => c[0] === "swap").map((c) => c[1])).toEqual(["quote", "execute"]);
    await svc.close();
  });

  test("the analysis of the decisions is read from the files of the agent: the consult and what the model asked, and the same answer for a few seconds", async () => {
    const svc = make();
    await live(svc);
    await svc.runNow();
    const a = svc.analysis!();
    expect(a.funnel.consults).toBe(1);
    expect(a.funnel.items).toBeGreaterThan(0);
    expect(a.asks.length).toBeGreaterThan(0);
    // this model sends no probabilities, so there is no preference to put in the histogram: it stays empty, never invented
    expect(a.hist.all.reduce((x, y) => x + y, 0)).toBe(0);
    expect(svc.analysis!()).toBe(a);
    await svc.close();
  });

  test("without the model key the money mode stays on (the stops need no model) and the cycle only holds", async () => {
    let keyThere = true;
    const model = buyer();
    const svc = make({ model: () => (keyThere ? model : null) });
    await live(svc);
    keyThere = false; // the key goes (a vault that hiccups, a person who removes it) after the wallet was connected
    expect(svc.status().mode).toBe("limitado");
    expect(svc.status().readiness.sombra).toContain("chave_do_modelo");
    const report = await svc.runNow();
    expect(report.mode).toBe("limitado");
    expect(report.orders.every((o) => o.order.source === "protecao")).toBe(true);
  });

  test("close() is waited for: the lock stays with the process until the order in flight is over, and nothing new begins", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let executing = false;
    const slow: CliRunner = {
      run: async (args, o) => {
        if (`${args[0]} ${args[1]}` === "swap execute") {
          executing = true;
          await gate;
        }
        return fakeCli.run(args, o);
      },
    };
    const svc = make({ processRunner: slow });
    await live(svc);
    const lockFile = join(dir, "agent", "LOCK");
    expect(existsSync(lockFile)).toBe(true);
    const cycle = svc.runNow();
    while (!executing) await Bun.sleep(5);
    let closed = false;
    const closing = svc.close().then(() => {
      closed = true;
    });
    await Bun.sleep(30);
    // the swap is out and not answered: the folder is still this process's
    expect(closed).toBe(false);
    expect(existsSync(lockFile)).toBe(true);
    release();
    const report = await cycle;
    await closing;
    expect(report.orders.map((o) => o.stage)).toEqual(["incerta"]);
    expect(closed).toBe(true);
    expect(existsSync(lockFile)).toBe(false);
    // closing twice is harmless, and a cycle asked for after the close does not begin
    await svc.close();
    expect(await svc.runNow()).toMatchObject({ outcome: "bloqueado", reason: "parado" });
  });

  const allOff = { dailyTradeTxFlag: false, dailyTradeTxLimit: "", dailyTradeTxUsed: "0", dailyTransferTxFlag: false, dailyTransferTxLimit: "", dailyTransferTxUsed: "0", singleTxFlag: false, singleTxLimit: "" };
  const unsetPolicy: CliRunner = { run: async (args, o) => (`${args[0]} ${args[1]}` === "wallet status" ? cliOut({ loggedIn: true, currentAccountId: "a1", policy: allOff }) : fakeCli.run(args, o)) };

  test("close() that runs out of time does NOT let go of the folder while work is still in flight: it says so, and a later close() finishes the job", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let executing = false;
    const slow: CliRunner = {
      run: async (args, o) => {
        if (`${args[0]} ${args[1]}` === "swap execute") {
          executing = true;
          await gate;
        }
        return fakeCli.run(args, o);
      },
    };
    const svc = make({ processRunner: slow });
    await live(svc);
    const lockFile = join(dir, "agent", "LOCK");
    const cycle = svc.runNow();
    while (!executing) await Bun.sleep(5);
    // the order is out and unanswered; the process is told to close and gives it 40 ms
    await expect(svc.close(40)).rejects.toThrow("close_timeout");
    expect(existsSync(lockFile)).toBe(true);
    // another process must still be refused the folder: the old order may yet land
    release();
    await cycle;
    await svc.close(1000);
    expect(existsSync(lockFile)).toBe(false);
  });

  test("by default an owner policy with every limit OFF (the real shape of an unset one) keeps the agent analysing, and says what to do: nothing is sent", async () => {
    cliCalls.length = 0;
    const svc = make({ processRunner: unsetPolicy });
    await live(svc);
    const report = await svc.runNow();
    expect(report.mode).toBe("sombra");
    expect(report.notes).toEqual(expect.arrayContaining(["execucao_bloqueada", "politica_ausente"]));
    expect(report.orders.every((o) => o.stage === "preparada")).toBe(true);
    expect(cliCalls.filter((c) => c[1] === "execute")).toHaveLength(0);
    expect(svc.status().wallet.policy).toBe("ausente");
  });

  test("when the person relaxed the policy (an explicit choice), the same unset policy does not stop the agent: it trades on its own caps", async () => {
    cliCalls.length = 0;
    const svc = make({ processRunner: unsetPolicy, requireOwnerPolicy: false });
    await live(svc);
    const report = await svc.runNow();
    expect(report.mode).toBe("limitado");
    expect(report.notes).not.toContain("execucao_bloqueada");
    expect(report.orders.map((o) => o.stage)).toEqual(["incerta"]);
    expect(svc.status().wallet.policy).toBe("ausente");
    expect(svc.status().wallet.next).not.toBe("definir_politica");
  });

  describe("the daily capacity of consultations follows the rhythm the agent keeps, and never resets what was used", () => {
    const mandate = (look: string) => {
      mkdirSync(join(dir, "agent"), { recursive: true });
      writeFileSync(join(dir, "agent", "mandate.json"), JSON.stringify({ version: 1, mandate: { risk: "moderado", reserve: "media", concentration: "media", look }, changedAtMs: null }));
    };

    test("with the owner's bold profile (the default) the capacity covers a look every two minutes while the market is hot, 720 a day, and the status says the profile is the owner's and the aggressive stance is open", async () => {
      const svc = make();
      expect(svc.updateConfig({ auto: true, managed: { kind: "propria", evm: WALLET, solana: null } })).toMatchObject({ ok: true });
      const status = svc.status();
      expect(status.budget.limits.maxConsultsPerDay).toBe(720);
      expect(status.autopilot).toMatchObject({ ownerProfile: "arrojado", aggressiveOpen: true });
      expect((status.autopilot.settings as { riskTaken: string; mandate: { risk: string } }).riskTaken).toBe("agressivo");
      await svc.close();
    });

    test("a look every five minutes is 288 consultations a day, so the capacity is 288 and not the 144 of one look in ten; the count used stays", async () => {
      mandate("rapido");
      const day = new Date().toISOString().slice(0, 10);
      writeFileSync(join(dir, "agent", "budget.json"), JSON.stringify({ version: 1, day, consults: 47, committedTokens: 300_000, measuredTokens: 300_000, unmeasuredCalls: 0 }));
      const svc = make({ ownerProfile: "livre" });
      expect(svc.updateConfig({ auto: true, managed: { kind: "propria", evm: WALLET, solana: null } })).toMatchObject({ ok: true });
      const status = svc.status();
      expect(status.scheduler.intervalMin).toBe(5);
      expect(status.budget.limits.maxConsultsPerDay).toBe(288);
      expect(status.budget.consults).toBe(47);
      expect(status.budget.committedTokens).toBe(300_000);
      await svc.close();
    });

    test("one look in ten minutes keeps 144, one in twenty keeps the configured number: the capacity is never taken BELOW what was configured", async () => {
      mandate("normal");
      const svc = make({ ownerProfile: "livre" });
      expect(svc.updateConfig({ auto: true, managed: { kind: "propria", evm: WALLET, solana: null } })).toMatchObject({ ok: true });
      expect(svc.status().budget.limits.maxConsultsPerDay).toBe(144);
      await svc.close();
      mandate("calmo");
      const slow = make({ ownerProfile: "livre" });
      expect(slow.updateConfig({ auto: true, managed: { kind: "propria", evm: WALLET, solana: null } })).toMatchObject({ ok: true });
      expect(slow.status().budget.limits.maxConsultsPerDay).toBe(144);
      await slow.close();
    });

    test("with the autopilot off, the number configured is the number: nothing is derived", async () => {
      mandate("rapido");
      const svc = make({ ownerProfile: "livre" });
      expect(svc.updateConfig({ auto: false, managed: { kind: "propria", evm: WALLET, solana: null }, riskPct: 0.1 })).toMatchObject({ ok: true });
      expect(svc.status().budget.limits.maxConsultsPerDay).toBe(144);
      await svc.close();
    });
  });

  test("while the market is hot (a purchase is open) the agent looks every two minutes, and the rhythm is back when nothing is open; a manual configuration keeps its own", async () => {
    const config = { auto: true, managed: { kind: "agentica" as const, evm: WALLET, solana: null }, cli: { path: "C:\\agent\\onchainos.exe", sha256: SHA } };
    const svc = make({ ownerProfile: "livre" });
    expect(svc.updateConfig(config)).toMatchObject({ ok: true });
    connect(svc);
    mkdirSync(join(dir, "agent", "onchainos-home"), { recursive: true });
    writeFileSync(join(dir, "agent", "onchainos-home", "session.json"), JSON.stringify({ sessionKeyExpireAt: Date.now() + 100 * 24 * HOUR }));
    // before any look there is nothing hot: the rhythm of the mandate (normal, ten minutes)
    expect(svc.status().scheduler.intervalMin).toBe(10);
    await svc.runNow();
    const last = svc.status().last!;
    expect(last.view!.some((v) => v.kind === "buy" && v.closed === null)).toBe(true);
    expect(svc.status().scheduler.intervalMin).toBe(2);
    await svc.close();
  });

  test("under the owner's bold profile the hot interval is the fastest the day's capacity pays, between one and two minutes on a day with nothing used, and the capacity is still 720", async () => {
    const config = { auto: true, managed: { kind: "agentica" as const, evm: WALLET, solana: null }, cli: { path: "C:\\agent\\onchainos.exe", sha256: SHA } };
    const svc = make();
    expect(svc.updateConfig(config)).toMatchObject({ ok: true });
    connect(svc);
    mkdirSync(join(dir, "agent", "onchainos-home"), { recursive: true });
    writeFileSync(join(dir, "agent", "onchainos-home", "session.json"), JSON.stringify({ sessionKeyExpireAt: Date.now() + 100 * 24 * HOUR }));
    await svc.runNow();
    const status = svc.status();
    expect(status.last!.view!.some((v) => v.kind === "buy" && v.closed === null)).toBe(true);
    expect([status.scheduler.intervalMin >= 1, status.scheduler.intervalMin <= 2, status.budget.limits.maxConsultsPerDay]).toEqual([true, true, 720]);
    await svc.close();
  });

  test("the status carries the value of the wallet over time and the measured record of the decisions, for the screen", async () => {
    mkdirSync(join(dir, "agent"), { recursive: true });
    const line = (atMs: number, units: number) => JSON.stringify({ atMs, usd: null, holdings: [{ id: "501:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", units, priceUsd: 1 }] });
    writeFileSync(join(dir, "agent", "equity.jsonl"), [line(1_000, 100), line(2_000, 110), "garbage"].join("\n") + "\n");
    const svc = make();
    const performance = (svc.status() as unknown as { performance: { series: { t: number; v: number }[]; record: Record<string, unknown> } }).performance;
    expect(performance.series).toEqual([{ t: 1_000, v: 100 }, { t: 2_000, v: 110 }]);
    // no decision was measured yet: the record is empty, never invented
    expect(performance.record).toEqual({});
  });

  test("the model reads its own measured track record in the Brief, and a decision of each cycle is kept in a file for whoever studies it", async () => {
    // an hour-old board: six purchases skipped with the family `fluxo` (four rose), five keeps (all right), already priced
    const H = 3_600_000;
    const lines: string[] = [];
    const at = Date.now() - 3 * H;
    for (let i = 1; i <= 6; i++) lines.push(JSON.stringify({ kind: "decision", key: `old${i}:buy:x|inacao`, cycleId: `old${i}`, atMs: at, mode: "sombra", side: "sell", candidateId: `buy:t${i}`, chainIndex: "501", address: `So1111111111111111111111111111111111111111${i}`, symbol: "T", stance: "skip", usd: 10, entryPriceUsd: 1, costUsd: null, posture: "defensiva", profile: null, source: "modelo", families: ["fluxo"], triggers: [], wallet: "agente", inaction: true }));
    for (let i = 1; i <= 6; i++) lines.push(JSON.stringify({ kind: "settlement", key: `old${i}:buy:x|inacao`, window: "1h", settledAtMs: at + H, priceUsd: i <= 4 ? 1.2 : 0.9, reason: null }));
    mkdirSync(join(dir, "agent"), { recursive: true });
    writeFileSync(join(dir, "agent", "scoreboard.jsonl"), lines.join("\n") + "\n");
    const seen: unknown[] = [];
    const watching: AgentModel = { ...buyer(), async choose(input) { seen.push(input.brief); return buyer().choose(input); } };
    const svc = make({ model: watching });
    await live(svc);
    await svc.runNow();
    expect(seen).toHaveLength(1);
    expect((seen[0] as { historico: Record<string, unknown> }).historico).toMatchObject({ fluxo: { n: 6, acerto: 67 } });
    // the cycle left what it saw and what it answered, in a bounded file
    const kept = readFileSync(join(dir, "agent", "briefs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ cycleId: expect.any(String), posture: "ofensiva" });
    expect(kept[0].candidates.length).toBeGreaterThan(0);
    expect(kept[0].candidates[0]).toMatchObject({ id: expect.any(String), kind: expect.stringMatching(/hold|buy/), stances: expect.any(Array) });
    expect(JSON.stringify(kept[0])).not.toContain(WALLET);
  });

  test("the person's choice to run without the portal's limits is a saved change of the configuration: before it the agent only analyses and SAYS why, after it the money mode is in force", async () => {
    cliCalls.length = 0;
    const svc = make({ processRunner: unsetPolicy });
    await live(svc);
    // before the account has been read once, the status does not claim what nobody checked
    expect(svc.status().authority).toEqual({ level: "analise", blocked: "conta_nao_lida", ownerPolicy: "exigida" });
    // (the account is asked in the background the first time the status is looked at)
    await Bun.sleep(50);
    // eligible for money, but not in force: the status says so honestly
    expect(svc.status().authority).toEqual({ level: "analise", blocked: "politica_ausente", ownerPolicy: "exigida" });
    expect(cliCalls.some((c) => c[0] === "swap" && c[1] === "execute")).toBe(false);
    // the choice
    expect(svc.updateConfig({ ownerPolicy: "dispensada" })).toMatchObject({ ok: true });
    expect(svc.status().config.ownerPolicy).toBe("dispensada");
    expect(svc.status().wallet.next).not.toBe("definir_politica");
    expect(svc.status().authority).toEqual({ level: "dinheiro", blocked: null, ownerPolicy: "dispensada" });
    const report = await svc.runNow();
    expect(report.notes).not.toContain("execucao_bloqueada");
    expect(report.orders.map((o) => o.stage)).toEqual(["incerta"]);
    // and the choice is on disk: a restart keeps it
    expect(JSON.parse(readFileSync(join(dir, "agent", "config.json"), "utf8")).ownerPolicy).toBe("dispensada");
  });

  test("the hosted server keeps the requirement whatever the page or the API asks: the choice is refused there", async () => {
    const svc = make({ processRunner: unsetPolicy, requireOwnerPolicy: true });
    await live(svc);
    expect(svc.updateConfig({ ownerPolicy: "dispensada" })).toEqual({ ok: false, reason: "politica_exigida_pelo_servidor" });
    expect(svc.status().config.ownerPolicy).toBe("exigida");
    expect(svc.status().authority.level).toBe("analise");
    // asking for what it already is changes nothing and is not an error
    expect(svc.updateConfig({ ownerPolicy: "exigida" })).toMatchObject({ ok: true });
  });

  test("the authority in force is said honestly whatever the derived mode: off when nothing is connected, analysis with the reason when the money side is not ready, money when it is", async () => {
    const off = make();
    expect(off.status().authority).toEqual({ level: "desligado", blocked: null, ownerPolicy: "exigida" });
    const svc = make();
    expect(svc.updateConfig({ auto: false, managed: { kind: "propria", evm: WALLET, solana: null }, riskPct: 0.1 })).toMatchObject({ ok: true });
    connect(svc);
    // the person's own wallet is only analysed
    expect(svc.status().authority.level).toBe("analise");
    expect(svc.status().authority.blocked).not.toBeNull();
    const ready = make();
    await live(ready);
    await ready.runNow();
    expect(ready.status().authority).toEqual({ level: "dinheiro", blocked: null, ownerPolicy: "exigida" });
  });

  test("what the wallet really lost opens the breaker: each cycle keeps a reading of the wallet, and a day of falling value pauses the new purchases with its reason", async () => {
    const hour = 3_600_000;
    const svc = make();
    await live(svc);
    // a reading from 20 hours ago in which the same holdings were worth more (AAA at 44 instead of 4): the wallet of 1010 was one of 1110
    const earlier = { atMs: Date.now() - 20 * hour, usd: 1110, holdings: [{ id: `1:${A}`, units: 2.5, priceUsd: 44 }, { id: `1:${USDC}`, units: 1000, priceUsd: 1 }] };
    writeFileSync(join(dir, "agent", "equity.jsonl"), `${JSON.stringify(earlier)}\n`);
    expect(svc.status().paused).toBe(false);
    await svc.runNow();
    const lines = readFileSync(join(dir, "agent", "equity.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    // the cycle wrote its own reading of the wallet, valued
    expect(lines.length).toBe(2);
    expect(lines[1].usd).toBeCloseTo(1010, 6);
    // and the breaker looked at the series: -9 percent in a day is more than the limit
    expect(svc.status()).toMatchObject({ paused: true, state: { pauseReason: "queda_do_dia" } });
  });

  describe("an order whose answer never came is settled by a receipt of the tool's own history", () => {
    const HASH = "0xfeedbeef00112233445566778899aabbccddeeff00112233445566778899aabb";
    const unanswered = (receipt: (args: readonly string[]) => CliResult): CliRunner => ({
      run: async (args, o) => {
        const key = `${args[0]} ${args[1]}`;
        // the swap goes out and the tool answers only with a transaction hash and a refusal that proves nothing
        if (key === "swap execute") return { exitCode: 1, stdout: JSON.stringify({ ok: false, error: "confirmation timed out", data: { swapTxHash: HASH } }), stderr: "", timedOut: false };
        if (key === "wallet history") return receipt(args);
        return fakeCli.run(args, o);
      },
    });

    test("the watch between the cycles looks the history up too: an order is settled by its receipt without waiting for the next full cycle", async () => {
      const svc = make({ processRunner: unanswered(() => cliOut([{ txHash: HASH, txStatus: "SUCCESS", chainIndex: "1", from: WALLET, direction: "OUT" }])) });
      await live(svc);
      expect((await svc.runNow()).reason).toBe("ordem_incerta");
      expect(svc.status().inFlight).toHaveLength(1);
      await svc.guardNow();
      expect(svc.status().inFlight).toEqual([]);
    });

    test("SUCCESS in the history: the order is settled as executed with nobody asked, and the token is free again", async () => {
      const svc = make({ processRunner: unanswered(() => cliOut([{ txHash: HASH, txStatus: "SUCCESS", chainIndex: "1", from: WALLET, direction: "OUT" }])) });
      await live(svc);
      const first = await svc.runNow();
      expect(first.reason).toBe("ordem_incerta");
      expect(svc.status().inFlight).toHaveLength(1);
      expect(svc.status().inFlight[0]!.ref).toBe(HASH);
      await svc.runNow();
      expect(svc.status().inFlight).toEqual([]);
      const orders = readFileSync(join(dir, "agent", "ledger.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((l) => l.kind === "order");
      expect(orders.at(-1).stage).toBe("executada");
      // the trace says what proved it, and the transaction reference is still there
      expect(orders.at(-1).reason).toBe("recibo_sucesso");
      expect(orders.at(-1).ref).toBe(HASH);
    });

    test("ERROR or CANCELLED in the history: it did not go out, so it is settled as failed and may be tried again", async () => {
      const svc = make({ processRunner: unanswered(() => cliOut([{ txHash: HASH, txStatus: "CANCELLED", chainIndex: "1", from: WALLET }])) });
      await live(svc);
      await svc.runNow();
      expect(svc.status().inFlight).toHaveLength(1);
      await svc.runNow();
      expect(svc.status().inFlight.map((r) => r.ref)).not.toContain(HASH);
    });

    test("PENDING, another order's receipt, no answer at all: it stays in flight, however much time passes", async () => {
      for (const receipt of [() => cliOut([{ txHash: HASH, txStatus: "PENDING", chainIndex: "1", from: WALLET }]), () => cliOut([{ txHash: "0xsomeoneelse00000000000000000000000000000000000000000000000000000000", txStatus: "SUCCESS", chainIndex: "1", from: WALLET }]), () => cliOut([{ txHash: HASH, txStatus: "SUCCESS", chainIndex: "1", from: "0x2222222222222222222222222222222222222222" }]), () => cliOut({ diagnostic: { txHash: HASH, txStatus: "SUCCESS", chainIndex: "1", from: WALLET } }), () => ({ exitCode: 1, stdout: "", stderr: "", timedOut: false })]) {
        const svc = make({ processRunner: unanswered(receipt) });
        await live(svc);
        await svc.runNow();
        await svc.runNow();
        expect(svc.status().inFlight).toHaveLength(1);
        await svc.close();
      }
    });
  });

  describe("when the OKX history does not know a Solana hash the agent already holds, the public chain is asked, read only", () => {
    const SOL = "38xPrzDyePKyg4ghstcLWTHBm7jG6ti2Q495yady3pYV";
    const SIG = "5".repeat(88);
    const seed = (reason: string) => {
      mkdirSync(join(dir, "agent"), { recursive: true });
      const line = { kind: "order", cycleId: "c0", atMs: Date.now() - 600_000, orderKey: "c0:hold:x", stage: "incerta", candidateId: "hold:x", side: "sell", stance: "exit_all", chainIndex: "501", symbol: "SYN", address: "3ME1VBnWV6qdCSrKNndCqteS6LHRoM4nFcV99AeHpump", wallet: "agente", usd: 10, amountMinor: "1000", ref: SIG, reason, profile: null, source: "modelo" };
      writeFileSync(join(dir, "agent", "ledger.jsonl"), `${JSON.stringify(line)}\n`);
    };
    const silentHistory: CliRunner = { run: async (args, o) => (args.slice(0, 2).join(" ") === "wallet history" ? { exitCode: 1, stdout: "", stderr: "", timedOut: false } : fakeCli.run(args, o)) };
    const start = async (reader: (b: { signature: string; wallet: string }) => Promise<unknown>) => {
      const svc = make({ processRunner: silentHistory, solanaReceipts: reader as never });
      expect(svc.updateConfig({ auto: false, managed: { kind: "agentica", evm: WALLET, solana: SOL }, riskPct: 0.1, cli: { path: "C:\\agent\\onchainos.exe", sha256: SHA } })).toMatchObject({ ok: true });
      connect(svc);
      mkdirSync(join(dir, "agent", "onchainos-home"), { recursive: true });
      writeFileSync(join(dir, "agent", "onchainos-home", "session.json"), JSON.stringify({ sessionKeyExpireAt: Date.now() + 100 * 24 * HOUR }));
      return svc;
    };

    test("a final success on the chain settles the order as executed with nobody asked, for a transmitted order and for one that timed out with its hash", async () => {
      for (const reason of ["transmitida", "tempo_esgotado"]) {
        rmSync(join(dir, "agent"), { recursive: true, force: true });
        seed(reason);
        const asked: { signature: string; wallet: string }[] = [];
        const svc = await start(async (b) => { asked.push(b); return { status: "success", slot: 5, feeLamports: "5000", nativeDeltaLamports: null, tokenDeltas: null }; });
        expect(svc.status().inFlight).toHaveLength(1);
        await svc.guardNow();
        expect(svc.status().inFlight).toEqual([]);
        // the first ask is the lookup of the receipt; the reader is asked again only to read the fill of the executed order, for the same signature
        expect(asked[0]).toEqual({ signature: SIG, wallet: SOL });
        expect(asked.every((a) => a.signature === SIG && a.wallet === SOL)).toBe(true);
        const last = readFileSync(join(dir, "agent", "ledger.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1);
        expect(last).toMatchObject({ stage: "executada", reason: "recibo_sucesso", ref: SIG });
        await svc.close();
      }
    });

    test("a failed transaction on the chain settles it as failed; pending, nothing known or an error of the node leaves it in flight", async () => {
      for (const answer of [{ status: "pending" }, null, "boom"]) {
        rmSync(join(dir, "agent"), { recursive: true, force: true });
        seed("transmitida");
        const svc = await start(async () => { if (answer === "boom") throw new Error("rpc down"); return answer === null ? null : { status: (answer as { status: string }).status, slot: 5, feeLamports: null, nativeDeltaLamports: null, tokenDeltas: null }; });
        await svc.guardNow();
        expect(svc.status().inFlight).toHaveLength(1);
        await svc.close();
      }
      rmSync(join(dir, "agent"), { recursive: true, force: true });
      seed("transmitida");
      const failing = await start(async () => ({ status: "failed", slot: 5, feeLamports: "5000", nativeDeltaLamports: null, tokenDeltas: null }));
      await failing.guardNow();
      expect(failing.status().inFlight).toEqual([]);
      const last = readFileSync(join(dir, "agent", "ledger.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1);
      expect(last).toMatchObject({ stage: "falhou", reason: "recibo_erro" });
      await failing.close();
    });
  });

  describe("an order the tool refused after the broadcast, that never carried a signature, is found on the chain by what it moved, and never sent again", () => {
    const SOL = "38xPrzDyePKyg4ghstcLWTHBm7jG6ti2Q495yady3pYV";
    const MINT = "3ME1VBnWV6qdCSrKNndCqteS6LHRoM4nFcV99AeHpump";
    const SIG = "5".repeat(88);
    const seed = () => {
      mkdirSync(join(dir, "agent"), { recursive: true });
      const line = { kind: "order", cycleId: "c0", atMs: Date.now() - 600_000, orderKey: "c0:hold:x", stage: "incerta", candidateId: "hold:x", side: "sell", stance: "exit_all", chainIndex: "501", symbol: "SYN", address: MINT, wallet: "agente", usd: 29, amountMinor: "29000000", ref: null, reason: "recusa_sem_prova", profile: null, source: "modelo" };
      writeFileSync(join(dir, "agent", "ledger.jsonl"), `${JSON.stringify(line)}\n`);
    };
    const silentHistory: CliRunner = { run: async (args, o) => (args.slice(0, 2).join(" ") === "wallet history" ? { exitCode: 1, stdout: "", stderr: "", timedOut: false } : fakeCli.run(args, o)) };
    const start = async (finder: (q: unknown) => Promise<unknown>) => {
      const svc = make({ processRunner: silentHistory, solanaSwaps: finder as never });
      expect(svc.updateConfig({ auto: false, managed: { kind: "agentica", evm: WALLET, solana: SOL }, riskPct: 0.1, cli: { path: "C:\\agent\\onchainos.exe", sha256: SHA } })).toMatchObject({ ok: true });
      connect(svc);
      mkdirSync(join(dir, "agent", "onchainos-home"), { recursive: true });
      writeFileSync(join(dir, "agent", "onchainos-home", "session.json"), JSON.stringify({ sessionKeyExpireAt: Date.now() + 100 * 24 * HOUR }));
      return svc;
    };
    const lastLine = () => readFileSync(join(dir, "agent", "ledger.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1);

    test("one exact match settles it as executed with the signature found, asked by the wallet, the token, the amount and the time of the order", async () => {
      rmSync(join(dir, "agent"), { recursive: true, force: true });
      seed();
      const asked: any[] = [];
      const svc = await start(async (q) => (asked.push(q), { signature: SIG, evidence: { status: "success", slot: 5, feeLamports: "5000", nativeDeltaLamports: null, tokenDeltas: [] } }));
      expect(svc.status().inFlight).toHaveLength(1);
      await svc.guardNow();
      expect(svc.status().inFlight).toEqual([]);
      expect(asked).toHaveLength(1);
      expect(asked[0]).toMatchObject({ wallet: SOL, side: "sell", mint: MINT, amountMinor: "29000000", usd: 29 });
      expect(lastLine()).toMatchObject({ stage: "executada", reason: "recibo_recuperado", ref: SIG });
      await svc.close();
    });

    test("no match, an ambiguous one or an outage leaves it in flight for the person: nothing is guessed", async () => {
      for (const finder of [async () => null, async () => { throw new Error("rpc down"); }]) {
        rmSync(join(dir, "agent"), { recursive: true, force: true });
        seed();
        const svc = await start(finder);
        await svc.guardNow();
        expect(svc.status().inFlight).toHaveLength(1);
        await svc.close();
      }
    });
  });

  describe("the real fills of the executed orders are read from the chain, kept, and shown to the model as percentages of what went out", () => {
    const SOL = "38xPrzDyePKyg4ghstcLWTHBm7jG6ti2Q495yady3pYV";
    const MINT = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
    const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const SIG_BUY = "3".repeat(88);
    const SIG_SELL = "4".repeat(88);
    const order = (over: Record<string, unknown>) => ({ kind: "order", cycleId: "c0", chainIndex: "501", symbol: "STONK", address: MINT, wallet: "agente", usd: 12, amountMinor: null, profile: null, source: "modelo", stage: "executada", reason: "recibo_sucesso", ...over });
    const seed = () => {
      const now = Date.now();
      const rows = [
        order({ atMs: now - 40 * 60_000, orderKey: "c0:buy:x", candidateId: "buy:x", side: "buy", stance: "buy_full", ref: SIG_BUY }),
        order({ atMs: now - 24 * 60_000, orderKey: "c1:hold:x", cycleId: "c1", candidateId: "hold:x", side: "sell", stance: "exit_all", ref: SIG_SELL }),
      ];
      mkdirSync(join(dir, "agent"), { recursive: true });
      writeFileSync(join(dir, "agent", "ledger.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    };
    const evidenceOf = (signature: string) => (signature === SIG_BUY
      ? { status: "success", slot: 5, feeLamports: "30250", nativeDeltaLamports: "-1000", tokenDeltas: [{ mint: USDC, decimals: 6, deltaMinor: "-12000000" }, { mint: MINT, decimals: 9, deltaMinor: "110034676384" }] }
      : { status: "success", slot: 6, feeLamports: "106230", nativeDeltaLamports: "-2000", tokenDeltas: [{ mint: USDC, decimals: 6, deltaMinor: "11947276" }, { mint: MINT, decimals: 9, deltaMinor: "-110034676384" }] });
    const silentHistory: CliRunner = { run: async (args, o) => (args.slice(0, 2).join(" ") === "wallet history" ? { exitCode: 1, stdout: "", stderr: "", timedOut: false } : fakeCli.run(args, o)) };
    const start = async (model: AgentModel, reader: (b: { signature: string; wallet: string }) => Promise<unknown>) => {
      rmSync(join(dir, "agent"), { recursive: true, force: true });
      seed();
      const svc = make({ processRunner: silentHistory, solanaReceipts: reader as never, model });
      expect(svc.updateConfig({ auto: false, managed: { kind: "agentica", evm: WALLET, solana: SOL }, riskPct: 0.1, cli: { path: "C:/agent/onchainos.exe", sha256: SHA } })).toMatchObject({ ok: true });
      connect(svc);
      mkdirSync(join(dir, "agent", "onchainos-home"), { recursive: true });
      writeFileSync(join(dir, "agent", "onchainos-home", "session.json"), JSON.stringify({ sessionKeyExpireAt: Date.now() + 100 * 24 * HOUR }));
      return svc;
    };
    const fillsOnDisk = () => (existsSync(join(dir, "agent", "fills.jsonl")) ? readFileSync(join(dir, "agent", "fills.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);

    test("the fill of each executed Solana order is read once from its final transaction and written to the file, with the order key, and the round trip reaches the Brief as a percent of what went out (never dollars, never profit)", async () => {
      const asked: string[] = [];
      const briefs: Record<string, unknown>[] = [];
      const model: AgentModel = { name: "fake", estimateTokens: () => 1000, async choose({ brief, candidates }) { briefs.push(brief as never); return { raw: { posture: "neutra", stances: Object.fromEntries(candidates.map((c) => [c.id, c.kind === "holding" ? "hold" : "skip"])), profiles: {} }, usage: { inputTokens: 1000, outputTokens: 100 } }; } };
      const svc = await start(model, async (b) => (asked.push(b.signature), evidenceOf(b.signature)));
      await svc.guardNow();
      const fills = fillsOnDisk();
      expect(fills.map((f) => [f.orderKey, f.side, f.cashMint, f.cashUnits])).toEqual([["c0:buy:x", "buy", USDC, 12], ["c1:hold:x", "sell", USDC, 11.947276]]);
      expect(new Set(asked)).toEqual(new Set([SIG_BUY, SIG_SELL]));
      // read once: a second pass asks nothing more for orders that already have their fill
      const before = asked.length;
      await svc.guardNow();
      expect(asked.length).toBe(before);
      expect(fillsOnDisk()).toHaveLength(2);
      await svc.runNow();
      const brief = briefs.at(-1)!;
      expect(brief.execucoes).toMatchObject({ voltas: 1, retorno: -0.44, sem_entrada: 0 });
      expect(JSON.stringify(brief)).not.toMatch(/usd/i);
      await svc.close();
    });

    test("a transaction the chain does not give yet, or an outage, leaves the order without a fill and it is asked again later; nothing is invented", async () => {
      for (const reader of [async () => null, async () => { throw new Error("rpc down"); }]) {
        const svc = await start(buyer(), reader);
        await svc.guardNow();
        expect(fillsOnDisk()).toEqual([]);
        await svc.close();
      }
    });
  });

  test("right after a start the guard can sell: it does not wait for the first full cycle to know the dollar coin to settle in", async () => {
    cliCalls.length = 0;
    // a plan of an earlier run is on disk: AAA was bought at 100 and is now worth 4
    const plan = { key: `1:${A}`, chainIndex: "1", address: A, symbol: "AAA", profile: "alvo_10", entryPriceUsd: 100, entryAtMs: Date.now() - 5 * HOUR, peakPriceUsd: 100, targetHit: false, trimmed: false, cycleId: "c0" };
    mkdirSync(join(dir, "agent"), { recursive: true });
    writeFileSync(join(dir, "agent", "plans.json"), `${JSON.stringify({ version: 1, plans: { [`1:${A}`]: plan } })}\n`);
    const svc = make({ guardEveryMs: 0 });
    await live(svc);
    expect(svc.status().book).toBeNull();
    const out = await svc.guardNow();
    expect(out.orders.map((o) => [o.order.source, o.order.stance, o.stage])).toEqual([["protecao", "exit_all", "incerta"]]);
    expect(cliCalls.some((c) => c[0] === "swap" && c[1] === "execute")).toBe(true);
    // and it did not publish its raw book as the one the screen shows (no totals, no rows: only the full cycle verifies values and publishes)
    expect(svc.status().book?.totalUsd).toBeNull();
    expect(svc.status().book?.positions).toEqual([]);
  });

  describe("a fact the guard sees asks the model for another look, through the same flight", () => {
    // AAA was bought at 4 under a plan that stops at 6 percent: half of it, 3 percent, is a move worth another look
    const setup = (auto: boolean, over: { eventMinGapMs?: number } = {}) => {
      const calls = { n: 0 };
      let price = 4;
      const plan = { key: `1:${A}`, chainIndex: "1", address: A, symbol: "AAA", profile: "alvo_10", entryPriceUsd: 4, entryAtMs: Date.now() - HOUR, peakPriceUsd: 4, targetHit: false, trimmed: false, cycleId: "c0" };
      mkdirSync(join(dir, "agent"), { recursive: true });
      writeFileSync(join(dir, "agent", "plans.json"), `${JSON.stringify({ version: 1, plans: { [`1:${A}`]: plan } })}
`);
      const holder: AgentModel = {
        name: "fake-jev",
        estimateTokens: () => 1000,
        async choose({ candidates }) {
          calls.n++;
          return { raw: { posture: "neutra", stances: Object.fromEntries(candidates.map((c) => [c.id, c.kind === "holding" ? "hold" : "skip"])), profiles: {} }, usage: { inputTokens: 1000, outputTokens: 100 } };
        },
      };
      const moving = { balances: async () => [asset({ tokenPrice: String(price) }), asset({ tokenContractAddress: USDC, symbol: "USDC", balance: "1000", rawBalance: "1000000000", tokenPrice: "1" })] };
      const svc = make({ guardEveryMs: 0, start: true, schedule: () => () => {}, balances: moving, model: holder, eventMinGapMs: over.eventMinGapMs ?? 0 });
      expect(svc.updateConfig({ auto, managed: { kind: "agentica", evm: WALLET, solana: null }, riskPct: 0.1, cli: { path: "C:/agent/onchainos.exe", sha256: SHA } })).toMatchObject({ ok: true });
      connect(svc);
      mkdirSync(join(dir, "agent", "onchainos-home"), { recursive: true });
      writeFileSync(join(dir, "agent", "onchainos-home", "session.json"), JSON.stringify({ sessionKeyExpireAt: Date.now() + 100 * 24 * HOUR }));
      return { svc, calls, setPrice: (p: number) => { price = p; } };
    };
    const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 10)); };

    test("a move of half the stop distance since the last look is one more look; a smaller one, or the same one again, is not", async () => {
      const { svc, calls, setPrice } = setup(true);
      await svc.runNow();
      expect(calls.n).toBe(1);
      setPrice(4.08);
      await svc.guardNow();
      await settle();
      expect(calls.n).toBe(1);
      setPrice(4.2);
      await svc.guardNow();
      await settle();
      expect(calls.n).toBe(2);
      // the look moved the baseline: the same price is no news, and the chain of ticks was counted again from that cycle
      await svc.guardNow();
      await settle();
      expect(calls.n).toBe(2);
      await svc.close();
    });

    test("a fact the guard saw before the gap was gone is not lost: the same fact seen again after it asks for the look ONCE, before any tick", async () => {
      // the local clock is the real one: a gap of a third of a second stands for the 90 s of the real service
      const { svc, calls, setPrice } = setup(true, { eventMinGapMs: 350 });
      await svc.runNow();
      expect(calls.n).toBe(1);
      setPrice(4.2);
      await svc.guardNow();
      await settle();
      // too soon after the last cycle: held back, not spent
      expect(calls.n).toBe(1);
      await new Promise((r) => setTimeout(r, 400));
      await svc.guardNow();
      await settle();
      expect(calls.n).toBe(2);
      // and it was consumed: another pass with the same price asks for nothing more
      await new Promise((r) => setTimeout(r, 400));
      await svc.guardNow();
      await settle();
      expect(calls.n).toBe(2);
      await svc.close();
    });

    test("a configuration the person set by hand keeps its own rhythm: the guard does not ask for extra looks", async () => {
      const { svc, calls, setPrice } = setup(false);
      await svc.runNow();
      setPrice(4.4);
      await svc.guardNow();
      await settle();
      expect(calls.n).toBe(1);
      await svc.close();
    });
  });

  test("a binary whose hash is not the one supplied is never run", async () => {
    cliCalls.length = 0;
    const svc = make({ sha256File: async () => "b".repeat(64) });
    await live(svc);
    const report = await svc.runNow();
    // the tool is not run, and nothing is sent; the agent goes on in the shadow and says why it is not trading
    expect(report).toMatchObject({ mode: "sombra" });
    expect(report.notes).toEqual(expect.arrayContaining(["execucao_bloqueada", "binario_divergente"]));
    expect(report.orders.every((o) => o.stage === "preparada")).toBe(true);
    expect(cliCalls).toHaveLength(0);
  });

  test("a path of the tool that does not resolve for this process (written by another view of the profile folder) is replaced by the same file in the folder of the agent, and the hash of the person is still what decides", async () => {
    cliCalls.length = 0;
    const asked: string[] = [];
    const name = "onchainos-test.exe";
    mkdirSync(join(dir, "agent", "cli"), { recursive: true });
    writeFileSync(join(dir, "agent", "cli", name), "not the real tool");
    const own = join(dir, "agent", "cli", name);
    // the configured path is another process's view of the folder: nothing is there
    const svc = make({ sha256File: async (p) => (asked.push(p), p === own ? SHA : null) });
    expect(svc.updateConfig({ auto: false, managed: { kind: "agentica", evm: WALLET, solana: null }, riskPct: 0.1, cli: { path: "Z:/view-that-does-not-exist/" + name, sha256: SHA } })).toMatchObject({ ok: true });
    connect(svc);
    mkdirSync(join(dir, "agent", "onchainos-home"), { recursive: true });
    writeFileSync(join(dir, "agent", "onchainos-home", "session.json"), JSON.stringify({ sessionKeyExpireAt: Date.now() + 100 * 24 * HOUR }));
    const report = await svc.runNow();
    expect(asked).toContain(own);
    expect(report.notes).not.toContain("binario_divergente");
    expect(report.mode).toBe("limitado");
    // a file in the folder of the agent with another hash is refused all the same
    const other = make({ sha256File: async () => "c".repeat(64) });
    expect(other.updateConfig({ auto: false, managed: { kind: "agentica", evm: WALLET, solana: null }, riskPct: 0.1, cli: { path: "Z:/view-that-does-not-exist/" + name, sha256: SHA } })).toMatchObject({ ok: true });
    connect(other);
    expect((await other.runNow()).notes).toEqual(expect.arrayContaining(["binario_divergente"]));
    await svc.close();
    await other.close();
  });

  describe("the pause of the purchases rests on the money of the wallet, never on a measurement against an alternative that did not happen", () => {
    const HOURS = 3_600_000;
    const decision = (key: string, side: "buy" | "sell", atMs: number, over: Record<string, unknown> = {}) => ({ kind: "decision", key, cycleId: key.split(":")[0], atMs, mode: "limitado", side, candidateId: `${side}:${key}`, chainIndex: "501", address: `So${key.replace(/[^A-Za-z0-9]/g, "")}`.padEnd(44, "1").slice(0, 44), symbol: "SYN", stance: side === "buy" ? "buy_full" : "exit_all", usd: 1000, entryPriceUsd: 1, costUsd: null, posture: "neutra", profile: null, source: "modelo", families: [], triggers: [], wallet: "agente", ...over });
    const settled = (key: string, price: number) => ({ kind: "settlement", key, window: "4h", settledAtMs: Date.now() - HOURS, priceUsd: price, reason: null });
    /** Three orders of one side, made six hours ago and priced at four hours at `price` (1 was the entry): a counterfactual as large as one wants. */
    const seedBoard = (side: "buy" | "sell", price: number) => {
      const at = Date.now() - 6 * HOURS;
      const lines = [1, 2, 3].flatMap((i) => {
        const key = `p${side}${i}:${side}:t${i}`;
        return [JSON.stringify(decision(key, side, at + i, { address: `T${i}`.padEnd(44, "1") })), JSON.stringify(settled(key, price))];
      });
      writeFileSync(join(dir, "agent", "scoreboard.jsonl"), lines.join("\n") + "\n");
    };
    /** The ledger of the same three positions: bought, and then SOLD before the price fell (the sale is settled by its receipt). */
    const seedClosedPositions = () => {
      const at = Date.now() - 6 * HOURS;
      const rows = [1, 2, 3].flatMap((i) => {
        const base = { kind: "order", cycleId: `c${i}`, chainIndex: "501", symbol: "SYN", address: `T${i}`.padEnd(44, "1"), wallet: "agente", usd: 1000, amountMinor: "1000000", ref: null, profile: null, source: "modelo" };
        return [
          { ...base, atMs: at + i * 1000, orderKey: `c${i}:buy:t${i}`, stage: "executada", reason: "recibo_sucesso", candidateId: `buy:t${i}`, side: "buy", stance: "buy_full" },
          { ...base, atMs: at + i * 1000 + 600_000, orderKey: `c${i}x:hold:t${i}`, stage: "executada", reason: "recibo_sucesso", candidateId: `hold:t${i}`, side: "sell", stance: "exit_all", cycleId: `c${i}x` },
        ].map((r) => JSON.stringify(r));
      });
      writeFileSync(join(dir, "agent", "ledger.jsonl"), rows.join("\n") + "\n");
    };
    const seedState = (reason: string | null) => {
      const until = reason === null ? null : Date.now() + 20 * HOURS;
      writeFileSync(join(dir, "agent", "state.json"), JSON.stringify({ version: 3, connected: true, connectedAtMs: Date.now() - 60_000, disclosure: DISCLOSURE, pausedUntilMs: until, pauseReason: reason, changedAtMs: Date.now() - 3_600_000, events: [] }));
    };
    const start = async (reason: string | null, side: "buy" | "sell", price: number, closed = false) => {
      rmSync(join(dir, "agent"), { recursive: true, force: true });
      mkdirSync(join(dir, "agent"), { recursive: true });
      seedBoard(side, price);
      if (closed) seedClosedPositions();
      seedState(reason);
      const svc = make();
      await live(svc);
      return svc;
    };
    const events = (svc: ReturnType<typeof make>) => svc.status().state.events as unknown as { kind: string; reason: string }[];

    test("a pause the old rule wrote from the Placar is looked at again by the agent itself, lifted, and left on the record with its reason (for either legacy reason)", async () => {
      for (const reason of ["disjuntor_de_perda", "evidencia_perdida"]) {
        const svc = await start(reason, "sell", 1.5);
        expect(svc.status().paused).toBe(true);
        await svc.runNow();
        expect(svc.status().paused).toBe(false);
        expect(events(svc).some((e) => e.kind === "retomou" && e.reason === "pausa_reavaliada")).toBe(true);
        await svc.close();
      }
    });

    test("sales that rose after they were made, however large the counterfactual, never pause the purchases", async () => {
      const svc = await start(null, "sell", 1.5);
      await svc.runNow();
      expect(svc.status().paused).toBe(false);
      expect(events(svc).some((e) => e.kind === "pausou")).toBe(false);
      await svc.close();
    });

    test("purchases priced four hours after the BUY far under their entry are no loss when the agent had already sold the positions before the fall: nothing pauses", async () => {
      const svc = await start(null, "buy", 0.5, true);
      await svc.runNow();
      expect(svc.status().paused).toBe(false);
      expect(events(svc).some((e) => e.kind === "pausou")).toBe(false);
      await svc.close();
    });

    test("the same counterfactual of purchases pauses nothing either when the positions are still held: the Placar is a fact for the model, not a trigger", async () => {
      const svc = await start(null, "buy", 0.2);
      await svc.runNow();
      expect(svc.status().paused).toBe(false);
      await svc.close();
    });

    test("a pause for the value of the wallet falling is never lifted by this", async () => {
      const svc = await start("queda_do_dia", "sell", 1.5);
      await svc.runNow();
      expect(svc.status().paused).toBe(true);
      expect(svc.status().state.pauseReason).toBe("queda_do_dia");
      await svc.close();
    });
  });

  test("the wallet that is managed cannot be swapped while the mode is the money mode", async () => {
    const svc = make();
    await live(svc);
    expect(svc.updateConfig({ managed: { kind: "agentica", evm: B, solana: null } })).toEqual({ ok: false, reason: "parar_antes_de_trocar_carteira" });
    expect(svc.updateConfig({ intervalMin: 20 })).toMatchObject({ ok: true });
    svc.disconnect();
    expect(svc.updateConfig({ managed: { kind: "agentica", evm: B, solana: null } })).toMatchObject({ ok: true });
  });

  test("disconnecting while it trades is immediate and nothing more goes out", async () => {
    cliCalls.length = 0;
    const svc = make();
    await live(svc);
    svc.disconnect();
    await svc.runNow();
    expect(cliCalls.filter((c) => c[1] === "execute")).toHaveLength(0);
  });
});

describe("the default clock sync of a cycle goes through the fetch the service was given (Codex 155)", () => {
  const TIME = "/api/v5/public/time";
  // the global fetch is replaced by a spy for the length of the test, so that a default that reaches for it is SEEN and never reaches the network
  const withGlobalSpy = async (run: (leaked: string[]) => Promise<void>) => {
    const real = globalThis.fetch;
    const leaked: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      leaked.push(String(url));
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    try {
      await run(leaked);
    } finally {
      globalThis.fetch = real;
      resetOkxClockForTests();
    }
  };

  test("with no syncClock given, the three samples of the clock use the injected fetch, with the signal, and the global fetch is never touched", async () => {
    await withGlobalSpy(async (leaked) => {
      const seen: { url: string; signal: boolean }[] = [];
      const injected = (async (url: unknown, init?: RequestInit) => {
        seen.push({ url: String(url), signal: init?.signal instanceof AbortSignal });
        return new Response("{}", { status: 404 });
      }) as unknown as typeof fetch;
      const svc = make({ fetch: injected, syncClock: undefined });
      await svc.runNow();
      await svc.close();
      const time = seen.filter((s) => s.url.includes(TIME));
      expect(time.length).toBeGreaterThanOrEqual(1);
      expect(time.every((s) => s.signal)).toBe(true);
      expect(leaked.filter((u) => u.includes(TIME))).toEqual([]);
    });
  });

  test("a syncClock given by the host still replaces the default: the clock is not measured through any fetch", async () => {
    await withGlobalSpy(async (leaked) => {
      const seen: string[] = [];
      const injected = (async (url: unknown) => {
        seen.push(String(url));
        return new Response("{}", { status: 404 });
      }) as unknown as typeof fetch;
      let called = 0;
      const svc = make({ fetch: injected, syncClock: async () => { called += 1; return null; } });
      await svc.runNow();
      await svc.close();
      expect(called).toBeGreaterThanOrEqual(1);
      expect(seen.filter((u) => u.includes(TIME))).toEqual([]);
      expect(leaked.filter((u) => u.includes(TIME))).toEqual([]);
    });
  });
});
