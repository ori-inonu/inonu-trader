# What the logon watchdog decides, kept apart so it can be tested (Codex 173). Dot-sourced by inonu-local-logon.ps1.
#
# The rule that matters: an inventory that could not be READ is UNKNOWN, never "no supervisor". Turning a Get-CimInstance error into an
# empty list would authorize a second supervisor exactly when the watchdog is blind, so the inventory fails CLOSED.

# The pids of the long-lived supervisor processes of THIS artifact (`src/local-host/main.ts --app <App>`, not the --background launcher and
# not this query), or $null when the process inventory could not be read. $Inventory is injectable for tests.
function Get-SupervisorPids([string]$App, [string]$ProcessName = "bun.exe", [scriptblock]$Inventory = { Get-CimInstance Win32_Process -ErrorAction Stop }) {
  try { $all = @(& $Inventory) } catch { return $null }
  $wanted = [regex]::Escape($App)
  $found = @($all | Where-Object {
    $_.Name -ieq $ProcessName -and $_.CommandLine -and
    $_.CommandLine -match 'src[\\/]local-host[\\/]main\.ts' -and $_.CommandLine -match $wanted -and
    $_.CommandLine -notmatch '--background' -and $_.CommandLine -notmatch 'Get-CimInstance'
  } | ForEach-Object { $_.ProcessId })
  return ,$found
}

# watch            our agent answers on the port: only watch
# wait_supervisor  nothing answers but a supervisor of this artifact is alive: wait for it, NEVER replace it
# wait_unknown     nothing answers and the inventory could not be read: wait, NEVER launch blind
# launch           nothing answers and no supervisor exists: start exactly one
function Get-WatchdogAction([bool]$Healthy, $SupervisorPids) {
  if ($Healthy) { return "watch" }
  if ($null -eq $SupervisorPids) { return "wait_unknown" }
  if (@($SupervisorPids).Count -gt 0) { return "wait_supervisor" }
  return "launch"
}
