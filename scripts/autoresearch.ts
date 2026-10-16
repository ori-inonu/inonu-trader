import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { EvidenceSnapshot } from "./autoresearch/contracts";

const root = new URL("../", import.meta.url);
const primaryMetric = "synthetic_paired_net_return_bps";

const sha256 = (bytes: string | Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function evaluatorFingerprint(): Promise<string> {
  const files = [
    "autoresearch.sh",
    "scripts/autoresearch.ts",
    "scripts/autoresearch/contracts.ts",
    "scripts/autoresearch/workload.ts",
    "scripts/autoresearch/panel-metrics.ts",
    "src/agent/shadow/sim-portfolio.ts",
  ];
  const labRoot = new URL("src/lab/", root);
  for await (const name of new Bun.Glob("**/*.ts").scan({ cwd: fileURLToPath(labRoot), onlyFiles: true })) {
    if (!name.endsWith(".test.ts")) files.push(`src/lab/${name.replaceAll("\\", "/")}`);
  }
  const digest = createHash("sha256");
  for (const name of files.sort()) {
    digest.update(name).update("\0").update(await Bun.file(new URL(name, root)).bytes()).update("\0");
  }
  return digest.digest("hex");
}

async function main(): Promise<void> {
  if (Bun.argv.length > 2) throw new Error("Uso: bash autoresearch.sh (sem argumentos)");

  // Fail closed if a future adapter accidentally attempts a remote consultation.
  const denyNetwork = (): never => { throw new Error("Autoresearch offline: rede desabilitada"); };
  globalThis.fetch = Object.assign(denyNetwork, { preconnect: denyNetwork });
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: false,
    value: class { constructor() { throw new Error("Autoresearch offline: WebSocket desabilitado"); } },
  });

  const fixtureBytes = await Bun.file(new URL("autoresearch/fixtures/evidence.json", import.meta.url)).bytes();
  const snapshot = JSON.parse(new TextDecoder().decode(fixtureBytes)) as EvidenceSnapshot;
  if (snapshot.schemaVersion !== 1 || !Number.isSafeInteger(snapshot.capturedAtMs)) {
    throw new Error("Snapshot de evidencia invalido");
  }

  const [{ runWorkload }, { buildPanelReport }] = await Promise.all([
    import("./autoresearch/workload"),
    import("./autoresearch/panel-metrics"),
  ]);
  const workload = await runWorkload();
  const panel = buildPanelReport(snapshot);
  const metrics = { ...workload.metrics, ...panel.metrics };
  if (!Object.hasOwn(workload.metrics, primaryMetric)) throw new Error("Metrica primaria ausente");
  if (Object.keys(workload.metrics).some(name => Object.hasOwn(panel.metrics, name))) {
    throw new Error("Nomes de metricas sobrepostos");
  }
  for (const [name, value] of Object.entries(metrics)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || !Number.isFinite(value)) {
      throw new Error(`Metrica nao finita ou nome invalido: ${name}`);
    }
  }

  const evaluatorHash = await evaluatorFingerprint();
  const candidateHash = sha256(await Bun.file(new URL("autoresearch/candidate.ts", import.meta.url)).bytes());
  const evidenceHash = sha256(fixtureBytes);
  console.log("ASI measurement_class=synthetic_development");
  console.log("ASI goal_10x_24h=not_proven");
  console.log("ASI financially_authorized=false");
  console.log("ASI source_authenticated=false");
  console.log(`ASI runtime=bun-${Bun.version}`);
  console.log(`ASI evaluator_sha256=${evaluatorHash}`);
  console.log(`ASI candidate_sha256=${candidateHash}`);
  console.log(`ASI evidence_sha256=${evidenceHash}`);
  console.log(`METRIC ${primaryMetric}=${metrics[primaryMetric]}`);
  for (const name of Object.keys(metrics).filter(name => name !== primaryMetric).sort()) {
    console.log(`METRIC ${name}=${metrics[name]}`);
  }
  console.log(`REPORT ${JSON.stringify({
    measurementClass: "synthetic_development",
    goal: {
      initialUsd: 118,
      targetUsd: 1180,
      targetMultiple: 10,
      requiredNetReturnPct: 900,
      deadlineExclusiveMs: 86_400_000,
      status: "not_proven",
      reason: "Sem serie integral de carteira com fluxos, fills e custos USD contemporaneos conciliados; regra sintetica nao e JEV.",
    },
    provenance: { evaluatorHash, candidateHash, evidenceHash, frozenAsOfMs: snapshot.capturedAtMs, sources: snapshot.sources },
    workload: workload.report,
    panel: panel.report,
  })}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Falha no benchmark offline");
    process.exitCode = 1;
  });
}
