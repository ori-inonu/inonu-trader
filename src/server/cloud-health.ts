import { loadCloudGatewayToken } from "./cloud-runtime";

/** Local container probe. It exercises the HTTP loop, never queries a wallet or runs the CLI. */
if (import.meta.main) {
  try {
    const origin = new URL(process.env.INONU_PUBLIC_ORIGIN ?? "");
    const response = await fetch("http://127.0.0.1:8080/__health", {
      signal: AbortSignal.timeout(3000),
      headers: {
        host: origin.host,
        "remote-user": process.env.INONU_OWNER ?? "",
        "x-inonu-gateway": loadCloudGatewayToken(process.env.INONU_SECRET_DIR ?? "/run/secrets"),
      },
    });
    process.exit(response.status === 200 && (await response.json() as { ok?: unknown }).ok === true ? 0 : 1);
  } catch { process.exit(1); }
}
