import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cloudContentPolicy, secureCloudResponse } from "./cloud-content-policy";

const hash = (script: string) => `'sha256-${createHash("sha256").update(script).digest("base64")}'`;

test("production policy permits the exact static bootstrap scripts without allowing arbitrary inline code or eval", () => {
  const script = 'self.__next_f.push([1,"ação < & >"]);';
  const policy = cloudContentPolicy(`<html><script>${script}</script><script>${script}</script><script src="/_next/static/app.js"></script></html>`);
  const scriptDirective = policy.split(";").find((p) => p.trim().startsWith("script-src "))!;
  expect(scriptDirective).toContain(hash(script));
  expect(scriptDirective.split(hash(script))).toHaveLength(2);
  expect(scriptDirective).not.toContain("unsafe-inline");
  expect(scriptDirective).not.toContain("unsafe-eval");
  expect(scriptDirective).not.toContain(hash(""));
  expect(policy).toContain("connect-src 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("img-src 'self' data:");
  expect(policy.split(";").find((p) => p.trim().startsWith("img-src "))).not.toContain("https:");
});

test("compressed HTML is refused before hashing rather than forwarded with an incompatible encoding", async () => {
  const source = new Response(Bun.gzipSync(new TextEncoder().encode("<html>synthetic</html>")), { headers: { "content-type": "text/html", "content-encoding": "gzip" } });
  const secured = await secureCloudResponse(source);
  expect(secured.status).toBe(502);
  expect(secured.headers.has("content-encoding")).toBe(false);
  expect(await secured.json()).toEqual({ ok: false, code: "cloud_html_encoding_unsupported" });
});

test("script text follows browser line ending normalization and a module bootstrap is also covered", () => {
  const policy = cloudContentPolicy('<script type="module">console.log("a");\r\nconsole.log("b");\r</script>');
  expect(policy).toContain(hash('console.log("a");\nconsole.log("b");\n'));
});

test("inert JSON, comments and HTML-looking text do not grant extra script capabilities", () => {
  const json = '{"html":"<script>evil()</script>"}';
  const policy = cloudContentPolicy(`<!-- <script>evil()</script> --><script type="application/json">${json}</script><button onclick="evil()">test</button>`);
  expect(policy).not.toContain(hash("evil()"));
  expect(policy).not.toContain(hash(json));
});

test("response protection preserves HTML and status while adding browser constraints; a stream is not consumed", async () => {
  const html = '<html><script>self.__next_f=[];</script></html>';
  const secured = await secureCloudResponse(new Response(html, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }));
  expect(secured.status).toBe(404);
  expect(await secured.text()).toBe(html);
  expect(secured.headers.get("content-security-policy")).toContain(hash("self.__next_f=[];"));
  expect(secured.headers.get("permissions-policy")).toContain("camera=()");
  let pulled = false;
  const stream = new ReadableStream({ pull(controller) { pulled = true; controller.enqueue(new TextEncoder().encode("data: {}\n\n")); controller.close(); } });
  const source = new Response(stream, { headers: { "content-type": "text/event-stream" } });
  const wrapped = await secureCloudResponse(source);
  expect(source.bodyUsed).toBe(false);
  expect(wrapped.headers.get("content-security-policy")).toContain("default-src 'none'");
  expect(await wrapped.text()).toBe("data: {}\n\n");
  expect(pulled).toBe(true);
});
