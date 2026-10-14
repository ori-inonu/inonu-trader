import { replayPaperDecisions, type PaperDecisionReplayInput } from "../src/paper-decision-replay";

export const PAPER_REPLAY_INPUT_LIMIT = 1_048_576;
export const PAPER_REPLAY_USAGE = "Uso: bun --no-env-file run scripts/paper-decision-replay.ts --input <arquivo.json>\nReplay offline: nenhuma carteira, modelo ou servico externo e chamado.";

export interface PaperReplayCliIo {
  read(path: string): Promise<string>;
  out(text: string): void;
  error(text: string): void;
}

export async function runPaperDecisionReplay(argv: readonly string[], io: PaperReplayCliIo): Promise<0 | 1 | 2> {
  if (argv.length === 1 && argv[0] === "--help") {
    io.out(PAPER_REPLAY_USAGE);
    return 0;
  }
  if (argv.length !== 2 || argv[0] !== "--input" || !argv[1] || argv[1].startsWith("--")) {
    io.error(PAPER_REPLAY_USAGE);
    return 2;
  }
  try {
    const text = await io.read(argv[1]);
    if (new TextEncoder().encode(text).length > PAPER_REPLAY_INPUT_LIMIT) throw new Error("input_limit");
    const result = replayPaperDecisions(JSON.parse(text) as PaperDecisionReplayInput);
    io.out(JSON.stringify(result));
    return result.status === "completed" ? 0 : 1;
  } catch {
    io.error("Entrada invalida ou inacessivel. Nenhum servico externo foi chamado.");
    return 2;
  }
}

if (import.meta.main) {
  process.exitCode = await runPaperDecisionReplay(Bun.argv.slice(2), {
    read: async (path) => {
      const file = Bun.file(path);
      if (file.size > PAPER_REPLAY_INPUT_LIMIT) throw new Error("input_limit");
      return file.text();
    },
    out: (text) => console.log(text),
    error: (text) => console.error(text),
  });
}
