// Builder and validator of the live authorization record (data/live-authorization.json), for the /central page.
//
// The rules MIRROR src/live-qualification.ts (items authorization.*) and docs/LIVE-QUALIFICATION.md section 7. They are
// copied here on purpose: the dashboard package never imports from the trading package. If the verifier changes, this file
// changes in a reviewed commit, and authorization-record.test.ts compares the field list with the template in the document.
//
// What this module is NOT: it does not authorize anything, it never fills a field for the owner (the acknowledgement in
// particular is only ever what the owner typed), it reads no key, no wallet and no environment, and it sends nothing. The
// execution gate in Market.init() (src/market.ts) is unrelated and unchanged.

import { parseDecimalText } from "./inputs";

export const AUTHORIZATION_SCHEMA_VERSION = 1;

/** The term the owner must type inside the acknowledgement; it is the same term LIVE_ACK requires. */
export const ACKNOWLEDGEMENT_TERM = "OWN_FUNDS_RISK";

/** Same order as AUTHORIZATION_TEMPLATE in src/live-qualification.ts. */
export const AUTHORIZATION_FIELD_ORDER = [
  "schemaVersion",
  "owner",
  "date",
  "walletAddress",
  "maxLossUsd",
  "maxSpendUsd",
  "tradeSizeMon",
  "maxPositionMon",
  "maxCapitalFraction",
  "sessionDurationMinutes",
  "allowedModelId",
  "expiry",
  "acknowledgement",
] as const;

/** Mirror of DEFAULT_QUALIFICATION_POLICY (only the entries that concern the record). */
export const AUTHORIZATION_POLICY = {
  maxLossFractionOfBankroll: 0.05,
  maxSpendFractionOfBankroll: 0.05,
  maxSessionMinutes: 60,
  maxAuthorizationValidityHours: 168,
  clockSkewToleranceMs: 300_000,
  minAcknowledgementLength: 40,
} as const;

export const LIMIT_FIELDS = ["maxLossUsd", "maxSpendUsd", "tradeSizeMon", "maxPositionMon", "maxCapitalFraction"] as const;
export type LimitField = (typeof LIMIT_FIELDS)[number];

export interface AuthorizationInput {
  owner?: string | null;
  /** ISO 8601 with an explicit time zone. */
  date?: string | null;
  walletAddress?: string | null;
  /** null or undefined: not filled in yet. NaN or a non finite number: filled in, but invalid. */
  maxLossUsd?: number | null;
  maxSpendUsd?: number | null;
  tradeSizeMon?: number | null;
  maxPositionMon?: number | null;
  maxCapitalFraction?: number | null;
  sessionDurationMinutes?: number | null;
  allowedModelId?: string | null;
  expiry?: string | null;
  acknowledgement?: string | null;
}

/** The values the configuration applies (.env): the record must be equal to them, never above. */
export interface ConfigCaps {
  bankrollUsd?: number | null;
  maxLossUsd?: number | null;
  maxSpendUsd?: number | null;
  tradeSizeMon?: number | null;
  maxPositionMon?: number | null;
  maxCapitalFraction?: number | null;
  jevModelId?: string | null;
}

export interface AuthorizationRecord {
  schemaVersion: 1;
  owner: string;
  date: string;
  walletAddress: string;
  maxLossUsd: number | null;
  maxSpendUsd: number | null;
  tradeSizeMon: number | null;
  maxPositionMon: number | null;
  maxCapitalFraction: number | null;
  sessionDurationMinutes: number | null;
  allowedModelId: string;
  expiry: string;
  acknowledgement: string;
}

export type RuleStatus = "pass" | "fail" | "pending";
export type RuleGroup = "fields" | "time-window" | "config";

export interface RuleResult {
  id: string;
  group: RuleGroup;
  /** Short name of the rule, in pt-BR. */
  label: string;
  /** The verifier item (src/live-qualification.ts) this rule mirrors. */
  verifierItem: string;
  status: RuleStatus;
  /** Stable tokens in the style of the verifier, for example exceeds-config:maxLossUsd. Empty when the rule passes. */
  codes: string[];
  /** What happened and what to do, in pt-BR. */
  message: string;
}

export interface AuthorizationEvaluation {
  /** True only when every rule passes. */
  valid: boolean;
  /** The record as typed so far; blanks stay blank, exactly like the template. */
  record: AuthorizationRecord;
  json: string;
  rules: RuleResult[];
  counts: { pass: number; fail: number; pending: number };
}

export type BuildResult =
  | { ok: true; record: AuthorizationRecord; json: string; rules: RuleResult[] }
  | { ok: false; failures: RuleResult[]; rules: RuleResult[] };

// ---------------------------------------------------------------------------
// Strict timestamps (port of parseIsoTimestamp)
// ---------------------------------------------------------------------------

const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * Strict ISO 8601 date and time with an explicit zone, as epoch milliseconds. It rejects nonexistent calendar days, leap
 * seconds, hour 24, missing zones and date only strings.
 */
export function parseIsoTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, fraction, zone, sign, offsetHour, offsetMinute] = match;
  const year = Number(y), month = Number(mo), day = Number(d), hour = Number(h), minute = Number(mi), second = Number(s);
  if (year < 1970 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  let offsetMinutes = 0;
  if (zone !== "Z") {
    const oh = Number(offsetHour), om = Number(offsetMinute);
    if (oh > 23 || om > 59) return null;
    offsetMinutes = (sign === "-" ? -1 : 1) * (oh * 60 + om);
  }
  const millis = fraction ? Number(fraction.padEnd(3, "0").slice(0, 3)) : 0;
  const result = Date.UTC(year, month - 1, day, hour, minute, second, millis) - offsetMinutes * 60_000;
  return Number.isFinite(result) ? result : null;
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Converts the value of a datetime-local control (local time, no zone) to UTC ISO 8601 with seconds, for example
 * 2026-10-11T17:30:00Z. Returns an empty string for anything that is not a real local date and time.
 */
export function localDateTimeToIso(value: string): string {
  const match = LOCAL_DATE_TIME.exec(value.trim());
  if (!match) return "";
  const [year, month, day, hour, minute, second] = [match[1], match[2], match[3], match[4], match[5], match[6] ?? "0"].map(Number) as [number, number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
    date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second
  ) return "";
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---------------------------------------------------------------------------
// Drafts: the strings of the form
// ---------------------------------------------------------------------------

export interface AuthorizationDraft {
  owner: string;
  /** Value of a datetime-local control, local time. */
  dateLocal: string;
  walletAddress: string;
  maxLossUsd: string;
  maxSpendUsd: string;
  tradeSizeMon: string;
  maxPositionMon: string;
  maxCapitalFraction: string;
  sessionDurationMinutes: string;
  allowedModelId: string;
  expiryLocal: string;
  /** Only ever what the owner typed. */
  acknowledgement: string;
}

export interface ConfigCapsDraft {
  bankrollUsd: string;
  maxLossUsd: string;
  maxSpendUsd: string;
  tradeSizeMon: string;
  maxPositionMon: string;
  maxCapitalFraction: string;
  jevModelId: string;
}

/** Every field starts empty. Nothing is suggested, least of all the acknowledgement. */
export function emptyAuthorizationDraft(): AuthorizationDraft {
  return {
    owner: "",
    dateLocal: "",
    walletAddress: "",
    maxLossUsd: "",
    maxSpendUsd: "",
    tradeSizeMon: "",
    maxPositionMon: "",
    maxCapitalFraction: "",
    sessionDurationMinutes: "",
    allowedModelId: "",
    expiryLocal: "",
    acknowledgement: "",
  };
}

/** Defaults of src/config.ts (MAX_LOSS_USD, MAX_SPEND_USD, TRADE_SIZE_MON, MAX_POSITION_MON, MAX_CAPITAL_FRACTION, BANKROLL_USD). */
export function defaultConfigCapsDraft(): ConfigCapsDraft {
  return {
    bankrollUsd: "100",
    maxLossUsd: "2",
    maxSpendUsd: "1",
    tradeSizeMon: "200",
    maxPositionMon: "1000",
    maxCapitalFraction: "0,25",
    jevModelId: "",
  };
}

const numberOrNull = (text: string): number | null => parseDecimalText(text);

export function parseAuthorizationDraft(draft: AuthorizationDraft): AuthorizationInput {
  return {
    owner: draft.owner,
    date: localDateTimeToIso(draft.dateLocal),
    walletAddress: draft.walletAddress,
    maxLossUsd: numberOrNull(draft.maxLossUsd),
    maxSpendUsd: numberOrNull(draft.maxSpendUsd),
    tradeSizeMon: numberOrNull(draft.tradeSizeMon),
    maxPositionMon: numberOrNull(draft.maxPositionMon),
    maxCapitalFraction: numberOrNull(draft.maxCapitalFraction),
    sessionDurationMinutes: numberOrNull(draft.sessionDurationMinutes),
    allowedModelId: draft.allowedModelId,
    expiry: localDateTimeToIso(draft.expiryLocal),
    acknowledgement: draft.acknowledgement,
  };
}

export function parseConfigCapsDraft(draft: ConfigCapsDraft): ConfigCaps {
  const id = draft.jevModelId.trim();
  return {
    bankrollUsd: numberOrNull(draft.bankrollUsd),
    maxLossUsd: numberOrNull(draft.maxLossUsd),
    maxSpendUsd: numberOrNull(draft.maxSpendUsd),
    tradeSizeMon: numberOrNull(draft.tradeSizeMon),
    maxPositionMon: numberOrNull(draft.maxPositionMon),
    maxCapitalFraction: numberOrNull(draft.maxCapitalFraction),
    jevModelId: id === "" ? null : id,
  };
}

// ---------------------------------------------------------------------------
// Readers (absent, invalid or ok)
// ---------------------------------------------------------------------------

type Read<T> = { kind: "absent" } | { kind: "invalid" } | { kind: "ok"; value: T };

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/i;
const EPSILON = 1e-9;

const lte = (value: number, limit: number): boolean => value <= limit + EPSILON * Math.max(1, Math.abs(limit));

function readText(value: string | null | undefined): Read<string> {
  if (value === undefined || value === null || value === "") return { kind: "absent" };
  return value.trim() === "" ? { kind: "invalid" } : { kind: "ok", value: value.trim() };
}

function readNumber(value: number | null | undefined, rule: { max?: number } = {}): Read<number> {
  if (value === undefined || value === null) return { kind: "absent" };
  if (!Number.isFinite(value) || value <= 0) return { kind: "invalid" };
  if (rule.max !== undefined && value > rule.max) return { kind: "invalid" };
  return { kind: "ok", value };
}

function readTime(value: string | null | undefined): Read<number> {
  if (value === undefined || value === null || value === "") return { kind: "absent" };
  const parsed = parseIsoTimestamp(value.trim());
  return parsed === null ? { kind: "invalid" } : { kind: "ok", value: parsed };
}

function readAddress(value: string | null | undefined): Read<string> {
  if (value === undefined || value === null || value === "") return { kind: "absent" };
  const text = value.trim();
  return HEX_ADDRESS.test(text) && !ZERO_ADDRESS.test(text) ? { kind: "ok", value: text } : { kind: "invalid" };
}

function readCap(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const FIELDS_ITEM = "authorization.fields-valid";

const SHORT_LABEL: Record<string, string> = {
  owner: "Nome do dono",
  date: "Data da assinatura",
  walletAddress: "Carteira dedicada",
  maxLossUsd: "Perda máxima (US$)",
  maxSpendUsd: "Gasto máximo (US$)",
  tradeSizeMon: "Tamanho da ordem (MON)",
  maxPositionMon: "Posição máxima (MON)",
  maxCapitalFraction: "Fração máxima do capital",
  sessionDurationMinutes: "Duração da sessão (min)",
  allowedModelId: "Modelo permitido",
  expiry: "Validade",
  acknowledgement: "Reconhecimento",
};

function result(
  id: string,
  group: RuleGroup,
  label: string,
  verifierItem: string,
  status: RuleStatus,
  codes: string[],
  message: string,
): RuleResult {
  return { id, group, label, verifierItem, status, codes, message };
}

function fieldRule(field: string, read: Read<unknown>, messages: { pass: string; pending: string; fail: string }): RuleResult {
  const label = SHORT_LABEL[field] ?? field;
  if (read.kind === "ok") return result(field, "fields", label, FIELDS_ITEM, "pass", [], messages.pass);
  if (read.kind === "absent") return result(field, "fields", label, FIELDS_ITEM, "pending", [`absent:${field}`], messages.pending);
  return result(field, "fields", label, FIELDS_ITEM, "fail", [`invalid:${field}`], messages.fail);
}

function fieldRules(input: AuthorizationInput): RuleResult[] {
  const rules: RuleResult[] = [];
  rules.push(fieldRule("owner", readText(input.owner), {
    pass: "Nome do dono informado.",
    pending: "Informe o nome do dono dos fundos.",
    fail: "O nome do dono não pode ser só espaços.",
  }));
  rules.push(fieldRule("date", readTime(input.date), {
    pass: "Data da assinatura válida, em ISO 8601 com fuso.",
    pending: "Informe a data e a hora em que o dono assina.",
    fail: "Use data e hora completas em ISO 8601 com fuso, por exemplo 2026-10-11T14:30:00Z.",
  }));
  rules.push(fieldRule("walletAddress", readAddress(input.walletAddress), {
    pass: "Endereço público válido.",
    pending: "Informe o endereço público da carteira dedicada (0x e 40 hexadecimais).",
    fail: "O endereço precisa ter 0x e 40 hexadecimais e não pode ser o endereço zero.",
  }));
  const positive = { pass: "Número positivo válido.", pending: "Informe o limite.", fail: "Use um número finito maior que zero." };
  rules.push(fieldRule("maxLossUsd", readNumber(input.maxLossUsd), positive));
  rules.push(fieldRule("maxSpendUsd", readNumber(input.maxSpendUsd), positive));
  const tradeSize = readNumber(input.tradeSizeMon);
  const position = readNumber(input.maxPositionMon);
  rules.push(fieldRule("tradeSizeMon", tradeSize, positive));
  rules.push(fieldRule("maxPositionMon", position, positive));
  if (tradeSize.kind === "ok" && position.kind === "ok") {
    rules.push(tradeSize.value <= position.value
      ? result("trade-size-within-position", "fields", "Ordem dentro da posição", FIELDS_ITEM, "pass", [], "O tamanho da ordem não passa da posição máxima.")
      : result("trade-size-within-position", "fields", "Ordem dentro da posição", FIELDS_ITEM, "fail", ["invalid:tradeSizeMon"], "O tamanho da ordem (tradeSizeMon) não pode ser maior que a posição máxima (maxPositionMon)."));
  } else {
    rules.push(result("trade-size-within-position", "fields", "Ordem dentro da posição", FIELDS_ITEM, "pending", [], "Aguardando o tamanho da ordem e a posição máxima."));
  }
  rules.push(fieldRule("maxCapitalFraction", readNumber(input.maxCapitalFraction, { max: 1 }), {
    pass: "Fração válida (maior que 0 e até 1).",
    pending: "Informe a fração máxima do capital.",
    fail: "Use um número maior que 0 e até 1.",
  }));
  rules.push(fieldRule("sessionDurationMinutes", readNumber(input.sessionDurationMinutes), positive));
  const model = readText(input.allowedModelId);
  rules.push(fieldRule("allowedModelId", model, {
    pass: "Id do modelo informado.",
    pending: "Informe o id exato do modelo Jev, igual ao JEV_MODEL_ID.",
    fail: "O id do modelo não pode ser só espaços.",
  }));
  if (model.kind === "ok") {
    rules.push(/latest/i.test(model.value)
      ? result("model-pinned", "fields", "Versão exata do modelo", "config.model-id-pinned", "fail", ["alias"], "Apelidos móveis como jev-latest não valem. Fixe uma versão exata, por exemplo jev-1.13.0.")
      : result("model-pinned", "fields", "Versão exata do modelo", "config.model-id-pinned", "pass", [], "O id fixa uma versão exata."));
  } else {
    rules.push(result("model-pinned", "fields", "Versão exata do modelo", "config.model-id-pinned", "pending", [], "Aguardando o id do modelo."));
  }
  rules.push(fieldRule("expiry", readTime(input.expiry), {
    pass: "Validade válida, em ISO 8601 com fuso.",
    pending: "Informe até quando o registro vale.",
    fail: "Use data e hora completas em ISO 8601 com fuso, por exemplo 2026-10-12T14:30:00Z.",
  }));
  const text = typeof input.acknowledgement === "string" ? input.acknowledgement.trim() : "";
  const ackRead: Read<string> = input.acknowledgement === undefined || input.acknowledgement === null || input.acknowledgement === ""
    ? { kind: "absent" }
    : text.length >= AUTHORIZATION_POLICY.minAcknowledgementLength && text.includes(ACKNOWLEDGEMENT_TERM)
      ? { kind: "ok", value: text }
      : { kind: "invalid" };
  rules.push(fieldRule("acknowledgement", ackRead, {
    pass: `Reconhecimento escrito pelo dono, com o termo ${ACKNOWLEDGEMENT_TERM}.`,
    pending: "Escreva o reconhecimento com as suas palavras. Ele nunca vem preenchido.",
    fail: `Escreva com as suas palavras: pelo menos ${AUTHORIZATION_POLICY.minAcknowledgementLength} caracteres, incluindo o termo ${ACKNOWLEDGEMENT_TERM}.`,
  }));
  return rules;
}

const TIME_ITEM = "authorization.time-window";

function timeRules(input: AuthorizationInput, nowMs: number): RuleResult[] {
  const date = readTime(input.date);
  const expiry = readTime(input.expiry);
  const policy = AUTHORIZATION_POLICY;
  const need = (...pairs: Array<[string, Read<number>]>): string[] => pairs.filter(([, read]) => read.kind !== "ok").map(([name]) => `needs:${name}`);
  const pending = (id: string, label: string, codes: string[]): RuleResult =>
    result(id, "time-window", label, TIME_ITEM, "pending", codes, "Aguardando uma data e uma validade válidas.");

  const rules: RuleResult[] = [];

  const dateLabel = "Data não está no futuro";
  if (date.kind !== "ok") rules.push(pending("date-not-in-future", dateLabel, need(["date", date])));
  else rules.push(date.value > nowMs + policy.clockSkewToleranceMs
    ? result("date-not-in-future", "time-window", dateLabel, TIME_ITEM, "fail", ["date-in-future"], "A data da assinatura está mais de 5 minutos no futuro.")
    : result("date-not-in-future", "time-window", dateLabel, TIME_ITEM, "pass", [], "A data não está no futuro (tolerância de 5 minutos)."));

  const orderLabel = "Validade depois da data";
  if (date.kind !== "ok" || expiry.kind !== "ok") rules.push(pending("expiry-after-date", orderLabel, need(["date", date], ["expiry", expiry])));
  else rules.push(expiry.value <= date.value
    ? result("expiry-after-date", "time-window", orderLabel, TIME_ITEM, "fail", ["expiry-before-date"], "A validade precisa vir depois da data da assinatura.")
    : result("expiry-after-date", "time-window", orderLabel, TIME_ITEM, "pass", [], "A validade vem depois da data."));

  const expiredLabel = "Validade no futuro";
  if (expiry.kind !== "ok") rules.push(pending("expiry-not-expired", expiredLabel, need(["expiry", expiry])));
  else rules.push(expiry.value <= nowMs
    ? result("expiry-not-expired", "time-window", expiredLabel, TIME_ITEM, "fail", ["expired"], "A validade já passou. Escolha uma validade no futuro.")
    : result("expiry-not-expired", "time-window", expiredLabel, TIME_ITEM, "pass", [], "A validade está no futuro."));

  const lengthLabel = `Validade de no máximo ${policy.maxAuthorizationValidityHours} horas`;
  if (date.kind !== "ok" || expiry.kind !== "ok") rules.push(pending("validity-max-hours", lengthLabel, need(["date", date], ["expiry", expiry])));
  else rules.push(expiry.value - date.value > policy.maxAuthorizationValidityHours * 3_600_000
    ? result("validity-max-hours", "time-window", lengthLabel, TIME_ITEM, "fail", ["validity-too-long"], `A validade passa de ${policy.maxAuthorizationValidityHours} horas depois da data. Use uma validade mais curta.`)
    : result("validity-max-hours", "time-window", lengthLabel, TIME_ITEM, "pass", [], `A validade não passa de ${policy.maxAuthorizationValidityHours} horas.`));

  return rules;
}

function configRules(input: AuthorizationInput, caps: ConfigCaps): RuleResult[] {
  const rules: RuleResult[] = [];
  const limitOf = (field: LimitField): number | null => {
    const read = readNumber(input[field], field === "maxCapitalFraction" ? { max: 1 } : {});
    return read.kind === "ok" ? read.value : null;
  };

  // authorization.limits-within-config-caps: no authorized limit above the configured one.
  const above: string[] = [];
  let incomplete = false;
  for (const field of LIMIT_FIELDS) {
    const limit = limitOf(field);
    const cap = readCap(caps[field]);
    if (limit === null || cap === null) incomplete = true;
    else if (limit > cap) above.push(`exceeds-config:${field}`);
  }
  const limitsId = "authorization.limits-within-config-caps";
  if (above.length > 0) rules.push(result("limits-within-config-caps", "config", "Limites dentro do teto da configuração", limitsId, "fail", above, `O registro autoriza mais do que a configuração aplica: ${above.map((code) => code.split(":")[1]).join(", ")}.`));
  else if (incomplete) rules.push(result("limits-within-config-caps", "config", "Limites dentro do teto da configuração", limitsId, "pending", [], "Aguardando os cinco limites e os cinco valores da configuração."));
  else rules.push(result("limits-within-config-caps", "config", "Limites dentro do teto da configuração", limitsId, "pass", [], "Nenhum limite autorizado passa do que a configuração aplica."));

  // authorization.config-within-authorized-limits: the configuration may not allow more than the record authorizes.
  const below: string[] = [];
  incomplete = false;
  for (const field of LIMIT_FIELDS) {
    const limit = limitOf(field);
    const cap = readCap(caps[field]);
    if (limit === null || cap === null) incomplete = true;
    else if (cap > limit) below.push(`config-exceeds:${field}`);
  }
  const configId = "authorization.config-within-authorized-limits";
  if (below.length > 0) rules.push(result("config-within-authorized-limits", "config", "Configuração dentro do autorizado", configId, "fail", below, `A configuração permite mais do que o registro autoriza: ${below.map((code) => code.split(":")[1]).join(", ")}. Na prática, os valores precisam ser iguais.`));
  else if (incomplete) rules.push(result("config-within-authorized-limits", "config", "Configuração dentro do autorizado", configId, "pending", [], "Aguardando os cinco limites e os cinco valores da configuração."));
  else rules.push(result("config-within-authorized-limits", "config", "Configuração dentro do autorizado", configId, "pass", [], "A configuração não permite mais do que o registro autoriza."));

  // authorization.tiny-caps: loss and spend up to 5% of the bankroll, session up to 60 minutes.
  const tinyId = "authorization.tiny-caps";
  const bankroll = readCap(caps.bankrollUsd);
  const loss = limitOf("maxLossUsd");
  const spend = limitOf("maxSpendUsd");
  const session = readNumber(input.sessionDurationMinutes);
  const tooLarge: string[] = [];
  if (bankroll !== null && loss !== null && !lte(loss, AUTHORIZATION_POLICY.maxLossFractionOfBankroll * bankroll)) tooLarge.push("too-large:maxLossUsd");
  if (bankroll !== null && spend !== null && !lte(spend, AUTHORIZATION_POLICY.maxSpendFractionOfBankroll * bankroll)) tooLarge.push("too-large:maxSpendUsd");
  if (session.kind === "ok" && session.value > AUTHORIZATION_POLICY.maxSessionMinutes) tooLarge.push("too-large:sessionDurationMinutes");
  const tinyLabel = "Tetos de sanidade";
  if (tooLarge.length > 0) rules.push(result("tiny-caps", "config", tinyLabel, tinyId, "fail", tooLarge, `Limites acima do teto de sanidade (perda e gasto até 5% da banca, sessão até ${AUTHORIZATION_POLICY.maxSessionMinutes} minutos): ${tooLarge.map((code) => code.split(":")[1]).join(", ")}.`));
  else if (bankroll === null || loss === null || spend === null || session.kind !== "ok") rules.push(result("tiny-caps", "config", tinyLabel, tinyId, "pending", [], "Aguardando a banca (BANKROLL_USD), a perda, o gasto e a duração."));
  else rules.push(result("tiny-caps", "config", tinyLabel, tinyId, "pass", [], "Perda e gasto até 5% da banca e sessão curta."));

  // authorization.model-matches-config
  const modelId = "authorization.model-matches-config";
  const allowed = readText(input.allowedModelId);
  const configured = typeof caps.jevModelId === "string" && caps.jevModelId.trim() !== "" ? caps.jevModelId.trim() : null;
  const modelLabel = "Modelo igual ao da configuração";
  if (allowed.kind !== "ok" || configured === null) rules.push(result("model-matches-config", "config", modelLabel, modelId, "pending", [], "Aguardando o modelo permitido e o JEV_MODEL_ID da configuração."));
  else if (allowed.value !== configured) rules.push(result("model-matches-config", "config", modelLabel, modelId, "fail", ["model-mismatch"], "O modelo permitido no registro difere do JEV_MODEL_ID da configuração."));
  else rules.push(result("model-matches-config", "config", modelLabel, modelId, "pass", [], "O modelo do registro é igual ao da configuração."));

  return rules;
}

// ---------------------------------------------------------------------------
// Record and evaluation
// ---------------------------------------------------------------------------

function recordFrom(input: AuthorizationInput): AuthorizationRecord {
  const number = (value: number | null | undefined): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const text = (value: string | null | undefined): string => (typeof value === "string" ? value.trim() : "");
  return {
    schemaVersion: AUTHORIZATION_SCHEMA_VERSION,
    owner: text(input.owner),
    date: text(input.date),
    walletAddress: text(input.walletAddress),
    maxLossUsd: number(input.maxLossUsd),
    maxSpendUsd: number(input.maxSpendUsd),
    tradeSizeMon: number(input.tradeSizeMon),
    maxPositionMon: number(input.maxPositionMon),
    maxCapitalFraction: number(input.maxCapitalFraction),
    sessionDurationMinutes: number(input.sessionDurationMinutes),
    allowedModelId: text(input.allowedModelId),
    expiry: text(input.expiry),
    acknowledgement: text(input.acknowledgement),
  };
}

export function evaluateAuthorization(input: AuthorizationInput, caps: ConfigCaps, nowMs: number): AuthorizationEvaluation {
  const rules = [...fieldRules(input), ...timeRules(input, nowMs), ...configRules(input, caps)];
  const counts = { pass: 0, fail: 0, pending: 0 };
  for (const rule of rules) counts[rule.status] += 1;
  const record = recordFrom(input);
  return {
    valid: counts.fail === 0 && counts.pending === 0,
    record,
    json: `${JSON.stringify(record, null, 2)}\n`,
    rules,
    counts,
  };
}

/**
 * Builds the record only when every rule passes. It never invents a value: whatever the owner left blank makes the build
 * fail, and the acknowledgement in particular is always exactly what the owner typed.
 */
export function buildAuthorizationRecord(input: AuthorizationInput, caps: ConfigCaps, nowMs: number): BuildResult {
  const evaluation = evaluateAuthorization(input, caps, nowMs);
  if (!evaluation.valid) {
    return { ok: false, failures: evaluation.rules.filter((rule) => rule.status !== "pass"), rules: evaluation.rules };
  }
  return { ok: true, record: evaluation.record, json: evaluation.json, rules: evaluation.rules };
}
