import { GeometryProvider } from "./geometry-provider.js";
import { getAPI } from "../tc-api.js";
import { TrimBimStructureReader, LOCAL_TRB_STRUCTURE_VERSION } from "../vendor/trb-sdk/index.js?v=0.6.5d";
export const TRB_GEOMETRY_PROVIDER_VERSION = "0.6.5d-trb8-geometry-structure";
function mergeBox(target, box) {
    if (!box?.min || !box?.max) return target;
    if (!target) return { min: { ...box.min }, max: { ...box.max } };
    for (const axis of ["x", "y", "z"]) { target.min[axis] = Math.min(target.min[axis], +box.min[axis]); target.max[axis] = Math.max(target.max[axis], +box.max[axis]); }
    return target;
}
export class TrbGeometryProvider extends GeometryProvider {
    constructor(options) { super({ ...options, type: "trb" }); this.buffer = null; this.globalIdIndex = new Map(); this.meshIndex = new Map(); }
    async viewerDiagnostic() {
        const api = getAPI(), result = { modelId: this.modelId ?? null, visibleRuntimeIdCount: 0, aggregateViewerBoundingBox: null, classCounts: {}, errors: [] };
        if (!api?.viewer || !this.modelId) return result;
        try {
            const group = (await api.viewer.getObjects({}, { visible: true }) || []).find(item => String(item.modelId) === String(this.modelId));
            if (!group) return result;
            const ids = (group.objects || []).map(item => Number(item.id)).filter(Number.isFinite);
            result.visibleRuntimeIdCount = ids.length;
            for (let index = 0; index < ids.length; index += 250) {
                const boxes = await api.viewer.getObjectBoundingBoxes(this.modelId, ids.slice(index, index + 250));
                for (const item of boxes || []) result.aggregateViewerBoundingBox = mergeBox(result.aggregateViewerBoundingBox, item.boundingBox);
            }
            const properties = ids.length ? await api.viewer.getObjectProperties(this.modelId, ids) : [];
            for (const item of properties || []) { const name = String(item?.class || "UNKNOWN"); result.classCounts[name] = (result.classCounts[name] || 0) + 1; }
        } catch (error) { result.errors.push(error?.message || String(error)); }
        return result;
    }
    async open() {
        if (!this.file) { this.status = "discovered-no-blob"; return this.getSummary(); }
        this.status = "opening-structure"; this.error = null;
        try {
            this.buffer = await this.file.arrayBuffer();
            const reader = TrimBimStructureReader.open(this.buffer);
            const diagnostic = {
                providerVersion: TRB_GEOMETRY_PROVIDER_VERSION,
                localReaderVersion: LOCAL_TRB_STRUCTURE_VERSION,
                purpose: "Strukturdiagnose for entitets-, instans- og geometripooler i generelle TRB8-modeller.",
                fileName: this.file.name, fileSize: this.file.size, mimeType: this.file.type,
                modelId: this.modelId ?? null, origin: this.origin,
                structure: reader.structureDiagnostic(),
                viewer: await this.viewerDiagnostic(),
                meshDecodingImplemented: false
            };
            this.metadata = diagnostic;
            this.status = diagnostic.structure.header.identifier === "TRB8" && diagnostic.structure.rootTable ? "ready-structure" : "structure-error";
            console.log("===== TRB8-GEOMETRY-STRUCTURE v0.6.5d ====="); console.dir(diagnostic);
            if (typeof window !== "undefined") {
                const list = Array.isArray(window.__crossSectionTrbGeometryStructures) ? window.__crossSectionTrbGeometryStructures : [];
                window.__crossSectionTrbGeometryStructures = [...list.filter(item => String(item.modelId) !== String(diagnostic.modelId)), diagnostic];
            }
        } catch (error) { this.status = "structure-error"; this.error = error?.message || String(error); console.error("TRB8-GEOMETRY-STRUCTURE FEILET:", error); }
        return this.getSummary();
    }
    getMeshesForGlobalIds() { return []; }
    getAllMeshes() { return []; }
    close() { this.buffer = null; this.globalIdIndex.clear(); this.meshIndex.clear(); super.close(); }
}
