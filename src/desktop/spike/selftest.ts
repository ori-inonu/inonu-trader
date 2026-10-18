// T1.2 spike (ADR-1, ADR-2): a `bun build --compile` exe on Windows must (a) serve static files and JSON on loopback,
// (b) read and write the Windows Credential Manager through Bun.secrets, (c) locate its files from process.execPath
// (inside the exe import.meta.dir is the virtual B:\~BUN\root, so nothing may be anchored on it).
//
// build: bun build --compile --target=bun-windows-x64 src/desktop/spike/selftest.ts --outfile <dir>/inonu-spike.exe
// run:   <dir>/inonu-spike.exe --selftest   (a "web" folder next to the exe, or INONU_WEB_DIR)
import { dirname, join } from "node:path";

const SERVICE = "InonuTrader-spike";
const NAME = "probe";
const VALUE = `spike-${crypto.randomUUID()}`; // a throwaway test value, never a real credential

const exeDir = dirname(process.execPath);
const webDir = process.env.INONU_WEB_DIR ?? join(exeDir, "web");

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") return Response.json({ ok: true });
    const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    if (relative.includes("..")) return new Response("bad request", { status: 400 });
    const file = Bun.file(join(webDir, relative));
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});

async function secretsRoundtrip() {
  const result = { set: false, readBack: false, deleted: false, afterDelete: "unexpected" as string | null };
  try {
    await Bun.secrets.set({ service: SERVICE, name: NAME, value: VALUE });
    result.set = true;
    result.readBack = (await Bun.secrets.get({ service: SERVICE, name: NAME })) === VALUE;
  } finally {
    result.deleted = await Bun.secrets.delete({ service: SERVICE, name: NAME });
    result.afterDelete = await Bun.secrets.get({ service: SERVICE, name: NAME });
  }
  return result;
}

const base = `http://127.0.0.1:${server.port}`;
const health = await (await fetch(`${base}/health`)).json().catch(() => null);
const index = await fetch(`${base}/`);
const missing = await fetch(`${base}/nope.js`);
const traversal = await fetch(`${base}/..%2f..%2fsecret.txt`);
const secrets = await secretsRoundtrip().catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));

const report = {
  importMetaDir: import.meta.dir,
  execPath: process.execPath,
  cwd: process.cwd(),
  webDir,
  port: server.port,
  health,
  index: { status: index.status, bytes: (await index.text()).length },
  missing: missing.status,
  traversal: traversal.status,
  secrets,
};
server.stop(true);
console.log(JSON.stringify(report, null, 1));
const ok = (health as { ok?: boolean } | null)?.ok === true && index.status === 200 && missing.status === 404 && traversal.status === 400
  && "readBack" in secrets && secrets.readBack === true && secrets.deleted === true && secrets.afterDelete === null;
process.exit(ok ? 0 : 1);
