$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Start Docker Desktop and run this script from a Docker-enabled PowerShell terminal.'
}

# Building images does not require .env, a database, or running app containers.
& docker build --tag paylet-backend:latest --file backend/Dockerfile backend
if ($LASTEXITCODE -ne 0) { throw 'Backend image build failed.' }

& docker build --tag paylet-frontend:latest --file frontend/Dockerfile frontend
if ($LASTEXITCODE -ne 0) { throw 'Frontend image build failed.' }

Write-Host 'Built paylet-backend:latest and paylet-frontend:latest.'
