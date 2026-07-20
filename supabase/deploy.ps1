[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ConfigPath = Join-Path $PSScriptRoot "config.toml"
$ProjectLine = Select-String -LiteralPath $ConfigPath -Pattern '^project_id\s*=\s*"([^\"]+)"$'
$ProjectRef = $ProjectLine.Matches[0].Groups[1].Value

if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN"))) {
  throw "SUPABASE_ACCESS_TOKEN must be set in the current environment."
}
if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("SUPABASE_DB_PASSWORD"))) {
  throw "SUPABASE_DB_PASSWORD must be set in the current environment."
}

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  npx --yes supabase@latest link --project-ref $ProjectRef
  npx --yes supabase@latest db push --linked --include-all
}
finally {
  Pop-Location
}
