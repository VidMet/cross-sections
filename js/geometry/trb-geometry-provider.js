import { GeometryProvider } from "./geometry-provider.js";
import { getAPI } from "../tc-api.js";
import { TrimBimCapabilityReader, LOCAL_TRB_SDK_CAPABILITY_VERSION } from "../vendor/trb-sdk/index.js?v=0.6.5c";

export const TRB_GEOMETRY_PROVIDER_VERSION = "0.6.5c-trb8-sdk-capability";

function scalarFields(value) {
    if (!value || typeof value !== "object") return {};
    const output = {};
    for (const [key, item] of Object.entries(value)) {
        if (item === null || ["string", "number", "boolean"].includes(typeof item)) output[key] = item;
        else if (item instanceof Blob) output[key] = { type: "Blob", size: item.size, mimeType: item.type };
    }
    return output;
}
function mergeBox(target, box) {
    if (!box?.min || !box?.max) return target;
    if (!target) return { min: { ...box.min }, max: { ...box.max } };
    for (const axis of ["x", "y", "z"]) {
        target.min[axis] = Math.min(target.min[axis], +box.min[axis]);
        target.max[axis] = Math.max(target.max[axis], +box.max[axis]);
    }
    return target;
}
export class TrbGeometryProvider extends GeometryProvider {
    constructor(options) {
        super({ ...options, type: "trb" });
        this.buffer = null;
        this.globalIdIndex = new Map();
        this.meshIndex = new Map();
    }
    async inspectViewerObjects() {
        const api = getAPI();
        const result = { modelId: this.modelId ?? null, visibleGroupFound: false, visibleRuntimeIdCount: 0, aggregateViewerBoundingBox: null, propertyClassCounts: {}, errors: [] };
        if (!api?.viewer || !this.modelId) return result;
        try {
            const group = (await api.viewer.getObjects({}, { visible: true }) || []).find(item => String(item.modelId) === String(this.modelId));
            if (!group) return result;
            result.visibleGroupFound = true;
            const ids = (group.objects || []).map(item => Number(item.id)).filter(Number.isFinite);
            result.visibleRuntimeIdCount = ids.length;
            for (let i = 0; i < ids.length; i += 250) {
                const boxes = await api.viewer.getObjectBoundingBoxes(this.modelId, ids.slice(i, i + 250));
                for (const item of boxes || []) result.aggregateViewerBoundingBox = mergeBox(result.aggregateViewerBoundingBox, item.boundingBox);
            }
            if (ids.length) {
                const props = await api.viewer.getObjectProperties(this.modelId, ids.slice(0, Math.min(ids.length, 100)));
                for (const item of props || []) {
                    const key = String(item?.class || "UNKNOWN");
                    result.propertyClassCounts[key] = (result.propertyClassCounts[key] || 0) + 1;
                }
            }
        } catch (error) { result.errors.push(error?.message || String(error)); }
        return result;
    }
    async open() {
        if (!this.file) {
            this.status = "discovered-no-blob";
            return this.getSummary();
        }
        this.status = "opening-capability";
        this.error = null;
        try {
            this.buffer = await this.file.arrayBuffer();
            const reader = TrimBimCapabilityReader.open(this.buffer);
            const viewer = await this.inspectViewerObjects();
            const capability = reader.capabilityDiagnostic();
            const diagnostic = {
                providerVersion: TRB_GEOMETRY_PROVIDER_VERSION,
                localSdkCapabilityVersion: LOCAL_TRB_SDK_CAPABILITY_VERSION,
                purpose: "TRB8 SDK-kapabilitetsdiagnose for generelle terreng-, grunnlags- og fagmodeller.",
                fileName: this.file.name,
                fileSize: this.file.size,
                mimeType: this.file.type,
                modelId: this.modelId ?? null,
                origin: this.origin,
                modelSpec: scalarFields(this.modelSpec),
                capability,
                viewer,
                meshDecodingImplemented: false
            };
            this.metadata = diagnostic;
            this.status = capability.header.identifier === "TRB8" ? "ready-capability" : "unsupported-trb-version";
            console.log("===== TRB8-SDK-CAPABILITY v0.6.5c =====");
            console.dir(diagnostic);
            if (typeof window !== "undefined") {
                const list = Array.isArray(window.__crossSectionTrbSdkCapabilities) ? window.__crossSectionTrbSdkCapabilities : [];
                window.__crossSectionTrbSdkCapabilities = [...list.filter(item => String(item.modelId) !== String(diagnostic.modelId)), diagnostic];
            }
        } catch (error) {
            this.status = "capability-error";
            this.error = error?.message || String(error);
            console.error("TRB8-SDK-CAPABILITY FEILET:", error);
        }
        return this.getSummary();
    }
    getMeshesForGlobalIds() { return []; }
    getAllMeshes() { return []; }
    close() {
        this.buffer = null;
        this.globalIdIndex.clear();
        this.meshIndex.clear();
        super.close();
    }
}
