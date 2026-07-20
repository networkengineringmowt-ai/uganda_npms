param(
  [switch]$Install,
  [switch]$Train,
  [switch]$FullIngest,
  [string]$FwdRoot
)

$ErrorActionPreference = 'Stop'
$Backend = Split-Path -Parent $MyInvocation.MyCommand.Path

function Invoke-Python {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & python @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Python command failed with exit code ${LASTEXITCODE}: python $($Arguments -join ' ')"
  }
}

Push-Location $Backend
try {
  if ($FwdRoot) {
    $env:NPMS_FWD_ROOT = (Resolve-Path -LiteralPath $FwdRoot).Path
  }
  if ($Install) {
    Invoke-Python -m pip install -e .
  }

  Invoke-Python -m compileall -q pms_backend pavement_data_engine.py tests
  Invoke-Python -m unittest discover -s tests -v
  Invoke-Python -m pms_backend init-db

  if ($FullIngest) {
    Invoke-Python pavement_data_engine.py
  }

  if ($Train) {
    Invoke-Python -m pms_backend train
  }

  Write-Host 'NPMS backend build completed successfully.' -ForegroundColor Green
} finally {
  Pop-Location
}
