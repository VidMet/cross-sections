export const ORIGINAL_IFC_DOWNLOAD_VERSION = "0.6.7.3-centerline-corridor-filter";
const message = error => error?.message || String(error);
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const wait = (task, milliseconds, label) => {
    let timer;
    return Promise.race([
        task(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} overskred ${milliseconds / 1000} sekunder`)), milliseconds); })
    ]).finally(() => clearTimeout(timer));
};
const identifier = model => String(model?.modelId || model?.versionId || model?.id || model?.fileId || "");

function coreBase(location) {
    const value = String(location || "").toLowerCase();
    if (value.includes("europe") || value === "eu") return "https://app21.connect.trimble.com/tc/api";
    if (value.includes("uk")) return "https://app22.connect.trimble.com/tc/api";
    if (value.includes("ap2")) return "https://app32.connect.trimble.com/tc/api";
    if (value.includes("ap")) return "https://app31.connect.trimble.com/tc/api";
    return "https://app.connect.trimble.com/tc/api";
}

async function token(api) {
    const permission = await api.extension.requestPermission("accesstoken");
    let value = typeof permission === "string" && permission.length > 100 ? permission : null;
    if (!value && typeof api.extension.getPermission === "function") {
        try { value = await api.extension.getPermission("accesstoken"); } catch {}
    }
    return { value, status: value ? "token-received" : String(permission || "no-token") };
}

function findUrl(value) {
    if (!value) return null;
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
    if (Array.isArray(value)) {
        for (const item of value) { const hit = findUrl(item); if (hit) return hit; }
    } else if (typeof value === "object") {
        for (const key of ["downloadUrl", "downloadURL", "url", "signedUrl", "signedURL", "href"]) {
            if (typeof value[key] === "string" && /^https?:\/\//i.test(value[key])) return value[key];
        }
        for (const item of Object.values(value)) { const hit = findUrl(item); if (hit) return hit; }
    }
    return null;
}

async function responseBody(response) {
    const contentType = response.headers.get("content-type") || "";
    try { return /json/i.test(contentType) ? await response.clone().json() : (await response.clone().text()).slice(0, 1000); }
    catch (error) { return { readError: message(error) }; }
}

async function inspectIfc(blob, name) {
    const bytes = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
    const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "").trimStart();
    return { name, size: blob.size, validIfcStep: text.toUpperCase().startsWith("ISO-10303-21;") && /HEADER\s*;/i.test(text.slice(0, 1024)) };
}

function stationOf(object) {
    for (const group of object?.properties || []) {
        const property = (group.properties || []).find(item => item.name === "Station");
        if (group.name === "Pset_Stationing" && Number.isFinite(+property?.value)) return +property.value / 1000;
    }
    return Number(object?.product?.name);
}

async function selectedCenterline(api) {
    const selection = (await api.viewer.getSelection())?.[0];
    if (!selection) throw new Error("Velg profileringslinje før synlige modeller oppdateres.");
    const selected = (await api.viewer.getObjectProperties(selection.modelId, selection.objectRuntimeIds))?.[0];
    if (String(selected?.class || "").toUpperCase() !== "IFCALIGNMENT") throw new Error("Valgt objekt er ikke IFCALIGNMENT.");
    const children = await api.viewer.getHierarchyChildren(selection.modelId, selection.objectRuntimeIds, undefined, true);
    const childIds = (children || []).map(item => Number(item.id)).filter(Number.isFinite);
    const properties = childIds.length ? await api.viewer.getObjectProperties(selection.modelId, childIds) : [];
    const points = (properties || [])
        .filter(item => item.class === "IFCREFERENT" && item.product?.objectType === "STATION")
        .map(item => ({ station: stationOf(item), x: +item.position?.x, y: +item.position?.y, z: +item.position?.z }))
        .filter(point => Object.values(point).every(Number.isFinite))
        .sort((a, b) => a.station - b.station);
    if (points.length < 2) throw new Error("Fant ikke nok stasjonsreferenter i valgt IFCALIGNMENT.");
    return { modelId: String(selection.modelId), runtimeId: Number(selection.objectRuntimeIds?.[0]), name: selected.product?.name || "Ukjent", points };
}

function segmentIntersectsExpandedBox(a, b, box, radius) {
    const min = { x: Number(box.min.x) - radius, y: Number(box.min.y) - radius };
    const max = { x: Number(box.max.x) + radius, y: Number(box.max.y) + radius };
    let t0 = 0, t1 = 1;
    for (const axis of ["x", "y"]) {
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) < 1e-12) {
            if (a[axis] < min[axis] || a[axis] > max[axis]) return false;
            continue;
        }
        let near = (min[axis] - a[axis]) / delta;
        let far = (max[axis] - a[axis]) / delta;
        if (near > far) [near, far] = [far, near];
        t0 = Math.max(t0, near); t1 = Math.min(t1, far);
        if (t0 > t1) return false;
    }
    return true;
}

function boxMeetsCorridor(box, points, width) {
    if (!box?.min || !box?.max) return false;
    for (let index = 0; index < points.length - 1; index += 1) {
        if (segmentIntersectsExpandedBox(points[index], points[index + 1], box, width)) return true;
    }
    return false;
}

async function groupMeetsCorridor(api, group, points, width) {
    const runtimeIds = (group.objects || []).map(item => Number(item.id)).filter(Number.isFinite);
    let testedObjects = 0;
    for (let start = 0; start < runtimeIds.length; start += 300) {
        const batch = runtimeIds.slice(start, start + 300);
        const boxes = await wait(() => api.viewer.getObjectBoundingBoxes(group.modelId, batch), 30000, `Bounding boxes for modell ${group.modelId}`);
        testedObjects += batch.length;
        if ((boxes || []).some(item => boxMeetsCorridor(item.boundingBox, points, width))) return { included: true, testedObjects };
        await pause();
    }
    return { included: false, testedObjects };
}

async function discoverCorridorModels(api, suppliedModels, corridorWidth) {
    const centerline = await selectedCenterline(api);
    const suppliedById = new Map((suppliedModels || []).map(model => [identifier(model), model]));
    const groups = await wait(() => api.viewer.getObjects({}, { visible: true }), 30000, "Henting av synlige modellgrupper");
    const includedGroups = [], excludedGroups = [], errors = [];
    for (const group of groups || []) {
        const id = String(group?.modelId || "");
        if (!id) continue;
        try {
            const assessment = await groupMeetsCorridor(api, group, centerline.points, corridorWidth);
            (assessment.included ? includedGroups : excludedGroups).push({ modelId: id, objectCount: group.objects?.length || 0, testedObjects: assessment.testedObjects });
        } catch (error) {
            errors.push({ modelId: id, error: message(error) });
        }
        await pause();
    }
    const targets = [];
    for (const group of includedGroups) {
        try {
            const loaded = await wait(() => api.viewer.getLoadedModel(group.modelId), 30000, `Identifisering av modell ${group.modelId}`);
            const file = loaded?.file || {};
            const supplied = suppliedById.get(group.modelId) || {};
            const name = String(file.name || loaded?.name || supplied.name || supplied.fileName || "");
            if (/\.ifc$/i.test(name)) targets.push({ ...supplied, ...loaded, modelId: group.modelId, versionId: file.versionId || loaded?.versionId || supplied.versionId || group.modelId, name });
        } catch (error) { errors.push({ modelId: group.modelId, error: message(error) }); }
    }
    return { centerline, visibleModelCount: (groups || []).length, includedGroups, excludedGroups, targets, errors };
}

async function processModel({ api, model, project, base, headers, registry, renderSources }) {
    const result = { modelId: identifier(model), fileName: String(model?.name || model?.fileName || "model.ifc"), stage: "viewer.getLoadedModel", requests: [], attached: false, error: null };
    try {
        const loaded = await wait(() => api.viewer.getLoadedModel(result.modelId), 30000, `Henting av ${result.fileName}`);
        const meta = loaded?.file || {};
        const projectId = String(meta.projectId || project.id || ""), fileId = String(meta.id || loaded?.id || model?.id || ""), versionId = String(meta.versionId || loaded?.versionId || model?.versionId || model?.modelId || "");
        result.fileName = String(meta.name || loaded?.name || model?.name || result.fileName);
        Object.assign(result, { projectId, fileId, versionId });
        let downloadUrl = null;
        for (const [name, url] of [["file-metadata", `${base}/2.0/files/${encodeURIComponent(fileId)}`], ["file-versions", `${base}/2.1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/versions`], ["download-url", `${base}/2.0/files/fs/${encodeURIComponent(versionId || fileId)}/downloadurl`]]) {
            result.stage = `request.${name}`;
            try {
                const response = await wait(() => fetch(url, { headers }), 30000, `${name} for ${result.fileName}`);
                const body = await responseBody(response);
                result.requests.push({ name, ok: response.ok, status: response.status, body });
                if (name === "download-url") downloadUrl = typeof body?.url === "string" ? body.url : findUrl(body);
            } catch (error) { result.requests.push({ name, error: message(error) }); }
        }
        if (!downloadUrl) throw new Error("Fant ingen nedlastingsadresse for original IFC");
        result.stage = "download-original-ifc";
        const response = await wait(() => fetch(downloadUrl), 120000, `Nedlasting av ${result.fileName}`);
        const blob = await response.blob(), signature = await inspectIfc(blob, result.fileName);
        result.download = { ok: response.ok, status: response.status, signature };
        if (!response.ok) throw new Error(`IFC-nedlasting svarte HTTP ${response.status}`);
        if (!signature.validIfcStep) throw new Error("Nedlastet fil mangler gyldig IFC STEP-signatur");
        result.stage = "decode-original-ifc";
        const before = new Set((registry.providers || []).map(provider => String(provider.id)));
        await registry.addLocalFiles([new File([blob], result.fileName, { type: blob.type || "application/octet-stream", lastModified: Date.now() })], renderSources);
        const added = (registry.providers || []).filter(provider => !before.has(String(provider.id)));
        const linked = [...added].reverse().find(provider => provider?.type === "ifc" && provider?.file?.name === result.fileName) || [...added].reverse().find(provider => provider?.type === "ifc");
        if (!linked) throw new Error(`IFC-provider ble ikke funnet for ${result.fileName}`);
        linked.modelId = versionId || fileId || result.modelId; linked.origin = "viewer-original-ifc"; linked.fileOrigin = "trimble-connect-original"; linked.errorStage = linked.status === "error" ? "decode-original-ifc" : null;
        linked.metadata = { ...(linked.metadata || {}), trimbleProjectId: projectId, trimbleFileId: fileId, trimbleVersionId: versionId, linkedViewerModelId: linked.modelId, sourceMethod: "trimble-connect-original-download", corridorFiltered: true };
        result.providerStatus = linked.status; result.providerError = linked.error || null;
        if (linked.status !== "ready") throw new Error(linked.error || `IFC-provider endte med status ${linked.status}`);
        result.attached = true; result.stage = "ready";
    } catch (error) {
        result.error = message(error);
        console.error("ORIGINAL IFC-MODELLFEIL", { modelId: result.modelId, fileName: result.fileName, stage: result.stage, error });
    }
    renderSources?.();
    return result;
}

export async function downloadOriginalIfc({ api, models, registry, renderSources }) {
    const widthInput = document.getElementById("modelCorridorWidth");
    const corridorWidth = Math.max(1, Number(widthInput?.value) || 100);
    const diagnostic = { version: ORIGINAL_IFC_DOWNLOAD_VERSION, corridorWidth, permission: null, project: null, models: [], visibleModelCount: 0, relevantIfcCount: 0, excludedModelCount: 0, readyCount: 0, errorCount: 0, corridorErrors: [] };
    try {
        const project = await wait(() => api.project.getProject(), 20000, "Henting av prosjekt");
        diagnostic.project = { id: project?.id || null, name: project?.name || null, location: project?.location || null };
        const discovery = await discoverCorridorModels(api, models, corridorWidth);
        diagnostic.centerline = { modelId: discovery.centerline.modelId, runtimeId: discovery.centerline.runtimeId, name: discovery.centerline.name, pointCount: discovery.centerline.points.length };
        diagnostic.visibleModelCount = discovery.visibleModelCount;
        diagnostic.relevantIfcCount = discovery.targets.length;
        diagnostic.excludedModelCount = discovery.excludedGroups.length;
        diagnostic.includedGroups = discovery.includedGroups;
        diagnostic.excludedGroups = discovery.excludedGroups;
        diagnostic.corridorErrors = discovery.errors;
        const auth = await token(api);
        diagnostic.permission = { status: auth.status, tokenReceived: Boolean(auth.value), tokenLength: auth.value?.length || 0 };
        if (!auth.value) throw new Error(`Tilgangstoken ble ikke mottatt. Status: ${auth.status}`);
        const headers = { Authorization: `Bearer ${auth.value}`, Accept: "application/json" }, base = coreBase(project?.location);
        for (const model of discovery.targets) {
            await new Promise(resolve => setTimeout(resolve, 50));
            const result = await processModel({ api, model, project, base, headers, registry, renderSources });
            diagnostic.models.push(result);
            result.stage === "ready" ? diagnostic.readyCount += 1 : diagnostic.errorCount += 1;
            window.dispatchEvent(new CustomEvent("cross-section-ifc-progress", { detail: { processed: diagnostic.models.length, total: diagnostic.relevantIfcCount, ready: diagnostic.readyCount, errors: diagnostic.errorCount, excluded: diagnostic.excludedModelCount, current: result.fileName } }));
        }
    } catch (error) {
        diagnostic.error = message(error); diagnostic.errorName = error?.name || "Error";
    }
    console.log("===== ORIGINAL IFC-NEDLASTING v0.6.7.3 CORRIDOR FILTER =====");
    console.dir(diagnostic);
    window.__crossSectionOriginalIfcDownloadDiagnostic = diagnostic;
    return diagnostic;
}
