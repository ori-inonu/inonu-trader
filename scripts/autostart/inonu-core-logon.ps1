# Inonu Trader: starts the core at Windows logon and starts it again when it is gone.
# Authorized by the owner on 2026-10-15 (agente continuo, inicio no logon). It is a watchdog, not a second core:
#  - if something already answers /health on the port (the app, another supervisor) it only watches;
#  - if nothing does, it starts `bun run src/desktop/main.ts` (the same core as the installed app, the agent included)
#    and starts it again after it exits, waiting 5, 10, 20, 40 and then 60 seconds between attempts;
#  - one watchdog per user session (a named mutex), so a second copy of this script exits at once.
# It never touches the money: the agent decides inside the core, with its own state files. The data home MUST be the one
# the app already uses (the Claude package's LocalCache folder on this machine), or the ledger, the plans and the LOCK are lost.
# Parameters exist for tests (a scratch port, a scratch home and --watch-only, which keeps the agent from running).
param(
  [string]$Repo = "C:\Users\gabri\jev-trader",
  [string]$DataHome = "C:\Users\gabri\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\InonuTrader",
  [string]$WebDir = "C:\Users\gabri\jev-trader\web\out-logon",
  [string]$Bun = "C:\Users\gabri\.bun\bin\bun.exe",
  [int]$Port = 3000,
  [string[]]$ExtraArgs = @(),
  [string]$MutexName = "Global\InonuTraderLogonWatchdog",
  [int]$WatchSeconds = 30
)

$ErrorActionPreference = "Continue"
$logDir = Join-Path $DataHome "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "autostart.log"

function Write-Log([string]$message) {
  Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date).ToUniversalTime().ToString("o"), $message)
}

function Test-CoreHealthy {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/health" -f $Port) -TimeoutSec 3
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

# While this watchdog runs the computer must not go to sleep on its own (see keep-awake.ps1: explicit uint32 flags, and the answer is read with care).
. (Join-Path $PSScriptRoot "keep-awake.ps1")
$awake = Request-KeepAwake

$owned = $false
$mutex = New-Object System.Threading.Mutex($false, $MutexName, [ref]$owned)
if (-not $mutex.WaitOne(0)) {
  Write-Log "another watchdog is already running: exit"
  exit 0
}

Write-Log ("watchdog started: repo={0} port={1} extra={2} keep-awake={3}" -f $Repo, $Port, ($ExtraArgs -join " "), $awake)
$delays = @(5, 10, 20, 40, 60)
$failures = 0
try {
  while ($true) {
    if (Test-CoreHealthy) {
      $failures = 0
      Start-Sleep -Seconds $WatchSeconds
      continue
    }
    if (-not (Test-Path $Bun)) { Write-Log ("bun not found at {0}" -f $Bun); Start-Sleep -Seconds 60; continue }
    if (-not (Test-Path (Join-Path $WebDir "index.html"))) { Write-Log ("web export missing at {0}" -f $WebDir); Start-Sleep -Seconds 60; continue }
    $env:INONU_HOME = $DataHome
    $env:INONU_WEB_DIR = $WebDir
    $env:INONU_NO_DIALOG = "1"
    $arguments = @("--no-env-file", "run", "src/desktop/main.ts", "--no-browser", "--idle-ms", "0", "--port", "$Port") + $ExtraArgs
    $process = Start-Process -FilePath $Bun -ArgumentList $arguments -WorkingDirectory $Repo -WindowStyle Hidden -PassThru
    Write-Log ("core started: pid={0}" -f $process.Id)
    $process.WaitForExit()
    Write-Log ("core exited: code={0}" -f $process.ExitCode)
    $failures += 1
    Start-Sleep -Seconds $delays[[Math]::Min($failures - 1, $delays.Count - 1)]
  }
} finally {
  $mutex.ReleaseMutex()
}
