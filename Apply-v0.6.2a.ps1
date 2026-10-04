$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = if (Test-Path (Join-Path $root 'js\app.js')) { $root } else { Split-Path -Parent $root }
$appPath = Join-Path $projectRoot 'js\app.js'
$versionsPath = Join-Path $projectRoot 'js\versions.js'
$registryPath = Join-Path $projectRoot 'js\geometry\geometry-registry.js'
$trbPath = Join-Path $projectRoot 'js\geometry\trb-geometry-provider.js'
$sourceTrbPath = Join-Path $root 'js\geometry\trb-geometry-provider.js'

foreach ($path in @($appPath, $versionsPath, $registryPath, $trbPath, $sourceTrbPath)) {
    if (-not (Test-Path $path)) { throw "Fant ikke nødvendig fil: $path" }
}

Copy-Item $appPath "$appPath.v062a.bak" -Force
Copy-Item $versionsPath "$versionsPath.v062a.bak" -Force
Copy-Item $registryPath "$registryPath.v062a.bak" -Force
Copy-Item $trbPath "$trbPath.v062a.bak" -Force

$sourceResolved = [System.IO.Path]::GetFullPath($sourceTrbPath)
$destinationResolved = [System.IO.Path]::GetFullPath($trbPath)

if ($sourceResolved -ne $destinationResolved) {
    Copy-Item -LiteralPath $sourceTrbPath -Destination $trbPath -Force
    Write-Host "Kopierte TRB-provider: $sourceResolved -> $destinationResolved"
}
else {
    Write-Host 'TRB-provider ligger allerede på riktig plass. Kopiering hoppes over.'
}

$app = Get-Content $appPath -Raw -Encoding UTF8
$app = [regex]::Replace($app, 'versions\.js(?:\?v=[^"'']+)?', 'versions.js?v=0.6.2a')
$app = [regex]::Replace($app, 'geometry-registry\.js(?:\?v=[^"'']+)?', 'geometry-registry.js?v=0.6.2a')
$app = [regex]::Replace($app, 'svg-renderer\.js(?:\?v=[^"'']+)?', 'svg-renderer.js?v=0.6.2a')
$app = [regex]::Replace($app, 'section-engine\.js(?:\?v=[^"'']+)?', 'section-engine.js?v=0.6.2a')
$app = [regex]::Replace($app, 'from\s*["'']\.\/tc-api\.js(?:\?v=[^"'']+)?["'']', 'from "./tc-api.js"')
Set-Content $appPath $app -Encoding UTF8 -NoNewline

$registry = Get-Content $registryPath -Raw -Encoding UTF8
$registry = [regex]::Replace($registry, 'trb-geometry-provider\.js(?:\?v=[^"'']+)?', 'trb-geometry-provider.js?v=0.6.2a')
$registry = [regex]::Replace($registry, 'ifc-geometry-provider\.js(?:\?v=[^"'']+)?', 'ifc-geometry-provider.js?v=0.6.2a')
$registry = [regex]::Replace($registry, 'from\s*["'']\.\.\/tc-api\.js(?:\?v=[^"'']+)?["'']', 'from "../tc-api.js"')
$registry = $registry.Replace('0.6.1a-content-routing-shared-tc-api', '0.6.2a-trb8-mesh-diagnostic')
$registry = $registry.Replace('0.6.2-trb8-mesh-diagnostic', '0.6.2a-trb8-mesh-diagnostic')
$registry = $registry.Replace('INNHOLDSBASERT PROVIDER-RUTING v0.6.1a', 'INNHOLDSBASERT PROVIDER-RUTING v0.6.2a')
$registry = $registry.Replace('INNHOLDSBASERT PROVIDER-RUTING v0.6.2', 'INNHOLDSBASERT PROVIDER-RUTING v0.6.2a')
$registry = $registry.Replace('AUTOMATISK MODELLFIL v0.6.1a', 'AUTOMATISK MODELLFIL v0.6.2a')
$registry = $registry.Replace('AUTOMATISK MODELLFIL v0.6.2', 'AUTOMATISK MODELLFIL v0.6.2a')
if (-not $registry.Contains('provider.status === "ready-diagnostic"')) {
    $registry = $registry.Replace('if (provider.status === "ready") {', 'if (provider.status === "ready" || provider.status === "ready-diagnostic") {')
}
Set-Content $registryPath $registry -Encoding UTF8 -NoNewline

@'
export const APP_NAME = "Interaktiv tverrprofilviser";
export const VERSION = "0.6.2a";
export const BUILD_DATE = "2026-10-04 21:44";
'@ | Set-Content $versionsPath -Encoding UTF8 -NoNewline

Write-Host 'v0.6.2a er installert.' -ForegroundColor Green
Write-Host 'Se etter Console-blokken: TRB8-MESHDIAGNOSE v0.6.2'
