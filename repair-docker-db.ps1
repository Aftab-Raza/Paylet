param([string]$DatabaseUser = '')

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is unavailable. Start Docker Desktop and run this script from your Docker-enabled PowerShell terminal.'
}

function Invoke-Docker {
    param([string[]]$DockerArgs)
    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker command failed. Stopping repair; the database volume has not been deleted.'
    }
}

# Reconcile container environment with .env before using its password.
Invoke-Docker -DockerArgs @('compose', 'up', '-d', '--wait', 'db')
Invoke-Docker -DockerArgs @('compose', 'stop', 'frontend', 'backend')

$configuredUser = (& docker compose exec -T db printenv POSTGRES_USER | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not read the configured database username.' }
$candidates = if ($DatabaseUser) { @($DatabaseUser) } else { @($configuredUser, 'paylet_app', 'postgres') }
$existingUser = $null
foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if ($candidate -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw 'Database username must contain letters, digits, or underscores.' }
    # Windows PowerShell treats native stderr as errors; failed probes are expected.
    $ErrorActionPreference = 'Continue'
    $probe = & docker compose exec -T db psql -X -w -U $candidate -d postgres -Atc 'SELECT current_user' 2>$null
    $probeExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($probeExit -eq 0 -and ($probe | Out-String).Trim() -eq $candidate) {
        $existingUser = $candidate
        break
    }
}
if (!$existingUser) {
    throw 'No existing database login was found. Rerun with -DatabaseUser ORIGINAL_USERNAME. Keep the database volume.'
}

if ($existingUser -ne $configuredUser) {
    $envPath = Join-Path $PSScriptRoot '.env'
    $envText = [System.IO.File]::ReadAllText($envPath)
    $userSetting = '(?m)^\s*POSTGRES_USER\s*=[^\r\n]*'
    if ([regex]::IsMatch($envText, $userSetting)) {
        $envText = [regex]::Replace($envText, $userSetting, "POSTGRES_USER=$existingUser")
    } else {
        $envText += "`r`nPOSTGRES_USER=$existingUser`r`n"
    }
    [System.IO.File]::WriteAllText($envPath, $envText, (New-Object System.Text.UTF8Encoding($false)))
    # Keep this run consistent even if the caller had an old shell override.
    $env:POSTGRES_USER = $existingUser
    Write-Host "Using existing database role: $existingUser. Updated root .env."
    Invoke-Docker -DockerArgs @('compose', 'up', '-d', '--wait', 'db')
}

# The official Postgres image permits local socket administration. psql reads
# credentials inside the container; format quotes the role and password safely.
$sql = @'
\getenv db_user POSTGRES_USER
\getenv db_password POSTGRES_PASSWORD
SELECT format('ALTER ROLE %I PASSWORD %L', :'db_user', :'db_password') \gexec
'@
$sql | & docker compose exec -T db sh -c 'export PGUSER=$POSTGRES_USER; exec psql -X -v ON_ERROR_STOP=1 -d postgres'
if ($LASTEXITCODE -ne 0) {
    throw 'Password update failed. Keep the database volume. The original database administrator role or socket authentication may differ; inspect the error above.'
}

Invoke-Docker -DockerArgs @('compose', 'build', 'backend', 'frontend')
Invoke-Docker -DockerArgs @('compose', 'run', '--rm', '--no-deps', 'backend', 'node', 'scripts/check-db.mjs')
Invoke-Docker -DockerArgs @('compose', 'up', '-d', '--wait')
Invoke-Docker -DockerArgs @('compose', 'ps')
Write-Host 'Database password synchronized and containers started. Open http://localhost:8080'
