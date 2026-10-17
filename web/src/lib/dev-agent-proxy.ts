const UPSTREAM_ORIGIN = "http://127.0.0.1:3000";
const LOCAL_ORIGINS: Record<string, true> = {
  "127.0.0.1:3001": true,
  "localhost:3001": true,
};
const ANALYSIS_PATH = "/api/dev-agent/agent/analysis";
const DEV_STATUS_PATH = "/api/dev-agent/agent/dev-status";
const ALLOWED_PATHS: Record<string, true> = {
  [ANALYSIS_PATH]: true,
  [DEV_STATUS_PATH]: true,
};
const TIMEOUT_MS = 2_500;

export type DevAgentFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function handleDevAgentProxy(
  request: Request,
  fetchUpstream: DevAgentFetch = fetch,
  nodeEnv: string | undefined = process.env.NEXT_PUBLIC_INONU_DEV === "1" ? "development" : undefined,
): Promise<Response> {
  if (nodeEnv !== "development") {
    return json({ error: "not_found" }, 404);
  }

  const url = new URL(request.url);
  const host = request.headers.get("host") ?? "";
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    LOCAL_ORIGINS[host] !== true ||
    (request.headers.has("origin") && origin !== `http://${host}`) ||
    (fetchSite !== null && fetchSite !== "same-origin")
  ) {
    return json({ error: "forbidden" }, 403);
  }

  if (request.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  if (ALLOWED_PATHS[url.pathname] !== true) {
    return json({ error: "not_found" }, 404);
  }
  if (url.pathname === DEV_STATUS_PATH) {
    if (url.search !== "") return json({ error: "bad_request" }, 400);
  } else {
    const pages = url.searchParams.getAll("reviewPage");
    if ([...url.searchParams.keys()].some((key) => key !== "reviewPage") || pages.length > 1) {
      return json({ error: "bad_request" }, 400);
    }
    const rawPage = pages[0] ?? "1";
    if (!/^(?:[1-9]|10)$/.test(rawPage)) {
      return json({ error: "bad_request" }, 400);
    }
  }
  const upstreamPath = url.pathname === DEV_STATUS_PATH
    ? "/agent/dev-status"
    : url.search === ""
      ? "/agent/analysis"
      : `/agent/analysis?reviewPage=${url.searchParams.get("reviewPage")}`;
  try {
    const upstream = await fetchUpstream(`${UPSTREAM_ORIGIN}${upstreamPath}`, {
      method: "GET",
      headers: { Origin: UPSTREAM_ORIGIN },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!upstream.ok) return json({ error: "upstream_unavailable" }, 503);

    const data: unknown = await upstream.json();
    return json(data, 200);
  } catch {
    return json({ error: "upstream_unavailable" }, 503);
  }
}
