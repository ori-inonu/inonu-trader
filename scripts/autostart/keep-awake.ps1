# The request that keeps Windows from idle-sleeping while the watchdog runs (ES_CONTINUOUS | ES_SYSTEM_REQUIRED on the calling thread).
# 0x80000001 written in PowerShell is the Int32 -2147483647 and does NOT bind to the uint32 parameter of SetThreadExecutionState (the independent
# review of 2026-10-15 reproduced the binding error), so the flags are the explicit uint32 2147483649, the same bits. The answer is read with care:
# the function returns the previous state (never 0 when it worked) and 0 when it failed, and a call that threw or returned nothing must NEVER be
# reported as accepted. It changes no power setting, ends with the process, and a closed lid or a manual Sleep still sleeps.

$KeepAwakeFlags = [uint32]2147483649

function Get-NativeKeepAwake {
  Add-Type -Namespace Inonu -Name Power -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -ErrorAction SilentlyContinue
  return { param([uint32]$flags) [Inonu.Power]::SetThreadExecutionState($flags) }
}

# Returns "yes" when the request was accepted, "no" when the system answered 0 or nothing, and "failed: <message>" when the call threw.
# `Native` is a scriptblock taking the uint32 flags (the real call by default; a stub in the test).
function Request-KeepAwake([scriptblock]$Native = $null) {
  try {
    if ($null -eq $Native) { $Native = Get-NativeKeepAwake }
    $answer = & $Native $KeepAwakeFlags
    if ($null -ne $answer -and ([uint32]$answer) -ne 0) { return "yes" }
    return "no"
  } catch {
    return ("failed: {0}" -f $_.Exception.Message)
  }
}
