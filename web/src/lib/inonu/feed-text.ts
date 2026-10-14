/**
 * The words about how the flow engine is doing, shared by everything that tells it (the signal strip above the chart, the Zonas view
 * of the Radar tab, the Fluxo tab): live or by query, how far the warm-up is, how many zones, or exactly why it is not reading.
 */
import type { ChartOverlay } from "./overlay";
import type { OverlayFeedState } from "./overlay-feed";

export const REASON_TEXT: Readonly<Record<string, string>> = {
  alvo_invalido: "instrumento invalido",
  instrumento_nao_suportado: "sem fluxo para este tipo de instrumento",
  sem_conexao: "sem conexao com o nucleo",
  servidor_sem_rota: "fluxo indisponivel no servidor conectado, verifique Diagnostico",
  origem_negada: "origem negada pelo nucleo",
  resposta_invalida: "leitura invalida do nucleo",
};

/** One line about the engine: live or by query, how far the warm-up is, how many zones, or exactly why it is not reading. */
export function flowStatusText(feed: OverlayFeedState | null): string {
  if (feed === null) return "";
  if (feed.status === "loading") return "lendo o fluxo";
  if (feed.status === "ok" && feed.overlay !== null) return okText(feed.overlay);
  const reason = feed.reason ?? "";
  const base = REASON_TEXT[reason] ?? (reason.startsWith("okx_") ? "a OKX nao respondeu" : "falha ao ler o fluxo");
  return feed.overlay !== null ? `${base}, ultima leitura mantida` : base;
}

function okText(o: ChartOverlay): string {
  const parts = [o.fonte === "okx_ws_trades" ? "fluxo ao vivo" : "fluxo por consulta, sem ao vivo"];
  if (!o.aquecimento.pronto) parts.push(`aquecendo ${o.aquecimento.fechadas}/${o.aquecimento.necessarias}`);
  else if (o.aquecimento.restaurado > 0) parts.push(`com historico salvo (${o.aquecimento.restaurado} min)`);
  if (o.zonas.length > 0) parts.push(o.zonas.length === 1 ? "1 zona" : `${o.zonas.length} zonas`);
  return parts.join(", ");
}
