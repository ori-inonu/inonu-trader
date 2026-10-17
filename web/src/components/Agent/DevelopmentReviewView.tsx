"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CycleReviewPanel from "@/components/Hud/CycleReviewPanel";
import { createAgentClient } from "@/lib/agent/client";
import type { Analysis } from "@/lib/hud/types";
import { devStatusPollFailed, devStatusPollSucceeded } from "@/lib/agent/dev-status-poll";
import type { DevStatusPollState } from "@/lib/agent/dev-status-poll";

const POLL_MS = 6_000;

type LoadState = "loading" | "ready" | "unavailable";

const money = (value: number | null): string => value === null ? "desconhecido" : `US$ ${value.toFixed(2)}`;
const timestamp = (value: number | null): string => value === null ? "desconhecido" : new Date(value).toLocaleString();

export default function DevelopmentReviewView() {
 const client = useMemo(() => createAgentClient(), []);
 const [analysis, setAnalysis] = useState<Analysis | null>(null);
 const [load, setLoad] = useState<LoadState>("loading");
 const [statusPoll, setStatusPoll] = useState<DevStatusPollState>({ status: null, unavailable: false });
 const [reviewPage, setReviewPage] = useState(1);
 const reviewPageRef = useRef(1);
 const requestGeneration = useRef(0);
 const statusGeneration = useRef(0);


 useEffect(() => {
  let active = true;
  const refresh = async (): Promise<void> => {
   const generation = ++statusGeneration.current;
   const result = await client.devStatus();
   if (!active || generation !== statusGeneration.current) return;
   if (!result.ok) {
    setStatusPoll((previous) => devStatusPollFailed(previous));
    return;
   }
   setStatusPoll(devStatusPollSucceeded(result.status));
  };
  void refresh();
  const poll = setInterval(() => void refresh(), POLL_MS);
  return () => {
   active = false;
   clearInterval(poll);
  };
 }, [client]);
 useEffect(() => {
  let active = true;
  const refresh = async (): Promise<void> => {
   const generation = ++requestGeneration.current;
   const result = await client.analysis(reviewPage);
   if (!active || generation !== requestGeneration.current || reviewPageRef.current !== reviewPage) return;
   if (!result.ok) {
    setLoad("unavailable");
    return;
   }
   setAnalysis(result.analysis);
   setLoad("ready");
  };
  void refresh();
  const poll = setInterval(() => void refresh(), POLL_MS);
  return () => {
   active = false;
   clearInterval(poll);
  };
 }, [client, reviewPage]);
 const onReviewPageChange = (page: number): void => {
  if (page < 1 || page > 10 || page === reviewPageRef.current) return;
  reviewPageRef.current = page;
  requestGeneration.current += 1;
  setReviewPage(page);
 };

 return <main aria-label="Revisão de ciclos em desenvolvimento" style={{ minHeight: "100vh", padding: 24, boxSizing: "border-box", color: "#e7edf5", background: "#101722", font: "14px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace" }}>
  <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>Revisão de ciclos JEV</h1>
  <p style={{ margin: 0, color: "#aab7c7" }}>Modo de desenvolvimento somente leitura. Status em cache e análise atualizados a cada 6 segundos. Não lê status operacional da carteira nem envia ações.</p>
  <section aria-label="Status seguro em cache" style={{ margin: "12px 0", padding: 12, border: "1px solid #344253", borderRadius: 8 }}>
   <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>Status em cache</h2>
   <p role="status" aria-live="polite" style={{ margin: 0, color: statusPoll.unavailable ? "#f3c66a" : "#aab7c7" }}>
    {statusPoll.unavailable ? `Status indisponível${statusPoll.status === null ? "" : "; exibindo o último snapshot conhecido."}` : statusPoll.status === null ? "Status desconhecido; lendo projeção em cache." : `Status recebido às ${timestamp(statusPoll.status.atMs)}.`}
   </p>
   <p style={{ margin: "4px 0" }}>Conectado: {statusPoll.status === null ? "desconhecido" : statusPoll.status.connected ? "sim" : "não"}</p>
   <p style={{ margin: "4px 0" }}>Livro: {statusPoll.status === null || statusPoll.status.book === null ? "indisponível ou desconhecido" : statusPoll.status.book.quality}</p>
   {statusPoll.status === null || statusPoll.status.book === null ? null : <>
    <p style={{ margin: "4px 0" }}>Observado em: {timestamp(statusPoll.status.book.observedAtMs)}; projeção: {timestamp(statusPoll.status.book.atMs)}</p>
    <p style={{ margin: "4px 0" }}>Total: {money(statusPoll.status.book.totalUsd)}, Agente: {money(statusPoll.status.book.agentUsd)}, Caixa: {money(statusPoll.status.book.cashUsd)}</p>
   </>}
  </section>
  <p role="status" aria-live="polite" style={{ margin: "8px 0", color: load === "unavailable" ? "#f3c66a" : "#aab7c7" }}>
   {load === "loading" ? "Lendo a análise do core." : load === "unavailable" ? "Análise indisponível. Confirme que o core local está ativo e atualizado." : `Análise atualizada. Ciclos revisados: ${analysis?.cycleReviewPage?.total ?? 0}.`}
  </p>
  {analysis === null ? null : <CycleReviewPanel reviews={analysis.cycleReviews ?? []} pageInfo={analysis.cycleReviewPage} onPageChange={onReviewPageChange} />}
 </main>;
}
