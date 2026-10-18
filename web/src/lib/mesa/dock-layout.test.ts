// DOC-4: "em qualquer redimensionamento da janela o estado de layout (narrow) segue a mudanca e o foco on-chain nao e perdido".
// The desk mounts the dock twice (one copy for the wide layout, two for a phone); only the copy that is on screen may mount the real
// body, or a view would spend two provider calls, and the surface a view shows (the OKX one or the on-chain one) must come from the
// focus alone, never from the width. Both rules are pure here and tested across a sequence of resizes.
import { describe, expect, test } from "bun:test";
import { NARROW_QUERY, bodyPlan, visibleTabIds, watchNarrow, type NarrowQuery } from "./dock-layout";

function fakeQuery(initial: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: initial,
    addEventListener: (_type: "change", l: () => void) => void listeners.add(l),
    removeEventListener: (_type: "change", l: () => void) => void listeners.delete(l),
  } satisfies NarrowQuery;
  return {
    mq,
    resize(toNarrow: boolean) {
      mq.matches = toNarrow;
      for (const l of [...listeners]) l();
    },
    listeners,
  };
}

describe("watching the width", () => {
  test("the breakpoint is the one the stylesheet uses for the phone layout", () => {
    expect(NARROW_QUERY).toBe("(max-width: 820px)");
  });

  test("it reports the width at once and then every change, reading the query again each time", () => {
    const q = fakeQuery(false);
    const seen: boolean[] = [];
    watchNarrow(q.mq, (n) => seen.push(n));
    q.resize(true);
    q.resize(false);
    q.resize(true);
    expect(seen).toEqual([false, true, false, true]);
  });

  test("stopping the watch removes the listener, so a closed desk is not told about resizes", () => {
    const q = fakeQuery(true);
    const seen: boolean[] = [];
    const stop = watchNarrow(q.mq, (n) => seen.push(n));
    expect(q.listeners.size).toBe(1);
    stop();
    expect(q.listeners.size).toBe(0);
    q.resize(false);
    expect(seen).toEqual([true]);
  });
});

describe("which copy of the dock mounts the real body", () => {
  test("before the width is measured neither copy mounts: both show a placeholder", () => {
    expect(bodyPlan({ narrow: null, copy: "wide", onchainFocus: null }).mount).toBe("carregando");
    expect(bodyPlan({ narrow: null, copy: "phone", onchainFocus: null }).mount).toBe("carregando");
  });

  test("after it, exactly one copy mounts, whatever the width, across a sequence of resizes", () => {
    for (const narrow of [false, true, false, true, true, false]) {
      const mounts = (["wide", "phone"] as const).filter((copy) => bodyPlan({ narrow, copy, onchainFocus: null }).mount === "montar");
      expect(mounts).toEqual([narrow ? "phone" : "wide"]);
    }
  });

  test("the copy that is off screen shows an empty placeholder, never the loading one", () => {
    expect(bodyPlan({ narrow: true, copy: "wide", onchainFocus: null }).mount).toBe("oculto");
    expect(bodyPlan({ narrow: false, copy: "phone", onchainFocus: null }).mount).toBe("oculto");
  });
});

describe("the on-chain focus survives every resize", () => {
  const focus = { chainIndex: "8453", address: "0xabc", symbol: "DEGEN" };

  test("the surface comes from the focus alone: on-chain with a focus, the OKX one without, at any width", () => {
    for (const narrow of [null, false, true, false, true]) {
      for (const copy of ["wide", "phone"] as const) {
        expect(bodyPlan({ narrow, copy, onchainFocus: focus }).surface).toBe("onchain");
        expect(bodyPlan({ narrow, copy, onchainFocus: null }).surface).toBe("okx");
      }
    }
  });

  test("the plan reads nothing but its three inputs: the same input gives the same plan", () => {
    const a = bodyPlan({ narrow: false, copy: "wide", onchainFocus: focus });
    const b = bodyPlan({ narrow: false, copy: "wide", onchainFocus: focus });
    expect(a).toEqual(b);
  });
});

describe("which tabs are on screen", () => {
  test("wide: only the active tab, and none while the dock is collapsed to its bar", () => {
    expect(visibleTabIds({ narrow: false, active: "radar", open: true })).toEqual(["radar"]);
    expect(visibleTabIds({ narrow: false, active: "radar", open: false })).toEqual([]);
  });

  test("an active id that is not a tab shows the first tab, as the panel does", () => {
    expect(visibleTabIds({ narrow: false, active: "livro", open: true })).toEqual(["diario"]);
  });

  test("phone: each of the two sections shows its own active tab, or its first one when the active tab sits in the other section", () => {
    // book section: fluxo, mercado; sources section: diario, radar, carteira
    expect(visibleTabIds({ narrow: true, active: "radar", open: true })).toEqual(["fluxo", "radar"]);
    expect(visibleTabIds({ narrow: true, active: "mercado", open: true })).toEqual(["mercado", "diario"]);
    expect(visibleTabIds({ narrow: true, active: "carteira", open: false })).toEqual(["fluxo", "carteira"]); // the sections never collapse on a phone
  });

  test("before the width is measured nothing is on screen", () => {
    expect(visibleTabIds({ narrow: null, active: "radar", open: true })).toEqual([]);
  });
});
