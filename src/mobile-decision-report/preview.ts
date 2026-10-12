/** Optional loopback-only preview of the generated synthetic artifact. */
if (import.meta.main) {
  const html = await Bun.file(new URL("../../docs/mobile-decision-report/example.html", import.meta.url)).text();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 4180,
    fetch(request) {
      const url = new URL(request.url);
      if (request.method !== "GET" || url.pathname !== "/") return new Response("Not found", { status: 404 });
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    },
  });
  console.log(`Synthetic report preview: ${server.url}`);
  process.once("SIGINT", () => { server.stop(true); process.exit(0); });
}
export {};
