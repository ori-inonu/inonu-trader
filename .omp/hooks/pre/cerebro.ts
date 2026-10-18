// OMP: injeta uma vez por sessão a vizinhança do grafo (mesmo texto do hook do Codex). Falha em silêncio.
export default function hook(pi: { on: (event: string, handler: () => unknown) => void }): void {
  let sent = false
  pi.on('before_agent_start', () => {
    if (sent) return
    sent = true
    const out = Bun.spawnSync(['bun', '--no-env-file', '.codex/hooks/session_start.ts'], { stdout: 'pipe', stderr: 'ignore' })
    const content = out.exitCode === 0 ? out.stdout.toString().trim() : ''
    return content ? { message: { customType: 'cerebro', content, display: false } } : undefined
  })
}
