import { getAPI } from "../tc-api.js";

export const DIAGNOSTIC_VERSION = "0.6.5l-isolated-trb-mesh-arrays";

const readU16 = (view, offset) => view.getUint16(offset, true);
const readU32 = (view, offset) => view.getUint32(offset, true);
const readI32 = (view, offset) => view.getInt32(offset, true);
const readF32 = (view, offset) => view.getFloat32(offset, true);

function ensureRange(view, offset, size, label) {
    if (!Number.isInteger(offset) || offset < 0 || offset + size > view.byteLength) {
        throw new RangeError(`${label}: ${offset} + ${size} exceeds ${view.byteLength}`);
    }
}

function tableAt(view, offset, label) {
    ensureRange(view, offset, 4, label);
    const vtableOffset = offset - readI32(view, offset);
    ensureRange(view, vtableOffset, 4, `${label}.vtable`);
    const vtableLength = readU16(view, vtableOffset);
    const objectLength = readU16(view, vtableOffset + 2);
    if (vtableLength < 4 || vtableLength > 1024 || objectLength < 4 || objectLength > 4096) {
        throw new Error(`${label}: invalid FlatBuffers table`);
    }
    return {
        tableOffset: offset,
        vtableOffset,
        vtableLength,
        objectLength,
        fieldCount: (vtableLength - 4) / 2
    };
}

function fieldAddress(view, table, fieldIndex) {
    const slot = table.vtableOffset + 4 + fieldIndex * 2;
    if (slot + 2 > table.vtableOffset + table.vtableLength) return null;
    const relative = readU16(view, slot);
    return relative ? table.tableOffset + relative : null;
}

function childTable(view, table, fieldIndex, label) {
    const address = fieldAddress(view, table, fieldIndex);
    if (address === null) return null;
    return tableAt(view, address + readU32(view, address), label);
}

function vectorAt(view, table, fieldIndex, label) {
    const address = fieldAddress(view, table, fieldIndex);
    if (address === null) return null;
    const targetOffset = address + readU32(view, address);
    ensureRange(view, targetOffset, 4, label);
    const length = readU32(view, targetOffset);
    return { label, targetOffset, dataOffset: targetOffset + 4, length };
}

function vectorTableItem(view, vector, index, label) {
    const slot = vector.dataOffset + index * 4;
    ensureRange(view, slot, 4, label);
    return tableAt(view, slot + readU32(view, slot), label);
}

function sampleFloatTriples(view, vector, maximum = 5) {
    const sample = [];
    for (let index = 0; index < Math.min(vector.length, maximum); index += 1) {
        const offset = vector.dataOffset + index * 12;
        ensureRange(view, offset, 12, "Float32 triple");
        sample.push({
            x: readF32(view, offset),
            y: readF32(view, offset + 4),
            z: readF32(view, offset + 8)
        });
    }
    return sample;
}

function sampleFloatPairs(view, vector, maximum = 5) {
    const sample = [];
    for (let index = 0; index < Math.min(vector.length, maximum); index += 1) {
        const offset = vector.dataOffset + index * 8;
        ensureRange(view, offset, 8, "Float32 pair");
        sample.push({ u: readF32(view, offset), v: readF32(view, offset + 4) });
    }
    return sample;
}

function sampleUnsigned(view, vector, width, maximum = 18) {
    const sample = [];
    for (let index = 0; index < Math.min(vector.length, maximum); index += 1) {
        const offset = vector.dataOffset + index * width;
        ensureRange(view, offset, width, "unsigned sample");
        sample.push(width === 1 ? view.getUint8(offset) : width === 2 ? readU16(view, offset) : readU32(view, offset));
    }
    return sample;
}

function inspectMesh(view, table, kind, poolIndex, geometryId) {
    const textured = kind === "TexturedTriangleMesh";
    const positions = vectorAt(view, table, 0, "positions");
    const normals = vectorAt(view, table, 1, "normals");
    const uvs = textured ? vectorAt(view, table, 2, "uvs") : null;
    const vertices = vectorAt(view, table, textured ? 3 : 2, "vertices");
    const indices = vectorAt(view, table, textured ? 4 : 3, "indices");

    const candidateWidths = kind === "TriangleMesh8" ? [1, 2, 4] : [2, 4, 1];
    const indexCandidates = candidateWidths.map(width => ({
        widthBytes: width,
        sample: sampleUnsigned(view, indices, width),
        sampledMaximum: Math.max(-1, ...sampleUnsigned(view, indices, width))
    }));

    return {
        geometryId,
        kind,
        poolIndex,
        counts: {
            positions: positions.length,
            normals: normals.length,
            uvs: uvs?.length || 0,
            vertices: vertices.length,
            indices: indices.length,
            triangleCountCandidate: indices.length / 3
        },
        samples: {
            positionsAsFloat32XYZ: sampleFloatTriples(view, positions),
            normalsAsFloat32XYZ: sampleFloatTriples(view, normals),
            uvsAsFloat32UV: uvs ? sampleFloatPairs(view, uvs) : [],
            verticesAsUint32: sampleUnsigned(view, vertices, 4, 12),
            indexCandidates
        },
        validation: {
            indexCountDivisibleBy3: indices.length % 3 === 0,
            vertexPackingDecoded: false,
            definitiveIndexWidthDecoded: false,
            worldTransformDecoded: false
        }
    };
}

function inspectBuffer(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const identifier = String.fromCharCode(...bytes.slice(4, 8));
    if (identifier !== "TRB8") throw new Error(`Expected TRB8, got ${identifier}`);

    const root = tableAt(view, readU32(view, 0), "root");
    const entities = childTable(view, root, 0, "ModelEntities");
    const geometry = childTable(view, root, 2, "ModelGeometry");
    const entityVector = vectorAt(view, entities, 0, "entities");
    const instanceVector = vectorAt(view, geometry, 4, "instances");
    const triangleMeshes = vectorAt(view, geometry, 7, "triangleMeshes");
    const triangleMeshes8 = vectorAt(view, geometry, 8, "triangleMeshes8");
    const texturedTriangleMeshes = vectorAt(view, geometry, 9, "texturedTriangleMeshes");

    const pools = [
        { kind: "TriangleMesh", vector: triangleMeshes, start: 0 },
        { kind: "TriangleMesh8", vector: triangleMeshes8, start: triangleMeshes.length },
        {
            kind: "TexturedTriangleMesh",
            vector: texturedTriangleMeshes,
            start: triangleMeshes.length + triangleMeshes8.length
        }
    ];

    const inspectedMeshes = [];
    const failures = [];
    for (const pool of pools) {
        for (let index = 0; index < pool.vector.length; index += 1) {
            try {
                inspectedMeshes.push(inspectMesh(
                    view,
                    vectorTableItem(view, pool.vector, index, `${pool.kind}[${index}]`),
                    pool.kind,
                    index,
                    pool.start + index
                ));
            }
            catch (error) {
                failures.push({ kind: pool.kind, poolIndex: index, error: error?.message || String(error) });
            }
        }
    }

    return {
        diagnosticVersion: DIAGNOSTIC_VERSION,
        header: { identifier, byteLength: buffer.byteLength },
        counts: {
            entities: entityVector.length,
            instances: instanceVector.length,
            triangleMeshes: triangleMeshes.length,
            triangleMeshes8: triangleMeshes8.length,
            texturedTriangleMeshes: texturedTriangleMeshes.length,
            totalMeshes: inspectedMeshes.length,
            failures: failures.length
        },
        meshes: inspectedMeshes,
        failures,
        safety: {
            activeApplicationModified: false,
            geometryRegistryModified: false,
            trbProviderModified: false,
            sectionEngineModified: false,
            meshesEmittedToSectionEngine: false
        }
    };
}

function modelId(model) {
    return String(model?.modelId || model?.id || model?.fileId || model?.versionId || "");
}

function modelName(model) {
    return String(model?.name || model?.fileName || model?.displayName || "");
}

export async function runTrbMeshArraysDiagnostic() {
    const api = getAPI();
    if (!api?.viewer) throw new Error("Trimble Connect API is not connected. Run this inside the loaded Cross Sections iframe.");

    const [models, groups] = await Promise.all([
        api.viewer.getModels(),
        api.viewer.getObjects({}, { visible: true })
    ]);
    const visibleIds = new Set((groups || []).map(group => String(group.modelId)));
    const trbModels = (models || []).filter(model => {
        const name = modelName(model).toLowerCase();
        return visibleIds.has(modelId(model)) && (name.endsWith(".trb") || name.endsWith(".trimbim"));
    });

    const results = [];
    for (const model of trbModels) {
        const id = modelId(model);
        const loaded = await api.viewer.getLoadedModel(id);
        const blob = loaded?.blob instanceof Blob ? loaded.blob : model?.trbBlob instanceof Blob ? model.trbBlob : null;
        if (!blob) {
            results.push({ modelId: id, name: modelName(model), error: "No TRB Blob available" });
            continue;
        }
        try {
            results.push({ modelId: id, name: modelName(model), ...inspectBuffer(await blob.arrayBuffer()) });
        }
        catch (error) {
            results.push({ modelId: id, name: modelName(model), error: error?.message || String(error) });
        }
    }

    window.__crossSectionIsolatedTrbMeshArrays = results;
    console.log("===== ISOLATED TRB8-MESH-ARRAYS v0.6.5l =====");
    console.dir(results);
    return results;
}

window.runCrossSectionTrbMeshArraysDiagnostic = runTrbMeshArraysDiagnostic;
console.log("Isolated TRB mesh-array diagnostic loaded. Run: await runCrossSectionTrbMeshArraysDiagnostic()");
