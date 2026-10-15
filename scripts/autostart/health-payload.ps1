# The body of GET /health decides whether OUR agent answers on the port, not the status code alone (Codex 172): any other program that
# answers HTTP 200 on port 3000 must NOT count as the agent. Dot-sourced by inonu-local-logon.ps1 and tested by health-payload.test.ts.
function Test-HealthPayload([string]$json) {
  try {
    $body = $json | ConvertFrom-Json -ErrorAction Stop
    # real types, not PowerShell's loose comparison: the string "true" must not pass for the boolean true
    return ($null -ne $body -and ($body.ok -is [bool]) -and $body.ok -and ($body.app -is [string]) -and $body.app -ceq "inonu-trader")
  } catch {
    return $false
  }
}
