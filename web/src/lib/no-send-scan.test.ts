// WAL-6, WAL-8, AC-WAL-4, T9.6: the app never signs, never sends a transaction and never uses the packages that do. The scan reads the
// files of this delivery (the core, the engine, the Inonu and the Rastreador screens, the chart layer, the Doctor) and fails on a
// method that sends or signs, on an import of a package that executes, and on a call to the Agentic Wallet, the DEX widget or x402. The
// wallet extension code of the older desk (`okx-wallet`, `real`) is not in scope: it predates this delivery and is not touched by it.
// The scanner is itself tested so a pass cannot be a scanner that sees nothing. origin: synthetic_fixture, tests only.
import { describe, expect, setDefaultTimeout, test } from "bun:test";

// every scan reads a few hundred files with the TypeScript parser: a few seconds each, and the default five are too few
setDefaultTimeout(90_000);
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const WEB_SRC = resolve(import.meta.dir, "..");
const REPO = resolve(import.meta.dir, "../../..");

const RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["a method that sends or signs", /\b(eth_sendTransaction|eth_sendRawTransaction|eth_signTransaction|eth_sign|personal_sign|eth_signTypedData\w*|sendTransaction|sendRawTransaction|signTransaction|signAllTransactions|signAndSendTransaction|signMessage|wallet_sendCalls|broadcast-transaction|broadcastTransaction|broadcast_transaction|broadcastTx|sendUserOperation|eth_sendUserOperation|sendSignedTransaction|sendAndConfirmTransaction|signAndExecuteTransaction|send_transaction|wallet_sendTransaction|eth_sendBundle|signTypedData\w*|eth_signTypedData\w*|eth_sendPrivateTransaction|sendPrivateTransaction|sendTransactions|signTransactions|signAndSendAllTransactions|signAndExecuteTransactionBlock|signTransactionBlock|solana_signAndSendTransaction|wallet_sendCalls)\b/],
  ["a package that executes", /["'](@okx-dex\/okx-dex-sdk|@okxweb3\/dex-widget|@okxweb3\/x402[\w-]*|@okx-dex\/[\w-]+|ethers|viem|web3|wagmi|@solana\/web3\.js)["'/]/],
  ["the agentic wallet or x402", /\b(agentic[-_ ]?wallet|x402|run-your-first-dapp)\b/i],
  ["a private key", /\b(PRIVATE_KEY|privateKey|mnemonic|seedPhrase)\b/],
  // WAL-6: the ticket only SHOWS quotes. The routes that return calldata or the instructions to be signed are not asked for until the owner authorizes a cycle of their own (D4-16)
  ["a route that returns what is needed to sign", /aggregator\/(?:swap|approve-transaction)\b|swap-instruction/],
  // T3.7, API-7: the paid WebSocket of the OnchainOS stays specified and OFF until the owner has a paid plan: nothing may open it
  ["the paid websocket of the OnchainOS", /wsdex\.okx\.com/i],
];

/**
 * The CODE of a file, without its comments: it is read with the TypeScript parser itself, so a string, a template, a regular expression and a comment are told apart the way the compiler tells them apart (a "/*" in a
 * string, or a "//" in a regular expression, hides nothing). Every token of the code is kept as written, strings with their quotes, and joined by a space; the comments (and the documentation comments) are not
 * tokens. Two strings added together ("eth_send" + "Transaction") are put together again, so the name they spell is seen.
 */
export function stripComments(text: string): string {
  const source = ts.createSourceFile("scanned.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tokens: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJSDoc(node)) return;
    const children = node.getChildren(source);
    if (children.length === 0) {
      if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
      // a string is read by its VALUE (an escape is decoded), put back between quotes: "eth_\u0073end" is "eth_send" to the program, and must be to the scan
      const isText = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
      tokens.push(isText ? JSON.stringify((node as ts.LiteralLikeNode).text) : text.slice(node.getStart(source), node.end));
      return;
    }
    for (const child of children) visit(child);
  };
  visit(source);
  let code = tokens.join(" ");
  // "a" + "b" is "ab"
  const joined = /(["'])([^"'\\\n]*)\1(?: \+)? (["'])([^"'\\\n]*)\3/;
  for (let i = 0; i < 20 && joined.test(code); i += 1) code = code.replace(joined, (_m, q: string, left: string, _q2: string, right: string) => q + left + right + q);
  return code;
}

/**
 * The files that are ALLOWED to name something a rule forbids, each with the rules it is allowed to break and why (WAL-10, authorized by the person on 2026-10-13: the app carries out a confirmed order through
 * the person's own wallet). The list is the whole exception: a new file that sends or signs is a failure of this scan until it is named here, reviewed, and has its own test. The server side stays free of every
 * method that sends, and has one file that hands the browser the transaction to sign.
 */
export const AUDITED: Readonly<Record<string, readonly string[]>> = {
  "src/onchain-read/routes/trade.ts": ["a route that returns what is needed to sign"],
  // the only file of the app that asks the person's wallet to send: it takes nothing the gate did not clear (lib/wallet/send/gate.ts) and only the order panel imports it
  "lib/wallet/send/send.ts": ["a method that sends or signs"],
};

export function scan(file: string, text: string, allowed: readonly string[] = AUDITED[file.replaceAll("\\", "/")] ?? []): string[] {
  const body = stripComments(text);
  return RULES.filter(([name, pattern]) => !allowed.includes(name) && pattern.test(body)).map(([name]) => `${file}: ${name}`);
}

function* files(root: string): Generator<string> {
  if (!existsSync(root)) return;
  const info = statSync(root);
  if (info.isFile()) {
    if (/\.(ts|tsx)$/.test(root) && !/\.test\.tsx?$/.test(root)) yield root;
    return;
  }
  for (const name of readdirSync(root)) yield* files(join(root, name));
}

describe("the scanner sees what it should", () => {
  test("a method that sends, a package that executes, the agentic wallet and a private key are each caught", () => {
    expect(scan("a.ts", `provider.request({ method: "eth_sendTransaction" })`)).toEqual(["a.ts: a method that sends or signs"]);
    expect(scan("a.ts", `import { x } from "@okx-dex/okx-dex-sdk";`)).toEqual(["a.ts: a package that executes"]);
    expect(scan("a.ts", `import { createWalletClient } from "viem";`)).toEqual(["a.ts: a package that executes"]);
    expect(scan("a.ts", "const a = 'Agentic Wallet';")).toEqual(["a.ts: the agentic wallet or x402"]);
    expect(scan("a.ts", "const k = process.env.PRIVATE_KEY;")).toEqual(["a.ts: a private key"]);
    expect(scan("a.ts", 'new WebSocket("wss://wsdex.okx.com/ws/v6/dex")')).toEqual(["a.ts: the paid websocket of the OnchainOS"]);
    expect(scan("a.ts", "// wss://wsdex.okx.com stays off\nconst a = 1;")).toEqual([]);
    expect(scan("a.ts", 'provider.request({ url: "/api/v6/dex/pre-transaction/broadcast-transaction" })')).toEqual(["a.ts: a method that sends or signs"]);
    for (const spelling of ["broadcast_transaction(tx)", "client.broadcastTx(raw)", "bundler.sendUserOperation(op)", 'request({ method: "eth_sendUserOperation" })']) {
      expect(scan("a.ts", spelling)).toEqual(["a.ts: a method that sends or signs"]);
    }
    expect(scan("a.ts", 'get("/api/v6/dex/aggregator/swap", params)')).toEqual(["a.ts: a route that returns what is needed to sign"]);
    expect(scan("a.ts", 'get("/api/v6/dex/aggregator/approve-transaction", params)')).toEqual(["a.ts: a route that returns what is needed to sign"]);
    // the read-only quote is not that
    expect(scan("a.ts", 'get("/api/v6/dex/aggregator/quote", params)')).toEqual([]);
    // the other spellings of the same things, and the sub paths of the packages that execute
    for (const spelling of ["await sendSignedTransaction(raw)", "conn.sendAndConfirmTransaction(tx)", "client.signAndExecuteTransaction(tx)", "send_transaction(tx)", 'request({ method: "wallet_sendTransaction" })', 'request({ method: "eth_sendBundle" })', "wallet.signTypedData(domain)"]) {
      expect(scan("a.ts", spelling)).toEqual(["a.ts: a method that sends or signs"]);
    }
    for (const pkg of ['import { a } from "viem/accounts";', 'import { b } from "ethers/lib/utils";', 'import { c } from "wagmi";']) expect(scan("a.ts", pkg)).toEqual(["a.ts: a package that executes"]);
    expect(scan("a.ts", 'const h = "WSDEX.OKX.COM";')).toEqual(["a.ts: the paid websocket of the OnchainOS"]);
  });

  test("a regular expression that looks like a comment, and a name spelled by adding strings, hide nothing", () => {
    expect(scan("a.ts", 'const r = /\\//; provider.request({ method: "eth_sendTransaction" });')).toEqual(["a.ts: a method that sends or signs"]);
    expect(scan("a.ts", 'const r = /[/*]/; provider.request({ method: "eth_sendTransaction" }); const q = /[*/]/;')).toEqual(["a.ts: a method that sends or signs"]);
    expect(scan("a.ts", 'provider.request({ method: "eth_send" + "Transaction" });')).toEqual(["a.ts: a method that sends or signs"]);
    // an escape is the same name to the program: "eth_\u0073endTransaction", and a template that holds a string
    expect(scan("a.ts", 'provider.request({ method: "eth_\\u0073endTransaction" });')).toEqual(["a.ts: a method that sends or signs"]);
    expect(scan("a.ts", 'provider.request({ method: `eth_send${"Transaction"}` });')).toEqual(["a.ts: a method that sends or signs"]);
    // and the guard on the two old files that only quote a method sees a call however it is spaced
    expect(/\.\s*request\s*\(/.test(stripComments("x.request(1)"))).toBe(true);
    expect(/\.\s*request\s*\(/.test(stripComments("x\n  .request (1)"))).toBe(true);
    expect(scan("a.ts", "/** documentation: eth_sendTransaction is never called here */\nexport const a = 1;")).toEqual([]);
    expect(scan("a.ts", "export const a = 1; // eth_sendTransaction\nexport const b = 2;")).toEqual([]);
  });

  test("a comment mark inside a string does not hide the code after it, and a real comment still does", () => {
    const hole = 'const a = "/*"; provider.request({ method: "eth_sendTransaction" }); const b = "*/";';
    expect(scan("a.ts", hole)).toEqual(["a.ts: a method that sends or signs"]);
    expect(scan("a.ts", 'const url = "http://x/y"; provider.request({ method: "eth_sendTransaction" });')).toEqual(["a.ts: a method that sends or signs"]);
    expect(scan("a.ts", "const a = `1 // not a comment`; provider.signAndSendAllTransactions(txs);")).toEqual(["a.ts: a method that sends or signs"]);
    expect(scan("a.ts", "/* eth_sendTransaction */ const a = 1; // personal_sign\nconst b = 2;")).toEqual([]);
    for (const spelling of ["signAndExecuteTransactionBlock(tx)", "w.sendTransactions(list)", 'request({ method: "eth_sendPrivateTransaction" })', "solana.signTransactions(list)"]) {
      expect(scan("a.ts", spelling)).toEqual(["a.ts: a method that sends or signs"]);
    }
  });

  test("words in a comment are not code, and a plain read of a wallet is not a send", () => {
    expect(scan("a.ts", "// we never call eth_sendTransaction here\nconst a = 1;")).toEqual([]);
    expect(scan("a.ts", "/* signAndSendTransaction is out of scope */ const a = 1;")).toEqual([]);
    expect(scan("a.ts", `provider.request({ method: "eth_accounts" })`)).toEqual([]);
  });
});

describe("what this delivery added", () => {
  const WEB_ROOTS = [
    "components/Rastreador", "components/Doctor", "components/Desk/InonuAsk.tsx", "components/Desk/InonuSignalStrip.tsx", "components/Desk/AssetIcon.tsx", "components/Desk/Dock/DockInonu.tsx",
    "lib/inonu", "lib/rastreador", "lib/doctor", "lib/desk/chart/inonu-layer.ts", "lib/wallet",
    // the dock, the top bar and the desk shell (the independent review found them outside this scan)
    "components/Desk/Dock/DockComposite.tsx", "components/Desk/Dock/DockPanel.tsx", "components/Desk/Dock/InonuLedgerTail.tsx", "components/Desk/Dock/WalletChainSwitch.tsx", "components/Desk/Dock/TicketPanel.tsx", "components/Desk/Dock/DockWalletTab.tsx",
    // what the ticket and the on-chain tabs import and run (the review found them outside this scan)
    "lib/onchain/client.ts", "lib/mesa/onchain-rows.ts", "lib/evm-multichain.ts", "components/Desk/Dock/OnchainTabs.tsx", "components/Desk/TopbarDiscovery.tsx", "components/Desk/TopbarAlerts.tsx", "components/Desk/DeskRail.tsx", "components/Desk/MesaView.tsx", "components/Desk/panels/ChartLegend.tsx", "lib/desk/useThermometerModel.ts", "components/Desk/Dock/EngineRadar.tsx", "components/Desk/Dock/EcosystemTab.tsx", "components/Desk/Dock/JevPicks.tsx", "components/Desk/Dock/OrderPanel.tsx", "components/Settings/TradeSettings.tsx", "lib/opportunity", "lib/onchain/opportunities.ts", "lib/onchain/ecosystem-scan.ts",
    // the Solana side of the wallet (connect by click, read through the gateway, consult): it may connect and listen, and nothing more
    "lib/useSolanaAccount.ts", "lib/okx-solana.ts", "components/Desk/Dock/HoldingsPanel.tsx", "components/Desk/Dock/PortfolioConsultation.tsx",
    "lib/mesa/dock.ts", "lib/mesa/dock-subviews.ts", "lib/mesa/dock-layout.ts", "lib/mesa/flow-tab-model.ts", "lib/mesa/view-source.ts", "lib/mesa/clock.ts", "lib/mesa/panels-registry.ts",
  ];
  const CORE_ROOTS = ["src/desktop", "src/intel", "src/inonu", "src/onchain-read", "src/opportunity"];

  test("no screen of the Inonu work can sign or send, and none imports a package that does", () => {
    const hits: string[] = [];
    let scanned = 0;
    for (const root of WEB_ROOTS) {
      for (const file of files(join(WEB_SRC, root))) {
        scanned += 1;
        hits.push(...scan(relative(WEB_SRC, file), readFileSync(file, "utf8")));
      }
    }
    // the floor is near what is really covered, so a root that is renamed and silently skipped is noticed
    expect(scanned).toBeGreaterThan(60);
    expect(hits).toEqual([]);
  });

  test("the core and the engine have no way to sign or send either (the server never broadcasts, WAL-8)", () => {
    const hits: string[] = [];
    let scanned = 0;
    for (const root of CORE_ROOTS) {
      for (const file of files(join(REPO, root))) {
        scanned += 1;
        hits.push(...scan(relative(REPO, file), readFileSync(file, "utf8")));
      }
    }
    expect(scanned).toBeGreaterThan(40);
    expect(hits).toEqual([]);
  });

  test("the one file that asks the wallet to send is named, really does, and only the order panel imports it (WAL-10)", () => {
    const sendFile = join(WEB_SRC, "lib/wallet/send/send.ts");
    expect(existsSync(sendFile)).toBe(true);
    // without the exception it is caught: the exception is what lets it pass, not a scanner that sees nothing
    expect(scan("lib/wallet/send/send.ts", readFileSync(sendFile, "utf8"), [])).toEqual(["lib/wallet/send/send.ts: a method that sends or signs"]);
    // and it breaks no other rule: no package that executes, no key, no agentic wallet, no route that returns calldata
    expect(scan("lib/wallet/send/send.ts", readFileSync(sendFile, "utf8"))).toEqual([]);
    const importers: string[] = [];
    for (const file of files(WEB_SRC)) {
      if (file === sendFile) continue;
      if (/(?:from|import\s*\(|require\s*\()\s*["'][^"']*(?:\/send\/send|\.\/send)(?:\.tsx?)?["']/.test(readFileSync(file, "utf8"))) importers.push(relative(WEB_SRC, file).replaceAll("\\", "/"));
    }
    expect(importers).toEqual(["components/Desk/Dock/OrderPanel.tsx"]);
    // the server side has one file that hands the transaction over, and none that sends
    const route = join(REPO, "src/onchain-read/routes/trade.ts");
    expect(scan("src/onchain-read/routes/trade.ts", readFileSync(route, "utf8"), [])).toEqual(["src/onchain-read/routes/trade.ts: a route that returns what is needed to sign"]);
  });

  test("the one send file names exactly ONE sending method, and the whole app has no other file that names one (WAL-10)", () => {
    const sendFile = join(WEB_SRC, "lib/wallet/send/send.ts");
    const methodRule = RULES[0]![1];
    const body = stripComments(readFileSync(sendFile, "utf8"));
    const named = new Set([...body.matchAll(new RegExp(methodRule.source, "g"))].map((m) => m[0]));
    // the one method it is allowed: the exception frees a RULE, and this is what keeps it from freeing a second method of the same rule
    expect([...named]).toEqual(["eth_sendTransaction"]);
    // every other source of the app, the older desk included: older files that only quote a method (a catalog of the provider's pages, a helper that builds a name to look for it) are named here and why
    const QUOTES_ONLY: readonly string[] = ["lib/central/ecosystem-catalog.ts", "lib/central/scan-helpers.ts"];
    // listed is not enough: they must not CALL a wallet at all (no `.request(`), so that what they quote can only ever be text
    for (const rel of QUOTES_ONLY) expect(/\.\s*request\s*\(/.test(stripComments(readFileSync(join(WEB_SRC, rel), "utf8")))).toBe(false);
    const hits: string[] = [];
    let scanned = 0;
    for (const file of files(WEB_SRC)) {
      scanned += 1;
      const rel = relative(WEB_SRC, file).replaceAll("\\", "/");
      if (rel === "lib/wallet/send/send.ts" || QUOTES_ONLY.includes(rel)) continue;
      if (methodRule.test(stripComments(readFileSync(file, "utf8")))) hits.push(rel);
    }
    expect(scanned).toBeGreaterThan(250);
    expect(hits).toEqual([]);
    // reading every file of the app with the parser takes a few seconds: that is the price of not trusting a pattern to find a comment
  }, 90_000);

  test("the vault code that reads the model key and the OnchainOS credential is allowed to name a key, and only those", () => {
    const vault = readFileSync(join(REPO, "src/desktop/vault.ts"), "utf8");
    expect(scan("vault.ts", vault)).toEqual([]);
  });
});
