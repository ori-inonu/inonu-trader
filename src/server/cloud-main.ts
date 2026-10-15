import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadCloudGatewayToken, loadCloudStore, startCloudRuntime } from "./cloud-runtime";

const START_CODES = new Set(["cloud_secret_invalid", "cloud_secret_unreadable", "cloud_config_invalid", "cloud_start_failed"]);
export function cloudStartErrorCode(error: unknown): string {
  return error instanceof Error && START_CODES.has(error.message) ? error.message : "cloud_start_failed";
}

if (import.meta.main) {
  try {
    const publicOrigin = process.env.INONU_PUBLIC_ORIGIN ?? "";
    const secretDir = process.env.INONU_SECRET_DIR ?? "/run/secrets";
    const gatewayToken = loadCloudGatewayToken(secretDir);
    const owner = process.env.INONU_OWNER ?? "";
    const store = loadCloudStore(secretDir);
    mkdirSync(process.env.HOME ?? "/var/lib/inonu/home", { recursive: true, mode: 0o700 });
    const runtime = startCloudRuntime({
      dataDir: resolve(process.env.INONU_DATA_DIR ?? "/var/lib/inonu"),
      webDir: resolve(process.env.INONU_WEB_DIR ?? "/app/web/out"),
      publicOrigin, gatewayToken, owner, store,
      startAgent: true,
    });
    console.info("inonu_cloud_started");
    const stop = () => { void runtime.close().then(() => process.exit(0), () => process.exit(1)); };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } catch (error) {
    console.error(cloudStartErrorCode(error));
    process.exit(1);
  }
}
