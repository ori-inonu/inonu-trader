import { expect, test } from "bun:test";
import { cloudSettingsResponse } from "./cloud-settings-response";

test("an unexpected settings body remains readable, preserving the original response instead of throwing", async () => {
  const source = new Response("unexpected", { headers: { "content-type": "text/plain" } });
  const result = await cloudSettingsResponse(new Request("http://127.0.0.1/settings"), source);
  expect(result).toBe(source);
  expect(await result.text()).toBe("unexpected");
});

test("only an explicit hosted read-only refusal is mapped to 403; an unrelated server failure stays 500", async () => {
  const request = new Request("http://127.0.0.1/settings/secrets", { method: "PUT" });
  const expected = { ok: false, code: "cloud_secrets_read_only" };
  const result = await cloudSettingsResponse(request, Response.json(expected, { status: 500 }));
  expect(result.status).toBe(403);
  expect(await result.json()).toEqual(expected);
  const failed = Response.json({ ok: false, code: "store_error" }, { status: 500 });
  expect(await cloudSettingsResponse(request, failed)).toBe(failed);
});
