param(
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$LogDir = Join-Path $ProjectRoot "logs"
$PidFile = Join-Path $LogDir "server.pid"
$TaskName = "VghtpeFireDetectorMap"

$ServerPid = $null
$ProcessRunning = $false

if (Test-Path -LiteralPath $PidFile) {
  $PidText = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $ParsedPid = 0
  if ([int]::TryParse($PidText, [ref]$ParsedPid)) {
    $ServerPid = $ParsedPid
    $ProcessRunning = [bool](Get-Process -Id $ServerPid -ErrorAction SilentlyContinue)
  }
}

$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$HttpStatus = "not checked"

try {
  $Response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/" -TimeoutSec 3
  $HttpStatus = "HTTP $($Response.StatusCode)"
} catch {
  $HttpStatus = "not responding"
}

Write-Host "Project: $ProjectRoot"
Write-Host "URL: http://localhost:$Port"
Write-Host "PID file: $PidFile"
Write-Host "PID: $ServerPid"
Write-Host "Process running: $ProcessRunning"
Write-Host "HTTP status: $HttpStatus"
if ($Task) {
  Write-Host "Scheduled task: $($Task.TaskName) / $($Task.State)"
} else {
  Write-Host "Scheduled task: not registered"
}
