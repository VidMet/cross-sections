import { GeometryProvider } from "./geometry-provider.js";
import { normalizeIfcGeometry } from "./mesh-normalizer.js";

export const IFC_GEOMETRY_PROVIDER_VERSION = "0.6.4b-curve3d-diagnostic";
const IFC_SIGNATURE_SAMPLE_BYTES = 4096;
const WEB_IFC_VERSION = "0.0.78";
const WEB_IFC_MODULE = `https://cdn.jsdelivr.net/npm/web-ifc@${WEB_IFC_VERSION}/web-ifc-api.js`;
const WEB_IFC_WASM_PATH = `https://cdn.jsdelivr.net/npm/web-ifc@${WEB_IFC_VERSION}/`;
let sharedIfcApiPromise = null;

function byteHex(bytes, maximum = 32) {
    return Array.from(bytes.slice(0, maximum)).map(value => value.toString(16).padStart(2, "0")).join(" ");
}
function printablePreview(bytes, maximum = 160) {
    return Array.from(bytes.slice(0, maximum)).map(value => value >= 32 && value <= 126 ? String.fromCharCode(value) : ".").join("");
}
function inspectIfcSignature(data, file) {
    const sample = data.slice(0, Math.min(data.length, IFC_SIGNATURE_SAMPLE_BYTES));
    let text = "";
    try { text = new TextDecoder("utf-8", { fatal: false }).decode(sample); } catch { text = ""; }
    const normalized = text.replace(/^\uFEFF/, "").trimStart();
    const compact = normalized.slice(0, 512).toUpperCase();
    const hasStepStart = compact.startsWith("ISO-10303-21;");
    const hasHeader = /ISO-10303-21;[\s\S]{0,256}HEADER\s*;/i.test(normalized);
    return {
        fileName: file?.name || "", fileSize: data.length, mimeType: file?.type || "",
        sampleSize: sample.length, hasStepStart, hasHeader, hasData: /\bDATA\s*;/i.test(text),
        looksLikeZip: sample.length >= 4 && sample[0] === 0x50 && sample[1] === 0x4b && [0x03, 0x05, 0x07].includes(sample[2]),
        nullByteCount: Array.from(sample).filter(value => value === 0).length,
        highByteCount: Array.from(sample).filter(value => value > 127).length,
        firstBytesHex: byteHex(sample), printablePreview: printablePreview(sample), decodedPreview: text.slice(0, 300),
        validIfcStepSignature: hasStepStart && hasHeader
    };
}
async function getIfcApi() {
    if (!sharedIfcApiPromise) sharedIfcApiPromise = (async () => {
        const WebIFC = await import(WEB_IFC_MODULE);
        const api = new WebIFC.IfcAPI();
        api.SetWasmPath(WEB_IFC_WASM_PATH, true);
        await api.Init();
        return api;
    })();
    return sharedIfcApiPromise;
}
function valueOf(property) {
    if (property == null) return null;
    return typeof property === "object" && "value" in property ? property.value : property;
}
function ownKeys(value) {
    if (!value || !["object", "function"].includes(typeof value)) return [];
    try { return Reflect.ownKeys(value).map(String).sort(); } catch { return []; }
}
function safeRead(value, key) {
    try { return value?.[key]; } catch (error) { return { __readError: error?.message || String(error) }; }
}
function typedSummary(value, maximum = 24) {
    if (!value || typeof value.length !== "number" || typeof value === "string") return null;
    try { return { type: value.constructor?.name || typeof value, length: Number(value.length), sample: Array.from(value).slice(0, maximum) }; }
    catch { return null; }
}
function vectorSummary(value, maximum = 8) {
    if (!value || typeof value.size !== "function" || typeof value.get !== "function") return null;
    const size = Number(value.size()) || 0, sample = [];
    for (let index = 0; index < Math.min(size, maximum); index += 1) {
        const item = value.get(index);
        sample.push(typedSummary(item) || { type: item?.constructor?.name || typeof item, keys: ownKeys(item) });
    }
    return { type: value.constructor?.name || "Vector", size, sample };
}
function prototypeSummary(value) {
    const chain = []; let current = value;
    for (let depth = 0; depth < 4 && current; depth += 1) {
        let proto = null;
        try { proto = Object.getPrototypeOf(current); } catch { proto = null; }
        if (!proto) break;
        const names = Object.getOwnPropertyNames(proto).sort();
        chain.push({ depth: depth + 1, constructorName: proto.constructor?.name || null, properties: names,
            methods: names.filter(name => { try { return typeof proto[name] === "function"; } catch { return false; } }) });
        current = proto;
    }
    return chain;
}
function summarizeContainer(container) {
    if (!container) return null;
    const result = { type: container.constructor?.name || typeof container, keys: ownKeys(container), prototypeChain: prototypeSummary(container) };
    for (const key of ownKeys(container)) {
        const value = safeRead(container, key);
        result[key] = typedSummary(value) || vectorSummary(value) ||
            (["number", "string", "boolean"].includes(typeof value) || value === null ? value :
                (value && typeof value !== "function" ? { type: value.constructor?.name || typeof value, keys: ownKeys(value) } : undefined));
    }
    return result;
}
function callNoArg(value, name) {
    const method = safeRead(value, name);
    if (typeof method !== "function") return null;
    try { return { ok: true, result: summarizeContainer(method.call(value)) }; }
    catch (error) { return { ok: false, error: error?.message || String(error) }; }
}
function summarizeCurve3D(curve3D) {
    if (!curve3D) return null;
    const result = summarizeContainer(curve3D);
    for (const name of ["GetBuffers", "getBuffers", "GetPoints", "getPoints", "GetVertices", "getVertices", "GetIndices", "getIndices"]) {
        const called = callNoArg(curve3D, name);
        if (called) result[name] = called;
    }
    return result;
}
function summarizeAlignment(alignment, index) {
    return {
        index,
        type: alignment?.constructor?.name || typeof alignment,
        keys: ownKeys(alignment),
        prototypeChain: prototypeSummary(alignment),
        FlatCoordinationMatrix: typedSummary(safeRead(alignment, "FlatCoordinationMatrix"), 16),
        FlattenedWorldTransformMatrix: typedSummary(safeRead(alignment, "FlattenedWorldTransformMatrix"), 16),
        curve3D: summarizeCurve3D(safeRead(alignment, "curve3D")),
        Horizontal: summarizeContainer(safeRead(alignment, "Horizontal")),
        Vertical: summarizeContainer(safeRead(alignment, "Vertical")),
        Absolute: summarizeContainer(safeRead(alignment, "Absolute")),
        GetBuffers: callNoArg(alignment, "GetBuffers")
    };
}
function vectorToArray(value, maximum = 100) {
    if (!value) return [];
    if (Array.isArray(value)) return value.slice(0, maximum);
    if (typeof value.size === "function" && typeof value.get === "function") {
        const output = [], count = Math.min(Number(value.size()) || 0, maximum);
        for (let index = 0; index < count; index += 1) output.push(value.get(index));
        return output;
    }
    try { return Array.from(value).slice(0, maximum); } catch { return [value]; }
}

export class IfcGeometryProvider extends GeometryProvider {
    constructor(options) {
        super({ ...options, type: "ifc" });
        this.ifcApi = null; this.ifcModelId = null;
        this.globalIdIndex = new Map(); this.meshIndex = new Map(); this.alignmentDiagnostic = null;
    }
    inspectAlignments(targetGlobalId = null) {
        return { providerVersion: IFC_GEOMETRY_PROVIDER_VERSION, sourceId: this.id, modelId: this.modelId ?? null,
            fileName: this.file?.name || "", targetGlobalId: targetGlobalId ? String(targetGlobalId) : null,
            ...(this.alignmentDiagnostic || { available: false, reason: "Alignmentdiagnose er ikke tilgjengelig før IFC-filen er åpnet." }) };
    }
    async open() {
        if (!this.file) { this.status = "discovered"; return this.getSummary(); }
        this.status = "opening"; this.entities = []; this.meshes = []; this.globalIdIndex.clear(); this.meshIndex.clear(); this.alignmentDiagnostic = null;
        try {
            this.ifcApi = await getIfcApi();
            const data = new Uint8Array(await this.file.arrayBuffer());
            const signature = inspectIfcSignature(data, this.file);
            console.log("===== IFC-SIGNATURDIAGNOSE v0.6.4b ====="); console.dir({ sourceId: this.id, origin: this.origin, ...signature });
            this.metadata = { ...(this.metadata || {}), signature, providerVersion: IFC_GEOMETRY_PROVIDER_VERSION };
            if (!signature.validIfcStepSignature) {
                this.status = "invalid-ifc-signature";
                this.error = signature.looksLikeZip ? "Filen starter som ZIP/komprimert innhold, ikke klartekst IFC STEP." : "Filen mangler IFC STEP-signaturen ISO-10303-21; og HEADER;.";
                return this.getSummary();
            }
            this.ifcModelId = this.ifcApi.OpenModel(data, { COORDINATE_TO_ORIGIN: false, USE_FAST_BOOLS: true });
            const schema = this.ifcApi.GetModelSchema(this.ifcModelId);
            let coordinationMatrix = null;
            try { coordinationMatrix = Array.from(this.ifcApi.GetCoordinationMatrix(this.ifcModelId) || []); } catch (error) { console.warn("GetCoordinationMatrix feilet:", error); }

            try {
                const alignments = typeof this.ifcApi.GetAllAlignments === "function" ? vectorToArray(this.ifcApi.GetAllAlignments(this.ifcModelId)) : [];
                this.alignmentDiagnostic = typeof this.ifcApi.GetAllAlignments === "function"
                    ? { available: true, apiMethod: "GetAllAlignments", alignmentCount: alignments.length, alignments: alignments.map(summarizeAlignment) }
                    : { available: false, apiMethod: null, reason: "web-ifc-versjonen eksponerer ikke GetAllAlignments()." };
            } catch (error) {
                this.alignmentDiagnostic = { available: false, apiMethod: "GetAllAlignments", error: error?.message || String(error) };
            }
            const diagnostic = this.inspectAlignments();
            console.log("===== IFC-CURVE3D-DIAGNOSE v0.6.4b ====="); console.dir(diagnostic);
            if (typeof window !== "undefined") window.__crossSectionCurve3DDiagnostic = diagnostic;

            let meshCount = 0;
            this.ifcApi.StreamAllMeshes(this.ifcModelId, flatMesh => {
                const expressId = Number(flatMesh.expressID); let line = null;
                try { line = this.ifcApi.GetLine(this.ifcModelId, expressId, false); } catch { line = null; }
                const globalId = valueOf(line?.GlobalId);
                const entity = { sourceId: this.id, expressId, globalId: globalId ? String(globalId) : null,
                    className: line?.constructor?.name || "IFCPRODUCT", name: String(valueOf(line?.Name) || "") };
                this.entities.push(entity); if (entity.globalId) this.globalIdIndex.set(entity.globalId, entity);
                const geometries = flatMesh.geometries, count = geometries?.size ? geometries.size() : 0, entityMeshes = [];
                for (let index = 0; index < count; index += 1) {
                    const placed = geometries.get(index), geometry = this.ifcApi.GetGeometry(this.ifcModelId, placed.geometryExpressID);
                    const vertices = this.ifcApi.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
                    const indices = this.ifcApi.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
                    entityMeshes.push(normalizeIfcGeometry({ sourceId: this.id, expressId, globalId: entity.globalId, className: entity.className,
                        name: entity.name, vertexData: vertices, indexData: indices, transform: placed.flatTransformation, color: placed.color || null }));
                    meshCount += 1; geometry.delete?.();
                }
                this.meshIndex.set(expressId, entityMeshes);
            });
            this.metadata = { ...(this.metadata || {}), schema, entityCount: this.entities.length, meshCount,
                webIfcVersion: WEB_IFC_VERSION, coordinationMatrix, alignmentDiagnostic: this.alignmentDiagnostic };
            console.log("===== IFC-KOORDINATMATRISER ====="); console.dir({ sourceId: this.id, fileName: this.file?.name || "", schema, coordinationMatrix });
            this.status = "ready";
        } catch (error) {
            this.status = "error"; this.error = error.message || String(error); console.error("IFC-GEOMETRIFEIL:", error);
        }
        return this.getSummary();
    }
    getMeshesForGlobalIds(globalIds) {
        const meshes = [];
        for (const globalId of globalIds || []) { const entity = this.globalIdIndex.get(String(globalId)); if (entity) meshes.push(...(this.meshIndex.get(entity.expressId) || [])); }
        return meshes;
    }
    getAllMeshes() { return Array.from(this.meshIndex.values()).flat(); }
    close() {
        if (this.ifcApi && this.ifcModelId !== null) try { this.ifcApi.CloseModel(this.ifcModelId); } catch { /* no-op */ }
        this.ifcModelId = null; this.globalIdIndex.clear(); this.meshIndex.clear(); this.alignmentDiagnostic = null; super.close();
    }
}
