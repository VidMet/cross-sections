export const LOCAL_TRB_RECORDS_VERSION = "0.6.5i-local-geometry-records";

function check(offset, size, total, label) {
    if (!Number.isInteger(offset) || offset < 0 || offset + size > total) {
        throw new RangeError(`${label}: offset ${offset}, size ${size}, total ${total}`);
    }
}
function u8(view, offset) { check(offset, 1, view.byteLength, "u8"); return view.getUint8(offset); }
function u16(view, offset) { check(offset, 2, view.byteLength, "u16"); return view.getUint16(offset, true); }
function u32(view, offset) { check(offset, 4, view.byteLength, "u32"); return view.getUint32(offset, true); }
function i32(view, offset) { check(offset, 4, view.byteLength, "i32"); return view.getInt32(offset, true); }
function f32(view, offset) { check(offset, 4, view.byteLength, "f32"); return view.getFloat32(offset, true); }
function f64(view, offset) { check(offset, 8, view.byteLength, "f64"); return view.getFloat64(offset, true); }
function table(view, offset, label) {
    check(offset, 4, view.byteLength, label);
    const vtableOffset = offset - i32(view, offset);
    check(vtableOffset, 4, view.byteLength, `${label}.vtable`);
    const vtableLength = u16(view, vtableOffset);
    const objectLength = u16(view, vtableOffset + 2);
    if (vtableLength < 4 || vtableLength > 1024 || objectLength < 4 || objectLength > 4096) throw new Error(`${label}: ugyldig tabell`);
    return { tableOffset: offset, vtableOffset, fieldCount: (vtableLength - 4) / 2 };
}
function fieldAddress(view, tableValue, index) {
    const slot = tableValue.vtableOffset + 4 + index * 2;
    if (slot + 2 > tableValue.vtableOffset + 4 + tableValue.fieldCount * 2) return null;
    const relativeOffset = u16(view, slot);
    return relativeOffset ? tableValue.tableOffset + relativeOffset : null;
}
function childTable(view, tableValue, index, label) {
    const address = fieldAddress(view, tableValue, index);
    return address == null ? null : table(view, address + u32(view, address), label);
}
function vector(view, tableValue, index, label) {
    const address = fieldAddress(view, tableValue, index);
    if (address == null) return null;
    const target = address + u32(view, address);
    return { label, targetOffset: target, dataOffset: target + 4, length: u32(view, target) };
}
function safeVector(view, tableValue, index, label) {
    try { return vector(view, tableValue, index, label); } catch { return null; }
}
function histogram(values) {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    return Array.from(counts, ([value, count]) => ({ value, count })).sort((a, b) => a.value - b.value);
}
function float32Matrix(view, offset) {
    return Array.from({ length: 16 }, (_, index) => f32(view, offset + index * 4));
}
function matrixDiagnostic(matrix, index) {
    const finite = matrix.every(Number.isFinite);
    const identityError = matrix.reduce((sum, value, i) => sum + Math.abs(value - ([0, 5, 10, 15].includes(i) ? 1 : 0)), 0);
    const translationColumnMajor = { x: matrix[12], y: matrix[13], z: matrix[14] };
    return { index, finite, identityError, translationColumnMajor, values: matrix };
}
function rawRecord(view, offset, byteSize, index) {
    const uint32 = [], float32 = [];
    for (let byteOffset = 0; byteOffset + 4 <= byteSize; byteOffset += 4) {
        uint32.push(u32(view, offset + byteOffset));
        float32.push(f32(view, offset + byteOffset));
    }
    return { index, offset, byteSize, uint32, float32 };
}
export class TrimBimGeometryRecordsReader {
    static open(buffer) { return new TrimBimGeometryRecordsReader(buffer); }
    constructor(buffer) {
        this.view = new DataView(buffer);
        this.bytes = new Uint8Array(buffer);
        this.root = table(this.view, u32(this.view, 0), "root");
        this.header = { identifier: String.fromCharCode(...this.bytes.slice(4, 8)), byteLength: buffer.byteLength };
    }
    diagnostic() {
        const view = this.view;
        const entities = childTable(view, this.root, 0, "ModelEntities");
        const modelPool = childTable(view, this.root, 1, "ModelPool");
        const geometryPool = childTable(view, this.root, 2, "GeometryPool");
        const entityVector = vector(view, entities, 0, "entities");
        const geometry0 = vector(view, geometryPool, 0, "geometry.field0");
        const geometry3 = vector(view, geometryPool, 3, "geometry.field3");
        const geometry4 = vector(view, geometryPool, 4, "geometry.field4");
        const model17 = safeVector(view, modelPool, 17, "model.field17");

        const matrixRecordSize = 64;
        const matrices = [];
        for (let index = 0; index < Math.min(geometry0.length, 12); index += 1) {
            matrices.push(matrixDiagnostic(float32Matrix(view, geometry0.dataOffset + index * matrixRecordSize), index));
        }

        const typeBytes = [];
        for (let index = 0; index < geometry4.length; index += 1) typeBytes.push(u8(view, geometry4.dataOffset + index));

        const field3Candidates = [16, 24, 32, 40, 48, 64].map(byteSize => ({
            byteSize,
            sampleRecords: Array.from({ length: Math.min(6, geometry3.length) }, (_, index) => rawRecord(view, geometry3.dataOffset + index * byteSize, byteSize, index))
        }));

        const numeric64Sample = [];
        if (model17) {
            for (let index = 0; index < Math.min(model17.length, 25); index += 1) numeric64Sample.push(f64(view, model17.dataOffset + index * 8));
        }

        return {
            readerVersion: LOCAL_TRB_RECORDS_VERSION,
            header: this.header,
            counts: { entityCount: entityVector.length, geometryRecordCount: geometry0.length },
            transformCandidate: {
                fieldIndex: 0,
                recordCount: geometry0.length,
                assumedRecordSizeBytes: matrixRecordSize,
                sampleMatrices: matrices,
                finiteMatrixCountInSample: matrices.filter(item => item.finite).length,
                nearIdentityCountInSample: matrices.filter(item => item.identityError < 0.001).length
            },
            recordCandidate: { fieldIndex: 3, recordCount: geometry3.length, layouts: field3Candidates },
            typeOrIndexCandidate: {
                fieldIndex: 4,
                recordCount: geometry4.length,
                interpretation: "Uint8",
                sample: typeBytes.slice(0, 64),
                histogram: histogram(typeBytes),
                minimum: Math.min(...typeBytes),
                maximum: Math.max(...typeBytes)
            },
            modelNumericPool: { fieldIndex: 17, declaredLength: model17?.length ?? 0, float64Sample: numeric64Sample },
            validation: {
                allThreeParallel: geometry0.length === geometry3.length && geometry3.length === geometry4.length,
                entityCount: entityVector.length,
                geometryPerEntityRatio: geometry0.length / entityVector.length,
                transformsDecoded: true,
                geometryRecordLayoutDecoded: false,
                geometryTypeEnumDecoded: false,
                meshArraysDecoded: false
            }
        };
    }
}
