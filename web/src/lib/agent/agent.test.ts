import { describe, expect, test } from "bun:test";
import { createAgentClient, DISCLOSURE } from "./client";
import { CONNECTED_STATE, DISCONNECTED_STATE, NOW, rawStatus, sampleStatus, WALLET_TRADING } from "./fixtures";
import { parseStatus } from "./parse";
import { currentOrders, agoText, budgetText, effectiveMode, contextRows, eventLine, evidenceLines, evidenceText, headline, inFlightLine, modeLead, needsPersonWord, inText, ledgerLine, moneyEvidence, pctText, profileText, radarRows, readinessText, reasonText, sessionText, shortAddress, signedUsdText, stanceText, strategyRows, usdText, MODE_TEXT } from "./view";
import { connectBrowserWallet, type WalletWindow } from "./wallet-connect";

describe("the status the core gives", () => {
  test("a good body becomes a status with its parts", () => {
    const s = sampleStatus();
    expect(s).toMatchObject({ connected: true, mode: "sombra", paused: false });
    expect(s.managed.evm).toBe("0x1111111111111111111111111111111111111111");
    expect(s.readiness.limitado).toEqual(["cli_instalado", "carteira_agentica"]);
    expect(s.last?.orders).toHaveLength(2);
    expect(s.last?.view.map((v) => v.symbol)).toEqual(["AAA", "BBB", "CCC"]);
    expect(s.book?.positions.map((p) => p.symbol)).toEqual(["USDC", "AAA"]);
    expect(s.book?.positions[1]?.plan).toMatchObject({ profile: "alvo_10", targetHit: false });
    expect(s.windows["15m"].claimReason).toBe("amostra_pequena");
    expect(s.context?.tendencia).toBe("lateral");
    expect(s.ledger.map((r) => r.kind)).toEqual(["cycle", "order"]);
    expect(s.autopilot.mandate).toEqual({ risk: "moderado", reserve: "media", concentration: "media", look: "normal" });
    expect(s.wallet.next).toBe("instalar");
  });

  test("a body that is not what the core promises is no status", () => {
    expect(parseStatus(null)).toBeNull();
    expect(parseStatus({ ok: false })).toBeNull();
    expect(parseStatus({ ok: true })).toBeNull();
    expect(parseStatus(rawStatus({ state: { ...CONNECTED_STATE, connected: "yes" } }))).toBeNull();
    expect(parseStatus(rawStatus({ mode: "voando" }))).toBeNull();
    expect(parseStatus(rawStatus({ mode: "assistido" }))).toBeNull();
    expect(parseStatus(rawStatus({ readiness: { sombra: [] } }))).toBeNull();
    expect(parseStatus(rawStatus({ wallet: { next: "voar" } }))).toBeNull();
    expect(parseStatus(rawStatus({ autopilot: { settings: {} } }))).toBeNull();
    expect(parseStatus(rawStatus({ scoreboard: { decisions: 1, windows: {} } }))).toBeNull();
  });

  test("a piece the screen can live without is null when it is malformed, and never invented", () => {
    const s = parseStatus(rawStatus({ last: { nonsense: true }, book: "x", context: 5 }))!;
    expect(s.last).toBeNull();
    expect(s.book).toBeNull();
    expect(s.context).toBeNull();
  });

  test("an old core without the pieces of the new page shows none of them", () => {
    const old = rawStatus();
    delete (old.status as Record<string, unknown>).inFlight;
    delete (old.status as Record<string, unknown>).lock;
    const s = parseStatus(old)!;
    expect(s.inFlight).toEqual([]);
    expect(s.lock).toBe(true);
    expect(s.protective).toBe(0);
    expect(s.windows["24h"].overlapping).toBe(0);
  });

  test("the page to sign in on is OKX's own or it is not offered, and an address that is not one is dropped", () => {
    const ok = "https://web3.okx.com/account/sociallogin?authSessionId=abc";
    expect(parseStatus(rawStatus({ wallet: { ...WALLET_TRADING, login: "aguardando", loginUrl: ok, next: "entrar" } }))!.wallet.loginUrl).toBe(ok);
    for (const evil of ["https://evil.example/account/x", "http://web3.okx.com/account/x", "https://web3.okx.com.evil.example/account/x", "javascript:alert(1)"]) {
      expect(parseStatus(rawStatus({ wallet: { ...WALLET_TRADING, login: "aguardando", loginUrl: evil, next: "entrar" } }))!.wallet.loginUrl).toBeNull();
    }
    expect(parseStatus(rawStatus({ wallet: { ...WALLET_TRADING, address: "not an address!" } }))!.wallet.address).toBeNull();
  });

  test("a pause, its reason and the events of the agent come through", () => {
    const s = parseStatus(rawStatus({ paused: true, state: { ...CONNECTED_STATE, pausedUntilMs: NOW + 3_600_000, pauseReason: "disjuntor_de_perda", events: [{ atMs: NOW - 1000, kind: "pausou", reason: "disjuntor_de_perda" }, { atMs: 1, kind: "voou", reason: "x" }] } }))!;
    expect(s).toMatchObject({ paused: true, pauseReason: "disjuntor_de_perda", pausedUntilMs: NOW + 3_600_000 });
    expect(s.events).toEqual([{ atMs: NOW - 1000, kind: "pausou", reason: "disjuntor_de_perda" }]);
  });

  test("orders in flight come through; one whose key could carry anything is dropped", () => {
    const good = { orderKey: "cy-2:a", atMs: 1, stage: "enviando", side: "buy", symbol: "AAA", chainIndex: "1", usd: 5, source: "modelo", reason: null };
    const s = parseStatus(rawStatus({ inFlight: [good, { ...good, orderKey: "a b<script>" }, { ...good, stage: "executada" }, { ...good, side: "hold" }, { ...good, usd: "5" }, null, 7] }))!;
    expect(s.inFlight.map((o) => o.orderKey)).toEqual(["cy-2:a"]);
  });
});

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the client", () => {
  test("status is a GET with no intent header, and parses the body", async () => {
    const seen: RequestInit[] = [];
    const client = createAgentClient("http://core", async (_url, init) => (seen.push(init ?? {}), response(rawStatus())));
    expect((await client.status()).ok).toBe(true);
    expect(seen[0]!.method).toBe("GET");
    expect((seen[0]!.headers as Record<string, string>)["x-inonu-intent"]).toBeUndefined();
  });

  test("connecting sends the version of the notice the person read, with the wallet when there is one; every write carries the intent header", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const client = createAgentClient("http://core", async (url, init) => (seen.push({ url, init: init ?? {} }), response({ ok: true })));
    await client.connect({ managed: { kind: "propria", evm: "0x1111111111111111111111111111111111111111", solana: null } });
    await client.connect();
    await client.disconnect();
    await client.wallet("install");
    await client.resolve("cy-1:hold:x@agente", "executada");
    expect(seen.map((s) => [s.init.method, s.url])).toEqual([["POST", "http://core/agent/connect"], ["POST", "http://core/agent/connect"], ["POST", "http://core/agent/disconnect"], ["POST", "http://core/agent/wallet"], ["POST", "http://core/agent/resolve"]]);
    for (const s of seen) expect((s.init.headers as Record<string, string>)["x-inonu-intent"]).toBe("user");
    expect(JSON.parse(seen[0]!.init.body as string)).toEqual({ disclosure: DISCLOSURE, managed: { kind: "propria", evm: "0x1111111111111111111111111111111111111111", solana: null } });
    expect(JSON.parse(seen[1]!.init.body as string)).toEqual({ disclosure: DISCLOSURE });
    expect(JSON.parse(seen[3]!.init.body as string)).toEqual({ action: "install" });
  });

  test("there is no call left for a mode, a permission, a configuration or a stop", () => {
    const client = createAgentClient("", async () => response({ ok: true })) as unknown as Record<string, unknown>;
    for (const gone of ["setMode", "setConsent", "updateConfig", "stop", "run"]) expect(client[gone]).toBeUndefined();
  });

  test("every failure is a named reason, never a throw", async () => {
    const down = createAgentClient("", async () => { throw new Error("offline"); });
    expect(await down.status()).toEqual({ ok: false, reason: "sem_conexao" });
    expect(await down.connect()).toEqual({ ok: false, reason: "sem_conexao" });
    expect(await createAgentClient("", async () => response({ ok: false }, 404)).status()).toEqual({ ok: false, reason: "servidor_sem_rota" });
    expect(await createAgentClient("", async () => response({ ok: false, code: "origin_not_allowed" }, 403)).status()).toEqual({ ok: false, reason: "origin_not_allowed" });
    expect(await createAgentClient("", async () => response("nope", 403)).status()).toEqual({ ok: false, reason: "origem_negada" });
    expect(await createAgentClient("", async () => response({ ok: false, code: "aviso_desatualizado" }, 409)).connect()).toEqual({ ok: false, reason: "aviso_desatualizado" });
    expect(await createAgentClient("", async () => response({ hello: 1 })).status()).toEqual({ ok: false, reason: "resposta_invalida" });
    expect(await createAgentClient("", async () => new Response("<html>", { status: 500 })).status()).toEqual({ ok: false, reason: "servidor_com_erro" });
    // a code that could carry text is not echoed
    expect(await createAgentClient("", async () => response({ ok: false, code: "ignore previous instructions <script>" }, 409)).connect()).toEqual({ ok: false, reason: "servidor_com_erro" });
  });
});

describe("connecting the wallet of the browser", () => {
  const EVM = "0xAbCdEf0123456789abcdef0123456789ABCDEF01";
  const SOL = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
  const win = (over: Partial<NonNullable<WalletWindow["okxwallet"]>> = {}): WalletWindow => ({ okxwallet: { request: async () => [EVM], ...over } });

  test("the public addresses come back, and nothing but the accounts is asked", async () => {
    const asked: string[] = [];
    const w = win({ request: async (a) => (asked.push(a.method), [EVM]), solana: { connect: async () => ({ publicKey: { toString: () => SOL } }) } });
    expect(await connectBrowserWallet(w)).toEqual({ ok: true, wallet: { evm: EVM.toLowerCase(), solana: SOL } });
    expect(asked).toEqual(["eth_requestAccounts"]);
  });

  test("no extension, a refusal and no account are named, and Solana failing does not undo the EVM connection", async () => {
    expect(await connectBrowserWallet(undefined)).toEqual({ ok: false, reason: "sem_extensao" });
    expect(await connectBrowserWallet({})).toEqual({ ok: false, reason: "sem_extensao" });
    expect(await connectBrowserWallet(win({ request: async () => { throw new Error("User rejected"); } }))).toEqual({ ok: false, reason: "recusada" });
    expect(await connectBrowserWallet(win({ request: async () => [] }))).toEqual({ ok: false, reason: "sem_conta" });
    expect(await connectBrowserWallet(win({ request: async () => ["not an address"] }))).toEqual({ ok: false, reason: "sem_conta" });
    expect(await connectBrowserWallet(win({ solana: { connect: async () => { throw new Error("no"); } } }))).toEqual({ ok: true, wallet: { evm: EVM.toLowerCase(), solana: null } });
  });
});

describe("the words", () => {
  test("not connected, the page invites; connected, it says what the agent is doing", () => {
    expect(headline(sampleStatus({ state: DISCONNECTED_STATE, mode: "desligado", authority: { level: "desligado", blocked: null, ownerPolicy: "exigida" } }), NOW)).toBe("Conecte a carteira e o agente comeca a trabalhar.");
    expect(headline(sampleStatus(), NOW)).toContain("Analisando. Decidiu ha 3 min: postura neutra, 2 ordens seriam feitas");
    const trading = sampleStatus({ mode: "limitado", authority: { level: "dinheiro", blocked: null, ownerPolicy: "exigida" }, wallet: WALLET_TRADING, last: { ...(rawStatus().status.last as object), mode: "limitado", orders: [{ ...((rawStatus().status.last as { orders: unknown[] }).orders[0] as object), stage: "executada" }] } });
    expect(headline(trading, NOW)).toContain("Operando. Decidiu ha 3 min: postura neutra, 1 de 1 ordem executada.");
  });

  test("the page never says Operando when the agent is not moving money: a step still waiting on the person, or a last cycle that ran in analysis, is Analisando", () => {
    const waitingLimits = sampleStatus({ mode: "limitado", authority: { level: "analise", blocked: "politica_ausente", ownerPolicy: "exigida" }, wallet: { ...WALLET_TRADING, next: "definir_politica", policy: "ausente" }, last: null });
    expect(effectiveMode(waitingLimits)).toBe("sombra");
    expect(headline(waitingLimits, NOW)).toContain("Analisando");
    expect(headline(waitingLimits, NOW)).toContain("limites");
    expect(headline(waitingLimits, NOW)).not.toContain("Operando");
    const lastWasAnalysis = sampleStatus({ mode: "limitado", authority: { level: "analise", blocked: "sessao_expirando", ownerPolicy: "exigida" }, wallet: WALLET_TRADING });
    expect(lastWasAnalysis.last!.mode).toBe("sombra");
    expect(effectiveMode(lastWasAnalysis)).toBe("sombra");
    expect(headline(lastWasAnalysis, NOW)).not.toContain("Operando");
    // when the last cycle did move money, or nothing ran yet and everything is ready, it is Operando
    const ready = sampleStatus({ mode: "limitado", authority: { level: "dinheiro", blocked: null, ownerPolicy: "exigida" }, wallet: WALLET_TRADING, last: null });
    expect(effectiveMode(ready)).toBe("limitado");
    expect(headline(ready, NOW)).toContain("Operando");
    expect(effectiveMode(sampleStatus({ state: DISCONNECTED_STATE, mode: "desligado", authority: { level: "desligado", blocked: null, ownerPolicy: "exigida" } }))).toBe("desligado");
  });

  test("a cycle where the model looked at purchases and bought none says what it saw and how close it came, never only the posture", () => {
    const lastOf = (view: unknown[], notes: string[] = []) => ({ ...(rawStatus().status.last as object), orders: [], dropped: [], notes, consulted: true, posture: "defensiva", view });
    const buy = (symbol: string, probs: Record<string, number> | null, closed: string | null = null, stance = "skip") => ({ id: `buy:${symbol}`, kind: "buy", symbol, chainIndex: "501", stance, families: [], marks: [], closed, probs });
    const said = (last: object) => headline(sampleStatus({ last }), NOW);
    expect(said(lastOf([buy("HOTBOT", { skip: 0.86, buy_full: 0.14 }), buy("STONK", { skip: 0.41, buy_full: 0.59 }), buy("OMNI", { skip: 1 }, "abaixo_do_minimo")]))).toContain("o Jev olhou 2 compras abertas e preferiu esperar; a mais perto de comprar foi STONK, com 59% a favor");
    // the Jev leaned to buy but the code's confidence bar was not met: the page says so
    expect(said(lastOf([buy("STONK", { skip: 0.41, buy_full: 0.59 })], ["conviccao_recusou"]))).toContain("o Jev olhou 1 compra aberta, inclinou para comprar STONK (59% a favor), mas a confianca nao bastou");
    // no probabilities, or only closed purchases, or a cycle that did not consult: the older words
    expect(said(lastOf([buy("STONK", null)]))).toContain("o Jev olhou 1 compra aberta e preferiu esperar.");
    expect(said(lastOf([buy("OMNI", { skip: 1 }, "sem_perfil")]))).toContain("postura defensiva, nada a fazer agora");
    expect(said({ ...lastOf([buy("STONK", { skip: 0.4, buy_full: 0.6 })]), consulted: false })).toContain("postura defensiva, nada a fazer agora");
    // never a dash, a middle dot or an accent in what the page says
    expect(said(lastOf([buy("STONK", { skip: 0.41, buy_full: 0.59 })], ["conviccao_recusou"]))).not.toMatch(/[—–·à-ÿ]/);
  });

  test("a cycle that sent orders says what each one is, in the words of the person: who decided it, what and how much", () => {
    const order = (symbol: string, side: "buy" | "sell", stance: string, usd: number, source: "modelo" | "protecao" = "modelo") => ({ order: { candidateId: `x:${symbol}`, side, stance, chainIndex: "501", symbol, address: "a", usd, wallet: "agente", profile: null, source }, stage: "incerta", ref: null, reason: "transmitida" });
    const said = (orders: unknown[]) => headline(sampleStatus({ mode: "limitado", authority: { level: "dinheiro", blocked: null, ownerPolicy: "dispensada" }, wallet: WALLET_TRADING, last: { ...(rawStatus().status.last as object), mode: "limitado", orders } }), NOW);
    expect(said([order("STONK", "sell", "exit_all", 11)])).toContain("Ordem: o Jev mandou sair de STONK (US$ 11).");
    expect(said([order("STONK", "buy", "buy_full", 12)])).toContain("Ordem: o Jev mandou comprar STONK (US$ 12).");
    expect(said([order("AAA", "sell", "trim_half", 20), order("BBB", "buy", "buy_third", 10)])).toContain("Ordens: o Jev mandou vender metade de AAA (US$ 20) e comprar BBB (US$ 10).");
    expect(said([order("AAA", "sell", "exit_all", 20, "protecao")])).toContain("Ordem: o plano de protecao mandou sair de AAA (US$ 20).");
    const many = said([order("A", "buy", "buy_third", 10), order("B", "buy", "buy_third", 10), order("C", "buy", "buy_third", 10)]);
    expect(many).toContain("Ordens: o Jev mandou comprar A (US$ 10), comprar B (US$ 10) e mais 1.");
    expect(many).not.toMatch(/[—–·]/);
  });

  test("the cost guards of the execution are read from the core as facts (what the code still refuses after the quote), and a core that does not say has none: null, never a number made up by the screen", () => {
    const base = rawStatus().status;
    const guards = { impactPct: { buy: 3, sell: 5, protecao: 10 }, taxPct: 5, slippagePct: { buy: 2, sell: 3, protecao: 8 }, buyCostShareOfStop: 0.3333, nativeReserve: { kind: "fixa", usd: 5 } };
    const withGuards = parseStatus({ ok: true, status: { ...base, autopilot: { ...(base.autopilot as object), guards } } })!;
    expect(withGuards.autopilot.guards).toEqual(guards);
    expect(sampleStatus().autopilot.guards).toBeNull();
    // a guard that is not a number, or a reserve of a kind the screen does not know, makes the whole block null
    const broken = parseStatus({ ok: true, status: { ...base, autopilot: { ...(base.autopilot as object), guards: { ...guards, taxPct: "5" } } } })!;
    expect(broken.autopilot.guards).toBeNull();
    const measured = parseStatus({ ok: true, status: { ...base, autopilot: { ...(base.autopilot as object), guards: { ...guards, nativeReserve: { kind: "taxa_medida", usd: null } } } } })!;
    expect(measured.autopilot.guards?.nativeReserve).toEqual({ kind: "taxa_medida", usd: null });
    expect(parseStatus({ ok: true, status: { ...base, autopilot: { ...(base.autopilot as object), guards: { ...guards, nativeReserve: { kind: "outra", usd: 1 } } } } })!.autopilot.guards).toBeNull();
  });

  test("the quota of the data provider is read as the core projected it, keeping the hour each source was observed, the unreported account as unreported and never as zero; a shape that is not that is null", () => {
    const meter = (over: Record<string, unknown> = {}) => ({ scope: "local_gateway", status: "valid", capEvidence: "local_configuration", observedAtMs: NOW - 60_000, ageMs: 60_000, used: 700, monthlyCap: 100_000, remainingAtObservation: 99_300, extrapolatedMonthUse: 2_000, ...over });
    const unreported = { scope: "account_reported", status: "unreported", capEvidence: "unknown", observedAtMs: null, ageMs: null, used: null, monthlyCap: null, remainingAtObservation: null, extrapolatedMonthUse: null };
    const raw = { asOfMs: NOW, month: { key: "2026-10", startAtMs: NOW - 14 * 86_400_000, localNextMonthUtcMs: NOW + 17 * 86_400_000, days: 31 }, accountRateLimits: { requestsPerSecond: null, tokensPerSecond: null }, tiers: { free: { local: meter({ monthlyCap: null, remainingAtObservation: null }), account: unreported }, basic: { local: meter(), account: unreported }, premium: { local: meter({ used: 90 }), account: unreported } } };
    const view = sampleStatus({ resources: raw }).resources;
    expect(view).not.toBeNull();
    expect(view!.tiers.basic.local).toEqual({ scope: "local_gateway", status: "valid", capEvidence: "local_configuration", observedAtMs: NOW - 60_000, used: 700, monthlyCap: 100_000, remainingAtObservation: 99_300, extrapolatedMonthUse: 2_000 });
    expect(view!.tiers.free.local.monthlyCap).toBeNull();
    expect(view!.tiers.basic.account).toMatchObject({ status: "unreported", used: null, observedAtMs: null });
    expect(view!.month).toEqual({ key: "2026-10", startAtMs: NOW - 14 * 86_400_000, localNextMonthUtcMs: NOW + 17 * 86_400_000, days: 31 });
    // the status of an older core, a null, or a shape that is not the projection
    expect(sampleStatus({ resources: null }).resources).toBeNull();
    expect(sampleStatus({ resources: { asOfMs: NOW } }).resources).toBeNull();
    expect(sampleStatus({ resources: { ...raw, tiers: { ...raw.tiers, basic: { local: meter({ status: "weird" }), account: unreported } } } }).resources).toBeNull();
  });

  test("a cycle record of the ledger keeps what the code dropped, so a run of blocked requests can be counted; a malformed entry is left out and a record without the field has none", () => {
    const row = (over: Record<string, unknown>) => ({ kind: "cycle", cycleId: "cy-x", atMs: NOW - 1000, outcome: "decidido", reason: null, mode: "limitado", ...over });
    const s = sampleStatus({ ledger: [row({ dropped: [{ candidateId: "buy:token:1:0xaa", reason: "caixa_insuficiente" }, { candidateId: 7, reason: "x" }, { reason: "sem_tamanho" }] }), row({ cycleId: "cy-y" })] });
    expect(s.ledger[0]!.dropped).toEqual([{ candidateId: "buy:token:1:0xaa", reason: "caixa_insuficiente" }]);
    expect(s.ledger[1]!.dropped).toBeUndefined();
  });

  test("an order the cycle left transmitted is shown as the ledger has it now: confirmed by the receipt when the receipt came, never stuck at the stage of the cycle", () => {
    const base = rawStatus().status.last as { cycleId: string; orders: Record<string, unknown>[] };
    const sold = { order: { candidateId: "x:STONK", side: "sell", stance: "exit_all", chainIndex: "501", symbol: "STONK", address: "a", usd: 11, wallet: "agente", profile: null, source: "modelo" }, stage: "incerta", ref: null, reason: "transmitida" };
    const ledger = (stage: string, reason: string | null, over: Record<string, unknown> = {}) => ({ kind: "order", cycleId: base.cycleId, atMs: NOW - 1000, stage, side: "sell", symbol: "STONK", usd: 11, stance: "exit_all", source: "modelo", reason, ...over });
    const status = (rows: unknown[]) => sampleStatus({ mode: "limitado", authority: { level: "dinheiro", blocked: null, ownerPolicy: "dispensada" }, wallet: WALLET_TRADING, last: { ...base, mode: "limitado", orders: [sold] }, ledger: rows });
    // no later record: as the cycle left it
    expect(currentOrders(status([ledger("incerta", "transmitida", { atMs: NOW - 5000 })]))[0]).toMatchObject({ stage: "incerta", reason: "transmitida" });
    // the receipt came: the newest record wins, and the headline counts it
    const confirmed = status([ledger("incerta", "transmitida", { atMs: NOW - 5000 }), ledger("executada", "recibo_sucesso", { atMs: NOW - 1000 })]);
    expect(currentOrders(confirmed)[0]).toMatchObject({ stage: "executada", reason: "recibo_sucesso" });
    expect(headline(confirmed, NOW)).toContain("1 de 1 ordem executada.");
    // another token, another cycle or the other side of the same token are not this order
    expect(currentOrders(status([ledger("executada", "recibo_sucesso", { symbol: "OTHER" }), ledger("executada", "recibo_sucesso", { cycleId: "cy-other" }), ledger("executada", "recibo_sucesso", { side: "buy" })]))[0]).toMatchObject({ stage: "incerta" });
    expect(currentOrders(sampleStatus({ last: null }))).toEqual([]);
  });

  test("a connected agent with no wallet says it waits for one", () => {
    const noWallet = sampleStatus({ config: { ...(rawStatus().status.config as object), managed: { kind: "propria", evm: null, solana: null } } });
    expect(headline(noWallet, NOW)).toContain("espera uma carteira");
  });

  test("a pause is said with its time and its reason", () => {
    const s = sampleStatus({ paused: true, state: { ...CONNECTED_STATE, pausedUntilMs: NOW + 3_600_000, pauseReason: "disjuntor_de_perda" } });
    expect(headline(s, NOW)).toContain("Compras novas pausadas em 1 h: pausa de compras gravada por uma versao antiga da regra");
  });

  test("a pause the old rule wrote from the Placar says it was not money lost, and the reconsidered one says it was lifted", () => {
    expect(reasonText("disjuntor_de_perda")).toContain("nao e dinheiro perdido");
    expect(reasonText("disjuntor_de_perda")).not.toContain("limite do dia");
    expect(reasonText("evidencia_perdida")).toContain("alternativa que nao aconteceu");
    expect(reasonText("pausa_reavaliada")).toContain("vendas");
    expect(reasonText("pausa_reavaliada")).toContain("nao e dinheiro perdido");
  });

  test("a cycle that waited says why", () => {
    const last = { ...(rawStatus().status.last as object), outcome: "bloqueado", reason: "relogio", orders: [], posture: null, consulted: false };
    expect(headline(sampleStatus({ last }), NOW)).toContain("Esperando ha 3 min. O relogio do computador esta fora de hora em relacao a OKX.");
  });

  test("the strategy the agent chose is in plain lines, and says when the measurement keeps a stance from being honoured", () => {
    const rows = strategyRows(sampleStatus().autopilot);
    expect(rows.map((r) => r.label)).toEqual(["Risco por operacao", "Caixa guardado", "Tamanho de cada compra", "Ritmo"]);
    expect(rows[0]!.value).toBe("Moderado");
    expect(rows[1]!.value).toBe("Caixa normal (20%)");
    expect(rows[2]!.value).toBe("Apostas medias, ate US$ 60");
    expect(rows[3]!.value).toBe("Olha o mercado a cada 10 minutos");
    const auto = rawStatus().status.autopilot as { settings: Record<string, unknown> };
    const bold = sampleStatus({ autopilot: { ...auto, settings: { ...auto.settings, mandate: { risk: "agressivo", reserve: "baixa", concentration: "grande", look: "rapido" }, riskTaken: "moderado" } } });
    expect(strategyRows(bold.autopilot)[0]!.value).toBe("Moderado (pediu agressivo, falta medir mais)");
  });

  test("the radar lists what the agent looked at, what it chose, and why in a few words", () => {
    const rows = radarRows(sampleStatus().last!.view);
    expect(rows.map((r) => [r.symbol, r.verdict])).toEqual([["AAA", "Vender um terco"], ["BBB", "Comprar um terco do maximo"], ["CCC", "Nao comprar"]]);
    expect(rows[1]!.why).toBe("carteiras rastreadas comprando, liquidez boa");
    expect(rows[2]!.why).toBe("entrada esticada");
  });

  test("an order in flight is told with what, how long ago and why nobody knows", () => {
    const line = inFlightLine({ orderKey: "k", atMs: NOW - 5 * 60_000, stage: "incerta", side: "sell", symbol: "AAA", chainIndex: "1", usd: 40, source: "protecao", reason: "tempo_esgotado", detail: null }, NOW);
    expect(line).toContain("Venda do plano da posicao de US$ 40 em AAA");
    expect(line).toContain("sem confirmacao ha 5 min");
    expect(line).toContain("pode ter sido enviada");
  });

  test("the events of the agent are told in a line", () => {
    expect(eventLine({ atMs: NOW - 60_000, kind: "pausou", reason: "evidencia_perdida" }, NOW)).toContain("Compras novas pausadas: pausa de compras gravada por uma versao antiga da regra");
    expect(eventLine({ atMs: NOW, kind: "conectou", reason: "conectou" }, NOW)).toBe("agora. Carteira conectada");
  });

  test("a purchase the code closed is shown as closed, with the reason, and a purchase the model declined is shown as declined", () => {
    const rows = radarRows([
      { id: "buy:a", kind: "buy", symbol: "AAA", chainIndex: "501", stance: "skip", families: ["fluxo"], marks: ["parabolico", "entrada_esticada"], closed: "entrada_esticada" },
      { id: "buy:b", kind: "buy", symbol: "BBB", chainIndex: "501", stance: "skip", families: ["liquidez"], marks: [], closed: null },
      { id: "buy:c", kind: "buy", symbol: "CCC", chainIndex: "501", stance: "skip", families: [], marks: [], closed: "sem_tamanho" },
      { id: "buy:d", kind: "buy", symbol: "DDD", chainIndex: "501", stance: "skip", families: [], marks: [], closed: "abaixo_do_minimo" },
    ]);
    expect(rows[0]!.verdict).toBe("Fechada pelo codigo");
    expect(rows[0]!.why).toContain("preco esticado");
    expect(rows[1]!.verdict).toBe("Nao comprar");
    expect(rows[2]!.verdict).toBe("Fechada pelo codigo");
    expect(rows[2]!.why).toContain("sem caixa");
    expect(rows[3]!.verdict).toBe("Fechada pelo codigo");
    expect(rows[3]!.why).toContain("ordem minima");
    for (const code of ["recibo_sucesso", "recibo_erro", "gas_station_pendente"]) expect(reasonText(code)).not.toBe("Motivo nao reconhecido.");
    // the model's own view of the top and of the fall, and how sure it was, are said in words and never as a code
    for (const code of ["recibo_recuperado", "postura_limitou", "topo_visto_pelo_jev", "topo_sem_resposta", "queda_vista_pelo_jev", "queda_sem_resposta", "conviccao_reduziu", "conviccao_recusou", "conviccao_desconhecida", "conviccao_moderou"]) expect(reasonText(code)).not.toBe("Motivo nao reconhecido.");
    expect(reasonText("topo_visto_pelo_jev")).toContain("Jev");
    // the Gas Station ask is the owner's choice, said plainly: what is short, what it costs, and that the agent never answers it
    const gas = reasonText("gas_station_pendente");
    expect(gas).toContain("SOL");
    expect(gas).toContain("USDC");
    expect(gas).toContain("escolha sua");
    expect(gas).not.toMatch(/[·—–]/);
  });

  test("the page says what is IN FORCE (the authority), not only what the agent may do: analysis with the reason, money, and the person's choice about the portal's limits", () => {
    const base = sampleStatus();
    // the server's own statement wins over the derived mode and over the last cycle
    const analysing = { ...base, mode: "limitado" as const, authority: { level: "analise" as const, blocked: "politica_ausente", ownerPolicy: "exigida" as const } };
    expect(effectiveMode(analysing)).toBe("sombra");
    const money = { ...base, mode: "limitado" as const, authority: { level: "dinheiro" as const, blocked: null, ownerPolicy: "exigida" as const } };
    expect(effectiveMode(money)).toBe("limitado");
    expect(effectiveMode({ ...base, authority: { level: "desligado" as const, blocked: null, ownerPolicy: "exigida" as const } })).toBe("desligado");
    // the sentence under the headline says whose limits hold
    expect(modeLead({ ...money })).toContain("dentro dos limites da conta OKX");
    const waived = { ...money, authority: { level: "dinheiro" as const, blocked: null, ownerPolicy: "dispensada" as const } };
    expect(modeLead(waived)).toContain("dentro dos tetos do proprio app");
    expect(modeLead(waived)).toContain("dispensados, por escolha sua");
    expect(modeLead(waived)).not.toContain("dentro dos limites da conta OKX");
    // in analysis the reason is said in words
    expect(modeLead(analysing)).toContain("Ainda nao move dinheiro");
    expect(modeLead(analysing)).toContain(reasonText("politica_ausente"));
    for (const code of ["conta_nao_lida", "sem_login", "carteira_agentica", "cli_instalado", "credenciais_okx"]) expect(reasonText(code)).not.toBe("Motivo nao reconhecido.");
  });

  test("a server that does not say its authority yet (an older one) is read from its mode, never as money", () => {
    const parsed = parseStatus(rawStatus({ authority: undefined, mode: "limitado" }))!;
    expect(parsed.authority.level).toBe("analise");
    expect(parsed.authority.ownerPolicy).toBe("exigida");
    expect(parseStatus(rawStatus({ authority: { level: "dinheiro", blocked: null, ownerPolicy: "dispensada" } }))!.authority).toEqual({ level: "dinheiro", blocked: null, ownerPolicy: "dispensada" });
    // anything that is not one of the three levels is refused whole
    expect(parseStatus(rawStatus({ authority: { level: "tudo", blocked: null, ownerPolicy: "exigida" } }))).toBeNull();
  });

  test("the reasons that keep the agent in analysis say the limits ARE required (they used to say optional)", () => {
    for (const code of ["politica_ausente", "politica_frouxa"]) {
      expect(reasonText(code)).not.toContain("opcional");
      expect(reasonText(code)).not.toContain("Registro antigo");
      expect(reasonText(code)).toContain("analise");
    }
    expect(reasonText("politica_ausente")).toContain("ligar os limites");
  });

  test("the session of the account in words: days, hours, minutes, expired, unknown", () => {
    const H = 3_600_000;
    expect(sessionText(null)).toBe("Sessao da conta OKX: nao foi possivel ler.");
    expect(sessionText(-1)).toBe("Sessao da conta OKX: expirou. Entre de novo na conta.");
    expect(sessionText(0)).toBe("Sessao da conta OKX: expirou. Entre de novo na conta.");
    expect(sessionText(40 * 60_000)).toBe("Sessao da conta OKX: acaba em 40 minutos. Entre de novo na conta antes disso.");
    expect(sessionText(5 * H)).toBe("Sessao da conta OKX: acaba em 5 horas. Entre de novo na conta antes disso.");
    expect(sessionText(30 * H)).toBe("Sessao da conta OKX: acaba em 30 horas. Entre de novo na conta antes disso.");
    expect(sessionText(80 * 24 * H)).toBe("Sessao da conta OKX: vale por mais 80 dias.");
    expect(sessionText(24 * H * 1.2 + 24 * 3 * H)).toBe("Sessao da conta OKX: vale por mais 4 dias.");
  });

  test("what the OKX program said about a refusal that proved nothing is shown to the person, as plain text, and only that", () => {
    const base = { orderKey: "k", cycleId: "c", atMs: NOW - 60_000, stage: "incerta", side: "sell", symbol: "Chonk", chainIndex: "501", usd: 12, source: "modelo", reason: "recusa_sem_prova" } as never;
    const withDetail = inFlightLine({ ...(base as object), detail: "swap simulation failed: slippage tolerance exceeded" } as never, NOW);
    expect(withDetail).toContain("A OKX disse: swap simulation failed: slippage tolerance exceeded");
    expect(inFlightLine(base, NOW)).not.toContain("A OKX disse");
    const parsed = parseStatus(rawStatus({ inFlight: [{ orderKey: "k", atMs: NOW - 1000, stage: "incerta", side: "sell", symbol: "Chonk", chainIndex: "501", usd: 12, source: "modelo", reason: "recusa_sem_prova", detail: "swap simulation failed" }] }))!;
    expect(parsed.inFlight[0]!.detail).toBe("swap simulation failed");
    // a detail that is not text, or is too long, is dropped
    const odd = parseStatus(rawStatus({ inFlight: [{ orderKey: "k", atMs: NOW - 1000, stage: "incerta", side: "sell", symbol: "Chonk", chainIndex: "501", usd: 12, source: "modelo", reason: null, detail: { a: 1 } }] }))!;
    expect(odd.inFlight[0]!.detail).toBeNull();
  });

  test("the person's word is asked ONLY for an order with no transaction hash the agent can look up: by what the lookup can really do, never by the reason or the age", () => {
    const SOL = "5".repeat(88);
    const EVM = `0x${"a".repeat(64)}`;
    const base = { orderKey: "k", cycleId: "c", stage: "incerta", side: "sell", symbol: "AAA", chainIndex: "501", usd: 20, source: "modelo", detail: null, atMs: NOW - 60_000, reason: "transmitida", ref: SOL } as never as Parameters<typeof needsPersonWord>[0];
    const order = (over: Record<string, unknown>) => ({ ...base, ...over }) as typeof base;
    // a transmitted order, at any age
    for (const ageMs of [30_000, 9 * 60_000, 11 * 60_000, 3_600_000, 3 * 86_400_000]) expect(needsPersonWord(order({ atMs: NOW - ageMs }))).toBe(false);
    // a timeout or a refusal that proved nothing, but kept the hash: the lookup can find it, so nobody is asked
    for (const reason of ["tempo_esgotado", "recusa_sem_prova", "sem_resposta", "excecao", null]) expect(needsPersonWord(order({ reason }))).toBe(false);
    // an EVM order is looked up by an EVM hash
    expect(needsPersonWord(order({ chainIndex: "1", ref: EVM, reason: "tempo_esgotado" }))).toBe(false);
    // no hash at all (an older record, or one that never got one): there is nothing to look up
    for (const reason of ["tempo_esgotado", "sem_resposta", "recusa_sem_prova", "transmitida", null]) expect(needsPersonWord(order({ ref: null, reason }))).toBe(true);
    expect(needsPersonWord(order({ ref: undefined }))).toBe(true);
    // a reference that is not a hash of its network: malformed, an order id, or the hash of another network
    for (const ref of ["5Ksig", "1234567890123456789", "0x1234", `${SOL}!`, "", EVM]) expect(needsPersonWord(order({ ref }))).toBe(true);
    expect(needsPersonWord(order({ chainIndex: "1", ref: SOL }))).toBe(true);
    // a wait of an hour or more is said in plain words, still without a question
    const long = inFlightLine(order({ atMs: NOW - 3 * 3_600_000 }), NOW);
    expect(long).toContain("continua procurando");
    expect(inFlightLine(order({ atMs: NOW - 30_000 }), NOW)).not.toContain("continua procurando");
    expect(inFlightLine(order({ atMs: NOW - 3 * 3_600_000, ref: null }), NOW)).not.toContain("continua procurando");
  });

  test("an order the tool proved was not sent, because its simulation failed, reads as a failure with nothing lost", () => {
    expect(reasonText("simulacao_falhou")).toContain("nada saiu");
    expect(reasonText("simulacao_falhou")).not.toMatch(/[·—–]/);
  });

  test("the page reads the new parts of the status: how sure the model was, what its narrow judgments said, what each level of risk opens, and the value of the wallet over time; a core that says none has none", () => {
    const raw = rawStatus();
    const last = raw.status.last as { view: Record<string, unknown>[]; opened?: unknown };
    last.view[0] = { ...last.view[0], probs: { hold: 0.36, trim_half: 0.21, exit_all: 0.43 }, facets: { fading: 0.83, bogus_value: 7 } };
    last.view[1] = { ...last.view[1], probs: { skip: 0.3, buy_third: 0.7 }, facets: { late_entry: 0.82 } };
    last.opened = { cauteloso: 0, moderado: 2, agressivo: 0 };
    (raw.status as Record<string, unknown>).performance = { series: [{ t: 1, v: 100 }, { t: 2, v: 101.5 }, { t: "x", v: 3 }, { t: 3, v: -4 }], record: { vender: { n: 5, acerto: 0 }, "bad key!": { n: 1, acerto: 1 } } };
    const status = parseStatus(raw)!;
    const view = status.last!.view;
    expect(view[0]!.probs).toEqual({ hold: 0.36, trim_half: 0.21, exit_all: 0.43 });
    // a facet that is not a probability spoils that map, never the page
    expect(view[0]!.facets).toBeNull();
    expect(view[1]!.facets).toEqual({ late_entry: 0.82 });
    expect(status.last!.opened).toEqual({ cauteloso: 0, moderado: 2, agressivo: 0 });
    expect(status.performance.series).toEqual([{ t: 1, v: 100 }, { t: 2, v: 101.5 }]);
    expect(status.performance.record).toEqual({ vender: { n: 5, acerto: 0 } });
    const old = parseStatus(rawStatus())!;
    expect(old.last!.view.every((v) => v.probs === null && v.facets === null)).toBe(true);
    expect(old.last!.opened).toBeNull();
    expect(old.performance).toEqual({ series: [], record: {} });
  });

  test("the owner's profile reaches the page: arrojado when the core says so, free for a core that does not say", () => {
    const raw = rawStatus();
    (raw.status.autopilot as Record<string, unknown>).ownerProfile = "arrojado";
    (raw.status.autopilot as Record<string, unknown>).aggressiveOpen = true;
    const status = parseStatus(raw)!;
    expect(status.autopilot.ownerProfile).toBe("arrojado");
    expect(parseStatus(rawStatus())!.autopilot.ownerProfile).toBe("livre");
    const rows = strategyRows(status.autopilot);
    expect(rows[0]!.note).toContain("definido por voce");
    expect(rows[0]!.note).toContain("nao espera a medicao");
    // the free profile keeps the old note
    expect(strategyRows(parseStatus(rawStatus())!.autopilot)[0]!.note).toContain("so entra quando a medicao provar vantagem");
  });

  test("a transmitted order reads as waiting for the confirmation, not as a failure or a success", () => {
    const line = inFlightLine({ orderKey: "k", cycleId: "c", atMs: NOW - 30_000, stage: "incerta", side: "sell", symbol: "AAA", chainIndex: "501", usd: 20, source: "protecao", ref: "5".repeat(88), reason: "transmitida" } as never, NOW);
    expect(line).toContain("enviada a rede");
    expect(line).toContain("confirmacao");
    expect(line).not.toContain("Motivo nao reconhecido");
  });

  test("the Placar claims only what it measured, and says why when it cannot", () => {
    const w = (over: Record<string, unknown>) => ({ n: 40, overlapping: 0, settled: 40, pending: 0, unknownPrice: 0, grossUsd: 12.5, netUsd: null, hitRate: 0.6, claim: null, claimBasis: null, claimReason: null, ...over });
    expect(evidenceText(w({ claim: "acima_de_manter", claimBasis: "bruto" }) as never)).toBe("Acima de manter em dolares: +US$ 12,50 em 40 decisoes, acerto de 60% (bruto, custo ainda nao medido).");
    // a net figure uses the cost the QUOTE announced (fee and impact), which is an estimate and not what the chain charged: it is said so
    expect(evidenceText(w({ claim: "acima_de_manter", claimBasis: "liquido", netUsd: 9.25 }) as never)).toBe("Acima de manter em dolares: +US$ 9,25 em 40 decisoes, acerto de 60% (liquido do custo estimado pela cotacao).");
    expect(evidenceText(w({ claim: "nao_acima_de_manter", claimBasis: "bruto", grossUsd: -3 }) as never)).toContain("Nao acima de manter em dolares: -US$ 3,00");
    expect(evidenceText(w({ claimReason: "sem_decisoes" }) as never)).toBe("Ainda sem decisoes para medir.");
    expect(evidenceText(w({ claimReason: "amostra_pequena", settled: 3, overlapping: 9 }) as never)).toContain("9 repeticoes da mesma aposta nao contam");
    expect(evidenceText(w({ claimReason: "modos_misturados" }) as never)).toContain("cada modo e medido sozinho");
    expect(evidenceText(w({ claimReason: "algo_novo" }) as never)).toBe("Sem afirmacao possivel.");
    const lines = evidenceLines(sampleStatus().windows);
    expect(lines.map((l) => l.label)).toEqual(["15 minutos", "1 hora", "4 horas", "24 horas"]);
    expect(moneyEvidence(sampleStatus().windows).supported).toBe(false);
  });

  test("reasons are plain sentences, an unknown code is never echoed, and nothing in them uses the characters the desk forbids", () => {
    expect(reasonText("relogio")).toBe("O relogio do computador esta fora de hora em relacao a OKX.");
    expect(reasonText("compras_pausadas")).toContain("pausadas");
    expect(reasonText("<script>alert(1)</script>")).toBe("Motivo nao reconhecido.");
    expect(reasonText(null)).toBe("");
    for (const code of ["pausa_reavaliada", "disjuntor_de_perda", "execucao_bloqueada", "hash_divergente", "sem_link_de_login", "aviso_desatualizado", "ordem_em_voo", "outra_instancia"]) {
      expect(reasonText(code)).not.toBe("Motivo nao reconhecido.");
      expect(reasonText(code)).toMatch(/^[\x20-\x7e]+$/);
      expect(reasonText(code)).not.toMatch(/[·–—]/);
    }
  });

  test("numbers and time", () => {
    expect(usdText(1234.5)).toBe("US$ 1.234,50");
    expect(usdText(null)).toBe("sem valor");
    expect(signedUsdText(-3)).toBe("-US$ 3,00");
    expect(pctText(12.345)).toBe("12,3%");
    expect(agoText(NOW - 4 * 60_000, NOW)).toBe("ha 4 min");
    expect(agoText(null, NOW)).toBe("nunca");
    expect(inText(NOW + 7 * 60_000, NOW)).toBe("em 7 min");
    expect(shortAddress("0x1111111111111111111111111111111111111111")).toBe("0x1111...1111");
    expect(stanceText("exit_all")).toBe("Sair de tudo");
    expect(stanceText("nada")).toBe("Acao nao reconhecida");
    expect(profileText("alvo_10")).toContain("Alvo de 10%");
    expect(budgetText({ consults: 12, maxConsultsPerDay: 144 })).toBe("12 de 144 consultas ao modelo hoje");
    expect(readinessText("credenciais_okx")).toContain("chaves da OKX");
    expect(MODE_TEXT.limitado.title).toBe("Operando");
  });

  test("the market around the agent is shown as rows", () => {
    expect(contextRows(sampleStatus().context).map((r) => r.label)).toEqual(["BTC em 24 horas", "ETH em 24 horas", "Tendencia do mercado", "Volatilidade do BTC", "Leitura do System One", "Regime do System One", "Idade da leitura do System One"]);
    expect(contextRows(null)).toEqual([]);
  });

  test("the ledger is read in one line each", () => {
    const records = sampleStatus().ledger;
    expect(ledgerLine(records[0]!, NOW)).toContain("Decidiu");
    expect(ledgerLine(records[1]!, NOW)).toContain("Compra de BBB");
  });
});
