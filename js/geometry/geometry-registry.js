import { IfcGeometryProvider } from "./ifc-geometry-provider.js";
import { TrbGeometryProvider } from "./trb-geometry-provider.js";

function extension(name) {
    return (String(name || "").split(".").pop() || "").toLowerCase();
}

function normalizedSourceKey(name) {
    return String(name || "")
        .replace(/\.(ifc|trb|trimbim)$/i, "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function modelIdentity(model) {
    return String(
        model?.modelId ||
        model?.id ||
        model?.fileId ||
        model?.versionId ||
        ""
    );
}

function modelName(model) {
    const id = modelIdentity(model);
    return String(
        model?.name ||
        model?.fileName ||
        model?.displayName ||
        `${id}.unknown`
    );
}

function providerHasViewer(provider) {
    return Boolean(provider.modelId || provider.origin.includes("viewer"));
}

function providerHasLocal(provider) {
    return Boolean(provider.file || provider.origin.includes("local"));
}

function updateOrigin(provider) {
    const viewer = Boolean(provider.modelId);
    const local = Boolean(provider.file);

    if (viewer && local) provider.origin = "viewer+local";
    else if (viewer) provider.origin = "viewer";
    else if (local) provider.origin = "local";
    else provider.origin = "detached";
}

export class GeometryRegistry {
    constructor() {
        this.providers = [];
        this.counter = 1;
    }

    create(options) {
        const fileExtension = extension(options.name);
        const id = options.id || `source-${this.counter++}`;

        if (fileExtension === "ifc") {
            return new IfcGeometryProvider({ ...options, id });
        }
        if (fileExtension === "trb" || fileExtension === "trimbim") {
            return new TrbGeometryProvider({ ...options, id });
        }
        return null;
    }

    findBySource(name, type) {
        const key = normalizedSourceKey(name);
        return this.providers.find(provider =>
            normalizedSourceKey(provider.name) === key &&
            provider.type === type
        );
    }

    syncViewerModels(models) {
        const seenProviders = new Set();

        for (const model of models || []) {
            const modelId = modelIdentity(model);
            const name = modelName(model);
            const fileExtension = extension(name);
            const type = fileExtension === "trimbim" ? "trb" : fileExtension;

            if (!["ifc", "trb"].includes(type)) continue;

            let provider = this.providers.find(item =>
                String(item.modelId || "") === modelId
            );

            if (!provider) {
                provider = this.findBySource(name, type);
            }

            if (!provider) {
                provider = this.create({
                    id: `viewer-${modelId}`,
                    name,
                    origin: "viewer",
                    modelId,
                    modelSpec: model
                });
                if (provider) this.providers.push(provider);
            }

            if (!provider) continue;

            provider.modelId = modelId;
            provider.modelSpec = model;
            provider.name = name;
            updateOrigin(provider);
            seenProviders.add(provider.id);
        }

        for (const provider of [...this.providers]) {
            if (!providerHasViewer(provider)) continue;
            if (seenProviders.has(provider.id)) continue;

            provider.modelId = null;
            provider.modelSpec = null;
            updateOrigin(provider);

            if (!provider.file) {
                this.remove(provider.id);
            }
        }

        this.removeDuplicateSources();
    }

    async addLocalFiles(files, onProgress) {
        const results = [];

        for (const file of Array.from(files || [])) {
            const fileExtension = extension(file.name);
            const type = fileExtension === "trimbim" ? "trb" : fileExtension;
            let provider = this.findBySource(file.name, type);

            if (!provider) {
                provider = this.create({
                    name: file.name,
                    origin: "local",
                    file
                });
                if (!provider) continue;
                this.providers.push(provider);
            }
            else {
                provider.attachFile(file);
            }

            updateOrigin(provider);
            onProgress?.(provider, "opening");
            await provider.open();
            updateOrigin(provider);
            onProgress?.(provider, provider.status);
            results.push(provider);
        }

        this.removeDuplicateSources();
        return results;
    }

    removeDuplicateSources() {
        const groups = new Map();

        for (const provider of this.providers) {
            const key = `${provider.type}:${normalizedSourceKey(provider.name)}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(provider);
        }

        for (const providers of groups.values()) {
            if (providers.length < 2) continue;

            const keeper = providers.find(provider =>
                provider.file && provider.modelId
            ) || providers.find(provider =>
                provider.file
            ) || providers.find(provider =>
                provider.modelId
            ) || providers[0];

            for (const duplicate of providers) {
                if (duplicate === keeper) continue;

                if (!keeper.file && duplicate.file) {
                    keeper.file = duplicate.file;
                    keeper.status = duplicate.status;
                    keeper.entities = duplicate.entities;
                    keeper.meshes = duplicate.meshes;
                    keeper.metadata = duplicate.metadata;
                    keeper.warnings = duplicate.warnings;
                    keeper.error = duplicate.error;

                    if ("globalIdIndex" in duplicate) {
                        keeper.globalIdIndex = duplicate.globalIdIndex;
                    }
                    if ("meshIndex" in duplicate) {
                        keeper.meshIndex = duplicate.meshIndex;
                    }
                    if ("ifcApi" in duplicate) {
                        keeper.ifcApi = duplicate.ifcApi;
                        keeper.ifcModelId = duplicate.ifcModelId;
                    }
                }

                if (!keeper.modelId && duplicate.modelId) {
                    keeper.modelId = duplicate.modelId;
                    keeper.modelSpec = duplicate.modelSpec;
                    keeper.name = duplicate.name;
                }

                const duplicateIndex = this.providers.indexOf(duplicate);
                if (duplicateIndex >= 0) {
                    this.providers.splice(duplicateIndex, 1);
                }
            }

            updateOrigin(keeper);
        }
    }

    remove(id) {
        const index = this.providers.findIndex(provider => provider.id === id);
        if (index < 0) return false;
        this.providers[index].close();
        this.providers.splice(index, 1);
        return true;
    }

    clearLocal() {
        for (const provider of [...this.providers]) {
            if (!provider.file) continue;

            if (provider.modelId) {
                provider.close();
                provider.file = null;
                provider.status = "discovered";
                provider.entities = [];
                provider.meshes = [];
                updateOrigin(provider);
            }
            else {
                this.remove(provider.id);
            }
        }
    }

    summary() {
        const sources = this.providers.map(provider => provider.getSummary());
        return {
            sourceCount: sources.length,
            viewerCount: sources.filter(source =>
                source.origin.includes("viewer")
            ).length,
            localCount: sources.filter(source =>
                source.origin.includes("local")
            ).length,
            ifcCount: sources.filter(source => source.type === "ifc").length,
            trbCount: sources.filter(source => source.type === "trb").length,
            readyCount: sources.filter(source => source.status === "ready").length,
            totalEntities: sources.reduce(
                (sum, source) => sum + source.entityCount,
                0
            ),
            sources
        };
    }
}

export { normalizedSourceKey };
