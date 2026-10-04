$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $root

# If the script is copied directly into the project root, use that location.
if (Test-Path (Join-Path $root 'js\app.js')) {
    $projectRoot = $root
}

$appPath = Join-Path $projectRoot 'js\app.js'
$versionsPath = Join-Path $projectRoot 'js\versions.js'
$registryPath = Join-Path $projectRoot 'js\geometry\geometry-registry.js'

foreach ($path in @($appPath, $versionsPath, $registryPath)) {
    if (-not (Test-Path $path)) {
        throw "Fant ikke nødvendig fil: $path"
    }
}

Copy-Item $appPath "$appPath.v060a.bak" -Force
Copy-Item $versionsPath "$versionsPath.v060a.bak" -Force

$app = Get-Content $appPath -Raw -Encoding UTF8

$replacements = [ordered]@{
    './versions.js?v=0.5.4h' = './versions.js?v=0.6.0a'
    './versions.js?v=0.5.4i' = './versions.js?v=0.6.0a'
    './versions.js?v=0.5.5' = './versions.js?v=0.6.0a'
    './versions.js?v=0.6.0' = './versions.js?v=0.6.0a'
    './geometry/geometry-registry.js?v=0.6.0' = './geometry/geometry-registry.js?v=0.6.0a'
    './geometry/geometry-registry.js' = './geometry/geometry-registry.js?v=0.6.0a'
    './svg-renderer.js?v=0.5.5' = './svg-renderer.js?v=0.6.0a'
    './svg-renderer.js' = './svg-renderer.js?v=0.6.0a'
    './geometry/section-engine.js?v=0.5.4h' = './geometry/section-engine.js?v=0.6.0a'
    './geometry/section-engine.js?v=0.5.4i' = './geometry/section-engine.js?v=0.6.0a'
    './geometry/section-engine.js?v=0.6.0' = './geometry/section-engine.js?v=0.6.0a'
    '0.5.4h-viewer-ifc-calibration' = '0.5.4i-mirrored-offset'
}

foreach ($entry in $replacements.GetEnumerator()) {
    $app = $app.Replace($entry.Key, $entry.Value)
}

# Remove duplicate query strings if a prior replacement met an already versioned import.
$app = $app.Replace('?v=0.6.0a?v=0.6.0a', '?v=0.6.0a')

Set-Content $appPath $app -Encoding UTF8 -NoNewline

$versions = @'
export const APP_NAME = "Interaktiv tverrprofilviser";
export const VERSION = "0.6.0a";
export const BUILD_DATE = "2026-10-04 16:12";
'@
Set-Content $versionsPath $versions -Encoding UTF8 -NoNewline

$checks = @(
    @{ Name = 'GeometryRegistry cache-bust'; Pattern = 'geometry-registry.js?v=0.6.0a' },
    @{ Name = 'Versions cache-bust'; Pattern = 'versions.js?v=0.6.0a' },
    @{ Name = 'Section engine cache-bust'; Pattern = 'section-engine.js?v=0.6.0a' },
    @{ Name = 'SVG renderer cache-bust'; Pattern = 'svg-renderer.js?v=0.6.0a' }
)

foreach ($check in $checks) {
    if ($app -notmatch [regex]::Escape($check.Pattern)) {
        throw "Oppdateringen mangler: $($check.Name)"
    }
}

Write-Host 'v0.6.0a er lagt inn.' -ForegroundColor Green
Write-Host "Oppdatert: $appPath"
Write-Host "Oppdatert: $versionsPath"
Write-Host "Backup:    $appPath.v060a.bak"
Write-Host "Backup:    $versionsPath.v060a.bak"
