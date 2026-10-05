import { IfcGeometryProvider } from "./ifc-geometry-provider.js?v=0.6.5a";
import { TrbGeometryProvider } from "./trb-geometry-provider.js?v=0.6.5a";
import { getAPI } from "../tc-api.js";

export const GEOMETRY_REGISTRY_VERSION = "0.6.5a-general-trb-source-diagnostic";

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
        model?.modelId ||
        model?.id ||
        model?.fileId ||
        model?.versionId ||
        ""
    );
}

function modelName(model) {
    const id = modelIdentity(model);
    return String(
        model?.name ||
        model?.fileName ||
        model?.displayName ||
        `${id}.unknown`
    );
}

function base64ToBlob(value) {
    const clean = String(value || "").replace(/^data:[^;]+;base64,/, "");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: "application/octet-stream" });
}

function loadedModelFile(loaded, fallbackName) {
    let blob = loaded?.blob;
    if (typeof blob === "string") blob = base64ToBlob(blob);
    if (!(blob instanceof Blob)) return null;
    return new File(
        [blob],
        String(loaded?.name || loaded?.file?.name || fallbackName || "model.trb"),
        { type: blob.type || "application/octet-stream", lastModified: Date.now() }
    );
}

function sourceOrigin(provider) {
    if (provider.origin === "viewer-original-ifc") return provider.origin;
    if (provider.modelId && provider.file) return "viewer+diagnostic";
    if (provider.modelId) return "viewer";
    if (provider.file) return "local";
    return "detached";
}

export class GeometryRegistry {
    constructor() {
        this.providers = [];
        this.counter = 1;
        this.trbDiscoveryStarted = false;
        this.trbDiscoveryTimer = null;
        this.startGeneralTrbDiscovery();
    }

    create(options) {
        const fileExtension = extension(options.name);
        const id = options.id || `source-${this.counter++}`;
        if (fileExtension === "ifc") return new IfcGeometryProvider({ ...options, id });
        if (["trb", "trimbim"].includes(fileExtension)) return new TrbGeometryProvider({ ...options, id });
        return null;
    }

    findBySource(name, type) {
        const key = normalizedSourceKey(name);
        return this.providers.find(provider =>
            normalizedSourceKey(provider.name) === key &&
            provider.type === type
        );
    }

    async discoverVisibleTrbModels() {
        const api = getAPI();
        if (!api?.viewer || typeof api.viewer.getModels !== "function") return null;

        let models = await api.viewer.getModels();
        if (!Array.isArray(models)) models = [];

        let visibleIds = null;
        try {
            const groups = await api.viewer.getObjects({}, { visible: true });
            visibleIds = new Set((groups || []).map(group => String(group.modelId)));
        }
        catch {
            visibleIds = null;
        }

        const trbModels = models.filter(model => {
            const name = modelName(model);
            const id = modelIdentity(model);
            return ["trb", "trimbim"].includes(extension(name)) &&
                (!visibleIds || visibleIds.has(id));
        });

        const seen = new Set();
        const diagnostic = {
            version: GEOMETRY_REGISTRY_VERSION,
            discoveredCount: trbModels.length,
            openedCount: 0,
            failedCount: 0,
            models: []
        };

        for (const model of trbModels) {
            const modelId = modelIdentity(model);
            const name = modelName(model);
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
                    modelSpec: model
                });
                if (provider) this.providers.push(provider);
            }

            if (!provider) continue;
            provider.modelId = modelId;
            provider.modelSpec = model;
            provider.name = name;
            provider.origin = "viewer-trb-diagnostic";

            try {
                if (!provider.file && typeof api.viewer.getLoadedModel === "function") {
                    const loaded = await api.viewer.getLoadedModel(modelId);
                    const file = loadedModelFile(loaded, name);
                    if (file) {
                        provider.attachFile(file);
                        provider.fileOrigin = "viewer-loaded-model";
                    }
                }

                if (provider.file && provider.status !== "ready-diagnostic") {
                    await provider.open();
                }

                if (provider.status === "ready-diagnostic") diagnostic.openedCount += 1;
                else diagnostic.failedCount += 1;

                diagnostic.models.push({
                    modelId,
                    name,
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

        console.log("===== SYNLIGE TRB-KILDER v0.6.5a =====");
        console.dir(diagnostic);
        if (typeof window !== "undefined") window.__crossSectionTrbRegistryDiagnostic = diagnostic;
        window.dispatchEvent(new CustomEvent("cross-section-geometry-updated", { detail: diagnostic }));
        return diagnostic;
    }

    startGeneralTrbDiscovery() {
        if (this.trbDiscoveryStarted) return;
        this.trbDiscoveryStarted = true;
        let attempts = 0;
        const tick = async () => {
            attempts += 1;
            try {
                const result = await this.discoverVisibleTrbModels();
                if (result || attempts >= 30) return;
            }
            catch (error) {
                if (attempts >= 30) console.warn("TRB-kildediagnose kunne ikke startes:", error);
            }
            this.trbDiscoveryTimer = setTimeout(tick, 500);
        };
        this.trbDiscoveryTimer = setTimeout(tick, 0);
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
