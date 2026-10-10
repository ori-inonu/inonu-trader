import { parseDexReport, type NormalizedDexReport } from "./dex-report";

export interface DexReportImportState {
  report: NormalizedDexReport | null;
  error: string | null;
  loading: boolean;
  isExample: boolean;
  ageSinceImportMs: number | null;
}

export interface DexReportFile {
  size: number;
  text(): Promise<string>;
}

export interface DexReportController {
  getSnapshot(): DexReportImportState;
  selectFile(file?: DexReportFile | null): Promise<void>;
  showExample(value: unknown): void;
  clear(): void;
  unmount(): void;
  tick(): void;
}

export interface DexReportControllerOptions {
  onChange?: (state: DexReportImportState) => void;
  nowWallMs?: () => number;
  nowMonotonicMs?: () => number;
}

const GENERIC_IMPORT_ERROR = "Não foi possível validar o relatório DEX.";
const MAX_REPORT_BYTES = 65_536;

function emptyState(): DexReportImportState {
  return {
    report: null,
    error: null,
    loading: false,
    isExample: false,
    ageSinceImportMs: null,
  };
}

export function createDexReportController(options: DexReportControllerOptions = {}): DexReportController {
  let state = emptyState();
  let generation = 0;
  let mounted = true;
  let monotonicAnchor: number | null = null;
  let lastMonotonic: number | null = null;
  let ageUnknown = false;

  const publish = (next: DexReportImportState) => {
    state = next;
    if (mounted) options.onChange?.(next);
  };

  const readMonotonic = (): number => {
    if (options.nowMonotonicMs) return options.nowMonotonicMs();
    if (typeof performance === "undefined") return Number.NaN;
    return performance.now();
  };

  const acceptReport = (report: NormalizedDexReport, isExample: boolean) => {
    let monotonic: number;
    try {
      monotonic = readMonotonic();
    } catch {
      monotonic = Number.NaN;
    }
    const validMonotonic = Number.isFinite(monotonic) && monotonic >= 0;
    monotonicAnchor = validMonotonic ? monotonic : null;
    lastMonotonic = validMonotonic ? monotonic : null;
    ageUnknown = !validMonotonic;
    publish({
      report,
      error: null,
      loading: false,
      isExample,
      ageSinceImportMs: validMonotonic ? 0 : null,
    });
  };

  const startSelection = (): number => {
    const currentGeneration = ++generation;
    monotonicAnchor = null;
    lastMonotonic = null;
    ageUnknown = false;
    publish({ ...emptyState(), loading: true });
    return currentGeneration;
  };

  return {
    getSnapshot: () => state,
    selectFile: async (file) => {
      if (file === undefined || file === null) return;
      const currentGeneration = startSelection();
      if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_REPORT_BYTES) {
        publish({ ...emptyState(), error: GENERIC_IMPORT_ERROR });
        return;
      }
      try {
        const nowWallMs = options.nowWallMs ? options.nowWallMs() : Date.now();
        const text = await file.text();
        if (!mounted || currentGeneration !== generation) return;
        if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > MAX_REPORT_BYTES) {
          throw new Error(GENERIC_IMPORT_ERROR);
        }
        const parsedJson: unknown = JSON.parse(text);
        const report = parseDexReport(parsedJson, { nowWallMs });
        if (!mounted || currentGeneration !== generation) return;
        acceptReport(report, false);
      } catch {
        if (!mounted || currentGeneration !== generation) return;
        publish({ ...emptyState(), error: GENERIC_IMPORT_ERROR });
      }
    },
    showExample: (value) => {
      const currentGeneration = startSelection();
      try {
        const nowWallMs = options.nowWallMs ? options.nowWallMs() : Date.now();
        const report = parseDexReport(value, { nowWallMs });
        if (!mounted || currentGeneration !== generation) return;
        acceptReport(report, true);
      } catch {
        if (!mounted || currentGeneration !== generation) return;
        publish({ ...emptyState(), error: GENERIC_IMPORT_ERROR });
      }
    },
    clear: () => {
      generation += 1;
      publish(emptyState());
    },
    unmount: () => {
      generation += 1;
      mounted = false;
      monotonicAnchor = null;
      lastMonotonic = null;
      ageUnknown = true;
      state = emptyState();
    },
    tick: () => {
      if (state.report === null || ageUnknown || monotonicAnchor === null || lastMonotonic === null) return;
      let monotonic: number;
      try {
        monotonic = readMonotonic();
      } catch {
        monotonic = Number.NaN;
      }
      if (!Number.isFinite(monotonic) || monotonic < lastMonotonic) {
        ageUnknown = true;
        publish({ ...state, ageSinceImportMs: null });
        return;
      }
      lastMonotonic = monotonic;
      const elapsed = monotonic - monotonicAnchor;
      if (!Number.isFinite(elapsed) || elapsed < 0) {
        ageUnknown = true;
        publish({ ...state, ageSinceImportMs: null });
        return;
      }
      publish({ ...state, ageSinceImportMs: Math.floor(elapsed) });
    },
  };
}
