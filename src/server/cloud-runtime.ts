import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAgentHandler } from "../agent/http";
import { configFile, parseConfig } from "../agent/config";
import { createProcessRunner, type CliRunner } from "../agent/cli";
import { createAgentService } from "../agent/wire";
import { startCore } from "../desktop/core";
import { createEcosystemSource } from "../inonu/source-ecosystem";
import { okxNowMs } from "../okx-clock";
import { createBudget } from "../onchain-read/budget";
import { createOnchainCache } from "../onchain-read/cache";
import { createOnchainClient, okxBudgetIn } from "../onchain-read/client";
import { createOnchainGateway } from "../onchain-read/gateway";
import { createOnchainHandler } from "../onchain-read/http";
import { createProbeOnchainos } from "../onchain-read/probe";
import { createSettingsHandler } from "../settings/http";
import { SECRET_IDS, type SecretId, type SettingsStore } from "../settings/store";
import { createCloudIngress } from "./cloud-ingress";
import { createCloudPolicyRunner } from "./cloud-policy";
import { createCloudStore, type CloudSecrets } from "./cloud-store";
import { cloudSettingsResponse } from "./cloud-settings-response";

export interface CloudRuntimeOptions {
  readonly dataDir: string;
  readonly webDir: string;
  readonly publicOrigin: string;
  readonly gatewayToken: string;
  readonly owner: string;
  readonly port?: number;
  readonly store: SettingsStore;
  readonly fetch?: typeof fetch;
  /** Tests leave the scheduler off and inject all external actions. */
  readonly startAgent?: boolean;
  readonly processRunner?: CliRunner;
}

const SECRET_FILE: Record<SecretId, string> = { typesafeAiApiKey: "model_key", okxWeb3ApiKey: "okx_key", okxWeb3ApiSecret: "okx_secret", okxWeb3ApiPassphrase: "okx_passphrase" };

/** No environment fallback: the proxy and host share this one restricted mount. */
export function loadCloudGatewayToken(secretDir: string): string {
  try {
    const value = readFileSync(join(secretDir, "gateway_token"), "utf8").replace(/\r?\n$/, "");
    if (/^[A-Za-z0-9_-]{48,128}$/.test(value)) return value;
  } catch { /* errors never include a file's contents */ }
  throw new Error("cloud_config_invalid");
}

/** Reads only the four explicit mounts; never falls back to the workstation's environment or vault. */
export function loadCloudStore(secretDir: string): SettingsStore {
  const secrets: Partial<Record<SecretId, string>> = {};
  for (const id of SECRET_IDS) {
    let raw: string;
    try {
      raw = readFileSync(join(secretDir, SECRET_FILE[id]), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new Error("cloud_secret_unreadable");
    }
    // An existing malformed mount is a provisioning error, never silently "absent".
    if (raw.length > 1024) throw new Error("cloud_secret_invalid");
    secrets[id] = raw.replace(/\r?\n$/, "");
  }
  return createCloudStore(secrets as CloudSecrets);
}

/** Persistent agent host; no browser launch, Windows vault or idle shutdown. It is deployed only behind the auth proxy. */
export function startCloudRuntime(options: CloudRuntimeOptions) {
  // Validate the external trust boundary before acquiring a lock or constructing a live service.
  createCloudIngress({ publicOrigin: options.publicOrigin, internalOrigin: "http://127.0.0.1:1", gatewayToken: options.gatewayToken, owner: options.owner, handle: async () => new Response() });
  const now = okxNowMs;
  const fetchImpl = options.fetch ?? fetch;
  const { store, dataDir } = options;
  const gateway = createOnchainGateway({
    client: createOnchainClient({ credentials: () => store.credentials().okx, fetch: fetchImpl, now, budget: okxBudgetIn(dataDir, now) }),
    cache: createOnchainCache(now),
    budget: createBudget({ dir: dataDir, now, caps: () => ({ basic: store.prefs().onchain.capBasic, premium: store.prefs().onchain.capPremium }) }),
    credentialsState: () => store.status().okx.state,
    now,
  });
  const rawRunner: CliRunner = options.processRunner ?? {
    async run(args, opts) {
      const config = parseConfig(configFile(join(dataDir, "agent", "config.json")).read());
      if (config?.cli.path === null || config?.cli.path === undefined) throw new Error("comando_recusado");
      return createProcessRunner({ binary: config.cli.path, home: join(dataDir, "agent", "onchainos-home") }).run(args, opts);
    },
  };
  const policyRunner = createCloudPolicyRunner(rawRunner);
  const agent = createAgentService({ dataDir, store, gateway, source: createEcosystemSource({ gateway, now }), now, fetch: fetchImpl, processRunner: policyRunner, requireOwnerPolicy: true, start: options.startAgent === true });
  let core: ReturnType<typeof startCore> | null = null;
  let server: ReturnType<typeof Bun.serve> | null = null;
  try {
    core = startCore({
      port: 0, webDir: options.webDir, version: "cloud-candidate-1", idleMs: 0,
      handlers: (origin) => ({
        agent: createAgentHandler({ service: agent, origins: [origin] }),
        settings: createSettingsHandler({ store, origins: [origin], probeOnchainos: createProbeOnchainos({ fetch: fetchImpl, now }) }),
        onchain: createOnchainHandler({ gateway, origins: [origin] }),
      }),
    });
    const handle: typeof core.handle = async (request, ip) => {
      const path = new URL(request.url).pathname;
      if (path === "/__health" && request.method === "GET") return Response.json({ ok: true });
      const response = await core!.handle(request, ip);
      return cloudSettingsResponse(request, response);
    };
    const ingress = createCloudIngress({ publicOrigin: options.publicOrigin, internalOrigin: core.origin, gatewayToken: options.gatewayToken, owner: options.owner, handle });
    server = Bun.serve({ hostname: "0.0.0.0", port: options.port ?? 8080, maxRequestBodySize: 16_384, idleTimeout: 255, fetch: ingress });
  } catch {
    server?.stop(true);
    core?.stop();
    void agent.close().catch(() => null);
    throw new Error("cloud_start_failed");
  }
  let closing: Promise<void> | null = null;
  return {
    port: server.port,
    policy: policyRunner.status,
    async close(): Promise<void> {
      if (closing !== null) return closing;
      closing = (async () => {
        server!.stop(true);
        core!.stop();
        // The core retains its lock until work in flight has settled.
        await agent.close();
      })();
      const attempt = closing;
      try { await attempt; } catch (error) {
        // A core timeout keeps its lock and allows retry; the host preserves that contract too.
        if (closing === attempt) closing = null;
        throw error;
      }
    },
  };
}
