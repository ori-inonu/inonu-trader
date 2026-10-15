import { expect, test } from "bun:test";
import { createCloudStore } from "./cloud-store";

test("H04: secrets are server-only, values never appear in status, writes are refused", () => {
  const secrets = { typesafeAiApiKey: "synthetic-model-key", okxWeb3ApiKey: "synthetic-okx-key", okxWeb3ApiSecret: "synthetic-okx-secret", okxWeb3ApiPassphrase: "synthetic-passphrase" };
  const store = createCloudStore(secrets);
  expect(store.credentials()).toEqual({ typesafeAiApiKey: secrets.typesafeAiApiKey, okx: { apiKey: secrets.okxWeb3ApiKey, secret: secrets.okxWeb3ApiSecret, passphrase: secrets.okxWeb3ApiPassphrase } });
  expect(store.status().okx.state).toBe("complete");
  for (const value of Object.values(secrets)) expect(JSON.stringify(store.status())).not.toContain(value);
  expect(() => store.set("okxWeb3ApiKey", "changed-sentinel")).toThrow("cloud_secrets_read_only");
  expect(() => store.clear("okxWeb3ApiKey")).toThrow("cloud_secrets_read_only");
  expect(store.credentials().okx!.apiKey).toBe(secrets.okxWeb3ApiKey);
});

test("partial credentials stay incomplete and malformed provisioning fails without echoing values", () => {
  const store = createCloudStore({ okxWeb3ApiKey: "synthetic-key" });
  expect(store.status().okx.state).toBe("incomplete");
  expect(store.credentials().okx).toBeNull();
  expect(store.credentials().typesafeAiApiKey).toBeNull();
  expect(createCloudStore({}).status().okx.state).toBe("absent");
  expect(() => store.setPrefs({ onchain: { capBasic: 0 } })).toThrow("cloud_settings_read_only");
  expect(() => createCloudStore({ okxWeb3ApiSecret: "\ninvalid-secret" })).toThrow("cloud_secret_invalid");
});
