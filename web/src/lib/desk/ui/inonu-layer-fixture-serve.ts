/**
 * Serves the synthetic Inonu layer fixture page (FIXTURE SINTETICO) for screenshot evidence. Not a production artifact: run it
 * by hand and stop it afterwards:
 *
 *   bun --no-env-file web/src/lib/desk/ui/inonu-layer-fixture-serve.ts
 *
 * It prints the URL on stdout. `?answer=` picks the model's answer drawn on top: buy (default, a zone), sell, hold, spot, none.
 */
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const WEB_ROOT = resolve(import.meta.dir, "../../..");
const ENTRY = join(import.meta.dir, "inonu-layer-fixture.ts");
const PORT = Number(Bun.argv.find((a) => a.startsWith("--port="))?.split("=")[1] ?? 3498);

const built = await Bun.build({
  entrypoints: [ENTRY],
  target: "browser",
  format: "esm",
  outdir: join(tmpdir(), "inonu-layer-fixture-build"),
  root: WEB_ROOT,
  naming: { entry: "inonu-layer-fixture.[ext]", chunk: "chunk-[name]-[hash].[ext]", asset: "asset-[name]-[hash].[ext]" },
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
  assets.set(`/assets/${name}`, { bytes: await output.arrayBuffer(), contentType: name.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream" });
}
const scriptPath = [...assets.keys()].find((p) => p.endsWith(".js"));

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FIXTURE SINTETICO - camada do Inonu</title>
<style>
html,body{height:100%;margin:0}*{box-sizing:border-box}
body{background:#05070b;color:#dfe7ee;font-family:"Segoe UI",system-ui,sans-serif;display:grid;grid-template-rows:auto 1fr;gap:8px;padding:8px}
.banner{margin:0;padding:4px 8px;border:1px dashed #d7a545;border-radius:6px;color:#d7a545;font:700 11px/16px Consolas,monospace;letter-spacing:0.08em;text-transform:uppercase;text-align:center}
#stage{min-height:0;background:#0d1622;border:1px solid #1e2c3f;border-radius:6px}
</style></head><body><p class="banner">FIXTURE SINTETICO: dados inventados, so para ver o desenho</p><div id="stage"></div>${scriptPath ? `<script type="module" src="${scriptPath}"></script>` : ""}</body></html>`;

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
