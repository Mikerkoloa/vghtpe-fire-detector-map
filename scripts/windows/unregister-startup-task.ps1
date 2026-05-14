param(
  [string]$TaskName = "VghtpeFireDetectorMap",
  [switch]$StopServer
)

$ErrorActionPreference = "Stop"

$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Unregistered scheduled task: $TaskName"
} else {
  Write-Host "Scheduled task not found: $TaskName"
}

if ($StopServer) {
  $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $StopScript = Join-Path $ScriptDir "stop-background.ps1"
  & $StopScript -Force
}
