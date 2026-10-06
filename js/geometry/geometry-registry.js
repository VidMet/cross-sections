import { IfcGeometryProvider } from "./ifc-geometry-provider.js?v=0.6.7";
import { TrbGeometryProvider } from "./trb-geometry-provider.js?v=0.6.7";
import { getAPI } from "../tc-api.js";
import { beginUiOperation, endUiOperation } from "../ui-loading-stabilizer.js?v=0.6.7";

export const GEOMETRY_REGISTRY_VERSION = "0.6.7-ui-and-loading-stabilization";
const ext = n => (String(n || "").split(".").pop() || "").toLowerCase();
const mid = m => String(m?.modelId || m?.id || m?.fileId || m?.versionId || "");
const mname = m => String(m?.name || m?.fileName || m?.displayName || `${mid(m)}.trb`);
const key = n => String(n || "").replace(/\.(ifc|trb|trimbim)$/i, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const errorText = error => error?.message || String(error);

function asFile(value, name) {
  const blob = value?.blob instanceof Blob ? value.blob : value?.trbBlob instanceof Blob ? value.trbBlob : null;
  return blob ? new File([blob], name, { type: blob.type || "application/octet-stream" }) : null;
}

async function settleOne(task, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} overskred ${timeoutMs / 1000} sekunder`)), timeoutMs); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class GeometryRegistry {
  constructor() {
    this.providers = [];
    this.counter = 1;
    this.busy = false;
    this.pendingDiscovery = false;
    this.bind();
  }

  create(options) {
    const id = options.id || `source-${this.counter++}`;
    if (ext(options.name) === "ifc") return new IfcGeometryProvider({ ...options, id });
    if (["trb", "trimbim"].includes(ext(options.name)) || options.forceType === "trb") return new TrbGeometryProvider({ ...options, id });
    return null;
  }

  findBySource(name, type) {
    return this.providers.find(provider => key(provider.name) === key(name) && provider.type === type);
  }

  bind() {
    const bindButton = () => {
      const button = document.getElementById("btnRefreshModels");
      if (!button) return setTimeout(bindButton, 250);
      if (button.dataset.trb67) return;
      button.dataset.trb67 = "1";
      button.addEventListener("click", () => setTimeout(() => this.discoverVisibleTrbModels({ reason: "manual-refresh" }), 0));
    };
    bindButton();
  }

  async discoverVisibleTrbModels({ reason = "direct" } = {}) {
    if (this.busy) {
      this.pendingDiscovery = true;
      return { skipped: true, reason: "discovery-already-running" };
    }
    this.busy = true;
    this.pendingDiscovery = false;
    const uiToken = beginUiOperation("Laster synlige TRB-modeller...", { lockRefresh: true });
    const diagnostic = { version: GEOMETRY_REGISTRY_VERSION, reason, discoveredCount: 0, openedCount: 0, failedCount: 0, models: [] };
    try {
      const api = getAPI();
      const [models, groups] = await Promise.all([
        settleOne(() => api.viewer.getModels(), 20000, "Henting av modelliste"),
        settleOne(() => api.viewer.getObjects({}, { visible: true }), 20000, "Henting av synlige objekter")
      ]);
      const visible = new Set((groups || []).map(group => String(group.modelId)));
      const candidates = (models || []).filter(model => visible.has(mid(model)) && ["trb", "trimbim"].includes(ext(mname(model))));
      diagnostic.discoveredCount = candidates.length;

      for (const model of candidates) {
        const modelId = mid(model);
        const name = mname(model);
        let provider = this.providers.find(item => item.type === "trb" && String(item.modelId) === modelId);
        if (!provider) {
          provider = this.create({ id: `viewer-trb-${modelId}`, name, modelId, origin: "viewer-trb", forceType: "trb" });
          this.providers.push(provider);
        }
        provider.errorStage = null;
        try {
          if (!provider.file) {
            provider.status = "loading";
            let file = asFile(model, name);
            if (!file) {
              provider.errorStage = "viewer.getLoadedModel";
              const loaded = await settleOne(() => api.viewer.getLoadedModel(modelId), 30000, `Åpning av ${name}`);
              file = asFile(loaded, name);
            }
            if (file) {
              provider.attachFile(file);
              provider.fileOrigin = "viewer-loaded-model";
            }
          }
          if (!provider.file) throw new Error("Viewer returnerte ingen TRB-blob");
          provider.errorStage = "provider.open";
          await settleOne(() => provider.open(), 120000, `Dekoding av ${name}`);
          if (provider.status !== "ready") throw new Error(provider.error || `Uventet status: ${provider.status}`);
          provider.errorStage = null;
          diagnostic.openedCount += 1;
        } catch (error) {
          provider.status = "error";
          provider.error = errorText(error);
          diagnostic.failedCount += 1;
          console.error("TRB-MODELLFEIL", { modelId, name, stage: provider.errorStage, error });
        }
        diagnostic.models.push({ modelId, name, status: provider.status, fileSize: provider.file?.size || 0, errorStage: provider.errorStage, error: provider.error || null });
        window.dispatchEvent(new CustomEvent("cross-section-geometry-updated", { detail: diagnostic }));
      }
      window.__crossSectionTrbRegistryDiagnostic = diagnostic;
      return diagnostic;
    } catch (error) {
      diagnostic.error = errorText(error);
      console.error("TRB discovery feilet", error);
      return diagnostic;
    } finally {
      this.busy = false;
      endUiOperation(uiToken, diagnostic.failedCount ? `${diagnostic.openedCount} TRB klare, ${diagnostic.failedCount} feilet` : `${diagnostic.openedCount} TRB-modeller klare`);
      if (this.pendingDiscovery) setTimeout(() => this.discoverVisibleTrbModels({ reason: "pending" }), 0);
    }
  }

  async addLocalFiles(files, onProgress) {
    const output = [];
    for (const file of Array.from(files || [])) {
      const type = ext(file.name) === "trimbim" ? "trb" : ext(file.name);
      let provider = this.findBySource(file.name, type);
      if (!provider) {
        provider = this.create({ name: file.name, file, origin: "local" });
        if (!provider) continue;
        this.providers.push(provider);
      } else provider.attachFile(file);
      provider.fileOrigin = "local-file-picker";
      provider.errorStage = "provider.open";
      try {
        await settleOne(() => provider.open(), 120000, `Åpning av ${file.name}`);
        if (provider.status === "ready") provider.errorStage = null;
      } catch (error) {
        provider.status = "error";
        provider.error = errorText(error);
      }
      onProgress?.(provider, provider.status);
      output.push(provider);
    }
    return output;
  }

  remove(id) {
    const index = this.providers.findIndex(provider => provider.id === id);
    if (index < 0) return false;
    this.providers[index].close();
    this.providers.splice(index, 1);
    return true;
  }

  clearLocal() {
    for (const provider of [...this.providers]) if (provider.fileOrigin === "local-file-picker" || provider.origin === "local") this.remove(provider.id);
  }

  summary() {
    const sources = this.providers.map(provider => {
      const summary = provider.getSummary();
      summary.origin = provider.origin || (provider.modelId ? "viewer" : provider.file ? "local" : "detached");
      summary.fileOrigin = provider.fileOrigin || null;
      summary.errorStage = provider.errorStage || null;
      return summary;
    });
    return {
      sourceCount: sources.length,
      viewerCount: sources.filter(source => source.origin.includes("viewer")).length,
      localCount: sources.filter(source => source.origin.includes("local")).length,
      automaticCount: sources.filter(source => source.origin.includes("diagnostic")).length,
      ifcCount: sources.filter(source => source.type === "ifc").length,
      trbCount: sources.filter(source => source.type === "trb").length,
      readyCount: sources.filter(source => source.status === "ready").length,
      errorCount: sources.filter(source => source.status === "error").length,
      loadingCount: sources.filter(source => ["new", "opening", "loading"].includes(source.status)).length,
      totalEntities: sources.reduce((sum, source) => sum + (source.entityCount || 0), 0),
      sources
    };
  }
}

export { key as normalizedSourceKey };
