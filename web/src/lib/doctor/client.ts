/**
 * Reader of the Doctor report (WIN-8). The data lives only in the desktop core (`/__inonu/doctor`); the page is
 * `/doctor`. The parser trusts nothing: an answer that is not the documented shape is an error, never a half-drawn card.
 */
export const DOCTOR_PATH = "/__inonu/doctor";

export const DOCTOR_STATUSES = ["ok", "atencao", "falha", "nao_verificado"] as const;
export type DoctorStatus = (typeof DOCTOR_STATUSES)[number];

export interface DoctorItem {
  readonly id: string;
  readonly label: string;
  readonly status: DoctorStatus;
  readonly message: string;
  readonly action: string | null;
}

export interface DoctorReport {
  readonly checkedAtMs: number;
  readonly items: readonly DoctorItem[];
}

export type DoctorResult =
  | { readonly ok: true; readonly report: DoctorReport }
  | { readonly ok: false; readonly error: "unreachable" | "not_in_app" | "schema" };

export const STATUS_TEXT: Record<DoctorStatus, string> = {
  ok: "Ok",
  atencao: "Atencao",
  falha: "Falha",
  nao_verificado: "Nao verificado",
};

const isStatus = (value: unknown): value is DoctorStatus => typeof value === "string" && (DOCTOR_STATUSES as readonly string[]).includes(value);

export function parseDoctor(body: unknown): DoctorReport | null {
  if (typeof body !== "object" || body === null) return null;
  const { ok, checkedAtMs, items } = body as { ok?: unknown; checkedAtMs?: unknown; items?: unknown };
  if (ok !== true || typeof checkedAtMs !== "number" || !Number.isFinite(checkedAtMs) || !Array.isArray(items) || items.length === 0) return null;
  const parsed: DoctorItem[] = [];
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) return null;
    const { id, label, status, message, action } = raw as Record<string, unknown>;
    if (typeof id !== "string" || typeof label !== "string" || typeof message !== "string" || !isStatus(status)) return null;
    if (action !== null && typeof action !== "string") return null;
    parsed.push({ id, label, status, message, action });
  }
  return { checkedAtMs, items: parsed };
}

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function fetchDoctor(base: string = process.env.NEXT_PUBLIC_API_URL ?? "", fetchImpl: FetchLike = (url, init) => fetch(url, init), timeoutMs = 20_000): Promise<DoctorResult> {
  try {
    const res = await fetchImpl(`${base}${DOCTOR_PATH}`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    if (res.status === 404) return { ok: false, error: "not_in_app" };
    if (!res.ok) return { ok: false, error: "unreachable" };
    const report = parseDoctor(await res.json().catch(() => null));
    return report ? { ok: true, report } : { ok: false, error: "schema" };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}
