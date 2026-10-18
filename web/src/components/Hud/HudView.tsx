"use client";

/**
 * The command centre of the agent: the Inonu at the centre of a screen that needs no scrolling, every instrument around it, six tabs. The drawing is an SVG string made by pure functions (lib/hud/draw); this
 * component only chooses the tab and the shape, puts the string on screen, runs the parts that follow the clock (lib/hud/live) and turns a click on a drawn button into an action for the page that owns the connection.
 * It reads and decides nothing: the numbers are the core's. The things a person can do (look now, stop, say what became of an order, take the step of the wallet) live in the Sistema tab, in the same drawing.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Analysis, HudAction, HudUi } from "@/lib/hud/types";
import type { AgentStatus } from "@/lib/agent/types";
import { pickLayout, stickyOffset } from "@/lib/hud/draw/layout";
import { buildScene, isTab, TABS, type TabKey } from "@/lib/hud/draw/scene";
import { showCandidate, startCountUp, tickLive, withFacets } from "@/lib/hud/live";
import { buildHudModel } from "@/lib/hud/model";
import { morphChildren } from "@/lib/hud/morph";
import HudRain from "./HudRain";
import CycleReviewPanel from "./CycleReviewPanel";
import "./hud.css";

export interface HudViewProps {
 readonly status: AgentStatus;
 readonly analysis: Analysis | null;
 readonly nowMs: number;
 /** The last HTTP status poll failed; keep rendering this status, but label its figures stale. */
 readonly walletPollFailed?: boolean;
 readonly busy: HudUi["busy"];
 readonly notice: HudUi["notice"];
 readonly onAction: (action: HudAction) => void;
 readonly readOnly?: boolean;
 readonly onReviewPageChange?: (page: number) => void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const ROTATE_MS = 6_500;
const CLOCK_MS = 250;

const hashTab = (): TabKey => {
 if (typeof window === "undefined") return "comando";
 const h = window.location.hash.replace("#", "");
 return isTab(h) ? h : "comando";
};
/** The size of the window the screen is drawn for; a server render (no window) is a full screen, as always. */
const viewNow = (): { readonly w: number; readonly h: number } => (typeof window === "undefined" ? { w: 1920, h: 1080 } : { w: window.innerWidth, h: Math.max(1, window.innerHeight) });

/** A page the person is sent to by a drawn button: an https address, opened in a new window with nothing handed over. */
export function openHttps(raw: string): boolean {
 try {
  const url = new URL(decodeURIComponent(raw));
  if (url.protocol !== "https:") return false;
  window.open(url.toString(), "_blank", "noopener,noreferrer");
  return true;
 } catch {
  return false;
 }
}

export default function HudView({ status, analysis, nowMs, busy, notice, onAction, onReviewPageChange, walletPollFailed = false, readOnly = false }: HudViewProps) {
 const [tab, setTab] = useState<TabKey>(hashTab);
 const [view, setView] = useState(viewNow);
 const [reduce, setReduce] = useState(false);
 const [confirmStop, setConfirmStop] = useState(false);
 const svgRef = useRef<SVGSVGElement | null>(null);
 const rootRef = useRef<HTMLElement | null>(null);
 const select = useRef(0);

 const ui = useMemo<HudUi>(() => ({ busy, notice, confirmStop, walletPollFailed }), [busy, notice, confirmStop, walletPollFailed]);
 const model = useMemo(() => buildHudModel(status, analysis, nowMs, ui), [status, analysis, nowMs, ui]);
 const modelRef = useRef(model);
 modelRef.current = model;
 // the shape follows the size of the window: the stage where it can be read, otherwise a board of columns or one narrow column (draw/layout.ts)
 const layout = useMemo(() => pickLayout(view.w, view.h), [view.w, view.h]);
 const aspect = view.w / Math.max(1, view.h);
 const scene = useMemo(() => buildScene(model, tab, aspect, layout), [model, tab, aspect, layout]);

 // the shape of the screen, measured again whenever the window is resized or turned (after the person stops: a drag fires many)
 useEffect(() => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onResize = (): void => {
   clearTimeout(timer);
   timer = setTimeout(() => setView((was) => { const now = viewNow(); return was.w === now.w && was.h === now.h ? was : now; }), 100);
  };
  // the first measure is taken here too: the window may not have the size it had when the state was made (a pane that was opened, a screen that was rotated)
  onResize();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  return () => {
   clearTimeout(timer);
   window.removeEventListener("resize", onResize);
   window.removeEventListener("orientationchange", onResize);
  };
 }, []);

 // the stage is the whole screen at once: while it is on, the page itself has no scrollbar, and what the page had is restored when the board or the column takes over
 useEffect(() => {
  if (scene.tall) return;
  const html = document.documentElement, body = document.body;
  const before = { html: html.style.overflow, body: body.style.overflow };
  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  return () => {
   html.style.overflow = before.html;
   body.style.overflow = before.body;
  };
 }, [scene.tall]);

 useEffect(() => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  setReduce(query.matches);
  const on = (): void => setReduce(query.matches);
  query.addEventListener("change", on);
  return () => query.removeEventListener("change", on);
 }, []);

 /** In a scene that scrolls, the tabs keep to the top of the window: the group is moved by how far the page has gone, and its plate shows once it has left its own place. */
 const syncSticky = (): void => {
  const root = rootRef.current, svg = svgRef.current;
  if (root === null || svg === null) return;
  const head = svg.querySelector<SVGGElement>(".sticky-head");
  const unit = svg.getBoundingClientRect().width / Math.max(1, svg.viewBox.baseVal.width);
  const off = head === null ? 0 : stickyOffset(root.scrollTop, unit, Number(head.getAttribute("data-top")));
  if (head !== null) head.style.transform = off > 0 ? `translateY(${off.toFixed(1)}px)` : "";
  svg.classList.toggle("stuck", off > 0);
 };

 const go = (next: TabKey): void => {
  if (next === tab) return;
  setTab(next);
  rootRef.current?.scrollTo({ top: 0 });
  setConfirmStop(false);
  try { window.history.replaceState(null, "", "#" + next); } catch { /* the address bar is a convenience */ }
 };

 // keys: 1 to 6 change the tab
 useEffect(() => {
  const onKey = (e: KeyboardEvent): void => {
   if (e.ctrlKey || e.metaKey || e.altKey) return;
   const i = Number(e.key) - 1;
   if (Number.isInteger(i) && i >= 0 && i < TABS.length) go(TABS[i]![0]);
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
 }, [tab]);

 useEffect(() => {
  const label = TABS.find((t) => t[0] === tab)?.[1] ?? "";
  const before = document.title;
  document.title = `Inonu Trader, ${label.toLowerCase()}`;
  return () => { document.title = before; };
 }, [tab]);

 // The drawing goes on screen whole only when the PAGE changes (the first one, another tab, the column of a narrow screen against the stage of a wide one): then the entrance plays, and the numbers count up once. When
 // the core answers again with new data the elements that are the same stay the same element and only what changed is written, so nothing that moves (the rings, the flows) starts over and nothing sweeps the screen.
 const pageKey = `${tab}|${scene.key}`;
 const shown = useRef("");
 useEffect(() => {
  const svg = svgRef.current;
  if (svg === null) return;
  const entering = shown.current !== pageKey;
  if (entering) {
   svg.innerHTML = scene.html;
   shown.current = pageKey;
  } else {
   const next = document.createElementNS(SVG_NS, "svg");
   next.innerHTML = scene.html;
   morphChildren(svg, next);
  }
  // what follows the clock and the selection is written again over what the template holds
  tickLive(svg, modelRef.current, Date.now());
  syncSticky();
  const order = withFacets(modelRef.current);
  if (order.length > 0) showCandidate(svg, modelRef.current, order[select.current % order.length]!);
  if (reduce) { svg.pauseAnimations?.(); return; }
  return entering ? startCountUp(svg) : undefined;
 }, [scene.html, pageKey, reduce]);

 // the clock and the countdown follow the time, not the data
 useEffect(() => {
  const timer = setInterval(() => { if (svgRef.current !== null) tickLive(svgRef.current, modelRef.current, Date.now()); }, CLOCK_MS);
  return () => clearInterval(timer);
 }, []);

 // the flower of facets shows one candidate after the other
 useEffect(() => {
  if (reduce) return;
  const timer = setInterval(() => {
   const svg = svgRef.current;
   const order = withFacets(modelRef.current);
   if (svg === null || order.length < 2) return;
   select.current = (select.current + 1) % order.length;
   showCandidate(svg, modelRef.current, order[select.current]!);
  }, ROTATE_MS);
  return () => clearInterval(timer);
 }, [reduce]);

 /** A drawn button was pressed (by click, Enter or Space): what it asks, if the page allows it now. */
 const press = (el: Element): void => {
  const act = el.getAttribute("data-action");
  if (act === null || el.getAttribute("aria-disabled") === "true") return;
  if (readOnly) return;
  switch (act) {
   case "stop": setConfirmStop(true); break;
   case "stop-cancel": setConfirmStop(false); break;
   case "stop-confirm": setConfirmStop(false); onAction({ kind: "stop" }); break;
   case "settings": onAction({ kind: "settings" }); break;
   case "wallet": {
    const step = el.getAttribute("data-step");
    if (step === "install" || step === "login") onAction({ kind: "wallet", step });
    break;
   }
   case "resolve": {
    const key = el.getAttribute("data-key"), outcome = el.getAttribute("data-outcome");
    if (key !== null && (outcome === "executada" || outcome === "falhou")) onAction({ kind: "resolve", key, outcome });
    break;
   }
   case "open": {
    const url = el.getAttribute("data-url");
    if (url !== null) openHttps(url);
    break;
   }
  }
 };

 const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
  const target = e.target as Element;
  const tabEl = target.closest("[data-tab]");
  if (tabEl !== null) {
   const k = tabEl.getAttribute("data-tab");
   if (isTab(k)) go(k);
   return;
  }
  const button = target.closest("[data-action], .btn");
  if (button !== null) { press(button); return; }
  const blip = target.closest(".blip");
  if (blip !== null) {
   const i = Number(blip.getAttribute("data-i"));
   const order = withFacets(modelRef.current);
   const k = order.indexOf(i);
   if (k >= 0 && svgRef.current !== null) { select.current = k; showCandidate(svgRef.current, modelRef.current, i); }
  }
 };

 const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
  const target = e.target as Element;
  const tabEl = target.closest("[data-tab]");
  if (tabEl !== null) {
   const k = tabEl.getAttribute("data-tab");
   if ((e.key === "Enter" || e.key === " ") && isTab(k)) { e.preventDefault(); go(k); }
   else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const items = Array.from(e.currentTarget.querySelectorAll<SVGElement>("[data-tab]"));
    const at = items.indexOf(tabEl as SVGElement);
    items[(at + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length]?.focus();
   }
   return;
  }
  const button = target.closest("[data-action]");
  if (button !== null && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); press(button); }
 };


 const waiting = model.system.inFlight.filter((o) => o.needsWord).length;
 const stopped = model.agent.cycling ? "" : " O agente esta parado: so acompanhamento, nenhuma ordem sai.";
 const money = model.wallet.total === null ? "Carteira gerida sem leitura" : `Carteira gerida US$ ${model.wallet.total.toFixed(2)}, caixa ${model.wallet.cash === null ? "sem leitura" : "US$ " + model.wallet.cash.toFixed(2)}`;
 const summary = `${money}.${stopped} ${model.candidates.length} candidatos na ultima consulta, ${model.events.length} ordens recentes.${waiting > 0 ? ` ${waiting} ordem aguarda a sua palavra na aba Sistema.` : ""}`;

 const walletStatus = ui.walletPollFailed && model.wallet.quality === "unavailable"
  ? "A ultima consulta de status falhou; nao ha leitura bem-sucedida da carteira gerida."
  : ui.walletPollFailed
   ? `A ultima consulta de status falhou; valores exibidos mantidos da observacao ${model.wallet.observedAtMs === null ? "indisponivel" : new Date(model.wallet.observedAtMs).toLocaleTimeString()}.`
   : model.wallet.quality === "current"
    ? null
    : model.wallet.quality === "partial"
     ? `Leitura parcial: ${model.wallet.unpriced} posicao(oes) gerida(s) sem preco${model.wallet.observedAtMs === null ? "" : `; observada em ${new Date(model.wallet.observedAtMs).toLocaleTimeString()}`}.`
     : model.wallet.quality === "stale"
      ? `Leitura antiga da carteira gerida${model.wallet.observedAtMs === null ? "" : `; ultima observacao em ${new Date(model.wallet.observedAtMs).toLocaleTimeString()}`}.`
      : "Carteira gerida indisponivel: ainda nao ha leitura bem-sucedida.";
 return (
  <main ref={rootRef} className={`hud-root${scene.tall ? " hud-tall" : ""}`} aria-label="Painel do agente" onScroll={syncSticky}>
   {readOnly ? <p className="hud-readonly-banner" role="status">Modo dev somente leitura. Navegação local entre abas e dados é permitida; ações do agente e da carteira estão bloqueadas.</p> : null}
   {walletStatus === null ? null : <p className="hud-wallet-status" role="status">{walletStatus}</p>}
   <HudRain />
   <h1 className="hud-sr">Inonu Trader, agente autonomo de carteira</h1>
   <p className="hud-sr" aria-live="polite">{summary}</p>
   <svg
    ref={svgRef}
    className="hud-svg"
    xmlns="http://www.w3.org/2000/svg"
    viewBox={`0 0 ${scene.width.toFixed(2)} ${scene.height.toFixed(2)}`}
    preserveAspectRatio="xMidYMid meet"
    role="group"
    aria-label="Painel do agente"
    onClick={onClick}
    onKeyDown={onKeyDown}
   />
   <CycleReviewPanel reviews={analysis?.cycleReviews ?? []} pageInfo={analysis?.cycleReviewPage ?? { page: 1, pageSize: 12, total: 0, totalPages: 1 }} onPageChange={onReviewPageChange} />
  </main >
 );
}
