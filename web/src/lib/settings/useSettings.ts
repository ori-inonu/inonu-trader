"use client";

/**
 * State for the settings page: loads the snapshot once, applies mutations through the client and keeps the
 * last error with the API address so the page can say which local server did not answer. The typed value of a
 * secret only exists inside the save call; it is dropped right after.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSettingsClient,
  SettingsRequestError,
  SETTINGS_API_URL,
  type OnchainPrefs,
  type SecretId,
  type SettingsSnapshot,
} from "./client";

export interface SettingsState {
  readonly phase: "loading" | "ready" | "error";
  readonly snapshot: SettingsSnapshot | null;
  /** Null while nothing failed; "network" means the local server did not answer. */
  readonly error: SettingsRequestError | null;
  readonly apiUrl: string;
  readonly busy: boolean;
  save(id: SecretId, value: string): Promise<void>;
  clear(id: SecretId): Promise<void>;
  savePrefs(patch: { onchain: Partial<OnchainPrefs> }): Promise<void>;
  testOnchainos(): Promise<{ ok: boolean; code: string }>;
  testJev(): Promise<{ ok: boolean; code: string; tested?: boolean }>;
  reload(): Promise<void>;
}

export function useSettings(apiUrl: string = SETTINGS_API_URL): SettingsState {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<SettingsRequestError | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useRef(createSettingsClient(apiUrl)).current;

  const reload = useCallback(async () => {
    try {
      const next = await client.get();
      setSnapshot(next);
      setError(null);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof SettingsRequestError ? e : new SettingsRequestError("network"));
      setPhase("error");
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
        setError(null);
      } catch (e) {
        setError(e instanceof SettingsRequestError ? e : new SettingsRequestError("network"));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const save = useCallback(
    (id: SecretId, value: string) =>
      run(async () => {
        const status = await client.setSecret(id, value);
        setSnapshot((s) => (s ? { ...s, secrets: status.secrets, okx: status.okx } : s));
      }),
    [client, run],
  );

  const clear = useCallback(
    (id: SecretId) =>
      run(async () => {
        const status = await client.clearSecret(id);
        setSnapshot((s) => (s ? { ...s, secrets: status.secrets, okx: status.okx } : s));
      }),
    [client, run],
  );

  const savePrefs = useCallback(
    (patch: { onchain: Partial<OnchainPrefs> }) =>
      run(async () => {
        const prefs = await client.setPrefs(patch);
        setSnapshot((s) => (s ? { ...s, prefs } : s));
      }),
    [client, run],
  );

  const testOnchainos = useCallback(() => client.testOnchainos(), [client]);
  const testJev = useCallback(() => client.testJev(), [client]);

  return { phase, snapshot, error, apiUrl, busy, save, clear, savePrefs, testOnchainos, testJev, reload };
}
