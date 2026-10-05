export const ORIGINAL_IFC_DOWNLOAD_VERSION = "0.6.3c";

function coreBase(location) {
    const value = String(location || "").toLowerCase();
    if (value.includes("europe") || value === "eu") return "https://app21.connect.trimble.com/tc/api";
    if (value.includes("uk")) return "https://app22.connect.trimble.com/tc/api";
    if (value.includes("ap2")) return "https://app32.connect.trimble.com/tc/api";
    if (value.includes("ap")) return "https://app31.connect.trimble.com/tc/api";
    return "https://app.connect.trimble.com/tc/api";
}
function safeUrl(value) {
    try { const url = new URL(String(value)); return `${url.origin}${url.pathname}`; }
    catch { return null; }
}
async function token(api) {
    const permission = await api.extension.requestPermission("accesstoken");
    let value = typeof permission === "string" && permission.length > 100 ? permission : null;
    if (!value && typeof api.extension.getPermission === "function") {
        try { value = await api.extension.getPermission("accesstoken"); } catch {}
    }
    return { value, status: value ? "token-received" : String(permission || "no-token") };
}
async function compact(response) {
    const contentType = response.headers.get("content-type") || "";
    let body = null;
    try { body = /json/i.test(contentType) ? await response.clone().json() : (await response.clone().text()).slice(0, 1000); }
    catch (error) { body = { readError: error?.message || String(error) }; }
    return { ok: response.ok, status: response.status, statusText: response.statusText, url: safeUrl(response.url), body };
}
function findUrl(value) {
    if (!value) return null;
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
    if (Array.isArray(value)) { for (const item of value) { const hit = findUrl(item); if (hit) return hit; } }
    else if (typeof value === "object") {
        for (const key of ["downloadUrl", "downloadURL", "url", "signedUrl", "signedURL", "href"]) {
            if (typeof value[key] === "string" && /^https?:\/\//i.test(value[key])) return value[key];
        }
        for (const item of Object.values(value)) { const hit = findUrl(item); if (hit) return hit; }
    }
    return null;
}
async function signature(blob, name) {
    const bytes = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
    const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "").trimStart();
    return { name, size: blob.size, validIfcStep: text.toUpperCase().startsWith("ISO-10303-21;") && /HEADER\s*;/i.test(text.slice(0, 1024)), firstBytesHex: Array.from(bytes.slice(0, 32)).map(v => v.toString(16).padStart(2, "0")).join(" ") };
}
export async function downloadOriginalIfc({ api, models, registry, renderSources }) {
    const diagnostic = { version: ORIGINAL_IFC_DOWNLOAD_VERSION, permission: null, project: null, coreBase: null, models: [] };
    try {
        const project = await api.project.getProject();
        diagnostic.project = { id: project?.id || null, name: project?.name || null, location: project?.location || null };
        diagnostic.coreBase = coreBase(project?.location);
        const auth = await token(api);
        diagnostic.permission = { status: auth.status, tokenReceived: Boolean(auth.value), tokenLength: auth.value?.length || 0 };
        if (!auth.value) throw new Error(`Tilgangstoken ble ikke mottatt. Status: ${auth.status}`);
        const headers = { Authorization: `Bearer ${auth.value}`, Accept: "application/json" };
        for (const model of models || []) {
            const loaded = await api.viewer.getLoadedModel(String(model?.versionId || model?.id));
            const meta = loaded?.file || {};
            const projectId = String(meta.projectId || project.id || "");
            const fileId = String(meta.id || loaded?.id || model?.id || "");
            const versionId = String(meta.versionId || loaded?.versionId || model?.versionId || "");
            const fileName = String(meta.name || loaded?.name || model?.name || "model.ifc");
            const result = { fileName, projectId, fileId, versionId, requests: [], download: null, attached: false };
            const urls = [
                ["file-metadata", `${diagnostic.coreBase}/2.0/files/${encodeURIComponent(fileId)}`],
                ["file-versions", `${diagnostic.coreBase}/2.1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/versions`],
                ["download-url", `${diagnostic.coreBase}/2.0/files/fs/${encodeURIComponent(versionId || fileId)}/downloadurl`]
            ];
            let downloadUrl = null;
            for (const [name, url] of urls) {
                try {
                    const data = await compact(await fetch(url, { headers }));
                    result.requests.push({ name, ...data });
                    if (name === "download-url") {
                        downloadUrl = typeof data.body?.url === "string" ? data.body.url : findUrl(data.body);
                    }
                }
                catch (error) { result.requests.push({ name, error: error?.message || String(error) }); }
            }
            if (downloadUrl) {
                try {
                    const response = await fetch(downloadUrl);
                    const blob = await response.blob();
                    const check = await signature(blob, fileName);
                    result.download = { ok: response.ok, status: response.status, url: safeUrl(response.url), signature: check };
                    if (response.ok && check.validIfcStep) {
                        await registry.addLocalFiles([new File([blob], fileName, { type: blob.type || "application/octet-stream" })], renderSources);
                        renderSources?.();
                        result.attached = true;
                    }
                } catch (error) { result.download = { error: error?.message || String(error), url: safeUrl(downloadUrl) }; }
            }
            diagnostic.models.push(result);
        }
    } catch (error) { diagnostic.error = error?.message || String(error); diagnostic.errorName = error?.name || "Error"; }
    console.log("===== ORIGINAL IFC-NEDLASTING v0.6.3c =====");
    console.dir(diagnostic);
    window.__crossSectionOriginalIfcDownloadDiagnostic = diagnostic;
    return diagnostic;
}
