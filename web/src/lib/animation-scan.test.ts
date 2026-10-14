// QLT-3, AC-QLT-1, T10.5: nothing the Inonu work added may blink, pulse or loop. The scan reads the new and changed files, styles
// included, and fails on an animation property, a keyframe rule, an infinite iteration, a word of blinking or pulsing, or a timer
// that exists only to redraw something forever. A single colour transition is allowed (the Rastreador cells change colour once and
// discreetly); a one-shot hover transition is not an animation. The scan is itself tested on a small sample so a pass cannot be a
// scanner that sees nothing. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const WEB_SRC = resolve(import.meta.dir, "..");
const REPO = resolve(import.meta.dir, "../../..");

/** What counts as an animation in a style or a script. Comments are not shown to anyone, so they are removed first. */
const CSS_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["animation property", /(^|[\s;{])animation(-[a-z-]+)?\s*:/],
  ["keyframes rule", /@keyframes/],
  ["infinite iteration", /\binfinite\b/],
];
const CODE_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["animation api", /\.animate\s*\(|\bAnimation\b\s*\(|requestAnimationFrame\s*\([^)]*requestAnimationFrame/],
  ["blink or pulse", /\b(blink|blinking|pulse|pulsing|pulsar|piscar)\b/i],
  ["style animation", /\banimation\s*:|animationName|animationDuration/],
];

export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

export function scan(file: string, text: string): string[] {
  const body = stripComments(text);
  const rules = file.endsWith(".css") ? CSS_RULES : CODE_RULES;
  const hits: string[] = [];
  for (const [name, pattern] of rules) if (pattern.test(body)) hits.push(`${file}: ${name}`);
  return hits;
}

function* files(root: string, extensions: readonly string[]): Generator<string> {
  if (!existsSync(root)) return;
  const info = statSync(root);
  if (info.isFile()) {
    if (extensions.some((e) => root.endsWith(e)) && !/\.test\.tsx?$/.test(root)) yield root;
    return;
  }
  for (const name of readdirSync(root)) yield* files(join(root, name), extensions);
}

describe("the scanner sees what it should", () => {
  test("a style with an animation, a keyframe rule or an infinite loop is caught, and a plain colour transition is not", () => {
    expect(scan("a.css", ".x { animation: spin 1s infinite; }")).toEqual(["a.css: animation property", "a.css: infinite iteration"]);
    expect(scan("a.css", "@keyframes pulse { to { opacity: 0 } }")).toEqual(["a.css: keyframes rule"]);
    expect(scan("a.css", ".x { animation-duration: 2s }")).toEqual(["a.css: animation property"]);
    expect(scan("a.css", ".x { transition: color 120ms ease; }")).toEqual([]);
  });

  test("a script that animates, or says it blinks, is caught; a comment that says so is not", () => {
    expect(scan("a.ts", "el.animate([{opacity: 0}], 100)")).toEqual(["a.ts: animation api"]);
    expect(scan("a.tsx", "const cls = 'blink';")).toEqual(["a.tsx: blink or pulse"]);
    expect(scan("a.ts", "// nothing here blinks or pulses\nconst a = 1;")).toEqual([]);
    expect(scan("a.ts", "/* blink */ const a = 1;")).toEqual([]);
    expect(scan("a.css", "/* animation: none was removed */ .x { color: red }")).toEqual([]);
  });
});

describe("what the Inonu work added", () => {
  const WEB_ROOTS = [
    "components/Rastreador", "components/Doctor", "components/Desk/InonuAsk.tsx", "components/Desk/InonuAsk.module.css", "components/Desk/InonuSignalStrip.tsx",
    "components/Desk/InonuSignalStrip.module.css", "components/Desk/AssetIcon.tsx", "components/Desk/AssetIcon.module.css", "components/Desk/Dock/DockInonu.tsx",
    "lib/inonu", "lib/rastreador", "lib/doctor", "lib/desk/chart/inonu-layer.ts", "app/rastreador", "app/doctor", "app/configuracoes",
    // the dock, the top bar and the desk shell, styles included (the independent review found them outside this scan)
    "components/Desk/Dock/DockComposite.module.css", "components/Desk/Dock/DockPanel.module.css", "components/Desk/Dock/DockInonu.module.css", "components/Desk/Dock/InonuLedgerTail.tsx", "components/Desk/Dock/WalletChainSwitch.tsx", "components/Desk/Dock/WalletChainSwitch.module.css", "components/Desk/Dock/TicketPanel.tsx", "components/Desk/Dock/TicketPanel.module.css", "lib/wallet", "components/Desk/Dock/DockWalletTab.tsx", "components/Desk/Dock/MarketCard.tsx", "components/Desk/Dock/MemepumpTab.tsx", "components/Desk/Dock/MemepumpTab.module.css", "lib/onchain/memepump.ts", "components/Desk/Dock/MarketCard.module.css", "components/Desk/Dock/InonuPreRead.tsx", "components/Desk/Dock/InonuPreRead.module.css", "lib/desk/market-read.ts", "lib/desk/thermometer.ts", "components/Desk/TopbarDiscovery.tsx", "components/Desk/TopbarAlerts.tsx", "components/Desk/TopbarAlerts.module.css",
    "components/Desk/DeskRail.tsx", "components/Desk/MesaView.tsx", "components/Desk/Dock/DockComposite.tsx", "components/Desk/Dock/DockPanel.tsx",
    // the top bar styles and the legend of the chart (the quote and the reading of the moment)
    "components/Desk/DeskRail.module.css", "components/Desk/TopbarPopover.module.css", "components/Desk/TopbarTools.module.css", "components/Desk/panels/ChartLegend.tsx", "components/Desk/panels/ChartLegend.module.css", "lib/desk/useThermometerModel.ts",
    // the radar behind the opportunity engine, the multi-network board and their models
    "components/Desk/Dock/EngineRadar.tsx", "components/Desk/Dock/EngineRadar.module.css", "components/Desk/Dock/EcosystemTab.tsx", "components/Desk/Dock/EcosystemTab.module.css", "components/Desk/Dock/JevPicks.tsx", "components/Desk/Dock/JevPicks.module.css", "components/Desk/Dock/OrderPanel.tsx", "components/Desk/Dock/OrderPanel.module.css", "components/Settings/TradeSettings.tsx", "lib/opportunity", "lib/onchain/opportunities.ts", "lib/onchain/ecosystem-scan.ts",
    "lib/mesa/dock.ts", "lib/mesa/dock-subviews.ts", "lib/mesa/dock-layout.ts", "lib/mesa/flow-tab-model.ts", "lib/mesa/view-source.ts", "lib/mesa/clock.ts",
  ];
  const CORE_ROOTS = ["src/intel", "src/inonu", "src/desktop", "src/opportunity"];

  test("no style or script of the new screens blinks, pulses or loops", () => {
    const hits: string[] = [];
    let scanned = 0;
    for (const root of WEB_ROOTS) {
      for (const file of files(join(WEB_SRC, root), [".ts", ".tsx", ".css"])) {
        scanned += 1;
        hits.push(...scan(relative(WEB_SRC, file), readFileSync(file, "utf8")));
      }
    }
    expect(scanned).toBeGreaterThan(45);
    expect(hits).toEqual([]);
  });

  test("the engine and the core have no timer that exists to redraw or to blink anything", () => {
    const hits: string[] = [];
    let scanned = 0;
    for (const root of CORE_ROOTS) {
      for (const file of files(join(REPO, root), [".ts"])) {
        scanned += 1;
        hits.push(...scan(relative(REPO, file), readFileSync(file, "utf8")).filter((h) => !h.endsWith("blink or pulse")));
      }
    }
    expect(scanned).toBeGreaterThan(40);
    expect(hits).toEqual([]);
  });

  test("the chart layer and the signal strip use no timer of their own for drawing", () => {
    for (const path of ["lib/desk/chart/inonu-layer.ts", "components/Desk/InonuSignalStrip.tsx"]) {
      const body = stripComments(readFileSync(join(WEB_SRC, path), "utf8"));
      expect(body).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
    }
  });
});
