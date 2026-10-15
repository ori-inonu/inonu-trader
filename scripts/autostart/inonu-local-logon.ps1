# Inonu Trader: logon watchdog for the QUALIFIED local artifact (P1 of docs/sdd/agente-autonomo/PASSAGEM-ARTEFATO-QUALIFICADO-20261015.md).
# PREPARED ONLY: it is not registered in any scheduled task and nothing has run it. The Codex reads it before any use (note 169).
#
# It replaces scripts/autostart/inonu-core-logon.ps1 (which starts the working-tree core with `bun run src/desktop/main.ts`) after the
# pass to the artifact. It does not start a core itself: it starts the SUPERVISOR (src/local-host/main.ts --background), which verifies the
# artifact hashes, starts its own child with a filtered environment, drains it through the private IPC channel and retries 5, 10, 20, 40 s.
#
# Rules this script keeps (each one answers a finding of Codex 169):
#  - ONE supervisor. It launches only when /health is silent AND no supervisor process for this artifact exists. A supervisor that is
#    alive but whose /health is silent for more than a minute is WAITED FOR, never replaced: no restart by timeout.
#  - every launch gets a fresh private --control path (<home>\control\stop-<guid>.json); it is written to the log, so a later stop can be
#    asked through src/local-host/control.ts (requestSupervisorStop) with the exact session and pid. Nothing here stops anything.
#  - the mutex is the SAME as the old watchdog: the two watchdogs never run together (also the rollback guard). The mutex alone does not
#    stop two detached supervisors, which is why the process check above exists.
#  - the port is fixed at 3000 because the supervisor probes only 3000; it is not a parameter.
#  - -App and -Repo are MANDATORY with no default: -Repo must be the qualified, immutable copy of the launcher and its dependencies that the
#    Codex names at P7, never the mutable working tree. Paths with spaces are quoted.
#  - the data home is the real one (the Claude MSIX LocalCache folder), or the ledger, the plans and the LOCK would be lost.
#  - no flag and no environment variable of the agent is set here: the supervisor builds the child environment from its own allowlist.
# -DryRun validates the inputs and prints what would run, and does nothing else (no mutex, keep-awake, log, directory or launch).
param(
  [Parameter(Mandatory = $true)][string]$App,
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$DataHome = "C:\Users\gabri\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\InonuTrader",
  [string]$Bun = "C:\Users\gabri\.bun\bin\bun.exe",
  [string]$MutexName = "Global\InonuTraderLogonWatchdog",
  [int]$WatchSeconds = 30,
  [string]$SupervisorProcessName = "bun.exe",
  [switch]$AwaitHandoff,
  [switch]$DryRun
)

$ErrorActionPreference = "Continue"
$Port = 3000   # fixed: src/local-host probes only this port

. (Join-Path $PSScriptRoot "health-payload.ps1")
. (Join-Path $PSScriptRoot "watchdog-decision.ps1")

# "Healthy" means OUR agent answers: HTTP 200 AND a body with ok:true and app:inonu-trader, never the status code alone (Codex 172).
function Test-CoreHealthy {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/health" -f $Port) -TimeoutSec 3
    return ($response.StatusCode -eq 200 -and (Test-HealthPayload ([string]$response.Content)))
  } catch {
    return $false
  }
}

# One command-line argument, quoted for Start-Process when it holds a space or a quote.
function Format-Arg([string]$value) {
  if ($value -match '[\s"]') { return '"' + ($value -replace '"', '\"') + '"' }
  return $value
}

# Inputs are checked before anything else, in dry run too.
$problems = @()
if (-not [System.IO.Path]::IsPathRooted($App)) { $problems += "App must be an absolute path" }
elseif (-not (Test-Path (Join-Path $App "local-artifact.json"))) { $problems += ("local-artifact.json not found under {0}" -f $App) }
if (-not [System.IO.Path]::IsPathRooted($Repo)) { $problems += "Repo must be an absolute path (the qualified, immutable launcher and dependencies)" }
elseif (-not (Test-Path (Join-Path $Repo "src\local-host\main.ts"))) { $problems += ("src\local-host\main.ts not found under {0}" -f $Repo) }
if (-not [System.IO.Path]::IsPathRooted($DataHome)) { $problems += "DataHome must be an absolute path" }
elseif (-not (Test-Path $DataHome)) { $problems += ("data home not found: {0} (a fresh home would lose the ledger, plans and LOCK)" -f $DataHome) }
if (-not (Test-Path $Bun)) { $problems += ("bun not found at {0}" -f $Bun) }
if ($problems.Count -gt 0) {
  $problems | ForEach-Object { Write-Output ("refused: {0}" -f $_) }
  exit 1
}

$controlDir = Join-Path $DataHome "control"
function New-Arguments([string]$controlPath) {
  $a = @("--no-env-file", "run", "src/local-host/main.ts", "--background")
  if ($AwaitHandoff) { $a += "--await-handoff" }
  $a += @("--app", (Format-Arg $App), "--home", (Format-Arg $DataHome), "--control", (Format-Arg $controlPath))
  return $a
}

if ($DryRun) {
  $sample = Join-Path $controlDir "stop-<guid>.json"
  Write-Output ("dry run: would run: {0} {1}" -f $Bun, ((New-Arguments $sample) -join " "))
  Write-Output ("dry run: working directory: {0}" -f $Repo)
  Write-Output ("dry run: /health on port {0} answers now: {1}" -f $Port, (Test-CoreHealthy))
  $alive = Get-SupervisorPids -App $App -ProcessName $SupervisorProcessName
  Write-Output ("dry run: supervisor processes of this artifact alive now: {0}" -f $(if ($null -eq $alive) { "unknown (the process inventory could not be read)" } elseif (@($alive).Count -eq 0) { "none" } else { $alive -join "," }))
  $action = Get-WatchdogAction (Test-CoreHealthy) $alive
  Write-Output ("dry run: it would: {0}" -f $(switch ($action) { "watch" { "only watch" } "wait_supervisor" { "wait for the live supervisor, never replace it" } "wait_unknown" { "wait, never launch blind (the inventory is unknown)" } default { "launch exactly one supervisor" } }))
  exit 0
}

$logDir = Join-Path $DataHome "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "autostart-local.log"
function Write-Log([string]$message) {
  Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date).ToUniversalTime().ToString("o"), $message)
}

# While this watchdog runs the computer must not go to sleep on its own (same helper as the old watchdog).
. (Join-Path $PSScriptRoot "keep-awake.ps1")
$awake = Request-KeepAwake

$owned = $false
$mutex = New-Object System.Threading.Mutex($false, $MutexName, [ref]$owned)
if (-not $mutex.WaitOne(0)) {
  Write-Log "another watchdog is already running: exit"
  exit 0
}

Write-Log ("local watchdog started: app={0} repo={1} await-handoff={2} keep-awake={3}" -f $App, $Repo, [bool]$AwaitHandoff, $awake)
$delays = @(30, 60, 120, 300)
$failures = 0
try {
  while ($true) {
    $alive = Get-SupervisorPids -App $App -ProcessName $SupervisorProcessName
    $action = Get-WatchdogAction (Test-CoreHealthy) $alive
    if ($action -eq "watch") {
      $failures = 0
      Start-Sleep -Seconds $WatchSeconds
      continue
    }
    if ($action -eq "wait_supervisor") {
      # a supervisor of this artifact exists: it may be retrying, draining or waiting. Never start another one because of a timeout.
      Write-Log ("supervisor pid={0} is alive and /health is silent: waiting, no relaunch" -f (@($alive) -join ","))
      Start-Sleep -Seconds $WatchSeconds
      continue
    }
    if ($action -eq "wait_unknown") {
      # the process inventory could not be read: not knowing is not permission to start a second supervisor (fail closed)
      Write-Log "/health is silent and the process inventory could not be read: waiting, no launch"
      Start-Sleep -Seconds $WatchSeconds
      continue
    }
    New-Item -ItemType Directory -Force -Path $controlDir | Out-Null
    $control = Join-Path $controlDir ("stop-{0}.json" -f [guid]::NewGuid().ToString("N"))
    # NOT -Wait: the launcher starts a detached supervisor that lives indefinitely, and -Wait waits for that too (it blocked the first real run)
    $launcher = Start-Process -FilePath $Bun -ArgumentList (New-Arguments $control) -WorkingDirectory $Repo -WindowStyle Hidden -PassThru
    $exited = $launcher.WaitForExit(30000)
    Write-Log ("supervisor launcher {0}: code={1} (0 started or already ours, 3 port busy by another program) control={2}" -f $(if ($exited) { "exited" } else { "still running after 30s" }), $(if ($exited) { $launcher.ExitCode } else { "n/a" }), $control)
    # give the new supervisor and its child up to a minute to show up before counting this attempt as a failure
    $deadline = (Get-Date).AddSeconds(60)
    $seen = $false
    while ((Get-Date) -lt $deadline -and -not $seen) {
      $s = Get-SupervisorPids -App $App -ProcessName $SupervisorProcessName
      $seen = (Test-CoreHealthy) -or ($null -ne $s -and @($s).Count -gt 0)
      if (-not $seen) { Start-Sleep -Seconds 3 }
    }
    if ($seen) { $failures = 0; continue }
    $failures += 1
    $pause = $delays[[Math]::Min($failures - 1, $delays.Count - 1)]
    Write-Log ("no supervisor and no core after the launch: failures={0}, waiting {1}s" -f $failures, $pause)
    Start-Sleep -Seconds $pause
  }
} finally {
  $mutex.ReleaseMutex()
}
