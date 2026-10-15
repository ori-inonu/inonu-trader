// PreToolUse (Bash): bloqueia comandos destrutivos. Exit 2 bloqueia a chamada.
// Lê o JSON do evento em stdin. Não grava nada e não envia dados para fora.

const BLOCKED: { pattern: RegExp; reason: string }[] = [
  { pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s+(\/|~|\$HOME|\*)(\s|$)/i, reason: 'rm -rf em raiz, home ou curinga' },
  { pattern: /\bgit\s+push\b.*(\s--force(?!-with-lease)\b|\s-f\b)/i, reason: 'git push --force sem lease' },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: 'git reset --hard descarta trabalho' },
  { pattern: /\bDROP\s+(TABLE|DATABASE)\b/i, reason: 'DROP TABLE ou DATABASE' },
  { pattern: /\bgit\s+clean\s+-[a-z]*f/i, reason: 'git clean -f apaga arquivos não rastreados' },
]

async function main() {
  const raw = await Bun.stdin.text()
  let command = ''
  try {
    const event = JSON.parse(raw) as { tool_input?: { command?: string } }
    command = event.tool_input?.command ?? ''
  } catch {
    // Entrada inesperada: sem comando para avaliar, deixa passar.
    process.exit(0)
  }

  for (const rule of BLOCKED) {
    if (rule.pattern.test(command)) {
      console.error(`Bloqueado pela política do projeto: ${rule.reason}. Peça ao dono se for mesmo necessário.`)
      process.exit(2)
    }
  }
  process.exit(0)
}

main()
