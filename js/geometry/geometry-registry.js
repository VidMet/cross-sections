import { IfcGeometryProvider } from "./ifc-geometry-provider.js";
import { TrbGeometryProvider } from "./trb-geometry-provider.js";

export class GeometryRegistry {
    constructor() {
        this.providers = [];
        this.nextSourceIndex = 1;
    }

    createProvider(file) {
        const extension = file.name.split(".").pop().toLowerCase();
        const sourceIndex = this.nextSourceIndex++;

        if (extension === "ifc") {
            return new IfcGeometryProvider(file, sourceIndex);
        }
        if (extension === "trb" || extension === "trimbim") {
            return new TrbGeometryProvider(file, sourceIndex);
        }
        throw new Error(`Filtypen støttes ikke: ${file.name}`);
    }

    async addFiles(fileList, onProgress) {
        const files = Array.from(fileList || []);
        const results = [];

        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const provider = this.createProvider(file);
            this.providers.push(provider);
            onProgress?.({ phase: "opening", index, total: files.length, file, provider });

            try {
                await provider.open();
                results.push({ ok: true, provider, summary: provider.getSummary() });
                onProgress?.({ phase: "ready", index, total: files.length, file, provider });
            } catch (error) {
                results.push({ ok: false, provider, error });
                onProgress?.({ phase: "error", index, total: files.length, file, provider, error });
            }
        }
        return results;
    }

    remove(providerId) {
        const index = this.providers.findIndex(provider => provider.id === providerId);
        if (index < 0) return false;
        this.providers[index].close();
        this.providers.splice(index, 1);
        return true;
    }

    clear() {
        this.providers.forEach(provider => provider.close());
        this.providers = [];
        this.nextSourceIndex = 1;
    }

    getReadyProviders() {
        return this.providers.filter(provider => provider.status === "ready");
    }

    getCombinedEntityIndex() {
        return this.getReadyProviders().flatMap(provider => provider.entities);
    }

    getSummary() {
        const sources = this.providers.map(provider => provider.getSummary());
        return {
            sourceCount: sources.length,
            readyCount: sources.filter(source => source.status === "ready").length,
            ifcCount: sources.filter(source => source.type === "ifc").length,
            trbCount: sources.filter(source => source.type === "trb").length,
            totalBytes: sources.reduce((sum, source) => sum + source.fileSize, 0),
            totalEntities: sources.reduce((sum, source) => sum + source.entityCount, 0),
            totalMeshes: sources.reduce((sum, source) => sum + source.meshCount, 0),
            sources
        };
    }
}
