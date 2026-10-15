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
process.exit(0)
