$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = if (Test-Path (Join-Path $root 'js\app.js')) { $root } else { Split-Path -Parent $root }
$appPath = Join-Path $projectRoot 'js\app.js'
$versionsPath = Join-Path $projectRoot 'js\versions.js'
$providerPath = Join-Path $projectRoot 'js\geometry\ifc-geometry-provider.js'
foreach ($path in @($appPath,$versionsPath,$providerPath)) { if (-not (Test-Path $path)) { throw "Fant ikke nødvendig fil: $path" } }
Copy-Item $appPath "$appPath.v060d.bak" -Force
Copy-Item $versionsPath "$versionsPath.v060d.bak" -Force
Copy-Item $providerPath "$providerPath.v060d.bak" -Force

$provider = Get-Content $providerPath -Raw -Encoding UTF8
$helpers = @'

export const IFC_GEOMETRY_PROVIDER_VERSION = "0.6.0d-ifc-signature-diagnostic";
const IFC_SIGNATURE_SAMPLE_BYTES = 4096;

function byteHex(bytes, maximum = 32) {
    return Array.from(bytes.slice(0, maximum))
        .map(value => value.toString(16).padStart(2, "0"))
        .join(" ");
}

function printablePreview(bytes, maximum = 160) {
    return Array.from(bytes.slice(0, maximum))
        .map(value => value >= 32 && value <= 126 ? String.fromCharCode(value) : ".")
        .join("");
}

function inspectIfcSignature(data, file) {
    const sample = data.slice(0, Math.min(data.length, IFC_SIGNATURE_SAMPLE_BYTES));
    let text = "";
    try { text = new TextDecoder("utf-8", { fatal: false }).decode(sample); }
    catch { text = ""; }
    const normalized = text.replace(/^\uFEFF/, "").trimStart();
    const compact = normalized.slice(0, 512).toUpperCase();
    const hasStepStart = compact.startsWith("ISO-10303-21;");
    const hasHeader = /ISO-10303-21;[\s\S]{0,256}HEADER\s*;/i.test(normalized);
    const hasData = /\bDATA\s*;/i.test(text);
    const looksLikeZip = sample.length >= 4 && sample[0] === 0x50 && sample[1] === 0x4b && [0x03,0x05,0x07].includes(sample[2]);
    const nullBytes = Array.from(sample).filter(value => value === 0).length;
    const highBytes = Array.from(sample).filter(value => value > 127).length;
    return {
        fileName: file?.name || "",
        fileSize: data.length,
        mimeType: file?.type || "",
        sampleSize: sample.length,
        hasStepStart,
        hasHeader,
        hasData,
        looksLikeZip,
        nullByteCount: nullBytes,
        highByteCount: highBytes,
        firstBytesHex: byteHex(sample),
        printablePreview: printablePreview(sample),
        decodedPreview: text.slice(0, 300),
        validIfcStepSignature: hasStepStart && hasHeader
    };
}
'@
if ($provider -notmatch 'IFC_GEOMETRY_PROVIDER_VERSION') {
    $provider = $provider -replace '(import \{ normalizeIfcGeometry \} from "\.\/mesh-normalizer\.js";)', "`$1$helpers"
}

$old = 'const data = new Uint8Array(await this.file.arrayBuffer());'
$new = @'
const data = new Uint8Array(await this.file.arrayBuffer());
            const signature = inspectIfcSignature(data, this.file);
            console.log("===== IFC-SIGNATURDIAGNOSE v0.6.0d =====");
            console.dir({ sourceId: this.id, origin: this.origin, ...signature });
            this.metadata = { ...(this.metadata || {}), signature, providerVersion: IFC_GEOMETRY_PROVIDER_VERSION };
            if (!signature.validIfcStepSignature) {
                this.status = "invalid-ifc-signature";
                this.error = signature.looksLikeZip
                    ? "Filen starter som ZIP/komprimert innhold, ikke klartekst IFC STEP."
                    : "Filen mangler IFC STEP-signaturen ISO-10303-21; og HEADER;.";
                console.warn("IFC-SIGNATUR AVVIST:", { sourceId: this.id, fileName: this.file?.name || "", error: this.error, signature });
                return this.getSummary();
            }
'@
if (-not $provider.Contains($old)) { throw 'Fant ikke innlesingslinjen i ifc-geometry-provider.js.' }
$provider = $provider.Replace($old,$new)

$provider = $provider.Replace('this.metadata = { schema, entityCount: this.entities.length, meshCount, webIfcVersion: WEB_IFC_VERSION };','this.metadata = { ...(this.metadata || {}), schema, entityCount: this.entities.length, meshCount, webIfcVersion: WEB_IFC_VERSION, providerVersion: IFC_GEOMETRY_PROVIDER_VERSION };')
$provider = $provider.Replace('this.metadata = { schema, entityCount: this.entities.length, meshCount, webIfcVersion: WEB_IFC_VERSION, coordinationMatrix };','this.metadata = { ...(this.metadata || {}), schema, entityCount: this.entities.length, meshCount, webIfcVersion: WEB_IFC_VERSION, coordinationMatrix, providerVersion: IFC_GEOMETRY_PROVIDER_VERSION };')
Set-Content $providerPath $provider -Encoding UTF8 -NoNewline

$app = Get-Content $appPath -Raw -Encoding UTF8
$app = [regex]::Replace($app,'versions\.js(?:\?v=[^"'']+)?','versions.js?v=0.6.0d')
$app = [regex]::Replace($app,'geometry-registry\.js(?:\?v=[^"'']+)?','geometry-registry.js?v=0.6.0d')
$app = [regex]::Replace($app,'svg-renderer\.js(?:\?v=[^"'']+)?','svg-renderer.js?v=0.6.0d')
$app = [regex]::Replace($app,'section-engine\.js(?:\?v=[^"'']+)?','section-engine.js?v=0.6.0d')
Set-Content $appPath $app -Encoding UTF8 -NoNewline

@'
export const APP_NAME = "Interaktiv tverrprofilviser";
export const VERSION = "0.6.0d";
export const BUILD_DATE = "2026-10-04 20:31";
'@ | Set-Content $versionsPath -Encoding UTF8 -NoNewline

Write-Host 'v0.6.0d er installert.' -ForegroundColor Green
Write-Host 'Se etter Console-blokken: IFC-SIGNATURDIAGNOSE v0.6.0d'
