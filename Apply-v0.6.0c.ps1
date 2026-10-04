$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = if (Test-Path (Join-Path $root 'js\app.js')) { $root } else { Split-Path -Parent $root }
$appPath = Join-Path $projectRoot 'js\app.js'
$versionsPath = Join-Path $projectRoot 'js\versions.js'
$registryPath = Join-Path $projectRoot 'js\geometry\geometry-registry.js'
$enginePath = Join-Path $projectRoot 'js\geometry\section-engine.js'
$rendererPath = Join-Path $projectRoot 'js\svg-renderer.js'

foreach ($path in @($appPath, $versionsPath, $registryPath, $enginePath, $rendererPath)) {
    if (-not (Test-Path $path)) { throw "Fant ikke nødvendig fil: $path" }
}

Copy-Item $appPath "$appPath.v060c.bak" -Force
Copy-Item $versionsPath "$versionsPath.v060c.bak" -Force

$app = Get-Content $appPath -Raw -Encoding UTF8

# Oppdater alle importlinjene, uansett hvilken tidligere ?v-verdi de har.
$app = [regex]::Replace(
    $app,
    'from\s*["'']\.\/versions\.js(?:\?v=[^"'']+)?["'']',
    'from "./versions.js?v=0.6.0c"'
)
$app = [regex]::Replace(
    $app,
    'from\s*["'']\.\/geometry\/geometry-registry\.js(?:\?v=[^"'']+)?["'']',
    'from "./geometry/geometry-registry.js?v=0.6.0c"'
)
$app = [regex]::Replace(
    $app,
    'from\s*["'']\.\/svg-renderer\.js(?:\?v=[^"'']+)?["'']',
    'from "./svg-renderer.js?v=0.6.0c"'
)
$app = [regex]::Replace(
    $app,
    'from\s*["'']\.\/geometry\/section-engine\.js(?:\?v=[^"'']+)?["'']',
    'from "./geometry/section-engine.js?v=0.6.0c"'
)

# Oppdater hardkodet forventet snittmotorversjon.
$app = [regex]::Replace(
    $app,
    'const\s+EXPECTED_SECTION_ENGINE_VERSION\s*=\s*["''][^"'']+["'']\s*;',
    'const EXPECTED_SECTION_ENGINE_VERSION = "0.5.4i-mirrored-offset";'
)

# Oppdater alle forekomster i moduldiagnosen, ikke bare importene.
$app = [regex]::Replace(
    $app,
    '\.\/geometry\/section-engine\.js\?v=[A-Za-z0-9._-]+',
    './geometry/section-engine.js?v=0.6.0c'
)
$app = [regex]::Replace(
    $app,
    '\.\/geometry\/geometry-registry\.js\?v=[A-Za-z0-9._-]+',
    './geometry/geometry-registry.js?v=0.6.0c'
)
$app = [regex]::Replace(
    $app,
    '\.\/svg-renderer\.js\?v=[A-Za-z0-9._-]+',
    './svg-renderer.js?v=0.6.0c'
)
$app = [regex]::Replace(
    $app,
    '\.\/versions\.js\?v=[A-Za-z0-9._-]+',
    './versions.js?v=0.6.0c'
)

Set-Content $appPath $app -Encoding UTF8 -NoNewline

@'
export const APP_NAME = "Interaktiv tverrprofilviser";
export const VERSION = "0.6.0c";
export const BUILD_DATE = "2026-10-04 16:42";
'@ | Set-Content $versionsPath -Encoding UTF8 -NoNewline

$required = @(
    './versions.js?v=0.6.0c',
    './geometry/geometry-registry.js?v=0.6.0c',
    './svg-renderer.js?v=0.6.0c',
    './geometry/section-engine.js?v=0.6.0c',
    '0.5.4i-mirrored-offset'
)
foreach ($value in $required) {
    if (-not $app.Contains($value)) { throw "Kontroll feilet. app.js mangler: $value" }
}

$forbidden = @(
    './geometry/section-engine.js?v=0.5.4h',
    '0.5.4h-viewer-ifc-calibration'
)
foreach ($value in $forbidden) {
    if ($app.Contains($value)) { throw "Kontroll feilet. Gammel verdi finnes fortsatt: $value" }
}

Write-Host 'v0.6.0c er installert med cache-bustede importer.' -ForegroundColor Green
Write-Host 'Kontrollert:'
$required | ForEach-Object { Write-Host "  $_" }
Write-Host "Backup: $appPath.v060c.bak"
Write-Host "Backup: $versionsPath.v060c.bak"
