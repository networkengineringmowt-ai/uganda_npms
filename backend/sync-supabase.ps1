[CmdletBinding()]
param(
  [string]$DatabasePath = (Join-Path (Split-Path -Parent $PSScriptRoot) "data\npms_backend.db"),
  [string]$ImageName = "uganda-npms-backend",
  [string]$ImageTag = "1.1.0"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvironmentFile = Join-Path $ProjectRoot ".env.kubernetes"

if (Test-Path -LiteralPath $EnvironmentFile) {
  foreach ($Line in Get-Content -LiteralPath $EnvironmentFile) {
    $TrimmedLine = $Line.Trim()
    if ([string]::IsNullOrWhiteSpace($TrimmedLine) -or $TrimmedLine.StartsWith("#")) { continue }
    $Parts = $TrimmedLine.Split("=", 2)
    if ($Parts.Count -eq 2 -and [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Parts[0]))) {
      [Environment]::SetEnvironmentVariable($Parts[0], $Parts[1], "Process")
    }
  }
}

$ResolvedDatabase = (Resolve-Path -LiteralPath $DatabasePath).Path
$DatabaseUrl = [Environment]::GetEnvironmentVariable("PMS_DATABASE_URL")
$ImageReference = "${ImageName}:${ImageTag}"

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "PMS_DATABASE_URL must be set to the Supabase PostgreSQL connection string."
}

docker run --rm `
  --volume "${ResolvedDatabase}:/data/source.db:ro" `
  --env PMS_DB_PATH=/data/source.db `
  --env PMS_DATABASE_URL `
  $ImageReference python /app/sync_supabase.py
