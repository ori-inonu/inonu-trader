// PostToolUse (Edit/Write): formatação best-effort. Sempre sai com 0: formatar nunca bloqueia o agente.
// Usa o prettier só se ele já estiver instalado no projeto. Não adiciona dependência.

import { existsSync } from 'node:fs'

const PRETTIER = 'node_modules/.bin/prettier'

async function main() {
  try {
    const raw = await Bun.stdin.text()
    const event = JSON.parse(raw) as { tool_input?: { file_path?: string; path?: string } }
    const file = event.tool_input?.file_path ?? event.tool_input?.path
    if (!file || !/\.(ts|tsx|js|jsx|json|md|css)$/.test(file) || !existsSync(PRETTIER)) process.exit(0)
    Bun.spawnSync([PRETTIER, '--write', file], { stdout: 'ignore', stderr: 'ignore' })
  } catch {
    // Formatação é opcional: qualquer falha é ignorada.
  }
  process.exit(0)
}

main()
