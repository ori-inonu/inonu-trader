"use client";

import type { CycleReview, CycleReviewFinding, CycleReviewPage } from "@/lib/hud/types";

const findingText: Readonly<Record<CycleReviewFinding["code"], { readonly title: string; readonly action: string }>> = {
 input_unknown: { title: "Entrada desconhecida", action: "Verifique a fonte e a idade desta evidência antes de usá-la." },
 data_stale: { title: "Dado vencido", action: "Confirme uma leitura atual antes de usar esta evidência." },
 stance_diverged: { title: "Pedido e aplicação divergem", action: "Revise o gate registrado; esta revisão não ajusta a política." },
 estimated_cost_unknown: { title: "Custo estimado desconhecido", action: "Confirme a cotação antes de avaliar o custo." },
 realized_fee_unknown: { title: "Taxa realizada desconhecida", action: "Confirme o recibo. Uma taxa em lamports isolada não informa custo USD nem retorno líquido." },
 order_uncertain: { title: "Ordem incerta", action: "Confirme o recibo pela chave da ordem antes de concluir a execução." },
 outcome_unmeasured: { title: "Resultado ainda não medido", action: "Confirme a coleta e a disponibilidade do preço da janela antes de avaliar o resultado." },
};
const windowStatusText: Readonly<Record<"pending" | "measured" | "unknown" | "unmeasured", string>> = {
 pending: "Pendente",
 measured: "Medido",
 unknown: "Indisponível",
 unmeasured: "Não medido",
};
const time = (value: number): string => {
 const date = new Date(value);
 return Number.isNaN(date.getTime()) ? "Data desconhecida" : date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
};
const evidence = (value: unknown): string => typeof value === "string" ? value : JSON.stringify(value);
const freshness = (review: CycleReview["freshness"], candidateId?: string): string => {
 if (review.status === "unknown" || review.ageMin === null) return "Idade do campo desconhecida";
 const source = review.source ?? "campo desconhecido";
 const note = source === "evidence.tm.ag" ? " (inicio da barra 1h mais recente)"
  : source === "evidence.mo.ag" ? " (inicio da barra 5m mais recente)"
   : source === "context.s1_idade_min" ? " (idade informada pelo contexto)"
    : source === "evidence.ag" ? ` (posicoes.${candidateId ?? "<id>"}.ag: idade dos fatos de price-info; timestamp do provedor quando disponivel, senao idade da cache do gateway mais o tempo desde a leitura; nao e idade do saldo ou da posicao desde a entrada, nem prova frescor na origem sem timestamp do provedor)` : "";
 return review.status === "data_stale"
  ? `Idade registrada ${review.ageMin} min (campo ${source}) excede o limite registrado${note}`
  : `Idade registrada ${review.ageMin} min (campo ${source})${note}`;
};

function Findings({ items }: { readonly items: readonly CycleReviewFinding[] }) {
 if (items.length === 0) return <p style={{ margin: "4px 0", color: "#aab7c7" }}>Nenhum achado acionavel nos fatos registrados.</p>;
 return <ul style={{ margin: "4px 0 8px", paddingLeft: 18 }}>
  {items.map((item, index) => {
   const text = findingText[item.code];
   return <li key={`${item.code}-${item.candidateId ?? "cycle"}-${item.orderKey ?? ""}-${index}`} style={{ margin: "4px 0" }}>
    <strong>{text.title}</strong>: {text.action}
    {item.decision ? <span> Decisao relacionada: {item.decision}.</span> : null}
    {item.orderKey ? <span> Chave base da ordem: {item.orderKey}.</span> : null}
    {item.fields.length ? <span> Campos: {item.fields.join(", ")}.</span> : null}
    {item.window ? <span> Janela: {item.window}.</span> : null}
   </li>;
  })}
 </ul>;
}

export default function CycleReviewPanel({ reviews, pageInfo, onPageChange }: {
 readonly reviews: readonly CycleReview[];
 readonly pageInfo?: CycleReviewPage;
 readonly onPageChange?: (page: number) => void;
}) {
 const paging = pageInfo ?? { page: 1, pageSize: 12, total: reviews.length, totalPages: 1 };
 const visible = reviews.slice().reverse();
 const firstCycle = paging.total === 0 ? 0 : (paging.page - 1) * paging.pageSize + 1;
 const lastCycle = Math.min(paging.page * paging.pageSize, paging.total);
 const changePage = (page: number): void => { if (page !== paging.page) onPageChange?.(page); };
 return <aside aria-label="Revisao por ciclo" style={{ position: "fixed", zIndex: 30, right: 12, bottom: 12, width: "min(620px, calc(100vw - 24px))", maxHeight: "52vh", overflow: "auto", boxSizing: "border-box", padding: 12, color: "#e7edf5", background: "rgba(9, 16, 27, 0.96)", border: "1px solid #506179", borderRadius: 8, font: "12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace", boxShadow: "0 8px 28px rgba(0,0,0,.45)" }}>
  <details>
   <summary style={{ cursor: "pointer", color: "#f3c66a", fontWeight: 600 }}>Revisao por ciclo ({paging.total} retidos, maximo 120)</summary>
   {visible.length === 0 ? <p style={{ margin: 0, color: "#aab7c7" }}>Nenhum ciclo valido para revisao neste core antigo ou sem fatos suficientes.</p> : <>
    <p style={{ margin: "8px 0", color: "#aab7c7" }}>A revisao usa fatos congelados antes da decisao. Resultados posteriores aparecem separados.</p>
    {visible.map((review) => <details key={review.cycleId} style={{ borderTop: "1px solid #34445b", padding: "7px 0" }}>
     <summary style={{ cursor: "pointer", color: "#f3c66a" }}>{time(review.atMs)} | {review.cycleId} | {review.items.length} itens{review.itemsTruncated ? " ou mais" : ""}</summary>
     <div style={{ padding: "6px 0 0" }}>
      <p style={{ margin: "0 0 4px" }}>Brief congelado: {review.frozen.briefHash ?? "hash indisponivel"}.</p>
      {review.frozen.context ? <p style={{ margin: "0 0 4px", overflowWrap: "anywhere" }}>Contexto congelado: {Object.entries(review.frozen.context).map(([key, value]) => `${key}=${value ?? "unknown"}`).join("; ")}</p> : <p style={{ margin: "0 0 4px" }}>Contexto congelado indisponivel.</p>}
      {review.frozen.history ? <p style={{ margin: "0 0 4px", overflowWrap: "anywhere" }}>Historico congelado: {Object.entries(review.frozen.history).map(([key, row]) => `${key} ${Object.entries(row).map(([field, value]) => `${field}=${value ?? "unknown"}`).join(", ")}`).join("; ")}</p> : <p style={{ margin: "0 0 4px" }}>Historico congelado indisponivel.</p>}
      <Findings items={review.findings} />
      {review.items.map((item) => <section key={item.candidateId} style={{ margin: "8px 0", padding: 8, background: "rgba(255,255,255,.035)", borderLeft: "2px solid #7890ad", overflowWrap: "anywhere" }}>
       <strong>{item.kind === "buy" ? "Candidato" : "Posicao"}: {item.candidateId}</strong>
       {item.kind === "holding" && item.frozen.evidence?.pt !== undefined ? <div>Timestamp reportado na resposta normalizada de price-info: {item.frozen.evidence.pt === 1 ? "sim" : "nao"}. Nao e verificacao independente de frescor, relogio, autenticidade, preco ou saldo.</div> : null}
       <div>Solicitado: {item.requested ?? "desconhecido"} | Aplicado: {item.applied ?? "desconhecido"}. {freshness(item.freshness, item.kind === "holding" ? item.candidateId : undefined)}.</div>
       {item.gate ? <div>Gate: {item.gate.asked} para {item.gate.applied}; razao {item.gate.reason ?? "desconhecida"}.</div> : null}
       {item.order ? <><div>Ordem vinculada pela chave exata {item.order.orderKey}, etapa {item.order.stage}. Etapas aplicada ou enviando nao confirmam; fills e recibos vinculados aparecem abaixo.</div><div>Motivo local (nao prova resultado on-chain): {item.order.reason ?? "nao registrado"}.</div></> : null}
       {item.decision.action || item.decision.inaction ? <div>Decisao registrada: {item.decision.action ? `${item.decision.action.side} ${item.decision.action.stance ?? "sem postura"} (chave ${item.decision.action.key})` : "sem acao"}; inacao: {item.decision.inaction ? `${item.decision.inaction.side} ${item.decision.inaction.stance ?? "sem postura"} (chave ${item.decision.inaction.key})` : "sem registro"}.</div> : null}
       {item.decision.action?.estimatedCostUsd !== null && item.decision.action?.estimatedCostUsd !== undefined ? <div>Custo USD estimado na cotacao: {item.decision.action.estimatedCostUsd.toFixed(4)}. Nao e taxa realizada.</div> : null}
       {item.frozen.evidence ? <div>Evidencia do brief: {Object.entries(item.frozen.evidence).map(([key, value]) => `${key}=${evidence(value)}`).join("; ")}</div> : <div>Evidencia detalhada do brief indisponivel.</div>}
       {item.results.fills.length ? <div>Resultado posterior: {item.results.fills.map((fill) => `ordem ${fill.orderKey}, ${fill.side}, taxa ${fill.walletFeeLamports === null ? "desconhecida" : `${fill.walletFeeLamports} lamports`}`).join("; ")}. Taxa isolada nao e custo USD nem retorno liquido.</div> : <div>Resultado posterior: nenhum fill vinculado por chave exata foi encontrado nos fatos disponiveis.</div>}
       {[...item.results.action.map((row) => ({ ...row, kind: "ação" })), ...item.results.inaction.map((row) => ({ ...row, kind: "inação" }))].map((row) => <div key={`${row.kind}-${row.window}`}>Medição posterior {row.kind} {row.window}: {windowStatusText[row.status]}{row.movePct === null ? "" : `, variação ${row.movePct.toFixed(2)}%`}{row.reason ? `, motivo ${row.reason}` : ""}.</div>)}
       <Findings items={item.findings} />
      </section>)}
      {review.itemsTruncated ? <p>Lista de candidatos limitada pelo contrato de revisao; nao representa todos os itens.</p> : null}
     </div>
    </details>)}
    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
     <button type="button" aria-label="Ir a primeira pagina de revisoes" disabled={paging.page <= 1 || onPageChange === undefined} onClick={() => changePage(1)}>Mais recentes</button>
     <button type="button" aria-label="Pagina anterior de revisoes" disabled={paging.page <= 1 || onPageChange === undefined} onClick={() => changePage(paging.page - 1)}>Anterior</button>
     <span>Pagina {paging.page} de {paging.totalPages}; ciclos {firstCycle} a {lastCycle} de {paging.total}.</span>
     <button type="button" aria-label="Proxima pagina de revisoes" disabled={paging.page >= paging.totalPages || onPageChange === undefined} onClick={() => changePage(paging.page + 1)}>Proxima</button>
     <button type="button" aria-label="Ir a ultima pagina de revisoes" disabled={paging.page >= paging.totalPages || onPageChange === undefined} onClick={() => changePage(paging.totalPages)}>Mais antigas</button>
    </div>
   </>}
  </details>
 </aside >;
}
