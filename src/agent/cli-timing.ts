import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CliRunner } from "./cli";

/**
 * Cronômetro por comando da CLI do executor. O journal só sabe o tempo da ordem inteira (cotação, simulação, assinatura e
 * transmissão juntas); aqui cada comando é medido à parte: "swap quote" é a cotação do executor, "swap execute" é a
 * simulação, a assinatura e a transmissão dentro da CLI, e "wallet history" é a consulta do recibo. A assinatura continua
 * dentro de "swap execute" porque é a CLI que assina; este é o menor trecho isolável por fora dela.
 * Grava só o nome do comando e a duração: nunca argumentos, endereços, valores nem saída.
 */
export interface CliTimingRecord {
  readonly atMs: number;
  /** Os dois primeiros argumentos ("swap execute"), nunca o resto. */
  readonly command: string;
  readonly ms: number;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
}

export interface CliTimingOptions {
  /** Instante gravado no registro (relógio local). */
  readonly now: () => number;
  /** Relógio de alta resolução em ms, só para medir a duração. Padrão performance.now. */
  readonly hr?: () => number;
  readonly sink: (record: CliTimingRecord) => void;
  /** Falso desliga o cronômetro: passa direto. Lido a cada comando. */
  readonly enabled?: () => boolean;
}

export const commandName = (args: readonly string[]): string => args.slice(0, 2).join(" ");

export function withCliTiming(inner: CliRunner, options: CliTimingOptions): CliRunner {
  const hr = options.hr ?? (() => performance.now());
  return {
    async run(args, runOptions) {
      if (options.enabled?.() === false) return inner.run(args, runOptions);
      const start = hr();
      const atMs = options.now();
      const finish = (exitCode: number | null, timedOut: boolean): void => {
        try {
          options.sink({ atMs, command: commandName(args), ms: Math.max(0, hr() - start), exitCode, timedOut });
        } catch {
          /* medir nunca muda o que a CLI faz */
        }
      };
      try {
        const result = await inner.run(args, runOptions);
        finish(result.exitCode, result.timedOut);
        return result;
      } catch (error) {
        finish(null, false);
        throw error;
      }
    },
  };
}

/** Uma linha JSON por comando, em append; passando de `maxBytes` o arquivo guarda só a metade final. */
export function jsonlTimingSink(path: string, maxBytes = 2_000_000): (record: CliTimingRecord) => void {
  return (record) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`);
    if (statSync(path).size > maxBytes) {
      const lines = readFileSync(path, "utf8").split("\n").filter((l) => l !== "");
      writeFileSync(path, `${lines.slice(Math.floor(lines.length / 2)).join("\n")}\n`);
    }
  };
}
