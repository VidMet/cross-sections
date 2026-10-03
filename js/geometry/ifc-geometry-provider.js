import { GeometryProvider } from "./geometry-provider.js";
import { normalizeIfcGeometry } from "./mesh-normalizer.js";

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

export class IfcGeometryProvider extends GeometryProvider {
    constructor(options) {
        super({ ...options, type: "ifc" });
        this.ifcApi = null;
        this.ifcModelId = null;
        this.globalIdIndex = new Map();
        this.meshIndex = new Map();
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

        try {
            this.ifcApi = await getIfcApi();
            const data = new Uint8Array(await this.file.arrayBuffer());
            this.ifcModelId = this.ifcApi.OpenModel(data, {
                COORDINATE_TO_ORIGIN: false,
                USE_FAST_BOOLS: true
            });

            const schema = this.ifcApi.GetModelSchema(this.ifcModelId);
            let meshCount = 0;

            this.ifcApi.StreamAllMeshes(this.ifcModelId, flatMesh => {
                const expressId = Number(flatMesh.expressID);
                let line = null;
                try {
                    line = this.ifcApi.GetLine(this.ifcModelId, expressId, false);
                }
                catch (_) {
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
                schema,
                entityCount: this.entities.length,
                meshCount,
                webIfcVersion: WEB_IFC_VERSION
            };
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
            try { this.ifcApi.CloseModel(this.ifcModelId); }
            catch (_) { /* no-op */ }
        }
        this.ifcModelId = null;
        this.globalIdIndex.clear();
        this.meshIndex.clear();
        super.close();
    }
}
