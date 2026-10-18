import { createHash } from "node:crypto";

const SCRIPT_TYPES = new Set(["", "module", "text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript"]);

/** Only trusted, packaged HTML from the static core enters here. Never hash HTML supplied by a user, provider or model. */
export function cloudContentPolicy(html = ""): string {
  const hashes = new Set<string>();
  let inline = false;
  let script = "";
  new HTMLRewriter().on("script", {
    element(element) {
      inline = element.getAttribute("src") === null && SCRIPT_TYPES.has((element.getAttribute("type") ?? "").trim().toLowerCase());
      script = "";
      element.onEndTag(() => {
        if (inline && script.length > 0) {
          // The HTML parser in the browser normalizes CRLF and CR to LF before evaluating script text.
          const normalized = script.replace(/\r\n?/g, "\n");
          hashes.add(`'sha256-${createHash("sha256").update(normalized).digest("base64")}'`);
        }
        inline = false;
      });
    },
    text(text) { if (inline) script += text.text; },
  }).transform(html);
  return [
    "default-src 'none'",
    `script-src 'self'${hashes.size === 0 ? "" : " " + [...hashes].join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Keeps APIs and SSE streaming; only packaged HTML is read to allow its exact Next bootstrap scripts. */
export async function secureCloudResponse(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  const isHtml = /^text\/html(?:;|$)/i.test(headers.get("content-type") ?? "");
  const encoding = headers.get("content-encoding")?.trim().toLowerCase();
  if (isHtml && encoding !== undefined && encoding !== "identity") {
    await response.body?.cancel().catch(() => null);
    return secureCloudResponse(Response.json({ ok: false, code: "cloud_html_encoding_unsupported" }, { status: 502, headers: { "cache-control": "no-store" } }));
  }
  const html = isHtml ? await response.text() : undefined;
  headers.set("content-security-policy", cloudContentPolicy(html));
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("x-frame-options", "DENY");
  if (isHtml) { headers.delete("content-length"); headers.delete("content-encoding"); }
  return new Response(isHtml ? html : response.body, { status: response.status, statusText: response.statusText, headers });
}
