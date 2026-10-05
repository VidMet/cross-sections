import { GeometryProvider } from "./geometry-provider.js";
import { getAPI } from "../tc-api.js";

export const TRB_GEOMETRY_PROVIDER_VERSION = "0.6.5a-general-trb-source-diagnostic";
const SAMPLE_BYTES = 4096;
const MAX_RUNTIME_ID_SAMPLE = 20;
const MAX_PROPERTY_SAMPLE = 5;

function byteHex(bytes, maximum = 64) {
    return Array.from(bytes.slice(0, maximum))
        .map(value => value.toString(16).padStart(2, "0"))
        .join(" ");
}

function printable(bytes, maximum = 512) {
    return Array.from(bytes.slice(0, maximum), value =>
        value >= 32 && value <= 126 ? String.fromCharCode(value) : "."
    ).join("");
}

function scalarFields(value) {
    if (!value || typeof value !== "object") return {};
    const output = {};
    for (const [key, item] of Object.entries(value)) {
        if (item === null || ["string", "number", "boolean"].includes(typeof item)) output[key] = item;
    }
    return output;
}

function mergeBox(target, box) {
    if (!box?.min || !box?.max) return target;
    if (!target) {
        return {
            min: { x: +box.min.x, y: +box.min.y, z: +box.min.z },
            max: { x: +box.max.x, y: +box.max.y, z: +box.max.z }
        };
    }
    for (const axis of ["x", "y", "z"]) {
        target.min[axis] = Math.min(target.min[axis], +box.min[axis]);
        target.max[axis] = Math.max(target.max[axis], +box.max[axis]);
    }
    return target;
}

export class TrbGeometryProvider extends GeometryProvider {
    constructor(options) {
        super({ ...options, type: "trb" });
        this.buffer = null;
        this.globalIdIndex = new Map();
        this.meshIndex = new Map();
    }

    async inspectViewerObjects() {
        const api = getAPI();
        const diagnostic = {
            modelId: this.modelId ?? null,
            visibleGroupFound: false,
            visibleRuntimeIdCount: 0,
            runtimeIdSample: [],
            externalIdSample: [],
            aggregateViewerBoundingBox: null,
            propertySamples: [],
            errors: []
        };

        if (!api?.viewer || !this.modelId) return diagnostic;

        try {
            const groups = await api.viewer.getObjects({}, { visible: true });
            const group = (groups || []).find(item => String(item.modelId) === String(this.modelId));
            if (!group) return diagnostic;

            diagnostic.visibleGroupFound = true;
            const runtimeIds = (group.objects || [])
                .map(item => Number(item.id))
                .filter(Number.isFinite);
            diagnostic.visibleRuntimeIdCount = runtimeIds.length;
            diagnostic.runtimeIdSample = runtimeIds.slice(0, MAX_RUNTIME_ID_SAMPLE);

            for (let index = 0; index < runtimeIds.length; index += 250) {
                try {
                    const boxes = await api.viewer.getObjectBoundingBoxes(
                        this.modelId,
                        runtimeIds.slice(index, index + 250)
                    );
                    for (const item of boxes || []) {
                        diagnostic.aggregateViewerBoundingBox = mergeBox(
                            diagnostic.aggregateViewerBoundingBox,
                            item.boundingBox
                        );
                    }
                }
                catch (error) {
                    diagnostic.errors.push({ stage: "bounding-boxes", message: error?.message || String(error) });
                    break;
                }
            }

            if (diagnostic.runtimeIdSample.length) {
                try {
                    diagnostic.externalIdSample = (
                        await api.viewer.convertToObjectIds(
                            this.modelId,
                            diagnostic.runtimeIdSample
                        )
                    || []).map(String);
                }
                catch (error) {
                    diagnostic.errors.push({ stage: "external-ids", message: error?.message || String(error) });
                }

                try {
                    const properties = await api.viewer.getObjectProperties(
                        this.modelId,
                        diagnostic.runtimeIdSample.slice(0, MAX_PROPERTY_SAMPLE)
                    );
                    diagnostic.propertySamples = (properties || []).map(item => ({
                        class: item?.class ?? null,
                        position: item?.position ? scalarFields(item.position) : null,
                        product: item?.product ? scalarFields(item.product) : null,
                        topLevelKeys: Object.keys(item || {}).sort()
                    }));
                }
                catch (error) {
                    diagnostic.errors.push({ stage: "properties", message: error?.message || String(error) });
                }
            }
        }
        catch (error) {
            diagnostic.errors.push({ stage: "viewer-objects", message: error?.message || String(error) });
        }

        return diagnostic;
    }

    async open() {
        if (!this.file) {
            this.status = "discovered";
            return this.getSummary();
        }

        this.status = "opening-diagnostic";
        this.error = null;
        this.entities = [];
        this.meshes = [];
        this.globalIdIndex.clear();
        this.meshIndex.clear();

        try {
            this.buffer = await this.file.arrayBuffer();
            const bytes = new Uint8Array(
                this.buffer,
                0,
                Math.min(SAMPLE_BYTES, this.buffer.byteLength)
            );
            const ascii = printable(bytes);
            const identifier = ascii.match(/TRB\d/i)?.[0]?.toUpperCase() || null;
            const converter = ascii.match(/TrimBimConverter/i)?.[0] || null;
            const viewer = await this.inspectViewerObjects();

            const diagnostic = {
                providerVersion: TRB_GEOMETRY_PROVIDER_VERSION,
                purpose: "Generell TRB-kildediagnose for terreng, grunnlagsmodeller og fagmodeller.",
                fileName: this.file?.name || "",
                fileSize: this.file?.size ?? this.buffer.byteLength,
                mimeType: this.file?.type || "",
                modelId: this.modelId ?? null,
                origin: this.origin,
                identifier,
                looksLikeTrimBim: Boolean(identifier || converter),
                converter,
                firstBytesHex: byteHex(bytes),
                printablePreview: ascii.slice(0, 512),
                modelSpec: scalarFields(this.modelSpec),
                viewer,
                meshDecodingImplemented: false,
                note: "v0.6.5a registrerer alle synlige .trb/.trimbim-kilder uten ekstern SDK-import. Den dekoder ennå ikke trekantgeometri."
            };

            this.metadata = diagnostic;
            this.status = diagnostic.looksLikeTrimBim
                ? "ready-diagnostic"
                : "unknown-trb-signature";

            console.log("===== GENERELL TRB-KILDEDIAGNOSE v0.6.5a =====");
            console.dir(diagnostic);

            if (typeof window !== "undefined") {
                const existing = Array.isArray(window.__crossSectionTrbSourceDiagnostics)
                    ? window.__crossSectionTrbSourceDiagnostics
                    : [];
                window.__crossSectionTrbSourceDiagnostics = [
                    ...existing.filter(item => String(item.modelId) !== String(diagnostic.modelId)),
                    diagnostic
                ];
            }
        }
        catch (error) {
            this.status = "diagnostic-error";
            this.error = error?.message || String(error);
            this.metadata = {
                providerVersion: TRB_GEOMETRY_PROVIDER_VERSION,
                fileName: this.file?.name || "",
                modelId: this.modelId ?? null,
                error: this.error
            };
            console.error("GENERELL TRB-KILDEDIAGNOSE FEILET:", this.metadata, error);
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
        this.buffer = null;
        this.globalIdIndex.clear();
        this.meshIndex.clear();
        super.close();
    }
}
