// Stop: roda o typecheck do projeto e informa o resultado no stderr. Exit 0 sempre, para não prender a sessão.
// Os testes completos (bun run test) ficam para o comando de done do AGENTS.md, porque são lentos.

const result = Bun.spawnSync(['bun', 'run', 'typecheck'], { stdout: 'pipe', stderr: 'pipe', cwd: process.cwd() })
const output = (result.stdout.toString() + result.stderr.toString()).trim()

if (result.exitCode === 0) {
  console.error('typecheck: passou')
} else {
  console.error('typecheck: FALHOU. Corrija antes de declarar pronto:')
  console.error(output.split('\n').slice(-30).join('\n'))
}

// Grafo: mudança no working tree ou no último commit sem tocar em events.jsonl vira aviso (nunca bloqueia).
const git = (...a: string[]) => Bun.spawnSync(['git', ...a], { stdout: 'pipe' }).stdout.toString()
const touched = (git('status', '--short') + git('show', '--name-only', '--format=', 'HEAD')).split('\n').filter(Boolean)
if (touched.length && !touched.some((f) => f.includes('_meta/cerebro/events.jsonl')) && Bun.file('docs/_meta/cerebro/events.jsonl').size) {
  console.error('cerebro: mudanças sem nó novo. Rode: bun scripts/cerebro.ts add-node iteration <id> <texto> <ligacoes>')
}
process.exit(0)
