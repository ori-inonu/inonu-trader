/**
 * Shared loopback guards for the local-only HTTP handlers (/settings and /onchain). The main server listens
 * on every interface, so these checks are the defence: the remote peer and the Host header must both be
 * loopback before any route logic runs.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function loopbackIp(ip: string | null): boolean {
  if (ip === null) return false;
  if (ip === "::1") return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("::ffff:")) {
    const v4 = ip.slice(7);
    return v4.startsWith("127.") || v4 === "::1";
  }
  return false;
}

export function loopbackHost(host: string | null): boolean {
  if (host === null) return false;
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]!;
  return LOOPBACK_HOSTS.has(name.toLowerCase());
}
