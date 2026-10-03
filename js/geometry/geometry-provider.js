export class GeometryProvider {
    constructor({ id, type, name, origin = "local", file = null, modelId = null, modelSpec = null }) {
        this.id = id;
        this.type = type;
        this.name = name;
        this.origin = origin;
        this.file = file;
        this.modelId = modelId;
        this.modelSpec = modelSpec;
        this.status = file ? "new" : "discovered";
        this.entities = [];
        this.meshes = [];
        this.metadata = {};
        this.warnings = [];
        this.error = null;
    }
    async open() { throw new Error("open() må implementeres i formatadapteren."); }
    attachFile(file) { this.file = file; this.status = "new"; }
    getSummary() {
        return { id:this.id, type:this.type, name:this.name, origin:this.origin, modelId:this.modelId,
            status:this.status, fileSize:this.file?.size || 0, entityCount:this.entities.length,
            meshCount:this.meshes.length, metadata:this.metadata, warnings:this.warnings, error:this.error };
    }
    close() { this.entities=[]; this.meshes=[]; this.file=null; this.status="closed"; }
}
