/**
 * The price per million tokens (T7.4). The provider reports tokens; dollars need a price, and the price is the person's to give
 * (the model is billed by its own provider, and nothing here can know it). It is kept in one small file of the data folder, read
 * strictly at the start and written atomically; anything that is not exactly two positive numbers, or two nulls, is "no price",
 * and with no price the dollar cost stays null instead of being guessed.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface Prices {
  readonly input: number | null;
  readonly output: number | null;
}

const NONE: Prices = { input: null, output: null };
const MAX_USD_PER_MTOK = 10_000;
const price = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= MAX_USD_PER_MTOK;

export function createPriceStore(options: { readonly file: string }) {
  return {
    read(): Prices {
      try {
        const raw: unknown = JSON.parse(readFileSync(options.file, "utf8"));
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return NONE;
        const o = raw as Record<string, unknown>;
        return o.v === 1 && price(o.input) && price(o.output) ? { input: o.input, output: o.output } : NONE;
      } catch {
        return NONE;
      }
    },
    /** False when the file could not be written. */
    write(prices: Prices): boolean {
      try {
        mkdirSync(dirname(options.file), { recursive: true });
        const temp = `${options.file}.tmp`;
        writeFileSync(temp, JSON.stringify({ v: 1, input: prices.input, output: prices.output }));
        renameSync(temp, options.file);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type PriceStore = ReturnType<typeof createPriceStore>;
