# Test of the keep-awake request with a stub for the native call (no power setting is touched), then one real call in this scratch process.
# Exit code 0 when everything holds, 1 otherwise.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "keep-awake.ps1")
$failures = @()
function Check([string]$name, $actual, $expected) {
  if ($actual -ne $expected) { $script:failures += ("{0}: expected [{1}] got [{2}]" -f $name, $expected, $actual) }
}

# the flags are the uint32 with the bits of 0x80000001, not the negative Int32
Check "flags type" $KeepAwakeFlags.GetType().Name "UInt32"
Check "flags value" $KeepAwakeFlags 2147483649
Check "flags bits" ([uint32]::Parse("80000001", [System.Globalization.NumberStyles]::HexNumber)) $KeepAwakeFlags

# a stub with the real signature (uint32): it must bind, receive the flags and say what the system would say
$seen = New-Object System.Collections.ArrayList
$accepting = { param([uint32]$flags) [void]$seen.Add($flags); [uint32]2147483648 }
Check "accepted" (Request-KeepAwake $accepting) "yes"
Check "stub got flags" ($seen[0]) 2147483649

# the system answers 0 (it did not accept), or nothing, or the call throws: never reported as accepted
Check "zero" (Request-KeepAwake { param([uint32]$flags) [uint32]0 }) "no"
Check "null" (Request-KeepAwake { param([uint32]$flags) $null }) "no"
$thrown = Request-KeepAwake { param([uint32]$flags) throw "boom" }
Check "thrown prefix" ($thrown.StartsWith("failed: ")) $true
Check "thrown text" ($thrown -match "boom") $true

# a stub whose parameter is a uint32 refuses the Int32 spelling: the very error the review reproduced, which the explicit flags avoid
$binding = $true
try { & { param([uint32]$flags) $flags } (0x80000001) | Out-Null } catch { $binding = $false }
Check "negative int32 does not bind" $binding $false

# one real call, in this scratch process only (the state ends with the process)
$real = Request-KeepAwake
Check "real call accepted" $real "yes"

if ($failures.Count -gt 0) { $failures | ForEach-Object { Write-Output ("FAIL " + $_) }; exit 1 }
Write-Output "ok"
exit 0
