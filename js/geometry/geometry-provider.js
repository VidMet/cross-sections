export class GeometryProvider {
    constructor(file, sourceIndex) {
        this.file = file;
        this.sourceIndex = sourceIndex;
        this.id = `source-${sourceIndex}-${crypto.randomUUID()}`;
        this.type = "unknown";
        this.status = "new";
        this.metadata = {};
        this.entities = [];
        this.meshes = [];
        this.warnings = [];
        this.error = null;
    }

    async open() {
        throw new Error("open() må implementeres av formatadapteren.");
    }

    async getEntityIndex() {
        return this.entities;
    }

    async getMeshesForEntityIds() {
        return [];
    }

    getSummary() {
        return {
            id: this.id,
            sourceIndex: this.sourceIndex,
            type: this.type,
            fileName: this.file.name,
            fileSize: this.file.size,
            status: this.status,
            entityCount: this.entities.length,
            meshCount: this.meshes.length,
            metadata: this.metadata,
            warnings: this.warnings,
            error: this.error
        };
    }

    close() {
        this.entities = [];
        this.meshes = [];
        this.status = "closed";
    }
}
