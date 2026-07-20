[CmdletBinding()]
param(
  [string]$ImageName = "uganda-npms-backend",
  [string]$ImageTag = "1.1.0",
  [string]$Namespace = "npms",
  [string]$KubernetesContext = "docker-desktop"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ManifestRoot = Join-Path $PSScriptRoot "base"
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

$DatabaseUrl = [Environment]::GetEnvironmentVariable("PMS_DATABASE_URL")
$AdminKey = [Environment]::GetEnvironmentVariable("PMS_ADMIN_KEY")
$ImageReference = "${ImageName}:${ImageTag}"

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "PMS_DATABASE_URL must be set to the Supabase PostgreSQL connection string."
}
if ([string]::IsNullOrWhiteSpace($AdminKey)) {
  throw "PMS_ADMIN_KEY must be set before deployment."
}

docker build --file (Join-Path $ProjectRoot "backend\Dockerfile") --tag $ImageReference $ProjectRoot
kubectl config use-context $KubernetesContext
kubectl apply --filename (Join-Path $ManifestRoot "namespace.yaml")
kubectl --namespace $Namespace create secret generic npms-backend-secrets `
  --from-literal="database-url=$DatabaseUrl" `
  --from-literal="admin-key=$AdminKey" `
  --dry-run=client --output=yaml | kubectl apply --filename -
kubectl apply --kustomize $ManifestRoot
kubectl --namespace $Namespace set image deployment/npms-backend "api=$ImageReference"
kubectl --namespace $Namespace rollout status deployment/npms-backend --timeout=180s
kubectl --namespace $Namespace get deployment,pod,service
