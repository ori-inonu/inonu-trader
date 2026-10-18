import { startCore, type Core } from "../desktop/core";
import { createDesktopHandlers, type DesktopHandlers } from "../desktop/handlers";
import type { SettingsStore } from "../settings/store";

export interface LocalServiceOptions {
  readonly dataDir: string;
  readonly webDir: string;
  readonly version: string;
  readonly store: SettingsStore;
  readonly port?: number;
  readonly selftest?: boolean;
  readonly pulse?: boolean;
  readonly fetch?: typeof fetch;
  readonly doctor?: () => Promise<object>;
  readonly createHandlers?: typeof createDesktopHandlers;
}

/** Compose the existing local APIs with an unattended lifetime. There is no second trading implementation. */
export function startLocalService(options: LocalServiceOptions): {
  readonly core: Core;
  readonly handlers: DesktopHandlers;
  readonly done: Promise<void>;
  stop(): Promise<void>;
} {
  let handlers: DesktopHandlers | null = null;
  let finish!: () => void;
  const done = new Promise<void>((resolve) => { finish = resolve; });
  const core = startCore({
    port: options.port ?? 3000,
    webDir: options.webDir,
    version: options.version,
    idleMs: 0,
    ...(options.doctor ? { doctor: options.doctor } : {}),
    handlers: (origin) => {
      handlers = (options.createHandlers ?? createDesktopHandlers)({
        dataDir: options.dataDir, origin, store: options.store,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        pulse: options.pulse === true && options.selftest !== true,
        liveFeed: options.selftest !== true,
        agent: options.selftest !== true,
      });
      return handlers;
    },
  });
  if (handlers === null) { core.stop(); throw new Error("local_handlers_missing"); }
  const services: DesktopHandlers = handlers;
  let closing: Promise<void> | null = null;
  return {
    core, handlers: services, done,
    stop() {
      if (closing !== null) return closing;
      // First stop new work and drain the agent. A close_timeout leaves its lock and HTTP process intact.
      // Only a successful drain may close the other desktop services and the socket.
      closing = (async () => {
        await services.agentService.close();
        services.close();
        core.stop();
        finish();
      })().catch((error) => { closing = null; throw error; });
      return closing;
    },
  };
}
