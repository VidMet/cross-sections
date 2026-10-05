import { IfcGeometryProvider } from "./ifc-geometry-provider.js?v=0.6.5i";
import { TrbGeometryProvider } from "./trb-geometry-provider.js?v=0.6.5i";
import { getAPI } from "../tc-api.js";
export const GEOMETRY_REGISTRY_VERSION = "0.6.5i-trb8-geometry-records";
const extension = name => (String(name || "").split(".").pop() || "").toLowerCase();
const modelIdOf = model => String(model?.modelId || model?.id || model?.fileId || model?.versionId || "");
const modelNameOf = model => String(model?.name || model?.fileName || `${modelIdOf(model)}.trb`);
const sourceKey = name => String(name || "").replace(/\.(ifc|trb|trimbim)$/i, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function fileFromLoaded(value, name) { const blob = value?.blob instanceof Blob ? value.blob : value?.trbBlob instanceof Blob ? value.trbBlob : null; return blob ? new File([blob], name, { type: blob.type || "application/octet-stream" }) : null; }
export class GeometryRegistry {
    constructor() { this.providers = []; this.counter = 1; this.busy = false; this.bindRefresh(); }
    create(options) { const id = options.id || `source-${this.counter++}`; if (extension(options.name) === "ifc") return new IfcGeometryProvider({ ...options, id }); if (["trb", "trimbim"].includes(extension(options.name)) || options.forceType === "trb") return new TrbGeometryProvider({ ...options, id }); return null; }
    findBySource(name, type) { return this.providers.find(provider => sourceKey(provider.name) === sourceKey(name) && provider.type === type); }
    bindRefresh() { const bind = () => { const button = document.getElementById("btnRefreshModels"); if (!button) return setTimeout(bind, 250); if (button.dataset.trb65i) return; button.dataset.trb65i = "1"; button.addEventListener("click", () => setTimeout(() => this.discoverVisibleTrbModels({ reason: "manual-refresh" }), 0)); }; bind(); }
    async discoverVisibleTrbModels({ reason = "direct" } = {}) {
        if (this.busy) return null; this.busy = true;
        try {
            const api = getAPI(), models = await api.viewer.getModels(), groups = await api.viewer.getObjects({}, { visible: true });
            const visible = new Set((groups || []).map(group => String(group.modelId)));
            const candidates = (models || []).filter(model => visible.has(modelIdOf(model)) && ["trb", "trimbim"].includes(extension(modelNameOf(model))));
            const diagnostic = { version: GEOMETRY_REGISTRY_VERSION, reason, discoveredCount: candidates.length, openedCount: 0, failedCount: 0, models: [] };
            for (const model of candidates) {
                const modelId = modelIdOf(model), name = modelNameOf(model);
                let provider = this.providers.find(item => item.type === "trb" && String(item.modelId) === modelId);
                if (!provider) { provider = this.create({ id: `viewer-trb-${modelId}`, name, modelId, origin: "viewer-trb-diagnostic", forceType: "trb" }); this.providers.push(provider); }
                if (!provider.file) { let file = fileFromLoaded(model, name); if (!file) file = fileFromLoaded(await api.viewer.getLoadedModel(modelId), name); if (file) { provider.attachFile(file); provider.fileOrigin = "viewer-loaded-model"; } }
                if (provider.file) await provider.open();
                if (provider.status === "ready-records") diagnostic.openedCount += 1; else diagnostic.failedCount += 1;
                diagnostic.models.push({ modelId, name, status: provider.status, fileSize: provider.file?.size || 0 });
            }
            window.__crossSectionTrbRegistryDiagnostic = diagnostic;
            window.dispatchEvent(new CustomEvent("cross-section-geometry-updated", { detail: diagnostic }));
            return diagnostic;
        } finally { this.busy = false; }
    }
    async addLocalFiles(files, onProgress) { const output = []; for (const file of Array.from(files || [])) { const type = extension(file.name) === "trimbim" ? "trb" : extension(file.name); let provider = this.findBySource(file.name, type); if (!provider) { provider = this.create({ name: file.name, file, origin: "local" }); if (!provider) continue; this.providers.push(provider); } else provider.attachFile(file); provider.fileOrigin = "local-file-picker"; await provider.open(); onProgress?.(provider, provider.status); output.push(provider); } return output; }
    remove(id) { const index = this.providers.findIndex(provider => provider.id === id); if (index < 0) return false; this.providers[index].close(); this.providers.splice(index, 1); return true; }
    clearLocal() { for (const provider of [...this.providers]) if (provider.fileOrigin === "local-file-picker" || provider.origin === "local") this.remove(provider.id); }
    summary() {
        const sources = this.providers.map(provider => { const item = provider.getSummary(); item.origin = provider.origin || (provider.modelId ? "viewer" : provider.file ? "local" : "detached"); item.fileOrigin = provider.fileOrigin || null; return item; });
        return {
            sourceCount: sources.length,
            viewerCount: sources.filter(source => source.origin.includes("viewer")).length,
            localCount: sources.filter(source => source.origin.includes("local")).length,
            automaticCount: sources.filter(source => source.origin.includes("diagnostic")).length,
            ifcCount: sources.filter(source => source.type === "ifc").length,
            trbCount: sources.filter(source => source.type === "trb").length,
            readyCount: sources.filter(source => ["ready", "ready-records"].includes(source.status)).length,
            totalEntities: sources.reduce((sum, source) => sum + (source.entityCount || 0), 0),
            sources
        };
    }
}
export { sourceKey as normalizedSourceKey };
