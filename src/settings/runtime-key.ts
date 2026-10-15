/** Server-only credential discovery. Values stay in memory; callers publish presence and origin only. */
export type RuntimeKeyOrigin = "process_environment" | "windows_user" | "windows_machine";
export interface RuntimeKey { readonly value: string; readonly origin: RuntimeKeyOrigin }
export type RuntimeKeyResolver = () => RuntimeKey | null;

const KEY_NAMES = ["TYPESAFE_AI_API_KEY", "TYPESAFE_API_KEY"] as const;
type EnvironmentValues = Readonly<Record<string, string | undefined>>;
export interface WindowsKeyValues { readonly user: EnvironmentValues; readonly machine: EnvironmentValues }

/** Fixed allowlist, no key in argv, no stderr forwarding, bounded runtime and output. Never changes the registry. */
function readWindowsKeys(): WindowsKeyValues | null {
  const script = "$ErrorActionPreference='Stop'; $r=@{user=@{};machine=@{}}; foreach($scope in @('User','Machine')) { foreach($name in @('TYPESAFE_AI_API_KEY','TYPESAFE_API_KEY')) { $r[$scope.ToLowerInvariant()][$name]=[Environment]::GetEnvironmentVariable($name,$scope) } }; $r | ConvertTo-Json -Compress -Depth 3";
  try {
    const child = Bun.spawnSync(["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
      stdin: "ignore", stdout: "pipe", stderr: "ignore", windowsHide: true, timeout: 1_500,
    });
    if (child.exitCode !== 0 || child.stdout.byteLength > 2_048) return null;
    const parsed: unknown = JSON.parse(child.stdout.toString());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const root = parsed as Record<string, unknown>;
    const scopes: Record<string, Record<string, string | undefined>> = { user: {}, machine: {} };
    for (const scope of ["user", "machine"] as const) {
      const fields = root[scope];
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
      for (const name of KEY_NAMES) {
        const value = (fields as Record<string, unknown>)[name];
        if (typeof value === "string") scopes[scope]![name] = value;
      }
    }
    return { user: scopes.user!, machine: scopes.machine! };
  } catch { return null; }
}

export function createRuntimeKeyResolver(options: {
  readonly env?: EnvironmentValues;
  readonly platform?: string;
  readonly readWindows?: () => WindowsKeyValues | null;
  readonly now?: () => number;
  readonly cacheMs?: number;
} = {}): RuntimeKeyResolver {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const readWindows = options.readWindows ?? readWindowsKeys;
  const now = options.now ?? Date.now;
  const cacheMs = Math.max(0, options.cacheMs ?? 60_000);
  let expiresAt = -Infinity;
  let cached: RuntimeKey | null = null;
  return () => {
    for (const name of KEY_NAMES) {
      const value = env[name];
      if (typeof value === "string" && value.trim() !== "") return { value, origin: "process_environment" };
    }
    if (platform !== "win32") return null;
    const at = now();
    if (at < expiresAt) return cached;
    expiresAt = at + cacheMs;
    cached = null;
    try {
      const windows = readWindows();
      if (!windows) return null;
      for (const [scope, origin] of [[windows.user, "windows_user"], [windows.machine, "windows_machine"]] as const) {
        for (const name of KEY_NAMES) {
          const value = scope[name];
          if (typeof value === "string" && value.trim() !== "") return cached = { value, origin };
        }
      }
    } catch { /* discovery failures are absent observations, never system error payloads */ }
    return cached;
  };
}

export const resolveRuntimeKey = createRuntimeKeyResolver();
