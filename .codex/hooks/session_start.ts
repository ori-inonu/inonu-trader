// SessionStart: mostra o estado do git para o agente começar com contexto. Só leitura.
// Não roda instalação pesada.

const run = (args: string[]) => {
  const out = Bun.spawnSync(['git', ...args], { stdout: 'pipe', stderr: 'pipe' })
  return out.exitCode === 0 ? out.stdout.toString().trim() : ''
}

const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']) || 'desconhecida'
const status = run(['status', '--short']).split('\n').filter(Boolean)
const log = run(['log', '--oneline', '-5']).split('\n').filter(Boolean)

console.log(`Branch: ${branch}`)
console.log(`Alterações não commitadas: ${status.length}`)
for (const line of status.slice(0, 15)) console.log(`  ${line}`)
if (status.length > 15) console.log(`  ... mais ${status.length - 15}`)
console.log('Últimos commits:')
for (const line of log) console.log(`  ${line}`)
process.exit(0)
