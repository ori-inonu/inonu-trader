import { createHash } from "node:crypto";
import { collectOnlineObservation } from "./autoresearch/online-source";
import { buildOnlineReport } from "./autoresearch/online-report";

const root = new URL("../", import.meta.url);
const sha256 = (bytes: string | Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function evaluatorFingerprint(): Promise<string> {
  const files = [
    "autoresearch.sh",
    "scripts/autoresearch.ts",
    "scripts/autoresearch/contracts.ts",
    "scripts/autoresearch/online-source.ts",
    "scripts/autoresearch/online-report.ts",
    "scripts/autoresearch/panel-metrics.ts",
    "src/onchainos/public-okx.ts",
  ];
  const digest = createHash("sha256");
  for (const name of files.sort()) {
    digest.update(name).update("\0").update(await Bun.file(new URL(name, root)).bytes()).update("\0");
  }
  return digest.digest("hex");
}

async function main(): Promise<void> {
  if (Bun.argv.length > 2) throw new Error("online_arguments_not_allowed");
  const observation = await collectOnlineObservation({
    runtimeBaseUrl: "http://127.0.0.1:3000",
    runtimeOrigin: "http://127.0.0.1:3000",
  });
  const result = buildOnlineReport(observation);
  for (const [name, value] of Object.entries(result.metrics)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || !Number.isFinite(value)) {
      throw new Error("online_metric_invalid");
    }
  }

  const evaluatorHash = await evaluatorFingerprint();
  const evidenceHash = sha256(JSON.stringify({
    startedAtMs: observation.startedAtMs,
    completedAtMs: observation.completedAtMs,
    sources: observation.sources,
  }));
  console.log("ASI measurement_class=real_online_observation");
  console.log("ASI goal_10x_24h=not_proven");
  console.log("ASI financially_authorized=false");
  console.log("ASI optimization_eligible=false");
  console.log("ASI runtime_identity=self_reported_loopback");
  console.log("ASI market_transport=https_public");
  console.log(`ASI runtime=bun-${Bun.version}`);
  console.log(`ASI evaluator_sha256=${evaluatorHash}`);
  console.log(`ASI evidence_sha256=${evidenceHash}`);
  for (const name of Object.keys(result.metrics).sort()) {
    console.log(`METRIC ${name}=${result.metrics[name]}`);
  }
  console.log(`REPORT ${JSON.stringify({
    measurementClass: "real_online_observation",
    optimizationEligible: false,
    goal: {
      initialUsd: 118,
      targetUsd: 1180,
      targetMultiple: 10,
      requiredNetReturnPct: 900,
      deadlineExclusiveMs: 86_400_000,
      status: "not_proven",
      reason: "Sem serie integral conciliada de carteira, fluxos, fills e custos USD contemporaneos; observacao nao e qualificacao financeira.",
    },
    provenance: { evaluatorHash, evidenceHash, sources: observation.sources },
    observation: result.report,
  })}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error && /^online_[a-z0-9_]+$/.test(error.message)
      ? error.message : "autoresearch_online_failed");
    process.exitCode = 1;
  });
}
