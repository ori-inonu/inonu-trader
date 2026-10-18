/**
 * The two source chips that tell the truth about the installed app (INF, DOC): "Inonu" and "OnchainOS". They used to read the old producers (the Jev tape
 * producer, the operator cycle), and in the app nothing of that runs: the model is asked by a click, and the OnchainOS is read by the local gateway. So the
 * chips now read the core itself, `/inonu/status` and `/onchain/status`, two local reads that never call the model or the provider.
 *
 * When the core does not answer (an older backend, a server that is down) a chip is left to the old reading: nothing here invents a state.
 */
import { useEffect, useState } from "react";
import { createInonuClient, type InonuStatus } from "@/lib/inonu/client";
import { createOnchainClient, type OnchainStatus } from "@/lib/onchain/client";
import type { ChipTone, FeedChip } from "./mesa-model";

export interface CoreStatus {
  /** Null: the core did not answer (or is not the app's core), so the chip stays as the old reading made it. */
  readonly inonu: InonuStatus | null;
  readonly gateway: OnchainStatus | null;
}

export interface ChipPatch {
  readonly tone: ChipTone;
  readonly detail: string;
  /** What a live chip says: both sources of the core answer on demand, so they are "pronto", not "ao vivo". */
  readonly word?: string;
}

export interface CoreChips {
  readonly inonu: ChipPatch | null;
  readonly onchainos: ChipPatch | null;
}

const INONU_CHIP_ID = "jev-backend";
const ONCHAINOS_CHIP_ID = "onchainos";

function ageText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

function inonuChip(status: InonuStatus): ChipPatch {
  if (!status.modelConfigured) return { tone: "late", detail: "sem chave do modelo, veja Configuracoes" };
  // the live feed of the engine is what the answer is made from: without it the click would be answered with nothing to read
  const feed = status.engine.feedState;
  if (feed !== null && feed !== "live") return { tone: "late", detail: "pronto, mas o fluxo ao vivo esta fora" };
  return { tone: "live", detail: "pronto, so responde ao clique", word: "pronto" };
}

function gatewayChip(status: OnchainStatus, nowMs: number): ChipPatch {
  if (status.credential === "absent") return { tone: "down", detail: "sem credenciais, veja Configuracoes" };
  if (status.credential === "incomplete") return { tone: "late", detail: "credenciais incompletas, veja Configuracoes" };
  if (status.cooldownUntilMs !== null && status.cooldownUntilMs > nowMs) return { tone: "late", detail: "em pausa por limite da OKX" };
  if (status.lastCallMs === null) return { tone: "live", detail: "pronto, sem leituras ainda", word: "pronto" };
  const age = ageText(nowMs - status.lastCallMs);
  // 0 is the provider's own "ok"; anything else is the code of its last refusal
  if (status.lastCode !== null && status.lastCode !== 0) return { tone: "late", detail: `ultima leitura ha ${age} com erro ${status.lastCode}` };
  return { tone: "live", detail: `ultima leitura ha ${age}`, word: "pronto" };
}

export function coreChips(core: CoreStatus, nowMs: number): CoreChips {
  return {
    inonu: core.inonu === null ? null : inonuChip(core.inonu),
    onchainos: core.gateway === null ? null : gatewayChip(core.gateway, nowMs),
  };
}

/** The same chips, in the same order, with the two of the core replaced where the core answered. */
export function applyCoreChips(chips: readonly FeedChip[], patches: CoreChips): FeedChip[] {
  return chips.map((chip) => {
    const patch = chip.id === INONU_CHIP_ID ? patches.inonu : chip.id === ONCHAINOS_CHIP_ID ? patches.onchainos : null;
    return patch === null ? chip : { ...chip, tone: patch.tone, detail: patch.detail, ...(patch.word === undefined ? {} : { word: patch.word }) };
  });
}

const POLL_MS = 30_000;

/** The two local status reads, once at once and then every 30 s while the page is open. Neither calls the model or the provider. */
export function useCoreStatus(): CoreStatus {
  const [status, setStatus] = useState<CoreStatus>({ inonu: null, gateway: null });
  useEffect(() => {
    let alive = true;
    const inonu = createInonuClient();
    const gateway = createOnchainClient();
    const read = async () => {
      const [i, g] = await Promise.all([inonu.status(), gateway.status("background").catch(() => null)]);
      if (alive) setStatus({ inonu: i, gateway: g });
    };
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return status;
}
