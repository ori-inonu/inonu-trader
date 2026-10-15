import { isSettingsPath } from "../settings/http";

const READ_ONLY_CODES = new Set(["cloud_secrets_read_only", "cloud_settings_read_only"]);

/** Adapts only the hosted presentation and refusal codes, leaving the shared desktop handler intact. */
export async function cloudSettingsResponse(request: Request, response: Response): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (!isSettingsPath(path)) return response;
  const annotate = path === "/settings" && request.method === "GET" && response.ok;
  const refusal = response.status === 500 && !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (!annotate && !refusal) return response;
  let value: Record<string, unknown>;
  try {
    const parsed: unknown = await response.clone().json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return response;
    value = parsed as Record<string, unknown>;
  } catch { return response; }
  if (refusal) {
    if (value.ok !== false || typeof value.code !== "string" || !READ_ONLY_CODES.has(value.code)) return response;
    return new Response(response.body, { status: 403, statusText: "Forbidden", headers: response.headers });
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return Response.json({ ...value, readOnly: true }, { status: response.status, headers });
}
