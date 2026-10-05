import { GeometryProvider } from "./geometry-provider.js";
import { normalizeIfcGeometry } from "./mesh-normalizer.js";

export const IFC_GEOMETRY_PROVIDER_VERSION = "0.6.4c-curve3d-points-data-diagnostic";

const IFC_SIGNATURE_SAMPLE_BYTES = 4096;
const WEB_IFC_VERSION = "0.0.78";
const WEB_IFC_MODULE = `https://cdn.jsdelivr.net/npm/web-ifc@${WEB_IFC_VERSION}/web-ifc-api.js`;
const WEB_IFC_WASM_PATH = `https://cdn.jsdelivr.net/npm/web-ifc@${WEB_IFC_VERSION}/`;

let sharedIfcApiPromise = null;

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
    try {
        text = new TextDecoder("utf-8", { fatal: false }).decode(sample);
    }
    catch {
        text = "";
    }

    const normalized = text.replace(/^\uFEFF/, "").trimStart();
    const compact = normalized.slice(0, 512).toUpperCase();
    const hasStepStart = compact.startsWith("ISO-10303-21;");
    const hasHeader = /ISO-10303-21;[\s\S]{0,256}HEADER\s*;/i.test(normalized);

    return {
        fileName: file?.name || "",
        fileSize: data.length,
        mimeType: file?.type || "",
        sampleSize: sample.length,
        hasStepStart,
        hasHeader,
        hasData: /\bDATA\s*;/i.test(text),
        looksLikeZip:
            sample.length >= 4 &&
            sample[0] === 0x50 &&
            sample[1] === 0x4b &&
            [0x03, 0x05, 0x07].includes(sample[2]),
        nullByteCount: Array.from(sample).filter(value => value === 0).length,
        highByteCount: Array.from(sample).filter(value => value > 127).length,
        firstBytesHex: byteHex(sample),
        printablePreview: printablePreview(sample),
        decodedPreview: text.slice(0, 300),
        validIfcStepSignature: hasStepStart && hasHeader
    };
}

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

function vectorToArray(value, maximum = 100) {
    if (!value) return [];
    if (Array.isArray(value)) return value.slice(0, maximum);
    if (typeof value.size === "function" && typeof value.get === "function") {
        const output = [];
        const count = Math.min(Number(value.size()) || 0, maximum);
        for (let index = 0; index < count; index += 1) output.push(value.get(index));
        return output;
    }
    try {
        return Array.from(value).slice(0, maximum);
    }
    catch {
        return [value];
    }
}

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function pointFromValue(value) {
    if (!value) return null;

    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        const x = finiteNumber(value[0]);
        const y = finiteNumber(value[1]);
        const z = finiteNumber(value[2]);
        if (x === null || y === null) return null;
        return { x, y, z: z ?? 0 };
    }

    if (typeof value === "object") {
        const x = finiteNumber(value.x ?? value.X ?? value[0]);
        const y = finiteNumber(value.y ?? value.Y ?? value[1]);
        const z = finiteNumber(value.z ?? value.Z ?? value[2]);
        if (x === null || y === null) return null;
        return { x, y, z: z ?? 0 };
    }

    return null;
}

function pointsFromValue(value) {
    if (!value) return [];

    if (Array.isArray(value)) {
        const objectPoints = value.map(pointFromValue).filter(Boolean);
        if (objectPoints.length === value.length && objectPoints.length > 0) return objectPoints;

        const numeric = value.map(finiteNumber);
        if (numeric.every(item => item !== null) && numeric.length >= 3) {
            const points = [];
            for (let index = 0; index + 2 < numeric.length; index += 3) {
                points.push({ x: numeric[index], y: numeric[index + 1], z: numeric[index + 2] });
            }
            return points;
        }
    }

    if (ArrayBuffer.isView(value)) {
        const numeric = Array.from(value).map(finiteNumber);
        const points = [];
        for (let index = 0; index + 2 < numeric.length; index += 3) {
            if (numeric[index] !== null && numeric[index + 1] !== null && numeric[index + 2] !== null) {
                points.push({ x: numeric[index], y: numeric[index + 1], z: numeric[index + 2] });
            }
        }
        return points;
    }

    if (typeof value.size === "function" && typeof value.get === "function") {
        return vectorToArray(value, 100000).map(pointFromValue).filter(Boolean);
    }

    return [];
}

function polylineLength(points, mode = "3d") {
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1];
        const b = points[index];
        length += mode === "2d"
            ? Math.hypot(b.x - a.x, b.y - a.y)
            : Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    return length;
}

function pointBounds(points) {
    if (!points.length) return null;
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const zs = points.map(point => point.z);
    return {
        min: { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) },
        max: { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) }
    };
}

function summarizeValue(value, maximum = 60) {
    if (value === null || value === undefined) {
        return { present: false, type: value === null ? "null" : "undefined" };
    }

    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        const array = Array.from(value);
        return {
            present: true,
            type: value.constructor?.name || "Array",
            length: array.length,
            sample: array.slice(0, maximum).map(item => {
                if (typeof item === "object" && item !== null) {
                    return {
                        type: item.constructor?.name || "Object",
                        keys: Object.keys(item).sort(),
                        value: pointFromValue(item) || undefined
                    };
                }
                return item;
            })
        };
    }

    if (typeof value.size === "function" && typeof value.get === "function") {
        const size = Number(value.size()) || 0;
        const sample = vectorToArray(value, Math.min(maximum, size));
        return {
            present: true,
            type: value.constructor?.name || "Vector",
            length: size,
            sample: sample.map(item => pointFromValue(item) || item)
        };
    }

    if (typeof value === "object") {
        return {
            present: true,
            type: value.constructor?.name || "Object",
            keys: Object.keys(value).sort(),
            sample: Object.fromEntries(
                Object.entries(value)
                    .slice(0, maximum)
                    .map(([key, item]) => [key, pointFromValue(item) || item])
            )
        };
    }

    return { present: true, type: typeof value, value };
}

function summarizePoints(pointsValue) {
    const points = pointsFromValue(pointsValue);
    return {
        raw: summarizeValue(pointsValue),
        interpretedAsXYZ: points.length > 0,
        pointCount: points.length,
        firstPoint: points[0] || null,
        lastPoint: points.at(-1) || null,
        bounds: pointBounds(points),
        planLength2D: points.length > 1 ? polylineLength(points, "2d") : 0,
        spatialLength3D: points.length > 1 ? polylineLength(points, "3d") : 0,
        firstPoints: points.slice(0, 10),
        lastPoints: points.slice(-10)
    };
}

function summarizeCurveEntry(entry, index) {
    return {
        index,
        type: entry?.constructor?.name || typeof entry,
        keys: entry && typeof entry === "object" ? Object.keys(entry).sort() : [],
        points: summarizePoints(entry?.points),
        data: summarizeValue(entry?.data)
    };
}

function summarizeAlignment(alignment, index) {
    const curve3D = Array.isArray(alignment?.curve3D)
        ? alignment.curve3D
        : vectorToArray(alignment?.curve3D, 100);

    return {
        index,
        type: alignment?.constructor?.name || typeof alignment,
        keys: alignment && typeof alignment === "object" ? Object.keys(alignment).sort() : [],
        FlatCoordinationMatrix: summarizeValue(alignment?.FlatCoordinationMatrix, 16),
        FlattenedWorldTransformMatrix: summarizeValue(alignment?.FlattenedWorldTransformMatrix, 16),
        curve3DCount: curve3D.length,
        curve3D: curve3D.map(summarizeCurveEntry)
    };
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

            console.log("===== IFC-SIGNATURDIAGNOSE v0.6.4c =====");
            console.dir({ sourceId: this.id, origin: this.origin, ...signature });

            this.metadata = {
                ...(this.metadata || {}),
                signature,
                providerVersion: IFC_GEOMETRY_PROVIDER_VERSION
            };

            if (!signature.validIfcStepSignature) {
                this.status = "invalid-ifc-signature";
                this.error = signature.looksLikeZip
                    ? "Filen starter som ZIP/komprimert innhold, ikke klartekst IFC STEP."
                    : "Filen mangler IFC STEP-signaturen ISO-10303-21; og HEADER;.";
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
            }
            catch (error) {
                console.warn("GetCoordinationMatrix feilet:", error);
            }

            try {
                const alignments = typeof this.ifcApi.GetAllAlignments === "function"
                    ? vectorToArray(this.ifcApi.GetAllAlignments(this.ifcModelId), 100)
                    : [];

                this.alignmentDiagnostic = typeof this.ifcApi.GetAllAlignments === "function"
                    ? {
                        available: true,
                        apiMethod: "GetAllAlignments",
                        alignmentCount: alignments.length,
                        alignments: alignments.map(summarizeAlignment)
                    }
                    : {
                        available: false,
                        apiMethod: null,
                        reason: "web-ifc-versjonen eksponerer ikke GetAllAlignments()."
                    };
            }
            catch (error) {
                this.alignmentDiagnostic = {
                    available: false,
                    apiMethod: "GetAllAlignments",
                    error: error?.message || String(error)
                };
            }

            const alignmentDiagnostic = this.inspectAlignments();
            console.log("===== IFC-CURVE3D-POINTS-DATA v0.6.4c =====");
            console.dir(alignmentDiagnostic);
            if (typeof window !== "undefined") {
                window.__crossSectionCurve3DPointsDataDiagnostic = alignmentDiagnostic;
            }

            let meshCount = 0;

            this.ifcApi.StreamAllMeshes(this.ifcModelId, flatMesh => {
                const expressId = Number(flatMesh.expressID);
                let line = null;

                try {
                    line = this.ifcApi.GetLine(this.ifcModelId, expressId, false);
                }
                catch {
                    line = null;
                }

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
                    const geometry = this.ifcApi.GetGeometry(
                        this.ifcModelId,
                        placed.geometryExpressID
                    );

                    const vertices = this.ifcApi.GetVertexArray(
                        geometry.GetVertexData(),
                        geometry.GetVertexDataSize()
                    );
                    const indices = this.ifcApi.GetIndexArray(
                        geometry.GetIndexData(),
                        geometry.GetIndexDataSize()
                    );

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
            console.dir({
                sourceId: this.id,
                fileName: this.file?.name || "",
                schema,
                coordinationMatrix
            });

            this.status = "ready";
        }
        catch (error) {
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
            try {
                this.ifcApi.CloseModel(this.ifcModelId);
            }
            catch {
                // no-op
            }
        }

        this.ifcModelId = null;
        this.globalIdIndex.clear();
        this.meshIndex.clear();
        this.alignmentDiagnostic = null;
        super.close();
    }
}
