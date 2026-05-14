param(
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$ServerJs = Join-Path $ProjectRoot "server.js"
$LogDir = Join-Path $ProjectRoot "logs"
$PidFile = Join-Path $LogDir "server.pid"
$OutLog = Join-Path $LogDir "server.out.log"
$ErrLog = Join-Path $LogDir "server.err.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (Test-Path -LiteralPath $PidFile) {
  $ExistingPidText = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $ExistingPid = 0
  if ([int]::TryParse($ExistingPidText, [ref]$ExistingPid)) {
    $ExistingProcess = Get-Process -Id $ExistingPid -ErrorAction SilentlyContinue
    if ($ExistingProcess) {
      Write-Host "Already running. PID: $ExistingPid"
      Write-Host "URL: http://localhost:$Port"
      exit 0
    }
  }
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

$NodeCommand = Get-Command node.exe -ErrorAction Stop
$NodePath = $NodeCommand.Source

$Process = Start-Process `
  -FilePath $NodePath `
  -ArgumentList @("`"$ServerJs`"") `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog `
  -PassThru

Set-Content -LiteralPath $PidFile -Value $Process.Id -Encoding ASCII

Write-Host "Started server. PID: $($Process.Id)"
Write-Host "URL: http://localhost:$Port"
Write-Host "Logs:"
Write-Host "  $OutLog"
Write-Host "  $ErrLog"
