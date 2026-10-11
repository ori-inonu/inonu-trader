/**
 * Typed errors of the Onchain OS data layer. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md sections 4.5 and 6.
 *
 * The message is built ONLY from fixed text written by the code, the endpoint PATH (never the query string), the HTTP
 * status, the provider code and a row index. It never contains credentials, signatures, headers, a full URL or any
 * content of the response. The provider message, when kept, is untrusted third party text: bounded, stripped of control
 * characters and redacted of every known secret.
 */

export const ERROR_KINDS = ["offline", "invalid_request", "timeout", "network", "http", "rate_limited", "api", "schema", "too_large"] as const;
export type OnchainosErrorKind = (typeof ERROR_KINDS)[number];

export const REDACTED = "[omitido]";
const MAX_PROVIDER_TEXT = 200;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]+/g;

/** Cuts a request path at the query string or fragment: only the path may appear in an error. */
export function pathOnly(endpoint: string): string {
  const cut = endpoint.search(/[?#]/);
  return cut === -1 ? endpoint : endpoint.slice(0, cut);
}

/** Replaces every occurrence of every secret, longest first, so a secret that contains another is fully hidden. */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of [...secrets].filter((value) => value.length > 0).sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join(REDACTED);
  }
  return result;
}

/** Third party text made safe to keep in an error: redacted, de-controlled, collapsed and cut to 200 characters. */
export function sanitizeProviderText(value: unknown, secrets: readonly string[]): string | null {
  if (typeof value !== "string") return null;
  const stripped = redactSecrets(redactSecrets(value, secrets).replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim(), secrets);
  const bounded = redactSecrets(stripped.slice(0, MAX_PROVIDER_TEXT), secrets);
  return bounded.length === 0 ? null : bounded;
}

export interface OnchainosErrorInit {
  endpoint?: string;
  httpStatus?: number | null;
  apiCode?: string | null;
  attempts?: number;
  rowIndex?: number | null;
  providerMessage?: string | null;
}

function buildMessage(kind: OnchainosErrorKind, detail: string, endpoint: string, init: OnchainosErrorInit): string {
  let message = `OKX Onchain OS (${kind})${endpoint === "" ? "" : ` em ${endpoint}`}: ${detail}`;
  if (init.httpStatus !== undefined && init.httpStatus !== null) message += ` [HTTP ${init.httpStatus}]`;
  if (init.apiCode !== undefined && init.apiCode !== null) message += ` [código ${init.apiCode}]`;
  if (init.rowIndex !== undefined && init.rowIndex !== null) message += ` [linha ${init.rowIndex}]`;
  if (init.httpStatus === 402) message += " (nenhum pagamento é feito por esta biblioteca)";
  return message;
}

export class OnchainosError extends Error {
  readonly kind: OnchainosErrorKind;
  readonly detail: string;
  readonly endpoint: string;
  readonly httpStatus: number | null;
  readonly apiCode: string | null;
  readonly attempts: number;
  readonly rowIndex: number | null;
  readonly providerMessage: string | null;

  constructor(kind: OnchainosErrorKind, detail: string, init: OnchainosErrorInit = {}) {
    const endpoint = pathOnly(init.endpoint ?? "");
    super(buildMessage(kind, detail, endpoint, init));
    this.name = "OnchainosError";
    this.kind = kind;
    this.detail = detail;
    this.endpoint = endpoint;
    this.httpStatus = init.httpStatus ?? null;
    this.apiCode = init.apiCode ?? null;
    this.attempts = init.attempts ?? 0;
    this.rowIndex = init.rowIndex ?? null;
    this.providerMessage = init.providerMessage ?? null;
  }

  /** Same facts with the endpoint path filled in (parsers do not know which endpoint they are reading). */
  withEndpoint(endpoint: string): OnchainosError {
    return new OnchainosError(this.kind, this.detail, {
      endpoint,
      httpStatus: this.httpStatus,
      apiCode: this.apiCode,
      attempts: this.attempts,
      rowIndex: this.rowIndex,
      providerMessage: this.providerMessage,
    });
  }
}
