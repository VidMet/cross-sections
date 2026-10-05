import { GeometryProvider } from "./geometry-provider.js";
import { normalizeIfcGeometry } from "./mesh-normalizer.js";

export const IFC_GEOMETRY_PROVIDER_VERSION = "0.6.4d-curve3d-centerline";
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

function valueOf(value) {
    if (value == null) return null;
    return typeof value === "object" && "value" in value ? value.value : value;
}

function inspectIfcSignature(data, file) {
    const sample = data.slice(0, Math.min(data.length, 4096));
    let text = "";
    try { text = new TextDecoder("utf-8").decode(sample); } catch { text = ""; }
    const normalized = text.replace(/^\uFEFF/, "").trimStart();
    return {
        fileName: file?.name || "",
        fileSize: data.length,
        hasStepStart: normalized.toUpperCase().startsWith("ISO-10303-21;"),
        hasHeader: /ISO-10303-21;[\s\S]{0,256}HEADER\s*;/i.test(normalized),
        firstBytesHex: Array.from(sample.slice(0, 32)).map(v => v.toString(16).padStart(2, "0")).join(" ")
    };
}

function vectorToArray(value, maximum = 1000) {
    if (!value) return [];
    if (Array.isArray(value)) return value.slice(0, maximum);
    if (typeof value.size === "function" && typeof value.get === "function") {
        const output = [];
        for (let i = 0; i < Math.min(Number(value.size()) || 0, maximum); i += 1) output.push(value.get(i));
        return output;
    }
    try { return Array.from(value).slice(0, maximum); } catch { return []; }
}

function curvePointToViewer(point) {
    const x = Number(point?.x);
    const elevation = Number(point?.y);
    const negativeY = Number(point?.z);
    if (![x, elevation, negativeY].every(Number.isFinite)) return null;
    return { x, y: -negativeY, z: elevation };
}

function cleanCurvePoints(points) {
    const output = [];
    for (const raw of points || []) {
        const point = curvePointToViewer(raw);
        if (!point) continue;
        const previous = output.at(-1);
        if (previous && Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z) < 0.001) continue;
        output.push(point);
    }
    return output;
}

function extractAlignmentCurves(api, modelId) {
    if (typeof api.GetAllAlignments !== "function") return [];
    const alignments = vectorToArray(api.GetAllAlignments(modelId), 100);
    return alignments.map((alignment, alignmentIndex) => {
        const entries = vectorToArray(alignment?.curve3D, 100);
        const points = cleanCurvePoints(entries.flatMap(entry => vectorToArray(entry?.points, 100000)));
        return {
            alignmentIndex,
            points,
            pointCount: points.length,
            flatCoordinationMatrix: Array.from(alignment?.FlatCoordinationMatrix || []),
            flattenedWorldTransformMatrix: Array.from(alignment?.FlattenedWorldTransformMatrix || [])
        };
    }).filter(curve => curve.points.length >= 2);
}

export class IfcGeometryProvider extends GeometryProvider {
    constructor(options) {
        super({ ...options, type: "ifc" });
        this.ifcApi = null;
        this.ifcModelId = null;
        this.globalIdIndex = new Map();
        this.meshIndex = new Map();
        this.alignmentCurves = [];
    }

    getAlignmentCurves() {
        return this.alignmentCurves.map(curve => ({ ...curve, points: curve.points.map(point => ({ ...point })) }));
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
        this.alignmentCurves = [];

        try {
            this.ifcApi = await getIfcApi();
            const data = new Uint8Array(await this.file.arrayBuffer());
            const signature = inspectIfcSignature(data, this.file);
            signature.validIfcStepSignature = signature.hasStepStart && signature.hasHeader;
            console.log("===== IFC-SIGNATURDIAGNOSE v0.6.4d =====");
            console.dir({ sourceId: this.id, origin: this.origin, ...signature });
            if (!signature.validIfcStepSignature) throw new Error("Filen mangler gyldig IFC STEP-signatur.");

            this.ifcModelId = this.ifcApi.OpenModel(data, { COORDINATE_TO_ORIGIN: false, USE_FAST_BOOLS: true });
            const schema = this.ifcApi.GetModelSchema(this.ifcModelId);
            let coordinationMatrix = [];
            try { coordinationMatrix = Array.from(this.ifcApi.GetCoordinationMatrix(this.ifcModelId) || []); } catch { coordinationMatrix = []; }

            this.alignmentCurves = extractAlignmentCurves(this.ifcApi, this.ifcModelId);
            const alignmentDiagnostic = {
                providerVersion: IFC_GEOMETRY_PROVIDER_VERSION,
                sourceId: this.id,
                modelId: this.modelId ?? null,
                fileName: this.file?.name || "",
                curveCount: this.alignmentCurves.length,
                curves: this.alignmentCurves.map(curve => ({
                    alignmentIndex: curve.alignmentIndex,
                    pointCount: curve.pointCount,
                    firstPoint: curve.points[0],
                    lastPoint: curve.points.at(-1)
                }))
            };
            console.log("===== CURVE3D-CENTERLINE v0.6.4d =====");
            console.dir(alignmentDiagnostic);
            if (typeof window !== "undefined") window.__crossSectionCenterlineDiagnostic = alignmentDiagnostic;

            let meshCount = 0;
            this.ifcApi.StreamAllMeshes(this.ifcModelId, flatMesh => {
                const expressId = Number(flatMesh.expressID);
                let line = null;
                try { line = this.ifcApi.GetLine(this.ifcModelId, expressId, false); } catch { line = null; }
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
                for (let i = 0; i < count; i += 1) {
                    const placed = geometries.get(i);
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
                ...(this.metadata || {}), signature, schema, entityCount: this.entities.length, meshCount,
                webIfcVersion: WEB_IFC_VERSION, coordinationMatrix,
                providerVersion: IFC_GEOMETRY_PROVIDER_VERSION,
                alignmentCurveCount: this.alignmentCurves.length
            };
            this.status = "ready";
        }
        catch (error) {
            this.status = "error";
            this.error = error?.message || String(error);
            console.error("IFC-GEOMETRIFEIL:", error);
        }
        return this.getSummary();
    }

    getMeshesForGlobalIds(globalIds) {
        const meshes = [];
        for (const globalId of globalIds || []) {
            const entity = this.globalIdIndex.get(String(globalId));
            if (entity) meshes.push(...(this.meshIndex.get(entity.expressId) || []));
        }
        return meshes;
    }

    getAllMeshes() {
        return Array.from(this.meshIndex.values()).flat();
    }

    close() {
        if (this.ifcApi && this.ifcModelId !== null) {
            try { this.ifcApi.CloseModel(this.ifcModelId); } catch { /* no-op */ }
        }
        this.ifcModelId = null;
        this.globalIdIndex.clear();
        this.meshIndex.clear();
        this.alignmentCurves = [];
        super.close();
    }
}
