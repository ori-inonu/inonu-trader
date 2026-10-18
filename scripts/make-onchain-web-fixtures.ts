/**
 * Contract guard for the web onchain client: runs each new backend normalizer
 * (src/onchain-read/catalog.ts) over its real-shaped fixture (src/onchain-read/fixtures/*.json)
 * and writes web/src/lib/test-fixtures/onchain-normalized.json with one entry per route, the raw
 * normalized output exactly as the web client receives it inside the {ok:true,data} envelope.
 *
 *   bun run scripts/make-onchain-web-fixtures.ts          writes the JSON
 *   bun run scripts/make-onchain-web-fixtures.ts --check  exits 1 when the committed file drifts
 *
 * The committed file is also drift-checked by src/onchain-read/web-fixture-drift.test.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { endpointFor } from "../src/onchain-read/catalog";

/** The new B1 routes, keyed by route path; the fixture file name is the route tail. */
export const GUARDED_ROUTES: readonly string[] = [
  "/onchain/price-info",
  "/onchain/token-risk",
  "/onchain/pools",
  "/onchain/cluster-chains",
  "/onchain/clusters",
  "/onchain/trades",
  "/onchain/news",
  "/onchain/sentiment",
  "/onchain/sentiment-ranking",
  "/onchain/vibe",
  "/onchain/kols",
];

const FIXTURE_DIR = fileURLToPath(new URL("../src/onchain-read/fixtures/", import.meta.url));
export const OUT_PATH = fileURLToPath(new URL("../web/src/lib/test-fixtures/onchain-normalized.json", import.meta.url));

/** Route path -> normalized `data` payload, one entry per guarded route. */
export function generateOnchainNormalized(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const route of GUARDED_ROUTES) {
    const name = route.slice("/onchain/".length);
    const raw = JSON.parse(readFileSync(`${FIXTURE_DIR}${name}.json`, "utf8"));
    const endpoint = endpointFor(route);
    if (!endpoint) throw new Error(`no endpoint for ${route}`);
    const normalized = endpoint.normalize(raw.data);
    if (!normalized.ok) throw new Error(`normalizer rejected fixture ${name}`);
    out[route] = normalized.data;
  }
  return out;
}

export function renderOnchainNormalized(): string {
  return `${JSON.stringify(generateOnchainNormalized(), null, 2)}\n`;
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const rendered = renderOnchainNormalized();
  if (check) {
    let committed = "";
    try {
      committed = readFileSync(OUT_PATH, "utf8");
    } catch {
      committed = "";
    }
    if (committed !== rendered) {
      console.error("web/src/lib/test-fixtures/onchain-normalized.json is stale: run scripts/make-onchain-web-fixtures.ts");
      process.exit(1);
    }
    console.log("onchain-normalized.json ok");
  } else {
    writeFileSync(OUT_PATH, rendered);
    console.log(`wrote ${OUT_PATH}`);
  }
}
