param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$LogDir = Join-Path $ProjectRoot "logs"
$PidFile = Join-Path $LogDir "server.pid"

if (!(Test-Path -LiteralPath $PidFile)) {
  Write-Host "No PID file found. Nothing to stop."
  exit 0
}

$PidText = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
$ServerPid = 0

if (!([int]::TryParse($PidText, [ref]$ServerPid))) {
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  Write-Host "PID file was invalid and has been removed."
  exit 0
}

$Process = Get-Process -Id $ServerPid -ErrorAction SilentlyContinue

if (!$Process) {
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  Write-Host "Server process was not running. PID file removed."
  exit 0
}

Stop-Process -Id $ServerPid -Force:$Force
Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
Write-Host "Stopped server. PID: $ServerPid"
