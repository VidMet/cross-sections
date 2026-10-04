$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = if (Test-Path (Join-Path $root 'js\app.js')) { $root } else { Split-Path -Parent $root }
$appPath = Join-Path $projectRoot 'js\app.js'
$versionsPath = Join-Path $projectRoot 'js\versions.js'
$registryPath = Join-Path $projectRoot 'js\geometry\geometry-registry.js'

foreach ($path in @($appPath, $versionsPath, $registryPath)) {
    if (-not (Test-Path $path)) { throw "Fant ikke nødvendig fil: $path" }
}

Copy-Item $appPath "$appPath.v061a.bak" -Force
Copy-Item $versionsPath "$versionsPath.v061a.bak" -Force
Copy-Item $registryPath "$registryPath.v061a.bak" -Force

$app = Get-Content $appPath -Raw -Encoding UTF8
$registry = Get-Content $registryPath -Raw -Encoding UTF8

# Viktig: tc-api.js er en tilstandsbærende singleton og skal ha identisk, uversjonert URL i hele modulgrafen.
$app = [regex]::Replace(
    $app,
    'from\s*["'']\.\/tc-api\.js(?:\?v=[^"'']+)?["'']',
    'from "./tc-api.js"'
)
$registry = [regex]::Replace(
    $registry,
    'from\s*["'']\.\.\/tc-api\.js(?:\?v=[^"'']+)?["'']',
    'from "../tc-api.js"'
)

# Cache-bust øvrige moduler.
$app = [regex]::Replace($app, 'versions\.js(?:\?v=[^"'']+)?', 'versions.js?v=0.6.1a')
$app = [regex]::Replace($app, 'geometry-registry\.js(?:\?v=[^"'']+)?', 'geometry-registry.js?v=0.6.1a')
$app = [regex]::Replace($app, 'svg-renderer\.js(?:\?v=[^"'']+)?', 'svg-renderer.js?v=0.6.1a')
$app = [regex]::Replace($app, 'section-engine\.js(?:\?v=[^"'']+)?', 'section-engine.js?v=0.6.1a')

$registry = [regex]::Replace($registry, 'ifc-geometry-provider\.js(?:\?v=[^"'']+)?', 'ifc-geometry-provider.js?v=0.6.1a')
$registry = [regex]::Replace($registry, 'trb-geometry-provider\.js(?:\?v=[^"'']+)?', 'trb-geometry-provider.js?v=0.6.1a')
$registry = $registry.Replace('0.6.1-content-routing', '0.6.1a-content-routing-shared-tc-api')
$registry = $registry.Replace('INNHOLDSBASERT PROVIDER-RUTING v0.6.1', 'INNHOLDSBASERT PROVIDER-RUTING v0.6.1a')
$registry = $registry.Replace('AUTOMATISK MODELLFIL v0.6.1', 'AUTOMATISK MODELLFIL v0.6.1a')

Set-Content $appPath $app -Encoding UTF8 -NoNewline
Set-Content $registryPath $registry -Encoding UTF8 -NoNewline

@'
export const APP_NAME = "Interaktiv tverrprofilviser";
export const VERSION = "0.6.1a";
export const BUILD_DATE = "2026-10-04 21:03";
'@ | Set-Content $versionsPath -Encoding UTF8 -NoNewline

$requiredApp = @(
    'from "./tc-api.js"',
    'versions.js?v=0.6.1a',
    'geometry-registry.js?v=0.6.1a',
    'svg-renderer.js?v=0.6.1a',
    'section-engine.js?v=0.6.1a'
)
$requiredRegistry = @(
    'from "../tc-api.js"',
    'ifc-geometry-provider.js?v=0.6.1a',
    'trb-geometry-provider.js?v=0.6.1a',
    '0.6.1a-content-routing-shared-tc-api'
)
foreach ($value in $requiredApp) {
    if (-not $app.Contains($value)) { throw "Kontroll feilet i app.js: $value mangler" }
}
foreach ($value in $requiredRegistry) {
    if (-not $registry.Contains($value)) { throw "Kontroll feilet i geometry-registry.js: $value mangler" }
}
if ($app -match 'tc-api\.js\?v=') { throw 'app.js inneholder fortsatt versjonert tc-api.js-import' }
if ($registry -match 'tc-api\.js\?v=') { throw 'geometry-registry.js inneholder fortsatt versjonert tc-api.js-import' }

Write-Host 'v0.6.1a er installert.' -ForegroundColor Green
Write-Host 'app.js og geometry-registry.js bruker nå samme uversjonerte tc-api.js-modul.'
Write-Host "Backup: $appPath.v061a.bak"
Write-Host "Backup: $registryPath.v061a.bak"
Write-Host "Backup: $versionsPath.v061a.bak"
