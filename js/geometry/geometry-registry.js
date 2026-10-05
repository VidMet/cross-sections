import { IfcGeometryProvider } from "./ifc-geometry-provider.js?v=0.6.5b";
import { TrbGeometryProvider } from "./trb-geometry-provider.js?v=0.6.5b";
import { getAPI } from "../tc-api.js";

export const GEOMETRY_REGISTRY_VERSION = "0.6.5b-trb-discovery-fix";

function extension(name) {
    return (String(name || "").split(".").pop() || "").toLowerCase();
}

function normalizedSourceKey(name) {
    return String(name || "")
        .replace(/\.(ifc|trb|trimbim)$/i, "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function modelIdentity(model) {
    return String(
        model?.modelId || model?.id || model?.fileId || model?.versionId ||
        model?.trbBlobFromId || ""
    );
}

function modelName(model) {
    const id = modelIdentity(model);
    return String(
        model?.name || model?.fileName || model?.displayName ||
        model?.file?.name || `${id}.trb`
    );
}

function scalarFields(value) {
    if (!value || typeof value !== "object") return {};
    const output = {};
    for (const [key, item] of Object.entries(value)) {
        if (item === null || ["string", "number", "boolean"].includes(typeof item)) output[key] = item;
        else if (item instanceof Blob) output[key] = { type: "Blob", size: item.size, mimeType: item.type };
    }
    return output;
}

function base64ToBlob(value) {
    const clean = String(value || "").replace(/^data:[^;]+;base64,/, "");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: "application/octet-stream" });
}

function blobFromValue(value) {
    if (value instanceof Blob) return value;
    if (typeof value === "string" && value.length > 100) {
        try { return base64ToBlob(value); } catch { return null; }
    }
    return null;
}

function loadedModelFile(loaded, fallbackName) {
    const blob = blobFromValue(loaded?.blob) || blobFromValue(loaded?.trbBlob);
    if (!(blob instanceof Blob)) return null;
    return new File(
        [blob],
        String(loaded?.name || loaded?.file?.name || fallbackName || "model.trb"),
        { type: blob.type || "application/octet-stream", lastModified: Date.now() }
    );
}

function sourceOrigin(provider) {
    if (provider.origin === "viewer-original-ifc") return provider.origin;
    if (provider.type === "trb" && provider.modelId && provider.file) return "viewer+diagnostic";
    if (provider.modelId) return "viewer";
    if (provider.file) return "local";
    return "detached";
}

function mergeModel(target, source, discoverySource) {
    const id = modelIdentity(source);
    if (!id) return;
    const previous = target.get(id) || { id, discoverySources: [] };
    previous.discoverySources = [...new Set([...previous.discoverySources, discoverySource])];
    previous.model = { ...(previous.model || {}), ...source };
    previous.name = modelName(source) || previous.name || `${id}.trb`;
    target.set(id, previous);
}

export class GeometryRegistry {
    constructor() {
        this.providers = [];
        this.counter = 1;
        this.discoveryInProgress = false;
        this.bindManualRefreshDiscovery();
    }

    create(options) {
        const fileExtension = extension(options.name);
        const id = options.id || `source-${this.counter++}`;
        if (fileExtension === "ifc") return new IfcGeometryProvider({ ...options, id });
        if (["trb", "trimbim"].includes(fileExtension) || options.forceType === "trb") {
            return new TrbGeometryProvider({ ...options, id, name: options.name || `${id}.trb` });
        }
        return null;
    }

    findBySource(name, type) {
        const key = normalizedSourceKey(name);
        return this.providers.find(provider =>
            normalizedSourceKey(provider.name) === key && provider.type === type
        );
    }

    bindManualRefreshDiscovery() {
        const bind = () => {
            const button = document.getElementById("btnRefreshModels");
            if (!button) {
                setTimeout(bind, 250);
                return;
            }
            if (button.dataset.trbDiscoveryBound === "true") return;
            button.dataset.trbDiscoveryBound = "true";
            button.addEventListener("click", () => {
                setTimeout(async () => {
                    await this.discoverVisibleTrbModels({ reason: "manual-refresh" });
                }, 0);
            });
        };
        bind();
    }

    async collectModels(api) {
        const collected = new Map();
        const calls = [];

        if (typeof api.viewer.getModels === "function") {
            calls.push((async () => {
                try {
                    const models = await api.viewer.getModels();
                    for (const model of Array.isArray(models) ? models : []) mergeModel(collected, model, "getModels");
                    return { source: "getModels", ok: true, count: Array.isArray(models) ? models.length : 0 };
                }
                catch (error) {
                    return { source: "getModels", ok: false, error: error?.message || String(error) };
                }
            })());
        }

        if (typeof api.viewer.getTrimbimModels === "function") {
            calls.push((async () => {
                try {
                    const models = await api.viewer.getTrimbimModels();
                    for (const model of Array.isArray(models) ? models : []) mergeModel(collected, model, "getTrimbimModels");
                    return { source: "getTrimbimModels", ok: true, count: Array.isArray(models) ? models.length : 0 };
                }
                catch (error) {
                    return { source: "getTrimbimModels", ok: false, error: error?.message || String(error) };
                }
            })());
        }

        const callResults = await Promise.all(calls);
        return { collected, callResults };
    }

    async discoverVisibleTrbModels({ reason = "direct" } = {}) {
        if (this.discoveryInProgress) return null;
        this.discoveryInProgress = true;

        try {
            const api = getAPI();
            if (!api?.viewer) return null;

            const groups = await api.viewer.getObjects({}, { visible: true });
            const visibleIds = new Set((groups || []).map(group => String(group.modelId)));
            const { collected, callResults } = await this.collectModels(api);

            const candidates = [];
            for (const record of collected.values()) {
                const model = record.model || {};
                const id = String(record.id || "");
                const name = String(record.name || modelName(model));
                const isTrbByName = ["trb", "trimbim"].includes(extension(name));
                const isTrimbimRecord = record.discoverySources.includes("getTrimbimModels");
                const explicitlyVisible = model.visible === true;
                const visible = visibleIds.has(id) || explicitlyVisible;
                if (visible && (isTrbByName || isTrimbimRecord)) {
                    candidates.push({ ...record, id, name, isTrbByName, isTrimbimRecord, visible });
                }
            }

            const seen = new Set();
            const diagnostic = {
                version: GEOMETRY_REGISTRY_VERSION,
                reason,
                viewerMethods: Object.keys(api.viewer).filter(key => typeof api.viewer[key] === "function").sort(),
                discoveryCalls: callResults,
                visibleGroupIds: [...visibleIds],
                collectedCount: collected.size,
                discoveredCount: candidates.length,
                openedCount: 0,
                failedCount: 0,
                models: []
            };

            for (const candidate of candidates) {
                const { id: modelId, name, model } = candidate;
                seen.add(modelId);

                let provider = this.providers.find(item =>
                    item.type === "trb" && String(item.modelId || "") === modelId
                );

                if (!provider) {
                    provider = this.create({
                        id: `viewer-trb-${modelId}`,
                        name,
                        origin: "viewer-trb-diagnostic",
                        modelId,
                        modelSpec: model,
                        forceType: "trb"
                    });
                    if (provider) this.providers.push(provider);
                }
                if (!provider) continue;

                provider.modelId = modelId;
                provider.modelSpec = model;
                provider.name = name;
                provider.origin = "viewer-trb-diagnostic";

                try {
                    if (!provider.file) {
                        let file = loadedModelFile(model, name);
                        if (!file && typeof api.viewer.getLoadedModel === "function") {
                            try {
                                const loaded = await api.viewer.getLoadedModel(modelId);
                                file = loadedModelFile(loaded, name);
                            }
                            catch (error) {
                                diagnostic.models.push({ modelId, name, stage: "getLoadedModel", warning: error?.message || String(error) });
                            }
                        }
                        if (file) {
                            provider.attachFile(file);
                            provider.fileOrigin = "viewer-loaded-model";
                        }
                    }

                    if (provider.file && provider.status !== "ready-diagnostic") await provider.open();
                    if (provider.status === "ready-diagnostic") diagnostic.openedCount += 1;
                    else diagnostic.failedCount += 1;

                    diagnostic.models.push({
                        modelId,
                        name,
                        discoverySources: candidate.discoverySources,
                        isTrbByName: candidate.isTrbByName,
                        isTrimbimRecord: candidate.isTrimbimRecord,
                        modelFields: scalarFields(model),
                        status: provider.status,
                        fileSize: provider.file?.size || 0
                    });
                }
                catch (error) {
                    provider.status = "diagnostic-error";
                    provider.error = error?.message || String(error);
                    diagnostic.failedCount += 1;
                    diagnostic.models.push({ modelId, name, status: provider.status, error: provider.error });
                }
            }

            for (const provider of [...this.providers]) {
                if (provider.type !== "trb" || !String(provider.origin).includes("viewer-trb")) continue;
                if (!seen.has(String(provider.modelId || ""))) this.remove(provider.id);
            }

            console.log("===== TRB-OPPDAGELSE v0.6.5b =====");
            console.dir(diagnostic);
            if (typeof window !== "undefined") window.__crossSectionTrbRegistryDiagnostic = diagnostic;
            window.dispatchEvent(new CustomEvent("cross-section-geometry-updated", { detail: diagnostic }));
            return diagnostic;
        }
        finally {
            this.discoveryInProgress = false;
        }
    }

    async addLocalFiles(files, onProgress) {
        const results = [];
        for (const file of Array.from(files || [])) {
            const type = extension(file.name) === "trimbim" ? "trb" : extension(file.name);
            let provider = this.findBySource(file.name, type);
            if (!provider) {
                provider = this.create({ name: file.name, origin: "local", file });
                if (!provider) continue;
                this.providers.push(provider);
            }
            else {
                provider.attachFile(file);
            }
            provider.fileOrigin = "local-file-picker";
            onProgress?.(provider, "opening");
            await provider.open();
            onProgress?.(provider, provider.status);
            results.push(provider);
        }
        return results;
    }

    remove(id) {
        const index = this.providers.findIndex(provider => provider.id === id);
        if (index < 0) return false;
        this.providers[index].close();
        this.providers.splice(index, 1);
        return true;
    }

    clearLocal() {
        for (const provider of [...this.providers]) {
            if (provider.fileOrigin === "local-file-picker") this.remove(provider.id);
        }
    }

    summary() {
        const sources = this.providers.map(provider => {
            const summary = provider.getSummary();
            summary.origin = sourceOrigin(provider);
            summary.fileOrigin = provider.fileOrigin || null;
            return summary;
        });
        return {
            sourceCount: sources.length,
            viewerCount: sources.filter(source => source.origin.includes("viewer")).length,
            localCount: sources.filter(source => source.origin.includes("local")).length,
            automaticCount: sources.filter(source => source.origin.includes("automatic") || source.origin.includes("diagnostic")).length,
            ifcCount: sources.filter(source => source.type === "ifc").length,
            trbCount: sources.filter(source => source.type === "trb").length,
            readyCount: sources.filter(source => ["ready", "ready-diagnostic"].includes(source.status)).length,
            totalEntities: sources.reduce((sum, source) => sum + (source.entityCount || 0), 0),
            sources
        };
    }
}

export { normalizedSourceKey };
