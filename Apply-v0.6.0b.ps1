$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = if (Test-Path (Join-Path $root 'js\geometry\geometry-registry.js')) { $root } else { Split-Path -Parent $root }
$registryPath = Join-Path $projectRoot 'js\geometry\geometry-registry.js'
$appPath = Join-Path $projectRoot 'js\app.js'
$versionsPath = Join-Path $projectRoot 'js\versions.js'
foreach ($path in @($registryPath, $appPath, $versionsPath)) { if (-not (Test-Path $path)) { throw "Fant ikke nødvendig fil: $path" } }
Copy-Item $registryPath "$registryPath.v060b.bak" -Force
Copy-Item $appPath "$appPath.v060b.bak" -Force
Copy-Item $versionsPath "$versionsPath.v060b.bak" -Force

$registry = Get-Content $registryPath -Raw -Encoding UTF8

$helper = @'

export const GEOMETRY_REGISTRY_VERSION = "0.6.0b-getLoadedModel-diagnostic";
const GET_LOADED_MODEL_TIMEOUT_MS = 12000;

function safeKeys(value) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return [];
    try { return Object.keys(value).sort(); }
    catch { return []; }
}

function valueType(value) {
    if (value === null) return "null";
    if (value instanceof Blob) return "Blob";
    if (Array.isArray(value)) return "Array";
    return typeof value;
}

function withTimeout(promise, timeoutMs, description) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error(`${description} fikk tidsavbrudd etter ${timeoutMs} ms`);
            error.name = "TimeoutError";
            reject(error);
        }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
'@
if ($registry -notmatch 'GEOMETRY_REGISTRY_VERSION') {
    $registry = $registry -replace '(import \{ getAPI \} from "\.\./tc-api\.js";)', "`$1$helper"
}

$old = @'
                    const loaded =
                        await api.viewer.getLoadedModel(modelId);
                    const file = loadedModelFile(
                        loaded,
                        name
                    );
'@
$new = @'
                    const startedAt = performance.now();
                    console.log("===== getLoadedModel START v0.6.0b =====");
                    console.dir({
                        generation,
                        modelId,
                        modelName: name,
                        timeoutMs: GET_LOADED_MODEL_TIMEOUT_MS,
                        modelKeys: safeKeys(model),
                        modelIdCandidates: {
                            modelId: model?.modelId ?? null,
                            id: model?.id ?? null,
                            fileId: model?.fileId ?? null,
                            versionId: model?.versionId ?? null
                        }
                    });

                    const loaded = await withTimeout(
                        api.viewer.getLoadedModel(modelId),
                        GET_LOADED_MODEL_TIMEOUT_MS,
                        `viewer.getLoadedModel(${modelId})`
                    );

                    const durationMs = Math.round(performance.now() - startedAt);
                    const blob = loaded?.blob;
                    const loadedDiagnostic = {
                        generation,
                        modelId,
                        modelName: name,
                        callCompleted: true,
                        durationMs,
                        returnedType: valueType(loaded),
                        returnedKeys: safeKeys(loaded),
                        nestedFileKeys: safeKeys(loaded?.file),
                        returnedIdentity: {
                            id: loaded?.id ?? null,
                            name: loaded?.name ?? null,
                            versionId: loaded?.versionId ?? null,
                            type: loaded?.type ?? null,
                            permission: loaded?.permission ?? null,
                            isOldVersion: loaded?.isOldVersion ?? null
                        },
                        hasBlob: blob !== undefined && blob !== null,
                        blobType: valueType(blob),
                        blobSize: blob instanceof Blob ? blob.size : null,
                        base64Length: typeof blob === "string" ? blob.length : null
                    };
                    console.log("===== getLoadedModel RESULT v0.6.0b =====");
                    console.dir(loadedDiagnostic);

                    const file = loadedModelFile(
                        loaded,
                        name
                    );
'@
if (-not $registry.Contains($old)) { throw 'Fant ikke getLoadedModel-blokken som skulle erstattes.' }
$registry = $registry.Replace($old, $new)

$oldCatch = @'
                catch (error) {
                    provider.status = "discovered";
                    provider.error =
                        error?.message || String(error);
                    result.failed += 1;
                    result.models.push({
                        modelId,
                        name,
                        status: "error",
                        message: provider.error
                    });
                }
'@
$newCatch = @'
                catch (error) {
                    provider.status = "discovered";
                    provider.error = error?.message || String(error);
                    result.failed += 1;
                    const failure = {
                        generation,
                        modelId,
                        name,
                        status: error?.name === "TimeoutError" ? "timeout" : "error",
                        errorName: error?.name || "Error",
                        message: provider.error,
                        timeoutMs: GET_LOADED_MODEL_TIMEOUT_MS
                    };
                    result.models.push(failure);
                    console.log("===== getLoadedModel FAILURE v0.6.0b =====");
                    console.dir(failure);
                }
'@
if (-not $registry.Contains($oldCatch)) { throw 'Fant ikke catch-blokken som skulle erstattes.' }
$registry = $registry.Replace($oldCatch, $newCatch)
$registry = $registry.Replace('===== AUTOMATISK MODELLFIL v0.6.0 =====', '===== AUTOMATISK MODELLFIL v0.6.0b =====')
Set-Content $registryPath $registry -Encoding UTF8 -NoNewline

$app = Get-Content $appPath -Raw -Encoding UTF8
$app = [regex]::Replace($app, 'versions\.js\?v=[^"\'']+', 'versions.js?v=0.6.0b')
$app = [regex]::Replace($app, 'geometry-registry\.js(?:\?v=[^"\'']+)?', 'geometry-registry.js?v=0.6.0b')
$app = [regex]::Replace($app, 'svg-renderer\.js(?:\?v=[^"\'']+)?', 'svg-renderer.js?v=0.6.0b')
$app = [regex]::Replace($app, 'section-engine\.js(?:\?v=[^"\'']+)?', 'section-engine.js?v=0.6.0b')
Set-Content $appPath $app -Encoding UTF8 -NoNewline

@'
export const APP_NAME = "Interaktiv tverrprofilviser";
export const VERSION = "0.6.0b";
export const BUILD_DATE = "2026-10-04 16:25";
'@ | Set-Content $versionsPath -Encoding UTF8 -NoNewline

Write-Host 'v0.6.0b er installert.' -ForegroundColor Green
Write-Host 'Forventede logger: getLoadedModel START, RESULT eller FAILURE.'
