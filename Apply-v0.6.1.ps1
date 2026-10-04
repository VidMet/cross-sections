$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = if (Test-Path (Join-Path $root 'js\app.js')) { $root } else { Split-Path -Parent $root }
$appPath = Join-Path $projectRoot 'js\app.js'
$versionsPath = Join-Path $projectRoot 'js\versions.js'
$registryPath = Join-Path $projectRoot 'js\geometry\geometry-registry.js'
foreach ($path in @($appPath,$versionsPath,$registryPath)) { if (-not (Test-Path $path)) { throw "Fant ikke nødvendig fil: $path" } }
Copy-Item $appPath "$appPath.v061.bak" -Force
Copy-Item $versionsPath "$versionsPath.v061.bak" -Force
Copy-Item $registryPath "$registryPath.v061.bak" -Force

$registry = Get-Content $registryPath -Raw -Encoding UTF8

# Cache-bust provider dependencies loaded by the registry module.
$registry = [regex]::Replace($registry,'"\.\/ifc-geometry-provider\.js(?:\?v=[^"]+)?"','"./ifc-geometry-provider.js?v=0.6.1"')
$registry = [regex]::Replace($registry,'"\.\/trb-geometry-provider\.js(?:\?v=[^"]+)?"','"./trb-geometry-provider.js?v=0.6.1"')
$registry = [regex]::Replace($registry,'"\.\.\/tc-api\.js(?:\?v=[^"]+)?"','"../tc-api.js?v=0.6.1"')

$helpers = @'

export const GEOMETRY_REGISTRY_VERSION = "0.6.1-content-routing";
const ROUTING_SAMPLE_BYTES = 4096;

async function inspectLoadedContent(file) {
    const sample = new Uint8Array(await file.slice(0, ROUTING_SAMPLE_BYTES).arrayBuffer());
    let text = "";
    try { text = new TextDecoder("utf-8", { fatal: false }).decode(sample); } catch { text = ""; }
    const normalized = text.replace(/^\uFEFF/, "").trimStart();
    const ascii = Array.from(sample, value => value >= 32 && value <= 126 ? String.fromCharCode(value) : ".").join("");
    const validIfcStep = normalized.toUpperCase().startsWith("ISO-10303-21;") && /HEADER\s*;/i.test(normalized.slice(0, 1024));
    const trimBimIdentifier = ascii.match(/TRB\d/i)?.[0]?.toUpperCase() || null;
    const looksLikeTrimBim = Boolean(trimBimIdentifier || /TrimBimConverter/i.test(ascii));
    return {
        validIfcStep,
        looksLikeTrimBim,
        trimBimIdentifier,
        firstBytesHex: Array.from(sample.slice(0, 32)).map(value => value.toString(16).padStart(2, "0")).join(" "),
        printablePreview: ascii.slice(0, 200)
    };
}

function trbFileName(name) {
    const value = String(name || "model");
    return /\.(ifc|trb|trimbim)$/i.test(value)
        ? value.replace(/\.(ifc|trb|trimbim)$/i, ".trb")
        : `${value}.trb`;
}
'@
if ($registry -notmatch 'GEOMETRY_REGISTRY_VERSION = "0.6.1-content-routing"') {
    $anchor = [regex]::Match($registry,'import \{ getAPI \} from "\.\.\/tc-api\.js\?v=0\.6\.1";')
    if (-not $anchor.Success) { throw 'Fant ikke importankeret i geometry-registry.js.' }
    $registry = $registry.Insert($anchor.Index + $anchor.Length, $helpers)
}

# Provider must be replaceable after content inspection.
$registry = $registry.Replace('const provider = this.providers.find(item =>','let provider = this.providers.find(item =>')

$old = @'
                    provider.attachFile(file);
                    provider.fileOrigin =
                        "viewer-loaded-model";
                    updateOrigin(provider);
                    await provider.open();
'@
$new = @'
                    const content = await inspectLoadedContent(file);
                    let routedType = provider.type;
                    let routedFile = file;

                    if (content.looksLikeTrimBim) {
                        routedType = "trb";
                        routedFile = new File(
                            [file],
                            trbFileName(file.name),
                            { type: "application/octet-stream", lastModified: Date.now() }
                        );
                    }
                    else if (content.validIfcStep) {
                        routedType = "ifc";
                    }

                    if (provider.type !== routedType) {
                        const providerIndex = this.providers.indexOf(provider);
                        const previous = provider;
                        const routed = this.create({
                            id: previous.id,
                            name: routedFile.name,
                            origin: previous.origin,
                            modelId: previous.modelId,
                            modelSpec: previous.modelSpec,
                            file: routedFile
                        });
                        if (!routed) throw new Error(`Ingen provider for innholdstype ${routedType}`);
                        routed.fileOrigin = "viewer-loaded-model";
                        routed.viewerSourceName = file.name;
                        routed.contentRouting = content;
                        if (providerIndex >= 0) this.providers.splice(providerIndex, 1, routed);
                        provider = routed;
                    }
                    else {
                        provider.attachFile(routedFile);
                    }

                    provider.name = routedFile.name;
                    provider.fileOrigin = "viewer-loaded-model";
                    provider.contentRouting = content;
                    updateOrigin(provider);

                    console.log("===== INNHOLDSBASERT PROVIDER-RUTING v0.6.1 =====");
                    console.dir({
                        modelId,
                        viewerFileName: file.name,
                        routedFileName: routedFile.name,
                        originalProviderType: content.looksLikeTrimBim ? "ifc-by-name" : provider.type,
                        routedProviderType: provider.type,
                        ...content
                    });

                    await provider.open();
'@
if (-not $registry.Contains($old)) { throw 'Fant ikke provider.attachFile-blokken i geometry-registry.js.' }
$registry = $registry.Replace($old,$new)
$registry = $registry.Replace('===== AUTOMATISK MODELLFIL v0.6.0b =====','===== AUTOMATISK MODELLFIL v0.6.1 =====')
$registry = $registry.Replace('===== AUTOMATISK MODELLFIL v0.6.0 =====','===== AUTOMATISK MODELLFIL v0.6.1 =====')
Set-Content $registryPath $registry -Encoding UTF8 -NoNewline

$app = Get-Content $appPath -Raw -Encoding UTF8
$app = [regex]::Replace($app,'versions\.js(?:\?v=[^"'']+)?','versions.js?v=0.6.1')
$app = [regex]::Replace($app,'geometry-registry\.js(?:\?v=[^"'']+)?','geometry-registry.js?v=0.6.1')
$app = [regex]::Replace($app,'svg-renderer\.js(?:\?v=[^"'']+)?','svg-renderer.js?v=0.6.1')
$app = [regex]::Replace($app,'section-engine\.js(?:\?v=[^"'']+)?','section-engine.js?v=0.6.1')
Set-Content $appPath $app -Encoding UTF8 -NoNewline

@'
export const APP_NAME = "Interaktiv tverrprofilviser";
export const VERSION = "0.6.1";
export const BUILD_DATE = "2026-10-04 20:47";
'@ | Set-Content $versionsPath -Encoding UTF8 -NoNewline

$required = @('0.6.1-content-routing','INNHOLDSBASERT PROVIDER-RUTING v0.6.1','trbFileName','inspectLoadedContent')
foreach($value in $required){if(-not $registry.Contains($value)){throw "Kontroll feilet: $value mangler"}}
Write-Host 'v0.6.1 er installert med innholdsbasert ruting.' -ForegroundColor Green
Write-Host 'TRB8-innhold rutes nå til TrbGeometryProvider.'
