import { expect, test } from "bun:test";
import { renderDeployment } from "./render";

test("H07: all app paths pass two-factor auth, client identity headers are removed before verification", () => {
  const { caddy, authelia } = renderDeployment("example.com", "owner");
  const config = Bun.YAML.parse(authelia) as { identity_validation: { elevated_session: { require_second_factor: boolean; skip_second_factor: boolean } }; access_control: { default_policy: string; rules: { policy: string; subject: string }[] } };
  expect(config.access_control.default_policy).toBe("deny");
  expect(config.access_control.rules).toEqual([{ domain: "trader.example.com", subject: "user:owner", policy: "two_factor" }] as never);
  expect(caddy.indexOf("request_header -Remote-*")).toBeLessThan(caddy.indexOf("forward_auth"));
  expect(caddy.indexOf("forward_auth")).toBeLessThan(caddy.indexOf("reverse_proxy app:8080"));
  expect(caddy).not.toContain("handle_path");
  expect(caddy).not.toContain("trusted_proxies");
  expect(caddy).toContain("{file./run/secrets/gateway_token}");
  expect(caddy).not.toContain("{$INONU_GATEWAY_TOKEN}");
  expect(config.identity_validation.elevated_session).toEqual({ require_second_factor: true, skip_second_factor: false });
});

test("deployment inputs cannot inject YAML or proxy directives", () => {
  for (const domain of ["example.com\nadmin off", "localhost", "https://example.com", "../example.com", "EXAMPLE.COM"]) expect(() => renderDeployment(domain, "owner")).toThrow("deploy_config_invalid");
  for (const owner of ["x\npolicy: bypass", "user:evil", "", "someone else"]) expect(() => renderDeployment("example.com", owner)).toThrow("deploy_config_invalid");
});

test("only the TLS proxy publishes ports; app has durable state and no dev watcher", async () => {
  const compose = Bun.YAML.parse(await Bun.file(new URL("./compose.yaml", import.meta.url)).text()) as { services: Record<string, Record<string, unknown>> };
  expect(compose.services.app!.ports).toBeUndefined();
  expect(compose.services.auth!.ports).toBeUndefined();
  expect(compose.services.edge!.ports).toEqual(["80:80", "443:443"]);
  expect(compose.services.app!.restart).toBe("unless-stopped");
  expect(compose.services.app!.volumes).toContain("app-data:/var/lib/inonu");
  expect(compose.services.app!.secrets).toContain("gateway_token");
  expect(compose.services.edge!.secrets).toEqual(["gateway_token"]);
  expect(compose.services.app!.environment).toMatchObject({ HOME: "/var/lib/inonu/home" });
  const dockerfile = await Bun.file(new URL("./Dockerfile", import.meta.url)).text();
  expect(dockerfile).toContain('"--no-env-file"');
  expect(dockerfile).not.toContain("--watch");
  expect(dockerfile).not.toContain("COPY . ");
  expect(dockerfile).toContain('NEXT_PUBLIC_API_URL=""');
});
