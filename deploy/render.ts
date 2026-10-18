import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export function renderDeployment(domain: string, owner: string) {
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) || !/^[a-zA-Z0-9_.-]{1,64}$/.test(owner)) throw new Error("deploy_config_invalid");
  const caddy = `{
  admin off
}
auth.${domain} {
  reverse_proxy auth:9091
}
trader.${domain} {
  route {
    request_header -Remote-*
    request_header -X-Inonu-Gateway
    forward_auth auth:9091 {
      uri /api/authz/forward-auth
      copy_headers Remote-User
    }
    reverse_proxy app:8080 {
      header_up X-Inonu-Gateway {file./run/secrets/gateway_token}
      header_up Host trader.${domain}
      flush_interval -1
    }
  }
  header {
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options nosniff
    X-Frame-Options DENY
    Referrer-Policy no-referrer
  }
}
`;
  const authelia = `server:
  address: tcp://0.0.0.0:9091/
log:
  level: warn
totp:
  issuer: Inonu Trader
identity_validation:
  elevated_session:
    require_second_factor: true
    skip_second_factor: false
authentication_backend:
  file:
    path: /run/secrets/authelia_users
  password_reset:
    disable: true
access_control:
  default_policy: deny
  rules:
    - domain: trader.${domain}
      subject: user:${owner}
      policy: two_factor
session:
  name: inonu_session
  same_site: strict
  inactivity: 10m
  expiration: 1h
  remember_me: -1
  cookies:
    - domain: ${domain}
      authelia_url: https://auth.${domain}
      default_redirection_url: https://trader.${domain}
storage:
  local:
    path: /var/lib/authelia/db.sqlite3
regulation:
  max_retries: 3
  find_time: 2m
  ban_time: 10m
`;
  return { caddy, authelia };
}

if (import.meta.main) {
  try {
    const output = resolve(Bun.argv[2] ?? "deploy/generated");
    const config = renderDeployment(process.env.INONU_DOMAIN ?? "", process.env.INONU_OWNER ?? "");
    mkdirSync(output, { recursive: true, mode: 0o700 });
    await Bun.write(join(output, "Caddyfile"), config.caddy);
    await Bun.write(join(output, "authelia.yml"), config.authelia);
    console.info("deploy_configuration_rendered");
  } catch { console.error("deploy_config_invalid"); process.exit(1); }
}
