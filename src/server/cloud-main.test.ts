import { expect, test } from "bun:test";
import { cloudStartErrorCode } from "./cloud-main";

test("startup diagnostics expose only allowed constant codes and never arbitrary exception text", () => {
  for (const code of ["cloud_secret_invalid", "cloud_secret_unreadable", "cloud_config_invalid", "cloud_start_failed"]) expect(cloudStartErrorCode(new Error(code))).toBe(code);
  for (const error of [new Error("private-synthetic-key"), new Error("cloud_secret_invalid\nprivate-synthetic-key"), { message: "cloud_config_invalid" }, null]) expect(cloudStartErrorCode(error)).toBe("cloud_start_failed");
});
