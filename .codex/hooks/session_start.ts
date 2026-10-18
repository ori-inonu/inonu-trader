import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { exportCompact } from '../../scripts/cerebro'

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

// Cérebro em grafo: injeta só a vizinhança da última iteração (export <nó>), não arquivos fixos. Falha em silêncio.
try {
  const root = fileURLToPath(new URL('../../docs/_meta/cerebro', import.meta.url))
  const nodes = JSON.parse(readFileSync(`${root}/graph.v2.json`, 'utf8')).nodes as { id: string; type: string }[]
  const focus = nodes.filter((n) => n.type === 'iteration').at(-1)?.id
  if (focus) console.log(`Cérebro (vizinhança de ${focus}):\n${await exportCompact(root, focus, 1)}`)
} catch { }
process.exit(0)
