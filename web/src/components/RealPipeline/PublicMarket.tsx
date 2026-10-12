"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./PublicMarket.module.css";

type Status = "ready" | "blocked" | "error";
export interface PublicMarketData {
  source: "okx-public-v5";
  mode: "real" | "unverified";
  status: Status;
  observedAtMs: number;
  expiresAtMs: number;
  instrument: null | { instId: string; instType: string; state: string | null; ctType: string | null; settleCcy: string | null; ctValCcy: string | null; ctVal: string | null };
  funding: null | { instId: string; method: "current_period" | "next_period" | null; fundingRate: string | null; nextFundingRate: string | null; fundingTimeMs: number | null; nextFundingTimeMs: number | null; intervalMs: number | null; settState: "processing" | "settled" | null; settFundingRate: string | null; tsMs: number | null };
  mark: null | { instId: string; markPx: string | null; tsMs: number | null };
  capability: { documented: boolean; implemented: boolean; exercisedReal: boolean; integrated: boolean; financiallyQualified: boolean; nextRequirement: string | null };
  dependencies: string[];
  requests: { method: "GET"; endpoint: string; httpStatus: number | null; code: string | null; requestedAtMs: number; receivedAtMs: number }[];
  clock?: { source: 'okx-public-v5'; endpoint: '/api/v5/public/time'; transport: 'production-https' | 'injected'; status: 'ready' | 'blocked'; requestedAtMs: number; receivedAtMs: number; serverAtMs: number | null; dateHeaderAtMs: number | null; httpStatus: number | null; code: string | null; offsetMs: number | null; uncertaintyMs: number | null; expiresAtMs: number; reason: string | null };
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const time = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
const nullableTime = (value: unknown) => value === null || time(value);
const text = (value: unknown) => value === null || (typeof value === "string" && value.length <= 200);
const decimal = (value: unknown) => value === null || (typeof value === "string" && value.length <= 100 && /^-?\d+(?:\.\d+)?$/.test(value));

/** Only a bounded structural snapshot is accepted; backend messages are not rendered on failure. */
function parseSnapshot(value: unknown): PublicMarketData | null {
  if (value === null) return null;
  if (!record(value) || value.source !== "okx-public-v5" || !["real", "unverified"].includes(String(value.mode)) || !["ready", "blocked", "error"].includes(String(value.status)) || !time(value.observedAtMs) || !time(value.expiresAtMs) || !record(value.capability)) throw new Error("snapshot");
  for (const field of ["documented", "implemented", "exercisedReal", "integrated", "financiallyQualified"]) if (typeof value.capability[field] !== "boolean") throw new Error("capability");
  if (!text(value.capability.nextRequirement) || !Array.isArray(value.dependencies) || value.dependencies.length > 12 || !value.dependencies.every((item) => typeof item === "string" && item.length <= 500) || !Array.isArray(value.requests) || value.requests.length > 3) throw new Error("bounds");
  if (value.instrument !== null) {
    if (!record(value.instrument) || value.instrument.instId !== "BTC-USDT-SWAP" || value.instrument.instType !== "SWAP" || !["state", "ctType", "settleCcy", "ctValCcy"].every((key) => text((value.instrument as Record<string, unknown>)[key])) || !decimal(value.instrument.ctVal)) throw new Error("instrument");
  }
  if (value.funding !== null) {
    if (!record(value.funding) || value.funding.instId !== "BTC-USDT-SWAP" || ![null, "current_period", "next_period"].includes(value.funding.method as null | string) || ![null, "processing", "settled"].includes(value.funding.settState as null | string) || !["fundingRate", "nextFundingRate", "settFundingRate"].every((key) => decimal((value.funding as Record<string, unknown>)[key])) || !["fundingTimeMs", "nextFundingTimeMs", "intervalMs", "tsMs"].every((key) => nullableTime((value.funding as Record<string, unknown>)[key]))) throw new Error("funding");
  }
  if (value.mark !== null && (!record(value.mark) || value.mark.instId !== "BTC-USDT-SWAP" || !decimal(value.mark.markPx) || !nullableTime(value.mark.tsMs))) throw new Error("mark");
  const endpoints = ["/api/v5/public/instruments", "/api/v5/public/funding-rate", "/api/v5/public/mark-price"];
  if (value.clock !== undefined) {
    const c = value.clock;
    if (!record(c) || c.source !== 'okx-public-v5' || c.endpoint !== '/api/v5/public/time' || !['production-https', 'injected'].includes(String(c.transport)) || !['ready', 'blocked'].includes(String(c.status)) || !['requestedAtMs', 'receivedAtMs', 'expiresAtMs'].every(k => time(c[k])) || !['serverAtMs', 'dateHeaderAtMs'].every(k => nullableTime(c[k])) || !text(c.reason) || !(c.offsetMs === null || typeof c.offsetMs === 'number' && Number.isFinite(c.offsetMs) && Math.abs(c.offsetMs) <= 180_000) || !(c.uncertaintyMs === null || typeof c.uncertaintyMs === 'number' && Number.isFinite(c.uncertaintyMs) && c.uncertaintyMs >= 0 && c.uncertaintyMs <= 1_001)) throw new Error('clock');
  }
  for (const request of value.requests) {
    if (!record(request) || request.method !== "GET" || !endpoints.includes(String(request.endpoint)) || !(request.httpStatus === null || typeof request.httpStatus === "number" && Number.isInteger(request.httpStatus) && request.httpStatus >= 100 && request.httpStatus <= 599) || !(request.code === null || typeof request.code === "string" && /^-?\d{1,12}$/.test(request.code)) || !time(request.requestedAtMs) || !time(request.receivedAtMs)) throw new Error("request");
  }
  return value as unknown as PublicMarketData;
}

const stamp = (value: number | null | undefined) => value === null || value === undefined ? "Desconhecido" : new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC");
const known = (value: string | null | undefined) => value ?? "Desconhecido";

export function PublicMarketView({ snapshot, nowMs, busy, error, onRetry }: { snapshot: PublicMarketData | null; nowMs: number; busy: boolean; error: string | null; onRetry: () => void }) {
  const fresh = snapshot !== null && nowMs > 0 && snapshot.expiresAtMs > nowMs;
  const real = snapshot?.mode === "real" && snapshot.capability.exercisedReal;
  const usable = fresh && !error && snapshot?.status === 'ready';
  const funding = snapshot?.funding;
  const qualifiedUnit = snapshot?.instrument?.ctType === "linear" && snapshot.instrument.settleCcy === "USDT" && snapshot.instrument.ctValCcy === "BTC";
  const dependency = error ?? (!snapshot ? "Aguardar a primeira coleta pública do worker local." : snapshot.dependencies[0] ?? (!fresh ? "Aguardar uma coleta pública dentro do TTL de 60 segundos." : snapshot.capability.nextRequirement));
  return <section className={styles.panel} aria-labelledby="public-market-title">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>OKX Exchange · REST público v5</p><h2 id="public-market-title">Funding e mark público</h2><p>BTC-USDT-SWAP · leitura automática, sem chave ou carteira.</p></div>
      <span className={styles.badge}>{snapshot ? real ? "Leitura pública real" : "Leitura não verificada" : "Aguardando fonte pública"}</span>
    </header>
    <div className={styles.content}>
      <p className={styles.muted}>Fonte: <code>okx-public-v5</code>. Estes dados são do mercado Exchange. Saldo, inventário, custos da conta e PnL realizado: desconhecidos.</p>
      <div className={styles.dependency} role="status"><strong>{snapshot?.status === "ready" && usable ? "Observação disponível · execução desabilitada" : "Hold · dependência pendente"}</strong><p>{dependency}</p></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" disabled={busy} onClick={onRetry}>{busy ? "Consultando worker…" : "Atualizar leitura pública"}</button><span>Worker antecipa a coleta conforme a validade; este botão solicita nova leitura da fonte.</span></div>
      <dl className={styles.times}><div><dt>Observado pelo worker</dt><dd>{stamp(snapshot?.observedAtMs)}</dd></div><div><dt>Validade · TTL de 60 s</dt><dd>{snapshot ? `${fresh ? "Válido até" : "Vencido em"} ${stamp(snapshot.expiresAtMs)}` : "Desconhecida"}</dd></div></dl>
      {snapshot?.clock && <p className={styles.muted}>Referência de tempo: GET {snapshot.clock.endpoint} · {snapshot.clock.transport} · {snapshot.clock.status}. Diferença fonte/local: {snapshot.clock.offsetMs === null ? 'desconhecida' : `${snapshot.clock.offsetMs.toFixed(1)} ms`}; incerteza: {snapshot.clock.uncertaintyMs === null ? 'desconhecida' : `${snapshot.clock.uncertaintyMs.toFixed(1)} ms`}. Instante original da fonte: {stamp(snapshot.clock.serverAtMs)}. O relógio do sistema permanece inalterado.</p>}
      <div className={styles.grid}>
        <article className={styles.card}><h3>Preço mark</h3><p className={styles.value}>{usable ? known(snapshot?.mark?.markPx) : "Desconhecido"}{usable && snapshot?.mark?.markPx && qualifiedUnit ? " USDT por BTC" : ""}</p><p className={styles.muted}>Unidade: {qualifiedUnit ? "SWAP linear, liquidação em USDT" : "instrumento ainda não qualificado"}.</p><p className={styles.muted}>Timestamp da fonte: {stamp(snapshot?.mark?.tsMs)}</p></article>
        <article className={styles.card}><h3>{funding?.method === "current_period" ? "Previsão de funding do ciclo corrente" : "Funding bruto · método sem suporte confirmado"}</h3><p className={styles.value}>{usable ? known(funding?.fundingRate) : "Desconhecido"}</p><p className={styles.muted}>Fração por ciclo, preservada como decimal. Pode mudar antes da liquidação.</p><dl className={styles.metrics}><div><dt>Método</dt><dd>{known(funding?.method)}</dd></div><div><dt>Liquidação do ciclo</dt><dd>{stamp(funding?.fundingTimeMs)}</dd></div><div><dt>Próxima liquidação prevista</dt><dd>{stamp(funding?.nextFundingTimeMs)}</dd></div><div><dt>Intervalo observado</dt><dd>{funding?.intervalMs === null || funding?.intervalMs === undefined ? "Desconhecido" : `${funding.intervalMs / 3_600_000} h`}</dd></div></dl><p className={styles.muted}>Timestamp da fonte: {stamp(funding?.tsMs)}</p></article>
        <article className={styles.card}><h3>{funding?.settState === "settled" ? "Taxa da liquidação anterior" : funding?.settState === "processing" ? "Taxa do ciclo em liquidação" : "Taxa de liquidação · ciclo desconhecido"}</h3><p className={styles.value}>{usable ? known(funding?.settFundingRate) : "Desconhecido"}</p><p className={styles.muted}>Estado: {known(funding?.settState)}. A taxa de liquidação pertence ao ciclo indicado pelo estado.</p><p className={styles.muted}>Campo legado <code>nextFundingRate</code> (descontinuado): {usable ? known(funding?.nextFundingRate) : "Desconhecido"}. Método <code>next_period</code> descontinuado; exige confirmação antes de interpretar uma previsão.</p></article>
        <article className={styles.card}><h3>Capacidade e dependências</h3><dl className={styles.metrics}><div><dt>Documentada</dt><dd>{snapshot?.capability.documented ? "Sim" : "Desconhecido"}</dd></div><div><dt>Implementada</dt><dd>{snapshot?.capability.implemented ? "Sim" : "Desconhecido"}</dd></div><div><dt>Exercitada com fonte real</dt><dd>{real ? "Sim, nesta coleta" : "Não verificada"}</dd></div><div><dt>Integrada ao worker</dt><dd>{snapshot?.capability.integrated ? "Sim" : "Pendente"}</dd></div><div><dt>Elegibilidade financeira</dt><dd>Não qualificada</dd></div><div><dt>Execução</dt><dd>Desabilitada</dd></div></dl>{!!snapshot?.dependencies.length && <ul>{snapshot.dependencies.map((item, index) => <li key={index}>{item}</li>)}</ul>}</article>
      </div>
      <details className={styles.details}><summary>Proveniência das requisições públicas</summary><p className={styles.muted}>HTTP e código de resposta registram a coleta. Um teste injetado permanece não verificado.</p>{snapshot?.requests.length ? <ul className={styles.requests}>{snapshot.requests.map((request, index) => <li key={index}><strong>{request.method} {request.endpoint}</strong><span>HTTP {request.httpStatus ?? "desconhecido"} · código {request.code ?? "desconhecido"}</span><span>Pedido: {stamp(request.requestedAtMs)}</span><span>Resposta: {stamp(request.receivedAtMs)}</span></li>)}</ul> : <p>Requisições ainda desconhecidas.</p>}</details>
    </div>
  </section>;
}

/** Reads only the local worker endpoint. No wallet identity enters this component. */
export function PublicMarket({ apiBase }: { apiBase: string }) {
  const [snapshot, setSnapshot] = useState<PublicMarketData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const retry = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let anchor: { wall: number; mono: number } | null = null;
    setSnapshot(null); setError(null); setNowMs(Date.now());
    const load = async (refresh = false) => {
      if (!active || controller) return;
      const current = new AbortController();
      controller = current;
      setBusy(true);
      const timeout = setTimeout(() => current.abort(), refresh ? 30_000 : 8_000);
      try {
        const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/real/public-market${refresh ? '/refresh' : ''}`, { method: refresh ? "POST" : "GET", headers: { Accept: "application/json" }, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: current.signal });
        if (!response.ok) throw new Error("http");
        const body = await response.text();
        if (body.length > 65_536) throw new Error("bounds");
        const value = parseSnapshot(JSON.parse(body));
        if (active && !current.signal.aborted) {
          const wall = Date.now();
          if (value && (value.observedAtMs > wall + 5_000 || value.expiresAtMs > value.observedAtMs + 60_000)) throw new Error('clock');
          anchor = { wall, mono: performance.now() }; setSnapshot(value); setError(null); setNowMs(wall);
        }
      } catch {
        if (active) { setSnapshot(null); setError("A leitura pública do worker local não foi validada. Atualize para tentar novamente."); }
      } finally {
        clearTimeout(timeout);
        if (controller === current) controller = null;
        if (active) setBusy(false);
      }
    };
    retry.current = () => { void load(true); };
    void load();
    const poll = setInterval(() => { void load(); }, 5_000);
    const clock = setInterval(() => {
      const wall = Date.now(), elapsed = anchor ? performance.now() - anchor.mono : 0;
      if (anchor && (!Number.isFinite(elapsed) || elapsed < 0 || Math.abs(wall - anchor.wall - elapsed) > 250)) {
        anchor = null; setSnapshot(null); setError('Relógio local alterado. Aguarde uma nova leitura pública validada.');
      }
      setNowMs(wall);
    }, 1_000);
    return () => { active = false; controller?.abort(); clearInterval(poll); clearInterval(clock); retry.current = () => {}; };
  }, [apiBase]);
  return <PublicMarketView snapshot={snapshot} nowMs={nowMs} busy={busy} error={error} onRetry={() => retry.current()} />;
}

export default PublicMarket;
