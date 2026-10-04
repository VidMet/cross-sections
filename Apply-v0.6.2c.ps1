$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = if (Test-Path (Join-Path $root 'js\app.js')) { $root } else { Split-Path -Parent $root }
$appPath = Join-Path $projectRoot 'js\app.js'
$versionsPath = Join-Path $projectRoot 'js\versions.js'
$registryPath = Join-Path $projectRoot 'js\geometry\geometry-registry.js'
$trbPath = Join-Path $projectRoot 'js\geometry\trb-geometry-provider.js'
$vendorDirectory = Join-Path $projectRoot 'js\vendor'
$vendorBundle = Join-Path $vendorDirectory 'trb-sdk.bundle.js'
$tempDirectory = Join-Path $env:TEMP 'cross-sections-trb-sdk-v062c'

foreach ($path in @($appPath, $versionsPath, $registryPath, $trbPath)) {
    if (-not (Test-Path $path)) { throw "Fant ikke nødvendig fil: $path" }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js ble ikke funnet. Installer Node.js før v0.6.2c kjøres.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm ble ikke funnet. Installer Node.js med npm før v0.6.2c kjøres.'
}

Copy-Item $appPath "$appPath.v062c.bak" -Force
Copy-Item $versionsPath "$versionsPath.v062c.bak" -Force
Copy-Item $registryPath "$registryPath.v062c.bak" -Force
Copy-Item $trbPath "$trbPath.v062c.bak" -Force

New-Item -ItemType Directory -Path $vendorDirectory -Force | Out-Null
Remove-Item $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tempDirectory -Force | Out-Null

Push-Location $tempDirectory
try {
    & npm init -y | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'npm init feilet.' }

    & npm install --no-audit --no-fund 'github:specklesystems/trb-sdk#main' 'esbuild'
    if ($LASTEXITCODE -ne 0) { throw 'npm install fra GitHub-repositoriet specklesystems/trb-sdk og esbuild feilet.' }

@'
export { TrimBimReader, SUPPORTED_GEOMETRY_TYPES } from "@speckle/trb-sdk";
'@ | Set-Content (Join-Path $tempDirectory 'entry.mjs') -Encoding UTF8 -NoNewline

    & .\node_modules\.bin\esbuild.cmd '.\entry.mjs' '--bundle' '--format=esm' '--platform=browser' '--target=es2022' '--minify' "--outfile=$vendorBundle"
    if ($LASTEXITCODE -ne 0) { throw 'Bundling av TRB-SDK feilet.' }
}
finally {
    Pop-Location
}

if (-not (Test-Path $vendorBundle)) { throw "Lokalt SDK-bundle ble ikke opprettet: $vendorBundle" }
$bundleSize = (Get-Item $vendorBundle).Length
if ($bundleSize -lt 1000) { throw "Lokalt SDK-bundle virker ufullstendig: $bundleSize byte" }

$trbProvider = Get-Content $trbPath -Raw -Encoding UTF8
$trbProvider = $trbProvider.Replace('https://esm.sh/@speckle/trb-sdk', '../vendor/trb-sdk.bundle.js?v=0.6.2c')
$trbProvider = $trbProvider.Replace('0.6.2-trb8-mesh-diagnostic', '0.6.2c-local-trb8-mesh-diagnostic')
$trbProvider = $trbProvider.Replace('TRB8-MESHDIAGNOSE v0.6.2', 'TRB8-MESHDIAGNOSE v0.6.2c')
if (-not $trbProvider.Contains('../vendor/trb-sdk.bundle.js?v=0.6.2c')) {
    throw 'Kunne ikke sette lokal SDK-adresse i trb-geometry-provider.js.'
}
Set-Content $trbPath $trbProvider -Encoding UTF8 -NoNewline

$app = Get-Content $appPath -Raw -Encoding UTF8
$app = [regex]::Replace($app, 'versions\.js(?:\?v=[^"'']+)?', 'versions.js?v=0.6.2c')
$app = [regex]::Replace($app, 'geometry-registry\.js(?:\?v=[^"'']+)?', 'geometry-registry.js?v=0.6.2c')
$app = [regex]::Replace($app, 'svg-renderer\.js(?:\?v=[^"'']+)?', 'svg-renderer.js?v=0.6.2c')
$app = [regex]::Replace($app, 'section-engine\.js(?:\?v=[^"'']+)?', 'section-engine.js?v=0.6.2c')
$app = [regex]::Replace($app, 'from\s*["'']\.\/tc-api\.js(?:\?v=[^"'']+)?["'']', 'from "./tc-api.js"')
Set-Content $appPath $app -Encoding UTF8 -NoNewline

$registry = Get-Content $registryPath -Raw -Encoding UTF8
$registry = [regex]::Replace($registry, 'trb-geometry-provider\.js(?:\?v=[^"'']+)?', 'trb-geometry-provider.js?v=0.6.2c')
$registry = [regex]::Replace($registry, 'ifc-geometry-provider\.js(?:\?v=[^"'']+)?', 'ifc-geometry-provider.js?v=0.6.2c')
$registry = [regex]::Replace($registry, 'from\s*["'']\.\.\/tc-api\.js(?:\?v=[^"'']+)?["'']', 'from "../tc-api.js"')
$registry = $registry.Replace('0.6.2a-trb8-mesh-diagnostic', '0.6.2c-local-trb8-mesh-diagnostic')
$registry = $registry.Replace('INNHOLDSBASERT PROVIDER-RUTING v0.6.2a', 'INNHOLDSBASERT PROVIDER-RUTING v0.6.2c')
$registry = $registry.Replace('AUTOMATISK MODELLFIL v0.6.2a', 'AUTOMATISK MODELLFIL v0.6.2c')
if (-not $registry.Contains('provider.status === "ready-diagnostic"')) {
    $registry = $registry.Replace('if (provider.status === "ready") {', 'if (provider.status === "ready" || provider.status === "ready-diagnostic") {')
}
Set-Content $registryPath $registry -Encoding UTF8 -NoNewline

@'
export const APP_NAME = "Interaktiv tverrprofilviser";
export const VERSION = "0.6.2c";
export const BUILD_DATE = "2026-10-04 22:12";
'@ | Set-Content $versionsPath -Encoding UTF8 -NoNewline

Remove-Item $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue

Write-Host 'v0.6.2c er installert med lokalt TRB-SDK-bundle.' -ForegroundColor Green
Write-Host "SDK-bundle: $vendorBundle ($bundleSize byte)"
Write-Host 'Se etter Console-blokken: TRB8-MESHDIAGNOSE v0.6.2c'
