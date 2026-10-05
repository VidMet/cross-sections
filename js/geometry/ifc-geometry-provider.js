import { GeometryProvider } from "./geometry-provider.js";
import { normalizeIfcGeometry } from "./mesh-normalizer.js";

export const IFC_GEOMETRY_PROVIDER_VERSION = "0.6.4a-alignment-geometry-diagnostic";
const IFC_SIGNATURE_SAMPLE_BYTES = 4096;

function byteHex(bytes, maximum = 32) {
    return Array.from(bytes.slice(0, maximum))
        .map(value => value.toString(16).padStart(2, "0"))
        .join(" ");
}

function printablePreview(bytes, maximum = 160) {
    return Array.from(bytes.slice(0, maximum))
        .map(value => value >= 32 && value <= 126 ? String.fromCharCode(value) : ".")
        .join("");
}

function inspectIfcSignature(data, file) {
    const sample = data.slice(0, Math.min(data.length, IFC_SIGNATURE_SAMPLE_BYTES));
    let text = "";
    try { text = new TextDecoder("utf-8", { fatal: false }).decode(sample); }
    catch { text = ""; }
    const normalized = text.replace(/^\uFEFF/, "").trimStart();
    const compact = normalized.slice(0, 512).toUpperCase();
    const hasStepStart = compact.startsWith("ISO-10303-21;");
    const hasHeader = /ISO-10303-21;[\s\S]{0,256}HEADER\s*;/i.test(normalized);
    const hasData = /\bDATA\s*;/i.test(text);
    const looksLikeZip = sample.length >= 4 && sample[0] === 0x50 && sample[1] === 0x4b && [0x03, 0x05, 0x07].includes(sample[2]);
    const nullBytes = Array.from(sample).filter(value => value === 0).length;
    const highBytes = Array.from(sample).filter(value => value > 127).length;
    return {
        fileName: file?.name || "",
        fileSize: data.length,
        mimeType: file?.type || "",
        sampleSize: sample.length,
        hasStepStart,
        hasHeader,
        hasData,
        looksLikeZip,
        nullByteCount: nullBytes,
        highByteCount: highBytes,
        firstBytesHex: byteHex(sample),
        printablePreview: printablePreview(sample),
        decodedPreview: text.slice(0, 300),
        validIfcStepSignature: hasStepStart && hasHeader
    };
}

const WEB_IFC_VERSION = "0.0.78";
const WEB_IFC_MODULE = `https://cdn.jsdelivr.net/npm/web-ifc@${WEB_IFC_VERSION}/web-ifc-api.js`;
const WEB_IFC_WASM_PATH = `https://cdn.jsdelivr.net/npm/web-ifc@${WEB_IFC_VERSION}/`;
let sharedIfcApiPromise = null;

async function getIfcApi() {
    if (!sharedIfcApiPromise) {
        sharedIfcApiPromise = (async () => {
            const WebIFC = await import(WEB_IFC_MODULE);
            const api = new WebIFC.IfcAPI();
            api.SetWasmPath(WEB_IFC_WASM_PATH, true);
            await api.Init();
            return api;
        })();
    }
    return sharedIfcApiPromise;
}

function valueOf(property) {
    if (property === null || property === undefined) return null;
    if (typeof property === "object" && "value" in property) return property.value;
    return property;
}

function vectorToArray(value, maximum = 10000) {
    if (!value) return [];
    if (Array.isArray(value)) return value.slice(0, maximum);
    if (typeof value.size === "function" && typeof value.get === "function") {
        const output = [];
        const count = Math.min(Number(value.size()) || 0, maximum);
        for (let index = 0; index < count; index += 1) output.push(value.get(index));
        return output;
    }
    if (typeof value[Symbol.iterator] === "function") return Array.from(value).slice(0, maximum);
    return [value];
}

function summarizeTypedArray(value, maximum = 24) {
    if (!value || typeof value.length !== "number") return null;
    return {
        type: value.constructor?.name || typeof value,
        length: Number(value.length),
        sample: Array.from(value).slice(0, maximum)
    };
}

function summarizeAlignmentSegment(segment) {
    if (!segment) return null;
    const result = { keys: Object.keys(segment).sort() };
    for (const key of ["StartDistAlong", "HorizontalLength", "StartHeight", "StartGradient", "EndGradient", "StartRadiusOfCurvature", "EndRadiusOfCurvature", "SegmentLength", "PredefinedType"]) {
        if (segment[key] !== undefined) result[key] = valueOf(segment[key]);
    }
    if (segment.GetBuffers && typeof segment.GetBuffers === "function") {
        try {
            const buffers = segment.GetBuffers();
            result.buffers = {};
            for (const key of Object.keys(buffers || {})) {
                const summary = summarizeTypedArray(buffers[key]);
                if (summary) result.buffers[key] = summary;
            }
        } catch (error) {
            result.bufferError = error?.message || String(error);
        }
    }
    return result;
}

function summarizeAlignmentObject(alignment, index) {
    const result = {
        index,
        type: alignment?.constructor?.name || typeof alignment,
        keys: alignment ? Object.keys(alignment).sort() : []
    };
    for (const key of ["FlatCoordinationMatrix", "Horizontal", "Vertical", "Absolute"]) {
        const value = alignment?.[key];
        if (key === "FlatCoordinationMatrix") result[key] = summarizeTypedArray(value, 16);
        else result[key] = summarizeAlignmentSegment(value);
    }
    if (alignment?.GetBuffers && typeof alignment.GetBuffers === "function") {
        try {
            const buffers = alignment.GetBuffers();
            result.buffers = {};
            for (const key of Object.keys(buffers || {})) {
                const summary = summarizeTypedArray(buffers[key]);
                if (summary) result.buffers[key] = summary;
            }
        } catch (error) {
            result.bufferError = error?.message || String(error);
        }
    }
    return result;
}

export class IfcGeometryProvider extends GeometryProvider {
    constructor(options) {
        super({ ...options, type: "ifc" });
        this.ifcApi = null;
        this.ifcModelId = null;
        this.globalIdIndex = new Map();
        this.meshIndex = new Map();
        this.alignmentDiagnostic = null;
    }

    inspectAlignments(targetGlobalId = null) {
        return {
            providerVersion: IFC_GEOMETRY_PROVIDER_VERSION,
            sourceId: this.id,
            modelId: this.modelId ?? null,
            fileName: this.file?.name || "",
            targetGlobalId: targetGlobalId ? String(targetGlobalId) : null,
            ...(this.alignmentDiagnostic || {
                available: false,
                reason: "Alignmentdiagnose er ikke tilgjengelig før IFC-filen er åpnet."
            })
        };
    }

    async open() {
        if (!this.file) {
            this.status = "discovered";
            return this.getSummary();
        }

        this.status = "opening";
        this.entities = [];
        this.meshes = [];
        this.globalIdIndex.clear();
        this.meshIndex.clear();
        this.alignmentDiagnostic = null;

        try {
            this.ifcApi = await getIfcApi();
            const data = new Uint8Array(await this.file.arrayBuffer());
            const signature = inspectIfcSignature(data, this.file);
            console.log("===== IFC-SIGNATURDIAGNOSE v0.6.4a =====");
            console.dir({ sourceId: this.id, origin: this.origin, ...signature });
            this.metadata = { ...(this.metadata || {}), signature, providerVersion: IFC_GEOMETRY_PROVIDER_VERSION };

            if (!signature.validIfcStepSignature) {
                this.status = "invalid-ifc-signature";
                this.error = signature.looksLikeZip
                    ? "Filen starter som ZIP/komprimert innhold, ikke klartekst IFC STEP."
                    : "Filen mangler IFC STEP-signaturen ISO-10303-21; og HEADER;.";
                console.warn("IFC-SIGNATUR AVVIST:", { sourceId: this.id, fileName: this.file?.name || "", error: this.error, signature });
                return this.getSummary();
            }

            this.ifcModelId = this.ifcApi.OpenModel(data, {
                COORDINATE_TO_ORIGIN: false,
                USE_FAST_BOOLS: true
            });

            const schema = this.ifcApi.GetModelSchema(this.ifcModelId);
            let coordinationMatrix = null;
            try {
                coordinationMatrix = Array.from(this.ifcApi.GetCoordinationMatrix(this.ifcModelId) || []);
            } catch (error) {
                console.warn("GetCoordinationMatrix feilet:", error);
            }

            try {
                if (typeof this.ifcApi.GetAllAlignments === "function") {
                    const rawAlignments = this.ifcApi.GetAllAlignments(this.ifcModelId);
                    const alignments = vectorToArray(rawAlignments, 100);
                    this.alignmentDiagnostic = {
                        available: true,
                        apiMethod: "GetAllAlignments",
                        alignmentCount: alignments.length,
                        alignments: alignments.map(summarizeAlignmentObject)
                    };
                } else {
                    this.alignmentDiagnostic = {
                        available: false,
                        apiMethod: null,
                        reason: "web-ifc-versjonen eksponerer ikke GetAllAlignments()."
                    };
                }
            } catch (error) {
                this.alignmentDiagnostic = {
                    available: false,
                    apiMethod: "GetAllAlignments",
                    error: error?.message || String(error)
                };
            }

            console.log("===== IFC-ALIGNMENT-GEOMETRIDIAGNOSE v0.6.4a =====");
            console.dir(this.inspectAlignments());

            let meshCount = 0;
            this.ifcApi.StreamAllMeshes(this.ifcModelId, flatMesh => {
                const expressId = Number(flatMesh.expressID);
                let line = null;
                try { line = this.ifcApi.GetLine(this.ifcModelId, expressId, false); }
                catch (_) { line = null; }

                const globalId = valueOf(line?.GlobalId);
                const entity = {
                    sourceId: this.id,
                    expressId,
                    globalId: globalId ? String(globalId) : null,
                    className: line?.constructor?.name || "IFCPRODUCT",
                    name: String(valueOf(line?.Name) || "")
                };

                this.entities.push(entity);
                if (entity.globalId) this.globalIdIndex.set(entity.globalId, entity);

                const geometries = flatMesh.geometries;
                const count = geometries?.size ? geometries.size() : 0;
                const entityMeshes = [];

                for (let index = 0; index < count; index += 1) {
                    const placed = geometries.get(index);
                    const geometry = this.ifcApi.GetGeometry(this.ifcModelId, placed.geometryExpressID);
                    const vertices = this.ifcApi.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
                    const indices = this.ifcApi.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());

                    entityMeshes.push(normalizeIfcGeometry({
                        sourceId: this.id,
                        expressId,
                        globalId: entity.globalId,
                        className: entity.className,
                        name: entity.name,
                        vertexData: vertices,
                        indexData: indices,
                        transform: placed.flatTransformation,
                        color: placed.color || null
                    }));

                    meshCount += 1;
                    geometry.delete?.();
                }

                this.meshIndex.set(expressId, entityMeshes);
            });

            this.metadata = {
                ...(this.metadata || {}),
                schema,
                entityCount: this.entities.length,
                meshCount,
                webIfcVersion: WEB_IFC_VERSION,
                coordinationMatrix,
                alignmentDiagnostic: this.alignmentDiagnostic
            };

            console.log("===== IFC-KOORDINATMATRISER =====");
            console.dir({ sourceId: this.id, fileName: this.file?.name || "", schema, coordinationMatrix });
            this.status = "ready";
        } catch (error) {
            this.status = "error";
            this.error = error.message || String(error);
            console.error("IFC-GEOMETRIFEIL:", error);
        }

        return this.getSummary();
    }

    getMeshesForGlobalIds(globalIds) {
        const meshes = [];
        for (const globalId of globalIds || []) {
            const entity = this.globalIdIndex.get(String(globalId));
            if (!entity) continue;
            meshes.push(...(this.meshIndex.get(entity.expressId) || []));
        }
        return meshes;
    }

    getAllMeshes() {
        return Array.from(this.meshIndex.values()).flat();
    }

    close() {
        if (this.ifcApi && this.ifcModelId !== null) {
            try { this.ifcApi.CloseModel(this.ifcModelId); }
            catch (_) { /* no-op */ }
        }
        this.ifcModelId = null;
        this.globalIdIndex.clear();
        this.meshIndex.clear();
        this.alignmentDiagnostic = null;
        super.close();
    }
}
