# Reuse Git Credential Manager only for the lifetime of this gh invocation.
[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$GhArguments)
$ErrorActionPreference = 'Stop'
$taskGh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $taskGh) {
  $taskGhPath = Join-Path $env:ProgramFiles 'GitHub CLI/gh.exe'
  if (-not (Test-Path -LiteralPath $taskGhPath)) { throw 'Install the official GitHub CLI first.' }
} else { $taskGhPath = $taskGh.Source }
$taskSaved = @{}
foreach ($taskName in @('GH_TOKEN','GCM_INTERACTIVE','GIT_TERMINAL_PROMPT')) {
  $taskSaved[$taskName] = [Environment]::GetEnvironmentVariable($taskName,'Process')
}
try {
  if (-not $env:GH_TOKEN) {
    $env:GCM_INTERACTIVE = 'never'
    $env:GIT_TERMINAL_PROMPT = '0'
    $taskCredential = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'No GitHub Git credential is available. Authenticate with gh auth login.' }
    $taskPassword = $taskCredential | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
    if (-not $taskPassword) { throw 'No GitHub token was returned by the Git credential helper.' }
    $env:GH_TOKEN = $taskPassword.Substring('password='.Length)
  }
  & $taskGhPath @GhArguments
  $taskExit = $LASTEXITCODE
} finally {
  foreach ($taskName in $taskSaved.Keys) {
    [Environment]::SetEnvironmentVariable($taskName,$taskSaved[$taskName],'Process')
  }
  $taskCredential = $null
  $taskPassword = $null
}
exit $taskExit
