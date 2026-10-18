import { SECRET_IDS, SettingsError, validateSecretValue, type SecretId, type SettingsStatus, type SettingsStore, type UserPrefs } from "../settings/store";

export type CloudSecrets = Readonly<Partial<Record<SecretId, string>>>;

/** The host provisions secrets. The hosted page only sees presence; it cannot persist or replace them. */
export function createCloudStore(input: CloudSecrets): SettingsStore {
  for (const id of SECRET_IDS) if (input[id] !== undefined && !validateSecretValue(input[id]).ok) throw new SettingsError("cloud_secret_invalid");
  const secrets = Object.fromEntries(SECRET_IDS.map((id) => [id, validateSecretValue(input[id]).ok ? input[id]! : null])) as Record<SecretId, string | null>;
  const state = (): SettingsStatus["okx"]["state"] => {
    const count = [secrets.okxWeb3ApiKey, secrets.okxWeb3ApiSecret, secrets.okxWeb3ApiPassphrase].filter((s) => s !== null).length;
    return count === 3 ? "complete" : count === 0 ? "absent" : "incomplete";
  };
  const prefs: UserPrefs = { version: 1, onchain: { capBasic: 50_000, capPremium: 50_000, background: false, defaultChainIndex: null } };
  return {
    status: () => ({ secrets: Object.fromEntries(SECRET_IDS.map((id) => [id, { configured: secrets[id] !== null, origin: secrets[id] === null ? null : "process_environment", last4: null, updatedAtMs: null }])) as SettingsStatus["secrets"], okx: { state: state() } }),
    credentials: () => ({ typesafeAiApiKey: secrets.typesafeAiApiKey, okx: state() === "complete" ? { apiKey: secrets.okxWeb3ApiKey!, secret: secrets.okxWeb3ApiSecret!, passphrase: secrets.okxWeb3ApiPassphrase! } : null }),
    set: () => { throw new SettingsError("cloud_secrets_read_only"); },
    clear: () => { throw new SettingsError("cloud_secrets_read_only"); },
    prefs: () => structuredClone(prefs),
    setPrefs: () => { throw new SettingsError("cloud_settings_read_only"); },
  };
}
