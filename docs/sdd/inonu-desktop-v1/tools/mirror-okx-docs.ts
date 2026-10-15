// Mirrors the public OnchainOS developer docs (pt-br) as plain text so a human or an agent can grep them.
// The mirror is NOT versioned (the docs are OKX's); onchainos-coverage.json stores a SHA-256 per page so drift is detectable.
//
// usage: bun --no-env-file run docs/sdd/inonu-desktop-v1/tools/mirror-okx-docs.ts --out <empty dir outside the repo>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE = "https://web3.okx.com/pt-br/onchainos/dev-docs/";
const MAX_PAGES = 800;
const CONCURRENCY = 4;

const SEEDS = [
  "home/what-is-onchainos", "wallet/product-and-service", "trade/dex-api-introduction",
  "market/market-api-introduction", "payments/overview", "okxai/what-is-okxai",
  "xlayer/developer/build-on-xlayer/about-xlayer", "home/supported-chain",
  "home/api-access-and-usage", "home/developer-portal", "home/agentic-wallet-overview",
  "home/skills-mcp-services", "home/install-your-agentic-wallet", "home/run-your-first-ai-agent",
  "home/run-your-first-dapp",
];

function argOut(): string {
  const i = process.argv.indexOf("--out");
  const out = i >= 0 ? process.argv[i + 1] : undefined;
  if (!out) throw new Error("missing --out <dir>");
  return out;
}

/** Page text: the main/article block, tags stripped, tables flattened with " | ". */
export function toText(html: string): string {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const main = h.match(/<main[\s\S]*?<\/main>/i) ?? h.match(/<article[\s\S]*?<\/article>/i);
  if (main) h = main[0];
  return h
    .replace(/<\/(p|div|li|tr|h[1-6]|pre|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(td|th)[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Entry = { title: string; chars: number; status: number };

async function main() {
  const out = argOut();
  const seen = new Set<string>();
  const queue = [...SEEDS];
  const index: Record<string, Entry> = {};

  async function one(path: string) {
    if (seen.has(path)) return;
    seen.add(path);
    try {
      const res = await fetch(BASE + path, { headers: { "user-agent": "Mozilla/5.0" } });
      const html = await res.text();
      const link = /href="\/pt-br\/onchainos\/dev-docs\/([^"#?]+)"/g;
      for (let m = link.exec(html); m; m = link.exec(html)) {
        const next = m[1]!;
        if (!seen.has(next) && !queue.includes(next)) queue.push(next);
      }
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      const text = toText(html);
      const file = join(out, `${path}.txt`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `# ${title}\n# ${BASE + path}\n\n${text}\n`);
      index[path] = { title, chars: text.length, status: res.status };
    } catch {
      index[path] = { title: "", chars: 0, status: -1 };
    }
  }

  while (queue.length && seen.size < MAX_PAGES) {
    await Promise.all(queue.splice(0, CONCURRENCY).map(one));
  }
  writeFileSync(join(out, "_index.json"), JSON.stringify(index, null, 1));
  const failed = Object.values(index).filter((e) => e.status !== 200).length;
  console.log(`pages ${Object.keys(index).length} failed ${failed}`);
}

if (import.meta.main) await main();
