param(
  [string]$TaskName = "VghtpeFireDetectorMap"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$StartScript = Join-Path $ProjectRoot "scripts\windows\start-background.ps1"
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`""

$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser

$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

$Principal = New-ScheduledTaskPrincipal `
  -UserId $CurrentUser `
  -LogonType Interactive `
  -RunLevel LeastPrivilege

$Description = "Start VGH TPE fire detector map local web server at user logon."

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Description $Description `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host "Registered scheduled task: $TaskName"
Write-Host "User: $CurrentUser"
Write-Host "The server will start after this user logs in."
Write-Host "Started task now. URL: http://localhost:4173"
