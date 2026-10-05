import { GeometryProvider } from "./geometry-provider.js";
import { getAPI } from "../tc-api.js";
import { TrimBimGeometryRecordsReader, LOCAL_TRB_RECORDS_VERSION } from "../vendor/trb-sdk/index.js?v=0.6.5i";
export const TRB_GEOMETRY_PROVIDER_VERSION = "0.6.5i-trb8-geometry-records";
export class TrbGeometryProvider extends GeometryProvider {
    constructor(options) { super({ ...options, type: "trb" }); this.buffer = null; this.globalIdIndex = new Map(); this.meshIndex = new Map(); }
    async viewerDiagnostic() {
        const api = getAPI(), result = { runtimeIds: [], externalIds: [], errors: [] };
        try {
            const group = (await api.viewer.getObjects({}, { visible: true }) || []).find(item => String(item.modelId) === String(this.modelId));
            result.runtimeIds = (group?.objects || []).map(item => Number(item.id)).filter(Number.isFinite);
            result.externalIds = await api.viewer.convertToObjectIds(this.modelId, result.runtimeIds);
        } catch (error) { result.errors.push(error?.message || String(error)); }
        return result;
    }
    async open() {
        if (!this.file) { this.status = "discovered-no-blob"; return this.getSummary(); }
        this.status = "opening-records"; this.error = null;
        try {
            this.buffer = await this.file.arrayBuffer();
            const records = TrimBimGeometryRecordsReader.open(this.buffer).diagnostic();
            const viewer = await this.viewerDiagnostic();
            const diagnostic = {
                providerVersion: TRB_GEOMETRY_PROVIDER_VERSION,
                localReaderVersion: LOCAL_TRB_RECORDS_VERSION,
                fileName: this.file.name,
                fileSize: this.file.size,
                modelId: this.modelId,
                records,
                viewer: { visibleRuntimeIdCount: viewer.runtimeIds.length, externalIdCount: viewer.externalIds.length, errors: viewer.errors },
                meshDecodingImplemented: false
            };
            this.metadata = diagnostic;
            this.status = "ready-records";
            console.log("===== TRB8-GEOMETRY-RECORDS v0.6.5i =====");
            console.dir(diagnostic);
            window.__crossSectionTrbGeometryRecords = [diagnostic];
        } catch (error) { this.status = "records-error"; this.error = error?.message || String(error); console.error("TRB8-GEOMETRY-RECORDS FEILET:", error); }
        return this.getSummary();
    }
    getMeshesForGlobalIds() { return []; }
    getAllMeshes() { return []; }
    close() { this.buffer = null; this.globalIdIndex.clear(); this.meshIndex.clear(); super.close(); }
}
