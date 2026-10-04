import { GeometryProvider } from "./geometry-provider.js";

export const TRB_GEOMETRY_PROVIDER_VERSION = "0.6.2-trb8-mesh-diagnostic";
const TRB_SDK_MODULE_URL = "https://esm.sh/@speckle/trb-sdk";
const MAX_ENTITY_SAMPLES = 12;
const MAX_INSTANCE_SAMPLES = 12;

function typedLength(value) {
    return value && Number.isFinite(Number(value.length)) ? Number(value.length) : 0;
}

function safeObject(value) {
    if (!value || typeof value !== "object") return value;
    const output = {};
    for (const key of Object.keys(value)) {
        const item = value[key];
        if (typeof item === "function") continue;
        if (ArrayBuffer.isView(item)) {
            output[key] = { type: item.constructor?.name || "TypedArray", length: item.length };
        }
        else if (item instanceof ArrayBuffer) {
            output[key] = { type: "ArrayBuffer", byteLength: item.byteLength };
        }
        else if (typeof item !== "object" || item === null) {
            output[key] = item;
        }
    }
    return output;
}

function sampleIterable(iterable, maximum, mapper) {
    const result = [];
    if (!iterable || typeof iterable[Symbol.iterator] !== "function") return result;
    let index = 0;
    for (const value of iterable) {
        result.push(mapper(value, index));
        index += 1;
        if (index >= maximum) break;
    }
    return result;
}

function increment(map, key) {
    const normalized = String(key ?? "ukjent");
    map.set(normalized, (map.get(normalized) || 0) + 1);
}

function mapToObject(map) {
    return Object.fromEntries([...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

async function loadTrbSdk() {
    const started = performance.now();
    const module = await import(TRB_SDK_MODULE_URL);
    return {
        module,
        durationMs: Math.round(performance.now() - started),
        exportedKeys: Object.keys(module).sort()
    };
}

export class TrbGeometryProvider extends GeometryProvider {
    constructor(options) {
        super({ ...options, type: "trb" });
        this.buffer = null;
        this.reader = null;
        this.meshes = [];
        this.entities = [];
        this.globalIdIndex = new Map();
        this.meshIndex = new Map();
    }

    async open() {
        if (!this.file) {
            this.status = "discovered";
            return this.getSummary();
        }

        this.status = "opening";
        this.error = null;
        this.meshes = [];
        this.entities = [];
        this.globalIdIndex.clear();
        this.meshIndex.clear();

        try {
            this.buffer = await this.file.arrayBuffer();
            const bytes = new Uint8Array(this.buffer, 0, Math.min(256, this.buffer.byteLength));
            const ascii = Array.from(bytes, value => value >= 32 && value <= 126 ? String.fromCharCode(value) : ".").join("");
            const identifier = ascii.match(/TRB\d/i)?.[0]?.toUpperCase() || "TRB/FlatBuffers";

            const sdk = await loadTrbSdk();
            if (!sdk.module?.TrimBimReader?.open) {
                throw new Error("@speckle/trb-sdk eksponerer ikke TrimBimReader.open");
            }

            this.reader = sdk.module.TrimBimReader.open(this.buffer, { strict: false });
            const reader = this.reader;
            const classNames = Array.isArray(reader.classNames) ? reader.classNames : Array.from(reader.classNames || []);
            const entitySamples = sampleIterable(reader.allEntities?.(), MAX_ENTITY_SAMPLES, (entity, index) => ({
                index,
                className: entity?.className || null,
                ifcGuid: entity?.ifcGuid || null,
                transformLength: typedLength(entity?.transform),
                fields: safeObject(entity)
            }));

            const geometryTypeCounts = typeof reader.geometryTypeCounts === "function"
                ? reader.geometryTypeCounts()
                : null;
            const decodedKindCounts = new Map();
            const unsupportedTypeCounts = new Map();
            const instanceSamples = [];
            let instanceCount = 0;
            let triangleInstanceCount = 0;
            let totalVertices = 0;
            let totalIndices = 0;
            let decodeFailures = 0;

            const instances = reader.allInstances?.();
            if (instances && typeof instances[Symbol.iterator] === "function") {
                for (const instance of instances) {
                    instanceCount += 1;
                    try {
                        const decoded = reader.decode(instance);
                        const kind = decoded?.kind || "ukjent";
                        increment(decodedKindCounts, kind);
                        if (kind === "triangles") {
                            triangleInstanceCount += 1;
                            totalVertices += Math.floor(typedLength(decoded.positions) / 3);
                            totalIndices += typedLength(decoded.indices);
                        }
                        else if (kind === "unsupported") {
                            increment(unsupportedTypeCounts, decoded?.type || instance?.type || "ukjent");
                        }
                        if (instanceSamples.length < MAX_INSTANCE_SAMPLES) {
                            instanceSamples.push({
                                instanceIndex: instanceCount - 1,
                                kind,
                                geometryType: decoded?.type ?? instance?.type ?? null,
                                positionsLength: typedLength(decoded?.positions),
                                indicesLength: typedLength(decoded?.indices),
                                normalsLength: typedLength(decoded?.normals),
                                transformLength: typedLength(instance?.transform),
                                instanceFields: safeObject(instance)
                            });
                        }
                    }
                    catch (error) {
                        decodeFailures += 1;
                        if (instanceSamples.length < MAX_INSTANCE_SAMPLES) {
                            instanceSamples.push({ instanceIndex: instanceCount - 1, kind: "decode-error", message: error?.message || String(error) });
                        }
                    }
                }
            }

            let metadataValues = null;
            try { metadataValues = typeof reader.metadata === "function" ? reader.metadata() : null; }
            catch (error) { metadataValues = { error: error?.message || String(error) }; }

            const diagnostic = {
                providerVersion: TRB_GEOMETRY_PROVIDER_VERSION,
                sdkModuleUrl: TRB_SDK_MODULE_URL,
                sdkLoadDurationMs: sdk.durationMs,
                sdkExportedKeys: sdk.exportedKeys,
                fileName: this.file.name,
                byteLength: this.buffer.byteLength,
                identifier,
                header: safeObject(reader.header),
                metadata: metadataValues,
                entityCount: Number(reader.entityCount ?? 0),
                classNameCount: classNames.length,
                classNames: classNames.slice(0, 100),
                geometryTypeCounts,
                instanceCount,
                triangleInstanceCount,
                totalVertices,
                totalIndices,
                estimatedTriangleCount: Math.floor(totalIndices / 3),
                decodeFailures,
                decodedKindCounts: mapToObject(decodedKindCounts),
                unsupportedTypeCounts: mapToObject(unsupportedTypeCounts),
                entitySamples,
                instanceSamples,
                note: "v0.6.2 diagnostiserer TRB8-innholdet, men bygger ennå ikke normaliserte mesh for snittmotoren."
            };

            this.metadata = diagnostic;
            this.status = "ready-diagnostic";
            console.log("===== TRB8-MESHDIAGNOSE v0.6.2 =====");
            console.dir(diagnostic);
        }
        catch (error) {
            this.status = "diagnostic-error";
            this.error = error?.message || String(error);
            this.metadata = {
                providerVersion: TRB_GEOMETRY_PROVIDER_VERSION,
                sdkModuleUrl: TRB_SDK_MODULE_URL,
                fileName: this.file?.name || "",
                byteLength: this.buffer?.byteLength || 0,
                errorName: error?.name || "Error",
                error: this.error
            };
            console.error("TRB8-MESHDIAGNOSE FEILET:", this.metadata, error);
        }

        return this.getSummary();
    }

    getMeshesForGlobalIds() {
        return [];
    }

    getAllMeshes() {
        return [];
    }

    close() {
        super.close();
        this.buffer = null;
        this.reader = null;
        this.meshes = [];
        this.entities = [];
        this.globalIdIndex.clear();
        this.meshIndex.clear();
    }
}
