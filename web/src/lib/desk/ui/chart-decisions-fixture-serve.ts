/**
 * Serves the synthetic decision-marker fixture page (FIXTURE SINTETICO) for screenshot evidence.
 * Not a production artifact: run it by hand and stop it afterwards:
 *
 *   bun --no-env-file web/src/lib/desk/ui/chart-decisions-fixture-serve.ts
 *
 * It prints the URL on stdout. The page mounts the real JevStage + PriceChart over fabricated
 * candles and fabricated Jev reads, all defined in chart-decisions-fixture.tsx.
 */

import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const WEB_ROOT = resolve(import.meta.dir, "../../..");
const ENTRY = join(import.meta.dir, "chart-decisions-fixture.tsx");
// The port comes from argv, never from the environment (scan C-A10 allows NEXT_PUBLIC_* only).
const PORT = Number(Bun.argv.find((a) => a.startsWith("--port="))?.split("=")[1] ?? 3499);

const built = await Bun.build({
  entrypoints: [ENTRY],
  target: "browser",
  format: "esm",
  outdir: join(tmpdir(), "jev-chart-fixture-build"),
  root: WEB_ROOT,
  naming: { entry: "chart-decisions-fixture.[ext]", chunk: "chunk-[name]-[hash].[ext]", asset: "asset-[name]-[hash].[ext]" },
  sourcemap: "none",
  minify: false,
});

if (!built.success) {
  console.error("fixture bundle failed");
  for (const log of built.logs) console.error(log.message);
  process.exit(1);
}

const assets = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
for (const output of built.outputs) {
  const name = basename(output.path);
  const contentType = name.endsWith(".js")
    ? "text/javascript; charset=utf-8"
    : name.endsWith(".css")
      ? "text/css; charset=utf-8"
      : "application/octet-stream";
  assets.set(`/assets/${name}`, { bytes: await output.arrayBuffer(), contentType });
}

const scriptPath = [...assets.keys()].find((p) => p.endsWith(".js"));
const cssPath = [...assets.keys()].find((p) => p.endsWith(".css"));

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${cssPath ? `<link rel="stylesheet" href="${cssPath}">` : ""}<title>FIXTURE SINTETICO - grafico de decisoes</title>
<style>
:root{--font-sans:"Segoe UI",system-ui,sans-serif;--font-mono:Consolas,"Cascadia Mono",monospace}
html,body,#root{height:100%;margin:0}*{box-sizing:border-box}
body{background:#05070b;color:#dfe7ee;font-family:var(--font-sans)}
.fx-root{display:grid;height:100%;grid-template-rows:auto 96px auto minmax(0,1fr) auto;gap:10px;padding:10px 14px}
.fx-banner{margin:0;padding:6px 10px;border:1px dashed #d7a545;border-radius:6px;color:#d7a545;font:700 11px/16px var(--font-mono);letter-spacing:0.08em;text-transform:uppercase;text-align:center}
.fx-strip{min-height:0}
.fx-indicators{min-height:0}
.fx-chart{min-height:0;border:0}
.fx-legend{margin:0;color:#8a97a5;font:400 10.5px/15px var(--font-mono);text-align:center}
</style></head><body><div id="root"></div>${scriptPath ? `<script type="module" src="${scriptPath}"></script>` : ""}</body></html>`;

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/" || pathname === "/index.html") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (pathname === "/favicon.ico") return new Response(null, { status: 204 });
    const asset = assets.get(pathname);
    return asset ? new Response(asset.bytes, { headers: { "content-type": asset.contentType } }) : new Response("not found", { status: 404 });
  },
});

console.log(`fixture on http://127.0.0.1:${server.port}/`);
