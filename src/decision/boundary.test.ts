import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Contrato de fronteira entre o motor de decisão (este módulo) e o resto do sistema, verificado no código-fonte.
 * O motor é puro e só tem modos replay e paper: não tem rede, assinatura, transmissão, segredo nem estado global.
 * A experimentação (Auto Research) entra apenas por parâmetros (`Limits`, `Costs`, `HealthConfig`) e por oportunidades;
 * nada aqui importa o motor de produção em `src/agent`, os conectores OKX ou a carteira.
 */
const DIR = import.meta.dir;
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), "utf8") }));

/** Quem pode tocar o disco: só o log de motivos. */
const MAY_USE_FS = new Set(["log.ts"]);
/** Quem pode medir tempo de parede: só o runner, como padrão da telemetria (o relógio de decisão é sempre injetado). */
const MAY_USE_PERFORMANCE_NOW = new Set(["runner.ts"]);

const imports = (text: string): string[] => [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);

describe("fronteira do motor de decisão", () => {
  test("encontra os módulos do motor", () => {
    expect(sources.map((s) => s.file)).toEqual(expect.arrayContaining(["pipeline.ts", "runner.ts", "paper-port.ts", "executor-health.ts", "log.ts"]));
  });

  test("não importa o motor de produção, conectores nem carteira", () => {
    const forbidden = [/\.\.\/agent/, /\.\.\/onchainos/, /\.\.\/onchain-read/, /\.\.\/real\//, /\.\.\/okx-/, /\.\.\/trader/, /\.\.\/market/, /\.\.\/chain/, /\.\.\/operator/, /^ethers/, /kuru/i];
    for (const { file, text } of sources) {
      for (const spec of imports(text)) expect(forbidden.some((re) => re.test(spec)), `${file} importa ${spec}`).toBe(false);
    }
  });

  test("só importa de dentro do módulo, com a única exceção da trava de arquivo do log", () => {
    for (const { file, text } of sources) {
      for (const spec of imports(text)) {
        const ok = spec.startsWith("./") || spec.startsWith("node:") || spec === "../consensus/quota";
        expect(ok, `${file} importa ${spec}`).toBe(true);
      }
    }
  });

  test("sem rede, processo filho, ambiente nem segredos", () => {
    const banned = [/\bfetch\s*\(/, /node:(net|http|https|dgram|tls|child_process|worker_threads)/, /Bun\.(spawn|serve|connect|listen)/, /process\.env/, /\bWebSocket\b/, /\.env\b/];
    for (const { file, text } of sources) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const re of banned) expect(re.test(code), `${file} casa ${re}`).toBe(false);
    }
  });

  test("não existe caminho para assinar ou transmitir", () => {
    const banned = [/signTransaction/i, /sendTransaction/i, /signMessage/i, /sendRawTransaction/i, /broadcast/i, /privateKey/i, /PRIVATE_KEY/, /mnemonic/i, /\bwallet\b\.\s*sign/i, /Wallet\(/];
    for (const { file, text } of sources) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const re of banned) expect(re.test(code), `${file} casa ${re}`).toBe(false);
    }
  });

  test("o modo live não existe no tipo nem em lugar nenhum fora da recusa", () => {
    const types = sources.find((s) => s.file === "types.ts")!.text;
    expect(types).toContain('export type Mode = "replay" | "paper";');
    const controls = sources.find((s) => s.file === "controls.ts")!.text;
    expect(controls).toContain("desabilitado");
    for (const { file, text } of sources) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      const live = code.match(/["']live["']/g) ?? [];
      expect(live.length, `${file} menciona "live" em código`).toBe(0);
    }
  });

  test("disco só no log e relógio de parede só como padrão do runner", () => {
    for (const { file, text } of sources) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (!MAY_USE_FS.has(file)) expect(/node:fs|Bun\.(file|write)/.test(code), `${file} usa disco`).toBe(false);
      if (!MAY_USE_PERFORMANCE_NOW.has(file)) expect(/performance\.now|Date\.now|new Date\(\)/.test(code), `${file} lê o relógio`).toBe(false);
      expect(/Math\.random/.test(code), `${file} usa Math.random`).toBe(false);
    }
  });
});
