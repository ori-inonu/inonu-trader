// Latência de REDE até o host público da OKX, separada de cotação, simulação e assinatura: conexão TCP, TLS e primeiro byte.
// Chama só a página pública (HEAD), sem credencial, sem cota de API e sem custo. Usa curl para ler os tempos de cada fase.
// Run: bun --no-env-file scripts/network-rtt.ts [--url https://web3.okx.com/] [--n 20]
// Saída: data/bench/network-rtt.json
import { mkdir, writeFile } from "node:fs/promises";
import { devNull } from "node:os";
import { dirname, resolve } from "node:path";
import { dist, type Dist } from "../src/decision/metrics";

export interface RttSample {
  /** Segundos desde o início até a conexão TCP, até o fim do TLS e até o primeiro byte, como o curl informa. */
  readonly connect: number;
  readonly tls: number;
  readonly firstByte: number;
}

export interface RttReport {
  readonly generatedAt: string;
  readonly host: string;
  readonly samples: number;
  readonly failures: number;
  /** Cada fase em ms, já descontada a anterior: TCP puro, handshake TLS e espera do servidor até o primeiro byte. */
  readonly tcpMs: Dist | null;
  readonly tlsMs: Dist | null;
  readonly serverMs: Dist | null;
  /** Do início ao primeiro byte, em ms: o piso de rede de qualquer chamada à API. */
  readonly totalToFirstByteMs: Dist | null;
  readonly note: string;
}

/** Lê "connect;tls;firstbyte" em segundos. Tempo faltante ou fora de ordem invalida a amostra. */
export function parseSample(text: string): RttSample | null {
  const [c, t, f] = text.trim().split(";").map(Number);
  if (![c, t, f].every((v) => Number.isFinite(v)) || c! <= 0 || t! < c! || f! < t!) return null;
  return { connect: c!, tls: t!, firstByte: f! };
}

export function summarize(host: string, samples: readonly (RttSample | null)[], nowMs: number): RttReport {
  const ok = samples.filter((s): s is RttSample => s !== null);
  const ms = (x: number) => x * 1000;
  return {
    generatedAt: new Date(nowMs).toISOString(),
    host,
    samples: ok.length,
    failures: samples.length - ok.length,
    tcpMs: dist(ok.map((s) => ms(s.connect)), 1),
    tlsMs: dist(ok.map((s) => ms(s.tls - s.connect)), 1),
    serverMs: dist(ok.map((s) => ms(s.firstByte - s.tls)), 1),
    totalToFirstByteMs: dist(ok.map((s) => ms(s.firstByte)), 1),
    note: "Rede até o host público, sem a API assinada. A cotação medida no journal (p50 1.034 ms) inclui rede, o servidor da OKX e o executor local.",
  };
}

export type CurlRunner = (url: string) => Promise<string>;

/** curl lê os tempos de cada fase; HEAD, sem corpo, sem credencial. */
export const runCurl: CurlRunner = async (url) => {
  const proc = Bun.spawn(["curl", "-s", "-o", devNull, "-I", "-w", "%{time_connect};%{time_appconnect};%{time_starttransfer}", "--max-time", "10", url], { stdout: "pipe", stderr: "ignore" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
};

export async function measure(url: string, n: number, run: CurlRunner = runCurl, now: () => number = Date.now): Promise<RttReport> {
  const samples: (RttSample | null)[] = [];
  // Um por vez e espaçados: não é teste de carga, é medida de latência.
  for (let i = 0; i < n; i++) {
    try {
      samples.push(parseSample(await run(url)));
    } catch {
      samples.push(null);
    }
  }
  return summarize(new URL(url).host, samples, now());
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (import.meta.main) {
  const url = arg("--url") ?? "https://web3.okx.com/";
  const n = Math.min(50, Math.max(1, Number(arg("--n") ?? 20)));
  const report = await measure(url, n);
  const out = resolve(import.meta.dir, "../data/bench/network-rtt.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`rede ${report.host}: TCP p50 ${report.tcpMs?.p50 ?? "n/d"} ms, TLS p50 ${report.tlsMs?.p50 ?? "n/d"} ms, servidor p50 ${report.serverMs?.p50 ?? "n/d"} ms, até o primeiro byte p50 ${report.totalToFirstByteMs?.p50 ?? "n/d"} ms (${report.samples} amostras, ${report.failures} falhas)`);
}
